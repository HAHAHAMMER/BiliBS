"""Isolated Chromium profiles, only loopback HTTP, no platform account required."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
from io import BytesIO
import json,shutil,os,re,sys,datetime,hashlib
from playwright.sync_api import sync_playwright
from PIL import Image,ImageChops
here=Path(__file__).resolve().parent;root=here.parent
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def main():
 srv=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(root)));Thread(target=srv.serve_forever,daemon=True).start()
 base=f'http://127.0.0.1:{srv.server_port}';out={'date':datetime.datetime.now(datetime.timezone.utc).isoformat()};errors=[]
 with sync_playwright() as pw:
  path=os.environ.get('BILIBS_CHROME') or shutil.which('chromium') or shutil.which('chrome')
  launch={'headless':True,'args':['--autoplay-policy=no-user-gesture-required','--disable-dev-shm-usage']}
  if path:launch['executable_path']=path
  br=pw.chromium.launch(**launch);out['browser']=br.version
  try:
   for filename in ['journeys.js','component-checks.js']:
    ctx=br.new_context(viewport={'width':1440,'height':810},locale='zh-CN');pg=ctx.new_page();pg.on('pageerror',lambda err:errors.append(str(err)))
    code=(root/'src/app.js').read_text(encoding='utf-8').replace("history.scrollRestoration='manual';stamp();render();","history.scrollRestoration='manual';stamp();render();"+(here/filename).read_text(encoding='utf-8'))
    pg.route('**/src/app.js',lambda route:route.fulfill(status=200,content_type='text/javascript; charset=utf-8',body=code))
    pg.goto(base+'/index.html');pg.wait_for_selector('[data-k="hero-primary"]',state='attached')
    if filename=='journeys.js':
     pg.wait_for_function("document.querySelector('#qa') && /全部通过|失败 /.test(document.querySelector('#qa').textContent)",timeout=65000)
     out['journeys']=pg.locator('#qa').inner_text().splitlines()
    else:out['components']=pg.evaluate('window.runSpecChecks()')
    ctx.close()
   visual=[]
   for size in [(1280,720),(1920,1080)]:
    imgs=[];geos=[]
    for loc in ['/baseline/UI-V6.html','/index.html']:
     ctx=br.new_context(viewport={'width':size[0],'height':size[1]},device_scale_factor=1,locale='zh-CN');pg=ctx.new_page();pg.goto(base+loc);pg.wait_for_selector('.opening')
     pg.evaluate('Promise.all(Array.from(document.images).filter(x=>x.isConnected).map(x=>x.decode().catch(()=>null)))')
     pg.add_style_tag(content='.brand,.time{visibility:hidden!important}')
     im=Image.open(BytesIO(pg.screenshot())).convert('RGB');imgs.append(im)
     geos.append(pg.locator('.opening').bounding_box());ctx.close()
    diff=ImageChops.difference(*imgs);gray=diff.convert('L');changed=sum(gray.histogram()[4:])
    visual.append({'viewport':size,'hero_rects':geos,'pixels_delta_gt_3':changed,'total_pixels':size[0]*size[1],'masks':'仅页首品牌、时钟；首页默认状态'})
   out['visual']=visual
  finally:br.close();srv.shutdown()
 out['page_errors']=errors
 (here/'evidence/browser.json').write_text(json.dumps(out,ensure_ascii=False,indent=1),encoding='utf-8')
 print('browser',out['browser'],'component failures',[(r['id'],r['observed']) for r in out['components'] if not r['pass']],'journeys',out['journeys'][-2:],'visual',out['visual'],'errors',errors[:3])
if __name__=='__main__':main()
