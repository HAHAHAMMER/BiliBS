"""Measure actual decoded platform artwork in a fresh production Chromium page."""
import json
import os
from pathlib import Path
import shutil
import sys
import threading
from playwright.sync_api import sync_playwright

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from dev_server import server

def main():
    httpd=server(0)
    threading.Thread(target=httpd.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path=os.environ.get('BILIBS_CHROME') or shutil.which('chromium'),
                                      args=['--no-sandbox','--single-process','--no-zygote','--disable-gpu','--disable-dev-shm-usage'])
            try:
                page=browser.new_page(viewport={'width':1280,'height':720})
                page.goto(f'http://127.0.0.1:{httpd.server_port}/',wait_until='domcontentloaded')
                page.wait_for_function("""() => Array.from(document.images).some(i =>
                  new URL(i.src,location.origin).pathname.startsWith('/__bs/image/') && i.naturalWidth > 0)""",timeout=90000)
                # Give the first visible row time to finish even when the home feed
                # contains many images that Chromium schedules at a lower priority.
                page.wait_for_function("""() => {
                  const row = Array.from(document.images).filter(i=>i.src.includes('/__bs/image/')).slice(0,4);
                  return row.length>0 && row.every(i=>i.complete);
                }""",timeout=60000)
                sample=page.evaluate("""() => Array.from(document.images)
                  .filter(i=>new URL(i.src,location.origin).pathname.startsWith('/__bs/image/') && i.naturalWidth > 0)
                  .map(i=>({width:i.naturalWidth,height:i.naturalHeight}))""")
                print(json.dumps({'browser':browser.version,'decoded':len(sample),'sizes':sample[:8]}))
            finally:
                browser.close()
    finally:
        httpd.shutdown()
        httpd.server_close()

if __name__=='__main__':
    main()
