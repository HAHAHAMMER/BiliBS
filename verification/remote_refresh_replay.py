"""H04 and P13 through the packaged web entry and Android remote-key bridge.

Run with Python Playwright and Chromium. BILIBS_CHROME may point to Edge.
Each test uses a fresh guest browser context and only loopback or bundled media.
"""
import json
import os
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BRIDGE = (ROOT / "android/app/src/main/assets/android-host.js").read_text(encoding="utf-8")
FIXTURE = (ROOT / "verification/discovery_fixture.js").read_text(encoding="utf-8")
RECOMMEND = """
const normalCall = window.BSApi.call;
window.batches = [];
function videos(prefix) {
  return {items: Array.from({length:12}, (_, i) => {
    const id = prefix + (i + 1);
    return {id, bvid:id, kind:'video', cid:String(100+i), title:id, duration:18};
  })};
}
window.BSApi.call = (op, params) => {
  if (op !== 'recommend') return normalCall(op, params);
  window.testRequests.push([op, params]);
  if (params.page === 1) return Promise.resolve(videos('BVOLD'));
  return new Promise((resolve, reject) => window.batches.push({
    succeed: prefix => resolve(videos(prefix)), fail: () => reject(Error('test offline'))
  }));
};
"""


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class RemoteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(("127.0.0.1", 0), partial(Quiet, directory=str(ROOT)))
        Thread(target=cls.http.serve_forever, daemon=True).start()
        cls.addClassCleanup(cls.http.server_close)
        cls.addClassCleanup(cls.http.shutdown)
        cls.pw = sync_playwright().start()
        cls.addClassCleanup(cls.pw.stop)
        cls.browser = cls.pw.chromium.launch(
            executable_path=os.getenv("BILIBS_CHROME"), headless=True,
            args=["--autoplay-policy=no-user-gesture-required", "--disable-gpu"])
        cls.addClassCleanup(cls.browser.close)

    def setUp(self):
        self.ctx = self.browser.new_context(viewport={"width":1280, "height":720}, locale="zh-CN")
        self.addCleanup(self.ctx.close)
        self.page = self.ctx.new_page()
        self.page.set_default_timeout(7000)
        self.url = f"http://127.0.0.1:{self.http.server_port}"
        self.ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith(self.url+"/")
                       or urlsplit(r.request.url).scheme in ("data","blob") else r.abort())

    def open(self, demo=False):
        self.page.goto(self.url + ("/index.html?mode=demo" if demo else "/index.html"))
        self.wait("!!window.BS_READY")
        self.page.evaluate("window.BSHost={playbackActive(){}}")
        self.page.add_script_tag(content=BRIDGE)

    def wait(self, expr):
        self.page.wait_for_function(expr)

    def key(self, key):
        self.page.evaluate("key => window.BiliBSTVHost.key(key)", key)

    def focused(self, k):
        self.page.wait_for_function("k => document.activeElement.dataset.k === k", arg=k)

    def play_requests(self):
        return self.page.evaluate("testRequests.filter(([op])=>op==='play').length")

    def enter_refresh(self):
        self.page.locator('[data-k="rec-BVOLD1"]').focus()
        for key in ["ArrowDown"]*2 + ["ArrowRight"]*3:
            self.key(key)
        self.focused("rec-BVOLD12")
        self.assertGreater(self.page.locator("#view").evaluate("e=>e.scrollTop"),0)
        for _ in range(3):
            self.key("ArrowUp")
        self.focused("refresh")
        card=self.page.locator('[data-k="rec-BVOLD1"]')
        def card_layout():
            return card.evaluate('(e)=>{const r=e.getBoundingClientRect(),h=e.closest("section").getBoundingClientRect();'
                                 'return [r.x-h.x,r.y-h.y,r.width,r.height,getComputedStyle(e).opacity]}')
        before=card_layout()
        self.key("Enter")
        self.wait("batches.length>0")
        self.assertEqual(card_layout(),before)
        self.focused("refresh")

    def home(self):
        self.page.route("**/src/services.js", lambda r:r.fulfill(
            content_type="application/javascript",body=FIXTURE+"\n"+RECOMMEND))
        self.open()
        self.page.locator('[data-k="rec-BVOLD1"]').wait_for()

    def assert_top(self):
        distance = self.page.locator('[data-k="refresh"]').evaluate(
            "e=>e.closest('.section').getBoundingClientRect().top-document.querySelector('#view').getBoundingClientRect().top")
        self.assertLessEqual(abs(distance-12*1280/1440),1.1)

    def test_refresh_delayed_success(self):
        self.home()
        self.enter_refresh()
        old=self.page.locator('[data-k="rec-BVOLD1"]')
        self.assertTrue(old.is_disabled())
        for _ in range(3):
            self.key("ArrowDown")
            self.focused("refresh")
            self.key("Enter")
        self.assertEqual(self.page.evaluate("batches.length"),1)
        self.assertEqual(self.play_requests(),0)
        self.assertTrue(self.page.locator("#player").is_hidden())
        self.page.evaluate("batches[0].succeed('BVNEW')")
        self.page.locator('[data-k="rec-BVNEW1"]').wait_for()
        self.focused("refresh")
        self.assert_top()
        self.key("ArrowDown")
        self.focused("rec-BVNEW1")
        self.key("Enter")
        self.wait("history.state.pages.at(-1).id==='BVNEW1' && !document.querySelector('#player').hidden")
        self.key("Escape")
        self.focused("rec-BVNEW1")

    def test_refresh_retry(self):
        self.home()
        self.enter_refresh()
        self.page.evaluate("batches[0].fail()")
        retry=self.page.locator('section.section [data-act="dcRetry"]')
        retry.wait_for()
        self.focused("refresh")
        self.assertTrue(self.page.locator('[data-k="rec-BVOLD1"]').is_disabled())
        self.key("ArrowDown")
        self.focused(retry.get_attribute("data-k"))
        self.key("Enter")
        self.wait("batches.length===2")
        self.key("ArrowDown")
        self.focused("refresh")
        self.page.evaluate("batches[1].succeed('BVRETRY')")
        self.page.locator('[data-k="rec-BVRETRY1"]').wait_for()
        self.focused("refresh")
        self.assert_top()
        self.key("ArrowDown")
        self.focused("rec-BVRETRY1")
        self.assertEqual(self.play_requests(),0)

    def test_refresh_after_leaving(self):
        self.home()
        self.enter_refresh()
        self.key("Escape")
        self.focused("nav-home")
        self.key("ArrowRight")
        self.focused("nav-feed")
        self.key("ArrowLeft")
        self.focused("nav-home")
        self.enter_refresh()
        self.wait("batches.length===2")
        self.page.evaluate("batches[1].succeed('BVFRESH')")
        self.page.locator('[data-k="rec-BVFRESH1"]').wait_for()
        self.key("ArrowDown")
        self.focused("rec-BVFRESH1")
        self.page.evaluate("async ()=>{batches[0].succeed('BVLATE'); await new Promise(requestAnimationFrame)}")
        self.focused("rec-BVFRESH1")
        self.assertEqual(self.page.locator('[data-k="rec-BVLATE1"]').count(),0)
        self.assertEqual(self.play_requests(),0)

    def episode(self, number=1, auto=True):
        prefs=json.dumps({"autonext":auto})
        history=json.dumps({f"46089:{number}":{"t":1,"d":18,"ep":number,"recent":1}})
        self.ctx.add_init_script(f"localStorage.setItem('bilibs-ui-1-prefs', {json.dumps(prefs)});"
                                 f"localStorage.setItem('bilibs-ui-1-history', {json.dumps(history)});")
        self.open(demo=True)
        self.page.locator('[data-k="nav-mine"]').focus()
        self.page.locator('[data-k="mine-shelfA"]').click()
        self.page.locator('[data-k="s-46089"]').click()
        self.wait(f"history.state.pages.at(-1).ep==={number} && video.readyState>=2 && !video.paused")

    def end(self):
        self.page.locator("#video").evaluate("v=>{v.currentTime=v.duration-0.65}")
        self.wait("video.ended")

    def replay(self, key):
        self.episode()
        self.end()
        self.focused("next-cancel")
        if key=="MediaPlayPause":
            self.wait("document.querySelector('#tick')?.textContent.startsWith('1 ')")
        self.key(key)
        self.wait("!document.querySelector('#nextPrompt') && !video.paused && video.currentTime>0.1")
        self.focused("toggle")
        self.page.wait_for_timeout(5300)
        self.assertTrue(self.page.evaluate("history.state.pages.at(-1).ep===1 && video.currentTime>4 && !video.paused"))

    def test_dedicated_play_repeats_current_episode(self):
        self.replay("MediaPlay")

    def test_play_pause_repeats_current_episode(self):
        self.replay("MediaPlayPause")

    def test_default_cancel_then_idle_autonext(self):
        self.episode()
        self.end()
        self.focused("next-cancel")
        self.key("Enter")
        self.page.wait_for_timeout(5300)
        self.assertTrue(self.page.evaluate("video.ended && history.state.pages.at(-1).ep===1 && !document.querySelector('#nextPrompt')"))
        self.key("MediaPlay")
        self.wait("!video.paused && video.currentTime>0.1")
        self.end()
        self.wait("history.state.pages.at(-1).ep===2 && video.readyState>=2 && !video.paused")

    def assert_host_pause_at_end(self):
        # Stay past the old deadline without sending any remote key.
        self.page.wait_for_timeout(5400)
        state = self.page.evaluate("""() => ({
            episode: history.state.pages.at(-1).ep,
            ended: video.ended, paused: video.paused,
            prompt: !!document.querySelector('#nextPrompt'),
            focus: document.activeElement.dataset.k,
            episodesPlayed: window.episodesPlayed,
            records: Object.keys(JSON.parse(localStorage.getItem('bilibs-ui-1-history')))
        })""")
        self.assertEqual(state, {"episode": 1, "ended": True, "paused": True,
                                 "prompt": False, "focus": "toggle",
                                 "episodesPlayed": [], "records": ["46089:1"]})
        self.key("ArrowUp")
        self.focused("seek")
        self.key("ArrowDown")
        self.focused("episodes")
        self.key("ArrowLeft")
        self.focused("toggle")
        self.key("Enter")
        self.wait("!video.paused && video.currentTime>0.1 && history.state.pages.at(-1).ep===1")
        self.end()
        self.wait("history.state.pages.at(-1).ep===2 && video.readyState>=2 && !video.paused")

    def observe_plays(self):
        self.page.evaluate("""() => {
            window.episodesPlayed = [];
            window.addEventListener('pagehide', () => {
                video.addEventListener('playing', () => episodesPlayed.push(history.state.pages.at(-1).ep));
            }, {once:true});
        }""")

    def test_host_pause_cancels_pending_autonext(self):
        self.episode()
        self.end()
        self.focused("next-cancel")
        self.observe_plays()
        self.page.evaluate("window.BiliBSTVHost.pause()")
        self.assert_host_pause_at_end()

    def test_host_pause_at_last_tick(self):
        self.episode()
        self.end()
        self.focused("next-cancel")
        self.key("ArrowLeft")
        self.focused("next-now")
        self.wait("document.querySelector('#tick')?.textContent.startsWith('1 ')")
        self.observe_plays()
        self.page.evaluate("() => { window.BiliBSTVHost.pause(); window.BiliBSTVHost.pause(); }")
        self.assert_host_pause_at_end()

    def test_host_pause_as_ended_is_delivered(self):
        self.episode()
        self.observe_plays()
        # Capture the real media event before the player's target-phase handler.
        self.page.evaluate("""document.addEventListener('ended', () => window.BiliBSTVHost.pause(),
                                                        {capture:true, once:true})""")
        self.end()
        self.assert_host_pause_at_end()

    def test_last_episode_and_normal_pause(self):
        self.episode(number=28)
        self.key("MediaPause")
        self.wait("video.paused && !video.ended")
        self.key("MediaPlayPause")
        self.wait("!video.paused")
        self.end()
        self.assertIsNone(self.page.query_selector("#nextPrompt"))
        self.key("MediaPlay")
        self.wait("!video.paused && history.state.pages.at(-1).ep===28")

    def test_live_media_keys(self):
        self.ctx.add_init_script("localStorage.setItem('bilibs-ui-1-prefs','{\"autonext\":true}')")
        self.open(demo=True)
        self.page.locator('[data-k="homeTab-live"]').focus()
        room=self.page.locator('[data-act="room"]').filter(has=self.page.locator('.onAir:not(.off)')).first
        room.click()
        self.wait("history.state.pages.at(-1).room && video.loop && video.readyState>=2 && !video.paused")
        self.key("MediaPause")
        self.wait("video.paused")
        self.key("MediaPlay")
        self.wait("!video.paused")
        self.page.locator('#video').evaluate("v=>{v.currentTime=v.duration-0.5}")
        self.wait("video.currentTime<2 && !video.paused")
        self.assertTrue(self.page.evaluate("!!history.state.pages.at(-1).room && !document.querySelector('#nextPrompt')"))

    def test_disabled_autonext(self):
        self.episode(auto=False)
        self.end()
        self.assertIsNone(self.page.query_selector("#nextPrompt"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
