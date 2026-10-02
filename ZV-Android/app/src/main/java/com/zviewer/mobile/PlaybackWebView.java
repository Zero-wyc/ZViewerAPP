package com.zviewer.mobile;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;
import com.getcapacitor.CapacitorWebView;

/** Keep Chromium's video pipeline active only while the media service owns playback. */
public class PlaybackWebView extends CapacitorWebView {
    private boolean backgroundPlaybackActive;
    private int actualWindowVisibility = View.VISIBLE;

    public PlaybackWebView(Context context, AttributeSet attrs) { super(context, attrs); }

    @Override protected void onWindowVisibilityChanged(int visibility) {
        actualWindowVisibility = visibility;
        super.onWindowVisibilityChanged(backgroundPlaybackActive ? View.VISIBLE : visibility);
    }

    public void setBackgroundPlaybackActive(boolean active) {
        if (backgroundPlaybackActive == active) return;
        backgroundPlaybackActive = active;
        super.onWindowVisibilityChanged(active ? View.VISIBLE : actualWindowVisibility);
        if (active) onResume();
    }
}
