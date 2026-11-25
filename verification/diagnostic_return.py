"""Run the public entry without an account, using the UI to enter and exit local diagnostics."""
import argparse
import sys
from threading import Thread
from pathlib import Path
from playwright.sync_api import sync_playwright
from visual_acceptance import ROOT, launch_browser
sys.path.insert(0,str(ROOT/'tools'))
from dev_server import server

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--single-process',action='store_true')
    args=parser.parse_args()
    httpd=server(0)
    Thread(target=httpd.serve_forever,daemon=True).start()
    issues=[]
    try:
        with sync_playwright() as pw:
            browser=launch_browser(pw,args)
            pg=browser.new_page(viewport={'width':1440,'height':810})
            pg.on('pageerror',lambda e:issues.append(str(e)))
            pg.route('**/__bs/request',lambda route:route.fulfill(content_type='application/json',
                body='{"status":200,"body":"{\\"code\\":-101,\\"message\\":\\"guest\\"}","headers":{}}'))
            pg.goto(f'http://127.0.0.1:{httpd.server_port}/index.html')
            click=lambda k:pg.locator('[data-k="'+k+'"]').click()
            click('nav-mine');click('mine-settings')
            pg.locator('[data-k="sg-音视频进阶"]').focus()
            click('set-avDemo')
            pg.wait_for_url('**/*mode=demo*example=decoder*')
            pg.locator('#player:not([hidden])').wait_for()
            pg.wait_for_timeout(500)
            assert pg.evaluate('!!window.BS_READY && window.BS_MODE==="demo" && !window.BSApi')
            assert 'orbit' in pg.evaluate('history.state.pages[0].id')
            pg.keyboard.press('Escape')
            pg.wait_for_url('**/index.html')
            current=pg.locator('[data-k="set-avDemo"]')
            current.wait_for()
            assert pg.evaluate('window.BS_MODE')=='online'
            assert pg.evaluate('document.activeElement.dataset.k')=='set-avDemo'
            pg.keyboard.press('Escape')
            assert pg.evaluate('document.activeElement.dataset.k')=='sg-音视频进阶'
            pg.keyboard.press('Escape');pg.locator('[data-k="mine-guide"]').wait_for()
            click('mine-guide');click('status-demo');click('scenario-region-wall')
            pg.wait_for_url('**/*example=region-wall*')
            pg.locator('#view').get_by_text('地区',exact=False).first.wait_for()
            pg.keyboard.press('Escape')
            pg.wait_for_url('**/index.html')
            pg.locator('[data-k="scenario-region-wall"]').wait_for()
            browser.close()
        if issues:raise AssertionError(issues)
        print('PASS online → local decoder → original settings and focus; region example → guide; demo transport isolation')
    finally:
        httpd.shutdown();httpd.server_close()

if __name__=='__main__':main()
