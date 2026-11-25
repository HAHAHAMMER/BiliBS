package tv.bilibs.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.WebResourceResponse;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.*;
import java.util.regex.*;
import java.util.zip.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;

/** Native-only credential vault and transport for the bundled local page. */
public final class TrustedNetwork {
    private static final String IMAGE_PREFIX="/__bs/image/";
    private static final int IMAGE_LIMIT=8*1024*1024;
    private static final Pattern IMAGE=Pattern.compile("i[012]\\.hdslb\\.com/bfs/(?:[A-Za-z0-9_-]+/)+[A-Za-z0-9_.-]+\\.(?:jpe?g|png|webp|gif|avif)(?:@[A-Za-z0-9_.!-]+)?",Pattern.CASE_INSENSITIVE);
    private static final int LIMIT = 12 * 1024 * 1024;
    private static final String KEY = "tv.bilibs.session.aes";
    private static final String QR = "/x/passport-login/web/qrcode/";
    private static final Pattern HLS_URI = Pattern.compile("(?<![A-Z0-9-])URI=\"([^\"]+)\"");
    private static final Pattern RANGE = Pattern.compile("bytes=(?:[0-9]{1,19}-[0-9]{0,19}|-[0-9]{1,19})");
    private static final Set<String> PRIVATE = new HashSet<>(Arrays.asList(
        "sessdata","bili_jct","refresh_token","access_token","access_key","cookie","cookie_info"));
    private static final Set<String> MIME = new HashSet<>(Arrays.asList(
        "video/mp4","audio/mp4","video/x-flv","video/mp2t","audio/aac","video/iso.segment",
        "audio/iso.segment","video/webm","audio/webm","application/octet-stream"));
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Object LOCK = new Object();
    private static long epoch;
    private long version;
    private boolean loaded, closed;
    private final Context app;
    private JSONObject policy;
    private final Map<String,JSONObject> cookies = new HashMap<>();
    private final Map<String,String> ids = new HashMap<>();
    private final LinkedHashMap<String,String> grants = new LinkedHashMap<>(64,.75f,true);
    private String qrKey, qrHandle;
    private long qrVersion, accountVersion;
    private long qrUntil;

    public TrustedNetwork(Context context) {
        app = context.getApplicationContext();
        synchronized (LOCK) { version = ++epoch; }
    }
    private static IOException denied() { return new IOException("Request unavailable"); }
    private void active(long snapshot) throws IOException {
        if (closed || version != epoch || snapshot != version) throw denied();
    }
    private static byte[] read(InputStream input) throws IOException {
        return read(input,LIMIT);
    }
    private static byte[] read(InputStream input,int limit) throws IOException {
        try (InputStream in = input; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16384];
            int size;
            while ((size = in.read(buffer)) != -1) {
                if (out.size() > limit - size) throw denied();
                out.write(buffer,0,size);
            }
            return out.toByteArray();
        }
    }
    private static String utf8(byte[] bytes) { return new String(bytes, StandardCharsets.UTF_8); }
    private SharedPreferences prefs() { return app.getSharedPreferences("bilibs_vault",Context.MODE_PRIVATE); }
    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY)) return (SecretKey)store.getKey(KEY,null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    private void load() throws Exception {
        active(version);
        if (loaded) return;
        policy = new JSONObject(utf8(read(app.getAssets().open("src/transport-policy.json"))));
        String value = prefs().getString("session","");
        if (!value.isEmpty()) {
            try {
                String[] parts = value.split("\\.",2);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128, Base64.decode(parts[0],Base64.NO_WRAP)));
                JSONObject stored = new JSONObject(utf8(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP))));
                Iterator<String> names = stored.keys();
                while(names.hasNext()) {
                    String name = names.next();
                    JSONObject item = stored.getJSONObject(name);
                    if (item.optLong("end") > System.currentTimeMillis()) cookies.put(name,item);
                }
            } catch (Exception unreadable) {
                cookies.clear();
                if (!prefs().edit().clear().commit()) throw denied();
            }
        }
        loaded = true;
    }
    private void persist() throws Exception {
        JSONObject stored = new JSONObject();
        long now = System.currentTimeMillis();
        for (Map.Entry<String,JSONObject> item:cookies.entrySet()) {
            if (item.getValue().optLong("end") > now) stored.put(item.getKey(),item.getValue());
        }
        if (stored.length() == 0) {
            if (!prefs().edit().clear().commit()) throw denied();
            return;
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE,key());
        byte[] encrypted = cipher.doFinal(stored.toString().getBytes(StandardCharsets.UTF_8));
        String text = Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+"."+Base64.encodeToString(encrypted,Base64.NO_WRAP);
        if (!prefs().edit().putString("session",text).commit()) throw denied();
    }
    private static boolean contains(JSONArray array,String value) {
        if (array == null) return false;
        for (int i=0;i<array.length();i++) if (value.equals(array.optString(i))) return true;
        return false;
    }
    private static URI safe(String url) throws Exception {
        if (url.length()>16384 || url.indexOf('\\')>=0) throw denied();
        URI uri = new URI(url);
        if (!"https".equals(uri.getScheme()) || uri.getHost()==null || !uri.getHost().equals(uri.getRawAuthority())
                || uri.getFragment()!=null || !uri.getRawPath().startsWith("/")) throw denied();
        return uri;
    }
    private String cdn(String raw) {
        if (raw==null) return null;
        String value = raw.startsWith("//") ? "https:"+raw : raw.startsWith("http://") ? "https:"+raw.substring(5) : raw;
        try {
            URI uri = safe(value);
            JSONArray suffixes = policy.getJSONArray("cdn");
            for (int i=0;i<suffixes.length();i++) {
                String s = suffixes.getString(i);
                if (uri.getHost().equals(s) || uri.getHost().endsWith("."+s)) return value;
            }
        } catch (Exception ignored) { }
        return null;
    }
    private static HttpsURLConnection connect(URI uri,String method) throws Exception {
        HttpsURLConnection c = (HttpsURLConnection)uri.toURL().openConnection();
        c.setInstanceFollowRedirects(false);
        c.setRequestMethod(method);
        c.setUseCaches(false);
        c.setConnectTimeout(10000);
        c.setReadTimeout(12000);
        c.setRequestProperty("User-Agent","Mozilla/5.0 (compatible; BiliBS/1.0; TV client)");
        c.setRequestProperty("Referer","https://www.bilibili.com/");
        c.setRequestProperty("Accept-Encoding","identity");
        return c;
    }
    private static String decode(HttpsURLConnection response,String path) throws Exception {
        byte[] data = read(response.getInputStream());
        String enc = response.getContentEncoding();
        if ("gzip".equalsIgnoreCase(enc) || (data.length>=2 && data[0]==31 && data[1]==(byte)139))
            data=read(new GZIPInputStream(new ByteArrayInputStream(data)));
        else if ("deflate".equalsIgnoreCase(enc) || (path.endsWith("/list.so") && !utf8(data).trim().startsWith("<"))) {
            boolean zlib = data.length>=2 && ((data[0]&15)==8) && ((((data[0]&255)<<8)+(data[1]&255))%31==0);
            Inflater inflater = new Inflater(!zlib);
            try { data=read(new InflaterInputStream(new ByteArrayInputStream(data),inflater)); }
            finally { inflater.end(); }
        } else if (enc!=null && !enc.isEmpty() && !"identity".equalsIgnoreCase(enc)) throw denied();
        return utf8(data).replaceFirst("^\uFEFF","");
    }
    private static String field(String text) throws Exception { return URLDecoder.decode(text,"UTF-8"); }
    private static void checkFields(String text) throws Exception {
        if (text==null || text.isEmpty()) return;
        String[] pairs = text.split("&",-1);
        if (pairs.length>128) throw denied();
        for (String part:pairs) {
            String k = field(part.split("=",2)[0]).toLowerCase(Locale.ROOT);
            if (PRIVATE.contains(k) || Arrays.asList("csrf","csrf_token","jsonp","callback").contains(k)) throw denied();
        }
    }
    private static boolean domainMatch(String host,String domain) {
        return host.equals(domain)||host.endsWith("."+domain);
    }
    private void readCookies(URI uri, HttpsURLConnection response) throws Exception {
        boolean changed = false;
        long now = System.currentTimeMillis();
        for (Map.Entry<String,List<String>> header:response.getHeaderFields().entrySet()) {
            if (!"set-cookie".equalsIgnoreCase(header.getKey())) continue;
            for (String line:header.getValue()) {
                List<HttpCookie> parsed;
                try { parsed=HttpCookie.parse(line); } catch(IllegalArgumentException badCookie) { continue; }
                for (HttpCookie cookie:parsed) {
                    String name = cookie.getName(), val = cookie.getValue();
                    String domain = cookie.getDomain();
                    boolean hostOnly = domain==null;
                    domain = hostOnly ? uri.getHost() : domain.replaceFirst("^\\.","").toLowerCase(Locale.ROOT);
                    if (!domainMatch(uri.getHost(),domain) || !domainMatch(domain,"bilibili.com")
                            || !name.matches("[A-Za-z0-9_!#$%&'*+.^|~-]+") || val==null || val.length()>8192
                            || val.indexOf(';')>=0 || val.indexOf('\r')>=0 || val.indexOf('\n')>=0) continue;
                    String path = cookie.getPath();
                    if (path==null || !path.startsWith("/")) {
                        String raw = uri.getRawPath();
                        path = raw.substring(0,Math.max(raw.lastIndexOf('/'),1));
                    }
                    long age = cookie.getMaxAge();
                    String id = name+"\n"+domain+"\n"+path;
                    if (age==0) cookies.remove(id);
                    else if (cookies.containsKey(id) || cookies.size()<256) {
                        JSONObject item = new JSONObject().put("name",name).put("value",val).put("domain",domain)
                            .put("hostOnly",hostOnly).put("path",path).put("end",age<0 ? -1L : now+1000L*Math.min(age,315360000L));
                        cookies.put(id,item);
                    }
                    changed = true;
                }
            }
        }
        if (changed) persist();
    }
    private Map<String,String> cookiesFor(URI uri) throws Exception {
        long now = System.currentTimeMillis();
        List<JSONObject> sorted = new ArrayList<>(cookies.values());
        Collections.sort(sorted,(a,b) -> Integer.compare(b.optString("path").length(),a.optString("path").length()));
        Map<String,String> result = new LinkedHashMap<>();
        for (JSONObject c:sorted) {
            long end = c.getLong("end");
            String domain=c.getString("domain"), path=c.getString("path");
            if (end>=0 && now>=end) continue;
            if (!(c.getBoolean("hostOnly") ? uri.getHost().equals(domain) : domainMatch(uri.getHost(),domain))) continue;
            if (!uri.getRawPath().equals(path) && !uri.getRawPath().startsWith(path.endsWith("/")?path:path+"/")) continue;
            if (!result.containsKey(c.getString("name"))) result.put(c.getString("name"),c.getString("value"));
        }
        return result;
    }
    private static String opaque() {
        byte[] bytes=new byte[24];
        RANDOM.nextBytes(bytes);
        return Base64.encodeToString(bytes,Base64.URL_SAFE|Base64.NO_PADDING|Base64.NO_WRAP);
    }
    private String grant(String raw) throws Exception {
        String url = cdn(raw);
        if (url==null) throw denied();
        String token = grants.get(url);
        if (token!=null) return token;
        token = opaque();
        grants.put(url,token); ids.put(token,url);
        if (grants.size()>8192) {
            Iterator<Map.Entry<String,String>> iterator = grants.entrySet().iterator();
            ids.remove(iterator.next().getValue()); iterator.remove();
        }
        return token;
    }
    private static final String MEDIA_REFERENCE="https://bilibs-media.invalid";
    private String reference(JSONObject output,String raw,boolean blocked) throws Exception {
        String url=blocked?null:cdn(raw);
        if (url==null) return "";
        String token=grant(url), local=MEDIA_REFERENCE+"/__bs/media/"+token;
        output.put(local,token);
        return local;
    }
    private static boolean enabled(JSONObject node,String name) {
        Object value=node.opt(name);
        if(value==null || value==JSONObject.NULL || Boolean.FALSE.equals(value) || "0".equals(value.toString()) ||
           "".equals(value.toString()) || "false".equals(value.toString())) return false;
        if(value instanceof JSONArray) return ((JSONArray)value).length()>0;
        if(value instanceof JSONObject) return ((JSONObject)value).length()>0;
        if(value instanceof Number) return ((Number)value).doubleValue()!=0;
        return true;
    }
    private void walk(Object obj,JSONObject output,int depth,boolean blocked) throws Exception {
        if(depth>64) throw denied();
        if (obj instanceof JSONArray) {
            JSONArray arr=(JSONArray)obj;
            for(int i=0;i<arr.length();i++) walk(arr.opt(i),output,depth+1,blocked);
            return;
        }
        if (!(obj instanceof JSONObject)) return;
        JSONObject node=(JSONObject)obj;
        for(String flag:Arrays.asList("is_drm","drm_tech_type","drm_kid","drm","is_locked","is_hidden"))
            blocked |= enabled(node,flag);
        blocked |= enabled(node,"encrypted") && !enabled(node,"pwd_verified");
        JSONArray info=node.optJSONArray("url_info");
        boolean live=node.opt("base_url") instanceof String && info!=null;
        if (live) {
            String base=node.getString("base_url");
            for(int i=0;i<info.length();i++) {
                JSONObject source=info.optJSONObject(i);
                if(source==null) continue;
                String url=source.optString("host","")+base+source.optString("extra","");
                String local=reference(output,url,blocked);
                source.put("host",local.isEmpty()?"":MEDIA_REFERENCE);
                source.put("extra",local.substring(local.lastIndexOf('/')+1));
            }
            node.put("base_url","/__bs/media/");
        }
        Iterator<String> names=node.keys();
        while(names.hasNext()) {
            String k=names.next();
            Object value=node.opt(k);
            if(live && (k.equals("base_url") || k.equals("url_info"))) continue;
            if ((k.equals("url")||k.equals("baseUrl")||k.equals("base_url")) && value instanceof String)
                node.put(k,reference(output,(String)value,blocked));
            else if ((k.equals("backupUrl")||k.equals("backup_url")) && value instanceof JSONArray) {
                JSONArray backups=(JSONArray)value, mapped=new JSONArray();
                for(int i=0;i<backups.length();i++) {
                    String local=reference(output,backups.optString(i),blocked);
                    if(!local.isEmpty()) mapped.put(local);
                }
                node.put(k,mapped);
            } else walk(value,output,depth+1,blocked);
        }
    }
    private static void sanitize(Object obj,int depth) throws Exception {
        if (depth>96) throw denied();
        if (obj instanceof JSONObject) {
            JSONObject node=(JSONObject)obj;
            Iterator<String> it=node.keys();
            while(it.hasNext()) {
                String name=it.next();
                if(PRIVATE.contains(name.toLowerCase(Locale.ROOT))) it.remove();
                else sanitize(node.opt(name),depth+1);
            }
        } else if (obj instanceof JSONArray) {
            JSONArray arr=(JSONArray)obj;
            for(int i=0;i<arr.length();i++) sanitize(arr.opt(i),depth+1);
        }
    }
    private static JSONObject select(JSONObject input,String... keys) throws JSONException {
        JSONObject out=new JSONObject();
        for(String key:keys) if(input.has(key)) out.put(key,input.get(key));
        return out;
    }
    private static String pack(int status,String body,String mime,JSONObject grants) throws JSONException {
        return new JSONObject().put("status",status).put("body",body)
            .put("headers",new JSONObject().put("Content-Type",mime)).put("media",grants).toString();
    }
    public String request(String input) throws Exception {
        if(input==null || input.length()>65536) throw denied();
        JSONObject spec=new JSONObject(input);
        if (spec.length()==1 && "cancelQr".equals(spec.optString("control"))) {
            synchronized(LOCK) { active(version); qrKey=null; qrHandle=null; qrVersion++; }
            return pack(200,"{}","application/json",null);
        }
        URI uri=safe(spec.getString("url"));
        String method=spec.optString("method","GET"), path=uri.getRawPath();
        String form=spec.optString("body","");
        String query=uri.getRawQuery();
        checkFields(query);
        Map<String,String> cookieValues;
        long snapshot, qrSnapshot, accountSnapshot;
        synchronized(LOCK) {
            load(); snapshot=version; accountSnapshot=accountVersion;
            JSONObject hosts=policy.optJSONObject(method);
            if(hosts==null || !contains(hosts.optJSONArray(uri.getHost()),path)) throw denied();
            JSONObject headers=spec.optJSONObject("headers");
            if(spec.has("headers") && headers==null) throw denied();
            if(headers!=null) {
                Iterator<String> it=headers.keys();
                while(it.hasNext()) {
                    String h=it.next();
                    if(!h.equalsIgnoreCase("Content-Type") ||
                        !headers.getString(h).split(";",2)[0].trim().equalsIgnoreCase("application/x-www-form-urlencoded")) throw denied();
                }
            }
            if(path.equals(QR+"generate")) {
                if(query!=null) throw denied();
                qrKey=null; qrHandle=null; qrVersion++;
            }
            qrSnapshot=qrVersion;
            if(path.equals(QR+"poll")) {
                if(qrKey==null || System.currentTimeMillis()>qrUntil || query==null || !query.equals("qrcode_key="+qrHandle)) throw denied();
                uri=safe("https://"+uri.getHost()+path+"?qrcode_key="+URLEncoder.encode(qrKey,"UTF-8"));
            }
            cookieValues=cookiesFor(uri);
        }
        if("POST".equals(method)) {
            if(query!=null) throw denied();
            checkFields(form);
            String csrf=cookieValues.get("bili_jct");
            if(csrf==null) return pack(200,"{\"code\":-101,\"message\":\"请先登录\"}","application/json",null);
            String encoded=URLEncoder.encode(csrf,"UTF-8");
            form+=(form.isEmpty()?"":"&")+"csrf="+encoded+"&csrf_token="+encoded;
        } else if(!form.isEmpty()) throw denied();
        HttpsURLConnection c=connect(uri,method);
        try {
            if(!cookieValues.isEmpty()) {
                StringBuilder header=new StringBuilder();
                for(Map.Entry<String,String> entry:cookieValues.entrySet()) {
                    if(header.length()>0) header.append("; ");
                    header.append(entry.getKey()).append('=').append(entry.getValue());
                }
                c.setRequestProperty("Cookie",header.toString());
            }
            if("POST".equals(method)) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type","application/x-www-form-urlencoded");
                byte[] bytes=form.getBytes(StandardCharsets.UTF_8);
                c.setFixedLengthStreamingMode(bytes.length);
                try(OutputStream out=c.getOutputStream()) { out.write(bytes); }
            }
            int status=c.getResponseCode();
            if(status>=300 && status<400) throw denied();
            if(status<200 || status>=300) return pack(status,"{\"code\":-1,\"message\":\"平台请求失败\"}","application/json",null);
            String text=decode(c,path);
            synchronized(LOCK) {
                active(snapshot);
                if(accountSnapshot!=accountVersion || (path.startsWith(QR) && qrSnapshot!=qrVersion)) throw denied();
                if(path.endsWith("/list.so")) {
                    if(!text.trim().startsWith("<")) throw denied();
                    return pack(status,text,"application/xml",null);
                }
                JSONObject doc=new JSONObject(text), media=new JSONObject();
                if(path.startsWith(QR)) {
                    JSONObject body=doc.optJSONObject("data");
                    if(body==null) body=new JSONObject();
                    if(path.endsWith("/generate")) {
                        if(doc.optInt("code",-1)==0) {
                            String host=safe(body.getString("url")).getHost();
                            if(!Arrays.asList("passport.bilibili.com","passport.biligame.com","account.bilibili.com").contains(host)) throw denied();
                            qrKey=body.getString("qrcode_key");
                            if(qrKey.isEmpty()) throw denied();
                            qrHandle=opaque(); body.put("qrcode_key",qrHandle);
                            qrUntil=System.currentTimeMillis()+200000;
                        }
                        body=select(body,"qrcode_key","url");
                    } else body=select(body,"code","message","timestamp");
                    doc=select(doc,"code","message","ttl").put("data",body);
                }
                if(!path.equals(QR+"poll") || (doc.optInt("code",-1)==0 && doc.getJSONObject("data").optInt("code",-1)==0)) {
                    readCookies(uri,c);
                    if(path.equals(QR+"poll")) {
                        qrKey=null; qrHandle=null; qrVersion++; accountVersion++;
                        grants.clear(); ids.clear();
                    }
                }
                if(contains(policy.optJSONArray("playback"),path))
                    walk(doc.has("result")?doc.opt("result"):doc.opt("data"),media,0,doc.optInt("code",-1)!=0);
                sanitize(doc,0);
                return pack(status,doc.toString(),"application/json",media);
            }
        } finally { c.disconnect(); }
    }
    public boolean allowedMedia(String url) {
        synchronized(LOCK) { return !closed && version==epoch && loaded && grants.containsKey(cdn(url)); }
    }
    private String localLink(URI base,String child) throws Exception {
        URI resolved=base.resolve(new URI(child));
        return "/__bs/media/"+grant(resolved.toString());
    }
    private byte[] playlist(String text,URI base) throws Exception {
        if(!text.startsWith("#EXTM3U")) throw denied();
        StringBuilder result=new StringBuilder();
        for(String raw:text.split("\\r?\\n")) {
            String line=raw.trim();
            if(line.startsWith("#EXT-X-DEFINE:") || line.startsWith("#EXT-X-CONTENT-STEERING:") ||
               line.startsWith("#EXT-X-SESSION-KEY:") || (line.startsWith("#EXT-X-KEY:") && !line.equals("#EXT-X-KEY:METHOD=NONE")))
                throw denied();
            if(line.startsWith("#")) {
                if(HLS_URI.matcher(line).replaceAll("").contains("URI=")) throw denied();
                Matcher m=HLS_URI.matcher(line);
                StringBuffer replaced=new StringBuffer();
                while(m.find()) m.appendReplacement(replaced,Matcher.quoteReplacement("URI=\""+localLink(base,m.group(1))+"\""));
                m.appendTail(replaced); line=replaced.toString();
            } else if(!line.isEmpty()) line=localLink(base,line);
            result.append(line).append('\n');
        }
        return result.toString().getBytes(StandardCharsets.UTF_8);
    }
    private static WebResourceResponse response(int status,String mime,Map<String,String> headers, InputStream body) {
        headers.put("Cache-Control","no-store");
        headers.put("X-Content-Type-Options","nosniff");
        headers.put("Content-Security-Policy","default-src 'none'");
        return new WebResourceResponse(mime,null,status,status==200 ? "OK" : status==206 ? "Partial Content" : "Unavailable",headers,body);
    }
    private static boolean magic(byte[] data,int offset,int... bytes) {
        if(offset+bytes.length>data.length) return false;
        for(int i=0;i<bytes.length;i++) if((data[offset+i]&255)!=bytes[i]) return false;
        return true;
    }
    private static String imageMime(byte[] data) throws Exception {
        if(magic(data,0,255,216,255)) return "image/jpeg";
        if(magic(data,0,137,'P','N','G',13,10,26,10)) return "image/png";
        if(magic(data,0,'G','I','F','8','9','a') || magic(data,0,'G','I','F','8','7','a')) return "image/gif";
        if(magic(data,0,'R','I','F','F') && magic(data,8,'W','E','B','P')) return "image/webp";
        if(magic(data,4,'f','t','y','p')) for(int i=8;i<64;i+=4)
            if(magic(data,i,'a','v','i','f') || magic(data,i,'a','v','i','s')) return "image/avif";
        throw denied();
    }
    public WebResourceResponse image(String path,String method) {
        HttpsURLConnection c=null;
        try {
            if(!("GET".equals(method)||"HEAD".equals(method)) || path==null || !path.startsWith(IMAGE_PREFIX)) throw denied();
            String target=path.substring(IMAGE_PREFIX.length());
            if(target.length()>1024 || target.contains("..") || !IMAGE.matcher(target).matches()) throw denied();
            URI uri=safe("https://"+target);
            c=connect(uri,"GET");
            if(c.getResponseCode()!=200 || c.getContentLengthLong()>IMAGE_LIMIT) throw denied();
            String content=c.getContentType();
            if(content==null || !content.startsWith("image/")) throw denied();
            byte[] bytes=read(c.getInputStream(),IMAGE_LIMIT);
            String mime=imageMime(bytes);
            if(!mime.equalsIgnoreCase(content.split(";",2)[0].trim())) throw denied();
            Map<String,String> headers=new HashMap<>();
            headers.put("Cache-Control","private, max-age=900");
            headers.put("Content-Length",String.valueOf(bytes.length));
            headers.put("X-Content-Type-Options","nosniff");
            headers.put("Content-Security-Policy","default-src 'none'");
            return new WebResourceResponse(mime,null,200,"OK",headers,"HEAD".equals(method)?null:new ByteArrayInputStream(bytes));
        } catch(Exception failure) { return response(403,"text/plain",new HashMap<>(),null); }
        finally { if(c!=null) c.disconnect(); }
    }
    public WebResourceResponse media(String token,String method,String range) {
        HttpsURLConnection connection=null;
        try {
            if(!("GET".equals(method)||"HEAD".equals(method)) || (range!=null && !RANGE.matcher(range).matches())) throw denied();
            URI uri;
            long snapshot;
            synchronized(LOCK) {
                load(); snapshot=version;
                String url=ids.get(token);
                if(url==null) throw denied();
                uri=safe(url);
            }
            connection=connect(uri,method);
            if(range!=null) connection.setRequestProperty("Range",range);
            int status=connection.getResponseCode();
            if(status!=200 && status!=206) {
                int failure=status>=400 && status<=599 ? status : 403;
                return response(failure,"text/plain",new HashMap<>(),null);
            }
            String type=connection.getContentType();
            type=type==null ? "" : type.split(";",2)[0].toLowerCase(Locale.ROOT);
            String path=uri.getPath().toLowerCase(Locale.ROOT);
            Map<String,String> headers=new HashMap<>();
            if(!"HEAD".equals(method) && (type.contains("mpegurl") || path.endsWith(".m3u8") || path.endsWith(".m3u"))) {
                String text=decode(connection,"");
                byte[] bytes;
                synchronized(LOCK) { active(snapshot); bytes=playlist(text,uri); }
                headers.put("Content-Length",String.valueOf(bytes.length));
                return response(200,"application/vnd.apple.mpegurl",headers,new ByteArrayInputStream(bytes));
            }
            for(String field:Arrays.asList("Content-Range","Content-Length","Accept-Ranges")) {
                String value=connection.getHeaderField(field);
                if(value!=null && value.matches("[A-Za-z0-9 /\\-*]+")) headers.put(field,value);
            }
            synchronized(LOCK) { active(snapshot); }
            String mime=MIME.contains(type)?type:"application/octet-stream";
            if("HEAD".equals(method)) return response(status,mime,headers,null);
            final HttpsURLConnection streamOwner=connection;
            InputStream stream=new FilterInputStream(connection.getInputStream()) {
                @Override public void close() throws IOException {
                    try { super.close(); } finally { streamOwner.disconnect(); }
                }
            };
            connection=null;
            return response(status,mime,headers,stream);
        } catch(Exception ex) { return response(403,"text/plain",new HashMap<>(),null); }
        finally { if(connection!=null) connection.disconnect(); }
    }
    public void clearSession() throws Exception {
        synchronized(LOCK) {
            active(version); version=++epoch; cookies.clear(); grants.clear(); ids.clear(); qrKey=null;
            if(!prefs().edit().clear().commit()) throw denied();
        }
    }
    public void close() {
        synchronized(LOCK) { closed=true; cookies.clear(); grants.clear(); ids.clear(); qrKey=null; }
    }
}
