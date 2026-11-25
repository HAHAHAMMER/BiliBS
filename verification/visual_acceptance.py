"""Compare lossless Chromium screenshots on the same device, font stack, demo content and frame.

Typical invocation: BILIBS_CHROME=/path/to/chrome-headless-shell python verification/visual_acceptance.py
Use --single-process when the headless shell is running without graphics hardware.
"""
import argparse
import base64
import hashlib
import json
import os
import shutil
import subprocess
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import math
from threading import Thread
from datetime import datetime, timezone
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
MARK = "history.scrollRestoration='manual';stamp();render();"
HOOK = """
window.__designState=async function(config){
 const {route, panel}=config;
 document.getElementById('testStill')?.remove();
 if(overlay){overlay=null;modal.hidden=true;modal.textContent='';$('shell').inert=false;player.inert=false;}
 stopShelfPreview();stopEpisodePreview();stopWatch();clearTimeout(hudTimer);cancelCountdown();
 progress={'46089:1':{ep:1,t:7,d:18,recent:Date.now()-4200000},'terrain:0':{ep:0,t:8,d:22,recent:Date.now()-90000000}};
 if(route.name==='shelf'){gallery[route.filter]=0;}
 pages=[{scroll:0,...(route.type==='player'?{at:4,restorePaused:true}:{}),...route}];render();
 if(route.type==='player'){
   const start=performance.now();
   while(video.readyState<2 && performance.now()-start<4000)await new Promise(r=>setTimeout(r,20));
   video.pause();
   if(video.readyState>=2 && Math.abs(video.currentTime-4)>.03){
    await new Promise(resolve=>{const done=()=>{clearTimeout(timer);video.removeEventListener('seeked',done);resolve()};
     const timer=setTimeout(done,1600);video.addEventListener('seeked',done);video.currentTime=4;});
   }
   updateControls();updateProgress();paintComments();wake(false);
   if(panel)openOverlay('watch',{mode:panel});
   // The controls remain live. Pin only the moving film surface to the actual
   // fourth-second image so the compositor cannot screenshot a stale GPU frame.
   const still=document.createElement('img'), cs=getComputedStyle(video);
   still.id='testStill';still.alt='';still.src='/frame-'+mediaId(route)+'.png';
   for(const k of ['position','inset','width','height','objectFit','zIndex','backgroundColor'])
     still.style[k]=cs[k];
   video.after(still);
 }
 // Posters and selected stills have a separate visual test from the moving previews.
 stopShelfPreview();stopEpisodePreview();await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));
 await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 return {focus:document.activeElement?.dataset.k||'',surface:document.body.dataset.surface};
}
"""
CLOCK = """const ActualDate=Date;const fixed=ActualDate.UTC(2026,10,23,10,20);
 Date=class extends ActualDate{constructor(...a){super(...(a.length?a:[fixed]))}static now(){return fixed}};
 Math.random=()=>.25;"""
NORMALIZE = """() => {
 for(const n of document.querySelectorAll('.brand span,.aboutBrand span'))if(n.textContent==='BS')n.textContent='TV';
 for(const n of document.querySelectorAll('#tv *')){
  for(const t of n.childNodes)if(t.nodeType===3 && t.textContent.includes('BiliBS'))t.textContent=t.textContent.replaceAll('BiliBS','BiliTV');
 }
 const strap=document.querySelector('.aboutIdentity .eyeline');if(strap)strap.textContent='第六稿 · 电视端交互设计';
}"""
# One page instance per build and size; HTTP instrumentation exists only in the test server.
class Harness(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def do_GET(self):
        key = self.path.split('?')[0]
        body = self.server.overrides.get(key)
        if body is None:
            return super().do_GET()
        self.send_response(200)
        self.send_header('Content-Type', 'image/png' if key.endswith('.png') else ('text/html' if key.endswith('html') else 'text/javascript')+'; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)

def instrument(root, hook, source=None):
    files = [('/src/runtime.js', source or (root/'src/runtime.js'))]
    if hook == HOOK:
        files.append(('/baseline/UI-V6.html', root/'baseline/UI-V6.html'))
    result = {}
    for url, path in files:
        code=path.read_text(encoding='utf-8')
        if code.count(MARK)!=1:
            raise AssertionError(f'invalid initialization block in {path}')
        result[url]=code.replace(MARK, MARK+'\n'+hook).encode()
    return result

def launch_browser(pw, args):
    path=os.environ.get('BILIBS_CHROME') or shutil.which('chromium')
    flags=['--autoplay-policy=no-user-gesture-required','--disable-dev-shm-usage']
    if args.single_process:
        flags+=['--single-process','--no-zygote','--disable-gpu']
    return pw.chromium.launch(headless=True,executable_path=path,args=flags)

def fourth_second_frames():
    text=(ROOT/'src/fixture-data.js').read_text(encoding='utf-8')
    bank=json.loads(text[text.index('{'):text.rindex('}')+1])['media']
    frames={}
    for key in ['terrain','46089']:
        video=base64.b64decode(bank[key].split(',',1)[1])
        args=['ffmpeg','-v','error','-i','pipe:0','-ss','4','-frames:v','1','-f','image2pipe','-vcodec','png','pipe:1']
        frame=subprocess.run(args,input=video,check=True,stdout=subprocess.PIPE).stdout
        if not frame.startswith(b'\x89PNG'):
            raise ValueError(f'No fourth-second video frame for {key}')
        frames['/frame-'+key+'.png']=frame
    return frames

def cases():
    def root(name,tab,focus,**rest):
        return {'type':'browse','root':name,'filter':tab,'focus':focus,**rest}
    def page(name,**rest):
        return {'type':'page','name':name,**rest}
    out=[('home-hero',root('home','rec','hero-primary')),('home-cards',root('home','rec','rec-keys')),
         ('popular',root('home','hot','homeTab-hot')),('zones',root('home','zones','zone-知识',cat='知识')),
         ('live',root('home','live','homeTab-live')),('feed',root('feed','all','creator-all')),
         ('feed-posts',root('feed','post','feedTab-post')),('mine',root('mine','overview','mine-shelfA')),
         ('mine-account',root('mine','overview','my-account'))]
    for k in ('movie','drama','anime','doc','variety','commentary'):
        out.append(('cinema-'+k,root('cinema',k,'cinTab-'+k)))
    for k in ('anime','drama'):
        out.append(('shelf-'+k,page('shelf',filter=k,focus='s-'+('46089' if k=='anime' else '33981'))))
    out += [('cinema-sub',root('cinema','drama','channelSub-cn',channelSub='cn')),('search',page('search',q='',focus='osk-A')),
        ('results',page('results',q='预告',tab='video',sort='最多播放',focus='sort-最多播放')),
        ('detail',{'type':'detail','id':'46089','ep':1,'focus':'feature'}),
        ('catalog',page('catalog',kind='movie')),('ranking',page('ranking',kind='drama')),
        ('history',page('history')),('folders',page('folders')),('likes',page('likes')),
        ('later',page('later')),('follows',page('follows')),('account',page('account')),
        ('login',page('login',pair=0,exp=1795429320000)),('settings',page('settings',group='显示')),
        ('settings-av',page('settings',group='音视频进阶',focus='sg-音视频进阶')),('guide',page('guide')),('about',page('about')),
        ('permission',{'type':'detail','id':'48416','wall':'region-wall','focus':'feature'})]
    states=[(label,{'route':route}) for label,route in out]
    for label,id,panel in [('player','terrain',None),('player-episodes','46089','episodes'),('player-queue','terrain','queue'),('player-settings','terrain','settings')]:
        states.append((label,{'route':{'type':'player','id':id,'ep':1,'queue':['terrain','orbit'],'focus':'seek'},'panel':panel}))
    return states

GEOMETRY = """() => Array.from(document.querySelectorAll('[data-k],#tv,#view,.opening,.channelBrowser,.denseRow,.episodePreview,#hud'))
 .filter(n=>n.getClientRects().length&&!n.closest('[hidden]')).map(n=>{
 const r=n.getBoundingClientRect();return [n.dataset.k||n.id||n.className,...[r.x,r.y,r.width,r.height].map(v=>Math.round(v*100)/100)];
 })"""

def measure(a,b):
    x=Image.open(BytesIO(a)).convert('RGB');y=Image.open(BytesIO(b)).convert('RGB')
    diff=ImageChops.difference(x,y)
    r,g,b=diff.split();hist=ImageChops.lighter(ImageChops.lighter(r,g),b).histogram()
    mse=sum(sum(value*value*n for value,n in enumerate(ch.histogram())) for ch in diff.split())/(x.width*x.height*3)
    return {'changed':sum(hist[1:]),'over3':sum(hist[4:]),'over8':sum(hist[9:]),'max':max(i for i,n in enumerate(hist) if n),'rms':round(math.sqrt(mse),5)}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--single-process',action='store_true')
    parser.add_argument('--source',type=Path,help=argparse.SUPPRESS)
    parser.add_argument('--sizes',default='1280x720,1440x810,1920x1080')
    parser.add_argument('--evidence',type=Path,default=ROOT/'verification/evidence/visual.json')
    args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Harness,directory=str(ROOT)))
    server.overrides=instrument(ROOT,HOOK,args.source)
    server.overrides.update(fourth_second_frames())
    Thread(target=server.serve_forever,daemon=True).start()
    # Normalize exactly the visible branding in a dedicated test route BEFORE
    # first layout, so that changing the logo cannot move an unrelated focus key.
    def brand(t):
        return t.replace('<span>BS</span>','<span>TV</span>').replace('BiliBS','BiliTV').replace('Bili Big Screen · B站大屏幕版','第六稿 · 电视端交互设计')
    server.overrides['/norm.html']=brand((ROOT/'index.html').read_text(encoding='utf-8')).replace('src/boot.js','src/norm-boot.js').encode()
    server.overrides['/src/norm-boot.js']=(ROOT/'src/boot.js').read_text(encoding='utf-8').replace('src/runtime.js','src/norm-runtime.js').encode()
    server.overrides['/src/norm-runtime.js']=brand(server.overrides['/src/runtime.js'].decode()).encode()
    urls={'reference':'/baseline/UI-V6.html','raw':'/index.html?mode=demo','normalized':'/norm.html?mode=demo'}
    info={'utc':datetime.now(timezone.utc).isoformat(),'scope':'相同内容、系统字体与媒体帧，冻结 UI 对照。归一化仅恢复旧品牌名称和关于页品牌副题。','criteria':'控件边界及焦点完全相同；RGB 均方根差不超过 1/255；最大通道差超过 8 的像素最多占千分之一。原始逐像素结果同时保留。','baseline_sha256':hashlib.sha256((ROOT/'baseline/UI-V6.html').read_bytes()).hexdigest(),'application_sha256':hashlib.sha256((args.source or ROOT/'src/runtime.js').read_bytes()).hexdigest(),'results':[], 'errors':[]}
    try:
        with sync_playwright() as pw, TemporaryDirectory() as scratch:
            scratch=Path(scratch)
            browser=launch_browser(pw,args)
            info['engine']=browser.version
            pg=browser.new_page(device_scale_factor=1,locale='zh-CN',timezone_id='Asia/Shanghai')
            pg.on('pageerror',lambda e:info['errors'].append(str(e)))
            pg.add_init_script(CLOCK)
            records={}
            for variant,url in urls.items():
                for size in args.sizes.split(','):
                    width,height=map(int,size.split('x'))
                    pg.set_viewport_size({'width':width,'height':height})
                    pg.goto(f'http://127.0.0.1:{server.server_port}'+url,wait_until='load',timeout=65000)
                    pg.wait_for_function("typeof window.__designState==='function'")
                    pg.add_style_tag(content='*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;scroll-behavior:auto!important}')
                    for name,state in cases():
                        current=pg.evaluate('state=>window.__designState(state)',state)
                        geom=pg.evaluate(GEOMETRY)
                        png=pg.screenshot()
                        sample=scratch/(size+'-'+name+'.png')
                        key=size+'/'+name
                        if variant=='reference':
                            sample.write_bytes(png)
                            records[key]={'size':size,'page':name,'total':width*height,'focus':current['focus'],'geometry':geom,'visible_boxes':len(geom)}
                        else:
                            row=records[key]
                            result=measure(sample.read_bytes(),png)
                            row['raw' if variant=='raw' else 'brand_normalized']=result
                            if variant=='normalized':
                                row['focus_equal']=row['focus']==current['focus']
                                row['geometry_equal']=row.pop('geometry')==geom
                                row['pass']=row['focus_equal'] and row['geometry_equal'] and result['rms']<=1 and result['over8']<=row['total']*.001
                                if not row['pass']:print(key,'difference',row,flush=True)
                    print(variant,size,'captured',len(cases()),flush=True)
            info['results']=list(records.values())
            browser.close()
    finally:
        server.shutdown()
        args.evidence.write_text(json.dumps(info,ensure_ascii=False,indent=1),encoding='utf-8')
    exact=sum(x['brand_normalized']['changed']==0 for x in info['results'])
    print('exact',exact,'/',len(info['results']),'javascript errors',len(info['errors']))
    if info['errors'] or any(not row['pass'] for row in info['results']):
        raise SystemExit(1)
if __name__=='__main__':main()
