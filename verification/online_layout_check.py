"""Compare component rectangles between frozen V6 and the release online rendering path."""
import argparse
import base64
from datetime import datetime, timezone
from functools import partial
import hashlib
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright
from visual_acceptance import ROOT, Harness, launch_browser, MARK

HERE=Path(__file__).resolve().parent
# Route selection is the only test hook in either UI. All renderers, styles, focus,
# asynchronous personal/catalog services and the media element remain in use.
HOOK="""
window.layoutRoute=(route)=>{
  if(route.kind==='player'){
    startWatch(window.BS_MODE==='online'?'BV1xx411c7mD':'terrain');
    return;
  }
  pages=[{...route,scroll:0}]; render();
};
window.layoutStable=async()=>{
  if(current().type==='player'){video.pause();wake(false);updateControls();}
  else{view.scrollTop=0;}
  await document.fonts.ready;
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
};
"""
FIXTURE=(HERE/'discovery_fixture.js').read_text(encoding='utf-8')+"""
const base=window.BSApi.call;
const vid={...ugc('BV1xx411c7mD','布局测试'),aid:'27',cid:'201',cat:'知识',duration:18,
 pages:[{cid:'201',title:'第一段',duration:18}]};
const fill=(n,fn)=>Array.from({length:n},(_,i)=>fn(i));
BSApi.call=async(op,p={})=>{
 if(op==='nav')return {loggedIn:true,mid:'333',name:'测试用户'};
 if(['recommend','popular','weekly','region'].includes(op))
    return {items:fill(12,i=>i?{...vid,id:'BV'+(1000+i),bvid:'BV'+(1000+i),title:'测试视频 '+i}:vid),
      title:op==='weekly'?'本周精选':''};
 if(op==='catalog')return {items:fill(12,i=>season(p.kind,''+(ids[p.kind]+1+i),'测试影片 '+(i+1)))};
 if(op==='shelf')return {items:fill(15,i=>season(p.kind,''+(ids[p.kind]+1+i),'片架作品 '+(i+1)))};
 if(op==='history')return {items:[{...vid,kid:'archive_27',viewAt:321,progress:5}]};
 if(op==='video')return vid;
 if(op==='play'){
   await BSTransport.request({method:'GET',url:'https://api.bilibili.com/x/player/playurl'});
   return {quality:32,duration:18,format:'mp4',segments:[{url:'https://bilibs-media.invalid/clip',duration:18,format:'mp4'}]};
 }
 return base(op,p);
};
"""
BOUNDS="""selectors=>Object.fromEntries(Object.entries(selectors).map(([id,q])=>{
 const e=document.querySelector(q);
 if(!e || !e.getClientRects().length || e.closest('[hidden]'))return [id,null];
 const r=e.getBoundingClientRect();
 return [id,[r.x,r.y,r.width,r.height].map(x=>Math.round(x*100)/100)];
}))"""
def browse(root,tab,**extra):
    return {'type':'browse','root':root,'filter':tab,'focus':'nav-'+root,**extra}
def page(name,**extra):
    return {'type':'page','name':name,**extra}
CASES=[
    ('home',browse('home','rec'),'.opening img',{'hero':'.opening','heroArt':'.openingArt','firstCard':'[data-row="rec0"]','refresh':'[data-k="refresh"]'}),
    ('popular',browse('home','hot'),'.hotDuo section:nth-child(2) .rankLine',{'leftHeading':'.hotDuo section:first-child .boardHeading','rightHeading':'.hotDuo section:nth-child(2) .boardHeading','leftFirst':'.hotDuo section:first-child .rankLine','rightFirst':'.hotDuo section:nth-child(2) .rankLine'}),
    ('zones',browse('home','zones',cat='知识'),'[data-row="zoneVideo0"]',{'rail':'.zoneRail','firstChip':'[data-k="zone-知识"]','firstCard':'[data-row="zoneVideo0"]'}),
    ('cinema',browse('cinema','movie'),'.subWork',{'channels':'.cinChannels','movieTab':'[data-k="cinTab-movie"]','stage':'#cinStage','background':'.cinBackdrop','rail':'.cinRail','firstPick':'.cinPick','subTabs':'.channelBrowser .switches','subTile':'.subWork'}),
    ('library',browse('mine','overview'),'.libraryEntry',{'account':'[data-k="my-account"]','left':'.personalSide','right':'.personalLibrary','pair':'.libraryPair','anime':'.animeEntry','drama':'.dramaEntry'}),
    ('search',page('search',q='',focus='osk-A'),'[data-k="osk-A"]',{'field':'.searchBox','keyboard':'.keyPanel','keys':'.letterGrid','firstKey':'[data-k="osk-A"]','actions':'.letterOps','suggestions':'.typingDesk aside'}),
    ('shelf',page('shelf',filter='anime',focus='shelfTab-anime'),'.shelfCell.expanded',{'heading':'.shelfHeading','firstRow':'.denseRow','selected':'.shelfCell.expanded','neighbor':'.shelfCell:nth-child(2)','secondRow':'.denseRow:nth-of-type(2)'}),
    ('player',{'kind':'player'},'#hud',{'video':'#video','hud':'#hud','seek':'#seek','controls':'#pControls','toggle':'[data-k="toggle"]'})
]
TEXT_RUNS={'home':'.openingCopy strong','popular':'.hotDuo section:nth-child(2) .boardHeading small',
           'cinema':'.cinCopy h1','shelf':'.shelfCell.expanded .shelfLegend strong','player':'#pTitle'}
TEXT_BOUNDS="""q=>{
  const el=document.querySelector(q); if(!el)return null;
  const range=document.createRange();range.selectNodeContents(el);
  const r=range.getBoundingClientRect();
  return {glyphs:[...el.textContent].length,width:Math.round(r.width*100)/100,height:Math.round(r.height*100)/100};
}"""
def run(args):
    reference=ROOT/'baseline/UI-V6.html'; runtime=ROOT/'src/runtime.js'
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Harness,directory=str(ROOT)))
    server.overrides={}
    for key,path in [('/baseline/UI-V6.html',reference),('/src/runtime.js',runtime)]:
        source=path.read_text(encoding='utf-8')
        assert source.count(MARK)==1
        server.overrides[key]=source.replace(MARK,MARK+'\n'+HOOK).encode()
    Thread(target=server.serve_forever,daemon=True).start()
    fixture=json.loads((ROOT/'src/fixture-data.js').read_text(encoding='utf-8').removeprefix('window.BILIBS_FIXTURE=').strip().removesuffix(';'))
    clip=base64.b64decode(fixture['media']['terrain'].split(',')[1])
    art=next(iter(fixture['works'].values()))['wide']
    picture=base64.b64decode(art.split(',')[1])
    mime=art.split(';')[0].split(':')[1]
    origin=f'http://127.0.0.1:{server.server_port}'
    report={'utc':datetime.now(timezone.utc).isoformat(),'scope':'冻结 V6 对比正式入口的在线分支。目录、榜单、登录身份与片库使用受控服务返回；播放器使用同一份项目内 MP4，经本地测试媒体句柄实际解码。无私人账户，无平台写入。','unit':'CSS px [x,y,width,height]；delta 为在线减冻结稿。高度受记录数量影响的容器同时报告全部轴。','threshold':0.5,'baseline_sha256':hashlib.sha256(reference.read_bytes()).hexdigest(),'online_runtime_sha256':hashlib.sha256(runtime.read_bytes()).hexdigest(),'results':[],'text_runs':[],'errors':[]}
    try:
        with sync_playwright() as pw:
            br=launch_browser(pw,args)
            report['chromium']=br.version
            pg=br.new_page(device_scale_factor=1,locale='zh-CN')
            pg.on('pageerror',lambda e:report['errors'].append(str(e)))
            pg.route('**/src/services.js',lambda r:r.fulfill(content_type='application/javascript',body=FIXTURE))
            pg.route('**/__bs/image/**',lambda r:r.fulfill(content_type=mime,body=picture))
            token='controlledLocalMediaToken01'
            grant={'status':200,'body':'{}','headers':{},'media':{'https://bilibs-media.invalid/clip':token}}
            pg.route('**/__bs/request',lambda r:r.fulfill(json=grant))
            pg.route('**/__bs/media/'+token,lambda r:r.fulfill(content_type='video/mp4',body=clip))
            for size in args.sizes.split(','):
                width,height=map(int,size.split('x'))
                pg.set_viewport_size({'width':width,'height':height})
                stored={}; text_reference={}
                for variant,url in [('v6','/baseline/UI-V6.html'),('online','/index.html')]:
                    pg.goto(origin+url,wait_until='load',timeout=70000)
                    pg.wait_for_function("typeof layoutRoute==='function'")
                    if variant=='online':
                        assert pg.evaluate("BS_MODE==='online' && !window.BILIBS_FIXTURE")
                        pg.wait_for_function("BSPersonal.account?.mid==='333'")
                        pg.wait_for_selector('[data-k="rec-BV1xx411c7mD"]')
                    pg.add_style_tag(content='*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;scroll-behavior:auto!important}')
                    for name,route,ready,components in CASES:
                        pg.evaluate('r=>layoutRoute(r)',route)
                        pg.locator(ready).first.wait_for(state='attached',timeout=10000)
                        if name=='player':
                            pg.wait_for_function("document.getElementById('video').readyState>=2",timeout=15000)
                        pg.evaluate('layoutStable()')
                        boxes=pg.evaluate(BOUNDS,components)
                        if name in TEXT_RUNS:
                            run=pg.evaluate(TEXT_BOUNDS,TEXT_RUNS[name])
                            if variant=='v6': text_reference[name]=run
                            else:
                                old=text_reference[name]
                                if old and run:
                                    report['text_runs'].append({'viewport':size,'page':name,'v6':old,'online':run,
                                        'width_delta':round(run['width']-old['width'],2),'height_delta':round(run['height']-old['height'],2),
                                        'reason':'两条内容使用同一组件，显示的标题、榜单期名或所选作品文字不同。'})
                        if variant=='v6':
                            stored[name]=boxes
                            continue
                        for label,current in boxes.items():
                            original=stored[name][label]
                            delta=None if None in (original,current) else [round(y-x,2) for x,y in zip(original,current)]
                            axes='xywh'
                            used=delta or []
                            okay=bool(used) and max(map(abs,used))<=report['threshold']
                            why='两端组件外框一致。' if okay else '组件边界存在差异，需结合页面和文本实测复核。'
                            report['results'].append({'viewport':size,'page':name,'component':label,'v6':original,'online':current,'delta':delta,
                                                      'contract_axes':axes,'pass':okay,'reason':why})
            br.close()
    finally:
        server.shutdown()
        server.server_close()
        out=HERE/'evidence/online-layout.json'
        out.write_text(json.dumps(report,ensure_ascii=False,indent=1),encoding='utf-8')
    failed=[(r['viewport'],r['page'],r['component'],r['delta']) for r in report['results'] if not r['pass']]
    print('measured',len(report['results']),'failures',failed,'errors',report['errors'])
    return not failed and not report['errors']
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--single-process',action='store_true')
    p.add_argument('--sizes',default='1280x720,1440x810,1920x1080')
    raise SystemExit(0 if run(p.parse_args()) else 1)
