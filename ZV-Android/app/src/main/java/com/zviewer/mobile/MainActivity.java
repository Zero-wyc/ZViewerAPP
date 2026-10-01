package com.zviewer.mobile;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    private Insets safeInsets = Insets.NONE;
    private boolean darkSystemBars = true;
    private boolean playerImmersive = false;
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlayerDisplayPlugin.class);
        registerPlugin(AudioRoutingPlugin.class);
        registerPlugin(BilibiliProxyPlugin.class);
        registerPlugin(SystemMediaSessionPlugin.class);
        // Drop the launch theme before AppCompat creates native popup contexts.
        setTheme(R.style.AppTheme_NoActionBar);
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 26) bridge.getWebView().setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        int background = Color.rgb(17, 20, 23);
        getWindow().getDecorView().setBackgroundColor(background);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View content = findViewById(android.R.id.content);
        content.setBackgroundColor(background);
        // Draw the Web wallpaper under system bars; inset only interactive content in CSS.
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
            safeInsets = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets keyboard = insets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(0, 0, 0, Math.max(0, keyboard.bottom - safeInsets.bottom));
            updateWebInsets();
            return WindowInsetsCompat.CONSUMED;
        });
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                updateWebInsets();
            }
        });
        setPlayerImmersive(false);
        ViewCompat.requestApplyInsets(content);
    }

    public void setPlayerImmersive(boolean enabled) {
        playerImmersive = enabled;
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(!darkSystemBars && !enabled);
        controller.setAppearanceLightNavigationBars(!darkSystemBars && !enabled);
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        if (enabled) controller.hide(WindowInsetsCompat.Type.systemBars());
        else controller.show(WindowInsetsCompat.Type.systemBars());
    }

    public void setSystemBarStyle(boolean dark) {
        darkSystemBars = dark;
        setPlayerImmersive(playerImmersive);
    }

    private void updateWebInsets() {
        if (bridge == null || bridge.getWebView() == null) return;
        String script = "(() => {const s=document.documentElement.style;const d=window.devicePixelRatio||1;"
            + "s.setProperty('--native-safe-top'," + safeInsets.top + "/d+'px');"
            + "s.setProperty('--native-safe-bottom'," + safeInsets.bottom + "/d+'px');"
            + "s.setProperty('--native-safe-left'," + safeInsets.left + "/d+'px');"
            + "s.setProperty('--native-safe-right'," + safeInsets.right + "/d+'px');})()";
        bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(script, null));
    }
}
