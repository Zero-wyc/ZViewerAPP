# iOS 客户端维护架构

## 2026-10-13：一起听顶部对齐与账号菜单精简

补充修复：网易云选中下划线改为绝对定位，不参与文字行布局；网易云与哔哩哔哩使用相同行高。390×844 / 844×390 / 768×1024 / 1366×1024 实际预览中，两项文字顶部与高度完全相同，箭头仍居中，无横向溢出。类型检查和 lint 通过，未构建 IPA。

- `MusicPanel` 将网易云下拉标记从文字字符改为已有 Feather `chevron-down`，文字和图标在同一行垂直居中；保持下拉页选择和选中下划线。
- 音乐账号菜单仅保留“账号登录”“音乐设置”，删除房间模式及 `switchMode` 回调。模式切换仍使用房间设置中的“一起看 / 投屏 / 一起听”。
- 类型检查和 lint 通过；实际预览确认菜单只有两个操作，390×844 / 844×390 / 768×1024 下箭头和文字中心一致，无横向溢出。Expo Go 继续运行，未启动 IPA/EAS 构建。


## 2026-10-13：B站入口、房间模式与浮动评论统一（源码 / Expo Go 预览）

版本保持 **1.8.0 / 18**。本轮未启动 IPA/EAS 构建；下述行为属于当前源码，已有 build 18 安装包需等待下一次授权构建后复测。

- `BiliVideoPicker` 共用于一起看 `SourcePicker`、一起听 `MusicLibrary`、歌曲关联视频 `MusicVideo`：链接/BV/ep/ss 输入、解析、紧凑账号/画质、独立搜索弹窗、分 P/集选择以及失败重试。`BiliCatalog` 移除旧 popup 包装，“我的栏目”仅保留在搜索弹窗内，不再重复提供入口。
- `biliSelectionFlow.biliPartSelection` 从原生返回的 `resolvedUrl`、CID、当前 P 与 episode 身份构造持久页面，手选分 P 优先于原输入 CID；不把本机临时视频/音轨代理写入片单、播放队列或关联偏好。关联视频单选；一起看保留多选和整部卡；一起听普通视频落为服务器既有 `bili:<BV>:<CID>` 合同，并按选择 P 的时长建立歌曲。
- 原生 Go 已返回 `resolvedUrl/cid/epId/seasonId`，本轮补全 TS DTO，无原生源改动。PGC 可用于一起看和关联视频；当前服务端音乐队列仅支持 BV/CID，一起听队列对 ep/ss 显示明确错误，不伪造番剧 BV。
- 共享选择器以服务器、账号和初始关联 URL 为作用域，隐藏/切换入口或曲目后卸载并使解析结果失效；异步完成不能继续添加旧选择。保留忙状态、多选失败项和搜索失败重试。
- `roomModes` 统一三个协议 ID 对应的名称及顺序 **一起看 → 投屏 → 一起听**。首页创建/列表、房间标题、房间设置和音乐账号菜单全部复用；创建房间补上投屏。WebRTC/推流仍是投屏内部的方式，不是额外房间模式。
- `RoomCommentButton` 提供右侧浮动入口。一起看/投屏评论与弹幕管理从固定聊天侧栏移到 `AppDialog`；侧栏保留片单/房间。一起听房间评论移出账号菜单，在普通页或全屏播放器所属 Modal 内展示；歌曲评论与播放队列仍保留全屏。纯净视频隐藏浮动入口。

验证：172 项 JS 测试、lint、类型检查通过；Expo Go Metro 与实际 RN Web 页面运行。三处共用表单、单一栏目入口、三种模式、一起看评论/弹幕管理、全屏房间评论开启/关闭已通过界面检查。390×844 / 844×390 / 768×1024 / 1366×1024 搜索列数为 1/3/2/3，搜索和评论弹窗、浮动按钮均在视口内，无横向溢出。使用隔离本机可丢弃数据，不能替代新 IPA 的本机 B站实片、有声播放、关联保存后的原生播放及后台/锁屏持续播放验收。


## 2026-10-13：build 18 用户反馈后的源码修复（待新 IPA 验收）

本轮版本仍为 **1.8.0 / 18**，未启动 EAS、未生成新 IPA、未推送或发布。现有 build 18 安装包不包含本段修复；下方构建/发布记录为此前状态。完整说明和复测清单见 [用户反馈修复记录](releases/ios-user-feedback-repairs-2026-10-13.md)。

- `Danmaku` / `danmakuLayout` 补 25%–100% 显示区域，旧偏好默认 70%；滚动及底部固定弹幕共用受限画布。
- `RoomPlayback` / `sources` 从权威影片及当前 P 恢复 B站身份，清除外设备音轨地址。`biliRoomProtocol` 将本机规范页面和网页可播放的服务器代理分开；`resolveSharedBili` 独立准备普通视频的跨端媒体，`movieId` 保留房主账号解析合同，暂停/seek 不被旧时钟覆盖；本机播放不等待服务器解析。播放诊断先解析实际媒体再探测，不对 B站页面或其他设备代理发 HEAD。
- `with-vlc-tracks.cjs` 的 `ZViewerDeferredSlaves` 将分离音轨推迟到 VLC 输入播放就绪，并按返回成功去重/失败后重试。必须通过 config plugin 重现，不以修改 node_modules 或生成的 ios 目录作为唯一来源；原生部分需要下一次授权构建及真机声音验证。
- 一起听搜索与个人栏目采用独立弹窗；评论/队列在全屏 Modal 内展示；歌单可返回原来源页。播放顺序图标采用用户四种参考形状，点击直接循环四种模式，不弹选择框。`biliGrid` 整数卡宽修复最后一列因像素舍入而换行。
- `VlcPlayer` 跟踪 seek 与自然停止，恢复 seek 的播放意图，显式暂停优先；`MusicPanel` 不把临时暂停广播为房间暂停，曲尾上限保留 0.25 秒。`roomConnection` 在已加入的一起听断线/重连期间保持播放器；`useSystemMedia` 在 loading 时同步拥有的 URI，房主同曲重连保留本机进度。离房、被踢、关房及错误仍释放播放器。

**166 项 JS 测试、类型检查、lint 通过**。实际 RN Web 测试确认四模式直接切换、评论/队列保留全屏、歌单返回、独立弹窗及断线不卸载；390×844 / 844×390 / 768×1024 / 1366×1024 搜索为 1/3/2/3 列且无横向溢出。测试用本机可丢弃数据，不能代替 B站跨端实片听音、后台持续播放、锁屏控制与原生 Modal 的新 IPA 真机验收。

更新日期：2026-10-13。指定修改和 Git 仓库为 `E:/Codex-bulid/ZViewer/ZViewer-client`，iOS 工程位于 `ZV-iOS/`。本轮源码与界面修复已验证，**1.8.0 / build 18** 未签名 IPA 已完成构建、离线检验并补充到现有 1.8.0 Release，源码同步 main。历史 **1.7.5 / build 17** 不包含本轮修复。构建检查与实际设备验收分别记录，详见 [1.8.0 验证记录](releases/ios-1.8.0-18-validation.md)。

## 2026-10-13：iOS 1.8.0 / build 18 构建与发布

本轮已按用户授权构建 IPA，并补充到既有 `client-v1.8.0` Release。源码 app.json/package/lockfile 同步为 1.8.0，buildNumber 为 18；旧 1.7.5 / build 17 仍是历史安装包，不能用于验收下述新修复。

番剧三种来源已采用独立搜索/选集弹窗，具备海报墙/列表、源切换、展开、多选/全选、整部确认及固定底栏；手机和平板横竖屏 2/3/3/4 列均无横向溢出。批量失败缓存提升到 SourcePicker，以稳定集数身份保留解析结果，并与 MovieAddTransaction 的已创建事务配合，签名 URL 变化及刷新失败不会让同一次重试重复添加。

播放修复涵盖聚合 HLS 上游基址和请求头、Emby/Jellyfin 切集乱序与同 URL 新集重载、房主恢复进度/暂停、过期状态回执、一起听精确曲目身份、旧播放器事件及 FM/推荐异步取消。159 项 JS 测试、lint、类型检查通过；当前 Go 审核来源为 `02f62f1fc52f0c47f2a2f8e6fec8ed22d98539fc` 的 12 个文件。

EAS 构建 `a0c5ca7e-dbd1-4e8f-a3fc-7b458b1402fd` 于 2026-10-13 12:10:05（北京时间）完成；`ZViewer-1.8.0-b18-unsigned.ipa` 为 47,308,388 字节。包内 1.8.0 / 18、ARM64 设备、VLC/LiveKit/系统媒体/本机 B站桥及来源清单检查通过，139 个 ZIP 项 CRC 正常。SHA-256 为 `b4485257ba0ec5b45d963f95c0c48294453cdbc0d86f2a858305ea1d833a68c8`，与构建机和 GitHub 公开下载一致；安装需自行签名。

完整范围、布局矩阵、发布回执及原生验收边界见 [1.8.0 / build 18 验证记录](releases/ios-1.8.0-18-validation.md)。原 APK/HAP 和标签 `534e537` 保留，三平台校验文件已更新；本轮源码提交 `0146c1f` 已推送 main，标签自动归档不包含后续 iOS 修复。Expo/浏览器、桌面 VLC 辅助和 IPA 离线检验不替代 iOS 真机验收。

## 2026-10-13：媒体添加错误与简洁搜索弹窗（源码预览）

### Jellyfin / Emby 弹窗进一步对齐

`MediaLibraryPicker` 对照共享双端 `EmbyBrowser` / `MoviePushPanel` 和用户截图，改为简洁挂载/播放方式面板与独立「浏览媒体库」弹窗。弹窗提供搜索、目录层级、展开/还原、列表/海报墙切换、多选/全选、底部固定取消和添加操作，选择高亮并显示数量。电影/目录海报保持 2:3 裁切，Episode 缩略图保持 16:9；宽度变化时海报墙按 1–4 列计算，标题完整换行。逐集批量添加与整部/整季卡确认继续沿用真实条目路径，成功清除选择，失败项保留供重试。整部/整季仅在直属下一层非空且全部为可播放影片时启用；含子目录、非影片或尚未核验时禁用，提交重新检查且不递归穿过目录添加。

播放方式默认服务器转发，可选择直链直连；仅在服务端返回 `directUrl` 时使用直连，否则转发并持久化 `directLink:false`。不会显示浏览器转码开关，iOS 仍使用 VLC 原生链路。107 项 JS 测试、lint、类型检查通过；浏览器检查四种视口的海报、按钮及目录/单片/多选/整季操作，使用本机可丢弃媒体库 fixture，不代表真实 NAS 或 iOS 解码验收。无新 IPA、无版本变更；旧 build 17 不包含本次界面。详情见 [媒体库弹窗预览记录](releases/ios-library-dialog-preview-2026-10-13.md)。

- `cancellation.ts/checkAbort` 替代所有生产调用中的 `signal.throwIfAborted()`。RN 0.86.3 实际安装的 AbortController 缺少后者，造成 Jellyfin/Emby、番剧源和私人漫游共有的 `undefined is not a function`。105 项 JS 测试使用该实际信号实现验证业务与取消；类型检查、lint 通过。
- `mediaLibrary.ts/addLibraryEntry` 验证双媒体库单集与整季，`animeSources.ts/addAnimeEpisode` 保留 HLS 请求头并避免服务端 API 重复代理，`personalFm.ts/queueFmSong` 从恢复后的队列选取真实歌曲身份。可丢弃本机测试房间验证 Jellyfin/Emby 添加成功、片单更新和反馈；未连接 NAS 改动容器。
- 共享 Go `resolver.go` 仅展开对象形状的 `data.result`，避免将 UGC 的 `result:"suee"` 状态字符串误当作 PGC envelope。用户视频 `BV1UHpw6LESy` 经真实匿名元数据/playurl 和生产解析器检查成功，CID 42512224146、第 1 P、qn 32、AAC；nav 模拟匿名状态，未使用个人 Cookie或执行 iPhone 解码。11 项 Go 回归通过。
- 添加弹窗保留来源、链接/搜索、解析与紧凑账号卡，画质折叠。独立搜索弹窗支持展开/还原；普通视频/番剧/影视改为选择器，个人栏目折叠。目录桥增加 WBI view 元数据，单 P 卡片点击直接解析、添加并请求播放，多 P 点击选集即完成操作；展示进度、保留失败链接与重试，并复用已创建条目避免重复添加。
- `biliCatalog.ts` 规范搜索封面和 DTO；`SourcePoster` 用 `Image.getSize` 读取原始比例，横、竖、方封面均按宽度自适应高度。实际浏览器手机竖/横屏 390×844 / 844×390 为 1/3 列，平板竖/横屏 768×1024 / 1366×1024 为 2/3 列；12 卡片无越界、比例误差小于 0.000004。预览使用几何测试封面，iOS 原生 Modal 与真实图片仍待设备检查。

原生桥与 Go 修改不能通过 Expo 热更新进入旧 IPA。新安装包构建仍需用户明确授权；设备媒体解码、网易云账号歌曲权限与 LiveKit 跨端互听继续单独验收。共享 Go 审核引用及摘要随本地源码提交更新，`stage-native-core.cjs --verify-only` 只检查来源，不消耗 EAS 额度。

## 2026-10-12：1.7.5 / build 17 原生验证与 IPA

- EAS 构建 `89ddf07c-5855-46dd-b40b-6d09e58843aa` 完成，设备 Release IPA 位于 `ZV-iOS/release-assets/ZViewer-1.7.5-b17-unsigned.ipa`，47,277,098 字节。包内版本 1.7.5 / 17、设备 platform IOS、ARM64、iPhone/iPad、最低 iOS 16.4，内置 Release JS、VLCKit 与 LiveKitWebRTC。
- 本机 SHA-256 与 macOS 构建机一致：`cfa4bd0478892f6ba21af4154c020eef3e75d7f52258e36a81615ede74a51302`。包内无主应用签名、无 provisioning profile；沿用个人签名侧载流程。
- `LivekitReactNativeModule`、`WebRTCModule`、`LiveKitExpoAppDelegate` 和本机 B站桥均已进入可执行文件；构建检查强制核对 LiveKit RN/WebRTC Pods 版本，并拒绝另一套 react-native-webrtc Pod。包中仅有 LiveKitWebRTC 内核。
- 修正 Go WBI 重排表、空格编码/特殊字符过滤与原生中文搜索编码。B站匿名公开视频信息及中文搜索实测成功，macOS 执行实际 Objective-C 中文签名测试成功，普通视频/DASH/AAC/分 P 与番剧协议测试通过。
- LiveKit 对照当前服务端 token/mute/kick 合同，SDK 自动订阅、默认静音、麦克风授权及后台/禁言/离房竞态保护成立；进出房音频生命周期串行，VLC 不覆盖语音会话。这里只确认代码、协议和构建可行性，跨端互听与真机会员正片尚未验收。
- 原生 Go 来源固定为 `a8abd646e0071a0708a4614e18d9d6cc31389f70` 的 12 文件清单，包内 provenance 和 source-manifest 与审核基线一致；阶段脚本拒绝生产源码增删或哈希漂移。检查工具 `scripts/inspect-unsigned-ipa.py` 使用当前审核基线，避免沿用旧版 9 文件断言。

完整历史证据见 [IPA 检验 JSON](releases/ios-1.7.5-17-ipa-inspection.json) 和 [构建验证 JSON](releases/ios-1.7.5-17-validation.json)。这些构建与协议检查没有覆盖 10 月 13 日报告的 RN 信号缺失和真实 UGC 状态字符串；下方预览及 build 12/15/16 记录亦为历史状态，不能替代设备验收。

## 2026-10-12：下一版源码与 Expo 预览

- 界面保留现有 RN 导航、主题、房间页签及 VLC 控件，入口名称/选集/片单行为对齐双端。长片名完整换行，来源菜单滚动且受屏幕宽度约束。
- `MediaLibraryPicker` / `mediaLibrary.ts` 提供 Emby/Jellyfin 搜索、目录、逐集多选和整部/整季卡；`MovieSourceSettings` 根据真实 page.path/mountId 切集，根据服务端 MediaSourceId 切版本。房间持久化代理流为 movieId 身份，观众不依赖房主自己的挂载。
- `SourcePoster` 外站直连失败后用服务端图片代理；媒体库图仅对选定服务器发送认证请求，再交给 Image 受限 data URI。取消旧请求，不把凭据放进图片 URL。
- PGC 支持 ep/ss 输入、搜索番剧/影视、结果内选 P、整部多 P 卡及原生 ep/season/page/cid 桥接。cliOnly/PGC 在服务端回退前门控；每台设备独立登录和解析。服务器创建接口不物化 cliOnly 时，客户端按已有 PUT 合同补写该标记。
- `canClearMovies` 区分 root/创建房间的 admin 与实时 host，清空二次确认、单次 DELETE、广播/权威刷新，current-movie null 立即暂停并停源。`useRoomPermissions` 的观众切片按公开权限矩阵走 play-movie Socket，观众不广播房主状态；排序和 REST 编辑权限另行判断。
- 自动续播设置按服务器/账号/房间保存，房主读最新片单切下一条，末项停播。网易云 401 不清本站会话；补 Cookie 登录/主动复制、默认来源页、B站队列末尾推荐续播与一起听房间讨论，保留 FM/回执规则。
- 本地弹幕补 dandanplay/protobuf JSON、5 MiB UTF-8 / 20000 条限制及请求体检查；在线连续添加不关面板，已添加标记来自房间实际轨道。PGS 同步保留经 PNG 签名/尺寸/坐标/总量校验的 bitmap，在视频内容画布比例内显示，仍与原生字幕互斥。
- 连接页增加自动/自定义完整 URL。新的 `serverProbe` 使用 Go 的无凭据探测；仅 tls_unavailable 明文证据且同端口 HTTP 确认成功时回退，证书错误不降级。旧包/Expo Go 无桥时只做 HTTPS 探测，并允许明确填写完整 HTTP 地址。Socket.IO 使用 origin + 显式 prefix/socket.io 传输路径，避免把路径前缀误当 namespace。

LiveKit 固定 `@livekit/react-native` 3.0.0、`@livekit/react-native-webrtc` 144.2.0、插件 1.0.3、`livekit-client` 2.22.3。ScreenShare 同步使用该 WebRTC 包，依赖树移除原 `react-native-webrtc`。新 `voicePermission` / `voiceSessionActive` 桥负责许可及 VLC 音频会话共存标记，不启动旧语音采集。Expo Go/旧开发包缺少新模块时仍可打开界面。

自签证书例外的完整 REST/Socket/Image/VLC 传输通道、原生音频中断与跨端听音、媒体库真实 HLS/Range/seek、PGC 会员正片、VLC ASS/PGS 本机解码、后台独立业务 Socket 尚未完成本轮设备验收。证书例外通道和后台 Socket 仍为独立待实施项。源码和 JS bundle 检查不替代原生构建及设备验证。

## 1. 工程与运行边界

Expo SDK 57、React 19.2.3、React Native 0.86.3、Expo Router；最低 iOS 16.4，bundle `com.zviewer.mobile`，支持 iPhone/iPad。`app.json` 和 config plugins 管理原生配置；`ios/` 为 CNG 生成目录，禁止把临时生成目录或 node_modules 中的手工修改作为唯一修复来源。

| 层 | 主要文件 | 职责 |
| --- | --- | --- |
| 入口/导航 | `src/app/_layout.tsx`、`src/app/index.tsx` | Provider、登录/游客、房间列表、全局外观 |
| 会话 | `src/state/session.tsx`、`src/lib/sessionLease.ts`、`src/lib/socket.ts` | 凭据恢复、HTTP/刷新令牌、业务 Socket、过期请求隔离 |
| 外观 | `src/state/appearance.tsx`、`src/lib/appearancePreferences.ts`、`Surface.tsx` | 深浅主题、背景、字体和透明度；普通偏好保存为文件 |
| 房间 | `src/app/room/[roomId].tsx`、`roomPlayback.ts`、`useWatchControl.ts` | 入房/房主/观众、片源状态组合、审批、心跳、方向/全屏 |
| 播放 | `VlcVideo.tsx`、`vlcPlayer.ts`、`mediaAdapter.ts`、`media.ts` | 单一 VLC 内核、原生控制端口、串行换源、私有鉴权 URL、秒/毫秒转换 |
| 片源 | `SourcePicker.tsx`、`MoviePanel.tsx`、`sources.ts`、`biliSelection.ts` | 添加/管理影片、目录与选集、分享链接规范化 |
| B 站 | `biliNative.ts`、`biliSelection.ts`、`BiliAccount.tsx`、`BiliMovieSettings.tsx` | 原生登录/本机解析、服务端回退、分 P/CID、单影片策略 |
| 字幕/弹幕 | `PlaybackControls.tsx`、`Subtitles.tsx`、`subtitleParser.ts`、`subtitleSync.ts`、`Danmaku.tsx`、`DanmakuManager.tsx` | 播放设置页签、原生字幕选择、文本字幕同步、弹幕导入/显示 |
| 一起听 | `MusicPanel.tsx`、`musicSyncReceipt.ts`、`MusicLibrary.tsx`、`musicCollection.ts`、`personalFm.ts`、`usePersonalFm.ts` | 音乐发现/队列/歌词、完整歌单、持续漫游、同步回执 |
| 系统媒体 | `useSystemMedia.ts`、`modules/zviewer-native/ios/ZVSystemMedia.swift` | 锁屏/控制中心信息及操作、原生 VLC 通知桥 |
| 语音/投屏 | `VoicePanel.tsx`、`livekitProtocol.ts`、`ScreenShare.tsx` | LiveKit token/identity、管理 REST、共享 WebRTC SDK 和 OBS 流媒体 |

Expo Go 和 Web 仅用于界面/业务验证，不包含 VLC、本机 B 站或自定义语音模块；不能用预览中的“原生模块不可用”代表安装包解码失败。

## 2. 会话、片源和鉴权

- 登录/刷新凭据使用 SecureStore；恢复时并行读取并限制超时，联网验证后台进行。`SessionLease` 防止退出或更换账号后旧请求恢复旧会话，凭据写入串行化。
- `RoomPlayback` 组合播放状态、当前影片和片单的独立事件，等待权威影片 ID/CID 后才采用 B 站地址；不把其他设备的 127.0.0.1 CLI 代理地址交给本机 VLC。
- `nativeVideoSource` 保留服务端路径前缀，以本机 access token 生成播放 URL，房间中保存和广播的地址不含该私有 token。普通媒体拒绝用户名密码、非 HTTP(S) 和跨设备 loopback 地址；不转发固定 Range。
- `NativeMediaAdapter` 串行替换媒体，丢弃过期解析任务；鉴权更新保留同一媒体的位置，普通状态更新不会反复 seek 到旧广播时间。
- B 站 Cookie 留在原生 Keychain，JS 只获取状态和当前原生服务签发的随机端口/能力路径。各设备独立解析；本机与服务器 DASH 策略区分处理，解析/账号/画质缓存有作用域和失效控制。

## 3. 播放与轨道

`VlcPlayer` 将 VLC 毫秒转换为房间秒数。每次换源使用 revision，旧原生回调不影响新影片。首播准备期间保留请求的起播/暂停/seek 意图；播放器组件释放时停止旧视图。

轨道 ID 是当前 VLC 媒体中的轨道索引，换片时清空，禁止跨影片复用。`mediaSettings.tracks` 记录明确的本机选择；`selectedTracks` 在没有明确选择时读取原生 `selected` 标记。`settingsChange` 通知设置面板，选择字幕/音轨不需要等待下一个进度事件才刷新。音量保留本机偏好，字幕地址/延迟随换源清空。

`plugins/with-vlc-tracks.cjs` 在 iOS prebuild 修补固定版本的 expo-libvlc-player：

1. Swift `Tracks` 的 audio/video/subtitle 字段改为可选，缺省值不再隐式选择 0 号轨道。
2. 明确选择某条轨道前取消同类型旧选择；加载已选中的外部字幕 slave 前取消旧字幕，避免 VLC 4 同时叠加多个字幕轨道。
3. `MediaTrack` 返回实际 `selected` 状态，包括关闭轨道；首播及播放进度回调更新轨道状态，JS 对相同轨道列表去重，不重复触发 `sourceLoad`。
4. 补丁包含标记并可重复执行。升级 expo-libvlc-player/VLCKit 时必须复查 Swift 记录类型、选择 API 和替换位置，再进行原生编译及真机测试。

其他原生集成：`with-system-media.cjs` 桥接系统媒体操作/进度和后台所有权，`with-voice-audio.cjs` 维护语音拥有的音频会话；二者仍需与新的轨道补丁一起执行。

## 4. 字幕和播放设置

视频内的齿轮打开统一“播放设置”，包含 **播放 / 字幕 / 弹幕** 页签：

- 播放：画中画、倍速、本机音量、音轨；选中项有主题色高亮和勾号。
- 字幕：内嵌轨道、关闭字幕、外部 SRT/ASS/VTT 地址及原生延迟、导入/同步字幕和同步字幕样式。片下独立“字幕管理”按钮已移除，全屏也可访问同一设置。
- 弹幕：开关、字号、区域/样式相关控件及轨道导入/管理。房间聊天栏中的弹幕功能继续可用。

必须保证单一字幕渲染器：选择原生轨道或外部字幕会关闭 React Native 同步字幕层；开启有效同步字幕会取消原生字幕并清除外部地址，房主本地修改和观众收到更新均执行此规则。关闭字幕不重复列出 VLC 的 Disable 项。

复杂 ASS 的矢量、字体、定位和特效应由 VLC 原生内嵌/外部字幕渲染。`subtitleParser` 加 `SubtitleOverlay` 是简化文本同步路径，不是完整 libass 实现；经房间传输的 ParsedCue 不含原始 ASS 脚本及字体，不能承诺复杂 ASS 同步后的特效完全一致。

## 5. 一起听同步

房主发送 `music:sync-state` 和 `music:host-heartbeat`；观众应用状态并在漂移超过阈值时校正进度。`music:sync-ack` 仅表示一次曲目同步完成，不表示每次心跳。

build 16 的 `MusicSyncReceipt` 按服务器、用户、房间、Socket 连接 ID、trackKey 隔离回执；曲目准备完成且当前媒体身份匹配后发送一次。重复心跳、暂停/恢复、seek、同曲重试不连续发送；切歌、清空曲目、断线重连或重新加入时允许新的回执。解析或播放器错误、尚未就绪、房主自己不会发送“已同步”。

音乐库通过受控服务端接口访问网易云；完整歌单预加载后逐首等待入队确认，取消/失败不会误称全部完成。私人漫游在候选不足时持续补充，切账号、场景或停止后取消旧请求。歌词按歌曲和账号作用域缓存。

## 6. 原生模块和后台边界

本地 Expo Module 位于 `modules/zviewer-native/ios/`：

- `ZViewerNativeModule.swift`：JS/原生接口。
- `ZVBiliBridge`：共享 Go B 站实现的 ARM64 XCFramework 桥接。
- 房间语音已改为 LiveKit RN：`/api/voice/token` 返回 URL/token，`/mute`、`/kick` 管理 identity，SDK 负责轨道与重连。旧 `ZVVoiceCodec` 和原生兼容引擎暂留构建链，但当前房间页面不再调用旧 PCM/Opus Socket 媒体流；后续原生验证后再独立移除。加入只听，主动开启麦克风才请求权限；管理员解禁不自动打开用户关闭的麦克风。
- `ZVSystemMedia.swift`：Now Playing、远程控制及命令队列。`UIBackgroundModes` 包含 audio。

系统媒体控件/后台音频声明不等于 JS 完全挂起时房间业务持续运行。独立原生业务 Socket（旧计划 I13）的长期心跳、切歌/审批仍未闭环；蓝牙、来电、后台、弱网及 Android/鸿蒙互通需要设备矩阵验证。本轮没有扩大此前 UI 验收为完整音视频/语音验收。

## 7. 构建与本地提交

在 `ZViewer-client/ZV-iOS` 执行：

```powershell
npm run lint
npm run typecheck
npm test
npx expo export --platform ios --output-dir .expo-export-test/b18-ios
npx expo export --platform web --output-dir .expo-export-test/b18-web
node scripts/check-playback-settings-ui.cjs
python scripts/check-ass-media.py "E:/Codex-bulid/ZViewer/TEST视频/败犬女主太多了！ - S01E02 - 第2集.mkv"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-ios-unsigned.ps1
```

`unsigned-device` 是当前可复现的设备构建 profile。构建脚本在本仓库按 `scripts/native-core-baseline.json` 暂存 12 个共享 Go 来源/模块/许可文件及摘要；基线锁定 `02f62f1fc52f0c47f2a2f8e6fec8ed22d98539fc`，逐文件哈希、Git 内容及文件清单均必须一致。`--verify-only` 只验证来源，不构建；macOS EAS worker 校验固定 Go/Opus 下载摘要，构建 Bilicore/Opus 并执行编解码 smoke，CNG 应用 config plugins，安装 Pods 后以 iphoneos ARM64 Release 构建并打包内置 JS 的未签名 IPA。旧 simulator/development profile 没有相同 vendor 准备步骤，不能直接当作已可用的设备构建替代品。`.easignore` 排除历史 `.expo-export-test` 目录，保留本次校验生成的 `.native-staging`。

```powershell
python scripts/inspect-unsigned-ipa.py <IPA绝对路径>
```

离线检查要求 iOS 设备 Mach-O、VLC/LiveKit/原生桥接/系统媒体、共享来源摘要、依赖许可证和内置 JS；拒绝误交模拟器包或带意外签名/描述文件的包。另需断言目标版本/build/bundleId、全 ZIP CRC 和 SHA-256。IPA 需用户自行签名后安装。本次记录见 [iOS 1.8.0 / build 18](releases/ios-1.8.0-18-validation.md)；[历史 1.5.1 说明](releases/ios-1.5.1-release-notes.md) 复用 build 16 的行为不适用于本次。每次构建交付后只在指定 `ZViewer-client` 仓库本地 commit，保留其他未跟踪资产。

## 8. 2026-10-03 截图反馈对应修复

| 反馈 | 定位和修复 | 验证 |
| --- | --- | --- |
| 音轨/字幕缺少高亮 | `RoomButton.selected`、原生 selected 回报、`settingsChange` 驱动 UI | 默认轨道/本机选择/换片清理单测；设置页签/倍速可视高亮 Web 检查 |
| 一起听连续“已同步” | 移除每次 adapter.apply 后的无条件回执，改用曲目/连接回执门控 | 30 次重复心跳、未就绪、旧曲迟到、切歌、重连的单测 |
| 两张同步观影 Invalid URL | `biliSelection` 提取完整分享文本中的 HTTP(S) 地址，保留分 P/CID；片单恢复、添加、本机/服务端解析统一处理 | 两个截图链接、BV、b23.tv、标题/标点、权威 CID、非法地址和既有鉴权规范化回归 |
| 字幕管理位置 | 统一播放设置页签，全屏仍可访问 | iPad 横屏/竖屏、iPhone 共 18 项检查，0 JS 异常 |
| ASS 特效旁的额外纯文本 | 原生轨道可选缺省/互斥选择、同步字幕层与原生渲染互斥 | 指定真实 MKV 的轨道/字体/ASS 内容和本地 Range/seek 检查；最终视觉效果待 iOS 真机复验 |

本轮自动验证：**74/74 单测**、lint/typecheck、iOS/Web 导出通过；播放设置 Web **18/18**（1180×820、820×1180、390×844 及全屏），已人工查看截图。Web 预览缺少原生轨道，不将 Web 中的倍速高亮检查等同于真机音轨/字幕高亮验收。

指定 MKV 长 1441.117 秒，HEVC/Opus，简日/繁日两条 ASS，26 个内嵌字体附件；每轨 2597 条 Dialogue、1775 个定位标签、1308 个绘图标签。桌面 libVLC 3 经本地 8 MiB 上限 Range 服务完成两字幕切换/关闭/恢复，以及 55/120/700/1300 秒 seek（15 个 206 请求）。这些是实际文件的解码/读取辅助证据，**不证明 iOS VLCKit 4 的重复字幕已经视觉验收**。

真机优先复验：播放该 MKV，切简日→繁日→关闭→简日，确认每次只有一个高亮项且特效保留、屏幕边缘无额外纯文本；再开启同步字幕、切回内嵌字幕，检查互斥。使用两个原分享文本对应影片测试观众晚加入/暂停/seek/重连；一起听保持同曲至少一分钟，房主每个观众仅收到一次同步提示，切歌或重连允许新提示。横竖屏和全屏均测试设置关闭/重开。

### build 16 交付记录

EAS：[1.5.0 / build 16](https://expo.dev/accounts/YOUR_ACCOUNT/projects/zviewer-ios/builds/a7973a7c-db58-437a-8957-81b05a759250)。状态 **FINISHED**，已下载并通过离线包检查。版本 **1.5.0 / 16**、bundle `com.zviewer.mobile`、iOS device ARM64、未签名/未加密、iPhone/iPad、最低 iOS 16.4，包含 VLC、自定义原生桥接、系统媒体及内置 JS（3,198,491 bytes）。检查到本轮播放设置/轨道/回执相关 JS 标记。

- 本地包：`ZV-iOS/release-assets/ZViewer-iOS-1.5.0-build16-unsigned.ipa`
- 大小：45,094,781 bytes。
- SHA-256：`1220bdd48cf9308eb98d2b71b32e95c365c8d3cfe312bdbb25ab92b0e3e28ac7`。
- [下载未签名 IPA](https://expo.dev/artifacts/eas/J-Bb1K9O9sMcYsQ2mRrnqzPN2Cq1GVDOJfOzyzmE9jM.ipa)；[离线检查 JSON](releases/ios-1.5.0-16-ipa-inspection.json)。
- 三尺寸布局和同步字幕→原生外部字幕→同步字幕切换 **18/18** Web 检查通过；本轮独立后端、Web 服务、VLC Range 服务均已关闭。
- 源码和维护文档本地提交主题：`fix(ios): resolve screenshot playback and sync issues`。完整哈希从本仓库对应 Git 记录获取。

安装需要自行签名；本轮未进行 iOS 真机视觉/音频复验，特别是 ASS 特效与边缘文本、原生音轨/字幕高亮、跨端真实听歌回执仍需按上述真机步骤复测。

本轮记录：[build 16 验证证据](releases/ios-1.5.0-16-validation.json)。既有 build 15 的发布/安装信息见 [build 15 交付记录](releases/ios-1.5.0-15-unsigned.md)。Expo API 与构建方式按 [SDK 57 文档](https://docs.expo.dev/versions/v57.0.0/)、[config mods](https://docs.expo.dev/config-plugins/mods/) 和 [EAS Build](https://docs.expo.dev/build/introduction/) 核对。

## 2026-10-13 目录片源弹窗对齐（Expo 预览）

OpenList、FTP、WebDAV、服务器文件统一使用 `ZV-iOS/src/components/DirectoryPicker.tsx`。添加影片面板仅保留空间/挂载选择、浏览、手动路径与添加；目录在独立 `AppDialog` 中打开，可展开/还原。弹窗包含上级目录、当前目录、路径、空间切换及多选；固定底栏显示选择数量、成功/失败反馈、取消和添加。内容宽度不足 600 时两栏上下排列，宽屏并排；长文件名允许完整换行。

`ZV-iOS/src/lib/directorySources.ts` 集中 roots、browse、resolve 和批量添加协议。挂载保留 `mountId`、`serverUrl`、原始文件 `path` 与 `directLink:false`；服务器文件保留 `uploads:/` 或 `custom:N:/` 前缀，手动路径绑定当前空间。父目录不能越出配置根目录，目录不作为文件添加。切换目录/空间清空选择，批量部分失败只移除成功项，失败项保留供重试。请求使用 RN 兼容的 `checkAbort`，卸载取消旧请求；刷新空间列表后，已打开弹窗会重新读取根目录。

本轮 lint、typecheck 和 **114/114 测试**通过。隔离本机接口中实际操作了四种来源的浏览/单文件添加、服务器文件的空间切换/目录进入/单个与批量添加/手动路径，以及弹窗展开/还原。390×844、844×390、768×1024、1366×1024 的页面检查确认横向无溢出、固定底栏在视口内；手机竖屏堆叠，其他尺寸并排。横屏高度较小时目录内容滚动。

这是源码和 Expo UI 预览验证，未启动 EAS/IPA 构建，未改变原生模块/共享 Go 来源。隔离测试数据不证明真实挂载、原生 VLC 播放或 iOS 安全区/键盘的设备验收。详细记录见 [目录弹窗验证说明](releases/ios-directory-dialog-preview-2026-10-13.md)。

## 9. iOS 1.5.1 发布（2026-10-03）

- 独立 iOS Release/标签：[ios-v1.5.1](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/ios-v1.5.1)。源码 app.json、package.json 和 package-lock.json 版本同步为 1.5.1；构建号保留 16，本轮没有构建新的 IPA。
- 发布附件保留真实安装包文件名 `ZViewer-iOS-1.5.0-build16-unsigned.ipa`，内部版本 **1.5.0 / 16**，SHA-256 与上节一致。Release 说明在开头明确版本差异；附件仍需自行签名。
- 源码 ZIP 由发布标签对应的已提交源码生成，包含本轮 iOS 修复、维护文档及 vendor/mediabunny，排除未跟踪模板文件、构建缓存和私有凭据。
- 附件包含 IPA、源码 ZIP、原始 build 16 IPA 检查/验证 JSON 和本次发布 SHA256SUMS。使用既有 74 单测、18 Web 检查及真实 MKV 辅助验证证据；不新增真机验收结论。
