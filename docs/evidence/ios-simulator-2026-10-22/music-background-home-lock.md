# 一起听后台与模拟锁屏观察（2026-10-22）

本记录来自专用音乐验收房 `CsChgpYz`：iPad Pro 11-inch (M5) / iPadOS 26.5 Simulator 为原生房主（用户 1），第三账号 5 仅作 Socket 观众。观察器只发送 `request-join` 和 `music:get-state`，没有控制、转交或修改队列。当前运行构建与最终完整检查由主任务的交付记录补齐。

结构化证据见 [music-background-home-lock.json](music-background-home-lock.json)。原始脱敏采样保留于本机 `/tmp/zviewer-background-music-observation.jsonl`，观察时段 UTC 10:24:50–10:32:50；结束时已主动断开观众 Socket。

| 阶段 | 操作与实际证据 | 结论边界 |
| --- | --- | --- |
| Home 后台 | 主任务约 UTC 10:24:23 执行 Home 并目视桌面。观察器 10:24:50 入房后，NCM 371362 房主原生心跳继续推进；10:26:11.841 报曲终 149.106 秒。 | Simulator 后台真实原生时钟；不是单纯服务器外推。 |
| Home 后台自然切歌 | 10:26:11.910 房主发出 Bili `BV17x411w7KC:279786`、0 秒、播放中；10:26:13.104 服务器切同曲；10:26:20.959 房主原生时钟已到 4.88 秒并持续推进。 | 已观察 NCM → Bili 自然换曲；未向房主发送控制。 |
| 模拟锁屏 | 主任务约 10:29:15 执行 DeviceHub Lock 并目视黑屏。 | 这是 Simulator 模拟锁屏，不是实体设备熄屏。 |
| 锁屏自然切歌 | 10:29:35.473 房主发出 Bili → NCM 371362、0 秒、播放中；10:29:37.129 服务器切同曲。原生日志确认 149106ms 新输入 ready / playing / 初始 seek 成功。 | 锁屏后约 20 秒自然跨来源切歌。 |
| 锁屏新曲推进 | 10:30:09.297 房主原生心跳 30.926 秒；10:30:15.284 为 36.926 秒，均为播放中。主任务其后才唤醒屏幕。 | 新曲在持续锁屏期间推进超过 30 秒。 |
| 唤醒后观察 | 主任务约 10:30:35 再次 Lock 唤醒，仍为锁屏界面。观察器持续收到时钟，并于 10:32:07.605 记录下一次 NCM → Bili。 | 唤醒屏幕与解锁回 App 是两个节点。 |
| 解锁回前台 UI | 主任务约 UTC 10:31:17 通过 CUA 解锁后点击同一 App 图标，目视 NCM 1:42 / 2:29、歌词和暂停按钮正常；没有重启进程。 | 独立原生 UI 恢复证据，未以服务器心跳代替前台画面。 |

## 代码路径与边界

`MusicPanel` 使用 persistent `VlcPlayer`、固定音乐原生 view 和 `backgroundAudio`；原生以纯音频输入运行。`UIBackgroundModes` 含 `audio`，AudioSessionManager 在后台维持播放音频会话，背景处理不暂停音乐 owner。Apple 的 [媒体播放配置](https://developer.apple.com/documentation/avfoundation/configuring-your-app-for-media-playback) 描述了后台音频配置要求。

曲终后的下一首仍由 JavaScript `heartbeat → control → NativeMediaAdapter` 驱动；原生 `ZViewerMusicTransition` 后台任务保护换曲时的静音间隙，持续原生 view 通过命令换源。以上两次观察证明本轮 Simulator 的 JavaScript 与 Socket 业务在后台 / 模拟锁屏期间继续工作，不代表强杀、内存回收、长时间暂停、小时级后台、来电或蓝牙切换已通过。

## 锁屏媒体卡与第二端同步尚未通过

唤醒后主任务目视未显示 Now Playing 卡。代码 `useSystemMedia → mediaUpdate → ZVSystemMedia` 已接线；本机只读偏好检查可确认 native 发布过当前 NCM 播放 URI、语音会话未占用。初轮尚未读取运行时 `nowPlayingInfo` 字典；后续 build11 的独立运行态诊断已确认元数据存在，见下文，但仍不能认定卡片未显示是 Simulator 限制。[Apple 的 MPNowPlayingInfoCenter 文档](https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfocenter) 说明该信息用于锁屏及控制中心，因此当前卡片显示维持未验 / 未显示记录，实体设备仍需验证。

本轮前台 phone 观众的 Bili 原生日志出现重复校时 seek，每次约 2.18 秒等待确认；已提交主任务和原生播放负责人处理。房主后台自动切歌通过不能代替第二端音频听感与平滑同步通过。

## 媒体卡定位（保持未显示记录）

- 本机 iPhoneSimulator27 SDK `MPNowPlayingInfoCenter.h` 第 65–70 行注明 `playbackState` 的设置仅适用于 macOS；iOS 由音频会话确定播放状态。因此没有把赋值此属性当作 iOS 修复。
- Apple [`beginReceivingRemoteControlEvents`](https://developer.apple.com/documentation/uikit/uiapplication/beginreceivingremotecontrolevents()) 文档明确：使用共享 `MPRemoteCommandCenter` 注册时不需要调用此旧接口。当前已有命令处理器，未额外修改 responder chain。
- `AVAudioSession.RouteSharingPolicy.longFormAudio` 是音乐的可选路由策略；[官方说明](https://developer.apple.com/documentation/avfaudio/avaudiosession/routesharingpolicy-swift.enum/longformaudio) 并未将它列为锁屏卡显示的必要条件。未根据猜测更改音频路由。
- 新增仅 Debug 的 `debugMediaState` 和每曲最多 8 条 `[ZViewerSystemMedia]` 状态变化日志。读取实际 `MPNowPlayingInfoCenter` 的 keys、标题是否存在、时长 / 进度 / rate、音频 category / mode / options / route policy、命令 target 安装 / 启用数、owner 与源是否挂载；不输出标题值、URI、账号、token 或封面内容。target 安装不代表操作系统已路由命令。
- 诊断补丁已用官方 SDK 分别完成 Debug / Release Swift 类型检查；现有 systemMedia 和 nativeBuildPatches 共 8 项检查通过。这些检查不代替下一次原生构建中的 runtime 日志或实际锁屏画面。

## build11 实际运行态与待验修复

已取得 [build11 脱敏运行态](music-now-playing-runtime-build11.json)。两设备的真实 `MPNowPlayingInfoCenter` 均有标题、封面、时长 / elapsed / rate 和 9 个已安装且已启用的命令 target；初始化后曾达到 Playback / Default / 非混音，排除单纯 JS 未接线或只发布空字典。随后 UTC 10:57:34 的独立只读 Hermes 采样显示两端 rate=1、duration=149.106，却已变为 MoviePlayback + mixWithOthers，说明会话策略没有随音乐 owner 持续保留。target 安装仍不等同于系统已选择该 App 为 Now Playing。

会话策略原先只看瞬时 `isPlaying`。build11 的旧版连续音频 seek 会反复进入暂停 / 重载，属于外部诱因，原生播放负责人已单独修复。音乐会话策略也已独立修为：挂载的 backgroundAudio 非空输入在暂停、静音、缓冲和换曲期间继续作为音乐 owner；明确混音选项仍受尊重，语音维持最高优先，语音结束的 categoryChange 会异步按当前 owner 恢复；没有新增播放命令。实际 Swift 策略经 fake native 端口执行 9 场景，相关 15 项检查通过。

此前 build11 诊断中的 rate=-1 是零值 Swift Int 转换失败的诊断哨兵，不能当负速率；已改用 NSNumber 读取。实体设备、音频听感与卡片展示继续待验。

## build12 失败边界与 build13 修复待验

[build12 只读观察汇总](music-background-build12-observation.json) 记录 UTC 11:09:38–11:19:55 的 308 条服务器心跳、99 条房主原生心跳和 42 次只读状态查询。主任务约 UTC 11:11:50 执行 Home 并确认桌面；Bili 房主原生时钟持续到曲终。11:12:54.963 发生 NCM 371362 / 0 秒 / 播放中的权威选曲，但没有观察到新 NCM 原生 ready 或推进心跳。

11:12:55.107，iPad 进程 92636 在主线程因 `MediaPlayer.destroyPlayer → unowned view` 访问触发 SIGABRT，见[脱敏崩溃摘要](music-background-build12-crash.json)。其后的服务器 NCM 时钟只是离线外推，不能作为新音频已经播放的证据。再次打开 App 成为进程 93622，停在房间列表；这不是同进程前台恢复，也不能归因于系统后台挂起。本轮没有继续执行 Lock 验收。

待 build13 验证的最小修复包括：原生销毁不再读取已释放的 unowned view；装饰视频在 AppState 非 active 时同步取消解析、暂停并清源，前台只恢复当前绑定；音频系统元数据按 native owner / 输入 revision / URI 与 `backgroundAudio` 过滤。原生输入创建时冻结这些身份，旧播放器时间通知被拒绝；换曲后台任务需新音频 ready 后连续实际时钟推进才结束，不再被同 URI 装饰视频或 opening 状态提前结束。14 项针对性检查通过，其中含实际 Swift 身份 / 门控执行、真实 MusicVideo 与 NativeMediaAdapter 异步生命周期回归，以及会话策略执行；这些检查不代替 build13 原生 Home / Lock / 卡片验收。


## build13 前台失败，未执行 Home

旧房 `CsChgpYz` 已关闭；创建新专用音乐房 `0ObNnK13`（owner 1，NCM 队列 1617、Bili 队列 1618，顺序循环），临时配置房主 Socket 随后断开。账号 5 的只读观察器 UTC 11:37:55–11:41:20 记录见 [build13 前台失败汇总](music-background-build13-foreground-failure.json)。

主任务从原生 UI 选择 Bili 后，iPad 进程 97626 于 UTC 11:38:57.720 收到 revision 4 / 199.274 秒的原生 ready；但 11:39:05.802 的初始音频校时为 target 1ms、actual 7000ms、advancing 0、8.045 秒后失败。后续权威时钟在约 7–9 秒反复，未稳定向前，因此停止本轮验收。相同时段的被动 `ZViewerSystemMedia` 日志显示 Playback / Default / options 0、标题和封面存在、时长完整且 9 个命令 target 已注册；不能把该 seek 失败归因于 mix 回退。

本轮没有执行 Home 或 Lock，没有新曲后台播放与前台恢复证据，也不能据前台未崩溃判定 build12 的 deinit 崩溃修复通过。下一次原生构建需先通过前台初始校时，再执行完整页装饰视频释放、Home / Lock 自然跨曲和卡片验收；后台期间不连接 Hermes 调试器。


## build14：主音频 Home / Lock 正向，媒体卡与装饰恢复仍失败

[build14 完整脱敏记录](music-background-build14-home-lock.json) 来自同一 iPad 进程 **99952**、专用房 `0ObNnK13`、只读观众账号 5。观察器 UTC 11:54:17.167 开始，12:04:01.811 已主动断开；只发送入房和每 15 秒状态查询，后台期间没有连接 Hermes，也没有发送播放控制或队列修改。

准备阶段先保留一个独立失败：旧 Bili 非零位置 31.352 秒恢复，于 UTC 11:54:26.844 的音频 seek 8.007 秒后失败（noOp 0、targetObserved 0、anchored 0、advancing 0）。随后主任务通过原生 UI 重选 Bili，从 0 开始新的验收段；这段成功不覆盖旧状态恢复失败。

| 验收节点 | 实际证据 | 结论 |
| --- | --- | --- |
| 前台准备 | UTC 11:55:20.868 权威选曲为 Bili / 0 秒；主任务目视完整页 0:15 / 3:19、装饰背景视频可见。 | 新验收段开始；重选既有输入不等于新输入近零 seek 分支已测。 |
| Home | 约 11:55:58 CUA Home 并目视桌面；11:57:12.439 的房主原生心跳为 Bili 100.593 秒、播放中。 | 主音频后台实际推进，非服务器外推。 |
| Home 自然 Bili → NCM | 11:58:50.785 权威换曲；同进程 revision 4 于 11:58:51.659 原生 ready，时长 149.106 秒。11:59:24.672 的新 NCM 房主原生心跳为 31.881 秒、播放中。 | 新曲后台真实加载并推进超过 30 秒；这轮未复现 build12 的原生 abort。 |
| 模拟锁屏 | CUA Lock 操作在 12:00:00–12:00:10，保守取 12:00:13 后仍目视黑屏的节点；没有返回 App 或连接调试器。 | Simulator 模拟锁屏证据。 |
| Lock 自然 NCM → Bili | 12:01:21.543 权威换曲；同进程 revision 5 于 12:01:23.821 原生 ready，时长 199.274 秒。12:01:27.092 近零 seek 的真实原生日志为 target 1ms、actual 1919ms、anchored 1、advancing 2、3.208 秒后 success 1；12:01:59.532 新曲原生心跳 31.735 秒、播放中。 | 新输入的近零确认与锁屏新曲推进均有实际正向证据。 |
| 唤醒与媒体卡 | 约 12:02:30 唤醒，主任务目视 20:02 锁屏，仍无 Now Playing 卡。后台新曲运行态元数据完整且为 Playback / Default / options 0。 | **媒体卡未显示**；不能用元数据或后台播放通过替代卡片显示通过。 |
| 同进程主音频恢复 | 约 12:03:30 解锁后经 AppSwitcher 回 ZViewer，完整页 Bili 2:07 / 3:19、有暂停按钮；12:03:42 `launchctl` 确认仍为 PID 99952。约 12:04 主音频继续到 2:45 / 3:19。 | 主音频前台恢复通过，未重启进程。 |
| 装饰视频恢复 | 约 12:04 完整页出现“视频背景加载失败，主音频继续播放”，纯净视频操作禁用。 | **装饰视频恢复失败**；不能写完整页所有功能恢复正常。 |

以上仅确认这一轮 Simulator 主音频后台 / 模拟锁屏自然跨曲与同进程恢复。实体设备真实熄屏、听感、第二原生观众音频同步、来电 / 蓝牙切换、强杀 / 内存压力及小时级后台仍待验；旧非零恢复、媒体卡和装饰恢复缺口继续保留。


## build15：主音频后台回归与失败回退已验，起点 / 媒体卡仍有缺口

[build15 脱敏记录](music-background-build15-home-lock.json) 记录同一 iPad 进程 **3018** 在专用房 `0ObNnK13` 的本轮观察。账号 5 于 UTC 12:09:56.044 开始，只发送入房与状态查询，12:20:10.199 已主动断开；共 307 条服务器心跳、303 条房主原生心跳、41 次只读查询。后台期间未连接 Hermes，phone 后续其他房间操作不纳入本轮 iPad 结论。

**暂停零点起播仍失败。** 临时配置房主已在原生启动前将 NCM 371362 / 0 秒 / 暂停 / 顺序循环写入服务器并退出；原生 ready 后的 metadata 也是 elapsed 0、rate 0。主任务确认没有拖动或歌词定位，只重试歌词后按播放。UTC 12:10:23.156 的权威操作是 play / 0 秒，原生房主心跳 12:10:24.014 仍为 0；但 12:10:25.743 已跳到 **31.172 秒**。之后表观时钟先到 149.106 秒上限，真实 EOF 要到 12:12:50.613 才发生。这不能记成从 0 准确起播通过，后续后台自然换曲的正向证据也不覆盖此缺陷。

| 节点 | 实际证据 | 本轮结论 |
| --- | --- | --- |
| Home | 主任务目视桌面，保守确认节点 UTC 12:11:34；独立 native applicationState 2 日志在 12:10:54.106，两个来源均保留，没有用 native 时间替代 UI 确认时间。 | 后台节点已验。 |
| Home 自然 NCM → Bili | 权威换曲 12:12:51.322；同进程 revision 4 于 12:12:54.923 ready / 199.274 秒。近零确认 12:12:58.281 为 target 1ms、actual 1924ms、advancing 2、success 1；12:13:28.219 房主实际心跳为 30.923 秒、播放中。 | 新 Bili 输入真实起播并在 Home 后台推进超过 30 秒。 |
| 模拟 Lock | 菜单操作约 12:14:20，二次截图完全黑屏，保守确认节点 12:14:44。 | Simulator 黑屏已目视确认。 |
| Lock 自然 Bili → NCM | 权威换曲 12:16:15.825；同进程 revision 5 于 12:16:16.424 ready / 149.106 秒。近零确认 12:16:17.596 为 target 1ms、actual 1005ms、advancing 2、success 1；12:16:48.583 房主实际心跳 30.972 秒、播放中。 | 新 NCM 输入真实起播并在锁屏期间推进超过 30 秒。 |
| 唤醒媒体卡 | 主任务目视 20:18 锁屏仍无卡；仅有分钟级操作时间，没有虚构精确秒数。后台元数据为 Playback / Default / options 0。 | **Now Playing 卡仍未显示。** |
| 同进程前台恢复 | 主任务解锁并经 AppSwitcher 返回，约 12:19:00 目视 Bili 0:09 / 3:19、有暂停按钮，当时没有错误 / 灰色解码残影。期间已经自然完成下一轮 NCM → Bili；12:19:15 `launchctl` 确认仍为 PID 3018。 | 主音频与同进程恢复通过。 |
| 装饰视频底层播放 | 前台返回后的 revision 10 于 12:19:32.064 seek 失败，target 22024ms、actual 16839ms。 | **底层装饰播放仍失败**，不能记纯净视频播放通过。 |
| 失败后的 native surface 回退 | 约 12:20:00–12:20:40 主任务目视失败提示仍在，灰色解码残影已消失，回退正常浅色背景 / 音符封面占位；[实际截图](18-ipad-music-video-fallback.png) 已独立目视检查。主音频随后推进到 1:23，主任务主动按暂停结束；12:20:27.781 的 rate 0 对应人工暂停。 | 失败后的装饰输入释放与界面回退已验；**不是主音频自动停止**。 |

build15 的回退修复仅在装饰失败、无绑定或完整页收起时隐藏并释放该装饰 surface，保留主音频；4 项实际组件 / 真实 adapter 生命周期回归含失败无残影、连续 render 不重试和无 binding / 未展开释放，连同系统媒体门控共 7 项通过。没有放宽非零 seek 精度，也没有把旧非零恢复、暂停起点跳变或媒体卡缺口改成通过。实体设备、真实熄屏听感、第二原生观众音频同步和更长后台仍待验。
