import { webview } from '@kit.ArkWeb';
import { common } from '@kit.AbilityKit';
import { backgroundMediaTasks } from './BackgroundMediaTasks';
import { display } from '@kit.ArkUI';

/** ArkWeb controls the native capture stream. This policy gates explicit user consent. */
class ScreenShareCapturePolicy {
  private sessionId: string = '';
  private armedUntil: number = 0;
  private pending: ScreenCaptureHandler | null = null;
  private controller: webview.WebviewController | null = null;
  private active: boolean = false;
  private watchingDisplay: boolean = false;
  private displayChanged = (_displayId: number): void => { this.publishDisplaySize(); };

  private publishDisplaySize(): void {
    if (!this.active || !this.sessionId || this.controller === null) return;
    try {
      const current = display.getDefaultDisplaySync();
      if (current.width <= 0 || current.height <= 0) return;
      const landscape = current.orientation === display.Orientation.LANDSCAPE || current.orientation === display.Orientation.LANDSCAPE_INVERTED;
      const longSide = Math.max(current.width, current.height), shortSide = Math.min(current.width, current.height);
      const detail = JSON.stringify({ sessionId: this.sessionId, width: landscape ? longSide : shortSide, height: landscape ? shortSide : longSide });
      this.controller.runJavaScript(`window.dispatchEvent(new CustomEvent('zviewer:screen-capture-resize',{detail:${detail}}))`).catch(() => {});
    } catch (_) { /* Display/window callbacks can race host destruction. */ }
  }

  async started(sessionId: string, context: common.UIAbilityContext): Promise<void> {
    if (!sessionId || sessionId !== this.sessionId || this.pending !== null) throw new Error('cancelled');
    await backgroundMediaTasks.set(context, `capture:${sessionId}`, 'audioRecording', () => { this.end(); });
    if (sessionId !== this.sessionId) {
      await backgroundMediaTasks.release(`capture:${sessionId}`);
      throw new Error('cancelled');
    }
    this.active = true;
    this.controller?.onActive();
    if (!this.watchingDisplay) {
      display.on('change', this.displayChanged);
      this.watchingDisplay = true;
    }
    this.publishDisplaySize();
  }

  background(): void {
    if (this.active) this.controller?.onActive();
  }

  arm(sessionId: string, controller: webview.WebviewController): void {
    if (!/^[A-Za-z0-9-]{1,96}$/.test(sessionId)) throw new Error('unsupported');
    void this.cancel(this.sessionId).catch(() => {});
    this.sessionId = sessionId;
    this.armedUntil = Date.now() + 15000;
    this.controller = controller;
  }
  request(handler: ScreenCaptureHandler): void {
    const origin = handler.getOrigin();
    if ((origin !== 'https://zviewer.local' && origin !== 'https://zviewer.local/') ||
      !this.sessionId || Date.now() > this.armedUntil || this.pending !== null) {
      handler.deny(); return;
    }
    this.armedUntil = 0;
    this.pending = handler;
    const sessionId = this.sessionId;
    AlertDialog.show({
      title: '共享手机屏幕',
      message: '房间观众将看到屏幕内容，并听到你选择共享的声音。切换应用后仍会继续共享，可返回此处或通过系统提示停止。',
      autoCancel: false,
      primaryButton: { value: '取消', action: () => {
        if (this.pending === handler) { this.pending = null; handler.deny(); }
      } },
      secondaryButton: { value: '开始共享', action: () => {
        if (this.pending !== handler || this.sessionId !== sessionId) return;
        this.pending = null;
        handler.grant({ captureMode: WebCaptureMode.HOME_SCREEN });
      } },
      cancel: () => { if (this.pending === handler) { this.pending = null; handler.deny(); } }
    });
  }
  cancel(sessionId: string): Promise<void> {
    if (!sessionId) return Promise.resolve();
    if (sessionId !== this.sessionId) return backgroundMediaTasks.release(`capture:${sessionId}`);
    this.pending?.deny(); this.pending = null;
    this.sessionId = ''; this.armedUntil = 0;
    this.active = false;
    if (this.watchingDisplay) {
      this.watchingDisplay = false;
      try { display.off('change', this.displayChanged); } catch (_) {}
    }
    return backgroundMediaTasks.release(`capture:${sessionId}`);
  }
  end(): void {
    const sessionId = this.sessionId;
    // Dispatch first: WebRTC tracks/recorders must stop before relinquishing the OS task.
    try { this.controller?.onActive(); } catch (_) {}
    this.controller?.runJavaScript("window.dispatchEvent(new Event('zviewer:screen-capture-stop'))").catch(() => {});
    void this.cancel(sessionId).catch(() => {});
    this.controller = null;
  }
}
export const screenShareCapturePolicy = new ScreenShareCapturePolicy();
