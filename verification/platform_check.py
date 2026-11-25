"""Inspect published Android AAR payloads without installing an Android device."""
from pathlib import Path
from urllib.request import urlopen,Request
from urllib.error import HTTPError
from zipfile import ZipFile
from io import BytesIO
import json,shutil
from concurrent.futures import ThreadPoolExecutor
E=Path(__file__).resolve().parent/'evidence'
items=[
 ('TV Material','androidx/tv/tv-material/1.0.0/tv-material-1.0.0.aar',['/CardKt.class','/ButtonKt.class']),
 ('Media3 ExoPlayer','androidx/media3/media3-exoplayer/1.8.0/media3-exoplayer-1.8.0.aar',['/ExoPlayer.class','/DefaultTrackSelector.class']),
 ('Media3 DASH','androidx/media3/media3-exoplayer-dash/1.8.0/media3-exoplayer-dash-1.8.0.aar',['/DashMediaSource.class']),
 ('Media3 HLS','androidx/media3/media3-exoplayer-hls/1.8.0/media3-exoplayer-hls-1.8.0.aar',['/HlsMediaSource.class']),
 ('Media3 common','androidx/media3/media3-common/1.8.0/media3-common-1.8.0.aar',['/Player.class','/TrackSelectionParameters.class'])]
def check(x):
 name,path,symbols=x;url='https://dl.google.com/dl/android/maven2/'+path;row={'name':name,'url':url}
 try:
  with urlopen(Request(url,headers={'User-Agent':'BiliBS/0.1 feasibility'}),timeout=18) as r:
   row['http']=r.status;buf=r.read(12_000_000)
  with ZipFile(BytesIO(buf)) as a,ZipFile(BytesIO(a.read('classes.jar'))) as jar:
   row['symbols']={s:any(n.endswith(s) for n in jar.namelist()) for s in symbols}
 except HTTPError as ex:row['http']=ex.code
 except Exception as ex:row['error']=type(ex).__name__
 return row
if __name__=='__main__':
 with ThreadPoolExecutor(max_workers=3) as pool:rows=list(pool.map(check,items))
 doc={'aar':rows,'tools':{p:bool(shutil.which(p)) for p in ['adb','sdkmanager','gradle','ffmpeg','ffprobe','node']},'kvm':Path('/dev/kvm').exists(),'scope':'工件可取得且包含指定类；不代表已编译原生客户端或电视实机运行。'}
 (E/'android.json').write_text(json.dumps(doc,ensure_ascii=False,indent=1),encoding='utf-8');print([(r['name'],r.get('http'),r.get('symbols')) for r in rows])
