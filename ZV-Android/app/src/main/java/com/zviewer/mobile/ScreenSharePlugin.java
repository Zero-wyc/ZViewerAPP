package com.zviewer.mobile;

import android.app.Activity;
import android.Manifest;
import android.content.*;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.*;
import android.graphics.Rect;
import android.view.Surface;
import android.view.WindowManager;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import com.getcapacitor.*;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.*;
import org.webrtc.*;
import org.webrtc.audio.JavaAudioDeviceModule;
import java.util.*;

/** PoC sender: all capture/SDP/ICE ownership stays native; the bridge carries DTOs only. */
@CapacitorPlugin(name = "ScreenShare", permissions = @Permission(alias = "screenAudio", strings = { Manifest.permission.RECORD_AUDIO }))
public final class ScreenSharePlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private HandlerThread thread;
    private Handler worker;
    private volatile String session;
    private PluginCall starting;
    private MediaProjection projection;
    private MediaProjection.Callback projectionCallback;
    private VirtualDisplay display;
    private Surface surface;
    private SurfaceTextureHelper textures;
    private EglBase egl;
    private PeerConnectionFactory factory;
    private VideoSource source;
    private VideoTrack video;
    private AudioSource audioSource;
    private AudioTrack audio;
    private JavaAudioDeviceModule audioModule;
    private ScreenShareAudioCapture audioCapture;
    private ScreenShareService captureService;
    private boolean systemAudioRequested, microphoneRequested, paused;
    private boolean roomMicrophoneActive;
    private boolean microphoneAdminMuted, voicePublishing;
    private ServiceConnection serviceConnection;
    private boolean bound;
    private int width, height;
    private int maxLongSide = 1280, maxShortSide = 720, targetFrameRate = 30;
    private volatile long frames;
    private long lastFrameTime;
    private long lastFrames, lastSample;
    private volatile double measuredFps;
    private final Map<String, Peer> peers = new HashMap<>();
    private List<PeerConnection.IceServer> iceServers = new ArrayList<>();
    private static final class Peer {
        PeerConnection pc;
        boolean answered;
        final List<IceCandidate> ice = new ArrayList<>();
    }
    @Override public void load() {
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(getContext()).createInitializationOptions());
        Logging.enableLogToDebugOutput(Logging.Severity.LS_NONE);
        thread = new HandlerThread("ZViewerScreenShare"); thread.start(); worker = new Handler(thread.getLooper());
    }
    @PluginMethod public void getCapabilities(PluginCall call) {
        JSObject value = new JSObject();
        // Production stays gated until both physical-device PoCs pass the delivery plan.
        value.put("video", BuildConfig.DEBUG); value.put("microphone", BuildConfig.DEBUG); value.put("systemAudio", BuildConfig.DEBUG && Build.VERSION.SDK_INT >= 29);
        value.put("background", true); value.put("experimental", true);
        value.put("reason", BuildConfig.DEBUG ? "系统音频受播放应用的录制策略限制；房间语音使用麦克风时，共享麦克风会自动让出" : "原生屏幕共享正在验证，正式版暂未开放");
        call.resolve(value);
    }
    @PluginMethod public void start(PluginCall call) {
        main.post(() -> {
            if (!BuildConfig.DEBUG) { call.reject("原生屏幕共享尚未通过真机验收", "unsupported"); return; }
            String id = call.getString("sessionId", "");
            if (!id.matches("[A-Za-z0-9-]{1,96}") || session != null) { call.reject("共享正在启动或运行", "capture-start-failed"); return; }
            if (call.getBoolean("systemAudio", false) && Build.VERSION.SDK_INT < 29) { call.reject("系统音频共享需要 Android 10 或更新版本", "unsupported"); return; }
            session = id; starting = call;
            systemAudioRequested = call.getBoolean("systemAudio", false);
            microphoneRequested = call.getBoolean("microphone", false);
            paused = false;
            targetFrameRate = call.getInt("frameRate", 30);
            if (targetFrameRate != 30 && targetFrameRate != 60 && targetFrameRate != 90) targetFrameRate = 30;
            switch (call.getString("resolution", "720p")) {
                case "native": maxLongSide = maxShortSide = 0; break;
                case "1080p": maxLongSide = 1920; maxShortSide = 1080; break;
                case "1440p": maxLongSide = 2560; maxShortSide = 1440; break;
                case "2160p": maxLongSide = 3840; maxShortSide = 2160; break;
                default: maxLongSide = 1280; maxShortSide = 720;
            }
            try {
                iceServers = new ArrayList<>();
                JSArray servers = call.getArray("iceServers", new JSArray());
                for (int i = 0; i < servers.length(); i++) {
                    JSONObject server = servers.getJSONObject(i);
                    Object urls = server.get("urls");
                    List<String> list = new ArrayList<>();
                    if (urls instanceof JSONArray) for (int n = 0; n < ((JSONArray) urls).length(); n++) list.add(((JSONArray) urls).getString(n));
                    else list.add(String.valueOf(urls));
                    iceServers.add(PeerConnection.IceServer.builder(list).setUsername(server.optString("username", "")).setPassword(server.optString("credential", "")).createIceServer());
                }
                if ((systemAudioRequested || microphoneRequested) && getPermissionState("screenAudio") != PermissionState.GRANTED) {
                    requestPermissionForAlias("screenAudio", call, "startAudioPermission");
                } else requestProjection(call);
            } catch (Exception ignored) { failStart(id, "capture-start-failed"); }
        });
    }
    private void requestProjection(PluginCall call) {
        MediaProjectionManager manager = (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        startActivityForResult(call, manager.createScreenCaptureIntent(), "projectionPermission");
    }
    @PermissionCallback private void startAudioPermission(PluginCall call) {
        if (call != starting || !current(call)) return;
        if (getPermissionState("screenAudio") != PermissionState.GRANTED) { failStart(session, "permission-denied"); return; }
        try { requestProjection(call); } catch (Exception ignored) { failStart(session, "capture-start-failed"); }
    }
    @ActivityCallback private void projectionPermission(PluginCall call, ActivityResult result) {
        String id = call == null ? "" : call.getString("sessionId", "");
        if (!id.equals(session) || call != starting) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) { failStart(id, "permission-denied"); return; }
        JSObject state = event(id, "state"); state.put("state", "starting"); send(state);
        final Intent token = result.getData();
        serviceConnection = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder binder) {
                ScreenShareService service = ((ScreenShareService.LocalBinder) binder).service();
                if (!id.equals(session)) return;
                captureService = service;
                service.setStopped(() -> worker.post(() -> endFromSystem(id)));
                try { if (systemAudioRequested || microphoneRequested) service.enableAudioCapture(); }
                catch (RuntimeException ignored) { failStart(id, "permission-denied"); return; }
                worker.post(() -> { if (id.equals(session)) beginCapture(id, token); });
            }
            @Override public void onServiceDisconnected(ComponentName name) { worker.post(() -> endFromSystem(id)); }
        };
        try {
            ContextCompat.startForegroundService(getContext(), new Intent(getContext(), ScreenShareService.class));
            bound = getContext().bindService(new Intent(getContext(), ScreenShareService.class), serviceConnection, Context.BIND_AUTO_CREATE);
            if (!bound) failStart(id, "capture-start-failed");
        } catch (Exception ignored) { failStart(id, "capture-start-failed"); }
    }
    private void beginCapture(String id, Intent token) {
        try {
            MediaProjectionManager manager = (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            projection = manager.getMediaProjection(Activity.RESULT_OK, token); // consume the token exactly once
            audioCapture = new ScreenShareAudioCapture(projection, () -> worker.post(() -> {
                if (!id.equals(session)) return;
                JSObject error = event(id, "error"); error.put("code", "capture-start-failed"); cleanup(); send(error);
            }));
            audioCapture.configure(systemAudioRequested, microphoneRequested, microphoneSuppressed(), false);
            audioModule = JavaAudioDeviceModule.builder(getContext()).setSampleRate(ScreenShareAudioCapture.SAMPLE_RATE)
                .setUseHardwareAcousticEchoCanceler(false).setUseHardwareNoiseSuppressor(false)
                .setEnableVolumeLogger(false).setAudioBufferCallback(audioCapture).createAudioDeviceModule();
            // All microphone ownership is explicit in ScreenShareAudioCapture. Never let ADM open a second recorder.
            audioModule.setAudioRecordEnabled(false);
            egl = EglBase.create();
            factory = PeerConnectionFactory.builder()
                .setAudioDeviceModule(audioModule)
                .setVideoEncoderFactory(new DefaultVideoEncoderFactory(egl.getEglBaseContext(), true, true))
                .setVideoDecoderFactory(new DefaultVideoDecoderFactory(egl.getEglBaseContext())).createPeerConnectionFactory();
            source = factory.createVideoSource(true);
            video = factory.createVideoTrack("screen", source);
            MediaConstraints audioConstraints = new MediaConstraints();
            audioConstraints.mandatory.add(new MediaConstraints.KeyValuePair("googEchoCancellation", "false"));
            audioConstraints.mandatory.add(new MediaConstraints.KeyValuePair("googNoiseSuppression", "false"));
            audioConstraints.mandatory.add(new MediaConstraints.KeyValuePair("googAutoGainControl", "false"));
            audioConstraints.mandatory.add(new MediaConstraints.KeyValuePair("googHighpassFilter", "false"));
            audioSource = factory.createAudioSource(audioConstraints);
            audio = factory.createAudioTrack("screen-audio", audioSource);
            if (Build.VERSION.SDK_INT >= 30) {
                Rect bounds = getActivity().getSystemService(WindowManager.class).getMaximumWindowMetrics().getBounds();
                setSize(bounds.width(), bounds.height());
            } else {
                android.util.DisplayMetrics metrics = getContext().getResources().getDisplayMetrics();
                setSize(metrics.widthPixels, metrics.heightPixels);
            }
            source.adaptOutputFormat(width, height, targetFrameRate);
            textures = SurfaceTextureHelper.create("ZViewerScreenFrames", egl.getEglBaseContext());
            textures.setTextureSize(width, height);
            surface = new Surface(textures.getSurfaceTexture());
            projectionCallback = new MediaProjection.Callback() {
                @Override public void onStop() { worker.post(() -> endFromSystem(id)); }
                @Override public void onCapturedContentResize(int w, int h) {
                    worker.post(() -> {
                        if (!id.equals(session) || display == null) return;
                        setSize(w, h);
                        source.adaptOutputFormat(width, height, targetFrameRate);
                        textures.setTextureSize(width, height);
                        display.resize(width, height, getContext().getResources().getConfiguration().densityDpi);
                    });
                }
            };
            projection.registerCallback(projectionCallback, main);
            frames = lastFrames = lastFrameTime = 0; lastSample = System.nanoTime(); measuredFps = 0;
            source.getCapturerObserver().onCapturerStarted(true);
            textures.startListening(frame -> {
                long time = frame.getTimestampNs();
                // Small tolerance avoids dropping every other frame when display timestamps jitter.
                if (time - lastFrameTime < 1_000_000_000L / targetFrameRate - 1_000_000L) return;
                lastFrameTime = time;
                frames++;
                source.getCapturerObserver().onFrameCaptured(frame);
            });
            display = projection.createVirtualDisplay("ZViewer screen sharing", width, height,
                getContext().getResources().getConfiguration().densityDpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, surface, null, worker);
            PluginCall call = starting; starting = null;
            if (call != null) call.resolve(settings());
            sample(id);
        } catch (Exception ignored) { failStart(id, "capture-start-failed"); }
    }
    private void setSize(int w, int h) {
        if (w <= 0 || h <= 0) return;
        double scale = maxLongSide == 0 ? 1.0 : Math.min(1.0, Math.min((double) maxLongSide / Math.max(w, h), (double) maxShortSide / Math.min(w, h)));
        width = Math.max(2, (int)(w * scale) / 2 * 2); height = Math.max(2, (int)(h * scale) / 2 * 2);
    }
    private JSObject settings() {
        JSObject value = new JSObject(); value.put("width", width); value.put("height", height); value.put("frameRate", measuredFps);
        value.put("targetFrameRate", targetFrameRate);
        boolean systemAudio = audioCapture != null && audioCapture.hasSystemAudio();
        boolean microphone = audioCapture != null && audioCapture.hasMicrophone();
        value.put("audio", systemAudio || microphone); value.put("systemAudio", systemAudio); value.put("microphone", microphone);
        boolean suppressed = audioCapture != null && audioCapture.isMicrophoneSuppressed();
        value.put("microphoneSuppressed", suppressed);
        if (suppressed) value.put("microphoneSuppressionReason", microphoneAdminMuted ? "admin-muted" : "voice");
        return value;
    }
    private void sample(String id) {
        worker.postDelayed(() -> {
            if (!id.equals(session) || video == null) return;
            long now = System.nanoTime(), current = frames;
            measuredFps = Math.round((current - lastFrames) * 1e10 / (now - lastSample)) / 10.0;
            lastSample = now; lastFrames = current;
            JSObject event = event(id, "stats"); event.put("settings", settings()); send(event); sample(id);
        }, 2000);
    }
    private boolean current(PluginCall call) { return session != null && session.equals(call.getString("sessionId")); }
    @PluginMethod public void pause(PluginCall call) { setPaused(call, true); }
    @PluginMethod public void resume(PluginCall call) { setPaused(call, false); }
    private void setPaused(PluginCall call, boolean pause) { worker.post(() -> {
        if (!current(call) || video == null) { call.reject("共享会话已结束", "cancelled"); return; }
        try {
            paused = pause;
            audioCapture.configure(systemAudioRequested, microphoneRequested, microphoneSuppressed(), paused);
            video.setEnabled(!pause); audio.setEnabled(!pause); emitSettings(); call.resolve();
        } catch (RuntimeException ignored) { call.reject("音频采集未能恢复", "capture-start-failed"); endFromSystem(session); }
    }); }
    @PluginMethod public void setAudioOptions(PluginCall call) {
        main.post(() -> {
            if (!current(call)) { call.reject("共享会话已结束", "cancelled"); return; }
            boolean systemAudio = call.getBoolean("systemAudio", false), microphone = call.getBoolean("microphone", false);
            if (systemAudio && Build.VERSION.SDK_INT < 29) { call.reject("系统音频共享需要 Android 10 或更新版本", "unsupported"); return; }
            if ((systemAudio || microphone) && getPermissionState("screenAudio") != PermissionState.GRANTED) {
                requestPermissionForAlias("screenAudio", call, "audioOptionsPermission");
            } else applyAudioOptions(call);
        });
    }
    @PermissionCallback private void audioOptionsPermission(PluginCall call) {
        if (getPermissionState("screenAudio") != PermissionState.GRANTED) { call.reject("音频权限被拒绝", "permission-denied"); return; }
        applyAudioOptions(call);
    }
    private void applyAudioOptions(PluginCall call) {
        if (!current(call) || captureService == null) { call.reject("共享会话已结束", "cancelled"); return; }
        boolean systemAudio = call.getBoolean("systemAudio", false), microphone = call.getBoolean("microphone", false);
        try { if (systemAudio || microphone) captureService.enableAudioCapture(); }
        catch (RuntimeException ignored) { call.reject("请回到应用后开启共享音频", "permission-denied"); return; }
        worker.post(() -> {
            if (!current(call) || audioCapture == null) { call.reject("共享会话已结束", "cancelled"); return; }
            try {
                audioCapture.configure(systemAudio, microphone, microphoneSuppressed(), paused);
                systemAudioRequested = systemAudio; microphoneRequested = microphone; emitSettings(); call.resolve(settings());
            } catch (RuntimeException ignored) { call.reject("音频采集未能启动", "capture-start-failed"); endFromSystem(session); }
        });
    }
    @PluginMethod public void setRoomMicrophoneActive(PluginCall call) {
        worker.post(() -> {
            roomMicrophoneActive = call.getBoolean("active", false);
            try {
                if (audioCapture != null) audioCapture.setRoomMicrophoneActive(microphoneSuppressed());
                emitSettings(); call.resolve();
            } catch (RuntimeException ignored) {
                call.reject("共享麦克风未能恢复", "capture-start-failed");
                if (session != null) endFromSystem(session);
            }
        });
    }
    @PluginMethod public void setMicrophonePolicy(PluginCall call) {
        worker.post(() -> {
            microphoneAdminMuted = call.getBoolean("adminMuted", false);
            voicePublishing = call.getBoolean("voicePublishing", false);
            try {
                if (audioCapture != null) audioCapture.setRoomMicrophoneActive(microphoneSuppressed());
                emitSettings(); call.resolve();
            } catch (RuntimeException ignored) {
                call.reject("共享麦克风未能恢复", "capture-start-failed");
                if (session != null) endFromSystem(session);
            }
        });
    }
    private boolean microphoneSuppressed() { return roomMicrophoneActive || microphoneAdminMuted || voicePublishing; }
    private void emitSettings() { if (session != null) { JSObject value = event(session, "stats"); value.put("settings", settings()); send(value); } }
    @PluginMethod public void stop(PluginCall call) {
        worker.post(() -> { if (current(call)) cleanup(); call.resolve(); });
    }
    @PluginMethod public void createOffer(PluginCall call) {
        worker.post(() -> {
            if (!current(call) || video == null) { call.reject("共享会话已结束", "cancelled"); return; }
            final String id = session, peerId = call.getString("peerId", "");
            if (peerId.isEmpty() || (peers.size() >= 4 && !peers.containsKey(peerId))) { call.reject("观众连接数量已达上限", "transport-failed"); return; }
            closePeer(peerId);
            Peer peer = new Peer(); peers.put(peerId, peer);
            PeerConnection.RTCConfiguration config = new PeerConnection.RTCConfiguration(iceServers);
            config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN;
            peer.pc = factory.createPeerConnection(config, new PeerConnection.Observer() {
                public void onSignalingChange(PeerConnection.SignalingState state) {}
                public void onIceConnectionChange(PeerConnection.IceConnectionState state) {}
                public void onIceConnectionReceivingChange(boolean value) {}
                public void onIceGatheringChange(PeerConnection.IceGatheringState state) {}
                public void onIceCandidatesRemoved(IceCandidate[] values) {}
                public void onAddStream(MediaStream stream) {}
                public void onRemoveStream(MediaStream stream) {}
                public void onDataChannel(DataChannel channel) { channel.close(); channel.dispose(); }
                public void onRenegotiationNeeded() {}
                public void onAddTrack(RtpReceiver receiver, MediaStream[] streams) {}
                public void onConnectionChange(PeerConnection.PeerConnectionState state) { worker.post(() -> {
                    if (!id.equals(session) || peers.get(peerId) != peer) return;
                    JSObject value = event(id, "peer-state"); value.put("peerId", peerId); value.put("connectionState", state.name().toLowerCase(Locale.ROOT)); send(value);
                }); }
                public void onIceCandidate(IceCandidate candidate) { worker.post(() -> {
                    if (!id.equals(session) || peers.get(peerId) != peer) return;
                    JSObject ice = new JSObject(); ice.put("candidate", candidate.sdp); ice.put("sdpMid", candidate.sdpMid); ice.put("sdpMLineIndex", candidate.sdpMLineIndex);
                    JSObject value = event(id, "ice"); value.put("peerId", peerId); value.put("candidate", ice); send(value);
                }); }
            });
            if (peer.pc == null) { closePeer(peerId); call.reject("无法建立观众连接", "transport-failed"); return; }
            RtpSender sender = peer.pc.addTrack(video, Collections.singletonList("screen-share"));
            peer.pc.addTrack(audio, Collections.singletonList("screen-share"));
            List<RtpCapabilities.CodecCapability> codecs = new ArrayList<>(factory.getRtpSenderCapabilities(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO).codecs);
            codecs.sort((a, b) -> Boolean.compare(!"H264".equalsIgnoreCase(a.name), !"H264".equalsIgnoreCase(b.name)));
            for (RtpTransceiver transceiver : peer.pc.getTransceivers()) {
                if (transceiver.getMediaType() == MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO) transceiver.setCodecPreferences(codecs);
            }
            RtpParameters params = sender.getParameters();
            // Scale the quality budget with actual captured pixels and requested FPS; congestion
            // control may still reduce it. A fixed 720p/30 sender cap would defeat the quality UI.
            int bitrate = (int) Math.min(32_000_000, Math.max(2_500_000, width * (double) height * 2.8 * Math.sqrt(targetFrameRate / 30.0)));
            for (RtpParameters.Encoding encoding : params.encodings) { encoding.maxBitrateBps = bitrate; encoding.maxFramerate = targetFrameRate; }
            sender.setParameters(params);
            peer.pc.createOffer(new SdpAdapter(call) {
                @Override public void onCreateSuccess(SessionDescription description) { worker.post(() -> {
                    if (!id.equals(session) || peers.get(peerId) != peer) { call.reject("会话已结束", "cancelled"); return; }
                    peer.pc.setLocalDescription(new SdpAdapter(call) { @Override public void onSetSuccess() {
                        JSObject value = new JSObject(); value.put("type", "offer"); value.put("sdp", description.description); call.resolve(value);
                    } }, description);
                }); }
            }, new MediaConstraints());
        });
    }
    @PluginMethod public void setAnswer(PluginCall call) {
        worker.post(() -> {
            String peerId = call.getString("peerId", ""); final String id = session;
            Peer peer = peers.get(peerId);
            JSObject description = call.getObject("description", new JSObject());
            if (!current(call) || peer == null || !"answer".equals(description.getString("type"))) { call.reject("观众连接已失效", "cancelled"); return; }
            peer.pc.setRemoteDescription(new SdpAdapter(call) { @Override public void onSetSuccess() { worker.post(() -> {
                if (!Objects.equals(id, session) || peers.get(peerId) != peer) { call.reject("会话已结束", "cancelled"); return; }
                peer.answered = true;
                for (IceCandidate candidate : peer.ice) peer.pc.addIceCandidate(candidate);
                peer.ice.clear(); call.resolve();
            }); } }, new SessionDescription(SessionDescription.Type.ANSWER, description.getString("sdp", "")));
        });
    }
    @PluginMethod public void addIceCandidate(PluginCall call) {
        worker.post(() -> {
            Peer peer = peers.get(call.getString("peerId", ""));
            if (!current(call) || peer == null) { call.resolve(); return; }
            JSObject value = call.getObject("candidate", new JSObject());
            IceCandidate candidate = new IceCandidate(value.getString("sdpMid", "0"), value.getInteger("sdpMLineIndex", 0), value.getString("candidate", ""));
            if (peer.answered) peer.pc.addIceCandidate(candidate); else if (peer.ice.size() < 128) peer.ice.add(candidate);
            call.resolve();
        });
    }
    @PluginMethod public void removePeer(PluginCall call) { worker.post(() -> { if (current(call)) closePeer(call.getString("peerId", "")); call.resolve(); }); }
    private void closePeer(String peerId) { Peer peer = peers.remove(peerId); if (peer != null && peer.pc != null) { peer.pc.close(); peer.pc.dispose(); peer.ice.clear(); } }
    private static class SdpAdapter implements SdpObserver {
        final PluginCall call;
        SdpAdapter(PluginCall call) { this.call = call; }
        public void onCreateSuccess(SessionDescription description) {}
        public void onSetSuccess() {}
        public void onCreateFailure(String error) { call.reject("SDP 协商失败", "transport-failed"); }
        public void onSetFailure(String error) { call.reject("SDP 协商失败", "transport-failed"); }
    }
    private JSObject event(String id, String type) { JSObject value = new JSObject(); value.put("sessionId", id); value.put("type", type); return value; }
    private void send(JSObject value) { notifyListeners("screenShareEvent", value); }
    private void endFromSystem(String id) { if (id != null && id.equals(session)) { JSObject value = event(id, "capture-ended"); value.put("code", "capture-ended"); cleanup(); send(value); } }
    private void failStart(String id, String code) {
        worker.post(() -> {
            if (id == null || !id.equals(session)) return;
            PluginCall call = starting; starting = null;
            cleanup();
            if (call != null) call.reject("屏幕共享未能启动", code);
        });
    }
    private static void release(Runnable action) { try { action.run(); } catch (Exception ignored) {} }
    private void cleanup() {
        PluginCall call = starting; starting = null;
        if (call != null) call.reject("共享已取消", "cancelled");
        if (textures != null) release(() -> textures.stopListening());
        if (video != null) release(() -> video.setEnabled(false));
        if (audioCapture != null) { release(() -> audioCapture.close()); audioCapture = null; }
        if (audio != null) release(() -> audio.setEnabled(false));
        for (String id : new ArrayList<>(peers.keySet())) release(() -> closePeer(id));
        if (video != null) { release(() -> video.dispose()); video = null; }
        if (audio != null) { release(() -> audio.dispose()); audio = null; }
        if (audioSource != null) { release(() -> audioSource.dispose()); audioSource = null; }
        if (source != null) { release(() -> source.getCapturerObserver().onCapturerStopped()); release(() -> source.dispose()); source = null; }
        if (display != null) { release(() -> display.release()); display = null; }
        if (projection != null) { release(() -> projection.unregisterCallback(projectionCallback)); release(() -> projection.stop()); projection = null; }
        if (surface != null) { release(() -> surface.release()); surface = null; }
        if (textures != null) { release(() -> textures.dispose()); textures = null; }
        if (factory != null) { release(() -> factory.dispose()); factory = null; }
        if (audioModule != null) { release(() -> audioModule.release()); audioModule = null; }
        if (egl != null) { release(() -> egl.release()); egl = null; }
        ServiceConnection connection = serviceConnection; serviceConnection = null;
        captureService = null;
        boolean wasBound = bound; bound = false;
        iceServers.clear();
        main.post(() -> {
            if (wasBound && connection != null) release(() -> getContext().unbindService(connection));
            getContext().stopService(new Intent(getContext(), ScreenShareService.class));
        });
        // Do not admit another session while native audio/video resources are still being released.
        session = null;
    }
    @Override protected void handleOnDestroy() { worker.post(() -> { cleanup(); thread.quitSafely(); }); }
}
