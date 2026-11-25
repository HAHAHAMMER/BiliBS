"""Read-only route samples for the production adapter, without accounts or playback URLs on disk."""
import concurrent.futures
import json
import urllib.error
import urllib.request
from datetime import datetime, timezone

API = "https://api.bilibili.com"
LIVE = "https://api.live.bilibili.com"
SAMPLES = {
    "weeklyIndex": API + "/x/web-interface/popular/series/list",
    "video": API + "/x/web-interface/view?bvid=BV1jJs16WEfE",
    "season": API + "/pgc/view/web/season?season_id=46089",
    "related": API + "/x/web-interface/archive/related?bvid=BV1jJs16WEfE",
    "nav": API + "/x/web-interface/nav",
    "history": API + "/x/web-interface/history/cursor?ps=20",
    "liveAreas": LIVE + "/room/v1/Area/getList",
    "liveRoom": LIVE + "/room/v1/Room/get_info?room_id=616",
}

def check(pair):
    op, endpoint = pair
    row = {"operation": op}
    try:
        req = urllib.request.Request(endpoint, headers={"User-Agent": "BiliBS/1.0 (anonymous read-only)"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            row["http"] = resp.status
            data = json.load(resp)
        row["code"] = data.get("code")
        result = data.get("data") or data.get("result")
        if isinstance(result, list):
            row["items"] = len(result)
        elif isinstance(result, dict):
            row["fields"] = list(result)[:6]
            row["challenge"] = bool(result.get("v_voucher"))
    except urllib.error.HTTPError as err:
        row["http"] = err.code
    except (ValueError, OSError) as err:
        row["error"] = type(err).__name__
    return row

if __name__ == "__main__":
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as workers:
        samples = list(workers.map(check, SAMPLES.items()))
    evidence = {"utc": datetime.now(timezone.utc).isoformat(), "scope": "anonymous, one read per route", "samples": samples}
    print(json.dumps(evidence, ensure_ascii=False, indent=2))
