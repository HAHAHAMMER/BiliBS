"""Run from any directory. Requires Pillow, ffprobe, ffmpeg."""
from pathlib import Path
import concurrent.futures, json, hashlib, base64, tempfile, subprocess, io, collections
from PIL import Image
root=Path(__file__).resolve().parents[1]
def main():
 d=json.loads((root/'src/fixture-data.js').read_text(encoding='utf-8').removeprefix('window.BILIBS_FIXTURE=').strip().removesuffix(';'))
 images=[];media=[]
 for kind,items,fields in [('work',d['works'].values(),['cover','wide','still','hero']),('video',d['videos'],['wide'])]:
  for w in items:
   for f in fields:
    value=w.get(f,'');row=dict(kind=kind,id=w['id'],title=w['title'],slot=f)
    if not value.startswith('data:image/'):row['status']='缺少内嵌图片'
    else:
     try:
      b=base64.b64decode(value.split(',')[1]);im=Image.open(io.BytesIO(b));im.load();row.update(status='已解码',width=im.width,height=im.height,format=im.format)
     except Exception as ex:row.update(status=str(ex))
    images.append(row)
 for name in ['media','low','variantMedia']:
  for id,src in d[name].items():media.append((name,id,src))
 def run(m):
  bank,id,src=m
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'input.mp4';b=base64.b64decode(src.split(',')[1]);p.write_bytes(b)
   cmd=['ffprobe','-v','error','-show_entries','stream=codec_type,codec_name,width,height,avg_frame_rate,bit_rate,channels:format=duration','-of','json',str(p)]
   streams=json.loads(subprocess.check_output(cmd,timeout=20))
   res=subprocess.run(['ffmpeg','-nostdin','-threads','1','-v','error','-ss','1','-i',str(p),'-t','0.6','-threads','1','-f','null','-'],capture_output=True,timeout=25)
   return dict(bank=bank,id=id,bytes=len(b),sha256=hashlib.sha256(b).hexdigest(),decode=res.returncode==0 and not res.stderr.strip(),**streams)
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:out=list(pool.map(run,media))
 evidence=root/'verification/evidence';result={'images':images,'tracks':out,'method':'每个样片 ffprobe；从1秒起以 ffmpeg 解码0.6秒至空输出。图像由 Pillow 完整解码。'}
 with tempfile.TemporaryDirectory() as t:
  t=Path(t);inp=t/'demo.mp4';inp.write_bytes(base64.b64decode(d['media']['orbit'].split(',')[1]))
  containers={}
  for kind,flags,name in [('DASH',['-f','dash','-seg_duration','2'],'demo.mpd'),('HLS',['-f','hls','-hls_time','2'],'demo.m3u8')]:
   outp=t/name;a=subprocess.run(['ffmpeg','-y','-v','error','-i',str(inp),'-c','copy',*flags,str(outp)],capture_output=True)
   b=subprocess.run(['ffmpeg','-v','error','-i',str(outp),'-t','1','-f','null','-'],capture_output=True) if outp.exists() else None
   containers[kind]={'mux':a.returncode==0,'read_first_second':b is not None and b.returncode==0,'scope':'本机生成的分片与清单'}
  result['containers']=containers
 (evidence/'assets.json').write_text(json.dumps(result,ensure_ascii=False,indent=1),encoding='utf-8')
 print('图片',collections.Counter(i['status'] for i in images),'样片',len(out),'通过',sum(t['decode'] for t in out),result['containers'])
if __name__=='__main__':main()
