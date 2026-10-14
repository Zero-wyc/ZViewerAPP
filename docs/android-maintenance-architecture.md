# Android 客户端维护文档

更新日期：2026-10-14。本文与同目录的 HarmonyOS、iOS 维护文档采用统一命名 `平台-maintenance-architecture.md`。

## 当前状态与范围

- Android 源码及已发布安装包为 **1.8.6 / versionCode 186**，目标服务端以已集成的 v4.5.3 协议为基线。版本以 `package.json` 和 `ZV-Android/app/build.gradle` 为准。
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

每次媒体/房间改动至少覆盖登录与切服、房主/观众权限、添加/切片/清空、播放暂停和 seek、字幕/弹幕、离房重入、一起听及语音释放。B站变更补本机登录态/游客态、普通 BV、多 P、PGC、DASH 双轨、真实画质和账号不足错误。平台能力变更补横竖屏/全屏恢复、系统媒体控制、来电/耳机/蓝牙及后台。记录来源属于单元测试、浏览器夹具、模拟器还是物理设备，不得把其中一个层级写成另一个层级的验收。

## 构建与维护顺序

1. 对照本地服务端源码和既有 REST/Socket 事件、DTO、角色权限，列出影响 Android、HarmonyOS 和 iOS 的行为差异；只把所需共享逻辑定向移植到本仓库。涉及平台契约、B站签名或媒体解析时同步检查 HarmonyOS 的独立实现和维护文档。
2. 运行 `npm run test:adaptation`、`npm run test:media`、`npm run build`；Go 核心改动另在 `native/bilicore` 运行 `go test ./...`。
3. 执行 `npm run android:sync`，让 Capacitor 重新生成 Android 网页资源；AAR 由 `scripts/build-bilicore.mjs` 构建，发布时使用 `gomobile bind -trimpath -ldflags="-s -w"` 并扫描本机路径/账号泄露。
4. 在 `ZV-Android` 构建相应 Debug/Release APK，核对版本、签名证书、包内资源和 SHA-256。完成一个可交付版本后在本仓库本地提交。

不要把 `dist/`、Android `build/`、`app/libs/`、本地签名配置或测试截图提交为源码。浏览器夹具、模拟器、构建和安装包检查只证明对应层级；真机播放、后台音频、旋转、蓝牙与跨端同步须单独记录实际设备结果。历史版本与发行记录可由 Git 历史及 GitHub Releases 查询。
