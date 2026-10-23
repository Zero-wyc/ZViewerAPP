# iOS 客户端维护文档

更新日期：2026-10-23。三端维护文档统一使用 `<platform>-maintenance-architecture.md` 命名。本文件面向日常开发和故障定位；本轮状态以[开发与验收记录](ios-macos-development-status.md)及[609 行分项矩阵](ios-acceptance-checklist.md)为准，旧发行包和阶段测试有独立边界。

## 2026-10-23 Windows 回传同步

已补齐 GitHub main 漏同步的一起听修复、测试与 build29–31 证据，重写 README 和 2.1.10 发行说明。Windows 的 VLC 补丁、lint、TypeScript 与 12 个共享 Go 来源文件核验通过；测试为 422 项通过、8 项跳过、3 项因缺少 Xcode `xcrun` 无法执行。macOS 的 433 项通过记录单独保留。本次未重新构建 IPA；完整范围见 [源码同步记录](ios-windows-source-sync-20261023.md)。

## 2026-10-23 统一 V2.1.10 发布（build31）

- 用户已明确反馈第30包“测试通过”，并要求同步源码及更新现有 `client-v2.1.10` Release，iOS 对外版本也统一为 2.1.10。
- `app.json`、`package.json` 和 lockfile 根版本统一为 **2.1.10**，iOS buildNumber 递增为 **31**；本轮没有改动第30包已验收的播放或房间逻辑。版本31继续使用 VLCKit a25 和原有 device ARM64 Go / Opus Vendor。
- 重新执行原生持久补丁检查、lint、TypeScript 和 **433 / 433** 项测试；重新编译未签名 ARM64 device Release，49,315,848B，内置 Hermes 6,631,097B，SHA256 `9d98f800d4cb3fa80537a5ced8d7bbc76a014b4c40aaa8601bfdd6ee9204b79a`；离线验包及构建时唯一一次 SHA 见 [第31包证据](evidence/ios-device-ipa-31-2026-10-23.json)。用户测试结果只对应其实际测试范围，不把未逐项核对的历史609条要求全部关闭。
- 源码更新 main；IPA 与独立 SHA 文件发布到现有 Release。原 Android / HarmonyOS 附件、SHA 文件和 tag 保留，现有 Release 附件清单以 GitHub 页面为准；Release 正文明确推荐新 iOS 2.1.10 / build31。GitHub 自动 tag 源码归档仍对应原 tag，最新 iOS 源码从正文的 main / 发布提交链接获取，不另打源码包。

## 2026-10-23 一起听复验与交付（build30）

- build29 未完全解决真实房间中的卡顿。复现使用更新后的 NAS 地址、网页 root 房主和 iPad Pro 11-inch (M5) / iOS26.5 Simulator 观众。网页只展开歌曲播放器；iOS 分别测试展开播放器和纯净视频。验收包括两首 B站视频 A→B→A、播放中大跨度定位、暂停定位后恢复，以及歌曲中段冷启动重新入房。
- 根因证据：同一 AAC fMP4 在本地文件中定位到 162.5 秒后正常推进，HTTP Range 返回正确字节，但 VLC 默认 MP4 流式 demux 路径定位后出现 clock gap 并停在 162.512 秒。使用 VLC 自带的 `avformat` demux 后同一 HTTP 输入持续推进。`biliNative.ts` 仅为一起听的 B站 `audio` / `muted-video` 输入指定 `demux=avformat`；继续使用 VLC 作为唯一播放内核，一起看维持原有 demux 选择。没有保留试验性的 AudioUnit、延迟释放或重建输入方案，也没有放宽 seek 的真实时钟确认。
- `VlcVideo.tsx` 为持久音乐输入的原生命令替换补齐与初始挂载一致的 Simulator 软件解码参数，并保留原生 view 方法接收者。画面继续使用 `contain`；4:3 和 16:9 视频在纯净页面完整显示，比例不匹配时留黑边。
- VLCKit 固定为实际编译及复验的 `4.0.0a25`，由持久 config plugin 和构建前守卫共同校验。升级本身不是根因修复的依据，demux 对照复现和实际房间播放是本轮证据。
- 新房间默认打开“自动通过”。一起听房主自动执行当前房间的控制申请，操作成功后再确认；关闭开关后继续人工审批。观众及其他房间的申请不自动处理。Simulator 创建房间的开关默认开启、手动关闭已实测。
- 自动检查 **433 / 433**、原生补丁守卫、lint、TypeScript 通过。真实房间验收记录见 [build30 一起听证据](evidence/ios-listen-build30-2026-10-23.json)。Simulator 的实际播放证据不等同于物理 iPad 的声音听感、长期播放或所有网络条件验收。

## 2026-10-23 前轮一起听修复（build29，保留历史边界）

- `MusicVideo.tsx` 原先在每次音频进度回调中重复发送 play/pause，并在音画偏差超过 1 秒时直接跳转。可选视频走暂停后静止 2 秒的定位确认路径，音频在此期间继续前进，因此可能反复进入追赶、暂停和重新缓冲。初次解析还会使用解析前的位置并重复定位。
- 新增 `musicVideoSync.ts`：主音频保持房间时钟，视频只在播放意图改变时发送 play/pause；普通偏差使用相对主音频倍速 ±10% 的速度校正，250ms 限频，误差小于 250ms 后恢复。首次准备和显式拖动使用最新已确认音频位置；音频/视频定位未完成时不叠加跳转；6 秒以上断层的自动重新定位至少间隔 10 秒。切换曲目、画质、账号、前后台或完整播放器时重建同步状态，继续保留后台立即释放、过期解析隔离和视频失败不影响主音频的边界。
- `vlc-seek.cjs` 的持久补丁将播放中的渐进式静音视频接入现有连续时钟确认路径，定位时不再为静止确认主动暂停视频。暂停意图和旧操作取消仍生效；一起看及 HLS 的精确暂停定位路径保留。`biliNative.ts` 为本机和服务器解析的静音视频添加 `no-audio`，避免在独立主音频之外再次解码 MP4 内的音轨。
- `VlcVideo.tsx` 统一按 `contain` 显示完整帧，后台装饰标识只负责生命周期和音频会话，不再隐含 `cover` 裁切。一起听纯净视频区域使用黑底承接横竖比例不匹配时的留边。
- 验证：原生持久补丁检查、lint、TypeScript 通过；全部 **431 / 431** 项测试通过，其中本次专项 **34 / 34** 项通过。新增同步收敛、重复命令、迟到解析、确认后拖动和完整画面配置回归；Swift 夹具执行实际补丁方法，验证静音视频连续定位不触发 pause、最新暂停意图生效，原有 HLS / 取消验证继续通过。
- 随后按用户明确指示构建 **1.9.0 / build29** 未签名 ARM64 device Release IPA，原生编译及离线验包通过，修复已进入生产 JS 和实际编译的 VLC Swift 源码。未构建新 Simulator app，既有模拟器二进制仍不能作为新原生补丁的播放验收。第三代 iPad Pro 真机持续播放、音画同步、横竖屏和后台恢复待用户签名安装第29包测试。

## 当前版本和发布边界

- iOS 为 `ZV-iOS/` 独立 Expo SDK57 / React Native0.86 工程；当前发布版本为 **2.1.10 / build31**，Bundle ID `com.zviewer.mobile`，最低 iOS16.4，支持 iPhone / iPad。
- 已验收的前轮 device ARM64 Release 为 build30，49,315,846B，离线 Hermes 6,631,097B；[第30包离线验包](evidence/ios-device-ipa-30-2026-10-23.json)确认 device IOS2、无签名 / profile、CRC、原生功能、debug 排除和已知凭据字面量检查通过。SHA256 `3cc0acbfcb0fabd64eb7994f9c2ba60b687ba18c65671d2a8f37d503746158db` 仅在构建末尾计算一次，后续复用。该第30包包含 demux 修复与默认自动通过，只作本地测试交付；现已按用户验收结果以 2.1.10 / build31 重新构建发布。
- 本轮 Simulator 原生 Debug 已重新构建，包含 VLCKit a25 和实际生产源码；补丁、lint、TypeScript 和 **433 / 433** 项测试通过。20 个 AVC / HEVC 横竖尺寸关键帧原生解码夹具及 Swift / TS 连接专项沿用前轮证据；不与自动检查重复相加。
- [第29包证据](evidence/ios-device-ipa-29-2026-10-23.json)：未签名 device ARM64 Release，49,286,813B，SHA256 `d1d3c0e209f78f5633993e95628cf1d525ae1a04cf2b4a137d6922ca8ce9fbfb`，离线 Hermes 6,628,923B；IOS2、无签名 / profile、全部 CRC、原生符号、debug 排除及已知私密字面量检查通过。构建末尾计算一次 IPA SHA，后续复用。本包含一起听同步及完整画面修复，只作本地测试交付，尚未更新公开 Release。
- 本轮修复 CLI 匿名 ready 状态阻止 Keychain 恢复、过期登录响应覆盖与错误分类；[Debug19 实测](evidence/bili-cli-build28-2026-10-22.json)冷启动保持登录，自动 / 360P / 480P / 720P 解析成功，480P→720P UI 切换与播放推进通过，超出模拟器策略的画质准确报轨道限制并保留原画质和进度。
- 真机通过 VideoToolbox 精确格式、硬件会话、接受格式及真实关键帧解码探测后，开放 AVC High / HEVC Main、8bit420 SDR、最高 4K30，横竖尺寸分别验证；Simulator / 软件仍为 AVC720P30 / 480P30。60fps、AV1、HDR、杜比继续过滤。探测不证明高码率长时间实时播放或音画同步；用户第三代 iPad Pro 尚未由 agent 真机验收。
- 第26 / 27 / 28 / 29包原文件与历史证据保留。第26包用户反馈真机一起听及系统音乐控件正常，未提供 OS / 时长；不能外推第30包全部功能。609条原生要求和历史负例未被433项自动检查批量关闭。
- 用户授权将源码提交 main，并将 `ZViewer-iOS-1.9.0-28-unsigned.ipa` 与独立 SHA 文件合并发布到现有 `client-v2.1.10` Release，保留 Android / HarmonyOS 附件及原 tag。tag 自动源码归档仍指向原 tag；新增 iOS 源码以正文 main 提交链接为准。未使用 EAS、TestFlight 或 App Store。

设备准备使用显式 `ZVIEWER_USE_SYSTEM_GO=1`，严格核对 Go1.27.1；默认下载摘要路径保留。device / Simulator ARM64 Vendor 分开保存，构建后恢复 Simulator Vendor 与 Pods，不能混用。

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

## 当前功能入口与历史发行来源

公开1.9.0 / build26来自原独立iOS发行；以下表格按当前 2.1.10 / build31 源码维护，不能把历史三端1.9.0 / 190发行描述当当前Android / HarmonyOS版本。

| 能力 | 入口 | 维护规则 |
| --- | --- | --- |
| 播放栏与媒体控件 | `PlaybackControls.tsx`、`MediaPanelUi.tsx`、`ScreenOrientationButton.tsx` | 保持单行等间距和44pt触摸目标；按扣除padding / safe-area后的真实行宽把音量、设置和方向收进已有更多菜单，首项始终展开 / 收起弹幕输入。 |
| 字幕和弹幕设置 | `PlaybackSettings.tsx`、`DanmakuTypeIcon.tsx`、`Danmaku.tsx`、`danmakuImport.ts` | 设置只保留字幕/弹幕两页；四类弹幕开关按本机偏好分别存储。在线来源和轨道管理保留；手动 XML/JSON 导入与 JSON 文本编辑不作为当前 iOS 产品入口。 |
| 投屏接收 | `ScreenShare.tsx`、`RoomChatPanel.tsx` | iOS 作为 WebRTC 接收端；刷新先关闭旧 peer 再重新宣告 viewer-ready，OBS 播放器刷新旧拉流。暂停接收、聊天和全屏切换不得误释放房间或视频会话。 |
| 房间语音 | `VoicePanel.tsx`、`voiceVolumes.ts`、`voiceProtocol.ts` | 分开维护本机麦克风状态、LiveKit 远端输出音量与成员音量；默认只听，权限和管理员禁言不能覆盖用户的本机闭麦选择。离房/断线释放音轨与采集。 |
| 房间设置 | `RoomSettings.tsx` | 模式、房间状态、成员、分享、加入审批与离房集中展示；入房审批与播放申请自动通过是两项独立设置，快照更新不可覆盖正在编辑的字段。 |
| 网易云导航 | `MusicNavigation.tsx`、`MusicPanel.tsx` | 导航菜单与头像操作互斥，设置入口统一从头像菜单进入；横屏内容限高滚动、浮层采用不透明主题背景。 |
| 播放显示状态 | `usePlayerDisplay.ts`、`playerDisplay.ts` | 历史 1.9.0 进入全屏默认横屏；现行 iPhone 按实际解码宽高锁向、退出恢复自动，iPad 方向由系统窗口管理且不声称锁定成功，详见本轮增补。 |

这些界面组件不改变原生媒体内核。继续保持 `NativeMediaAdapter → VlcPlayer → VlcVideo` 的单一 VLCKit 播放链，语音使用 LiveKit，投屏使用 WebRTC 接收。若改动播放器或媒体身份，要检查组件拆分没有复制播放器实例、重复订阅原生事件或重置当前房间媒体。

## 会话、安全和服务端协议

- 服务端地址支持自动 HTTPS 探测和显式完整 URL。探测不带登录凭据；证书错误不能降级到明文 HTTP。Socket.IO 的 origin 与 `socketEndpoint.ts` 生成的传输路径要保留反向代理前缀，不能把路径前缀误作 Socket namespace。
- 会话令牌存放在 Expo SecureStore。`sessionLease.ts` 用 lease/generation 隔离退出、换账号、换服务器后迟到的读取或网络响应；凭据写入串行化。登录失败、401 刷新和游客模式不可互相误触发旧会话恢复。
- NAS 的 REST 与 Socket 鉴权会优先读取 Cookie，不能假定显式 Bearer / `auth.token` 一定覆盖共享原生 Cookie。NAS `fetchJson`、SessionProvider、来源解析及媒体诊断请求统一使用 `credentials: 'omit'`；`auth/me` 与 refresh 的用户 ID 必须与当前会话一致，不得把另一个账号静默写回 SecureStore。B 站 / 网易云专用会话继续使用各自流程。
- iOS RN WebSocket 会从共享 `HTTPCookieStorage` 载入 Cookie，`withCredentials: false` 只约束 Socket polling，空 Cookie extraHeader 在当前 RN 中也只是追加，不能清除旧值。`ZVServerCookies.swift` 经 `nativeBridge.isolateServerAuthCookies` 仅删除所选 NAS API / Socket URL 实际会发送且名为 `access_token` / `refresh_token` 的旧 Cookie；保留其他名字、其他域与无关路径。SessionProvider 等待此操作完成并检查 active / 当前会话后才 openSocket，不能用全局清 Cookie 替代。此修复需要包含该 helper 的原生构建，不能仅刷新旧二进制的 JS 验收。
- `roomPermissions.ts` 和 `useRoomPermissions.ts` 提供界面门控，服务端仍需重新校验角色。管理员禁言与用户自我静音是独立状态；观众的播放、清空、成员管理操作按房间权限执行。
- 房间同步标识采用 movieId、page/CID、ep/season 和媒体源身份。不要将带 access token、服务器密码、Cookie、本机 CLI、临时随机代理端口或其他设备的 `127.0.0.1` 地址写入持久化片单、Socket DTO、日志或分享链接。
- `cancellation.ts`、`deadline.ts`、`sessionLease.ts` 和 `scopedCache.ts` 是异步安全基础设施。新请求开始、切源、切集、切服务器、退出房间和注销时，废弃旧解析/图片/媒体库/播放回调；缓存按服务器、账号、房间或媒体身份设置作用域，退出时清理私有数据。
- 连接页“允许服务器使用不受信任的证书”默认关闭。`serverConnection.ts`按规范HTTPS origin（scheme / hostname / 有效port，不含路径前缀）持久保存显式例外，限制64项；登录候选与会话恢复必须先配置传输再发auth / me / Socket。配置串行、generation隔离旧响应，同一配置去重以免refresh关闭活动播放器。
- `ZVServerConnectionTransport.swift`通过既有Go `MobileConfigureServer`建立仅绑定所选NAS origin的临时loopback capability；`connectionTransport.ts`只把实际REST / WSS / Image / VLC main、slave、subtitle / FLV / HLS请求映射到当前已校验通道，DTO、sourceMeta、持久化与分享保持逻辑URL。HLS Relay与SystemMedia artwork在native侧同样绑定当前映射，不能把capability写回房间。
- 仅有效NAS loopback Socket.IO通道加`Origin: https://localhost`，以满足现有Go proxy；直接NAS / 独立语音 / 其他CDN不加。关闭或换origin立即撤销旧HTTP和WS，撤销入口同时断开Session；跨origin / port、HTTPS降HTTP仍拒绝，不全局改ATS / 系统信任。
- [Debug16合成TLS原生证据](evidence/ios-simulator-2026-10-22/server-certificate-build16.json)23项均true，含RN fetch / Engine.IO、Range、图片、redirect、独立voice严格拒绝与活动HTTP / WS撤销。媒体URI映射有专项回归，但本轮合成夹具不是decoded-media或物理设备证据。

## 播放器、字幕和音乐规则

### VLC 播放与轨道

`NativeMediaAdapter` 串行处理媒体替换和解析。加载编号/revision 用于丢弃旧 VLC 状态与旧输入重试；鉴权刷新若媒体身份不变应尽量保留位置，普通同步心跳不能反复把播放器 seek 回旧时间。房间时间单位为秒，VLC 事件常用毫秒，边界处统一换算。

轨道索引只对当前 VLC 媒体有效，换源必须清除过期 audio/video/subtitle 选择。`mediaAdapter.ts` 区分明确的用户选择与 VLC 实际 `selected` 状态，不得把“关闭”轨道误显示成可用轨道。字幕渲染器同一时刻只启用一种：原生 VLC 内嵌/外部轨道与 RN 同步字幕层互斥。复杂 ASS 字体、定位、绘图及特效由 VLC 原生渲染；JS 文本 overlay 不是完整 libass。

升级 Expo VLC 依赖时重点检查 `plugins/with-vlc-tracks.cjs` 和 `plugins/vlc-seek.cjs` 是否仍匹配上游 Swift 结构、轨道 API 与 seek 回调。`patch-vlc-native.cjs --check` 应在干净依赖中通过；config plugin 重复运行必须幂等。修改原生补丁后需编译原生包并按具体场景设备验证。

### 房间同步与片源

`watchSync.ts`、`roomPlayback.ts`、`sources.ts` 把房间权威影片状态转成 iOS 可播放 source。必须等待当前影片身份、所选 CID/ep 与来源信息一致；迟到的上一个页面解析不能覆盖新片。播放恢复、暂停、seek、重连和后台唤醒共用同一媒体身份代次。

B站普通 BV 与 PGC ep/ss 保持不同身份；手动选集结果优先于原始链接中的旧 CID。设备本地 Go 解析和临时 CDN 音轨只供本机 VLC，观众共享解析使用服务端可达 URL。服务器分享与房间状态不保存 Keychain Cookie、API key、HTTP Basic 认证或设备回环代理地址。DASH slave 挂载 / 重试与起播使用当前原生 Debug 实测；声音听感和设备能力仍需物理设备专项，不能以 Web 页面或存在原生符号代表通过。

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

```sh
cd ZV-iOS
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

## 2026-10-22 macOS / NAS / Simulator 对齐维护增补

本节为现行源码维护合同。当前1.9.0 / build27、16次Simulator Debug加2次device ARM64 Release、完整check20的409 / 409项，以顶部和分项矩阵为准；早期12轮 / check14的355项与尚未获IPA指示仅是阶段历史，不作现行限制。第26包用户真机报告与第27包待验单列，未启动EAS或新的公开发布。

### 播放身份、来源和片级设置

- `roomPlayback.ts` 继续作为片单、当前影片与共享状态的协调入口。ani-subs/Kazumi/CMS 的逻辑地址是来源身份，不能覆盖已解析媒体地址；保留已解析状态时同时核对来源类型、movieId 和 sourceMeta。跨源切换清理旧 CID、ep/season、音轨及 codec 信息，媒体库分集仍按真实媒体身份匹配。
- `PlaybackSource`、`Movie`、添加、API 读取和广播透传 `serverProxy`、`playsvideoEnabled`、`noProxyFallback`、`sourceMountId`。`NativeMediaAdapter` 的解析/attach 身份包含影响本机媒体的策略，不能仅按 URL 去重；纯进度心跳不触发换源。`NativeVideoSource.dispose()` 负责释放退役来源持有的本机资源，迟到的解析结果也要释放。
- `aggregatePlayback.ts` 按来源元数据调用 ani-subs、Kazumi 或 CMS resolve，再使用当前选定服务器构造代理地址。保存过的旧代理只提取上游媒体与来源请求头，不复用添加者服务器、token 或临时端口。旧 Kazumi 无元数据记录只允许已有 HTTP(S)/代理媒体回退，不能把 `kazumi://` 当播放器 URL。
- 显式 `serverProxy=true` 保持中转，`false` 按直连处理；需要 Origin/Cookie 而本机直连无法承载时提示用户启用中转，不静默改策略。添加面板的两个草稿开关每次打开默认关闭；旧记录缺省值与显式 false 分开处理。Emby/Jellyfin 挂载沿用 `directLink` 和 `sourceMountId`，不伪造另一套同名中转设置。
- `CmsPicker.tsx`、`cmsSources.ts` 提供 TVBox 站点、搜索、播放组和多集加入。持久化 sourceMeta 保存 sourceId、vodId、播放组和集索引以便另一端重解析；批量加入逐项确认，成功项与失败项分开保留，取消后不继续提交。
- `MoviePlaybackSettings.tsx` 的片级运行设置由当前分享端且用户为 root 或持久房间 owner 才可修改。`isHost`、owner 与权限矩阵不可互相替代。事务由房间页串行执行：PUT 改动字段 → 权威 GET → 确认仍为当前房间/媒体代次 → 必要时重解析及 attach → 等待原生 ready → 恢复最新暂停/倍速意图 → 广播。
- 非当前影片只保存；只变更 `playsvideoEnabled` 时保存共享的浏览器管线偏好，iOS 仍使用 VLC，不为此重载原生媒体。设置保存成功而确认/媒体应用失败时明确区分状态，暂停失败管线，不反向 PUT 自动回滚。`playbackSettingsRetry.ts` 区分未确认保存与已保存；重试读取/应用服务器当前值，不把空重试误报为原修改已保存。
- `playerReady.ts` 与 VLC 的 paused-ready 补丁允许暂停源完成准备。当前媒体的设置事务还须等待 seek 确认；HLS 须已有有效时长，不能把 `FirstPlay(duration=0)` 或 seek 命令 ACK 当作“已应用”。事务退出时若最新状态曾被锁阻挡，应重新应用最新状态；切房、切模式、断线和切片使旧事务失效。

### 房间界面与显示偏好

`room/[roomId].tsx` 恢复一起看“聊天 / 片单”主区域切换。`WatchRoomChat.tsx` 在聊天内承载评论区、弹幕轨道、实时弹幕及输入，不能再依赖浮动聊天按钮替代主要入口。片单保留添加、搜索、刷新、展开单片设置和按权限管理；“自动连播”是当前房间/模式/角色的临时状态，初始关闭，与播放申请自动通过、入房审批分别维护。

`PlaybackControls.tsx` 以视频底部 overlay 呈现控件；播放态显隐、交互锁、更多菜单和全屏共用状态，点击控制不应穿透为画面手势。保留下一部、弹幕、音量、设置、方向及 `.5 / .75 / 1 / 1.25 / 1.5 / 2` 倍速。下一部先取权威片单并核对当前影片代次，不能用旧数组切到已删除影片。

`useMediaPreferences.ts` / `MediaDisplayTools.tsx` 管理本机完整名称与列表/网格偏好，复用于选集、番剧和媒体库列表，不写成房间播放状态。添加来源以当前服务器设置和实际挂载列表决定入口；空挂载与 beta 限制要有真实依据。房间设置中外观、本机 B站账号为独立入口；通用按钮、页签和开关补中文无障碍激活与禁用态语义。

来源加载失败显示原因和重试，不当作没有挂载；`sourceBatch.ts` 取消只读解析和后续条目，已提交片单写入等待确认，保留成功项与未完成选择，不反向删除。媒体库初选继承当前挂载 directLink，WebDAV / OpenList 使用已有 direct-url 合同。`SourceBreadcrumbs.tsx` 在实际番剧、目录、媒体库逐级等宽单行省略并沿用返回动作。以上有源码 / 组件回归，不等于所有来源 UI、长英文、偏好持久化和 130% 字体已原生验收。

现行 iPhone 全屏由实际视频宽高选择横 / 竖，方向请求仍串行并服从最后代次。第 10 轮 iPad 取消 `UIRequiresFullScreen`，保留单 scene / 单 React Native 根并声明四方向；使用当前 window bounds 布局，原生 lock / unlock 不发出、available / locked=false，方向入口说明由系统管理。全屏只填满当前应用窗口；已生成对应配置，真实分屏 / resize 尚待设备操作。不能只因 Expo 锁向 Promise 完成就把系统窗口记成已旋转。

### B站账号边界和能力探测

- 添加、切 P、关联视频和重解析统一走 `resolveInputBili()`。普通视频在无本机已登录解析环境时可由服务端解析；本机账号可用且被选中后，失败不静默切换账号。PGC/CLI-only 仍要求本机具备权限的账号。完整链接、短链和分享文本展开后保持规范地址，显式 CID/P 优先，未显式指定 P 时不硬塞 P1 覆盖展开结果。
- `BiliAccount.tsx` 的本机状态与 `BiliServerAccount.tsx` 的服务端扫码状态分别展示、登录和退出；服务端账号不能误标为本机账号。Cookie、二维码轮询凭据和本机媒体代理仅用于各自会话，不进入持久化影片或共享播放 DTO。
- `BiliMovieSettings.tsx` 按当前站点、登录身份、影片与来源建立独立编辑状态；卸载 / 换身份时在 layout cleanup 取消旧操作，首次偏好读取完成前禁用提交。`applyMovieBiliPolicy()` 在解析后、偏好读取后和写入完成后检查当前操作，迟到解析不能保存；已经提交的本机写入可以完成，但被取消的旧编辑器不能再触发全局播放失效，重载另一部影片。
- `ZVBiliCapabilities.m` 使用20个自主合成的AVC High / HEVC Main、8-bit 4:2:0 SDR关键帧，分别验证真实横/竖尺寸。真机要求精确格式、硬件会话、`UsingHardware`、`CanAcceptFormat`以及实际输出正确尺寸的视频帧，才开放对应档位，最高4K30；不能交换宽高后宣称竖屏硬解可用。软件路径和Simulator限于AVC720P30 / 480P30。
- 能力探测成功缓存600秒、空结果30秒，探测调度预算3秒；`maxFrameRate=30` 是保守策略上限，并非已测得的持续解码帧率。低版本系统/API 不可验证或无有效能力时应明确失败，不伪造能力矩阵。`ZVBiliBridge.m` 将矩阵交给本机 Go 选择器，仍屏蔽60fps、AV1、HDR/杜比；服务端解析的 HDR 标识、档位和 Dolby codec 同样检查。
- `scripts/bili-capability-smoke.m` 检查尺寸、非法输入、缓存、SDR策略和20个真实关键帧输出，并拒绝损坏样本。夹具可在macOS运行 `bash ZV-iOS/scripts/generate-bili-probe-fixtures.sh` 重新生成。关键帧成功不代表高码率持续播放、热稳定、耗电或音画同步已验证，第三代iPad Pro真机仍待验收。

### 原生媒体库 HLS Relay 与 VLC 回调

`libraryHls.ts` 只对当前服务器前缀内的 Emby/Jellyfin stream/proxy 路由补做有界 MIME 探测，以识别记录标作 MP4、实际返回 HLS 的情况。显式 HLS 及已确认 HLS 经 `hlsNative.ts` 启动 `ZVHLSRelay.swift`；普通渐进媒体或探测失败不会被猜成清单。

Relay 是监听 `127.0.0.1` 随机端口的本机原生服务，VLC 只读其临时 capability URL。每次请求重新读取上游动态清单并改写子清单、普通分片行及 `URI="..."` 属性，包括密钥和 init-map；保留单范围 Range/206、所选反向代理前缀和当前服务器认证。认证只发给绑定服务器、provider 路由和同一 movieId，跨域、跨影片、非媒体库子地址或非法重定向会失败，不向外泄露凭据。

该实现限制并发、请求头、网络时限和响应体：清单最多 2,000,000 字节，普通资源最多 32 MiB，超限经当前 relay id 的错误事件显示给播放器。`NativeVideoSource.dispose()` 在 adapter 换源、清空或销毁时释放旧 listener；未完成准备的取消和模块释放也清理请求。普通播放/暂停更新会取消上一轮解析，但不能因此关闭仍在使用的已准备 listener。认证变化须创建新来源，不能永久缓存带旧认证的 listener。大型分片、特殊 HLS 扩展和实际 Emby/Jellyfin 转码服务器需要按场景回归，不能用一个静态本地 m3u8 替代所有验收。

`with-vlc-tracks.cjs` 的持久补丁补充实际视频尺寸、后到的 HLS length 和暂停源 ready 回调。事件仍携带 revision；`VlcPlayer` 将后到时长送入 sourceLoad，换输入清空旧时长。`PlayerDisplay` 以实际解码宽高选择全屏方向，同类尺寸重复回调不覆盖用户手动解锁。原生诊断仅记录 revision、时长和播放意图，不记录媒体地址、token 或请求头。

### HLS 恢复位置与 ConfirmedSeek

2026-10-22 的 NAS 实测曾复现：旧 Kazumi 记录播放公开 Mux VOD，直连暂停在 **81.043 秒、1.5 倍速**，开启服务器中转后先显示“已保存并应用”并广播原位置，约 1.8 秒后原生位置却落到 **90 秒**，暂停 HLS 时长仍为零。该复现说明先前的 ready/seek ACK 门控不够；此前普通 MP4 或 Jellyfin 恢复成功不能覆盖这个场景。

当前修订保持公开 VLCKit API，未使用私有 `isSeeking`、runtime 访问或伪造媒体时钟：

- `plugins/vlc-seek.cjs` 的 `ZViewerConfirmedSeekV2` 先等待输入 `isSeekable`，请求暂停后必须观察到实际 `.paused` 状态，才调用公开 `jumpWithOffset:completion:`。暂停请求是异步的，不能将调用 `pause()` 本身视为输入已暂停。普通渐进媒体及已暂停的音乐音频仍检查公开 `time` 与 `.paused` 状态，要求目标 ±0.5 秒内连续稳定 2 秒，15 秒内不能确认则失败。播放中的后台音频由下述独立路径处理。
- HLS 视频另由 `ZViewerDecodedHlsSeek` 使用公开 `gotoNextFrame()` 和 `nextFrameSteppedWithResult` 的成功回调准备解码帧。先定位到目标前 2.5 秒，再保持暂停逐帧推进；只有成功帧回调后实际原生时钟在目标 ±0.1 秒内稳定 2 秒，才返回成功。时间映射越过目标时可向更早位置校正，总计最多 4 次定位、800 次帧请求和 30 秒；超限返回明确失败。`VlcVideo` 按已解析的 HLS 类型启用该属性，后台音乐不启用。不会为准备暂停媒体调用 `play()`，也不会将 seek ACK 的缓存目标值当作解码完成。
- seek 期间重复的状态性 pause 不再打断解码定位；play/pause 只更新最新意图，确认后才恢复该意图。约 2 秒的确认窗口属于当前实现的交互延迟，不能把这段准备时间写成已完成应用。
- `VlcPlayer` 对新原生 Promise 的 pending seek 不使用旧的 5 秒自动解锁逻辑，也不接受准备中的进度回调作为完成证据。`playerReady.ts` 同时等待媒体准备、seek 确认及 HLS 有效时长；初始 45 秒预算到期时，只能依当前原生 seek 开始后 30 秒及 5 秒回调预算的剩余时间延长一次，不能提前超时后让后台定位继续改变已确认状态。定位失败进入“设置已保存但应用失败”的重试路径。`ZViewerSeekFailureClock` 显式返回失败及当时的原生时钟；JS 清除 seeking、恢复真实位置并保留已准备的输入，通过 `VLC_SEEK` 提示允许再次显式拖动，不能将有效输入永久降为未准备。原生仍以 revision 隔离切源和迟到结果。
- 静态聚合源 VOD 的 `hlsPlaylist.ts` 从真实 `EXTINF` 累加时长，通过 `hlsNative.ts` 放入 `NativeVideoSource.duration`。这提供暂停加载时尚未到达的清单时长；后到的原生 length 仍可更新。它不设置或替代原生播放位置，也不将直播/无结束清单伪装成 VOD。

第 11 轮已构建并开始 Simulator 复测，补充三个独立边界：`ZViewerOpeningPauseGuard` 在 opening / 不可暂停状态只保存最新暂停意图，只有当前输入 `canPause && playing` 才调用公开 `pause()`；libVLC 在尚不能暂停时的 `set_pause` 会停止输入，已用同版公开 Mux 小 HLS 探针复现这一冷启动原因。`:start-paused` 与原有首次打开流程继续承担暂停准备，不为此暗中启动播放。

`ZViewerContinuousAudioSeek` 仅用于 `backgroundAudio && autoplay`，不先暂停音乐。V3 将目标到达与实际推进分开：先观察目标 ±0.5 秒内的原生时钟，首个累计至少 100ms 的实际增加建立进度基线，再要求两个后续递增样本与基线按实际速率外推之差均不超过 0.5 秒，外推扣除实际观察到的 paused 时段。离散 watch-clock 的重复读数不算新样本；`playing` 状态也不代表首批数据已推进，初始静止时间不再制造永久时钟偏差。实际已在目标 ±0.5 秒内的近零等输入不发多余 jump，仍须完成上述确认；非零 jump 仍要求公开 ACK 与严格目标到达，首次增加过大也不能直接成为新基线。8 秒内不能确认则显式失败，返回值始终为观察到的原生时钟。`ZViewerSeekCancellation` 则先撤销旧操作代次、清理持有者，再完成旧 Promise；stop、外层 view 销毁、持久音乐换源及实际重新初始化前调用它，旧完成函数不得暂停或恢复新输入。

该组实现的 Swift mock / 原生补丁专项 10 项、含 JS 事务与播放器的 30 项回归通过；typecheck 与标准 lint 通过。同版 macOS VLCKit 合成 WAV 实测定位 30 秒，1.204 秒后以实际 31.072 秒及两个递增样本确认，后续 31.766 / 32.072 / 32.765 秒持续播放，期间暂停事件为零。[证据与限制](evidence/native-opening-audio-cancel-2026-10-22.md)。这些证据尚不是第 11 轮 Simulator 上后台音乐观众同步或冷暂停视频画面的通过记录；MKV 灰屏及小 HLS 24.346 秒精确定位仍失败 / 待修，本轮未引入新的帧刷新实验。

第 11 轮 Simulator 自动 B站 → NCM 曾复现：新曲 ready 后迟到 `:start-paused`，播放意图仍为 true，8 秒后 `audio-seek target=1 actual=7079 advancing=0 success=0`。因此首版 continuous 路径不能视作自然切歌通过。已冻结的后续 `ZViewerContinuousAudioSeekV2` 在定位后遇到 paused 也按最新播放意图仅请求一次恢复；实际已处于目标 ±0.5 秒内的新曲不再发多余 jump，仍要求真实进度确认。验证外推时扣除实际观察到的 paused 时段，限差仍为 0.5 秒，回传真实时钟。相同 framework 的“jump 后迟到暂停”和“初始 0 / 目标 1ms”两个 WAV 探针均持续增长并通过；后续二进制的 NAS 自然切歌仍须另验，不能用这些探针覆盖。

第 12 轮 Home 自然切歌的失败包含真实 SIGABRT：`MediaPlayer.destroyPlayer()` 新增取消曾读取 `private unowned view`，而宿主 view.deinit 正在调用底层销毁，触发 `swift_abortRetainUnowned`；不能归因于系统暂停。后续第13轮修订把实际重建前的取消移到 `initPlayer.shouldInit` 分支，外层 view 的 stop / destroy / replaceSource 仍取消，底层 destroy 只撤销 delegate、停止输入并释放引用，不读取宿主。Swift 生命周期回归提取实际生成方法：正向释放与单次取消通过，保留旧 input 的晚到 delegate / queued weak 回调不再控制；重新插入旧 unowned 读取的独立负向进程稳定 SIGABRT。构建 guard 同时拒绝底层 destroy 读取 `view.`。该回归不能替代新二进制 Home / Lock 自然切歌的设备复测。

第 14 轮真实 iPad Simulator 的近零新输入获得独立正向记录：Home 自然 B站 → NCM、Lock 自然 NCM → B站均继续播放超过 30 秒，返回前台仍为同一 PID。锁屏新 B站输入先经历 paused → playing，再于 2.227 秒以实际 919ms 建立基线，3.208 秒以实际 1919ms、`noOp=1 / targetObserved=1 / anchored=1 / advancing=2` 确认。该记录覆盖本次近零自然切歌；同轮旧 B站 31.352 秒非零恢复仍在 8.007 秒后失败，虽缓存时钟等于目标，`targetObserved=0`，不能记定位通过。本机实际 header 的 raw2 为 playing、raw3 为 paused；该次 seek 窗内没有迟到 paused 证据，尚不能把失败归因于暂停恢复。

第 15 轮已构建的最小修订进一步堵住暂停旁路：最新暂停优先，但只有已观察到目标且实际 paused 时钟仍在目标 ±0.5 秒内才能成功；公开 ACK 本身不足以成功。独立 Swift 负例的 40 秒目标实际错落 46 秒后再暂停，现明确完成为失败、清除 seeking 并保持暂停。建立进度基线前，目标窗口内的 50 → 21ms watchpoint 回退只重建尚未启动的基线，不增加推进计数；建立基线后的回退仍失败。新增 `audio-seek-issued` / `audio-seek-ack` 与最终 `issued / arrived` 诊断，用于区分非零恢复是否收到了 ACK，不改变成功条件或 8 秒上限。对应 32 项专项、typecheck、定向 lint 与构建 guard 通过，独立实际生成 Swift 复核通过；第15轮已完成所列Home / Lock主音频与失败surface回退（见状态报告）；旧非零恢复失败继续保留，不以自然跨曲正向覆盖。WAV mock 覆盖首时钟静止 1.2 秒，真实 localhost HTTP WAV 只观察到约 0.99 秒的首时钟静止，不能将后者写成“超过 1 秒停滞已验证”。

JS 的 confirmed-seek 接口必须搭配含 `ZViewerConfirmedSeekV2` / `ZViewerSeekPromise` 的新原生构建，不能只刷新 JS 后用旧二进制的 void seek ACK 验收。第 7 轮真实 iPhone Simulator 上，90 秒暂停、1.5 倍速从中转切直连时准确报告应用失败，未假报成功；日志显示 ready 后输入仍在 playing，原生最终停在 79.799 秒。第 8 轮加入等待实际暂停的 V2 后，NAS 同一公开 Mux HLS 从直连切中转获得正向结果：16:38:58.534 观察到 `.paused`，58.624 发出第一次 90 秒定位，16:39:00.797 从分段边界 93.766 秒发出第二次精修，16:39:02.976 返回 `target=90000 actual=90000 success=1`。界面随后显示“已保存并应用”、1:30/10:34、暂停及原 1.5 倍速，后续观察保持 90 秒。该证据只覆盖本次整数 90 秒、直连到中转方向；真实 Simulator 上 81.043 秒非整数位置、反方向切换及其他媒体来源仍须分别复测。`start-time` 曾在独立探针中产生异常负时长，未采用该方案。

专项 JS 回归覆盖首次 ready 后仍等待 native seek、pending 超过旧 5 秒窗口、段边界进度不能提前结束事务、原生定位失败及清单时长。真实 macOS VLCKit 探针直接编译使用生成补丁中的同一段 Swift seek 方法，关闭视频输出，使用本地 VOD 清单及真实网络分片；暂停 1.5 倍速下确认原生 **81.043 秒**，约 **2.16 秒**后返回成功，4 秒后仍保持该位置与暂停。该证据验证方法与原生时钟交互，不能替代 Simulator 视频解码、NAS 中转路径或真机验收。

后续真实 iPad Simulator 的 NAS Jellyfin HLS 暂停快进复现了 V2 的边界：目标 **144.842 秒**，原生最终 **147.975 秒**并准确报告失败。带视频、音频解码的同版 macOS VLCKit 探针还观察到 V2 曾先返回 `144842`，3 秒后公开时钟变为 `150391`；因此前述整数及无视频探针不能作为 HLS 视频小数定位通过依据。生成方法中的帧准备修订在 NAS 同一输入上得到 `129842→129750`（134 次帧请求、12.744 秒）及 `144842→144750`（169 次、11.691 秒），保持原 1.5 倍速意图和暂停，后续 8 秒仍为 `144750`。这些是使用真实视频/音频解码及 NAS relay 的 macOS 协议探针证据；新二进制的 Simulator UI 小数快进、两种中转方向及其他 HLS 来源仍须逐项验收，不能提前记为设备通过。

### 音乐同步、队列和音乐界面

- `musicAuthority.ts` 将音乐服务器时钟与房主存活分开。服务端 `music:sync-heartbeat` 的 position 已外推，按接收时刻建立本机基线，不能再加原 updatedAt 的同一段时间；零秒是合法值。近期服务器时钟优先，旧 `music:host-heartbeat` 只在兼容回退时纠偏；控制、心跳和自检共用有冷却与媒体准备门控的纠偏入口，显式控制不能被心跳冷却吞掉。
- 房主 `music:sync-state` / `music:host-heartbeat` 携带 clientTs；观众有界调用 `music:check-status`，旧连接、已切曲和已被新状态取代的 ACK 不得覆盖当前播放。get-state 的队列与播放时钟各有代次：新心跳可以使旧时钟失效，但不能丢弃仍有效的初始队列；重连准入竞态使用有限退避重试。
- 同一首歌首次解析可长于 2 秒心跳周期。`MusicPanel` 合并同曲待解析期间的最新时钟和播放/暂停意图，不反复取消解析；真正切曲、切服务器或账号仍取消旧任务。慢解析完成后服从最新暂停/零秒意图，不短暂恢复旧播放状态。
- `MusicHostStatus` 消费 hostOnline、host-disconnected 和 sharer-ready；显式房主离线后保留短暂宽限，避免缓存的 online 立即覆盖离线事件。无权威样本时兼容旧房主心跳；本机断网不等于房主离线。确认房主离线时，观众可在本机控制当前队列，不发房主专属同步/心跳；房主恢复后重新跟随服务器并恢复申请制。
- 队列管理按 `musicQueue` 权限矩阵独立计算。有权限的观众 addQueue 直接等待服务端 queue-upsert 确认，移除和排序同样受权限控制；这不授予播放状态广播或房主播放模式权限。无队列权限的在线观众仍申请房主，断网不缓冲写入；服务端拒绝入队时不能先切歌。
- `MusicNavigation` 保留手机搜索按钮、宽屏搜索框、来源选中态以及互斥的不透明导航/账号菜单。`MusicBiliBrowser` 读取当前 NAS 的音乐分区榜单、搜索和服务端收藏夹，按实际宽度显示卡片；链接解析仍复用 B站选择流程。加载、错误与空态来自实际请求，不以演示卡片冒充推荐结果。
- 完整播放器按能力显示歌词、罗马音、翻译、纯净视频、房主模式、歌曲评论、关联视频、B站原视频、队列、设置和明暗入口；黑色视频上的收起按钮保留浅色底和 44 点触摸区。`musicLyrics.ts` 按时间合并 NCM 原文/罗马音/翻译。`SongComments` 区分 NCM 歌曲和 B站原视频评论；B站接口在此只读，评论计数、分页及迟到响应均绑定目标身份，不能混入房间聊天。
- 底部小播放器和完整播放器以 `queueOwner=mini/player/null` 保证队列只有一个弹层所有者；进入/退出完整播放器先清旧队列和歌曲评论，旧弹层关闭回调不能关闭另一个所有者的新弹层。关闭歌曲评论/队列应返回完整播放器，不能释放主音频。

### LiveKit 语音

`voiceTransport.ts` 检查 LiveKit 当前真正需要的 publisher/subscriber PC、connection/ICE 状态与选中的成功 candidate pair；同时呈现实际 UDP/TCP 等协议。token 成功或 SDK joined 只表示信令阶段，不能直接标为音频已通。加入、重连或 PC 变化重置媒体检查计时；约 10 秒仍未连接时提示超时。诊断缺失、异常或不支持时显示“媒体状态待确认”，不因此主动踢出通话。

iOS 麦克风授权弹窗造成的临时 inactive 不销毁现有只听会话，授权等待不计媒体超时；真实 background 仍执行闭麦与生命周期清理。管理员解禁不自动开麦。`voiceVolumes.ts` 以全局输出 × 成员独立收听增益调用远端 setVolume；暂停收听临时归零、恢复后还原成员选择，并在重订阅时再次应用。成员收听音量不改变本机麦克风采集增益，后者走独立原生接口。

### 构建来源、已测范围与保留项

共享 Go 变更经审阅后，`native-core-baseline.json` 更新至客户端来源 `a869088a6e7dd9fc56e5cf4a9e8070a877adb923`；模块声明仍为 Go 1.26.8，Simulator 工具链固定 1.27.1。`stage-native-core.cjs` 的校验和暂存步骤保留，不能删除校验以通过构建。Simulator 准备脚本允许显式 `ZVIEWER_USE_SYSTEM_GO=1` 使用版本严格相同的本机 Go，默认下载摘要路径不变。原生修改继续放在本地 module/config plugin，不能只留在 `ios/` 或 node_modules。

| 本轮证据 | 可作出的结论 | 维护时不得扩大为 |
| --- | --- | --- |
| iPhone 17 Pro / iOS 26.5 Simulator 的 NAS MP4、HLS 与合成竖屏画面检查 | 对应原生 Debug 场景能够呈现画面，HLS 后到时长、暂停/零秒与竖屏路径有模拟器证据 | 全格式、听音、真机硬解或长时跨端验收通过。 |
| 第 5 轮 Simulator Debug 的 NAS Jellyfin 恢复事件：原生 length 6,722.131 秒，JS sourceLoad → readyToPlay，恢复位置 210.49 秒 | 该次真实媒体库恢复能够取得时长并完成原生准备 | 所有媒体库动态 HLS、全部策略组合或后续 ConfirmedSeek 修订已验收。 |
| 第 7 轮 Simulator Debug 原生编译成功；旧 Kazumi/Mux 的 81.043 秒 → 90 秒复现已有日志 | 已有待复测缺陷及包含修订的可安装原生构建 | 安装后 NAS 的暂停 1.5 倍速、中转切换与后续漂移已经修复通过。 |
| 同一 ConfirmedSeek Swift 方法的 macOS 真实 VLCKit 探针：暂停 1.5 倍速定位 81.043 秒，确认后 4 秒仍稳定；28 项 VLC/HLS/事务专项回归通过 | 对应原生时钟确认与受测 JS 门控成立 | iOS Simulator 视频解码、中转链路、完整四种策略组合或真机结果。 |
| iPad Pro 11 M5 / iPadOS 26.5 Simulator 原生音乐房主 → NAS 4.7.4 → Socket 观测客户端，连续 10 分钟；300 个服务器心跳、298 个原生房主心跳、59 次 check-status；host/server 时钟最大绝对差 0.18 秒 | 本次房主上报与服务器外推时钟在观测窗口内持续工作 | 第二个原生观众的音频播放漂移，或 iOS↔Android/HarmonyOS 听音同步误差。 |
| 第 9 轮 Debug 的 iPad，旧 NAS Cookie 曾覆盖新 Bearer 并造成入房拒绝；隔离后 NAS 确认所选账号 join success，WebRTC 竖屏运动画面可见，三次 framesDecoded 为 91 → 166 → 241 | 本次旧 Cookie 跨账号污染已真实复测解决，原生视频解码与音视频接收字节持续推进 | 全局 Cookie 已清理、B 站 / 网易云会话被重置，或真实音频听感 / iPad 横屏 / 跨平台互操作已通过。 |
| NCM 扫码后的登录 API HTTP 200、code 200，profile/account 存在；本机 B站退出账号经界面确认 | 对应账号状态流程已观察到成功结果 | 所有版权/VIP 内容、PGC、本机高画质或持续解码均已验收。 |
| JS 协议/实际组件回归、原生 HLS Relay 的 macOS Swift + Network/URLSession 本地 HTTP 合同测试 | 动态子清单重取、服务器前缀与鉴权、KEY/MAP、Range/206、HEAD 改写后长度、跨域拒绝、可见超限及 listener 取消等受测合同 | NAS 全部媒体库 HLS、真实分片解码或 iOS 系统网络行为已覆盖。 |

当前Debug16已安装并启动phone / iPad，iPad新房原生准入成功；前述第7 / 8 / 10轮及macOS探针均是阶段证据。Jellyfin 大电影 HLS 的小数定位仍未稳定通过；小动漫 MKV 66 的 137.207 秒 clock / ACK 虽匹配，实际暂停画面为灰屏，同时间原片有界 Range 抽帧为清晰彩色，故必须记画面失败。MKV 67 的双设备画面和 ASS 可见不覆盖 seek 或听感。余下精准定位、策略切换、跨源清轨与恢复按现有小素材补证；不继续反复读取大电影。动态清单及反代前缀仍不能由单个 Jellyfin 起播代验。

仍须分别完成：物理 iPhone/iPad 的硬件解码与持续帧率、HDR/杜比、麦克风听音/蓝牙/来电/音频路由、锁屏与系统挂起；第二原生观众以及 Android/HarmonyOS 互换房主的真实音频同步；弱网、认证更新和异常媒体库清单。Simulator Home / Lock 两次自然切歌单独见[音乐证据](evidence/ios-simulator-2026-10-22/music-background-home-lock.md)，不是系统回收后仍运行的证明。iOS 当前没有独立原生房间业务 Socket；ReplayKit 发送未实现且依用户要求排除本轮。UI 继续按实际截图核对，不用参考图或组件测试代替。

第10轮窗口配置虽已安装，实际拖动手柄没有产生window尺寸变化，真实resize / 分屏仍未通过。[房间原生专项](evidence/room-ui-live-font-transfer-2026-10-22.md)已关闭所列字体热变与转交问题：实际fontScale1.353→1→1.353时phone房间完整，iPad编辑草稿保留并取消、键盘可达；随后iPad1→phone3→iPad1无重连双向转交，管理 / 模式入口及名单实时更新。DynamicText只重建native文字段落，不key表单或播放器。其他页面 / 角色和失败分支仍分别验收。

`MusicPanel`的失败不能在catch或普通心跳中调用adapter.invalidate清门控。解析 / native错误保留当前失败，只有显式重试、播放 / seek控制、新来源 / 账号 / 音质或真实房主变化才允许恢复；B站既有自动fallback最多两次。`VLC_SEEK`保留已准备input，并以当前来源scope阻止自动apply / 纠偏，显式seek可复用同一input。四项新增真实组件回调回归覆盖心跳有界、local / room显式恢复和换曲；不能替代当前二进制后台实测。

### 第16轮反馈修订：更多菜单、评论布局与弹幕来源

`PlaybackControls.tsx`使用Modal portal承载More，分别测量trigger和portal并转换到同一坐标系；以真实内容高度定位，不预留410pt再把短菜单悬在画面中央。优先按钮下方可滚动空间；不足一行44pt触摸区时，以实测高度在上方保留8pt间距。窗口 / 字体 / 安全区 / 键盘 / composer变化触发重测，关闭后迟到测量不能重开。`playbackMenu.ts`几何及实际组件回归共8项；phone16竖屏下方、横屏底部不足时贴按钮上方已实际目视；iPad系统窗口portrait下方也已实际目视，横屏 / 全部宽度仍待验。

`RoomSideDrawer.tsx`承载一起听右侧房间评论，`RoomDiscussion.tsx`保持房间订阅、按room / socket epoch隔离history和send，关闭 / 重开保留记录及输入；发送错误与历史错误分离。音乐设置首项网易云音质，移除多余默认来源选择；歌曲评论保持独立身份。投屏由room布局决定竖屏下方 / 横屏右侧聊天，手动全屏隐藏、退出恢复草稿。phone16横竖屏、键盘避让和实际房间评论发送已测，不据此关闭所有尺寸 / 权限 / 失败路径。

`danmakuSource.ts`以当前房间 / movie / CID等媒体元组隔离B站自动来源，轨道带媒体scope；初入可保留legacy手动轨道，切片不复用。Manager / Search / 自动导入共用串行`DanmakuWrites`：已提交POST等待ACK，清源排在旧写入之后，尚未提交的旧ticket拒绝；迟到GET与旧clear不能写入新源。显式删除当前default或viewer看到其被删后不自动复活，保留已确认hidden / offset，viewer不写NAS。23项专项通过；新NAS P1 / P2素材已取得，但本轮UI play返回“影片不存在”，REST条目与原生发送room / movieID一致，iPad真正GUI建房后78同错而Node数字75成功，尚无根因定位，不能声称新自动弹幕与防串片已真实播放通过。[本轮反馈证据](evidence/ios-simulator-2026-10-22/feedback-build16.md)。

### 投屏接收端：生命周期、控制栏与本轮证据

本轮按用户最新要求只完善 **iOS 作为接收端** 的 WebRTC 和 OBS HTTP-FLV 观看。没有加入 iOS 自身屏幕共享、ReplayKit 采集、发送端配置或采集权限流程；上文历史保留项中的 ReplayKit 发送专项不属于本轮交付或待验收范围。

- `ScreenShare.tsx` 负责接收画布、原生 RTCView/VLC 绑定、本机暂停/音量/静音、方向与全屏、状态和错误展示。房间页在加入成功后挂载接收端；未获审批、被踢、离房或切模式时由房间生命周期卸载。观看不请求麦克风或屏幕采集权限，不发房主控制/分享事件。
- `screenReceiver.ts` 为每个房间连接管理一个接收 PC 及其合并 MediaStream。消费现有 `signal-offer`、`signal-ice-candidate`，只向对应共享端发送 answer/ICE，并以 `viewer-ready` 请求共享端提供画面。独立 stream 与 streamless 的 `event.track` 均加入同一个渲染流，不能让后到的音轨替换屏幕视频。播放/暂停与接收增益也立即应用于后到的轨道。
- 接收态必须同时有实际 `connectionState=connected` 和可用、未 muted 的远端视频；收到 ontrack 或 answer 完成不等于画面已通。已安装的 RN WebRTC 库在远端移除轨道时可能发 `mute` 而不改变 readyState，因此同时监听 mute/unmute/ended；视频 muted 时清除画面接收态，unmute 可恢复。本机暂停使用 enabled，本机音量使用远端音轨增益，不断开信令或改变共享端状态。
- 每个异步 SDP 步骤之后核对当前 PC/连接代次。早到 ICE 有界缓冲，坏候选不阻断其余候选或 answer；构造候选的同步异常同样隔离。`sharer-ready` 是后端鉴权后的重启通知，必须创建新 PC 并重发 viewer-ready，即使旧 PC 尚未从 connected 变为 disconnected。不能用旧 connected 状态吞掉重启。
- `viewer-ready` / answer 的拒绝、`sharer-error`、房主断开和媒体连接超时分别展示真实状态。刷新、重连、共享端重启和卸载先移除回调，关闭旧 PC，并 stop/release 所持远端轨道和 MediaStream；旧 Promise、定时器或轨道回调不得写入新会话。
- OBS 仍通过 `NativeMediaAdapter` 与 VLC 接收。`screenFlvUrl()` 保留 HTTPS 反向代理前缀，HTTP 默认使用服务端主机的 3335 端口，允许现有设置中指定 HTTP(S) 服务 base；不接受含用户密码、查询或片段的 base。streamKey 只用于当前拉流，不写入日志、文档或公共测试证据。
- `loadScreenPull()` 每次先串行清空旧来源，再以零位置、暂停意图准备新直播输入，完成后应用最新本机播放意图。直播同 URL 刷新不能沿用 `NativeMediaAdapter` 的 VOD 保位逻辑，否则会把此前已运行的秒数作为不可 seek 直播的新定位目标。测试使用真实 adapter 验证旧时钟 30 秒后重拉只应用零秒。退役加载不能在清空之后重新开始旧来源。
- OBS `stream-status=offline` 会卸载画面并显示等待；后续 live 自动重拉。重连、换房、换 streamKey/服务器/连接身份时将旧 offline 缓存恢复为 unknown，防止断线期间错过 live 广播后永远停在等待。拉流效果绑定房间身份，旧房间任务不得继续写播放器。HTTP 200 或只有 FLV header 不能视为已接收媒体，界面接收态以原生实际播放事件为准。
- 接收端只有一套控制栏。常规控制等距自适应，保留暂停/继续、本机静音、方向、全屏、设置与刷新；全屏隐藏连接标签，安全区内保留必要控制。单击等待双击判定后显隐，双击暂停/继续；拖动、长按和多指取消待判定手势，控制本身不穿透到画布。横屏自动全屏，同一横屏尺寸手动退出后不立即强拉。暂停/错误文案使用深色半透明底，避免在亮色共享内容上失去对比。已有 VLC PiP 仅在物理设备的 OBS 设置内按实际播放能力尝试，失败展示错误，未将模拟器行为当成 PiP 验收。
- Debug 下媒体连接后最多三次、间隔 5 秒读取 RTC getStats，只输出 video/audio bytesReceived、framesDecoded、width、height。离房/退役取消；Release 不运行。该诊断不输出 IP、SDP、地址或凭据，计数仍须有实际日志才能作为音视频接收证据，不能因代码存在就宣称已测。

本轮接收证据截至本节记录时如下，最终完成范围仍以开发状态报告中的最新实际记录为准：

| 证据 | 已确认范围 | 尚不能证明 |
| --- | --- | --- |
| 原生 iPhone 17 Pro / iOS 26.5 Simulator，NAS WebRTC 独立测试房间：run 1 独立 audio stream、run 2 streamless audio、旧连接仍 connected 时 restart 后 run 3 | 三次均实际呈现共享画面；独立/streamless 音轨到达未丢失视频；本机暂停/继续/静音、横屏自动全屏、控制显隐、发送停止后的清画面/等待已操作 | 实际听音质量、音画同步、弱网、TURN/复杂 NAT、后台恢复、物理设备和 Android/HarmonyOS 互通。发送端合成 canvas 的目标帧率不是已测解码帧率。 |
| 原生 iPhone Simulator 接收 NAS OBS：RTMP 持续推送，HTTPS HTTP-FLV 有媒体 tags，并出现原生运动彩条与源端时间码 | 首次加载、约 9 分钟后的刷新、刷新后约 11:11 测试码继续递增且未发生旧位置 seek；暂停/继续/静音、全屏、停止发送后的 offline 清画面与等待提示 | 端到端延迟、持续帧率/耗电、声音质量、硬件解码、PiP 或所有 OBS 编码组合。仅 FLV 头的早期失败探针不计为成功。 |
| NAS OBS 停推后重新发送；主线程目视重启截图，新 RTMP 源端时间码约 02:26，彩条/运动图重新出现 | offline 清画面后自动恢复实际画面，无需手动刷新 | 不扩大为任意断网时长、编码切换或所有网络路径的恢复保证。 |
| `screenReceiver.test.mjs` 与 `mediaPanels.test.mjs` 共19项阶段定向通过（16接收、3既有语音）；当时完整check14为355 / 355（历史，最新check20为409 / 409） | 同流合并、状态门控、轨道释放、SDP/ICE竞态、权威restart、同URL直播归零、offline后错过live的重连恢复、手势序列等受测合同 | 原生网络、UI像素或声音的证明；阶段专项不与最终全量数相加。 |

暂停提示深底为最后一轮 JS 视觉修订，最新截图复核尚待完成，不能把此前无深底的暂停截图当作新样式证据。

第 9 轮构建已完成 iPad 竖屏接收的实际画面与递增音视频统计，见本轮证据索引；横屏、物理 iPhone/iPad、后台/锁屏、蓝牙与路由、弱网恢复及实际听音不由该竖屏模拟器结果推断。用户已要求停止重复投屏测试，后续验收转向文档中的其他功能。
