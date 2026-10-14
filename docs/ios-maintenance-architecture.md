# iOS 客户端维护文档

更新日期：2026-10-14。三端维护文档统一使用 `<platform>-maintenance-architecture.md` 命名。本文件面向日常开发和故障定位；版本历史与验收过程不在此逐次累记。

## 当前版本和发布边界

- iOS 是 `ZV-iOS/` 中独立的 Expo SDK 57 / React Native 0.86 工程；当前源码为 **1.9.0 / build 26**，Bundle ID `com.zviewer.mobile`，最低 iOS 16.4，支持 iPhone 与 iPad。独立发布标签为 `ios-v1.9.0`；Android/HarmonyOS 继续使用 1.8.6 / 186。
- iOS 1.9.0 提供 Mac 本地构建的设备 Release IPA，**未签名、不是 App Store/TestFlight 包**，安装者需使用自己的证书与设备授权侧载；包内含 Release JS，不需要 Metro。公开发行与自动源码归档位于 GitHub `ios-v1.9.0` 标签。
- 当前源码的 `npm run check`（原生来源/补丁检查、lint、TypeScript 与 JS 测试）通过，共 227 项测试；1.9.0 设备包的 ARM64、版本、未签名状态、内置 JS、原生桥及来源摘要已经离线检查。播放器、投屏、房间设置、语音和弹幕设置的界面已在 iOS 模拟器检查；真实跨端 WebRTC/OBS、听音与蓝牙、硬件解码、锁屏系统按钮和后台自然跨曲仍需要相应设备专项验证。JS 被系统挂起时没有独立原生房间 Socket/自动切歌管线。
- 用户明确要求前不启动 IPA/EAS 构建。普通 UI 优先用 Expo Go/Expo Web 检查；这些预览不含 VLC、Go、LiveKit 和自定义原生桥，不能代表原生行为。
- 所有 iOS 客户端文件修改和 Git 操作在 `E:/Codex-bulid/ZViewer/ZViewer-client` 完成。不要在迁移副本或其他发布工作树提交客户端改动。

## 架构与边界

iOS 不是 Android Capacitor 工程的移植，也不是 Web 页面包装。`ZV-iOS/` 用 React Native 原生控件、Expo Router 和 config plugins 构建独立 App。业务 DTO、房间事件和服务端 API 可与双端对齐，但播放器、权限、连接、音频会话、持久化和界面必须按 iOS 原生能力维护。

| 层 | 主要入口 | 作用及维护边界 |
| --- | --- | --- |
| 导航与启动 | `src/app/_layout.tsx`、`src/app/index.tsx` | Expo Router 根 Provider、会话恢复、连接页、大厅及全局外观；路由文件只放页面入口。 |
| 房间页 | `src/app/room/[roomId].tsx`、`RoomUi.tsx`、`RoomSettings.tsx` | 模式、成员、房主/观众操作、审批和离房；服务端权限为最终依据。 |
| 会话与连接 | `src/state/session.tsx`、`sessionLease.ts`、`server.ts`、`socket.ts`、`socketEndpoint.ts` | SecureStore 凭据、HTTP、刷新、Socket.IO、服务器发现与请求生命周期。 |
| 房间播放状态 | `ZV-iOS/src/lib/roomPlayback.ts`、`ZV-iOS/src/lib/sources.ts`、`ZV-iOS/src/lib/watchSync.ts`、`ZV-iOS/src/hooks/useWatchControl.ts` | 将房间影片身份、片单事件、当前分集和播放器控制组合；不能把设备私有播放 URL 当作房间身份。 |
| 原生视频 | `VlcVideo.tsx`、`vlcPlayer.ts`、`mediaAdapter.ts`、`media.ts` | 单一 VLCKit 内核、命令/事件桥、媒体替换、seek 和轨道状态。 |
| B站 | `BiliVideoPicker.tsx`、`biliNative.ts`、`biliSelection.ts`、`biliRoomProtocol.ts`、`modules/zviewer-native/ios/ZVBiliBridge.*` | 选择器、分 P/集身份、本机 Go 解析与媒体代理；Cookie 仅在 iOS Keychain/原生层。 |
| 媒体库/番剧 | `MediaLibraryPicker.tsx`、`mediaLibrary.ts`、`directorySources.ts`、`AnimePicker.tsx`、`animeSources.ts` | Emby/Jellyfin、整季/集/版本、目录及番剧源；使用服务端媒体 ID 和真实 MediaSource ID。 |
| 音乐 | `MusicPanel.tsx`、`MusicLibrary.tsx`、`musicQueue.ts`、`musicCollection.ts`、`personalFm.ts`、`usePersonalFm.ts` | 网易云/B站音乐、队列、歌单、一起听、私人漫游与同步确认。 |
| 字幕/弹幕 | `Subtitles.tsx`、`subtitleParser.ts`、`subtitleSync.ts`、`Danmaku.tsx`、`danmakuImport.ts` | 原生 VLC 轨道、外部字幕、共享文本字幕与本地/在线弹幕。 |
| 系统媒体 | `useSystemMedia.ts`、`modules/zviewer-native/ios/ZVSystemMedia.swift`、`plugins/with-system-media.cjs` | Now Playing、锁屏/控制中心命令、后台音频声明与原生播放事件。 |
| 语音/投屏 | `VoicePanel.tsx`、`livekitProtocol.ts`、`ScreenShare.tsx`、`voiceProtocol.ts`、`with-voice-audio.cjs` | 房间语音用 LiveKit；投屏接收使用 WebRTC；分别维护麦克风权限和 VLC 音频会话共存。 |
| 配置与原生模块 | `app.json`、`plugins/`、`modules/zviewer-native/` | Expo CNG/config plugin 与本地 Swift/Objective-C Expo Module；原生更改要经插件或模块源码重现。 |

`ios/` 是 Continuous Native Generation 生成目录。除非维护流程明确要求，不直接手改生成的 iOS 项目或 `node_modules` 作为唯一修复；将持久改动写入 `app.json`、本地 Expo Module 或 config plugin，并从干净依赖重跑 prebuild 验证。

## 1.9.0 / build 26 的功能入口

本版独立更新 iOS 工程，Android/HarmonyOS 的共享 Web、原生桥和 1.8.6 安装包未随 iOS 版本号改变。新增或重构的主要入口如下：

| 能力 | 入口 | 维护规则 |
| --- | --- | --- |
| 播放栏与媒体控件 | `PlaybackControls.tsx`、`MediaPanelUi.tsx`、`ScreenOrientationButton.tsx` | 播放时间、弹幕输入、刷新、倍速、音量、设置和方向按钮共用播放状态；窄屏允许换行，全屏方向切换要与全局方向状态一致。 |
| 字幕和弹幕设置 | `PlaybackSettings.tsx`、`DanmakuTypeIcon.tsx`、`Danmaku.tsx`、`danmakuImport.ts` | 设置只保留字幕/弹幕两页；四类弹幕开关按本机偏好分别存储。在线来源和轨道管理保留；手动 XML/JSON 导入与 JSON 文本编辑不作为当前 iOS 产品入口。 |
| 投屏接收 | `ScreenShare.tsx`、`RoomChatPanel.tsx` | iOS 作为 WebRTC 接收端；刷新先关闭旧 peer 再重新宣告 viewer-ready，OBS 播放器刷新旧拉流。暂停接收、聊天和全屏切换不得误释放房间或视频会话。 |
| 房间语音 | `VoicePanel.tsx`、`voiceVolumes.ts`、`voiceProtocol.ts` | 分开维护本机麦克风状态、LiveKit 远端输出音量与成员音量；默认只听，权限和管理员禁言不能覆盖用户的本机闭麦选择。离房/断线释放音轨与采集。 |
| 房间设置 | `RoomSettings.tsx` | 模式、房间状态、成员、分享、加入审批与离房集中展示；入房审批与播放申请自动通过是两项独立设置，快照更新不可覆盖正在编辑的字段。 |
| 网易云导航 | `MusicNavigation.tsx`、`MusicPanel.tsx` | 导航菜单与头像操作互斥，设置入口统一从头像菜单进入；横屏内容限高滚动、浮层采用不透明主题背景。 |
| 播放显示状态 | `usePlayerDisplay.ts`、`playerDisplay.ts` | UI 控件共享自动/锁定方向与全屏状态；进入全屏默认横屏，退出恢复自动旋转；重复或迟到的系统方向动作要服从最后一次请求。 |

这些界面组件不改变原生媒体内核。继续保持 `NativeMediaAdapter → VlcPlayer → VlcVideo` 的单一 VLCKit 播放链，语音使用 LiveKit，投屏使用 WebRTC 接收。若改动播放器或媒体身份，要检查组件拆分没有复制播放器实例、重复订阅原生事件或重置当前房间媒体。

## 会话、安全和服务端协议

- 服务端地址支持自动 HTTPS 探测和显式完整 URL。探测不带登录凭据；证书错误不能降级到明文 HTTP。Socket.IO 的 origin 与 `socketEndpoint.ts` 生成的传输路径要保留反向代理前缀，不能把路径前缀误作 Socket namespace。
- 会话令牌存放在 Expo SecureStore。`sessionLease.ts` 用 lease/generation 隔离退出、换账号、换服务器后迟到的读取或网络响应；凭据写入串行化。登录失败、401 刷新和游客模式不可互相误触发旧会话恢复。
- `roomPermissions.ts` 和 `useRoomPermissions.ts` 提供界面门控，服务端仍需重新校验角色。管理员禁言与用户自我静音是独立状态；观众的播放、清空、成员管理操作按房间权限执行。
- 房间同步标识采用 movieId、page/CID、ep/season 和媒体源身份。不要将带 access token、服务器密码、Cookie、本机 CLI、临时随机代理端口或其他设备的 `127.0.0.1` 地址写入持久化片单、Socket DTO、日志或分享链接。
- `cancellation.ts`、`deadline.ts`、`sessionLease.ts` 和 `scopedCache.ts` 是异步安全基础设施。新请求开始、切源、切集、切服务器、退出房间和注销时，废弃旧解析/图片/媒体库/播放回调；缓存按服务器、账号、房间或媒体身份设置作用域，退出时清理私有数据。
- 自签证书的完整原生 REST/Socket/Image/VLC 通道目前不是已支持的通用能力；不得用关闭系统 TLS 校验的方式绕过。遇到证书或代理问题，先分别检查 API、图片、媒体 Range 与 Socket Upgrade 的真实传输链路。

## 播放器、字幕和音乐规则

### VLC 播放与轨道

`NativeMediaAdapter` 串行处理媒体替换和解析。加载编号/revision 用于丢弃旧 VLC 状态与旧输入重试；鉴权刷新若媒体身份不变应尽量保留位置，普通同步心跳不能反复把播放器 seek 回旧时间。房间时间单位为秒，VLC 事件常用毫秒，边界处统一换算。

轨道索引只对当前 VLC 媒体有效，换源必须清除过期 audio/video/subtitle 选择。`mediaAdapter.ts` 区分明确的用户选择与 VLC 实际 `selected` 状态，不得把“关闭”轨道误显示成可用轨道。字幕渲染器同一时刻只启用一种：原生 VLC 内嵌/外部轨道与 RN 同步字幕层互斥。复杂 ASS 字体、定位、绘图及特效由 VLC 原生渲染；JS 文本 overlay 不是完整 libass。

升级 Expo VLC 依赖时重点检查 `plugins/with-vlc-tracks.cjs` 和 `plugins/vlc-seek.cjs` 是否仍匹配上游 Swift 结构、轨道 API 与 seek 回调。`patch-vlc-native.cjs --check` 应在干净依赖中通过；config plugin 重复运行必须幂等。修改原生补丁后需编译原生包并按具体场景设备验证。

### 房间同步与片源

`watchSync.ts`、`roomPlayback.ts`、`sources.ts` 把房间权威影片状态转成 iOS 可播放 source。必须等待当前影片身份、所选 CID/ep 与来源信息一致；迟到的上一个页面解析不能覆盖新片。播放恢复、暂停、seek、重连和后台唤醒共用同一媒体身份代次。

B站普通 BV 与 PGC ep/ss 保持不同身份；手动选集结果优先于原始链接中的旧 CID。设备本地 Go 解析和临时 CDN 音轨只供本机 VLC，观众共享解析使用服务端可达 URL。服务器分享与房间状态不保存 Keychain Cookie、API key、HTTP Basic 认证或设备回环代理地址。B站声音、DASH slave 挂载/重试与起播需以真实新 IPA 设备实测，不以 Web 页面或存在原生符号代表播放通过。

Emby/Jellyfin 使用真实 Item ID、Episode ID 与 MediaSourceId；访问图片/流媒体时按当前服务器凭据构造请求，切源或注销时取消旧图片和播放请求。HLS master/子清单相对 URL、Range/seek、转码流过期与服务器前缀在 `hlsPlaylist.ts`、`hlsNative.ts`、`mediaLibrary.ts` 中维护。逐季枚举的排序稳定，单集/多版本切换不应伪造 page 索引为媒体源 ID。

### 一起听和系统媒体

`musicQueue.ts`、`musicCollection.ts` 与 `musicSyncReceipt.ts` 管理队列和房间确认。成功的曲目准备/匹配当前媒体后才记录一次同步回执；重复心跳、暂停、seek 与同曲重试不重复报告“已同步”。加入整份歌单要逐项等待入队确认，取消或失败不得报告整个操作成功。

`personalFm.ts` 和 `usePersonalFm.ts` 按房间/账号维护漫游候选与请求代次。只有房主在下一首成功加入队列后推进；超时/拒绝保留候选。插播普通歌曲或视频、暂停、拖动、切账号/房间/模式、断连及退出都应取消过期异步工作。

`ZVSystemMedia.swift` 管理 Now Playing 与系统远程命令；`useSystemMedia.ts` 把命令送入当前业务会话。更新/清除都校验媒体或 session ID，旧播放器不能覆盖新曲信息。后台音频会话、系统媒体卡和少量 background task 不等于应用被系统挂起后仍有独立的房间 Socket、审批或自动切曲能力；本项目当前没有独立原生房间业务 Socket。新后台同步能力要以真机、锁屏、系统回收、弱网及跨平台场景单独验收。

### LiveKit 语音和屏幕共享

房间语音用服务端 `/api/voice/token` 返回的 URL/token 与 identity 加入 LiveKit，管理 mute/kick 使用服务端接口和 participant identity。默认加入只听，用户主动开启麦克风才请求权限；管理员解禁不能覆盖用户主动闭麦。`voiceProtocol.ts`、`voiceBinding.ts`、`voiceMicrophone.ts` 与 `with-voice-audio.cjs` 分别处理身份合同、生命周期绑定、权限和原生音频共存。离房、切房、踢出、断网及组件释放要清除本地/远端音轨并停止采集。

屏幕共享客户端仅作 WebRTC 接收端，不含屏幕采集端。LiveKit、WebRTC、麦克风、VLC 音频路由及后台播放会竞争原生音频资源，升级 Pods 或 Expo 插件时检查锁定版本、Podfile.lock、Info.plist 和配置 plugin 生成结果。Expo Go 不含这些自定义原生模块。

## 构建、检查和交付

### 日常源码与预览

```powershell
Set-Location E:/Codex-bulid/ZViewer/ZViewer-client/ZV-iOS
npm run check
npm start
```

`npm run check` 依次检查 VLC 插件补丁、Expo lint、TypeScript 与 `tests/*.test.mjs`。UI 修改优先用 Expo Go/Web 检查常用 iPhone/iPad 竖屏、横屏、窄宽度、键盘、安全区、全屏和无溢出；启动 Expo 后确认服务使用预期端口 8081。结束服务后检查端口释放。Expo Go/Web 只证明 JS/UI，不证明 VLC/Go/LiveKit/Swift 原生代码。

### 原生依赖和 IPA

不要因文档检查或普通 UI 修改启动 EAS/Xcode IPA 构建。用户明确要求构建后，先在 Mac 按本工程版本化 Expo 文档核对 SDK 57 的 API/插件，再以干净依赖执行现有原生检查和脚本。iOS IPA 只能使用当前仓库 `ZV-iOS/scripts/` 的受检构建入口；iOS build 完成后更新本文件，再在此指定 Git 仓库本地提交。未经授权不消耗 EAS 额度。

IPA 检查至少包含：Bundle ID/版本/build、设备 ARM64 而非模拟器切片、未签名状态与无意外 provisioning profile、内置 Release JS、VLC/LiveKit/自定义桥符号、Go 原生来源摘要和依赖许可、IPA 全部 CRC 与 SHA-256。未签名 IPA 需要用户自己的合法签名及设备授权才能安装。

构建脚本链条说明：`stage-native-core.cjs --verify-only` 只核验共享 Go 来源与锁定摘要；真正构建前必须运行不带 `--verify-only` 的脚本，将已核验源码写入本地 `.native-staging/`。`prepare-native-ios.sh` 在 Mac 读取该暂存目录并准备设备 ARM64 Bilicore/Opus；`patch-vlc-native.cjs --check` 检查可重现原生补丁；`build-unsigned-ios.sh` 或对应 PowerShell 包装脚本执行 iphoneos Release 与 IPA 打包；`inspect-unsigned-ipa.py` 检验最终 IPA。完整设备构建、测试及上传审计必须针对当前提交和新包重新执行，不能复用旧 build 记录。

得到用户明确的构建指示后，在 Mac 工程目录按需要执行：

```sh
cd ZV-iOS
npm run check
node scripts/stage-native-core.cjs
npm run native:patch
bash scripts/prepare-native-ios.sh
bash scripts/build-unsigned-ios.sh
python3 scripts/inspect-unsigned-ipa.py /absolute/path/to/ZViewer-unsigned.ipa
```

`prepare-native-ios.sh` 需要 Xcode 命令行工具和网络，以锁定摘要下载 Go/Opus 并构建设备库；准备产物进入本地 Vendor/构建目录，未经核对不提交生成的 XCFramework、静态库或头文件。若只做 JS/UI 改动，无需运行原生准备和 IPA 打包。Windows 不能执行上述 Xcode 构建。

### 验收层级

| 层级 | 可以证明 | 不能代替 |
| --- | --- | --- |
| 单元/协议测试 | 映射、权限门控、取消、同步算法、fixture 合同 | UI、原生模块、网络服务或媒体解码。 |
| RN Web/Expo Go | React 页面布局、交互和 JS 流程 | VLC/Go/LiveKit、Keychain、真实系统媒体或后台运行。 |
| 原生编译/IPA 离线检查 | 目标切片、桥接符号、依赖与包结构 | 设备安装、账号登录、实际听音/画面与系统行为。 |
| iOS 模拟器 | 已实际运行的 API/播放场景 | iPhone/iPad 硬件编解码、麦克风、蓝牙、系统挂起和外网网络。 |
| 物理 iPhone/iPad | 现场实际记录的场景和设备 | 未执行的格式、时长、后台状态或网络拓扑。 |

用户反馈的新问题优先于源码测试或模拟器通过。若用户反馈仍有播放或同步错误，维护状态写明复现条件、客户端/服务端版本、房主/观众、房间模式、网络和前后台状态；区分用户报告、日志证据和已重复复现，不提前宣告修复。

## 常见故障定位

| 现象 | 优先核对 |
| --- | --- |
| 登录后旧账号重新出现 | SecureStore 读写、`SessionLease` 代次、退出期间的迟到刷新/服务器响应。 |
| 同片重复重载或进度回跳 | movieId/CID/ep、服务器心跳基线、seek intent、NativeMediaAdapter 旧解析任务和原生事件编号。 |
| B站有画面无声 | DASH 音轨地址、deferred slave 是否成功加入当前 VLC input、媒体加载编号与设备新 IPA；分开检查房间共享 URL 和本机解析结果。 |
| Jellyfin seek 后停播/旧集恢复 | Item/MediaSourceId、`timeline.ts` 与 VLC 时间换算、旧恢复回调和新媒体操作代次。 |
| 字幕重复/轨道错选 | VLC 与 RN overlay 是否同时启用、轨道是否仍属于当前媒体、关闭轨道是否识别为 selected=false。 |
| 锁屏显示正常但后台换曲/同步停止 | 系统音频声明与实际 JS 生命周期；目前没有独立原生房间 Socket，需明确记录该能力边界。 |
| LiveKit 断线后残留麦克风 | token/连接代次、`voiceSessionActive`、权限状态、VLC 音频会话及离房清理。 |
| 只有设备 IPA 出问题而 JS 测试通过 | 核对新 IPA 中的原生插件补丁、Pod 版本、编译 slice 和 Xcode 日志；Web 结果不能排除原生线程或音轨生命周期问题。 |

## 维护检查表

1. 先核对客户端源码、服务端 API/Socket 合同和三端行为，再确认改动归属共享 JS、iOS 独立 RN、Go bridge、Swift module 或 config plugin。
2. 检查异步任务取消、媒体身份、权限、凭据与旧回调；测试房主/观众、切房/切源、断线重连和失败恢复。
3. 运行 `npm run check`；如改了共享协议或解析，补相应固定向量和 Go/服务端隔离测试。
4. UI 变更在 Expo Go/Web 检查 iPhone/iPad 竖横屏；原生能力变更必须等待明确构建授权，并按真实新包实测。
5. 收尾时更新本文件中的当前版本/状态、真实验证范围和仍未解决的问题。发行源码不得包含账号密码、Cookie、证书、私钥、签名 profile、日志中的令牌或任何 `AGENTS.md`。
