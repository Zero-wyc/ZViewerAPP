package com.zviewer.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import mobile.Mobile;

@CapacitorPlugin(name = "ServerConnection")
public class ServerConnectionPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    @PluginMethod public void configure(PluginCall call) {
        worker.execute(() -> {
            try { call.resolve(new JSObject(Mobile.configureServer(call.getString("url", ""), call.getBoolean("allowUntrustedCertificate", false)))); }
            catch (Exception error) { call.reject("服务器连接策略应用失败", error); }
        });
    }
    @PluginMethod public void probe(PluginCall call) {
        worker.execute(() -> {
            try { call.resolve(new JSObject(Mobile.probeServer(call.getString("url", "")))); }
            catch (Exception error) { call.reject("服务器探测失败", error); }
        });
    }
}
