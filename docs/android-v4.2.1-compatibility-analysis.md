# ZViewer v4.2.1 安卓客户端适配分析

日期：2026-10-01。阶段：源码审查与适配清单，尚未实施，也未进行新版本联调或真机可行性验证。

本次只新增本文件。服务端、客户端业务源码、原生宿主、依赖和已有维护手册均未修改。工作区已有改动不属于本次分析。

## 1. 结论与对比基线

**安卓适配在现有架构上可实施。首要问题是语音协议已经不兼容；其他重点是 B 站解析规则、观众本机片源、播放器生命周期，以及 v4.2.0 引入的播放引擎迁移。** 原有登录、房间、片单、同步、挂载和音乐 API 没有发现必须整体重写的接口变更。

需要分清实施目的：语音新通道属于恢复兼容所必需；Video.js 10、统一 FLV 路由和番剧多选属于上游实现或功能对齐。新服务端并未要求所有客户端必须使用同一播放器库。后者可以在安卓验证阶段按依赖逐项推进，不能仅凭升级服务端就判定旧播放引擎无法工作。

| 对比对象 | 实际基线与核验方式 |
| --- | --- |
| 服务端及参考网页 | `E:/Codex-bulid/ZViewer/ZViewer-source code/`；GitHub v4.2.1 提交 `024bcc63dc01543666d945b09d9ea5779526eb62` |
| 服务端版本确认 | 读取 GitHub 标签树，以 Git blob SHA-1 核验本地 `backend/src/`、`frontend/src/`、`frontend/package.json`、`frontend/vite.config.ts`，合计 509 个文件全部一致 |
| 安卓客户端 | `E:/Codex-bulid/ZViewer/ZViewer-client/`；根 `package.json` 为 1.2.1，根 README 与导入脚本表明共享业务基于 ZViewer v4.1.7，并有移动端、本机 B 站和媒体修复 |
| 累计上游变化 | 比较 v4.1.7 → v4.2.1，共 51 个提交；不能只比较 v4.2.0 → v4.2.1 |
| 共享业务源码对比 | 客户端 `src/upstream/` 与新网页 `frontend/src/` 同路径比较，统一换行后 191 个文件相同、79 个不同、9 个仅存在于客户端；这些数值是文件差异统计，不是待改文件数量 |
| 工作依据 | 用户指定的 `docs/android-maintenance-architecture.md`，尤其第 2、3、4、5 节；结合 `PORTING.md` 和当前实现核实代码归属 |

官方来源：[v4.2.1 发布说明](https://github.com/Zero-wyc/ZViewer/releases/tag/v4.2.1)、[累计变更 v4.1.7…v4.2.1](https://github.com/Zero-wyc/ZViewer/compare/v4.1.7...v4.2.1)、[v4.2.0 发布说明](https://github.com/Zero-wyc/ZViewer/releases/tag/v4.2.0)。以下具体结论以已核验的本地源码为依据。

## 2. 按维护手册确定实施边界

| 归属 | 本轮适配位置与职责 |
| --- | --- |
| 共享业务 | `src/upstream/` 中的 Socket、语音、B 站、播放器、同步、音乐、番剧模块；协议、状态、播放模式在此处理 |
| 移动界面与生命周期 | `src/mobile/` 中房间壳、语音面板生命周期、返回/离房和音乐音频路由；保留移动端行为 |
| 平台入口 | `src/platform/` 提供麦克风、内置代理、音频和显示能力；业务模块不得直接新增 Capacitor/Java/ArkTS 调用 |
| 安卓宿主 | `ZV-Android/` 是实际发布入口。现有 Java 插件名与方法保持稳定；只有真机验证发现平台能力缺口时才扩展契约和宿主 |
| 安卓本机 B 站 | `native/bilicore/`、`BilibiliProxyPlugin.java` 与共享 B 站模块配套核验；Go/Java 持有 Cookie，网页处理脱敏状态和播放规则 |
| 构建依赖与媒体资源 | 根 `package.json`、锁文件、`vite.config.ts`、`public/`、`vendor/mediabunny/`；先完成共享构建，再同步安卓 |
| 后续平台 | 安卓通过阶段验收后，再同步鸿蒙资源并验证 ArkWeb/ArkTS 代理；iOS 是独立 Expo/React Native 工程，单独对照协议与原生媒体实现 |

共享前端的改动也会影响下次鸿蒙打包，因此应保留平台契约和统一业务实现。**本阶段验证与发布顺序按用户要求先安卓，再鸿蒙与 iOS；不会因为手册写有双平台同步就提前执行鸿蒙打包。**

维护手册中的 iOS 进度描述早于当前 `ZV-iOS/README.md` 和源码：当前 iOS 已有 VLC、本机 B 站及语音媒体通道等实现。后续 iOS 适配应基于其当前源码重新审查，不能按“仅基础直链播放”估算工作。本文件仍沿用维护手册的平台边界，本次不改动手册。

## 3. 适配总表

P0：明确影响新服务端协议，必须优先完成。P1：播放行为或稳定性重点，进入安卓正式适配范围。P2：功能、实现或诊断对齐，可在核心验证通过后推进。“验证”表示暂未发现必须改代码的证据。

| 编号 | 优先级 | 项目 | 当前判断 | 主要客户端位置 |
| --- | --- | --- | --- | --- |
| A01 | P0 | 语音第二连接、绑定令牌、新帧事件 | 必改，旧帧事件不再被服务端处理 | `hooks/useSocket.ts`、`modules/voice-chat/hooks/useVoiceChat.ts` |
| A02 | P0 | 双连接鉴权、重连、离房与切服务器清理 | A01 配套必改 | 上述文件、`lib/api.ts`、`src/mobile/` |
| A03 | P1 | 语音质量与实例身份 | 移植质量改进；多实例能力按服务端门控 | 语音 hook、新增实例 ID 工具、设置类型 |
| A04 | P1 | 服务端 DASH 默认值和有效播放模式 | 默认值、回退规则与文案需统一 | `store/systemSettingsStore.ts`、B 站解析设置与解析器 |
| A05 | P1 | 自动画质与实际 `currentQn` | 修正服务器路径；保留本机自动/手动策略 | B 站解析器、画质选择、缓存 |
| A06 | P1 | 新增影片后保留预览解析偏好 | 消费已有响应中的影片 ID | `store/roomStore.ts`、`MoviePushPanel.tsx` |
| A07 | P1 | 观众本机源在恢复、seek 和重载中一致 | 统一所有挂载入口 | `modules/sync-playback/hooks/useVideoSource.ts` |
| A08 | P1 | Video.js 10 / dash.js 5.2.0 迁移 | 建议做独立可行性验证，再决定引擎替换范围 | `modules/player/`、依赖、Vite 配置 |
| A09 | P1 | P2P 设置和旧状态清理 | 随 A08 的新 DASH 引擎一起迁移 | B 站设置、播放器类型、统计、依赖 |
| A10 | P1 | playsvideo 影片级开关 | 对齐明确的用户开关语义 | 引擎选择、片源模型、播放器 hook |
| A11 | P1 | 游离媒体元素与迟到异步回调 | 补播放守卫与彻底清理 | `safePlay.ts`、播放器 hook、预览/恢复 |
| A12 | P1 / 验证 | HTTP Range 与高码率分片 | 区分各代理路径，先验证已有链路 | URL 路由、DASH、下载器、Go 代理 |
| A13 | P1 | 一起听后台切歌、重复队列与解析竞态 | 移植客户端稳定性修复 | `modules/music/hooks/useListenTogether.ts` |
| A14 | P2 | 歌词背景服务器 DASH 与分辨率 | 新功能对齐 | 音乐设置、背景解析 hook、调用方 |
| A15 | P2 | FLV 直播统一引擎路由 | 新实现对齐，原协议可沿用 | `FlvPlayer.tsx`、`flv-engine.ts`、播放器类型 |
| A16 | P2 | AniSubs/Kazumi 多选批量入片单 | 新功能；原单集接口仍兼容 | 两个选择器、`MoviePushPanel.tsx`、新增选集组件 |
| A17 | P2 / 验证 | 字幕、弹幕、界面和诊断 | 保留移动端补丁，选择性同步上游修复 | 字幕 hook、设置、控制栏、统计、日志 |

表中未写完整前缀的路径均位于客户端 `src/upstream/`。各项目的改动建议与验证条件如下。

## 4. 必须优先适配的语音协议

### A01：迁移语音音频传输

旧安卓客户端在主 Socket 上发送、监听 `voice-audio-data`。新服务端只在绑定后的媒体 Socket 上处理 `voice-media-data`；加入语音的 ACK 新增 `mediaToken`。因此旧客户端可能显示“加入成功”、电平有变化，却没有实际双向音频。这是本轮明确的协议不兼容。

新协议分工：

| 连接 | 事件/载荷 | 适配要求 |
| --- | --- | --- |
| 房间主连接 | `voice-join { roomId, username?, instanceId? }` | 先已加入房间，再加入语音；读取 ACK 的 `members`、`selfMuted`、`mediaToken` |
| 媒体连接 | `voice-media-init { roomId, token: mediaToken }` | 与主连接同服务器、同鉴权，使用独立 Socket.IO/Engine.IO 连接，`transports: ['websocket']` |
| 媒体连接 | `voice-media-data { data, sampleRate?, timestamp, mediaTs?, encoded? }` | 绑定成功后发送；Opus 和 PCM 两条路径都迁移 |
| 媒体连接 | 接收 `voice-media-data`，额外含 `from` | `from` 是发送者的主连接 socketId；不能按媒体连接 ID 创建成员或播放链路 |
| 房间主连接 | `voice-codec-config` | 保留在主连接；配置仍按主连接 socketId 对应远端解码器 |
| 房间主连接 | `voice-user-joined/left`、`voice-mute`、`voice-muted-changed`、`voice-kick/kicked`、`voice-leave` | 继续负责成员与控制；不要把这些全部搬到媒体连接 |

服务端将媒体连接放入内部 `voice:<roomId>` 房间，客户端无需再发普通房间加入事件。无需新增端口、HTTP API 或自定义 Socket.IO namespace。`mediaToken` 属于当前语音成员的绑定凭据，可以在该成员存续时用于媒体重连；主连接重入产生新成员时，需要使用新 ACK 的令牌。

实施时增加绑定 ACK 超时、取消和错误状态：主连接可用不代表媒体连接就绪，不能让界面一直显示通话正常。当前 v4.2.1 服务端未保留 `voice-audio-data` 兼容处理。若后续仍要求支持旧服务端，应以明确的能力选择实现旧协议路径，不能双通道同时发声；本轮新版本目标不要求先实现跨版本回退。

### A02：双连接完整生命周期

客户端 `useSocket.ts` 已经过移动端改写，使用 Zustand 维护单一连接，并处理认证错误。应在此架构上添加媒体连接管理，保留现有连接状态、刷新去重和切服务器保护。

需要覆盖：

1. 媒体连接握手复用当前 `buildSocketAuth()`、自定义服务器地址和认证状态；Cookie 不可用时仍发送 Bearer token 对应的 `auth.token`。
2. 主连接重连后先恢复房间、重新 `voice-join`，再用新 `mediaToken` 绑定；媒体连接单独断线后可用当前令牌重新绑定。
3. 认证刷新时两条连接都使用最新凭据，避免主连接成功、媒体连接永久 401。媒体连接认证错误纳入现有刷新协调，防止并发刷新或反复重连。
4. `resetSocket()`、登出、切服务器、真正离房、房间关闭、被踢出时，清理两条连接、绑定状态、监听器、采集轨、Worklet、编解码器和播放上下文。
5. 媒体未绑定或已断开时不发送，也不让 Socket.IO 缓存大量过期音频在恢复后补播；上行背压检查针对媒体 Socket。
6. 保留 `VoiceChatPanel` 的 `onConnectionChange`、`onAudioSessionChange`，以及 `MobileRoom` 的折叠面板继续通话行为。语音接入继续使用 `permissions.requestMicrophoneStream()`。
7. 保留 `useMusicAudioRouting()` 的音乐/语音音频策略；协议状态由 React 管理，`AudioRoutingPlugin` 处理系统音频会话。

验证需确认两条连接实际拥有独立的底层连接；不能仅有两个 JS 引用却复用同一 Socket。代理必须允许媒体 WebSocket，主连接的 polling 回退无法替代该通道。

### A03：质量改进与多实例

新增通道后，建议一并同步上游语音质量修复：接收端 PLC 填补有限空洞、根据连续 underrun 调整最低缓冲、上行拥塞时自适应码率、取消移动端无效 Opus FEC 参数，以及质量摘要统计。移动端新码率阶梯为 32k → 24k → 16k，40ms 编码帧与 PCM 双帧合并继续保留。

旧客户端仍设 `useinbandfec: true`、`packetlossperc: 5`；上游新配置仅保留移动帧长和复杂度。迁移时 Opus 配置、错误重建、PCM 回退、背压和接收缓冲要一起核验，避免只换事件名后仍有明显弱网断音。PLC、自适应码率属于质量改进，并非服务端解码所要求的新音频格式。

多实例相关要求：

- 新服务端设置 `roomMultiInstanceLogin` 默认 `false`；关闭时原有重复加入/顶替规则仍生效。
- 客户端可始终上报本 WebView 会话稳定的 `instanceId`；服务端打开测试开关后，登录用户才按 `user:<id>#<instanceId>` 区分成员。游客仍按连接区分。
- 成员与音频播放继续按主连接 socketId 区分；同账号的禁言按基础用户身份生效，踢出和冷却按相应实例处理。
- 可补设置类型/default 为 `roomMultiInstanceLogin: false`，但当前公开 `/api/auth/public-settings` **没有返回该字段**，只有管理员设置接口返回。不能依赖客户端读到该值才决定是否发送实例 ID。
- 普通安卓 UI 无需新增管理端测试开关；未授权角色也不应为读取该字段访问管理员接口。

## 5. B 站解析、画质与同步

### A04：DASH 默认值与 CLI 回退规则

客户端 `systemSettingsStore.ts` 仍默认 `dashDisabled: true`，新服务端与网页默认已经为 `false`。需要调整客户端缺省值，但服务端返回的实际设置仍优先：已有数据库的管理员配置未必因版本升级自动改变。服务器允许 DASH 也不代表所有已有影片的本地 `preferMp4` 设置应被强制改写。

最终 v4.2.1 模式规则：

| 本机/CLI 开关 | 有效代理 | 服务端 DASH 设置 | 应用结果 |
| --- | --- | --- | --- |
| 开启 | 可用 | 任意 | 本机代理 DASH；服务器 `dashDisabled` 不限制本机代理 |
| 开启 | 不可用 | 任意 | 回退服务器 MP4；保留用户开关，恢复代理后重新按本机策略解析 |
| 关闭 | 任意 | 禁用 | 服务器 MP4 |
| 关闭 | 任意 | 允许 | 按影片 MP4/DASH 偏好 |

发布记录中曾出现“未连接回退 DASH”，后续已改为 MP4，必须采用最终实现。一起看、切分 P、切画质、添加/预览，以及一起听背景视频的有效模式应一致。

安卓“代理可用”由 `src/platform/bilibiliProxy.ts` 的实际状态决定，不能直接改用网页端的桌面 CLI 注册列表或固定 9333 端口。安卓目前主动使用内置代理还要求登录状态；迁移时需保持这一规则与提示一致。代理存在但解析失败、解码失败是另外两类错误，不应全部伪装成“CLI 未连接”而静默降级。

### A05：自动画质不要被历史档位固定

服务端 B 站解析已修复 `currentQn`：它反映实际选中轨道，权限不足时可能低于请求值。客户端应展示解析返回的档位，不能用请求的 qn、账号会员状态或旧片单值代替实际结果。

上游新自动解析不再携带 `movie.currentQn`，避免历史降档值（例如 64）一直锁定后续自动解析。安卓已有 `nativeQualityPolicy.ts`，不能把自动/手动规则一起删掉：

- **服务器自动路径**：自动请求可省略 qn，采用账号权限下的默认请求；检查当前安卓服务器兜底中固定 `qn ?? 64` 的用途。
- **本机自动路径**：继续 `qualityMode=autoMax`、设备能力筛选、普通画质、HDR/杜比过滤与有限失败回退。
- **本机手动路径**：保留按影片的独立 qn、失败时原选择/片源恢复，不套用上游统一省略 qn 的写法。
- **一起听音频或 MP4 背景的固定 720P 请求**：属于刻意的 MP4策略，不能把全项目 qn=64 机械删除。
- 缓存保留影片、分 P/cid、账号 `sessionVersion`、模式、手动档位和设备能力区分；账号退出/切换后旧解析不能落入新会话。

现有房主/观众各自选择本机画质的功能继续保留。房间同步时间和状态不应迫使观众使用房主的本机 qn 或代理地址。

### A06：添加影片后保存解析偏好

新网页 `roomStore.addMovie()` 返回服务端创建的影片，调用方即时取得 `id` 并保存该影片的 `BilibiliParseSettings`。旧客户端虽然读到了新增响应，函数仍返回 `void`，添加流程无法直接建立与新 ID 对应的偏好。

需要让客户端消费已有 `{ success, movie }` 响应并返回映射后的 Movie；片单继续由广播刷新。没有新增后端 API。

随后在 `MoviePushPanel` 记录实际解析来源，在创建成功后绑定偏好，使预览和正式播放一致：本机 DASH 保留本机开关与 DASH 偏好，服务器路径保留对应模式。上游代码对服务器路径保存 `preferMp4: false`；安卓实现应结合实际返回 `format`、管理员禁用设置和用户选择处理，避免刚回退到 MP4 又立即切回 DASH。

这类偏好属于设备本地数据。不能把代理 token 或本机地址存到服务器影片记录中。新影片与历史影片应分别处理；旧影片已有明确用户偏好时优先保留。

### A07：观众所有挂载路径使用同一有效片源

上游新增 `resolveViewerEffectiveState()`，供正常 attach 和 `reloadVideo()` 共用。旧客户端已有本机覆盖、账号状态、恢复和降档逻辑；需要把新增的一致性处理合入这些逻辑。

重点核对首次状态同步、组件重挂载、手动重载、seek 失败重载、房主恢复、分 P 切换及本机代理状态变化。任何入口都应先确定当前观众的有效片源，再选择引擎，防止正常播放用本机 MP4/DASH、重载却重新挂上房主广播源。

缓存匹配保留安卓已有的 cid/会话检查，避免仅按 movieId 复用上一个 P 或上一个账号的源。保留播放位置、倍速、暂停意图、手动画质失败回退和旧 URL 过期后的重新解析。

`unwrapCliProxyUrl()`、当前本机源包装边界与房间数据隔离必须保留：Cookie、本机带凭据 URL、回环 token 不进入片单或房间广播。不得用上游网页 `cliApi.ts` 覆盖掉安卓的这些扩展。

## 6. 播放引擎与媒体生命周期

### A08：Video.js 10 与 DASH 迁移需要整体评估

客户端当前采用 `dashjs 4.7.4`、自研 `engines/dash/player.ts` 与 SwarmCloud P2P。v4.2.1 的参考网页已采用：

- 直链执行/状态层：`videojs10-engine.ts`，共享链接获取层 `direct-route.ts`。
- DASH：`videojs10-dash-engine.ts`，`@videojs/dash-video` 的 `DashAdapter` + dash.js 5.2.0。
- 自研 `dash/mpd-builder.ts` 保留 m4s 头部预读、sidx/字节索引解析、虚拟 MPD 和本地双 Blob 缓冲模式；不会由服务端直接提供完整 MPD。
- 统一 `PlayerController`、seek 的 busy/needReload、恢复起始时间及引擎清理契约。

若决定对齐新引擎，迁移范围必须包含选择器、类型、导出、`usePlayerSource`、MPD 构建、旧 MP4 box parser、seek 调用和本机失败恢复。不能只更新 npm 包版本。

依赖与构建要求：

1. 参考上游锁定的 `@videojs/core`、`@videojs/dash-video`、`@videojs/media` 10.0.0-rc.4。新源码直接导入 `@videojs/store`，客户端建议显式声明同版本，避免依赖隐式提升；不需要 `@videojs/react`。
2. `@videojs/dash-video` 对应 dash.js 5.2.0；上游锁文件中它位于适配包的嵌套依赖下，清理客户端旧的直接 `dashjs 4.7.4` 时要检查真实依赖树。
3. 合入上游 Vite 的 dash.js `getStreamInfo().id` 判空转换，同时核验 dev 预构建和生产构建；保留当前 `@` 别名、mediabunny alias/dedupe、playsvideo Worker 排除和移动构建参数。
4. MPD 内视频/音频 BaseURL 必须绝对化并转义 XML。安卓绝对化依据应是用户选择的服务端或已经完成的本机代理 URL；不能把 `/api/...` 解析到 Capacitor 的 localhost 页面。
5. 保留服务端媒体 token 装配、本机代理免 Cookie 凭据策略，以及 Blob 路径。新引擎内部 XHR 凭据选择不能破坏回环代理 CORS。
6. `duration`、双轨地址、codec、startTime 必须贯通；缓冲模式继续使用本地 Blob，seek 完成与失败仍有明确结果。
7. 安卓现有 `zviewer-dash-failure` 与有限恢复依赖旧引擎通知；新引擎需要提供等价的失败上报/回调，再接回本机重试、720P 等回退策略。

Video.js 10 是本源码锁定的 RC 版本，需要在实际 WebView 验证。源码中的 `zviewer-vjs10-engine=0` 只回退直链引擎，**不回退新 DASH 引擎**；不能将它当作整个迁移的回滚方案。建议先完成协议适配，再做独立的引擎验证检查点，保留可恢复的旧实现版本记录。

### A09：新 DASH 引擎下清理 P2P

新网页移除了 SwarmCloud P2P。若采用 A08 的新 DASH 引擎，需同步处理 `p2pEnabled` 的类型、旧 localStorage 偏好、CLI/P2P 互斥逻辑、设置 UI、`p2p-stats-store.ts`、控制栏与统计引用，再清理 `@swarmcloud/dashjs` 和失去用途的旧 dash.js 依赖。

迁移已有设置时忽略过时 P2P 字段即可，保留 MP4/DASH、缓冲、本机开关和用户画质选择。避免留下“P2P 已开启”或“需关闭 P2P 才能启用本机解析”的无效 UI。服务器升级本身没有新增要求客户端 P2P 的协议；清理是新执行层迁移的配套动作。

### A10：playsvideo 改为影片级唯一开关

新网页将 `source.playsvideoEnabled !== false` 作为唯一业务门控，设备运行能力检测仍保留；MKV 交给 playsvideo 内部决定具体播放路径。旧客户端还有系统级门控、MKV 快速路径与失败后原生/playsvideo 双向回退。

需要在 `engine-selector.ts`、`movie-source-resolver.ts`、`usePlayerSource.ts` 和相关源类型中对齐：去除 `mkvFastPath`、`forcePlaysVideo` 的旧路由决策和跨引擎自动回退，关闭影片开关时不在失败后偷偷启动转码引擎。保留后端已有字段和缺省 `!== false` 语义，不需要改造 Movie DTO。

服务端仍保留系统设置字段，个别 DTO 注释还描述两级门控；执行语义以实际新网页选择器为准。界面不能继续告诉用户必须打开系统级开关才能使用影片已允许的引擎。

这项改变可能改变旧 MKV 的起播和失败行为，必须验证 H.264/AAC、HEVC、DTS/AC3、FLAC、内嵌字幕，以及开关关闭的失败提示。**原生与 playsvideo 的回退调整不等于取消安卓 B 站的有限画质回退。**

### A11：避免旧媒体元素再次发声

新 `safePlay()` 拒绝播放 `!video.isConnected` 的元素，播放器 hook 在异步 attach 完成但组件已卸载时暂停并重置旧 video。旧安卓也使用 `usePlayerRemountKey()` 在切片时重挂载，因此具有相同的迟到回调风险。

需要把守卫和清理加入预览、切片、恢复、重载和异步 attach 落地流程：取消旧 fetch/Worker、销毁引擎、释放 Blob、清空旧媒体源和监听器。直接调用 `play()` 的路径也应检查当前会话、当前元素和源是否仍有效。

保留现有 `pause-intent.ts`；用户加载期间主动暂停后，完成回调不能恢复旧“应播放”状态。离房和 `room-closed` 当前已经触发 `dispatchRoomMediaTeardown()`，在此基础上把新媒体 Socket 和新引擎纳入清理。

## 7. Range、音乐、屏幕共享与番剧

### A12：Range 改动需按路径验证

v4.2.1 修复的是通用 HTTP 上游媒体代理显式范围被截断的问题，并没有把所有 Range 接口的 8 MiB 限制全部删除。

| 路径 | 新服务端/当前客户端行为 | 安卓动作 |
| --- | --- | --- |
| 通用 HTTP 上游代理，例如 `/api/stream/proxy` | `bytes=start-end` 原样透传；开放范围 `bytes=N-` 仍收敛到 8 MiB；suffix/多段在该代理层透传 | 大于 8 MiB 的 DASH segment 检查完整响应；客户端不可假定每次响应最多 8 MiB，也不可自行缩短显式分片 |
| `/api/server-files/proxy` 普通模式 | 本地 `parseRangeHeader()` 默认仍限 8 MiB，且只支持单段范围 | 按真实 `Content-Range` 续读，验证尾部探测、越界 416、seek；不能套用通用 HTTP 代理的新规则 |
| `/api/server-files/proxy?rangeMode=avplayer` | 保留完整请求范围，持续限速 8 MiB/s，初始突发 16 MiB | 为原生 AVPlayer 场景引入；本轮安卓不应无条件附加此参数 |
| 安卓 Go 回环代理 | `mobile.go` 目前直接透传客户端 Range 和上游响应头 | 暂未发现需要重写；验证 HEAD、显式大范围、取消、备用 CDN 和新 DASH 请求 |

验证结果必须记录状态码、Content-Range、Content-Length 与实收长度，不能只看是否返回 206。转码库、缓存下载和 MPD 预读需要使用响应实际范围；浏览器取消或切片后应及时停止上游读取。服务端错误响应现在会清零 GET 的正文长度，客户端应按错误状态结束等待。

### A13：一起听稳定性修复

`useListenTogether.ts` 有三类可直接移植的客户端修复：

1. 后台 `play()` 失败使用 1s/2s/3s 有界退避，覆盖通知栏播放、预载升格、自动下一首、单曲循环和观众跟随；结合会话/源/DOM 检查，停止或离房后旧重试不得起播。
2. 队列含相同歌曲时按实际位置锚点推进，修复按 key 总是找到第一个重复条目的问题；同时更新下一首预取和队列变更处理。
3. B 站懒解析由 Set 去重改为 Promise 共享，等待解析结果后继续本请求；加入取消/当前歌曲检查，避免迟到的旧解析抢回播放。

本段未发现对应的音乐服务端事件变更。实施时保留安卓 `useMediaSession`、后台媒体状态、DOM 中 audio 元素管理以及音乐/语音原生音频路由。

### A14：歌词背景服务器 DASH

新增本地设置 `musicVideoServerDash`，缺省 `false`；原 `musicVideoQn` 供 CLI DASH 和服务器 DASH 共用。需迁移设置存储、`PlayerSettingsModal`、`useMusicVideoBackground` 及 `ListenTogetherPanel` 调用链。

CLI/本机开关开启且代理可用时走本机 DASH；开关开启但不可用时回退服务器 MP4。只有开关关闭时，才按服务器 DASH/MP4 选择。服务器禁用 DASH 时以实际返回格式和能力为准，UI 不应声称当前正在播放 DASH。

背景视频必须保持静音，主音乐 audio 继续负责出声；双轨音频即使被加载也不能形成第二个声源。验证切歌、qn 变化、账号变化、歌词展开/收起、重复打开背景和离房。该功能不要求调整主音乐音质 API。

### A15：FLV 直播复用播放器引擎

旧 `FlvPlayer.tsx` 自行维护 flv.js。新网页改用 `usePlayerSource` + `format: 'flv'` + `isLive: true`，在 `flv-engine.ts` 内统一重连、缓冲清理和延迟追赶；类型新增 `FlvRuntimeEvents`。

采用统一路由时需一起迁移事件回调和状态机，保留连接中/播放中/失败/停止、统计、刷新、自动静音和最多有限重试。保留安卓播放器旋转/全屏控制，以及默认 FLV URL 指向所选远程服务端的适配；直接复制网页相对 `/live` 会指向本地壳。

HTTP-FLV 拉流和 WebRTC 观看协议未发现本轮破坏性变更。安卓继续只观看桌面端共享，不因为上游页面新增组件就加入手机采集功能。

### A16：番剧源与多选片单

Kazumi 的规则仓库、索引展开、相对 XPath、视频 URL 抽取和 AniSubs 防盗链处理主要在服务端修复；客户端现有 `api.ts`、源类型和单集流程可继续使用。测试源 ID、搜索结果、分集顺序、代理 headers 和实际播放即可，客户端无需重新实现抓取规则。

要同步新功能，则增加 `AnimeEpisodePicker.tsx`，接入两个选择器的 `onSelectEpisodes` 与 `MoviePushPanel.handleSelectAnimeEpisodes()`。上游是逐集使用既有新增影片接口，并非新批量服务端 API。应显示部分成功/失败，阻止重复点击，刷新片单，保留成功项避免重复添加；继续由服务端校验添加权限。

### A17：字幕、弹幕和诊断

未发现本轮弹幕/字幕/评论核心后端契约变化。同步引擎和界面时保留移动端字幕默认字号、弹幕随屏幕缩放默认值、`SettingsDialog`/移动设置入口和旋转安全区，不按上游桌面组件直接覆盖。

可对齐播放统计中的实际引擎名、评论空状态、控制栏浮层模糊和选择器/挂载表单的局部修复。`lib/media-debug.ts` 与 playsvideo 的媒体诊断应按开关启用，避免生产环境持续打印高频 MSE 日志。

客户端没有导入网页的所有页面、管理后台和工具组件，这是其移动架构的正常结果。源码中出现大量“新增网页文件”不意味着安卓需要导入完整 `App`、`Header`、`RoomPage` 或管理后台。

## 8. 服务端内部修复与现有客户端补丁

| 变化 | 客户端判断 |
| --- | --- |
| sql.js 原子保存、启动滚动备份、损坏恢复 | 服务端持久化实现变化，无新增客户端存储格式。联调覆盖服务器重启后登录、房间、片单和播放恢复即可；不在客户端复制备份或数据库恢复逻辑 |
| 服务端 updater 预发布选择 | 服务端更新器行为，与安卓 APK 更新/签名链路不同，无本轮必须改的客户端代码 |
| Kazumi/AniSubs 抓取兼容 | 服务端修复即可让既有单集 API 受益，客户端检查结果和 headers 透传 |
| 服务器 `currentQn` 修正 | 对应 A05，消费真实结果，不应为了保持旧显示而覆盖返回值 |
| FLAC MP4 位深修复 | 客户端 `vendor/mediabunny/LOCAL-PATCHES.md` 已记录此修复；保留本地补丁并回归 16/24 位 FLAC。不能因为上游包含同一修复再次覆盖整棵 vendor |
| 登录与鉴权 | 服务端 auth 路由在累计比较中未变化；保留客户端 HTTP/HTTPS 都可使用本地 token 的移动适配，不能照抄网页 HTTPS 只靠 Cookie 的实现 |
| 片单切换 | 客户端已有 ACK 超时、服务器片单内存恢复和房主接收非空切片事件修复；这些不能随上游简单 `emit + 本地高亮` 实现被覆盖 |

安卓已有本机最高普通画质、设备能力检测、账号 epoch 隔离、有限降档、Pause intent、URL 凭据拆包装、字幕/弹幕和宿主全屏等差异，是迁移时需要保护的产品行为。`scripts/import-core.mjs` 仍指向相邻的 v4.1.7 源目录，而且现有文件不被覆盖；本次适配不宜直接运行它，应按模块对照迁移并核验依赖闭包。

当前安卓测试脚本、测试目录及部分旧验收文件已从交付树清理。不能引用 README 中旧链接就声称那些验收仍可运行或已经通过。后续验证需按维护手册重新保存脱敏记录。

## 9. 建议实施顺序与可行性验证门槛

本节是后续执行方案。本次未构建 APK、同步资源、启动服务端、连接测试账号或执行以下验收。

### 阶段一：协议与播放规则

先完成 A01/A02，保留移动平台入口并验证双向语音；同步 A03 的质量/身份规则。然后推进 A04～A07、A11 和 A13，使有效模式、画质、观众重载、媒体清理和后台音乐稳定。

使用固定 v4.2.1 服务端，与官方 v4.2.1 网页同房测试；房主/观众交换角色，使用不同账号或游客。单账号多端测试只有在明确启用服务端测试开关时进行，不用放宽默认登录规则来掩盖重连问题。

### 阶段二：播放器可行性

将 A08/A09/A10 作为有独立检查点的迁移；验证服务器代理 DASH、安卓内置代理 DASH、普通直链、MKV/转码与缓存。对每种源核验开始播放、暂停、倍速、拖动、换片、退出和恢复。

若当前安卓 WebView 中新 RC 引擎无法满足关键链路，先定位依赖、MPD、鉴权、Range 或解码问题，记录该项未通过；不能用“能返回播放地址”替代播放成功，也不能因此跳过前一阶段已经确认必须修复的语音协议。

### 阶段三：功能对齐与安卓设备验收

按需求推进 A14～A17。先运行根项目 TypeScript/Vite 构建，通过后执行 `npm run android:sync`，再在 `ZV-Android/` 构建调试 APK。Go 核心修改时走已有 AAR 自动构建流程，不手动维护生成 AAR。

| 验证项 | 场景 | 通过条件 |
| --- | --- | --- |
| V01 连接与鉴权 | HTTP、HTTPS、游客/账号、刷新、切服务器 | API、主 Socket、媒体 Socket 指向正确服务器；旧服务器连接和旧 token 不再使用 |
| V02 房间恢复 | 密码、审批、掉线、服务端重启、房主恢复、关闭/被踢 | 房间状态与媒体一起恢复/结束，无旧房间回调污染 |
| V03 语音互通 | 安卓 ↔ 官方网页，Opus/PCM 回退，禁言/踢出 | 真正双向有声；`from` 对应主 socketId；控制/编解码配置/媒体分工正确 |
| V04 语音弱网与设备 | 拒绝权限、前后台、网络切换、耳机/蓝牙、音乐同播 | 无无限排队补播；媒体重绑定成功；音频路由与权限行为符合既有产品规则 |
| V05 B 站模式 | 本机登录/退出/失效、代理可用/不可用、服务端 DASH 禁用 | 有效播放格式、UI 和解析请求一致；未连接回退 MP4 |
| V06 B 站画质 | 自动/手动、权限降级、分 P、房主观众不同档位、解码失败 | 显示实际档位；自动不锁旧 qn；手动保留；有限回退有效且无跨账号缓存 |
| V07 DASH 与 Range | 明确大于 8 MiB 的分片、远处 seek、反复拖动、取消 | 范围和实收长度正确；完整分片可播；无持续缓冲或重复全量下载 |
| V08 媒体格式 | MP4、HLS、FLV、MKV、多种音轨、16/24 位 FLAC、字幕 | 支持路径可播；不支持路径可读报错；用户开关与引擎行为一致 |
| V09 生命周期 | DASH→MP4→MKV→FLV、预览、快速换片、加载中暂停、离房 | 单一有效声源；旧元素/引擎/Worker/Blob/下载全部停止 |
| V10 一起听 | 锁屏/后台切歌、通知栏、A/A/B 重复队列、懒解析并发 | 顺序能越过重复项；拒播可有界恢复；迟到旧解析不能抢播 |
| V11 背景视频 | 本机/服务器 DASH/MP4、qn 调整、歌词显隐 | 背景静音且时长/进度同步；主音乐独立出声；资源正确释放 |
| V12 挂载与番剧 | 服务端文件、DAV/FTP/OpenList/Emby/Jellyfin、AniSubs/Kazumi | 原有浏览/解析/播放兼容；多选部分失败可正确处理 |
| V13 移动交互 | 手机/平板、旋转、全屏、返回、字幕/弹幕、折叠语音 | 原有移动功能和原生桥接方法保持可用，折叠不挂断、离房释放 |
| V14 发布链路 | 干净依赖构建、安卓资源同步、包版本/签名 | 交付记录与实际 APK 一致；遵循维护手册，不提交 APK/AAR、密钥或未脱敏日志 |

以上核心项通过后才能记录“安卓对 v4.2.1 可行性验证通过”。此后再同步同一共享前端到鸿蒙，专项验证 ArkWeb 媒体/Worker/权限/回环代理；iOS 单独检查现有媒体 Socket、VLC Range 与原生编解码/生命周期，复用的是协议结论和验收场景。

## 10. 关键源码定位

下列行号对应本次读取的源码，后续修改会导致行号移动。

| 证据 | 客户端/参考源码 |
| --- | --- |
| 用户指定维护手册 | [android-maintenance-architecture.md](E:/Codex-bulid/ZViewer/ZViewer-client/docs/android-maintenance-architecture.md) |
| 当前导入基线 | [import-core.mjs](E:/Codex-bulid/ZViewer/ZViewer-client/scripts/import-core.mjs:7) |
| 单连接移动实现 | [客户端 useSocket.ts](E:/Codex-bulid/ZViewer/ZViewer-client/src/upstream/hooks/useSocket.ts:13) |
| 新媒体连接工厂 | [上游 useSocket.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/frontend/src/hooks/useSocket.ts:60>) |
| 旧语音帧发送 | [客户端 useVoiceChat.ts](E:/Codex-bulid/ZViewer/ZViewer-client/src/upstream/modules/voice-chat/hooks/useVoiceChat.ts:1053) |
| 语音 ACK/令牌/媒体绑定/帧路由 | [服务端 voice-chat.handler.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/backend/src/modules/voice-chat/voice-chat.handler.ts:304>) |
| 新语音连接绑定 | [上游 useVoiceChat.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/frontend/src/modules/voice-chat/hooks/useVoiceChat.ts:1642>) |
| 多实例身份 | [multiInstance.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/frontend/src/modules/voice-chat/lib/multiInstance.ts>) |
| 公开设置实际字段 | [auth.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/backend/src/routes/auth.ts:326>) |
| 服务端 DASH 缺省 | [system-settings.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/backend/src/services/system-settings.ts:15>) |
| CLI 与本机现有适配 | [客户端 movie-source-resolver.ts](E:/Codex-bulid/ZViewer/ZViewer-client/src/upstream/modules/room/watch-together/movie-source-resolver.ts:122) |
| 最终 CLI 回退/自动 qn | [上游 movie-source-resolver.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/frontend/src/modules/room/watch-together/movie-source-resolver.ts:115>) |
| 实际选流 qn | [服务端 playurl.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/backend/src/services/bilibili/playurl.ts:267>) |
| 现有独立本机画质 | [nativeQualityPolicy.ts](E:/Codex-bulid/ZViewer/ZViewer-client/src/upstream/modules/bilibili/nativeQualityPolicy.ts) |
| 新增后绑定解析偏好 | [上游 MoviePushPanel.tsx](<E:/Codex-bulid/ZViewer/ZViewer-source code/frontend/src/modules/room/components/MoviePushPanel.tsx:1083>) |
| 旧 addMovie 返回契约 | [客户端 roomStore.ts](E:/Codex-bulid/ZViewer/ZViewer-client/src/upstream/store/roomStore.ts:554) |
| 统一观众有效片源 | [上游 useVideoSource.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/frontend/src/modules/sync-playback/hooks/useVideoSource.ts:313>) |
| 新引擎、影片级门控 | [engine-selector.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/frontend/src/modules/player/engine-selector.ts>) |
| DASH MPD 与执行层 | [videojs10-dash-engine.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/frontend/src/modules/player/engines/videojs10-dash-engine.ts:235>) |
| dash.js 构建判空补丁 | [上游 vite.config.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/frontend/vite.config.ts:6>) |
| 游离元素播放守卫 | [safePlay.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/frontend/src/modules/sync-playback/safePlay.ts:49>) |
| 通用代理显式 Range | [http-proxy.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/backend/src/services/proxy/http-proxy.ts:111>) |
| 本地文件 Range 模式 | [serverFiles.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/backend/src/routes/serverFiles.ts:650>) |
| 安卓回环代理 Range | [mobile.go](E:/Codex-bulid/ZViewer/ZViewer-client/native/bilicore/mobile/mobile.go:254) |
| 音乐后台/重复队列/并发修复 | [上游 useListenTogether.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/frontend/src/modules/music/hooks/useListenTogether.ts:392>) |
| 服务器 DASH 背景解析 | [useMusicVideoBackground.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/frontend/src/modules/music/hooks/useMusicVideoBackground.ts:145>) |
| FLV 统一引擎 | [上游 FlvPlayer.tsx](<E:/Codex-bulid/ZViewer/ZViewer-source code/frontend/src/modules/screen-sharing/components/FlvPlayer.tsx:160>) |
| 数据库内部修复 | [db-persistence.ts](<E:/Codex-bulid/ZViewer/ZViewer-source code/backend/src/services/db-persistence.ts>) |
