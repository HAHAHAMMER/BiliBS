package tv.bilibs.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.TextView;
import java.io.IOException;

/** The packaged UI owns all focus transitions, including modal and playback controls. */
public final class TvActivity extends Activity {
    private WebView web;
    private NetworkBridge bridge;
    private boolean ready;
    private boolean foreground;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        immersive();
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(17, 23, 25));
        setContentView(root);
        try {
            web = new WebView(this);
        } catch (RuntimeException unavailable) {
            TextView message = new TextView(this);
            message.setText("此设备无法启动 Android System WebView。请在系统设置中启用或更新它，再打开 BiliBS。");
            message.setTextColor(Color.WHITE);
            message.setTextSize(22);
            message.setGravity(android.view.Gravity.CENTER);
            root.addView(message, -1, -1);
            return;
        }
        boolean debugBuild = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debugBuild);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // The page restores its own D-pad target after each route change.
        settings.setNeedInitialFocus(false);
        settings.setSupportZoom(false);
        settings.setTextZoom(100);
        settings.setUseWideViewPort(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setHorizontalScrollBarEnabled(false);
        web.setVerticalScrollBarEnabled(false);
        web.setBackgroundColor(Color.rgb(17, 23, 25));
        web.setFocusableInTouchMode(true);
        root.addView(web, -1, -1);
        TrustedNetwork network = new TrustedNetwork(this);
        bridge = new NetworkBridge(web, network);
        web.addJavascriptInterface(bridge, "BSNative");
        web.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface public void playbackActive(boolean active) {
                runOnUiThread(() -> {
                    if (!isDestroyed() && web != null) web.setKeepScreenOn(foreground && active);
                });
            }
        }, "BSHost");
        web.setWebViewClient(new LocalAppClient(this, network) {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                ready = false;
                bridge.newDocument();
            }
            @Override public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                ready = false;
                bridge.close();
                bridge = null;
                root.removeView(view);
                view.destroy();
                web = null;
                android.widget.Button retry = new android.widget.Button(TvActivity.this);
                retry.setAllCaps(false);
                retry.setText("画面已中断，按确定重新打开 BiliBS");
                retry.setOnClickListener(button -> recreate());
                FrameLayout.LayoutParams layout = new FrameLayout.LayoutParams(-2, -2, android.view.Gravity.CENTER);
                root.addView(retry, layout);
                retry.requestFocus();
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!isEntry(android.net.Uri.parse(url))) return;
                try {
                    view.evaluateJavascript(readText(getAssets(), "android-host.js"), null);
                    ready = true;
                    view.requestFocus();
                } catch (IOException failure) {
                    throw new IllegalStateException("Missing packaged Android input handler", failure);
                }
            }
        });
        boolean demo = state != null ? state.getBoolean("demo") : getIntent().getBooleanExtra("demo", false);
        web.loadUrl(LocalAppClient.ORIGIN + "/index.html" + (demo ? "?mode=demo" : ""));
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        if (web != null && web.getUrl() != null)
            state.putBoolean("demo", "demo".equals(android.net.Uri.parse(web.getUrl()).getQueryParameter("mode")));
    }

    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) immersive();
    }

    @SuppressWarnings("deprecation")
    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        String key = remoteKey(event.getKeyCode());
        if (key == null || !ready) return super.dispatchKeyEvent(event);
        if (event.getAction() == KeyEvent.ACTION_DOWN
                && (event.getRepeatCount() == 0 || key.startsWith("Arrow"))) {
            if (key.equals("Escape")) onBackPressed();
            else web.evaluateJavascript("window.BiliBSTVHost.key('" + key + "')", null);
        }
        return true;
    }

    private static String remoteKey(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_DPAD_UP: return "ArrowUp";
            case KeyEvent.KEYCODE_DPAD_DOWN: return "ArrowDown";
            case KeyEvent.KEYCODE_DPAD_LEFT: return "ArrowLeft";
            case KeyEvent.KEYCODE_DPAD_RIGHT: return "ArrowRight";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER: return "Enter";
            case KeyEvent.KEYCODE_ESCAPE:
            case KeyEvent.KEYCODE_BACK: return "Escape";
            case KeyEvent.KEYCODE_MENU: return "ContextMenu";
            case KeyEvent.KEYCODE_PAGE_UP: return "PageUp";
            case KeyEvent.KEYCODE_PAGE_DOWN: return "PageDown";
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return "MediaPlayPause";
            case KeyEvent.KEYCODE_MEDIA_PLAY: return "MediaPlay";
            case KeyEvent.KEYCODE_MEDIA_PAUSE: return "MediaPause";
            default: return null;
        }
    }

    @Override @SuppressWarnings("deprecation") public void onBackPressed() {
        if (!ready) { finish(); return; }
        web.evaluateJavascript("window.BiliBSTVHost.back()", result -> {
            if ("true".equals(result) && !isFinishing()) finish();
        });
    }

    @Override protected void onPause() {
        foreground = false;
        if (web != null) {
            web.setKeepScreenOn(false);
            if (ready) web.evaluateJavascript("window.BiliBSTVHost.pause()", null);
            web.onPause();
        }
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        if (web != null) web.onResume();
    }

    @Override protected void onDestroy() {
        ready = false;
        if (bridge != null) bridge.close();
        if (web != null) {
            web.removeJavascriptInterface("BSNative");
            web.removeJavascriptInterface("BSHost");
            web.stopLoading();
            if (web.getParent() instanceof FrameLayout) ((FrameLayout) web.getParent()).removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }
}
