# Android 客户端维护文档

更新日期：2026-10-15。本文与同目录的 HarmonyOS、iOS 维护文档采用统一命名 `平台-maintenance-architecture.md`。

## 当前状态与范围

- Android 源码及已发布安装包为 **1.9.0 / versionCode 190**，目标服务端以已集成的 v4.5.3 协议为基线。版本以 `package.json` 和 `ZV-Android/app/build.gradle` 为准。
- 客户端修改、Git 提交均在 `E:/Codex-bulid/ZViewer/ZViewer-client` 完成。`ZViewer-source code` 是本地服务端目录，不在其中改客户端。
- Android 与 HarmonyOS 共用根目录 React/Vite 界面，但原生宿主不同；iOS 是 `ZV-iOS` 中独立的 Expo/React Native 工程。三端实现和验收不能互相替代。

## 代码入口

| 功能 | 维护入口与约束 |
| --- | --- |
| 首页、房间、移动布局 | `src/App.tsx`、`src/mobile/MobileRoom.tsx`、`src/mobile/mobile.css`；房间状态与权限在 `src/upstream/store/roomStore.ts` 及相关 hooks。 |
| 服务器连接与凭据 | `src/platform/connectionTransport.ts`、`serverConnection.ts` 与 `ZV-Android/app/src/main/java/com/zviewer/mobile/ServerConnectionPlugin.java`；连接证书和私有凭据留在原生侧，不能进入房间广播、网页日志或发布源码。 |
| 媒体播放与同步 | `src/upstream/modules/player/`、`sync-playback/`、`src/platform/playerDisplay.ts`；真实媒体身份与设备本地可播 URL 分离，切片/seek/离房要废弃过期异步任务。 |
| 视频显示、返回与系统媒体 | `src/mobile/PlayerDisplayControls.tsx`、`useNativeBack.ts`、`useSystemMediaSession.ts`；原生实现为 `PlayerDisplayPlugin.java`、`SystemMediaSessionPlugin.java`、`PlaybackService.java`。全屏退出须恢复方向与系统栏。 |
| B 站解析、账号、代理 | `native/bilicore/core/`、`native/bilicore/mobile/`、`scripts/build-bilicore.mjs`、`BilibiliProxyPlugin.java`、`src/platform/bilibiliProxy.ts`；WBI、PGC、UGC、画质与音轨仍需分别回归。Cookie 留在本机原生/Go 层。 |
| 媒体库与番剧 | `src/upstream/modules/emby/`、`jellyfin/`、`kazumi/`、`anisubs/`、`modules/player/services/library-hls-proxy.ts`；HLS 相对路径用选定服务器路由，媒体库版本使用真实 MediaSource ID。 |
| 音乐与语音 | `src/upstream/modules/music/`、`voice-chat/`、`src/mobile/useMusicAudioRouting.ts`、`AudioRoutingPlugin.java`；私人漫游仅房主在片单写入成功确认后推进，LiveKit 使用服务端返回的 URL/token/identity。 |
| 更新入口 | `src/mobile/AboutApp.tsx`、`appUpdates.ts`、`src/platform/appUpdates.ts`、`ExternalLinksPlugin.java`；只识别正式客户端 Release 和 APK，下载链接由系统浏览器打开。 |

`src/upstream` 是按服务端协议移植的共享业务，`src/mobile` 是双端移动 UI，`src/platform` 是可替换平台契约。`public/` 与 `vendor/mediabunny/` 是运行时资源；更新上游时应做定向移植，保留本地桥、补丁和生成物边界。`patches/playsvideo+0.4.7.patch` 是媒体修复的安装时依赖，不能作为旧过程文件删除。

### 共享层与宿主的调用链

React 页面先调用 `src/platform/contracts.ts` 中定义的能力，再由 `runtime.ts` 选择 Capacitor 插件。`MainActivity.java` 注册插件，Java 宿主负责权限、WebView、系统媒体和到 Go 解析器的连接。新增平台能力时，应先确定请求参数、返回值、失败码和取消语义，再同步 HarmonyOS 的 `zviewerNative` 方法；仅在 Java 增加方法会使鸿蒙共享页面落入不可用状态。

根目录 `npm run build` 的 `dist/` 会在 `android:sync` 后进入 Android `app/src/main/assets/public/`。`src/`、`public/` 和 `vendor/` 是源，生成的网页资源不能手工修复。上游服务端改动需要先确认 REST/Socket DTO 与房间权限，再将差异定向移植到 `src/upstream`，不要覆盖 `src/platform`、原生插件、本机连接通道、主题和本地媒体补丁。

### 房间、播放与权限

房间状态以服务端当前影片、片单和角色广播为权威。`roomStore.ts` 记录的影片 ID、CID、剧集和服务器逻辑 URL 跨设备一致；Go 本机代理的随机回环 URL 只能在当前设备解析/播放时产生，不能写进片单、缓存的逻辑身份或 Socket 广播。观众拿到播放状态早于片单元数据时，`useVideoSource` 应等待匹配影片资料；切 P/集、离房、切服或新请求开始后，旧解析结果必须失效。

`MovieListPanel.tsx`、`MoviePushPanel.tsx` 和 `playlistOrder.ts` 管理片单展示、添加、排序。完整排列与 root/房主权限由共享层先校验，服务端仍作最终鉴权。清空片单使用单次服务端删除请求并等待权威广播；响应失败不能先清 UI。自动续播位于 `room/watch-together/autoContinue.ts`，只从最新片单选下一部；房间/角色/模式变更需取消等待中的推进。`src/upstream/modules/sync-playback/` 负责房主/观众心跳、seek 抑制和状态合并，播放控制改动必须联测媒体换源与自然结束。

`src/upstream/modules/player/engines/` 根据媒体格式选择 MP4、HLS、DASH、FLV 或浏览器转码路径。`library-hls-proxy.ts` 处理媒体库主/子清单、相对分片与鉴权；`patches/playsvideo+0.4.7.patch` 修复 MKV cue 与 AAC 时间轴，`modules/subtitles/pgs-decoder.ts` 负责 PGS 位图。只有解析返回、Range=206 或容器识别成功，不代表设备解码成功；HEVC/Opus、ASS/PGS 与多音轨需按具体设备实播、拖动和字幕切换记录。

2026-10-14 HLS 连接核查：HTTPS 登录与游客登录都将服务端返回的 token 保存到本机，主清单、分片与密钥的服务端代理请求使用 URL token 鉴权，不能因 hls.js 未启用 Cookie 凭证就推断请求必然 401。修复共享 `getApiUrl()` 在证书例外回环通道下的尾斜杠，避免无路径前缀的服务器被拼成 `//api/...`；HLS loader 的 API 判定统一使用逻辑服务器地址，避免把本机通道对应的 API 再重建为代理请求。`scripts/hls-auth.test.mjs` 使用实际 token 存储和 URL 构造函数覆盖双端来源、HTTP/HTTPS、路径前缀、证书例外通道、相对密钥与分片；这是自动化验证，不等于真机或线上故障复现。截图错误 URL 只展示前 80 字符，不能用它判断末尾是否带 token。

### B站双实现与质量规则

Android 的 `native/bilicore/core/wbi.go`、`pgc.go`、`resolver.go`、`quality.go` 与 `mobile/mobile.go` 构成 WBI、UGC/PGC、画质和本机 HTTP 代理链。根前端 `src/upstream/modules/bilibili/` 展示质量与解析状态。HarmonyOS 的 ArkTS WBI/Resolver 是独立实现：改签名、重排表、特殊字符编码、会员错误、分 P/集、DASH 音轨或业务 `result` 解析时，两边都要用同一固定输入向量与真实请求核对。普通画质自动选择要排除设备不兼容的 HDR/Dolby 档位；手选画质失败不能悄悄报告更高或不同轨道。

账号登录且本机代理可用时，默认“自动最高”只在账号权限、真实轨道与设备解码能力允许的普通画质中选择；HDR/杜比档位不能只按 qn 数值自动选入。没有可播的 1080p 以上画质，或高画质恢复预算耗尽时，优先尝试真实可用的 720p；若源站不提供 720p，继续尝试实际可播的更低档位并显示真实画质。会员/地域/影片删除等权限错误不能靠降画质掩盖。用户手选画质后以手选为准，登录回调或代理重连不能擅自升档；切 P 与换片须重新核对当前媒体身份、实际轨道和音视频同步。

`cliOnly` 影片必须先保持原有逻辑身份，只允许本机 CLI/本机账号路径解析。房主的桌面 `127.0.0.1` 地址不可能供观众设备使用，服务器代理兜底也不能突破 `cliOnly` 约束。Android 的服务器连接例外只作用于明确选择的 origin；随机私有通道供 HTTP、Range 与 WebSocket 使用，撤销时关闭在途请求。普通外域仍按系统 TLS 校验，不要全局关闭证书验证。

### 音乐、语音、外观和系统能力

`music/store.ts`、`MusicPlayerContext.tsx`、`hooks/useListenTogether.ts`、`personal-fm.ts` 管理队列、房间同步及私人漫游。默认音乐音量为 50%，已有有效本机音量优先；晚到的服务器设置不能覆盖刚完成的手动调整。房主私人漫游需等 `music:queue-upsert` 成功确认才推进，失败/超时保留候选，普通歌曲插播与离房停止旧请求。`voice-chat/hooks/useVoiceChat.ts` 使用服务端 `/api/voice/token` 给出的 LiveKit URL/token/identity；管理员禁言和用户主动闭麦是不同状态，离房/切服应释放音轨与音频路由。

`MobileAppearance.tsx` 与 `appearance.css` 将主题变量提升到根节点，让 body Portal 的弹层也继承深浅主题、背景与玻璃参数；切主题不可重建视频/音频元素。`useNativeBack.ts` 依次处理顶层弹窗、播放器设置、全屏及离房；`PlayerDisplayPlugin.java` 按显式目标方向设置全屏，退出时恢复系统栏与自动旋转。`useSystemMediaSession.ts` 和 Java 媒体服务按 sessionId 所有权更新封面、进度、歌词与控制，旧播放器不得清除新会话。系统控制对观众仍要服从房间权限。

### 常见故障定位

| 现象 | 优先核对 |
| --- | --- |
| 网页已修复但 APK 仍旧 | `npm run android:sync` 是否重建并复制最新 `dist`；包内资源摘要是否与输出一致。 |
| B站能解析却黑屏/无声 | 实际选中的视频/音频轨道、CDN Range、WebView 解码器和原生代理请求；区分 WBI/权限、CDN 和编解码失败。 |
| 观众反复换源或跳回旧进度 | current-movie 与片单到达顺序、movieId/CID、请求代次、主动 seek 抑制及旧心跳。 |
| 自签服务器 API 可用但媒体/Socket 失败 | selected origin、原生私有通道、Range/WS Upgrade、路径前缀与撤销后的连接清理。 |
| 后台系统控件失效 | `SystemMediaSessionPlugin`、`PlaybackService`、媒体 sessionId、权限与前后台生命周期；构建通过不等于锁屏实测。 |
| 浅色弹窗文字或模糊异常 | 根 CSS 变量、Portal 边界、播放器黑色画布和内部面板叠加的 blur/文字阴影。 |

## 验证矩阵

### 2026-10-15 投屏、小窗与弹出菜单维护

- WebRTC 观看端 `WebrtcWatchPage.tsx` / `WatchControlsBar.tsx` 不再挂载批注图层、工具栏或接收批注事件。全屏隐藏连接标签及分辨率，保留播放、音量、旋转、刷新与小窗操作；`RemoteVideoPlayer` 隐藏重复的 ArtPlayer 内置控制栏。
- `src/platform/webrtcPictureInPicture.ts` 为 Android 选择 Activity 系统画中画。`PlayerDisplayPlugin` 探测系统能力并传入合法宽高比，Manifest 声明 PiP；`MainActivity` 保存/恢复方向并广播进入/退出状态。`webrtc-pip.css` 临时只显示原视频舞台，不移动或重建 video，不改变 MediaStream、不额外建立接收连接。进入前必须有实际解码尺寸和可用视频轨，失败恢复布局并提供应用内小窗；离房、卸载和异步进入过程中取消均释放窗口状态。
- Android 的应用内小窗保留相同 video/流，支持拖动与恢复；此模式不会显示到其他应用上方。HarmonyOS 后续跨应用试验仍白屏，现已取消鸿蒙画中画及应用内小窗入口，见鸿蒙文档；不能用 `document.pictureInPictureEnabled` 独自判定原生宿主可用。
- `src/mobile/useScreenShareDisplay.ts` 统一 WebRTC 与 OBS/FLV 的横屏自动全屏和全屏手势。横屏变化进入全屏，手动退出后不因同一横屏尺寸重复进入；系统 PiP 和应用内小窗的尺寸变化不触发全屏。全屏单击切换控制栏、双击暂停/恢复本机播放；单击延迟 280ms 判定以排除双击，拖动、长按、多指和按钮/滑条操作不触发画面手势，退出/卸载取消待决点击。暂停保留信令与媒体连接，不自动离房。
- 顶部 `message` 的成功/信息/警告/错误以及确认操作采用配套的不透明背景和文字颜色；不再把语义背景替换为透明壁纸颜色。`appearance.css` 补齐浅色/深色警告、错误变量；申请通知、通用 Modal 和 Portal 内房间底部说明采用可读背景/主题文字，提示位置避让系统安全区。
- 房间设置中的外观、B站登录入口在同一行，各自使用外框和背景；已登录/未登录状态来自本机原生账号状态，不暴露账号凭据。
- 一起看“更多”菜单由 `PlayerMoreMenu.tsx` Portal 渲染，常规观看向按钮下方展开，脱离播放器裁切。全屏底部空间不足时改用按钮上方并限制高度滚动；任何方向均与按钮保持间距，菜单打开期间控制栏保持可见。窗口/滚动/可视区域变化重新定位，支持外部点击、Escape 和原生返回关闭。
- 新增 `scripts/webrtc-pip.test.mjs` 验证帧就绪、原流保持、拒绝回滚、离房时延迟进入等行为；`scripts/check-screen-share-ui.mjs` 检查双端三种视口、明暗主题、提示对比度至少 4.5:1、持续出帧及菜单不遮挡按钮。浏览器中的 Android 桥为替身；原生模拟器另外使用已安装 APK 的实际 WebView、真实 Activity PiP 与设备截图验收。测试后还原模拟器连接配置；物理手机和生产跨端投屏另行验收。
- 首轮验证通过 91 项适配测试、4 项媒体测试和 6 组浏览器 UI 场景。Android Studio `Medium_Phone` 与 Mate 90 Pro 模拟器安装 Debug 包后，均通过真实宿主横屏自动全屏、单击显隐、双击暂停/恢复、菜单下弹与按钮点击命中；Android Activity PiP 在系统 `pinned` 状态持续出帧，退出后恢复布局。原视频节点和 MediaStream 均保持；测试使用本机信令替身和设备内真实 RTC 回环，未连接生产投屏房主。鸿蒙后续按用户要求取消小窗，当前策略以下节为准。

### 2026-10-15 首页标识与连接表单调整

- `BilibiliAccount.tsx` 在首页、房间设置、B站解析设置及本机解析提示中统一用 `public/bilibili.svg`。SVG 来自用户指定资源，以 CSS mask 着色：未登录黑色，已登录 `#fb7299`，按钮保持白底矩形；颜色来自现有本机账号状态，登录/退出后刷新，保留账号弹窗和无障碍状态名称。
- `AppIcon.tsx` 复用与应用图标一致的 `public/favicon.jpg`，替换首页及关于弹窗的字母 Z。首页使用独立品牌分组，连接状态只显示 Wifi/WifiOff 图标，文字保留于无障碍名称及提示，不参与布局。
- `AboutApp` 移到品牌栏外，与背景调节按钮共用悬浮样式，在其上方留 12px 间距。不能放在带 backdrop-filter 的品牌栏内，否则 fixed 会受该容器约束；两个按钮均考虑底部/右侧安全区，弹窗遮罩应覆盖按钮。
- 连接模式使用与地址输入框相同的 `input-shell`，保留原生 select 的键盘与触屏选择能力，统一圆角、背景、图标及焦点反馈；证书复选框独立成行，说明仅在选中时展开，不改变连接策略。
- 新增 `scripts/check-mobile-identity-ui.mjs`：双端三种视口、明暗主题和登录/未登录共 24 组状态，检查白底黑/粉图标、应用图标资源、窄屏宽度、悬浮按钮间距、账号/关于弹窗及下拉/证书选项。此脚本使用桥接替身。另通过 91 项适配、4 项媒体、6 组投屏/菜单浏览器回归，Harmony 不显示任何 PiP 入口，Android 保留原生及失败兜底路径。
- 两个模拟器已安装本轮新建的 Debug 包，在实际 WebView/ArkWeb 核对图标着色、悬浮按钮间距、账号与关于弹窗；Mate 90 Pro 另核对连接模式切换、房间白底粉色图标及 RTC 持续解码且无 PiP 入口。测试后恢复连接配置。当前版本号仍为 1.9.0/190，APK 为独立 `.debug` 包，未签名 HAP 仅用于模拟器；未发布 Release，未启动 iOS 构建。

每次媒体/房间改动至少覆盖登录与切服、房主/观众权限、添加/切片/清空、播放暂停和 seek、字幕/弹幕、离房重入、一起听及语音释放。B站变更补本机登录态/游客态、普通 BV、多 P、PGC、DASH 双轨、真实画质和账号不足错误。平台能力变更补横竖屏/全屏恢复、系统媒体控制、来电/耳机/蓝牙及后台。记录来源属于单元测试、浏览器夹具、模拟器还是物理设备，不得把其中一个层级写成另一个层级的验收。

## 构建与维护顺序

1. 对照本地服务端源码和既有 REST/Socket 事件、DTO、角色权限，列出影响 Android、HarmonyOS 和 iOS 的行为差异；只把所需共享逻辑定向移植到本仓库。涉及平台契约、B站签名或媒体解析时同步检查 HarmonyOS 的独立实现和维护文档。
2. 运行 `npm run test:adaptation`、`npm run test:media`、`npm run build`；Go 核心改动另在 `native/bilicore` 运行 `go test ./...`。
3. 执行 `npm run android:sync`，让 Capacitor 重新生成 Android 网页资源；AAR 由 `scripts/build-bilicore.mjs` 构建，发布时使用 `gomobile bind -trimpath -ldflags="-s -w"` 并扫描本机路径/账号泄露。
4. 在 `ZV-Android` 构建相应 Debug/Release APK，核对版本、签名证书、包内资源和 SHA-256。完成一个可交付版本后在本仓库本地提交。

不要把 `dist/`、Android `build/`、`app/libs/`、本地签名配置或测试截图提交为源码。浏览器夹具、模拟器、构建和安装包检查只证明对应层级；真机播放、后台音频、旋转、蓝牙与跨端同步须单独记录实际设备结果。历史版本与发行记录可由 Git 历史及 GitHub Releases 查询。
