# HarmonyOS 客户端维护文档

更新日期：2026-10-18。本文与同目录的 Android、iOS 维护文档采用统一命名 `平台-maintenance-architecture.md`。

## 当前状态与范围

- HarmonyOS 当前发行版本为 **2.1.1 / versionCode 211**，对齐服务端 v4.5.9。版本以根 package.json 与对应原生工程为准。
- 客户端源码和 Git 操作均在 `E:/Codex-bulid/ZViewer/ZViewer-client`；共享 React/Vite 前端与 Android 相同，原生部分使用 HarmonyOS ArkTS 与 ArkWeb。
- B站 Cookie、服务端凭据和本机代理状态只保存在原生侧。不能进入 React 状态持久化、网页日志、Socket 房间广播或公开源码。

## 代码入口

### 2.1.1 / 211：进房黑屏、评论徽章与自动连播（2026-10-18）

- 共享 `sync-playback/playbackIdentity.ts` 统一初始播放身份校验：首次从 null 收到 current-movie 和片单不是换片，服务器影片 ID / B站 CID 可锚定同一影片；真实换房、换片、切 P、预览及迟到结果继续丢弃。`usePlaybackStateRequest.ts` 与 `useVideoSource.ts` 共用该判定，避免已经标记已应用却没有挂载播放器。默认弹幕轨道的权限拒绝在 Promise 链中处理。
- `PlayerMobileToolbarRow.tsx` 数量徽章以 `--lt-tone-inverse` 与工具栏色调配对，窄屏使用 10px 字号及至少 16px 高胶囊。`PlaybackOptionToggle.tsx` 统一转码引擎和服务器中转的滑块样式，保留独立媒体策略。
- `MobileRoom.tsx` 的自动连播开关与“添加影片”同高并置于左侧。上游开关没有服务端同步协议，按用户补充要求仅房主显示；连播读取完整片单并由 play-movie ack / current-movie 确认切片，末尾停止。离房、转交和切模式沿用原失效规则。

170 项适配、4 项媒体和 10 组真实组件布局回归通过。NAS B站及连播的 Android 原生结果与本轮 HarmonyOS 原生结果分别记录在 [2.1.1 验证记录](client-2.1.1-validation.md)，不能互相替代；最低 SDK 保持 6.1.0(23)。重新生成 ArkWeb 资源并正式签名构建，按用户确认发布至 [client-v2.1.1](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v2.1.1)，源码同步 main；保留房主本地自动连播逻辑，不构建 iOS。

### 2.1.0 / 210：服务端 v4.5.9 对齐与本地交付（2026-10-18）

目标服务端固定为 main/e86fe409faaf99dfb8b3d7adf6e88e836de12108，业务代码对应 v4.5.9。2.1.0 当时仅本地交付，全部更新已随 2.1.1 公开发行。完整范围、验收层级及未覆盖项见 [2.1.0 验证记录](client-2.1.0-validation.md)，实施依据见 [双端更新指南](安卓鸿蒙对齐服务端v4.5.9更新指南-2026-10-18.md)。

- 同步入口：sync-playback/hooks/useHostBroadcast.ts、useHostHeartbeat.ts、useViewerStateSync.ts 与 playback-memory/hooks/useServerHeartbeat.ts。房主上行携带 clientTs；新服服务器心跳独占常规进度校正，旧服保留 host fallback。10 秒自检由 ackGuard.ts 提供 5 秒超时和身份失效保护；强制全量 state 仍执行统一 MSE seek，包含进度 0。roomStore.hostOffline 统一界面权限与同步状态，离线事件的 6 秒保护避免服务端 5 秒在线缓存回拉暂停；新的 sharer-ready/host 存活证据可提前恢复。
- 音乐入口：music/hooks/useListenTogether.ts 保留本机音频、队列归属、FM、音量和后台修复；新增 server heartbeat 与 check-status，服务器 positionSec 不二次外推。7 秒无服务器心跳只开启房主兼容路径，不直接判离线；检查应答再次验证房间、trackKey 和加载代次。
- 媒体入口：roomStore DTO/add/update、MoviePushPanel.tsx、movie-source-resolver.ts、player/services/url-proxy.ts 及各引擎。directLinkProxy/serverProxy 为明确中转决定，sourceMountId 锚定挂载；关闭中转时 direct/HLS/FLV/DASH/playsvideo 不自动代理。设备到已选服务器的连接通道独立保留，原生运行时不套用普通网页的混合内容预判。
- CMS 入口：modules/cms/ 的 API、类型和 CmsSelector，复用 AnimeSourceBrowser。聚合结果仍路由真实站点；sourceMeta 保留 vodId、playFromIndex、episodeIndex，播放/恢复重新解析。Kazumi 新增影片也保存 episode 元数据；旧无元数据影片保留原 URL 兼容。FTP 挂载影片按 movieId 生成各成员当前服务器鉴权的 stream，不广播个人 ticket。
- 鉴权入口：sync-playback/hooks/useVideoSource.ts 处理当前服务器媒体播放期错误，单次刷新后恢复快照；切服/切房/换片使返回结果作废。mobile/serverUrl.ts 重建服务器媒体 token，第三方 CDN 不接收客户端 token。第三方 403、B站解析错误和解码错误各走原链路。
- 播放器依赖：vendor/playsvideo 取代 npm patch；vendor/local-patches.mjs --check 核对 DTS/FLAC，保留 MKV cue/AAC/字幕行为。playsvideo-engine.ts 采用 45 秒无活动超时及 5 分钟绝对上限，缓存关键帧并向界面透出阶段；字幕 worker 按请求编号分派，并在异常/15 秒无响应时回退主线程。
- 鸿蒙冷启动：Index.ets 安全区注入必须等待页面就绪，页面销毁后拒绝旧窗口回调，并捕获控制器未绑定的同步异常；迟到原生桥响应也安全丢弃，避免冷启动/退出期间的 17100001 崩溃。修复后重新构建 HAP，连续 3 次冷启动无新增崩溃，实际播放与同步场景重跑通过。
- 共享/P2P：mobile/screenShareSession.ts 上报固定安全文案，WebrtcWatchPage 回收失败等待；modules/p2p 加入 ICE 排队与断开宽限。双端独立原生采集、账号隔离、画质和 PiP 差异继续有效。

本轮通过 166 项适配、4 项媒体、10 组 CMS、16 组搜索、12 组下一部和 4 组队列回归；原生结果以验证记录为准。最终 APK/HAP 新构建并正式签名，包内网页资源与生成目录一致；仅在最终构建完成时计算每包一次 SHA-256。iOS 没有改动或启动构建。

### 2.0.0 / 200：搜索入口与下一部（2026-10-15）

`MusicTopNav.tsx` 在小于 768px 的窄屏保留搜索按钮与展开层；宽屏搜索框常驻，不依赖鼠标悬停，背景使用 88% 不透明度。768–1023px 将左右预留列及搜索框收窄为 176px；大屏维持 220px、聚焦 260px，避免遮挡来源导航。网易云与 B站分别走原来的歌曲/视频搜索；B站搜索层不展示网易云热搜。

一起看播放键右侧新增三角形加竖线的下一部按钮，弹幕输入区域最多 640px。`useNextPlaylistMovie.ts` 读取完整权威片单与现有 manageMovie 权限，`playlistPlayback.ts` 发送 play-movie 并等待服务端确认；请求去重，房主片单丢失时最多重新 register-host 一次。不会乐观修改当前影片。末尾、预览、切房、权限撤销、影片被删除或重新排序时禁止继续旧操作；失败允许重试。按用户最终要求，本版未新增自动连播开关或服务端连播功能。

155 项适配和 4 项媒体回归通过；触屏搜索 16 组、下一部 12 组（各含普通/全屏两种布局）通过，覆盖深浅主题、320px 窄屏、手机和平板横竖屏。原生 WebView/ArkWeb 检查使用真实组件、系统点击及隔离的 API/房间确认数据，不冒充生产账号搜索或真实跨端影片同步；具体结果见 [2.0.0 验证记录](client-2.0.0-validation.md)。复现方式：分别启动 `scripts/fixtures/music-search.vite.ts`（4182）与 `playlist-controls.vite.ts`（4183），执行对应 `scripts/check-music-search-ui.mjs`、`scripts/check-playlist-controls-ui.mjs`。

正式安装包从最终 2.0.0/200 源码重新构建成功，输出 `release/client-v2.0.0/`；`hap-sign-tool verify-app` 验证通过，证书链与 1.9.5 一致，30 个包内网页资源匹配最终同步目录。搜索和下一部在实体平板 ArkWeb 中通过系统点击检查，使用隔离数据；此次最终 Release HAP 未再次通过 HoKit 安装，不能把签名验证当作最终包安装验收。构建后各端安装包仅计算一次 SHA-256，发布读取保存摘要。源码与文档同步 main，发行说明见 [2.0.0](releases/client-2.0.0.md)。iOS 本轮不构建、不上传。

### 2026-10-15 一起听全屏队列黑屏与重复弹窗修复

黑屏已在真实共享组件的独立场景复现：侧挂队列的绝对定位溢出增加 `scrollHeight`，`useToolbarScrollable` 因而切成 sheet；浮层脱离测量后又切回 side，形成无限布局更新并触发 React `Maximum update depth exceeded`。现只测量正常文档流直接子项的底边，不把弹窗尺寸算入工具栏高度。按钮真实溢出仍滚动，队列按可用空间切换布局。

`music/store.ts` 用 `queuePopupOwner: widget/player` 约束打开、切换与关闭；完整播放器进入、退出立即收起旧弹窗，重开或重置取消退出定时器，退出期间禁止重新打开队列。`MusicAppShell` 的底栏弹窗与 `ListenTogetherPanel` 的播放器弹窗独立挂载；手机竖屏隐藏的竖向 `PlayerSongControl` 不挂载队列，仅横向工具行显示一份。关闭按钮只关闭自身入口的弹窗，过期回调不能影响新入口。

150 项适配、4 项媒体与 5 组浏览器 UI 回归通过；四种浏览器尺寸各开关 8 次，含隐藏 DOM 的队列总数均为 1。独立工具栏回归还覆盖真实按钮增减及 `side → sheet → side` 转换。运行方式与 Android 维护文档一致，测试入口为 `scripts/fixtures/music-queue.vite.ts` 和 `scripts/check-music-queue-ui.mjs`。

用户用 HoKit 覆盖安装本轮 HAP 并确认打开后，通过 HDC 接入实际 arm64 平板 ArkWeb（1440×960、dpr=2），使用真实界面构建及隔离播放器数据、系统点击开关队列 6 次，并验证工具栏三态切换；队列只挂一份，无渲染异常，静音 WAV 时钟持续推进约 9.14 秒。检查后卸载夹具、恢复原页面样式并停止测试音源。这是原生运行时的界面回归，尚未由本次检查证明真实房间歌曲、同步与后台播放已通过；此前用户确认的屏幕共享验收范围保持单独记录。

最新修复 HAP 为 `release/music-queue-fix-20261015/ZViewer-HarmonyOS-1.9.6-music-queue-debug.hap`，Debug 构建、版本 1.9.6/196、本机既有签名 Profile，`hap-sign-tool verify-app` 通过。HDC 安装仍返回不受信任来源 9568322，实际安装经用户 HoKit 完成；不能写成 HDC 安装通过。网页资源只由 `npm run harmony:web` 生成，临时签名配置已还原，每包只计算一次 SHA-256。此前 `release/client-v1.9.6/` 的 Release 文件尚不含本节修复，不应直接发布旧包。

### 1.9.6 / 196 本地交付与大屏界面

用户已确认鸿蒙屏幕共享功能验收通过。Release 入口开放，固定 `https://zviewer.local` 来源、有效会话、15 秒预备窗口和每次显式授权仍保留；诊断任务查询与 Web 调试仅 Debug 提供。源码版本为 1.9.6/196，已准备本地签名 Release，公开发行仍为 1.9.5；新增界面修正需要安装新包后确认，不将旧包验收自动扩展到新界面。

共享 `MobileRoom/mobile.css` 移除 1200px 布局上限，右侧聊天/片单贴边、视频在左侧剩余空间居中；手机竖屏仍上下布局。语音面板通过实际顶部栏底边定位，保留 8px 间隔、扣除安全区与可用高度，不再用固定 72px 覆盖原生状态栏/顶部操作。创建和房间模式统一“一起看、投屏、一起听”；片单的 B站解析设置移除重复账号入口，房间设置保留。6 个浏览器尺寸及 Android 大屏实际 WebView 的隔离布局验证均通过，鸿蒙新 HAP 安装后再确认。

用户已安装初版 1.9.6 并追加两处外观要求，最新修订将投屏换成 Cast 图标、创建模式改为同排等宽，房间设置同样使用不同图标。Android 原生 Medium_Tablet 的实际 ADB 点击与截图已确认顺序、图标、行布局及面板避让；鸿蒙最新修订包交由用户覆盖确认。

### 2026-10-15 共享画质档位与当前验收

用户已确认 v4 音画/后台与 v5 新增画质档位的真机测试通过。共享提供本机、720P、1080P、2K（1440P）、4K（2160P），默认 720P/30 fps，开始后锁定画质，停止后重选。`screenShareQuality.ts` 根据屏幕方向生成宽高约束，经 `harmonyScreenShare.ts` 传给原生 `getDisplayMedia`；保持源比例、不放大源。本机档用物理尺寸 ideal，不设 max。Android 可请求 30/60/90；鸿蒙系统录屏 API 文档最高 60，因此 v6 将 90 标为不可用，后端也将超限请求限至 60。不能把下拉框或 `getSettings().frameRate` 的配置值当作实际支持高帧率。

专项真机测量：本机 2880×1920/目标 90 时原始帧约 24.7 fps；720P/60 动态操作时约 39.7 fps、帧间隔中位数 17.24 ms，证明确实超过 30。两次测量均没有观众连接，不涉及网络和编码；仍不等于稳定 60。v6 通过 `screenShareFrameMeter.ts` 对私有轨道克隆使用 MediaStreamTrackProcessor 计数，逐帧 close、不读像素/额外编码；结束时 stop clone/cancel reader，失败只取消统计，不终止共享。共享 UI 显示采集实测，无法测量时明确显示尚无实测；接收帧率另受编码、网络影响。145 项适配回归通过，v6 已签名构建，等待后续安装确认。

v4 在真实房间的一次授权持续约 10 分 38 秒，后台 H.264 1080×720；中途观众重进后仍可加入。同一采集有 4 位真实房间访客同时接收 150 秒；系统音频 440 Hz、暂停静音与恢复均有接收测量。真实 LiveKit 第二参与者在同设备的独立 ArkWeb 会话中发送 880 Hz，房主实际收到；共享中该语音频带显著低于系统媒体，未观察明显回录。它不等于第二台实体设备的跨网语音验收。停止后后台任务为空、轨道和 PeerConnection 释放、AudioContext 关闭。用户要求关闭嘈杂调试后已停止所有音源和语音测试；设备交还用户手测。HDC 安装来源限制仍由用户通过 HoKit 覆盖安装解决。

### 2026-10-15 真机音画共享与后台任务修复（实现记录）

后续真机使用 HarmonyOS 6.1/API 24、arm64 平板。其 ArkWeb `getDisplayMedia({video, audio})` 实际返回屏幕视频和系统音频轨，真实房间 Chrome 观众解码 H.264 1080×720，动态画面约 18–30 fps；这与下述首轮 x86 模拟器采集超时属于不同环境证据。后续连续音画、语音与清理结果以上节和验证报告为准。

`EntryAbility.onBackground()` 不再主动结束共享，`onDestroy` 与离房仍结束。`BackgroundMediaTasks.ets` 将采集、媒体播放的实际 owner 串行合并，使用 API 21+ `ContinuousTaskRequest` 和 task ID 更新/停止，防止暂停音乐误停屏幕共享。真机已复现：仅声明录音（包括组合模式的录屏子类型）时，ArkWeb/WebAudio 实际还使用播放流，系统报 `CheckAppUseUnclaimedModes mode 2` 撤销持续任务；旧实现随后因后台非法录音被终止。因此采集任务同时显式声明录音、播放两种能力，并在系统撤销/挂起后停止采集，不能播放假音频维持进程。后台任务失败有有限重试和旧会话重试清理；首次请求同 tick 取消、系统结束发生在麦克风授权期间等竞态均有回归。

`harmonyScreenShare.ts` 将系统轨与 `microphoneCapture.ts` 提供的麦克风 lease 通过 WebAudio 混合为一条发送音轨；音频控制不重新创建采集授权/PeerConnection。房间语音与共享共用一次物理麦克风采集并分别持有克隆，房间语音发送时抑制共享麦克风，已知管理员禁言不能由共享绕过；各消费者静音/释放不影响其他使用者。暂停必须令系统、麦克风和画面全部停止发送，停止必须释放混音上下文、租约、轨道、PeerConnection 和后台 owner。原始系统音轨已有非零信号，接收端实际声音及本应用语音是否回录仍需实测。

共享页复用现有 AppIcon、壁纸/玻璃背景、圆角及明暗主题，移除固定黑矩形；分辨率/状态/音频控制与实际能力对应。Debug 支持查询可返回脱敏的持续任务类型和暂停状态，便于核对系统实际接纳的任务。HDC 安装被设备以“不受信任应用来源”拒绝，用户通过既有 HoKit 流程覆盖调试 HAP 并保留数据；不能把本地签名验证写成 HDC 安装成功。最新验证与遗留项统一见 [验证报告](mobile-screen-sharing-validation-2026-10-15.md)。

### 2026-10-15 首轮手机屏幕共享验证（历史记录，后续真机已通过）

当前发行仍为 1.9.5 / 195。屏幕共享实验功能仅在 Debug 通过 `getScreenShareCaptureSupport` 开放，正式包返回 unsupported；不能将构建成功或授权弹窗成功写成已支持手机实时共享。详细结果见 [屏幕共享验证报告](mobile-screen-sharing-validation-2026-10-15.md)。

共享层调用 `screenShare.ts → harmonyScreenShare.ts`；只有此平台后端持有实际 MediaStream 与 ArkWeb PeerConnection，React 房主组件只交换 sessionId、SDP、ICE 和状态。授权路径是 `contracts.ts → bridge-bootstrap.js → Index.ets → ScreenShareCapturePolicy.ets`，ArkWeb 的 onScreenCaptureRequest 将 ScreenCaptureHandler 交给原生策略。策略仅接受 `https://zviewer.local`（及其尾斜杠形式），要求 Debug、有效 sessionId、15 秒内预备授权且无并行请求，再显示明确的本机确认窗口。确认后使用 SDK 的 `WebCaptureMode.HOME_SCREEN`；拒绝、取消或旧会话不能授权后续采集。未放宽现有来源校验，也未添加系统级 CAPTURE_SCREEN 权限。

实际采集尝试使用 ArkWeb 由原生 ScreenCaptureHandler 授权的 `getDisplayMedia()`；这条路径已在安装的 Debug HAP 中实际调用和授权。当前 Pura 90 Pro x86_64、HarmonyOS 7.0.0(26.0.0) 模拟器确认后仍未返回屏幕流，原生日志出现 `BaseScreenCaptureSource window callback is nullptr`，45 秒后按 capture-start-failed 退出；这只是已观察到的失败位置，尚未证明其根因。尚无连续采集、编码或作为房主向另一端发送视频的通过证据。

`harmonyScreenShare.ts` 对挂起采集提供取消和 45 秒超时；如果系统晚到返回流，过期 session 会立即停止全部轨道。ICE 在 remote description 设置前有界排队；暂停禁用视频轨道，停止逐个关闭 PeerConnection、停止轨道、移除统计和待授权。EntryAbility 的 `onBackground/onDestroy`、Index 销毁发出 `zviewer:screen-capture-stop`，验证版仅承诺前台采集尝试。对已经授权但尚未返回的 ArkWeb 请求，JS 没有原生 AbortSignal 取消能力：会话被失效并清理任何晚到流，页面/宿主销毁才是最终原生回收边界；这项限制必须在可靠取消得到设备验证前解决，不能按完整清理已通过记录。

麦克风、系统音频和后台持续任务均未开放，真实帧率无测量证据时返回 0 并显示待测，不把 track.getSettings().frameRate 的配置值冒充结果。目标构建配置为 compatibleSdkVersion 6.1.0(23)、targetSdkVersion 26.0.0；模拟器系统、目标 SDK 和真实设备应分别记录。原有 WebRTC 观众端保留，Android MediaProjection 到此 ArkWeb 的实际解码是“观众能力”证据，不等于鸿蒙房主采集通过。

本轮观众证据：Pura 90 Pro x86_64、HarmonyOS 7.0.0/API 26，通过本机鉴权 Pion TURN v4.1.4 接收 Android 原生屏幕 603.282 秒，与另 3 个 Chrome 观众共同持续连接，实际 VP8、14–18 fps，竖屏 576×1280 / 横屏 1280×576；可收到房主暂停时的黑帧并在恢复后继续解码。最新 HAP 的房主采集再次立即确认授权后仍在 45 秒超时，未取得视频流；随后销毁宿主收回待定原生请求，不将 JS 会话失效冒充底层取消完成。

Debug unsigned HAP 位于 `release/screen-share-poc-20261015/`，包内 1.9.5/195，已重新安装到模拟器；没有正式签名或真机安装证明。构建后每个最终文件各一次 SHA-256，适配回归共 106 项、媒体回归另 4 项通过。原生授权策略测试包含生产门控、固定来源、显式同意、过期窗口、重复请求和旧弹窗失效；浏览器合成流 UI 证据单列。实现检查点为 9f4e94c，不发布 Release；下一步仍须解决原生返回流、取消与系统停止，再进行完整房间和真机矩阵。

### 既有能力入口

| 功能 | 维护入口与约束 |
| --- | --- |
| 宿主启动和 ArkWeb 生命周期 | `ZV-HarmonyOS/entry/src/main/ets/entryability/EntryAbility.ets`、`pages/Index.ets`；页面创建 `zviewerHost` 并注入 `window.zviewerNative`，加载生成的 `rawfile/web`。 |
| 连接与网络路由 | `services/ServerConnection.ets`、`src/platform/connectionTransport.ts`、`serverConnection.ts`；按已选服务器建立安全通道，原生持有连接状态与证书。 |
| B站解析和本机代理 | `services/BilibiliResolver.ets`、`BilibiliWbi.ets`、`BilibiliLocalProxy.ets`、`BilibiliCredentialStore.ets`；分别维护签名、UGC/PGC 解析、本机媒体代理与凭据生命周期。Cookie 不回传 WebView 或广播。 |
| 播放器与系统媒体 | `services/NativeMediaSession.ets`、`src/platform/mediaSession.ts`、`playerDisplay.ts`、`lifecycle.ts`；维护媒体会话、音频焦点、方向/沉浸栏和页面/房间退出清理。 |
| 共享界面和业务 | 根目录 `src/App.tsx`、`src/upstream/`、`src/mobile/`、`src/platform/`；HarmonyOS 通过平台契约分派能力，避免在共享 UI 中直接调用 ArkTS。 |
| 更新入口 | `src/mobile/AboutApp.tsx`、`src/mobile/appUpdates.ts`、`ExternalLinks` 平台能力；HarmonyOS 入口显示宿主版本并打开正式 Release 下载地址。 |

共享业务仍需遵守移动端房间权限、播放器异步取消、真实媒体身份与本机代理 URL 分离等约束。原生 ArkTS API、WebView 注入、权限与系统媒体行为只在 HarmonyOS 工程验证，不能用 Android 插件或 iOS Expo 模拟替代。

### ArkWeb 与平台桥的完整路径

根项目 `npm run harmony:web` 先以相对资源路径构建 Vite，再由 `ZV-HarmonyOS/scripts/sync-web.mjs` 复制到 `entry/src/main/resources/rawfile/web/`。`Index.ets` 将这些文件通过固定虚拟来源 `https://zviewer.local` 提供给 ArkWeb；`scripts/bridge-bootstrap.js` 在 React 启动前完成 `zviewerHost` 握手，暴露共享前端需要的 `window.zviewerNative`。修改桥接时核对 `src/platform/contracts.ts`、bootstrap 的 action/超时/错误、`Index.ets` 分发以及具体 service 的返回数据。固定来源与本地资源路径校验是安全边界，不能为了播放外部媒体而放开任意网页导航。

原生能力包括应用生命周期、返回键、麦克风权限、服务器连接、B站登录/代理、播放器方向与沉浸模式、系统媒体信息及下载页系统浏览器。共享组件只调用 `src/platform`，不要在 React 组件直接写 ArkTS 特例。ArkWeb 网络、DOM 与设备系统解码器与 Android WebView 不同，同一 `dist` 仍要分别安装验证。

### 房间与播放器维护约束

`src/upstream/store/roomStore.ts` 持有房间影片、片单、角色及模式；`src/upstream/modules/room/watch-together/` 与 `sync-playback/` 处理房主/观众控制。影片 ID、CID/ep 与服务器逻辑 URL 可跨设备传播，本机代理地址只供当前 HAP 播放，不能写入片单或广播。若播放状态先于 current-movie/片单到达，先等待权威影片资料再解析；切 P/集、离房和切服后废弃旧请求。排序必须完整且限有权限的角色；清空片单等待服务器结果与广播，失败不提前清屏；自动连播从最新片单选下一条。

共享媒体引擎在 `src/upstream/modules/player/engines/`，媒体库 HLS 鉴权与相对清单在 `player/services/library-hls-proxy.ts`，PGS/MKV 在 `subtitles/` 和 `patches/playsvideo+0.4.7.patch`。实际可播性取决于 ArkWeb 与设备编解码器。已有 Pura 90 Pro 模拟器上 H.264 MP4/MKV 可播放，而特定 HEVC Main 10 MKV 解封装后仍零帧并报 `PIPELINE_ERROR_DECODE`；这类问题先核对视频 codec 与系统能力，不能把解封装/字幕提取成功当成解码通过。

房间模式固定为一起看、投屏、一起听。当前移动 UI 的房间设置集中在右上角，音乐账号菜单只处理账号与音乐设置，评论侧栏按移动规则展示。`MobileAppearance.tsx`、`appearance.css` 的根变量覆盖 body Portal；切主题要保持原视频/音频 DOM 不变，播放器画布保持黑色。全屏默认横屏，手动解锁后尊重系统旋转开关；退出全屏/离房恢复系统栏和安全区。`Index.ets` 将 WindowAvoidArea 转成 `--native-safe-*`，与网页 safe-area 合并，横屏短高度仍需保证确认按钮可达。

2026-10-14 HLS 连接核查：普通 HTTPS 模式使用本机保存的登录/游客 token，为服务端代理清单、分片和密钥请求附加 URL token，不依赖跨域 Cookie。已发现并修复一个条件性缺陷：启用服务器证书例外且服务器没有路径前缀时，共享 API 基址的尾斜杠可能生成 `//api/...`；HLS loader 的 API 识别还需将本机地址还原为逻辑地址。修复只涉及共享前端，ArkTS 的凭据隔离和证书例外范围保持原有规则。新增 `scripts/hls-auth.test.mjs` 覆盖普通连接、证书通道、路径前缀、主清单、相对密钥、异域分片和 token 不泄漏到上游 URL。自动化验证不代表 ArkWeb 真机实播，原先安卓截图的具体原因仍需实际响应状态/设备日志确认。

### B站 ArkTS 解析与回环代理

`BilibiliWbi.ets` 对关键词和 API 参数签名，`BilibiliResolver.ets` 解析普通 BV、分 P/CID、PGC ep/ss、实际 qn 与 DASH 音视频轨，`BilibiliCredentialStore.ets` 保存本机账号，`BilibiliLocalProxy.ets` 提供 `/resolve` 与媒体代理。Android Go 实现是行为参照而非共享二进制；WBI 字符重排、UTF-8/特殊字符、UGC 的字符串 `result`、会员错误及画质筛选须在 ArkTS 单独测试。

自动画质只从当前账号确有权限、解析结果确有视频与音频轨道、设备能够解码的普通档位选择；不按 qn 最大值直接选择 HDR/杜比。高画质不可用时核对源站实际提供的 720p，再考虑更低档位；手动画质不得被登录回调、代理重连或房间心跳擅自改写。解析成功但无声时，先检查 DASH 音轨与设备播放链路，再区分账号权限、CDN 和解码失败。修复上述规则时，须与 Android Go 的固定向量分别验证，不能因为共享 Web 页面通过就判定 ArkTS 解析正确。

代理只监听随机 `127.0.0.1` 端口和随机能力路径，限制 Host/Origin、HTTP 方法、CDN 域名和端口，正确转发签名查询参数及 Range/HEAD；CDN 请求不带账号 Cookie。房主桌面 CLI 的回环地址不是鸿蒙设备可访问的源，`cliOnly` 也不能改走服务器代理兜底。解析成功后至少核对实际视频/音轨、206 Range、持续帧推进、暂停与 seek；仅见 200 响应不够。

### 系统媒体、语音与安全区

`NativeMediaSession.ets` 创建 AVSession、封面 PixelMap 和后台 AUDIO_PLAYBACK 连续任务，通过 `Index.ets` 的 update/clear action 连接 `src/mobile/useSystemMediaSession.ts`。更新/清除应核对 sessionId，旧媒体不能清掉新媒体。播放中维持后台任务，暂停/离房释放任务与资源；歌词长度、封面回调、秒/毫秒换算以及锁屏命令应回归。原生系统媒体能显示，不代表长期 JS 房间 Socket 一定保持活动。

`voice-chat/hooks/useVoiceChat.ts` 使用 LiveKit `/api/voice/token` 返回的 URL/token/identity，并调用管理 mute/kick；`Index.ets` 处理麦克风授权和 ArkWeb 音频捕获。加入只听、用户主动闭麦、管理员禁言、撤销权限、切房、断网重连要分别验证；离房必须释放音轨与 Web Audio 资源。投屏为观看端，来自 `src/upstream/modules/screen-sharing/`，本手机客户端不负责采集屏幕。

### 常见故障定位

| 现象 | 优先核对 |
| --- | --- |
| React 已更新，HAP 还是旧界面 | 是否运行 `npm run harmony:web`，`rawfile/web` 是否重新生成，包内资源摘要是否匹配。 |
| HAP 白屏或资源 404 | `https://zviewer.local` 映射、相对资源路径、bootstrap 是否先于 React 执行以及 ArkWeb console。 |
| 桥方法超时/字段缺失 | `contracts.ts`、bootstrap action、`Index.ets` 分发、service 返回结构及取消清理。 |
| B站解析成功但无画面或无声 | 本机代理 Range/HEAD、签名 URL、CDN 白名单、音视频实际轨道及设备编解码器。 |
| 进度跳回或旧片重载 | current-movie/片单事件到达顺序、movieId/CID、请求代次、服务器心跳与主动 seek 抑制。 |
| 全屏后留黑边或状态栏 | WindowAvoidArea、`--native-safe-*`、orientation/immersive action、退出恢复与主题 Portal。 |
| 媒体通知出现但后台停播 | AVSession 与 AUDIO_PLAYBACK 任务是否同时有效；暂停、离房、系统回收与实际设备后台策略。 |

## 验证矩阵

### 2026-10-15 WebRTC 白屏与菜单修正

- `WebrtcWatchPage.tsx` / `WatchControlsBar.tsx` 已移除观看端批注图层、工具栏和相关订阅；全屏隐藏连接状态与分辨率，保留必要播放操作。`RemoteVideoPlayer` 只使用共享控制栏，避免叠加 ArtPlayer 的另一套操作。
- 在用户启动的 Mate 90 Pro 模拟器实际 ArkWeb 中，使用两个真实 RTCPeerConnection 在设备内回环传输变化的视频，复现了“主视频持续出帧、调用 `video.requestPictureInPicture()` 后系统小窗纯白”。这证明能力标志及进入事件不等于 MediaStream 可渲染；本次来源为本机生成视频与测试信令服务，并非生产房主或物理手机投屏验收。
- 后续按用户要求尝试跨应用悬浮：在 Mate 90 Pro 模拟器强制发送 H.264，接收端统计确认 `video/H264`、实际解码 640×360，再调用网页 PiP 并按 Home。系统浮窗仍白屏，故按要求取消鸿蒙画中画功能，包括应用内小窗入口；`WebrtcWatchPage` 在 Harmony 上固定不支持，处理函数同步拒绝进入。Android 保留单独的 Activity PiP 与应用内兜底，鸿蒙不调用 Capacitor Android 插件。
- 不要凭能力标志重新对 ArkWeb 的实时流开放网页 PiP；[ArkWeb 官方说明](https://raw.githubusercontent.com/openharmony/docs/master/zh-cn/application-dev/web/web-picture-in-picture.md)列出的媒体范围为 H.264/H.265/HLS，并未保证 WebRTC MediaStream。普通 URL 视频能力须独立核验；今后若恢复真正系统级 WebRTC PiP，需要原生 RTC 渲染面及跨应用持续出帧证据。`rawfile/web` 仍只通过 `npm run harmony:web` 生成。
- `src/mobile/useScreenShareDisplay.ts` 为 WebRTC 与 OBS/FLV 共用横屏自动全屏、单击显隐控制栏和双击暂停/恢复播放。280ms 的单击判定窗口避免双击同时切换控制栏；排除按钮、滑条、拖动、长按和多指，离开全屏取消未处理点击；小窗尺寸变化不触发全屏。保留原流和连接，仅切换本机播放状态。
- 全局 `message` 四类提示及确认提示使用不透明语义背景与配套文字，申请通知和 Modal 避免透明背景导致的低对比度；浅色/深色警告、错误颜色在根变量补齐，Portal 的房间说明文字同步主题，顶部提示避让安全区。
- 房间设置把外观和本机 B站登录状态并列为两个有外框的按钮，窄屏保持可读与可点。一起看“更多”由 `PlayerMoreMenu.tsx` 渲染到独立 Portal，普通观看向下展开；全屏下方不足时改用上方并滚动，菜单不覆盖“更多”按钮，打开时保持控制栏可见，并处理旋转、滚动、返回键及 Escape。
- `scripts/check-screen-share-ui.mjs` 覆盖双端三种视口、明暗主题、提示至少 4.5:1 对比度、原视频保留/持续出帧、小窗恢复和菜单边界。原生模拟器需安装 Debug HAP，通过仅 Debug 启用的 ArkWeb 调试接入；测试 REST/信令由本机 `scripts/fixtures/native-screen-share-server.mjs` 提供，测试后恢复连接设置，不提交设备数据、截图、生成资源或签名资料。
- 首轮结果：91 项适配测试、4 项媒体测试和 6 组浏览器场景通过。Mate 90 Pro 模拟器实际 ArkWeb 通过横屏自动全屏、全屏单击显隐/双击暂停恢复、更多菜单下弹与按钮可点击；Android 模拟器另通过真正 Activity 系统画中画。测试源为本机信令替身、设备内 RTC 回环和测试 MP4，未替代物理手机或生产房主验收。当前鸿蒙小窗已按后续跨应用试验结果取消。

### 2026-10-15 首页图标、悬浮入口与连接表单

- `BilibiliAccount.tsx` 的全部移动端入口：首页、房间设置、B站解析设置及本机解析提示，统一使用用户指定的 `public/bilibili.svg`。CSS mask 未登录为黑色、已登录为 `#fb7299`，搭配白底矩形，保留本机账号弹窗及无障碍状态名称。状态继续通过原生账号桥更新，绝不根据服务器登录态着色。
- 首页及关于弹窗的 Z 字标替换为 `AppIcon.tsx`，复用与应用图标一致的 `public/favicon.jpg`；连接状态只呈现 Wifi/WifiOff 图标，详细状态保留于无障碍名称。独立品牌分组避免窄屏文字逐字换行。
- 关于按钮移出带滤镜的品牌栏，采用背景调节按钮同款 fixed 悬浮样式，在其上方留 12px 间距，并共同遵循系统安全区。连接模式保留原生 select，外层与地址输入框统一圆角、背景及焦点提示；证书复选项增加间距，不改连接例外范围。
- `scripts/check-mobile-identity-ui.mjs` 使用桥接替身覆盖双端三种视口、明暗主题和账号两态共 24 组，包含账号/关于弹窗及连接模式、证书选项。91 项适配、4 项媒体、6 组投屏/菜单浏览器回归均通过；投屏回归改为断言 Harmony 没有任何 PiP/应用内小窗按钮，Android 继续检查原生桥及兜底。
- 新 Debug HAP 已安装至 Mate 90 Pro 模拟器，在实际 ArkWeb 确认白底粉色账号图标、应用图标、无文字连接图标、上下悬浮按钮间距及弹窗；连接模式可在自动/自定义间切换。设备内真实 RTC 回环持续解码 640×360，房间账号图标正常且无 PiP 入口。另在 Android 模拟器检查共享界面。连接配置已恢复；未触碰物理设备，未发布 Release，1.9.0/190 未升版；HAP 未签名，仅供模拟器测试，未启动 iOS 构建。

### 2026-10-15 弹窗层级与说明文字复查

- 关于弹窗标题去掉独立白色底块和 sticky 定位，用原玻璃背景及分隔线衔接内容；连接页底部 HTTPS 说明改用实色主题卡片，增加行高和末尾滚动留白，文字不再压在深色壁纸或固定悬浮按钮下。
- 创建房间遮罩从 `.rooms-view` 提到 `.app-shell` 的直接子层。修复父层 `z-index: 1` 使内部层级 20 仍低于悬浮按钮层级 10 的问题；遮罩覆盖两个入口，批准开关正常响应，关闭后悬浮按钮恢复。表单补充 dialog 名称与模态语义，关闭图标同步主题。
- B站账号弹窗已登录时标题为“B站账号·已登录”，只给状态词使用粉色，账号文字保留原标题颜色；深浅主题分别选择可读的粉色，未登录省略后缀。
- 91 项适配及4 项媒体测试通过；双端三种视口的浏览器回归增加深浅主题对比度至少 4.5:1、关于标题底色、账号两态标题、创建层命中及批准开关检查。新 Debug HAP 与 APK 安装到 Mate 90 Pro / Android 模拟器，在实际 ArkWeb/WebView 核对四处显示和点击。创建页采用本机 REST 测试源，只打开及操作表单，未创建真实房间；测试配置已恢复，不扩大为物理设备验收。

共享改动覆盖账号/游客、创建/加入/审批/离房、片单权限、普通 MP4 与媒体库 HLS、B站 BV/分 P/PGC、弹幕与字幕、一起听和 LiveKit。ArkTS 改动增加固定来源导航、回环代理安全、系统返回、麦克风拒绝后重试、前后台恢复、全屏/旋转和系统媒体。区分单元/桥接替身、ArkWeb 调试、模拟器、物理手机/平板结果；模拟器成功不得外推 HEVC Main 10、真实蓝牙/后台或生产穿透网络。

## 构建与维护顺序

历史正式发行 `client-v1.9.5 / 195`：当时 HAP 通过 `hap-sign-tool verify-app`，证书链与 1.9.0 一致，包内版本 195；Android APK 的 v2 签名和前版证书比较亦通过，双端各 30 个网页资源匹配同步目录。前述 1.9.0 未签名 Debug HAP 属于界面与 RTC 模拟器验收历史。本轮为 `client-v2.0.0 / 200`，请使用上文与 [2.0.0 验证记录](client-2.0.0-validation.md) 的最终包信息；不构建或上传 iOS IPA，鸿蒙设备安装仍受 Profile 授权和安装来源限制。

1. 服务端升级时先核对本地服务端 REST/Socket 合同、角色权限和媒体身份；在本仓库定向移植共享层差异，检查 ArkTS 独立的 WBI、代理、证书和媒体桥。若共享契约变化，同时核对 Android 维护文档及平台实现。
2. 共享前端改动在根目录运行 `npm run test:adaptation`、`npm run test:media`、`npm run build`。
3. 执行 `npm run harmony:web`，通过 `ZV-HarmonyOS/scripts/sync-web.mjs` 更新 `entry/src/main/resources/rawfile/web/`。该目录是生成物，禁止直接修改。
4. 在 DevEco Studio 打开 `ZV-HarmonyOS/`，配置本机 HarmonyOS SDK 与签名后构建 HAP；版本代码与 Android 保持一致。发布签名密钥及 Profile 不放入源码。
5. 检查 HAP 版本、签名、包内网页资源和 SHA-256；完成一个可交付版本后在客户端仓库本地提交。

`build/`、`.hvigor/`、生成的 `rawfile/web/`、本地 SDK/签名配置属于机器生成或私有产物，不进入源码发布。浏览器桥接替身、模拟器和包体检查仅代表对应验证级别；ArkWeb 真机播放、真实账号、后台/蓝牙音频和跨设备同步须按实际设备单独记录。历史版本与发行记录可从 Git 历史及 GitHub Releases 查询。
