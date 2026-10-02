import { common, wantAgent, WantAgent } from '@kit.AbilityKit';
import { avSession } from '@kit.AVSessionKit';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';
import { image } from '@kit.ImageKit';
import { http } from '@kit.NetworkKit';
import { webview } from '@kit.ArkWeb';

export interface MediaSessionState {
  sessionId: string;
  mediaId: string;
  kind: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  lyric?: string;
  lyricLine?: string;
  playing: boolean;
  position: number;
  duration: number;
  playbackRate: number;
  actions: string[];
}

/** System artwork is a decoded PixelMap; ArkWeb URLs are not delegated to the media center. */
export class NativeMediaSession {
  private context: common.UIAbilityContext;
  private controller: webview.WebviewController;
  private session: avSession.AVSession | null = null;
  private state: MediaSessionState | null = null;
  private backgroundRunning: boolean = false;
  private launchAgent: WantAgent | null = null;
  private artwork: image.PixelMap | null = null;
  private fallbackArtwork: image.PixelMap | null = null;
  private artworkUrl: string = '';
  private imageGeneration: number = 0;
  private imageRequest: http.HttpRequest | null = null;
  private queue: Promise<void> = Promise.resolve();
  private metadataKey: string = '';

  constructor(context: common.UIAbilityContext, controller: webview.WebviewController) {
    this.context = context;
    this.controller = controller;
  }

  update(state: MediaSessionState): Promise<void> {
    if (!state.sessionId || !state.mediaId || !Array.isArray(state.actions) ||
        !Number.isFinite(state.position) || !Number.isFinite(state.duration) || !Number.isFinite(state.playbackRate)) {
      return Promise.reject(new Error('Invalid media session state'));
    }
    return this.enqueue(async () => {
      if (this.state !== null && (this.state.sessionId !== state.sessionId || this.state.kind !== state.kind)) {
        await this.release();
      }
      this.state = state;
      await this.ensureSession();
      if (state.artwork !== this.artworkUrl) {
        this.artworkUrl = state.artwork;
        this.imageGeneration++;
        this.imageRequest?.destroy();
        this.imageRequest = null;
        this.artwork?.release();
        this.artwork = null;
        void this.loadArtwork(state.artwork, this.imageGeneration);
      }
      await this.publishMetadata();
      await this.session!.setAVPlaybackState({
        state: state.playing ? avSession.PlaybackState.PLAYBACK_STATE_PLAY : avSession.PlaybackState.PLAYBACK_STATE_PAUSE,
        speed: state.playbackRate,
        position: { elapsedTime: Math.max(0, state.position * 1000), updateTime: Date.now() },
      });
      await this.setBackgroundRunning(state.playing);
    });
  }

  clear(owner: string): Promise<void> {
    return this.enqueue(async () => { if (this.state?.sessionId === owner) await this.release(); });
  }
  destroy(): Promise<void> {
    return this.enqueue(async () => {
      await this.release();
      this.fallbackArtwork?.release();
      this.fallbackArtwork = null;
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.queue.then(operation);
    this.queue = next.catch((error: Error) => console.error(`ZViewer media session: ${error.message}`));
    return next;
  }

  private async ensureSession(): Promise<void> {
    if (this.session !== null) return;
    this.launchAgent = await wantAgent.getWantAgent({
      wants: [{ bundleName: 'com.zviewer.mobile', abilityName: 'EntryAbility' }],
      operationType: wantAgent.OperationType.START_ABILITY, requestCode: 0,
      wantAgentFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG],
    });
    this.session = await avSession.createAVSession(this.context, 'ZViewer', this.state?.kind === 'video' ? 'video' : 'audio');
    this.session.on('play', () => { this.handleControl('play'); });
    this.session.on('pause', () => { this.handleControl('pause'); });
    this.session.on('stop', () => { this.handleControl('stop'); });
    this.session.on('playNext', () => { this.handleControl('nexttrack'); });
    this.session.on('playPrevious', () => { this.handleControl('previoustrack'); });
    this.session.on('seek', (milliseconds: number) => { this.handleControl('seekto', milliseconds / 1000); });
    await this.session.setLaunchAbility(this.launchAgent);
    await this.session.activate();
    if (this.fallbackArtwork === null) {
      const bytes = await this.context.resourceManager.getMediaContent($r('app.media.app_icon').id);
      const source = image.createImageSource(bytes.buffer as ArrayBuffer);
      this.fallbackArtwork = await source.createPixelMap({ desiredSize: { width: 256, height: 256 } });
      source.release();
    }
  }

  private handleControl(action: string, position: number = -1): void {
    void this.enqueue(async () => { await this.control(action, position); }).catch(() => {});
  }

  private async control(action: string, position: number = -1): Promise<void> {
    const state = this.state;
    if (state === null || !state.actions.includes(action)) return;
    // An OS play command must unfreeze the Web engine before its handler can run.
    if (action === 'play') {
      await this.session?.setAVPlaybackState({ state: avSession.PlaybackState.PLAYBACK_STATE_PLAY });
      await this.setBackgroundRunning(true);
    }
    this.controller.onActive();
    const command = JSON.stringify({ sessionId: state.sessionId, action: action, position: position });
    await this.controller.runJavaScript(`window.dispatchEvent(new CustomEvent('zviewer:media-command',{detail:${command}}))`);
  }

  private async setBackgroundRunning(playing: boolean): Promise<void> {
    if (playing && !this.backgroundRunning && this.launchAgent !== null) {
      await backgroundTaskManager.startBackgroundRunning(this.context,
        backgroundTaskManager.BackgroundMode.AUDIO_PLAYBACK, this.launchAgent);
      this.backgroundRunning = true;
      this.controller.onActive();
    } else if (!playing && this.backgroundRunning) {
      await backgroundTaskManager.stopBackgroundRunning(this.context);
      this.backgroundRunning = false;
    }
  }

  private async publishMetadata(): Promise<void> {
    if (this.state === null || this.session === null) return;
    const key = JSON.stringify([this.state.mediaId, this.state.title, this.state.artist, this.state.album,
      this.state.duration, this.artworkUrl, this.artwork !== null, this.state.lyric, this.state.lyricLine]);
    if (key === this.metadataKey) return;
    const metadata: avSession.AVMetadata = {
      assetId: this.state.mediaId, title: this.state.title, artist: this.state.artist, album: this.state.album,
      duration: Math.max(0, this.state.duration * 1000), mediaImage: this.artwork ?? this.fallbackArtwork!,
      lyric: this.state.lyric ?? '', singleLyricText: this.state.lyricLine ?? '',
    };
    await this.session.setAVMetadata(metadata);
    this.metadataKey = key;
  }

  private async loadArtwork(url: string, generation: number): Promise<void> {
    if (!/^https?:\/\//.test(url)) return;
    const request = http.createHttp();
    this.imageRequest = request;
    try {
      const response = await request.request(url, {
        method: http.RequestMethod.GET, expectDataType: http.HttpDataType.ARRAY_BUFFER,
        connectTimeout: 8000, readTimeout: 8000, maxLimit: 4 * 1024 * 1024,
        header: { 'Referer': 'https://www.bilibili.com/', 'User-Agent': 'ZViewer/1.3.5' },
      });
      if (response.responseCode !== 200 || generation !== this.imageGeneration) return;
      const source = image.createImageSource(response.result as ArrayBuffer);
      const info = await source.getImageInfo();
      const scale = Math.min(1, 512 / Math.max(info.size.width, info.size.height));
      const pixel = await source.createPixelMap({ desiredSize: {
        width: Math.max(1, Math.round(info.size.width * scale)), height: Math.max(1, Math.round(info.size.height * scale)),
      } });
      source.release();
      if (generation !== this.imageGeneration) { pixel.release(); return; }
      this.artwork = pixel;
      await this.publishMetadata();
    } catch (_error) {
      console.warn('ZViewer media artwork unavailable');
    } finally {
      if (this.imageRequest === request) this.imageRequest = null;
      request.destroy();
    }
  }

  private async release(): Promise<void> {
    this.imageGeneration++;
    this.imageRequest?.destroy();
    this.imageRequest = null;
    await this.setBackgroundRunning(false);
    await this.session?.destroy();
    this.session = null;
    this.state = null;
    this.artwork?.release();
    this.artwork = null;
    this.artworkUrl = '';
    this.metadataKey = '';
  }
}
