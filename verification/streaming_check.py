"""Check production incremental lists, recommendation retention and D-pad work."""
import json
import os
from pathlib import Path
import subprocess
from threading import Thread
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright
from discovery_check import ROOT, Quiet, MOCK
from build_ui import assemble


def run():
    fixture=MOCK+'\n'+(ROOT/'verification/streaming_fixture.js').read_text(encoding='utf-8')
    http=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
    Thread(target=http.serve_forever,daemon=True).start()
    old=subprocess.run(['git','show','58a826e:src/runtime.js'],cwd=ROOT,capture_output=True)
    baseline=old.stdout.decode('utf-8') if old.returncode==0 else None
    png=__import__('base64').b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV1sAAAAASUVORK5CYII=')
    result={'feeds':{},'errors':[]}
    with sync_playwright() as pw:
        br=pw.chromium.launch(executable_path=os.environ.get('BILIBS_CHROME'),args=['--autoplay-policy=no-user-gesture-required'])
        def page(script=None,large=False):
            pg=br.new_page(viewport={'width':1440,'height':810})
            pg.on('pageerror',lambda e:result['errors'].append(str(e)))
            pg.route('**/src/services.js',lambda r:r.fulfill(content_type='text/javascript',body=fixture))
            pg.route('**/src/runtime.js',lambda r:r.fulfill(content_type='text/javascript',body=script or assemble()))
            pg.route('**/__bs/image/**',lambda r:r.fulfill(content_type='image/png',body=png))
            pg.goto(f'http://127.0.0.1:{http.server_port}/'+('?large=1' if large else ''))
            pg.wait_for_function('window.BSPersonal?.account?.mid==="9"')
            pg.wait_for_selector('#view .tile')
            return pg
        pg=page()
        ids=pg.locator('#view .tile').evaluate_all('a=>a.map(n=>n.dataset.id)')
        calls=pg.evaluate('streamTest.calls.filter(x=>x.op==="recommend").length')
        pg.locator('#view .tile').first.click()
        pg.wait_for_selector('#mediaError:visible')
        pg.evaluate("Date.now=()=>new Date().getTime()+3600000;BSDiscovery.invalidate('recommend')")
        pg.keyboard.press('Escape');pg.keyboard.press('Escape')
        pg.wait_for_selector('#view .tile')
        assert pg.locator('#view .tile').evaluate_all('a=>a.map(n=>n.dataset.id)')==ids
        assert pg.evaluate('streamTest.calls.filter(x=>x.op==="recommend").length')==calls
        pg.evaluate('window.firstCard=document.querySelector("#view .tile")')
        pg.locator('#view .tile').last.focus();pg.keyboard.press('ArrowDown')
        pg.wait_for_function('document.querySelectorAll("#view .tile").length>20')
        assert pg.evaluate('firstCard===document.querySelector("#view .tile")')
        result['recommendations']={'hourLaterAndEvictedCacheRestored':True,'originalNodeRetainedOnAppend':True}
        pg.close()
        for mode in ('all','video','post','room'):
            pg=page();pg.locator('[data-k=nav-feed]').focus()
            pg.locator('[data-k=feedTab-'+mode+']').focus()
            pg.wait_for_function('document.querySelectorAll(".feedGrid>.feedCard").length>0')
            assert not pg.locator('#view [data-act=personalMore]').count()
            if mode!='all':assert set(pg.locator('.feedType').all_text_contents())=={{'video':'视频','post':'图文','room':'直播'}[mode]}
            pg.evaluate('window.firstFeed=document.querySelector(".feedCard");streamTest.hold=true')
            last=pg.locator('.feedCard').last;key=last.get_attribute('data-k');last.focus();pg.keyboard.press('ArrowDown')
            pg.wait_for_function('typeof streamTest.release==="function"')
            count=pg.locator('.feedCard').count();pg.evaluate('streamTest.release()')
            pg.wait_for_function('n=>document.querySelectorAll(".feedCard").length>n',arg=count)
            assert pg.evaluate('firstFeed===document.querySelector(".feedCard")')
            assert pg.evaluate('document.activeElement.dataset.k')==key
            for _ in range(8):
                if pg.evaluate('streamTest.calls.some(x=>x.op==="feed"&&x.offset==="5")'):break
                pg.locator('.feedCard').last.focus();pg.keyboard.press('ArrowDown');pg.wait_for_timeout(100)
            pg.wait_for_function('streamTest.calls.some(x=>x.op==="feed"&&x.offset==="5")')
            pg.wait_for_timeout(100)
            before=pg.evaluate('streamTest.calls.filter(x=>x.op==="feed").length')
            pg.locator('.feedCard').last.focus();pg.keyboard.press('ArrowDown');pg.wait_for_timeout(100)
            assert pg.evaluate('streamTest.calls.filter(x=>x.op==="feed").length')==before
            result['feeds'][mode]={'cards':pg.locator('.feedCard').count(),'endStops':True,'stableFocus':True,'appendKeepsNodes':True}
            pg.close()
        bench='''async()=>{
          await document.fonts.ready;
          document.querySelector('#view .tile').focus({preventScroll:true});
          const d=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'offsetWidth');let reads=0;
          Object.defineProperty(HTMLElement.prototype,'offsetWidth',{configurable:true,get(){reads++;return d.get.call(this)}});
          const times=[];
          for(let i=0;i<120;i++){const t=performance.now();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:i%2?'ArrowLeft':'ArrowRight',bubbles:true,cancelable:true}));times.push(performance.now()-t)}
          Object.defineProperty(HTMLElement.prototype,'offsetWidth',d);times.sort((a,b)=>a-b);
          return {cards:document.querySelectorAll('#view .tile').length,widthReads:reads,p95:times[114],max:times[119]};
        }'''
        for name,script in [('baseline',baseline),('current',assemble())]:
            if script is None:continue  # Source archives and shallow clones have no baseline commit.
            pg=page(script,True);result[name]=pg.evaluate(bench);pg.close()
        if baseline:assert result['current']['widthReads']<result['baseline']['widthReads']/5,result
        assert result['current']['widthReads']<1000,result
        assert result['current']['p95']<32,result
        assert not result['errors'],result['errors']
        br.close()
    http.shutdown();http.server_close()
    return result


if __name__=='__main__':
    result=run();(ROOT/'verification/evidence/nov28-streaming.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
