# iOS 继续开发与验收文档

更新：2026-10-02。工程：`ZV-iOS/`。已交付基线仍为 iOS 1.2.1 / build 12、服务端 v4.2.0；**后续更新目标改为 Android/HarmonyOS 1.3.0 / 130 的产品行为与服务端 v4.2.1 协议**，不是将双端网页引擎搬入 RN。

本次仅更新计划，依据当前工作区维护文档与源码交叉核对，未修改程序、构建安装包或新增真机验收。工作区存在尚未提交的 Android、鸿蒙及共享 Go 改动；下文描述的是该工作区快照，不能等同于已发布标签中的全部内容。第 1～6 节保留 b12 交付与验收记录，第 7～10 节为后续执行计划；旧节中的“本轮/本版”均指 b12。

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
2. S01E01.mkv、S01E04.mp4 各至少十分钟；90/700/1300秒 seek（按时长调整）、暂停/恢复/离房重进，核对画面/声音/字幕。
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

## 7. 2026-10-02 源码差异与迁移边界

### 7.1 参考资料与状态纠偏

- 架构与发布：[Android 维护架构](android-maintenance-architecture.md)、[HarmonyOS 维护架构](harmonyos-maintenance-architecture.md)、[双端维护与发布](mobile-release-maintenance.md)。双端共享根 `src/`，iOS 独立维护 `ZV-iOS/src/` 与本地 Expo Module；根项目同步命令不会更新 iOS。
- 协议与媒体：[Android v4.2.1 适配](android-v4.2.1-adaptation-report.md)、[鸿蒙适配及编码限制](harmonyos-v4.2.1-adaptation-report.md)、[B 站 CDN 修复](android-bilibili-cdn-playback-fix.md)。保留其中设备、内容和测试时长边界，不能将模拟器/WebView 成功推定为 iOS VLC 成功。
- 外观：[Android 全局外观](android-global-appearance.md)、[鸿蒙外观同步](harmonyos-global-appearance-sync-plan.md)。后续对齐浅/深/跟随系统、背景和玻璃设置、系统安全区，不再仅以旧绿色/深灰截图为完整目标。
- 两端维护架构表仍把 iOS 概括成“基础直链播放、等待修复截断”，与 b12 记录和现有源码范围不一致。iOS 已有片单、音乐、语音和本机 B 站实现，用户也反馈部分播放正常；应定位为“功能已实现较多、v4.2.1 差异待补齐、b12 真机复验未闭环”，既不退回仅登录的阶段，也不宣称截断及所有媒体已解决。

### 7.2 已核对的差异

下列相对路径均相对仓库根。表中“待补齐”是后续任务，不代表本次已修复。

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

## 8. 后续版本实施顺序

优先级以本节为准；第 2 节 P0～P5 仅表示历史开发分组。各阶段完成后再确定版本号并递增 build，不预先宣称“下一包已完成 1.3.0 对齐”。

### 阶段 A：P0 协议、播放正确性与历史反馈闭环

1. **I01 / b12 反馈复验**：按第 4 节先验证添加片源弹窗旋转、网易云菜单、自动起播与全屏恢复；有可复现失败先修。协议、队列等独立工作可以继续，但发布前必须记录这些问题的真机结论。
2. **I02 / v4.2.1 房间契约**：核对登录刷新、加入/审批/房主恢复、成员列表、当前影片及播放事件 DTO。以 roomId、movieId、cid、连接代次管理异步状态，资料未齐时等待并显示加载状态，设置超时；切房/换片/退出取消旧任务。回归“播放状态先到”“影片列表先到”“等待中换片”“重连晚加入”。
3. **I03 / 本机 B 站链路**：从当前影片规范地址与 cid 解析，房主桌面 `127.0.0.1:9333` 只作为需本机重新解析的情形，不能放宽通用 URL 校验。补齐影片级自动/手动质量、真实 currentQn、管理员 DASH 设置与 CLI 不可用时服务器 MP4 回退；保留 CLI 用户偏好和暂停/进度。缓存隔离服务器、账号会话、影片/cid、解析模式和画质版本，同请求合并，账号退出/切换失效；手动切档失败恢复原策略与播放状态。
4. **I04 / Go 修复进入 iOS 包**：先固定要打包的共享 Go 来源与 manifest，再重建 ARM64 XCFramework。验证普通/边缘/mcdn 候选切换、完整签名查询参数（含 nbs）、Range/HEAD/206、取消及 Cookie 隔离；仅允许已登记解析结果和受限 CDN/端口。共享 Go 如需继续改动，单独提交并回归 Android，不能当作仅 iOS 私有改动。
5. **I05 / 语音会话状态**：将房间恢复 ACK、voice-join、新 mediaToken、独立媒体连接及 voice-media-init ACK 明确串联；只有绑定成功才允许媒体收发和显示可通话。保留稳定实例标识、丢帧而非积压策略、ACK 超时/代次取消、鉴权刷新、禁言/踢出及离房释放。编码器已有 Opus/PCM 能力，先验证 v4.2.1 互通，再按实际丢包/拥塞结果安排 PLC、码率与统计增强，不照搬浏览器音频代码。
6. **I06 / VLC 与 Range 门槛**：保留现有单内核及初始化前播放意图。分别测试 v4.2.0 历史短 206 场景与 v4.2.1 实际响应，记录端点、请求 Range、Content-Range、响应体长度、续读与总流量。历史 8 MiB 是已有服务端行为约束，不是所有代理的统一限额；双端报告中的 12 MiB 完整 Range 也不能推定服务端文件接口已取消上限。不得以改正式服务端上限掩盖 iOS 续读问题。

阶段 A 出口：v4.2.1 隔离服务上完成房间/B 站/语音协议回归，真机完成 b12 反馈及核心视频续读；未完成麦克风、媒体或旋转实测的项目仍明确标为待验收。v4.2.0 作为历史对照，未经专项验证不承诺新包双版本全功能兼容，不隐式回退旧 `voice-audio-data` 协议。

### 阶段 B：P1 全局外观与音乐一致性

1. **I07 / RN 全局外观**：参考双端主题字段建立持续挂载的根主题状态，依次覆盖连接页、登录/列表、房间、音乐、设置及 Modal；提供浅色/深色/跟随系统、背景图、圆角、透明度、模糊、背景位置/缩放/旋转/遮罩及减少动态效果。背景文件采用合适的本地文件存储，偏好只保存引用和参数；不要把大图塞进 SecureStore。原生玻璃不可用时使用可读的普通表面。
2. 系统状态栏、安全区、键盘和大字体与主题联动；播放器画布保持黑色，设置面板单层表面，避免重复模糊和浅色低对比文字。iOS 使用 RN 安全区及原生方向策略，不移植 Android WindowInsets 或鸿蒙 CSS 注入。切换主题/打开外观页不重建 VLC；关闭浮层、退出全屏、返回房间的交互顺序明确。暂保留 iPad requireFullScreen，Split View 另立方向适配任务。
3. **I08 / 音乐队列与解析**：用队列项/位置维护重复曲目推进，遵守现有服务端 DTO，不自创线上同步字段；覆盖 `[A, A, B]`、删除当前项、前后曲、随机/单曲/顺序和播放结束。解析按账号/服务器/曲目/cid/音质/模式隔离，同请求合并；暂停、切歌、切房与卸载取消重试和过期结果。验收音质变化后重新取流、B 站音轨和歌词走当前本机会话、音乐与语音同时使用的音频路由。

阶段 B 出口：iPhone/iPad 横竖屏及浅/深色截图对照，主题重启持久化、媒体实例/进度连续性、重复歌曲推进和跨端音乐同步均有记录；不能以 Web 导出截图代替原生模糊、安全区和方向验收。

### 阶段 C：P2 功能补齐与交付

- **I09 / 来源与辅助体验**：番剧多选/部分失败重试；按双端现有行为核对评论、字幕弹幕设置与诊断展示。挂载覆盖直链/服务端中转、账号权限和失败提示，不无提示改变直链的带宽语义。HLS 清单、相对分片、密钥、外部字幕和分离音轨分别验证鉴权及取消。
- **I10 / 音乐背景及共享观看**：在主音轨同步稳定后补音乐背景视频及分辨率设置，遵守管理员 DASH 开关并验证多播放器资源竞争；真实 WebRTC 与 OBS HTTP-FLV 分开测，继续只提供共享接收端。
- **I11 / 交付收口**：保留用户自行签名的 unsigned-device 方式，内置 JS；核对 iOS 版本/build、原生桥接、许可证、来源摘要和 IPA SHA-256。正式签名、TestFlight/商店及 Split View 不自动纳入本轮。

## 9. 新版本验收矩阵与证据要求

使用隔离 v4.2.1 服务、测试账号和房间，联调结束恢复设备连接/偏好并停止临时服务与端口转发。已有脚本若固定 v4.2.0/fixture，应先调整断言与环境记录；历史 35/37/16/7 通过数不能直接算作新版本结果。

| 验收组 | 必测场景 | 通过证据 |
| --- | --- | --- |
| 房间/时序 | 主连接重连、令牌刷新、晚加入、影片/列表/状态乱序、等待中换片、房主转交 | 脱敏事件次序与代次；无旧片覆盖、无他机 9333 请求，权限与成员状态符合实际服务端 |
| B 站 | QR/退出/重登、分 P、自动/手动/失败恢复、CLI 不可用与管理员禁 DASH、真实 CDN 备用节点 | 实际 qn/编码、首帧、连续播放、seek/暂停、Range/206；无 Cookie/签名 URL/本机能力路径泄漏 |
| 文件/媒体 | MKV/MP4 各十分钟、HEVC Main 10/H.264、FLAC 16/24 位、分离轨、HLS 子资源、短 206/416/取消 | 设备与系统、容器和编码、画面帧/声音/时间推进、请求字节；鸿蒙 HEVC 零帧仅作为排查案例，不推断 iOS 成败 |
| 语音跨端 | iOS↔Android、iOS↔HarmonyOS、iOS↔官方 v4.2.1 网页；媒体单独断线与主连接断线、禁言/踢出 | 初始化 ACK 与换令牌证据、上下行帧及真人双向听感；蓝牙/扬声器/回声/来电/后台/弱网单独记结果 |
| 音乐 | 重复曲目、播放结束、暂停中解析完成、连续切歌、音质/账号/服务器切换、音乐与语音共存 | 队列位置、同步进度、退出后无旧流/重试；真实网易云账号/VIP/歌词与 fixture 区分 |
| 外观/方向 | 两种设备、浅深/系统主题、设置 Modal、键盘/大字体、全屏/旋转/源选择器、进程重启 | 原生截图、主题持久化、VLC 实例和播放连续性；b12 反馈逐项关闭或保留已知限制 |
| 发布 | 新 build 用户签名安装、冷启动、旧版升级、HTTP 局域网权限、后台恢复 | 构建来源、IPA 检查/SHA-256、测试清单、已知限制；编译成功与真机通过分开记录 |

每项记录 build、设备/系统、服务端版本、素材/账号类型、步骤、预期、实际、证据和剩余问题。暂停后允许播放器合理预缓冲，需统计是否停止持续下载；离房释放后不能继续请求旧媒体。同步暂沿用约 2 秒目标并记录测量条件。

## 10. 开发验证与维护交接

- 开始程序实现前遵循 `ZV-iOS/AGENTS.md`，按当前 Expo 主版本查对应文档；使用 CNG/config plugin/本地 Module，不手改生成 iOS 工程，不执行 Capacitor 同步到 iOS。
- 每阶段按改动增加有实际故障价值的回归：事件乱序、缓存隔离、重复队列、过期语音 ACK、取消/释放；复用 `ZV-iOS/tests/` 和现有脚本。根目录旧测试已在双端清理中删除，不照抄历史报告中的失效命令，也不删除 iOS 现有测试。
- 从 `ZV-iOS/` 运行 `npm test`、`npm run lint`、`npm run typecheck`，按需运行 Expo Doctor、iOS 导出和隔离服务联调；原生模块或共享 Go 变更须重新设备构建并检查 IPA。Doctor 历史警告重新记录，不能沿用旧通过数或隐藏警告。
- 每次程序版本构建完成后按维护准则做本地 Git commit，提交前检查范围。本次仅计划文档更新，不构成程序版本构建；后续不得把工作区其他端既有改动一并提交。共享 Go 来源必须可追溯到提交或明确源码摘要，禁止以“iOS 没改 Go 文件”为由跳过打包来源检查。
- 随实际交付更新本计划、`ZV-iOS/README.md` 与 `docs/releases/ios-<version>-<build>-unsigned.md`，同时修正双端维护文档中的过时 iOS 状态；历史证据不覆盖、不改写成新版结果。
- 未经后续发布指令不 push、打发布标签或上架。如发布 GitHub Release，说明按仓库规定依次使用“🚀 新特性 / Features”“🐛 错误修复 / Bug Fixes”“⚠️ 破坏性改动 / Breaking Changes”“⚡ 性能优化 / Performance Improvements”“📖 文档与依赖更新 / Documentation & Dependencies”，分隔线后附“完整变更记录”。
