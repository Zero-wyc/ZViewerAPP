# iOS 继续开发与验收文档

**2026-10-02 补充预览：** 歌单全部播放/全部加入、持续私人漫游、在线弹幕弹窗与双列集标签、实际高度/宽度的横竖菜单切换、音乐首页和日推历史日期已实现，见 [本轮记录](releases/ios-1.5.0-15-followup-preview.md)。用户反馈竖屏展开可用，转横屏越界的明确宽度修复待设备复验。69 项单测、新增 Web 46 项、原房间 59 项、播放页 31 项与 Yoga 24 种布局通过；没有新 IPA 或 EAS Build/Update。保留原 I13 等未闭环项目。

**当前：1.5.0 / b15 源码 Expo Go 界面预览，未构建新 IPA。** 用户反馈早期 b14 房间仅有聊天侧栏、视频和音乐区域缺失，并要求避免继续消耗 EAS 免费构建额度。本轮对齐全局主题、默认背景、首页/大厅、房间/竖屏下方面板、紧凑片单/集中选集、音乐与设置弹窗，先使用 [Expo Go 预览记录](releases/ios-1.5.0-15-preview.md) 验收界面。待中的 b14 构建 `95eec7cf…` 已取消；早期已完成 b14 包未包含这些修复，不能用于本次验收。未经用户确认界面及再次构建，不调用 EAS Build。原 I01～I17 及硬件限制完整保留；后续修复覆盖计划的内容已[归档](releases/ios-openscreen-user-repair-2026-10-02.md)。

**上一轮集中交付：iOS 1.5.0 / build 13 unsigned，2026-10-02。** 按用户“尽可能多的功能完成后再验收”要求完成本轮实现、官方 v4.2.1 隔离验证、设备 Release 构建与 IPA 核对。详见 [b13 交付记录及 I01～I17 状态](releases/ios-1.5.0-13-unsigned.md) 和 [脱敏证据](releases/ios-1.5.0-13-evidence.json)。以下开头关于 b12 的“当前”保留为原历史记录；后续修复转为 b15 源码预览，未交付 b15 新包。I13 后台独立 Socket 心跳/切歌/审批尚未闭环，其余真机矩阵待用户，不能宣称已完整对齐双端。

更新：2026-10-02。工程：`ZV-iOS/`。已交付基线仍为 iOS 1.2.1 / build 12、服务端 v4.2.0；**后续开发必须对齐 client 1.5.0 / 150 的 Android/HarmonyOS 产品行为，服务端协议目标仍为 v4.2.1**。客户端版本与服务端版本分开记录，保留 RN + VLC 架构。

**对照基线固定为 client-v1.5.0，提交 `1ca96fd46963ff5cb89beb6c3d31e1d7b9f501fc`。** 最初核对时本地程序仍为 1.3.0、维护文档已在 5083d4b 更新；按用户补充要求，本轮已将 1.5.0 共享前端和 Android/HarmonyOS 源码同步到指定 ZViewer-client 仓库并完成本地构建验证。iOS 程序与 b12 交付证据保留，未新增 iOS 包或真机验收。见 [本地同步与验证](client-1.5.0-local-sync-2026-10-02.md)。第 1～6 节是 b12 历史记录，第 7～10 节是对齐 1.5.0 的执行计划；旧节中的“本轮/本版”均指 b12。

**当前交付：1.2.1 / build 12 unsigned。** 用户已反馈上一轮包的视频播放、B站扫码、番剧播放和挂载视频播放正常；同时反馈自动起播、全屏、旋转及 Android 界面对齐问题。本版已修正对应客户端链路，**新版真机复验待完成**。语音和本机 B站 CLI 已实现并编入包，编译和 fixture 不能代替麦克风/跨端运行验收。

## 1. b12 交付决策（历史基线）

- 独立 Expo/RN；单一 VLCKit 文件/音乐/HTTP-FLV 内核，NativeMediaAdapter → VlcPlayer → VlcVideo。WebRTC 仅接收原有实时共享。
- 客户端适配 v4.2.0，保留 8 MiB Range 上限，不引入默认转码/HLS；本轮正式服务端无交付改动，共享 Go 实现及其他客户端未修改。
- 只连接隔离的本地服务及指定的 S01E01.mkv / S01E04.mp4；本轮未连接 NAS。
- 按用户最新要求仅交付未签名 ARM64 Release，由用户自行签名/安装/测试；不使用所提供的证书签名本版。内置 JS，不用 Expo Go/Metro。
- 已打开离线 Android 平板虚拟机，连接隔离的本地服务，核对一起看及一起听。采用相同深灰/绿色、图标导航、聊天分区、可收起侧栏、网易云折叠菜单及居中音乐播放条；窄屏侧栏使用抽屉。
- iPad 设置 requireFullScreen，使系统方向锁生效；本版关闭 iPad Split View。旋转只切换方向，全屏单独进入/退出并恢复之前方向策略，不重新挂载 VLC。

参考：[Expo 规范](../ZV-iOS/AGENTS.md)、[README](../ZV-iOS/README.md)、[b12 交付证据](releases/ios-1.2.1-12-unsigned.md)、[b11 历史交付](releases/ios-1.2.1-11-unsigned.md)、[b9 历史交付](releases/ios-1.2.1-9-unsigned.md)、[历史单内核基线](releases/ios-1.2.1-2-vlc.md)。缺失的历史外部手册不作为当前证据。

## 2. b12 已实现和待验证

| 阶段/项目 | 已实现 | 当前证据 | 有待测试验证 |
| --- | --- | --- | --- |
| 工程/连接 | SDK57.0.26、RN0.86.3、React19.2.3；地址/账号/游客/SecureStore/刷新/换服务器 | 单测、本地登录、JS 导出、设备编译 | 安装/启动/升级、HTTP 局域网权限、过期/后台恢复 |
| P0 单内核/同步 | VLC 串行切源/seek/倍速/心跳、令牌轮换保进度、旧回调隔离、分离音轨/释放；保存初始化前播放意图、加载期不广播错误暂停 | 35 项单测含早期起播回归；用户反馈上一轮视频正常 | **b12 自动起播复验**；iOS MKV/MP4/HLS 十分钟、短206续读、seek/取消、分离轨、跨端同步/流量 |
| P1 房间/权限 | 列表/创建/加入/审批/密码/离开/关闭、房主恢复/转交、成员事件、禁言/踢出/管理员、名称/模式/加入条件 | 37 项本地 UI、真实 Socket 事件 | Android 同房全权限、断线/重连/已有名单恢复、失败提示 |
| P1 布局/系统 | 安卓参考布局；播放条覆盖在视频内；全屏移除外层安全区/留白及房间 UI；旋转与全屏分离，退出恢复；VLC PiP/后台配置 | Android 虚拟机截图对照；三尺寸全屏填满和无横向溢出，零 JS 异常 | **iPad/iPhone 全屏/旋转/控件及视频比例复验**；大字体/键盘、安全区、PiP/耳机/蓝牙/来电；Split View 本版关闭 |
| P2 片单/来源 | CRUD/排序/选片/直链/服务器文件；WebDAV/FTP/OpenList/Emby/Jellyfin 挂载 CRUD/测试/账号字段；AniSubs/旧番剧/Kazumi | 用户反馈番剧和挂载视频正常；本地文件 UI；7 项 DAV 流程 | 其余真实挂载/媒体/账号、不同番剧解析、切源/跨端 |
| P2 字幕 | 内置/外部 URI/延迟；SRT/ASS/VTT/SMI/SUB 导入；房间同步、轨道/基础样式/偏好 | 解析/边界单测；真实 subtitle-update/request 权限与缓存 | MKV/鉴权/延迟/旋转；复杂 ASS 特效用 VLC 原文件，RN 层不完整复刻 |
| P2 弹幕 | 实时/轨道、暂停/seek/滚动/顶底/上限/偏好；XML/JSON 导入/编辑/偏移/隐藏/删除/在线搜索 | 时间轴/导入单测；实际服务端持久化/广播 | 碰撞/密度/性能、大文件/在线来源、Android 对照 |
| P3 一起听 | 安卓参考网易云/哔哩导航、我的音乐登录页、居中底部播放条、队列及歌词面板；原 VLC/队列/同步/审批/循环；正确读取原始登录状态 DTO、扫码后刷新歌单、退出恢复登录页；菜单锚定按钮下方 | 真实本地登录状态/退出；扫码及上游歌单 fixture；真后端队列增删/广播 | **新版样式真机对照**；真实网易云扫码/VIP/歌单/歌词、后台/拖动/循环、Android 同步 |
| P3 房间语音 | AVAudioEngine/回声处理、Opus48kHz单声道20ms/32kbps、PCM 接收；主/媒体 Socket、静音/禁言/踢出、有限缓存/重连/释放；收起继续 | Opus host 编解码检查、原生编译、16 项真实协议（合成包） | **麦克风/扬声器/回声/延迟**、蓝牙/来电/后台/弱网、Android/鸿蒙双向 |
| P3 共享观看 | 原有 offer/answer/ICE/viewer-ready、重连/释放；OBS HTTP-FLV → VLC | 页面降级、WebRTC/VLC 编译 | 真实桌面画面/声音、NAT/ICE/弱网恢复，两路径分别验收 |
| P4 本机 B站 CLI | 共享 Go → ARM64 XCFramework → 本地 Expo Module；QR/Keychain、目录/分P/歌词；普通最高有权画质/设备能力、排除HDR/杜比、720p/480p有限回退 | 用户反馈B站可扫码；Go 编译、边界单测、IPA 桥接类 | 账号持久化/退出、不同 CDN/高画质/HEVC/分离轨/分P、过期/回退、音乐 |
| P5 设备交付 | 无凭据 workflow/CNG/iphoneos ARM64 Release/内置JS/未签名IPA、构建及检查脚本/许可证 | EAS FINISHED、Mach-O/桥接/框架/JS/SHA 检查 | 用户签名安装及真机结论；TestFlight/商店未进行 |

房间已拆分播放器、来源/片单、房间设置、字幕弹幕、音乐、语音、共享组件。普通 URL 继续拒绝 loopback/用户名密码；本机代理只接受原生当前会话签发的随机端口/能力路径。Cookie 留在原生 Keychain，不跨 JS；房间只广播 BV 原地址，各端独立解析。

### b12 本次反馈修正

- 用户在上一版反馈：网易云下拉菜单未对齐；横屏点击添加片源后持续旋转。两项未标为真机通过。
- 菜单由固定音乐区域左上角改为按钮内的相对定位，跟随横竖屏、侧栏和内容宽度重新布局；选择菜单项关闭菜单。
- SourcePicker 漏配 Modal 横屏方向，原生默认竖屏与房间横屏锁存在配置冲突；现在显式 fullScreen，允许 portrait / portrait-upside-down / landscape，不在弹窗开关或布局回调里调用方向锁。没有采集 UIKit 旋转日志，持续旋转是否彻底消失需 b12 真机确认。
- 新增三尺寸菜单锚点和弹窗反复开关布局检查；Web 检查不能证明 iPad 原生方向过渡正常。

## 3. b12 自动验证记录（本次未重跑）

- **35/35 单测**：鉴权/URL/Range/取消、切源/暂停/释放/音轨、初始化前起播、字幕/弹幕/歌词、语音包和 B站 CID/分P。
- lint、类型、iOS/Web 导出通过。Doctor **20/21**：Directory 提示 WebRTC New Architecture 未测试和本地私有模块无元数据，未隐藏。
- 原版本地 v4.2.0：**37/37 UI**（零 JS 异常）含两模式三尺寸和登录刷新；历史 **16/16 语音/字幕/弹幕协议**、**7/7 DAV 流程**。音乐扫码/歌单/搜索、语音包/DAV 为 fixture，非真实账号/音频或远端挂载验收。
- EAS b12 Release 及包离线检查见版本记录；包含 VLCKit/WebRTC/Go及语音桥接/JS/许可证，检查 UIRequiresFullScreen 和方向声明。
- 此前桌面 VLC3.0.23 两文件十分钟/seek/暂停恢复；原网页两分钟/暂停/退出后无新增请求或字节，脱敏记录离线核对通过。**不等于 iOS VLCKit4.0.0a24 实测。**
- 正式 serverFiles.ts/range-stream.ts/http-proxy.ts 与原备份一致。

## 4. 真机验收顺序

逐项记录设备/系统/build、步骤、结果及脱敏证据。用户已报告上一轮视频、B站扫码、番剧及挂载视频正常；未提供完整编码/时长/系统/操作记录，不能扩大为所有媒体、同步或语音通过。**b12 尚待真机复验**。

1. 自行签名安装 **b12**，直接启动；优先复验横屏连续打开/关闭添加片源、弹窗内转动设备及退出后方向保持；网易云菜单与按钮对齐。再复验选片自动起播，播放条位于视频内，横竖屏反复旋转、进入/退出全屏后画面比例及房间 UI 恢复；一起看/一起听和 Android 对照。再检查登录、局域网权限、过期/重连/离房。
2. "E:\Codex-bulid\ZViewer\TEST视频\高速文件 Resident Evil.2026.1080p.SDR.24fps.AVC.AC3 2.0.mkv" "E:\Codex-bulid\ZViewer\TEST视频\与你相恋到生命尽头 - S01E01 - 第1集.mkv" 各至少十分钟；90/700/1300秒 seek（按时长调整）、暂停/恢复/离房重进，核对画面/声音/字幕。
3. 起始/中间/末尾/开放 Range、短206下一分片、416/取消/恢复，统计暂停/离房后新增字节/请求；保留8MiB上限，不以取消上限作为修复。
4. HLS/FLV/FLAC、具体编码、分离音轨/子分片鉴权/字幕分别记录，不仅按扩展名宣布支持。
5. iPad/iPhone/Android 同房：暂停/seek/倍速、晚加入/重连、审批/管理员/转交，同步目标约2秒，排查重复加载/旧进度。
6. 语音默认静音→开麦→双向，收起/禁言/踢出/重连/离房、边看边聊；Android/鸿蒙Opus/PCM、回声/蓝牙/后台/来电/弱网。
7. B站QR/退出、推荐/搜索/收藏/分P/高画质/分离轨/过期回退；网易云账号/VIP/歌词/后台/审批。
8. 横竖屏/全屏/PiP/键盘、大字幕/弹幕性能；真实WebRTC共享和OBS-FLV各自验收。iPad Split View 本版关闭，以保证方向按钮可锁定方向。

失败修对应客户端链路，不以编译/桌面证据替代，不创建“真机通过”标签。

## 5. 保留限制及发布后续

- v4.2.0 无独立 SMB 配置 API；可使用服务器已挂载的 SMB 文件目录，未新增服务器 API。
- register-host 不返回完整既有成员列表；房主重连后的名单恢复仍需跨端验证，不能凭后续进出事件宣布完整恢复。
- RN 同步字幕显示文本和基础样式，不完整复刻 ASS 特效；VLC 外部 URI 使用原文件解析。
- VLCKit 为预发布版；WebRTC New Architecture/硬件编解码仍待运行验证。
- 仅 unsigned-device 准备 native vendors；旧 development/simulator profile 需要对应准备步骤。
- 无 packages/shared/protocol，本版复用既有 DTO/Socket/Go，不导入 Capacitor；未来共享改动单独回归其他端。
- 用户签名/真机反馈后修正并递增 build；正式签名/升级/隐私/TestFlight/商店另行处理，未自动 push/上架。

## 6. 开发与 Git

SDK57官方文档和AGENTS为准，expo install；CNG/config plugin/本地Expo Module，不手改生成项目。每版记录测试/构建/摘要/真实剩余项。仅暂存本版iOS代码/锁文件/文档/脱敏证据，不混入既有Android/鸿蒙/根工程改动，不提交账号/原日志/证书/IPA。用户已授权源码/包检查后Git提交；未真机验收不创建通过标签。回滚用git revert，不reset --hard。

本轮文件和SHA-256见 [b12交付记录](releases/ios-1.2.1-12-unsigned.md)。b10/b11 为历史构建，本次复验使用 b12。

## 7. 2026-10-02 client 1.5.0 源码差异与迁移边界

### 7.1 参考资料、版本来源与状态纠偏

本轮对照资料：[client 1.5.0 发布记录](releases/client-1.5.0.md)、[双端维护与发布](mobile-release-maintenance.md)、[系统媒体与旋转](mobile-media-lifecycle-2026-10-01.md)、[界面与歌词](mobile-player-ui-2026-10-02.md)、[追加视频与手势](mobile-music-video-2026-10-02.md)。现均已同步至本目录，可用 `git show client-v1.5.0:<路径>` 复核。根 package.json 为 1.5.0，Android/HarmonyOS versionCode 为 150；原发布无服务端协议或数据迁移变更，服务端仍为 v4.2.1，未改动或发布 iOS。

用 `git diff --name-status client-v1.3.0 client-v1.5.0 -- src ZV-Android ZV-HarmonyOS native` 核对新增能力。工作树名称不能作为版本依据；后续修改和 Git 操作只在指定 ZViewer-client 完成，不继续在发布工作树开发。当前 iOS 读取本目录 ZV-iOS 的 b12 源码。1.5.0 设备通过结果来自原发布/验收记录，本次另行记录本地构建结果，不扩展为新的真机结论。

- 架构与发布：[Android 维护架构](android-maintenance-architecture.md)、[HarmonyOS 维护架构](harmonyos-maintenance-architecture.md)、[双端维护与发布](mobile-release-maintenance.md)。双端共享根 src/，iOS 独立维护 ZV-iOS/src/ 与本地 Expo Module；根项目同步命令不会更新 iOS。
- 协议与媒体：[Android v4.2.1 适配](android-v4.2.1-adaptation-report.md)、[鸿蒙适配及编码限制](harmonyos-v4.2.1-adaptation-report.md)、[B 站 CDN 修复](android-bilibili-cdn-playback-fix.md)。保留其中设备、内容和测试时长边界，不能将模拟器/WebView 成功推定为 iOS VLC 成功。
- 外观：[Android 全局外观](android-global-appearance.md)、[鸿蒙外观同步](harmonyos-global-appearance-sync-plan.md)。后续对齐浅/深/跟随系统、背景和玻璃设置、系统安全区，不再仅以旧绿色/深灰截图为完整目标。
- 本次同步修正两端架构表中“iOS 只有基础直链、等待修复截断”的过时描述。iOS 已有片单、音乐、语音和本机 B 站实现，用户也反馈部分播放正常；当前定位为“b12 功能较多但待真机闭环，后续对齐 client 1.5.0”，不将已有实现重新列为从零开发，也不将双端验收扩展为 iOS 通过。

### 7.2 已核对的差异

下列路径均相对仓库根；双端参考列须读取 `client-v1.5.0` 标签，iOS 现状读取本地 b12 源码。表中“待补齐”不代表本次已修复。

| 领域 | Android/HarmonyOS 参考实现 | iOS 现状与后续结论 |
| --- | --- | --- |
| 房间恢复及 B 站时序 | `src/upstream/modules/sync-playback/hooks/useVideoSource.ts` 等待当前影片 DTO，异步后重读 movieId，核验 cid/会话并丢弃过期解析 | `ZV-iOS/src/app/room/[roomId].tsx` 请求 `request-current-movie`，但当前未注册 `current-movie` 监听；播放状态直接进入 adapter，`movie-list` 仅更新列表。需增加当前影片身份与待处理播放状态，不能依赖事件到达顺序 |
| B 站解析/偏好 | `src/upstream/modules/bilibili/{parseOptions,nativeQualityPolicy,useBilibiliQuality}.ts`、`room/watch-together/movie-source-resolver.ts`：影片级策略、管理员限制、真实画质、手动失败恢复 | `ZV-iOS/src/lib/biliNative.ts` 已有本机解析、epoch、分 P、两次降档；缓存以 URL 为键、画质全局保存，返回的 sessionVersion 未用于缓存键。`resolvers.ts` 固定传 preferMp4/forceDash；`MoviePanel.tsx` 添加影片忽略创建返回 DTO。需补齐策略和身份，不能把现有本机解析算成未开发 |
| CDN 与原生构建 | `native/bilicore/mobile/mobile.go` 已有候选去重/排序、受限 CDN/4483、简化媒体 UA；鸿蒙 `BilibiliLocalProxy.ets` 独立实现同类策略 | iOS 通过 `scripts/stage-native-core.cjs` 复制当前共享 Go 源并生成 SHA-256 manifest。下一包需重建 XCFramework 并核对来源；不能认定历史 b12 已含这些修复，也无需复制 ArkTS 代理 |
| 语音 | `src/upstream/modules/voice-chat/hooks/useVoiceChat.ts`：媒体初始化 ACK、房间恢复后重入、稳定 instanceId、volatile 媒体发送及拥塞处理 | `ZV-iOS/src/components/VoicePanel.tsx` 已有 forceNew websocket、mediaToken、初始化 ACK、Opus/PCM 和写缓冲丢帧；尚未发送 instanceId，媒体仍用普通 emit，joined 在 voiceStart 后设置而非以媒体 ACK 为准。重入/令牌刷新、过期 ACK 和可见连接状态需专项对齐，不能写成“从零迁移旧语音事件” |
| 一起听 | `src/upstream/modules/music/hooks/useListenTogether.ts` 用队列位置处理重复曲目，隔离解析缓存、清理重试；`useMusicVideoBackground.ts` 提供背景视频策略 | `ZV-iOS/src/components/MusicPanel.tsx` 用 trackKey/findIndex 定位前后曲，重复歌曲可能反复定位首项；stream 主要按 trackKey 复用。需补队列位置、账号/服务端/音质变化失效，以及有限重试与取消；音乐背景视频列为后续功能 |
| 全局外观 | `src/mobile/MobileAppearance.tsx`、`appearance.css`、`src/upstream/store/themeStore.ts`：持久化外观壳、主题变量、背景及减少动态效果 | iOS `RoomUi.tsx`、首页/房间/音乐多处固定深色，`app.json` 固定 dark。需实现 RN 主题与偏好，覆盖独立 Modal；不得复制 CSS/Portal 实现。主题切换必须保留 VLC 实例、音轨和当前进度 |
| 番剧批量添加 | `src/upstream/modules/room/components/AnimeEpisodePicker.tsx` 及 AniSubs/Kazumi 选择器支持多选和部分失败 | `ZV-iOS/src/components/AnimePicker.tsx` 当前逐集点击即添加。后续增加选择、批量提交、成功移除/失败保留，继续使用已有逐集 API |
| 播放器及挂载 | 根网页已迁移 Video.js 10/dash.js，含 attach/seek 取消、HLS 鉴权；`player/engines/direct-route.ts` 区分挂载直链与中转 | iOS 保持 `NativeMediaAdapter → VlcPlayer → VlcVideo`。`media.ts` 已隔离本机 URL、令牌和固定 Range 头；重点验收短 206 续读、HLS 子资源鉴权、取消/释放及直链语义，不引入网页引擎、MSE、P2P 或默认转码 |
| 系统媒体与权限 | `src/platform/{contracts,mediaSession}.ts`、`src/mobile/useSystemMediaSession.ts`；音乐 `useMediaSession.ts` 与一起看 `WatchTogetherCore.tsx` 共用 sessionId/actions 契约，观众命令经过申请 | iOS `nativeBridge.ts` 仅暴露 B 站与语音，VlcVideo 的 PiP 不是这套系统控件集成；`PlaybackControls.tsx` 一起看控件禁用非房主。需实现 RN/原生系统会话、元数据与命令回流，并补观看申请审批，禁止系统命令直接绕过权限 |
| 后台与音频会话 | Android `SystemMediaSessionPlugin.java`、`PlaybackService.java`、`PlaybackWebView.java`；鸿蒙 `NativeMediaSession.ets` 的 AVSession + AUDIO_PLAYBACK 连续任务 | iOS 已有 `VlcVideo.tsx`、`ZViewerNativeModule.swift`、`plugins/with-voice-audio.cjs` 的媒体/语音协作，但尚无与 1.5.0 对等的业务后台验收。需核验生成包配置、锁屏音频、JS 暂停时命令/心跳和恢复；不能照搬唤醒锁或 ArkWeb 保活 |
| 系统歌词/封面 | `music/hooks/useSystemLyrics.ts`、`utils/lyricRequest.ts` 合并并发请求，缓存 20 项/5 分钟，LRC 上限 65536 字符；系统会话同步当前行与封面，旧曲结果隔离 | iOS MusicPanel 已在组件内取歌词并按曲目过滤显示，不是完全缺歌词；尚未建立 UI/系统共用缓存、系统歌词映射与封面代次管理。需评估 iOS 系统展示能力并记录降级，不能承诺复刻鸿蒙完整歌词页 |
| 自动旋转/横屏安全区 | `src/mobile/PlayerDisplayControls.tsx`、`src/platform/playerDisplay.ts`：第一次切换并锁定、再次恢复自动；背景铺满视口、前景避让安全区 | iOS 房间 rotateScreen 每次切换横竖锁定，没有“恢复自动”按钮状态；MusicPanel 完整播放器固定 padding。需建立自动/手动/全屏临时方向状态并恢复，音乐展开横屏覆盖背景且保留安全区前景 |
| 视频手势 | `src/mobile/videoGestures.ts`、`room/watch-together/useWatchGestures.ts`、`music/hooks/useMusicVideoGestures.ts`：中心双击播放，全屏左右双击 ±15 秒，音乐仅 immersive 启用 | iOS 有 ±15 秒按钮，未接入等价表面手势；需用 RN 触屏事件实现同样区域和取消语义，操作权/审批复用同一命令入口，音乐始终操作主音频 |
| 音乐导航/追加视频 | `MusicTopNav.tsx` 固定移动端折叠；`MusicAppShell.tsx` 收起箭头；`MusicVideoModal.tsx` 根级弹窗；`useBackgroundVideoSync.ts` 清空源后释放引擎与 ready 标记 | iOS 已有折叠菜单，需回归手机/平板/旧偏好；尚需补音乐关联视频、分 P、删除后同 URL 重加、纯净视频和 44pt 收起/退出入口，背景视频纳入本次对齐而非无限期后续 |
| 网易云头像 | `music/utils/neteaseImage.ts` 规范协议和尺寸参数；`SongCommentsPanel.tsx`、`MusicSettingsPage.tsx` 使用失败占位 | iOS MusicLibrary/MusicPanel 多处直接使用远端图片 URI，需提供统一 URL 规范化与失败占位，覆盖实际具备的头像/封面入口；评论及楼层回复入口未齐时纳入 I09 补齐范围 |

### 7.3 固定实现边界

- 1.5.0 对齐指用户可见行为、权限与生命周期；不复制 Capacitor/ArkTS/DOM。iOS 系统会话优先核对已有 VLC 库与本地 Module 能力，再按对应版本官方文档选原生实现，避免两个组件抢占系统会话。
- `SystemMediaState` 的 sessionId、mediaId、kind、标题/歌手/专辑/封面、playing、position、duration、playbackRate、actions 是设计参照，进度在业务层统一为秒。lyric/lyricLine 根据 iOS 可支持能力映射；Android 自定义歌词键与鸿蒙 AVMetadata 字段不直接移植。
- b12 VLC/语音配置不能证明锁屏、后台、蓝牙与系统远程控制已通过；发布说明中的“双端用户测试全部通过”仅指 Android/HarmonyOS 原版，不替代 iOS 测试。

## 8. 后续版本实施顺序

优先级以本节为准；第 2 节 P0～P5 仅表示历史开发分组。保留 I01～I11 编号，新增 I12～I17 专门追踪 1.5.0 差异。对齐版本固定 client 1.5.0，iOS 自身发布号/build 在实际构建时确定；全部必做项完成或明确说明平台限制之前，不宣称“已完成 1.5.0 对齐”。

### 阶段 A：P0 协议、播放正确性与历史反馈闭环

1. **I01 / b12 反馈复验**：按第 4 节先验证添加片源弹窗旋转、网易云菜单、自动起播与全屏恢复；有可复现失败先修。协议、队列等独立工作可以继续，但发布前必须记录这些问题的真机结论。
2. **I02 / v4.2.1 房间契约**：核对登录刷新、加入/审批/房主恢复、成员列表、当前影片及播放事件 DTO。以 roomId、movieId、cid、连接代次管理异步状态，资料未齐时等待并显示加载状态，设置超时；切房/换片/退出取消旧任务。回归“播放状态先到”“影片列表先到”“等待中换片”“重连晚加入”。
3. **I03 / 本机 B 站链路**：从当前影片规范地址与 cid 解析，房主桌面 `127.0.0.1:9333` 只作为需本机重新解析的情形，不能放宽通用 URL 校验。补齐影片级自动/手动质量、真实 currentQn、管理员 DASH 设置与 CLI 不可用时服务器 MP4 回退；保留 CLI 用户偏好和暂停/进度。缓存隔离服务器、账号会话、影片/cid、解析模式和画质版本，同请求合并，账号退出/切换失效；手动切档失败恢复原策略与播放状态。
4. **I04 / Go 修复进入 iOS 包**：以 `client-v1.5.0:native/bilicore/` 固定来源并生成 manifest；逐文件核对后再运行当前复制工作区源码的 stage-native-core 脚本、重建 ARM64 XCFramework。本次已核对 mobile/mobile.go 与标签无差异，不代表整个共享目录或生成包一致。验证普通/边缘/mcdn 候选切换、完整签名查询参数（含 nbs）、Range/HEAD/206、取消及 Cookie 隔离；仅允许已登记解析结果和受限 CDN/端口。后续共享 Go 改动单独提交并回归 Android。
5. **I05 / 语音会话状态**：将房间恢复 ACK、voice-join、新 mediaToken、独立媒体连接及 voice-media-init ACK 明确串联；只有绑定成功才允许媒体收发和显示可通话。保留稳定实例标识、丢帧而非积压策略、ACK 超时/代次取消、鉴权刷新、禁言/踢出及离房释放。编码器已有 Opus/PCM 能力，先验证 v4.2.1 互通，再按实际丢包/拥塞结果安排 PLC、码率与统计增强，不照搬浏览器音频代码。
6. **I06 / VLC 与 Range 门槛**：保留现有单内核及初始化前播放意图。分别测试 v4.2.0 历史短 206 场景与 v4.2.1 实际响应，记录端点、请求 Range、Content-Range、响应体长度、续读与总流量。历史 8 MiB 是已有服务端行为约束，不是所有代理的统一限额；双端报告中的 12 MiB 完整 Range 也不能推定服务端文件接口已取消上限。不得以改正式服务端上限掩盖 iOS 续读问题。

7. **I12 / 系统媒体会话与控制权限（P0）**：先补一起看观众的播放/暂停/跳转申请与房主审批，再统一屏内按钮、手势、锁屏/控制中心/耳机命令入口；一起听复用现有 music:control-request。按当前会话动作列表暴露可用命令，审核 stop 的暂停语义。一起看和一起听都发布状态、进度、时长、倍速、标题与封面，不能只为音乐建会话。每个播放器持有唯一 sessionId，切模式/切房后旧清理、旧封面回调不能删除或覆盖新会话；相对封面按服务端地址解析，下载失败使用占位并限制缓存。
8. **I13 / 真正后台播放与音频所有权（P0，依赖 I12/I05）**：明确 VLC 播放、语音通话与静音背景视频的会话所有权；保留进入后台停止麦克风采集的现有约束，不能为了音乐保活偷偷开麦。核验最终生成包的后台音频声明、系统会话配置、来电中断、拔耳机/蓝牙与恢复。测试 RN JS 暂停/延迟后远程命令及房主心跳是否仍有效，恢复时先校验房间和媒体身份；不可假设后台 setInterval 永远运行。暂停释放播放资源但保持合理的继续播放入口，离房清会话/封面/命令监听；不以静音循环或无条件保活实现。

阶段 A 出口：v4.2.1 隔离服务上完成房间/B 站/语音协议回归；真机完成 b12 反馈、核心视频续读及一起看/一起听系统控件、后台音频专项。至少使用 5 分钟素材，记录真实后台停留时长、音轨输出、进度与恢复，不以 paused=false、配置存在或 PiP 可用代替后台通过。v4.2.0 仅作历史对照，不隐式回退旧 voice-audio-data；长时间待机与厂商设备差异如未测需保留限制。

### 阶段 B：P1 全局外观与音乐一致性

1. **I07 / RN 全局外观**：参考双端主题字段建立持续挂载的根主题状态，依次覆盖连接页、登录/列表、房间、音乐、设置及 Modal；提供浅色/深色/跟随系统、背景图、圆角、透明度、模糊、背景位置/缩放/旋转/遮罩及减少动态效果。背景文件采用合适的本地文件存储，偏好只保存引用和参数；不要把大图塞进 SecureStore。原生玻璃不可用时使用可读的普通表面。
2. 系统状态栏、安全区、键盘和大字体与主题联动；播放器画布保持黑色，设置面板单层表面，避免重复模糊和浅色低对比文字。iOS 使用 RN 安全区及原生方向策略，不移植 Android WindowInsets 或鸿蒙 CSS 注入。切换主题/打开外观页不重建 VLC；关闭浮层、退出全屏、返回房间的交互顺序明确。暂保留 iPad requireFullScreen，Split View 另立方向适配任务。
3. **I08 / 音乐队列与解析**：用队列项/位置维护重复曲目推进，遵守现有服务端 DTO，不自创线上同步字段；覆盖 `[A, A, B]`、删除当前项、前后曲、随机/单曲/顺序和播放结束。解析按账号/服务器/曲目/cid/音质/模式隔离，同请求合并；暂停、切歌、切房与卸载取消重试和过期结果。验收音质变化后重新取流、B 站音轨和歌词走当前本机会话、音乐与语音同时使用的音频路由。

阶段 B 出口：iPhone/iPad 横竖屏及浅/深色截图对照，主题重启持久化、媒体实例/进度连续性、重复歌曲推进和跨端音乐同步均有记录；不能以 Web 导出截图代替原生模糊、安全区和方向验收。

### 阶段 B 的 1.5.0 必做补项（P1）

- **I14 / 共享歌词与系统展示（依赖 I08/I12）**：沿用网易云 LRC、B 站 AI 字幕/本机歌词能力，UI 与系统使用同一请求和曲目代次；以标签 20 项、5 分钟有限缓存为参照，额外隔离账号与服务器。未打开歌词面板也能获取当前歌曲数据，拖动后按主音频定位当前行，切歌/无歌词立即清空，失败可重试，旧请求不能覆盖。完整 LRC/当前行仅映射到 iOS 官方支持的展示能力；若无等价系统完整歌词页，保留应用内歌词并在交付记录写明平台差异，不挪用标题等元数据伪装歌词页。
- **I15 / 旋转、展开与安全区（依赖 I01/I07）**：默认系统策略→点击切换并手动锁定→再次点击恢复自动，按钮文案反映当前锁定状态；全屏临时锁与用户锁分开，退出恢复原策略，离房解除应用锁。iPhone/iPad 分别测试系统旋转锁开启/关闭和弹窗切换，不假定 Android FULL_USER 可一对一映射。音乐仅“完整播放器展开且横屏”隐藏房间顶栏，背景铺满视口，前景/关闭按钮避让摄像头与底部区域；收起或竖屏恢复。继续保留 requireFullScreen/Split View 限制直到专项设计完成。
- **I16 / 视频表面手势（依赖 I12/I15 与 I10 视频能力）**：一起看单击仅显示控件，中间三分之一双击播放/暂停，全屏左右三分之一双击分别 ±15 秒；一起听仅纯净视频全屏启用，普通音乐页/背景不触发。区域一致、相邻触点、320ms 双击窗口作为参考，拖动/长按/取消排除；按钮/滑杆不被拦截，快速重渲染不能重复执行。进度限制在 0～有效时长，未知时长不跳转。音乐命令作用于真实音频，静音视频跟随；观众申请审批不旁路。单击唤出退出按钮约 3 秒后隐藏，双击不退出，保留明确关闭入口和辅助功能操作。
- **I17 / 音乐导航、头像与弹窗（依赖 I07/I10）**：手机横竖屏、iPad 宽屏均维持折叠菜单，旧展开偏好不能覆盖；已有 b12 折叠菜单做回归而非重写。收起箭头/退出按钮采用可见浅色圆底和至少 44pt 触控区；空队列展开/收起不循环更新。网易云图片统一处理协议相对地址、限定网易云 HTTP→HTTPS、尺寸参数替换及失败占位，保留其他查询参数；覆盖个人头像、评论/回复头像及封面使用点。追加 B 站视频用 RN 顶层 Modal，限制可用宽高、头部固定/内容滚动、键盘可操作、长标题不撑宽、关闭后恢复合理焦点；不能复制 body portal。
- **I10 / 音乐关联视频提前到 P1**：补齐追加/搜索/分 P/删除、背景分辨率与管理员 DASH 设置、B 站原视频和网易云追加视频、纯净模式。背景播放器恒静音、跟随主音频，不抢系统会话；删除时释放 VLC 播放资源和已应用源/ready 标记，重新追加相同 URL 必须实际加载。先实现该能力再验收 I16 音乐手势及 I17 追加弹窗。

阶段 B 补充出口：系统歌词/封面无旧曲污染、旋转锁可解除、横屏背景无露边、观众手势先审批、删除后同源重加恢复画面；这些 1.5.0 行为不能仅放在远期功能清单。

### 阶段 C：P2 功能补齐与交付

- **I09 / 来源与辅助体验**：番剧多选/部分失败重试；按双端现有行为核对评论、字幕弹幕设置与诊断展示。挂载覆盖直链/服务端中转、账号权限和失败提示，不无提示改变直链的带宽语义。HLS 清单、相对分片、密钥、外部字幕和分离音轨分别验证鉴权及取消。
- **共享观看延续验收**：真实 WebRTC 与 OBS HTTP-FLV 分开测，继续只提供共享接收端。I10 音乐关联视频已提升至阶段 B，按 client 1.5.0 必做项交付。
- **I11 / 交付收口**：保留用户自行签名的 unsigned-device 方式，内置 JS；核对 iOS 版本/build、原生桥接、许可证、来源摘要和 IPA SHA-256。正式签名、TestFlight/商店及 Split View 不自动纳入本轮。

## 9. 新版本验收矩阵与证据要求

使用隔离 v4.2.1 服务、测试账号和房间，联调结束恢复设备连接/偏好并停止临时服务与端口转发。已有脚本若固定 v4.2.0/fixture，应先调整断言与环境记录；历史 35/37/16/7 通过数不能直接算作新版本结果。

对照端使用 client 1.5.0 / 150 正式包或该标签构建，记录包版本及 SHA-256，不使用历史 1.3.0 临时构建充当 1.5.0。发布前逐项勾核 I01～I17；平台不具备的系统展示能力可标明差异，其余新增能力未交付不能宣称完成对齐。

| 验收组 | 必测场景 | 通过证据 |
| --- | --- | --- |
| 房间/时序 | 主连接重连、令牌刷新、晚加入、影片/列表/状态乱序、等待中换片、房主转交 | 脱敏事件次序与代次；无旧片覆盖、无他机 9333 请求，权限与成员状态符合实际服务端 |
| B 站 | QR/退出/重登、分 P、自动/手动/失败恢复、CLI 不可用与管理员禁 DASH、真实 CDN 备用节点 | 实际 qn/编码、首帧、连续播放、seek/暂停、Range/206；无 Cookie/签名 URL/本机能力路径泄漏 |
| 文件/媒体 | MKV/MP4 各十分钟、HEVC Main 10/H.264、FLAC 16/24 位、分离轨、HLS 子资源、短 206/416/取消 | 设备与系统、容器和编码、画面帧/声音/时间推进、请求字节；鸿蒙 HEVC 零帧仅作为排查案例，不推断 iOS 成败 |
| 语音跨端 | iOS↔Android、iOS↔HarmonyOS、iOS↔官方 v4.2.1 网页；媒体单独断线与主连接断线、禁言/踢出 | 初始化 ACK 与换令牌证据、上下行帧及真人双向听感；蓝牙/扬声器/回声/来电/后台/弱网单独记结果 |
| 音乐 | 重复曲目、播放结束、暂停中解析完成、连续切歌、音质/账号/服务器切换、音乐与语音共存 | 队列位置、同步进度、退出后无旧流/重试；真实网易云账号/VIP/歌词与 fixture 区分 |
| 外观/方向 | 两种设备、浅深/系统主题、设置 Modal、键盘/大字体、全屏/旋转/源选择器、进程重启 | 原生截图、主题持久化、VLC 实例和播放连续性；b12 反馈逐项关闭或保留已知限制 |
| 发布 | 新 build 用户签名安装、冷启动、旧版升级、HTTP 局域网权限、后台恢复 | 构建来源、IPA 检查/SHA-256、测试清单、已知限制；编译成功与真机通过分开记录 |
| 系统控件/后台（I12/I13） | 一起看/一起听锁屏与切后台、控制中心/耳机播放暂停跳转切歌、观众审批、语音共存及离房 | 后台起止时间、实际音频输出/进度、命令回流和审批记录；暂停与退出资源释放；旧 sessionId 清理不影响新会话 |
| 歌词/封面（I14） | 面板未开、快切 A→B、无歌词、图片失败、seek、换账号/服务器 | UI/系统请求去重、旧结果隔离、当前行准确；iOS 系统显示能力与应用内展示分开记录 |
| 旋转/手势（I15/I16） | 系统锁开关、手动锁/自动恢复、全屏退出策略、三分区双击、拖动/长按/取消、显式控件、观众 | 手势只执行一次；±15 秒边界正确；音乐普通页无误触、纯净模式操作音频；iPhone/iPad 原生结果 |
| 音乐完整交互（I10/I17） | 宽屏仍折叠、空队列、长标题/头像失败、横屏背景安全区、键盘弹窗、追加/分 P/删除/同源重加 | 无露边/裁切、44pt 关闭区、深浅主题、静音视频跟随与同源恢复，切换不抢主音频系统会话 |

每项记录 build、设备/系统、服务端版本、素材/账号类型、步骤、预期、实际、证据和剩余问题。暂停后允许播放器合理预缓冲，需统计是否停止持续下载；离房释放后不能继续请求旧媒体。同步暂沿用约 2 秒目标并记录测量条件。

## 10. 开发验证与维护交接

- 开始程序实现前遵循 `ZV-iOS/AGENTS.md`，按当前 Expo 主版本查对应文档；使用 CNG/config plugin/本地 Module，不手改生成 iOS 工程，不执行 Capacitor 同步到 iOS。
- 实现前固定 client-v1.5.0 参考提交，核对指定仓库后续改动与标签的差异；按需求移植产品逻辑，不 checkout/reset 覆盖用户未提交代码。共享 Go staging 读取当前目录，必须核验来源后才构建。全部客户端修改与 Git 操作遵循根 Agents.md，在 E:/Codex-bulid/ZViewer/ZViewer-client 完成。
- 每阶段按改动增加有实际故障价值的回归：事件乱序、缓存隔离、重复队列、过期语音 ACK、取消/释放；复用 `ZV-iOS/tests/` 和现有脚本。根目录旧测试已在双端清理中删除，不照抄历史报告中的失效命令，也不删除 iOS 现有测试。
- 从 `ZV-iOS/` 运行 `npm test`、`npm run lint`、`npm run typecheck`，按需运行 Expo Doctor、iOS 导出和隔离服务联调；原生模块或共享 Go 变更须重新设备构建并检查 IPA。Doctor 历史警告重新记录，不能沿用旧通过数或隐藏警告。
- 每次程序版本构建完成后按维护准则做本地 Git commit，提交前检查范围。本次额外完成用户授权的双端 1.5.0 源码同步与构建，另有同步记录；以后每次 iOS 实现只提交对应改动，不能混入未经授权的其他端工作。共享 Go 来源必须可追溯到提交或明确源码摘要，禁止以“iOS 没改 Go 文件”为由跳过打包来源检查。
- 随实际交付更新本计划、`ZV-iOS/README.md` 与 `docs/releases/ios-<version>-<build>-unsigned.md`，同时修正双端维护文档中的过时 iOS 状态；历史证据不覆盖、不改写成新版结果。
- 未经后续发布指令不 push、打发布标签或上架。如发布 GitHub Release，说明按仓库规定依次使用“🚀 新特性 / Features”“🐛 错误修复 / Bug Fixes”“⚠️ 破坏性改动 / Breaking Changes”“⚡ 性能优化 / Performance Improvements”“📖 文档与依赖更新 / Documentation & Dependencies”，分隔线后附“完整变更记录”。

## 11. 2026-10-02 b13 集中实现交接

- 交付 1.5.0 / b13 未签名 ARM64 Release，内置 JS；EAS `39c98171-8b19-4e31-b68d-9639d6fac54f` FINISHED，完成时间 2026-10-02T06:37:29.158Z。IPA 46,476,739 bytes，SHA-256 `3869c3be04df04e449d706563f72ac902fa9d153d154eb8cd4cc14fe0ebccebe`，与构建端一致；用户自行签名，不使用证书。
- 本轮实现房间乱序/cid、B站影片级策略/有限缓存/回退、语音 ACK/重绑、重复队列/音质/歌词缓存、全局外观、系统媒体/封面、旋转/手势、静音音乐关联视频、评论/楼层回复、番剧批量。逐项路径/限制与集中测试步骤在交付记录；I01 反馈和所有原生矩阵继续待验收。
- 本轮新证据：49/49 单测、lint/typecheck、iOS/Web 导出；官方 v4.2.1 协议 23 项及 1 项服务端观察；2 份 MKV 16 项传输；43 项 Web 布局且零 JS 异常；Doctor 20/21，保留 WebRTC/私有模块警告。host Opus 50 帧编解码与设备编译不替代麦克风验收。
- 官方服务端包在主连接断开后立即测试仍接受旧语音 token 重绑定；新主连接能获得新 token 并恢复新身份 relay。本轮记录真实行为，客户端以连接代次丢弃旧 ACK，不宣称服务端立即失效，不改正式服务端。
- I13 原生 VLC host 播放/暂停/seek 可避开 JS 暂停；后台切歌、观众请求、房间心跳没有独立原生 Socket 管线，回前台才校验/回流。I14 保留应用内歌词，平台系统完整歌词页未伪装实现。重复歌曲的跨端位置未扩展线上 DTO；重连完整既有名单仍受现有契约限制。
- 8 MiB 短 206 在 v4.2.1 server-files 实际存在，本轮未提高上限。HLS 鉴权子资源、MKV/MP4 十分钟/HEVC/FLAC、真实 CDN/音乐账号/语音听感/蓝牙/来电/锁屏/PiP/方向仍须设备闭环。本轮未连接 NAS。
- 首次构建因 Bash CRLF 失败，上传脚本现先规范 LF；第二次主动取消后纳入 UI 检查发现的竖屏遮挡和弹窗过渡修正。历史证据未覆盖；只在指定仓库提交 iOS 与维护文档，没有 push、发布标签或上架。

## 12. b14 开屏反馈复核（2026-10-02）

- I01：用户报告 b13 iPad 开屏只显示竖向拉伸的“全局外观”。保留先行修复的正常页面和恢复横幅；补齐真正的原生布局修正，原生算法模型可复现旧按钮高度 796pt、正文高度 0。b14 六尺寸/三字体倍率/恢复开关共 36 组布局及旧版复现通过，真机冷启动仍待用户。
- 会话：本机两项凭据并发读取、各 5 秒上限；联网校验不再阻塞页面；HTTP 整个响应含 body 15 秒上限；新登录/退出切换使旧网络结果失效。源码 Provider 的 13 项测试包含 Keychain 桥接模拟异常/永不返回、离线恢复、退出后迟到校验/刷新、过期与无效令牌。
- I07：原 b13 已通过 theme.styles 接入外观，并非固定色未接入；b14 校验损坏偏好类型和参数范围。外观普通偏好使用应用文档目录 JSON，SecureStore 用于登录信息及旧偏好迁移，不能将全部偏好称作 SecureStore。外观与后台媒体仍需真机验收，不能标成已完整对齐。
- 本轮通过：59 项单测、lint/typecheck、iOS/Web 导出、37 项 Yoga 模型记录（含旧版复现）、20 项开屏 Web、13 项会话 Provider、43 项既有 Web 房间/媒体布局复验。它们均不替代 UIKit/Keychain/VLC 真机运行验收。
- I13 的后台独立业务 Socket 心跳、切歌、审批限制沿用 b13，未因开屏修复变成已完成。

## 13. b15 全应用界面改造，仅源码预览（2026-10-02）

- 对照共享移动端主题、首页/大厅、房间、选集、音乐及设置组件，在 RN 内实现相应布局与交互。默认 Nacho3 背景、expo-blur、首页 B站文字入口、主题底色/文字对比度、小屏顶部避让同步完成。路径映射见 [b15 预览](releases/ios-1.5.0-15-preview.md)。
- I01/I15：View 明确分配媒体空间，一起听填满框架；竖屏评论等面板在视频下方，宽屏并列，横竖屏显式 flexGrow/flexShrink/flexBasis；原全屏/方向锁与 requireFullScreen 保留。
- I09/I17：来源下拉/集中选集独立滚动，平板两列/手机一列，多选失败保留重试；弹窗限制宽高、固定头部/滚动正文/iOS 键盘避让，原生运行仍须用户验收。
- 59 单测、lint/typecheck、iOS/Web 导出、24 房间 Yoga、29 首页/59 房间音乐/21 来源 Web 通过，0 JS 异常。Expo Go manifest/iOS JS/壁纸 HTTP200。Doctor 20/21，保留 WebRTC/本地模块提示。
- 用户已看到背景并指出入口/对比度问题，本轮已修改；未获得全应用原生通过结论。I13 原生独立业务 Socket/后台切歌/审批仍未闭环，系统歌词差异、长时媒体/HLS 子资源、真实账号/跨端语音等矩阵保留。
- 只保留 Metro/Expo Go，EAS 95eec7cf… 已取消，早期 0665bfa3… b14 不作为最终包。源码编号 15，没有 b15 IPA；没有新增云端 Build/Update。用户确认界面并明确要求后再构建。

### 2026-10-02 展开音乐播放器补充

展开页重做为共享双端的播放卡/图标工具栏/独立完整歌词结构；iPad 竖屏双栏，窄屏手机切换歌词，短横屏压缩控件，封面明确宽高防止拉伸。新增 31 项播放页 Web 和既有 59 项房间复验均通过，0 JS 异常；59 单测、lint/typecheck 和 iOS/Web 导出通过。源码编号仍为 15，无新云端构建/更新或 IPA，继续 Expo Go Reload。原生安全区、大字体、旋转、VLC 出声和后台限制仍待设备验证。详见 [音乐页补充](releases/ios-1.5.0-15-music-preview.md)。
