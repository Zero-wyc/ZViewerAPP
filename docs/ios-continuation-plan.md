# iOS 继续开发与验收文档

更新日期：2026-09-30。适用目录：`ZV-iOS/`。产品基准：Android 1.2.1（根 package.json 与 CHANGELOG，Git HEAD `f815daf`）。
本文件依据本次代码检查和用户最新安排编写；标记为“已实现”不等于“真机已通过”。2026-09-30 按用户最新决策切换为单一 VLCKit，保留统一适配接口，服务端保持现有行为。原生模拟器编译与本地桌面/网页验证通过，尚未通过真机验收。详见 [单内核记录](releases/ios-1.2.1-2-vlc.md)。

当前 Expo 源码和历史验收文档大部分仍为未跟踪文件，另有根 README/PORTING/Capacitor 配置未提交改动；上述进度来自本地工作区，并非都已包含在 f815daf 中。本次文档提交不包含这些既有开发改动；恢复开发前须审查并单独保存 iOS checkpoint，避免误以为只检出 Android 标签就能恢复 Expo 现状。

## 1. 当前决策与必读材料

- iOS 采用独立 Expo / React Native 工程，在 Windows 开发，使用 EAS 的 macOS 云构建完成 iOS 原生编译；不再采用 Capacitor iOS 壳。
- iOS 仅使用 VLCKit，不保留 AVPlayer 或按后缀选内核。客户端主动适配 v4.2.0 现有 Range 分片；不要求通用代理取消 8 MiB 上限，不新增服务端转码/HLS。当前只在用户授权的本地服务端及本地视频测试，不访问 NAS。
- 界面与操作以 Android 为基准：同名入口、同序控制、同权限规则、同返回/退出语义；RN 采用原生组件实现，用户无需学习一套新流程。
- 开始每次开发前读取 [Expo 工程规范](../ZV-iOS/AGENTS.md)、[原改进方案](../../ios-app-improvement-plan.md)、[历史手册](ios-development-handbook.md)、[Windows 验收记录](ios-windows-acceptance.md)、本文及 [Android 更新记录](../CHANGELOG.md)。
- 历史手册中“iOS 仅是模板、未连接 API、模板图标、app.json 版本 1.0.0”等描述已过时；以本文件、当前代码和新的真机记录为准。历史验收记录不能证明今天的安装包已通过。
- 用户提供的改进方案位于仓库外；交接时须一并提供，不能把其中原本相对 docs/ 的链接当作现有位置下的有效源码链接。

## 2. 代码现状与证据

| 范围 | 当前实际状态 | 证据/限制 |
| --- | --- | --- |
| Android 基线 | 用户确认当前阶段开发完善；1.2.1 已包含内置 B 站代理、账号及自适应弹幕 | [CHANGELOG](../CHANGELOG.md)，后续共享修改仍需 Android 回归 |
| Expo 工程 | Expo ~57.0.26、RN 0.86.3、React 19.2.3、expo-libvlc-player 57.0.54、Expo Router | [package.json](../ZV-iOS/package.json)，与根 React 18 工程独立安装、独立锁文件；VLCKit pod 为 4.0.0a24 |
| 应用标识 | app.json 版本 1.2.1，iOS buildNumber 2，Bundle ID com.zviewer.mobile，已设置 ZViewer 图标和 iPad 支持 | [app.json](../ZV-iOS/app.json)；package.json 已统一为 1.2.1，build 2 尚未验收 |
| 连接/账号 | 服务地址、账号/游客登录、会话恢复、令牌刷新已实现；设备侧 SecureStore，Web 预览仅内存会话 | [首页](../ZV-iOS/src/app/index.tsx)、[会话](../ZV-iOS/src/state/session.tsx)、[服务协议](../ZV-iOS/src/lib/server.ts) |
| 房间 | 列表、创建、密码/审批、进入/离开、关闭、聊天、片单、Socket 重连已有实现 | [房间页](../ZV-iOS/src/app/room/[roomId].tsx)、[Socket](../ZV-iOS/src/lib/socket.ts)；完整角色/断线场景仍需真机对测 |
| 基础播放 | 单一 VLCKit、统一媒体适配、单轨源、播放/暂停/跳转、房间状态/心跳、重试及脱敏 Range 诊断 | [VLC 控制器](../ZV-iOS/src/lib/vlcPlayer.ts)、[视图](../ZV-iOS/src/components/VlcVideo.tsx)、[诊断](../ZV-iOS/src/lib/mediaDiagnostics.ts)；原生编译通过，真机播放待验收 |
| 布局 | 宽度 ≥900 且横屏时双列，左列约 60% 且最大 760；窄屏单列，聊天/片单/房间页签和全屏入口已有代码 | 布局只是第一版，旋转入口、控制栏等尚未全面对齐；需不同 iPad/iPhone 截图验收 |
| 构建/测试 | eas.json 已定义 development、ios-simulator、preview、production；现有 server/media/diagnostics 单测 | [EAS 配置](../ZV-iOS/eas.json)、[测试目录](../ZV-iOS/tests)；历史记录有 lint/类型/Doctor/JS 导出通过，无可据此认定验收的 IPA |
| 鸿蒙 | ArkWeb/HAP 客户端已完成并有发布记录 | 见 [鸿蒙维护架构](harmonyos-maintenance-architecture.md) |

历史 Windows/AVPlayer 记录不可沿用。单内核测试 21/21、Doctor 21/21、lint/类型/iOS JS 导出通过；EAS iOS 模拟器原生构建成功。签名真机构建仍缺凭据，无本轮真机通过证据，见版本记录。

## 3. 首要验收：客户端适配现有分片与真机播放

此前 AVPlayer 复测发现 Jellyfin 大/开放 Range 返回 8 MiB 分片。该历史结果仍保留，但不再据此要求服务端修改。现代码已：
1. 移除 expo-video/AVPlayer，所有单轨源统一使用 VLCKit，播放器自行管理 Range。
2. 仅对自己的服务端 API 使用当前会话鉴权；VLCKit URL 接口通过既有 `?token=` 鉴权，私有播放地址不写回房间、不广播、不记录完整 URL。
3. 移除 `rangeMode=avplayer`；保留原 path、反向代理前缀及现有服务端分片行为。
4. 诊断接受总长/偏移/长度正确的短 206，并核对下一分片；提供失败分类和重新播放。
5. 统一适配接口串行切源、令牌更新保留进度、过期原生回调隔离；扩大播放器时仍使用同一个原生视图。

服务端实验已移出正式源码；本轮验证使用未修改的 v4.2.0 本地服务端。桌面 libVLC 3.0.23 能跨分片续读两个测试文件，但与 iOS 的 VLCKit 4.0.0a24 不同，不能据此宣布真机全部编码/字幕可用。

恢复前必须完成：
- 记录实际服务端版本、代理路径及部署环境；不将取消分片上限作为恢复条件。
- 在 iPad 实际请求链核对 HEAD、起始/中间/末尾及开放范围 Range、206/Content-Range/Content-Length、416、取消和重连；HEAD 200 或一次短 Range 成功不算通过。
- Test/S01E01.mp4 连续播放至少 10 分钟、三个时间点拖动、暂停恢复、离房重进；另测原 MKV，按容器/编码结果明确支持或降级，不能仅因后缀认定可播放。
- 标准 H.264/AAC MP4、HLS 对照测试；房主/观众（含 Android）同步恢复后偏差目标约 2 秒，记录测量方式。
- 记录设备/iPadOS、Expo 宿主和应用构建号、服务端版本、脱敏日志。若仍失败，在 development build 采集原生播放器错误，继续定位，不继续堆叠后续媒体功能。

解除字段：上游 v4.2.0 标签 commit【cbc19ef8ad99371601d8282e58acfdf2fef2fae3】；本地范围【用户指定源码及视频，未连接 NAS】；原生构建【EAS 模拟器成功】；真机证据【未提供】；结论【单内核候选完成，P0 真机验收待完成】。证据见 [VLCKit 记录](releases/ios-1.2.1-2-vlc.md)。

## 4. 与 Android 的功能差异及实施顺序

| 能力 | iOS 尚需完善 | 实现及完成标准 |
| --- | --- | --- |
| 登录/大厅/房间 | 已有基础链路，缺完整等效验收 | 覆盖换服务器、过期刷新、游客限制、满员、密码、审批、踢出/房主变更、关闭、重连，服务端仍是权限最终依据 |
| 片单与媒体来源 | 现源转换已接受单轨 mp4/url/server-files/Jellyfin/Emby/WebDAV/FTP/OpenList/SMB URL，拒绝 audioUrl；已有片单不等于完整选源 | 对照 Android 添加/删除/排序/选片/分 P 与 B 站、Emby/Jellyfin、WebDAV/FTP/OpenList、挂载/服务器文件、番剧等入口逐一盘点，复用协议、RN 重写浏览器 UI |
| MP4/HLS 与同步 | 已有单一 VLCKit + MediaAdapter，真机同步未验收 | 保留统一接口，覆盖鉴权刷新、seek、音轨、失败恢复；HLS 子分片鉴权须独立实测 |
| 分离音视频/MKV/FLV/FLAC | MKV 已接入 VLCKit；其余能力与编码需分别验证 | 继续使用同一内核，原生适配特殊源；不新增备用播放器或默认实时转码大文件 |
| 字幕/弹幕 | 未移植完整渲染、轨道选择和样式设置 | 共享解析/时间轴/默认规则，RN 叠加层实现；手机/平板字号按等效视觉验证，弹幕随屏缩放默认开且手动设置持久保存 |
| 一起听 | 入口/模式存在，播放器仍占位 | 独立音频适配器、队列、搜索/账号/歌单/歌词和设置对照 Android；统一音频会话，测试切歌/拖动/后台与耳机 |
| 房间语音 | 未实现 | Android 现协议是 Socket.IO 中转 Opus/PCM，原生采集/编码/解码需兼容相同帧与信令；不能只在 iOS 换成 WebRTC。收起不挂断、离房释放 |
| 屏幕共享观看 | 未实现 | WebRTC 原生接收器沿用信令；OBS HTTP-FLV 路径需验证原生解封装或服务端兼容输出。两种路径分别验收，手机不发起采集 |
| 内置 B 站 CLI | 扫码/安全存储/本机代理/自动画质未接入 | Go 核心→Mac 工具链 XCFramework→Swift Expo Module；Cookie 留在 Keychain/原生，自动最高有权普通画质、排除 HDR/杜比、有限重试和优先 720p 回退 |
| 本机代理地址 | 当前 media.ts 拒绝 loopback，未来本机代理不能直接绕过该校验 | 新增独立、可信本机源类型，仅接受模块当前会话签发地址；房间广播继续拒绝 loopback/凭据，测试随机端口与过期 URL |
| 系统交互 | 旋转、沉浸、安全区、音频会话、来电/蓝牙、权限和后台恢复需完善 | Expo 模块/配置插件/Swift 实现；iOS 使用导航返回，不照搬 Android 最小化；统一资源释放 |
| 发布 | 已有本轮原生模拟器包，无签名 IPA | Apple 签名/设备、development build、TestFlight、升级保留数据与隐私用途验收 |

顺序：P0 单内核适配与真机播放验收 → P1 房间模块拆分/界面对齐 → P2 媒体、字幕弹幕、分离轨验证 → P3 一起听/语音/共享观看 → P4 B 站原生功能 → P5 发布。每个阶段可拆小版本，每版单独按第 7 节验收与提交。

## 5. 三端共享边界

目前尚无 `packages/shared` 或 `packages/protocol`。以下是待逐步抽取的设计，不是已实现共享。Android 与鸿蒙拟共享 Web 层，iOS 共享协议和纯逻辑。

| 内容 | 三端共享方式 | 不可直接共享部分/实现方法 |
| --- | --- | --- |
| REST DTO、Socket 事件、错误码、权限、房间状态转换 | 抽为不依赖 React 的 packages/protocol，三端消费相同 fixtures/契约测试 | 网络、认证存储、订阅清理由各端注入；当前已有重复实现需逐模块迁移 |
| URL 规范化、字幕/歌词/片名解析、同步偏差计算、队列规则 | 审计依赖后抽 packages/shared | 清除 window/document/localStorage、DOM、Capacitor 依赖；不能复制整个 upstream |
| 画质规则、账号权限、失败回退 | 共享纯策略和测试样本 | 能力检测 Android/ArkWeb 用浏览器能力，iOS 用真实播放器；不能共享 mediaCapabilities 调用 |
| 页面与设计 | 共享名称、顺序、图标/素材和设计 token 规范 | Android/鸿蒙复用 React DOM/CSS（经 ArkWeb 验证）；Expo 以 View/Text/Pressable 重写，不能载入 dist 当原生页面 |
| 播放/语音协议 | 共享接口、状态、信令和音频帧契约 | Android Web API；iOS 原生视频/音频/编码；鸿蒙先 ArkWeb，缺失能力通过 ArkTS/Native 适配 |
| Go bilicore | 共享核心源码/测试/许可 | Android AAR；iOS XCFramework+Swift；鸿蒙须先验证工具链/ABI，不能把 AAR 或 gomobile iOS 产物当鸿蒙库 |
| 安全存储与宿主桥 | 共享非秘密 DTO、生命周期契约 | Android Keystore/Java；iOS Keychain/Expo Module；鸿蒙 HUKS 等安全能力/ArkTS。凭据及本地数据库不跨设备自动同步 |

根 `src/platform/contracts.ts` 仍有 MediaStream/Window 类型，`bilibiliProxy.ts` 依赖 React 与 Capacitor且限制 Android；它们只是 Web 宿主边界，不是可直接导入 Expo 的跨端 SDK。纯协议包不能绑定 React 18 或 19。

## 6. 开发规范与界面对齐

1. 使用 Expo Router；路由只组装房间会话、播放器、评论、片单、工具、语音模块。进度高频刷新留在播放器内部。
2. Expo API 以安装版本 57 的官方文档和 AGENTS.md 为准；模块安装使用 expo install，保留锁文件。
3. 使用 CNG、config plugin 和本地 Expo Module；不手工维护生成的 ios/android 目录，不执行 cap add/sync ios。
4. Windows 可做 JS/TS、测试、导出和发起 EAS；原生开发构建在远程 macOS 执行，Go iOS 绑定需 Mac 工具链。Expo Go 不能验收自定义 Swift/Go 原生模块。
5. Android 操作对照：连接→登录/游客→大厅→房间；顶栏返回/房名/旋转/语音/设置；聊天/片单/房间页签；播放控制同顺序。横屏双列、竖屏单列、全屏明确进入退出，切页签不销毁播放、草稿或语音。
6. 逐项对照手机窄屏、两种 iPad 尺寸、横竖屏、安全区、键盘与较大字体；记录截图差异，业务行为不得因原生控件不同而改变。
7. 错误分类可解释且可重试；凭据不进入日志、广播和截图；请求取消、媒体/Socket/音频释放有明确所有者。

官方核对入口：[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)、[Windows 与云构建](https://docs.expo.dev/faq/)、[development build](https://docs.expo.dev/develop/development-builds/introduction/)、[EAS iOS 真机构建](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/)。EAS 配置文件存在不代表账号、签名或构建已就绪。

## 7. 每个版本的强制测试与 Git 记录

每次完成版本（包括内部测试版）必须先做可行性测试，再保存 Git 提交；用户真机验收未通过前不进入下一步功能添加。不以“能编译”代替“能使用”。

- 在 ZV-iOS 执行 npm test、npm run lint、npx tsc --noEmit、npx expo-doctor、npx expo export --platform ios，记录真实结果，不复制历史数字。
- 生成签名 development/preview 构建，实测启动、登录、房间、此次新增链路、播放10分钟/seek、重连、横竖屏、权限/耳机/后台；iPhone/iPad 与 Android 跨端对测。
- 修改共享协议/Go 核心时，运行根目录 `npm run build`、`npm run android:sync` 和 Android 构建；涉及已有鸿蒙能力时重新生成 `rawfile/web` 并回归对应 HAP。
- 在 docs/releases/ios-<版本>-<构建号>.md 记录版本、代码提交、上个通过标签、环境/服务端/设备、复现步骤、通过/失败/阻塞、截图脱敏日志、安装包位置和 SHA-256、用户结论。
- 无真机/签名或上游未修复时可提交 checkpoint，但版本状态必须是“阻塞/未验收”，不得写成已完成或创建通过标签。
- 仓库根为 ZViewer-client；提交前检查 git status、git diff --check、git diff --cached；只暂存该版明确相关文件，禁止 git add . 混入他人的未完成工作、密钥、令牌和安装包。
- 通过测试后提交代码、锁文件、更新记录与测试记录，例如 git commit -m "feat(ios): complete <scope> with validation"；以唯一 ios-v<版本>-b<构建号> 标签保存通过点。测试记录可写被测提交，最终记录提交/标签把版本串联起来。
- 回滚用 git revert <提交> 创建可追溯撤销提交，再构建/回归；已发布包以递增 buildNumber 发布恢复代码，不能通过降低构建号覆盖升级。不得用 reset --hard 抹除历史。
- 未授权时不自动 push、上传商店或发布。每版完成报告必须包含 commit、测试结论、安装产物与残余阻塞。

### 版本记录模板

版本/构建号：
被测 commit / 最终提交或标签：
上一个通过版本：
上游修复与服务端版本：
设备/系统/Expo 宿主：
变更范围与 Android 体验对照：
测试命令、步骤、通过/失败/阻塞：
IPA/测试入口、SHA-256、脱敏证据：
用户真机结论：
回滚目标与恢复步骤：
