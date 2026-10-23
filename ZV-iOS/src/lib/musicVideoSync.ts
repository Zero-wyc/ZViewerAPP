import type { VlcPlayer } from './vlcPlayer.ts';

// Audio owns the room clock. The optional video follows without stopping that
// clock or repeatedly pausing its decoder to correct ordinary buffering drift.
export class MusicVideoSync {
  private playing: boolean | null = null;
  private needsSeek = true;
  private lastSeek = -Infinity;
  private lastCorrection = -Infinity;
  private audio: VlcPlayer;
  private video: VlcPlayer;
  private now: () => number;

  constructor(audio: VlcPlayer, video: VlcPlayer, now = Date.now) { this.audio = audio; this.video = video; this.now = now; }

  requestSeek() { this.needsSeek = true; }

  sync() {
    const { audio, video } = this;
    if (video.preparing || video.duration <= 0) return;
    // currentTime during an audio seek is a requested target, not its decoded
    // clock. Wait for seekSettled before aligning the second input.
    if (audio.seeking) { this.needsSeek = true; return; }
    const playingChanged = this.playing !== audio.playing;
    if (playingChanged) {
      this.playing = audio.playing;
      if (audio.playing) video.play(); else { video.pause(); this.needsSeek = true; }
    }
    if (video.seeking) return;

    const now = this.now();
    const rate = audio.playbackRate || 1;
    const target = Math.max(0, Math.min(audio.currentTime, video.duration - .1));
    const drift = target - video.currentTime;
    // Only a new source, explicit audio seek, or a large discontinuity needs
    // a jump. The cooldown prevents slow networks from forming a seek loop.
    if (this.needsSeek || Math.abs(drift) >= 6 && now - this.lastSeek >= 10000) {
      this.needsSeek = false;
      if (video.playbackRate !== rate) video.playbackRate = rate;
      if (Math.abs(drift) > .35) {
        this.lastSeek = now;
        video.currentTime = target;
        return;
      }
    }
    if (!playingChanged && now - this.lastCorrection < 250) return;
    this.lastCorrection = now;
    const correction = audio.playing && Math.abs(drift) > .25 ? Math.max(-.1, Math.min(.1, drift * .05)) : 0;
    const nextRate = Math.round(rate * (1 + correction) * 100) / 100;
    if (Math.abs(video.playbackRate - nextRate) >= .005) video.playbackRate = nextRate;
  }
}
