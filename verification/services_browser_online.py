"""Exercise the production transport and service adapter in Chromium. Emits aggregate data only."""
import argparse
import json
import os
import shutil
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from dev_server import server

CASES = [
    ("nav", {}), ("popular", {"page":1}), ("recommend", {"page":1}),
    ("catalog", {"kind":"movie"}), ("catalogOptions", {"kind":"anime"}),
    ("ranking", {"kind":"anime"}), ("season", {"seasonId":"46089"}),
    ("video", {"bvid":"BV1jJs16WEfE"}), ("related", {"bvid":"BV1jJs16WEfE"}),
    ("play", {"bvid":"BV1jJs16WEfE","cid":"43703273798","qn":80}),
    ("danmaku", {"cid":"43703273798"}), ("history", {}), ("liveAreas", {}),
    ("liveRooms", {}), ("liveRoom", {"roomId":"616"}), ("livePlay", {"roomId":"616"}),
    ("search", {"keyword":"机械键盘","type":"video"}), ("suggest", {"keyword":"键盘"}),
]
CHECK = """async ([op,params]) => {
  try {
    const result=await BSApi.call(op,params), row={operation:op,outcome:'success'};
    if (op==='nav') row.loggedIn=result.loggedIn;
    if (op==='recommend') window.sampleVideo=result.items.find(x=>x.bvid);
    if (op==='liveRooms') window.sampleRoom=result.items.find(x=>x.liveStatus===1);
    if (Array.isArray(result.items)) row.items=result.items.length;
    if (result.kind) row.kind=result.kind;
    if (result.episodes) row.episodes=result.episodes.length;
    if (result.extras) row.extras=result.extras.length;
    if (result.pages) row.pages=result.pages.length;
    if (result.liveStatus!=null) row.liveStatus=result.liveStatus;
    if (result.streams) row.streams=result.streams.length;
    if (result.video) {
      row.video=result.video.length; row.audio=result.audio.length;
      row.authorizedVideo=result.video.filter(t=>Boolean(BSTransport.mediaURL(t.url))).length;
      const media=result.video.map(t=>BSTransport.mediaURL(t.url)).find(Boolean);
      if (media) {
        try {
          const response=await fetch(media,{headers:{Range:'bytes=0-4095'}});
          row.mediaHttp=response.status;
          if (response.ok) {
            const reader=response.body.getReader(), {value}=await reader.read();
            await reader.cancel();
            const bytes=(value||new Uint8Array()).subarray(0,4096);
            row.sampledBytes=bytes.byteLength;
            row.mp4Header=/ftyp|styp|moof/.test(new TextDecoder('latin1').decode(bytes.subarray(0,256)));
          }
        } catch (_) {row.mediaHttp=0;}
      }
    }
    return row;
  } catch(e) {return {operation:op,outcome:'error',code:e.code??null,status:e.status??null,message:e.message.slice(0,100)};}
}"""

CURRENT_MEDIA = """async (kind) => {
  const row={operation:'current'+(kind==='live'?'Live':'Video')+'Media',outcome:'error'};
  try {
    let url;
    if (kind==='live') {
      const item=window.sampleRoom;
      if (!item) throw Error('推荐直播列表没有开播房间');
      row.roomId=item.roomId;
      row.stage='livePlay';
      const result=await BSApi.call('livePlay',{roomId:item.roomId});
      row.tracks=result.streams.length;
      url=result.streams.filter(s=>s.protocol==='http_hls').map(s=>BSTransport.mediaURL(s.url)).find(Boolean);
      if (!url) throw Error('平台未提供可读取的 HLS');
    } else {
      const item=window.sampleVideo;
      if (!item) throw Error('推荐视频列表没有可选稿件');
      row.bvid=item.bvid;
      row.stage='detail';
      const detail=await BSApi.call('video',{bvid:item.bvid});
      row.parts=detail.pages.length;
      row.stage='play';
      const result=await BSApi.call('play',{bvid:detail.bvid,cid:detail.cid});
      row.tracks=result.video.length;
      url=result.video.map(t=>BSTransport.mediaURL(t.url)).find(Boolean);
      if (!url) throw Error('平台未提供可读取的视频轨');
    }
    row.stage='mediaRange';
    const response=await fetch(url,{headers:kind==='live'?{}:{Range:'bytes=0-4095'}});
    row.http=response.status;
    if (!response.ok) throw Error('媒体读取失败');
    const reader=response.body.getReader();
    const {value}=await reader.read();
    await reader.cancel();
    const bytes=(value||new Uint8Array()).subarray(0,4096);
    row.sampledBytes=bytes.byteLength;
    const prefix=new TextDecoder('latin1').decode(bytes.subarray(0,256));
    const matches=kind==='live'?prefix.startsWith('#EXTM3U'):/ftyp|styp|moof/.test(prefix);
    row.format=matches?(kind==='live'?'HLS':'MP4'):'unknown';
    row.outcome=matches?'success':'unrecognized';
  } catch(e){row.code=e.code??null;row.message=e.message.slice(0,100);}
  return row;
}"""

def run(only=None):
    with server(0) as host:
        thread = threading.Thread(target=host.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as pw:
                binary = os.environ.get("BILIBS_CHROME") or shutil.which("chromium")
                browser = pw.chromium.launch(headless=True, executable_path=binary, args=["--no-sandbox"])
                ctx = browser.new_context()
                base = "http://127.0.0.1:" + str(host.server_port)
                assert ctx.request.get(base + "/").ok
                page = ctx.new_page()
                # Use a UTF-8 document, matching the real app, without booting its background feed.
                entry = base + "/index.html"
                page.route(entry, lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body="<!doctype html><meta charset=utf-8>"))
                page.goto(entry)
                page.add_script_tag(url=base + "/src/transport.js")
                page.add_script_tag(url=base + "/src/services.js")
                cases = [c for c in CASES if not only or c[0] in only]
                samples = [page.evaluate(CHECK, case) for case in cases]
                for kind, source in [('video','recommend'), ('live','liveRooms')]:
                    if not only or source in only:
                        samples.append(page.evaluate(CURRENT_MEDIA, kind))
                browser.close()
        finally:
            host.shutdown()
            thread.join()
    return {"utc":datetime.now(timezone.utc).isoformat(),"scope":"Chromium → production adapter → loopback gateway → upstream. Anonymous read-only requests. No session or media URLs retained.","samples":samples}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    parser.add_argument("--only", nargs="+", choices=[op for op,_ in CASES])
    args = parser.parse_args()
    data = json.dumps(run(args.only), ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(data+"\n", encoding="utf-8")
    else:
        print(data)
