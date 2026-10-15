# 手机屏幕共享：设备与模拟器验证记录

日期：2026-10-15。基线：Android/HarmonyOS 1.9.5 / 195。状态：**鸿蒙 v5 用户真机确认通过，新增实测帧率显示已构建；Android 原生模拟器验收进行中，未发布 Release**。

用户最初没有真机，后续连接鸿蒙平板并明确指定“先验证鸿蒙，安卓通过虚拟机验证”。鸿蒙设备现已完成用户 v4、v5 确认；Android 的虚拟机证据按约定验收范围记录。本报告分别记载原生实帧、浏览器替身、本地信令中继与真机，不能互相替代。原始交付标准及后续范围调整见 [交付计划](mobile-screen-sharing-delivery-plan.md)。

## 后续真机与音频、画质验收（当前进度）

- 鸿蒙：HarmonyOS 6.1/API 24、arm64 平板，真实既有房间信令与访客入房。v4 一次授权持续约 10 分 38 秒，前后台持续采集 H.264 1080×720；中途重新连接观众成功，另有 4 位观众同时接收 150 秒、各路解码帧持续推进。连续任务实际包含 audioRecording/audioPlayback，分别有匹配子模式，未挂起。
- 系统声音：媒体 440 Hz 经原生采集、发送及 Chrome 接收测得；暂停时 RMS 为零、恢复后继续。本机麦克风有实际非零输入；共享与房间语音共用一个录音源，加入语音不另开 getUserMedia。
- 房间语音：真实 LiveKit 服务器路径下，同一设备的独立 ArkWeb 参与者向房主发送合成 880 Hz。房主接收约 RMS 0.07；共享系统 440 Hz 明显，880 Hz 比系统频带低约 47–60 dB，未观察明显语音回录。这不是第二台实体设备跨公网语音验收。Windows Chrome 第二语音参与者曾因 ICE 失败未接通，不能写成该路径通过。
- 停止：原生持续任务为空，无 live MediaStreamTrack/PeerConnection，已创建 AudioContext 均关闭。用户要求安静后已关闭所有鸿蒙调试音源和语音，将设备交还用户手测。用户随后确认 v4 通过，并确认 v5 的分辨率、帧率档位操作通过。
- 画质：本机、720P、1080P、2K（1440P）、4K（2160P），30/60/90 为目标档；尺寸保持比例、不放大源画面。Android 原生逐档接收解码已取得 576×1280、864×1920、1080×2400；后面 2K/4K/本机受到源 1080×2400 限制。另测 720P/60、720P/90 和 4K/90；发现编码端旧 30 fps 限制后已改为所选目标，并按实际像素及帧率调整码率预算，复测继续进行。
- 鸿蒙帧率专项：v5 本机 2880×1920、目标 90、没有观众连接时，直接读 MediaStreamTrackProcessor 原始帧约 24.7 fps；720P/60 配合用户动态操作时 10.053 秒收到 400 帧，按帧时间戳约 39.7 fps、帧间隔中位数 17.24 ms。因此没有固定 30 fps 限制，但配置 60/90 不能作为达到该帧率的证据。系统原生录屏接口文档说明最高 60 fps，超出按 60 处理；后续包将鸿蒙 90 档标为不可用，并用只读 VideoFrame 克隆计数显示采集实测，不能把 getSettings().frameRate 作为实测。无额外像素处理、编码或音频输出，停止清理私有 clone/reader。文档：[官方 AVScreenCapture](https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-media-kit/capi-native-avscreen-capture-h.md#oh_avscreencapture_setmaxvideoframerate)。
- Android：Android 17/API 37、x86_64 模拟器，MediaProjection/AudioPlaybackCapture/原生 WebRTC 经本地鉴权 TURN 与 Chrome 实际解码、音频采样。其他应用系统音 440 Hz、合成麦克风 880 Hz、源禁止捕获、本 UID 排除、暂停静音、WebView 麦克风硬件交接与已知管理员禁言保持均已测；10 秒样本时长 10.04 秒、墙钟 10.036 秒。重新接管后的合成输入音质正在复核，尚不据非零 RMS 标记全量音频通过。测试媒体音量为零、接收端静音，主机真实麦克风关闭。
- 当前 145 项适配回归通过。UI 替身验证覆盖 4 个视口、档位转发、运行时锁定/停止后可改、OBS/能力禁用；这不属于真机高帧率证明。原始调试记录位于忽略目录，不公开私有地址、设备标识或凭据。安装仍通过用户 HoKit 流程；没有把本地签名成功当成 HDC 安装成功。

尚未发布正式 Release；复杂公网 NAT/TURN、长期热量与耗电仍未形成通过证据。后文为首轮视频 PoC 的历史记录，其视频限定与鸿蒙模拟器失败不覆盖上述后续真机结果。

## 首轮实现范围与门控（历史记录）

- Android：MediaProjection + 原生 WebRTC Sender，专用前台服务和停止通知；仅 Debug 可用。
- HarmonyOS：ArkWeb 原生 ScreenCaptureHandler 授权路径与平台发送后端；仅 Debug 允许尝试，当前模拟器未返回采集流。
- 移动房主与观众正确分流；验证包可创建或切换 screen-share 房间。原有 WebRTC/OBS 观众页保留，OBS 房主显示电脑推流说明。
- 共享控制：明确用户操作后开始、暂停视频发送、恢复、停止；屏幕共享房主接收入房审批。暂停仍持有系统采集，页面明确提示停止才能结束采集。
- 当前只有视频；麦克风、系统音频、混音和 HarmonyOS 后台采集均未开放。发送连接上限为 4，更多观众不会创建额外编码连接。
- 正式包的能力查询与原生开始入口双重门控；源码版本和公开发行仍是 1.9.5 / 195，没有将 PoC 标为新正式版本。

## 合同审计

服务端核对范围为本地只读源码 `backend/src/modules/webrtc-signaling/`、房主注册与观众加入处理器，以及桌面 `frontend/src/modules/screen-sharing/`。未修改服务端、未连接 NAS SSH。

| 事件 | 客户端发送 | 服务端转发/约束 |
| --- | --- | --- |
| viewer-ready | `{ roomId }` | 校验已入房，向房主发送 `{ from: socketId }` |
| sharer-ready | `{ roomId }` | 校验房主权限，向其他成员广播 `{ roomId }` |
| signal-offer | `{ to, data: { type: 'offer', sdp } }` | 校验双方同房，转发 `{ from, data }` |
| signal-answer | `{ to, data: { type: 'answer', sdp } }` | 同房校验并转发 |
| signal-ice-candidate | `{ to, data: RTCIceCandidateInit }` | 同房校验并转发 |
| viewer-left | 接收 `{ viewerSocketId }` | 释放该观众的连接，不停止本机采集 |

现有 DTO 足以交换原生 Sender 的 SDP/ICE，不需要先改服务端协议。原服务端没有专门的共享停止通知；当前关闭发送连接并依靠观众端的连接状态与重连流程。停止提示、自动恢复和整个真实房间的完整端到端体验仍属于后续验收，不能由本地 DTO 中继试验替代。

房主采集 sessionId 与观众 socket peerId 独立。平台后端拥有媒体轨道、编码和 PeerConnection，`screenShareSession.ts` 只持有控制状态与信令映射；没有通过 React MediaStream 注入原生视频帧。每次开始生成新 sessionId，旧授权结果、旧 ICE、旧统计和旧停止事件不能覆盖新会话。

### 平台接口

契约在 `src/platform/contracts.ts`，facade 在 `src/platform/screenShare.ts`：

| 操作 | 返回/语义 |
| --- | --- |
| getCapabilities | video、microphone、systemAudio、background、experimental、reason |
| start | sessionId + ICE 配置；明确用户操作后申请授权，返回实际采集设置 |
| pause/resume | 当前 session 的视频轨道发送开关，不复用系统授权重新开采集 |
| stop | 当前 session 失效并释放资源；重复/过期 stop 不影响后续会话 |
| createOffer/setAnswer | 平台独占 PeerConnection，前端仅转发 SDP |
| addIceCandidate | 有界缓存 remote description 之前到达的 ICE |
| removePeer | 释放一个观众的连接 |
| screenShareEvent | state、capture-ended、error、ice、peer-state、stats，均带 sessionId |

会话在 socket 断开、房间关闭、离房、切模式、pagehide 和组件销毁时停止；重新联网后不自动再次申请屏幕捕获。错误只显示统一的本地说明，原生技术错误和网络细节不直接呈现给用户。

## 原生路径与权限

### Android

`MainActivity → ScreenSharePlugin → MediaProjection 系统授权 → ScreenShareService 前台任务 → VirtualDisplay/Surface → SurfaceTextureHelper → VideoSource/VideoTrack → 每观众 native PeerConnection`。

固定依赖：`io.github.webrtc-sdk:android:144.7559.15`；compile/target SDK 36，min SDK 24。Manifest 增加普通权限 ACCESS_NETWORK_STATE 和 FOREGROUND_SERVICE_MEDIA_PROJECTION，服务非导出且 START_NOT_STICKY。API 24/25 与 26+ 分别使用兼容通知与通知通道。

每次新采集都重新请求系统授权，得到授权后才启动前台服务并消费一次 token。旋转调整现有 display 与纹理，避免再次创建 projection。系统回调、通知停止、宿主销毁走同一个释放入口。优先协商设备实际提供的 H.264，保留其他视频编码回退；实际 codec 以接收端统计为准。

已修复模拟器 PoC 发现的缺少 ACCESS_NETWORK_STATE 问题：原生 WebRTC 的网络监视器此前抛 SecurityException 并使进程中止。补齐权限后已进入实际编码/跨端解码验证。清理顺序还调整为先停止帧投递和轨道，再关闭连接和释放编码资源。

Android 桥参数日志和原生 WebRTC 常规日志已关闭，避免 SDP/ICE 中的临时凭据与地址进入常规日志。测试生成的数据保存在忽略目录，不纳入源码提交或发行资料。

### HarmonyOS

`screenShare.ts → harmonyScreenShare.ts → armScreenShareCapture → bootstrap → Index → ScreenShareCapturePolicy → onScreenCaptureRequest/ScreenCaptureHandler → ArkWeb getDisplayMedia/RTCPeerConnection`。

目标工程为 compatibleSdkVersion 6.1.0(23)、targetSdkVersion 26.0.0。授权要求 Debug、固定本地来源、有效会话、15 秒预备窗口、无并行请求，以及用户点击本机确认；没有新增高权限 CAPTURE_SCREEN 声明。EntryAbility 后台/销毁与页面销毁失效会话并请求停止。

本次实际尝试了安装 HAP 中的原生授权路径。拒绝可以得到 permission-denied；确认后底层建立了屏幕捕获请求，但模拟器没有向 JS 返回视频流。已观察到的原生日志位置为 `BaseScreenCaptureSource window callback is nullptr`；目前只能将其作为定位线索，不能据此断言全部 HarmonyOS 设备都不支持。

平台后端在 45 秒没有得到流时返回 capture-start-failed，取消立即使会话失效；任何晚到流都会停止轨道。但 ArkWeb getDisplayMedia 不提供原生 AbortSignal，已经交给系统而尚未返回的采集请求，最终回收仍依赖页面/宿主销毁。这一清理边界尚未通过设备验证，是正式交付阻塞项。

曾核对 OHPM 的原生 `@ohos/webrtc` 1.0.3 包：所取得的 HAR 只有 arm64-v8a 库，无法直接作为当前 x86_64 模拟器的验证路径。该依赖未加入工程，也没有把录屏文件作为实时共享替代。

## 验证环境与证据边界

| 项目 | 环境 |
| --- | --- |
| Android 房主 | Android Studio Medium_Phone，x86_64，Android 17 / API 37（codename REL，系统镜像目录 android-37.2）；应用 target 36 |
| HarmonyOS 观众/采集尝试 | DevEco Pura 90 Pro，x86_64，HarmonyOS 7.0.0(26.0.0) |
| 其他观众 | 3 个独立 Chrome PeerConnection / video 实例 |
| 媒体来源 | Android MediaProjection 实际采集模拟器屏幕中的移动图案与时钟，不使用画布流冒充原生采集 |
| 信令 | 测试工具在本机转发与正式服务相同的 offer/answer/ICE DTO；没有连接生产房间 |
| 网络 | 本机临时鉴权 TURN，经模拟器 NAT 转发；凭据随机生成，仅在忽略目录存在 |
| UI 检查 | 独立浏览器替身，以合成 canvas 流驱动真实房主组件，不能当作原生验收 |
| 真机 | 本轮无可用设备，未进行 |

临时 TURN 用于隔离模拟器 NAT 条件。源码的既有 ICE 配置仍只有公共 STUN，本轮没有把本机 TURN 或凭据写入产品。真实跨公网网络若需要 TURN，仍需要正式的配置与鉴权来源；本机 relay 验证不能证明现有发行配置已经具备中继能力。

## 测试结果

证据文件位于忽略的 `.ui-validation/screen-share-native/`；该目录可能含仅供本机排障的原生日志，不能整体打包公开。实现已保存到本地提交 `9f4e94c`；后续文档提交只补充验收结果。

- 会话/平台/鸿蒙原生授权策略新增行为测试：15 项通过。合并原有回归后 `test:adaptation` 共 106 项通过；媒体回归另 4 项通过。
- 房主组件浏览器替身：320×640、360×800、393×852、852×393 的开始/暂停/恢复/停止，无横向溢出；unsupported、OBS 分支与活动采集中切换 roomId 后重置控制状态通过。
- Android 实际采集：授权拒绝、再次授权、连续帧、多个 native PeerConnection 已验证。暂停时已在鸿蒙观众画面读取到黑帧，恢复后继续解码；短暂切后台时 dumpsys 仍显示系统采集活跃。
- Android → HarmonyOS ArkWeb + 3 Chrome：四路实际解码，竖屏 576×1280，旋转后 1280×576，再恢复竖屏；实际视频 codec 为 VP8，持续采样解码帧率 14–18 fps，未达到计划目标的 30 fps。
- 本地 Pion TURN v4.1.4 中继持续试验通过：2026-10-15 04:40:33.821–04:50:37.103 UTC，总计 603.282 秒，四路连续连接；20 次周期采样全部 connected，最后一次采样各观众累计解码约 9,407–9,410 帧，ICE 保活请求与响应持续增长。没有把合成 MediaStream 用作原生房主源。
- 主动停止后的系统核对通过：MediaProjection 为空、ScreenShareService 已退出、屏幕帧投递与 native PeerConnection 工作线程已释放。再次授权开始后，系统锁屏触发 capture-ended 回调，MediaProjection 和前台服务同时退出，通过系统停止路径验证。
- HarmonyOS 房主：授权拒绝通过；确认后未返回实时视频流，未通过。
- 两端真机、麦克风/系统音频、来电、真实 Wi-Fi/公网 TURN、热量和耗电：未进行。

前两轮基于临时 node-turn 测试中继，分别在约 2 分钟和 6 分钟观察到 HarmonyOS 观众连接失败，三路 Chrome 当时仍连接；失败日志保留。已在该测试依赖的 refresh.js 中核实续租读取 `defaultLifetime`、`maxAllocateTimeout`，而 server.js 实际定义 `defaultAllocatetLifetime`、`maxAllocateLifetime`，会产生无效的续租时长。替换为独立的 Pion TURN 实现后完成上述 10 分钟持续验证。该缺陷属于临时测试中继，不在客户端源码或运行时依赖中；不能据此宣称修复了产品里本不存在的 TURN 服务。

## 构建与交付状态

- `npm run build`、`android:sync`、`harmony:web` 使用共享源生成网页资源，未手改 HarmonyOS rawfile/web。
- Android Debug APK 和 HarmonyOS Debug unsigned HAP 已构建并安装到对应模拟器进行验证。APK 为 `com.zviewer.mobile.debug` / `1.9.5-debug` / 195，min SDK 24、target SDK 36，v2 Debug 签名验证通过，桥参数日志为 none，包含 arm64-v8a/armeabi-v7a/x86/x86_64 的 WebRTC 库。HAP 为 `com.zviewer.mobile` / 1.9.5 / 195，未签名，仅本轮模拟器安装验收可用。
- 最终验证包在忽略目录 `release/screen-share-poc-20261015/`，每个最终文件在构建后各计算一次 SHA-256，记录于同目录 `SHA256SUMS.txt`：

| 文件 | SHA-256 |
| --- | --- |
| ZViewer-1.9.5-screen-share-poc-debug.apk | `969cae84de74bec0e27d1951c7212f72f8ea58ea83c7992a956804c95189d94d` |
| ZViewer-1.9.5-screen-share-poc-debug-unsigned.hap | `6a912dc8e884fb19e5085095f924cab72cffaa8621ea381376b95992a687a6b5` |

包内 Android/HarmonyOS 网页入口同为 `index-DM8FEnxV.js`，HAP 包内版本信息已读取核对。最终 APK/HAP 均已安装到模拟器；HAP 的 unsigned 状态保持明确，不将模拟器安装成功写成真机签名通过。
- 未构建 iOS，未修改服务端，未推送 GitHub、未发布 Release。
- 正式签名 Release、完整真实房间验收和双端真机条件未达成，因此不能勾选计划中的最终交付完成。

## 后续退出条件

1. 定位鸿蒙确认后不返回视频流的具体系统/API 边界，验证另一设备持续收到鸿蒙屏幕，并补齐可证明的原生取消/系统停止回收。
2. 将本地 DTO 验证推进到实际测试服务的房间权限、审批、晚加入、多观众、停止提示、断网恢复和离房的完整端到端验证。
3. 明确正式 TURN 配置与鉴权来源；当前静态 STUN 不能满足所有 NAT 网络。
4. 双端真机完成计划矩阵，记录实际 codec、首帧、宽高/帧率、10 分钟、1/2/4 观众、后台/旋转/系统停止/来电/权限撤销与热量耗电。
5. 根据实际音频验证再开放能力，完成正式签名包与版本说明，然后解除生产门控。未通过前不以“双端屏幕共享已交付”发布。

## 官方 API 依据

- [Android MediaProjection](https://developer.android.com/media/grow/media-projection)：授权 token、前台任务、单个 projection 生命周期和系统停止回调。
- [OpenHarmony ArkWeb onScreenCaptureRequest](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/reference/apis-arkweb/arkts-basic-components-web-events.md#onscreencapturerequest10)：原生授权回调及 ScreenCaptureHandler。
- [WebRTC Android SDK](https://github.com/webrtc-sdk/android)：固定 Maven AAR 的发行来源。具体 API 同时以本地固定版本编译结果核对。
