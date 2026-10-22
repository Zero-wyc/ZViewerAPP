# iOS 模拟器验收证据索引

日期：2026-10-22。原生Simulator为主要验收设备：iPhone17Pro / iOS26.5及iPadPro11M5 / iPadOS26.5，NAS4.7.4。当前**16次Simulator Debug加2次device ARM64 Release，总原生18次构建成功；check20补丁检查、lint、TypeScript、409 / 409项通过**，其后仅buildNumber26→27元数据。Debug16已安装并实际运行两模拟器，iPad新房准入成功。第27包未签名IPA已定向交付、真机待用户验证；旧26用户报告真机一起听及原生音乐控件正常，未提供型号 / OS / 时长，不改写旧Simulator失败。无push、EAS或新公开Release，公开仍26。整体进度见[开发状态](../../ios-macos-development-status.md)。

本目录只保存可交付的画面及脱敏汇总，不收录账号、密码、Cookie、令牌、二维码、推流 URL / key 或含这些内容的原始日志。各项结论限定于所述设备、素材和操作；单张截图不能证明持续播放、听音质量或完整跨端兼容。

## 文件索引与版本范围

01–06 是早期阶段证据，其后房间、播放控件和来源 UI 已修改。07–09 是界面精修阶段的快照，也不是最终构建的整套视觉验收记录。10–14 是本轮接收投屏的实际画面，其中 14 及 iPad 接收统计来自包含 Cookie 隔离修复的第 9 轮原生构建。15 为第 9 轮原生构建的不同账号 iPhone 播放 MKV / ASS 画面。16记录房间字体，17为第14包回前台装饰视频恢复失败，18为第15包失败后清除灰色残影的回退证据，均不能当作装饰播放成功。19为第15包最新Metro的phone普通竖屏控制栏与More首项操作。20–25为Debug16 phone投屏 / 音乐设置 / 评论抽屉 / More定位反馈快照；26 / 27为iPad连接页证书默认off及portrait系统窗口More下方，28为同房真实Socket空片单与REST三条的状态对照；RotateLeft操作未改变窗口，不记横屏通过。核对产品以对应构建的实际操作及证据范围为准，不从旧截图推断当前布局。

| 文件 | 记录内容 | 可支持的结论与限制 |
| --- | --- | --- |
| [01-mp4-playing.png](01-mp4-playing.png) | NAS MP4 原生播放画面 | 该次素材能呈现画面；早期 UI，不覆盖所有 MP4 编码或听音质量。 |
| [02-hls-playing.png](02-hls-playing.png) | NAS HLS 原生播放画面 | 该次 HLS 能起播；不单独证明策略切换、seek、KEY/MAP 或全部媒体库动态清单。 |
| [03-portrait-fullscreen.png](03-portrait-fullscreen.png) | 合成竖屏素材的全屏画面 | 对应素材与方向路径可显示；不代表 B 站 HDR / 杜比或真机硬解。 |
| [04-voice-udp-listen.png](04-voice-udp-listen.png) | 语音仅收听及 UDP 连接状态 | 默认仅收听及选中连接可观察；不代表双向麦克风或远端听感验收。 |
| [05-source-policies.png](05-source-policies.png) | 来源播放策略界面 | 早期策略入口状态；当前样式与完整策略事务须按最新构建复核。 |
| [06-episodes-grid.png](06-episodes-grid.png) | 选集网格 | 早期选集网格状态；其后布局、选择及添加交互已调整。 |
| [07-room-panel.png](07-room-panel.png) | 房间面板精修阶段 | 记录模式、状态及紧凑行内入口；不代替最终所有模式、权限及尺寸检查。 |
| [08-room-settings.png](08-room-settings.png) | 房间设置精修阶段 | 记录独立设置弹窗；权限和保存行为另有组件测试及实际操作。 |
| [09-appearance.png](09-appearance.png) | 外观底部面板精修阶段 | 记录主题、圆角、滑块及自定义背景布局；实际背景和选中项取决于当时房间与偏好。 |
| [10-webrtc-iphone-landscape.png](10-webrtc-iphone-landscape.png) | iPhone WebRTC Run 1 横屏全屏 | 实际合成画面、素材时码及帧号可见，控件已隐藏；交互结论结合现场操作记录。 |
| [11-obs-iphone-after-refresh.png](11-obs-iphone-after-refresh.png) | iPhone 从 NAS 拉取真实 OBS HTTP-FLV，刷新后画面 | 显示素材时码 11:11.533；该时码是源端测试时码，不能据此独立推断客户端连续观看时长。 |
| [12-obs-iphone-offline.png](12-obs-iphone-offline.png) | 停止 RTMP 后的原生 OBS 等待态 | 旧画面已清除，显示等待 OBS 开始，控制栏仍可操作。 |
| [13-obs-iphone-restarted.png](13-obs-iphone-restarted.png) | 重新推流后的原生 OBS 画面 | 新源端时码约 02:26，运动图恢复；结合现场记录确认自动恢复。 |
| [14-webrtc-ipad-portrait.png](14-webrtc-ipad-portrait.png) | 第 9 轮原生构建的 iPad WebRTC 竖屏接收 | 原先错误账号入房问题修复后，所选账号成功入房并显示 Run 1 新画面；横屏尚待确认。 |
| [15-mkv67-iphone-ass.png](15-mkv67-iphone-ass.png) | 第 9 轮不同账号 iPhone 的 Jellyfin HEVC Main 10 / Opus MKV 画面与原生 SC ASS 字幕 | 仅素材 67 起播画面 / 字幕；不证明声音听感、HDR 或 seek。66 暂停 seek 灰屏与原片参考不符，明确记失败，见[来源分项记录](sources-acceptance.md)。 |
| [16-iphone-room-large-text.png](16-iphone-room-large-text.png) | phone房间面板放大系统字体 | 当前所列房间行完整；热变与iPad草稿保留范围见[专项](../room-ui-live-font-transfer-2026-10-22.md)，不覆盖全部页面。 |
| [17-ipad-music-background-return-failure.png](17-ipad-music-background-return-failure.png) | 第14包同PID回前台后装饰视频恢复失败 | 显示视频背景失败、主音频继续；明确为装饰恢复失败证据，不能关闭该项。 |
| [18-ipad-music-video-fallback.png](18-ipad-music-video-fallback.png) | 第15包装饰失败后的原生回退 | 灰色残影清除，普通背景 / 音符占位与错误仍可见，主audio继续；装饰实际播放恢复仍失败。 |
| [19-iphone-watch-control-bar.png](19-iphone-watch-control-bar.png) | 第15包phone普通竖屏7钮等间距 / 无溢出，More首项展开 / 收起composer | 原生点击后menu关闭、恢复紧凑栏，未发送消息；320pt / 安全区 / 全屏临界宽度仍只有组件回归。 |
| [20-casting-portrait-chat.png](20-casting-portrait-chat.png) / [21-casting-landscape-chat.png](21-casting-landscape-chat.png) | Debug16 phone投屏聊天竖屏下方 / 横屏右侧 | manualFullscreen隐藏 / 退出恢复草稿结合现场操作；没有新接收流或音频解码验收。 |
| [22-music-settings.png](22-music-settings.png) | Debug16 phone音乐设置 | 首项网易云音质，移除默认来源选择；不是全部设置 / 音质媒体换源通过。 |
| [23-music-discussion-keyboard.png](23-music-discussion-keyboard.png) / [24-music-discussion-portrait.png](24-music-discussion-portrait.png) | Debug16 phone右侧房间评论抽屉，键盘与竖屏 | 横竖屏 / 键盘避让、实际发送后close / reopen保留已操作；区别于外部歌曲评论，没有发送外部站点评论。 |
| [25-watch-more-below.png](25-watch-more-below.png) | Debug16 phone普通竖屏More在省略号按钮下方 | 横屏底部不足时按真实内容高贴按钮上方8pt另有现场记录；不称所有下方或全部宽度通过，iPad portrait另见27图。 |
| [26-ipad-server-certificate.png](26-ipad-server-certificate.png) | Debug16 iPad实际连接页 | 证书例外Switch默认off；不代表真实自签媒体 / 语音通过。 |
| [27-ipad-watch-more-below.png](27-ipad-watch-more-below.png) | Debug16 iPad已原生入房，portrait系统窗口More按钮下方 | RotateLeft attempt后实际窗口仍portrait，不能写iPad横屏通过；其余窗口 / 键盘边界待验。 |
| [28-ipad-empty-nas-runtime-list.png](28-ipad-empty-nas-runtime-list.png) | Debug16 iPad真实NAS Socket只读片单为空、同房REST仍78 / 79 / 80 | origin / path及连接态已核对；实际Socket / REST片单不一致，尚不能定位多worker、缓存、权限或鉴权。 |
| [feedback-build16.md](feedback-build16.md) / [结构化反馈](feedback-build16.json) | 本轮反馈修订、phone GUI及NAS新房播放阻塞 | 分清UI、自动回归、合成传输和真实媒体；75 / 76 / 77 REST有而play返回影片不存在，新B站自动弹幕原生闭环待验。 |
| [server-certificate-build16.json](server-certificate-build16.json) | Debug16 native / RN合成自签TLS的23项检查全true | 默认严格、所选NAS REST / Range / image / Engine.IO WSS、redirect、外origin / port / voice严格及活动HTTP / WS撤销；不是媒体解码或物理设备。 |
| [music-clock-observation.json](music-clock-observation.json) | iPad 原生房主与 NAS 时钟的 10 分钟脱敏汇总 | 300 次服务端心跳、298 次原生心跳、59 次状态检查，最大时钟差 0.18 秒；不覆盖第二端音频漂移。 |
| [webrtc-ipad-receive-stats.json](webrtc-ipad-receive-stats.json) | 第 9 轮 iPad 原生 RTC 的三次接收统计 | 视频 / 音频接收字节与解码帧均递增；不代表音频听感、持续帧率或跨端互操作。 |
| [sources-acceptance.md](sources-acceptance.md) / [sources-protocol-summary.json](sources-protocol-summary.json) | 来源条款、NAS 协议、MKV 画面 / 字幕及 seek 参考帧复核 | CMS / AniSubs 外部失败与原生未验分开记录；66 seek 时钟到位但画面失败。 |
| [music-background-home-lock.md](music-background-home-lock.md) / [结构化记录](music-background-home-lock.json) | 第 10 轮 iPad Home / Simulator Lock 期间两次自然跨来源切歌 | 仅本轮模拟器时段；不证明真机长期保活、系统回收后运行或 Now Playing 卡已显示。 |
| [music-background-build12-crash.json](music-background-build12-crash.json) / [观察](music-background-build12-observation.json) | 第12包历史SIGABRT、重开为新PID | 保留实际崩溃事实，不能将重开当同进程恢复；后续修复与第14包有限正向分开。 |
| [music-background-build13-foreground-failure.json](music-background-build13-foreground-failure.json) | 第13包历史初始1ms audio-seek失败 | 该包未执行Home / Lock；第14包近零新曲正向不关闭旧非零恢复问题。 |
| [music-background-build14-home-lock.json](music-background-build14-home-lock.json) | 第14包Home与Lock自然跨来源，新曲原生均超过30秒，同PID回前台 | 主音频限定正向；旧非零恢复失败、锁屏卡未显示、装饰恢复失败各自保留。后续第15包所列结果另记，仍不覆盖全部原生验收。 |
| [music-background-build15-home-lock.json](music-background-build15-home-lock.json) | 第15包Home / Lock自然跨来源、新曲原生30.923 / 30.972秒，原PID3018回前台 | 主audio及18失败surface回退限定通过；paused0→play跳31.172秒、卡未显示、装饰实际播放失败保留，不声明精确零点起播或真机通过。 |
| [第26包设备IPA](../ios-device-ipa-2026-10-22.json) | 历史device ARM64 Release、1.9.0(26)，原交付保留 | 49248343B / Hermes6589210B、unsigned / 无profile。用户报告真机一起听及原生音乐控件正常；未给型号 / OS / 时长，agent未独立观察，不改变Simulator负例。 |
| [第27包设备IPA](../ios-device-ipa-27-2026-10-22.json) | 最新device ARM64 Release、1.9.0(27)，已定向交付 | 49276344B / Hermes6622435B，SHA256 50d2fefce399827831e52cf20a6c4a0ca077e02f71f085a1efc031c3804c6671，arm64 / IOS2、unsigned / 无profile、native / debug / 已知私密检查通过；真机待用户验证，公开Release未更新。 |
| [acceptance-audit.md](acceptance-audit.md) / [结构化计数](acceptance-audit.json) | 609项要求的材料一致性与剩余范围快照 | 当前构建 / 检查、原生 / 协议 / 回归分别核对；检索计数有重叠，不是通过率。 |

## 测试矩阵

“已观察”表示本轮在指定环境执行并看到结果；“待最终回归”表示已有阶段结果，但后续代码还在变化；“待验收”不作为通过项。动态行为结论来自现场操作与原生统计，清洁截图只记录其中某一时刻。

| 项目 | 环境 / 操作 | 当前结果 | 证据及后续要求 |
| --- | --- | --- | --- |
| 原生构建与完整检查 | 本地Simulator Debug + device ARM64 Release | 当前快照通过 | 16次Simulator Debug、2次device Release，总18次；Debug16已安装并启动两模拟器、iPad新房准入成功。完整check20补丁 / lint / TSC / 409项通过；此前专项不重复相加，不能关闭原生待验与失败。 |
| device ARM64 Release / IPA | 用户指示，1.9.0(27) / iOS16.4 / iPhone+iPad | 构建 / 离线检查通过，用户已收到 | 最新27为49276344B / Hermes6622435B、arm64 / IOS2、unsigned / 无profile，真机待验；旧26原文件保留且有用户真机一起听 / 原生音乐控件报告，型号 / OS / 时长未知，不外推27。 |
| 所选服务器证书例外 | Debug16 RN / native，合成自签HTTPS / WSS | 23项实际传输检查全true | server-certificate-build16.json；严格默认、精准origin、活动请求 / WS撤销，voice / CDN不放宽；非媒体解码 / 物理设备。 |
| Debug16投屏 / 音乐 / More反馈UI | phone横竖屏、手动全屏、评论键盘、发送 / 重开、More吸附 | 所列GUI已观察 | 20–25及feedback-build16；iPad portrait More下方及连接页证书off另验，仍不外推iPad横屏或全部尺寸 / 网络。 |
| B站自动弹幕 / 防串片 | 23项专项、真实P1 / P2数据1200 / 2623条 | 实现 / 回归；新增原生闭环待验 | 当前新专用房REST有75 / 76 / 77但play返回影片不存在，原生room / movieID一致，iPad真正GUI建房后78同错而Node数字75成功，根因未定位，不报实测通过。 |
| NAS 会话与房间 | iPhone / iPad 登录、进房及基本操作 | 已观察 | 仅保留脱敏界面；不归档会话材料。 |
| NAS 跨账号 Cookie 隔离 | 旧 Cookie 账号与所选 Bearer 账号不同，iPad 进房 | 第 9 轮已观察修复成功 | REST 强制 omit，me / refresh 不接受不同用户；精确清除当前 NAS 会发送的两类 auth Cookie 后再开 Socket。NAS 已确认所选账号 join success，随后实际接收运动画面；诊断中的本地 user ID 不能独立证明后端身份。 |
| MP4 / HLS / 竖屏 | 原生 VLC 实际画面 | 已观察 | 01–03；编码覆盖、听音与长时恢复仍有边界。 |
| Jellyfin 条目 | NAS 已配置媒体库的解析、起播 | 已观察；seek 待最终回归 | 不能从一次起播推断所有动态清单及策略组合通过。 |
| 聚合来源与选集 | 播放身份、代理策略、部分失败、取消、列表 / 网格与面包屑 | 实现 / 回归；外部阻塞保留 | 05–06 为旧样式；CMS 的所选18组为HTML、AniSubs所选8次resolve404，没有正向媒体。当前来源 UI / 130%字体 / 偏好持久化仍须当前原生核对。 |
| 小动漫 MKV | 当前账号 Jellyfin 66 / 67，iPad及不同账号iPhone | 起播 / 部分字幕已观察；66 seek 画面失败 | 15与来源分项：HEVC Main10 / AAC或Opus / ASS；不宣称听感、HDR或全MKV。137.207秒原片彩色参考与灰屏截图不符。 |
| iPad 窗口 | 第10轮取消强制全屏、四方向、系统管理方向 | 配置 / 回归通过；真实窗口待验 | 当前构建已安装；实际分屏 / resize / 全屏铺满窗口仍无通过证据。 |
| B 站账号与能力 | 本机、服务端扫码；AVC SDR 横 / 竖尺寸能力 | 会话及软件格式探测已观察 | 不归档二维码；不宣称真机硬解、持续吞吐、HDR / 杜比或所有素材通过。 |
| 音乐时钟 | iPad 原生房主 → NAS → Socket 观测，连续 10 分钟 | 已观察 | music-clock-observation.json；包含人为漂移纠偏，不代表跨端实际音频同步。 |
| 后台 / 模拟锁屏自然切歌 | 第15包iPad，Home NCM→Bili、Lock Bili→NCM | 主音频限定场景已观察 | music-background-build15-home-lock.json：新输入ready且原生30.923 / 30.972秒，原PID3018回前台；14历史正向与13 / 12历史失败分记。物理设备、第二端听音 / 同步仍待验。 |
| 后台独立剩余问题 | 14旧非零恢复，15初始paused0→play / 卡 / 装饰 | 各自失败 / 未显示 | 15初始跳31.172秒、卡未显示、装饰实际播放失败；18失败surface回退原生已验，不能当装饰成功。14旧target31352ms无推进失败也保留。 |
| 窄宽工具栏 / More | Debug16实测row收纳、Modal portal / 实际内容高度 | 实现 / 8项组件几何回归；phone限定GUI通过 | 竖屏在按钮下方，横屏不足时上方8pt；19为旧15包首项操作，25为16下方定位。iPad portrait下方另有27图；iPad横屏 / 320pt / 全部safe-area与keyboard边界仍待原生。 |
| 语音 | 默认仅收听、真实选中 UDP 连接 | 已观察 | 04；双向通话、蓝牙、来电及系统音频路由待实际设备验收。 |
| 房间设置与外观 | 对照参考 13 / 14 / 15，iPhone 模拟器目视检查 | 精修阶段已观察 | 07–09；最终 UI 仍须随最终构建核对。 |
| 房间字体热变 | 第11轮二进制及DynamicText JS，phone / iPad实际1.353→1→1.353 | 所列页面原生已验 | [专项](../room-ui-live-font-transfer-2026-10-22.md)：phone房间完整、iPad名称草稿保留并取消 / 键盘可达。其他页面和横屏短高度另验。 |
| 房主转交 | iPad1→phone3→iPad1连续双向，无重连 | 所列两账户原生已验 | 同专项：管理 / 模式入口随权威角色更新，最终观众1；旧名单问题已关闭，其他角色 / 失败分支不外推。 |
| WebRTC Run 1 画面 | H.264 / Opus 测试流，iPhone 原生接收 | 已观察 | 实际画面可见、帧递增；10 记录横屏全屏。此项不宣称音频听感通过。 |
| WebRTC 接收交互 | 暂停 / 继续、静音状态、横屏自动全屏、控件显隐 | 已观察 | 当前现场操作通过；不能由单张控件图独立推断所有交互。 |
| WebRTC 停止与重启 | stop 清除画面并显示提示；streamless Run 2；旧连接仍 connected 时重启 Run 3 | 已观察 | 三次实际出现对应新画面，未沿用旧画面。 |
| iPad WebRTC 竖屏 | 第 9 轮原生构建成功入房后的运动画面及三次 RTC getStats | 已观察 | 14 与 webrtc-ipad-receive-stats.json：framesDecoded 91 → 166 → 241，音视频接收字节递增；横屏待确认。 |
| OBS 推流至 NAS | 开放 RTMP 3334 后持续约 15 fps；HTTPS FLV 读取 | 推流链路已观察 | FLV HTTP 200，读取 2048 bytes 含媒体 tags；不保存带推流 URL / key 的日志。 |
| OBS 原生接收 | iPhone 实际运动彩条、刷新、本机暂停 / 继续 / 静音和全屏 | 已观察 | 11：刷新后源端测试码到 11:11 仍递增，没有回到旧位置；不宣称听音质量、端到端延迟或所有编码组合通过。 |
| OBS 停推与恢复 | 停推后清屏等待，重新推流后自动恢复新画面 | 已观察 | 12–13 记录等待与恢复；不扩大为任意网络 / 时长的恢复保证。 |
| Android / HarmonyOS 互操作 | 实际设备互换房主、持续播放 / 听音 | 待验收 | 本轮没有对应真实设备参与；协议回归不能替代设备互操作。 |
| 设备专项 | 硬解、HDR / 杜比、后台锁屏、蓝牙、来电、系统中断 | 待验收 | 模拟器结果不作上述实际设备能力声明。 |
| ReplayKit 发送 | iOS 系统级屏幕发送 | 未实现 | 接收入口不代表具备 ReplayKit 发起投屏能力。 |

## 最终归档时补齐

最终检查数、原生构建结果、提交号及接收投屏结论应同时更新本索引与开发记录。新的投屏截图须先确认不含推流 key、完整私有 URL 或会话材料，再按实际验证内容命名；不得用“准备中”“已连接”或单纯 HTTP 200 代替真实媒体画面的通过证据。
