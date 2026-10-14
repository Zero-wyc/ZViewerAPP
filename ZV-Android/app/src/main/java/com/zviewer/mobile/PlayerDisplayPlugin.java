package com.zviewer.mobile;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Rational;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PlayerDisplay")
public class PlayerDisplayPlugin extends Plugin {
    @PluginMethod
    public void getPictureInPictureSupport(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE));
        call.resolve(result);
    }

    @PluginMethod
    public void enterPictureInPicture(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                call.reject("Picture-in-picture requires Android 8 or newer");
                return;
            }
            MainActivity activity = (MainActivity) getActivity();
            try {
                int width = Math.max(1, call.getInt("width", 16));
                int height = Math.max(1, call.getInt("height", 9));
                // Android accepts only aspect ratios in [1/2.39, 2.39].
                float ratio = Math.max(0.42f, Math.min(2.38f, (float) width / height));
                PictureInPictureParams params = new PictureInPictureParams.Builder()
                    .setAspectRatio(new Rational(Math.round(ratio * 10000), 10000)).build();
                activity.preparePictureInPicture();
                if (activity.enterPictureInPictureMode(params)) call.resolve();
                else {
                    activity.restorePictureInPictureDisplay();
                    call.reject("Picture-in-picture is disabled by the system");
                }
            } catch (Exception error) {
                activity.restorePictureInPictureDisplay();
                call.reject("Unable to enter picture-in-picture", error);
            }
        });
    }

    @PluginMethod
    public void exitPictureInPicture(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && getActivity().isInPictureInPictureMode()) {
                Intent intent = new Intent(getActivity(), MainActivity.class);
                intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                getActivity().startActivity(intent);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void toggleOrientation(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            boolean landscape = getActivity().getResources().getConfiguration().orientation
                == Configuration.ORIENTATION_LANDSCAPE;
            boolean targetLandscape = call.getBoolean("isLandscape", !landscape);
            getActivity().setRequestedOrientation(targetLandscape
                ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                : ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT);
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
            getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_USER);
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
