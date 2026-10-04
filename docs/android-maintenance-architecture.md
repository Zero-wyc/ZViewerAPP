# Android 应用维护架构整理

更新日期：2026-10-04

## 2026-10-04：1.6.0 / 160 新服务端适配交付

当前双端开发交付版本为 **1.6.0 / 160**，目标上游 `9827929088a31d7cb1d6bf7ceac096df640a2416`（v4.3.7 后 4 个提交）；已发布的 1.5.0 和下方历史验收记录仍按原版本解释。完整构建与验收边界见 [交付记录](releases/client-1.6.0-adaptation.md)。本轮不修改 iOS 工程。

| 功能 | 维护入口与约束 |
| --- | --- |
| LiveKit 语音 | `modules/voice-chat/hooks/useVoiceChat.ts` 使用 `/api/voice/token/mute/kick`，使用返回 URL 和 identity；保留主业务 Socket、移动持久面板、原生麦克风权限和音频路由。重连中显示媒体中断，自动播放被阻止时提供恢复按钮。 |
| 语音生命周期 | token/权限/connect/publish 用 generation 与取消控制；离房、切服、失败、被踢统一停止原始与处理后的音轨，关闭 AudioContext 并移除 audio。管理员禁言与用户主动闭麦分开保存。 |
| 字幕与媒体 | `modules/subtitles/pgs-decoder.ts`、`mkv-embedded.ts`、`useSubtitles.ts`、`SubtitleOverlay.tsx` 完成有序 PGS 解码与画布定位；保留设备文本字幕偏好。`patches/playsvideo+0.4.7.patch` 由 postinstall 重现视频 cue/AAC 修复。 |
| 本地弹幕 | `modules/danmaku/localImport.ts`、`DanmakuTrackCard.tsx` 支持 XML/JSON，5 MiB 输入与 20000 条限制；房间 JSON 请求不超过服务端 1 MiB 限制，失败回滚并反馈，不误报保存成功。Android 使用系统文档选择器，无全盘存储权限。 |
| 网易云账号 | `useNcmLogin.ts`、`MusicCookieModal.tsx`、`MusicTopNav.tsx` 新增 Cookie 登录/主动复制；游客拒绝，业务 401 不触发会话刷新，关闭后清空临时输入。扫码和 B 站本机凭据体系保留。 |

Android 调试 APK 已在 Medium Phone 模拟器安装。与隔离新服务端、鸿蒙和桌面 SDK 三方联调，远端解码电平非零、桌面接收到 Android 上传媒体字节；管理静音/解禁/踢出、收起面板、本地弹幕保存/观众拒绝与回滚、Cookie 错误/空值和弹窗布局均通过。系统选择器实际返回带中文内容的 XML；H.264/AAC 测试片解码、PGS 定位和现有 639 MB MKV 的 467 条 ASS 提取通过。18 项自动回归通过。

本包是 `com.zviewer.mobile.debug` 调试签名验收包，尚未生成正式签名发布版。真机可听性、蓝牙/耳机、首次拒绝权限后重试、后台锁屏通话、生产代理 UDP/TURN，以及真实长片多次 seek/字幕跨端广播仍需独立验收；不得将模拟器媒体统计当成人工听音结论。旧 v4.2.1 语音协议不受此版本支持。

本轮 iOS 对齐补充：以共享 MusicHomePage/MusicDailyPage/MusicFmPage/DanmakuSearchModal 为参考，新增整份歌单替换或追加、连续漫游、来源下拉与双列弹幕选集、横竖菜单切换、音乐首页卡及日推历史日期。仅 iOS RN 业务与维护资料修改；本端原生和共享运行代码未改、未重新发布。69 项单测与隔离 v4.2.1 的 Web/协议检查通过，真机和完整权限差异保留；没有 EAS 云构建。详见 [预览补充](releases/ios-1.5.0-15-followup-preview.md)。

源码核对基线：`client-v1.5.0`，提交 `1ca96fd46963ff5cb89beb6c3d31e1d7b9f501fc`。2026-10-02 已将该标签的共享前端、Android/HarmonyOS 原生源码及版本文件同步至指定仓库 `E:/Codex-bulid/ZViewer/ZViewer-client`，保留 iOS b12 源码与证据。下述新增路径现已在本目录可读，亦可用 `git show client-v1.5.0:<路径>` 复核。见 [本地同步与验证](client-1.5.0-local-sync-2026-10-02.md)。本次构建验证不代表新增设备验收。

## 1. 当前开发进程

| 客户端 | 当前状态 | 维护结论 |
| --- | --- | --- |
| Android | 当前开发交付 1.6.0 / 160；最近已发布 1.5.0 / 150 | 优先在共享前端实现，再同步原生宿主；1.6.0 真机及正式签名待验收 |
| HarmonyOS | 当前开发交付 1.6.0 / 160，ArkWeb 未签名 HAP | 共享网页业务，原生桥接、B 站代理和打包独立维护；真机及正式签名待验收 |
| iOS | 1.5.0 / b15，用户已确认真机 UI 检测通过，授权未签名 IPA 构建及单独 iOS Release | RN + VLC；I13 与完整音视频/语音验收边界见 [iOS 交付记录](releases/ios-1.5.0-15-unsigned.md) |

当前 Android 的发布入口是 `ZV-Android/`，网页入口是仓库根目录的 `src/`。`ZV-HarmonyOS/` 不应复制 Android Gradle 或 Java 代码；它通过 ArkWeb 加载同一份 `dist/`。

1.3.5 的一起听导航在 Android 手机、横屏和平板固定折叠，忽略旧的展开偏好；播放器下箭头增加浅色圆形底板。修改共享组件后同步两端，维护位置与回归清单见 [双端维护与发布](mobile-release-maintenance.md#一起听界面维护135)。

1.5.0 新增原生系统播放控件、封面及歌词同步，完善后台播放和自动旋转，修复横屏安全区、头像与追加视频弹窗。一起看采用中间双击播放、全屏左右双击跳转15秒；一起听仅在视频全屏使用相同手势。用户已确认双端测试全部通过，维护位置与正式构建验收见 [1.5.0 发布记录](releases/client-1.5.0.md)。

## 2. 代码归属边界

### 2.1 Android 与 HarmonyOS 共同维护

| 代码 | 作用 | 修改后的动作 |
| --- | --- | --- |
| `src/App.tsx` | 服务端地址、账号/游客登录、会话恢复、房间列表和创建入口；Android 房间与首页共用外观壳 | 先完成浏览器构建，再分别同步 Android/HarmonyOS |
| `src/mobile/` | 移动端房间壳、返回键、旋转、B 站账号入口、音乐音频路由和全局外观入口 | 业务行为在这里统一；原生调用只能经过 `src/platform/` |
| `src/upstream/` | 播放器、同步观影、一起听、语音、屏幕共享、弹幕、字幕、音乐及挂载浏览器 | 共享功能升级的主要位置；避免写平台判断分支 |
| `src/platform/contracts.ts` | 原生能力的行为契约和返回数据类型 | 新增原生能力时先扩展契约，再分别实现宿主 |
| `src/platform/bilibiliProxy.ts`、`runtime.ts` 等 | 运行时识别、B 站代理、显示、生命周期、音频和权限适配 | 保持 Android Capacitor 和 HarmonyOS `zviewerNative` 的兼容语义 |
| `public/`、`vendor/mediabunny/` | 图标、字体、工作线程和网页媒体依赖 | 共享前端资源；改动后重新构建网页包 |
| `vite.config.ts`、`tsconfig*.json`、`capacitor.config.ts`、`package.json` | 构建和依赖配置 | Android/HarmonyOS 共用根依赖；不要在平台目录重复安装网页依赖 |
| `native/bilicore` 中的解析规则和接口约定 | B 站账号权限、WBI、DASH 轨道和回退行为的参考实现 | 行为要与 HarmonyOS ArkTS 版本保持一致；源文件本身不是同一个运行时产物 |

### 2.2 Android 独自维护

| 路径 | 内容 | 维护要点 |
| --- | --- | --- |
| `ZV-Android/app/src/main/java/com/zviewer/mobile/MainActivity.java` | 注册 Capacitor 插件和宿主生命周期 | 插件注册名不能随意改变 |
| `ZV-Android/app/src/main/java/com/zviewer/mobile/BilibiliProxyPlugin.java` | 调用 Go Mobile API、二维码登录、状态查询、退出和二维码保存 | Cookie 只留在原生/Go 侧；JS 只接收脱敏状态 |
| `ZV-Android/app/src/main/java/com/zviewer/mobile/PlayerDisplayPlugin.java` | 旋转、沉浸式显示、解除锁定 | 与 `src/platform/playerDisplay.ts` 的方法名保持一致 |
| `ZV-Android/app/src/main/java/com/zviewer/mobile/AudioRoutingPlugin.java` | 一起听与语音之间的媒体音频路由 | 只处理系统音频会话，不把业务状态搬入 Java |
| `SystemMediaSessionPlugin.java`、`PlaybackService.java`、`PlaybackWebView.java` | 系统媒体控件、封面、媒体前台服务与播放期间的 WebView 后台管线 | JS 持有播放状态和房间权限；暂停/离开释放播放锁，离开销毁媒体服务；对应布局为 `capacitor_bridge_layout_main.xml` |
| `ZV-Android/app/src/main/AndroidManifest.xml`、Gradle 文件和资源 | 权限、包名、启动页、签名和 Android 构建 | 证书、密码、本机 SDK 路径不进仓库 |
| `native/bilicore/core/`、`native/bilicore/mobile/` | Go B 站解析、代理、二维码和移动绑定 | 修改时同时考虑 AAR 构建和 Android WebView 播放链路 |
| `scripts/build-bilicore.mjs` | 从 Go 源码生成 Android AAR | Android 构建自动调用；不要手工提交生成的 AAR |

### 2.2.1 Android 1.3.0 全局外观适配（历史）

以下仅描述 1.3.0 外观改动，当时没有新增 Java 插件或改变服务端协议；1.5.0 已新增系统媒体插件与服务，不能沿用“没有新增插件”的结论。外观改动集中在共享移动网页层，通过 isGlobalAppearanceRuntime() 同时在 Android 与 HarmonyOS 启用：

| 文件 | 改动 | Android 结果 |
| --- | --- | --- |
| `src/App.tsx` | 将房间内容与首页内容统一放进 `MobileAppearance`；Android 房间不再绕过背景引擎 | 背景图片、遮罩、位置、缩放、旋转、深浅模式和玻璃参数在页面切换时保持一致 |
| `src/mobile/MobileAppearance.tsx` | 增加 `global`、`room` 作用域；把主题属性和 CSS 变量同步到 `document.documentElement`；支持 `mobile-appearance-open` 事件 | 渲染到 `body` 的弹窗、播放器设置和消息提示也能读取外观参数；房间内可从设置打开外观面板 |
| `src/mobile/MobileRoom.tsx` | 房间设置增加“外观设置”入口；在 Android 与 HarmonyOS 显示 | 不在播放器控制区域叠加悬浮按钮，减少误触 |
| `src/mobile/appearance.css` | 增加房间标题栏、面板、语音面板、弹层和全局 Material/玻璃变量映射；保留播放器黑色画布 | 观影和一起听页面使用同一套背景与玻璃视觉，同时保持视频控件可读性 |
| `src/platform/runtime.ts` | `isGlobalAppearanceRuntime()` 识别 Android 与 HarmonyOS | Android 与鸿蒙共用外观壳；iOS 独立工程保持不变 |

播放器元素不会因为主题变化而重建；H.264 测试视频、横竖屏、全屏、返回键、房间模式切换和主题持久化已在 Android 模拟器验证。

### 2.3 HarmonyOS 独自维护

HarmonyOS 代码见 [HarmonyOS 应用维护架构](harmonyos-maintenance-architecture.md)。Android 不直接引用以下文件：

- `ZV-HarmonyOS/entry/src/main/ets/pages/Index.ets`：ArkWeb、本地资源拦截、权限和返回事件。
- `ZV-HarmonyOS/entry/src/main/ets/services/BilibiliResolver.ets`：ArkTS WBI、画质选择和 DASH 结果整理。
- `ZV-HarmonyOS/entry/src/main/ets/services/BilibiliLocalProxy.ets`：回环 HTTP 代理、Range/HEAD、CDN 白名单和备用地址。
- `ZV-HarmonyOS/entry/src/main/ets/services/BilibiliCredentialStore.ets`：凭据安全存储。
- `ZV-HarmonyOS/scripts/bridge-bootstrap.js`：把 `zviewerHost` 请求桥接为网页使用的 `window.zviewerNative`。

## 3. 当前功能与代码入口

| 功能 | 共享代码 | Android 独有代码 | 维护说明 |
| --- | --- | --- | --- |
| 服务端连接、账号/游客登录、令牌刷新、会话恢复 | `src/App.tsx`、`src/upstream/lib/api.ts`、`src/upstream/store/authStore.ts`、`src/upstream/hooks/useSocket.ts` | 无额外业务实现 | API、Socket 事件和本地会话变更先改共享层 |
| 房间列表、创建、加入、密码/审批、离开和房主状态 | `src/App.tsx`、`src/mobile/MobileRoom.tsx`、`src/mobile/useMobileRoom.ts`、`src/upstream/store/roomStore.ts` | 无额外业务实现 | 服务端权限仍是最终校验；移动端只负责交互和状态展示 |
| 同步观影、播放/暂停/拖动、房主/观众同步 | `src/upstream/modules/room/watch-together/`、`src/upstream/modules/sync-playback/`、`src/upstream/modules/player/` | WebView 媒体能力由 Android 系统提供 | 播放器、同步和源解析要一起回归 |
| 片单、影片切换、分集和弹幕轨道 | `MovieListPanel.tsx`、`MoviePushPanel.tsx`、`useWatchTogether.ts`、`src/upstream/modules/danmaku/` | 无额外业务实现 | B 站分 P 缓存和权限由共享状态配合原生解析状态完成 |
| B 站扫码登录、自动最高普通画质、手动选档、失败回退 | `src/mobile/BilibiliAccount.tsx`、`src/upstream/modules/bilibili/`、`src/platform/bilibiliProxy.ts` | `BilibiliProxyPlugin.java`、`native/bilicore/` | 共享层只处理产品规则和 UI；Cookie、二维码和代理不能进入房间广播 |
| MP4/MKV、DASH、HLS、FLV、FLAC 等媒体路径 | `src/upstream/modules/player/engines/`、`vendor/mediabunny/`、`src/upstream/lib/mediaFormat.ts` | Android WebView/系统解码器 | 具体编码支持取决于设备，不能只依据解析成功判断可播放 |
| 一起听、音乐队列、歌词和音乐房间同步 | `src/upstream/modules/music/`、`src/mobile/useMusicAudioRouting.ts` | `AudioRoutingPlugin.java` | 修改音频模式时检查语音和音乐同时开启的路由 |
| 语音聊天、麦克风权限、静音和成员状态 | `src/upstream/modules/voice-chat/`、`src/platform/permissions.ts` | Android 权限声明和 WebView 音频行为 | 权限拒绝、恢复前台和耳机切换要在真实设备验证 |
| 屏幕共享观看 | `src/upstream/modules/screen-sharing/` | 无采集端实现；Android 只观看桌面端推流/WebRTC | 移动端不提供发起屏幕采集 |
| 字幕、弹幕、评论和聊天 | `src/upstream/modules/subtitles/`、`src/upstream/modules/danmaku/`、`src/upstream/components/CommentPanel.tsx` | 无额外业务实现 | 字体、缩放和安全区由移动 CSS 与 WebView 布局共同影响 |
| FTP、WebDAV、OpenList、Emby、Jellyfin、服务端文件和直链 | 对应 `src/upstream/modules/{ftp,webdav,openlist,emby,jellyfin,server-files,direct-link}/` | 无额外业务实现 | 这些源仍受服务端权限和媒体格式限制 |
| 旋转、沉浸式显示、返回键、最小化和生命周期 | `src/mobile/PlayerDisplayControls.tsx`、`src/mobile/useNativeBack.ts`、`src/platform/{playerDisplay,lifecycle}.ts` | `PlayerDisplayPlugin.java`、`MainActivity.java`、Manifest | 原生插件只实现系统动作，页面状态由 React 管理 |

## 4. Android 升级顺序

系统媒体与旋转的维护契约、生命周期及后台验收条件见 [双端维护与发布](mobile-release-maintenance.md#系统媒体控件后台播放与旋转2026-10-01)。一起看也需要系统媒体会话，不能仅对一起听创建后台服务。默认方向与解除手动锁定都使用 FULL_USER，尊重设备的自动旋转设置。

1. 先判断需求属于共享业务、平台契约还是 Android 宿主。
2. 共享业务改 `src/`，完成 TypeScript/Vite 构建后再执行 `npm run android:sync`。
3. 需要系统能力时，先在 `src/platform/contracts.ts` 定义最小接口，再实现 Java 插件。
4. B 站解析规则变化时，同时检查 `native/bilicore`、`BilibiliProxyPlugin` 和网页的 `useBilibiliQuality`。
5. Android 版本号、包名、签名和权限只改 `ZV-Android/`；发布密钥始终放在仓库外。

## 5. 维护检查清单

- 共享网页改动：构建根项目，确认产物后同步 Android 和 HarmonyOS。
- 全局外观由 `isGlobalAppearanceRuntime()` 在 Android/HarmonyOS 同时启用；`appearance.css` 是两端颜色、玻璃与移动布局的共同来源。浅色设置 dialog 重新绑定主题变量并取消文字阴影；内部 main/side 不叠加模糊，弹幕分组透明；B 站账号入口使用主题强调色。
- 原生桥接改动：检查插件/代理名称、方法名、错误返回和生命周期。
- B 站改动：确认 Cookie 不出原生侧，代理仍只监听回环地址，房间不广播本机代理 URL。
- 原生安全区：Android `MainActivity` 用 WindowInsets、HarmonyOS `Index.ets` 用 WindowAvoidArea 同步动态 CSS 安全区；检查全屏/横竖屏、主题系统栏图标及恢复状态。
- B 站播放时序：媒体状态、current-movie 与 movie-list 到达次序不固定。移动端需等当前影片 DTO 到达再解析；房主 `127.0.0.1:9333` 是房主设备本机 CLI 地址，不可交给其他设备播放。客户端本机代理使用独立随机端口，并保留 CDN 签名查询参数与 Range。
- 设备回归：检查本机 B 站登录、高画质/实际编解码、真实 CDN Range/206、延迟列表竞态且无远端 CLI 回环请求；浅色文字对比与播放器设置不能出现第二层淡白色 blur。
- 播放器改动：分别检查单轨、DASH 双轨、Range、seek、暂停恢复和前后台切换。
- 发布改动：核对 `CHANGELOG.md`、`docs/releases/`、版本号和签名，不提交 APK、AAR、密钥或日志。

## 6. 1.5.0 新增维护入口与回归

Android 系统入口为 `SystemMediaSessionPlugin.java → PlaybackService.java`，播放期间持有 PARTIAL_WAKE_LOCK，`PlaybackWebView.java` 按播放状态维持媒体管线；暂停释放锁，离开销毁服务。默认/解锁使用 FULL_USER。歌词兼容键与通知当前行不代表所有系统都有完整歌词页。

| 能力 | 共享源码入口（仓库相对路径） | 维护要求 |
| --- | --- | --- |
| 系统媒体 | `src/mobile/useSystemMediaSession.ts`、`src/platform/{contracts,mediaSession}.ts`；`src/upstream/modules/room/watch-together/WatchTogetherCore.tsx` 与音乐 `hooks/useMediaSession.ts` | 一起看/一起听均接入；sessionId/actions 校验，业务秒/系统毫秒，观众命令经过审批；旧播放器只能清理自己的会话 |
| 歌词与封面 | `src/upstream/modules/music/hooks/useSystemLyrics.ts`、`utils/lyricRequest.ts` | 合并请求、20 项/5 分钟缓存、LRC 上限 65536 字符；媒体桥接上限 262144 字符；切无歌词曲清空，旧图片回调不能覆盖新曲 |
| 旋转与手势 | `src/mobile/PlayerDisplayControls.tsx`、`src/platform/playerDisplay.ts`、`src/mobile/videoGestures.ts`；`useWatchGestures.ts`、`useMusicVideoGestures.ts` | 首次切换锁定、再次自动；中心双击播放，全屏侧边 ±15 秒；音乐仅纯净模式启用并操作音频；单击显示控件 |
| 音乐 UI | `src/upstream/modules/music/components/{MusicTopNav,MusicAppShell,MusicVideoModal}.tsx`、`hooks/useBackgroundVideoSync.ts`、`utils/neteaseImage.ts` | 宽屏仍折叠、44px 可见关闭区、背景铺满/前景避让、弹窗与键盘滚动、头像占位、删除后同源重加重新加载 |

系统控件权限、真正后台音频、旧会话清理、歌词快切、系统旋转锁和触屏去重需单独回归。后台不能只看 paused=false；需确认后台状态、时间推进和实际音轨输出。历史解码限制继续保留。所有客户端修改及 Git 操作统一在指定 ZViewer-client 仓库完成，遵循根 Agents.md。

## 7. 文档入口

- 双端版本、清理与发布步骤：[`mobile-release-maintenance.md`](mobile-release-maintenance.md)
- 当前 1.5.0 发布记录：[`releases/client-1.5.0.md`](releases/client-1.5.0.md)

- 共享移植边界：[`PORTING.md`](../PORTING.md)
- Android v4.2.1 适配记录：[`android-v4.2.1-adaptation-report.md`](android-v4.2.1-adaptation-report.md)
- Android 全局外观适配：[`android-global-appearance.md`](android-global-appearance.md)
- 鸿蒙同步适配方案：[`harmonyos-global-appearance-sync-plan.md`](harmonyos-global-appearance-sync-plan.md)
- HarmonyOS 维护架构：[`harmonyos-maintenance-architecture.md`](harmonyos-maintenance-architecture.md)
- iOS 后续开发：[`ios-continuation-plan.md`](ios-continuation-plan.md)

## 2026-10-02 iOS 界面对齐交接

双端继续共用 src/，iOS 使用 RN + VLC。mobileDesign、Surface/AppDialog、来源下拉/集中选集移植产品布局与字段；默认背景复用 public/Nacho3.jpg，首页 B站账号改为可见文字，标题/提示有主题底色，竖屏评论位于视频下方。59 单测、29 首页/59 房间/21 来源 Web、24 Yoga 通过；只修改 iOS 与维护文档，未改双端程序。本轮无新增 EAS Build/Update 或 IPA，继续 Expo Go 预览；I13 后台业务 Socket 和原生等效验收保持待完成。详见 [b15 预览](releases/ios-1.5.0-15-preview.md)。

### 2026-10-02 展开音乐播放器补充

展开页重做为共享双端的播放卡/图标工具栏/独立完整歌词结构；iPad 竖屏双栏，窄屏手机切换歌词，短横屏压缩控件，封面明确宽高防止拉伸。新增 31 项播放页 Web 和既有 59 项房间复验均通过，0 JS 异常；59 单测、lint/typecheck 和 iOS/Web 导出通过。源码编号仍为 15，无新云端构建/更新或 IPA，继续 Expo Go Reload。原生安全区、大字体、旋转、VLC 出声和后台限制仍待设备验证。详见 [音乐页补充](releases/ios-1.5.0-15-music-preview.md)。

### 2026-10-02 音乐首页横幅与滑动补充

iOS 横幅改为加载原始宽图并等比铺满，去掉仅用于专辑封面的 CDN 方图裁切；支持手动左右滑动、双向首尾循环和定位条，短拖动/竖向滚动不切图，手动操作避开自动轮播。70 单测、60 项 RN Web/CDP 触摸与既有功能检查、lint/typecheck、本地 iOS/Web 导出通过；这不是 UIKit 真机通过证明。只修改 iOS 与维护记录，双端程序未变；没有新增 EAS Build/Update 或 IPA，继续 Expo Go Reload。
详见 [横幅补充](releases/ios-1.5.0-15-banner-preview.md)。

### 2026-10-02 iOS 发布交接

用户确认 iOS 真机 UI 通过；本轮 iOS 对齐版本 1.5.0，以未签名 IPA 独立发布。Android/鸿蒙源码已与现有 client-v1.5.0 发布提交核对一致，未重新构建双端包。由于 Expo Build 的额度限制，iOS 端更新与错误修复会出现延迟，不会与 Android/鸿蒙两端同步完成（除非有人有 Mac 帮忙编译）。
