# iOS 后续更新计划（对齐 Android / HarmonyOS 1.7.5 与服务端 v4.5.1）

- 编写日期：2026-10-12
- 目标仓库：`E:/Codex-bulid/ZViewer/ZViewer-client`
- iOS 工程：`ZV-iOS/`（Expo SDK 57、React Native 0.86、最低 iOS 16.4、iPhone/iPad）
- 计划基线：客户端 1.7.5 / 175，服务端 v4.5.1，服务端提交 `c8fa5bad0c6efcffbc0dc3bfe4c199f8a9b8d8f6`
- iOS 当前源码：`ZV-iOS` 1.5.1；当前可引用的安装包仍为 1.5.0 / build 16，1.5.1 没有新增 IPA 构建
- 性质：供后续分批实施与验收的计划，不代表 iOS 已经完成对齐、构建或设备验收

## 1. 决策摘要

优先完成会影响服务兼容性和可交付性的工作：将房间语音从旧式 Socket.IO 媒体帧切换至服务端当前 LiveKit token/participant 协议，并修复 iOS 原生 Go 核心的来源固定校验，再着手 Emby/Jellyfin 搜索和媒体库整卡、多版本播放、PGC/cliOnly 影片身份、v4.5.1 番剧浏览与片单清空。随后补本地弹幕格式和字幕能力差距，执行独立服务端联调、Expo 原生构建以及 iPhone/iPad 验收。

Android/HarmonyOS 1.7.4 的 Emby/Jellyfin、番剧浏览和清空能力位于共享 Web/Capacitor/ArkWeb 前端。iOS 是独立 Expo/React Native + VLCKit 工程，不把 `src/upstream` 的 DOM/React Web 组件复制进 RN；仅移植协议 DTO、请求语义、竞态/清理原则和经验证的业务规则，以原生 RN 界面重新实现。

预计下一个功能版可沿用 iOS 1.5.1 后递增的应用版本号；`ios.buildNumber` 必须高于 16。版本、Release 目标和是否触发 EAS 构建在实施时按交付范围确定，不以本计划预先宣称发行。

## 2. 核对基线与资料

| 范围 | 作为计划依据的记录 | 需据此执行的判断 |
| --- | --- | --- |
| 客户端版本和变更 | `CHANGELOG.md`、`docs/releases/client-1.7.5.md`、`docs/releases/client-1.7.4.md` | 1.7.5 汇总 1.7.4 的 v4.5.1 对齐，并修复长标题和番剧源选择菜单；公告按既定要求排除。 |
| Android 结构与适配 | `docs/android-maintenance-architecture.md`、`docs/安卓鸿蒙对齐服务端v4.5.1更新指南-2026-10-12.md` | 参考 API/类型、权限、媒体身份、源隔离和请求世代处理；iOS 不复制浏览器私有通道或 Go/Android 壳实现。 |
| HarmonyOS 结构与适配 | `docs/harmonyos-maintenance-architecture.md`、同一 v4.5.1 更新指南 | 参考房间返回、切页、源选择和端到端场景；iOS 不移植 ArkTS、ArkWeb rawfile 或其包构建。 |
| iOS 当前架构 | `docs/ios-maintenance-architecture.md`、`docs/ios-continuation-plan.md` | 保留 RN 页面、`NativeMediaAdapter`、VLC、B 站 Keychain/本机 Go、原生音频路由、系统媒体和 iOS 工程边界。旧 continuation-plan 前半为 b12/1.5.0 历史材料，不作当前版本说明。 |
| 服务端变更 | `upstream-download-20261012`、本地服务端提交及 `backend/src/routes/voice.routes.ts`、`backend/src/modules/movie/`、Emby/Jellyfin routes | 当前语音接口签发 LiveKit URL/token；媒体库提供搜索、版本解析/切换与带 `movieId` 的 stream；清空片单是权限受控的单次删除。 |
| RN 原生构建链 | `ZV-iOS/scripts/stage-native-core.cjs`、`modules/zviewer-native/ios/ZVBiliBridge.m`、`native/bilicore/` | 目前构建暂存脚本将 Go 来源与固定 client-v1.5.0 比较。不能跳过来源完整性验证；先建立当前受信任来源、许可、文件清单和哈希基线，再验证 iOS 原生 PGC 能力。 |

## 3. iOS 当前差距

| 优先级 | 能力 | 当前代码观察 | 双端/服务端目标 | 计划结果 |
| --- | --- | --- | --- | --- |
| P0 | LiveKit 语音互通 | `VoicePanel.tsx` 先用 `voice-join`，再建立独立 Socket.IO 媒体通道，交换 `voice-media-data` 和 Opus/PCM；原生 `ZVVoiceCodec` 自行编解码。 | Android/HarmonyOS 1.6.0 起走 `/api/voice/token`，LiveKit 房间媒体由 SDK 负责；通过 REST `/mute`、`/kick` 管理 `identity`。 | 使用 Expo development build 可承载的 LiveKit React Native 栈，保留原生麦克风许可和音频会话，拆除已弃用的房间媒体帧假设。 |
| P0 | iOS B 站核心与客户端 1.7.x 能力 | 当前 `stage-native-core.cjs` 拒绝不等于 client-v1.5.0 的 Go 来源；`ZVBiliBridge.m` 本机 `/resolve` 查询尚未显示 epId/seasonId 入参。 | 双端已有 PGC ep/ss、整季/会员元数据、cliOnly、按本机账户解析和房间影片身份校验。 | 明确 iOS 可审计的 Go 来源与构建产物，增加 PGC 输入和房间元数据合同；验证后再承诺本机 PGC。 |
| P0 | 媒体库搜索、整剧/整季 | `SourcePicker.tsx` 具备 Emby/Jellyfin 挂载目录和单文件解析；无媒体库搜索、整卡 pages、多版本 picker。 | v4.5.0/1 支持递归搜索、系列/季整卡、逐集切换、MediaSource 版本和转码 HLS。 | RN 层以真实 itemId / MediaSourceId 建模并支持房间观众播放；切版本/切集采用源代次和清理。 |
| P0 | 服务器片单清空 | `MoviePanel.tsx` 只有逐条删除；`current-movie:null` 已能在 `RoomPlayback` 侧停止并清理来源。 | v4.4.8+ 提供 `DELETE /api/rooms/:roomId/movies`，v4.5.1 双端入口执行确认和过期请求保护。 | 依据 root 或 admin 且为房间创建者的实际条件展示或启用入口，一次请求后刷新权威列表并停掉已清空的当前源。 |
| P1 | 聚合番剧浏览 | `AnimePicker.tsx` 分别请求源、搜索和集数；同类源切换保留 keyword 变量，但清空结果且不自动搜索；跨来源组件重建会丢失关键词，结果无海报代理回退。 | v4.5.1 双端共享浏览器统一 Kazumi/ani-subs、关键词保留/非空自动搜索、海报回退和失败重试。 | 以原生窄屏/平板 UI 实现搜索、源选择、封面、集数/线路和添加重试，不改变 iOS 导航形态。 |
| P1 | B 站搜索分 P 与房间端 PGC | `BiliCatalog` 选择一个结果后在添加弹窗处理 P；当前播放实现有本机 Go 代理和服务器回退。 | 双端搜索结果中明确选 P/PGC，再用对应本机身份和 ep/cid 播放，cliOnly 不能错误落入服务器代理。 | 统一房间影片 DTO、单片单独解析和服务端权限错误语义；测试会员/非会员与多个观看者。 |
| P1 | 播放器媒体格式及转码 | 主视频依赖 VLC；同步字幕 parser 是纯文本 cue，无法呈现完整 PGS 位图。媒体库相对 HLS playlist/segment 的服务端凭证继承需实测 VLC。 | 双端 1.6.0 有序 PGS/Matroska/AAC 支持；v4.5.1 HLS 可经媒体库代理与相对资源访问。 | 先验证 VLC 实际格式矩阵和授权 Range/HLS；无法由现存 RN 字幕层正确呈现的字幕由 VLC 原生单一渲染，不宣称 Web 解码器已移植。 |
| P2 | 房间与播放控制细节 | iOS 已有房间权限/批准、播放状态、恢复/清源、曲库控制等 RN 实现；功能差距需逐项盘点而不能按双端页面数量推定。 | 双端另有 autoContinue、片单完整排序、多个来源管理与 Android/HarmonyOS 系统控制。 | 只纳入 iOS 已有入口或有明确使用价值的功能：房主自动连播、完整片单次序及权限反馈；导航和控件按 iOS 实际布局设计。 |

## 4. 分阶段实施

### 阶段 A：建立可审计的 iOS 构建基线（P0，其他原生能力的前置项）

**目标：** 使下一次 iOS ARM64 device build 能重复地产生本轮源码对应的 native Bilicore，且能追溯第三方源码、Go 模块和许可证。

**涉及文件：** `ZV-iOS/scripts/stage-native-core.cjs`、`scripts/prepare-native-ios.sh`、`scripts/build-unsigned-ios.sh`、`scripts/build-ios-unsigned.ps1`、`ZV-iOS/modules/zviewer-native/ios/Vendor/` 与其 manifest/provenance 记录。

**执行：**

1. 比较固定标签 Go 核心、当前 `native/bilicore` 和 `ZV-iOS` 模块接口；确认 PGC 解析实现及 `mobile.go` 当前 query/JSON 字段，再定 iOS 支持范围。
2. 不撤掉“来源必须匹配”的安全门。把来源基线改为已审阅、已固定 commit 的代码快照（优先使用客户端本地提交或明确上游版本），保存相对路径、逐文件 SHA-256、module/license 版本和生成时间；校验任何来源更新都触发人工代码审查。
3. 如 iOS 继续共用当前仓库 Go 实现，更新 `/resolve` 桥接请求的 ep/season/page/cid 参数、PGC 身份查询和响应映射；不得把 B 站 Cookie、私有 loopback URL 或解析令牌放入房间 Movie 或日志。
4. 在 macOS EAS worker 执行 ARM64 gomobile bind 和 Opus 构建，校验 XCFramework 架构、iOS 16.4 deployment target、许可文件与来源 manifest；运行 Go/iOS bridge smoke test。
5. 在 PGC fixture 通过以前，只交付来源审计和普通 B 站 regression 结论；不将“native bridge 可编译”描述成会员 PGC 已可用。

**完成条件：** 干净工作副本可复现 staging；变更来源全部在 manifest 中；缺失/篡改源文件的负向检查失败关闭；license 和 framework 架构检查通过；至少普通 BV、多 P cid 路径以及 ep/ss 请求字段有桥级验证。

### 阶段 B：房间语音迁移到 LiveKit（P0）

**目标：** iOS 和当前服务端、Android/HarmonyOS 使用相同房间语音媒体平面。

**实现入口：** `ZV-iOS/package.json`、lockfile、`app.json`/config plugin、`src/components/VoicePanel.tsx`、`src/lib/nativeBridge.ts`、`modules/zviewer-native/ios/ZViewerNativeModule.swift`、`ZVVoiceCodec.*`、`plugins/with-voice-audio.cjs`。依赖版本以 Expo SDK 57 兼容性检查后锁定，必须 development build；禁止只用 Expo Go 作为原生 RTC 证据。

**合同与状态：**

1. `POST /api/voice/token` 请求当前认证用户、`roomId`、显示名；响应要求 `success`、`url`、`token`。`url` 是服务端配置/请求域推导的 LiveKit 客户端 URL，不能从 `session.serverUrl` 硬编码推导或手工加重复路径。
2. LiveKit `identity` 用于成员去重和管理，不用 Socket.IO `socketId` 替代。LiveKit 房间名是服务端 `voice:${roomId}`；SDK负责重连、远端 participant/track 订阅。
3. `POST /api/voice/mute` 发送 `{ roomId, identity, muted }`；`POST /api/voice/kick` 发送 `{ roomId, identity }`。只有房主/root/服务端授权房管权限可见并执行；服务端错误原样转换为可读提示。
4. 保留进入语音先静音、本机关闭麦克风、后台/系统中断停止采集、离房/切房/切服/失败释放会话、房间音量与 VLC 共存的 iOS 音频路由约束。管理员禁言由服务端 metadata / track 状态决定，和用户主动关闭分开管理。
5. 麦克风权限拒绝不能阻断只听模式（如果 SDK/协议允许）；重试授权必须经过 iOS 权限桥。LiveKit 不可达、token 503、/rtc 反代错误、ICE 无媒体、自动播放/音频会话阻塞分别给出不同诊断，不能将 token 成功当作双向音频成功。
6. 旧 PCM/Opus `voice-media-data` 不能与 LiveKit 重复订阅。仅当其他 iOS 原生功能仍引用 `ZVVoiceCodec` 时保留该 module；否则删减必须先检查原生调用和 config plugin，再独立提交。

**完成条件：** 一部 iOS 与一部 Android/HarmonyOS 加一个服务端房间可互见并双向听到；禁言/解禁、踢出、掉线重连、切房/离房、前后台、静音初值和权限拒绝恢复都闭环。至少一轮必须为已安装 development/release native build；设备/模拟器证据分类记录。

### 阶段 C：协议模型与 iOS 房间媒体身份（P0）

**目标：** 让独立 RN 状态机能消费 1.7.x 的 Movie 字段，并保证房间成员收到的是可共享身份而非某台设备的私有媒体路径。

**实现入口：** `src/lib/sources.ts`、`src/lib/media.ts`、`src/lib/roomPlayback.ts`、`src/lib/mediaAdapter.ts`、`src/lib/biliNative.ts`、`src/app/room/[roomId].tsx`、`src/state/session.tsx`。

- 完整建模 `pages[]`、`currentPage`、`cid`、`epId`、`seasonId`、`cliOnly`、`multiVersion`、挂载 `path/mountId` 与 sourceMeta；先定义受服务端实际 DTO 约束的可选字段，不将 Web 前端字段名盲目加入 API。
- 播放身份分层：Movie 持久身份（room movie id、BV 或 mount/itemId/epId、页码）→ 本机解析（当前设备可用流）→ VLC 请求 URI。只广播/持久化逻辑服务身份，不广播本机 `127.0.0.1`、access token、Cookie、Emby API key、外域私有连接前缀或本机代理能力。
- B 站 PGC `cliOnly` 在任何服务端回退前门控；每台成员设备以各自本机 CLI 和各自账号解析，明确提示缺 CLI/登录/会员权限。房间成员间传播 ep/cid/season/page 身份，不传播解析出的 CDN 地址。
- 对切集、切版本、切片、授权刷新、断线重连、当前片单变更使用请求世代或 AbortController；旧结果不得替换较新的 VLC 源、seek 或字幕轨。
- `RoomPlayback` 收到服务端权威 current movie 为空时，继续调用 adapter `apply(null)`、暂停并清除播放器，不允许 `watch-together-state` 延迟事件恢复已移除影片。

**完成条件：** DTO fixtures 覆盖 1.5.x 旧 Movie 与 1.7.x 新字段；不同设备/服务器的媒体凭证不可出现在序列化/Socket payload；快速多 P/ep 切换时最终 VLC URI 始终匹配最新影片和 cid；current-movie null 必停源。

### 阶段 D：Emby/Jellyfin 媒体库功能（P0）

**RN 入口：** `ZV-iOS/src/components/SourcePicker.tsx`、`MountManager.tsx`、`MoviePanel.tsx`、`src/lib/sources.ts`、`src/lib/resolvers.ts`、`src/lib/media.ts`。需要拆分可测试 API client 和媒体身份模型，避免把所有搜索、浏览、添加逻辑继续挤入 SourcePicker。

**共享业务目标：**

- 媒体库搜索：`GET /api/{emby|jellyfin}/mounts/:id/search?term=`。同一 mount 内切目录/搜索互不污染；结果和封面在切服务器、切挂载、退出弹窗、换房时按 request generation 失效。
- 卡片与元数据：Series/Season 可以目录浏览或“添加整部/整季”；保存各集 `itemId`、真实 mountId/path、序号、时长。映射及服务端 schema 未确认前，不擅自套用双端 pages DTO 类型。
- 分集切换：普通逐文件添加仍保留。整剧/整季为一张 room movie，切集解析精确 itemId 后更新当前 page、duration、format 和真实播放源，不能误经 B 站 `biliSelection`。
- 多版本：只有 `multiVersion=true` 显示清晰度操作；版本使用服务端给的真实 `MediaSourceId`，选择时通过 `/api/{emby|jellyfin}/movie-source?movieId=N&ms=ID` 或已验证的 resolve contract 更新播放源。绝不由“1080p”文本推算 ID。
- 图片：封面使用服务端认证代理，并通过 iOS 服务器认证请求获取 Blob/受控图像数据；不能把 bearer 或服务器 Cookie 放进图片 URL/广域 native transport，也不能将旧服务器封面显示在新服务器结果上。先做 iOS 图片 API 能力验证，必要时加本地缓存/下载临时文件及清理。
- HLS：媒体库代理 HLS master/variant/segment/key 只经用户选定的服务端凭据请求；VLC Range、相对分片、401/403、seek 和转码 fallback 分开验证。直链和代理 URL不共享媒体库凭据。

**完成条件：** 两种媒体库分别通过搜索→开目录→添加单集→整季卡→切集→切多个版本→退出/恢复房间；房主与普通观众都实际播放并推进；列表、页面号和播放时长一致；iPhone 窄屏与 iPad 横竖向可浏览；自签服务器只经用户配置的既有 TLS 例外处理。

### 阶段 E：v4.5.1 番剧浏览、海报与清空片单（P0/P1）

**RN 入口：** `AnimePicker.tsx`、`SourcePicker.tsx`、`MoviePanel.tsx`、`MediaImage.tsx`、可新建 `AnimePoster.tsx`/`AnimeSourceSheet.tsx`，以及 `src/lib/sessionLease.ts` 相关会话租期校验。

1. 复用 iOS 已有三个来源（ani-subs、Kazumi、传统 anime）的能力，而不是把桌面/Android 的合并浏览器全盘复制。源变化时保留非空关键词及面板导航；只对非空且新源与旧源不同触发一次搜索，避免重复请求和旧响应覆盖。
2. 结果列表显示可用封面；先尝试受控直连图像，再通过服务端图片代理回退。对源/结果变更、切服和弹窗关闭取消在途请求，清理临时文件/缓存；图坏或代理拒绝不能挡搜索与选集。
3. 保留 episode/sourceId/playbackParams 稳定身份、手选源语义和添加失败项重试。首次整季多选确认后再添加，局部失败保留选中；不要自动向房间开播。
4. 片单清空只对服务端授权角色开放：`role === root`，或 `role === admin && room.ownerUserId === user.id`。不能仅凭实时 host/房管状态判断；需补加载 ownerUserId；确认弹窗展示影片数，单次 DELETE `/api/rooms/:roomId/movies`，校验响应、重复请求保护与切房 generation。成功以服务端广播为准，`current-movie:null` 后停止当前 VLC 源，失败不得本地先清空伪装成功。
5. 对 1.7.5 的标题/长名称体验，iOS 片单标题保留完整内容并按原生可读方式自动换行；番剧源选项显示完整但限制最大宽度，采用可滚动选择器而非覆盖菜单固定桌面布局。

**完成条件：** 切源保留关键词并只发一次请求；源海报直连失败代理可用、双方失败仍有占位；失败条目可重试而无重复添加；清空权限和广播一致；切房晚到响应无副作用；在 320/360pt iPhone 宽度及 iPad 上布局可操作。

### 阶段 F：字幕、弹幕、自动续播和系统媒体差距（P1/P2）

**字幕：** Android/HarmonyOS 从 1.6.0 起支持有序 PGS 位图和 Matroska/AAC 修复；iOS 源码内 `subtitleParser.ts`/`subtitleSync.ts` 目前将解析结果建模为文本 cue。第一步使用固定的 H.264/AAC MP4、HEVC/Opus MKV、内嵌 PGS/ASS/SRT/VTT 样本检查当前 VLCKit 4 原生轨道是否能直接处理；如果原生轨道实际正确，就优先保留原生渲染/互斥规则，不把复杂字幕转成低保真同步文本。只有确定原生不支持且 Android/HarmonyOS 能力确有产品需求时，再设计有序 PGS parser/bitmap cue RN 实现，并给位图数据增加房间 payload 大小与资源限制。

**弹幕文件：** 当前 `ZV-iOS/src/lib/danmakuImport.ts` 主要识别 B 站 XML 和简单通用 JSON，校验上限 50000 条；共享双端 `src/upstream/modules/danmaku/localImport.ts` 支持 dandanplay JSON、protobuf 导出和宽松字段映射，限制 5 MiB/20000 条，并丢弃不支持 8/9 模式。按 fixtures 补 parser，而不是直接复制 TS module；统一每条内容和总输入字节上限、5xx/空弹幕的失败回滚。

**自动连播/排序：** RN `MoviePanel` 已有房主上下移动，但排序权限、完整 ID 列表和断线状态仍需检查；新增 iOS 本地每房间/服务器隔离的 autoContinue 设置，结束事件只由房主读取最新权威列表并切下一部。停用、离房、观众角色变化、当前影片变化、删除下一影片时废弃旧 continuation；“order”模式末项结束应停播。沿用 iOS 完整列表原生控件，禁止要求滑块拖拽作为唯一排序入口。

**系统媒体/后台：** 现有 `useSystemMedia.ts`、`ZVSystemMedia.swift` 继续保留音乐/播放控制桥。LiveKit 迁移后重新测试通话与音乐/VLC 共存、耳机/蓝牙、来电/中断、锁屏和后台；现有后台音频声明不能作为后台持续采集或 Socket 常驻的证据。无设备测试时不提升支持承诺。

### 阶段 F 补充一：连接方式与证书通道（P0/P1）

**当前证据：** `src/lib/server.ts` 的 `normalizeServerUrl` 已接受完整 HTTP/HTTPS 地址并保留路径前缀；未填写协议时补 HTTPS。它只是规范化，不等于双端 1.7.0 的“无凭据 HTTPS 优先探测 + 有明确证据才 HTTP 回退”。`src/state/session.tsx`、`lib/biliNative.ts` 的 REST/fetch、业务 Socket、RN Image 与 VLC 是多条独立网络路径；当前 `nativeBridge.ts` 没有服务器证书例外的完整桥接口。

**实施任务：**

1. 保留完整 URL/路径前缀输入，增加明确的自动/自定义连接方式与错误分类。无协议地址优先探测 HTTPS，探测不带凭据；仅有同端口明确明文服务证据时按双端既定规则提供 HTTP 回退，不能遇到任意 TLS 错误自动降级。
2. 对照共享 `src/mobile/serverUrl.ts`、`src/platform/serverConnection.ts`、`connectionTransport.ts` 与 `native/bilicore/mobile/server_connection.go`，设计 iOS 的逻辑地址→实际传输映射。先验证现存 Go server connection 能否以 iOS bridge 暴露并覆盖 URLSession/RN/VLC/Socket，不能直接承诺复用 Android bridge 即可。
3. 证书例外只绑定用户指定服务器 origin，持久化配置和运行期私有通道分离。撤销例外、切服、退出时关闭旧请求、WebSocket、图片任务及流请求，删除旧通道映射。第三方 CDN、图片和独立 LiveKit 域不能继承该例外。
4. 如采用本机受控代理，必须有随机能力路径、Host/Origin 校验、stream/Range/WebSocket 支持与退出释放；逻辑 URL 用于存储和广播，本机 URL 只交给当前设备消费者。原生图片及 HLS 子清单不能绕过该策略。
5. LiveKit 信令可能同域也可能使用独立域名；TCP/WSS API 可达不代表 ICE/UDP/TURN 媒体可达。单独验证 TLS 与媒体网络，不把服务器连接开关视为 RTC 全链路证书支持。

**验收：** HTTPS 有效证书、HTTP 明文、完整子路径、受控自签例外、例外撤销、跨域重定向、API/图片/206 Range/HLS/Socket 同时访问与账号切换。证书兼容若未实现，版本说明应明确目前仅支持哪些连接组合。

### 阶段 F 补充二：一起听与网易云账户增量（P1）

**已有能力：** iOS 已有 `MusicPanel.tsx`、`MusicLibrary.tsx`、`usePersonalFm.ts`、`musicCollection.ts` 和 `MusicSyncReceipt`；扫码登录、歌单批量替换/追加、持续私人漫游、歌词与 build 16 一次性同步回执应作为回归资产。不能把这些列成从零新增。

**待补能力与实现入口：**

| 项目 | 当前差距与施工要求 | 对照实现 |
| --- | --- | --- |
| Cookie 登录/主动复制 | 目前账号弹窗以扫码为主。补 Cookie 粘贴登录、主动复制已登录 Cookie 的入口；游客禁用，关闭后清掉临时输入，复制只由用户动作触发；日志和错误信息脱敏。 | `src/upstream/modules/music/hooks/useNcmLogin.ts` 及 MusicCookieModal |
| 业务 401 隔离 | `src/lib/httpAuth.ts` 将 HTTP 401 判为认证失败；`session.requestText` 据此尝试刷新本站会话。对网易云业务失败应依据真实接口响应设计 per-request 认证策略，不能因第三方 Cookie 失效清掉 ZViewer 登录。 | 双端音乐请求的 refreshAuth 策略与本地 `src/state/session.tsx` |
| 末尾推荐续播 | iOS 已有队列循环/单曲/随机/顺序和私人漫游。补双端的推荐续播开关和末项处理；只由房主补曲并等待入队确认，失败不重复补入；与 FM、自定义队列和单曲循环分别测试。 | 双端 music 模块当前末尾推荐实现；iOS `MusicPanel` 的 heartbeat/ended 分支 |
| 默认来源页 | 保存用户选定来源/首页偏好并正确初始化；失效来源回到可用默认，切账号/服务器时按明确作用域重置，不覆盖现有日推和漫游入口。 | 双端 music 默认页设置；iOS MusicPanel/MusicLibrary |
| 房间讨论 | 保留歌曲评论 `SongComments`，另将房间讨论复用业务 Socket 评论协议，在一起听中可达；标清两类评论语义。 | 双端一起听房间评论入口；iOS 房间页 `new-comment`/`send-comment` |
| 系统歌词与元数据 | 核对 `SystemMediaState`/`ZVSystemMedia` 的实际可呈现字段；至少歌词切歌清理、封面旧回调失效和系统进度准确。iOS 不照搬 Android 通知栏歌词，也不承诺系统不提供的歌词 UI。 | 双端 useSystemLyrics/lyricRequest；iOS useSystemMedia |

**验收：** 游客/普通用户、Cookie 失效但本站登录有效、扫码和 Cookie 登录互换、取消批量添加、末尾推荐重复结束回调、同曲重复心跳、切曲/重连新回执、无歌词曲、后台恢复后的音乐状态。build 16 的“同曲不重复已同步”必须持续通过。

### 阶段 F 补充三：跨端字幕和历史未闭环事项

1. **PGS 本机播放与跨端同步分别验收。** `subtitleSync.cleanSubtitlePayload` 当前重新映射 cue 时不保留 bitmap，`SubtitleOverlay` 仅输出 Text。因此，即使 VLC 能播放本机内嵌 PGS，也不能据此宣布能显示 Android/鸿蒙房主广播的 PGS。新增 bitmap DTO 校验及 RN Image 按视频内容区域缩放，或在未支持时明确提示并允许选择本机原生轨道；不得静默显示空字幕。位图仅接收受限的 PNG 数据、验证大小/坐标/画布尺寸，换片释放，避免凭据 URL 混入。
2. **保留原生 ASS/文本同步互斥。** build 16 轨道高亮、VLC Disable 项去重、原生外部字幕与 React Native 字幕层互斥、复杂 ASS 特效和边缘重复文本仍需物理设备复验。VLC 解码版本升级必须复查 `with-vlc-tracks.cjs` 的补丁位置与幂等性。
3. **弹幕搜索连续添加。** `DanmakuSearchDialog.importEpisode` 当前成功后调用 `close()`。对齐 1.7.2 行为：成功后保持打开，用房间实际轨道 `source:id` 标记“已添加”，删除轨道后可重新添加；失败留在原位置可重试，切房/切服后旧结果失效。导入条数限制不等于 API JSON 字节限制，提交前按实际 UTF-8 请求体检查服务端限制。
4. **挂载初始目录。** iOS `SourcePicker.roots` 使用 `mount.path || '/'`，browse 每次显式发送 path；不能直接照搬双端“首次不传 path，升级服务端自动生效”的结论。逐类核对 WebDAV/OpenList/FTP 和 Emby/Jellyfin mount DTO 的根目录语义，非根配置首次进入应落在配置目录；不要重复取父目录。
5. **授权观众切片。** 当前 `useWatchControl` 只申请 play/pause/seek，MoviePanel 播放按钮仅 host 显示。检查服务端 v4.4.5 之后授权观众切片流程，增加与双端一致的申请/授权路径；先核对真实事件和权限，不通过 REST 伪装房主。片单管理权限、语音管理权限、播放控制权限应分别建模。
6. **后台独立业务 Socket（旧计划 I13）。** `UIBackgroundModes=audio` 和原生控制中心不证明 JS 挂起后仍能处理房间心跳、切歌与审批。继续列为独立高风险工作项：先验证实际后台存活和恢复行为，再决定原生业务连接所有权；若需要原生 Socket，明确与 JS 互斥接管和状态回放，防止双心跳/双指令。首期可以保留明确限制，不将它作为 LiveKit SDK 自动解决的功能。

### 阶段安排与提交边界

| 里程碑 | 包含任务 | 前置依赖 | 退出条件 |
| --- | --- | --- | --- |
| M0：基线与合同 | A 来源固定、C DTO、连接能力盘点和旧测试基线 | 当前指定仓库 | 来源清单可验证；新增 DTO/旧数据兼容测试通过；未确认接口标出，不先冲 EAS |
| M1：兼容恢复 | B LiveKit、C cliOnly/PGC、连接方案最小原生验证 | M0 | 当前服务端实际跨端语音和基础视频通过；原生依赖冲突解决；可生成可审计 device 包 |
| M2：业务对齐 | D 媒体库、E 番剧/清空、字幕/弹幕和音乐增量 | M0；原生实播依赖 M1 | RN 交互与隔离服务端端到端通过；权限、取消、旧响应、失败回滚有证据 |
| M3：候选交付 | G 全回归、设备矩阵、维护资料、版本/buildNumber | M1+M2 | 每项标记通过/失败/未测；重大功能没有未披露阻塞；一次集中构建并本地提交 |
| M4：后台增强 | I13 原生业务连接与长期锁屏同步 | M3 或独立原型 | 真实 iPhone/iPad 长期后台证据；JS/原生所有权单一；单独版本记录 |

M0/M1 优先消除构建与协议风险；M2 的纯 RN 布局可在原生构建排队时继续。以上是依赖顺序，不是工期承诺。尽量合并纯 JS/UI 验证后再消费 EAS 额度；需要 LiveKit/VLC/Go 的最小原生验证不能用 Web 截图替代。每次完成一个可交付版本的构建，在本仓库本地 commit，并将确切提交及验证状态写入交付记录。

### 阶段 G：回归、构建与分层验收

**自动化和源码质量：**

```powershell
cd E:/Codex-bulid/ZViewer/ZViewer-client/ZV-iOS
npm test
npm run lint
npm run typecheck
npx expo export --platform ios --output-dir .expo-export-test/ios-next
npx expo export --platform web --output-dir .expo-export-test/web-next
```

- 为 DTO、PGC 输入、认证错误、媒体库 URL/MediaSourceId、权限门控、source generation、LiveKit token 错误映射、清空竞态、HLS URL 路由和弹幕转换补纯逻辑测试。
- RN/Web 导出只证明 JS bundle；不证明 CocoaPods、LiveKit 原生模块、Go XCFramework、VLC 解码或 microphone/audio session 工作。
- native dependency 增加前读取 Expo SDK 57 对应文档并用 `npx expo install` 解析兼容版本。更新后实际检查 Podfile.lock、插件生成结果、Info.plist、deployment target、内置 framework 架构和构建日志。
- IPA 构建必须在 `ZV-iOS` 执行现有 `scripts/build-ios-unsigned.ps1` / `scripts/build-unsigned-ios.sh` 路径，离线检查 IPA 的 ARM64、bundle/build/version、模块、许可、内置 JS 和签名状态；安装仍需合法签名。每次构建完成更新 `docs/ios-maintenance-architecture.md` 并在指定仓库本地 commit。

**隔离服务端：** 本地启动用户指定工作区服务端，使用测试用户/房间/测试媒体和空白数据库；记录固定服务端提交、端口和 fixture。仅改本地服务端，不连接 NAS。用户现场设备验收另记录，不能将隔离服务端/模拟器数据写成生产环境结果。

**验收级别分开记录：**

| 级别 | 最低证据 | 可得结论 |
| --- | --- | --- |
| 单元/合同 | 测试输出、脱敏 request/response fixture | 规则、映射与请求合同通过；不是 UI 或原生运行。 |
| RN/Web | iPhone/iPad 尺寸截图、交互探针、console/error | 布局及 JS 流程通过；不是实际 iOS 原生模块验收。 |
| Expo development / unsigned IPA | EAS build id、IPA inspect JSON、设备 ARM64/模块列表 | 原生构建可安装/可签名；不是实际服务互通。 |
| 模拟器 | iOS/Xcode 版本、App、日志、隔离服务端和测试媒体 | 模拟器覆盖的实际 API/播放场景通过；不替代物理设备麦克风、蓝牙和外网穿透。 |
| 物理 iPhone/iPad | 设备/iOS、网络拓扑、双向听音/播放场景和结果 | 仅据实际测试场景声明设备验收；不外推所有解码格式和网络。 |

### 核心行为验收矩阵

| 场景 | 验收结果 |
| --- | --- |
| v4.5.1 token | 有效 token 得到服务端 `url`，不能读取 token 时无连接；503/401/404 和错误 JSON 提示可辨。 |
| LiveKit 跨端 | iOS↔Android、iOS↔鸿蒙双向语音；参与者名称/identity 对齐；房主/root/房管禁言、解禁和 kick 权限正常。 |
| 音频路径 | 默认静音；用户自我 mute 与管理员 mute 不互相清除；前后台、中断、蓝牙、有线耳机、后台音乐和 VLAN/蜂窝网络切换按可测项记录。 |
| 语音清理 | 离房、切房、改服务器、页面卸载/快速重复加入后，旧房间无采集/播放；断网重连旧 room generation 不可写回。 |
| PGC | 普通 BV、多 P、PGC ep、season 整季；cliOnly 设备无本机 CLI、退出账号、会员不足时正确失败且绝不 server fallback。 |
| 分集身份 | 每个房间客户端解析相同 movieId/page/cid/ep；快速切 P/切 ep 后只播放最后选择；观众无房主挂载或 CLI 私有路径依赖。 |
| 媒体库搜索 | Emby/Jellyfin 分别搜索电影/Series/Season/Episode；清搜索回目录、切 mount、重连与快速查询无跨源串结果。 |
| 整季卡 | Series/Season 逐集枚举顺序稳定、单集可辨、page→真实 itemId 映射稳定，添加时不开始播放。 |
| 媒体库多版本 | 单版本隐藏切换器；多版本按真实 MediaSourceId 变更；切版本后 stream identity/format/duration 重算。 |
| 媒体播放 | Emby/Jellyfin MP4 直链、服务器代理、转码 HLS master/相对分片、Range/seek 和普通观众鉴权分别验收。 |
| 图片 | 无图、无 tag、401、坏 URL、服务端代理回退、切服务器期间晚到图片响应均覆盖，不暴露凭据。 |
| 清空片单 | 有权限/无权限、取消、重复点、清空当前影片、自动连播期间清空、切房时响应晚到；权限失败不清 UI，成功停止 VLC。 |
| v4.5.1 番剧 | 切 Kazumi/ani-subs 源时非空关键词与面板状态保留并仅触发一次搜索；空词不查；海报失败有占位；只重试失败集数。 |
| 房间控制 | 房主排序完整片单，自动续播仅播下一条，最后一条停止；普通观众申请权限/禁播状态正确。 |
| 弹幕文件 | B 站 XML、dandanplay JSON、protobuf JSON、边界模式和坏数据；超限拒绝且不部分保存。 |
| 播放字幕 | H.264/AAC、HEVC/Opus、MKV 字幕/多音轨、ASS 特效、PGS、VTT/SRT；确认单一渲染器和换片清理。 |
| 系统媒体 | Now Playing/控制中心、暂停/恢复/seek、房间角色、后台音频、LiveKit 麦克风/音乐共存；逐项记录硬件。 |
| 横竖屏/尺寸 | iPhone 320/360/393pt、iPad 竖/横、系统键盘、播放全屏和原生 modal 返回顺序；底部确认按钮始终可达。 |

## 5. 明确排除与不可倒退边界

- 本轮和计划不包含桌面公告弹窗/自动更新提示、独立评论窗口、全屏评论侧坞及相关快捷键；遵循既有客户端范围决定。
- 不替换 iOS 的 Expo Router、NativeMediaAdapter、VLC、SecureStore、房间 WebSocket 或 B 站 Keychain 权限范围；只按明确接口收敛改动。
- 不跨平台复制 Capacitor/ArkTS bridge、固定虚拟域名、生成 rawfile 或桌面 Web Modal/DOM 组件。
- 不把服务端媒体 token、B 站 Cookie、Emby/Jellyfin API key、私有连接通道、IPA 签名资产或 NAS 用户凭据写进 source、logs、Movie DTO 或发布归档。
- Web 预览、模拟器 build、纯 API fixture、媒体解析返回成功都不能代表已在物理设备上完成对应场景；报告精确层级和未验证项。

## 6. 实施交付清单

完成一期实施后至少更新并提交：

1. iOS 源码与 meaningful tests，包含新增 LiveKit 原生插件/依赖和协议实现。
2. `docs/ios-maintenance-architecture.md` 当前版本入口、协议/原生模块边界、构建方式、真实验收与未验证场景。
3. `CHANGELOG.md` 及 `docs/releases/` 中与实际实现相符的发行说明/证据；不要提前把计划写成“已完成”。
4. 构建来源 manifest、脱敏 API/设备验证摘要、IPA 离线检查结果、SHA-256 与本地提交 SHA。
5. Git 操作只在 `ZViewer-client`；后续如产生源码发布归档，执行 AGENTS.md 中关于账户信息、签名资料和 `AGENTS.md` 排除的发布审计。

## 7. 参考文件索引

- 当前双端改动摘要：`CHANGELOG.md`、`docs/releases/client-1.7.4.md`、`docs/releases/client-1.7.5.md`。
- 双端服务端适配细节：`docs/安卓鸿蒙对齐服务端v4.5.1更新指南-2026-10-12.md`。
- 维护架构：`docs/android-maintenance-architecture.md`、`docs/harmonyos-maintenance-architecture.md`、`docs/ios-maintenance-architecture.md`。
- 本地服务端协议参考：`E:/Codex-bulid/ZViewer/ZViewer-source code/backend/src/routes/voice.routes.ts`、`backend/src/modules/movie/movie.routes.ts`、`backend/src/modules/shared/dto/movie.dto.ts`、`backend/src/routes/emby.ts`、`backend/src/routes/jellyfin.ts`。
- iOS 实现入口：`ZV-iOS/src/components/VoicePanel.tsx`、`SourcePicker.tsx`、`AnimePicker.tsx`、`MoviePanel.tsx`、`BiliCatalog.tsx`、`src/lib/roomPlayback.ts`、`mediaAdapter.ts`、`biliNative.ts`、`modules/zviewer-native/ios/`、`scripts/stage-native-core.cjs`。
### 在线核对与证据边界

本次已读取 GitHub 的 v4.5.1 和 client-v1.7.5 单独发行页面，并以本地实际源码为分析基线。GitHub Releases 列表缓存曾仍显示 v4.5.0；随后匿名 API 查询遇到 rate limit，无法保证服务端 main 在编写时没有更新。因此本文锁定 v4.5.1 / c8fa5ba，而不把它写成永久最新 main。实施开始时重新核对版本差异，仅按需要更新本计划基线。

已读取的官方 SDK 资料为 Expo SDK 57 reference 和 LiveKit React Native quickstart；后者说明 Expo 原生 RTC 需 development build。实施前还应读取对应 Expo 接入说明，并核对 `@livekit/react-native-webrtc` 与现有 `react-native-webrtc` 的依赖/Pod 冲突，保留 ScreenShare 的共享观看能力。不能同时引入两套冲突的 WebRTC 原生二进制。具体 SDK 版本及插件配置待兼容性验证后固定。

本次交付仅包含本文。本文中的测试、IPA 构建与设备矩阵均为后续执行要求；没有在本轮运行应用测试、触发 EAS、构建 IPA 或更新运行中的服务端。