# HarmonyOS 客户端维护文档

更新日期：2026-10-22。本文与同目录的 Android、iOS 维护文档采用统一命名 `平台-maintenance-architecture.md`。

## 当前状态与范围

- HarmonyOS 当前发行版本为 **2.1.9 / versionCode 219**，按 v4.7.4 执行文档更新播放设置、解析同步、B站请求与语音媒体监看。最终 HAP 已构建并完成签名和网页资源静态检查；最终 219 Debug 宿主复核通过，已发布正式 Release；完整证据见 [2.1.9 验证记录](client-2.1.9-validation.md)。2.1.8 为本地迭代，2.1.7 为此前公开版本；模拟器结果不扩大为 API 23 实体设备验收。
- 客户端源码和 Git 操作均在 `E:/Codex-bulid/ZViewer/ZViewer-client`；共享 React/Vite 前端与 Android 相同，原生部分使用 HarmonyOS ArkTS 与 ArkWeb。
- B站 Cookie、服务端凭据和本机代理状态只保存在原生侧。不能进入 React 状态持久化、网页日志、Socket 房间广播或公开源码。

## 代码入口

### 2.1.9 / 219：对齐服务端 v4.7.4 与最终播放设置（2026-10-22）

本轮基线为服务端 `e3af086c7bd98ee0d4697386b69678f92ea54d81`。新增 `PlaybackOptionButton.tsx` 与 `MovieRuntimeSettings.tsx`：非 B站影片卡使用图标＋粗体中文的独立胶囊按钮，保留服务器中转与浏览器转码两个布尔值；添加面板按用户后续要求恢复 `PlaybackOptionToggle.tsx` 的说明卡＋滑动开关，沿用原草稿默认值与来源可见性。按用户后续反馈将可见胶囊缩为 32px、文字 12–13px、图标约 13–14px；`PlaybackOptionButton.css` 通过所在面板容器宽度（cqw/clamp）和字体比例适配窄屏/分屏，允许整按钮换行。外层触摸高度保留 44px，展开标题图标缩为 14px，不全局缩放其他控件。胶囊开启时使用 primary 实心填充、on-primary 对比色和勾选图标，关闭为表面色描边；勾选位预留宽度避免状态变化时跳动。影片卡默认折叠；屏幕共享隐藏，观众只读，写入要求当前分享端且具 root/持久房间所有者权限，REST 鉴权仍由服务器执行。

最终对齐由 `.playback-option-content` 对称预留半个勾号区域：左侧图标固定，文字与图标垂直居中；关闭时文字在图标右侧剩余区域居中，开启时文字左移半个勾号区域并显示右侧勾号，按钮宽高和图标边界不变。普通状态过渡 160ms，减少动态效果时接近即时切换。320/393/768px、100%/130% 字体、深浅主题、系统字体与实际载入的华文行楷共 24 组实测通过；字体行框与图标垂直中心误差小于 0.004px。该结果为实际组件浏览器几何验证，不能替代 ArkWeb 宿主或鸿蒙真机验收。

`roomStore.saveMoviePlaybackSettings` 只 PUT 改动字段，确认响应 Movie（兼容旧响应时 GET），按房间会话、逻辑服务器、事务令牌保护。`setMovies` 暂存保存中的策略，已确认值与无版本广播冲突时 GET 权威片单；GET 请求代次和 saving 阶段快照拒绝迟到结果。保存与媒体应用状态分开，当前影片交给 `useWatchTogether` 的完整源标识重载；非当前影片只保存。应用保留时间、倍速、暂停意图，成功 attach 后才写入可广播播放状态。失败保留新设置，停止失败管线、广播上次成功源的暂停态并显示重试；换片、离房、身份变化和旧回调失效，不反向 PUT 自动回滚。

ani-subs 返回明确片级转码值；Kazumi 采用元数据解析并兼容旧 HTTP(S)/代理记录，拒绝 `kazumi://` 占位地址作为回退媒体，保留必要源站头并剥离添加者的服务端凭据。Kazumi/CMS 代理使用相对地址，经本机所选服务器、路径前缀与原生连接通道完成鉴权，避免固定到添加者入口。观众以广播 `noProxyFallback` 对中转双向协调，保留片级 false、清理旧音轨/编码。

B站 JSON/NDJSON/CLI 接收 `isHdr/hdrType/videoCodecid`，按真实 codec/profile 做三态能力预检；明确不支持时保留旧引擎与档位，缺字段或探测不可用按未知处理。手动本机选档先解析预检再确认，旧会话结果不提交。仍保留普通 SDR/AVC/AAC 策略与原有 HDR/Dolby 过滤；手动 HDR 和音乐背景 HDR 按执行文档 B01 后置，未获得真实设备显示验收。`desktopManaged` 类型项 B02 本轮未实施。

语音 `transport.ts` 监看实际活动 publisher/subscriber PC/ICE，加入、重连与中断开启约 10 秒媒体窗口；等待麦克风授权不计入超时。每轮提示一次，恢复后清除；SDK 私有诊断不可用显示待确认，不直接断开通话。PC 替换、离房、重试均清理监听与计时器；线路仅采用当前 selected candidate pair。客户端不设置 UDP/TCP/TURN 固定端口，不修改 NAS 网络。

本轮 240 项适配、4 项媒体、6 项 vendor 与 Go core/mobile 回归通过；正确 2.1.9 / 219 HAP 为 14,303,786 字节、debug=false，hap-sign-tool verify-app 与 module.json 版本检查通过，31 个网页资源与最终同步目录逐字节一致。每包仅构建后计算一次 SHA-256，复用 `release/client-v2.1.9/SHA256SUMS.txt`。正确 219 Debug 模拟器版本与界面复核通过，证据为 `.ui-validation/release-219/native/`。同一播放代码此前在误填为 4.1.9 / 419 的 Debug 包完成双向 HLS、四种策略切换、10 秒暂停与 1.5 倍速保持和恢复解码；219 仅更正版本元数据，没有将此前播放证据改称 219 重测。各层证据与发布状态见 [2.1.9 验证记录](client-2.1.9-validation.md)，早期互测见 [2.1.8 历史记录](client-2.1.8-validation.md)。iOS 不修改、不构建、不发布，最低 SDK 继续为 6.1.0(23)。

HarmonyOS `BilibiliResolver.ets` 的实际 UGC/PGC 请求使用修正后的 `buildFnval`，MP4 单独保持 fnval=1；定向测试执行真实调用路径，Hvigor 编译校验 ArkTS。共享资源仅由 `npm run harmony:web` 生成，签名材料仅临时注入本机 build-profile 并恢复；最低 SDK 仍为 6.1.0(23)。

### 2.1.7 / 217：B站短链、竖屏播放与账号路由（2026-10-21）

共享 `modules/bilibili/input.ts` 提取分享文本，`MoviePushPanel.tsx` 在切画质/分 P 时复用 resolvedUrl；`movie-source-resolver.ts` 将历史短链交给本机解析。`BilibiliResolver.ets` 先展开受限 B站短链，再识别视频/PGC，保留 URL 的分 P；`BilibiliLocalProxy.ets` 透传显式 page，CID 优先于 page，显式 page 优先于 URL 参数。返回规范视频地址包含实际分 P，重定向不携带 Cookie。

共享 `nativeQualityPolicy.ts` 增加竖屏宽高检测。ArkTS 原有固定“宽≤1920、高≤1080”会误排除 720×1280 和 1080×1920，现改为长边≤1920、短边≤1080，并同时逐轴核对真实能力上限与帧率，保留 AVC、AAC、会员与原有性能限制。检测不支持的竖屏尺寸不得仅交换宽高后强行放行。

一起看控制栏传入实际 videoRef，由 `PlayerDisplayControls.tsx` 根据解码宽高决定 portrait/landscape，并在 loadedmetadata/resize 后复核。`playerDisplay.ts` 保留串行请求与失效代次；Index.ets 既有原生方向桥接直接执行目标方向。退出与离房解除锁定，手动解锁不会被相同比例的 resize 立即覆盖。投屏与其他播放器沿用原规则，最低 SDK 仍为 6.1.0(23)。

后续修复“仅登录服务端无法添加”：共享 `getActiveCliProxyUrl` 在鸿蒙也要求 ready 且 loggedIn，不再把匿名本机代理当作已登录账号路径。普通内容无本机登录时使用服务端账号；`getBilibiliInputResolvePolicy` 为添加、切画质与分 P 统一检查 CLI-only，明确要求本机账号的内容不得走服务器。已登录本机的权限错误继续直接提示。服务端 DASH 使用共享画质选择器，账号卡片分别注明两处登录状态，试看提示使用“当前解析账号”。

215 项适配、4 项媒体及双端解析夹具通过；ArkWeb 实际 DASH 解码、全屏、服务端账号添加与签名范围见 [2.1.7 验证记录](client-2.1.7-validation.md)，原因与实现见 [账号路由核查与修复](bilibili-server-login-diagnosis-20261021.md)。iOS 不修改、不构建。

### 2.1.6 / 216：完整名称与选集显示方式（2026-10-21）

ArkWeb 与 Android 共用 `src/upstream/hooks/useFullMediaNames.ts` 和 `components/FullMediaNameToggle.tsx`。标题区的“完整显示”滑动开关默认打开，偏好以 `zviewer-show-full-media-names` 保存在当前设备的 localStorage，并即时同步同一应用中的浏览器和选集入口；存储不可用时保留本次运行的内存偏好。开启时列表与海报卡片的影片、剧集和分集名称按可用宽度自动换行，无行数截断，连续英文或文件名也可断行；关闭后恢复列表单行省略、海报标题两行省略。标题与操作按自然宽度优先同排，空间不足才换行；目录导航独立保持单行，各级名称以相同宽度分配空间，超长省略，不受完整显示开关影响。剧集整部添加按钮单独留出操作行，多选和批量添加沿用原逻辑。

实际番剧入口为 `AnimeSourceBrowser.tsx → EmbyBrowser.tsx`，覆盖 Kazumi、ani-subs 与 CMS 的搜索结果和进入后的选集；Emby/Jellyfin 媒体库复用同一浏览器。B站搜索入口 `BiliSearchModal.tsx` 的搜索卡片、详情标题和分 P 名称，以及 `MoviePushPanel.tsx` 解析影片后的“选择分集”弹窗，都读取相同完整名称偏好。已添加影片的实际切集入口位于 `MovieListPanel.tsx`，仅为该处 `Select` 启用 `wrapLabels={showFullNames}`，使选中项与展开选项均可换行；普通来源、画质等下拉框保持原来的紧凑规则。`AnimeEpisodePicker.tsx` 当前未作为实际选集组件挂载。

共享 `hooks/useEpisodeViewMode.ts` 与 `components/EpisodeViewToggle.tsx` 提供显式“列表 / 网格”按钮，默认列表，按 `zviewer-episode-view-mode` 保存本机偏好并在各实际选集入口间共享。列表固定每集一行；网格通过共享 episodeGridColumns 按选集区域实际宽度自动计算列数，以 120px 为卡片宽度下限参考，极窄容器允许缩小至容器宽度，无四列上限；手机、平板、横屏、分屏和展开后的面板使用相同规则。番剧浏览器、Emby/Jellyfin 季内纯分集目录、B站搜索后的分 P 页面和解析后的“选择分集”均提供切换，名称仍服从完整名称开关，编号和选择控件保留独立宽度。媒体库网格卡片的图标与选择控件在上行，名称占下行全宽。选集显示方式与搜索结果的列表/海报墙偏好相互独立，不因切换搜索海报墙改变选集布局。

本轮仅调整共享界面、显示偏好与版本元数据，不修改播放协议、房间同步、HarmonyOS ArkTS 原生媒体/解析桥或 Android 原生逻辑；iOS 不修改、不构建。浏览器布局、双端原生运行时、构建与安装包检查已完成，分层结果见 [2.1.6 验证记录](client-2.1.6-validation.md) 为准；历史 2.1.5 的通过记录不作为本轮验收结果。最低系统版本与原生能力边界保持既有配置。

### 2.1.5 / 215：服务端 v4.7.1 媒体策略对齐（2026-10-21）

依据 [双端检查报告](安卓鸿蒙对齐服务端v4.7.1检查报告-2026-10-21.md)，对齐固定服务端源码 `fe55ddebedb91a4834d6752c5619ea75efec0bbd`。广播、请求状态 ACK 与网页房主预览统一交给 `useViewerStateSync` 串行应用，只在实际 attach 成功后记录源、转码与中转策略；同 URL 改策略也重新加载，同策略只同步播放字段。队列保留最新状态，取消旧下载，失败可重试；订阅独占队列，离房/换片/切房后的迟到任务不能写回。请求期间收到新广播时忽略旧 ACK，服务器心跳继续只校正当前媒体。

`usePlayerSource` 在串行队列内按已成功加载的 PlayerSource 与 video 元素去重，比较地址、音轨、格式、编解码、headers、Blob 和两项策略；移除只按 URL 的提前返回，避免加载中策略切回被丢弃。失败清空已应用标记，不把已销毁的旧引擎记为可复用。观众重新解析 anime/Kazumi/CMS 时保留广播中的明确策略，禁止旧片单强制覆盖直连；预览不重新解析上一影片。HLS 传入恢复起点，并等待首帧数据（readyState ≥ 2）后才返回，避免 ArkWeb 连续重载后过早 seek。

访问统计使用 `movie-source/media-policy.ts`：数据源取 serverProxy、挂载取 directLink，已解析的服务端媒体代理 URL 优先判为中转，预览可由 noProxyFallback 判断；显示与复制共用该结果。WebDAV/OpenList 字幕仍使用原挂载标记。删除当前选择器未使用的单集预览回调与失效属性，保留多选/批量加入片单；其他预览入口与专用事件完整透传中转/转码策略。直连错误指引覆盖数据源与挂载，保留原生 HTTP/证书通道。

本次不覆盖 Android Go/HarmonyOS ArkTS 的 B站内置解析、账号边界或 CLI-only 规则；不修改 iOS、不构建 IPA。模拟器、正式签名包与未覆盖的真机范围分别见 [2.1.5 验证记录](client-2.1.5-validation.md)。

### 2.1.4 / 214：跨来源观众播放快照（2026-10-20）

与 Android 共用 `src/upstream/modules/sync-playback/services/state-merge.ts` 的 `restoreStateSnapshot`，在房主广播和首次进房恢复时按完整 state 清空旧影片字段。JSON 会省略 undefined，旧版 diff 浅合并因此可能残留 B站 audioUrl、CID 和编解码信息，导致 Kazumi HLS 被错误选为 DASH。接收端改为完整快照，心跳仍只校正同一媒体的进度；ArkTS 原生解析和媒体桥不改。

仅在相同 sourceUrl、sourceType 内保留旧版发送端省略的转码/直链策略，跨影片不继承；完整广播补齐策略字段。保持房间会话保护、串行切片和强制同步语义。192 项适配、4 项媒体通过，实际模拟器与包体证据见 [2.1.4 验证](client-2.1.4-validation.md)。网页观众还需部署服务端 [PR #22](https://github.com/Zero-wyc/ZViewer/pull/22)；客户端修复不能改变旧网页中的选源逻辑。

### 2.1.4 / 214：鸿蒙固定采集画布的真机修正（2026-10-20，本地交付）

用户真机仍失败，不能沿用 2.1.3 自动化通过结论。实际日志显示 display.change 已报告 2720×1260，而原视频帧仍是竖屏；交换 applyConstraints 上限后反而从 592×1280 缩成 334×720。ArkWeb 的原生采集画布保持初始方向，原生方向监听本身有效。

`harmonyScreenShare.ts → screenShareVideoTransform.ts` 对同一次 getDisplayMedia 采集的私有克隆创建 MediaStreamTrackProcessor，经 VideoFrame.visibleRect 去除与物理屏幕比例不符的系统画布补边，由 MediaStreamTrackGenerator 输出同一发送轨道；保留应用/视频自身的补边。原始采集请求不设置随初始方向固定的宽高，发送帧再按所选画质限幅，始终不放大。整个链路不读像素、不做 Canvas 定时绘制、不额外采集或创建另一套编码器，旋转无需重新授权或重建 PeerConnection。停止同时取消 reader、writer 与私有轨道，防止等待中的读写阻碍清理；所有输入/转换帧在 finally 释放。运行时先检查所需帧接口，缺少时明确报告不可用，最低 SDK 仍为 6.1.0(23)。

`screenShareFrameMeter.ts` 从实际送达帧读取 displayWidth/displayHeight；宽高与实测帧率不再依赖可能缺失或无限大的生成轨道 getSettings。系统音频/麦克风仍走原混音图，暂停同时控制原视频与发送视频；已停止或旧 session 的方向事件不得影响新会话。

API 26 实体手机通过 USB 调试，真实采集 B站与客户端画面，电脑 Chrome WebRTC 接收端持续解码。用户连续横竖屏与五轮受控旋转均在同一会话中切换 592×1280 / 1260×582；该开发侧原生媒体证据为向已安装 Debug HAP 临时加载本次源码模块。最终签名 2.1.4 / 214 HAP 交付后，用户于 2026-10-20 明确确认“验收通过”，本次鸿蒙投屏横竖屏修复已完成用户真机验收。188 项适配、4 项媒体测试通过。详细记录、验收范围与包体检查见 [2.1.4 验证](client-2.1.4-validation.md)。Android 原生实现沿用 2.1.3，本轮不修改 iOS。

### 2.1.3 / 213：投屏期间动态切换横竖屏（2026-10-20，本地交付）

鸿蒙该版的 applyConstraints 方案经用户真机反馈确认未解决问题，已由上方 2.1.4 实现替换；下文保留当时实现和验证范围。

修复“观众画面一直保持开始投屏时方向”。Android 的 `ScreenSharePlugin.java` 为 API 33 及以下增加应用级 DisplayManager 监听，使用物理显示尺寸而非后台 Activity 的旧窗口配置；150ms 合并旋转事件，并在既有 2 秒采样周期复核，处理显示事务滞后。API 34+ 保留 MediaProjection 的实际采集区域回调，支持全屏与单应用共享各自尺寸。统一 resizeCapture 更新原 VirtualDisplay、SurfaceTexture、WebRTC 输出适配，再绑定原 Surface；停止时注销监听、移除排队任务，旧 session 不得复活。

HarmonyOS 的 `ScreenShareCapturePolicy.ets` 在实际开始的授权会话中监听原生 display.change，用物理宽高和 Orientation 发送带 sessionId 的 `zviewer:screen-capture-resize`，后台不依赖 WebView 窗口 resize。`harmonyScreenShare.ts → screenShareResize.ts` 对原视频轨道重新 applyConstraints，宽高上限随方向交换，保留原画质与帧率；队列只执行最新方向，停止后取消迟到更新。保留同一采集授权、轨道、音频、PeerConnection，不通过停止重开或重新进房实现旋转。

观众 `WebrtcWatchPage.tsx` 已有 video.resize/loadedmetadata 与实际尺寸采样，本轮不改房间信令或强制观众旋转。184 项适配、4 项媒体测试通过；覆盖暂停时旋转、原连接保持、排队合并、旧 session 和监听释放。Android API 33 已实际复现旧包固定 576×1280；修复后同一会话在其他应用前台时，实际物理屏幕与观众视频均正确往返横竖屏。其余运行时、真机边界和构建证据以 [2.1.3 验证记录](client-2.1.3-validation.md) 为准；鸿蒙 API 23 真机采集需独立复测，不能以模拟器或轨道夹具代替。

### 2.1.2 / 212：服务端 v4.6.4 对齐（2026-10-20，本地交付）

实施依据为 [检查报告](安卓鸿蒙对齐服务端v4.6.4检查报告-2026-10-20.md)，目标源码为 `cbdd6cc6e16cc661de092627405c9e191d296c45`。本轮本地构建，不推送或发布；完整验证和设备限制见 [2.1.2 验证记录](client-2.1.2-validation.md)。

- HLS：`player/services/library-hls-proxy.ts` 与 `engines/hls-engine.ts` 直接消费服务端 `/api/emby|jellyfin/stream|proxy` 重写清单。清单基址保留逻辑服务端，子清单、分片、AES KEY 和 fMP4 MAP 统一保留反代前缀及 `movieId` 或 `mountId/path`，补齐 `ms/at`，每次请求重建当前成员 token，再经 `connectionTransport` 转为原生传输地址。禁止把媒体库专用端点套通用代理、恢复上游 NAS 基址或调用 movie-source 获取私有凭据。按用户要求删除此处旧服未重写清单的兼容；无效清单直接报告升级/路由错误。
- Socket：`hooks/socketRecovery.ts` 与 `useSocket.ts` 对 `io server disconnect` 和认证握手错误共享一次刷新任务，成功后重新连接，由 `useMobileRoom` 走既有 register-host/request-join。网络失败保留身份并显示“重试连接”；明确拒绝清 token、回收媒体并返回登录。每个恢复周期只刷新一次，30 秒内最多三次连续恢复；用户主动重试可重新开始。离房、注销、切服使旧任务失效，`lib/api.ts` 的刷新代次阻止迟到响应写回旧 token 或重发旧请求。
- 准入：REST 默认只对 401 刷新，403 保留业务含义；已就绪房间遇到“请先通过房间准入验证”时先撤下媒体，再针对当前房间最多自动重新准入一次，失败显示重试。播放器的服务器媒体 403 不再走 token 刷新。断线、待批、错误和终态均撤下语音入口；被踢/关房后 reconnect 或迟到批准不能复活播放，进房 ack 有代次保护。
- 路由：Movie DTO、增改类型、映射、添加入口和 resolver 移除 `directLinkProxy`。视频直链/挂载直链的 `noProxyFallback` 由 `directLink` 独立决定；挂载管理继续以实际 `directLink` 控制直连或服务端转发，内网挂载强制转发。添加面板仅 anime（含 ani-subs）、Kazumi、CMS 显示并提交 `serverProxy`；不改变本机回环代理、证书例外通道或 B站凭据边界。
- 权限：`roomStore.roomOwnerUserId` 仅来自服务端验证通过的 register-host 应答（确认当前正数 userId 是持久化 owner）及 host-transferred 的 `newOwnerUserId`，断线清除，重新注册后恢复。公开房间列表不返回 owner，不调用 `/api/admin/rooms`，也不以本地 isHost 标志赋予 REST 权限。`playlistOrder.ts` 统一 root/普通或管理员 owner 的排序、清空、删除、改名入口；`manageMovie` 继续只控制其原有 Socket 管理行为。该版本服务端的显式房主转交会更新数据库 owner，按权威转交字段同步。

复查命令：`npm run test:adaptation`（181 项）、`npm run test:media`（4 项）、`node vendor/local-patches.mjs --check`（6 项）；网页资源仅由 `npm run android:sync`、`npm run harmony:web` 生成。原生工程未增加协议实现，保留 Android PiP 与鸿蒙 WebRTC PiP 禁用策略。每个最终 APK/HAP 仅在构建后计算一次 SHA-256，后续交付复用保存摘要。iOS 不修改、不构建。

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
