# Android 客户端维护文档

更新日期：2026-10-22。本文与同目录的 HarmonyOS、iOS 维护文档采用统一命名 `平台-maintenance-architecture.md`。

## 当前状态与范围

- Android 当前发行版本为 **4.1.9 / versionCode 419**，按 v4.7.4 执行文档更新播放设置、解析同步、B站请求与语音媒体监看。最终 APK 已构建并完成签名和网页资源静态检查；最终 419 Debug 宿主复核与发布确认见 [4.1.9 验证记录](client-4.1.9-validation.md)。2.1.8 为本地迭代，2.1.7 为此前公开版本，历史验收不替代本轮证据。
- 客户端修改、Git 提交均在 `E:/Codex-bulid/ZViewer/ZViewer-client` 完成。`ZViewer-source code` 是本地服务端目录，不在其中改客户端。
- Android 与 HarmonyOS 共用根目录 React/Vite 界面，但原生宿主不同；iOS 是 `ZV-iOS` 中独立的 Expo/React Native 工程。三端实现和验收不能互相替代。

## 代码入口

### 4.1.9 / 419：对齐服务端 v4.7.4 与最终播放设置（2026-10-22）

本轮基线为服务端 `e3af086c7bd98ee0d4697386b69678f92ea54d81`。新增 `PlaybackOptionButton.tsx` 与 `MovieRuntimeSettings.tsx`：非 B站影片卡使用图标＋粗体中文的独立胶囊按钮，保留服务器中转与浏览器转码两个布尔值；添加面板按用户后续要求恢复 `PlaybackOptionToggle.tsx` 的说明卡＋滑动开关，沿用原草稿默认值与来源可见性。按用户后续反馈将可见胶囊缩为 32px、文字 12–13px、图标约 13–14px；`PlaybackOptionButton.css` 通过所在面板容器宽度（cqw/clamp）和字体比例适配窄屏/分屏，允许整按钮换行。外层触摸高度保留 44px，展开标题图标缩为 14px，不全局缩放其他控件。胶囊开启时使用 primary 实心填充、on-primary 对比色和勾选图标，关闭为表面色描边；勾选位预留宽度避免状态变化时跳动。影片卡默认折叠；屏幕共享隐藏，观众只读，写入要求当前分享端且具 root/持久房间所有者权限，REST 鉴权仍由服务器执行。

最终对齐由 `.playback-option-content` 对称预留半个勾号区域：左侧图标固定，文字与图标垂直居中；关闭时文字在图标右侧剩余区域居中，开启时文字左移半个勾号区域并显示右侧勾号，按钮宽高和图标边界不变。普通状态过渡 160ms，减少动态效果时接近即时切换。320/393/768px、100%/130% 字体、深浅主题、系统字体与实际载入的华文行楷共 24 组实测通过；字体行框与图标垂直中心误差小于 0.004px。该结果为实际组件浏览器几何验证，不能替代原生宿主或真机验收。

`roomStore.saveMoviePlaybackSettings` 只 PUT 改动字段，确认响应 Movie（兼容旧响应时 GET），按房间会话、逻辑服务器、事务令牌保护。`setMovies` 暂存保存中的策略，已确认值与无版本广播冲突时 GET 权威片单；GET 请求代次和 saving 阶段快照拒绝迟到结果。保存与媒体应用状态分开，当前影片交给 `useWatchTogether` 的完整源标识重载；非当前影片只保存。应用保留时间、倍速、暂停意图，成功 attach 后才写入可广播播放状态。失败保留新设置，停止失败管线、广播上次成功源的暂停态并显示重试；换片、离房、身份变化和旧回调失效，不反向 PUT 自动回滚。

ani-subs 返回明确片级转码值；Kazumi 采用元数据解析并兼容旧 HTTP(S)/代理记录，拒绝 `kazumi://` 占位地址作为回退媒体，保留必要源站头并剥离添加者的服务端凭据。Kazumi/CMS 代理使用相对地址，经本机所选服务器、路径前缀与原生连接通道完成鉴权，避免固定到添加者入口。观众以广播 `noProxyFallback` 对中转双向协调，保留片级 false、清理旧音轨/编码。

B站 JSON/NDJSON/CLI 接收 `isHdr/hdrType/videoCodecid`，按真实 codec/profile 做三态能力预检；明确不支持时保留旧引擎与档位，缺字段或探测不可用按未知处理。手动本机选档先解析预检再确认，旧会话结果不提交。仍保留普通 SDR/AVC/AAC 策略与原有 HDR/Dolby 过滤；手动 HDR 和音乐背景 HDR 按执行文档 B01 后置，未获得真实设备显示验收。`desktopManaged` 类型项 B02 本轮未实施。

语音 `transport.ts` 监看实际活动 publisher/subscriber PC/ICE，加入、重连与中断开启约 10 秒媒体窗口；等待麦克风授权不计入超时。每轮提示一次，恢复后清除；SDK 私有诊断不可用显示待确认，不直接断开通话。PC 替换、离房、重试均清理监听与计时器；线路仅采用当前 selected candidate pair。客户端不设置 UDP/TCP/TURN 固定端口，不修改 NAS 网络。

本轮 240 项适配、4 项媒体、6 项 vendor 与 Go core/mobile 回归通过；最终 4.1.9 APK 为 76,761,777 字节，apksigner v2 通过，33 个网页资源与最终同步目录逐字节一致。每包仅构建后计算一次 SHA-256，复用 `release/client-v4.1.9/SHA256SUMS.txt`。最终 419 Debug 模拟器界面与 HLS 双向房主/观众解码、四种策略切换通过，均保持 10 秒暂停与 1.5 倍速，恢复后解码帧继续增长；各层证据与发布状态见 [4.1.9 验证记录](client-4.1.9-validation.md)，早期互测见 [2.1.8 历史记录](client-2.1.8-validation.md)。iOS 不修改、不构建、不发布。

Android `native/bilicore/core/resolver.go/quality.go/pgc.go` 的实际 UGC/PGC 请求统一 `buildFnval`，修正会员、8K、AV1 位组合，MP4 保持 fnval=1；`fnval_test.go` 截获真实请求进行验证。修改后重建 ARM64/x86_64 Go AAR，再同步网页资源和构建 APK。

### 2.1.7 / 217：B站短链、竖屏播放与账号路由（2026-10-21）

`modules/bilibili/input.ts` 提取分享文本里的 B站地址，保留查询参数；`MoviePushPanel.tsx` 的首次解析、切画质与切分 P，以及 `movie-source-resolver.ts` 的历史短链恢复，统一使用展开后的逻辑地址。`native/bilicore/core/mobile_input.go` 跟随受限重定向，不发送账号凭据；规范化时保留 `?p=N`。`quality.go` 在显式 CID/分 P 缺失时从 URL 选择分 P，返回规范地址保留实际分 P。服务器已有“先展开再识别 BV/ep/ss”的实现，本次只对齐客户端，不修改或部署服务器。

`nativeQualityPolicy.ts` 对横竖两组宽高分别执行 MediaCapabilities 检测，继续核对 codec、smooth、帧率及账号真实权限。Android `quality.go` 仍按实测能力逐轴筛选；无能力参数的 AVC 1080P30 保守默认补齐竖屏尺寸，不将空能力列表当成支持。实际反馈视频的 720P=720×1280、1080P=1080×1920，旧横屏能力 1920×1080 会误排除两档；480×852 则可通过。

`PlayerControlBar.tsx → PlayerDisplayControls.tsx → playerDisplay.ts` 读取当前 videoWidth/videoHeight，竖屏全屏请求 portrait，横屏和未知尺寸沿用 landscape。监听 loadedmetadata/resize 处理迟到元数据与全屏换源；相同比例的尺寸事件不反复覆盖手动解锁。方向请求保留串行代次保护，退出、卸载、离房解除锁定并退出沉浸模式。投屏与其他播放器沿用已有方向规则。

后续根据用户确认修复“仅登录服务端无法添加”：`getActiveCliProxyUrl` 在两端均要求 ready 且 loggedIn，普通内容无本机登录时进入服务端解析；`getBilibiliInputResolvePolicy` 为添加、切画质与分 P 统一检查 PGC CLI-only 条件。已登录本机的解析失败继续抛出，不静默切账号；CLI-only 不能走服务端。服务端 DASH 使用共享画质选择器，本机登录并启用 CLI 时保留 NativeQualitySelect。账号卡片分别显示服务端与本机状态，试看提示引用“当前解析账号”。

215 项适配、4 项媒体及 Go core/mobile 回归通过；双端实际 DASH 解码、全屏、服务端账号添加与包体检查见 [2.1.7 验证记录](client-2.1.7-validation.md)，详细原因见 [账号路由核查与修复](bilibili-server-login-diagnosis-20261021.md)。iOS 不修改、不构建。

### 2.1.6 / 216：完整名称与选集显示方式（2026-10-21）

共享前端新增 `src/upstream/hooks/useFullMediaNames.ts` 与 `components/FullMediaNameToggle.tsx`。标题区的“完整显示”滑动开关默认打开，偏好以 `zviewer-show-full-media-names` 保存在当前设备的 localStorage，并即时同步同一应用中的浏览器和选集入口；存储不可用时保留本次运行的内存偏好。开启时列表与海报卡片的影片、剧集和分集名称按可用宽度自动换行，无行数截断，连续英文或文件名也可断行；关闭后恢复列表单行省略、海报标题两行省略。标题与操作按自然宽度优先同排，空间不足才换行；目录导航独立保持单行，各级名称以相同宽度分配空间，超长省略，不受完整显示开关影响。剧集整部添加按钮单独留出操作行，多选和批量添加沿用原逻辑。

实际番剧入口为 `AnimeSourceBrowser.tsx → EmbyBrowser.tsx`，覆盖 Kazumi、ani-subs 与 CMS 的搜索结果和进入后的选集；Emby/Jellyfin 媒体库复用同一浏览器。B站搜索入口 `BiliSearchModal.tsx` 的搜索卡片、详情标题和分 P 名称，以及 `MoviePushPanel.tsx` 解析影片后的“选择分集”弹窗，都读取相同完整名称偏好。已添加影片的实际切集入口位于 `MovieListPanel.tsx`，仅为该处 `Select` 启用 `wrapLabels={showFullNames}`，使选中项与展开选项均可换行；普通来源、画质等下拉框保持原来的紧凑规则。`AnimeEpisodePicker.tsx` 当前未作为实际选集组件挂载。

共享 `hooks/useEpisodeViewMode.ts` 与 `components/EpisodeViewToggle.tsx` 提供显式“列表 / 网格”按钮，默认列表，按 `zviewer-episode-view-mode` 保存本机偏好并在各实际选集入口间共享。列表固定每集一行；网格通过共享 episodeGridColumns 按选集区域实际宽度自动计算列数，以 120px 为卡片宽度下限参考，极窄容器允许缩小至容器宽度，无四列上限；手机、平板、横屏、分屏和展开后的面板使用相同规则。番剧浏览器、Emby/Jellyfin 季内纯分集目录、B站搜索后的分 P 页面和解析后的“选择分集”均提供切换，名称仍服从完整名称开关，编号和选择控件保留独立宽度。媒体库网格卡片的图标与选择控件在上行，名称占下行全宽。选集显示方式与搜索结果的列表/海报墙偏好相互独立，不因切换搜索海报墙改变选集布局。

本轮仅调整共享界面、显示偏好与版本元数据，不修改播放协议、房间同步、Android 原生媒体/解析桥或 HarmonyOS 原生逻辑；iOS 不修改、不构建。浏览器布局、双端原生运行时、构建与安装包检查已完成，分层结果见 [2.1.6 验证记录](client-2.1.6-validation.md) 为准；历史 2.1.5 的通过记录不作为本轮验收结果。

### 2.1.5 / 215：服务端 v4.7.1 媒体策略对齐（2026-10-21）

依据 [双端检查报告](安卓鸿蒙对齐服务端v4.7.1检查报告-2026-10-21.md)，对齐固定服务端源码 `fe55ddebedb91a4834d6752c5619ea75efec0bbd`。广播、请求状态 ACK 与网页房主预览统一交给 `useViewerStateSync` 串行应用，只在实际 attach 成功后记录源、转码与中转策略；同 URL 改策略也重新加载，同策略只同步播放字段。队列保留最新状态，取消旧下载，失败可重试；订阅独占队列，离房/换片/切房后的迟到任务不能写回。请求期间收到新广播时忽略旧 ACK，服务器心跳继续只校正当前媒体。

`usePlayerSource` 在串行队列内按已成功加载的 PlayerSource 与 video 元素去重，比较地址、音轨、格式、编解码、headers、Blob 和两项策略；移除只按 URL 的提前返回，避免加载中策略切回被丢弃。失败清空已应用标记，不把已销毁的旧引擎记为可复用。观众重新解析 anime/Kazumi/CMS 时保留广播中的明确策略，禁止旧片单强制覆盖直连；预览不重新解析上一影片。HLS 传入恢复起点，并等待首帧数据（readyState ≥ 2）后才返回，避免 ArkWeb 连续重载后过早 seek。

访问统计使用 `movie-source/media-policy.ts`：数据源取 serverProxy、挂载取 directLink，已解析的服务端媒体代理 URL 优先判为中转，预览可由 noProxyFallback 判断；显示与复制共用该结果。WebDAV/OpenList 字幕仍使用原挂载标记。删除当前选择器未使用的单集预览回调与失效属性，保留多选/批量加入片单；其他预览入口与专用事件完整透传中转/转码策略。直连错误指引覆盖数据源与挂载，保留原生 HTTP/证书通道。

本次不覆盖 Android Go/HarmonyOS ArkTS 的 B站内置解析、账号边界或 CLI-only 规则；不修改 iOS、不构建 IPA。模拟器、正式签名包与未覆盖的真机范围分别见 [2.1.5 验证记录](client-2.1.5-validation.md)。

### 2.1.4 / 214：跨来源观众播放快照（2026-10-20）

双端共用 `src/upstream/modules/sync-playback/services/state-merge.ts` 的 `restoreStateSnapshot`。房主消息中的完整 state 为权威快照；显式清空旧状态中已不存在的音轨、CID、格式、编解码与清晰度字段，避免 JSON 省略 undefined 后由 diff 浅合并保留 B站音轨，令 Kazumi HLS 误入 DASH。`useViewerStateSync` 与 `usePlaybackStateRequest` 使用该恢复函数；心跳仍只校正同一媒体的播放进度，不恢复迟到旧源。

旧版房主若省略转码/直链策略，仅在相同 sourceUrl、sourceType 内保留既有策略；跨影片清除。`buildStateFromVideo` 补齐策略字段。保留 ACK/会话保护、串行切片及 diff 缺省代表强制同步的语义。192 项适配、4 项媒体通过，实际模拟器与包体证据见 [2.1.4 验证](client-2.1.4-validation.md)。网页观众的对应修复见服务端 [PR #22](https://github.com/Zero-wyc/ZViewer/pull/22)；App 更新不能替代服务端网页资源更新。

### 2.1.4 / 214：鸿蒙固定采集画布的真机修正（2026-10-20，本地交付）

鸿蒙真机反馈推翻了 2.1.3 仅交换 applyConstraints 宽高上限即可旋转的假设：原生物理尺寸已横屏，原始采集画布仍竖屏，画面被再次缩小。现在 `harmonyScreenShare.ts → screenShareVideoTransform.ts` 使用同一次原生采集的 VideoFrame，按物理屏幕比例去掉系统画布补边，再对发送帧执行画质上限。生成的视频轨道和 PeerConnection 在旋转中保持不变，逐帧释放输入与输出，停止注销事件并回收私有 reader/writer/轨道；不读像素、不用 Canvas 定时绘制，也不重新申请采集。实际宽高与帧率由 `screenShareFrameMeter.ts` 读取送达帧，生成轨道的非有限配置帧率按不可用处理。

Android 的 MediaProjection/VirtualDisplay 旋转实现保持 2.1.3，2.1.4 仅同步版本与网页资源；本轮未新增实体 Android 设备证据。鸿蒙 API 26 真机与电脑真实接收端通过用户连续旋转及五轮受控旋转，接收视频在 592×1280 / 1260×582 间切换，连接和发送轨道保持。188 项适配、4 项媒体测试通过。最终签名 HAP 交付后，用户于 2026-10-20 确认鸿蒙投屏横竖屏修复“验收通过”。详细复现、源码调试方式与验收范围见 [2.1.4 记录](client-2.1.4-validation.md)。

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

- `sync-playback/playbackIdentity.ts` 统一播放初始化的身份校验，供 `usePlaybackStateRequest.ts` 与 `useVideoSource.ts` 使用。进房时播放状态、current-movie 和片单独立到达，首次由 null 补齐影片 ID 不再误判为换片；优先核对服务器影片 ID，旧广播用 B站 CID 锚定。换房、换片、切 P、预览与旧页面应答仍失效。Test1 的本机 B站账号已登录，修复后真实 APK 能挂载并解码视频。自动写入默认弹幕轨道的权限拒绝由异步链处理，不再产生未处理拒绝。
- `PlayerMobileToolbarRow.tsx` 评论数量使用 `--lt-tone-inverse`，与工具栏自身色调配对；窄屏采用 10px 字号及至少 16px 高胶囊，避免白底白字。徽章原数据来源和缓存不变。
- `MobileRoom.tsx` 将 `AutoContinueToggle.tsx` 放到“添加影片”左侧同一行。当前服务端没有开关同步协议，按用户补充要求仅房主显示；本机开启后从完整片单选下一部，等待服务端 play-movie 确认及 current-movie 广播，不乐观切片。离房、转交房主、切模式和清空片单保留原有失效规则。
- `PlaybackOptionToggle.tsx` 让“浏览器转码引擎”和“服务器中转”复用相同的 Switch、容器、字体、间距；不改变两个选项的独立媒体策略。

170 项适配和 4 项媒体回归通过；实际 MobileRoom、添加面板和评论工具栏的 10 组布局验收通过。Android 模拟器连接用户 NAS 的 Test1 和独立带密码验收房间，实际 B站 4K 视频帧/音频解码数据推进、自然结束后服务端确认连播及末尾停止通过；临时房间已关闭，Test1 片单及设置未改。详细层级见 [2.1.1 验证记录](client-2.1.1-validation.md)。正式签名包按用户确认发布至 [client-v2.1.1](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v2.1.1)，源码同步 main；保留房主本地自动连播逻辑，不构建 iOS。

### 2.1.0 / 210：服务端 v4.5.9 对齐与本地交付（2026-10-18）

目标服务端固定为 main/e86fe409faaf99dfb8b3d7adf6e88e836de12108，业务代码对应 v4.5.9。2.1.0 当时仅本地交付，全部更新已随 2.1.1 公开发行。完整范围、验收层级及未覆盖项见 [2.1.0 验证记录](client-2.1.0-validation.md)，实施依据见 [双端更新指南](安卓鸿蒙对齐服务端v4.5.9更新指南-2026-10-18.md)。

- 同步入口：sync-playback/hooks/useHostBroadcast.ts、useHostHeartbeat.ts、useViewerStateSync.ts 与 playback-memory/hooks/useServerHeartbeat.ts。房主上行携带 clientTs；新服服务器心跳独占常规进度校正，旧服保留 host fallback。10 秒自检由 ackGuard.ts 提供 5 秒超时和身份失效保护；强制全量 state 仍执行统一 MSE seek，包含进度 0。roomStore.hostOffline 统一界面权限与同步状态，离线事件的 6 秒保护避免服务端 5 秒在线缓存回拉暂停；新的 sharer-ready/host 存活证据可提前恢复。
- 音乐入口：music/hooks/useListenTogether.ts 保留本机音频、队列归属、FM、音量和后台修复；新增 server heartbeat 与 check-status，服务器 positionSec 不二次外推。7 秒无服务器心跳只开启房主兼容路径，不直接判离线；检查应答再次验证房间、trackKey 和加载代次。
- 媒体入口：roomStore DTO/add/update、MoviePushPanel.tsx、movie-source-resolver.ts、player/services/url-proxy.ts 及各引擎。directLinkProxy/serverProxy 为明确中转决定，sourceMountId 锚定挂载；关闭中转时 direct/HLS/FLV/DASH/playsvideo 不自动代理。设备到已选服务器的连接通道独立保留，原生运行时不套用普通网页的混合内容预判。
- CMS 入口：modules/cms/ 的 API、类型和 CmsSelector，复用 AnimeSourceBrowser。聚合结果仍路由真实站点；sourceMeta 保留 vodId、playFromIndex、episodeIndex，播放/恢复重新解析。Kazumi 新增影片也保存 episode 元数据；旧无元数据影片保留原 URL 兼容。FTP 挂载影片按 movieId 生成各成员当前服务器鉴权的 stream，不广播个人 ticket。
- 鉴权入口：sync-playback/hooks/useVideoSource.ts 处理当前服务器媒体播放期错误，单次刷新后恢复快照；切服/切房/换片使返回结果作废。mobile/serverUrl.ts 重建服务器媒体 token，第三方 CDN 不接收客户端 token。第三方 403、B站解析错误和解码错误各走原链路。
- 播放器依赖：vendor/playsvideo 取代 npm patch；vendor/local-patches.mjs --check 核对 DTS/FLAC，保留 MKV cue/AAC/字幕行为。playsvideo-engine.ts 采用 45 秒无活动超时及 5 分钟绝对上限，缓存关键帧并向界面透出阶段；字幕 worker 按请求编号分派，并在异常/15 秒无响应时回退主线程。
- 鸿蒙冷启动：Index.ets 安全区注入必须等待页面就绪，页面销毁后拒绝旧窗口回调，并捕获控制器未绑定的同步异常；迟到原生桥响应也安全丢弃，避免冷启动/退出期间的 17100001 崩溃。
- 共享/P2P：mobile/screenShareSession.ts 上报固定安全文案，WebrtcWatchPage 回收失败等待；modules/p2p 加入 ICE 排队与断开宽限。双端独立原生采集、账号隔离、画质和 PiP 差异继续有效。

本轮通过 166 项适配、4 项媒体、10 组 CMS、16 组搜索、12 组下一部和 4 组队列回归；原生结果以验证记录为准。最终 APK/HAP 新构建并正式签名，包内网页资源与生成目录一致；仅在最终构建完成时计算每包一次 SHA-256。iOS 没有改动或启动构建。

### 2.0.0 / 200：搜索入口与下一部（2026-10-15）

`MusicTopNav.tsx` 在小于 768px 的窄屏保留搜索按钮与展开层；宽屏搜索框常驻，不依赖鼠标悬停，背景使用 88% 不透明度。768–1023px 将左右预留列及搜索框收窄为 176px；大屏维持 220px、聚焦 260px，避免遮挡来源导航。网易云与 B站分别走原来的歌曲/视频搜索；B站搜索层不展示网易云热搜。

一起看播放键右侧新增三角形加竖线的下一部按钮，弹幕输入区域最多 640px。`useNextPlaylistMovie.ts` 读取完整权威片单与现有 manageMovie 权限，`playlistPlayback.ts` 发送 play-movie 并等待服务端确认；请求去重，房主片单丢失时最多重新 register-host 一次。不会乐观修改当前影片。末尾、预览、切房、权限撤销、影片被删除或重新排序时禁止继续旧操作；失败允许重试。按用户最终要求，本版未新增自动连播开关或服务端连播功能。

155 项适配和 4 项媒体回归通过；触屏搜索 16 组、下一部 12 组（各含普通/全屏两种布局）通过，覆盖深浅主题、320px 窄屏、手机和平板横竖屏。原生 WebView/ArkWeb 检查使用真实组件、系统点击及隔离的 API/房间确认数据，不冒充生产账号搜索或真实跨端影片同步；具体结果见 [2.0.0 验证记录](client-2.0.0-validation.md)。复现方式：分别启动 `scripts/fixtures/music-search.vite.ts`（4182）与 `playlist-controls.vite.ts`（4183），执行对应 `scripts/check-music-search-ui.mjs`、`scripts/check-playlist-controls-ui.mjs`。

正式安装包从最终 2.0.0/200 源码重新构建成功，输出 `release/client-v2.0.0/`；`apksigner` 验证通过，证书与 1.9.5 一致，32 个包内网页资源匹配最终同步目录。平板模拟器覆盖安装正式 APK、手机模拟器覆盖安装 Debug APK 后冷启动通过；手机原正式包名使用其他测试签名，覆盖拒绝详情见验证记录。构建后各端安装包仅计算一次 SHA-256，发布读取保存摘要。源码与文档同步 main，发行说明见 [2.0.0](releases/client-2.0.0.md)。iOS 本轮不构建、不上传。

### 2026-10-15 一起听全屏队列修复

`useToolbarScrollable.ts` 只测量正常文档流中直接子项的布局底边与底部 padding，不再用包含绝对定位队列浮层的 `scrollHeight` 判断是否需要滚动。旧实现可复现 `side → sheet → side` 循环，最终触发 React `Maximum update depth exceeded`，播放器界面卸载。真实按钮过多时仍开启滚动并使用 sheet；按钮减少后恢复 side。

`music/store.ts` 的队列增加 `widget/player` 归属，入口使用 `openQueuePopup/toggleQueuePopup/closeQueuePopup(owner)`。打开、关闭完整播放器时原子收起队列并转移归属，隐藏底栏及退出动画期间的迟到操作不能再打开队列；重开或离房取消未完成的 500ms 退出定时器。`MusicAppShell` 只挂载底栏拥有的弹窗，`ListenTogetherPanel` 只显示播放器拥有的弹窗，竖屏隐藏的 `PlayerSongControl` 不挂载第二份弹窗。队列依旧消费原有 `MusicPlayerContext`。

验证：150 项适配、4 项媒体回归通过，双端同步资源及 Debug 原生构建成功。`scripts/check-music-queue-ui.mjs` 使用真实组件和隔离数据，检查 393×852、852×393、1280×800、800×1280，每种开关 8 次；原先导致崩溃的独立工具栏场景另验 `side → sheet → side` 稳定转换。先运行 `npm run dev -- --config scripts/fixtures/music-queue.vite.ts`，再执行 `node scripts/check-music-queue-ui.mjs`；该脚本沿用项目其他 UI 检查使用的相邻服务端 Playwright 依赖。

实际安装本轮 Debug APK 后，Medium_Phone 恢复默认密度 420，WebView 为 411×914 / 914×411、dpr=2.625；Medium_Tablet 为 1280×800 / 800×1280、dpr=2。四种原生窗口分别用 ADB 点击开关 6 次，DOM 始终只有一个队列，收起全屏后底栏队列可再次独立打开；队列操作期间没有新增渲染异常，静音 WAV 时钟推进。测试注入的是同源构建的真实界面组件及隔离播放器数据，不替代真实房间音乐同步、后台音频或硬件音质验收。平板 CDP 曾回放导航前缓存的 insets 注入空 DOM 异常，已与本次操作期间的异常分开记录，未通过过滤本次错误取得通过结果。

最新修复验证包位于 `release/music-queue-fix-20261015/`，版本仍为 1.9.6/196；APK 是独立 `.debug` 包，v2 签名验证通过，每包构建后各计算一次 SHA-256。此前 `release/client-v1.9.6/` 的 Release 文件早于本节修复，不能将其视作包含本修复。签名、安装与详细证据见 [验证报告](mobile-screen-sharing-validation-2026-10-15.md)，未发布 GitHub Release。

### 1.9.6 / 196 本地交付与大屏界面

按用户确认的鸿蒙真机、Android 虚拟机范围收口后，Release 原生屏幕共享入口开放，仍要求每次显式屏幕授权；不再依赖 Debug 门控。源码版本升为 1.9.6/196，本地签名安装包待用户最终安装，公开发行仍为 1.9.5。Android 音画四观众后台连续 602.438 秒通过，系统 440 Hz 与合成麦克风 880 Hz 频带持续、四路解码帧和音频包推进；停止后 MediaProjection 为 null，采集服务释放。录音器重建后的模拟器注音流须重开校准，不能据此宣称 Android 实体麦克风音质已验收。

平板布局移除 1200px 居中上限，聊天/片单以 320–400px 列贴右，`mobile-player-stage` 在剩余空间内水平、垂直居中并保持 16:9。短横屏保留较窄侧栏，手机竖屏保持上下排列。`MobileRoom` 用 ResizeObserver、视口/滚动事件测量实际顶部栏底边，将语音浮层放在其下 8px，剩余高度内滚动，计入原生安全区。创建与房间模式入口均为“一起看、投屏、一起听”；片单 B站解析设置内移除重复账号图标，房间设置仍保留。

6 个浏览器尺寸通过几何检查；Android 实际 WebView 在 1920×1200/比例 1 下使用隔离房间数据验证：侧栏右边 1920，视频 1472×828 在左区居中且不重叠，顶部栏底边 88、语音面板顶部 96，无横向溢出；模式顺序和片单图标检查通过。这是原生 WebView 布局证据，不冒充真实服务器播放验收。

最终另用原生 Medium_Tablet AVD（2560×1600、CSS 1280×800/dpr=2）实际 ADB 点击与截图复核：侧栏贴右，视频 848×477 居中，栏底 100/语音面板顶 108，无重叠/横向溢出。手机模拟器改尺寸时的 CDP 拼贴截图未作为视觉通过证据。用户安装初版 1.9.6 后追加的两处修正也已纳入：投屏改为 Cast 图标、创建房间模式网格使用 column 自动布局确保同排等宽；不可用时只有两模式也同排。Native Tablet 已确认 Cast 类、顺序和等宽行。

### 2026-10-15 共享画质档位与当前验收

共享页提供本机、720P、1080P、2K（2560×1440 上限）、4K（3840×2160 上限），以及 30/60/90 fps。默认 720P/30 fps；开始后锁定画质，停止后重选。`ScreenShareStart` 传递 `resolution`/`frameRate`，原生在授权前验证并保存；`setSize()` 同时限制长、短边，保持比例、偶数尺寸且不放大源画面。本机档不设尺寸上限。旋转复用相同档位并调整已有 VirtualDisplay；VideoSource 与帧投递节流均使用所选帧率。`targetFrameRate` 是目标上限，`frameRate` 是采集实际测量值，不承诺 4K/90 fps 在所有设备或多观众下均可达到。

本轮用户已确认鸿蒙 v4、v5 真机测试通过，Android 按用户要求使用虚拟机验收。Android 原生音频已收到其他应用 440 Hz、合成麦克风 880 Hz，暂停静音、源禁止捕获、本 UID 排除、WebView 麦克风交接、已知管理员禁言保持均有实际接收证据；10 秒音频样本时长约 10.03–10.04 秒、墙钟 10.036 秒。模拟器 gRPC 合成注音在 AudioRecord 重建后出现失真，保持产品采集/连接不变而重开注音流即可恢复 880 Hz，需在每次录音器重建后重新校准，不能将其当成真实硬件麦克风音质证明。新 APK 已完成五档分辨率及高帧率请求的实际接收解码，编码端解除固定 30 后继续复测；145 项适配回归通过。最新结果见 [验证报告](mobile-screen-sharing-validation-2026-10-15.md)，后文首轮 PoC 的视频限定和失败描述属于历史记录。

### 2026-10-15 音频共享与麦克风协调（正在设备验收）

在下述首轮视频 PoC 的基础上，`ScreenShareAudioCapture.java` 增加 Android 10+ `AudioPlaybackCapture` 系统声音和独立麦克风输入，48 kHz/16-bit/mono PCM 混合后交给固定版本 WebRTC 的外部音频回调；播放捕获只接受允许被录制的媒体/游戏，并排除本应用 UID，防止将房间语音和本地监听回送。ADM 自带硬件录音关闭；此版本 SDK 在外部输入模式传入 `bytesRead=0`，应填充整个回调 buffer，且必须自行提供单调时钟 10 ms 节流，不能使用空转循环。暂停停止音频录音器并关闭视频/音频发送，恢复按用户选择重开。

`microphoneCapture.ts` 为房间语音提供可取消、引用计数的麦克风 lease，消费者只持有独立克隆。Android 原生共享麦克风与 WebView 语音之间通过 `roomMicrophoneCoordination.ts` 串行交接：开启 WebView 采集前等待原生停止/释放硬件麦克风，WebView 最后释放后才允许原生恢复。`setMicrophonePolicy` 保留已知管理员禁言和房间语音发送状态；退出语音不能绕过已知禁言。共享麦克风在房间语音发送时让出，避免同一句话重复送达；系统声音共享期间关闭自己的语音监听。原生状态返回实际系统音频、麦克风及抑制原因，UI 保留用户选择并显示实际状态。管理员状态来自已有 LiveKit metadata，未收到的服务器禁言不能由客户端猜测。

前台服务声明 `mediaProjection|microphone` 与对应权限，在用户前台操作取得 `RECORD_AUDIO` 后才启用音频服务类型。新的共享控制页复用 AppIcon、背景、玻璃效果、明暗主题和图标，系统声音/麦克风可独立控制；浏览器 UI 验证不能代替原生音频能量和时钟测量。用户指定本轮先鸿蒙真机、再 Android 虚拟机；本节实现已完成 Java 编译和共享自动回归，模拟器结果与最终交付状态以 [验证报告](mobile-screen-sharing-validation-2026-10-15.md) 的最新记录为准，生产门控暂保留。

### 2026-10-15 手机屏幕共享验证实现（尚未发行）

当前发行仍为 1.9.5 / 195。本地新增的手机房主共享属于 Debug 验证功能，`ScreenSharePlugin.getCapabilities()` 与 `start()` 同时使用 `BuildConfig.DEBUG` 门控，Release 不能绕过前端直接启动未经验收的采集。完整合同、模拟器结果和剩余验收见 [屏幕共享验证报告](mobile-screen-sharing-validation-2026-10-15.md)，不得将其标为双端正式交付。

`src/platform/contracts.ts` 定义能力、会话、错误、真实采集设置及 SDP/ICE 边界；`screenShare.ts` 分派原生后端；`src/mobile/screenShareSession.ts` 仅管理房间信令和会话状态。`MobileScreenShareHost.tsx` 驱动开始、暂停发送、恢复、停止，`MobileRoom.tsx` 按房主/观众分流，房主屏幕共享也接收入房审批。采集 sessionId 与 socket peerId 分开；旧会话回调不得启动新连接或停止新采集。Socket 断开、房间关闭、离房、切模式、pagehide、组件销毁都会停止当前会话；网络恢复后不自动再次申请屏幕授权。

Android 入口为 `ScreenSharePlugin.java`、`ScreenShareService.java`、`MainActivity.java` 和 Manifest。MediaProjection 每次开始重新申请用户授权；得到同意后先启动 `mediaProjection` 类型的前台服务，再绑定服务和消费一次授权 token。单个 VirtualDisplay 的 Surface 接入 WebRTC `SurfaceTextureHelper → VideoSource → VideoTrack → native PeerConnection`，不向网页注入视频帧。旋转通过 `onCapturedContentResize()` 调整现有 display/纹理，不重复创建 projection。发送端使用 Maven 固定版本 `io.github.webrtc-sdk:android:144.7559.15`，优先设备实际提供的 H.264，保留 VP8 等协商回退；模拟器 VP8 结果不能当作真机 H.264 验证。

Manifest 新增 `ACCESS_NETWORK_STATE` 与 `FOREGROUND_SERVICE_MEDIA_PROJECTION`；前者是原生 WebRTC 网络监视器所需的普通权限，漏掉会在 native network_thread 中抛 SecurityException 并触发进程中止。服务为非导出、START_NOT_STICKY，通知提供停止按钮，不在启动/系统恢复时复用旧授权。API 24/25 使用无通知通道的兼容 Notification.Builder，API 26+ 使用专用通道。暂停禁用视频发送轨道，系统捕获仍存在；界面明确提示用停止结束采集。首轮视频独立发送，麦克风、系统音频和 LiveKit 混音均未开放。

清理先失效 sessionId、停止帧投递和轨道发送，再逐个关闭/释放 PeerConnection，释放视频轨道/源、VirtualDisplay、projection callback、projection、Surface、纹理、factory/EGL，最后解绑和停止前台服务。各释放步骤独立容错；系统状态栏停止、通知停止、task 移除和宿主销毁走相同清理。原生统计只回传宽高、实际帧投递速率和连接状态；`capacitor.config.ts` 关闭 Android 桥参数日志，原生 WebRTC 日志设为 LS_NONE，避免 SDP/ICE 凭据和地址进入常规日志。诊断输出必须留在忽略目录中，不能用于公开发行材料。

新增会话和平台测试由 `npm run test:adaptation` 执行，覆盖授权失败、取消、晚到流、旧 session、早到/晚到观众、SDP/ICE 排队、4 观众上限和销毁。Android 模拟器实际捕获与跨 ArkWeb 接收单独记录；真机授权、系统停止、后台、热量/耗电和真实 Wi-Fi/TURN 网络仍须按计划验收。

本轮实际证据：Medium_Phone x86_64、Android 17/API 37，应用 target 36；通过本地鉴权 Pion TURN v4.1.4 向 Pura 90 Pro HarmonyOS 7.0.0/API 26 ArkWeb 和 3 个 Chrome 观众连续发送 603.282 秒。四路周期采样均 connected，实际 VP8、14–18 fps、竖屏 576×1280，旋转到 1280×576 后恢复；暂停收到黑帧、恢复继续解码、短暂切后台采集继续。主动停止后 projection、前台任务和采集/连接线程均退出；再次授权后锁屏触发 capture-ended，采集和服务释放。证据是原生采集 + 本地 DTO 中继，不等于完整真实房间、真机 H.264/30fps 或公网验收。

验证包位于 `release/screen-share-poc-20261015/`，APK 为 `com.zviewer.mobile.debug` / 1.9.5-debug / 195，Debug v2 签名通过；HAP unsigned 状态单独记录。每个最终包构建后各一次 SHA-256。适配测试共 106 项、媒体测试 4 项通过，另有浏览器替身 UI 验证。实现检查点为 9f4e94c；本轮只本地提交，不发布 Release，不启动 iOS 构建。鸿蒙发送端和真机条件未通过前继续保持生产门控。

### 既有能力入口

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

### 2026-10-15 弹窗层级与说明文字复查

- 关于弹窗标题去掉独立实色底块和 sticky 定位，以原弹窗玻璃背景和分隔线衔接正文，长发行记录滚动时不叠字。连接页 HTTPS 提示使用实色主题卡片、正常字号及行高，增加末尾滚动空间，可避开两个固定悬浮按钮。
- 创建房间遮罩移出 `.rooms-view` 的 `z-index: 1` 层，成为 `.app-shell` 的直接子层。原面板虽为 `z-index: 20`，仍受父层约束而被层级 10 的悬浮按钮覆盖；现在遮罩及表单完整盖住两个入口，批准开关能收到点击，关闭后恢复入口。表单补充 dialog 名称及模态语义，关闭图标同步主题色。
- 本机 B站账号弹窗登录后标题为“B站账号·已登录”，仅状态词使用粉色，账号文字保留原标题色；深浅主题分别使用可读粉色，未登录不显示该后缀。
- 91 项适配、4 项媒体测试及双端三视口的界面回归通过。`check-mobile-identity-ui.mjs` 增加深浅主题的说明对比度至少 4.5:1、关于标题无底块、账号两态标题及粉色对比度、创建层点击命中和开关可用检查。新 Debug APK/HAP 安装到两个模拟器，在实际 WebView/ArkWeb 复查上述四处；创建页使用本机 REST 测试源，只操作表单，未创建真实房间，配置已恢复。

每次媒体/房间改动至少覆盖登录与切服、房主/观众权限、添加/切片/清空、播放暂停和 seek、字幕/弹幕、离房重入、一起听及语音释放。B站变更补本机登录态/游客态、普通 BV、多 P、PGC、DASH 双轨、真实画质和账号不足错误。平台能力变更补横竖屏/全屏恢复、系统媒体控制、来电/耳机/蓝牙及后台。记录来源属于单元测试、浏览器夹具、模拟器还是物理设备，不得把其中一个层级写成另一个层级的验收。

## 构建与维护顺序

历史正式发行 `client-v1.9.5 / 195`：当时 Android APK 通过 `apksigner` v2 验证，证书与 1.9.0 一致；HAP 通过 `hap-sign-tool verify-app`，证书链与前版一致，两个包各 30 个网页资源匹配同步目录。此前 1.9.0 Debug 模拟器记录亦保留为验收历史。本轮为 `client-v2.0.0 / 200`，请使用上文与 [2.0.0 验证记录](client-2.0.0-validation.md) 的最终包信息；仅 Android/HarmonyOS，无 iOS 构建或 IPA 上传。

1. 对照本地服务端源码和既有 REST/Socket 事件、DTO、角色权限，列出影响 Android、HarmonyOS 和 iOS 的行为差异；只把所需共享逻辑定向移植到本仓库。涉及平台契约、B站签名或媒体解析时同步检查 HarmonyOS 的独立实现和维护文档。
2. 运行 `npm run test:adaptation`、`npm run test:media`、`npm run build`；Go 核心改动另在 `native/bilicore` 运行 `go test ./...`。
3. 执行 `npm run android:sync`，让 Capacitor 重新生成 Android 网页资源；AAR 由 `scripts/build-bilicore.mjs` 构建，发布时使用 `gomobile bind -trimpath -ldflags="-s -w"` 并扫描本机路径/账号泄露。
4. 在 `ZV-Android` 构建相应 Debug/Release APK，核对版本、签名证书、包内资源和 SHA-256。完成一个可交付版本后在本仓库本地提交。

不要把 `dist/`、Android `build/`、`app/libs/`、本地签名配置或测试截图提交为源码。浏览器夹具、模拟器、构建和安装包检查只证明对应层级；真机播放、后台音频、旋转、蓝牙与跨端同步须单独记录实际设备结果。历史版本与发行记录可由 Git 历史及 GitHub Releases 查询。
