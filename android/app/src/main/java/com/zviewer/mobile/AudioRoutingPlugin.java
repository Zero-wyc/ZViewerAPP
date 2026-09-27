package com.zviewer.mobile;

import android.content.Context;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioRouting")
public class AudioRoutingPlugin extends Plugin {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean mediaOnly;
    private final Runnable restore = this::restoreMediaMode;

    @PluginMethod
    public void setMediaOnly(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            mediaOnly = call.getBoolean("enabled", false);
            handler.removeCallbacks(restore);
            getActivity().setVolumeControlStream(mediaOnly
                ? AudioManager.STREAM_MUSIC : AudioManager.USE_DEFAULT_STREAM_TYPE);
            if (mediaOnly) scheduleRestore();
            call.resolve();
        });
    }

    private void scheduleRestore() {
        handler.removeCallbacks(restore);
        restoreMediaMode();
        // WebView closes capture/audio contexts asynchronously after leaving voice.
        handler.postDelayed(restore, 300);
        handler.postDelayed(restore, 1200);
    }

    private void restoreMediaMode() {
        if (!mediaOnly) return;
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audio == null) return;
        int before = audio.getMode();
        // Leave actual phone calls, ringing, and system redirection modes alone.
        if (before != AudioManager.MODE_NORMAL && before != AudioManager.MODE_IN_COMMUNICATION) return;
        try {
            if (before == AudioManager.MODE_IN_COMMUNICATION) audio.setMode(AudioManager.MODE_NORMAL);
            // Do not force speakerphone or SCO: preserve wired/Bluetooth media routes.
            Log.i("ZViewerAudio", "mediaOnly=true mode=" + before + " -> " + audio.getMode());
        } catch (SecurityException error) {
            Log.w("ZViewerAudio", "Unable to restore media mode", error);
        }
    }

    @Override
    protected void handleOnResume() {
        getActivity().runOnUiThread(() -> {
            if (mediaOnly) scheduleRestore();
        });
    }

    @Override
    protected void handleOnDestroy() {
        mediaOnly = false;
        handler.removeCallbacks(restore);
    }
}
