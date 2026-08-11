package com.zviewer.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.zviewer.app.plugins.ZViewerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(ZViewerPlugin.class);
    }
}