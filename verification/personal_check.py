"""Browser contract tests for the production account UI. The service is isolated and simulated."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from ctypes import CDLL, c_void_p, c_uint, c_ulong, c_char_p, c_int, create_string_buffer, cast
from ctypes.util import find_library
from io import BytesIO
import json
import hashlib
from datetime import datetime, timezone
from urllib.parse import urlsplit
import os
import sys
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from build_ui import assemble

MOCK = r"""
(()=>{
let uid='',pair=0,refuse=false,lateResolve;
window.accountTest={writes:[],reads:[],later:true,liked:false,confirm:false,delay:false};
const t=window.accountTest;
const video={id:'BV1xx411c7mD',kind:'video',bvid:'BV1xx411c7mD',aid:'27',cid:'201',title:'接口视频',artist:'测试作者',mid:'11',duration:300,cover:'https://i0.hdslb.com/bfs/archive/abc.jpg',wide:'https://i0.hdslb.com/bfs/archive/abc.jpg'};
const person={id:'11',mid:'11',kind:'author',title:'测试作者',desc:'简介',following:false};
const seasons=Array.from({length:19},(_,i)=>({id:String(700+i),seasonId:String(700+i),title:'测试剧集 '+(i+1),kind:'anime',count:3}));
const detail=id=>({...seasons.find(x=>x.id===id),following:true,episodes:[1,2,3].map((n)=>({title:String(n),epId:id+n,cid:id+n+'0',aid:'27'}))});
const folders=[{id:'32',folderId:'32',title:'测试收藏夹',count:1,selected:false}];
const history=[{...seasons[0],kid:'pgc_700',page:1,epId:'7002',cid:'70020',viewAt:200,duration:120,progress:7},{...seasons[0],kid:'pgc_700',page:1,epId:'7001',cid:'70010',viewAt:100,duration:120,progress:-1}];
const post={id:'99',kind:'post',postType:'image',title:'一条图文',desc:'完整的正文',artist:'测试作者',mid:'11',images:[],published:100};
const result=items=>({items,next:null,total:items.length});
Object.assign(t,{
  login(id){uid=id;return BSPersonal.refresh();},
  getUrls(){return ['https://account.bilibili.com/h5-app/passport/login/scan?navhide=1&qrcode_key=key'+pair];},
  release(){lateResolve?.();},
  deferQR(){t.delay=true;},
  block(on){refuse=on;},
});
window.BSApi={async call(op,p={}){
  t.reads.push(op);
  if(p.userAction===true)t.writes.push({op,p});
  if(op==='qrGenerate'){pair++;return {key:'key'+pair,url:t.getUrls()[0],expiresIn:t.expiresIn||180};}
  if(op==='qrPoll'){if(t.delay){t.delay=false;await new Promise(r=>lateResolve=r);}
    if(t.confirm){uid='111';return {state:'confirmed'};}return {state:'waiting'};}
  if(op==='nav')return {loggedIn:!!uid,mid:uid,name:uid==='111'?'测试用户甲':'测试用户乙'};
  if(op==='logout'){uid='';return {ok:true};}
  if(op==='history')return result(uid==='111'?history:[]);
  if(op==='shelf')return result(p.kind==='anime'&&uid==='111'?seasons:[]);
  if(op==='season')return detail(String(p.seasonId));
  if(op==='folders')return result(uid==='111'?folders.map(x=>({...x,title:x.title})):[]);
  if(op==='folder'||op==='authorVideos')return result([video]);
  if(op==='likes')return result(t.liked?[video]:[]);
  if(op==='later')return result(t.later?[video]:[]);
  if(op==='follows')return result([person]);
  if(op==='author')return person;
  if(op==='authorLive')return result([]);
  if(op==='feed')return result([post]);
  if(op==='post')return post;
  if(op==='relation')return {liked:t.liked,following:false};
  if(op==='video')return video;
  if(op==='like'||op==='setLater'||op==='setFavorite'||op==='follow'||op==='clearHistory'||op==='createFolder'){
    if(refuse)throw Error('测试写入失败');
    if(op==='like')t.liked=p.enabled;
    if(op==='setLater')t.later=p.enabled;
    if(op==='setFavorite')folders[0].selected=!!p.addIds;
    if(op==='clearHistory')history.length=0;
    if(op==='createFolder'){const f={id:'83',folderId:'83',title:p.title,count:0,selected:false};folders.push(f);return f;}
    return {ok:true};
  }
  return result([]);
}};
})();
"""

TEST_HOOK = """
window.accountTest.open=(name,props)=>page(name,props);
window.accountTest.root=rootTo;
window.accountTest.route=()=>({...current()});
window.accountTest.seedLocal=()=>{const w=window.BSDiscovery.register({id:'700',seasonId:'700',title:'本机历史作品',kind:'anime'});progress={'700:1':{w,t:15,d:180,ep:1,recent:10,epId:'7001',cid:'70010',done:false}};save('history',progress);};
window.accountTest.observePlay=()=>{startWatch=(id,ep,opts)=>window.accountTest.played={id,ep,...opts};};
"""

def decode_qr(image_data):
    lib = CDLL(find_library('zbar') or 'libzbar.so.0')
    def func(name, args, ret):
        f = getattr(lib, 'zbar_' + name)
        f.argtypes, f.restype = args, ret
        return f
    scanner = func('image_scanner_create', [], c_void_p)()
    z = func('image_create', [], c_void_p)()
    im = Image.open(BytesIO(image_data)).convert('L')
    raw = im.tobytes()
    ptr = create_string_buffer(raw)
    try:
        func('image_set_format', [c_void_p,c_ulong], None)(z,int.from_bytes(b'Y800','little'))
        func('image_set_size', [c_void_p,c_uint,c_uint], None)(z,*im.size)
        func('image_set_data', [c_void_p,c_void_p,c_ulong,c_void_p], None)(z,cast(ptr,c_void_p),len(raw),None)
        func('scan_image',[c_void_p,c_void_p],c_int)(scanner,z)
        sym=func('image_first_symbol',[c_void_p],c_void_p)(z)
        return func('symbol_get_data',[c_void_p],c_char_p)(sym).decode() if sym else ''
    finally:
        func('image_destroy',[c_void_p],None)(z)
        func('image_scanner_destroy',[c_void_p],None)(scanner)

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

def run():
    srv=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
    Thread(target=srv.serve_forever,daemon=True).start()
    checks, errors = [], []
    def check(name,value):
        assert value,name
        checks.append(name)
    try:
        with sync_playwright() as pw:
            br=pw.chromium.launch(executable_path=os.environ.get('BILIBS_CHROME','/usr/bin/chromium'),args=['--no-sandbox','--single-process','--no-zygote','--disable-gpu','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'])
            pg=br.new_page(viewport={'width':1440,'height':810})
            pg.set_default_timeout(6500)
            pg.on('pageerror',lambda e:errors.append(str(e)))
            script=assemble().replace("history.scrollRestoration='manual';",TEST_HOOK+"\nhistory.scrollRestoration='manual';")
            image=BytesIO()
            Image.new('RGB',(18,10),'#345').save(image,'PNG')
            pg.route('**/__bs/image/**',lambda r:r.fulfill(content_type='image/png',body=image.getvalue()))
            pg.route('**/src/services.js',lambda r:r.fulfill(content_type='text/javascript',body=MOCK))
            pg.route('**/src/runtime.js',lambda r:r.fulfill(content_type='text/javascript',body=script))
            pg.goto(f'http://127.0.0.1:{srv.server_port}/index.html')
            pg.wait_for_function('!!window.accountTest?.open')
            key=lambda k:pg.locator('[data-k="'+k+'"]')
            pg.evaluate("accountTest.root('mine')")
            pg.keyboard.press('ArrowDown')
            check('我的默认下键到追番',key('mine-shelfA').evaluate('e=>e===document.activeElement'))
            pg.keyboard.press('ArrowLeft')
            check('追番一步左移到账户',key('my-account').evaluate('e=>e===document.activeElement'))
            key('mine-shelfA').click()
            qr=pg.locator('.pairArt img');qr.wait_for()
            check('生成的二维码解码后与模拟服务 URL 完全一致',decode_qr(qr.screenshot())==pg.evaluate('accountTest.getUrls()[0]'))
            check('游客不显示模拟确认','模拟手机确认' not in pg.locator('#view').inner_text())
            pg.evaluate('accountTest.deferQR()')
            pg.wait_for_function("accountTest.reads.includes('qrPoll')")
            key('pair-renew').click()
            pg.wait_for_function("accountTest.getUrls()[0].endsWith('key2')")
            pg.evaluate('accountTest.confirm=true;accountTest.release();')
            pg.wait_for_timeout(120)
            check('换码后旧轮询响应失效',pg.evaluate("!BSPersonal.account && accountTest.route().name==='login'"))
            pg.wait_for_selector('.shelfCell')
            check('扫码成功返回原追番目标',pg.evaluate("BSPersonal.account.mid==='111' && accountTest.route().name==='shelf'"))
            check('加载完成后默认聚焦片架首部',pg.evaluate("document.activeElement.dataset.k==='s-700'"))
            check('满页展示两排六列',pg.locator('.denseRow').count()==2 and pg.locator('.shelfCell').count()==12)
            key('s-700').focus()
            pg.keyboard.press('ArrowDown')
            check('垂直移动六项',pg.evaluate("document.activeElement.dataset.k==='s-706'"))
            pg.keyboard.press('PageDown');pg.keyboard.press('ArrowDown')
            check('可达第十九部',pg.evaluate("document.activeElement.dataset.k==='s-718'"))
            pg.keyboard.press('PageUp');key('s-700').focus()
            pg.evaluate('accountTest.observePlay()')
            pg.keyboard.press('Enter')
            pg.wait_for_function('!!accountTest.played')
            play=pg.evaluate('accountTest.played')
            check('云历史按真实分集 ID 精确续播',play['id']=='700' and play['ep']==2 and play['at']==7 and play['epId']=='7002')
            pg.evaluate("accountTest.root('mine');accountTest.seedLocal();accountTest.open('history',{origin:'cloud'})")
            pg.wait_for_selector('.histRow')
            check('同一季不同分集保留独立记录',pg.locator('.histRow').count()==2)
            key('clear-history').click();check('云端清空默认取消',key('safe').evaluate('e=>e===document.activeElement'))
            key('safe').click();pg.wait_for_function("document.querySelector('#layer').hidden")
            key('clear-history').click();key('yes').click()
            pg.wait_for_function("document.querySelector('#view').textContent.includes('暂无云端观看记录')")
            key('historyOrigin-local').focus()
            check('云端清空后保留本机历史',pg.locator('.histRow').count()==1)
            pg.evaluate("accountTest.root('mine');accountTest.open('folders')")
            key('folder-32').wait_for();key('new-folder').click()
            key('folder-input').fill('新收藏夹');key('folder-create').click();key('folder-83').wait_for()
            check('平台确认后展示新夹',key('folder-83').inner_text().find('新收藏夹')>=0)
            key('folder-32').click();key('media-BV1xx411c7mD').wait_for();key('media-BV1xx411c7mD').focus()
            pg.keyboard.press('m');key('m-save').click();key('mf-32').wait_for();key('mf-32').click()
            pg.wait_for_function("window.accountTest.writes.some(x=>x.op==='setFavorite') && document.querySelector('#layer').hidden")
            check('收藏仅写指定夹',pg.evaluate("accountTest.writes.find(x=>x.op==='setFavorite').p.addIds.join()==='32'"))
            pg.evaluate("accountTest.open('later')")
            thumb=pg.locator('.queuePlay img');thumb.wait_for()
            check('个人列表的封面经同源代理显示',thumb.get_attribute('src')=='/__bs/image/i0.hdslb.com/bfs/archive/abc.jpg' and thumb.evaluate('i=>i.naturalWidth>0'))
            key('later-menu-BV1xx411c7mD').click()
            pg.wait_for_function("document.querySelector('[data-k=m-later]').textContent.includes('移出')")
            key('m-later').click()
            pg.wait_for_function("document.querySelector('#view').textContent.includes('这里暂时没有视频')")
            check('稍后再看移除成功后刷新',pg.evaluate('!accountTest.later'))
            pg.evaluate("accountTest.block(true)")
            check('写入失败不更新点赞状态',not pg.evaluate("BSPersonal.action('like',{id:'BV1xx411c7mD'})") and not pg.evaluate("BSPersonal.isMarked('like','BV1xx411c7mD')"))
            pg.evaluate("accountTest.block(false)")
            check('点赞在服务确认后成功',pg.evaluate("BSPersonal.action('like',{id:'BV1xx411c7mD'})"))
            pg.evaluate("accountTest.open('likes')")
            check('点赞列表直播放',key('media-BV1xx411c7mD').get_attribute('data-act')=='play')
            pg.evaluate("accountTest.root('feed')");key('feedTab-post').focus();key('post-99').click()
            pg.wait_for_function("document.querySelector('#view').textContent.includes('完整的正文')")
            check('图文卡保留所属作者',key('post-author-99').get_attribute('data-id')=='11')
            key('post-author-99').click();key('uploads-BV1xx411c7mD').wait_for()
            key('authorTab-live').focus()
            pg.wait_for_function("document.querySelector('#view').textContent.includes('暂无直播间')")
            check('作者资料与空直播选项可用',key('follow-toggle').is_visible())
            pg.evaluate("accountTest.root('mine');accountTest.open('account')")
            key('account-action').click();key('safe').click()
            pg.wait_for_function("document.querySelector('#layer').hidden")
            check('登出取消保留会话',pg.evaluate("BSPersonal.account.mid==='111'"))
            key('account-action').click();key('yes').click()
            pg.wait_for_function('!BSPersonal.account')
            pg.evaluate("accountTest.root('mine');accountTest.open('folders')")
            check('游客看不到账号甲收藏',key('gate').is_visible() and not key('folder-32').count())
            pg.evaluate("accountTest.login('222')")
            pg.wait_for_function("document.querySelector('#view').textContent.includes('这里暂时没有收藏夹')")
            check('切换账号不复用上一账号私有数据',not key('folder-32').count() and not pg.evaluate("BSPersonal.isMarked('like','BV1xx411c7mD')"))
            pg.evaluate("accountTest.open('folder',{folder:'32'})")
            pg.wait_for_function("document.querySelector('#view').textContent.includes('当前账号没有这个收藏夹')")
            check('旧收藏夹深层返回也按当前账号校验',not key('media-BV1xx411c7mD').count())
            pg.evaluate("accountTest.login('')")
            pg.evaluate("accountTest.confirm=false;accountTest.expiresIn=1;accountTest.root('mine');accountTest.open('login')")
            pg.wait_for_function("document.querySelector('#pair-status')?.textContent.includes('已过期')")
            check('到期移除二维码并保持换码焦点',not qr.count() and key('pair-renew').evaluate('e=>e===document.activeElement'))
            pg.evaluate("accountTest.expiresIn=180")
            key('pair-renew').click();qr.wait_for()
            polls=pg.evaluate("accountTest.reads.filter(x=>x==='qrPoll').length")
            pg.keyboard.press('Escape')
            pg.wait_for_function("accountTest.route().root==='mine'")
            pg.wait_for_timeout(2400)
            check('离开登录页停止轮询',pg.evaluate("accountTest.reads.filter(x=>x==='qrPoll').length")==polls)
            check('浏览器无未捕获异常',not errors)
            br.close()
    finally:
        srv.shutdown()
    return {'scope':'模拟服务、真实生产 UI、Chromium；未触碰任何实际账号','checks':checks,'uncaught':errors}
def live_qr():
    """Generate one disposable official QR and observe it without scanning or confirming it."""
    from dev_server import server
    result={'utc':datetime.now(timezone.utc).isoformat(),'fixture':False,'scope':'匿名网页，未扫描、未确认、未写账号',
            'generated':False,'decoded_matches':False,'poll_state':None,'left_login':False,'revoked':False}
    expected=None
    stage='browser'
    srv=server(0)
    Thread(target=srv.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as pw:
            br=pw.chromium.launch(executable_path=os.environ.get('BILIBS_CHROME','/usr/bin/chromium'),
                                  args=['--no-sandbox','--single-process','--no-zygote','--disable-gpu','--disable-dev-shm-usage'])
            pg=br.new_page(viewport={'width':1440,'height':810})
            pg.set_default_timeout(25000)
            result['browser']=br.version
            pg.route('**/src/runtime.js',lambda r:r.fulfill(content_type='text/javascript',body=assemble()))
            def observe(resp):
                nonlocal expected
                if not resp.url.endswith('/__bs/request'): return
                try:
                    req=resp.request.post_data_json
                    if req.get('control')=='cancelQr':
                        result['cancel_http']=resp.status
                        return
                    path=urlsplit(req.get('url','')).path
                    if path not in ['/x/passport-login/web/qrcode/generate','/x/passport-login/web/qrcode/poll']: return
                    op='generate' if path.endswith('generate') else 'poll'
                    result[op+'_gateway_http']=resp.status
                    if resp.status!=200:return
                    packet=resp.json()
                    result[op+'_upstream_http']=packet.get('status')
                    data=json.loads(packet.get('body','{}'))
                    result[op+'_code']=data.get('code')
                    if op=='generate' and data.get('code')==0:
                        url=data['data']['url']
                        expected=hashlib.sha256(url.encode('utf-8')).digest()
                        result['generated']=True
                    elif op=='poll' and data.get('code')==0:
                        code=data.get('data',{}).get('code')
                        result['poll_state']={86101:'waiting',86090:'scanned',86038:'expired',0:'confirmed'}.get(code,'other')
                except (ValueError,KeyError,TypeError):
                    pass
            pg.on('response',observe)
            stage='startup'
            pg.goto(f'http://127.0.0.1:{srv.server_port}/index.html',wait_until='domcontentloaded')
            stage='mine'
            pg.locator('[data-k="nav-mine"]').click()
            stage='login'
            pg.locator('[data-k="my-account"]').click()
            stage='generate'
            pg.locator('.pairArt').wait_for()
            for _ in range(150):
                if pg.locator('.pairArt img').count() or '正在获取' not in pg.locator('#pair-status').inner_text():break
                pg.wait_for_timeout(130)
            stage='decode'
            pixels=pg.locator('.pairArt img')
            if pixels.count():
                scanned=decode_qr(pixels.screenshot())
                result['symbol']='QR Code' if scanned else 'undecodable'
                result['decoded_matches']=expected is not None and hashlib.sha256(scanned.encode('utf-8')).digest()==expected
                del scanned
                for _ in range(120):
                    if result.get('poll_state') is not None or 'poll_gateway_http' in result: break
                    pg.wait_for_timeout(150)
            stage='leave'
            pg.keyboard.press('Escape')
            pg.locator('[data-k="my-account"]').wait_for()
            result['left_login']=True
            for _ in range(20):
                if result.get('cancel_http') and not any(session.qr for session in srv.state.sessions.values()):break
                pg.wait_for_timeout(100)
            result['revoked']=result.get('cancel_http')==200 and not any(session.qr for session in srv.state.sessions.values())
            result['signed_in']='扫码登录' not in pg.locator('[data-k="my-account"]').inner_text()
            br.close()
    except Exception as e:
        # Error types only. Browser debug logs may include pairing parameters.
        result['test_error']=type(e).__name__
        result['stage']=stage
        msg=str(e).splitlines()[0][:120]
        if not any(c in msg for c in ['://','data:','qrcode_key','key=']):result['debug']=msg
    finally:
        srv.shutdown()
        srv.server_close()
    return result

if __name__=='__main__':
    print(json.dumps(live_qr() if '--live-qr' in sys.argv else run(),ensure_ascii=False,indent=2))
