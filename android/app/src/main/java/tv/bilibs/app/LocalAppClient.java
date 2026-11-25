package tv.bilibs.app;

import android.content.Context;
import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Serves the UI at a stable HTTPS origin. No local server or listen permission is needed. */
class LocalAppClient extends WebViewClient {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String HOST = "appassets.androidplatform.net";
    private static final String MEDIA = "/__bs/media/";
    private static final String POLICY =
            "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            + "img-src 'self' https: data: blob:; font-src 'self' data:; "
            + "connect-src 'self' data: blob:; media-src 'self' https: data: blob:; "
            + "worker-src 'self' blob:; frame-src 'none'; object-src 'none'; "
            + "form-action 'none'; base-uri 'none'";
    private final AssetManager assets;
    private final TrustedNetwork network;

    LocalAppClient(Context context, TrustedNetwork network) {
        this.assets = context.getAssets();
        this.network = network;
    }
    private static boolean ownOrigin(Uri uri) {
        return uri != null && "https".equals(uri.getScheme()) && HOST.equals(uri.getAuthority());
    }
    static boolean isEntry(Uri uri) {
        return ownOrigin(uri) && "/index.html".equals(uri.getEncodedPath());
    }
    @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return !request.isForMainFrame() || !isEntry(request.getUrl());
    }
    @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
        Uri uri = req.getUrl();
        if (!ownOrigin(uri)) {
            return !req.isForMainFrame() && "https".equals(uri.getScheme()) ? null : error(403, "Forbidden");
        }
        String method = req.getMethod();
        if (!"GET".equals(method) && !"HEAD".equals(method)) return error(405, "Method Not Allowed");
        String path = uri.getPath();
        if (path == null || path.contains("..") || path.contains("\\") || path.contains("//"))
            return error(404, "Not Found");
        if (req.isForMainFrame() && !isEntry(uri)) return error(403, "Forbidden");
        if (path.startsWith("/__bs/image/")) {
            try {
                return network.image(uri.getEncodedPath(), method);
            } catch (Exception failure) {
                return error(502, "Image Unavailable");
            }
        }
        if (path.startsWith(MEDIA)) {
            try {
                String range = null;
                for (Map.Entry<String,String> entry : req.getRequestHeaders().entrySet())
                    if ("Range".equalsIgnoreCase(entry.getKey())) range = entry.getValue();
                return network.media(path.substring(MEDIA.length()), method, range);
            } catch (Exception failure) {
                return error(502, "Media Unavailable");
            }
        }
        if (path.length() < 2) return error(404, "Not Found");
        String mime = mimeType(path);
        Map<String,String> headers = new HashMap<>();
        headers.put("X-Content-Type-Options", "nosniff");
        if ("text/html".equals(mime)) {
            headers.put("Content-Security-Policy", POLICY);
            headers.put("Cache-Control", "no-store");
        }
        try {
            InputStream stream = assets.open(path.substring(1), AssetManager.ACCESS_STREAMING);
            if ("HEAD".equals(method)) {
                stream.close();
                stream = new ByteArrayInputStream(new byte[0]);
            }
            String charset = mime.startsWith("text/") || mime.endsWith("json") || mime.endsWith("javascript")
                    ? "utf-8" : null;
            return new WebResourceResponse(mime, charset, 200, "OK", headers, stream);
        } catch (IOException absent) {
            return error(404, "Not Found");
        }
    }

    private static String mimeType(String path) {
        String suffix = path.substring(path.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        switch (suffix) {
            case "html": return "text/html";
            case "json": return "application/json";
            case "js": case "mjs": return "application/javascript";
            case "css": return "text/css";
            case "svg": return "image/svg+xml";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "webp": return "image/webp";
            case "avif": return "image/avif";
            case "gif": return "image/gif";
            case "woff": return "font/woff";
            case "woff2": return "font/woff2";
            case "mp4": return "video/mp4";
            case "m3u8": return "application/vnd.apple.mpegurl";
            case "wasm": return "application/wasm";
            default: return "application/octet-stream";
        }
    }

    private static WebResourceResponse error(int code, String message) {
        return new WebResourceResponse("text/plain", "utf-8", code, message, null,
                new ByteArrayInputStream(message.getBytes(StandardCharsets.UTF_8)));
    }
    static String readText(AssetManager assets, String file) throws IOException {
        try (InputStream stream = assets.open(file); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = stream.read(buffer)) != -1) bytes.write(buffer, 0, read);
            return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
