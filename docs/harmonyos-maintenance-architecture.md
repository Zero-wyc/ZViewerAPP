# HarmonyOS 应用维护架构整理

更新日期：2026-10-02

## 1. 当前开发进程

| 客户端 | 当前状态 | 维护结论 |
| --- | --- | --- |
| Android | 已完成开发，当前发布版本 1.5.0（versionCode 150） | Android 是共享网页功能和 B 站行为的主要参考宿主之一 |
| HarmonyOS | 已同步当前 Android 的 v4.2.1 共享业务代码和全局外观，API 26 手机模拟器外观验收完成；客户端包版本为 1.5.0/150 | 维护重点是共享网页同步、ArkWeb 桥接和 ArkTS 本地代理；HEVC Main 10 解码限制单独记录 |
| iOS | Expo/React Native 已完成服务端登录、房间和基础直链播放；等待开发者修复媒体截断问题后继续 | 当前不复用 HarmonyOS ArkWeb 宿主代码；继续遵循 `docs/ios-continuation-plan.md` |

HarmonyOS 应用不是另写一套业务前端。它将根项目构建出的 `dist/` 放入 `entry/src/main/resources/rawfile/web/`，由 ArkWeb 以固定本地来源加载；平台能力通过 `zviewerHost` 注入，再由 `bridge-bootstrap.js` 暴露为共享前端识别的 `window.zviewerNative`。

1.3.5 的一起听导航在鸿蒙手机、横屏和平板固定折叠，忽略旧的展开偏好；播放器下箭头增加浅色圆形底板。房间玻璃背景使用主题变量，纯净视频关闭装饰性模糊和缩放。维护位置与回归清单见 [双端维护与发布](https://github.com/Zero-wyc/ZViewerAPP/blob/client-v1.5.0/docs/mobile-release-maintenance.md#一起听界面维护135)。

1.5.0 新增原生系统播放控件、封面及歌词同步，完善后台播放和自动旋转，修复横屏安全区、头像与追加视频弹窗。一起看采用中间双击播放、全屏左右双击跳转15秒；一起听仅在视频全屏使用相同手势。用户已确认双端测试全部通过，维护位置与正式构建验收见 [1.5.0 发布记录](https://github.com/Zero-wyc/ZViewerAPP/blob/client-v1.5.0/docs/releases/client-1.5.0.md)。

## 2. 代码归属边界

### 2.1 Android 与 HarmonyOS 共同维护

| 代码 | 作用 | HarmonyOS 维护动作 |
| --- | --- | --- |
| `src/App.tsx` | 服务端连接、账号/游客登录、会话恢复、房间列表和创建 | 修改后运行 `npm run harmony:web`，再编译 HAP |
| `src/mobile/` | 移动端房间壳、B 站账号、返回、旋转和音乐音频路由 | 不在组件内写 ArkTS 分支；通过 `src/platform/` 调用 |
| `src/upstream/` | 播放器、同步观影、一起听、语音、屏幕共享、弹幕、字幕、音乐和挂载浏览器 | 这里是产品功能的共享源代码 |
| `src/platform/contracts.ts` | Android Capacitor 和 HarmonyOS ArkWeb 的原生能力契约 | 新增能力先定义共同语义，再在 ArkTS 实现 |
| `src/platform/bilibiliProxy.ts`、`runtime.ts` 等 | 运行时识别、B 站代理、显示、生命周期、音频和权限入口 | 保持 `zviewerNative` 返回结构与 Android 插件一致 |
| `public/`、`vendor/mediabunny/` | 网页资源和媒体依赖 | 构建产物由脚本复制，不手工改 rawfile |
| 根目录构建配置 | Vite、TypeScript、依赖和相对资源路径 | HarmonyOS 使用 `npm run harmony:web` 生成相对路径 |
| B 站质量策略和协议 | `src/upstream/modules/bilibili/` 的 UI、状态和请求契约 | ArkTS 负责实现同一行为，不要改变网页层接口 |

### 2.2 HarmonyOS 独自维护

| 路径 | 内容 | 维护要点 |
| --- | --- | --- |
| `ZV-HarmonyOS/entry/src/main/ets/pages/Index.ets` | ArkWeb 宿主、虚拟本地源、资源拦截、导航限制、返回事件和麦克风权限 | 只允许 `https://zviewer.local`，不要放开任意外部导航 |
| `ZV-HarmonyOS/entry/src/main/ets/entryability/EntryAbility.ets` | Ability 生命周期和安全区 | 生命周期变化要和网页 `appLifecycle` 行为配合 |
| `ZV-HarmonyOS/scripts/bridge-bootstrap.js` | `zviewerHost` 到 `window.zviewerNative` 的异步请求桥 | action 名称和超时必须兼容 `src/platform/contracts.ts` |
| `BilibiliCredentialStore.ets` | B 站 Cookie 的本地安全存储 | Cookie 不返回到 JS 状态、日志或房间事件 |
| `BilibiliResolver.ets` | WBI 签名、视频信息、DASH/MP4 解析、普通画质筛选和实际 qn | 规则变化时与 Android Go 核心对照验证 |
| `BilibiliLocalProxy.ets` | 回环端口、随机路径、CDN 白名单、Range/HEAD、备用地址和解析接口 | 代理只监听 `127.0.0.1`，不把本机 URL 广播给其他设备 |
| `build-profile.json5`、`entry/` 配置与签名配置 | API、产品、权限、HAP 构建 | 证书、Profile、密码和本机 SDK 路径放在仓库外 |

Android 不直接引用这些 ArkTS 文件；Android 的等价实现位于 `ZV-Android/`、`native/bilicore/` 和 Java 插件。

### 2.3 生成目录与源代码

`ZV-HarmonyOS/entry/src/main/resources/rawfile/web/` 是生成目录，源代码在根 `src/`、`public/` 和 `vendor/`。任何共享网页改动都应重新运行：

```powershell
npm run harmony:web
```

不要直接修改生成的 `rawfile/web` 文件来修复功能；下一次构建会覆盖它。

## 3. 当前功能与代码入口

| 功能 | 共享代码 | HarmonyOS 独有代码 | 维护说明 |
| --- | --- | --- | --- |
| 服务端连接、账号/游客登录、令牌刷新和会话恢复 | `src/App.tsx`、`src/upstream/lib/api.ts`、`src/upstream/store/authStore.ts`、`src/upstream/hooks/useSocket.ts` | ArkWeb 网络权限和宿主生命周期 | 业务协议在共享层，宿主只提供运行环境 |
| 全局背景、主题、玻璃 UI 和外观设置 | `src/platform/runtime.ts` 的 `isGlobalAppearanceRuntime()`、`src/App.tsx`、`src/mobile/{MobileAppearance,MobileRoom}.tsx`、`appearance.css`、`themeStore.ts` | ArkWeb DOM/localStorage；`Index.ets` 原生返回事件 | Android/HarmonyOS 共用持续挂载的外观壳；房间设置显示外观入口，根节点变量覆盖 body Portal；外观返回优先于播放器设置、全屏、语音和离房 |
| 房间列表、创建、加入、密码/审批、房主/观众状态 | `src/App.tsx`、`src/mobile/MobileRoom.tsx`、`src/mobile/useMobileRoom.ts`、`src/upstream/store/roomStore.ts` | 无额外房间业务实现 | 服务端权限仍是最终来源 |
| 同步观影、MP4/MKV、DASH、FLV 和播放器控制 | `src/upstream/modules/room/watch-together/`、`sync-playback/`、`player/` | ArkWeb WebView 和系统解码器 | 真实设备编码能力仍需按发布设备验证 |
| 片单、分集、弹幕、字幕、聊天和评论 | `MovieListPanel.tsx`、`useWatchTogether.ts`、`danmaku/`、`subtitles/`、`CommentPanel.tsx` | 无额外业务实现 | 共享网页保持 Android 与 HarmonyOS 交互一致 |
| B 站扫码登录、普通画质选择、手动选档和回退 | `src/mobile/BilibiliAccount.tsx`、`src/upstream/modules/bilibili/`、`src/platform/bilibiliProxy.ts` | `BilibiliResolver.ets`、`BilibiliLocalProxy.ets`、`BilibiliCredentialStore.ets`、`Index.ets` | 登录凭据留在 ArkTS；网页只得到状态和播放结果 |
| B 站双轨播放与本机代理 | `src/upstream/modules/player/engines/`、`useVideoSource.ts`、`nativeQualityPolicy.ts` | `BilibiliLocalProxy.ets` 的 `/resolve`、`/proxy`、Range/HEAD 和 CDN 校验 | 解析成功不等于播放成功；需要验证拖动、暂停和备用地址 |
| 一起听、音乐队列、歌词和同步 | `src/upstream/modules/music/`、`src/mobile/useMusicAudioRouting.ts` | `setMediaPlaybackPreferred` 在 ArkWeb 桥接中降级或实现 | 平台缺少可选方法时应回退到网页行为 |
| 语音聊天和麦克风权限 | `src/upstream/modules/voice-chat/`、`src/platform/permissions.ts` | `Index.ets` 的 `requestMicrophonePermission`、ArkWeb 音频捕获权限 | 检查拒绝、重新授权和前后台恢复 |
| 屏幕共享观看 | `src/upstream/modules/screen-sharing/` | ArkWeb WebRTC/推流播放 | HarmonyOS 客户端不提供屏幕采集端 |
| FTP、WebDAV、OpenList、Emby、Jellyfin、服务端文件和直链 | `src/upstream/modules/{ftp,webdav,openlist,emby,jellyfin,server-files,direct-link}/` | 无额外业务实现 | 受服务端配置和设备解码器限制 |
| 旋转、沉浸式显示、返回键和最小化 | `src/mobile/PlayerDisplayControls.tsx`、`src/mobile/useNativeBack.ts`、`src/platform/{playerDisplay,lifecycle}.ts` | `Index.ets` 的 orientation、immersive、`onBackPress` 和 `minimizeApp` | 原生只执行系统动作，页面状态由 React 管理 |

## 4. HarmonyOS 升级顺序

系统媒体由 `NativeMediaSession.ets` 实现，通过 `Index.ets` 的 `updateMediaSession`/`clearMediaSession` 和 `bridge-bootstrap.js` 与共享播放器连接。封面下载后解码为 PixelMap；播放必须同时具备 AVSession 与 AUDIO_PLAYBACK 连续任务。暂停释放连续任务，退出销毁会话与图片资源。默认及解除手动锁定使用 AUTO_ROTATION_RESTRICTED，尊重系统旋转开关。契约与回归要求见 [双端维护与发布](https://github.com/Zero-wyc/ZViewerAPP/blob/client-v1.5.0/docs/mobile-release-maintenance.md#系统媒体控件后台播放与旋转2026-10-01)。

1. 共享业务改根项目 `src/`，完成 `npm run build`。
2. 运行 `npm run harmony:web`，确认 `rawfile/web` 已重新生成。
3. 需要系统能力时，先确认 `src/platform/contracts.ts` 的可选方法和降级行为。
4. ArkTS 改动按 `Index.ets` → `bridge-bootstrap.js` → 对应 service 的顺序检查请求链路。
5. B 站改动同时对照 Android 的 Go 解析和 HarmonyOS 的 `BilibiliResolver.ets`，确保权限、实际轨道和回退规则一致。
6. 在 DevEco Studio 或命令行构建 `entry`，再使用当前发布设备规则进行安装验收。

## 5. 维护检查清单

- 网页改动后重新生成 rawfile，不修改生成目录作为长期修复。
- 桥接改动检查 `zviewerHost` 的 method list、action、超时、错误回传和 `window.zviewerNative` 的字段。
- 本地资源拦截继续限制固定来源、禁止路径穿越并拒绝非本地导航。
- B 站代理继续限制回环 Host、Origin、CDN 域名、Range 和请求方法。
- Cookie 只在 ArkTS/安全存储/上游请求链路中流转，不进入 React 状态、日志、Socket 或房间广播。
- 播放器改动检查单轨、DASH 双轨、FLV、字幕、弹幕、seek、前后台和设备解码能力。
- 发布改动核对 `docs/releases/`、HAP/APPS 包版本、签名和 API 兼容性；签名材料不进仓库。
- `Index.ets` 通过生成的 `BuildProfile.DEBUG` 控制 ArkWeb 调试；debug 包可用 hdc 转发 `webview_devtools_remote_<pid>` 检查实际 HAP，release 自动关闭。应用进程重启后需重新发现 PID 和建立转发，不能继续使用旧 socket。
- 外观验收需断言主题切换前后 video/audio 为同一 DOM 元素，检查原生返回、横竖屏、Portal、前后台和进程重启后的主题持久化；播放器画布保持黑色。
- 播放设置 dialog 位于深色播放器 DOM 内，需在 dialog 边界重新绑定主题文字、表面与玻璃变量并移除继承的文字阴影。仅外层 dialog card 提供玻璃模糊；内部 main/side 面板取消 backdrop-filter，弹幕滑块分组保持透明，避免叠出淡白色矩形。首页 B 站账号等 mobile-text-button 使用主题强调色，不能固定为浅绿色。回归需看横屏全屏截图，同时检查内部 blur 为 none。
- 本轮 Pura 90 Pro（HarmonyOS 7/API 26）实测 H.264 MP4 与 H.264 MKV 可播放；用户的两部 HEVC Main 10 MKV 解封装和字幕提取成功，但视频零帧并报 `PIPELINE_ERROR_DECODE`。保留视频编码、移除音轨并换为 MP4 后仍失败，不应把 MIME 支持或解封装成功记作解码通过。详见本轮适配记录。

## 2026-10-01 B 站代理、影片时序与全面屏修复

在用户当前 DevEco MatePad Pro 模拟器原房间验证 HarmonyOS B 站影片：本机登录有效；native `/resolve` 返回 200、本次实际选择 1080P (qn 80)、H.264/AAC；Range 请求返回 206，视频为 1920×1080、readyState 4 且视频帧持续解码。本机媒体请求使用随机端口 33745，没有请求房主桌面 CLI 的 9333。HarmonyOS 横屏播放器全屏覆盖 WebView viewport，退出后恢复系统栏与安全区。

播放状态早于 current-movie 和影片列表到达时，观众端等候对应影片资料后再解析/attach；读取 local movieId 时须在异步等待后使用最新 store 值，并在影片已切换时取消过期解析。嵌入式客户端不能将房主 `127.0.0.1:9333` CLI 地址当作设备可达源；客户端本地代理仍使用独立随机回环端口，不需改成 9333。

ArkTS CDN 代理须原样转发 DASH 签名 URL 查询参数，包括 `nbs`。此 B 站 CDN 对常见完整移动 User-Agent 拒绝请求，使用 `Mozilla/5.0` 和尾斜杠 B 站 Referer 后成功取得 Range/206。只放行实际解析返回并核验过的 bilibili/Akamai/mountaintoys CDN 和受限 HTTPS 端口；Cookie 不发给 CDN。

Android `MainActivity` 使用原生 WindowInsets，HarmonyOS `Index.ets` 使用 WindowAvoidArea，把系统栏和 cutout 安全区同步到根 CSS `--native-safe-*`；共享 `appearance.css` 以 `--app-safe-*` 合并浏览器 safe-area。浅色访客标题/正文分别使用 `#1c293a`、`#43566b`，系统栏图标随主题切换。Android 手机模拟 viewport 411×914、HarmonyOS 首页横竖屏的浅/深色实测安全区内显示且无水平溢出。两端播放设置弹窗的内部模糊为 none、分组透明且文字阴影为 none，避免重复淡白色背景框。

Android 模拟器本机 B 站账号有效；隔离房间真实 CDN 播放连续 16 秒且帧数持续增加，延迟影片列表后解析正常，测试中收到 25 个 Range/206 响应并确认没有 9333 请求。用户原房间另行确认 1080P+ 高画质解析与 CDN 数据加载，无改动原房间播放状态。HarmonyOS 横屏全屏已验收。暂停/拖动与 Android 原生全屏专项操作脚本未最终通过，不将其记录为已验收。HEVC Main 10 在既有模拟器的解码限制不属于本次 B 站/界面修复，不应把轨道解析或解封装成功当作可播放。

## 6. 文档入口

- 双端版本、清理与发布步骤：[`mobile-release-maintenance.md`](https://github.com/Zero-wyc/ZViewerAPP/blob/client-v1.5.0/docs/mobile-release-maintenance.md)
- 当前 1.5.0 发布记录：[`releases/client-1.5.0.md`](https://github.com/Zero-wyc/ZViewerAPP/blob/client-v1.5.0/docs/releases/client-1.5.0.md)

- 共享移植边界：[`PORTING.md`](../PORTING.md)
- HarmonyOS 发布说明：[`ZV-HarmonyOS/README.md`](../ZV-HarmonyOS/README.md)
- Android 全局外观同步方案：[`harmonyos-global-appearance-sync-plan.md`](harmonyos-global-appearance-sync-plan.md)
- HarmonyOS v4.2.1 同步与模拟器验收：[`harmonyos-v4.2.1-adaptation-report.md`](harmonyos-v4.2.1-adaptation-report.md)
- Android 对照架构：[`android-maintenance-architecture.md`](android-maintenance-architecture.md)
- iOS 后续开发：[`ios-continuation-plan.md`](ios-continuation-plan.md)
