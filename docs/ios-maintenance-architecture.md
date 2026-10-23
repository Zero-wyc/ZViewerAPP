# iOS 客户端维护文档

更新日期：2026-10-23（Asia/Shanghai）。本文整合架构、macOS开发记录、验收清单、构建证据、Windows回传与历史故障。当前状态、实现合同、实测范围和未解决项集中维护；已移走的阶段材料可通过Git历史查询。

## 当前版本与工作边界

| 项目 | 当前状态 |
| --- | --- |
| 应用 | 2.1.10 / build31，`com.zviewer.mobile`，最低iOS/iPadOS16.4，支持iPhone/iPad。 |
| 工程 | 独立Expo SDK57 / React Native0.86；唯一视频/音乐内核为VLCKit4.0.0a25，语音LiveKit，投屏WebRTC/OBS接收。 |
| 用户验收 | 用户对build30反馈“测试通过”；build31保持该播放/房间逻辑，仅统一2.1.10版本元数据并重建发布。没有给出的设备OS、时长和逐项结果不作扩展认定。 |
| 发布 | 未签名device ARM64 IPA追加到既有 `client-v2.1.10` Release；Android/HarmonyOS仍为2.1.10/220原包。自行签名后侧载，未使用App Store/TestFlight。 |
| 源码 | 完整后续iOS源码在main；原Release标签保留双端最初快照，标签自动归档不含全部后续iOS修复。 |
| 本次Windows工作 | 文档与检查入口整理、移走测试和缓存；不更改播放逻辑，不构建IPA，不新增原生/真机通过结论。 |

所有客户端修改及Git操作在本仓库。iOS设备构建需用户明确指示；Windows日常先用Expo Go/Web检查可用界面，原生VLC、Go、LiveKit、Keychain及系统音频必须在对应原生环境验收。跨平台来源对照见 [Android维护文档](android-maintenance-architecture.md) 和 [HarmonyOS维护文档](harmonyos-maintenance-architecture.md)。


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

以下入口按2.1.10 / build31源码维护；旧1.9.0/build26只属于历史发行。

| 能力 | 入口 | 维护规则 |
| --- | --- | --- |
| 播放栏与媒体控件 | `PlaybackControls.tsx`、`MediaPanelUi.tsx`、`ScreenOrientationButton.tsx` | 保持单行等间距和44pt触摸目标；按扣除padding / safe-area后的真实行宽把音量、设置和方向收进已有更多菜单，首项始终展开 / 收起弹幕输入。 |
| 字幕和弹幕设置 | `PlaybackSettings.tsx`、`DanmakuTypeIcon.tsx`、`Danmaku.tsx`、`danmakuImport.ts` | 设置只保留字幕/弹幕两页；四类弹幕开关按本机偏好分别存储。在线来源和轨道管理保留；手动 XML/JSON 导入与 JSON 文本编辑不作为当前 iOS 产品入口。 |
| 投屏接收 | `ScreenShare.tsx`、`RoomChatPanel.tsx` | iOS 作为 WebRTC 接收端；刷新先关闭旧 peer 再重新宣告 viewer-ready，OBS 播放器刷新旧拉流。暂停接收、聊天和全屏切换不得误释放房间或视频会话。 |
| 房间语音 | `VoicePanel.tsx`、`voiceVolumes.ts`、`voiceProtocol.ts` | 分开维护本机麦克风状态、LiveKit 远端输出音量与成员音量；默认只听，权限和管理员禁言不能覆盖用户的本机闭麦选择。离房/断线释放音轨与采集。 |
| 房间设置 | `RoomSettings.tsx` | 模式、房间状态、成员、分享、加入审批与离房集中展示；入房审批与播放申请自动通过是两项独立设置，快照更新不可覆盖正在编辑的字段。 |
| 网易云导航 | `MusicNavigation.tsx`、`MusicPanel.tsx` | 导航菜单与头像操作互斥，设置入口统一从头像菜单进入；横屏内容限高滚动、浮层采用不透明主题背景。 |
| 播放显示状态 | `usePlayerDisplay.ts`、`playerDisplay.ts` | 历史 1.9.0 进入全屏默认横屏；现行 iPhone 按实际解码宽高锁向、退出恢复自动，iPad 方向由系统窗口管理且不声称锁定成功，详见下文显示偏好。 |

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
- [Debug16合成TLS原生证据](#历史验证与待验边界)23项均true，含RN fetch / Engine.IO、Range、图片、redirect、独立voice严格拒绝与活动HTTP / WS撤销。媒体URI映射有专项回归，但本轮合成夹具不是decoded-media或物理设备证据。

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

## 来源、界面与片级策略的实现合同

本节描述现行实现，不把阶段组件测试当作新原生验收。


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
- 历史能力专项已检查尺寸、非法输入、缓存、SDR策略和20个真实关键帧输出，并拒绝损坏样本。该一次性检查源码本次移入回收站。夹具可在macOS运行 `bash ZV-iOS/scripts/generate-bili-probe-fixtures.sh` 重新生成。关键帧成功不代表高码率持续播放、热稳定、耗电或音画同步已验证，第三代iPad Pro真机仍待验收。

### 原生媒体库 HLS Relay 与 VLC 回调

`libraryHls.ts` 只对当前服务器前缀内的 Emby/Jellyfin stream/proxy 路由补做有界 MIME 探测，以识别记录标作 MP4、实际返回 HLS 的情况。显式 HLS 及已确认 HLS 经 `hlsNative.ts` 启动 `ZVHLSRelay.swift`；普通渐进媒体或探测失败不会被猜成清单。

Relay 是监听 `127.0.0.1` 随机端口的本机原生服务，VLC 只读其临时 capability URL。每次请求重新读取上游动态清单并改写子清单、普通分片行及 `URI="..."` 属性，包括密钥和 init-map；保留单范围 Range/206、所选反向代理前缀和当前服务器认证。认证只发给绑定服务器、provider 路由和同一 movieId，跨域、跨影片、非媒体库子地址或非法重定向会失败，不向外泄露凭据。

该实现限制并发、请求头、网络时限和响应体：清单最多 2,000,000 字节，普通资源最多 32 MiB，超限经当前 relay id 的错误事件显示给播放器。`NativeVideoSource.dispose()` 在 adapter 换源、清空或销毁时释放旧 listener；未完成准备的取消和模块释放也清理请求。普通播放/暂停更新会取消上一轮解析，但不能因此关闭仍在使用的已准备 listener。认证变化须创建新来源，不能永久缓存带旧认证的 listener。大型分片、特殊 HLS 扩展和实际 Emby/Jellyfin 转码服务器需要按场景回归，不能用一个静态本地 m3u8 替代所有验收。

`with-vlc-tracks.cjs` 的持久补丁补充实际视频尺寸、后到的 HLS length 和暂停源 ready 回调。事件仍携带 revision；`VlcPlayer` 将后到时长送入 sourceLoad，换输入清空旧时长。`PlayerDisplay` 以实际解码宽高选择全屏方向，同类尺寸重复回调不覆盖用户手动解锁。原生诊断仅记录 revision、时长和播放意图，不记录媒体地址、token 或请求头。

## VLC定位、取消与失败恢复

相关持久补丁在 `plugins/vlc-seek.cjs`、`plugins/vlc-*.cjs`，通过 `scripts/patch-vlc-native.cjs` 应用和检查。JS接口必须搭配含对应Promise/确认逻辑的原生二进制，不能只刷新JS后使用旧void seek ACK验收。

- `ZViewerConfirmedSeekV2` 先等待seekable，观察实际paused后再用公开jump API；普通渐进媒体暂停定位要求真实时钟在目标±0.5秒内连续稳定2秒，15秒内不能确认则失败。
- `ZViewerDecodedHlsSeek` 用公开 `gotoNextFrame()` 及成功帧回调准备视频，从目标前2.5秒逐帧推进，实际时钟目标±0.1秒内稳定2秒才成功；最多4次定位、800帧请求、30秒。不暗中play准备暂停视频，不把缓存目标或命令ACK当帧完成。
- `playerReady.ts` 同时等待有效时长、媒体ready与seek确认。初始45秒预算到期时只可按native seek剩余30秒及5秒回调预算延长一次。失败清seeking并报告真实位置，保留prepared input供显式再次拖动，不能让输入永久不可操作。
- `ZViewerOpeningPauseGuard` 只在canPause且playing时真正pause，opening阶段保存最新意图；过早set_pause会停止输入。`:start-paused` 继续承担冷暂停准备。
- 连续音乐音频及播放中的静音关联视频采用真实时钟到达和后续推进确认：先到目标±0.5秒，首次累计100ms推进建基线，再需两个递增样本，外推扣除实际paused时段，8秒内未确认显式失败。最新暂停仍需实际目标到达，不以ACK走捷径。
- `ZViewerSeekCancellation` 在stop、destroy、持久音乐换源与真正重建前撤销旧操作代次、清持有者再完成旧Promise。底层 `MediaPlayer.destroyPlayer` 不读unowned宿主view，避免view.deinit触发SIGABRT；晚到delegate/weak回调不得控制新输入。
- `hlsPlaylist.ts` 对真实EXTINF求和，VOD时长经 `hlsNative.ts` 提供；它只提供时长，不替代播放时钟，不把直播或无结束清单伪装成VOD。

历史整数90秒的Simulator暂停1.5x直连→中转已观察实际paused、精修到90000ms且保持，但反向及非整数位置不由此通过。Jellyfin144.842秒曾实际147.975秒而正确报告失败；带视频macOS探针修订后129842→129750、144842→144750并保持暂停，是协议探针结果，仍不等于iOS画面已通过。MKV137.207秒的clock/ACK正确但画面灰色，必须保留失败。


## 音乐、队列、音画与后台

- `musicAuthority.ts` 将音乐服务器时钟与房主存活分开。服务端 `music:sync-heartbeat` 的 position 已外推，按接收时刻建立本机基线，不能再加原 updatedAt 的同一段时间；零秒是合法值。近期服务器时钟优先，旧 `music:host-heartbeat` 只在兼容回退时纠偏；控制、心跳和自检共用有冷却与媒体准备门控的纠偏入口，显式控制不能被心跳冷却吞掉。
- 房主 `music:sync-state` / `music:host-heartbeat` 携带 clientTs；观众有界调用 `music:check-status`，旧连接、已切曲和已被新状态取代的 ACK 不得覆盖当前播放。get-state 的队列与播放时钟各有代次：新心跳可以使旧时钟失效，但不能丢弃仍有效的初始队列；重连准入竞态使用有限退避重试。
- 同一首歌首次解析可长于 2 秒心跳周期。`MusicPanel` 合并同曲待解析期间的最新时钟和播放/暂停意图，不反复取消解析；真正切曲、切服务器或账号仍取消旧任务。慢解析完成后服从最新暂停/零秒意图，不短暂恢复旧播放状态。
- `MusicHostStatus` 消费 hostOnline、host-disconnected 和 sharer-ready；显式房主离线后保留短暂宽限，避免缓存的 online 立即覆盖离线事件。无权威样本时兼容旧房主心跳；本机断网不等于房主离线。确认房主离线时，观众可在本机控制当前队列，不发房主专属同步/心跳；房主恢复后重新跟随服务器并恢复申请制。
- 队列管理按 `musicQueue` 权限矩阵独立计算。有权限的观众 addQueue 直接等待服务端 queue-upsert 确认，移除和排序同样受权限控制；这不授予播放状态广播或房主播放模式权限。无队列权限的在线观众仍申请房主，断网不缓冲写入；服务端拒绝入队时不能先切歌。
- `MusicNavigation` 保留手机搜索按钮、宽屏搜索框、来源选中态以及互斥的不透明导航/账号菜单。`MusicBiliBrowser` 读取当前 NAS 的音乐分区榜单、搜索和服务端收藏夹，按实际宽度显示卡片；链接解析仍复用 B站选择流程。加载、错误与空态来自实际请求，不以演示卡片冒充推荐结果。
- 完整播放器按能力显示歌词、罗马音、翻译、纯净视频、房主模式、歌曲评论、关联视频、B站原视频、队列、设置和明暗入口；黑色视频上的收起按钮保留浅色底和 44 点触摸区。`musicLyrics.ts` 按时间合并 NCM 原文/罗马音/翻译。`SongComments` 区分 NCM 歌曲和 B站原视频评论；B站接口在此只读，评论计数、分页及迟到响应均绑定目标身份，不能混入房间聊天。
- 底部小播放器和完整播放器以 `queueOwner=mini/player/null` 保证队列只有一个弹层所有者；进入/退出完整播放器先清旧队列和歌曲评论，旧弹层关闭回调不能关闭另一个所有者的新弹层。关闭歌曲评论/队列应返回完整播放器，不能释放主音频。

### build29–31已进入发布的修复

`musicVideoSync.ts` 以主音频确认时钟为准，视频只在意图变化时play/pause；普通偏差用相对音频倍速±10%校正，250ms限频，小于250ms恢复。首次准备/显式拖动用最新确认位置；定位未完成不叠加跳转，6秒以上断层自动定位至少间隔10秒。换曲、账号、音质、前后台与完整播放器切换重建同步状态，视频失败不影响主音频。

build29仍未完全解决真实房间卡顿。build30对同一AAC fMP4确认本地文件seek正常、HTTP Range正确但VLC默认流式MP4 demux停在162.512秒；同输入改用VLC内置 `avformat` 后持续推进。因此 `biliNative.ts` 仅为一起听B站audio/muted-video输入选择avformat，一起看保持原有demux。视频设no-audio，按contain显示完整帧，不同比例留黑边。持久输入replace补齐初始挂载相同的Simulator解码参数与方法接收者；不放松seek真实时钟条件。

新建房默认自动通过播放控制申请；一起听房主先执行成功再确认，关闭后仍人工审批。它与入房审批、自动连播分别维护。

音乐失败不得通过catch或普通心跳反复invalidate清掉门控。解析/native错误保留，只有显式重试/控制、新来源、账号、音质或真实房主变化才恢复；B站既有自动fallback最多两次。seek失败保留有效input，普通心跳不重建，显式拖动可重试。

build30在真实NAS房间、网页房主与iPadSimulator观众中完成A→B→A、展开/纯净视频、中段定位、暂停恢复和中途冷启动入房；用户另反馈build30测试通过。build31保持这些业务逻辑，仅统一版本。用户验收与Simulator所测场景分别保留，不能关闭所有旧后台、锁屏卡、装饰恢复或物理专项。


## LiveKit语音

`voiceTransport.ts` 检查 LiveKit 当前真正需要的 publisher/subscriber PC、connection/ICE 状态与选中的成功 candidate pair；同时呈现实际 UDP/TCP 等协议。token 成功或 SDK joined 只表示信令阶段，不能直接标为音频已通。加入、重连或 PC 变化重置媒体检查计时；约 10 秒仍未连接时提示超时。诊断缺失、异常或不支持时显示“媒体状态待确认”，不因此主动踢出通话。

iOS 麦克风授权弹窗造成的临时 inactive 不销毁现有只听会话，授权等待不计媒体超时；真实 background 仍执行闭麦与生命周期清理。管理员解禁不自动开麦。`voiceVolumes.ts` 以全局输出 × 成员独立收听增益调用远端 setVolume；暂停收听临时归零、恢复后还原成员选择，并在重订阅时再次应用。成员收听音量不改变本机麦克风采集增益，后者走独立原生接口。

## 投屏接收与资源释放

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

## 更多菜单、房间评论与弹幕来源

`PlaybackControls.tsx`使用Modal portal承载More，分别测量trigger和portal并转换到同一坐标系；以真实内容高度定位，不预留410pt再把短菜单悬在画面中央。优先按钮下方可滚动空间；不足一行44pt触摸区时，以实测高度在上方保留8pt间距。窗口 / 字体 / 安全区 / 键盘 / composer变化触发重测，关闭后迟到测量不能重开。`playbackMenu.ts`几何及实际组件回归共8项；phone16竖屏下方、横屏底部不足时贴按钮上方已实际目视；iPad系统窗口portrait下方也已实际目视，横屏 / 全部宽度仍待验。

`RoomSideDrawer.tsx`承载一起听右侧房间评论，`RoomDiscussion.tsx`保持房间订阅、按room / socket epoch隔离history和send，关闭 / 重开保留记录及输入；发送错误与历史错误分离。音乐设置首项网易云音质，移除多余默认来源选择；歌曲评论保持独立身份。投屏由room布局决定竖屏下方 / 横屏右侧聊天，手动全屏隐藏、退出恢复草稿。phone16横竖屏、键盘避让和实际房间评论发送已测，不据此关闭所有尺寸 / 权限 / 失败路径。

`danmakuSource.ts`以当前房间 / movie / CID等媒体元组隔离B站自动来源，轨道带媒体scope；初入可保留legacy手动轨道，切片不复用。Manager / Search / 自动导入共用串行`DanmakuWrites`：已提交POST等待ACK，清源排在旧写入之后，尚未提交的旧ticket拒绝；迟到GET与旧clear不能写入新源。显式删除当前default或viewer看到其被删后不自动复活，保留已确认hidden / offset，viewer不写NAS。23项专项通过；新NAS P1 / P2素材已取得，但本轮UI play返回“影片不存在”，REST条目与原生发送room / movieID一致，iPad真正GUI建房后78同错而Node数字75成功，尚无根因定位，不能声称新自动弹幕与防串片已真实播放通过。[本轮反馈证据](#历史验证与待验边界)。

## 历史验证与待验边界

### 发行与源码检查记录

| 范围 | 已有结果 | 解释 |
| --- | --- | --- |
| build29 | 1.9.0/29，49,286,813字节，device ARM64未签名；历史431项及34项专项通过。 | 卡顿未完整解决，不能作为最终修复结论。 |
| build30 | 1.9.0/30，49,315,846字节，device ARM64未签名；433项、补丁、lint、类型检查通过。 | Simulator真实房间一起听复验及用户“测试通过”反馈分别记录。 |
| build31 | 2.1.10/31，49,315,848字节，Hermes6,631,097字节；macOS433/433、原生编译、IOS2/ARM64、CRC、无签名/profile、native/debug及已知私密字面量检查通过。 | 发布至现有2.1.10 Release，无新业务逻辑；构建时唯一一次SHA为 `9d98f800d4cb3fa80537a5ced8d7bbc76a014b4c40aaa8601bfdd6ee9204b79a`，本次未重算。 |
| 10月23日Windows源码同步 | 原回传遗漏的6个业务源码、6个测试及证据/文档已补齐；补丁、lint、类型及12个Go来源检查通过。 | 当时433项中422通过、8条件跳过、3因缺xcrun无法执行，完整test命令非零；不能写433全通过。 |
| 本次清理 | 移走历史测试与证据，`npm run check`改为原生补丁检查+lint+TypeScript。 | 清理后的check不再包含历史433项，不能沿用计数作为本次测试。 |

### 已有实测和仍开放的问题

| 功能 | 已有实测 | 未关闭的边界与最小后续 |
| --- | --- | --- |
| 服务器账号 | 原生仅清理当前NAS API/Socket实际发送的access/refresh Cookie；iPad已以所选账号入房并接收运动画面。 | 不全局清Cookie；其他域和B站/NCM会话保持隔离。 |
| 证书例外 | Debug16的23项原生合成传输：默认拒绝、显式允许后REST/Range/图片/WSS、redirect和撤销；foreign host/port、voice仍严格。 | 这不是媒体解码或实体设备验收。 |
| MP4/HLS | iPhone/iPadSimulator已有起播画面，普通公开源整数90秒暂停1.5x中转切换限定正向。 | Jellyfin HLS小数暂停seek、公开小HLS冷暂停准备仍失败/待复测；先用小素材核对真实帧和时钟，避免反复读取大电影。 |
| MKV/ASS | 约268MiB HEVC/AAC/ASS、约448MiB HEVC/Opus/ASS起播；后者双设备画面和iPhone字幕可见。 | 前者137.207秒时钟正确却灰屏，原片参考帧彩色；两者真实听感、全部轨道/seek不由起播通过。 |
| B站账号/画质 | Keychain冷启动恢复，自动/360/480/720P解析及480→720 UI切换推进；本机与服务器DASH、P2 CID正确。 | Simulator超策略档位准确拒绝并保持旧画质；物理4K30长时吞吐、音画同步和全部账号/PGC矩阵待验。 |
| NAS影片/弹幕 | B站P1/P2取得1200/2623条弹幕，作用域与串行写入有实现。 | 新房REST有影片而UI play报不存在、Socket片单空但同房REST非空，根因未定位；不能擅归因客户端/多worker/鉴权，自动弹幕原生闭环仍待验。 |
| AniSubs/CMS/媒体库 | 实际配置来源可见，重解析、失败提示、重试与防串片已实现。 | AniSubs所选resolve404、CMS实际HTML/403/404；Emby无合适挂载等仍外部受限，不重复扫描或用200/206冒充可播。 |
| 音乐权威时钟 | iPad房主到NAS连续10分钟：300服务器心跳、298房主心跳、59次状态检查，最大差0.18秒。 | 这是房主上报/服务器外推，不是第二原生观众听音同步或Android/HarmonyOS互通。 |
| 后台音乐 | Debug14/15的Home/Simulator Lock跨来源自然切曲、30秒以上推进、同PID恢复；失败装饰清残影并回退背景已验。 | paused0后UI播放曾跳31.172秒、旧31.352秒恢复未推进、锁屏卡未显示、装饰实际恢复失败，均未被有限正向批量关闭；build30反馈不扩写未给出的逐项范围。 |
| 原生生命周期 | Debug12曾unowned销毁SIGABRT；修订后Swift正负对照成立，后续同PID后台场景未再复现。 | 新进程重开不是恢复，仍需物理中断/回收/长时场景。 |
| 字体与转交 | phone1.353→1→1.353，iPad草稿保留与取消；iPad→phone→iPad无重连双向转交及权限/名单实时更新。 | 已测往返不重复；其他页、角色、弱网和横屏短高度待验。 |
| 窗口与界面 | phone更多菜单竖屏向下/横屏空间不足向上8pt、评论键盘及发送重开、iPadportrait证书默认off已目视。 | iPad虽声明四方向/非强制全屏，实际拖手柄未发生resize，不算真实分屏/横屏通过；320pt/全部键盘/130%长名另验。 |
| WebRTC接收 | iPhone独立/streamless音轨及旧connected下共享端restart三轮实际有画面；iPadportrait帧91→166→241，音视频字节递增。 | 听感、iPad横屏、复杂NAT/TURN、真机/跨平台互通未由此通过；用户已要求停止重复投屏测试。 |
| OBS接收 | iPhone运动彩条、约9分钟后刷新及11:11时间码继续，停推清屏后重推自动出现画面。 | FLV200/头不是通过依据；延迟、持续帧率、PiP、耗电和全部编码组合待验。 |
| 语音 | 原生只听/UDP选中线路有实测。 | 双向麦克风、蓝牙、来电、音频路由与实际远端听感需实体设备。 |

ReplayKit发送未实现，依用户约定不属于本轮接收端范围；不列成已交付能力。iOS没有独立原生房间业务Socket，系统音频会话正常不保证JS长期存活。用户新反馈优先于自动检查及模拟器正向。

### 后续验收矩阵

历史清单包含609个唯一D类需求，许多行只有局部实现或分支证据，不能写成609项已通过。本表整合日常维护必查合同；需要逐条原文时，从清理前提交读取 `docs/ios-acceptance-checklist.md`，不把历史计数当当前通过率。

| 领域 | 最小检查合同 |
| --- | --- |
| 启动/连接/会话 | 首启/恢复、自动/显式URL、路径前缀、HTTP/严格HTTPS/按origin例外、游客/账号、401刷新、退出/换服旧响应、Cookie隔离。 |
| 房间/权限 | 创建/审批/拒绝/加入/离开、房主/owner/root/观众/游客、管理权限、转交、模式变化、断网重连和旧事件。 |
| 来源身份 | movieId、CID/P/ep/season、MediaSourceId与sourceMeta；逻辑身份和本机播放URL分离，跨源清旧字段，迟到解析dispose。 |
| 播放同步 | 当前影片/片单先后次序、房主广播/服务器心跳/旧ACK、首次恢复、强制同步、显式0秒、暂停倍速及慢解析合并最新意图。 |
| 播放设置 | 添加草稿与运行设置分开；root/owner且当前分享端才写，PUT/权威GET/attach/ready/seek/广播逐步确认，失败不自动反向回滚。 |
| B站 | 完整/短链/分享文本、P1/P2切回、服务器/本机账号矩阵、CLI-only权限、真实音视频轨、设备codec/尺寸/帧率和超策略拒绝。 |
| 番剧/媒体库 | AniSubs/Kazumi/CMS、旧记录、整季/多版本/目录、直接与代理、相对HLS子清单/KEY/MAP/Range/鉴权更新、可见错误和取消批量保留成功项。 |
| 播放器 | 初始/迟到时长、真实首帧、冷暂停、整数/小数/0秒seek、暂停后恢复、换策略四组合、回退与显式重试、旧native revision。 |
| 字幕/弹幕 | native轨与RN overlay唯一所有者、关闭/选择/偏移、ASS/PGS/外部源、电影/账号scope、串行写入、显式删除后不自动复活、viewer不写NAS。 |
| 音乐/队列 | NCM/B站、来源/账号/音质切换、歌曲/房间评论隔离、队列权限/排序/失败、完整/mini唯一弹层、歌词/翻译、纯净视频与主音频不重复。 |
| 音乐生命周期 | Home/锁屏/同PID返回/系统回收、自然跨曲/中段冷恢复、播放和暂停seek、主音频与关联视频分开看实际时钟和听感。 |
| 语音 | 默认只听、权限弹窗、用户闭麦/管理员禁言、实际PC/ICE、成员与全局音量、后台/蓝牙/中断、离房释放。 |
| 投屏接收 | 独立/streamless音轨、restart/refresh/旧ICE、offline/live重连、真实帧推进、暂停/静音、手势/控件不穿透、退出释放。 |
| 显示与操作 | iPhone/iPad、横竖/短高/分屏、动态字体/中文/连续英文、列表网格偏好、safe-area/键盘、Portal/返回/草稿、无障碍与错误重试。 |
| 交付 | 当前提交与native补丁一致、工具链/Go来源、device与Simulator分离、IPA资源和隐私、构建时一次SHA、用户反馈与未验项目分开。 |


## 日常检查、原生构建与交付

日常从 `ZV-iOS/` 运行：

```sh
npm ci
npm run check
node scripts/stage-native-core.cjs --verify-only
npm start
```

清理后 `npm run check` 只运行VLC持久补丁检查、ESLint和TypeScript，已移除指向被清理测试的命令。Expo Go/Web适合界面和JS流程，不包含本项目全部原生能力。`scripts/launch-simulator-debug.py` 是原生Simulator启动工具；`inspect-unsigned-ipa.py`、`verify-ios-native-symbols.cjs` 和native来源/补丁守卫继续保留。

共享Go来源固定在 `scripts/native-core-baseline.json` 的12个文件与来源提交736452e。`--verify-only`只核验；真正准备前不带该参数暂存到 `.native-staging/`。模块最低Go1.26.8，工具链固定1.27.1；显式 `ZVIEWER_USE_SYSTEM_GO=1` 只允许精确版本，默认下载摘要验证保留。本次删除 `_test.go` 不改变生产Go来源清单。

只有收到明确IPA构建指示后，在Mac按需要执行：

```sh
cd ZV-iOS
npm run check
node scripts/stage-native-core.cjs
npm run native:patch
bash scripts/prepare-native-ios.sh
bash scripts/build-unsigned-ios.sh
python3 scripts/inspect-unsigned-ipa.py /absolute/path/to/ZViewer-unsigned.ipa
```

`prepare-native-ios*.sh` 仍调用 `bili-signing-smoke.m` 与 `opus-smoke.c` 验证原生库签名和Opus构建，二者属于现行构建依赖，保留以防准备脚本断链。`generate-bili-probe-fixtures.m/.sh` 用于重新生成生产解码能力探测的自主合成关键帧，不能当普通测试夹具删除。device与Simulator ARM64 Vendor/Pods分开，构建设备后恢复Simulator环境，不混用。

不手改CNG生成ios/或node_modules作为唯一修复；原生持久修改必须进入plugins或本地module。打包检查Bundle ID、版本/build、IOS2/ARM64、Hermes/VLC/LiveKit/Go/Opus、debug排除、许可和私密字面量；每包只在构建后算一次SHA，后续复用。IPA完成后更新本维护文档，并在指定客户端仓库本地commit。没有指示不启动EAS、Xcode设备打包、上传或公开发布。

## 故障定位

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

## 文档与历史追溯

docs现在只保留三份平台维护文档。阶段发布说明、验收清单、JSON、截图及一次性测试已经移入回收站，当前文档保留实际维护合同、关键数值和开放问题，不依赖那些本地路径。

需要完整609项清单、历史433项测试或原始证据时，可在客户端Git历史读取清理前提交，不要把恢复出来的旧版本直接当现行实现：

```sh
git show fdf6bb664348268116f5f8e2b0e74d371b2b579b:docs/ios-acceptance-checklist.md
git show fdf6bb664348268116f5f8e2b0e74d371b2b579b:docs/ios-macos-development-status.md
```

本次整理未重新计算IPA摘要、未新建原生包、未重复投屏或NAS测试。后续记录必须同时写明当前提交、包版本、设备/OS、网络、角色、实际动作、观察证据及失败项；用户未提供的验收信息保持未知。

清理复核：2026-10-23的95项清理中，94项已确认在回收站；`.ui-validation/` 约3.88GiB超过E盘回收站1GiB限额，Windows未将其保留在回收站，目录已直接清除，未满足该项目的可回收要求。该目录为历史测试产物，正式release、已安装依赖和签名源材料保留。今后先查容量再回收，不能只凭API的SendToRecycleBin参数判定已回收。

本次整理后检查：共享前端TypeScript与Vite生产构建、Go `go build ./...`、iOS VLC持久补丁检查/ESLint/TypeScript及12个共享Go来源核验均通过。文档链接按保留文档与项目入口复核；这些结果不包含已移走的历史测试，也不新增APK/HAP/IPA或设备验收。
