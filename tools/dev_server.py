"""BiliBS loopback-only development host. Run with python tools/dev_server.py."""
import argparse
import hashlib
from collections import OrderedDict
from contextlib import closing
from http.cookiejar import CookieJar, DefaultCookiePolicy
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import re
import secrets
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, quote, urlencode, urljoin, urlsplit, unquote
from urllib.request import Request, build_opener, HTTPRedirectHandler
import zlib

ROOT = Path(__file__).resolve().parents[1]
POLICY = json.loads((ROOT / 'src/transport-policy.json').read_text(encoding='utf-8'))
LIMIT = 12 * 1024 * 1024
IMAGE_PREFIX = '/__bs/image/'
IMAGE_LIMIT = 8*1024*1024
IMAGE_TARGET = re.compile(r'(?:(?:i[012]\.hdslb\.com|archive\.biliimg\.com)/bfs/(?:[A-Za-z0-9_-]+/)+|bimp\.hdslb\.com/videoshotpv(?:hd|sd)boss/)[A-Za-z0-9_.-]+\.(?:jpe?g|png|webp|gif|avif)(?:@[A-Za-z0-9_.!-]+)?', re.I)
RANGE = re.compile(r'bytes=(?:\d{1,19}-\d{0,19}|-\d{1,19})\Z')
REDACT = {'refresh_token', 'access_token', 'access_key', 'sessdata', 'bili_jct', 'cookie', 'cookie_info'}
HLS = re.compile(r'(?<![A-Z0-9-])URI="([^"]+)"')
MEDIA_TYPES = {'video/mp4','audio/mp4','video/x-flv','video/mp2t','audio/aac','video/iso.segment',
               'audio/iso.segment','video/webm','audio/webm','application/octet-stream'}
UA = 'Mozilla/5.0 (compatible; BiliBS/1.0; TV client)'
QR = '/x/passport-login/web/qrcode/'

class Denied(Exception):
    pass

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def validate_url(url):
    if not isinstance(url, str) or len(url) > 16384 or re.search(r'[\s\\\x00-\x1f\x7f]', url):
        raise Denied()
    p = urlsplit(url)
    if p.scheme != 'https' or not p.hostname or p.netloc != p.hostname or p.fragment or not p.path.startswith('/'):
        raise Denied()
    return p

def media_url(raw):
    if not isinstance(raw, str):
        return None
    url = 'https:' + raw if raw.startswith('//') else re.sub('^http://', 'https://', raw)
    try:
        p = validate_url(url)
    except (ValueError, Denied):
        return None
    return url if any(p.hostname == x or p.hostname.endswith('.' + x) for x in POLICY['cdn']) else None

def clean(obj):
    if isinstance(obj, dict):
        return {k:clean(v) for k,v in obj.items() if k.lower() not in REDACT}
    if isinstance(obj, list):
        return [clean(v) for v in obj]
    return obj

def bounded_decompress(data, mode):
    dec = zlib.decompressobj(mode)
    out = dec.decompress(data, LIMIT+1)
    if len(out) > LIMIT or not dec.eof or dec.unused_data:
        raise Denied()
    return out

def read_body(response, path):
    data = response.read(LIMIT+1)
    if len(data) > LIMIT:
        raise Denied()
    encoding = response.headers.get('Content-Encoding', '').lower()
    if encoding == 'gzip' or data.startswith(b'\x1f\x8b'):
        data = bounded_decompress(data, 31)
    elif encoding == 'deflate' or (path.endswith('/list.so') and not data.lstrip().startswith(b'<')):
        try:
            data = bounded_decompress(data, 15)
        except zlib.error:
            data = bounded_decompress(data, -15)
    elif encoding not in ('', 'identity'):
        raise Denied()
    return data.decode('utf-8-sig')

def open_upstream(opener, url, method, data=None, headers=None):
    req = Request(url, method=method, data=data, headers={'User-Agent':UA, 'Accept-Encoding':'identity',
                  'Referer':'https://www.bilibili.com/', **(headers or {})})
    try:
        return opener.open(req, timeout=12)
    except HTTPError as exc:
        if 300 <= exc.code < 400:
            exc.close()
            raise Denied()
        return exc

def pack(status, body, content='application/json', media=None):
    return {'status':status, 'body':body if isinstance(body,str) else json.dumps(body,ensure_ascii=False,separators=(',',':')),
            'headers':{'Content-Type':content}, 'media':media or {}}

class Session:
    def __init__(self):
        self.lock = threading.RLock()
        self.jar = CookieJar(DefaultCookiePolicy(strict_ns_domain=DefaultCookiePolicy.DomainStrictNonDomain))
        self.opener = build_opener(NoRedirect())
        self.by_url = OrderedDict()
        self.by_id = {}
        self.qr = None
        self.qr_version = 0
        self.account_version = 0
        self.touched = time.monotonic()

    def grant(self, url):
        canonical = media_url(url)
        if not canonical:
            raise Denied()
        with self.lock:
            if canonical in self.by_url:
                self.by_url.move_to_end(canonical)
                return self.by_url[canonical]
            token = secrets.token_urlsafe(24)
            self.by_url[canonical] = token
            self.by_id[token] = canonical
            if len(self.by_url) > 8192:
                _,old = self.by_url.popitem(last=False)
                self.by_id.pop(old)
            return token

    def playback(self, document):
        grants = {}
        route = 'https://bilibs-media.invalid'
        def address(value, blocked):
            url = None if blocked else media_url(value)
            if not url:
                return ''
            token = self.grant(url)
            local = route+'/__bs/media/'+token
            grants[local] = token
            return local
        def walk(node, blocked=False):
            if isinstance(node,list):
                for item in node:
                    walk(item,blocked)
            if not isinstance(node,dict):
                return
            def enabled(key):
                return node.get(key) not in (None,False,0,'','0',[],{})
            blocked = blocked or any(enabled(k) for k in ('is_drm','drm_tech_type','drm_kid','drm','is_locked','is_hidden')) or (enabled('encrypted') and not enabled('pwd_verified'))
            base,info = node.get('base_url'),node.get('url_info')
            live = isinstance(base,str) and isinstance(info,list)
            if live:
                for source in info:
                    if isinstance(source,dict):
                        host, extra = source.get('host'),source.get('extra','')
                        local = address(host+base+extra,blocked) if isinstance(host,str) and isinstance(extra,str) else ''
                        source['host'] = route if local else ''
                        source['extra'] = local.rsplit('/',1)[-1] if local else ''
                node['base_url'] = '/__bs/media/'
            for k,v in node.items():
                if live and k in ('base_url','url_info'):
                    continue
                if k in ('url','baseUrl','base_url') and isinstance(v,str):
                    node[k] = address(v,blocked)
                elif k in ('backupUrl','backup_url') and isinstance(v,list):
                    node[k] = [mapped for alternate in v if (mapped := address(alternate,blocked))]
                elif isinstance(v,(list,dict)):
                    walk(v,blocked)
        allowed = document.get('code') == 0
        walk(document.get('data') or document.get('result') or {},not allowed)
        return grants

    def request(self, spec):
        if spec == {'control':'cancelQr'}:
            with self.lock:
                self.qr_version += 1
                self.qr = None
            return pack(200,{'ok':True})
        method, url = spec.get('method','GET'), spec.get('url')
        p = validate_url(url)
        if p.path not in POLICY.get(method, {}).get(p.hostname,[]):
            raise Denied()
        if p.hostname == 'www.bilibili.com':
            if p.query or spec.get('body') or spec.get('headers'):
                raise Denied()
            with closing(open_upstream(self.opener,url,'GET')) as response:
                if response.status == 200:
                    visitor = CookieJar()
                    visitor.extract_cookies(response, Request(url))
                    with self.lock:
                        for cookie in visitor:
                            if cookie.name in ('buvid3', 'b_nut'):
                                self.jar.set_cookie(cookie)
                return pack(response.status,read_body(response,p.path) if response.status==200 else '', 'text/html')
        headers = spec.get('headers') or {}
        if not isinstance(headers,dict) or any(k.lower() != 'content-type' or
                v.split(';')[0].strip().lower() != 'application/x-www-form-urlencoded' for k,v in headers.items()):
            raise Denied()
        query = parse_qsl(p.query,keep_blank_values=True,max_num_fields=128)
        if any(k.lower() in REDACT | {'csrf','csrf_token','callback','jsonp'} for k,_ in query):
            raise Denied()
        with self.lock:
            if p.path == QR+'generate':
                if query:
                    raise Denied()
                self.qr = None
                self.qr_version += 1
            snapshot = self.qr_version
            account_snapshot = self.account_version
            if p.path == QR+'poll':
                if not self.qr or time.monotonic() > self.qr[2] or query != [('qrcode_key', self.qr[0])]:
                    raise Denied()
                url = url.split('?')[0] + '?' + urlencode({'qrcode_key':self.qr[1]})
            cookie_request = Request(url)
            self.jar.add_cookie_header(cookie_request)
            cookie_header = cookie_request.get_header('Cookie','')
        data = None
        if method == 'POST':
            if p.query:
                raise Denied()
            form = parse_qsl(spec.get('body') or '',keep_blank_values=True,max_num_fields=128)
            if any(k.lower() in REDACT | {'csrf','csrf_token'} for k,_ in form):
                raise Denied()
            cookies = SimpleCookie()
            cookies.load(cookie_header)
            csrf = cookies.get('bili_jct')
            if not csrf:
                return pack(200,{'code':-101,'message':'请先登录'})
            data = urlencode(form + [('csrf',csrf.value),('csrf_token',csrf.value)]).encode()
        elif spec.get('body'):
            raise Denied()
        if p.hostname == 'api.bilibili.com' and p.path in (
                '/x/web-interface/popular/series/list', '/x/web-interface/popular/series/one', '/x/web-interface/region/feed/rcmd', '/x/space/wbi/arc/search', '/x/v2/reply/wbi/main'):
            url = self.wbi_url(url)
            cookie_request = Request(url)
            with self.lock:
                self.jar.add_cookie_header(cookie_request)
            cookie_header = cookie_request.get_header('Cookie','')
        with closing(open_upstream(self.opener,url,method,data,{'Cookie':cookie_header} if cookie_header else {})) as response:
            if not 200 <= response.status < 300:
                return pack(response.status,{'code':-1,'message':'平台请求失败'})
            text = read_body(response,p.path)
            if p.path.endswith('/list.so'):
                if not text.lstrip().startswith('<'):
                    raise Denied()
                return pack(response.status,text,'application/xml')
            document = json.loads(text)
            if not isinstance(document,dict):
                raise Denied()
            if p.path.startswith(QR):
                data = document.get('data') or {}
                if not isinstance(data,dict):
                    data = {}
                if p.path.endswith('/generate'):
                    key,qr_url = data.get('qrcode_key'), data.get('url')
                    if document.get('code') == 0:
                        if not isinstance(key,str) or not key or not isinstance(qr_url,str) or validate_url(qr_url).hostname not in ('passport.bilibili.com','passport.biligame.com','account.bilibili.com'):
                            raise Denied()
                        with self.lock:
                            if snapshot != self.qr_version:
                                raise Denied()
                            handle = secrets.token_urlsafe(24)
                            self.qr = handle, key, time.monotonic()+200
                            data['qrcode_key'] = handle
                    data = {k:data[k] for k in ('qrcode_key','url') if k in data}
                else:
                    data = {k:data[k] for k in ('code','message','timestamp') if k in data}
                document = {k:document[k] for k in ('code','message','ttl') if k in document}
                document['data'] = data
            with self.lock:
                if account_snapshot != self.account_version or (p.path.startswith(QR) and snapshot != self.qr_version):
                    raise Denied()
                if p.path != QR+'poll' or (document.get('code') == 0 and data.get('code') == 0):
                    self.jar.extract_cookies(response,cookie_request)
                    if p.path == QR+'poll':
                        self.qr = None
                        self.qr_version += 1
                        self.account_version += 1
                        self.by_url.clear()
                        self.by_id.clear()
                grants = self.playback(document) if p.path in POLICY['playback'] else {}
            return pack(response.status,clean(document),media=grants)

    def wbi_url(self, url):
        # The public page establishes the site's guest session before its signed API calls.
        with self.lock:
            initialized = any(c.name == 'buvid3' and not c.is_expired() for c in self.jar)
        if not initialized:
            self.request({'url':'https://www.bilibili.com/c/knowledge/'})
        # Both weekly and channel requests use the current public nav keys.
        reply = self.request({'url':'https://api.bilibili.com/x/web-interface/nav'})
        nav = json.loads(reply['body'])
        if not isinstance(nav, dict) or reply['status'] != 200 or nav.get('code') not in (0, -101):
            raise Denied()
        data = nav.get('data')
        images = data.get('wbi_img') if isinstance(data, dict) else None
        if not isinstance(images, dict):
            raise Denied()
        keys = [re.fullmatch(r'.*/([0-9a-f]{32})\.[a-z]+', images.get(k, ''))
                for k in ('img_url', 'sub_url')]
        if not all(keys):
            raise Denied()
        source = ''.join(match[1] for match in keys)
        order = (46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,
                 27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13)
        mixin = ''.join(source[i] for i in order)
        p = urlsplit(url)
        fields = {k:re.sub(r"[!'()*]", '', v) for k,v in parse_qsl(p.query,keep_blank_values=True)
                  if k not in ('wts', 'w_rid')}
        fields['wts'] = str(int(time.time()))
        query = urlencode(sorted(fields.items()), quote_via=quote, safe='~')
        signature = hashlib.md5((query + mixin).encode()).hexdigest()
        return p._replace(query=query + '&w_rid=' + signature).geturl()

    def rewrite(self, text, url):
        if not text.startswith('#EXTM3U'):
            raise Denied()
        def link(uri):
            return '/__bs/media/' + self.grant(urljoin(url, uri))
        lines = []
        for line in text.splitlines():
            line = line.strip()
            if line.startswith(('#EXT-X-DEFINE:', '#EXT-X-CONTENT-STEERING:', '#EXT-X-SESSION-KEY:')):
                raise Denied()
            if line.startswith('#EXT-X-KEY:') and line != '#EXT-X-KEY:METHOD=NONE':
                raise Denied()
            if line.startswith('#'):
                if 'URI=' in HLS.sub('',line):
                    raise Denied()
                line = HLS.sub(lambda m:'URI="'+link(m[1])+'"',line)
            elif line:
                line = link(line)
            lines.append(line)
        return ('\n'.join(lines)+'\n').encode('utf-8')

def image_mime(data):
    if data.startswith(b'\xff\xd8\xff'): return 'image/jpeg'
    if data.startswith(b'\x89PNG\r\n\x1a\n'): return 'image/png'
    if data[:6] in (b'GIF87a',b'GIF89a'): return 'image/gif'
    if data.startswith(b'RIFF') and data[8:12] == b'WEBP': return 'image/webp'
    if data[4:8] == b'ftyp' and any(data[n:n+4] in (b'avif',b'avis') for n in range(8,min(64,len(data)-3),4)):
        return 'image/avif'
    raise Denied()

def raster(opener,path):
    target=path[len(IMAGE_PREFIX):]
    if not path.startswith(IMAGE_PREFIX) or len(target)>1024 or '..' in target or not IMAGE_TARGET.fullmatch(target):
        raise Denied()
    with closing(open_upstream(opener,'https://'+target,'GET')) as upstream:
        if upstream.status!=200 or upstream.headers.get_content_type() not in {'image/png','image/jpeg','image/webp','image/gif','image/avif'}:
            raise Denied()
        length=upstream.headers.get('Content-Length')
        if length is not None and (not length.isdigit() or int(length)>IMAGE_LIMIT):
            raise Denied()
        data=upstream.read(IMAGE_LIMIT+1)
        if len(data)>IMAGE_LIMIT:
            raise Denied()
        mime=image_mime(data)
        if mime!=upstream.headers.get_content_type():
            raise Denied()
        return data,mime

class State:
    def __init__(self):
        self.lock = threading.Lock()
        self.sessions = {}
        self.cdn = build_opener(NoRedirect())  # Separate cookie-free upstream client.
    def session(self, sid, create=False, clear=False):
        with self.lock:
            now = time.monotonic()
            for k in [k for k,v in self.sessions.items() if now-v.touched > 12*3600]:
                self.sessions.pop(k)
            if clear:
                self.sessions.pop(sid,None)
                return None,None
            if sid not in self.sessions:
                if not create:
                    return None,None
                if len(self.sessions) >= 128:
                    raise Denied()
                sid = secrets.token_urlsafe(32)
                self.sessions[sid] = Session()
            self.sessions[sid].touched = now
            return sid,self.sessions[sid]

class Handler(BaseHTTPRequestHandler):
    server_version = 'BiliBS'
    def log_message(self, *args):
        pass  # Request payloads, media grants, QR keys and upstream URLs stay private.

    def context(self, write=False, media=False):
        host = self.headers.get('Host','')
        if host not in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'):
            raise Denied()
        origin = 'http://' + host
        if self.headers.get('Origin',origin) != origin:
            raise Denied()
        if write and (self.headers.get('Origin') != origin or self.headers.get('X-BiliBS-Request') != '1'
                      or self.headers.get_content_type() != 'application/json'):
            raise Denied()
        if media:
            if self.headers.get('Sec-Fetch-Site') not in (None,'same-origin') or self.headers.get('Referer',origin+'/').split('/',3)[:3] != origin.split('/')[:3]:
                raise Denied()
            if self.headers.get('Sec-Fetch-Dest') in ('document','iframe','script','worker','serviceworker'):
                raise Denied()
        cookies = SimpleCookie()
        cookies.load(self.headers.get('Cookie',''))
        item = cookies.get('bilibs_'+str(self.server.server_port))
        return item.value if item else None

    def reply(self,status,body=b'',mime='text/plain',headers=None):
        try:
            self.send_response(status)
            self.send_header('Content-Type',mime)
            self.send_header('Content-Length',str(len(body)))
            for k,v in (headers or {}).items():
                self.send_header(k,v)
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)

        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            self.close_connection = True

    def end_headers(self):
        self.send_header('Cache-Control','private, max-age=900' if getattr(self,'public_image',False) else 'no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('X-Frame-Options','DENY')
        self.send_header('Cross-Origin-Resource-Policy','same-origin')
        self.send_header('Referrer-Policy','same-origin')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' blob: data:; connect-src 'self' blob:; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'")
        super().end_headers()

    def do_POST(self):
        try:
            sid = self.context(write=True)
            _,session = self.server.state.session(sid)
            if not session or self.path not in ('/__bs/request','/__bs/clear'):
                raise Denied()
            size = int(self.headers.get('Content-Length','0'))
            if not 1 <= size <= 65536 or self.headers.get('Transfer-Encoding'):
                raise Denied()
            spec = json.loads(self.rfile.read(size))
            if not isinstance(spec,dict):
                raise Denied()
            headers = {}
            if self.path == '/__bs/clear':
                self.server.state.session(sid,clear=True)
                sid,_ = self.server.state.session(None,create=True)
                headers['Set-Cookie'] = self.local_cookie(sid)
                packet = {'ok':True}
            else:
                packet = session.request(spec)
            self.reply(200,json.dumps(packet,ensure_ascii=False).encode(),'application/json',headers)
        except (Denied,ValueError,TypeError,AttributeError,KeyError,RecursionError):
            self.reply(403,b'Blocked')
        except (URLError,OSError,EOFError,zlib.error):
            self.reply(502,b'Upstream unavailable')

    def local_cookie(self,sid):
        return f'bilibs_{self.server.server_port}={sid}; Path=/; HttpOnly; SameSite=Strict'

    def serve_media(self,session,token):
        with session.lock:
            url = session.by_id.get(token)
        range_header = self.headers.get('Range')
        if not url or (range_header and not RANGE.fullmatch(range_header)):
            raise Denied()
        upstream = {'Range':range_header} if range_header else {}
        with closing(open_upstream(self.server.state.cdn,url,self.command,headers=upstream)) as response:
            if response.status not in (200,206):
                self.reply(response.status)
                return
            ctype = response.headers.get_content_type()
            playlist = 'mpegurl' in ctype.lower() or urlsplit(url).path.lower().endswith(('.m3u','.m3u8'))
            if playlist and self.command != 'HEAD':
                body = session.rewrite(read_body(response,''),url)
                self.reply(200,body,'application/vnd.apple.mpegurl')
                return
            self.send_response(response.status)
            self.send_header('Content-Type',ctype if ctype in MEDIA_TYPES else 'application/octet-stream')
            for k in ['Content-Range','Content-Length','Accept-Ranges']:
                value = response.headers.get(k)
                if value and re.fullmatch(r'[A-Za-z0-9 /\-*]+',value):
                    self.send_header(k,value)
            self.end_headers()
            if self.command != 'HEAD':
                try:
                    while chunk := response.read(65536):
                        self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError, OSError):
                    pass

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        try:
            path = urlsplit(self.path).path
            target = path.startswith('/__bs/media/')
            sid = self.context(media=target)
            if path.startswith(IMAGE_PREFIX):
                _, session = self.server.state.session(sid)
                if not session or self.path != path or self.headers.get('Sec-Fetch-Site') not in (None,'same-origin'):
                    raise Denied()
                body,mime = raster(self.server.state.cdn,path)
                self.public_image=True
                self.reply(200,body,mime)
                return
            if target:
                _, session = self.server.state.session(sid)
                if not session:
                    raise Denied()
                self.serve_media(session,path[len('/__bs/media/'):])
                return
            path = unquote(path)
            if path in ('/','/index.html'):
                filename = ROOT/'index.html'
                sid,_ = self.server.state.session(sid,create=True)
                headers = {'Set-Cookie':self.local_cookie(sid)}
            elif path.startswith(('/src/','/assets/','/vendor/')):
                filename = (ROOT/path[1:]).resolve()
                if not filename.is_relative_to((ROOT/path.split('/')[1]).resolve()) or filename.suffix.lower() not in (
                    '.js','.css','.json','.png','.jpg','.jpeg','.webp','.svg','.woff','.woff2','.ico','.mp4'):
                    raise Denied()
                headers = {}
            else:
                self.reply(404)
                return
            if not filename.is_file():
                self.reply(404)
                return
            self.reply(200,filename.read_bytes(),mimetypes.guess_type(filename.name)[0] or 'application/octet-stream',headers)
        except (ValueError,Denied):
            self.reply(403,b'Blocked')
        except (URLError,OSError,EOFError,zlib.error):
            self.reply(502,b'Upstream unavailable')

def server(port=8765):
    httpd = ThreadingHTTPServer(('127.0.0.1',port),Handler)
    httpd.state = State()
    return httpd

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=8765)
    with server(parser.parse_args().port) as httpd:
        print(f'BiliBS http://127.0.0.1:{httpd.server_port}/',flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
