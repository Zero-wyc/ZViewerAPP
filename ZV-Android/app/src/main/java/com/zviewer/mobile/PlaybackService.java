package com.zviewer.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** The Web engine remains the playback authority; the service owns OS controls and the playback lease. */
public final class PlaybackService extends Service {
    private static final String CHANNEL = "zviewer-playback";
    private static final int NOTIFICATION = 135;
    private static WeakReference<SystemMediaSessionPlugin> listener = new WeakReference<>(null);
    private static PlaybackService instance;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService images = Executors.newSingleThreadExecutor();
    private MediaSession session;
    private PowerManager.WakeLock wakeLock;
    private JSONObject state = new JSONObject();
    private Bitmap artwork;
    private String artworkUrl = "";
    private long artworkGeneration;
    private boolean destroyed;
    private boolean foreground;
    private String metadataKey = "";
    private String notificationKey = "";

    static void setListener(SystemMediaSessionPlugin plugin) { listener = new WeakReference<>(plugin); }
    static void clearListener(SystemMediaSessionPlugin plugin) {
        if (listener.get() == plugin) {
            listener.clear();
            if (instance != null) instance.main.post(() -> { if (instance != null) instance.stopSelf(); });
        }
    }
    static void clear(String owner) {
        PlaybackService service = instance;
        if (service != null) service.main.post(() -> {
            if (owner.equals(service.state.optString("sessionId"))) service.stopSelf();
        });
    }

    @Override public void onCreate() {
        super.onCreate();
        instance = this;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "媒体播放", NotificationManager.IMPORTANCE_LOW);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        wakeLock = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, getPackageName() + ":playback");
        wakeLock.setReferenceCounted(false);
        session = new MediaSession(this, "ZViewer");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { dispatch("play", -1); }
            @Override public void onPause() { dispatch("pause", -1); }
            @Override public void onStop() { dispatch("stop", -1); }
            @Override public void onSkipToNext() { dispatch("nexttrack", -1); }
            @Override public void onSkipToPrevious() { dispatch("previoustrack", -1); }
            @Override public void onSeekTo(long position) { dispatch("seekto", position / 1000.0); }
        }, main);
        session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setSessionActivity(openApp());
        session.setActive(true);
    }

    private PendingIntent openApp() {
        return PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private void dispatch(String action, double position) {
        SystemMediaSessionPlugin plugin = listener.get();
        if (plugin != null) {
            if ("play".equals(action) && supports("play")) plugin.setMediaPlaying(true);
            plugin.command(state.optString("sessionId"), action, position);
        }
    }
    private boolean supports(String action) {
        JSONArray actions = state.optJSONArray("actions");
        if (actions != null) for (int i = 0; i < actions.length(); i++) if (action.equals(actions.optString(i))) return true;
        return false;
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        if (intent.hasExtra("command")) {
            if (listener.get() == null || state.optString("sessionId").isEmpty()) {
                stopSelf();
                return START_NOT_STICKY;
            }
            dispatch(intent.getStringExtra("command"), -1);
            return START_NOT_STICKY;
        }
        try { state = new JSONObject(intent.getStringExtra("state")); }
        catch (Exception error) { stopSelf(); return START_NOT_STICKY; }
        String url = state.optString("artwork");
        if (!url.equals(artworkUrl)) {
            artworkUrl = url;
            artwork = null;
            loadArtwork(url, ++artworkGeneration);
        }
        boolean playing = state.optBoolean("playing");
        SystemMediaSessionPlugin plugin = listener.get();
        if (plugin != null) plugin.setMediaPlaying(playing);
        if (playing && !wakeLock.isHeld()) wakeLock.acquire();
        else if (!playing && wakeLock.isHeld()) wakeLock.release();
        updateSession();
        refreshNotification();
        return START_NOT_STICKY;
    }

    private String currentMetadataKey() {
        return state.optString("mediaId") + "\n" + state.optString("title") + "\n" + state.optString("artist")
            + "\n" + state.optString("album") + "\n" + state.optDouble("duration") + "\n" + artworkUrl
            + "\n" + (artwork == null ? 0 : artwork.getGenerationId());
    }
    private void refreshNotification() {
        String key = currentMetadataKey() + "\n" + state.optBoolean("playing") + "\n" + state.optJSONArray("actions");
        if (foreground && key.equals(notificationKey)) return;
        Notification notification = notification();
        if (!foreground) {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(NOTIFICATION, notification);
            foreground = true;
        } else getSystemService(NotificationManager.class).notify(NOTIFICATION, notification);
        notificationKey = key;
    }

    private void updateSession() {
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP;
        if (supports("seekto")) actions |= PlaybackState.ACTION_SEEK_TO;
        if (supports("nexttrack")) actions |= PlaybackState.ACTION_SKIP_TO_NEXT;
        if (supports("previoustrack")) actions |= PlaybackState.ACTION_SKIP_TO_PREVIOUS;
        session.setPlaybackState(new PlaybackState.Builder().setActions(actions)
            .setState(state.optBoolean("playing") ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                Math.max(0, (long) (state.optDouble("position") * 1000)), (float) state.optDouble("playbackRate", 1)).build());
        String key = currentMetadataKey();
        if (key.equals(metadataKey)) return;
        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_MEDIA_ID, state.optString("mediaId"))
            .putString(MediaMetadata.METADATA_KEY_TITLE, state.optString("title", "ZViewer"))
            .putString(MediaMetadata.METADATA_KEY_ARTIST, state.optString("artist"))
            .putString(MediaMetadata.METADATA_KEY_ALBUM, state.optString("album"))
            .putLong(MediaMetadata.METADATA_KEY_DURATION, Math.max(0, (long) (state.optDouble("duration") * 1000)));
        if (artwork != null) metadata.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork).putBitmap(MediaMetadata.METADATA_KEY_ART, artwork).putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON, artwork);
        session.setMetadata(metadata.build());
        metadataKey = key;
    }

    private Notification.Action action(int icon, String label, String command, int id) {
        Intent intent = new Intent(this, PlaybackService.class).putExtra("command", command);
        PendingIntent pending = PendingIntent.getService(this, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Action.Builder(icon, label, pending).build();
    }
    private Notification notification() {
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        builder.setSmallIcon(R.drawable.ic_media_notification).setContentTitle(state.optString("title", "ZViewer"))
            .setContentText(state.optString("artist")).setContentIntent(openApp()).setLargeIcon(artwork)
            .setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PUBLIC).setCategory(Notification.CATEGORY_TRANSPORT)
            .setOngoing(state.optBoolean("playing"));
        int count = 0;
        if (supports("previoustrack")) { builder.addAction(action(android.R.drawable.ic_media_previous, "上一首", "previoustrack", 1)); count++; }
        boolean playing = state.optBoolean("playing");
        builder.addAction(action(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "暂停" : "播放", playing ? "pause" : "play", 2)); count++;
        if (supports("nexttrack")) { builder.addAction(action(android.R.drawable.ic_media_next, "下一首", "nexttrack", 3)); count++; }
        Notification.MediaStyle style = new Notification.MediaStyle().setMediaSession(session.getSessionToken());
        style.setShowActionsInCompactView(count == 3 ? new int[]{0, 1, 2} : new int[]{0});
        return builder.setStyle(style).build();
    }

    private void loadArtwork(String url, long generation) {
        if (!url.startsWith("https://") && !url.startsWith("http://")) return;
        images.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(8000); connection.setReadTimeout(8000);
                connection.setRequestProperty("Referer", "https://www.bilibili.com/");
                connection.setRequestProperty("User-Agent", "ZViewer/1.3.5");
                try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192]; int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (output.size() + count > 4 * 1024 * 1024) return;
                        output.write(buffer, 0, count);
                    }
                    byte[] bytes = output.toByteArray();
                    BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
                    BitmapFactory.Options options = new BitmapFactory.Options();
                    options.inSampleSize = 1;
                    while (Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 512) options.inSampleSize *= 2;
                    Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                    if (bitmap == null) return;
                    main.post(() -> {
                        if (destroyed || generation != artworkGeneration) { bitmap.recycle(); return; }
                        artwork = bitmap;
                        updateSession();
                        refreshNotification();
                    });
                }
            } catch (Exception ignored) { /* Metadata and transport remain usable without network artwork. */ }
            finally { if (connection != null) connection.disconnect(); }
        });
    }
    @Override public void onTaskRemoved(Intent rootIntent) { dispatch("stop", -1); stopSelf(); }
    @Override public void onDestroy() {
        destroyed = true;
        SystemMediaSessionPlugin plugin = listener.get();
        if (plugin != null) plugin.setMediaPlaying(false);
        artworkGeneration++;
        images.shutdownNow();
        if (wakeLock.isHeld()) wakeLock.release();
        session.setActive(false); session.release();
        stopForeground(true);
        getSystemService(NotificationManager.class).cancel(NOTIFICATION);
        if (instance == this) instance = null;
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
