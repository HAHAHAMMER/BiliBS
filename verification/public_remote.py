"""Black-box, anonymous smoke test of a user-visible remote-control journey.

The card selected can change. The report distinguishes a playable item from a
legitimate platform denial; the runner never retries alternate identities.
"""
from datetime import datetime,timezone
import json
from pathlib import Path
import sys
import time
from threading import Thread
from types import SimpleNamespace
from playwright.sync_api import sync_playwright
from visual_acceptance import ROOT,launch_browser
sys.path.insert(0,str(ROOT/'tools'))
from dev_server import server

def main():
    sv=server(0)
    Thread(target=sv.serve_forever,daemon=True).start()
    out={'utc':datetime.now(timezone.utc).isoformat(),'scope':'真实首页/热门、真实遥控事件、无注入页面函数、匿名只读','steps':[],'errors':[]}
    try:
        with sync_playwright() as pw:
            br=launch_browser(pw,SimpleNamespace(single_process=True))
            pg=br.new_page(viewport={'width':1440,'height':810},locale='zh-CN')
            pg.on('pageerror',lambda err:out['errors'].append(str(err)))
            pg.goto(f'http://127.0.0.1:{sv.server_port}/',wait_until='domcontentloaded')
            key=lambda:pg.evaluate('document.activeElement.dataset.k||""')
            def press(button):
                pg.keyboard.press(button);pg.wait_for_timeout(100)
                out['steps'].append({'key':button,'focus':key()})
            pg.locator('.openingArt img').wait_for(timeout=60000)
            pg.locator('[data-row="rec0"]').first.wait_for(timeout=60000)
            if key()!='hero-primary':raise AssertionError(key())
            press('ArrowRight')
            if key()!='hero-primary':raise AssertionError(key())
            press('ArrowDown')
            if not key().startswith('rec-'):raise AssertionError(key())
            press('ArrowUp');press('ArrowUp');press('ArrowRight')
            pg.locator('.hotDuo section').first.locator('.rankLine').first.wait_for(timeout=60000)
            press('ArrowDown')
            selected=key()
            if not selected.startswith('hot-'):raise AssertionError(selected)
            press('Enter')
            pg.locator('#player:not([hidden])').wait_for(timeout=6000)
            end=time.monotonic()+45
            while True:
                state=pg.evaluate("""() => {
                 const v=document.querySelector('#video'); const e=document.querySelector('#mediaError');
                 return {frames:v.getVideoPlaybackQuality().totalVideoFrames,time:v.currentTime,
                  audio:v.webkitAudioDecodedByteCount||0,error:e&&!e.hidden?e.innerText:null};
                }""")
                if state['frames']>0 and state['audio']>0 or state['error'] or time.monotonic()>=end:break
                pg.wait_for_timeout(250)
            out['player']=state
            press('Escape')
            pg.locator('.hotDuo').wait_for(timeout=10000)
            out['focus_restored']=key()==selected
            br.close()
    finally:
        sv.shutdown();sv.server_close()
        path=ROOT/'verification/evidence/public-remote.json'
        path.write_text(json.dumps(out,ensure_ascii=False,indent=1),encoding='utf-8')
    if not out.get('focus_restored') or out['errors']:raise SystemExit(1)
    print('Public remote journey finished',out['player'],'focus restored',out['focus_restored'])
if __name__=='__main__':main()
