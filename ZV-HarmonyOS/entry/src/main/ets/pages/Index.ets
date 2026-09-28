import { abilityAccessCtrl, common } from '@kit.AbilityKit';
import { webview } from '@kit.ArkWeb';
import { window } from '@kit.ArkUI';
import { BilibiliLocalProxy } from '../services/BilibiliLocalProxy';

const LOCAL_ORIGIN = 'https://zviewer.local';
const LOCAL_PAGE = `${LOCAL_ORIGIN}/index.html`;

interface PollQrArgument { key: string; }
const bilibiliProxy = new BilibiliLocalProxy();

function mimeType(path: string): string {
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.js')) return 'text/javascript';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.wasm')) return 'application/wasm';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.woff2')) return 'font/woff2';
  if (path.endsWith('.woff')) return 'font/woff';
  return 'application/octet-stream';
}

class HarmonyHost {
  private context: common.UIAbilityContext;
  private controller: webview.WebviewController;
  private initialOrientation: window.Orientation | null = null;

  constructor(context: common.UIAbilityContext, controller: webview.WebviewController) {
    this.context = context;
    this.controller = controller;
  }

  getPlatform(): string {
    return 'harmony';
  }

  minimizeApp(): void {
    this.context.moveAbilityToBackground().catch(() => {
      console.error('Unable to move ZViewer to background');
    });
  }

  request(id: number, action: string, argument: string): void {
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647 || argument.length > 1024) return;
    this.perform(action, argument).then((result: string | null) => this.respond(id, null, result))
      .catch((error: Error) => {
        console.error(`ZViewer native ${action} failed: ${error.message}`);
        this.respond(id, error.message || 'Native operation failed', null);
      });
  }

  private async perform(action: string, argument: string): Promise<string | null> {
    if (action === 'bilibiliStart') {
      await bilibiliProxy.start();
      return JSON.stringify(bilibiliProxy.status());
    }
    if (action === 'bilibiliStatus') return JSON.stringify(bilibiliProxy.status());
    if (action === 'bilibiliCreateQr') return JSON.stringify(await bilibiliProxy.createQr());
    if (action === 'bilibiliPollQr') {
      const options = JSON.parse(argument) as PollQrArgument;
      if (!options.key || options.key.length > 128) throw new Error('Invalid QR session');
      return JSON.stringify(await bilibiliProxy.pollQr(options.key));
    }
    if (action === 'bilibiliCancelQr') { bilibiliProxy.cancelQr(); return null; }
    if (action === 'bilibiliLogout') return JSON.stringify(await bilibiliProxy.logout());
    const mainWindow = await window.getLastWindow(this.context);
    if (action === 'toggleOrientation') {
      if (argument !== 'true' && argument !== 'false') throw new Error('Invalid orientation argument');
      if (this.initialOrientation === null) this.initialOrientation = mainWindow.getPreferredOrientation();
      await mainWindow.setPreferredOrientation(argument === 'true' ? window.Orientation.LANDSCAPE : window.Orientation.PORTRAIT);
      return null;
    }
    if (action === 'unlockOrientation') {
      await mainWindow.setPreferredOrientation(this.initialOrientation ?? window.Orientation.UNSPECIFIED);
      return null;
    }
    if (action === 'setImmersive') {
      if (argument !== 'true' && argument !== 'false') throw new Error('Invalid immersive argument');
      const enabled = argument === 'true';
      await mainWindow.setWindowLayoutFullScreen(enabled);
      await mainWindow.setSpecificSystemBarEnabled('status', !enabled);
      await mainWindow.setSpecificSystemBarEnabled('navigation', !enabled);
      return null;
    }
    if (action === 'requestMicrophonePermission') {
      const result = await abilityAccessCtrl.createAtManager()
        .requestPermissionsFromUser(this.context, ['ohos.permission.MICROPHONE']);
      if (result.authResults[0] !== 0) throw new Error('Microphone permission denied');
      return null;
    }
    throw new Error('Unsupported native action');
  }

  private respond(id: number, error: string | null, result: string | null): void {
    this.controller.runJavaScript(`window.__zvHarmonyResponse?.(${id}, ${JSON.stringify(error)}, ${JSON.stringify(result)})`)
      .catch(() => console.error('Unable to deliver native response'));
  }
}

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private host: HarmonyHost = new HarmonyHost(getContext(this) as common.UIAbilityContext, this.controller);

  private localResource(url: string): WebResourceResponse | null {
    if (!url.startsWith(`${LOCAL_ORIGIN}/`)) return null;
    const response = new WebResourceResponse();
    const rawPath = url.slice(LOCAL_ORIGIN.length + 1).split(/[?#]/)[0] || 'index.html';
    if (!/^[A-Za-z0-9_./-]+$/.test(rawPath) || rawPath.includes('..')) {
      response.setResponseCode(400);
      return response;
    }
    try {
      const data = (getContext(this) as common.UIAbilityContext).resourceManager
        .getRawFileContentSync(`web/${rawPath}`);
      const body = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      response.setResponseData(body);
      response.setResponseMimeType(mimeType(rawPath));
      response.setResponseEncoding('utf-8');
      response.setResponseCode(200);
      response.setReasonMessage('OK');
    } catch (_error) {
      response.setResponseCode(404);
      response.setReasonMessage('Not Found');
    }
    return response;
  }

  onBackPress(): boolean {
    this.controller.runJavaScript("window.dispatchEvent(new Event('zviewer:native-back'))").catch(() => {
      console.error('Unable to deliver native back event');
    });
    return true;
  }

  build() {
    Column() {
      Web({ src: LOCAL_PAGE, controller: this.controller })
        .width('100%')
        .height('100%')
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .javaScriptProxy({
          object: this.host,
          name: 'zviewerHost',
          methodList: ['getPlatform', 'minimizeApp', 'request'],
          controller: this.controller
        })
        .onLoadIntercept((event) => {
          return !event.data.getRequestUrl().startsWith(`${LOCAL_ORIGIN}/`);
        })
        .onInterceptRequest((event) => {
          return this.localResource(event.request.getRequestUrl());
        })
        .onPermissionRequest((event) => {
          const request = event.request;
          const resources = request.getAccessibleResource();
          const origin = request.getOrigin();
          if (
            (origin !== LOCAL_ORIGIN && origin !== `${LOCAL_ORIGIN}/`) ||
            resources.length !== 1 ||
            resources[0] !== 'TYPE_AUDIO_CAPTURE'
          ) {
            request.deny();
            return;
          }
          request.grant(resources);
        })
        .onPageEnd(() => {
          this.controller.runJavaScript("window.zviewerNative?.platform || 'missing'")
            .then((platform: string) => console.info(`ZViewer bridge platform: ${platform}`))
            .catch(() => console.error('Unable to verify ZViewer bridge'));
        });
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#111417')
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.BOTTOM]);
  }
}
