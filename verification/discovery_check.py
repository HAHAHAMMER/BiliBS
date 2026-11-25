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
        args=["--single-process","--no-zygote","--disable-gpu","--disable-dev-shm-usage","--autoplay-policy=no-user-gesture-required"])


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
            assert any("/__bs/image/i0.hdslb.com/bfs/archive/test-art.png@120w_90h.webp" in v for v in paths)
            first=key("hero-primary").get_attribute("data-film")
            tab("hero-primary")
            pg.keyboard.press("ArrowRight")
            assert key("hero-primary").get_attribute("data-film")!=first
            pg.keyboard.press("ArrowDown")
            assert pg.evaluate("document.activeElement.dataset.k")=="rec-BV1"
            click("refresh")
            has("推荐第2批")
            tab("homeTab-hot")
            has("热门投稿"); has("本周投稿"); has("本周刊")
            click("page-hot-next"); has("21")
            tab("homeTab-zones"); tab("zone-知识"); has("分区36")
            tab("zone-音乐"); has("分区3")
            tab("zone-旅游"); has("旅游主题搜索"); has("旅游 pubdate")
            tab("homeTab-live"); tab("area-following"); has("登录查看关注的直播")
            tab("area-game"); has("房间86"); click("room-86"); has("直播尚未开始")
            pg.go_back(); has("房间87")

            tab("nav-cinema")
            modes={"movie":["opening","rank","all"],"drama":["cn","overseas","rank","mine"],"anime":["rating","followers","mine","all"],"doc":["nature"],"variety":["music","rank"],"commentary":["views","new","danmaku"]}
            for mode,subs in modes.items():
                tab("cinTab-"+mode)
                for sub in subs:
                    tab("channelSub-"+sub)
                    if sub=="mine":has("登录查看个人片单")
                    else:pg.wait_for_selector("#channelResults .subWork")
            tab("cinTab-anime"); tab("channelSub-all"); click("channel-index")
            tab("origin-国创"); tab("genre-音乐"); tab("year-2024"); tab("order-片名")
            pg.wait_for_selector(".posterGrid button"); click("works-601")
            has("第一集");has("第二集");has("相关季")
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
            click("change-query");pg.evaluate("window.testFail=true");query("失败")
            has("访问受限");assert key("resultType-video").is_visible()
            pg.evaluate("window.testFail=false");pg.locator('[data-act="dcRetry"]').click();has("失败 totalrank 1")
            click("change-query");query("无结果");has("没有找到相关内容")
            click("change-query");query("迟到")
            pg.wait_for_function("!!window.testPending.video")
            tab("resultType-anime");pg.wait_for_function("!!window.testPending.media_bangumi")
            pg.evaluate("window.testPending.media_bangumi({items:[{kind:'anime',seasonId:'901',title:'最后的查询'}]})")
            pg.evaluate("window.testPending.video({items:[{kind:'video',id:'BVz',title:'过时响应'}]})")
            has("最后的查询");assert "过时响应" not in pg.locator("#view").inner_text()
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
