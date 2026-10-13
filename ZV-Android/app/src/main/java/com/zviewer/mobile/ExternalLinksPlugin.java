package com.zviewer.mobile;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExternalLinks")
public class ExternalLinksPlugin extends Plugin {
    @PluginMethod public void open(PluginCall call) {
        String value = call.getString("url", "");
        Uri uri = Uri.parse(value);
        if (!"https".equals(uri.getScheme()) || !"github.com".equals(uri.getHost()) || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null || uri.getPath() == null || !uri.getPath().startsWith("/Zero-wyc/ZViewerAPP/releases")) {
            call.reject("下载地址无效"); return;
        }
        getActivity().runOnUiThread(() -> {
            try { getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)); call.resolve(); }
            catch (Exception error) { call.reject("无法打开浏览器，请检查系统浏览器是否可用"); }
        });
    }
}
