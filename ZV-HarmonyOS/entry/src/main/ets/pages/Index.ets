import { common } from '@kit.AbilityKit';
import { webview } from '@kit.ArkWeb';

const LOCAL_ORIGIN = 'https://zviewer.local';
const LOCAL_PAGE = `${LOCAL_ORIGIN}/index.html`;

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

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  getPlatform(): string {
    return 'harmony';
  }

  minimizeApp(): void {
    this.context.moveAbilityToBackground().catch(() => {
      console.error('Unable to move ZViewer to background');
    });
  }
}

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private host: HarmonyHost = new HarmonyHost(getContext(this) as common.UIAbilityContext);

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
          methodList: ['getPlatform', 'minimizeApp'],
          controller: this.controller
        })
        .onLoadIntercept((event) => {
          return !event.data.getRequestUrl().startsWith(`${LOCAL_ORIGIN}/`);
        })
        .onInterceptRequest((event) => {
          return this.localResource(event.request.getRequestUrl());
        })
        .onPageEnd(() => {
          this.controller.runJavaScript("window.zviewerNative?.platform || 'missing'")
            .then((platform: string) => console.info(`ZViewer bridge platform: ${platform}`))
            .catch(() => console.error('Unable to verify ZViewer bridge'));
        });
    }
    .width('100%')
    .height('100%');
  }
}
