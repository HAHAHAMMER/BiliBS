"""Exercise the live-data UI and V6 input paths against a controlled service in Chromium."""
import argparse
import base64
from datetime import datetime, timezone
import json
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import shutil
import sys
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from build_ui import assemble


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


MOCK = (ROOT / "verification/discovery_fixture.js").read_text(encoding="utf-8")


def launch_browser(pw):
    return pw.chromium.launch(headless=True,
        executable_path=os.getenv("BILIBS_CHROME") or shutil.which("chromium"),
        args=[*([] if os.name=="nt" else ["--single-process","--no-zygote"]),"--disable-gpu","--disable-dev-shm-usage","--autoplay-policy=no-user-gesture-required"])


def live_art():
    from dev_server import server
    with server(0) as http, sync_playwright() as pw:
        Thread(target=http.serve_forever,daemon=True).start()
        br=launch_browser(pw)
        try:
            pg=br.new_page(viewport={"width":1440,"height":810})
            script=assemble()
            pg.route("**/src/runtime.js",lambda r:r.fulfill(content_type="application/javascript",body=script))
            errors=[]
            pg.on("pageerror",lambda e:errors.append(str(e)))
            pg.goto(f"http://127.0.0.1:{http.server_port}/",wait_until="domcontentloaded")
            results={}
            for screen,(selector,cards) in {"home":(".opening img",".tile img"),"cinema":(".cinBackdrop img",".cinRail img")}.items():
                if screen=="cinema":
                    pg.locator("[data-k=nav-cinema]").focus(timeout=5000)
                end=time.monotonic()+55
                first_picture=None
                while True:
                    record=pg.evaluate("""([selector,cards])=>{
                      const large=document.querySelector(selector), thumbnails=[...document.querySelectorAll(cards)];
                      const first=thumbnails.find(i=>i.naturalWidth>0);
                      return {hero:[large?.naturalWidth||0,large?.naturalHeight||0],card:[first?.naturalWidth||0,first?.naturalHeight||0],
                        fit:large?getComputedStyle(large).objectFit:null, sameOrigin:!!large?.src.startsWith(location.origin+'/__bs/image/') && !!first?.src.startsWith(location.origin+'/__bs/image/'),
                        notices:[...document.querySelectorAll('.stateNote')].map(n=>n.innerText.slice(0,100))};
                    }""",[selector,cards])
                    now=time.monotonic()
                    if record["hero"][0] and record["card"][0]:
                        if first_picture is None: first_picture=now
                        if record["hero"][0]>record["hero"][1] or now-first_picture>12: break
                    if now>end:break
                    pg.wait_for_timeout(600)
                results[screen]=record
            return {"UTC":datetime.now(timezone.utc).isoformat(),"scope":"Anonymous production reads, no test service or substituted images","screens":results,"pageErrors":errors}
        finally:
            br.close();http.shutdown()


def main():
    paths = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Quiet, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}"
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV1sAAAAASUVORK5CYII=")
    errors = []
    failed_sprite = [False]
    # The test hook only reads the current navigation route from the actual application.
    script = assemble().replace("history.scrollRestoration='manual';", "window.testRoute=()=>structuredClone(current());history.scrollRestoration='manual';")
    try:
        with sync_playwright() as pw:
            browser = launch_browser(pw)
            ctx = browser.new_context(viewport={"width": 1440, "height": 810}, locale="zh-CN")
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.route("**/src/services.js", lambda r: r.fulfill(content_type="application/javascript", body=MOCK))
            pg.route("**/src/runtime.js", lambda r: r.fulfill(content_type="application/javascript", body=script))
            def image_request(r):
                paths.append(r.request.url)
                if r.request.url.endswith('@1600w.webp') and not failed_sprite[0]:
                    failed_sprite[0]=True
                    r.abort()
                    return
                r.fulfill(content_type="image/png", body=png)
            pg.route("https://i0.hdslb.com/**", image_request)
            pg.route("**/__bs/image/**", image_request)
            key = lambda k: pg.locator(f'[data-k="{k}"]')
            def click(k):
                key(k).click(timeout=4000)
            def has(text):
                pg.wait_for_function("s=>document.querySelector('#view').innerText.includes(s)",arg=text,timeout=4000)
            def tab(k):
                key(k).focus()
                pg.wait_for_function("k=>document.activeElement.dataset.k===k",arg=k,timeout=4000)
            def query(text):
                if key("search-global").count(): click("search-global")
                pg.locator("#query").fill(text)
                pg.locator("#query").press("Enter")

            pg.goto(url)
            has("推荐第1批")
            assert key("rec-BV1").count()==1
            pg.wait_for_function("document.querySelector('.opening img')?.naturalWidth > 0")
            assert any("/__bs/image/i0.hdslb.com/bfs/archive/test-art.png@640w.webp" in v for v in paths)
            tab("nav-home")
            pg.keyboard.press("ArrowDown")
            assert pg.evaluate("document.activeElement.dataset.k")=="homeTab-rec"
            pg.keyboard.press("ArrowDown")
            assert pg.evaluate("document.activeElement.dataset.k")=="hero-primary"
            first=key("hero-primary").get_attribute("data-film")
            tab("hero-primary")
            pg.keyboard.press("ArrowRight")
            assert key("hero-primary").get_attribute("data-film")!=first
            home_picks={first,key('hero-primary').get_attribute('data-film')}
            pg.keyboard.press('ArrowRight')
            home_picks.add(key('hero-primary').get_attribute('data-film'))
            assert home_picks=={'107','207','307'}
            pg.keyboard.press("ArrowDown")
            assert pg.evaluate("document.activeElement.dataset.k")=="rec-BV1"
            click("refresh")
            has("推荐第2批")
            pg.evaluate("""()=>{const call=BSApi.call;let fail=true;BSApi.call=(op,p)=>{
                if(op==="weekly"&&fail){fail=false;return Promise.reject(Error("模拟周刊中断"))}return call(op,p)
            }}""")
            tab("homeTab-hot")
            has("模拟周刊中断")
            pg.locator(".hotDuo [data-act=dcRetry]").click()
            has("本周投稿")
            assert pg.evaluate("document.activeElement.dataset.k")=="homeTab-hot"
            has("热门投稿"); has("本周投稿"); has("本周刊")
            title=pg.locator('.hotDuo section:first-child .rankTitle strong').first
            title.locator('span').evaluate("n=>n.textContent='很长的视频标题'.repeat(12)")
            tab('hot-BV3')
            assert title.evaluate('n=>n.clientWidth < n.firstElementChild.scrollWidth && n.getBoundingClientRect().right <= n.closest("button").getBoundingClientRect().right')
            pg.wait_for_timeout(3200)
            assert title.locator('span').evaluate('n=>getComputedStyle(n).animationName')=='rank-title-scroll'
            assert title.locator('span').evaluate('n=>new DOMMatrix(getComputedStyle(n).transform).m41')<0

            assert not pg.locator('.hotDuo [data-act=dcPage]').count()
            assert pg.locator('.hotDuo section').nth(0).locator('.rankLine').count()==pg.locator('.hotDuo section').nth(1).locator('.rankLine').count()
            tab("homeTab-zones"); tab("zone-知识"); has("分区1010")
            pg.evaluate("""()=>{const call=BSApi.call;let fail=true;BSApi.call=(op,p)=>{
                if(op==='region' && p.page===2 && fail){fail=false;return Promise.reject(Error('模拟分区后续批次失败'))}
                return call(op,p)
            }}""")
            last = pg.locator('[data-stream] .grid button[data-row]').last
            tab(last.get_attribute('data-k'));pg.keyboard.press('ArrowDown')
            has('模拟分区后续批次失败')
            assert pg.locator('[data-stream] .grid .tile').count()==15
            pg.locator('[data-stream] [data-act=dcRetry]').click()
            key('zoneVideo-BVzone1010p2x14').wait_for()
            assert pg.evaluate('document.activeElement.dataset.k')=='zoneVideo-BVzone1010p1x14'
            assert pg.locator('[data-stream] .grid .tile').count() == 30
            assert not pg.locator('[data-stream] [data-act=dcPage]').count()
            tab("zone-音乐"); has("分区1003")
            tab("zone-旅游"); has("分区1022")
            tab("homeTab-live"); tab("area-following"); has("登录查看关注的直播")
            tab("area-game"); has("房间86"); click("room-86"); has("直播尚未开始")
            pg.go_back(); has("房间87")
            last=pg.locator('[data-stream] .roomCard').last
            tab(last.get_attribute('data-k'));pg.keyboard.press('ArrowDown')
            key('room-211').wait_for()
            assert pg.locator('[data-stream] .roomCard').count()==24
            assert not pg.locator('[data-stream] [data-act=dcPage]').count()

            tab('homeTab-zones')
            click('cat-manage')
            click('raise-科技')
            assert pg.evaluate('document.activeElement.dataset.k')=='raise-科技'
            click('raise-科技')
            assert pg.evaluate('document.activeElement.dataset.k')=='raise-科技'
            pg.keyboard.press('Escape')
            tab("nav-cinema")
            modes={"movie":["opening","rank","all"],"drama":["cn","overseas","rank","mine"],"anime":["rating","followers","mine","all"],"doc":["nature"],"variety":["music","rank"],"commentary":["views","new","danmaku"]}
            for mode,subs in modes.items():
                tab("cinTab-"+mode)
                for sub in subs:
                    tab("channelSub-"+sub)
                    if sub=="mine":has("登录查看个人片单")
                    else:pg.wait_for_selector("#channelResults .subWork")
            for mode in modes:
                tab("cinTab-"+mode);tab("channelSub-rec")
                if mode=='commentary':
                    assert not pg.locator('.cinScene,.cinRail,.cinPick').count()
                    assert pg.locator('.cinemaLibrarySidebar').count()==1
                    columns=3 if mode=='commentary' else 6
                    assert pg.locator('.subGrid').evaluate('n=>getComputedStyle(n).gridTemplateColumns.split(" ").length')==columns
                    assert not pg.locator('.subWork small,.subWork em').count()
                    assert pg.locator('.subThumb').first.evaluate('n=>n.offsetHeight>n.offsetWidth')==(mode!='commentary')
                    tab('cinTab-'+mode);pg.keyboard.press('ArrowDown')
                    assert pg.evaluate("document.activeElement.dataset.k")=="channelSub-rec"
                    pg.keyboard.press('ArrowRight')
                    assert pg.evaluate("document.activeElement.dataset.k").startswith('subwork-')
                    pg.keyboard.press('ArrowLeft')
                    assert pg.evaluate("document.activeElement.dataset.k")=="channelSub-rec"
                    pg.keyboard.press('ArrowUp')
                    assert pg.evaluate("document.activeElement.dataset.k")=="cinTab-"+mode
                    continue
                pg.wait_for_selector(".cinPick")
                assert pg.locator(".cinRail").evaluate("n=>n.scrollWidth<=n.clientWidth+1")
                assert pg.evaluate("""()=>[...document.querySelectorAll('.cinPick')].every(n=>!document.querySelector('[data-k="subwork-'+n.dataset.id+'"]'))""")
                tab("channelSub-"+modes[mode][-1])
                tab(pg.locator(".cinPick").last.get_attribute("data-k"))
                pg.keyboard.press("ArrowDown")
                assert pg.evaluate("document.activeElement.dataset.k")=="channelSub-rec"
                # Returning from the collection to a hero pick must reveal the full banner.
                pg.wait_for_selector('#channelResults .subWork')
                pg.keyboard.press('ArrowDown')
                pg.keyboard.press('ArrowUp')
                assert pg.evaluate("document.activeElement.dataset.k")=="channelSub-rec"
                assert pg.evaluate("document.querySelector('#view').scrollTop")>0
                pg.keyboard.press('ArrowUp')
                assert pg.evaluate("document.activeElement.dataset.row==='filmRail' && document.querySelector('#view').scrollTop===0"),mode
                assert pg.locator('.cinScene').evaluate("n=>n.getBoundingClientRect().top>=document.querySelector('#view').getBoundingClientRect().top")
                tab(pg.locator(".cinPick").first.get_attribute("data-k"))
                pg.keyboard.press("Escape")
                assert pg.evaluate("document.activeElement.dataset.k")=="cinTab-"+mode
                pg.keyboard.press("Escape")
                assert pg.evaluate("document.activeElement.dataset.k")=="nav-cinema"
            # Each serialized-work channel should bring the full hero back into view.
            for mode in ("movie", "drama", "anime", "doc", "variety"):
                tab("cinTab-" + mode)
                tab("channelSub-rec")
                pick = pg.locator('.cinPick').first
                pick.wait_for()
                pick.click()
                has("相关季")
                related = pg.locator(".posterGrid [data-k^=related-]").first
                assert related.locator(".vertical").count() == 1
                tab(related.get_attribute("data-k"))
                for _ in range(8):
                    pg.keyboard.press("ArrowUp")
                    if pg.evaluate("document.activeElement.dataset.k") == "feature":
                        break
                assert pg.evaluate("document.activeElement.dataset.k==='feature' && document.querySelector('#view').scrollTop===0"), mode
                pg.keyboard.press("Escape")
                pg.wait_for_selector('.cinPick')

            tab("cinTab-anime"); tab("channelSub-all"); click("channel-index")
            tab("origin-国创"); tab("genre-音乐"); tab("year-2024"); tab("order-片名")
            pg.wait_for_selector(".posterGrid button"); click("works-601")
            has("第一集");has("第二集");has("相关季")
            assert pg.locator('.epGrid .episodeThumb').count()==2
            pg.wait_for_function("document.querySelector('.epGrid .episodeThumb')?.dataset.previewSource==='videoshot'")
            assert pg.locator('.epGrid .episodeThumb').first.evaluate("n=>n.style.backgroundImage.includes('data:image/webp')")
            assert failed_sprite[0] and any('@1600w_80q.webp' in u for u in paths)
            assert pg.locator(".posterGrid [data-k^=related-] .vertical").count()>0
            tab(pg.locator("[data-k^=related-]").first.get_attribute("data-k"))
            for _ in range(6):
                pg.keyboard.press("ArrowUp")
                if pg.evaluate("document.activeElement.dataset.k")=="feature":break
            assert pg.evaluate("document.activeElement.dataset.k==='feature' && document.querySelector('#view').scrollTop===0")
            assert key("feature").get_attribute("data-act")=="dcPlaySelected"
            assert key("ep-2").get_attribute("data-id")=="2"
            pg.go_back()
            assert pg.evaluate("window.testRoute().genre")=="音乐"
            click("search-global"); tab("osk-A"); pg.keyboard.press("Enter")
            assert pg.locator("#query").input_value()=="a"
            has("候选a")
            click("osk-clear");query("普通");has("普通 totalrank 1")
            tab("sort-最多播放");has("普通 click 1");click("page-result-video-最多播放-next");has("普通 click 2")
            for name,title in [("anime","番剧命中"),("film","影视命中"),("person","UP命中"),("room","房间86")]:
                tab("resultType-"+name);has(title)
            tab("resultType-room");pg.keyboard.press("Escape");pg.wait_for_selector("#query");pg.evaluate("window.testFail=true");query("失败")
            has("访问受限");assert key("resultType-video").is_visible()
            pg.evaluate("window.testFail=false");pg.locator('[data-act="dcRetry"]').click();has("失败 totalrank 1")
            tab("resultType-video");pg.keyboard.press("Escape");pg.wait_for_selector("#query");query("无结果");has("没有找到相关内容")
            tab("resultType-video");pg.keyboard.press("Escape");pg.wait_for_selector("#query");query("迟到")
            pg.wait_for_function("!!window.testPending.video")
            tab("resultType-anime");pg.wait_for_function("!!window.testPending.media_bangumi")
            pg.evaluate("window.testPending.media_bangumi({items:[{kind:'anime',seasonId:'901',title:'最后的查询'}]})")
            pg.evaluate("window.testPending.video({items:[{kind:'video',id:'BVz',title:'过时响应'}]})")
            has("最后的查询");assert "过时响应" not in pg.locator("#view").inner_text()
            tab("resultType-anime");pg.keyboard.press("Escape")
            pg.wait_for_selector("#query")
            click("osk-clear")
            assert pg.locator("aside #recentSearch").is_visible() and pg.locator("#suggestSearch").is_hidden()
            tab("osk-I");pg.keyboard.press("Enter");has("候选i")
            pg.keyboard.press("ArrowRight")
            assert pg.evaluate("document.activeElement.closest('aside')!==null && document.activeElement.dataset.k==='cand-0'")
            assert not key("change-query").count()
            # Multiple genuine page completions, including repeated IDs, through the focus boundary.
            pg.route("**/src/services.js",lambda r:r.fulfill(content_type="application/javascript",body=MOCK+"""
                const call=BSApi.call;BSApi.call=(op,p)=>op==='recommend'?Promise.resolve({
                  items:[ugc('BVcommon','共享'),...Array.from({length:20},(_,i)=>ugc('BV'+p.page+'x'+i,'视频'+i))],
                  next:p.page+1}):call(op,p)"""))
            pg.reload()
            for pn in range(1,7):
                last="rec-BV"+str(pn)+"x19"
                key(last).wait_for()
                tab(last);pg.keyboard.press("ArrowDown")
                key("rec-BV"+str(pn+1)+"x19").wait_for()
            assert key("rec-BVcommon").count()==1 and pg.locator("#view .grid .tile").count()>=141
            # Turn the page through its normal button while the server is delayed.
            pg.route("**/src/services.js",lambda r:r.fulfill(content_type="application/javascript",body=MOCK+"\nwindow.testCinemaPages=true;"))
            pg.reload();has('推荐第1批');tab('nav-cinema');tab('cinTab-movie');tab('channelSub-rec')
            key('subwork-1026').wait_for()
            turn='page-channel-movie-rec-next'
            tab(turn)
            scroll=pg.evaluate("document.querySelector('#view').scrollTop")
            click(turn)
            pg.wait_for_function('!!window.finishCinemaPage')
            assert key('subwork-1026').count()==1
            assert pg.evaluate('document.activeElement.dataset.k')==turn
            assert abs(pg.evaluate("document.querySelector('#view').scrollTop")-scroll)<2
            pg.evaluate('window.finishCinemaPage()')
            pg.wait_for_function("document.activeElement.dataset.k==='subwork-1046'")
            assert pg.evaluate("document.querySelector('#view').scrollTop")>0
            assert key('channelSub-rec').is_visible()
            pg.keyboard.press('Escape')
            pg.wait_for_function("window.testRoute().dcPages['channel-movie-rec']===1")
            assert pg.evaluate('document.activeElement.dataset.k')==turn
            click(turn)
            pg.wait_for_function("window.testRoute().dcPages['channel-movie-rec']===2")
            pg.evaluate('window.testCinemaFailPage=4')
            click(turn)
            pg.wait_for_function("document.querySelector('#toast').textContent.includes('模拟影视翻页失败')")
            assert pg.evaluate("window.testRoute().dcPages['channel-movie-rec']")==2
            assert pg.evaluate('document.activeElement.dataset.k')==turn
            click(turn)
            pg.wait_for_function("document.activeElement.dataset.k==='subwork-1066'")
            assert pg.evaluate("window.testRoute().dcPages['channel-movie-rec']")==3
            tab('cinTab-drama');tab('channelSub-rec')
            for n in (2,3,4):
                click('page-channel-drama-rec-next')
                pg.wait_for_function('n=>window.testRoute().dcPages["channel-drama-rec"]===n',arg=n)
                assert pg.evaluate('document.activeElement.dataset.k').startswith('subwork-')
            assert pg.locator('#channelResults .subWork').count()==20
            # Continuous libraries retain cards/focus through errors and delayed
            # appends, deduplicate pages, and stop at the actual upstream end.
            pg.route("**/src/services.js",lambda r:r.fulfill(content_type="application/javascript",body=MOCK+"\nwindow.testLibraryPages=true;"))
            pg.reload();has('推荐第1批');tab('nav-cinema')
            for mode in ('doc','variety'):
                tab('cinTab-'+mode);tab('channelSub-all')
                pg.wait_for_function("document.querySelectorAll('#channelResults .subWork').length===20")
                assert pg.locator('.cinScene,.cinRail').count()==2
                assert not pg.locator('.cinemaLibrarySidebar,[data-act=dcPage]').count()
                for count in (40,60):
                    tab(pg.locator('#channelResults .subWork').last.get_attribute('data-k'))
                    pg.keyboard.press('ArrowDown')
                    pg.wait_for_function('n=>document.querySelectorAll("#channelResults .subWork").length===n',arg=count)
                tab('channelSub-all');pg.keyboard.press('ArrowUp')
                assert pg.evaluate("document.activeElement.dataset.row==='filmRail'&&document.querySelector('#view').scrollTop===0")
            for mode in ('commentary',):
                pg.evaluate('mode=>window.testLibraryFailKind=mode',mode)
                tab('cinTab-'+mode);tab('channelSub-rec')
                pg.wait_for_function("document.querySelectorAll('#channelResults .subWork').length===20")
                assert not pg.locator('.cinemaLibrarySidebar .listContext,[data-act=dcPage]').count()
                cols=3 if mode=='commentary' else 6
                items=pg.locator('#channelResults .subWork')
                last=items.last.get_attribute('data-k')
                items.nth(cols-1).evaluate('n=>n.focus({preventScroll:true})')
                for _ in range(10):
                    pg.keyboard.press('ArrowDown')
                    if pg.evaluate('document.activeElement.dataset.k')==last:break
                assert pg.evaluate('document.activeElement.dataset.k')==last
                pg.keyboard.press('ArrowRight')
                assert pg.evaluate('document.activeElement.dataset.k')==last
                pane=pg.locator('.cinemaLibraryResults')
                has('模拟片库后续加载失败')
                scroll=pane.evaluate('n=>n.scrollTop')
                assert scroll>0 and pg.evaluate("document.querySelector('#view').scrollTop") == 0,(mode,scroll,pg.evaluate("document.querySelector('#view').scrollTop"))
                assert key('cinTab-'+mode).is_visible()
                if mode!='commentary':
                    click(last);has('相关季');pg.keyboard.press('Escape')
                    key(last).wait_for()
                    assert pg.evaluate('document.activeElement.dataset.k')==last
                    assert abs(pane.evaluate('n=>n.scrollTop')-scroll)<2,(mode,'detail return',scroll,pane.evaluate('n=>n.scrollTop'))
                pg.keyboard.press('Escape')
                assert pg.evaluate('document.activeElement.dataset.k')=='channelSub-rec'
                assert abs(pane.evaluate('n=>n.scrollTop')-scroll)<2,(mode,'parent focus',scroll,pane.evaluate('n=>n.scrollTop'))
                pg.keyboard.press('ArrowRight')
                assert pg.evaluate('document.activeElement.dataset.k')==last
                has('模拟片库后续加载失败')
                pg.evaluate('mode=>window.testLibraryHoldKind=mode',mode)
                pg.locator('[data-stream] [data-act=dcRetry]').click()
                pg.wait_for_function("typeof window.finishLibrary==='function'")
                assert pg.locator('#channelResults .subWork').count()==20
                pg.keyboard.press('ArrowUp')
                anchor=pg.evaluate('document.activeElement.dataset.k')
                pg.evaluate('window.finishLibrary();delete window.finishLibrary')
                pg.wait_for_function("document.querySelectorAll('#channelResults .subWork').length===40")
                assert pg.evaluate('document.activeElement.dataset.k')==anchor
                assert not pg.locator('[data-act=dcPage]').count()
                tab(pg.locator('#channelResults .subWork').last.get_attribute('data-k'))
                pg.keyboard.press('ArrowDown')
                pg.wait_for_function("document.querySelectorAll('#channelResults .subWork').length===60")
                assert pg.evaluate("(()=>{const a=[...document.querySelectorAll('#channelResults .subWork')].map(n=>n.dataset.k);return new Set(a).size===a.length})()")
                tab(pg.locator('#channelResults .subWork').last.get_attribute('data-k'))
                pg.keyboard.press('ArrowDown')
                assert pg.locator('#channelResults .subWork').count()==60
                pg.keyboard.press('Escape')
                assert pg.evaluate('document.activeElement.dataset.k')=='channelSub-rec'
                pg.keyboard.press('Escape')
                assert pg.evaluate('document.activeElement.dataset.k')=='cinTab-'+mode
                pg.keyboard.press('Escape')
                assert pg.evaluate('document.activeElement.dataset.k')=='nav-cinema'
            # Local sampling is independent of slow network data; refresh on a
            # new process/day, keep the current trio stable during navigation.
            pg.route("**/src/services.js",lambda r:r.fulfill(content_type="application/javascript",body=MOCK+"\nwindow.testHoldHomePool=true;"))
            pg.add_init_script("""(()=>{
              const D=Date;window.testDayOffset=0;
              window.Date=class extends D{constructor(...a){super(...(a.length?a:[D.now()+testDayOffset]))}static now(){return D.now()+testDayOffset}};
              const image='https://i0.hdslb.com/bfs/archive/test-art.png@120w_90h.webp';
              BS_HOME_CANDIDATES=Object.fromEntries([['anime',300],['movie',100],['drama',200]].map(([kind,n])=>[kind,[7,8,9,10].map(i=>({kind,id:String(n+i),seasonId:String(n+i),title:'随机'+kind+i,score:i===9?8:i===10?7.5:9.1,wide:image,cover:image}))]));
              localStorage.removeItem('bilibs-v1-online-home-candidates');
            })()""")
            def home_trio():
                tab('hero-primary');result=[]
                for _ in range(3):
                    result.append(key('hero-primary').get_attribute('data-film'))
                    pg.keyboard.press('ArrowRight')
                return result
            startup=[];prior=None
            for _ in range(3):
                pg.reload();pg.wait_for_selector('.opening[data-film]')
                startup.append(pg.evaluate('performance.now()'))
                assert startup[-1]<2000,startup
                trio=home_trio()
                assert [int(i)//100 for i in trio]==[3,1,2]
                assert all(int(i)%100 in (7,8) for i in trio)
                if prior:assert all(a!=b for a,b in zip(prior,trio))
                tab('nav-cinema');tab('nav-home');assert home_trio()==trio
                prior=trio
            pg.evaluate("window.testDayOffset=86400000;document.dispatchEvent(new Event('visibilitychange'))")
            daily=home_trio();assert all(a!=b for a,b in zip(prior,daily))
            print('PASS random home: anime/movie/drama, scores >8, 3 restarts + midnight, stable navigation, slow network; startup ms',startup)
            pg.route("**/src/services.js",lambda r:r.fulfill(content_type="application/javascript",body=MOCK+"\nwindow.testWeeklySize=23;"))
            pg.evaluate("localStorage.removeItem('bilibs-v1-online-weekly')")
            pg.reload();has('推荐第1批');tab('homeTab-hot')
            pg.wait_for_function("[...document.querySelectorAll('.hotDuo section')].length===2&&[...document.querySelectorAll('.hotDuo section')].every(n=>n.querySelectorAll('.rankLine').length===23)")
            assert not pg.locator('.hotDuo [data-act=dcPage]').count()
            assert not errors, errors
            print("PASS discovery, six cinema channels, real section filters, catalog, episodes, image decode, search/TV keys, paging, late response, retry, empty state")
            browser.close()
    finally:
        server.shutdown()


if __name__ == "__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--live-art",action="store_true",help="Sample image decode from the production service and gateway")
    parser.add_argument("--output",type=Path,help="Save the anonymous live image result as JSON")
    args=parser.parse_args()
    if args.live_art:
        result=live_art()
        text=json.dumps(result,ensure_ascii=False,indent=2)
        if args.output: args.output.write_text(text+"\n",encoding="utf-8")
        print(text)
        assert not result["pageErrors"] and all(v["sameOrigin"] and v["hero"][0] and v["card"][0] for v in result["screens"].values())
    else:
        main()
