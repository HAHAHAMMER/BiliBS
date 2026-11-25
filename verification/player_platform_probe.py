"""Anonymous playback through the actual desktop gateway and UI. Never saves a CDN
address, response body, cookie or session handle. Requires FFmpeg-enabled Chromium.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import sys
import threading
import time

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from build_ui import assemble, INSERT
from dev_server import server

def run(chrome,live_only=False,watch_seconds=0):
    hook="""window.__bsReadOnlyProbe=async function(kind,id) {
      const live=kind==='liveRoom'||kind==='onAir',pgc=kind==='season';
      let detail;
      if(kind==='popular'||kind==='onAir'){
        const list=await BSApi.call(kind==='popular'?'popular':'liveRooms',kind==='popular'?{page:1}:{});
        const rows=kind==='popular'?list.items:list.items.filter(x=>x.liveStatus===1);
        detail=rows[Number(id)];
        if(!detail)throw new Error('当前列表没有可测试条目');
      }else detail=await BSApi.call(kind,live?{roomId:id}:pgc?{seasonId:id}:{bvid:id});
      const w=BSDiscovery.register(detail);
      startWatch(w.id,pgc?1:0,live?{room:w.id}:{});
      return {title:w.title,id:w.id};
    };"""
    code=assemble().replace(INSERT,hook+'\n'+INSERT)
    rows=[]
    with server(0) as httpd, sync_playwright() as pw:
        threading.Thread(target=httpd.serve_forever,daemon=True).start()
        browser=pw.chromium.launch(executable_path=chrome,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        candidates=[('liveRoom','4298064'),('onAir','1')] if live_only else [('popular','0'),('popular','1'),('popular','2'),('video','BV1jJs16WEfE'),('season','33981'),('season','46089'),('onAir','0'),('liveRoom','616')]
        if watch_seconds:candidates=[('popular','0')]
        for op,id in candidates:
            tab=browser.new_page();tab.route('**/src/runtime.js',lambda route:route.fulfill(body=code,content_type='text/javascript'))
            # Histories strictly local: new anonymous browser context for every item.
            errors=[];media=[]
            tab.on('pageerror',lambda e:errors.append(type(e).__name__))
            tab.on('response',lambda r:media.append(r.status) if '/__bs/media/' in r.url else None)
            row={'operation':op,'id':id}
            try:
                tab.goto('http://127.0.0.1:'+str(httpd.server_port)+'/',wait_until='domcontentloaded')
                deadline=time.monotonic()+15
                while not tab.evaluate('typeof window.__bsReadOnlyProbe==="function"'):
                    if time.monotonic()>=deadline:raise RuntimeError('应用未初始化')
                    time.sleep(.15)
                row.update(tab.evaluate('async ([k,id])=>await __bsReadOnlyProbe(k,id)',[op,id]))
                deadline=time.monotonic()+(85 if live_only else 45)
                while not tab.evaluate("""()=>{const v=document.getElementById('video');return !document.getElementById('mediaError').hidden || (v.currentTime>1 && v.getVideoPlaybackQuality().totalVideoFrames>0 && v.webkitAudioDecodedByteCount>0)}"""):
                    if time.monotonic()>=deadline:
                        row['observationWindowEnded']=True
                        break
                    time.sleep(.3)
                row.update(tab.evaluate("""()=>{const v=document.getElementById('video'),e=document.getElementById('mediaError');return {status:document.getElementById('pKind').innerText,time:v.currentTime,videoFrames:v.getVideoPlaybackQuality().totalVideoFrames,audioBytes:v.webkitAudioDecodedByteCount||0,error:e.hidden?null:e.innerText}}"""))
                if watch_seconds and row['videoFrames']>0 and row['audioBytes']>0:
                    samples=[]
                    start=time.monotonic()
                    for second in range(0,watch_seconds+1,5):
                        time.sleep(max(0,start+second-time.monotonic()))
                        sample=tab.evaluate("""()=>{const v=document.getElementById('video');const q=v.getVideoPlaybackQuality();return {position:v.currentTime,videoFrames:q.totalVideoFrames,droppedFrames:q.droppedVideoFrames,audioDecodedBytes:v.webkitAudioDecodedByteCount,readyState:v.readyState,paused:v.paused}}""")
                        samples.append({'elapsed':round(time.monotonic()-start,2),**sample})
                    row['sustainedSamples']=samples
                if row['videoFrames']>0 and row['audioBytes']>0:
                    previous=row['videoFrames']
                    deadline=time.monotonic()+8
                    while time.monotonic()<deadline:
                        advance=tab.evaluate("document.getElementById('video').getVideoPlaybackQuality().totalVideoFrames")-previous
                        if advance>=3: break
                        time.sleep(.4)
                    row['furtherRenderedFrames']=advance
            except Exception as e:
                row['status']='无法打开播放入口'
                row['detail']=str(e).split('\n')[0][:160]
            row['mediaHttpStatuses']=sorted(set(media));row['pageErrors']=errors
            rows.append(row); print(op, {k:v for k,v in row.items() if k!='title'},flush=True);tab.close()
        browser.close();httpd.shutdown()
    return {'checkedAt':datetime.now(timezone.utc).isoformat(),'scope':'Anonymous gateway + production player; each item independently observed, no account or writes.','rows':rows}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path);p.add_argument('--live-only',action='store_true');p.add_argument('--watch-seconds',type=int,choices=[30,60],default=0);args=p.parse_args()
    result=run(os.getenv('BILIBS_CHROME') or shutil.which('chromium'),args.live_only,args.watch_seconds); rendered=json.dumps(result,ensure_ascii=False,indent=2)
    if args.out:args.out.write_text(rendered+'\n',encoding='utf-8')
    else:print(rendered)
