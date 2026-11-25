package tv.bilibs.app;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** The web UI receives response bodies. The gateway handles the platform session. */
final class NetworkBridge {
    private final WebView web;
    private final TrustedNetwork network;
    private final ThreadPoolExecutor pool = new ThreadPoolExecutor(4, 4, 30, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(96));
    private volatile boolean closed;
    private volatile long document;

    void newDocument() { document++; }

    NetworkBridge(WebView web, TrustedNetwork network) {
        this.web = web;
        this.network = network;
    }

    @JavascriptInterface public void request(String id, String payload) {
        if (!validId(id) || closed) return;
        long caller = document;
        if (payload == null || payload.length() > 1024 * 1024) { reject(caller, id); return; }
        submit(caller, id, () -> {
            try {
                JSONObject response = new JSONObject(network.request(payload));
                resolve(caller, id, response);
            } catch (Exception failure) {
                reject(caller, id);
            }
        });
    }

    @JavascriptInterface public void clearSession(String id) {
        if (!validId(id) || closed) return;
        long caller = document;
        submit(caller, id, () -> {
            try {
                network.clearSession();
                resolve(caller, id, new JSONObject().put("status", 200).put("body", "").put("headers", new JSONObject()));
            } catch (Exception failure) {
                reject(caller, id);
            }
        });
    }

    private static boolean validId(String id) { return id != null && id.length() > 0 && id.length() <= 128; }

    private void submit(long caller, String id, Runnable work) {
        try { pool.execute(work); }
        catch (RejectedExecutionException busy) { reject(caller, id); }
    }

    private void reject(long caller, String id) {
        result(caller, "reject", id, "'Network error'");
    }
    private void resolve(long caller, String id, JSONObject value) {
        result(caller, "resolve", id, value.toString());
    }

    private void result(long caller, String method, String id, String value) {
        if (closed) return;
        String js = "window.BSTransport && window.BSTransport." + method + "(" + JSONObject.quote(id)
                + "," + value + ")";
        web.post(() -> {
            if (!closed && caller == document && web.getUrl() != null && LocalAppClient.isEntry(android.net.Uri.parse(web.getUrl())))
                web.evaluateJavascript(js.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"), null);
        });
    }

    void close() {
        closed = true;
        pool.shutdownNow();
        network.close();
    }
}
