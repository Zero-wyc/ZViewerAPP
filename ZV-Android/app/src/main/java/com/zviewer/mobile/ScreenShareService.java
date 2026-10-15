package com.zviewer.mobile;

import android.app.*;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;

/** Non-sticky, explicit user-started projection task. Never restarts a consent token. */
public final class ScreenShareService extends Service {
    private static final String CHANNEL = "zviewer-screen-share";
    private static final int NOTIFICATION = 4102;
    private Runnable stopped;
    private boolean ended;
    final class LocalBinder extends Binder { ScreenShareService service() { return ScreenShareService.this; } }

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL, "屏幕共享", NotificationManager.IMPORTANCE_LOW));
        Intent stopIntent = new Intent(this, ScreenShareService.class).setAction("stop");
        PendingIntent stop = PendingIntent.getService(this, 0, stopIntent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent open = PendingIntent.getActivity(this, 1, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        Notification notification = builder
            .setSmallIcon(android.R.drawable.ic_menu_view).setContentTitle("ZViewer 正在共享屏幕")
            .setContentText("房间观众可看到屏幕内容，点击停止结束共享").setOngoing(true)
            .setContentIntent(open).addAction(new Notification.Action.Builder(null, "停止共享", stop).build()).build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        else startForeground(NOTIFICATION, notification);
    }
    void setStopped(Runnable callback) { stopped = callback; if (ended) callback.run(); }
    @Override public IBinder onBind(Intent intent) { return new LocalBinder(); }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "stop".equals(intent.getAction())) end();
        return START_NOT_STICKY;
    }
    private void end() { if (ended) return; ended = true; if (stopped != null) stopped.run(); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); }
    @Override public void onTaskRemoved(Intent rootIntent) { end(); }
    @Override public void onDestroy() { end(); stopped = null; super.onDestroy(); }
}
