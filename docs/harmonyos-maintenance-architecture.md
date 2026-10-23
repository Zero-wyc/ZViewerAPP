# HarmonyOS 客户端维护文档

更新日期：2026-10-23（Asia/Shanghai）。本文是日常维护入口，已整合原发布、连接修复、服务端对齐与屏幕共享文档。历史运行证据和当前源码检查分开记录。

## 当前基线与目录边界

| 项目 | 当前基线与使用规则 |
| --- | --- |
| Android / HarmonyOS | 2.1.10 / versionCode 220；正式版本不变，后续界面和后台播放修复的本地 Debug 包、设备验收与正式发布分别记录。 |
| iOS | 独立 `ZV-iOS/` 工程，2.1.10 / build31；详见 [iOS 维护文档](ios-maintenance-architecture.md)。 |
| 客户端仓库 | 所有客户端源码、文档与 Git 操作均在本仓库；共享前端为 `src/`，平台分派为 `src/platform/`。 |
| 服务端源码 | 相邻 `ZViewer-source code/` 已覆盖更新至上游 main `0af85d0954bb5a71bd0b6225b5a1322c1f8815fb`。源码更新不代表 NAS 已部署或客户端已对齐新增变化。 |
| CLI 源码 | 相邻 `ZViewerCLI-4.1.2/` 保留原目录名，内容已更新至上游 v4.5.5 / main `101659b01a3a9248cea8b32c7eb18b6f76d842f1`，目录名不代表内容版本。 |
| 已完成的双端协议对齐 | 最近实现基于服务端 v4.7.4 `e3af086c7bd98ee0d4697386b69678f92ea54d81`；本次更新只拉取源码，未新增兼容性或设备验收结论。 |

共享 UI 与业务写在 `src/upstream/`、`src/mobile/`，平台能力经 `src/platform/` 调用。不能整体复制服务端 frontend/backend 覆盖客户端，也不能直接修改生成资源代替改源文件。Android、ArkWeb、iOS 原生结果分别验收。

相关入口：[Android 维护文档](android-maintenance-architecture.md)、[HarmonyOS 维护文档](harmonyos-maintenance-architecture.md)、[项目说明](../README.md)。


## 架构与源码入口

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

## 服务器连接与凭据

### HTTP、HTTPS与原生通道

修复截图中的“连接地址已显示 HTTP，但游客登录提示无法连接服务器”。旧版 ArkWeb 请求失败后，公开设置可以由原生 HTTP 探测兜底；后续登录和 REST/Socket 没有同一路径保障。`ServerConnection.ets` 现在将已有的单服务器回环通道扩展到 HTTP：HTTP 上游使用 `TCPSocket`，HTTPS 证书例外使用 `TLSSocket`，分别按 SDK 的参数格式连接与发送；随机路径、宿主/Origin 限制、Cookie 隔离、流式与 WebSocket 转发继续共用。常规 HTTPS 不改变证书策略，最低系统仍为 6.1.0(23)。空地址且关闭证书例外会关闭监听、活动连接与 Cookie。

共享 `connectionTransport.ts` 补齐 `ws:` 映射；`serverConnection.ts` 对证书通道 502 先做无凭据原生诊断，只有明确 TLS/端口不可用才尝试 HTTP。`App.tsx` 登录复用已确认的地址及通道，地址、模式、证书选项变化会清除该选择。逻辑 HTTP 地址持久化，随机回环地址不进入房间广播或存储。问题证据、双端运行验证和本地包见 [内网连接修复验证](#历史验证与待验边界)。本次统一版本为 2.1.10 / 220，正式安装包已发布，构建记录位于 `release/client-v2.1.10/`；模拟器验证与用户实体手机验收分别记录。

探测不带账号凭据；证书例外仅绑定当前服务器origin，外部媒体CDN及独立语音服务器继续严格校验证书。退出、换账号、切服、关闭例外时清理Cookie、回环通道及旧代次。持久化和广播使用逻辑服务器URL，随机127.0.0.1端口及能力路径只在本机使用。账号密码、Cookie、token、二维码、原始日志和签名材料不得纳入源码。

## 影片、播放策略与跨来源同步

### 片级播放设置与媒体应用事务

本轮基线为服务端 `e3af086c7bd98ee0d4697386b69678f92ea54d81`。新增 `PlaybackOptionButton.tsx` 与 `MovieRuntimeSettings.tsx`：非 B站影片卡使用图标＋粗体中文的独立胶囊按钮，保留服务器中转与浏览器转码两个布尔值；添加面板按用户后续要求恢复 `PlaybackOptionToggle.tsx` 的说明卡＋滑动开关，沿用原草稿默认值与来源可见性。按用户后续反馈将可见胶囊缩为 32px、文字 12–13px、图标约 13–14px；`PlaybackOptionButton.css` 通过所在面板容器宽度（cqw/clamp）和字体比例适配窄屏/分屏，允许整按钮换行。外层触摸高度保留 44px，展开标题图标缩为 14px，不全局缩放其他控件。胶囊开启时使用 primary 实心填充、on-primary 对比色和勾选图标，关闭为表面色描边；勾选位预留宽度避免状态变化时跳动。影片卡默认折叠；屏幕共享隐藏，观众只读，写入要求当前分享端且具 root/持久房间所有者权限，REST 鉴权仍由服务器执行。

最终对齐由 `.playback-option-content` 对称预留半个勾号区域：左侧图标固定，文字与图标垂直居中；关闭时文字在图标右侧剩余区域居中，开启时文字左移半个勾号区域并显示右侧勾号，按钮宽高和图标边界不变。普通状态过渡 160ms，减少动态效果时接近即时切换。320/393/768px、100%/130% 字体、深浅主题、系统字体与实际载入的华文行楷共 24 组实测通过；字体行框与图标垂直中心误差小于 0.004px。该结果为实际组件浏览器几何验证，不能替代 ArkWeb 宿主或鸿蒙真机验收。

`roomStore.saveMoviePlaybackSettings` 只 PUT 改动字段，确认响应 Movie（兼容旧响应时 GET），按房间会话、逻辑服务器、事务令牌保护。`setMovies` 暂存保存中的策略，已确认值与无版本广播冲突时 GET 权威片单；GET 请求代次和 saving 阶段快照拒绝迟到结果。保存与媒体应用状态分开，当前影片交给 `useWatchTogether` 的完整源标识重载；非当前影片只保存。应用保留时间、倍速、暂停意图，成功 attach 后才写入可广播播放状态。失败保留新设置，停止失败管线、广播上次成功源的暂停态并显示重试；换片、离房、身份变化和旧回调失效，不反向 PUT 自动回滚。

ani-subs 返回明确片级转码值；Kazumi 采用元数据解析并兼容旧 HTTP(S)/代理记录，拒绝 `kazumi://` 占位地址作为回退媒体，保留必要源站头并剥离添加者的服务端凭据。Kazumi/CMS 代理使用相对地址，经本机所选服务器、路径前缀与原生连接通道完成鉴权，避免固定到添加者入口。观众以广播 `noProxyFallback` 对中转双向协调，保留片级 false、清理旧音轨/编码。

B站 JSON/NDJSON/CLI 接收 `isHdr/hdrType/videoCodecid`，按真实 codec/profile 做三态能力预检；明确不支持时保留旧引擎与档位，缺字段或探测不可用按未知处理。手动本机选档先解析预检再确认，旧会话结果不提交。仍保留普通 SDR/AVC/AAC 策略与原有 HDR/Dolby 过滤；手动 HDR 和音乐背景 HDR 按执行文档 B01 后置，未获得真实设备显示验收。`desktopManaged` 类型项 B02 本轮未实施。

语音 `transport.ts` 监看实际活动 publisher/subscriber PC/ICE，加入、重连与中断开启约 10 秒媒体窗口；等待麦克风授权不计入超时。每轮提示一次，恢复后清除；SDK 私有诊断不可用显示待确认，不直接断开通话。PC 替换、离房、重试均清理监听与计时器；线路仅采用当前 selected candidate pair。客户端不设置 UDP/TCP/TURN 固定端口，不修改 NAS 网络。

HarmonyOS `BilibiliResolver.ets` 的实际 UGC/PGC 请求使用修正后的 `buildFnval`，MP4 单独保持 fnval=1；定向测试执行真实调用路径，Hvigor 编译校验 ArkTS。共享资源仅由 `npm run harmony:web` 生成，签名材料仅临时注入本机 build-profile 并恢复；最低 SDK 仍为 6.1.0(23)。

### 串行切源、预览与失败重试

依据 [双端检查报告](#历史验证与待验边界)，对齐固定服务端源码 `fe55ddebedb91a4834d6752c5619ea75efec0bbd`。广播、请求状态 ACK 与网页房主预览统一交给 `useViewerStateSync` 串行应用，只在实际 attach 成功后记录源、转码与中转策略；同 URL 改策略也重新加载，同策略只同步播放字段。队列保留最新状态，取消旧下载，失败可重试；订阅独占队列，离房/换片/切房后的迟到任务不能写回。请求期间收到新广播时忽略旧 ACK，服务器心跳继续只校正当前媒体。

`usePlayerSource` 在串行队列内按已成功加载的 PlayerSource 与 video 元素去重，比较地址、音轨、格式、编解码、headers、Blob 和两项策略；移除只按 URL 的提前返回，避免加载中策略切回被丢弃。失败清空已应用标记，不把已销毁的旧引擎记为可复用。观众重新解析 anime/Kazumi/CMS 时保留广播中的明确策略，禁止旧片单强制覆盖直连；预览不重新解析上一影片。HLS 传入恢复起点，并等待首帧数据（readyState ≥ 2）后才返回，避免 ArkWeb 连续重载后过早 seek。

访问统计使用 `movie-source/media-policy.ts`：数据源取 serverProxy、挂载取 directLink，已解析的服务端媒体代理 URL 优先判为中转，预览可由 noProxyFallback 判断；显示与复制共用该结果。WebDAV/OpenList 字幕仍使用原挂载标记。删除当前选择器未使用的单集预览回调与失效属性，保留多选/批量加入片单；其他预览入口与专用事件完整透传中转/转码策略。直连错误指引覆盖数据源与挂载，保留原生 HTTP/证书通道。

本次不覆盖 Android Go/HarmonyOS ArkTS 的 B站内置解析、账号边界或 CLI-only 规则；不修改 iOS、不构建 IPA。模拟器、正式签名包与未覆盖的真机范围分别见 [2.1.5 验证记录](#历史验证与待验边界)。

### 跨来源完整快照

与 Android 共用 `src/upstream/modules/sync-playback/services/state-merge.ts` 的 `restoreStateSnapshot`，在房主广播和首次进房恢复时按完整 state 清空旧影片字段。JSON 会省略 undefined，旧版 diff 浅合并因此可能残留 B站 audioUrl、CID 和编解码信息，导致 Kazumi HLS 被错误选为 DASH。接收端改为完整快照，心跳仍只校正同一媒体的进度；ArkTS 原生解析和媒体桥不改。

### 房间权限、媒体库和字幕

`src/upstream/store/roomStore.ts` 持有房间影片、片单、角色及模式；`src/upstream/modules/room/watch-together/` 与 `sync-playback/` 处理房主/观众控制。影片 ID、CID/ep 与服务器逻辑 URL 可跨设备传播，本机代理地址只供当前 HAP 播放，不能写入片单或广播。若播放状态先于 current-movie/片单到达，先等待权威影片资料再解析；切 P/集、离房和切服后废弃旧请求。排序必须完整且限有权限的角色；清空片单等待服务器结果与广播，失败不提前清屏；自动连播从最新片单选下一条。

共享媒体引擎在 `src/upstream/modules/player/engines/`，媒体库 HLS 鉴权与相对清单在 `player/services/library-hls-proxy.ts`，PGS/MKV 在 `subtitles/` 和 `patches/playsvideo+0.4.7.patch`。实际可播性取决于 ArkWeb 与设备编解码器。已有 Pura 90 Pro 模拟器上 H.264 MP4/MKV 可播放，而特定 HEVC Main 10 MKV 解封装后仍零帧并报 `PIPELINE_ERROR_DECODE`；这类问题先核对视频 codec 与系统能力，不能把解封装/字幕提取成功当成解码通过。

房间模式固定为一起看、投屏、一起听。当前移动 UI 的房间设置集中在右上角，音乐账号菜单只处理账号与音乐设置，评论侧栏按移动规则展示。`MobileAppearance.tsx`、`appearance.css` 的根变量覆盖 body Portal；切主题要保持原视频/音频 DOM 不变，播放器画布保持黑色。全屏默认横屏，手动解锁后尊重系统旋转开关；退出全屏/离房恢复系统栏和安全区。`Index.ets` 将 WindowAvoidArea 转成 `--native-safe-*`，与网页 safe-area 合并，横屏短高度仍需保证确认按钮可达。

2026-10-14 HLS 连接核查：普通 HTTPS 模式使用本机保存的登录/游客 token，为服务端代理清单、分片和密钥请求附加 URL token，不依赖跨域 Cookie。已发现并修复一个条件性缺陷：启用服务器证书例外且服务器没有路径前缀时，共享 API 基址的尾斜杠可能生成 `//api/...`；HLS loader 的 API 识别还需将本机地址还原为逻辑地址。修复只涉及共享前端，ArkTS 的凭据隔离和证书例外范围保持原有规则。既有历史回归覆盖普通连接、证书通道、路径前缀、主清单、相对密钥、异域分片和 token 不泄漏到上游 URL。自动化验证不代表 ArkWeb 真机实播，原先安卓截图的具体原因仍需实际响应状态/设备日志确认。

## B站账号、解析与设备能力

### 短链、分P、竖屏与账号路由

共享 `modules/bilibili/input.ts` 提取分享文本，`MoviePushPanel.tsx` 在切画质/分 P 时复用 resolvedUrl；`movie-source-resolver.ts` 将历史短链交给本机解析。`BilibiliResolver.ets` 先展开受限 B站短链，再识别视频/PGC，保留 URL 的分 P；`BilibiliLocalProxy.ets` 透传显式 page，CID 优先于 page，显式 page 优先于 URL 参数。返回规范视频地址包含实际分 P，重定向不携带 Cookie。

共享 `nativeQualityPolicy.ts` 增加竖屏宽高检测。ArkTS 原有固定“宽≤1920、高≤1080”会误排除 720×1280 和 1080×1920，现改为长边≤1920、短边≤1080，并同时逐轴核对真实能力上限与帧率，保留 AVC、AAC、会员与原有性能限制。检测不支持的竖屏尺寸不得仅交换宽高后强行放行。

一起看控制栏传入实际 videoRef，由 `PlayerDisplayControls.tsx` 根据解码宽高决定 portrait/landscape，并在 loadedmetadata/resize 后复核。`playerDisplay.ts` 保留串行请求与失效代次；Index.ets 既有原生方向桥接直接执行目标方向。退出与离房解除锁定，手动解锁不会被相同比例的 resize 立即覆盖。投屏与其他播放器沿用原规则，最低 SDK 仍为 6.1.0(23)。

后续修复“仅登录服务端无法添加”：共享 `getActiveCliProxyUrl` 在鸿蒙也要求 ready 且 loggedIn，不再把匿名本机代理当作已登录账号路径。普通内容无本机登录时使用服务端账号；`getBilibiliInputResolvePolicy` 为添加、切画质与分 P 统一检查 CLI-only，明确要求本机账号的内容不得走服务器。已登录本机的权限错误继续直接提示。服务端 DASH 使用共享画质选择器，账号卡片分别注明两处登录状态，试看提示使用“当前解析账号”。

### B站 ArkTS 解析与回环代理

`BilibiliWbi.ets` 对关键词和 API 参数签名，`BilibiliResolver.ets` 解析普通 BV、分 P/CID、PGC ep/ss、实际 qn 与 DASH 音视频轨，`BilibiliCredentialStore.ets` 保存本机账号，`BilibiliLocalProxy.ets` 提供 `/resolve` 与媒体代理。Android Go 实现是行为参照而非共享二进制；WBI 字符重排、UTF-8/特殊字符、UGC 的字符串 `result`、会员错误及画质筛选须在 ArkTS 单独测试。

自动画质只从当前账号确有权限、解析结果确有视频与音频轨道、设备能够解码的普通档位选择；不按 qn 最大值直接选择 HDR/杜比。高画质不可用时核对源站实际提供的 720p，再考虑更低档位；手动画质不得被登录回调、代理重连或房间心跳擅自改写。解析成功但无声时，先检查 DASH 音轨与设备播放链路，再区分账号权限、CDN 和解码失败。修复上述规则时，须与 Android Go 的固定向量分别验证，不能因为共享 Web 页面通过就判定 ArkTS 解析正确。

代理只监听随机 `127.0.0.1` 端口和随机能力路径，限制 Host/Origin、HTTP 方法、CDN 域名和端口，正确转发签名查询参数及 Range/HEAD；CDN 请求不带账号 Cookie。房主桌面 CLI 的回环地址不是鸿蒙设备可访问的源，`cliOnly` 也不能改走服务器代理兜底。解析成功后至少核对实际视频/音轨、206 Range、持续帧推进、暂停与 seek；仅见 200 响应不够。

## 界面、选集与显示偏好

### 完整名称与列表网格

ArkWeb 与 Android 共用 `src/upstream/hooks/useFullMediaNames.ts` 和 `components/FullMediaNameToggle.tsx`。标题区的“完整显示”滑动开关默认打开，偏好以 `zviewer-show-full-media-names` 保存在当前设备的 localStorage，并即时同步同一应用中的浏览器和选集入口；存储不可用时保留本次运行的内存偏好。开启时列表与海报卡片的影片、剧集和分集名称按可用宽度自动换行，无行数截断，连续英文或文件名也可断行；关闭后恢复列表单行省略、海报标题两行省略。标题与操作按自然宽度优先同排，空间不足才换行；目录导航独立保持单行，各级名称以相同宽度分配空间，超长省略，不受完整显示开关影响。剧集整部添加按钮单独留出操作行，多选和批量添加沿用原逻辑。

实际番剧入口为 `AnimeSourceBrowser.tsx → EmbyBrowser.tsx`，覆盖 Kazumi、ani-subs 与 CMS 的搜索结果和进入后的选集；Emby/Jellyfin 媒体库复用同一浏览器。B站搜索入口 `BiliSearchModal.tsx` 的搜索卡片、详情标题和分 P 名称，以及 `MoviePushPanel.tsx` 解析影片后的“选择分集”弹窗，都读取相同完整名称偏好。已添加影片的实际切集入口位于 `MovieListPanel.tsx`，仅为该处 `Select` 启用 `wrapLabels={showFullNames}`，使选中项与展开选项均可换行；普通来源、画质等下拉框保持原来的紧凑规则。`AnimeEpisodePicker.tsx` 当前未作为实际选集组件挂载。

共享 `hooks/useEpisodeViewMode.ts` 与 `components/EpisodeViewToggle.tsx` 提供显式“列表 / 网格”按钮，默认列表，按 `zviewer-episode-view-mode` 保存本机偏好并在各实际选集入口间共享。2026-10-23 将网格下限从 120px 调整为 5.5rem（默认字号约 88px），由实际选集区域宽度计算列数，常规手机可排三列，窄屏或大字号自动减少，平板/横屏继续增加且无四列上限。列表仍每集一行，完整名称偏好继续控制换行，搜索结果的列表/海报墙偏好保持独立。

分集统一使用 `components/EpisodeCard.tsx` 与 `EpisodeCard.css`：主题色描边、至少 44px 触摸高度，选中为 primary 实心、对比文字和勾号；没有封面或图片最终加载失败时收起图片区，只显示集名，不显示 Film/Play 占位图标。自定义源使用已有封面及原图片代理回退，Emby/Jellyfin 使用各自挂载图片代理，B站搜索分 P 使用已取得的视频封面；解析结果没有封面字段时不额外请求。保留多选、全选、批量添加、失败项保留和原页面切换行为。覆盖 Kazumi、ani-subs、CMS、Emby、Jellyfin、B站搜索分 P 和解析分集，也同步备用 `AnimeEpisodePicker`；WebDAV/OpenList/FTP 和服务器文件页仍采用其文件浏览布局。

房间设置、外观与本机B站入口保持独立。Portal使用当前主题，视频画布保持黑色；主题或字体变化不重建播放器。完整名称、网格偏好只保存在本机。添加影片保留说明卡加滑动Switch，运行期片级设置使用图标、粗体中文、实心选中态和勾号；两处不能混成同一界面。窄屏、横屏短高度、130%字体、安全区、键盘及返回键须单独检查。更多菜单使用实际按钮位置和菜单高度定位，操作不穿透到视频手势。

## 音乐、队列与语音

### 2026-10-23 手机反馈修复

验证完成：一起听覆盖 393×852、393×700、320×568 及两组矮横屏；320px/22px 字号的 11 个工具按钮均在 28px 安全区上方，实点播放/暂停和队列成功；320×480 大字体下卡内滚动可达音量。19 项音轨/解析回退/生命周期回归通过，命令为 `node --experimental-strip-types --experimental-vm-modules --test scripts/music-background-audio.test.mjs`。TypeScript/Vite、双端资源同步、Android Debug APK 和 HarmonyOS Debug HAP 构建通过，测试包在 `release/ui-fixes-20261023/`；Android 为 `.debug` 应用，HarmonyOS 未签名，各最终包仅计算一次 SHA256。维持 2.1.10 / 220，未安装、未发布；无连接设备，后台/锁屏续播仍待真机验收。

- 分集卡选中前后保留相同文字空间；网格无封面卡两侧等宽预留勾选位置，有封面卡的勾选留在封面上。`Select` 内容宽度改为测量不参与 flex-grow 的文字，并为所有项保留相同勾选宽度，避免 RAF 定位时不断扩大菜单；长来源名受视口约束。
- `PlayerControlBar` 按实际横竖屏方向切换：横屏直接显示倍速、发送弹幕、同步、重载和隐藏控制栏，倍速通过 portal 向上展开，窄横屏可换行；竖屏保持原控制栏布局。选中及展开状态使用主题色，横屏倍速选项至少 40px。
- 一起听完整播放器让封面先为控制区和底部工具栏让出高度，进度、播放三键、音量保留 12–18px 间距；极端大字体/矮窗口可在卡内滚动，工具栏单独保留高度与原生安全区。
- B站音频解析优先独立 DASH 音轨，不再把无音轨的 DASH 视频流交给 `<audio>`；`audioOnly` 仅在确有音轨时跳过无关的视频编码检查，普通一起看调用保持原检查。旧服务端仅返回音视频合一 MP4 时仍兼容，其后台行为须按系统实测。

回归记录：使用真实共享组件的本机模拟数据，确认选集选中前后文字居中、短来源菜单连续测量宽度稳定、长来源在 320px/22px 字号下不越界；横屏 852×393、667×375、568×320 及竖屏 393×852、768×1024 的控制按钮在视口内，验证向上选速到 1.5x、同步与重载回调。浏览器组件与音轨解析回归不能代替手机锁屏/退后台播放验收；本次 adb/hdc 检查均无设备。

HarmonyOS 后台路径：`EntryAbility.onDidBackground` 在系统完成退后台后通知 `NativeMediaSession`；仅当 audioPlayback 长时任务已获准且当前媒体仍在播放时激活 ArkWeb。前后台状态通过 `zviewer:app-visibility` 传给共享页面，暂停静音 MV 与画面追帧，保留主音频。回前台恢复画面并对齐音频。AVSession、后台任务及系统音频焦点沿用现有所有者；ArkWeb 在锁屏/后台的实际调度仍需真机验证，不能由 SDK 编译通过推断已验收。

2026-10-23 一起听视觉统一：`modules/music/music-ui.css` 仅作用于 `.music-app-shell` 内的显式组件类，导航改主题胶囊，搜索/账户入口、首页推荐卡、歌曲行、登录卡、底部播放条和侧坞统一圆角与描边；完整播放器更新封面、歌词外框及工具栏，去除方块/括号装饰。顶部导航、底部播放键和侧边工具位置保持原结构，轮播下一张保留在右下角。286 个 JSX 事件及回调经 AST 对比保持一致；store、音频引擎、房间同步、播放权限、队列与背景偏好均不改。

本次验证：TypeScript/Vite 生产构建、双端网页资源同步、Android Debug APK 与 HarmonyOS Debug HAP 编译通过。真实共享组件使用本机模拟数据检查，选集覆盖 320/393/768px、深浅主题和 100%/130% 根字号共 12 组，均无横向溢出且触摸高度不小于 44px；393px 默认三列、320px 默认两列，极窄大字可降为一列。另检查有封面、无封面、图片最终失败收起、列表/网格切换及全选 45 集确认回调。一起听首页/底栏覆盖三个宽度与深浅主题共 6 组，另打开队列、完整播放器并检查按钮可达。上述为浏览器组件与编译证据，不是联网播放或真机验收；当时 adb/hdc 无设备连接。安装包位于忽略目录 `release/ui-refresh-20261023/`：Android 为独立 `.debug` 包，鸿蒙为未签名 HAP；维持版本 2.1.10 / 220，未发布 GitHub Release。

音乐协议区分服务器权威时钟、房主存活和本机播放意图。`music:sync-heartbeat` 的 position 已由服务器外推，客户端不能重复加上旧 updatedAt 的同一段时间；0 秒有效。迟到 get-state、切曲、切服和旧连接 ACK 不能覆盖新媒体。队列写入权限与播放控制权限独立，失败不先切歌；服务器确认排序后才更新权威片单。

小播放器和完整播放器的队列弹层只有一个所有者；旧关闭回调不能关闭另一所有者的新弹层。界面主题切换、队列展开和全屏不可重建主音频/视频。房间评论、歌曲评论、B站原视频评论分别绑定自身媒体与会话。

语音走 LiveKit 的 `/api/voice/token` 与实际 publisher/subscriber PC/ICE。SDK joined 和 token 成功不代表音频已通；加入、重连、PC 替换后开启约 10 秒媒体窗口，等待麦克风授权不计入。每轮提示一次，恢复后清除；诊断不可用时显示待确认，不主动断开。显示实际 selected candidate pair 的 UDP/TCP，不在客户端硬编码 TURN 端口或修改 NAS 网络。用户闭麦、管理员禁言、收听音量和麦克风增益分开维护，离房释放资源。


## 手机屏幕共享与观看

### 共享会话、画质和旋转

`src/upstream/modules/screen-sharing/` 维护房间信令，`src/platform/screenShare.ts` 分派 Android 与 HarmonyOS。每次采集带独立 sessionId；早到 ICE 有界缓存，旧 offer/answer、方向事件和停止回调不得改变新会话。拒绝权限、取消、系统停止、切房、离房和断网都必须释放采集、轨道、PeerConnection、音频图和后台任务。

共享画质通过 `screenShareQuality.ts` 选择，宽高是上限且不放大。`screenShareFrameMeter.ts` 记录实际帧与实际尺寸；配置帧率、track.getSettings().frameRate 与实测帧率必须分开。旋转继续使用同一采集和发送轨道，不重新授权、不重建 PeerConnection；物理屏幕比例改变后按实际内容裁去系统采集画布补边，保留视频/应用自身黑边。

系统音频与麦克风分别开关，房间语音和屏幕共享通过 `microphoneCapture.ts`、`roomMicrophoneCoordination.ts` 协调；管理员禁言不能被共享入口绕过。暂停时关闭发送音视频，恢复沿用当前选择。无系统音轨时提示停止后重新授权，不假造支持。


### 固定采集画布与真实旋转

用户真机仍失败，不能沿用 2.1.3 自动化通过结论。实际日志显示 display.change 已报告 2720×1260，而原视频帧仍是竖屏；交换 applyConstraints 上限后反而从 592×1280 缩成 334×720。ArkWeb 的原生采集画布保持初始方向，原生方向监听本身有效。

`harmonyScreenShare.ts → screenShareVideoTransform.ts` 对同一次 getDisplayMedia 采集的私有克隆创建 MediaStreamTrackProcessor，经 VideoFrame.visibleRect 去除与物理屏幕比例不符的系统画布补边，由 MediaStreamTrackGenerator 输出同一发送轨道；保留应用/视频自身的补边。原始采集请求不设置随初始方向固定的宽高，发送帧再按所选画质限幅，始终不放大。整个链路不读像素、不做 Canvas 定时绘制、不额外采集或创建另一套编码器，旋转无需重新授权或重建 PeerConnection。停止同时取消 reader、writer 与私有轨道，防止等待中的读写阻碍清理；所有输入/转换帧在 finally 释放。运行时先检查所需帧接口，缺少时明确报告不可用，最低 SDK 仍为 6.1.0(23)。

`screenShareFrameMeter.ts` 从实际送达帧读取 displayWidth/displayHeight；宽高与实测帧率不再依赖可能缺失或无限大的生成轨道 getSettings。系统音频/麦克风仍走原混音图，暂停同时控制原视频与发送视频；已停止或旧 session 的方向事件不得影响新会话。

### ArkWeb授权与观看

`ScreenShareCapturePolicy.ets` 与 `Index.ets` 将原生采集授权限制到固定本地来源、当前用户手势和有效session。拒绝、超时或迟到授权不能重新拉起已退役会话；取消须同时处理原生handler和JS轨道。`BackgroundMediaTasks.ets` 持有实际需要的连续任务，停止/离房时释放。

现行鸿蒙已提供视频、系统音频和麦克风采集，旧1.9.5“麦克风未开放”“仅观看”的记录不再代表当前实现。早期API26模拟器房主采集曾超时，后续API26真机签名214已获用户验收；不能由此推定API23全部通过。

鸿蒙WebRTC系统PiP在实际ArkWeb回环及H.264跨应用实验中均白屏，当前已移除系统和应用内小窗入口，不凭能力标志重新开放。Android的Activity PiP结果不能代替鸿蒙。未来恢复须有原生渲染面与跨应用持续出帧证据。


## 历史验证与待验边界

| 范围 | 已有记录 | 边界或后续动作 |
| --- | --- | --- |
| 2.1.10 内网连接 | 249 项适配、4 项媒体及 Go core/mobile 历史通过；最终220 Debug 双端通过真实本地 HTTP、自签名HTTPS登录、Socket握手与实际进房，Android房主/HarmonyOS观众同房。 | 属于 WebView/ArkWeb 模拟器结果；未覆盖所有实体手机或 HarmonyOS API23 真机。 |
| HTTP 登录补测 | 用户提供的 LAN 目标上，两端自动/完整HTTP、证书开关与账号/游客组合共10/10通过。 | LAN 地址、账号和隔离服务数据不写入维护文档。证书异常不得以普通网络失败为由静默降级。 |
| 2.1.9 播放设置 | 240 项适配、4 项媒体、6 项vendor及Go历史通过；320/393/768px、100%/130%字体、主题及两类字体共24组组件几何验证。 | 浏览器几何结果独立于原生宿主和真机。历史误填4.1.9/419的播放证据不改称219重测。 |
| 220 正式 APK | 76,761,865字节；历史apksigner v2、aapt 2.1.10/220与33个网页资源一致性通过。 | 本次未重建或重算安装包SHA。 |
| 220 正式 HAP | 14,303,171字节；历史verify-app、2.1.10/220、debug=false与31个网页资源一致性通过。 | Debug运行、Release静态检查与用户真机反馈分别记载。 |
| 屏幕共享旋转 | HarmonyOS API26实体手机同一会话五轮横竖切换，592×1280 / 1260×582持续解码；签名214交付后用户反馈“验收通过”。 | 开发时临时模块加载与最终签名HAP证据分开；不能外推API23、后台、蓝牙或所有设备。 |
| HDR/杜比 | 已透传HDR/codec元数据并做真实设备能力三态预检。 | 手动HDR、音乐背景HDR与真实显示验收继续后置，旧执行项B01未全部关闭；desktopManaged类型项B02未实施。 |
| 新服务端main | 2026-10-23已同步源码。 | 本次不自动宣告对齐，不修改NAS部署；后续按实际REST/Socket差异单独评估。 |

回归时至少覆盖：账号/游客、自动/完整URL与路径前缀、审批/进退房、房主/观众、短链/分P/PGC、媒体库HLS密钥与Range、MKV/字幕、两种片级策略四组合、暂停/1.5倍速保留、跨源清理、音乐队列/失败恢复、语音权限、共享停止/旋转/后台与主题安全区。截图、HTTP200、签令连接成功和单次起播不能替代持续帧推进及真实听音。

历史细节可在Git中查询清理前提交 `fdf6bb664348268116f5f8e2b0e74d371b2b579b` 的原始文档和测试；本次整合后不再依赖已移走的 `.ui-validation/`、`docs/evidence/` 或测试夹具。历史通过数只记录当时范围，当前源码检查见文末。


## 故障定位

| 现象 | 优先核对 |
| --- | --- |
| React 已更新，HAP 还是旧界面 | 是否运行 `npm run harmony:web`，`rawfile/web` 是否重新生成，包内资源摘要是否匹配。 |
| HAP 白屏或资源 404 | `https://zviewer.local` 映射、相对资源路径、bootstrap 是否先于 React 执行以及 ArkWeb console。 |
| 桥方法超时/字段缺失 | `contracts.ts`、bootstrap action、`Index.ets` 分发、service 返回结构及取消清理。 |
| B站解析成功但无画面或无声 | 本机代理 Range/HEAD、签名 URL、CDN 白名单、音视频实际轨道及设备编解码器。 |
| 进度跳回或旧片重载 | current-movie/片单事件到达顺序、movieId/CID、请求代次、服务器心跳与主动 seek 抑制。 |
| 全屏后留黑边或状态栏 | WindowAvoidArea、`--native-safe-*`、orientation/immersive action、退出恢复与主题 Portal。 |
| 媒体通知出现但后台停播 | AVSession 与 AUDIO_PLAYBACK 任务是否同时有效；暂停、离房、系统回收与实际设备后台策略。 |

## 构建、发布与清理

当前最低系统为HarmonyOS6.1 / API23，编译/目标SDK按 `ZV-HarmonyOS/build-profile.json5` 的26配置维护。API26模拟器或实机通过不代替API23实机验收。

```powershell
npm ci
npm run typecheck
npm run harmony:web
```

随后在DevEco Studio打开 `ZV-HarmonyOS/`，使用本机SDK和签名配置构建Debug或Release HAP。`harmony:web` 内部先构建网页再同步到 `entry/src/main/resources/rawfile/web/`；这是生成目录，禁止直接修改。ArkTS修改须完成Hvigor编译与实际ArkWeb运行。签名密钥、证书、Profile及本机SDK路径不进入源码，安装仍受Profile设备授权和安装来源限制。

发布前检查版本、签名、最低SDK与包内资源；每包仅在最终构建时计算一次SHA，发布复用保存摘要。完成版本后在指定客户端仓库本地commit，同步Android维护文档。Release标题为 `ZViewer-Client V版本号`，保留五类中英发行说明与完整变更记录；默认发布Android/HarmonyOS，源码使用main，不另打源码包。iOS构建必须有用户明确指示。

本次将测试脚本、夹具、一次性UI验证、旧证据和可重建缓存移入回收站，失效npm测试入口已移除。日常检查用 `npm run typecheck` / `npm run build`，ArkTS仍需SDK编译。保留依赖、原生构建工具、签名源材料、正式 `release/` 及iOS `release-assets/`。`.hvigor/`、`entry/build/` 和Vite缓存可重建，不能将缓存清理称为释放同等磁盘空间，回收站仍占用磁盘。


## 本次整理与后续记录

2026-10-23仅做上游源码同步、客户端测试/缓存清理、文档整合及命令入口维护。未构建APK/HAP/IPA，未启动或修改NAS服务。清理前的版本/测试历史可通过Git查询；后续功能修复同时维护Android和HarmonyOS两份文档，具体设备型号、OS、角色、网络、版本与未通过项必须据实填写。

清理复核：2026-10-23的95项清理中，94项已确认在回收站；`.ui-validation/` 约3.88GiB超过E盘回收站1GiB限额，Windows未将其保留在回收站，目录已直接清除，未满足该项目的可回收要求。该目录为历史测试产物，正式release、已安装依赖和签名源材料保留。今后先查容量再回收，不能只凭API的SendToRecycleBin参数判定已回收。

本次整理后检查：共享前端TypeScript与Vite生产构建、Go `go build ./...`、iOS VLC持久补丁检查/ESLint/TypeScript及12个共享Go来源核验均通过。文档链接按保留文档与项目入口复核；这些结果不包含已移走的历史测试，也不新增APK/HAP/IPA或设备验收。
