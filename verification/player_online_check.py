"""Exercise production playback code in Chromium using generated pattern + tone.
Requires ffmpeg, Chromium and Python Playwright. No network/account is used.
"""
import argparse
import base64
import contextlib
import json
import mimetypes
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
START = "window.addEventListener('pagehide',rememberPlayback);history.scrollRestoration='manual';stamp();render();"
STUB = """
window.BS_MODE='online';
document.documentElement.dataset.mode='online';
window.BSTransport={mediaURL:u=> u ? '/__bs/media/'+u : '',imageURL:u=>u?'/shot.png':''};
window.BSPersonal={isMarked:()=>false,loadRelations:()=>Promise.resolve(),invalidateHistory(){}};
window.BSApi={call:async(op,p)=>{
 if(op==='nav')return {loggedIn:false};
 if(op==='author')return {kind:'author',id:'9',mid:'9',title:'测试作者',name:'测试作者',desc:'作者简介'};
 if(op==='authorVideos')return {items:[P.vid],next:null};
 if(op==='authorLive')return {items:[],next:null};
 if(op==='relation')return {liked:false,following:false};
 if(op==='video')return P.vid;
 if(op==='videoShot')return {images:['https://i0.hdslb.com/bfs/videoshot/shot.jpg'],columns:2,rows:2,times:[0,20,40,60]};
 if(op==='play'){
  window.playRequests=(window.playRequests||0)+1;
  if(window.testMode==='quality')return {...F.dash,video:[...F.dash.video,{...F.dash.video[0],id:32}],qualities:[...F.dash.qualities,{id:32,label:'高清晰度测试'}]};
  if(window.testMode==='deny')throw Object.assign(new Error('平台限制访问'),{code:-10403});
  if(['file','resume-file'].includes(window.testMode))return F.file;
  if(window.testMode==='single')return {...F.dash,audio:[]};
  if(window.testMode==='bad-audio')return p.format==='progressive'?{segments:[]}:{...F.dash,audio:F.dash.audio.map(a=>({...a,url:'blocked'}))};
  if(window.testMode==='fallback')return p.format==='progressive'?F.file:{...F.dash,audio:F.dash.audio.map(a=>({...a,url:'blocked'}))};
  return p.format==='progressive'?{segments:[]}:F.dash;
 }
 if(op==='liveRoom')return P.room;
 if(op==='livePlay')return {liveStatus:1,qualities:[{id:1,label:'原画'}],streams:[{url:window.testMode==='flv'?'liveflv':'playlist',protocol:window.testMode==='flv'?'http_stream':'http_hls',format:window.testMode==='flv'?'flv':'ts',codec:'avc',quality:1,line:1}]};
 if(op==='danmaku')return {items:window.testMode==='danmaku'?[
  {time:0,text:'moving',mode:1},{time:0,text:'fixed-top',mode:5},{time:0,text:'fixed-bottom',mode:4},{time:0,text:'reverse',mode:6},
  ...Array.from({length:80},(_,i)=>({time:.2+i*.03,text:'dense-'+i,mode:i%3?1:5})),{time:8.9,text:'seek-marker',mode:4}
 ]:[{time:0,text:'同步评论',mode:1,color:16777215}]};
 if(op==='liveChat')return {items:[]};
 if(op==='related')return {items:[P.next]};
 if(op==='reportProgress')return {ok:true};
 throw new Error(op);
}};
"""
STARTUP = """
const vid=V['test-video']={id:'test-video',kind:'video',aid:'1',bvid:'BVabcdefgh12',cid:'2',title:'版权自有的测试图',duration:12,artist:'测试作者',author:'9',pages:[{title:'第一段',cid:'2',duration:12},{title:'第二段',cid:'3',duration:12}]};
const next=V['next']={...vid,id:'next',title:'第二项'};
const room=R['42']={id:'42',kind:'live',title:'测试直播间',roomId:'42',host:'9',on:true};
C['9']=['测试作者','测','#234'];
W['77']={id:'77',kind:'anime',seasonId:'77',title:'测试作品',count:2,episodes:[{epId:'10',aid:'1',cid:'2',title:'第一话'},{epId:'11',aid:'1',cid:'3',title:'第二话'}]};
window.BSDiscovery={register:x=>x,loadSeason:async()=>W['77']};
window.P={vid,next,room,play:(id='test-video',ep=0,opt={})=>startWatch(id,ep,opt),stop:()=>stopWatch(),jump,cur:()=>current(),pref:setPreference,stack:()=>pages.map(s=>({type:s.type,name:s.name,id:s.id})),reveal:()=>wake(false),
 status:()=>document.getElementById('pKind').textContent,history:()=>progress,panel:k=>openOverlay('watch',{mode:k}),close:()=>finishOverlay(),progress:()=>document.getElementById('pTime').textContent};
history.scrollRestoration='manual'; stamp();
"""
def generate(tmp):
    def ff(*args):
        subprocess.run(['ffmpeg','-nostdin','-loglevel','error','-y','-threads','1',*map(str,args)],check=True)
    ff('-f','lavfi','-i','testsrc2=size=320x180:rate=24','-f','lavfi','-i','sine=frequency=500:sample_rate=48000',
       '-t',12,'-c:v','libx264','-profile:v','main','-level:v','3.0','-threads','1','-g',48,'-sc_threshold',0,'-pix_fmt','yuv420p',
       '-c:a','aac','-b:a','96k','-movflags','faststart',tmp/'file.mp4')
    tracks=[]
    for name,selector,mime,codec in [('picture','v','video/mp4','avc1.4D401E'),('sound','a','audio/mp4','mp4a.40.2')]:
        file=tmp/(name+'.mp4')
        ff('-i',tmp/'file.mp4','-map','0:'+selector,'-c','copy','-movflags','empty_moov+frag_keyframe+global_sidx+default_base_moof','-frag_duration','2000000',file)
        buf=file.read_bytes();i=0
        while i+8<=len(buf):
            size,kind=struct.unpack_from('>I4s',buf,i)
            if kind==b'sidx':break
            if size<=0:raise ValueError('invalid MP4')
            i+=size
        assert kind==b'sidx'
        tracks.append(dict(url=name,backupUrls=[],id=16,mime=mime,codec=codec,bandwidth=180000 if name=='picture' else 96000,width=320,height=180,frameRate='24',
                           segmentBase=dict(initialization=f'0-{i-1}',indexRange=f'{i}-{i+size-1}')))
    ff('-i',tmp/'file.mp4','-c','copy','-f','hls','-hls_time',2,'-hls_list_size',0,'-hls_segment_filename',tmp/'part%d.ts',tmp/'live.m3u8')
    ff('-i',tmp/'file.mp4','-c','copy','-f','flv',tmp/'live.flv')
    mp=tmp/'live.m3u8'
    mp.write_text(re.sub(r'part(\d+)\.ts',r'/__bs/media/part\1',mp.read_text()))
    return dict(dash=dict(video=tracks[:1],audio=tracks[1:],duration=12,quality=16,qualities=[{'id':16,'label':'测试'},{'id':80,'label':'高清'}]),
                file=dict(segments=[dict(url='file',duration=12),dict(url='file',duration=12)],duration=24,quality=16))
def run(tmp):
    data=generate(tmp)
    app=(ROOT/'src/app.js').read_text()
    assert app.count(START)==1
    app=app.replace(START,(ROOT/'src/features/discovery.js').read_text()+'\n'+(ROOT/'src/features/personal.js').read_text()+'\n'+(ROOT/'src/features/player.js').read_text()+'\n'+STARTUP)
    page=(ROOT/'index.html').read_text()
    page=re.sub(r'<script\b[^>]*>.*?</script>','',page, flags=re.S).replace('</body>','<script src="/stub.js"></script><script src="/test.js"></script></body>')
    names={'file':'file.mp4','picture':'picture.mp4','sound':'sound.mp4','playlist':'live.m3u8','liveflv':'live.flv'}
    names.update({p.stem:p.name for p in tmp.glob('part*.ts')})
    requests=[]
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def do_HEAD(self):self.serve(False)
        def do_GET(self):self.serve(True)
        def serve(self,body):
            p=self.path.split('?')[0];status=200;extra={}
            if p=='/': raw=page.encode();mime='text/html'
            elif p=='/stub.js':raw=('window.F='+json.dumps(data)+';'+STUB).encode();mime='text/javascript'
            elif p=='/test.js':raw=app.encode();mime='text/javascript'
            elif p=='/shot.png':raw=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV1sAAAAASUVORK5CYII=');mime='image/png'
            elif p in ['/src/vendor/shaka-player.compiled.js','/src/vendor/mpegts.js','/src/vendor/hls.light.min.js','/src/ui.css']:
                raw=(ROOT/p[1:]).read_bytes();mime=mimetypes.guess_type(p)[0]
            elif p.startswith('/__bs/media/'):
                name=p.rsplit('/',1)[1];req=self.headers.get('Range','')
                requests.append((name,req))
                if name not in names:self.send_error(403);return
                file=tmp/names[name]; raw=file.read_bytes();mime={'.flv':'video/x-flv','.ts':'video/mp2t','.m3u8':'application/vnd.apple.mpegurl','.mp4':'video/mp4'}[file.suffix]
                if req:
                    a,b=req.removeprefix('bytes=').split('-');a=int(a);b=min(int(b) if b else len(raw)-1,len(raw)-1)
                    extra['Content-Range']=f'bytes {a}-{b}/{len(raw)}';raw=raw[a:b+1];status=206
                extra['Accept-Ranges']='bytes'
            else:self.send_error(404);return
            self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(raw)))
            for k,v in extra.items():self.send_header(k,v)
            self.end_headers()
            if body:
                with contextlib.suppress(BrokenPipeError,ConnectionResetError):self.wfile.write(raw)
    with ThreadingHTTPServer(('127.0.0.1',0),Handler) as srv,sync_playwright() as pw:
        threading.Thread(target=srv.serve_forever,daemon=True).start()
        browser=pw.chromium.launch(executable_path=os.environ.get('BILIBS_CHROME') or shutil.which('chromium'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        results={}; errors=[]
        for mode in ['dash','file','danmaku','resume-dash','resume-file','resume-paused','hls','flv','fallback','single','bad-audio','deny','ep','quality','queue','stack']:
            tab=browser.new_page(); tab.on('pageerror',lambda e:errors.append(str(e)))
            tab.goto('http://127.0.0.1:'+str(srv.server_port)+'/')
            tab.evaluate('(m)=>{window.testMode=m;if(m==="danmaku")P.pref("density",3);if(m.startsWith("resume-"))window.BSNative={};P.play(m==="ep"?"77":["hls","flv"].includes(m)?"42":"test-video",0,m.startsWith("resume-")?{at:4,restorePaused:m==="resume-paused"}:["hls","flv"].includes(m)?{room:"42"}:{})}',mode)
            try:
                if mode in ['single','bad-audio','deny']:
                    tab.wait_for_selector('#mediaError:visible',timeout=35000)
                    assert not tab.evaluate('Object.keys(P.history()).length')
                    results[mode]={'error':tab.locator('#mediaError').inner_text(),'historyEntries':0}
                    if mode=='bad-audio':
                        tab.evaluate("window.testMode='dash'")
                        tab.locator('[data-act=retryMedia]').click()
                        tab.wait_for_function('video.currentTime>.4 && video.webkitAudioDecodedByteCount>0',timeout=15000)
                        results[mode]['recoveredOnExplicitRetry']=True
                else:
                    tab.wait_for_function("!document.querySelector('#player').classList.contains('loading')&&document.getElementById('video').currentTime>.45 && document.getElementById('video').getVideoPlaybackQuality().totalVideoFrames>0",timeout=40000)
                    detail=tab.evaluate("""()=>{const v=document.getElementById('video');return {time:v.currentTime,frames:v.getVideoPlaybackQuality().totalVideoFrames,audioBytes:v.webkitAudioDecodedByteCount,status:P.status()}}""")
                    assert detail['audioBytes']>0,detail
                    if mode=='danmaku':
                        tab.wait_for_selector('.comments span:text-is("moving")')
                        tab.evaluate('window.movingNode=[...document.querySelectorAll(".comments span")].find(n=>n.textContent==="moving")')
                        x=tab.evaluate('new DOMMatrix(getComputedStyle(movingNode).transform).m41')
                        tab.wait_for_function('video.currentTime>2')
                        assert tab.evaluate('movingNode.isConnected')
                        assert tab.evaluate('new DOMMatrix(getComputedStyle(movingNode).transform).m41')<x
                        assert tab.locator('.comments span:text-is("fixed-top")').count()==1
                        top=tab.locator('.comments span:text-is("fixed-top")').evaluate('n=>n.offsetTop')
                        bottom=tab.locator('.comments span:text-is("fixed-bottom")').evaluate('n=>n.offsetTop')
                        assert bottom>top+200
                        tab.evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"MediaPause",bubbles:true,cancelable:true}))');tab.wait_for_function('video.paused')
                        paused=tab.evaluate('movingNode.style.transform');tab.wait_for_timeout(200)
                        assert tab.evaluate('movingNode.style.transform')==paused
                        tab.evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"MediaPlay",bubbles:true,cancelable:true}))');tab.wait_for_function('video.currentTime>4.8')
                        assert tab.locator('.comments span:text-is("fixed-top")').count()==1
                        tab.wait_for_function('video.currentTime>5.2')
                        assert tab.locator('.comments span:text-is("fixed-top")').count()==0
                        tab.evaluate('P.jump(9)');tab.wait_for_selector('.comments span:text-is("seek-marker")')
                        assert not tab.locator('.comments span:text-is("moving")').count()
                        detail.update({'stableMovingNodeThroughDenseTraffic':True,'fixedLifetimeSeconds':5,'bottomPlacement':True,'pauseAndSeek':True})
                    if mode.startswith('resume-'):
                        assert tab.evaluate('video.currentTime>=4 && !video.muted')
                        assert tab.evaluate('video.paused')==(mode=='resume-paused')
                        assert tab.locator('video').count()==1
                        detail.update({'restoredPosition':4,'restoredPause':mode=='resume-paused','singleDecoder':True,'restoredMute':True})
                    if mode in ['hls','flv']: assert tab.locator('.timelineRow').is_hidden() and not tab.evaluate('Object.keys(P.history()).length')
                    if mode=='dash':
                        tab.keyboard.press('ArrowRight')
                        tab.wait_for_function('video.currentTime>5')
                        before=tab.evaluate('window.playRequests')
                        tab.keyboard.press('ArrowDown');tab.keyboard.press('ArrowDown')
                        tab.wait_for_selector('.epChoices [data-preview-source=videoshot]',timeout=20000)
                        assert tab.locator('.epChoices .episodeThumb').count()==2
                        assert tab.locator('#layer').get_attribute('data-inline')=='true'
                        assert tab.locator('.epChoices').evaluate('n=>new Set([...n.children].map(x=>x.offsetTop)).size')==1
                        assert tab.locator('#hud').evaluate('n=>getComputedStyle(n).bottom')=='328px'
                        assert tab.locator('video').count()==1 and tab.evaluate('window.playRequests')==before
                        assert tab.evaluate('P.cur().ep')==0
                        tab.keyboard.press('ArrowRight');tab.keyboard.press('Enter')
                        tab.wait_for_function('P.cur().ep===2 && video.currentTime>.15',timeout=20000)
                        detail.update({'remoteSeek':True,'officialImagePreview':True,'noExtraDecoder':True,'confirmedPart':2})
                    if mode in ('dash','file'):
                        tab.locator('#seek').focus()
                        before=tab.evaluate('video.currentSrc')
                        for _ in range(100):
                            tab.keyboard.press('MediaPlayPause')
                        tab.evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'MediaPause',bubbles:true,cancelable:true}))")
                        tab.wait_for_function('video.paused')
                        tab.evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'MediaPlay',bubbles:true,cancelable:true}))")
                        tab.wait_for_function('!video.paused && document.querySelector("#mediaError").hidden')
                        mark=tab.evaluate('video.currentTime')
                        tab.wait_for_function('t=>video.currentTime>t+.1',arg=mark)
                        assert tab.evaluate('video.currentSrc')==before
                        detail['toggleBurst']=100
                    if mode=='file':
                        tab.evaluate('P.jump(16)');tab.wait_for_function('video.currentTime>=4 && P.progress().startsWith("0:16")')
                        detail['aggregateSeek']=True
                    if mode=='quality':
                        tab.evaluate("P.panel('quality')")
                        assert tab.locator('.lockedTier,[data-act=verifyQuality]').count()==0
                        assert '未提供可用地址' not in tab.locator('#layer').inner_text()
                        tab.locator('[data-act=watchPick][data-id="16"]').click()
                        tab.wait_for_function('P.cur().quality==="16" && video.currentTime>.45 && document.querySelector("#mediaError").hidden',timeout=15000)
                        tab.evaluate('P.pref("dm",false)')
                        assert tab.locator('.comments').is_hidden()
                        detail.update({'manualQuality':16,'onlyAvailableQualities':True,'danmakuOff':True})
                    if mode=='queue':
                        tab.evaluate("P.panel('queue')")
                        assert tab.locator('[data-act=queuePlay]').count()==1
                        tab.locator('[data-act=queuePlay]').click()
                        tab.wait_for_function('P.cur().id==="next" && video.currentTime>.3')
                        detail['queueSelection']='next'
                    if mode=='stack':
                        base=len(tab.evaluate('P.stack()'))
                        for cycle in range(8):
                            tab.locator('[data-k=up]').click()
                            tab.wait_for_selector('[data-k=authorTab-video]')
                            tab.locator('[data-k=uploads-test-video]').click()
                            tab.wait_for_function("P.cur().type==='player'&&P.cur().id==='test-video'&&video.currentTime>.1&&!document.querySelector('#player').classList.contains('loading')&&document.querySelector('#mediaError').hidden")
                            tab.locator('[data-k=recommend]').click()
                            tab.wait_for_selector('[data-k=queue-next]')
                            assert tab.locator('.recDockGrid').evaluate('n=>new Set([...n.children].map(x=>x.offsetTop)).size')==1
                            assert tab.locator('.recDock').evaluate('n=>getComputedStyle(n).backgroundColor')=='rgba(0, 0, 0, 0)'
                            tab.locator('[data-k=queue-next]').click()
                            tab.wait_for_function("P.cur().id==='next'&&video.currentTime>.1&&!document.querySelector('#player').classList.contains('loading')&&document.querySelector('#mediaError').hidden")
                            assert len(tab.evaluate('P.stack()'))==base+(cycle+1)*3
                        unwound=0
                        while len(tab.evaluate('P.stack()'))>base:
                            stack=tab.evaluate('P.stack()');expected=stack[-2]
                            if stack[-1]['type']=='player':
                                tab.evaluate('P.reveal()');tab.keyboard.press('Escape')
                                assert len(tab.evaluate('P.stack()'))==len(stack)
                                assert tab.locator('#player').evaluate('n=>n.classList.contains("quiet")')
                            else:tab.locator('[data-k=authorTab-video]').focus()
                            tab.keyboard.press('Escape')
                            tab.wait_for_function('n=>P.stack().length===n',arg=len(stack)-1)
                            assert tab.evaluate('P.stack().at(-1)')==expected
                            if expected['type']=='player':tab.wait_for_function("video.currentTime>.1&&!document.querySelector('#player').classList.contains('loading')&&document.querySelector('#mediaError').hidden")
                            unwound+=1
                        tab.evaluate("P.panel('speed')")
                        assert tab.locator('.drawer>p').count()==0
                        detail.update({'authorRecommendationCycles':8,'unwoundPages':unwound,'backHidesHudBeforePop':True,'speedCaptionRemoved':True})
                    if mode=='ep':
                        tab.evaluate('P.pref("speed",1.5)')
                        assert tab.evaluate('video.playbackRate')==1.5
                        tab.evaluate('P.stop()')
                        assert tab.evaluate("P.history()['77:1'].epId")== '10'
                        detail.update({'rate':1.5,'episodeHistory':True})
                    results[mode]=detail
            except Exception:
                print(mode,tab.evaluate('({status:P.status(),error:document.getElementById("mediaError").innerText,time:video.currentTime,src:video.currentSrc,ready:video.readyState})'),errors[-5:],requests[-14:],flush=True);raise
            finally: tab.close()
        browser.close();srv.shutdown()
        assert not errors, errors
        assert any(name=='picture' and req for name,req in requests) and any(name=='sound' and req for name,req in requests)
        return {'source':'FFmpeg generated 320×180 test pattern and 500 Hz tone. Headless Chromium using actual V6 player module, offline deterministic service responses and local HTTP byte ranges.','cases':results,'pageErrors':errors}
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--out',type=Path);args=parser.parse_args()
    with tempfile.TemporaryDirectory() as tmp:result=run(Path(tmp))
    output=json.dumps(result,ensure_ascii=False,indent=2)
    if args.out:args.out.write_text(output+'\n')
    print(output)
