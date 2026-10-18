import { abilityAccessCtrl, bundleManager, common } from '@kit.AbilityKit';
import { webview } from '@kit.ArkWeb';
import { window } from '@kit.ArkUI';
import { picker } from '@kit.CoreFileKit';
import { BilibiliLocalProxy } from '../services/BilibiliLocalProxy';
import { DEBUG } from 'BuildProfile';
import { NativeMediaSession, MediaSessionState } from '../services/NativeMediaSession';
import { ServerConnection, ConnectionPolicy } from '../services/ServerConnection';
import { screenShareCapturePolicy } from '../services/ScreenShareCapturePolicy';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';

const LOCAL_ORIGIN = 'https://zviewer.local';
const LOCAL_PAGE = `${LOCAL_ORIGIN}/index.html`;

interface PollQrArgument { key: string; }
const bilibiliProxy = new BilibiliLocalProxy();
const serverConnection = new ServerConnection();
interface ProbeArgument { url: string; }
interface ScreenShareArgument { sessionId: string; }
interface CaptureTaskState { id: number; modes: string[]; submodes: string[]; suspended: boolean; }
interface AppVersionInfo { version: string; build: string; }

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
  private media: NativeMediaSession;

  constructor(context: common.UIAbilityContext, controller: webview.WebviewController) {
    this.context = context;
    this.controller = controller;
    this.media = new NativeMediaSession(context, controller);
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
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647 || argument.length > 262144) return;
    this.perform(action, argument).then((result: string | null) => this.respond(id, null, result))
      .catch((error: Error) => {
        console.error(`ZViewer native ${action} failed: ${error.message}`);
        this.respond(id, error.message || 'Native operation failed', null);
      });
  }

  private async perform(action: string, argument: string): Promise<string | null> {
    if (action === 'getScreenShareCaptureSupport') {
      if (!DEBUG) return JSON.stringify({ supported: true });
      const tasks = await backgroundTaskManager.getAllContinuousTasks(this.context);
      const states: CaptureTaskState[] = tasks.map((task: backgroundTaskManager.ContinuousTaskInfo): CaptureTaskState => ({
        id: task.continuousTaskId, modes: task.backgroundModes, submodes: task.backgroundSubModes, suspended: task.suspendState
      }));
      return JSON.stringify({ supported: true, tasks: states });
    }
    if (action === 'armScreenShareCapture') {
      screenShareCapturePolicy.arm((JSON.parse(argument) as ScreenShareArgument).sessionId, this.controller);
      return null;
    }
    if (action === 'cancelScreenShareCapture') {
      await screenShareCapturePolicy.cancel((JSON.parse(argument) as ScreenShareArgument).sessionId);
      return null;
    }
    if (action === 'screenShareCaptureStarted') {
      await screenShareCapturePolicy.started((JSON.parse(argument) as ScreenShareArgument).sessionId, this.context);
      return null;
    }
    if (action === 'getAppInfo') {
      const bundle = await bundleManager.getBundleInfoForSelf(bundleManager.BundleFlag.GET_BUNDLE_INFO_DEFAULT);
      const version: AppVersionInfo = { version: bundle.versionName, build: String(bundle.versionCode) };
      return JSON.stringify(version);
    }
    if (action === 'openExternalUrl') {
      const value = JSON.parse(argument) as string;
      if (typeof value !== 'string' || !/^https:\/\/github\.com\/Zero-wyc\/ZViewerAPP\/releases(?:\/tag\/[^/?#]+|\/download\/[^/?#]+\/[^/?#]+)?$/.test(value)) throw new Error('下载地址无效');
      await this.context.startAbility({ action: 'ohos.want.action.viewData', uri: value, entities: ['entity.system.browsable'] });
      return null;
    }
    if (action === 'configureServerConnection') return JSON.stringify(await serverConnection.configure(JSON.parse(argument) as ConnectionPolicy));
    if (action === 'probeServerConnection') return JSON.stringify(await serverConnection.probe((JSON.parse(argument) as ProbeArgument).url));
    if (action === 'updateMediaSession') {
      await this.media.update(JSON.parse(argument) as MediaSessionState);
      return null;
    }
    if (action === 'clearMediaSession') {
      await this.media.clear(JSON.parse(argument) as string);
      return null;
    }
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
      await mainWindow.setPreferredOrientation(argument === 'true' ? window.Orientation.LANDSCAPE : window.Orientation.PORTRAIT);
      return null;
    }
    if (action === 'unlockOrientation') {
      await mainWindow.setPreferredOrientation(window.Orientation.AUTO_ROTATION_RESTRICTED);
      return null;
    }
    if (action === 'setImmersive') {
      if (argument !== 'true' && argument !== 'false') throw new Error('Invalid immersive argument');
      const enabled = argument === 'true';
      await mainWindow.setWindowLayoutFullScreen(true);
      await mainWindow.setSpecificSystemBarEnabled('status', !enabled);
      await mainWindow.setSpecificSystemBarEnabled('navigation', !enabled);
      return null;
    }
    if (action === 'setSystemBarStyle') {
      if (argument !== 'true' && argument !== 'false') throw new Error('Invalid system bar style');
      const content = argument === 'true' ? '#FFFFFF' : '#1C293A';
      await mainWindow.setWindowSystemBarProperties({
        statusBarColor: '#00000000', navigationBarColor: '#00000000',
        statusBarContentColor: content, navigationBarContentColor: content
      });
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
    try {
      this.controller.runJavaScript(`window.__zvHarmonyResponse?.(${id}, ${JSON.stringify(error)}, ${JSON.stringify(result)})`)
        .catch(() => console.error('Unable to deliver native response'));
    } catch {
      // An asynchronous native action may finish after its Web component was destroyed.
    }
  }

  dispose(): void { screenShareCapturePolicy.end(); void this.media.destroy(); }
}

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private host: HarmonyHost = new HarmonyHost(getContext(this) as common.UIAbilityContext, this.controller);
  private mainWindow: window.Window | null = null;
  private pendingFileSelection: FileSelectorResult | null = null;
  private alive: boolean = false;
  private pageReady: boolean = false;
  private areaChanged = (): void => { this.syncSafeArea(); };

  private syncSafeArea(): void {
    if (!this.alive || !this.pageReady || this.mainWindow === null) return;
    try {
    const types = [window.AvoidAreaType.TYPE_SYSTEM, window.AvoidAreaType.TYPE_CUTOUT,
      window.AvoidAreaType.TYPE_NAVIGATION_INDICATOR];
    let top = 0; let bottom = 0; let left = 0; let right = 0;
    for (const type of types) {
      const area = this.mainWindow.getWindowAvoidArea(type);
      top = Math.max(top, area.topRect.height); bottom = Math.max(bottom, area.bottomRect.height);
      left = Math.max(left, area.leftRect.width); right = Math.max(right, area.rightRect.width);
    }
    this.controller.runJavaScript(`(() => {const root=document.documentElement;if(!root)return;const d=window.devicePixelRatio||1;const s=root.style;
      s.setProperty('--native-safe-top', '${top}'/d+'px');s.setProperty('--native-safe-bottom', '${bottom}'/d+'px');
      s.setProperty('--native-safe-left', '${left}'/d+'px');s.setProperty('--native-safe-right', '${right}'/d+'px');})()`)
      .catch(() => {});
    } catch {
      // Window events can race Web attachment/destruction. onPageEnd retries the latest insets.
    }
  }

  aboutToAppear(): void {
    this.alive = true;
    this.pageReady = false;
    // Inspect the packaged ArkWeb app during development; release builds disable it.
    webview.WebviewController.setWebDebuggingAccess(DEBUG);
    window.getLastWindow(getContext(this) as common.UIAbilityContext).then((mainWindow: window.Window) => {
      if (!this.alive) return;
      this.mainWindow = mainWindow;
      mainWindow.on('avoidAreaChange', this.areaChanged);
      mainWindow.on('windowSizeChange', this.areaChanged);
    }).catch(() => console.error('Unable to observe window safe areas'));
  }

  aboutToDisappear(): void {
    this.alive = false;
    this.pageReady = false;
    this.pendingFileSelection?.handleFileList([]);
    this.pendingFileSelection = null;
    this.host.dispose();
    this.mainWindow?.off('avoidAreaChange', this.areaChanged);
    this.mainWindow?.off('windowSizeChange', this.areaChanged);
    this.mainWindow = null;
  }

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

  private selectDanmakuFile(event: OnShowFileSelectorEvent): boolean {
    const accepted = event.fileSelector.getAcceptType();
    if (event.fileSelector.getMode() !== FileSelectorMode.FileOpenMode ||
      !accepted.some((type: string) => type === '.xml' || type === '.json' ||
        type === 'application/xml' || type === 'text/xml' || type === 'application/json')) return false;
    // Only the document import gets a host callback; other file inputs retain ArkWeb defaults.
    if (this.pendingFileSelection !== null) { event.result.handleFileList([]); return true; }
    const result = event.result;
    this.pendingFileSelection = result;
    const options = new picker.DocumentSelectOptions();
    options.maxSelectNumber = 1;
    options.fileSuffixFilters = ['弹幕文件|.xml,.json'];
    const documents = new picker.DocumentViewPicker(getContext(this) as common.UIAbilityContext);
    documents.select(options).then((uris: Array<string>) => {
      if (this.pendingFileSelection !== result) return;
      this.pendingFileSelection = null;
      result.handleFileList(uris.slice(0, 1));
    }).catch(() => {
      if (this.pendingFileSelection !== result) return;
      this.pendingFileSelection = null;
      result.handleFileList([]);
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
        .onShowFileSelector((event) => this.selectDanmakuFile(event))
        .onScreenCaptureRequest((event) => screenShareCapturePolicy.request(event.handler))
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
        .onPageBegin(() => { this.pageReady = false; })
        .onPageEnd(() => {
          if (!this.alive) return;
          this.pageReady = true;
          this.syncSafeArea();
          this.controller.runJavaScript("window.zviewerNative?.platform || 'missing'")
            .then((platform: string) => console.info(`ZViewer bridge platform: ${platform}`))
            .catch(() => console.error('Unable to verify ZViewer bridge'));
        });
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#111417')
    .expandSafeArea([SafeAreaType.SYSTEM, SafeAreaType.CUTOUT],
      [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM, SafeAreaEdge.START, SafeAreaEdge.END]);
  }
}
