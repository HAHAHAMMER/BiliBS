"""Public samples only. Byte-range probes keep only aggregate diagnostics."""
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from concurrent.futures import ThreadPoolExecutor
import zlib,gzip,json,io,tempfile,subprocess,collections
from PIL import Image
from lxml import etree
from network_check import root,h,get,A,L
ev=root/'verification/evidence'
def data(url):
 st,typ,raw=get(url)
 try:obj=json.loads(raw)
 except ValueError:obj={}
 return st,obj.get('code'),obj.get('data') if 'data' in obj else obj.get('result')
def framesample(t):
 url=t.get('baseUrl') or t.get('base_url')
 res={'codec':t.get('codecs'),'quality':t.get('id'),'has_url':bool(url)}
 if not url:return res
 try:
  with urlopen(Request(url,headers={'Range':'bytes=0-524287','User-Agent':'BiliBS/0.1 feasibility (anonymous read-only)'}),timeout=12) as r:
   b=r.read(524288);res.update(http=r.status,bytes=len(b))
  with tempfile.TemporaryDirectory() as tmp:
   f=Path(tmp)/'sample.m4s';f.write_bytes(b)
   p=subprocess.run(['ffmpeg','-v','error','-i',str(f),'-t','0.2','-f','framemd5','-'],capture_output=True,timeout=18)
   res['decoded_units']=sum(line[:1].isdigit() for line in p.stdout.decode(errors='ignore').splitlines())
 except HTTPError as ex:res['http']=ex.code
 except Exception as ex:res['error_type']=type(ex).__name__
 return res
def main():
 net=json.loads((ev/'network.json').read_text(encoding='utf-8'));urls={r['key']:r['url'] for r in net['api']}
 catalog=urls['CATALOG'];o={'art':[],'play':[],'catalogs':{},'regions':{},'services':{}}
 def pic(row):
  name=row.xpath('string(td[1])');u=next(u for u in row.xpath('.//a/@href') if 'pgc/view/web/season' in u);st,code,d=data(u);res={'work':name,'season_url':u,'http':st,'code':code}
  if isinstance(d,dict):
   sid=d.get('season_id');season=next((s for s in d.get('seasons',[]) if s.get('season_id')==sid),{})
   for key,url in [('portrait',d.get('cover')),('season169',season.get('horizontal_cover_169')),('backdrop',d.get('bkg_cover')),('episode',next(iter(d.get('episodes') or [{}])).get('cover'))]:
    info={'exists':bool(url)};res[key]=info
    if url:
     if url.startswith('//'):url='https:'+url
     st,ct,b=get(url);info['http']=st
     if b:
      try:im=Image.open(io.BytesIO(b));im.load();info['size']=[im.width,im.height]
      except Exception:pass
  return res
 rows=[r for r in h.xpath('//tr[td/a]') if any('/pgc/view/web/season?' in u for u in r.xpath('.//a/@href'))]
 with ThreadPoolExecutor(max_workers=2) as ex:o['art']=list(ex.map(pic,rows))
 for key,u in [('普通投稿',urls['UGCPLAY']),('电视剧',next(u for u in h.xpath('//a/@href') if 'playurl?ep_id=340226' in u)),('番剧',urls['PGCPLAY']),('电影',next(u for u in h.xpath('//a/@href') if 'playurl?ep_id=1364037' in u))]:
  st,code,d=data(u);dash=(d or {}).get('dash') or {};res={'sample':key,'http':st,'code':code,'video_tracks':len(dash.get('video',[])),'audio_tracks':len(dash.get('audio',[]))}
  for kind in ['video','audio']:
   a=[t for t in dash.get(kind,[]) if kind=='audio' or t.get('codecs','').startswith('avc')];a.sort(key=lambda t:t.get('bandwidth',0))
   if a:res[kind]=framesample(a[0])
  o['play'].append(res)
 for key,n in [('番剧',1),('电影',2),('纪录片',3),('国创',4),('电视剧',5),('综艺',7)]:
  st,c,d=data(catalog.replace('st=2&','st='+str(n)+'&').replace('season_type=2&','season_type='+str(n)+'&'));a=(d or {}).get('list') or [];o['catalogs'][key]={'http':st,'code':c,'count':len(a),'sample_fields':list(a[0])[:23] if a else []}
 legacy={'知识':36,'科技':188,'数码':95,'影视':181,'动画':1,'游戏':4,'音乐':3,'生活':160,'美食':211,'舞蹈':129,'体育运动':234,'汽车':223,'旅游':160,'娱乐':5,'动物':217,'时尚':155,'鬼畜':119,'资讯':202,'纪录片':177,'综艺':71}
 for key,n in legacy.items():
  if key=='旅游':o['regions'][key]={'status':'未采用生活区代填；缺独立已确认映射'};continue
  u=A+'/x/web-interface/ranking/v2?'+urlencode({'rid':n,'type':'all'});st,c,d=data(u);xs=(d or {}).get('list') if isinstance(d,dict) else []
  o['regions'][key]={'candidate_rid':n,'http':st,'code':c,'count':len(xs or []),'first_tid':[(v.get('tid'),v.get('tname')) for v in (xs or [])[:2]]}
 st,c,d=data(urls['UGC']);mid=(d or {}).get('owner',{}).get('mid');aid=(d or {}).get('aid');cid=(d or {}).get('cid')
 tests={'WEEK-LIST':urls['WEEK'],'RELATED':urls['RELATED'],'LIVE-AREAS':urls['LIVE'],'ROOM':urls['LIVEPLAY']}
 st,c,week=data(urls['WEEK']);first=(week or {}).get('list') or []
 if first:tests['WEEK-ISSUE']=A+'/x/web-interface/popular/series/one?number='+str(first[0]['number'])
 if mid:
  tests.update({'AUTHOR':A+'/x/space/wbi/acc/info?mid='+str(mid),'FOLLOW':A+'/x/relation?fid='+str(mid),'FAV':A+'/x/v3/fav/folder/created/list-all?up_mid='+str(mid),'SHELF':A+'/x/space/bangumi/follow/list?'+urlencode({'vmid':mid,'type':1,'pn':1,'ps':2})})
 if aid:tests['LIKE']=A+'/x/web-interface/archive/has/like?aid='+str(aid)
 for key,url in tests.items():
  st,c,d=data(url);r={'http':st,'code':c,'url':url}
  if isinstance(d,dict):
   r['fields']=list(d.keys())[:18];r['list_items']=len(d.get('list') or []);r['voucher']='v_voucher' in d
   if key=='ROOM':r.update(live_status=d.get('live_status'),has_playurl=bool((d.get('playurl_info') or {}).get('playurl')))
  elif isinstance(d,list):r['list_items']=len(d);r['first_fields']=list(d[0])[:14] if d and isinstance(d[0],dict) else []
  o['services'][key]=r
 st,ct,buf=get(urls['DANMAKU']);variants=[buf]
 for w in [15,-15,31]:
  try:variants.append(zlib.decompress(buf,w))
  except zlib.error:pass
 for content in variants:
  try:
   xml=etree.fromstring(content,parser=etree.XMLParser(resolve_entities=False,no_network=True));break
  except (etree.XMLSyntaxError,ValueError):xml=None
 o['danmaku']={'http':st,'mime':ct,'parsed_root':xml.tag if xml is not None else None,'items':len(xml.findall('d')) if xml is not None else 0}
 (ev/'resources.json').write_text(json.dumps(o,ensure_ascii=False,indent=1),encoding='utf-8')
 print('art',len(o['art']),'play',o['play'],'rooms',o['services']['ROOM'],'danmaku',o['danmaku'])
if __name__=='__main__':main()
