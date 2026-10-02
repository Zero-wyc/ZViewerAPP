package com.zviewer.mobile;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SystemMediaSession")
public class SystemMediaSessionPlugin extends Plugin {
    @Override public void load() { PlaybackService.setListener(this); }

    @PluginMethod public void update(PluginCall call) {
        String state = call.getData().toString();
        if (state.length() > 262144 || call.getString("sessionId", "").isEmpty()) {
            call.reject("Invalid media session state");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                PlaybackService.setListener(this);
                Intent intent = new Intent(getContext(), PlaybackService.class).putExtra("state", state);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(intent);
                else getContext().startService(intent);
                call.resolve();
            } catch (RuntimeException error) { call.reject("Unable to start playback service", error); }
        });
    }

    @PluginMethod public void clear(PluginCall call) {
        PlaybackService.clear(call.getString("sessionId", ""));
        call.resolve();
    }

    void command(String sessionId, String action, double position) {
        JSObject event = new JSObject();
        event.put("sessionId", sessionId);
        event.put("action", action);
        if (position >= 0) event.put("position", position);
        notifyListeners("mediaCommand", event);
    }

    void setMediaPlaying(boolean playing) {
        if (getBridge().getWebView() instanceof PlaybackWebView) {
            ((PlaybackWebView) getBridge().getWebView()).setBackgroundPlaybackActive(playing);
        }
    }

    @Override protected void handleOnDestroy() {
        setMediaPlaying(false);
        PlaybackService.clearListener(this);
    }
}
