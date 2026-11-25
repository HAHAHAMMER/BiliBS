"""Anonymous, read-only checks. Public website responses and application OAuth are distinct."""
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError
from urllib.parse import urlsplit, urlencode
from datetime import datetime,timezone
from concurrent.futures import ThreadPoolExecutor
import json, io, time, re, os
from lxml import html
from PIL import Image
root=Path(__file__).resolve().parents[1];h=html.fromstring((root/'verification/reference/prior-api.html').read_text(encoding='utf-8'))
A='https://api.bilibili.com';L='https://api.live.bilibili.com'
def get(url):
 try:
  with urlopen(Request(url,headers={'User-Agent':'BiliBS/0.1 feasibility (anonymous read-only)'}),timeout=10) as r:
   return r.status,r.headers.get_content_type(),r.read(10*1024*1024)
 except HTTPError as exc:return exc.code,exc.headers.get_content_type(),b''
 except Exception as exc:return 0,type(exc).__name__,b''
def main():
 links=[el.get('href') for el in h.xpath('//a[@href]')]
 def prior(s,token=''):
  return next(u for u in links if s in u and token in u)
 catalog=prior('season_version=')
 selected=[('REC',prior('/top/feed/rcmd')),('HOT',prior('/web-interface/popular?')),('WEEK',A+'/x/web-interface/popular/series/list'),('REG',prior('/ranking/v2?rid=36')),('RANK',A+'/pgc/web/rank/list?day=3&season_type=1'),('CATALOG',catalog),('PGC',prior('/pgc/view/web/season')),('PGCMEDIA',prior('/pgc/review/user')),('UGC',A+'/x/web-interface/view?bvid=BV1jJs16WEfE'),('UGCPLAY',prior('/x/player/playurl')),('PGCPLAY',prior('/pgc/player/web/playurl')),('RELATED',A+'/x/web-interface/archive/related?bvid=BV1jJs16WEfE'),('SEARCH',prior('/search/type')),('LIVE',prior('/room/v1/Area/getList')),('LIVELIST',prior('getListByArea') if any('getListByArea' in u for u in links) else L+'/xlive/web-interface/v1/second/getList?parent_area_id=2&page=1'),('LIVEPLAY',L+'/xlive/web-room/v2/index/getRoomPlayInfo?room_id=3&protocol=0,1&format=0,1,2&codec=0,1&qn=80&platform=web'),('FEED',prior('/feed/all')),('HISTORY',prior('/history/cursor')),('LATER',prior('/history/toview')),('AUTH',A+'/x/web-interface/nav'),('DANMAKU',A+'/x/v1/dm/list.so?oid=43703273798'),('OPEN', 'https://open.bilibili.com/doc/')]
 def probe(it):
  key,url=it;status,ctype,buf=get(url);res=dict(key=key,url=url,http=status,content_type=ctype,bytes=len(buf))
  if buf:
   try:
    obj=json.loads(buf);res['business_code']=obj.get('code');res['message']=str(obj.get('message',''))[:110]
    data=obj.get('data') or obj.get('result');res['fields']=list(data)[:22] if isinstance(data,dict) else []
    if isinstance(data,dict):
     res['arrays']={k:len(v) for k,v in data.items() if isinstance(v,list)}
     dash=data.get('dash') or {};res['addressed_tracks']={k:sum(bool(x.get('baseUrl') or x.get('base_url')) for x in dash.get(k,[]) if isinstance(x,dict)) for k in ('audio','video')} if dash else {}
   except (ValueError,AttributeError):res['recognized_xml']=buf.lstrip().startswith((b'<?xml',b'<i>'))
  return res
 # Sample one stable field per named input. No cookies, signed requests or remote mutations.
 with ThreadPoolExecutor(max_workers=3) as ex:api=list(ex.map(probe,selected))
 art=[]
 for tr in h.xpath('//tr[td/a]'):
  urls=tr.xpath('.//a/@href')
  if not any('pgc/view/web/season' in u for u in urls):continue
  name=tr.xpath('string(td[1])');url=next((u for u in urls if 'hdslb.com' in u),None)
  if url:art.append((name,url))
 def image(it):
  name,url=it;status,ctype,buf=get(url);row={'title':name,'url':url,'http':status}
  if buf:
   try:
    im=Image.open(io.BytesIO(buf));im.load();row.update(width=im.width,height=im.height,decoded=True)
   except Exception:row['decoded']=False
  return row
 with ThreadPoolExecutor(max_workers=2) as ex:art=list(ex.map(image,art))
 out={'checked_at':datetime.now(timezone.utc).isoformat(),'scope':'本次网络出口；匿名；单次只读，不保存账户、Cookie或临时流地址。','api':api,'artwork':art}
 (root/'verification/evidence/network.json').write_text(json.dumps(out,ensure_ascii=False,indent=1),encoding='utf-8')
 print([(r['key'],r['http'],r.get('business_code')) for r in api],len(art),sum(bool(r.get('decoded')) for r in art))
if __name__=='__main__':main()
