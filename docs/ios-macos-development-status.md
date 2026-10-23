# macOS iOS 开发与验收记录

日期：2026-10-23。开发仓库为本文件所在 ZViewer-client；需求、交接和界面参考位于上一级目录。本记录覆盖本轮本地开发及 NAS 联调，不能据此认定全部交付验收完成。按用户要求已停止重复投屏测试，后续逐项检查见 [01 / 03 / 05 验收清单](ios-acceptance-checklist.md)；材料一致性、计数边界与剩余优先级见[交付审计](evidence/ios-simulator-2026-10-22/acceptance-audit.md)。

当前发布源码为 **iOS 2.1.10 build31**。用户已反馈第30包“测试通过”；第31包仅统一 iOS / npm / lockfile 版本元数据后重新构建，播放和房间逻辑沿用第30包。源码同步 main，IPA 和独立 SHA 发布到现有 `client-v2.1.10` Release；原 Android / HarmonyOS 附件和 tag 保留。第31包详见[离线验包](evidence/ios-device-ipa-31-2026-10-23.json)。

第30包本轮已重建 Simulator 原生 Debug，实际测试更新后的 NAS 房间：网页 root 房主保持歌曲展开，iOS 观众展开及纯净视频中完成 A→B→A 切歌、中段定位、暂停恢复和中途重新入房。补丁、lint、TypeScript 和 **433 / 433** 自动检查通过。详细边界见 [build30 一起听复验](evidence/ios-listen-build30-2026-10-23.json)。2026-10-23 用户反馈测试通过；未提供具体物理设备 OS、测试时长与逐项清单，不扩大该反馈范围。

已构建并交付未签名 device ARM64 Release build30：49,315,846B、离线 Hermes 6,631,097B，SHA256 `3cc0acbfcb0fabd64eb7994f9c2ba60b687ba18c65671d2a8f37d503746158db`（复用构建时唯一一次计算）。[离线验包](evidence/ios-device-ipa-30-2026-10-23.json)通过设备平台、CRC、原生功能、debug 排除及已知私密字面量检查；未公开发布。

build30 对默认 VLC MP4 流式 demux 的 B站 AAC 定位停钟使用内置 `avformat` 路径修复，仅作用于一起听 B站音视频；保留真实时钟确认，不用 ACK 或请求位置冒充成功。持久音乐替换补齐 Simulator 解码策略，VLCKit 固定 a25。创建房间“自动通过”默认开启，一起听控制申请成功执行后才回执。第29包的卡顿修复不完整，以下记录只保留历史，不作本轮交付结论。

第29包修复一起听 B站视频每次进度回调重复 play/pause、偏差超过1秒即反复暂停定位的问题；采用音频确认时钟、普通偏差平滑倍速校正、显式跳转及大偏差冷却，播放中的渐进式静音视频保持连续原生定位。可选视频禁用音频解码，并按 `contain` 显示完整帧，纯净视频留黑边。34项专项和431项总测试通过；新 Swift 逻辑已在device Release实际编译，生产Hermes包含新同步代码。真机持续播放、音画同步、横竖完整画面及前后台恢复待用户安装第29包验收；未新增Simulator app构建。

[本轮 CLI 与画质实测](evidence/bili-cli-build28-2026-10-22.json)：新进程从 Keychain 恢复扫码登录，自动 / 360P / 480P / 720P 原生解析成功；真实 UI 480P→720P 显示 QN32→64，画面及进度从1:02推进至2:34。1080P在Simulator按策略拒绝，保留720P与播放进度，未误报登录。真机改为逐 codec / 横竖尺寸硬件关键帧解码探测，探测通过才开放最高4K30的AVC / HEVC SDR；第三代iPad Pro真机持续播放、音画同步尚未验收。

前轮按授权将源码同步 main，iOS build28 IPA及独立SHA追加到现有 `client-v2.1.10` Release，保留原Android / HarmonyOS包与tag；第29包仅本地交付。下文Debug16及更早构建计数、失败和待验项均为历史阶段记录，不作最新包全项通过结论。

[Debug16反馈专项](evidence/ios-simulator-2026-10-22/feedback-build16.md)及20–27图记录phone实际UI：投屏横屏聊天在右侧、竖屏下方，手动全屏隐藏再恢复草稿；音乐设置首项网易云音质，房间评论右侧抽屉横竖屏及键盘避让，实际发送后关闭 / 重开保留；More竖屏在按钮下方，横屏底部不足时按真实内容高度贴按钮上方8pt。iPad另已实见连接页证书默认off及portrait系统窗口More按钮下方（[26](evidence/ios-simulator-2026-10-22/26-ipad-server-certificate.png) / [27](evidence/ios-simulator-2026-10-22/27-ipad-watch-more-below.png)）；RotateLeft attempt后实际窗口仍portrait，不算横屏通过，所有宽度和609项未全部通过。

[证书例外原生合成证据](evidence/ios-simulator-2026-10-22/server-certificate-build16.json)23项均true：默认拒绝、选择允许后的REST / Range / 图片 / Engine.IO WSS、同源与相对redirect、不同port / hostname及独立voice严格拒绝、降级拒绝、撤销活动HTTP / WS及旧capability失效。该项为Debug16 RN与native传输真实检查，不是媒体解码或物理设备结论。

B站自动弹幕与来源隔离23项专项通过，实际NAS P1 / P2素材取得1200 / 2623条；新专用房UI点击play却返回“影片不存在”，REST存在75 / 76 / 77，原生发送room与movieID已核对一致。iPad真正GUI建房后78亦同错，Node标准数字75却成功；根因未定位，本轮新增自动导入与防串片**原生闭环尚未通过**，不能由API和单测替代。

最近音乐后台实测仍为[第15包Home / Lock](evidence/ios-simulator-2026-10-22/music-background-build15-home-lock.json)：Home NCM→Bili新输入ready推进至30.923秒，Simulator Lock Bili→NCM至30.972秒；12:19:15确认原PID3018回前台。装饰再次失败后清除灰色残影并回退普通背景（[18图](evidence/ios-simulator-2026-10-22/18-ipad-music-video-fallback.png)），该回退已验；实际装饰恢复、初始paused0后UI play跳31.172秒及Simulator锁屏卡未显示各自保留。第26包用户报告真机一起听及原生音乐控件全部正常，没有型号 / OS / 时长，agent未独立观察；不改写这些Simulator历史负例，也不重复后台测试。

历史[第14包Home / Lock](evidence/ios-simulator-2026-10-22/music-background-build14-home-lock.json)保留：Home后Bili→NCM原生31.881秒，Lock后NCM→Bili原生31.735秒，回前台主音频仍为PID99952；旧非零恢复、锁屏卡和装饰恢复失败分记。[17图](evidence/ios-simulator-2026-10-22/17-ipad-music-background-return-failure.png)是该包失败证据，不替代第15包的回退结果。

历史第13包[前台失败](evidence/ios-simulator-2026-10-22/music-background-build13-foreground-failure.json)：Bili ready后初始audio-seek target1ms在8.045秒超时、actual7000ms / advancing0，暂停及7–9秒循环，该包未执行Home / Lock。后续初始no-op计时锚点修订已由第14包新曲近零attach真实推进支持；这不是精确0秒起播验收，也不扩大为旧非零恢复已经修好。

历史第12包失败保留崩溃事实：[crash](evidence/ios-simulator-2026-10-22/music-background-build12-crash.json)及[观察](evidence/ios-simulator-2026-10-22/music-background-build12-observation.json)确认自然切NCM仅opening后，PID92636于19:12:55.1079 SIGABRT，栈为`swift_abortRetainUnowned → MediaPlayer.destroyPlayer → LibVlcPlayerView.deinit`；AppSwitcher重开为新PID93622，不能记同进程恢复。后续销毁修复有实际Swift正 / 负对照，第14包已完成上述同PID后台跨曲与恢复，未再重现本次崩溃；这不是所有生命周期和物理设备场景通过。第10包历史Home / Lock正向也只证明其原时段。


前轮设备包见[第27包IPA证据](evidence/ios-device-ipa-27-2026-10-22.json)：应用1.9.0(27)、`com.zviewer.mobile`、最低iOS16.4、iPhone / iPad，已交付[未签名IPA](evidence/ios-device-ipa-27-2026-10-22.json)。49,276,344B，SHA256 `50d2fefce399827831e52cf20a6c4a0ca077e02f71f085a1efc031c3804c6671`，离线Hermes6,622,435B；device arm64 / IOS2、无签名及profile，native / debug / 已知私密字面量检查通过。真机安装与功能待用户验证。旧[第26包证据](evidence/ios-device-ipa-2026-10-22.json)、49,248,343B / Hermes6,589,210B及原IPA保留，不覆盖；该包用户报告真机一起听与原生音乐控件正常，仅为所述用户反馈，未扩大为agent全项物理设备验收。

## 当前收口进度与阶段实测

- 历史Debug16构建 / 检查为16次Simulator Debug、2次device ARM64 Release / check20的409项；phone与iPad环境仍为iPhone17Pro / iOS26.5及iPadPro11M5 / iPadOS26.5。此前冻结diff16项、V3 Swift4项与旧工具栏3项均是阶段独立范围，不与全检相加。第16包UI与证书23项有新增原生证据，其他分支仍待验。
- root 影片库的 MP4、HLS 与两条较小动漫 MKV 已实际验证画面；MKV 分别约 268 MiB（HEVC Main 10 / AAC / ASS）及 448 MiB（HEVC Main 10 / Opus / ASS）。第二条在 iPad 和另一账号 iPhone 均有画面、iPhone ASS 可见；不把元数据或 slave 数量当作音频听感。
- 第一条 MKV 暂停 seek 的时钟 / ACK 虽稳定在 137.207 秒，实际截图却灰屏；有界 Range 抽取同时间原片是彩色画面，故该项明确为画面失败。Jellyfin 大电影 HLS 的 81.043 秒定位也未稳定通过；不扩大 129.842 → 144.842 的 macOS 解码探针正向结论。
- B 站实际原生日志已观察本机 CLI DASH 与服务器 DASH、QN64、AVC / AAC、当前 input 的一个 audio slave；iPad UI 切到第二 P 后两条解析分支均为正确 CID / P2，iPad 新画面可见。听感、全部账号组合与手机第二 P 画面仍分开验收。
- AniSubs 与 CMS 已实际访问 NAS 已配置来源；AniSubs 选集解析 404、CMS 多组实际响应为 HTML / 403 / 404。客户端已补可见失败和显式重试门控，不能将上游 HTTP 成功或 HTML 代理 206 当成可播。来源证据见 [独立记录](evidence/ios-simulator-2026-10-22/sources-acceptance.md)。
- iPad 已移除强制全屏配置，按实际窗口适配，方向由系统窗口管理；第 10 轮生成配置确认 iPad 四方向、`UIRequiresFullScreen=false`。实际拖动窗口手柄没有改变窗口尺寸，不计作真实缩放 / 分屏通过。
- 网易云《小跳蛙》在原生完整页呈现封面、同步歌词及 149.106 秒时长。Home 后台与 Simulator Lock 期间的两次自然跨来源切歌，按实际时间节点见[音乐专项记录](evidence/ios-simulator-2026-10-22/music-background-home-lock.md)及[第15包结构化记录](evidence/ios-simulator-2026-10-22/music-background-build15-home-lock.json)；不将模拟器结果扩展为真机长期保活、系统回收或锁屏媒体卡已通过。
- iPad 已实际打开 NCM 评论列表（总数 154625）、楼层回复空态并返回关闭；标准音质切换形成新输入 rev7、定位 71.054 秒后继续。实际唯一音乐队列弹层显示两首、当前 B 站高亮；分页 / 失败反馈和连续队列切层未由此通过。
- [房间专项原生实测](evidence/room-ui-live-font-transfer-2026-10-22.md)：真实fontScale1.353→1→1.353时phone房间面板完整，iPad编辑草稿经同样热变保留，键盘、确认 / 取消 / 关闭及离房可达，随后取消未改房名。DynamicText只重建native Text Paragraph，不key表单或播放器。同一记录已完成iPad账号1→phone账号3→iPad账号1无重连连续双向转交，管理 / 模式入口与名单实时正确；不再列为待完成往返。其他页面 / 角色 / 失败分支仍分别验收。

## 构建与检查

- 客户端从 `a869088a6e7dd9fc56e5cf4a9e8070a877adb923` 恢复；原有发行说明重命名保持原状，不属于本轮交付。
- 历史Debug16阶段：CocoaPods依赖已安装。累计16次Simulator Debug与2次device ARM64 Release成功（总原生18次，类型分记）；Debug16已安装并启动两模拟器，iPad新房原生准入成功。第26 / 27未签名IPA按用户指示分别交付，旧文件保留；未push、未启动EAS或新的公开发布。
- 历史Debug16完整检查为**check20，409 / 409项通过**，含补丁检查、lint与TypeScript；之后仅buildNumber元数据26→27。check18 / 366及更早计数是历史快照，独立专项不重复相加。
- 共享 Go 差异已审阅，`go test ./core ./mobile` 通过；原生来源基线的 12 项文件摘要及逐文件来源检查通过。
- Go 模块最低版本为 1.26.8，构建工具链固定为 1.27.1。默认下载及摘要校验路径保留；本机使用显式 `ZVIEWER_USE_SYSTEM_GO=1` 路径并检查工具链版本；device prepare helper也仅对精确Go1.27.1提供显式opt-in并已实际执行成功，默认下载与摘要路径保留。
- Bilicore / Opus 的 Simulator arm64 构建、WBI 签名检查和 50 帧 Opus 编解码检查通过。

## 已实现及本轮验证

### NAS 与播放

- 已通过 HTTPS 连接 NAS 4.7.4 服务。iPhone、iPad 模拟器已完成账号登录、房间进入及主要界面操作。账号、密码、Cookie 和令牌不写入仓库或本记录。
- MP4、HLS 及竖屏全屏播放已在模拟器观察到实际画面；对应证据见下表。单个素材起播成功不覆盖所有编码、鉴权方式、转码路径和长时恢复场景。
- NAS 已配置的 Jellyfin 媒体库条目已完成解析和起播验证。动态 HLS 的本地中继已接入；媒体库 HLS 的 seek 修复及最终回归仍须跟随当前代码确认，不能把此前的起播结果视作 seek 全部通过。
- 聚合来源修复覆盖播放身份、旧 Kazumi 记录切片、CMS 实际分集身份、重解析失败、视频与独立音轨的代理策略及旧账号令牌清理，并有针对性回归测试。
- B 站本机与服务器账号已通过扫码建立会话。二维码与会话材料未纳入交付证据。竖屏能力使用实际宽高查询，HDR / 杜比流保守过滤；不以登录成功代替所有 B 站素材播放验收。
- 已修复 iPad 旧 NAS Cookie 覆盖所选 Bearer 账号的问题：服务端会优先读取 Cookie，原先 `/auth/me` 可把另一账号静默写回当前会话，WebSocket 也会自动带共享 Cookie。NAS REST 请求统一 `credentials: 'omit'`；`auth/me` 与 refresh 拒绝不同 user ID；原生只清除当前 NAS API / Socket URL 会发送的 `access_token` / `refresh_token`，等待隔离完成且会话仍有效后才开 Socket。其他 Cookie 名、域和无关路径保留。第 9 轮构建已在原先持续拒绝进房的 iPad 上复测：NAS 确认以所选账号成功入房，随后呈现 WebRTC 运动画面。

### 音乐与语音

- iPad 原生房主完成 10 分钟 NAS 权威音乐时钟观察：服务端心跳 300 次、原生房主心跳 298 次、状态检查 59 次；最大时钟差 0.18 秒、平均 0.0127 秒、P95 为 0.029 秒。人为制造漂移后纠偏成功，原始汇总见 [music-clock-observation.json](evidence/ios-simulator-2026-10-22/music-clock-observation.json)。该观测比较原生房主与服务端时钟，不代表第二端实际音频漂移或 Android / HarmonyOS 跨端长时同步已通过。
- 语音房已验证默认仅收听状态及 UDP 选中连接；证据记录了原生连接状态。双向麦克风、真实远端听感、蓝牙切换与系统中断仍需实际设备场景验证。
- 音乐面板曾在解析失败后因主动invalidate清掉失败门控，使普通心跳重复resolve；本地真实回调探针复现2→7次。现保留失败，普通心跳不重建或重试失败seek，显式控制 / 新作用域可恢复；新增4项运行时回归，相关51 / 51、TSC、目标ESLint通过。此JS合同不代替原生验收；第12 / 13包历史失败、第14 / 15包限定正向与剩余失败分别保留。

### 界面与来源选择

- 按外层参考图逐张检查并调整房间面板、房间设置、外观、添加影片、来源选择及选集界面。来源界面保留 NAS 已配置挂载的只读选择，已移除额外的挂载管理入口。
- 房间设置采用紧凑分组、行内操作、独立设置弹窗；外观与 B 站入口并列。B 站账户内容在独立弹窗展示，登录状态色仅用于状态信息。
- 外观改为底部面板，保留主题、圆角、背景透明度、模糊、减弱动态与自定义图片等原有功能；已对照参考图 15 检查模拟器截图。
- 来源浏览与选集提供完整名称、列表 / 网格显示、选择后确认添加、批量失败反馈和操作取消；来源或账号切换时清理旧选择。网络失败可见重试，取消保留已确认成功项；首次媒体库选择及 WebDAV / OpenList 继承已有挂载播放方式。面包屑已补每级等宽、单行省略和既有返回动作。以上源码 / 组件回归与各入口原生目视分开，长连续英文、130% 字体、所有入口偏好持久化及真实 iPad 窗口变化仍待验。
- 工具栏按实际row宽收纳低频项并保持44pt单行等间距；More首项展开 / 收起composer。第16包修复portal坐标与真实菜单高度，组件 / 几何8项通过；phone竖屏按钮下方、横屏空间不足时贴按钮上方8pt已实际核对；iPad系统窗口portrait下方亦已目视，旋转attempt未改变实际窗口。320pt / 安全区 / iPad横屏与全部键盘边界仍待原生，不由8项回归批量关闭。

### 接收投屏

- WebRTC 已在 iPhone 原生接收端观察到携带 H.264 / Opus 的 Run 1 测试流画面及递增帧。暂停 / 继续、静音状态、横屏自动全屏和控件显隐已实际操作通过；停止后清除旧画面并显示提示，重新发布 streamless Run 2 以及旧连接仍 connected 时重启的 Run 3 均出现新画面。第 9 轮 iPad 竖屏接收也已通过，三次原生统计的视频字节数为 143220 → 325661 → 617592、音频字节数为 25587 → 45837 → 66087、解码帧数为 91 → 166 → 241；参见 [脱敏统计](evidence/ios-simulator-2026-10-22/webrtc-ipad-receive-stats.json)。该结论不包含音频听感或 Android / HarmonyOS 设备互操作，iPad 横屏仍待确认。
- 用户开放 NAS RTMP 3334 后，真实 RTMP 推送已持续约 15 fps；HTTPS FLV 返回 200，读取的 2048 bytes 中已有媒体 tags。iPhone 原生 OBS 接收已呈现实际运动彩条，刷新后测试时码到 11:11 仍继续变化；本机暂停 / 继续、静音、全屏、停推后清屏等待及恢复推流后自动出现新画面均已观察。端口开放前的握手 EOF / 仅有 FLV 头不计作成功，也不代表当前结果；此次结果不覆盖端到端延迟或所有 OBS 编码组合。

## 模拟器证据

下列截图为本轮实际运行的阶段快照；01–06 的 UI 后续已修改，07–09 也只记录精修阶段，不作为最终构建的完整视觉验收。截图不包含登录凭据、二维码或推流密钥。完整证据范围及测试矩阵见 [证据索引](evidence/ios-simulator-2026-10-22/README.md)。

| 验证内容 | 证据 |
| --- | --- |
| MP4 实际播放画面 | [01-mp4-playing.png](evidence/ios-simulator-2026-10-22/01-mp4-playing.png) |
| HLS 实际播放画面 | [02-hls-playing.png](evidence/ios-simulator-2026-10-22/02-hls-playing.png) |
| 竖屏全屏 | [03-portrait-fullscreen.png](evidence/ios-simulator-2026-10-22/03-portrait-fullscreen.png) |
| 语音仅收听与 UDP 连接 | [04-voice-udp-listen.png](evidence/ios-simulator-2026-10-22/04-voice-udp-listen.png) |
| 来源策略 | [05-source-policies.png](evidence/ios-simulator-2026-10-22/05-source-policies.png) |
| 选集网格 | [06-episodes-grid.png](evidence/ios-simulator-2026-10-22/06-episodes-grid.png) |
| 房间面板 | [07-room-panel.png](evidence/ios-simulator-2026-10-22/07-room-panel.png) |
| 房间设置 | [08-room-settings.png](evidence/ios-simulator-2026-10-22/08-room-settings.png) |
| 外观面板 | [09-appearance.png](evidence/ios-simulator-2026-10-22/09-appearance.png) |
| iPhone WebRTC 横屏全屏 | [10-webrtc-iphone-landscape.png](evidence/ios-simulator-2026-10-22/10-webrtc-iphone-landscape.png) |
| iPhone OBS 刷新后实际画面 | [11-obs-iphone-after-refresh.png](evidence/ios-simulator-2026-10-22/11-obs-iphone-after-refresh.png) |
| iPhone OBS 停推后清屏等待 | [12-obs-iphone-offline.png](evidence/ios-simulator-2026-10-22/12-obs-iphone-offline.png) |
| iPhone OBS 恢复推流后画面 | [13-obs-iphone-restarted.png](evidence/ios-simulator-2026-10-22/13-obs-iphone-restarted.png) |
| iPad WebRTC 竖屏实际画面 | [14-webrtc-ipad-portrait.png](evidence/ios-simulator-2026-10-22/14-webrtc-ipad-portrait.png) |
| 不同账号 iPhone MKV 67 画面与 ASS 字幕 | [15-mkv67-iphone-ass.png](evidence/ios-simulator-2026-10-22/15-mkv67-iphone-ass.png) |
| phone房间放大字体 | [16-iphone-room-large-text.png](evidence/ios-simulator-2026-10-22/16-iphone-room-large-text.png)；动态变化见专项记录 |
| 第14包回前台装饰恢复失败，主音频继续 | [17-ipad-music-background-return-failure.png](evidence/ios-simulator-2026-10-22/17-ipad-music-background-return-failure.png) |
| 第15包装饰失败清除灰色残影、回退普通背景 | [18-ipad-music-video-fallback.png](evidence/ios-simulator-2026-10-22/18-ipad-music-video-fallback.png)；装饰实际播放仍失败 |
| phone普通竖屏控制栏与More首项 | [19-iphone-watch-control-bar.png](evidence/ios-simulator-2026-10-22/19-iphone-watch-control-bar.png)；第15包阶段证据 |
| Debug16投屏竖屏 / 横屏聊天 | [20](evidence/ios-simulator-2026-10-22/20-casting-portrait-chat.png) / [21](evidence/ios-simulator-2026-10-22/21-casting-landscape-chat.png)；含全屏隐藏 / 恢复草稿 |
| Debug16音乐设置及评论抽屉 | [22](evidence/ios-simulator-2026-10-22/22-music-settings.png)、[23键盘](evidence/ios-simulator-2026-10-22/23-music-discussion-keyboard.png)、[24竖屏](evidence/ios-simulator-2026-10-22/24-music-discussion-portrait.png) |
| Debug16 More下方吸附 | [25](evidence/ios-simulator-2026-10-22/25-watch-more-below.png)；横屏空间不足的上方8pt定位另见反馈专项，不称全部下方通过 |

## 当前待收口事项及验收边界

- HLS小数暂停定位、66 MKV暂停seek画面，以及公开小HLS冷暂停准备仍按实际结果保留失败 / 待复测；整数位置或时钟正向不覆盖画面。锁屏NowPlaying卡本轮目视未显示，诊断中，不直接归因为Simulator限制。
- 用户新增优先项接收投屏已有上述 iPhone WebRTC / OBS 及 iPad WebRTC 竖屏实际结果；依用户要求停止重复投屏测试，iPad 横屏保持未验。最新完整自动检查已通过，但真实媒体画面、统计和操作记录仍分别支持各自结论，不能只用 HTTP 200、连接成功或单张截图替代完整验收。
- ReplayKit 原生发起投屏未实现。本轮不能以接收入口或房间模式切换代替系统级发起投屏验收。
- 尚无 Android / HarmonyOS 真实设备参与本轮对照。协议和服务端状态回归不能替代两端设备互操作、音频听感和长时同步验收。
- 模拟器能力探测已验证 AVC SDR 软件解码格式，保留横屏与竖屏的实际尺寸；不将其标为硬件解码能力或吞吐测量。真机硬解、HDR / 杜比、后台锁屏、蓝牙、来电及系统中断仍需实际设备验证。
- 已按用户指示分别交付第26 / 27未签名设备IPA。26有用户真机一起听 / 原生音乐控件正常报告，27真机待验；未push、EAS或新公开发布，未SSH修改NAS。当前16次Simulator Debug加2次device ARM64 Release / check20的409项；最终提交号由主任务收口。MKV seek / CMS / AniSubs / 物理专项等边界保留，不能宣布609项通过。
