"""Loopback boundary tests. Synthetic upstream responses, no external account or traffic."""
from concurrent.futures import ThreadPoolExecutor
from email.message import Message
import http.client
import io
import json
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs
import zlib

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import dev_server as gateway

API = 'https://api.bilibili.com'
QR = 'https://passport.bilibili.com' + gateway.QR
CDN = 'https://example.bilivideo.com/v/'

class Reply(io.BytesIO):
    def __init__(self, data=b'', status=200, headers=()):
        if isinstance(data,dict):
            data=json.dumps(data).encode()
        super().__init__(data)
        self.status=status
        self.headers=Message()
        for k,v in headers:
            self.headers[k]=v
    def info(self):
        return self.headers

def scan():
    return Reply({'code':0,'data':{'qrcode_key':'upstream-q','url':'https://account.bilibili.com/h5-app/passport/login/scan?x=code'}})

def confirmed():
    return Reply({'code':0,'data':{'code':0,'url':'https://passport.bilibili.com/x?SESSDATA=synthetic-secret',
             'refresh_token':'hidden-refresh','cookies':'hidden-jar'}},headers=[
        ('Set-Cookie','SESSDATA=synthetic-secret; Secure; Domain=.bilibili.com; Path=/'),
        ('Set-Cookie','bili_jct=synthetic-csrf; Secure; Domain=.bilibili.com; Path=/'),
        ('Set-Cookie','host_cookie=passport-only; Secure; Path=/')])

class Boundary(unittest.TestCase):
    def setUp(self):
        self.session=gateway.Session()

    def make_qr(self):
        with patch.object(gateway,'open_upstream',return_value=scan()):
            reply=self.session.request({'url':QR+'generate'})
        handle=json.loads(reply['body'])['data']['qrcode_key']
        self.assertNotEqual('upstream-q',handle)
        return handle

    def test_fixed_destinations_and_types(self):
        for url in ['http://api.bilibili.com/x/web-interface/nav', API+':443/x/web-interface/nav',
                    'https://user@api.bilibili.com/x/web-interface/nav','https://accounts.bilibili.com/x/web-interface/nav',
                    API+'/x/web-interface/../web-interface/nav', API+'/x/no-route',API+'/x/web-interface/nav#f',
                    API+'/x/web-interface/nav?callback=x', API+'/x/web-interface/nav?csrf_token=x']:
            with self.subTest(url=url),self.assertRaises(gateway.Denied):
                self.session.request({'url':url})
        for bad in [{'method':'PUT'},{'headers':{'Cookie':'test'}},{'headers':{'Host':'test'}},{'body':'test'}]:
            with self.assertRaises(gateway.Denied):
                self.session.request({'url':API+'/x/web-interface/nav',**bad})

    def test_qr_cookie_scope_and_host_injected_csrf(self):
        handle=self.make_qr()
        with patch.object(gateway,'open_upstream',return_value=confirmed()) as mocked:
            packet=self.session.request({'url':QR+'poll?qrcode_key='+handle})
        self.assertTrue(mocked.call_args.args[1].endswith('qrcode_key=upstream-q'))
        self.assertEqual(json.loads(packet['body']),{'code':0,'data':{'code':0}})
        self.assertNotIn('synthetic',json.dumps(packet))
        self.assertNotIn('Set-Cookie',packet['headers'])
        with patch.object(gateway,'open_upstream',return_value=Reply({'code':0})) as mocked:
            self.session.request({'url':API+'/x/relation/modify','method':'POST','body':'fid=321&act=1'})
        self.assertEqual(parse_qs(mocked.call_args.args[3].decode()),{'fid':['321'],'act':['1'],
                          'csrf':['synthetic-csrf'],'csrf_token':['synthetic-csrf']})
        sent=mocked.call_args.args[4]['Cookie']
        self.assertIn('SESSDATA=synthetic-secret',sent)
        self.assertNotIn('passport-only',sent)
        with self.assertRaises(gateway.Denied):
            self.session.request({'url':API+'/x/relation/modify','method':'POST','body':'csrf=fake'})
        self.assertEqual(json.loads(gateway.Session().request({'url':API+'/x/relation/modify','method':'POST'})['body'])['code'],-101)
        with self.assertRaises(gateway.Denied):
            self.session.request({'url':QR+'poll?qrcode_key='+handle})

    def test_cancel_prevents_late_cookie_import(self):
        handle=self.make_qr()
        entered,release=threading.Event(),threading.Event()
        def delayed(*_):
            entered.set()
            release.wait(3)
            return confirmed()
        with patch.object(gateway,'open_upstream',side_effect=delayed),ThreadPoolExecutor() as pool:
            task=pool.submit(self.session.request,{'url':QR+'poll?qrcode_key='+handle})
            self.assertTrue(entered.wait(2))
            self.session.request({'control':'cancelQr'})
            release.set()
            with self.assertRaises(gateway.Denied):
                task.result()
        self.assertFalse(list(self.session.jar))

    def test_media_only_from_playback_and_safe_manifests(self):
        allowed=CDN+'seg.m4s?x=1'
        foreign='https://bilivideo.com.example.org/leak'
        doc={'code':0,'data':{'dash':{'video':[{'baseUrl':allowed,'backupUrl':[foreign]}]},
             'codec':[{'base_url':'/live/room.m3u8','url_info':[{'host':'https://example.bilivideo.com','extra':'?s=1'}]}]}}
        with patch.object(gateway,'open_upstream',return_value=Reply(doc)):
            metadata=self.session.request({'url':API+'/x/web-interface/view'})
        self.assertEqual(metadata['media'],{})
        with patch.object(gateway,'open_upstream',return_value=Reply(doc)):
            packet=self.session.request({'url':API+'/x/player/playurl'})
        grants=packet['media']
        data=json.loads(packet['body'])['data']
        live=data['codec'][0]
        live_url=live['url_info'][0]['host']+live['base_url']+live['url_info'][0]['extra']
        vod_url=data['dash']['video'][0]['baseUrl']
        self.assertEqual(set(grants),{vod_url,live_url})
        self.assertEqual(self.session.by_id[grants[vod_url]],allowed)
        self.assertEqual(self.session.by_id[grants[live_url]],CDN.replace('/v/','/live/room.m3u8?s=1'))
        self.assertNotIn('example.bilivideo',json.dumps(packet))
        drm={'code':0,'data':{'is_drm':1,'dash':{'video':[{'baseUrl':CDN+'protected'}]}}}
        with patch.object(gateway,'open_upstream',return_value=Reply(drm)):
            locked=self.session.request({'url':API+'/x/player/playurl'})
        self.assertEqual(locked['media'],{})
        self.assertNotIn('protected',locked['body'])
        for target in [foreign,'https://api.bilibili.com/x','https://player.bilivideo.com:8080/p']:
            with self.assertRaises(gateway.Denied):
                self.session.grant(target)
        text=self.session.rewrite('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\nitem.ts?key=1\n',CDN+'movie.m3u8').decode()
        self.assertTrue(text.count('/__bs/media/')==2)
        self.assertNotIn('item.ts',text)
        self.assertIn(CDN+'item.ts?key=1',self.session.by_url)
        for line in [foreign,'#EXT-X-KEY:METHOD=AES-128,URI="key"','#EXT-X-MAP:URI=http://other.test/a',
                     '#EXT-X-CONTENT-STEERING:SERVER-URI="https://other.test/path"']:
            with self.assertRaises(gateway.Denied):
                self.session.rewrite('#EXTM3U\n'+line,CDN+'live.m3u8')
        self.assertFalse(gateway.Session().by_id.get(grants[vod_url]))

    def test_bounded_deflate_and_server_errors(self):
        compressor=zlib.compressobj(wbits=-15)
        xml=b'<i><d p="1">x</d></i>'
        with patch.object(gateway,'open_upstream',return_value=Reply(compressor.compress(xml)+compressor.flush())):
            self.assertEqual(self.session.request({'url':API+'/x/v1/dm/list.so'})['body'],xml.decode())
        with patch.object(gateway,'open_upstream',return_value=Reply(b'private debug',412)):
            result=self.session.request({'url':API+'/x/player/playurl'})
        self.assertEqual(result['status'],412)
        self.assertNotIn('private debug',result['body'])
        with self.assertRaises(gateway.Denied):
            gateway.bounded_decompress(zlib.compress(b'x'*(gateway.LIMIT+1)),15)
        self.assertIsNone(gateway.NoRedirect().redirect_request(None,None,302,'',{},'https://example.net/'))

class HttpIntegration(unittest.TestCase):
    def setUp(self):
        self.server=gateway.server(0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.origin='http://127.0.0.1:'+str(self.server.server_port)
        self.cookie=self.call('GET','/')[1]['Set-Cookie'].split(';')[0]
    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
    def call(self,method,path,headers=None,data=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3)
        try:
            conn.request(method,path,body=data,headers=headers or {})
            response=conn.getresponse()
            return response.status,dict(response.getheaders()),response.read()
        finally:
            conn.close()
    def headers(self):
        return {'Origin':self.origin,'Cookie':self.cookie,'Content-Type':'application/json','X-BiliBS-Request':'1'}
    def test_origin_host_session_and_clear(self):
        self.assertEqual(self.call('GET','/',{'Host':'outsider.test'})[0],403)
        self.assertEqual(self.call('GET','/tools/dev_server.py')[0],404)
        self.assertEqual(self.call('GET','/src/%2e%2e/tools/dev_server.py')[0],403)
        h=self.headers()
        req=b'{"control":"cancelQr"}'
        for patch_headers in [{'Cookie':''},{'Origin':'http://evil.test'},{'Origin':'null'},
                              {'Content-Type':'text/plain'},{'X-BiliBS-Request':''}]:
            self.assertEqual(self.call('POST','/__bs/request',{**h,**patch_headers},req)[0],403)
        self.assertEqual(self.call('POST','/__bs/request',h,req)[0],200)
        status,headers,_=self.call('POST','/__bs/clear',h,b'{}')
        self.assertEqual(status,200)
        self.assertIn('HttpOnly',headers['Set-Cookie'])
        self.assertIn('SameSite=Strict',headers['Set-Cookie'])
        self.assertNotIn(self.cookie,headers['Set-Cookie'])
        self.assertEqual(self.call('POST','/__bs/request',h,req)[0],403)
    def test_public_raster_scope_signature_and_limits(self):
        path='/__bs/image/i1.hdslb.com/bfs/archive/sample.jpg@336w_190h_1c.webp'
        headers={'Cookie':self.cookie,'Sec-Fetch-Site':'same-origin'}
        body=b'RIFF'+b'0000'+b'WEBP'+b'test'
        with patch.object(gateway,'open_upstream',return_value=Reply(body,headers=[('Content-Type','image/webp')])) as upstream:
            status,h,actual=self.call('GET',path,headers)
        self.assertEqual((status,h['Content-Type'],actual),(200,'image/webp',body))
        self.assertEqual(upstream.call_args.args[1:],
            ('https://i1.hdslb.com/bfs/archive/sample.jpg@336w_190h_1c.webp','GET'))
        self.assertFalse(upstream.call_args.kwargs)
        for target in [path.replace('i1.hdslb.com','outside.test'),path.replace('/bfs/','/api/'),
                       path+'?access=anything',path.replace('/archive/','/../'),
                       path.replace('.jpg@336w_190h_1c.webp','.svg'),path.replace('i1.hdslb.com','i1.hdslb.com:444')]:
            self.assertEqual(self.call('GET',target,headers)[0],403)
        self.assertEqual(self.call('GET',path,{**headers,'Sec-Fetch-Site':'cross-site'})[0],403)
        for reply in [Reply(b'<svg/>',headers=[('Content-Type','image/webp')]),
                      Reply(body,headers=[('Content-Type','image/jpeg')]),
                      Reply(body,headers=[('Content-Type','image/webp'),('Content-Length',str(gateway.IMAGE_LIMIT+1))]),
                      Reply(body,302,[('Location','https://example.org/image.png')])]:
            with patch.object(gateway,'open_upstream',return_value=reply):
                self.assertEqual(self.call('GET',path,headers)[0],403)

    def test_range_isolation_and_headers(self):
        session=self.server.state.session(self.cookie.split('=')[1])[1]
        token=session.grant(CDN+'media.mp4')
        path='/__bs/media/'+token
        headers={'Cookie':self.cookie,'Range':'bytes=6-9'}
        sample=Reply(b'data',206,[('Content-Range','bytes 6-9/100'),('Content-Length','4'),
                    ('Content-Type','video/mp4'),('Set-Cookie','x=should-not-return')])
        with patch.object(gateway,'open_upstream',return_value=sample) as out:
            status,response,body=self.call('GET',path,headers)
        self.assertEqual((status,response['Content-Range'],body),(206,'bytes 6-9/100',b'data'))
        self.assertEqual(out.call_args.kwargs['headers'],{'Range':'bytes=6-9'})
        self.assertNotIn('Set-Cookie',response)
        for extra in [{'Range':'bytes=0-2,5-9'},{'Cookie':''},{'Origin':'https://outside.test'},
                      {'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Dest':'iframe'}]:
            self.assertEqual(self.call('GET',path,{**headers,**extra})[0],403)
        self.assertEqual(self.call('GET','/__bs/media/unissued',headers)[0],403)

if __name__=='__main__':
    unittest.main(verbosity=2)
