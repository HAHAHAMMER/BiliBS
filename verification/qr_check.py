"""Decode each offline pairing image and compare against its displayed sample ID."""
from ctypes import CDLL, c_void_p, c_uint, c_ulong, c_int, c_char_p, create_string_buffer, cast
from ctypes.util import find_library
from pathlib import Path
from io import BytesIO
from PIL import Image
import json,base64
ROOT=Path(__file__).resolve().parents[1]
def main():
 lib=CDLL(find_library('zbar') or 'libzbar.so.0')
 def api(name,args,ret):
  f=getattr(lib,'zbar_'+name);f.argtypes=args;f.restype=ret;return f
 scan=api('image_scanner_create',[],c_void_p)();destroy_scan=api('image_scanner_destroy',[c_void_p],None)
 create=api('image_create',[],c_void_p);destroy=api('image_destroy',[c_void_p],None);fmt=api('image_set_format',[c_void_p,c_ulong],None);size=api('image_set_size',[c_void_p,c_uint,c_uint],None)
 setdata=api('image_set_data',[c_void_p,c_void_p,c_ulong,c_void_p],None);decode=api('scan_image',[c_void_p,c_void_p],c_int);symbol=api('image_first_symbol',[c_void_p],c_void_p);value=api('symbol_get_data',[c_void_p],c_char_p)
 d=json.loads((ROOT/'src/fixture-data.js').read_text(encoding='utf-8').removeprefix('window.BILIBS_FIXTURE=').strip().removesuffix(';'));out=[]
 try:
  for i,(number,uri) in enumerate(d['pair']):
   im=Image.open(BytesIO(base64.b64decode(uri.split(',')[1]))).convert('L');b=im.tobytes();ptr=create_string_buffer(b);z=create()
   try:
    fmt(z,int.from_bytes(b'Y800','little'));size(z,*im.size);setdata(z,cast(ptr,c_void_p),len(b),None)
    n=decode(scan,z);sym=symbol(z);decoded=value(sym).decode() if sym else ''
    out.append({'index':i+1,'size':im.size,'symbols':n,'matches_displayed_sample_id':number in decoded,'sample_only':True})
   finally:destroy(z)
 finally:destroy_scan(scan)
 (ROOT/'verification/evidence/qr.json').write_text(json.dumps(out,indent=1),encoding='utf-8');print(out)
if __name__=='__main__':main()
