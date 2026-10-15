import { webview } from '@kit.ArkWeb';
import { DEBUG } from 'BuildProfile';

/** ArkWeb controls the native capture stream. This policy gates explicit user consent. */
class ScreenShareCapturePolicy {
  private sessionId: string = '';
  private armedUntil: number = 0;
  private pending: ScreenCaptureHandler | null = null;
  private controller: webview.WebviewController | null = null;

  arm(sessionId: string, controller: webview.WebviewController): void {
    if (!DEBUG || !/^[A-Za-z0-9-]{1,96}$/.test(sessionId)) throw new Error('unsupported');
    this.cancel(this.sessionId);
    this.sessionId = sessionId;
    this.armedUntil = Date.now() + 15000;
    this.controller = controller;
  }
  request(handler: ScreenCaptureHandler): void {
    const origin = handler.getOrigin();
    if (!DEBUG || (origin !== 'https://zviewer.local' && origin !== 'https://zviewer.local/') ||
      !this.sessionId || Date.now() > this.armedUntil || this.pending !== null) {
      handler.deny(); return;
    }
    this.armedUntil = 0;
    this.pending = handler;
    const sessionId = this.sessionId;
    AlertDialog.show({
      title: '共享手机屏幕',
      message: '房间观众将看到屏幕中的个人信息。本验证版本仅共享画面，退到后台会停止。',
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
  cancel(sessionId: string): void {
    if (sessionId !== this.sessionId) return;
    this.pending?.deny(); this.pending = null;
    this.sessionId = ''; this.armedUntil = 0;
  }
  end(): void {
    this.cancel(this.sessionId);
    this.controller?.runJavaScript("window.dispatchEvent(new Event('zviewer:screen-capture-stop'))").catch(() => {});
    this.controller = null;
  }
}
export const screenShareCapturePolicy = new ScreenShareCapturePolicy();
