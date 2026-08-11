package com.zviewer.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.zviewer.app.plugins.ZViewerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 必须在 super.onCreate() 之前注册插件：
        // Capacitor 的 BridgeActivity.onCreate 会调用 load() 创建 Bridge，
        // 若在 super.onCreate 之后再 registerPlugin，Bridge 已创建，插件不会生效。
        registerPlugin(ZViewerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}