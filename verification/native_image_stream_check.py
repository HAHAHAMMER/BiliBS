"""Execute the production image/media streams on the host JDK without Android."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / 'android/app/src/main/java/tv/bilibs/app/TrustedNetwork.java').read_text(encoding='utf-8')
stream = source.split('    private static final class ImageStream', 1)[1].split('    public WebResourceResponse image(', 1)[0]
program = '''
import java.io.*;
import java.net.*;
import javax.net.ssl.*;
import java.security.cert.Certificate;
public class ImageStreamCheck {
 private static final int IMAGE_LIMIT=64;
 private static IOException denied(){return new IOException("limit");}
 private static final class ImageStream'''+stream+'''
 static class Connection extends HttpsURLConnection {
  boolean disconnected;
  Connection() throws Exception {super(new URL("https://test.invalid/"));}
  public void connect(){} public void disconnect(){disconnected=true;}
  public boolean usingProxy(){return false;} public String getCipherSuite(){return "TEST";}
  public Certificate[] getLocalCertificates(){return null;}
  public Certificate[] getServerCertificates(){return null;}
 }
 static void check(boolean value){if(!value)throw new AssertionError();}
 public static void main(String[] args) throws Exception {
  Connection c=new Connection();
  ImageStream s=new ImageStream(new ByteArrayInputStream(new byte[64]),c);
  int count=0,n;byte[] buffer=new byte[9];
  while((n=s.read(buffer,0,buffer.length))>=0)count+=n;
  check(count==64&&c.disconnected&&s.read()==-1);
  c=new Connection();s=new ImageStream(new ByteArrayInputStream(new byte[65]),c);
  boolean denied=false;try{while(s.read(buffer,0,buffer.length)>=0){}}catch(IOException expected){denied=true;}
  check(denied&&c.disconnected);
  c=new Connection();s=new ImageStream(new ByteArrayInputStream(new byte[65]),c);
  denied=false;try{s.skip(65);}catch(IOException expected){denied=true;}
  check(denied&&c.disconnected);
  c=new Connection();s=new ImageStream(new ByteArrayInputStream(new byte[20]),c);
  check(s.read(buffer,0,0)==0);s.read();s.close();check(c.disconnected&&s.read()==-1);
  check(s.available()==0);
  c=new Connection();
  byte[] media={10,11,12,13};
  MediaStream m=new MediaStream(new ByteArrayInputStream(media),c,100000,4,200000);
  check(m.available()==200000);
  check(m.skip(60000)==60000&&m.skip(40000)==40000);
  check(m.read()==10&&m.read(buffer,0,buffer.length)==3&&buffer[0]==11&&m.read()==-1);
  check(c.disconnected&&m.available()==0);
  c=new Connection();m=new MediaStream(new ByteArrayInputStream(media),c,0,4,4);
  check(m.skip(2)==2&&m.read()==12&&m.read()==13&&m.read()==-1&&c.disconnected);
  c=new Connection();m=new MediaStream(new ByteArrayInputStream(media),c,0,-1,-1);
  check(m.available()==0&&m.read(buffer,0,0)==0&&m.read(buffer,0,9)==4&&m.read()==-1&&c.disconnected);
  c=new Connection();m=new MediaStream(new ByteArrayInputStream(media),c,3000000000L,4,4000000000L);
  check(m.available()==0&&m.skip(3000000000L)==3000000000L&&m.read()==10);
  m.close();check(c.disconnected&&m.available()==0&&m.read()==-1);
  System.out.println("PASS native streams: image limit, oversize, skip, early close, EOF; media range skip once, exact bytes, unknown/large length, connection release");
 }
}
'''
java = str(Path(os.environ['JAVA_HOME']) / 'bin/java.exe') if os.environ.get('JAVA_HOME') and os.name == 'nt' else shutil.which('java')
if not java:
    raise SystemExit('Set JAVA_HOME or put the JDK on PATH')
with tempfile.TemporaryDirectory(prefix='bilibs-image-check-') as directory:
    file = Path(directory) / 'ImageStreamCheck.java'
    file.write_text(program, encoding='utf-8')
    subprocess.run([java, '-m', 'jdk.compiler/com.sun.tools.javac.Main', str(file)], check=True)
    subprocess.run([java, '-cp', directory, 'ImageStreamCheck'], check=True)
