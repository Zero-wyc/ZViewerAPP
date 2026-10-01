package com.zviewer.mobile;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PlayerDisplay")
public class PlayerDisplayPlugin extends Plugin {
    @PluginMethod
    public void toggleOrientation(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            boolean landscape = getActivity().getResources().getConfiguration().orientation
                == Configuration.ORIENTATION_LANDSCAPE;
            getActivity().setRequestedOrientation(landscape
                ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
                : ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            call.resolve();
        });
    }

    @PluginMethod
    public void setImmersive(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            ((MainActivity) getActivity()).setPlayerImmersive(call.getBoolean("enabled", false));
            call.resolve();
        });
    }

    @PluginMethod
    public void unlockOrientation(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            call.resolve();
        });
    }

    @PluginMethod
    public void setSystemBarStyle(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            ((MainActivity) getActivity()).setSystemBarStyle(call.getBoolean("dark", true));
            call.resolve();
        });
    }
}
