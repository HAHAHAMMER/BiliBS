"""One published room + up to two room IDs from the public live home, no credentials."""
from network_check import root,get,L
from urllib.parse import urlsplit
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from lxml import html
import json,re
def main():
 st,ct,buf=get('https://live.bilibili.com/');home_http=st;s=buf.decode(errors='replace')
 ids=['616']
 if st==200:
  doc=html.fromstring(s)
  for href in doc.xpath('//a/@href'):
   m=re.fullmatch(r'(?:(?:https?:)?//live\.bilibili\.com)?/(\d+)(?:[?#].*)?',href)
   if m and m[1] not in ids:ids.append(m[1])
   if len(ids)>=3:break
 rows=[]
 for rid in ids:
  st,ct,b=get(L+'/xlive/web-room/v2/index/getRoomPlayInfo?room_id='+rid+'&protocol=0,1&format=0,1,2&codec=0,1&qn=80&platform=web')
  try: j=json.loads(b)
  except ValueError:j={}
  d=j.get('data') or {};p=(d.get('playurl_info') or {}).get('playurl') or {};row=dict(room=rid,http=st,code=j.get('code'),live_status=d.get('live_status'),formats=[]);candidates=[]
  for stream in p.get('stream') or []:
   for fmt in stream.get('format',[]):
    for c in fmt.get('codec',[]):
     infos=c.get('url_info') or [];row['formats'].append([fmt.get('format_name'),c.get('codec_name'),c.get('current_qn'),len(infos)])
     if infos and c.get('base_url'):
      t=infos[0];candidates.append((fmt.get('format_name'),t.get('host','')+c['base_url']+t.get('extra','')))
  if candidates:
   kind,u=next((i for i in candidates if i[0] in ['fmp4','ts']),candidates[0])
   try:
    with urlopen(Request(u,headers={'User-Agent':'BiliBS/0.1 feasibility','Range':'bytes=0-32767'}),timeout=9) as r:
     bb=r.read(32768);row['stream_sample']={'http':r.status,'bytes':len(bb),'hls_header':bb.startswith(b'#EXTM3U'),'flv_header':bb.startswith(b'FLV')}
   except HTTPError as ex:row['stream_sample']={'http':ex.code}
   except Exception as ex:row['stream_sample']={'error_type':type(ex).__name__}
  rows.append(row)
  if candidates:break
 (root/'verification/evidence/live.json').write_text(json.dumps({'home_http':home_http,'rooms':rows},ensure_ascii=False,indent=1),encoding='utf-8');print(rows)
if __name__=='__main__':main()
