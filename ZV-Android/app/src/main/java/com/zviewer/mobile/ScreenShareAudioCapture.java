package com.zviewer.mobile;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.NoiseSuppressor;
import android.media.projection.MediaProjection;
import android.os.Build;
import android.os.Process;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;
import java.util.concurrent.locks.LockSupport;
import org.webrtc.audio.JavaAudioDeviceModule;

/** One native microphone owner. WebRTC's own recorder is disabled, including during hand-off. */
final class ScreenShareAudioCapture implements JavaAudioDeviceModule.AudioBufferCallback {
    static final int SAMPLE_RATE = 48000;
    private static final int SAMPLES_PER_FRAME = SAMPLE_RATE / 100;
    private final MediaProjection projection;
    private final Runnable onFailure;
    private AudioRecord playback;
    private AudioRecord microphone;
    private AcousticEchoCanceler echoCanceler;
    private NoiseSuppressor noiseSuppressor;
    private boolean closed;
    private boolean paused;
    private boolean systemRequested;
    private boolean microphoneRequested;
    private boolean roomMicrophoneActive;
    private boolean failureReported;
    private long nextFrameTimeNs;
    private final short[] playbackSamples = new short[SAMPLES_PER_FRAME];
    private final short[] microphoneSamples = new short[SAMPLES_PER_FRAME];

    ScreenShareAudioCapture(MediaProjection projection, Runnable onFailure) {
        this.projection = projection;
        this.onFailure = onFailure;
    }

    synchronized void configure(boolean systemAudio, boolean mic, boolean voiceActive, boolean pause) {
        if (closed) throw new IllegalStateException("Screen audio capture ended");
        if (systemAudio && Build.VERSION.SDK_INT < 29) throw new UnsupportedOperationException("Playback capture requires Android 10");
        systemRequested = systemAudio;
        microphoneRequested = mic;
        roomMicrophoneActive = voiceActive;
        paused = pause;
        reconcile();
    }

    /** Returns only after AudioRecord.stop/release has relinquished the physical microphone. */
    synchronized void setRoomMicrophoneActive(boolean active) {
        roomMicrophoneActive = active;
        if (!closed) reconcile();
    }

    private void reconcile() {
        if (!microphoneRequested || roomMicrophoneActive || paused) releaseMicrophone();
        if (!systemRequested || paused) releasePlayback();
        try {
            if (systemRequested && !paused && playback == null) playback = createPlayback();
            if (microphoneRequested && !roomMicrophoneActive && !paused && microphone == null) {
                microphone = createRecord().setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION).build();
                if (AcousticEchoCanceler.isAvailable()) {
                    echoCanceler = AcousticEchoCanceler.create(microphone.getAudioSessionId());
                    if (echoCanceler != null) echoCanceler.setEnabled(true);
                }
                if (NoiseSuppressor.isAvailable()) {
                    noiseSuppressor = NoiseSuppressor.create(microphone.getAudioSessionId());
                    if (noiseSuppressor != null) noiseSuppressor.setEnabled(true);
                }
                start(microphone);
            }
        } catch (RuntimeException error) {
            try { releaseMicrophone(); } finally { releasePlayback(); }
            throw error;
        }
    }

    private AudioRecord.Builder createRecord() {
        int minimum = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minimum <= 0) throw new IllegalStateException("Unsupported PCM capture format");
        return new AudioRecord.Builder().setAudioFormat(new AudioFormat.Builder()
            .setSampleRate(SAMPLE_RATE).setChannelMask(AudioFormat.CHANNEL_IN_MONO)
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
            .setBufferSizeInBytes(Math.max(minimum * 2, SAMPLES_PER_FRAME * 4));
    }

    private AudioRecord createPlayback() {
        // Excluding our UID also excludes WebView voice playback and microphone monitoring.
        // Android's content capture policy remains authoritative for other applications.
        AudioPlaybackCaptureConfiguration config = new AudioPlaybackCaptureConfiguration.Builder(projection)
            .addMatchingUsage(AudioAttributes.USAGE_MEDIA).addMatchingUsage(AudioAttributes.USAGE_GAME)
            .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN).excludeUid(Process.myUid()).build();
        AudioRecord result = createRecord().setAudioPlaybackCaptureConfig(config).build();
        try { start(result); return result; }
        catch (RuntimeException error) { result.release(); throw error; }
    }

    private static void start(AudioRecord recorder) {
        if (recorder.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException("Audio recorder initialization failed");
        recorder.startRecording();
        if (recorder.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) throw new IllegalStateException("Audio recorder start failed");
    }

    synchronized boolean hasSystemAudio() { return !closed && !paused && playback != null; }
    synchronized boolean hasMicrophone() { return !closed && !paused && microphone != null; }
    synchronized boolean isMicrophoneSuppressed() { return microphoneRequested && roomMicrophoneActive; }

    @Override public long onBuffer(ByteBuffer buffer, int format, int channels, int sampleRate, int bytesRead, long timestamp) {
        // With ADM's hardware recorder disabled, its external-input loop has no blocking read
        // and no sleep. Supply a single 10 ms monotonic clock, including for silent buffers.
        // Wait outside the capture lock so microphone hand-off never waits for the frame clock.
        long capturedAt = paceFrame();
        synchronized (this) {
            // In external-input mode this SDK calls us with bytesRead == 0 and only sets it to
            // capacity after the callback. The full 10 ms buffer is ours to populate.
            int bytes = buffer.capacity();
            for (int n = 0; n < bytes; n++) buffer.put(n, (byte) 0);
            if (closed || paused || format != AudioFormat.ENCODING_PCM_16BIT || channels != 1 || sampleRate != SAMPLE_RATE) return capturedAt;
            int count = Math.min(bytes / 2, SAMPLES_PER_FRAME);
            Arrays.fill(playbackSamples, (short) 0);
            Arrays.fill(microphoneSamples, (short) 0);
            try {
                read(playback, playbackSamples, count);
                read(microphone, microphoneSamples, count);
                buffer.order(ByteOrder.nativeOrder());
                for (int i = 0; i < count; i++) {
                    int sample = playbackSamples[i] + microphoneSamples[i];
                    buffer.putShort(i * 2, (short) Math.max(Short.MIN_VALUE, Math.min(Short.MAX_VALUE, sample)));
                }
            } catch (RuntimeException error) {
                try { close(); } catch (RuntimeException ignored) { }
                finally { if (!failureReported) { failureReported = true; onFailure.run(); } }
            }
            return capturedAt;
        }
    }

    private long paceFrame() {
        final long duration = 10_000_000L;
        long now = System.nanoTime();
        if (nextFrameTimeNs == 0 || now - nextFrameTimeNs > duration * 4) nextFrameTimeNs = now;
        while (now < nextFrameTimeNs) {
            LockSupport.parkNanos(nextFrameTimeNs - now);
            if (Thread.currentThread().isInterrupted()) break;
            now = System.nanoTime();
        }
        nextFrameTimeNs += duration;
        return System.nanoTime();
    }

    private static void read(AudioRecord recorder, short[] samples, int count) {
        if (recorder == null) return;
        // onBuffer supplies the 10 ms clock. Never block it on two recorders in series.
        int read = recorder.read(samples, 0, count, AudioRecord.READ_NON_BLOCKING);
        if (read < 0) throw new IllegalStateException("Audio capture read failed");
        if (read < count) Arrays.fill(samples, read, count, (short) 0);
    }

    private static void releaseRecord(AudioRecord recorder) {
        if (recorder == null) return;
        try { recorder.stop(); } catch (RuntimeException ignored) { }
        recorder.release();
    }
    private void releasePlayback() { releaseRecord(playback); playback = null; }
    private void releaseMicrophone() {
        AcousticEchoCanceler echo = echoCanceler; echoCanceler = null;
        NoiseSuppressor noise = noiseSuppressor; noiseSuppressor = null;
        if (echo != null) { try { echo.release(); } catch (RuntimeException ignored) { } }
        if (noise != null) { try { noise.release(); } catch (RuntimeException ignored) { } }
        releaseRecord(microphone); microphone = null;
    }
    synchronized void close() {
        closed = true;
        // A failed release can be retried; one failed resource must not skip the other recorder.
        try { releaseMicrophone(); } finally { releasePlayback(); }
    }
}
