"""Replay specification assertions and remote-control journeys against the assembled app."""
import argparse
import json
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
from visual_acceptance import ROOT, Harness, instrument, launch_browser

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--single-process',action='store_true')
    args=parser.parse_args()
    srv=ThreadingHTTPServer(('127.0.0.1',0),partial(Harness,directory=str(ROOT)))
    Thread(target=srv.serve_forever,daemon=True).start()
    out={'utc':datetime.now(timezone.utc).isoformat(),'scope':'冻结数据独立账号，集成产物，真实浏览器、媒体解码与 DOM 方向键','errors':[]}
    try:
        with sync_playwright() as pw:
            for script in ['component-checks.js','journeys.js']:
                hook=(ROOT/'verification'/script).read_text(encoding='utf-8')
                if script=='journeys.js':
                    # The release entry loads its dataset asynchronously. Invoke the existing
                    # suite as soon as installation completes, even when load already fired.
                    hook=hook.replace("window.addEventListener('load',async()=>{","(async()=>{",1).rstrip().removesuffix('});')+'})();'
                srv.overrides=instrument(ROOT,hook)
                b=launch_browser(pw,args)
                try:
                    pg=b.new_page(viewport={'width':1440,'height':810},locale='zh-CN')
                    pg.on('pageerror',lambda e:out['errors'].append(str(e)))
                    pg.goto(f'http://127.0.0.1:{srv.server_port}/index.html?mode=demo',wait_until='load')
                    if script=='component-checks.js':
                        pg.wait_for_function('typeof runSpecChecks==="function"')
                        out['components']=pg.evaluate('runSpecChecks()')
                    else:
                        pg.wait_for_function("document.querySelector('#qa') && /全部通过|失败 /.test(document.querySelector('#qa').textContent)",timeout=80000)
                        out['journeys']=pg.locator('#qa').inner_text().splitlines()
                    out['browser']=b.version
                finally:b.close()
    finally:
        srv.shutdown()
        (ROOT/'verification/evidence/interaction.json').write_text(json.dumps(out,ensure_ascii=False,indent=1),encoding='utf-8')
    print('components',len(out['components']),'failed',[r['id'] for r in out['components'] if not r['pass']],'journeys',sum(x.startswith('✓') for x in out['journeys']),out['journeys'][-1],'exceptions',out['errors'])
    if out['errors'] or any(not r['pass'] for r in out['components']) or out['journeys'][-1]!='全部通过':raise SystemExit(1)
if __name__=='__main__':main()
