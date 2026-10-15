# Android / HarmonyOS 手机屏幕共享交付与更新方案

- **状态**：实施中；已实现隔离在 Debug 包中的原生验证链路，尚未完成双端交付
- **日期**：2026-10-15
- **仓库**：E:/Codex-bulid/ZViewer/ZViewer-client
- **基线**：客户端 1.9.5 / versionCode 195
- **范围**：Android 与 HarmonyOS 手机作为房主采集并共享自身屏幕，房间观众实时观看

2026-10-15 执行记录见 [模拟器验证报告](mobile-screen-sharing-validation-2026-10-15.md)。用户已说明暂时没有真机，并要求先做模拟器测试。模拟器证据单独记载；本方案原有的双端真机退出条件保留。正式包继续关闭未经验证的房主采集能力，不发布“双端已支持”的 Release。

## 1. 目标与完成定义

房主进入移动端“屏幕共享”房间后，可以主动开始屏幕捕获；系统授权后，手机屏幕实时发送到房间，观众能够观看。房主可以暂停、恢复和停止。授权拒绝、系统停止捕获、网络断开、房间关闭、切换模式、离房或应用销毁时，采集、编码、PeerConnection、前台任务和桥接监听都必须可靠释放。

交付完成意味着：共享平台契约、Android 原生采集、HarmonyOS 原生采集、移动房主界面、现有观众兼容、自动化测试、双端真机验收、两份维护文档更新、双端安装包构建及本地 Git 提交均完成。浏览器测试或模拟器单独通过不能作为原生屏幕共享验收。

## 2. 当前代码基线与边界

### 已有实现

- 房间模式为 src/upstream/store/roomStore.ts 中的 screen-share。
- 移动房间入口为 src/mobile/MobileRoom.tsx。
- 移动 WebRTC 观众端为 src/upstream/modules/screen-sharing/components/WebrtcWatchPage.tsx。
- OBS/FLV 观众端为 src/upstream/modules/screen-sharing/components/StreamPushViewer.tsx。
- 桌面房主参考为服务端源码目录 frontend/src/modules/screen-sharing/components/WebrtcSharePage.tsx，以及 hooks/useLocalMediaStream.ts、hooks/useHostPeerConnections.ts。
- 服务端已有 viewer-ready、sharer-ready、signal-offer、signal-answer、signal-ice-candidate、viewer-joined、viewer-left 等房间信令。
- Android 使用 Capacitor 插件；HarmonyOS 使用 ArkWeb 与 window.zviewerNative 桥。
- 共享平台契约位于 src/platform/contracts.ts，平台分派位于 src/platform/runtime.ts。
- Android 当前 target SDK 为 36；HarmonyOS 使用 ArkTS/ArkWeb。

### 当前缺口

MobileRoom.tsx 的 screen-share 分支只渲染观众端，尚未按 room.isHost 分流到手机房主采集页。桌面房主依赖浏览器 getDisplayMedia()，不能据此推断 Android WebView 或 HarmonyOS ArkWeb 可直接采集屏幕。双端都缺少原生采集、WebRTC 发送端接入、系统停止处理和完整清理。

### 不可越过的项目边界

- 客户端源码和 Git 操作只在 ZViewer-client 中完成。
- 服务端源码目录只用于合同核对和本地测试；未经授权不得 SSH 修改 NAS 容器。
- 共享 UI/业务逻辑放在 src/mobile、src/upstream；原生能力经 src/platform 契约调用。
- HarmonyOS entry/src/main/resources/rawfile/web 是生成目录，只通过 npm run harmony:web 更新。
- iOS 不属于本方案，不启动 iOS 构建。
- 不将屏幕帧、Cookie、token、私有服务器地址、推流密钥、账户信息放进日志、广播、源码或 Release。

## 3. 总体方案与关键决策

### 首选：原生采集 + WebRTC

继续使用 screen-share 房间和现有 WebRTC 观众端。Android MediaProjection 与 HarmonyOS 原生屏幕采集生成实时视频；由原生 WebRTC Sender 发送，Socket.IO 复用现有信令转发。

~~~mermaid
flowchart LR
  UI[移动房主界面] --> P[src/platform 屏幕共享契约]
  P --> A[Android 原生采集]
  P --> H[HarmonyOS 原生采集]
  A --> W[WebRTC Sender]
  H --> W
  W --> S[现有 Socket.IO 信令]
  S --> B[服务端信令转发]
  B --> V[现有 WebRTC 观众端]
~~~

首先验证“原生采集帧如何进入发送端”。不能仅假设原生帧可以注入 React 的 MediaStream 或 WebRTC JS SDK。PoC 应比较：原生端完整负责 PeerConnection/SDP/ICE，或采用双端可维护的共享原生 WebRTC 层。必须保持房间信令 DTO 一致，避免原生与 JS 各自持有冲突的 PeerConnection 状态。

### 备用：原生采集 + 现有推流服务

若 HarmonyOS 在目标 SDK 和真机上无法可靠完成 WebRTC 发送，再评估原生编码并推送现有 NMS/RTMP，观众走现有 FLV 播放端。备用路线依赖推流服务，延迟更高，须单独验证推送鉴权、断线恢复、编码和热量。能录屏到文件不代表实时共享成功。

本需求不是 DLNA、Chromecast、AirPlay 或电视投放，不新增同义房间模式。

### 房主/观众分流

- room.isHost 且 mode 为 screen-share：新的移动房主共享控制页面。
- 非房主且 mode 为 screen-share：保留现有 WebRTC 或 OBS 观众页面。
- 桌面 Web 房主/观众流程继续独立。
- shareMethod 仍为 webrtc | stream-push。能力不支持时显示明确原因，不能让房主误入观众等待页面。

## 4. 共享平台契约与状态机

实现 UI 前冻结跨端一致的接口和错误语义。建议新增 src/platform/screenShare.ts facade，契约放入 contracts.ts；具体字段可按项目习惯定名，但双端含义必须一致。

采集状态：

~~~
idle → requesting-permission → starting → sharing ↔ paused
                                      ↘ stopping → stopped
任何活动状态 → error
~~~

传输状态独立维护：

~~~
idle → waiting-viewers → connecting → connected
                                 ↘ degraded / disconnected
~~~

没有观众不代表本机停止采集；传输断开也不代表系统已停止采集。

契约至少支持：

- 查询平台能力：屏幕视频、麦克风、系统音频、后台能力。
- 在明确用户操作后 start 并申请授权，返回唯一 sessionId。
- 幂等、可取消的 stop、pause、resume。
- 事件订阅：状态、capture-ended、permission-denied、错误和统计。
- 清楚定义 SDP、ICE、PeerConnection 的所有权及交换边界。
- 查询真实采集设置：宽高、帧率、真实存在的音轨。
- disconnect/dispose 覆盖离房、切模式和页面销毁。
- 所有事件带 sessionId/generation，过期回调不得覆盖新会话。

统一错误类型至少包括 unsupported、permission-denied、capture-start-failed、capture-ended、encoder-failed、transport-failed、cancelled。原生技术错误需脱敏，用户提示应可理解且可重试。

## 5. Android 实施方案

### 原生职责

用 MediaProjection 完成用户授权和采集；根据 PoC 决定 WebRTC VideoSource 的输入方式。实现视频编码、可选音轨、PeerConnection、系统停止回调、前台服务与通知、生命周期、事件桥接和资源释放。插件由 MainActivity 注册，通过 src/platform facade 暴露给 UI。

官方实现要求须按当前系统、SDK 与 target 版本核对：[Android Media projection overview](https://developer.android.com/media/grow/media-projection)。当前 target SDK 36，前台服务类型、相关权限、通知授权和 MediaProjection token 生命周期不能照抄旧版示例，需以当前 SDK 文档及真机结果为准。

### 首版能力建议

- 720p、30fps、H.264 为初始目标。
- 画面优先；麦克风可选。
- 系统音频先探测、单独验收，不承诺所有版本和应用都能捕获。
- 网络不足时先降帧，必要时降分辨率。
- 首版不承诺 4K、默认 60fps、无限时后台共享或复杂混音。
- 先通过单观众，再扩展至少 4 个观众并评估热量、耗电和编码负载。

### 生命周期要求

- 用户拒绝：回到 idle，提示原因并允许重试。
- 系统界面或通知停止：接收回调，关闭发送端并同步 UI。
- 旋转：不重复请求授权、不创建第二个 projection。
- 后台：符合系统条件时继续共享，并保留系统要求的前台通知/服务。
- 离房、切换模式：停止采集、编码、PeerConnection 和前台服务。
- 系统回收：下次进入不能残留“正在共享”状态。
- 麦克风拒绝：若麦克风不是强制项，应允许仅视频并明确提示。

## 6. HarmonyOS 实施方案

### 首要技术风险

首先确认目标 DevEco SDK/系统 API 是否能提供连续视频缓冲，而不只是录制文件；缓冲能否送入硬件编码和 WebRTC Sender；再核实 ArkWeb 生命周期、后台持续任务、来电中断及系统停止。录屏文件 API 只能证明文件录制，不证明实时共享链路可用。

建议桥接路径：

~~~
src/platform/contracts.ts → runtime.ts → screenShare facade
  → window.zviewerNative → bridge-bootstrap.js → Index.ets
  → ScreenCapture service / WebRTC sender
~~~

桥接修改同步核对 TypeScript 契约、bootstrap、Index.ets action 分发和 service。React 组件不直接写 ArkTS 特例；固定 https://zviewer.local 来源校验不能放宽。

### 首版能力建议

- 720p/30fps、H.264、视频优先。
- 麦克风单独授权、单独开关。
- 系统音频、后台共享作为单独能力，接口存在不代表功能已支持。
- PoC 成功标准是另一台设备持续收到实时视频帧。
- 若目标 SDK/设备无法提供可靠实时缓冲，记录具体阻塞并评估备用路线；不得把文件录制标为实时共享完成。

## 7. 移动 UI 与音频策略

房主页应显示：开始共享及授权说明、共享和连接状态、观众数、实际分辨率/帧率、暂停/恢复/停止、麦克风开关、系统音频能力提示、失败原因、聊天和离房入口。

观众页覆盖等待房主、连接中、共享中、房主停止、断线重连和房间关闭，不显示房主控制。方向、全屏和系统栏复用现有 playerDisplay 能力；退出、离房和切换模式须恢复原状态。

首版先支持“仅画面”和“画面+麦克风”。系统音频分别在双端真机验证后再开放。屏幕捕获音频、麦克风和 LiveKit 房间语音不可未经测试直接混合，以免回声、重复音频和音频焦点冲突。

## 8. 分阶段计划与退出条件

### 阶段 0：合同审计

核对服务端房间权限、批准和信令 payload；阅读桌面端 PeerConnection、ICE 缓存、停止/重连；确定房主/观众分支、平台契约、音频策略、SDK 和测试设备。

**产出**：信令与原生桥契约草案、风险表。
**退出条件**：明确不需服务端变更，或明确 DTO/权限变更及 PR 计划。

### 阶段 1：Android 真机 PoC

验证 MediaProjection 授权、采集预览、H.264 编码、单观众 WebRTC、通知停止、旋转、后台和反复启停。持续至少 10 分钟，记录实际帧率、分辨率、热量、耗电与异常。

**退出条件**：另一设备持续收到帧；停止和退出后采集/编码/连接资源释放。

### 阶段 2：HarmonyOS 真机 PoC

验证授权、连续视频缓冲、编码、WebRTC 输入，并用 Android 或另一台 HarmonyOS 设备观看；覆盖来电、前后台、停止、页面销毁和重复启停。

**退出条件**：另一设备持续看到实时画面。未通过时记录阻塞 API/数据边界，再评估备用推流。

### 阶段 3：共享契约与信令

实现共享 facade、原生桥、事件订阅及替身测试；接入原生媒体轨道和现有 viewer-ready、sharer-ready、offer/answer/ICE。覆盖观众先到、房主先开、晚加入、多观众、离开、断线重连。只在 PoC 证明必要时改服务端，且走本地测试和 PR。

**退出条件**：现有 WebRTC 观众端能观看；停止和观众离开后连接按会话关闭。

### 阶段 4：移动房主 UI

改 MobileRoom.tsx 房主/观众渲染分支；增加控制页和审批反馈；接入返回键、方向、聊天、语音与房间 teardown；unsupported 能力给出准确信息。

**退出条件**：双端完成开始、观看、暂停、恢复、停止、重新开始及离房。

### 阶段 5：稳定性、文档、构建

跨端真机观看、至少 4 观众；覆盖断网、重连、后台、旋转、系统停止、权限撤销、来电和重复启停；更新两端维护手册与版本说明；构建双端并本地提交。

**退出条件**：验收矩阵通过；问题和限制记录完整；Release 包通过签名、版本和资源核对。

各阶段用小型 Git commit 保存可回退点。PoC 通过前不大面积重构观众端，也不同时引入音频混音。

## 9. 测试与真机验收

### 自动化覆盖

- 房主/观众组件分支及 unsupported capability。
- 状态机、取消、重复调用、旧 session 回调。
- 授权拒绝、系统停止、房间关闭、离房 teardown。
- viewer-ready 与 sharer-ready 任意顺序。
- offer/answer/ICE 排队、多观众加入离开和重连。
- 主题、320/360/393 窄屏、横屏安全区、返回键。
- 一起看、OBS 观众端、聊天、语音回归。

基础命令：

~~~powershell
npm run test:adaptation
npm run test:media
npm run build
~~~

再运行 npm run android:sync、npm run harmony:web。自动化应验证行为和合同，不要只复制实现细节。

### 真机矩阵

| 房主 | 观众 | 必测内容 |
| --- | --- | --- |
| Android | Android | 授权、720p/30fps、停止、重启、后台 |
| Android | HarmonyOS | 跨设备 SDP/ICE、画面、重连 |
| HarmonyOS | Android | ArkTS 采集/编码到 Android 解码 |
| HarmonyOS | HarmonyOS | ArkWeb 生命周期、连续帧、系统停止 |

逐端测 1/2/4 个观众、Wi-Fi 与 TURN/中继、连续 10 分钟、旋转、后台、房主离房、观众离开和系统撤销。记录机型、OS/API、SDK、网络、实际 codec/分辨率/帧率、首帧耗时、失败与清理结果。模拟器、fixture、本地回环证据需单独标注。

建议首版目标：正常网络首帧不超过 5 秒；720p/30fps；持续 10 分钟无致命中断；4 个观众；停止后采集、编码、连接和前台任务均释放；权限与网络错误可区分。PoC 后可以调整指标，但要记录依据。

## 10. 性能、隐私与资源清理

- H.264 优先；首版 720p/30fps。
- 网络或温度压力时明确降级，UI 展示实际值，不展示目标值冒充结果。
- 可记录宽高、帧率、码率、连接状态、丢包/重传和时长。
- 不记录屏幕帧、屏幕文本、密码、Cookie、token、私有 URL 或推流密钥。
- 系统通知/持续任务明确表明正在共享并遵循系统停止机制。
- 建议清理顺序：标记 stopping → 停止新连接 → 停止 tracks → 关闭 PeerConnection → 停编码器 → 停采集 → 释放 Surface/VirtualDisplay/buffer → 停前台任务 → 清会话状态。
- 单步清理失败不能阻塞其余释放；日志脱敏。
- 所有停止路径幂等，并以 sessionId 防止旧会话污染新会话。

## 11. 服务端变更策略

优先不改服务端：原生 Sender 能兼容现有信令和观众端时，仅修改客户端。只有权限、payload 或多观众流程确实不足时才改服务端。需先在 E:/Codex-bulid/ZViewer/ZViewer-source code 本地复现和测试，说明 DTO、权限、兼容与回滚；默认向 Zero-wyc/ZViewer 提 PR。不得未经授权连接 NAS SSH 修改容器。客户端代码和 Git 仍只在 ZViewer-client。

## 12. 维护文档同步

Android 实现后更新 docs/android-maintenance-architecture.md，记录 MediaProjection、插件/服务/权限入口、前台任务、生命周期、采集到编码/WebRTC/信令的数据流、音频能力、故障定位、清理顺序和真机验收设备。

HarmonyOS 实现后更新 docs/harmonyos-maintenance-architecture.md，记录采集 API、ArkTS service/bridge action、连续视频缓冲到编码/WebRTC 的实际路径、权限/持续任务、后台/来电行为、ArkWeb 事件和销毁清理、目标 SDK、设备验证和限制。

两份文档记录日期、客户端版本和测试证据，并区分浏览器、模拟器、真机及跨端证据。源码不能包含账户凭据或 AGENTS.md。

## 13. 构建、提交与发布

共享实现验证：

~~~powershell
npm run test:adaptation
npm run test:media
npm run build
npm run android:sync
npm run harmony:web
~~~

再分别 Debug 验证及构建 Android APK、HarmonyOS HAP Release。核对版本号、签名、包内网页资源、权限声明和安装启动。每个最终安装包只做一次 SHA-256；不重复无关校验。确认源码不含 AGENTS.md、签名材料、密码、账号、Cookie、缓存或测试产物。可交付阶段完成后在 ZViewer-client 本地提交，不在其他工作树提交客户端代码。

Release 标题：ZViewer-Client V<版本号>。说明采用固定结构：

~~~markdown
## 🚀 新特性 / Features
## 🐛 错误修复 / Bug Fixes
## ⚠️ 破坏性改动 / Breaking Changes
## ⚡ 性能优化 / Performance Improvements
## 📖 文档与依赖更新 / Documentation & Dependencies
---
**完整变更记录**：
~~~

发行说明注明双端支持范围、传输方案、麦克风/系统音频能力、验证设备/系统版本、已知限制；iOS 不属于本次交付。默认发布 APK、HAP、统一 SHA256SUMS.txt，不另行打包 Source Code。

## 14. 故障定位

### 没有房主开始按钮

依次检查房间角色与模式、MobileRoom.tsx 分支、facade capability、原生插件注册/桥 action、APK/HAP 内 Web 资源是否最新。

### 授权成功但观众无画面

依次检查原生连续帧、编码输出、WebRTC video sender、viewer-ready、SDP/ICE、观众 remote track、真实解码帧。房主预览成功不代表远端发送成功。

### 房主停止后观众仍卡住

检查系统停止回调、房主 teardown、共享状态通知、观众 track ended/UI，以及旧 session 回调。

### 离房后通知仍存在或占用资源

检查房间关闭、主动离房、切模式、异常和宿主销毁是否调用 teardown；逐项检查采集、编码器、PeerConnection、Surface/VirtualDisplay、前台任务和事件监听。

### HarmonyOS 可录文件但实时观看失败

确认接口提供连续缓冲，再检查格式、硬件编码、WebRTC 输入和生命周期。文件录制成功不能记作实时共享完成。

## 15. 最终交付清单

- [ ] 移动房主/观众页面正确分流。
- [ ] Android 原生采集、系统停止处理通过真机验收。
- [ ] HarmonyOS 连续采集、编码及观看通过真机验收。
- [ ] 现有信令兼容，或服务端变更已走 PR。
- [ ] 开始/暂停/恢复/停止/重启/离房完整。
- [ ] 多观众、跨端观看、断线恢复和资源释放通过。
- [ ] 权限和前后台行为符合当前系统规则。
- [x] 共享层与平台桥自动化测试通过（15 项新增；不代表鸿蒙原生采集通过）。
- [ ] 一起看、OBS 观众端、聊天、语音回归通过。
- [ ] 双端维护文档、README/CHANGELOG/Release 说明同步。
- [ ] APK/HAP 版本和签名核对完成；每包一次 SHA-256。
- [x] 客户端改动只在指定仓库并已本地提交（实现检查点 9f4e94c；后续文档提交记录模拟器结果）。
- [ ] 无凭据、签名材料、AGENTS.md、生成缓存或测试数据。
- [x] 未启动 iOS 构建。

## 16. 推荐执行顺序

1. 评审并冻结信令/平台契约。
2. Android MediaProjection + 单观众 WebRTC 真机 PoC。
3. HarmonyOS 连续采集 + 单观众真机 PoC。
4. 按 PoC 结果确定 Sender 架构和首版音频边界。
5. 实现共享 facade、状态机和桥接测试。
6. 接入现有信令、多观众及重连。
7. 实现移动房主 UI，保留现有观众页面。
8. 完成双端真机交叉验收和清理验证。
9. 更新维护手册、版本说明并构建双端。
10. 本地提交并按项目发布流程交付。

阶段 1、2 未通过前，不应宣称双端已支持手机屏幕共享，也不能用录屏文件或模拟器演示替代实时跨设备验收。
