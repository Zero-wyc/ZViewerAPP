# iOS 01 / 03 / 05 逐项验收清单

日期：2026-10-22。此表是本轮交付的逐项索引和补证骨架，不是“全项通过”报告。依据上级目录的 [01 技术交接](../../01-iOS技术交接与对齐清单.md)、[03 界面与操作](../../03-界面与操作逻辑参考.md)、[05 后续任务](../../05-macOS继续开发任务说明.md) 拆项；历史背景、源码缺口、实现、自动回归和原生实测分别记录。ID 一经使用不重排，新用例追加 ID。

当前以远端 NAS 为测试服务、原生 Simulator 为主要验收设备。用户最新要求仅交付投屏接收端，iOS 自身屏幕共享 / ReplayKit 不属于本轮；音乐与影片队列不增加上移 / 下移功能，不额外加入双端没有的功能。原生布局可按 iPhone / iPad 做克制适配，必须逐张目视核对，不能由单测推断视觉一致。

当前快照：16次Simulator Debug加2次device ARM64 Release成功，总计18次；check20补丁检查 / lint / TypeScript / 409项通过。第27包未签名IPA已交付、真机待用户验证；第26包用户报告真机一起听及原生音乐控件正常，型号 / OS / 时长未提供，不等同609行全部原生通过。Debug16已安装并启动phone / iPad，iPad新房原生准入成功。

状态含义：

- **待验**：本表尚无足够的当前证据；不表示源码一定未实现。主任务补充实际设备、角色、素材、步骤和结果后才能关闭。
- **实现 / 回归**：代码或定向测试支持指定合同，原生场景仍待验。
- **阶段原生**：本轮实际运行过，但后续 UI / 协议发生改动或覆盖范围有限，最终回归仍待补。
- **原生已验**：仅所列 Simulator、素材及操作已实际观察；不外推真机、其他平台、声音听感或未执行的失败场景。
- **外部阻塞**：实际外部失败已记录，不能记为通过。
- **本轮排除**：用户明确排除的工作，不列作本轮缺陷，也不声称已实现。

每次补证写清：构建 / 源码版本、设备和系统、NAS 部署版本、房主 / 观众角色、逻辑媒体与格式、账号路由、网络及前后台、操作时间、观察结果、脱敏证据。表中“待验”不得以旧测试总数或“已连接”一词批量关闭。最终检查计数与提交号以 [开发状态记录](ios-macos-development-status.md) 为准。

## 可引用的本轮证据

| 证据 ID | 已知事实 | 适用边界 |
| --- | --- | --- |
| E-DM-01 | 专用 WATCH 房间单条“iOS验收弹幕”，2026-10-22 17:26:10.566 发送，ACK success，videoTime 32.705；meta 广播、实时广播和随后 HTTP 200 历史均含同一 ID，sender / time 保留。主任务目视 iPad 实时列表显示发送者与 0:32。 | 仅此消息及该房；不证明拒绝、重发、禁言或全部原生输入入口。脱敏协议记录待归档。 |
| E-DM-02 | 主任务确认 NAS Jellyfin MP4 实际画面及已导入 B站轨道弹幕滚动；轨道 194 条。 | 证明本次导入轨道在原生画面呈现；不覆盖全部模式、设置、偏移和管理权限。 |
| E-DM-03 | `danmakuMusicUi.test.mjs`、`imports.test.mjs`、`timeline.test.mjs` 共 23 项通过；相关 lint / typecheck / diffcheck 通过。覆盖 meta/history、房间过滤、GET 与广播代次、去重、time 0、屏蔽、provider mode。 | 自动合同回归，不是原生视觉或网络测试。该计数不是当前全量计数。 |
| E-DM-04 | NAS 只读 search → episodes → fetch：B站视频 1200 条，番剧 3600 条，弹弹play 131 条；弹弹play / 巴哈姆特 wire 0/1/2 映射已按来源修复。 | Provider API 结果不等于原生 UI 导入；巴哈姆特 NAS 返回 502 / 上游 403，未验 episodes / fetch。 |
| E-MU-01 | [音乐时钟汇总](evidence/ios-simulator-2026-10-22/music-clock-observation.json)：iPad 原生房主 → NAS 4.7.4 → Socket 观察，连续 10 分钟，300 服务器心跳、298 原生房主心跳、59 check-status；最大绝对时钟差 0.18 秒。 | 房主与服务器时钟，不是两个原生音频端或 iOS↔Android / HarmonyOS 漂移。 |
| E-MU-02 | 网易云扫码后登录 API HTTP 200 / code 200，profile / account 存在；原生 iPad mini 可访问激活打开完整播放器，完整页阶段截图已目视。 | 登录与阶段布局；不是当前真实歌曲歌词、队列、歌曲评论和整歌单验收。 |
| E-MU-03 | 音乐相关定向测试覆盖导航互斥、来源搜索、唯一队列所有者、权限、播放模式、慢解析合并和权威时钟。 | 代码合同；原生多次开关、音频连续性、弱网和跨端仍需实测。 |
| E-MU-04 | [NCM 只读 API 探针](evidence/ios-simulator-2026-10-22/ncm-api-probe.json)：有效认证用户的生产 login/status 为 loggedIn=true；搜索 / 推荐 / 新歌 / 歌曲详情 / 歌词 / 评论成功。候选 371362《小跳蛙》青蛙乐队，全长 149106ms、非 VIP-only；standard MP3 44.1kHz / 128002bps，legacy URL 无试听标记，NAS stream Range 206 有真实媒体字节。 | song/url/v1 返回 404，实际服务端沿 legacy 降级；不代表 native 起播或听感。歌词 842 字，无罗马音 / 翻译；评论总数 154625、前两页各 30 项、more=true；受测首条楼层回复为空。 |
| E-MU-05 | 按授权创建专用音乐房 CsChgpYz，10 人、无密码 / 审批；queue-upsert / get-state 确认 1615 = NCM 371362，1616 = BV17x411w7KC / CID279786（AV170001 规范地址），未启动播放；agent Socket 已断开。 | 只是建房与队列协议准备，mini / full / queue / comments 原生验收由主任务继续；未改用户收藏 / 歌单 / 喜欢。 |
| E-VO-01 | [语音只听 UDP 图](evidence/ios-simulator-2026-10-22/04-voice-udp-listen.png)：原生默认只听、选中 UDP 连接。 | 阶段 UI 与选中线路；不证明双向麦克风、远端听感、后台和蓝牙。 |
| E-VO-02 | `voiceTransport.test.mjs` / `mediaPanels.test.mjs` / `voiceVolumes` 等回归支持活动 PC / ICE 门控、诊断 unknown、授权等待排除、管理员解禁不自动开麦和成员增益。 | 实现与单测，异常媒体和系统权限场景仍待原生。 |
| E-CA-01 | [投屏证据索引](evidence/ios-simulator-2026-10-22/README.md)：iPhone WebRTC run 1 独立音频、run 2 streamless、connected restart 后 run 3 均出现新运动画面；暂停 / 恢复 / 静音状态、全屏、显隐、停止清屏已操作。 | 接收端合成流；不证明听音、端到端延迟、实际持续帧率或跨平台。 |
| E-CA-02 | 同索引 iPhone NAS OBS：首次播放、约 9 分钟后刷新仍呈现递增源端时码；停推清屏，重推自动恢复。 | 本次 RTMP → NAS HTTP-FLV → 原生 VLC，非全部编码 / 网络场景。 |
| E-CA-03 | [iPad WebRTC 竖屏图](evidence/ios-simulator-2026-10-22/14-webrtc-ipad-portrait.png) 及 [统计](evidence/ios-simulator-2026-10-22/webrtc-ipad-receive-stats.json)：实际画面，video / audio bytes 增长，framesDecoded 91 → 166 → 241。 | iPad 竖屏接收；横屏和实际听感不能由此推断。 |
| E-CA-04 | 接收端 19 项定向检查通过（16 接收、3 既有语音），包含释放、旧 SDP / ICE、restart、远端 mute、直播刷新归零、丢 live 后重连、手势。 | 对应修订时的自动回归；最终全量和最后样式另补。 |
| E-WA-01 | 主任务最新原生观察：59，NAS root 库 Jellyfin MP4，iPad 与另一账号 iPhone 均有实际画面，duration 6722.131。 | 本次两原生端起播，不证明整个 MP4 seek / 重入基线。 |
| E-WA-02 | 60，NAS root 库 Jellyfin HLS，实际画面，duration 8505.536，暂停 / 继续及真时钟推进。 | 暂停 1.5x seek 目标 144.842、actual 147.975 失败；不得将起播记为精准 seek 通过。 |
| E-WA-03 | 61，实际 Kazumi 短季本次返回 MP4，双原生端 loaded 与运动画面，duration 1451.968。 | 不是 Kazumi HLS 证据。 |
| E-WA-04 | 62，CMS 原生播放失败；心跳触发自动重载并清空错误已修门控，相关 17 项回归通过。 | 修订后原生复核待做；不能只记 CMS 成功。 |
| E-WA-05 | iPhone access 自然过期后 refresh → request-join success，仍为原选身份。 | 本次前台会话恢复，非所有 401 / 403 / 强制断线 / 切服路径。 |
| E-WA-06 | 66：约268MiB MKV，真实探测HEVC Main10 1920×1080 / AAC48kHz stereo / ASS×2，iPad实际画面连续超过2分钟，duration1510.153，native ASS两条SC/TC被识别，SC字幕可见、TC切换选中；暂停122.207→137.207秒clock/ACK到位并约60秒稳定，但灰屏截图与同时间原片彩色参考帧不符，seek画面失败。67：约448MiB MKV，真实探测HEVC Main10 1920×1080 / Opus48kHz stereo / ASS×2；iPad与另一账号iPhone均有画面，iPhone SC字幕可见，duration1446.2，时钟30.808→44.809推进。 | 本次起播画面与所列字幕；66单次暂停seek仅时钟/ACK匹配、画面不通过（13.2MiB有界Range抽帧排除素材灰色）；两条声音听感均未验，67 seek / TC等未做，不外推HDR或所有MKV。脱敏详情 E-SR-01。 |
| E-WA-07 | seek 专用失败清理修订及 18 项回归通过：保留 prepared、清 pending / active、恢复已观测位置，后续 seek 可再提交。 | JS 恢复合同；NAS 暂停 HLS 精确定位仍待原生修复复核。 |
| E-WA-08 | 当前 `mediaAdapter.test.mjs` + `vlcPlayer.test.mjs` 27 项（14 + 13）独立复核通过。新增 nativeKey、attach 中报错保护，以及旧输入在新源解析中失败不残留到新输入的回归。 | JS 门控 / 取消 / 重试 / 旧错误合同；不能替代 CMS 修订后原生复核或 HLS 精准 seek。 |
| E-BI-01 | NAS 两个独立站点账号解析 AV170001 / CID279786：DASH 实际 QN16、独立视频 / 音频 Range206，初始盒分别 vide / soun；MP4 实际 QN64、单流206，含 vide+soun。未改 NAS 全局设置。 | 服务器协议与真实媒体字节；不代表 native 起播，不能把请求QN64写成DASH实际720p。 |
| E-BI-02 | [B站原生路由记录](evidence/bili-native-routing-2026-10-22.md)：主任务确认 iPad server DASH、phone local CLI DASH 起播；BV19E411D78Q P1 两分支实际 QN64、AVC+AAC、slave1。iPad UI 切 P2 后，两分支 CID1475635389 / P2，iPad 实际画面可见。 | 阶段原生；phone P2 画面、真实音轨解码 / 听感、切回P1、前后台与最终清缓存构建仍待验。CLI关闭不等于本机未登录。 |
| E-BI-03 | Bili / 选择流程 / 换源 / timeline 定向 41 项通过；新增迟到本机解析不保存、旧偏好读不覆写新策略、已提交存储完成不重置新片、有效保存恰好一次失效等异步回归。编辑器按站点 / 用户 / 影片 / 来源重建，layout cleanup取消旧操作。 | 实现 / 回归；不代替原生手动取消、换账号与弱网测试。 |
| E-BI-04 | 生产 resolver 对真实94P视频的 CID-only、显式P2、带?p短链、完整分享文本均得到 CID1475635389 / P2；旧NAS忽略CID时只按真实pages补一次page请求。 | 真实 NAS 协议及生产JS；本机Go同短链、粘贴 / 搜索UI和所有账号组合仍须分别验收。 |
| E-SR-01 | [来源分项记录](evidence/ios-simulator-2026-10-22/sources-acceptance.md)及[脱敏协议汇总](evidence/ios-simulator-2026-10-22/sources-protocol-summary.json)：当前管理员身份实际Jellyfin1挂载、Emby0、AniSubs10、Kazumi3、CMS28；专用WATCH房添加59/60/61/62/63/65/66/67，保留sourceMountId / sourceMeta和显式false。65仅非当前条目PUT/GET四组合，逻辑身份未变。 | NAS协议与限定原生结果分开，真实画面见E-WA-01/02/03/06；不修改NAS挂载/设置，不借用其他账号库，不含私有媒体URL/凭据。 |
| E-SR-02 | AniSubs10源均搜索：8次200（1个无结果）、2次502，7源取得分集，所选8次resolve全404。CMS28源各一轮搜索，对10源18组检查HTTP前段：8个403、6个404、2个206、2个200，均HTML；62带返回Referer/UA直连403 HTML，NAS代理206仍HTML。 | 记录所选候选，不声称所有上游所有影片永久失效；本轮没有可验证CMS/AniSubs正向媒体，已停止重复扫描，无伪直链。 |
| E-SR-03 | 来源/方向七文件定向50/50通过；面包屑新增后相关19/19通过（与50有重叠）；补证四文件39/39通过（含同文件其他领域用例，不累计为来源独立数量）。下表直接引用实际文件与测试名，TypeScript和目标ESLint通过。 | 自动合同与生产组件事件，不是原生画面/音频、像素、系统窗口或跨平台通过。最终全量数量由主任务统一记录。 |
| E-SR-04 | 源码逐条核查useMediaPreferences、MediaDisplayTools及实际挂载的SourcePicker→Anime/CMS/Library/Directory、EpisodePicker和MovieSourceSettings；SourceBreadcrumbs各级等宽单行、已有返回动作由组件事件回归验证。 | 默认偏好/接线有实现；本轮尚无全入口持久化、长连续英文、130%字体或最终窄宽截图，明确保留待原生。 |
| E-SR-05 | iPad窗口补丁：app requireFullScreen=false，持久scene插件iPad4方向/iPhone原DEFAULT等价3方向，移除通用EXDefault mask；window port原生lock/unlock no-op且不假locked，方向入口提供系统窗口说明。两项窗口行为/配置回归通过，第10轮已构建安装。 | 实际尝试拖动窗口手柄未改变window尺寸，不算resize / 分屏通过；iPhone仍按实际视频尺寸锁向。配置或单测不等于系统窗口通过。 |
| E-BUILD-01 | 16次Simulator Debug成功，Debug16已安装并启动phone / iPad、iPad新房准入成功；完整check20补丁检查、lint、TypeScript、409 / 409项通过，其后仅buildNumber26→27元数据；阶段12文件Go来源verify-only / LF摘要通过记录保留。 | 构建 / 自动检查不等于609行原生通过；第16包phone UI和TLS见E-UI-05 / E-CO-01，最近后台仍为第15包E-MU-11。 |
| E-BUILD-02 | 历史[第26包设备IPA证据](evidence/ios-device-ipa-2026-10-22.json)：1.9.0(26)、device arm64 / IOS2，49248343B、Hermes6589210B，unsigned / 无profile，native / debug / 已知私密检查通过，原IPA和摘要保留。 | 用户报告真机一起听功能及原生音乐控件全部正常，安装 / 启动由用户确认；未提供型号 / OS / 时长，agent未独立观察，未改写Simulator历史负例。新增第27包不由此通过。 |
| E-AP-01 | 源码核查AppearanceProvider本机偏好、系统主题 / 减少动态、导图及背景变换；`startup.test.mjs`三项检查验证字段保持、坏类型 / 非有限值与越界钳制。09为外观面板阶段截图，15为浅色界面下黑色播放器画布。 | normalize测试不证明实际持久读写、DocumentPicker导入、系统主题切换或每个滑条已在原生操作；阶段截图不关闭全部外观验收。 |
| E-UI-01 | 第10轮iPad音乐实际NCM评论154625总数、楼层回复空态、返回评论与关闭；标准音质换源rev7、seek71.054成功后继续；唯一队列弹层2首且当前Bili高亮。 | 仅所列操作；没有发送外部评论，分页 / 失败、快速切歌与所有队列切层仍未验。 |
| E-UI-02 | [动态字体及转交实测](evidence/room-ui-live-font-transfer-2026-10-22.md)：第11轮二进制配当前JS，实际fontScale1.353→1→1.353，phone所列房间行完整；iPad编辑名称未提交草稿经同样热变保留，键盘、确认 / 取消 / 关闭及离房可达，随后取消保留原房名。 | 所列房间页动态135.3%字号已验；只重建native Text Paragraph，不key表单 / 播放器。其他页面、横屏短高度 / 分屏仍待验，第10轮裁切为已修历史；最终JS检查见E-BUILD-01。 |
| E-UI-03 | 同一[原生记录](evidence/room-ui-live-font-transfer-2026-10-22.md)：约18:58 iPad账号1→phone账号3→iPad账号1连续双向转交，无重连；旧房主管理 / 模式入口退场、新房主取得入口且能对原房主再次转交，最终成员数1。 | 本次两账户、确认对象及双向权限 / 名单已验；旧名单故障为已修历史。不外推房管 / 游客权限、被踢 / 审批与网络失败分支。 |
| E-MU-06 | 第10包历史[Home / Lock观察](evidence/ios-simulator-2026-10-22/music-background-home-lock.md)：Home后NCM→Bili、Simulator Lock后Bili→NCM自然切歌，新曲原生时钟推进；10:31:17解锁回前台NCM1:42 / 2:29、歌词及暂停UI正常。 | 仅此前第10包与所列时段的正向，不覆盖第12包失败E-MU-08。锁屏卡、物理设备系统挂起、小时级后台及第二端听音不由此通过。 |
| E-MU-07 | MusicPanel实际回调探针曾在解析失败后5个普通心跳产生2→7次resolve；现catch保留adapter失败门控，native错误nativeFailed，VLC_SEEK保留input并阻止普通心跳重试，显式控制 / 新作用域可恢复。musicPlayback新增4项、连同adapter / members / settings共51 / 51通过，TSC及目标ESLint通过。 | JS有界失败与恢复合同，不代替E-MU-11所列范围以外的原生听感 / 后台验收；当前全检见E-BUILD-01。 |
| E-MU-08 | 第12包历史后台崩溃：[脱敏crash](evidence/ios-simulator-2026-10-22/music-background-build12-crash.json)及[观察](evidence/ios-simulator-2026-10-22/music-background-build12-observation.json)。UTC11:12:54.963自然切NCM后仅opening；北京时间19:12:55.1079旧PID92636 SIGABRT，主线程swift_abortRetainUnowned→MediaPlayer.destroyPlayer→LibVlcPlayerView.deinit。19:17重开新PID93622及房间列表。 | 原生abort非挂起，新进程不算恢复。后续销毁修复有实际Swift正 / 负对照；第14包E-MU-10已完成同PID后台跨曲与恢复，本条保留历史事实，不再列作当前全部后台未验。第15包限定结果见E-MU-11，原生生命周期其余场景仍待验。 |
| E-MU-09 | 第13包历史[前台失败](evidence/ios-simulator-2026-10-22/music-background-build13-foreground-failure.json)：新专用房iPad PID97626，Bili ready后初始audio-seek target1ms，8.045秒超时、actual7000ms / advancing0 / success=false；出现起播后暂停及7–9秒重试循环，该包未执行Home / Lock。 | 初始no-op锚点修订后，第14包新曲近零seek及原生推进已通过E-MU-10；这不关闭第14包旧非零状态恢复失败。第15包限定结果见E-MU-11；精确零点起播仍失败，不以自动回归替代。 |
| E-MU-10 | 第14包历史[Home / Lock脱敏记录](evidence/ios-simulator-2026-10-22/music-background-build14-home-lock.json)：iPad同PID99952。Home后Bili→NCM，11:58:51.659新输入ready，11:59:24.672原生31.881秒；Simulator Lock后NCM→Bili，12:01:23.821新输入ready，12:01:59.532原生31.735秒；近零seek实际targetObserved / anchored / advancing2成功。12:03:30回前台Bili2:07 / 3:19，12:03:42确认同PID。 | 仅该Simulator主音频、所列顺序跨曲及同进程恢复正向，不声明精确0秒起播。另保留：准备阶段旧非零target31352ms / actual31352ms但未观察推进、8.007秒失败；锁屏NowPlaying卡未显示；回前台装饰视频恢复失败而主音频继续（[17图](evidence/ios-simulator-2026-10-22/17-ipad-music-background-return-failure.png)）。后续第15包见E-MU-11；物理设备、听感 / 第二端同步和小时级均未由此通过。 |
| E-MU-11 | 第15包[Home / Lock脱敏记录](evidence/ios-simulator-2026-10-22/music-background-build15-home-lock.json)：iPad同PID3018。Home NCM→Bili，12:12:54.923新输入ready，12:13:28.219原生30.923秒；Simulator Lock Bili→NCM，12:16:16.424新输入ready，12:16:48.583原生30.972秒；两次近零attach均有实际目标观察、锚点与后续推进。12:19回前台，12:19:15确认原PID3018。装饰再次失败后清除灰色残影、回退普通背景并保留错误，原生已验（[18图](evidence/ios-simulator-2026-10-22/18-ipad-music-video-fallback.png)）。 | 仅所列Simulator主音频自然跨曲 / 同进程恢复与失败surface回退通过。准备paused0后仅UI play，原生先报0后跳31.172秒（UI约32秒），没有用户seek，精确零点起播失败；卡仍未显示；装饰实际播放恢复仍失败，回退成功不代表装饰或纯视频成功。第14包非零恢复失败继续保留；物理设备 / 听感 / 第二端同步 / 小时级未验。 |
| E-UI-04 | 第15包及check18最新Metro，phone PID5023普通竖屏一起看测试房：7个控制钮等间距、无溢出；More首项发送弹幕，点击展开composer且menu关闭，再开首项收起弹幕输入，点击恢复紧凑栏。[19图](evidence/ios-simulator-2026-10-22/19-iphone-watch-control-bar.png)。 | 仅此phone普通竖屏原生场景，未发送消息。320pt / asymmetric safe-area / 全屏临界宽度仍仅组件回归，不声明全部屏宽原生通过。 |
| E-BUILD-03 | 最新[第27包设备IPA证据](evidence/ios-device-ipa-27-2026-10-22.json)：1.9.0(27)、com.zviewer.mobile、iOS16.4、iPhone+iPad，49276344B，SHA256 50d2fefce399827831e52cf20a6c4a0ca077e02f71f085a1efc031c3804c6671，Hermes6622435B、device arm64 / IOS2，unsigned / 无profile，native / debug / 已知私密字面量检查通过。 | 2次device Release与16次Simulator Debug分计，总原生18次。第27包已定向交付，用户自签 / 真机待验；旧26保留，公开Release仍26，无push / EAS / 新公开发布。 |
| E-CO-01 | [Debug16合成证书例外原生证据](evidence/ios-simulator-2026-10-22/server-certificate-build16.json)23项true：严格默认、selected allow的RN REST / Range / 图片 / Engine.IO WSS、同源 / 相对redirect、外origin / port / voice严格拒绝、降级拒绝、撤销活动HTTP / WS及旧capability失效。 | 真实Simulator native / RN传输，不是decoded-media或物理设备。UI默认关 / origin偏好 / restore-before-request / stale config、媒体URI映射另有serverConnection / sessionCookieIsolation / mediaConnectionTransport回归；不将localhost映射写入DTO。 |
| E-UI-05 | [Debug16反馈](evidence/ios-simulator-2026-10-22/feedback-build16.md)：phone投屏横屏右侧 / 竖屏下方聊天、manualFullscreen隐藏再恢复草稿；音乐设置首项网易云音质，右侧房间评论抽屉横竖屏 / 键盘避让、实际发送后close / reopen保留；More竖屏按钮下方，横屏底部不足时按真实内容贴按钮上方8pt。20–27图见[索引](evidence/ios-simulator-2026-10-22/README.md)。 | 本次phone UI限定范围，另有iPad连接页默认off和portrait系统窗口More下方实见；不称所有下方、iPad横屏、320pt、安全区、所有角色 / 网络均通过；不含新的媒体解码或后台测试。More组件 / 几何8项、drawer5项回归与GUI分开。 |
| E-DM-05 | B站自动弹幕 / 防串片23项专项通过：当前media元组、旧GET / submittedPOST与clear串行、default显式删除不复活、hidden / offset保留、viewer不写NAS。真实NAS P1 / P2素材分别1200 / 2623条。 | 当前专用房UI play返回“影片不存在”，REST有75 / 76 / 77且原生发送room / movieID核对一致，iPad真正GUI建房后78亦同错，Node数字75却成功；根因未定位，新增自动导入与防串片原生闭环尚未通过，不以单测 / API冒充。 当前iPad真实NAS WebSocket已确认所选origin / path正确且readyState1，只读request-movie-list返回movies:[]，紧接同房REST仍为78 / 79 / 80（28图）；这是实际Socket / REST片单不一致，根因仍未定位，不能归为多worker、缓存、权限或鉴权。 |

## 01：基线、正确边界与修复合同

### 01 §1–4：接手基线与不可回退的架构

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D01-BASE-01 | 唯一客户端仓库含 `ZV-iOS`、兄弟 `native/bilicore` 及必要 Git 对象。 | 仓库核对：初始恢复基线为a869088a6e7dd9fc56e5cf4a9e8070a877adb923，ZV-iOS与native/bilicore同一客户端仓库；旧02f62f1f来源对象仍存在，12文件stage门禁通过E-BUILD-01。最终变更提交待主任务。 |
| D01-BASE-02 | 保留原有 release 文件重命名，不误作本轮功能删除。 | 本轮审计确认docs/releases/client-v1.9.6.md删除与client-1.9.6.md未跟踪仍为预存重命名，未编辑两文件。最终提交diff仍须保留此边界。 |
| D01-BASE-03 | iOS 与 Android / HarmonyOS 版本分别记录，不靠根版本号声明对齐。 | 当前本地交付iOS1.9.0(27)、com.zviewer.mobile、iOS16.4见E-BUILD-03；公开仍26，Android / HarmonyOS版本独立记录，不据相同标签声明功能已对齐。 |
| D01-BASE-04 | 安装锁定依赖；不在迁移时顺带升级 Expo / RN / VLC。 | 待工具链记录 |
| D01-BASE-05 | 记录 NAS 实际部署版本，不由本地 server HEAD 推断。 | 阶段原生：本轮 NAS 4.7.4；最终部署快照待主任务 |
| D01-BASE-06 | 保留 Expo / RN / VLCKit 单一播放链，不嵌入整个 Web 前端。 | 待最终架构 diff 审阅 |
| D01-BASE-07 | 原生修复落在 plugins / modules 源码，生成 ios / node_modules 可重现。 | 待原生补丁重现记录 |
| D01-BASE-08 | 共享限于 DTO、算法、状态机、权限、取消和源身份；不直接迁入 DOM / MSE / ArkWeb。 | 待最终架构审阅 |
| D01-BASE-09 | 旧解析、attach、原生 revision 回调不能复活新房 / 新片。 | 实现 / 回归（仅所列测试范围）：R-ST-07；原生与其余分支待验 |
| D01-BASE-10 | 媒体成功后才标记已应用；失败能重试同来源。 | 实现 / 回归E-MU-07、R-MU-22–25：音乐普通心跳不重试失败来源，显式room / local控制可恢复，同输入seek失败不重建。原生当前音乐及其他管线实际重试仍待验。 |
| D01-BASE-11 | 原生毫秒与房间秒正确换算，seek 后保持最新暂停 / 播放意图。 | 实现 / 回归（仅所列测试范围）：R-HO-07；E-WA-07 恢复回归；精准 seek 原生失败 E-WA-02，待修订复核 |
| D01-BASE-12 | 迟到 start-paused 不使新歌曲停在 0 秒。 | 实现 / 回归；原生切曲待验 |
| D01-BASE-13 | DASH slave / 字幕仅属于当前 input，换源清空。 | 待验 |
| D01-BASE-14 | 原生字幕与 RN overlay 互斥。 | 待验 |
| D01-BASE-15 | 本机 B站权限失败不静默换账号；普通内容服务端 fallback 有边界。 | 待验 |
| D01-BASE-16 | refresh 单飞；退出 / 切账号 / 切服使 lease 与旧请求失效。 | 实现 / 回归（仅所列测试范围）：R-SC-04 / R-SC-14；原生与其余分支待验 |
| D01-BASE-17 | SecureStore 凭据、媒体 token 不进入日志 / 交付证据。 | 待最终材料核查 |
| D01-BASE-18 | 语音默认只听，管理员解禁 / 回前台不自动开麦。 | E-VO-01 / 02；系统场景待验 |

§3 的版本历史不是当前通过证据；其要求落点完整映射如下：1.9.5 → D03-BACK / D03-CAST；2.0.0 → D03-ROOM / D03-MUSIC / 本轮排除的发送端；2.1.0 → D01-MUSIC / D01-POLICY / D01-LIB / D01-AGG；2.1.1 → D01-SOURCE / D03-CONTROL / D03-CHAT；2.1.2 → D01-LIB / D03-PERM；2.1.3–2.1.4 → D03-CAST / D01-SOURCE；2.1.5 → D01-POLICY；2.1.6 → D03-BROWSE；2.1.7 → D01-BILI / D01-CAPS / D03-DISPLAY；2.1.8–2.1.9 → D01-POLICY / D01-AGG / D01-NATIVE / D03-ADD / D03-CARD / D03-VOICE。历史 Android / HarmonyOS 或旧 IPA 结果不计 iOS 本轮验收。

### 01 P0-01：逻辑来源与已解析媒体身份

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D01-SOURCE-01 | ani-subs 已解析 URL 不被片单 `anisubs://` 占位覆盖。 | 实现 / 回归（仅所列测试范围）：R-HO-01；实现 / 回归：`RoomPlayback` 保留已解析 URL；`handoffPlayback.test.mjs`「ani-subs resolved URL survives all state/list/current arrival orders」六种顺序通过。NAS AniSubs 解析阻塞 E-SR-02，正向原生未验。 |
| D01-SOURCE-02 | 协调 movieId / CID / ep 时不无条件覆盖已解析 URL。 | 实现 / 回归（仅所列测试范围）：R-HO-01；实现 / 回归：`roomPlayback.ts` 按当前影片及完整快照合并；`sourceRoutingRegression.test.mjs`「an unlabelled old Kazumi state cannot attach its URL or audio to another legacy movie」通过。B站 CID 另见 D01-BILI，不互相代验。 |
| D01-SOURCE-03 | 解析结果核对 room / movie / source / 操作代次。 | 实现 / 回归（仅所列测试范围）：R-HO-02；实现 / 回归：来源代次及旧片隔离由 `RoomPlayback`、取消 signal 和 `sourceBatch` 接线；`sourceInteraction.test.mjs`「cancel waits for an in-flight write confirmation, retains it, and never starts the next item」通过。真实 HTTP / Socket 乱序及离房写入完整矩阵待原生。 |
| D01-SOURCE-04 | `state → list → current` 顺序仍显示当前媒体。 | 实现 / 回归（仅所列测试范围）：R-HO-01；实现 / 回归：`handoffPlayback.test.mjs` 的六序列用例包含 state → list → current；自动合同通过，AniSubs 正向原生受 E-SR-02 阻塞。 |
| D01-SOURCE-05 | `list → current → state` 顺序仍显示当前媒体。 | 实现 / 回归（仅所列测试范围）：R-HO-01；实现 / 回归：同一六序列用例包含 list → current → state；不等同 NAS 实际事件乱序演练。 |
| D01-SOURCE-06 | 初始 state 早于片单可起播，不依赖再次手工选片。 | 实现 / 回归（仅所列测试范围）：R-HO-01；实现 / 回归：同一六序列覆盖初始 state 早于片单；当前可用 Jellyfin / Kazumi 已起播 E-WA-01 / 03，未专门重放 NAS 冷启动时序。 |
| D01-SOURCE-07 | 同片切集与迟到旧 ACK 不回到旧集。 | 实现 / 回归（仅所列测试范围）：R-HO-02 / R-SR-01；实现 / 回归：`libraryPlayback.test.mjs`「library version changes retain the same episode position and early new-episode state survives its list update」及两类 early episode state 用例通过；设备切集迟到 ACK 待验。 |
| D01-SOURCE-08 | iOS 房主 ani-subs 起播。 | 外部阻塞 E-SR-02：10 源搜索已试，取得分集的所选 8 次 resolve 均 404；尚无 iOS 房主 AniSubs 正向起播。 |
| D01-SOURCE-09 | iOS 观众 ani-subs 起播，使用自己的服务器入口鉴权。 | 外部阻塞 E-SR-02；当前接收端前缀 / 账号重绑定有来源回归，不能替代 AniSubs 观众原生起播。 |
| D01-SOURCE-10 | ani-subs 暂停后不自行恢复声音。 | 外部阻塞 E-SR-02：没有可播 AniSubs 媒体，暂停 / 声音不自行恢复未验；其他源暂停不关闭此项。 |
| D01-SOURCE-11 | ani-subs seek 0 / 中段后意图保持。 | 外部阻塞 E-SR-02：AniSubs seek 0 / 中段正向原生未验；其他来源的起播 / 时钟证据不得移作 AniSubs 证据。 |
| D01-SOURCE-12 | ani-subs 离房重入恢复当前媒体身份。 | 外部阻塞 E-SR-02：保存逻辑 sourceMeta 已验证，AniSubs 媒体离房重入恢复未验。 |
| D01-SOURCE-13 | B站 DASH → ani-subs HLS 清旧 audioUrl / CID / codec / 字幕。 | 实现 / 回归（仅所列测试范围）：R-HO-02；原生与其余分支待验 |
| D01-SOURCE-14 | B站 DASH → Kazumi HLS 清旧音轨及策略。 | 实现 / 回归（仅所列测试范围）：R-SR-01；原生与其余分支待验 |
| D01-SOURCE-15 | B站 DASH → CMS HLS 清旧音轨及策略。 | 待验 |
| D01-SOURCE-16 | HLS → B站重新建立本次音视频轨与分 P 身份。 | 待验 |
| D01-SOURCE-17 | 跨源时普通 URL / HLS / B站完整快照不残留旧字段。 | 实现 / 回归（仅所列测试范围）：R-HO-02；实现 / 回归：`handoffPlayback.test.mjs`「cross-provider snapshots clear Bili identity/audio and reject retired movie state」和 `sourceRoutingRegression.test.mjs` 旧 Kazumi 输入用例通过；实际全链切换由主任务另填，不由单源起播推断。 |
| D01-SOURCE-18 | 跨源互换房主后仍可重新解析，不共享本机回环 / 私有临时凭据。 | 实现 / 回归：`sourceRoutingRegression.test.mjs`「adding metadata-based proxy records removes the adding account token and entry-point host」通过；iOS 双账号已有媒体画面 E-WA-01 / 03 / 06。Android / HarmonyOS 互换房主未验。 |

### 01 P0-02：观影与音乐服务器权威同步

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D01-WATCH-01 | 保留观影 clientTs / sync-heartbeat / check-status 单条权威链。 | 待验 |
| D01-WATCH-02 | 记录真实漂移与原生 seek 耗时后验证软纠偏 / 硬跳转 / 冷却。 | 待验 |
| D01-WATCH-03 | 准备 / seek / 用户拖动期间不重复强制纠偏。 | 待验 |
| D01-WATCH-04 | 最新暂停意图优先于迟到同步与 attach。 | 待验 |
| D01-WATCH-05 | iOS↔Android 互换房主，零秒与末尾同步。 | 待跨平台验收 |
| D01-WATCH-06 | iOS↔HarmonyOS 互换房主，零秒与末尾同步。 | 待跨平台验收 |
| D01-MUSIC-01 | 消费 `music:sync-heartbeat`，区分服务器时钟和房主存活样本。 | 实现 / 回归（仅所列测试范围）：R-MH-01；原生已验：E-MU-01；异常路径待验 |
| D01-MUSIC-02 | 房主心跳发送 clientTs，serverTs 初始化可用。 | 原生已验：E-MU-01 |
| D01-MUSIC-03 | `music:check-status` 请求、超时、迟到回复均绑定当前媒体 / 房间代次。 | 实现 / 回归；E-MU-01 有 59 次检查，超时原生待验 |
| D01-MUSIC-04 | 零秒合法，不因 truthy 判断丢失播放 / 暂停。 | 实现 / 回归（仅所列测试范围）：R-HO-05 / R-MU-06；实现 / 回归；原生 seek 0 待验 |
| D01-MUSIC-05 | 一条主时钟纠偏路径，不能服务器 / 房主样本轮流 seek。 | 实现 / 回归（仅所列测试范围）：R-HO-05；实现 / 回归；E-MU-01 仅房主时钟窗口 |
| D01-MUSIC-06 | 慢 ACK 不覆盖已切曲、队列或退出后的状态。 | 实现 / 回归（仅所列测试范围）：R-MU-02 / R-MU-05 / R-MU-16；实现 / 回归；原生迟到场景待验 |
| D01-MUSIC-07 | 同曲目慢解析在 2 秒心跳下合并，不持续取消。 | 实现 / 回归（仅所列测试范围）：R-MU-11；实现 / 回归；原生慢网待验 |
| D01-MUSIC-08 | 房主离线自主控制按服务器实际合同处理，不擅自广播。 | 实现 / 回归（仅所列测试范围）：R-MH-01 / R-MU-07 / R-MU-08；实现 / 回归；原生离线待验 |
| D01-MUSIC-09 | 网易云原生真实歌曲起播并持续播放。 | 原生已验（限定E-MU-11）：第15包Lock后自然切NCM，新输入ready且原生30.972秒；第14包另有Home NCM正向E-MU-10。15包初始paused0后UI play跳31.172秒，精确零点起播失败独立保留；两端听感 / 弱网 / 真机仍未验。 |
| D01-MUSIC-10 | B站原生真实歌曲起播并持续播放。 | 原生已验（限定E-MU-11）：第15包Home后自然切Bili，新输入ready且原生30.923秒，近零attach有实际推进，同PID回前台主音频正常。13包初始seek失败为历史；14旧非零恢复与15初始零点偏移不由此关闭，听感 / 真机另验。 |
| D01-MUSIC-11 | 网易云播放 / 暂停 / 倍速 / seek 到 0 分别保持权威状态。 | 待验 |
| D01-MUSIC-12 | B站播放 / 暂停 / 倍速 / seek 到 0 分别保持权威状态。 | 待验 |
| D01-MUSIC-13 | 歌曲末尾等待服务端确认切曲，无 0 秒停播或重复回执。 | 实现 / 回归R-MU-15 / 17 / 18；第15包E-MU-11已观察Home NCM→Bili、Lock Bili→NCM自然曲终，新输入ready并推进超过30秒；14包反向顺序历史E-MU-10保留。其余模式 / 重发 / 竞争仍待验，不声明初始精确零点成功。 |
| D01-MUSIC-14 | 整歌单加入与切曲不被旧队列覆盖。 | 实现 / 回归（仅所列测试范围）：R-MU-04；原生与其余分支待验 |
| D01-MUSIC-15 | 弱网 / 断线重连恢复音乐权威状态。 | 实现 / 回归（仅所列测试范围）：R-MH-02 / R-MU-05；原生与其余分支待验 |
| D01-MUSIC-16 | 切曲时迟到解析 / 自检 / 心跳不恢复上一首。 | 实现 / 回归（仅所列测试范围）：R-MU-03 / R-MU-12 / R-MU-13 / R-MU-14；实现 / 回归；原生待验 |
| D01-MUSIC-17 | 连续 10 分钟记录原生房主与 NAS 时钟样本。 | 原生已验：E-MU-01 |
| D01-MUSIC-18 | 第二个原生观众连续 10 分钟实际音频漂移 / 纠偏次数。 | 待验；不能引用 E-MU-01 代替 |
| D01-MUSIC-19 | iOS↔Android 双向房主连续 10 分钟、漂移和纠偏。 | 待跨平台验收 |
| D01-MUSIC-20 | iOS↔HarmonyOS 双向房主连续 10 分钟、漂移和纠偏。 | 待跨平台验收 |
| D01-MUSIC-21 | 锁屏长时房间同步 / 自动跨曲与单纯继续出声分别验证。 | 实现 / 回归R-MU-19 / 20 / 21；第15包E-MU-11限定Home / Simulator Lock自然跨曲与原PID3018恢复已验，12包SIGABRT为历史。锁屏卡仍未显示，小时级 / 物理设备 / 第二端听音待验；server外推不作原生证据。 |

### 01 P0-03：片级策略全链路与事务

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D01-POLICY-01 | Movie / SourceSelection / PlaybackSource 含全部策略与 sourceMountId。 | 实现 / 回归：`sources.ts` / `media.ts` 的 Movie、SourceSelection、PlaybackSource 保留布尔策略与 sourceMountId；`handoffPlayback.test.mjs` 六序列验证 false；NAS 协议 E-SR-01。 |
| D01-POLICY-02 | API GET → 添加草稿 → PUT → 确认 GET 保留显式 false。 | NAS 协议：61 / 62 / 63 POST 回读两策略均明确 false；65 实际 PUT / GET 四组合并恢复 false / false，详 E-SR-01。添加 UI 初始 Switch 当前原生待验，不能把协议当截图。 |
| D01-POLICY-03 | 保存只发改变字段，不覆盖另端未改值。 | NAS 协议：65 四组合每次只发改变字段，GET 一致，逻辑 URL / sourceMeta 不变（E-SR-01）；当前片应用及跨端竞争不由此关闭。 |
| D01-POLICY-04 | HTTP 先于 Socket 不覆盖新策略 / 重复应用。 | 待验 |
| D01-POLICY-05 | Socket 先于 HTTP 不覆盖新策略 / 重复应用。 | 待验 |
| D01-POLICY-06 | 当前影片保存后重新解析 / attach，成功后才广播。 | 待验 |
| D01-POLICY-07 | 非当前影片只保存，不重载当前媒体。 | 待验 |
| D01-POLICY-08 | 同 URL 双关组合重载键包含策略。 | 实现 / 回归（仅所列测试范围）：R-HO-03；原生与其余分支待验 |
| D01-POLICY-09 | 同 URL 仅服务器中转开组合正确生效。 | 待验 |
| D01-POLICY-10 | 同 URL 仅浏览器转码开组合正确保存 / 透传。 | 待验 |
| D01-POLICY-11 | 同 URL 双开组合正确保存 / 消费。 | 待验 |
| D01-POLICY-12 | 播放中切策略保进度与最新播放意图。 | 实现 / 回归（仅所列测试范围）：R-HO-03；原生与其余分支待验 |
| D01-POLICY-13 | 暂停 10 秒再切策略保持暂停与位置。 | 实现 / 回归（仅所列测试范围）：R-HO-03 / R-PS-02；待原生 seek / 事务最终回归 |
| D01-POLICY-14 | 1.5 倍速切策略保倍速 / 位置 / 暂停状态。 | 实现 / 回归（仅所列测试范围）：R-HO-03；待原生 seek / 事务最终回归 |
| D01-POLICY-15 | saving 与 applying 独立，首帧 / seek 未成功不提前完成。 | 实现 / 回归（仅所列测试范围）：R-PS-03 / R-PS-04 / R-PS-06；原生与其余分支待验 |
| D01-POLICY-16 | 保存失败保留旧确认状态，展示可重试错误。 | 待验 |
| D01-POLICY-17 | 保存成功但应用失败保留新设置、停止失败管线并允许重试。 | 实现 / 回归（仅所列测试范围）：R-PS-05；原生与其余分支待验 |
| D01-POLICY-18 | 应用失败不反向 PUT 暗中回滚。 | 待验 |
| D01-POLICY-19 | 换房 / 换片 / 离房期间旧保存和应用失效。 | 待验 |
| D01-POLICY-20 | 另端修改、观众重进房消费同一确认策略。 | 待验 |
| D01-POLICY-21 | `playsvideoEnabled` 明确为网页共享偏好，不虚构 iOS MSE。 | 实现 / 回归（仅所列测试范围）：R-PS-01；待 UI 文案及跨端消费核查 |
| D01-POLICY-22 | iOS 仅在实际影响本机路由 / 配置时重载。 | 实现 / 回归（仅所列测试范围）：R-HO-03 / R-PS-01；原生与其余分支待验 |
| D01-POLICY-23 | `serverProxy=true` 阻止不合语义的直连解包。 | 实现 / 回归（仅所列测试范围）：R-SR-04；待实际网络流向验收 |
| D01-POLICY-24 | 中转仅 anime / Kazumi / CMS，挂载另用 directLink / sourceMountId。 | 实现 / 回归：SourcePicker 中转仅 anime / Kazumi / CMS；媒体库与 WebDAV / OpenList 使用自身 directLink + sourceMountId。`sourceInteraction.test.mjs` 初选挂载、`directorySources.test.mjs` 两类 saved direct mode 用例通过；真实外网直链挂载仍无素材。 |
| D01-POLICY-25 | 访问统计与复制地址对应实际策略 / 路由。 | 待验 |

### 01 P0-04 / P1-01：B站账号矩阵、短链与解码能力

账号与入口组合分别列行；每次记录实际解析账号、CID / P、可用画质和重入身份。同一素材的起播不能关闭其他账号 / 入口组合。流程合同 D01-BILI-06–14 需与实际组合结果一起检查。

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D01-BILI-01 | 本机未登录、仅服务器登录：普通 BV。 | 待验 |
| D01-BILI-02 | 仅本机登录：普通 BV。 | 待验 |
| D01-BILI-03 | 本机 / 服务器均登录：普通 BV，验证选定账号。 | 阶段原生 E-BI-02：phone本机与对应NAS B站会话均存在，实际local-cli；iPad明确server DASH。重入与完整播放操作待验 |
| D01-BILI-04 | 两者均未登录：普通 BV 与权限说明。 | 待验 |
| D01-BILI-05 | CLI-only：普通 BV，坚持本机权限。 | 待验 |
| D01-BILI-06 | 普通 BV 搜索 → 解析 → 添加使用统一账号路由。 | 待验 |
| D01-BILI-07 | `?p` 短链展开保 P，默认未知 P 不强传 page=1。 | E-BI-04 真实服务器协议与回归；本机Go及各账号原生入口待验 |
| D01-BILI-08 | 分享文本提取规范地址，重解析不回短链猜 P。 | E-BI-04 真实服务器协议；原生粘贴 / 重解析持续性待验 |
| D01-BILI-09 | 显式 CID / page 优先于 URL 参数，手动切 P 持续成立。 | 阶段原生 E-BI-02：双分支P2身份、iPadP2画面；CID-only协议 E-BI-04，切回P1 / 重入待验 |
| D01-BILI-10 | PGC ep 账号 / 试看 / 音画说明准确。 | 待验 |
| D01-BILI-11 | PGC ss 选集 / 账号 / 重入身份正确。 | 待验 |
| D01-BILI-12 | 添加、画质、分 P、恢复、音乐关联视频共享路由判定。 | 实现 / 回归 E-BI-03；单片设置迟到任务已有取消门控，完整原生入口组合待验 |
| D01-BILI-13 | 受限跳转白名单，不随跳转携带 Cookie。 | 待验 |
| D01-BILI-14 | 本机已选账号权限失败直接反馈，不切另一账号。 | 待验 |
| D01-BILI-15 | 仅服务器登录：带 ?p 短链。 | 待验 |
| D01-BILI-16 | 仅服务器登录：分享文本。 | 待验 |
| D01-BILI-17 | 仅服务器登录：手动切 P。 | 待验 |
| D01-BILI-18 | 仅服务器登录：PGC ep。 | 待验 |
| D01-BILI-19 | 仅服务器登录：PGC ss。 | 待验 |
| D01-BILI-20 | 仅本机登录：带 ?p 短链。 | 待验 |
| D01-BILI-21 | 仅本机登录：分享文本。 | 待验 |
| D01-BILI-22 | 仅本机登录：手动切 P。 | 待验 |
| D01-BILI-23 | 仅本机登录：PGC ep。 | 待验 |
| D01-BILI-24 | 仅本机登录：PGC ss。 | 待验 |
| D01-BILI-25 | 两者均登录：带 ?p 短链，核对选定账号。 | 待验 |
| D01-BILI-26 | 两者均登录：分享文本，核对选定账号。 | 待验 |
| D01-BILI-27 | 两者均登录：手动切 P，核对选定账号。 | 阶段原生 E-BI-02：phone local-cli的P2身份已收到；phoneP2画面 / 听感及切回P1待验 |
| D01-BILI-28 | 两者均登录：PGC ep，核对选定账号。 | 待验 |
| D01-BILI-29 | 两者均登录：PGC ss，核对选定账号。 | 待验 |
| D01-BILI-30 | 两者均未登录：带 ?p 短链及限制说明。 | 待验 |
| D01-BILI-31 | 两者均未登录：分享文本及限制说明。 | 待验 |
| D01-BILI-32 | 两者均未登录：手动切 P 及限制说明。 | 待验 |
| D01-BILI-33 | 两者均未登录：PGC ep 及限制说明。 | 待验 |
| D01-BILI-34 | 两者均未登录：PGC ss 及限制说明。 | 待验 |
| D01-BILI-35 | CLI-only：带 ?p 短链，不静默 fallback。 | 待验 |
| D01-BILI-36 | CLI-only：分享文本，不静默 fallback。 | 待验 |
| D01-BILI-37 | CLI-only：手动切 P，不静默 fallback。 | 待验 |
| D01-BILI-38 | CLI-only：PGC ep，不静默 fallback。 | 待验 |
| D01-BILI-39 | CLI-only：PGC ss，不静默 fallback。 | 待验 |
| D01-CAPS-01 | iOS 桥显式声明横 / 竖屏能力，实际尺寸而非交换宽高放行。 | 待验 |
| D01-CAPS-02 | 竖屏 720×1280 与 1080×1920 不被横屏高度规则误滤。 | 待验 |
| D01-CAPS-03 | AVC / HEVC profile / level / fps 由实际能力预检。 | 待验 |
| D01-CAPS-04 | isHdr / hdrType / videoCodecid 元数据完整贯穿。 | 实现 / 回归（仅所列测试范围）：R-SR-09；原生与其余分支待验 |
| D01-CAPS-05 | 不支持或未知能力在替换前拒绝，保留原片 / 档位。 | 待验 |
| D01-CAPS-06 | 保守 SDR 策略，不因有轨道 / 字段就宣称 HDR 可用。 | 实现 / 回归（仅所列测试范围）：R-SR-09；原生与其余分支待验 |
| D01-CAPS-07 | 手动 HDR 真机亮度 / 色彩 / 音频。 | 待物理设备专项 |
| D01-CAPS-08 | Dolby 真机亮度 / 色彩 / 音频。 | 待物理设备专项 |

### 01 P1-02 / P1-03 / P1-04：方向、媒体库、恢复、聚合来源

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D01-DISPLAY-01 | VLCKit 真实宽高进入业务层，不由封面推断。 | 待验；详见 D03-DISPLAY |
| D01-DISPLAY-02 | 音频无视频、尺寸延迟及连续横竖换源方向正确。 | 待验 |
| D01-DISPLAY-03 | iPhone / iPad 系统旋转锁下退出仍保位置 / 暂停。 | 待验 |
| D01-LIB-01 | 新目录 / 媒体库影片保存 sourceMountId。 | NAS 协议 + 原生范围：59 / 60 / 66 / 67 保存当前账号 mount5，实际画面 E-WA-01 / 02 / 06；`directorySources.test.mjs` 四类 roots / browse / partial retry 和 `iosAlignment.test.mjs` season pages 的 mountId 用例通过。 |
| D01-LIB-02 | 同服务器不同挂载不按 serverUrl 混淆。 | 实现 / 回归：`mediaLibrary.ts` / `directorySources.ts` 按 mountId、path 路由，不靠 serverUrl 猜；`sourceInteraction.test.mjs` 初选 / 切挂载用例通过。NAS 当前只有一个 Jellyfin 挂载，真实同 host 多挂载未验。 |
| D01-LIB-03 | Emby 条目 / 季 / 集、真实 MediaSourceId / 版本解析。 | 实现 / 回归：`mediaRepair.test.mjs`「emby single episode and whole season add under the actual RN AbortController」、`libraryPlayback.test.mjs` Emby 切集 / 版本身份通过。外部素材边界：当前账号 Emby mounts 200 空列表，原生未验。 |
| D01-LIB-04 | Jellyfin 条目 / 季 / 集、真实 MediaSourceId / 版本解析。 | 实现 / 回归（仅所列测试范围）：R-IA-04；NAS + 原生：当前账号浏览层级、resolve 和 sourceMountId 已执行；59 / 60 / 66 / 67 画面 E-WA-01 / 02 / 06。`iosAlignment.test.mjs`「library season pages use sorted real item IDs and do not reinterpret them as Bili cids」通过；实测候选均单版本，真实多版本切换未验。 |
| D01-LIB-05 | Emby HLS stream / proxy 保留 resource、movieId / ms / ep。 | 实现 / 回归：`MovieSourceSettings.tsx` 使用既有 movie-source / stream 的 movieId、ms、ep，`media.ts` 不删除 resource；`iosAlignment.test.mjs`「library room playback substitutes authoritative stream identity, switches versions, and null retires delayed states」通过。当前账号无 Emby 原生素材。 |
| D01-LIB-06 | Jellyfin HLS stream / proxy 保留 resource、movieId / ms / ep。 | 实现 / 回归：同上保留 Jellyfin 路由身份；`libraryPlayback.test.mjs` Jellyfin early episode state 用例通过。60 HLS 已原生起播 E-WA-02；不据此宣称每个 resource / 版本分支均现场经过。 |
| D01-LIB-07 | HLS 子清单 / KEY / MAP / 分片均沿正确前缀和当前鉴权。 | 待验 |
| D01-LIB-08 | MP4 Range / 206 正确，不固定覆盖 VLC Range。 | NAS协议E-SR-01 / S03：59首 / 中 / 尾 / 开放 / 大于8MiB / 越界六类Range通过，HEAD200 video/mp4；实际双端起播E-WA-01。不将HTTP字节合同当全部VLC seek通过。 |
| D01-LIB-09 | HLS seek 0 / 中段 / 末尾以及版本切换。 | 原生失败 E-WA-02；修订后精准 seek / 版本切换待复核 |
| D01-LIB-10 | 跨账号观众与反向代理路径前缀。 | 部分原生：59 / 67 不同账号观众有画面（E-WA-01 / 06）。路径前缀为实现 / 回归：`handoffPlayback.test.mjs`「saved Kazumi proxy uses current entry point and never retains the adding user token」及 `media.test.mjs` prefix 用例；真实反代前缀 NAS 环境未验。 |
| D01-LIB-11 | token 过期 401 单飞刷新并更新子请求。 | 实现 / 回归（仅所列测试范围）：R-SC-08 / R-SC-13 / R-SF-02；E-WA-05 前台自然过期恢复；子资源刷新 / 单飞完整矩阵待验 |
| D01-LIB-12 | 准入 403 有界重新准入，不无限 refresh / 注销。 | 实现 / 回归（仅所列测试范围）：R-SF-02；原生与其余分支待验 |
| D01-LIB-13 | `io server disconnect` 有界恢复 / 刷新 / 重新准入。 | 待验 |
| D01-LIB-14 | 退出 / 切账号 / 切服中旧响应与旧清单不复活 token。 | 实现 / 回归（仅所列测试范围）：R-SC-10；原生与其余分支待验 |
| D01-LIB-15 | FTP 挂载 resolve / stream 路径验证。 | 实现 / 回归：`directorySources.test.mjs`「ftp roots, browse and partial batch retry retain real mount and file identity」通过；使用 /api/ftp/resolve 与持久挂载 path / sourceMountId。当前未取实际 FTP 媒体做 NAS / 原生播放。 |
| D01-LIB-16 | 直接 FTP 票据与用户绑定，不共用房主短票作永久全房 URL。 | 本轮入口不适用：SourcePicker 仅选择已配置 FTP 挂载；没有直接 ftp:// 凭据 / 短票输入入口，也未把该票据保存成全房 URL。不能宣称服务端直接 FTP 票据流程已原生验收。 |
| D01-LIB-17 | 凭据不被旧 NAS Cookie 覆盖，REST / Socket 身份一致。 | 实现 / 回归（仅所列测试范围）：R-SC-02；阶段原生：第 9 轮 iPad 修复；最终场景由主任务补证 |
| D01-AGG-01 | CMS 列表 / 搜索可用，非仅来源名称。 | NAS 协议：28 CMS 来源实际枚举并各搜索一轮；62 来源 search / detail / playGroups 成功。E-SR-02 的 HTTP 前段均未确认媒体，CMS 起播未通过。 |
| D01-AGG-02 | CMS 播放组 / 实际集身份 / 批量添加。 | 实现 / 回归（仅所列测试范围）：R-SR-06；实现 / 回归 + NAS：62 保存真实 vodId / playFromIndex / episodeIndex；`sourceRoutingRegression.test.mjs`「CMS batches retain failed selections and continue through later episodes with actual playback identities」及取消用例通过。设备批量操作待第 10 轮。 |
| D01-AGG-03 | CMS 保存逻辑元数据，另一端可重新解析。 | 实现 / 回归（仅所列测试范围）：R-SR-08；NAS 协议：62 为 cms:// 逻辑身份和 sourceMeta，生产 resolveAggregateSource 可用当前账号重解析；`sourceRoutingRegression.test.mjs` metadata 校验通过。上游 HTML 阻塞 E-SR-02，另一端 CMS 正向播放未通过。 |
| D01-AGG-04 | ani-subs 显式 playsvideoEnabled=false 贯穿。 | 实现 / 回归（仅所列测试范围）：R-HO-01；NAS 协议：63 POST / GET 明确 playsvideoEnabled=false；`handoffPlayback.test.mjs` 六序列 false 保留通过。实际 AniSubs 媒体正向起播受 E-SR-02 阻塞。 |
| D01-AGG-05 | Kazumi 新记录优先逻辑元数据重解析。 | 实现 / 回归（仅所列测试范围）：R-SR-02；实现 / 回归 + 原生：61 metadata 当前重解析为 MP4，Range 206 / video/mp4 / ftyp，与 E-WA-03 画面一致；`sourceRoutingRegression.test.mjs`「metadata-based Kazumi resolution fails explicitly instead of playing an older signed URL」通过。 |
| D01-AGG-06 | Kazumi 旧 sourceId + episode 记录可重解析。 | 实现 / 回归（仅所列测试范围）：R-SR-05；实现 / 回归：validSourceMeta 接受旧 sourceId + episode 结构，`animeBatch.test.mjs`「kazumi batch retains episode identity and retries only failed additions」及 `mediaRepair.test.mjs` Kazumi resolve/add 通过。未专门导入旧库记录做原生重入。 |
| D01-AGG-07 | Kazumi 旧 HTTP 代理仅有限回退，kazumi:// 不进入媒体。 | 实现 / 回归（仅所列测试范围）：R-HO-04；实现 / 回归：aggregatePlayback 仅旧无 metadata 的 HTTP / 已知代理回退；metadata 失败直接报错。`sourceRoutingRegression.test.mjs` 旧 Kazumi 两影片隔离、metadata 失败用例通过；设备旧记录专项未验。 |
| D01-AGG-08 | Referer / UA / Origin / 源站 Cookie 语义保留。 | 实现 / 回归（仅所列测试范围）：R-SR-05；实现 / 回归：`animeBatch.test.mjs`「resolved video and audio preserve signed URLs and required proxy headers」通过；直连只能转 Referer / UA，Origin / Cookie 要求显式服务器中转，不静默丢弃。真实多站点防盗链矩阵未验。 |
| D01-AGG-09 | 剥离添加者服务端 token / 私有回环地址。 | 实现 / 回归（仅所列测试范围）：R-HO-04 / R-SR-03；实现 / 回归：`sourceRoutingRegression.test.mjs` 添加账号 token / entry host 清理及旧音轨重绑定用例通过；`canonicalSelection` / `media` 拒绝外国回环。真实不同私网入口互换未验。 |
| D01-AGG-10 | 相对 API 绑定接收端当前服务器和前缀。 | 实现 / 回归（仅所列测试范围）：R-HO-04 / R-SR-05；实现 / 回归：`handoffPlayback.test.mjs` saved Kazumi current-entry 用例通过，代理改绑当前服务器 + prefix；两端已见 61 画面，但当前 NAS 未使用反代路径前缀。 |
| D01-AGG-11 | 聚合解析失败可见、取消后旧结果不入片单 / 不起播。 | 实现 / 回归（仅所列测试范围）：R-SR-02 / R-SR-07；实现 / 回归：Anime / CMS 错误可见，来源入口网络失败可重试；`sourceInteraction.test.mjs` source loading、cancel waits、episode picker cancellation 与 `animeBatch.test.mjs` RN cancellation during resolution 通过。已发出添加等确认、成功项保留；第 10 轮设备取消仍待验。 |
| D01-AGG-12 | CMS 原生解析后实际媒体起播，失败不被心跳隐藏 / 自动循环。 | 原生失败 E-WA-04；门控修订 17 回归通过，原生待复核 |
| D01-AGG-13 | Kazumi 当前实际返回格式与双端媒体画面一致。 | 原生已验 MP4：E-WA-03；不关闭 HLS 项 |

### 01 P1-05 / P1-06：语音、权限、UI 与本轮范围

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D01-VOICE-01 | SDK connect / reconnected 之后仍按活动 publisher / subscriber PC / ICE 判断媒体。 | 实现 / 回归：E-VO-02；异常原生待验 |
| D01-VOICE-02 | 10 秒媒体失败 / unknown / 授权等待 / 替换 PC 清理。 | 实现 / 回归：E-VO-02；逐项见 D03-VOICE |
| D01-VOICE-03 | 无写死 UDP / TCP / TURN 端口或手动协议开关。 | 实现 / 回归；最终 diff 待核 |
| D01-VOICE-04 | 后台闭麦 / 回前台重新加入与用户预期明确记录。 | 待物理设备及用户确认 |
| D01-VOICE-05 | VLC 出声与房间语音并用。 | 待物理设备听音 |
| D01-VOICE-06 | 扬声器 / 蓝牙 / 有线路由切换。 | 待物理设备专项 |
| D01-VOICE-07 | 系统来电、锁屏、权限撤销、断网恢复。 | 待物理设备专项 |
| D01-UI-01 | 选集列表 / 网格、完整名称在所有实际入口一致。 | 源码实现 + 局部组件回归 E-SR-04：实际挂载 AnimePicker / CmsPicker / MediaLibraryPicker / DirectoryPicker / EpisodePicker 共用偏好；各入口实际长名、布局和持久化仍逐项待原生，见 D03-BROWSE。 |
| D01-UI-02 | 普通 owner 可按服务端合同管理自己的片单。 | 实现 / 回归（仅所列测试范围）：R-IA-05；原生与其余分支待验 |
| D01-UI-03 | owner 权限不扩大为 REST 管理员。 | 实现 / 回归（仅所列测试范围）：R-IA-05；原生与其余分支待验 |
| D01-UI-04 | 运行时胶囊完整交互和权限，非仅外观。 | 待验；详见 D03-CARD |
| D01-CAST-01 | 投屏接收刷新 / 暂停本机 / 聊天 / 全屏 / 旋转。 | 原生已验：E-CA-01 / 02；边界见 D03-CAST |
| D01-CAST-02 | iOS ReplayKit 发送 / 授权 / 系统声 / 麦克风 / 后台。 | 本轮排除：用户明确只收口接收端 |
| D01-SYSTEM-01 | Now Playing / Background Audio 与独立原生房间业务分开声明。 | owner / revision / kind、装饰后台释放与销毁修复有实现及实际Swift回归；第15包E-MU-11主音频Home / Lock跨曲、同PID恢复及装饰失败surface清除回退已验。NowPlaying卡仍未显示、初始零点偏移 / 旧非零恢复与装饰实际播放失败保留；没有独立原生房间Socket，物理设备待验。 |

### 01 §6：Mac 原生来源门禁

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D01-NATIVE-01 | 保留旧 referenceCommit 对象，核对 HEAD 与工作树。 | 仓库核对：HEAD / 新baseline均a869088a6e7dd9fc56e5cf4a9e8070a877adb923；旧baseline的02f62f1fc52f0c47f2a2f8e6fec8ed22d98539fc由git cat-file确认为commit对象；工作树变更尚未提交。 |
| D01-NATIVE-02 | 审阅 mobile_input.go 短链 P 及 iOS 显式 page 优先级。 | 待主任务补逐文件审阅 |
| D01-NATIVE-03 | 审阅 quality.go 竖屏 / fnval / 当前 P。 | 待主任务补逐文件审阅 |
| D01-NATIVE-04 | 审阅 pgc.go ForceDash / PreferMp4 与会员音画。 | 待主任务补逐文件审阅 |
| D01-NATIVE-05 | 审阅 resolver.go HDR / 4K / 8K / AV1 位与设备能力边界。 | 待主任务补逐文件审阅 |
| D01-NATIVE-06 | Go fnval / portrait / ugc 请求测试与网络失败分开记录。 | 待主任务补命令 / 工具链 / 结果 |
| D01-NATIVE-07 | `go test ./core ./mobile` 运行在实际锁定工具链。 | 主任务本轮记录：Go1.27.1执行`go test ./core ./mobile`通过（开发状态记录）；与NAS网络解析结果、Simulator UI和343项JS测试分开。 |
| D01-NATIVE-08 | gomobile Objective-C API 与 page / codec / capabilities 参数匹配。 | 待验 |
| D01-NATIVE-09 | baseline 引用真实含已审内容的提交，按原清单 LF 归一化重算 12 摘要。 | baseline指向真实a869088a提交，source=native/bilicore，normalizedLineEndings=LF；本轮独立verify-only确认原12项SHA256一致E-BUILD-01。逐文件行为审查仍按D01-NATIVE-02–05单列，不因摘要通过而替代。 |
| D01-NATIVE-10 | `stage-native-core.cjs --verify-only` 通过，未删除 / 绕过门禁。 | 本轮审计实际执行通过：`node scripts/stage-native-core.cjs --verify-only`输出12 shared Go source files verified at a869088a，exit0；未删除门禁。此命令单独执行，不冒充npm check内含。 |
| D01-NATIVE-11 | 实际 staging 后 Simulator Bilicore / Opus slice 正确。 | Simulator arm64 Bilicore / Opus、WBI与50帧Opus编解码阶段通过，已用于16轮Debug；device ARM64 Release及平台检查另见E-BUILD-02 / 03。device27完成后Simulator Vendor / Pods已恢复核对；不作真机解码验收。 |
| D01-NATIVE-12 | 插件 patch → prebuild → Pods → 当前 Xcode workspace 可重现。 | E-BUILD-01 / 02 / 03：持久plugins / modules、prebuild、Pods与workspace完成16次Simulator Debug、2次device ARM64 Release；check20的409项通过。没有全新Mac冷缓存证据；26用户真机报告限定保留，27真机仍待验。 |
| D01-NATIVE-13 | baseline goVersion 与脚本下载版本 / 摘要校验一致说明。 | baseline goVersion=1.27.1、moduleGoVersion=1.26.8；prepare-native-ios(-simulator).sh默认固定版本并校验摘要；本机显式ZVIEWER_USE_SYSTEM_GO=1且精确匹配Go1.27.1。device helper的同等显式opt-in已实际执行成功E-BUILD-02，不绕开默认下载 / 摘要或版本门控。 |
| D01-NATIVE-14 | 设备库与 Simulator arm64 分开准备，禁止混用 IPA。 | 构建 / 包检查见E-BUILD-03：device arm64 / IOS2与Simulator切片分开；27包无profile / 未签名、Hermes存在，打包后已恢复Simulator Vendor与Pods。用户自签27与设备功能待验。 |

### 01 §7–9：执行合同、分阶段验收与交付

§7 每行映射到下文 D03 对应细项：连接登录 → D03-CONNECT；大厅建房 → D03-LOBBY；一起看布局 → D03-ROOM；播放栏 → D03-BAR / CONTROL；添加影片 → D03-ADD；已添加影片设置 / 胶囊 → D03-CARD；来源差异 → D03-ADD / D01-POLICY；浏览选集 → D03-BROWSE；房间设置 → D03-PERM；字幕弹幕 → D03-SET / CHAT；语音 → D03-VOICE；一起听 → D03-MUSIC；投屏接收 → D03-CAST。该映射不将重复要求自动标为通过。

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D01-DELIVER-01 | `npm run check` 当前最终树通过，记录命令 / 数量 / 失败原因。 | E-BUILD-01：完整check20补丁检查、lint、TypeScript、409 / 409项通过；后仅buildNumber元数据26→27。独立专项不相加，Debug16限定UI / TLS见E-UI-05 / E-CO-01，15包音乐正向与失败保留，不关闭609项待验。 |
| D01-DELIVER-02 | 共享协议有改时根 `test:adaptation`。 | 待主任务确认适用性 / 结果 |
| D01-DELIVER-03 | 共享媒体有改时根 `test:media`。 | 待主任务确认适用性 / 结果 |
| D01-DELIVER-04 | 原生 Go 有改时 core / mobile 测试。 | D01-NATIVE-07为本轮Go1.27.1实际通过记录；Go测试不替代NAS解析与原生解码。 |
| D01-DELIVER-05 | Expo Go / Web 尺寸检查与原生 Debug 结果分开记录。 | 16次Simulator Debug主要验收，phone16 UI / TLS与既有实际媒体证据分记；2次device ARM64 Release只证明包检查。26用户真机一起听及原生音乐控件报告E-BUILD-02单列，27仍待验，不以Expo Go / Web冒充。 |
| D01-DELIVER-06 | MP4 冷起播 → 暂停 → seek 0。 | E-WA-01 起播已验；暂停 / seek 0 待最终原生 |
| D01-DELIVER-07 | MP4 seek 中段 → 末尾 → 恢复。 | 待最终原生回归 |
| D01-DELIVER-08 | MP4 离房重入无旧事件回跳。 | 待验 |
| D01-DELIVER-09 | DASH 普通视频 → 分 P → 画质 → 回前台，无无声 / 双音轨。 | 待验 |
| D01-DELIVER-10 | 普通 owner / 观众 / 房管、token 过期、被踢矩阵。 | 待验 |
| D01-DELIVER-11 | 01 阶段 B 其余媒体 / 策略 / 同步用例逐项记录，不能以此汇总行代替。 | 按 D01-SOURCE / MUSIC / POLICY / BILI / LIB 各行补证 |
| D01-DELIVER-12 | iPhone / iPad、横竖 / 窄宽、深浅 / 字体 / 键盘 / 安全区逐维。 | 待验；详见 D03-DIM |
| D01-DELIVER-13 | 真机硬解 / HDR / 路由 / 蓝牙 / 来电 / 后台 / 系统回收。 | 待物理设备专项 |
| D01-DELIVER-14 | 新实际安装包与用户确认；旧 IPA / 鸿蒙图不计当前证据。 | 第26 / 27未签名IPA分别交付，版本 / 大小 / 摘要 / 离线Hermes / device平台已核对E-BUILD-02 / 03。26用户报告真机一起听及原生音乐控件正常，型号 / OS / 时长未给；27真机待用户验证，不使用26代验新功能。 |
| D01-DELIVER-15 | 构建版本维护文档与可追溯本地提交由主任务收口。 | 待最终文档 / 提交记录；本子任务不提交 |
| D01-DELIVER-16 | 共享修改实际影响 Android / HarmonyOS 时同步两份维护文档。 | 待主任务判定适用性 |
| D01-DELIVER-17 | 无用户指示不发布 / 启动 EAS / 设备 IPA。 | 按用户新明确指示构建并定向交付本轮未签名device IPA E-BUILD-02 / 03；未启动EAS，也未作新的公开Release / AppStore / TestFlight发布。此前未获指示不打包的历史边界不改写。 |
| D01-DELIVER-18 | 发布材料排除凭据、私钥、签名、敏感日志及 AGENTS。 | 本轮IPA的native / debug / secrets检查通过E-BUILD-02 / 03，未签名且无profile。全部发布材料 / AGENTS及历史仓库范围仍须按实际发布边界最终核对，不扩大为任意材料绝无秘密。 |
| D01-DELIVER-19 | Release 说明按项目规定结构，实际发布另获指示。 | 本轮仅按用户指示定向交付未签名IPA E-BUILD-02 / 03，未作新的公开Release / AppStore / TestFlight发布；正式发布说明结构待实际发布时验。 |
| D01-DELIVER-20 | §9 原交接只读 / 未构建 / 未 NAS 的历史边界保留，不改写为本轮测试。 | 文档约束；新证据另记 |

## 03：界面、操作逻辑与所有显示状态

### 03 §1 / §2.1：实施边界、连接、账号和大厅

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D03-PRINCIPLE-01 | 按 28 张真实鸿蒙参考校准层次 / 入口 / 顺序，保留 RN 原生实现。 | 待最终逐图核对 |
| D03-PRINCIPLE-02 | 截图、Web fixture、API 和原生解码 / 听音各自标证据范围。 | 本表采用；最终材料待核 |
| D03-PRINCIPLE-03 | 只在独立测试房验证，不修改日常片单。 | 本领域遵守；主任务补全局记录 |
| D03-CONNECT-01 | 标题长状态不挤占标题，图标与无障碍状态可读。 | 待验 |
| D03-CONNECT-02 | HTTPS 优先检测，协议选择与完整地址可修改。 | 待验 |
| D03-CONNECT-03 | 地址端口与反代路径前缀保留。 | 实现 / 回归（仅所列测试范围）：R-SC-07 / R-IA-14；原生与其余分支待验 |
| D03-CONNECT-04 | 证书例外仅当前服务器，范围清楚，可撤销并断开。 | 实现 / 回归且原生合成已验E-CO-01：默认关、逐规范HTTPS origin偏好、临时capability只映射当前NAS；撤销同时断开Session并关闭活动HTTP / WS，旧通道拒绝。serverConnection / serverConnectionUi / sessionCookieIsolation实际组件回归；物理设备和真实媒体待验。 |
| D03-CONNECT-05 | 独立语音服务仍验证证书，未全局关 TLS。 | Debug16合成原生已验E-CO-01：独立voice、foreign host / port和redirect到它们仍严格拒绝，未全局关TLS / ATS；媒体映射回归保留逻辑身份。真实独立语音服务握手及物理设备另验。 |
| D03-CONNECT-06 | 账号 / 游客分明，游客不被当普通 owner。 | 待验 |
| D03-CONNECT-07 | 用户名 / 密码 / 显示密码正常，失败保留可改输入。 | 待验 |
| D03-CONNECT-08 | 按检测 / 选择 / 登录 / 连接阶段显示按钮与 busy。 | 待验 |
| D03-CONNECT-09 | 重复提交不产生并行会话。 | 实现 / 回归（仅所列测试范围）：R-SC-06；原生与其余分支待验 |
| D03-CONNECT-10 | 切服清旧 token、成员、媒体、代理身份与迟到任务。 | 实现 / 回归（仅所列测试范围）：R-SC-01 / R-SC-11；原生与其余分支待验 |
| D03-LOBBY-01 | 房间获取中 / 空列表 / 获取失败独立。 | 待验 |
| D03-LOBBY-02 | 更换服务器 / 刷新 / 创建入口可达。 | 待验 |
| D03-LOBBY-03 | 创建权限不足有说明。 | 待验 |
| D03-LOBBY-04 | 建房模式同排等宽，顺序一起看 → 投屏 → 一起听。 | 待验 |
| D03-LOBBY-05 | 名称 / 可选密码 / 人数 / 审批分组，人数 1–100。 | 待验 |
| D03-LOBBY-06 | 创建遮罩覆盖悬浮入口，不穿透。 | 待验 |
| D03-LOBBY-07 | 关于在外观上方，返回 / 取消不误建房。 | 待验 |
| D03-LOBBY-08 | 创建超时提示刷新确认，不立即自动重建。 | 待验 |
| D03-LOBBY-09 | 实际创建成功后仍等待 register-host 确认角色。 | 待验 |

### 03 §2.2–2.5：公共骨架、权限、权威数据链与准入

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D03-ROOM-01 | 顶栏顺序离房 / 房名角色模式 / 方向 / 语音 / 设置。 | 待验 |
| D03-ROOM-02 | 方向与语音仅准入 ready 后出现。 | 待验 |
| D03-ROOM-03 | 仅分享端可在设置切模式；断线 / 切换中禁连点。 | 实现 / 回归（仅所列测试范围）：R-RS-01；原生与其余分支待验 |
| D03-ROOM-04 | 手机一起看播放器上、聊天 / 片单下。 | 待验 |
| D03-ROOM-05 | 宽屏聊天 / 片单在右，视频在剩余区域居中。 | 待验 |
| D03-ROOM-06 | 布局变化不复制或重建媒体 / 语音。 | 待验 |
| D03-ROOM-07 | 投屏仅接收画布与简化聊天，不出现普通片单。 | 阶段原生：E-CA-01 / 02；最终截图待验 |
| D03-ROOM-08 | 一起听接管主区，保留公共顶栏 / 设置。 | 阶段原生：E-MU-02；当前真实歌曲待验 |
| D03-ROOM-09 | 断网显示重连；恢复失败有原因和手动重试。 | 待验 |
| D03-ROOM-10 | 媒体失败不继续以绿色信令已连接误导。 | 待验 |
| D03-PERM-01 | 房间弹层模式置顶，外观 / 本机 B站并列带边框，窄屏换行。 | 阶段目视08及当前源码分组；修后phone实际TextSize6→3→6房间页无裁切，iPad所列区域可达E-UI-02。全部角色 / 窄屏换行与其余页面像素仍待验。 |
| D03-PERM-02 | 房态 / 名称 / 号复制分享 / 在线成员 / 设置 / 审批 / 离房层次。 | 阶段目视08；房间动态135.3%字号、iPad编辑草稿保留 / 取消及键盘可达E-UI-02；无重连双向转交名单E-UI-03已验。复制 / 分享与审批等实际动作仍待逐项验收。 |
| D03-PERM-03 | B站未登录中性、已登录粉色，仅状态词突出。 | 原生与其余分支待验 |
| D03-PERM-04 | 片单 / 音乐队列权限来自服务器矩阵和确认角色，不只 host 参数。 | 实现 / 回归（仅所列测试范围）：R-MU-09；实现 / 回归；原生角色矩阵待验 |
| D03-PERM-05 | 转交 ACK 后旧房主失入口、新房主得入口。 | 原生已验E-UI-03：iPad1→phone3→iPad1无重连连续转交，管理 / 模式入口随权威角色更新；具体对象确认与原房主重入观众集合正确。仅本次两账户，不扩展其他权限或失败分支。 |
| D03-PERM-06 | 任命 / 撤销房管经服务端确认。 | 待验 |
| D03-PERM-07 | 房管不能管房主 / 同级房管 / 更高管理员。 | 待验 |
| D03-PERM-08 | 片级策略仅当前分享端且 root / 持久 owner。 | 待验 |
| D03-PERM-09 | 播放申请自动批准、入房审批、自动连播为三个独立策略。 | 实现 / 回归（仅所列测试范围）：R-RS-05；原生与其余分支待验 |
| D03-PERM-10 | 待批用户在批准前不得获得可播放媒体。 | 原生与其余分支待验 |
| D03-PERM-11 | 房间快照不覆盖正在编辑的设置草稿。 | 实现 / 回归（仅所列测试范围）：R-RS-02；原生与其余分支待验 |
| D03-PERM-12 | 离房先释放本机，再退出；不等同永久删除房间。 | 待验 |
| D03-DATA-01 | 服务器 / 身份由当前认证与有界 refresh 权威确认。 | 实现 / 回归（仅所列测试范围）：R-SC-03；原生与其余分支待验 |
| D03-DATA-02 | isHost 由准入 / 转交确认，不永久相信创建参数。 | 源码applyRoom / host-transferred更新hostRef与host；原生E-UI-03两账户无重连往返，入口随角色变更，未永久固定创建参数。其他准入 / 断线分支不由此关闭。 |
| D03-DATA-03 | 持久 owner 与当前分享端分开建模。 | 待验 |
| D03-DATA-04 | 当前影片 / 片单由 ACK / current-movie 确认，不先乐观全房切片。 | 实现 / 回归（仅所列测试范围）：R-HO-02 / R-IA-04；原生与其余分支待验 |
| D03-DATA-05 | 逻辑源与本机 URL / token / 代理端口分开。 | 实现 / 回归R-HO-04 / R-MU-01及mediaConnectionTransport：logical DTO / identity保留，实际REST / Socket / Image / VLC main、slave、subtitle / FLV / HLS映射仅当前NAS临时通道；E-CO-01原生传输限定通过，真实媒体 / 跨端DTO仍待验。 |
| D03-DATA-06 | 显示偏好 / 系统音量仅本机，不由房主广播。 | 待验 |
| D03-DATA-07 | 跨页面操作有校验 → busy → 请求 → 会话核对 → 确认 → 应用。 | 实现 / 回归（仅所列测试范围）：R-ST-05；原生与其余分支待验 |
| D03-DATA-08 | busy 有超时 / 取消，错误可见不只日志。 | 实现 / 回归（仅所列测试范围）：R-SC-12 / R-PS-07；来源范围实现 / 回归：API 请求有 15 秒 deadline；SourcePicker 网络失败可见重试，解析 / 批量可停止，已发出写入等确认不回滚；`sourceInteraction.test.mjs` source loading / cancel waits 用例通过。其他业务 busy 见各节，来源第 10 轮原生待验。 |
| D03-STATE-01 | 无会话只显示连接页，不挂媒体。 | 待验 |
| D03-STATE-02 | 恢复中不并发登录 / 不复用旧房播放器。 | 实现 / 回归（仅所列测试范围）：R-SC-05；原生与其余分支待验 |
| D03-STATE-03 | connecting / joining 可返回，超时可重试，准入前不播放。 | 待验 |
| D03-STATE-04 | password 错误留当前流程，断线不提交。 | 待验 |
| D03-STATE-05 | waiting 真实等待，不启动视频 / 语音。 | 待验 |
| D03-STATE-06 | ready 初始快照早于片单仍可消费。 | 待验 |
| D03-STATE-07 | 无影片显示黑画布 / 引导，不造假源 / 无限刷新。 | 待验 |
| D03-STATE-08 | 解析中可见 / 防重 / 可取消，按策略保留旧成功媒体。 | 来源选择范围实现 / 回归：Anime / CMS / Bili / Library / Directory 有可见 busy、提交锁与取消；`animeBatch.test.mjs` RN cancellation during resolution、`sourceInteraction.test.mjs` cancel waits / episode picker cancellation 通过。播放器旧成功媒体策略由播放专项验收，不由添加测试代验。 |
| D03-STATE-09 | 解析 / 应用失败有原因 / 重试，失败管线无旧声音。 | 音乐JS有界失败回归E-MU-07 / R-MU-22–25保留。15包装饰失败即释放surface、不留灰色残影、保留错误并继续主audio，相关7项组件回归及原生回退已验E-MU-11。旧非零恢复、15初始零点偏移与装饰实际播放失败保留；听感及其他管线仍待验。 |
| D03-STATE-10 | 准入失效撤媒体，有界重试，403 不无限 refresh。 | 实现 / 回归（仅所列测试范围）：R-ST-01；原生与其余分支待验 |
| D03-STATE-11 | 被踢 / 关房为终态，迟到批准 / reconnect 不复活。 | 待验 |

### 03 §2.6：聊天、弹幕和成员，逐项证据

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D03-CHAT-01 | 一起看评论区 / 弹幕轨道 / 实时弹幕为三个入口。 | 实现 / 回归；原生已见后两者 E-DM-01 / 02，普通评论路径待验 |
| D03-CHAT-02 | 评论是房间消息，不误作歌曲评论或弹幕列表。 | 待原生验 |
| D03-CHAT-03 | 实时弹幕显示影片时间与 sender，含合法 0 秒。 | E-DM-01 原生 0:32；0 秒实现 / 回归 E-DM-03 |
| D03-CHAT-04 | 轨道显示来源 / 标签 / 条数，导入轨道实际渲染。 | 原生已验：E-DM-02；全部标签样式待验 |
| D03-CHAT-05 | 投屏使用简化评论，不出现有效视频外的弹幕发送。 | 阶段原生：E-CA-01 / 02；评论发送待验 |
| D03-CHAT-06 | 音乐房间聊天不出现弹幕发送；歌曲评论另属当前歌。 | E-UI-05 phone16一起听实际右侧房间评论发送及close / reopen保留，无弹幕发送入口；歌曲评论独立，快速切歌 / 跨房 / 拒绝原生仍待验。 |
| D03-CHAT-07 | 发送 busy 禁重复，成功清输入。 | E-DM-01 有单条成功 ACK；原生防连点 / 清输入待验 |
| D03-CHAT-08 | 发送失败保留输入并提示 / 可重试。 | 待原生拒绝 / 超时验收 |
| D03-CHAT-09 | 历史与广播按 ID 合并去重，meta sender / time 不被简略广播抹掉。 | E-DM-01 协议 + E-DM-03 回归 |
| D03-CHAT-10 | 历史加载不将旧实时弹幕重新滚过视频。 | 实现 / 回归：E-DM-03；原生重入待验 |
| D03-CHAT-11 | meta / tracks 广播先到时，迟到初始 GET 不覆盖新状态。 | 实现 / 回归：E-DM-03 |
| D03-CHAT-12 | roomId 不匹配广播忽略，切房即时清前房数据。 | 实现 / 回归E-DM-03 / 05：room及media元组隔离，切片旧GET / 写队列 / clear不可写回新源；23专项通过。当前NAS专用房播放返回影片不存在，新增自动弹幕 / 防串片原生待验。 |
| D03-CHAT-13 | 离房取消 GET / 监听，退役回调不能写新房。 | 实现 / 回归E-DM-03 / 05：离房取消读 / 监听，旧ticket未提交写拒绝、已提交写等待ACK并在新源clear前完成。23项实际hook / 组件竞态通过，真实NAS切源闭环待验。 |
| D03-CHAT-14 | 轨道初始 time 0 与 seek 回 0 正确显示。 | 实现 / 回归：E-DM-03；原生待验 |
| D03-CHAT-15 | 服务器关键词 / deletedLog 立即屏蔽，暂停时也不残留。 | 实现 / 回归：E-DM-03；原生待验 |
| D03-CHAT-16 | B站 / 弹弹play / 巴哈姆特 mode 按来源规范化，不把固定当滚动。 | E-DM-03 回归、E-DM-04 API；各模式原生待验 |
| D03-CHAT-17 | 轨道隐藏保留来源元数据并经服务器确认。 | 实现 / 回归E-DM-05：迟到自动GET保留当前已确认hidden / offset，删除default同media不自动复活；23专项通过。NAS拒绝 / 原生轨道管理仍待验。 |
| D03-CHAT-18 | 偏移独立接口保存，只改 offset；负偏移 / 0 合法。 | 实现 / 回归；原生待验 |
| D03-CHAT-19 | 删除轨道确认对象名称、等待 ACK、失败可重试。 | 待原生验 |
| D03-CHAT-20 | 普通观众不具轨道管理权，拒绝信息可见。 | 实现 / 回归E-DM-05：viewer可本地获取当前CID但不会POST / clear，server default删除不被迟到fetch复活；23专项通过。原生权限拒绝展示与真实换片仍待验。 |
| D03-CHAT-21 | 在线人数 / 成员由服务端事件；本人 / 分享端 / 房管 / 系统角色可区分。 | 待原生角色矩阵 |
| D03-CHAT-22 | 管理展开后才出现有权操作，禁止越级。 | 待原生验 |
| D03-CHAT-23 | 移出 / 禁言 / 转交 / 任命确认显示对象，失败不伪装成功。 | 转交对象确认及双向成功已验E-UI-03；移出 / 禁言 / 任命与实际拒绝仍待专用房逐项验，不能从一次转交扩展。 |
| D03-CHAT-24 | 被禁言后实际发送被拒，用户看到服务端反馈。 | 待专用房验 |
| D03-CHAT-25 | 播放 / 暂停 / seek 申请与聊天分开，房主能批准 / 拒绝。 | 实现 / 回归（仅所列测试范围）：R-RS-05；待原生申请矩阵 |
| D03-CHAT-26 | 自动批准只影响播放申请，不改变入房 / 自动连播。 | 实现 / 回归（仅所列测试范围）：R-RS-05；待原生验 |
| D03-CHAT-27 | B站视频在线搜索 → 选集 → 导入。 | E-DM-02 本次导入已显示；其余流程由主任务补操作证据 |
| D03-CHAT-28 | B站番剧在线搜索 → 选集 → 导入。 | E-DM-04 API；原生待验 |
| D03-CHAT-29 | 弹弹play 在线搜索 → 选集 → 导入。 | E-DM-04 API；原生待验 |
| D03-CHAT-30 | 巴哈姆特在线搜索 → 选集 → 导入。 | 外部阻塞：E-DM-04 上游 403；原生失败反馈待验 |

### 03 §3.1：播放栏和更多菜单

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D03-BAR-01 | 黑画布与深色圆角可读控制栏。 | 待最终目视 |
| D03-BAR-02 | 进度条呈现本机 / 缓冲 / 房主或服务器同步位置。 | 待验 |
| D03-BAR-03 | 时间用等宽数字，普通态时间在进度下、按钮上。 | 待验 |
| D03-BAR-04 | 主行顺序播放申请 / 下一部 / 弹幕 / 音量 / 设置 / 更多 / 全屏。 | 实现 / 回归：PlaybackControls按实测row宽收纳低频项，7项顺序保留；playbackControlLayout.test.mjs三项真实组件测试覆盖320–700窗口及安全区、44pt目标、space-between。phone普通竖屏7钮等间距 / 无溢出原生已验E-UI-04；320pt及安全区边界仍待原生。 |
| D03-BAR-05 | 全屏有方向锁入口；窄屏低频不堆两行大按钮。 | 实现 / 回归：实际row≥264显示音量、≥308显示设置，全屏row≥352才行内显示方向，其余可在已有More访问；44pt单行，真实组件边界 / 菜单press及AX测试通过。系统窗口方向仍按E-SR-05；phone普通竖屏单行原生已验E-UI-04，320pt / 全屏方向阈值 / 安全区边界仍待原生。 |
| D03-BAR-06 | 宽屏可展开倍速 / 同步 / 重载 / 隐藏 / 弹幕输入。 | 待验 |
| D03-BAR-07 | 更多第 1 项展开 / 收起弹幕输入，输入位于进度与按钮间。 | 实现 / 回归：More首项已恢复发送 / 收起弹幕输入，再列收纳音量 / 设置；现有3项真实组件回归新增首项顺序、展开 / 收起事件、composer显隐及菜单关闭断言通过。phone普通竖屏实际展开 / 收起、菜单关闭及紧凑栏恢复已验E-UI-04，输入仍在进度与按钮间；其他窗口 / 键盘边界仍待验。 |
| D03-BAR-08 | 六档 0.5 / 0.75 / 1 / 1.25 / 1.5 / 2，选中可读且权限正确。 | 待验 |
| D03-BAR-09 | 同步进度仅当前分享端可见。 | 待验 |
| D03-BAR-10 | 重载仅本机当前媒体，不切片 / 全房归零 / 离房。 | 待验 |
| D03-BAR-11 | 显示 / 隐藏控制栏状态可读。 | 待验 |
| D03-BAR-12 | 普通更多向下越过裁切；底部不足向上并限高滚动。 | 实现 / 几何及实际组件8项回归；phone Debug16实际竖屏按钮下方，横屏底部不足时按真实内容高贴按钮上方8pt（E-UI-05）。Modal越过父ScrollView裁切、限高滚动；iPad portrait系统窗口下方另已目视；iPad横屏 / 320pt / 全部安全区仍待原生。 |
| D03-BAR-13 | 菜单与按钮有间距、打开保持控制栏可见。 | E-UI-05 phone16竖屏下方及横屏上方8pt间距实际已验，打开保留控制栏；trigger与portal坐标转换、真实内容高度、迟到测量 / composer重排 / 键盘边界有8项回归，iPad portrait下方另已目视；iPad横屏及其余动态边界待原生。 |
| D03-BAR-14 | 外点 / 返回关闭；旋转 / 窗口 / 键盘后重新定位。 | 实现 / 回归：动作row实际onLayout宽度控制收纳与方向，不再按外层width误判；组件覆盖900外层内302窄行和动态重排。原生外点 / 返回、旋转 / 窗口 / 键盘重定位仍待验。 |

### 03 §3.2：控制、下一部与自动连播

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D03-CONTROL-01 | 分享端直接控制，在线观众申请暂停 / 继续。 | 待验 |
| D03-CONTROL-02 | 在线观众 seek 申请不先乐观改本机。 | 待验 |
| D03-CONTROL-03 | 申请 busy 防重、失败 / 超时可重试。 | 原生与其余分支待验 |
| D03-CONTROL-04 | 房主离线控制符合真实服务器合同。 | 待验 |
| D03-CONTROL-05 | 加载 / 切源期间主动暂停持久，attach 后不复声。 | 实现 / 回归（仅所列测试范围）：R-PS-02；原生与其余分支待验 |
| D03-CONTROL-06 | 下一部紧邻播放键，取完整片单不取分页。 | 实现 / 回归（仅所列测试范围）：R-IA-05；原生与其余分支待验 |
| D03-CONTROL-07 | 下一部等待 play-movie ACK / current-movie，末尾 / busy 禁用。 | 待验 |
| D03-CONTROL-08 | 下一部失败可再次操作。 | 待验 |
| D03-CONTROL-09 | 自动连播位于添加左侧，仅分享端可见、本机初始 false。 | 待验 |
| D03-CONTROL-10 | 仅自然结束触发下一部、末尾停止。 | 待验 |
| D03-CONTROL-11 | 换房 / 转交 / 模式变化取消旧连播回调。 | 待验 |
| D03-CONTROL-12 | 失败 seek 清理 busy / pending，可重试，不保留假时钟。 | 实现 / 回归（仅所列测试范围）：R-PS-05；E-WA-07 的 18 回归；原生最后修订待复核 |

### 03 §3.3–3.4：真实尺寸全屏、手势、字幕弹幕

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D03-DISPLAY-01 | 已知竖视频点击全屏保持竖屏。 | 阶段原生：旧竖屏合成图；当前树待回归 |
| D03-DISPLAY-02 | 横视频 / 尺寸未知进入横屏，不以封面决定。 | 待验 |
| D03-DISPLAY-03 | 尺寸晚到复核方向。 | 实现 / 回归（仅所列测试范围）：R-HO-06；原生与其余分支待验 |
| D03-DISPLAY-04 | 全屏内横→竖换片更新方向且核对当前会话。 | 待验 |
| D03-DISPLAY-05 | 全屏内竖→横换片更新方向。 | 待验 |
| D03-DISPLAY-06 | 未锁方向点按钮切向并锁；锁定点击解除。 | 实现 / 回归（仅所列测试范围）：R-HO-06；原生与其余分支待验 |
| D03-DISPLAY-07 | 同比例 resize 不覆盖用户解锁，比例分类变化才重判。 | 实现 / 回归（仅所列测试范围）：R-HO-06；原生与其余分支待验 |
| D03-DISPLAY-08 | 退出 / 离房 / 模式切换恢复自动方向 / 系统栏 / 安全区。 | 实现 / 回归（仅所列测试范围）：R-HO-06；原生与其余分支待验 |
| D03-DISPLAY-09 | 串行方向请求使旧 Promise 失效。 | 待验 |
| D03-DISPLAY-10 | 全屏继续同一播放器和语音，保进度 / 暂停。 | 待验 |
| D03-GESTURE-01 | 单击唤出控制，中间双击播放 / 暂停。 | 待验 |
| D03-GESTURE-02 | 全屏左右双击 ±15 秒，无权者走申请。 | 待验 |
| D03-GESTURE-03 | 按钮 / 输入 / slider 不冒泡为画面双击。 | 待验 |
| D03-GESTURE-04 | 拖动 / 长按 / 多指不误触。 | 待验 |
| D03-GESTURE-05 | 方向与重载图标不同且状态可读。 | 待验 |
| D03-SET-01 | 齿轮为字幕 / 弹幕两页，不混影片卡播放策略。 | 待验 |
| D03-SET-02 | 不重加旧音轨选择 / 手动 XML、JSON 产品入口。 | 实现审查；最终 UI 待验 |
| D03-SET-03 | 字幕启用 / 轨道 / 样式可用，房主加载广播、观众权限受限。 | 待验 |
| D03-SET-04 | 内嵌字幕与共享 overlay 分态，不同时显示两份。 | 待验 |
| D03-SET-05 | 弹幕固定 / 滚动 / 彩色 / 高级四类独立屏蔽。 | 实现 / 回归 E-DM-03；原生各类待验 |
| D03-SET-06 | 显示区域 slider 实际约束覆盖范围。 | 实现；原生待验 |
| D03-SET-07 | 字号 / 随屏缩放实际生效。 | 实现；原生待验 |
| D03-SET-08 | 不透明度 / 穿屏时间实际生效。 | 实现；原生待验 |
| D03-SET-09 | 字幕 / 弹幕设置返回先子页再设置再全屏，不离房。 | 待验 |

### 03 §4：添加草稿与片级胶囊，两套界面

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D03-ADD-01 | 来源顺序 B站 / 直链 / WebDAV / FTP / OpenList / Emby / Jellyfin / ani-subs / Kazumi / TVBox / 服务器文件。 | 源码核查：SourcePicker.sourceOptions 按指定 11 项顺序，过滤后仍保序；E-SR-01 为实际 NAS 可用范围。当前各角色原生下拉顺序未逐个复核，不记像素通过。 |
| D03-ADD-02 | 服务器文件仅 root。 | 源码核查：SourcePicker 仅 session.user.role=root 可见服务器文件；普通角色原生隐藏及服务端拒绝未现场操作，不能由管理员枚举推断。 |
| D03-ADD-03 | ani-subs / Kazumi 服从 beta 开关。 | 源码 + 回归：loadSourceAvailability 读 public-settings，SourcePicker 对 ani-subs / Kazumi 按 beta 过滤；source loading 重试组件用例通过。未改 NAS beta 设置做实际开 / 关矩阵。 |
| D03-ADD-04 | 五类无挂载不显示，不额外增挂载管理功能。 | 源码 + 回归：五种挂载按 mounts.length 过滤，无管理入口；网络失败不再伪装成空列表，`sourceInteraction.test.mjs` source loading shows network failure… 通过。NAS Emby 空列表 E-SR-01；设备完整过滤矩阵待验。 |
| D03-ADD-05 | 中转草稿仅 anime / Kazumi / CMS，说明卡 + Switch，初始 false。 | 源码核查：anime / Kazumi / CMS 两张 DraftPolicy 说明卡中的中转 Switch，onShow 重置 false；NAS 61 / 62 / 63 serverProxy=false（E-SR-01）。当前外观 / AX 初态待原生，不以 API 当截图。 |
| D03-ADD-06 | 非 B站浏览器引擎草稿说明卡 + Switch，初始 false。 | 源码核查：所有非 B站显示浏览器引擎 DraftPolicy + Switch，onShow 重置 false；NAS 新增条目回读 false（E-SR-01）。各入口原生视觉仍待验。 |
| D03-ADD-07 | 明确关闭 false 不在序列化 / 默认中丢失。 | NAS 协议 + 回归：61 / 62 / 63 两 false、59 / 60 / 66 / 67 浏览器策略 false；65 四组合 GET 一致。`handoffPlayback.test.mjs` arrival-order 用例保持 playsvideoEnabled=false。 |
| D03-ADD-08 | 历史缺字段兼容与新草稿 false 分开。 | 源码核查：新草稿在 SourcePicker 明确赋 false；历史 Movie 缺字段不由草稿初始化补写，moviePlayback 保留 playsvideoEnabled 原值。历史缺字段原生演练待验。 |
| D03-ADD-09 | 挂载服务器转发 / 直连使用自身设置，不恢复 directLinkProxy 第三开关。 | 实现 / 回归：`sourceInteraction.test.mjs`「first media-library selection inherits a direct mount and a removed selection falls back to the next real mount」通过；`directorySources.test.mjs` WebDAV / OpenList saved direct mode 两例通过，不增第三全局开关。真实外网 directLink=true 素材缺少。 |
| D03-ADD-10 | B站保持独立账号 / 画质 / 分 P，不显示非 B站两开关。 | 待验 |
| D03-ADD-11 | 批量失败保留未成功选择，结果清楚。 | 实现 / 回归（仅所列测试范围）：R-SR-06；实现 / 回归：`animeBatch.test.mjs` 三类 partial retry、`sourceRoutingRegression.test.mjs` CMS partial batch、`sourceInteraction.test.mjs` episode picker cancellation 通过；取消等待已发出写入确认，保留成功与未完成选择，不回滚成功项。原生少量批量 / 失败待验。 |
| D03-CARD-01 | 非 B站 / 非共享影片可展开设置，默认折叠。 | 待验 |
| D03-CARD-02 | 仅适用来源显示中转，非 B站显示浏览器转码。 | 待验 |
| D03-CARD-03 | 可见约 32px、触摸至少 44pt、字图比例紧凑。 | 待实际像素 / AX 验收 |
| D03-CARD-04 | 关闭描边 / 文字余区居中；开启实心 / 对比色 / 勾号。 | 待实际像素验收 |
| D03-CARD-05 | 左图标 / 外框不跳，标签移动让勾。 | 待实际交互验收 |
| D03-CARD-06 | 常规约 160ms、减少动态停用过渡。 | 待验 |
| D03-CARD-07 | 长名 / 130% 字体 / 分屏整颗换行无溢出。 | 待验 |
| D03-CARD-08 | 两开关独立四组合，非单选。 | 待验；策略行为 D01-POLICY-08–11 |
| D03-CARD-09 | 只读观众禁用、busy 禁重、saving / applying / error / retry 可读。 | 实现 / 回归（仅所列测试范围）：R-PS-03；原生与其余分支待验 |

### 03 §5：浏览、B站、选集与来源身份

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D03-BROWSE-01 | 完整显示本机默认 true，所有真实入口即时共享。 | 源码实现：useMediaPreferences 模块单例 + useSyncExternalStore，fullNames=true，实际多个入口读取同一快照。未有独立跨入口即时共享 / 持久化的原生证据，不由 helper 测试关闭。 |
| D03-BROWSE-02 | 开启长名无限换行 / 连续英文断行。 | 源码实现：开启后标题 numberOfLines=undefined，容器 minWidth=0 / flexShrink；未专门在 Simulator 验长连续英文及 130% 字体，不宣称平台断行已通过。 |
| D03-BROWSE-03 | 关闭列表一行 / 海报两行省略。 | 源码实现：Anime / MediaLibrary 列表一行、海报两行，Episode / Directory 每项一行；源码条件已核对，当前实际长标题开关前后截图待验。 |
| D03-BROWSE-04 | 列表 / 网格偏好独立、默认 list、各源共享。 | 源码实现：独立 episodeMode 默认 list、偏好键 zviewer-episode-view-mode；实际番剧 / CMS / B站 / 库选集读取共享值。当前跨入口记忆和重启持久化未原生验证。 |
| D03-BROWSE-05 | 列表每集一行；网格按容器约 120px 自适应，无四列硬上限。 | 源码实现：EpisodePicker / AnimePicker / MediaLibrary episodeView 按容器约 128 / 132px 算列，无四列硬上限；未以结果海报列数代替分集网格。窄宽真实列数与极窄情况待原生。 |
| D03-BROWSE-06 | 改显示 / 布局不丢多选，全选 / 清空 / 批量语义不变。 | 源码实现：显示偏好不清 selected；全选 / 清空 / 多选保留本身语义。组件回归 `sourceInteraction.test.mjs` episode picker cancellation 确认未完成选择保留，但未覆盖切全部显示方式的原生交互。 |
| D03-BROWSE-07 | 整部添加有独立明确操作。 | 实现 / 回归：Anime 独立整部确认行，Library 独立整部 / 整季确认；`mediaRepair.test.mjs`「whole-library submit rechecks immediate children and rejects directories, empty libraries and non-video items before resolve/add」通过。设备确认 / 取消和实际整季添加待验。 |
| D03-BROWSE-08 | 标题与操作放得下同排，不够自然换行。 | 源码实现：共享 ui.row 可换行、标题 minWidth=0 / flexShrink；源码不能代替所有窄宽标题与操作的像素验收，待第 10 轮逐页。 |
| D03-BROWSE-09 | 面包屑单行、各级等宽省略，不随完整显示增高。 | 实现 / 回归：新增 SourceBreadcrumbs，每级 flex:1 / minWidth:0 / 单行 tail ellipsis；Anime / Directory / MediaLibrary 实际挂载，调用原返回动作。`sourceInteraction.test.mjs`「source breadcrumbs give every long level equal shrinkable width, keep one line, and dispatch its existing back action」与目录 custom-root 祖先路径用例通过；原生待验。 |
| D03-BROWSE-10 | 已加片单切集当前 / 候选可完整换行，普通来源 / 画质下拉紧凑。 | 源码实现：MovieSourceSettings 的 movie-page wrap=display.fullNames，SourceDropdown 当前项 / 候选均按 wrap 换行；普通源 / 版本默认 wrap=false。真实已加入分集菜单长名及普通画质紧凑待原生。 |
| D03-BROWSE-11 | 检查真正挂载选集路径，不以死组件代替。 | 源码核查：SourcePicker 真正挂载 AnimePicker / CmsPicker / MediaLibraryPicker / DirectoryPicker，CMS / B站再用 EpisodePicker，共享 MediaDisplayTools；不是只改未用组件。真实各条路布局仍逐条待验。 |
| D03-BROWSE-12 | 搜索结果列表 / 海报与详情集数列表 / 网格分别核对。 | 源码实现：Anime / MediaLibrary 的结果 wall 与 episodeMode 分开；CMS 短季 12、Kazumi 45 集真实详情已取得（E-SR-01）。当前设备结果列表 / 海报和详情列表 / 网格分别操作、截图待验。 |
| D03-BROWSE-13 | B站添加 / 搜索 / 解析 / 分 P / 质量 / 音乐关联复用账号规则。 | 待验；D01-BILI 全矩阵 |
| D03-BROWSE-14 | 试看提示按当前解析账号，不按本机未登录猜服务端游客。 | 待验 |
| D03-BROWSE-15 | 新画质先解析预检再替换，失败保原片；旧请求不改当前影片。 | 待验 |
| D03-BROWSE-16 | TVBox 站点 → 搜索 → 播放组 → 集数 → 批量添加。 | NAS 协议：28 站点、search / detail / playGroups / sourceMeta 添加62；CMS批量 / 取消定向回归通过。外部阻塞 E-SR-02（18组均 HTML），原生完整流程和正向媒体未通过。 |
| D03-BROWSE-17 | Emby / Jellyfin 选库 / 季 / 集 / 版本与挂载身份独立。 | 实现 / 回归：mediaLibrary 保留 mountId / item path / pages，MovieSourceSettings 按 ep / ms 走库路由；`iosAlignment.test.mjs` season pages、`libraryPlayback.test.mjs` 两类 early episode / version 用例通过。Jellyfin 双端媒体 E-WA-01 / 06；Emby 空、真实多版本未验。 |
| D03-BROWSE-18 | 所有添加结果另一端可重解析，非仅临时 URL。 | 部分原生：Jellyfin 59 / 67 与 Kazumi61 另一账号 iPhone 有实际画面 E-WA-01 / 03 / 06，保存挂载 / 逻辑身份。CMS / AniSubs 正向媒体受 E-SR-02 阻塞；其余来源和 Android / HarmonyOS 不作通过。 |

### 03 §6：一起听，逐项 UI / 权限 / 生命周期

本节阶段 UI 证据来自实际 iOS 截图，不是参考图 17 / 18。图 17 原本是网易云导航覆盖 B站内容，不能当网易云主页。完整页低频工具按用户后续要求收纳，仍须保留相应业务语义和条件；不靠测试通过声明视觉对齐。

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D03-MUSIC-01 | 窄屏独立搜索按钮，宽屏搜索框。 | 实现 / 回归 E-MU-03；最终窄宽截图待验 |
| D03-MUSIC-02 | 网易云 / B站来源可识别，搜索不遮来源导航。 | 实现 / 回归；原生当前平台搜索待验 |
| D03-MUSIC-03 | 顶部唯一搜索按当前 B站平台工作，不保留重复分类搜索。 | 实现 / 回归；最终原生搜索结果待验 |
| D03-MUSIC-04 | 导航与头像菜单互斥，点目的页 / 账号前收起旧菜单。 | 实现 / 回归 E-MU-03；原生反复开关待验 |
| D03-MUSIC-05 | 菜单不透明度可读，不与正文叠字。 | 阶段原生目视；深浅 / 实际内容最终待验 |
| D03-MUSIC-06 | B站网格封面统一 16:9，标题两行 / UP 短行基线一致。 | 实现；按用户反馈修订，最终原生像素待验 |
| D03-MUSIC-07 | 正文底部留足空间，小播放器不盖最后卡片。 | 实现；最终滚到底待验 |
| D03-MUSIC-08 | mini 显示当前歌、状态、队列；高不透明背景 / 细进度无透字。 | 实现；真实歌曲 mini 待验 |
| D03-MUSIC-09 | 点击 / AX 激活 mini 打开完整播放器。 | 阶段原生已操作：E-MU-02 |
| D03-MUSIC-10 | 完整页封面 / 歌词或视频 / 进度 / 播放控制完整且不裁切。 | 阶段原生 iPad 目视；真实 NCM 及手机短高度待验 |
| D03-MUSIC-11 | 黑色视频上的收起为浅圆底深图标，触摸 ≥44pt。 | 阶段原生 iPad 目视；真实关联视频待验 |
| D03-MUSIC-12 | 歌词工具可切，当前行随实际原生时钟更新。 | 主任务已见NCM真实同步歌词及149.106秒时长；E-MU-06回前台1:42 / 2:29歌词 / 暂停UI正常。歌词工具各分支、拖动跟随和全部尺寸仍待验。 |
| D03-MUSIC-13 | 罗马音仅有内容时可用，不造空能力。 | 实现 / 回归；真实歌词待验 |
| D03-MUSIC-14 | 翻译仅有内容时可用。 | 实现 / 回归；真实歌词待验 |
| D03-MUSIC-15 | 纯净视频仅视频可用时出现，退出回原完整页。 | 实现；真实关联视频待验 |
| D03-MUSIC-16 | 喜欢功能仅有能力 / 权限时可用。 | 缺口待确认：当前完整播放器无该入口，需核对可用条件 |
| D03-MUSIC-17 | 播放模式仅房主，显示当前模式。 | 实现 / 回归；原生房主 / 观众待验 |
| D03-MUSIC-18 | 模式循环顺序 order → repeat-one → shuffle → repeat-all → order。 | 实现 / 回归 E-MU-03；实际四次点按待验 |
| D03-MUSIC-19 | 歌曲评论 / 歌词入口身份正确，不跳房间聊天。 | 限定原生E-UI-01：NCM歌曲评论 / 楼层回复空态 / 返回评论 / 关闭成功，当前真实歌词已见E-MU-06；B站及快速切歌身份另验。 |
| D03-MUSIC-20 | 添加 / 更换视频仅有效歌曲可用，使用统一 B站解析。 | 实现；原生选片 / 失败待验 |
| D03-MUSIC-21 | B站原视频仅 B站条目出现并保规范 BV / P。 | 实现 / 回归；实际跳转待验 |
| D03-MUSIC-22 | 队列 / 设置 / 播放页主题按既有能力显示，无网页全屏重复入口。 | 实现；最终目视 / 操作待验 |
| D03-MUSIC-23 | 工具行顺序 / 间距 / 密度与参考统一，低频收纳不堆大按钮。 | 阶段原生 iPad 目视；手机 / 多条件最终待验 |
| D03-MUSIC-24 | 评论数徽章深浅对比，窄屏可读。 | iPad实际评论总数154625已见E-UI-01；深浅两主题 / 手机窄屏徽章对比仍待原生，不以API数字替代。 |
| D03-MUSIC-25 | 歌曲评论请求绑定当前歌，切歌旧结果不串歌。 | 实现；原生快速切歌待验 |
| D03-MUSIC-26 | NCM 评论列表 / 数量 / 翻页 / 失败反馈。 | iPad原生列表 / 154625总数 / 楼层回复空态 / 返回关闭已验E-UI-01；E-MU-04有两页API，原生翻页 / 失败仍待验，无发送外部评论。 |
| D03-MUSIC-27 | B站歌曲评论列表 / 数量 / 翻页 / 失败反馈。 | 待原生验 |
| D03-MUSIC-28 | 房间评论独立入口，普通房间消息无弹幕开关。 | E-UI-05 phone16房间评论右侧抽屉横竖屏、键盘避让、实际发送后关闭 / 重开保留已验；与歌曲评论独立，无弹幕发送。roomDiscussionDrawer5项支持scope / 错误 / 快速开关，其他权限 / 网络 / iPad仍待验。 |
| D03-MUSIC-29 | 不保留遮卡片的浮动评论圆钮，按用户要求用既有入口。 | E-UI-05 phone16实际使用右侧边缘把手打开评论抽屉，未保留遮卡片的可拖动圆钮；portrait / landscape已目视，iPad及其余尺寸待验。 |
| D03-MUSIC-30 | 队列管理独立 canQueue，不以播放模式 host 权限替代。 | 实现 / 回归（仅所列测试范围）：R-MU-09 / R-MU-10；实现 / 回归；普通观众 addQueue / 拒绝原生待验 |
| D03-MUSIC-31 | mini 队列与完整页队列只有一个 owner。 | 实现 / 回归E-MU-03；iPad实际唯一队列弹层2首 / 当前Bili高亮E-UI-01。连续切层与快速开关仍待验。 |
| D03-MUSIC-32 | mini 队列打开时进入完整页先关闭旧队列。 | 实现 / 回归；原生待验 |
| D03-MUSIC-33 | 完整页队列打开时退出先关闭并转移归属。 | 实现 / 回归；原生待验 |
| D03-MUSIC-34 | 退出动画 / 旧定时器不重开底层队列。 | 实现 / 回归；原生快速开关待验 |
| D03-MUSIC-35 | 反复队列 / 完整页开关无无限 render / 黑屏 / 音频停止。 | 待真实歌曲原生验 |
| D03-MUSIC-36 | 打开队列不卸载音频，导航 / 歌词 / 背景不重复建音频。 | 实现 / 回归；第15包E-MU-11后台主音频自然跨曲与同PID恢复已验。回前台装饰实际播放仍失败，但失败surface清除回退原生已验；相关7项回归支持cancel / pause / clear且主audio不被停止。打开队列及全部导航连续性仍待验。 |
| D03-MUSIC-37 | 关闭歌曲评论回原完整播放器，不连完整页销毁。 | iPad歌曲评论关闭 / 返回已操作E-UI-01；持续音频及快速切歌时关闭仍待验，不从UI返回推断音频实例未重建。 |
| D03-MUSIC-38 | 关闭完整页队列回原完整播放器。 | 实现；原生待验 |
| D03-MUSIC-39 | 音乐队列只有已有播放 / 移除操作，无上移 / 下移或新增拖拽。 | 实现：遵照用户本轮要求；原生待验 |
| D03-MUSIC-40 | NCM 整歌单显示 / 加入 / 权限 / 失败状态。 | 待原生验 |
| D03-MUSIC-41 | NCM / B站切来源不重建正在播放的音频、不丢最新暂停。 | 实现 / 回归（仅所列测试范围）：R-MU-03；实现 / 回归；原生待验 |
| D03-MUSIC-42 | mini / 完整页 / 菜单无歌曲空态正常。 | 阶段原生 E-MU-02；最终空态待验 |

### 03 §7.1：仅投屏接收

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D03-CAST-01 | 一套等距自适应控制栏，接收页面不混发送功能。 | 阶段实际接收E-CA-01 / 02；Debug16 phone单套控制与横竖屏聊天布局已目视E-UI-05，不含新媒体接收或所有宽度，iPad最终样式待验。 |
| D03-CAST-02 | 全屏隐藏连接标签 / 分辨率，保留必要接收操作。 | 原生已验：E-CA-01；最终样式待验 |
| D03-CAST-03 | WebRTC 本机暂停 / 恢复不离房或断信令。 | 原生已验：E-CA-01 |
| D03-CAST-04 | OBS 本机暂停 / 恢复不影响发送端。 | 原生已验：E-CA-02 |
| D03-CAST-05 | 本机静音 / 音量作用于接收轨；后来到达轨道继承意图。 | 原生静音状态已操作；增益听感待验，E-CA-04 回归 |
| D03-CAST-06 | 横屏自动全屏，同横屏手动退出不立即强拉。 | iPhone自动全屏已有E-CA-01；Debug16 phone手动全屏隐藏聊天、退出恢复草稿及横竖布局已验E-UI-05。同横屏不强拉的其余实际触摸 / 设备边界仍待验。 |
| D03-CAST-07 | 全屏单击显隐、双击暂停 / 恢复，单击等待双击判定。 | 原生已验显隐 / 暂停；精确序列 E-CA-04 回归 |
| D03-CAST-08 | 按钮 / slider / 拖动 / 长按 / 多指不误触画面。 | 实现 / 回归 E-CA-04；原生复杂触摸待验 |
| D03-CAST-09 | 刷新先释放旧 PC 再 viewer-ready。 | 原生 restart 已验 E-CA-01；释放 E-CA-04 回归 |
| D03-CAST-10 | 旧 connected PC 收 sharer-ready 仍重建，不吞权威 restart。 | 原生已验 run 3：E-CA-01 |
| D03-CAST-11 | 独立 stream 音轨不会替换视频。 | 原生已验：E-CA-01 run 1 |
| D03-CAST-12 | streamless audio 合并不丢视频。 | 原生已验：E-CA-01 run 2 |
| D03-CAST-13 | 远端停止 / mute 清旧接收画面，unmute / restart 可恢复。 | stop / restart 原生已验；mute 分支 E-CA-04 回归 |
| D03-CAST-14 | SDP / ICE 迟到与坏候选不影响新 PC，离房释放轨 / stream。 | 实现 / 回归 E-CA-04；异常网络原生待验 |
| D03-CAST-15 | answer / viewer-ready 拒绝、sharer-error、等待 / 超时有真实反馈。 | 实现 / 回归；拒绝 / 超时原生待验 |
| D03-CAST-16 | OBS 当前 HTTPS 前缀 / key 拉流，HTTP 200 或 FLV header 不算媒体成功。 | 原生已验 E-CA-02；其他前缀 / base 待验 |
| D03-CAST-17 | OBS 同 URL 已运行后刷新从直播 0 载入，不继承 VOD seek。 | 原生已验 E-CA-02；30 秒时钟用例 E-CA-04 |
| D03-CAST-18 | OBS 停推 → offline 清屏 → 重推自动恢复。 | 原生已验 E-CA-02 |
| D03-CAST-19 | offline 后断线错过 live，重连 / 换房重置 unknown 并重拉。 | 实现 / 回归 E-CA-04；原生网络场景待验 |
| D03-CAST-20 | 接收真实尺寸变化触发方向复核，不按目标采集帧率宣称实际帧率。 | 实现；真实旋转 / 帧率专项待验 |
| D03-CAST-21 | iPhone 实际 WebRTC 运动视频接收。 | 原生已验 E-CA-01 |
| D03-CAST-22 | iPad 竖屏实际音视频接收字节 / 解码帧增长。 | 原生已验 E-CA-03；听感待验 |
| D03-CAST-23 | iPad 横屏 / 重启 / 重连的独立实际结果。 | 待主任务填后续结果，不从竖屏推断 |
| D03-CAST-24 | 暂停提示深底在亮色源上可读。 | 实现；最后修订截图待核 |
| D03-CAST-25 | 不恢复批注层或新增应用内小窗。 | 实现审查；最终 UI 待核 |
| D03-CAST-26 | iOS 原生 PiP 按真实能力提示，不假成功。 | 实现；物理设备 OBS PiP 待验 |
| D03-CAST-27 | iOS 自身分享开始 / 暂停 / 恢复 / 停止及系统声 / 麦克风。 | 本轮排除：用户明确接收端优先 |
| D03-CAST-28 | 发送采集质量 / 帧率 / 语音占麦优先 / 管理禁言。 | 本轮排除：发送端专项 |

### 03 §7.2：房间语音，逐项状态和系统边界

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D03-VOICE-01 | 顶栏耳机打开房间语音，避顶栏与实际安全区。 | 阶段原生 E-VO-01；最新布局待验 |
| D03-VOICE-02 | 收起面板继续通话。 | 实现；原生实际声音待验 |
| D03-VOICE-03 | 离房释放采集 / RTC / 监听 / 计时器。 | 实现 / 回归；原生待验 |
| D03-VOICE-04 | 被踢 / 关房释放通话，旧 reconnect 不复活。 | 实现 / 回归；原生待验 |
| D03-VOICE-05 | 未连接 / 准备中 / 媒体连接中分明。 | 实现；原生状态序列待验 |
| D03-VOICE-06 | 在线人数和实际 transport 可读，SDK joined 不冒充媒体已通。 | 默认只听 / UDP 原生已验 E-VO-01；其余 transport 待验 |
| D03-VOICE-07 | 恢复中 / 媒体超时 / 状态待确认分明。 | 实现 / 回归 E-VO-02；原生强制异常待验 |
| D03-VOICE-08 | 加入 / 退出控制可达，默认仅收听。 | 原生已验默认收听 E-VO-01；最新加入退出回归待验 |
| D03-VOICE-09 | 主动开麦请求权限，不自动采集。 | 实现 / 回归；真机授权及声音待验 |
| D03-VOICE-10 | 反送只在能力真实存在时提供。 | 条件待确认：当前无该能力入口；不虚构功能 |
| D03-VOICE-11 | 接收总音量控制。 | 实现；真实听感待验 |
| D03-VOICE-12 | 麦克风音量控制。 | 实现；真实远端增益待验 |
| D03-VOICE-13 | 成员独立音量沿既有 voiceVolumes 接口。 | 实现 / 回归 E-VO-02；双人独立听感待验 |
| D03-VOICE-14 | 成员本人 / 禁言 / 讲话活动标识。 | 实现；双人原生活动待验 |
| D03-VOICE-15 | 房主 / 房管按权限语音禁言。 | 实现；专用房原生拒绝待验 |
| D03-VOICE-16 | 管理员解禁不自动打开被管理者麦克风。 | 实现 / 回归 E-VO-02；原生待验 |
| D03-VOICE-17 | 管理移出等待确认，被移出停止采集。 | 实现；专用房原生待验 |
| D03-VOICE-18 | 同时检查当前 required publisher / subscriber PC 与 ICE 选中 pair。 | 实现 / 回归 E-VO-02；原生异常待验 |
| D03-VOICE-19 | 加入约 10 秒媒体检查与超时提示。 | 实现 / 回归；原生计时待验 |
| D03-VOICE-20 | 重连 / 媒体中断后检查当前 PC，旧 PC 超时不污染新连接。 | 实现 / 回归；原生替换待验 |
| D03-VOICE-21 | 用户授权等待 / 非活动时长不计入媒体超时。 | 实现 / 回归；真机系统弹窗待验 |
| D03-VOICE-22 | 诊断不可用显示待确认，不主动强退或谎报断开。 | 实现 / 回归；诊断不可用原生待验 |
| D03-VOICE-23 | 麦克风拒绝提供可理解重试 / 设置指引。 | 实现；真机首次拒绝 / 永久拒绝待验 |
| D03-VOICE-24 | 系统撤销麦克风授权后无静默采集。 | 待物理设备专项 |
| D03-VOICE-25 | 蓝牙 / 有线 / 扬声器 / 系统来电。 | 待物理设备专项 |
| D03-VOICE-26 | 后台 / 锁屏 / 前台恢复不自动开麦，真实房间业务另验证。 | 待物理设备专项 |
| D03-VOICE-27 | 双人双向语音与 VLC 同时出声，远端实际听感。 | 待物理设备专项 |

### 03 §8–8.1：返回、弹层、主题、可访问性和偏好

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D03-BACK-01 | 返回优先最上层弹层 / 更多。 | 待验 |
| D03-BACK-02 | 设置子页 → 上级 → 关闭设置 → 退出全屏 / 纯净 → 离房确认。 | 待验 |
| D03-BACK-03 | 顶栏 / 系统侧滑 / 关闭手势遵守同层级。 | 待验 |
| D03-BACK-04 | 弹层浅色无白底白字，深色无错误黑字。 | 待最终深浅逐页目视 |
| D03-BACK-05 | 播放器黑画布不跟主题变白。 | 源码playerBox固定#000；阶段截图15浅色界面黑画布可见E-AP-01。播放中反复切主题实际不变仍待原生。 |
| D03-BACK-06 | 切主题 / 开弹层 / 评论不建新媒体实例。 | 待验 |
| D03-BACK-07 | 异步回调绑定房间 / 服务器 / 媒体。 | 待全链路回归 |
| D03-AX-01 | 图标中文名称，按钮可访问激活。 | 音乐 mini 阶段已验；其余待逐控件 |
| D03-AX-02 | 开关开关态、折叠展开态、禁用态可读。 | 待逐控件 AX 验 |
| D03-AX-03 | 视觉紧凑但实际触摸 ≥44pt，键盘不挡主操作。 | 待窄屏 / 键盘验 |
| D03-PREF-01 | 地址 / 证书按本机服务器范围，凭据安全存储。 | 实现 / 回归：SecureStore会话与逐规范origin的证书例外分存，默认关闭、坏记录拒绝 / 有界64项；serverConnection / serverConnectionUi / sessionCookieIsolation回归。E-CO-01支持当前NAS通道与撤销原生传输，跨启动UI偏好 / 物理设备仍待验。 |
| D03-PREF-02 | 浅 / 深 / 跟系统主题仅本机持久。 | 源码AppearanceProvider读写zviewer-appearance-v1、useColorScheme跟随系统；E-AP-01三项normalize回归不等于实际存储 / 重启。原生主题切换及持久读写待验。 |
| D03-PREF-03 | 圆角、玻璃透明度、卡片模糊按既有外观接口。 | 源码AppearanceSettings含圆角预设、透明度.2–1、卡片模糊0–40，Surface消费既有接口；E-AP-01正常值 / 钳制回归通过。09为阶段图，各控件操作及重启保留待原生。 |
| D03-PREF-04 | 减少动态实际关闭相应过渡 / 模糊负担。 | 源码合并本机与系统reduceMotion，关闭背景blur、Surface BlurView和弹层动画；控件禁用状态有实现。系统热变 / 实际性能和所有过渡待原生E-AP-01。 |
| D03-PREF-05 | 背景地址 / 本机图 / 默认背景恢复。 | 源码HTTP(S)地址校验、DocumentPicker image导入≤20MiB、拷入本机appearance目录及默认恢复 / 可见错误。文件导入 / 错误 / 旧文件清理原生未验；normalize不证明导图成功E-AP-01。 |
| D03-PREF-06 | 背景模糊 / 白黑遮罩 / 位置 / 缩放 / 旋转。 | 源码ImageBackground blur、两遮罩和translate / scale / rotate，控件边界与startup三项回归E-AP-01。各滑条 / 手势实际效果及持久保留待原生。 |
| D03-PREF-07 | 完整名称默认 true，读偏好前不先关后开闪动。 | 源码实现：useMediaPreferences 初始 fullNames=true，异步读到 false 前保持默认，revision 防迟到读覆盖新操作；未有首次读取 / 切源 / 重启的原生专项，不能写无闪动已验。 |
| D03-PREF-08 | 列表 / 网格默认 list，保选择 / 跨源共享。 | 源码实现：episodeMode 独立默认 list，显示切换不清选择；部分选择保留组件回归 E-SR-03。跨入口、重启和所有视图切换的原生仍待验。 |
| D03-PREF-09 | 一起看本机音量用现有 zviewer-volume，仅本机持久。 | 待验 |
| D03-PREF-10 | 自动连播仅本机当前房主运行态，初始 false、切房 / 模式 / 转交失效。 | 待验 |
| D03-PREF-11 | 添加草稿成功后物化 Movie 字段，不把 false 当缺失。 | NAS 协议：新建61 / 62 / 63明确两false，59 / 60 / 66 / 67浏览器策略false（E-SR-01）；不是缺字段。当前UI初态及保存后设备重新读取待原生。 |
| D03-PREF-12 | 运行时策略在服务端，和本机视觉偏好分开。 | 待验 |
| D03-PREF-13 | 房名 / 人数 / 审批 / 密码只发有意修改，空密码明示移除。 | 实现 / 回归（仅所列测试范围）：R-RS-03；原生与其余分支待验 |
| D03-PREF-14 | 弹层 / 选集 busy 等瞬时状态离房 / 切模式清理，不持久。 | 来源范围源码核查：SourcePicker 按 session / room scope 挂载，子层卸载 abort / 失效旧任务；open / selected / busy 未写持久偏好。sourceInteraction / animeBatch 有取消回归，但真实离房 / 切模式及其他业务弹层仍待原生。 |
| D03-PREF-15 | 非敏感偏好用既有 preferences：原生 JSON + 旧 SecureStore 兼容，Web localStorage。 | 待迁移 / 读写回归 |

### 03 §9：源码待办闭环映射

本节是原交接“当时缺口”的逐行追踪，不重新把旧描述当当前代码事实。

| ID | 原交接待办 | 当前关闭所需的细项 |
| --- | --- | --- |
| D03-TODO-01 | 固定横屏（历史缺口） | 当前源码已改为iPhone按实际宽高、iPad系统窗口方向管理，E-SR-05；不再把旧固定横屏当现行设计。D03-DISPLAY-01–10各素材 / 真窗口仍按细项验收。 |
| D03-TODO-02 | CMS / 新策略 / 来源规范化 | 来源部分实现 / 回归与NAS证据：D03-ADD、D01-AGG、D01-POLICY-01–03；CMS上游HTML阻塞，当前策略实际应用仍逐项验收，不合并关闭。 |
| D03-TODO-03 | 运行时设置胶囊 | D03-CARD、D01-POLICY，待验 |
| D03-TODO-04 | 播放栏 / 更多 / 0.75x | D03-BAR，待最终目视与操作 |
| D03-TODO-05 | 下一部 | D03-CONTROL-06–11，待验 |
| D03-TODO-06 | 房间设置独立布局 | D03-PERM-01–03，阶段 UI 非最终 |
| D03-TODO-07 | 来源权限 / 挂载过滤 | 源码实现 / 组件回归：D03-ADD-01–04；当前角色、beta开关、无挂载的原生完整矩阵待验，网络失败已有可见重试。 |
| D03-TODO-08 | 所有入口选集 / 长名称 | 实际挂载源码实现与局部组件回归：D03-BROWSE-01–12；面包屑已补等宽单行，长名 / 全部选集布局 / 130%及持久化仍待原生。 |
| D03-TODO-09 | 音乐唯一队列 / 评论层级 | D03-MUSIC-24–38，原生仍待闭环 |
| D03-TODO-10 | 语音媒体状态监测 | D03-VOICE-05–26，实现 / 回归与原生分记 |

### 03 §10：尺寸、角色、媒体与生命周期必须逐维补证

下列是覆盖维度，不是用一个画面关闭整行的捷径。每个维度需关联上述实际用例 ID；重要组合（如 130% 字体 + 横屏短高度 + 全屏弹层）另加子用例。

| ID | 验收维度 | 状态 / 证据 |
| --- | --- | --- |
| D03-DIM-01 | iPhone 窄屏。 | 待最终逐页 |
| D03-DIM-02 | iPhone 常规宽度。 | 待最终逐页 |
| D03-DIM-03 | iPhone 横屏短高度。 | 部分投屏 E-CA-01；其余待验 |
| D03-DIM-04 | iPad 竖屏。 | 部分投屏 E-CA-03 / 弹幕 E-DM-01；其余待验 |
| D03-DIM-05 | iPad 横屏。 | 待最终逐页 |
| D03-DIM-06 | iPad 分屏 / 实际容器变化。 | 实现 / 回归：requireFullScreen=false、iPad四方向、window Dimensions监听、iPad原生lock/unlock no-op、available / locked=false；`sourceInteraction.test.mjs`两例通过，第10轮已安装。实际拖动手柄未改变window尺寸，真实分屏 / resize未通过E-SR-05。 |
| D03-DIM-07 | 100% 字体。 | 待最终逐页 |
| D03-DIM-08 | 130% 字体。 | 原生E-UI-02实际fontScale1.353→1→1.353，phone房间页完整，iPad名称草稿保留 / 取消、键盘及离房可达。已超过130%的所列页面通过；其他页面 / 横屏短高度 / 分屏仍待验。 |
| D03-DIM-09 | 分享端角色。 | 部分音乐 E-MU-01；完整权限待验 |
| D03-DIM-10 | 普通观众角色。 | 部分投屏 E-CA；完整权限待验 |
| D03-DIM-11 | 房管角色。 | 待验 |
| D03-DIM-12 | 普通 owner 角色。 | 待验 |
| D03-DIM-13 | 游客角色。 | 待验 |
| D03-DIM-14 | 房主转交和运行中权限变化。 | 原生已验E-UI-03：指定iPad1 / phone3无重连连续双向，管理 / 模式入口与成员数实时正确；仅本次两账户，不外推房管 / 游客 / 审批或异常网络。 |
| D03-DIM-15 | 横屏 / 竖屏 B站。 | 待各实际素材 |
| D03-DIM-16 | DASH 音视频双轨。 | 阶段原生 E-BI-02：server / local-cli均slave1并起播；独立音轨解码、听感及跨源清理仍待验 |
| D03-DIM-17 | 普通 MP4。 | E-WA-01 / 03 本次双端画面；完整基线 D01-DELIVER-06–08 |
| D03-DIM-18 | Kazumi HLS。 | 未验本轮 Kazumi HLS 正向：当前61经Range确认实际 MP4（E-WA-03），不能当HLS证据。初次另一个候选resolve为HLS仅协议，未拿来关闭原生策略 / seek。 |
| D03-DIM-19 | ani-subs HLS。 | 外部阻塞 E-SR-02：AniSubs所选8次resolve均404，无可播HLS，原生未验。 |
| D03-DIM-20 | CMS HLS。 | 外部阻塞 + 原生失败 E-WA-04 / E-SR-02：当前CMS候选返回HTML，不是可播HLS；客户端失败循环修订后原生复核另记。 |
| D03-DIM-21 | Emby / Jellyfin 媒体版本。 | 实现 / 回归：libraryPlayback / iosAlignment 的版本与item身份用例通过；NAS当前Jellyfin候选均单版本、Emby无挂载，真实媒体版本切换待素材。 |
| D03-DIM-22 | 两策略四组合 + 播放 / 暂停 / 1.5x + 同 URL + 重试。 | 逐行 D01-POLICY-08–20，不作汇总通过 |
| D03-DIM-23 | 普通更多 / 全屏更多 / 键盘后定位。 | E-UI-05 phone16普通竖屏More按钮下方、横屏空间不足上方8pt已验；portal / safe-area / keyboard几何及真实组件8项通过。iPad portrait系统窗口下方另已目视；全屏 / 实际键盘后的More、iPad横屏仍待原生，不称所有方向均下方。 |
| D03-DIM-24 | 设置子页返回 / 横屏确认可达。 | 待验 |
| D03-DIM-25 | 安全区 / 刘海灵动岛 / Home Indicator / 状态栏。 | 待逐页验 |
| D03-DIM-26 | 切主题不重建、切片旧任务取消、离房释放。 | 待最终生命周期回归 |
| D03-DIM-27 | 重连 / 重新准入 / 前后台 / 系统返回。 | 实现 / 回归（仅所列测试范围）：R-SC-09；待最终生命周期回归 |
| D03-DIM-28 | 记录 iOS / 设备 / NAS / 素材 / 双方角色，模拟器与真机分开。 | 本表要求；最终报告待补 |
| D03-DIM-29 | 小动漫 MKV 原生解码 / 音频 / 字幕。 | 限定原生E-WA-06：66 iPad画面>2分钟、SC可见 / TC选中；67双端画面及phone SC可见。66暂停seek画面失败（原片同时间有界抽帧非灰色）；声音听感 / 67 seek等未验，不因HEVC Main10解码推断HDR。 |

## 05：后续工作边界、实施顺序和汇报闭环

### 05 工作边界与推荐阶段

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D05-BOUND-01 | 指定客户端仓库开发，保留共享 native 依赖，不另起孤立 iOS 仓库。 | D01-BASE-01；待最终树核对 |
| D05-BOUND-02 | 保留 Expo / RN / VLCKit / LiveKit 架构。 | D01-BASE-06–08；待最终 diff |
| D05-BOUND-03 | 入口名称 / 模式顺序 / 权限 / 播放意图 / 错误语义与双端一致。 | D03 对应细项分别验，不作汇总通过 |
| D05-BOUND-04 | 阅读 01 / 02 / 03 与 04 索引，历史缺口不自动算已修。 | 待主任务补完整阅读 / 来源记录 |
| D05-BOUND-05 | 不仅改版本号宣称对齐。 | 待最终报告核对 |
| D05-BOUND-06 | 普通界面 / 原生 Debug 使用范围分开；本轮依用户授权以 Simulator 为主。 | 待最终环境记录 |
| D05-BOUND-07 | 未获新指示不 EAS / 设备 IPA / 发布。 | 已按用户新明确指示构建并交付未签名device IPA E-BUILD-02 / 03；没有EAS或新公开发布，不将早期未获指示时的边界抹去。 |
| D05-BOUND-08 | 原有 release 文件重命名保留。 | D01-BASE-02；待最终 diff |
| D05-BOUND-09 | 实际构建后维护文档 / 可追溯提交；IPA 后更新架构文档。 | 第26 / 27IPA、构建 / check20与限定用户真机反馈已同步README、状态、架构、矩阵和索引E-BUILD-02 / 03。源码checkpoint9e7ff04保留，本轮后续可追溯本地commit由主任务收口，本子任务不提交。 |
| D05-BOUND-10 | 共享变更实际影响双端则同步维护文档。 | 待主任务判定适用性 |
| D05-STAGE-01 | A：恢复源码 / Git 对象 / 锁依赖。 | D01-BASE-01–04，待主任务补证 |
| D05-STAGE-02 | A：逐文件 Go 审查与新来源基线，不绕 stage。 | D01-NATIVE-01–10，待主任务补证 |
| D05-STAGE-03 | A：Go / JS 检查、Simulator 库和当前 Xcode 工程运行。 | D01-NATIVE-07 / 11–13、D01-DELIVER-01–05 |
| D05-STAGE-04 | B：逻辑 / 解析 / 本机代理身份分开，ani-subs 复现不再出现。 | 实现 / 回归（仅所列测试范围）：R-HO-01；D01-SOURCE-01–03，待验 |
| D05-STAGE-05 | B：跨源 / 乱序 / 迟到 / 重入清完整快照。 | D01-SOURCE-04–18，待验 |
| D05-STAGE-06 | C：音乐权威 heartbeat / clientTs / check-status。 | D01-MUSIC-01–08 有实现和限定证据，其他逐行待验 |
| D05-STAGE-07 | C：片级策略 / sourceMountId / CMS / owner 权限。 | D01-POLICY、D01-LIB、D01-AGG、D03-PERM |
| D05-STAGE-08 | C：B站账号 / 短链 / P、HLS 鉴权与路由。 | D01-BILI、D01-LIB，待验 |
| D05-STAGE-09 | C：Android / HarmonyOS 互换角色的控制 / 保存 / 重连。 | 待跨平台验收；E-MU-01 不代替 |
| D05-STAGE-10 | D：添加 Switch 与片卡胶囊区分。 | D03-ADD / CARD，待最终原生 |
| D05-STAGE-11 | D：完整名称 / 列网格、更多 / 下一部 / 0.75x。 | D03-BROWSE / BAR / CONTROL，待最终原生 |
| D05-STAGE-12 | D：关闭返回 / 加载错误空态、触摸不穿透 / 键盘可达。 | D03-STATE / BACK / AX，待验 |
| D05-STAGE-13 | E：VLC 音轨 / 字幕 / seek / 实际尺寸方向。 | D01-BASE-11–14、D03-DISPLAY / SET，待原生专项 |
| D05-STAGE-14 | E：LiveKit / 音频会话 / 中断与后台。 | D03-VOICE，原生与真机边界逐行 |
| D05-STAGE-15 | E：投屏发送另立 ReplayKit。 | 本轮排除；不能混入接收端验收 |
| D05-STAGE-16 | F：维护文档、关键跨端回归、已知限制 / 提交号。 | 待最终收口 |
| D05-STAGE-17 | F：按用户指示决定 IPA / 发布，不以收尾自动发布。 | 用户已请求并收到第26 / 27未签名IPA E-BUILD-02 / 03；26有用户真机一起听及原生音乐控件正常报告，27自行签名 / 真机待验。无EAS / push / 新公开发布，公开仍26。 |

### 05 十条逻辑要求与汇报要求

| ID | 验收要求与最小检查 | 状态 / 证据 |
| --- | --- | --- |
| D05-LOGIC-01 | 地址检测 / 协议 / 前缀 / 证书例外绑定当前服务器。 | D03-CONNECT-02–05 / 10：连接 / 证书JS合同与Debug16合成23项E-CO-01已补；前缀 / 媒体映射有回归，真实媒体 / 物理设备 / 所有切服失败仍待验。 |
| D05-LOGIC-02 | 401 refresh 与准入 403 分开。 | 实现 / 回归（仅所列测试范围）：R-SC-08；D01-LIB-11–13，待验 |
| D05-LOGIC-03 | isHost / owner / 管理员 / 房管 / 普通 / 游客分开。 | D03-DATA-02–03、D03-PERM、D03-DIM-09–14 |
| D05-LOGIC-04 | 模式顺序看 → 投屏 → 听；可用尺寸驱动布局。 | D03-LOBBY-04、D03-ROOM-04–08 |
| D05-LOGIC-05 | 房间横屏和播放器全屏为不同状态。 | D03-DISPLAY，待验 |
| D05-LOGIC-06 | 自动连播 / 控制自动通过 / 入房审批独立。 | D03-PERM-09、D03-CONTROL-09–11、D03-CHAT-25–26 |
| D05-LOGIC-07 | 两添加草稿默认 false，历史缺字段兼容另处理。 | 源码 + NAS协议 E-SR-01：D03-ADD-05–08，新草稿显式false；历史缺字段另保留。当前Switch视觉与全部入口设备验收待补。 |
| D05-LOGIC-08 | 片策略保存确认与当前媒体应用各有代次 / busy / 失败重试。 | D01-POLICY-02–20 |
| D05-LOGIC-09 | 开关变色不能代表媒体首帧 / seek 已应用。 | D01-POLICY-15、D03-CARD-09 |
| D05-LOGIC-10 | VLC 本机引擎，playsvideoEnabled 保存透传并准确解释作用。 | D01-POLICY-21–22 |
| D05-LOGIC-11 | 普通 / 全屏控制、倍速、字幕 / 弹幕、下一部、方向、seek 有 AX 标签。 | D03-AX，待逐控件 |
| D05-LOGIC-12 | 小图标实际触摸不缩小。 | D03-AX-03、D03-CARD-03、D03-MUSIC-11 |
| D05-LOGIC-13 | 本机偏好与全房状态分开。 | D03-PREF 各行 |
| D05-LOGIC-14 | 音乐队列、房间评论、歌曲评论各自身份和列表。 | D03-MUSIC-19 / 24–38 |
| D05-LOGIC-15 | 返回先最上层，再全屏，最后离房确认。 | D03-BACK-01–03 |
| D05-LOGIC-16 | 离房 / 切服 / 取消释放媒体、RTC、异步请求。 | D01-BASE-09 / 16、D03-CAST-14、D03-VOICE-03–04 |
| D05-LOGIC-17 | 不靠切路由掩盖后台仍播放。 | 待真机 / 原生离房验证 |
| D05-REPORT-01 | 每轮明确文件和改变行为。 | 待主任务最终 diff 报告 |
| D05-REPORT-02 | 每项说明设备 / OS / 媒体 / 角色 / 服务器。 | 本表要求；待补全证据元数据 |
| D05-REPORT-03 | 命令 / 检查数 / 失败原因对应实际源码快照。 | 待最终全量和提交号 |
| D05-REPORT-04 | 已实现 / 已测试 / 待真机 / 待用户确认各自列清。 | 本表逐项；最终交付报告待收口 |
| D05-REPORT-05 | 真实同步 / 播放失败优先于自动化通过。 | 持续约束；seek 最后修订未闭环不记通过 |
| D05-REPORT-06 | 先可审阅实现与证据，再交用户检查。 | 待主任务交付 |
| D05-REPORT-07 | 保留有用途插件 / 模块 / 资源，排除敏感材料与 AGENTS。 | 待最终 diff / 材料审查 |

## 待补证的优先入口

音乐与弹幕对应原生复测路径：WATCH 聊天三页 → 已导入轨道 → 设置中的四类 / 区域 / 字号 → time 0 / 切房 → NCM 真实歌曲 mini → 完整页歌词 → 歌曲评论 → 队列 → 返回完整页 → 反复打开 / 收起 → 普通观众权限。每一步分别关闭相应 ID，不批量标通过。

语音复测路径：顶栏语音 → 默认仅收听 → 主动开麦 → 双人讲话 / 增益 → 收起继续 → 管理禁言 / 解禁 → 媒体失败 / 恢复 → 离房。听感和系统权限 / 蓝牙 / 来电 / 后台必须另以物理设备补证。

本表仅记录已授权的事实，没有触发新的NAS配置、普通房间消息、生产代码修改或公开发布；本轮device IPA由用户新明确指示分别构建并交付，见E-BUILD-02 / 03。后续维护只按实际证据更新状态，不为追求通过率删除待验项。

## 既有自动回归的逐项证据

为避免把“原生待验”误读成“未实现或没有回归”，上表关联以下实际测试名称。该证据只证明对应测试的逻辑范围，不批量关闭原生 / 跨端 / 物理设备用例。本轮两批受测文件分别 52 项与 41 项通过，均不是最终全量计数；构建、Go 与来源基线由主任务另补。

| 回归 ID | 文件 / 实际测试名称 |
| --- | --- |
| R-HO-01 | [handoffPlayback.test.mjs](../ZV-iOS/tests/handoffPlayback.test.mjs)：`ani-subs resolved URL survives all state/list/current arrival orders` |
| R-HO-02 | [handoffPlayback.test.mjs](../ZV-iOS/tests/handoffPlayback.test.mjs)：`cross-provider snapshots clear Bili identity/audio and reject retired movie state` |
| R-HO-03 | [handoffPlayback.test.mjs](../ZV-iOS/tests/handoffPlayback.test.mjs)：`same URL proxy change reloads VLC and preserves pause/position/rate; browser preference does not reload VLC` |
| R-HO-04 | [handoffPlayback.test.mjs](../ZV-iOS/tests/handoffPlayback.test.mjs)：`saved Kazumi proxy uses current entry point and never retains the adding user token` |
| R-HO-05 | [handoffPlayback.test.mjs](../ZV-iOS/tests/handoffPlayback.test.mjs)：`music server position is not advanced twice and suppresses competing host clocks` |
| R-HO-06 | [handoffPlayback.test.mjs](../ZV-iOS/tests/handoffPlayback.test.mjs)：`late decoded portrait dimensions rotate fullscreen without relocking a manual unlock` |
| R-HO-07 | [handoffPlayback.test.mjs](../ZV-iOS/tests/handoffPlayback.test.mjs)：`late VLC HLS length enables duration without resetting an earlier seek or accepting retired callbacks` |
| R-IA-04 | [iosAlignment.test.mjs](../ZV-iOS/tests/iosAlignment.test.mjs)：`library room playback substitutes authoritative stream identity, switches versions, and null retires delayed states` |
| R-IA-05 | [iosAlignment.test.mjs](../ZV-iOS/tests/iosAlignment.test.mjs)：`clear/sort permissions are distinct from live host and autoplay never wraps at end` |
| R-IA-14 | [iosAlignment.test.mjs](../ZV-iOS/tests/iosAlignment.test.mjs)：`server path prefix belongs to Socket.IO transport path rather than a foreign namespace` |
| R-MH-01 | [musicHostStatus.test.mjs](../ZV-iOS/tests/musicHostStatus.test.mjs)：`server host availability wins over legacy timing and honors explicit disconnect grace` |
| R-MH-02 | [musicHostStatus.test.mjs](../ZV-iOS/tests/musicHostStatus.test.mjs)：`legacy heartbeat fallback cannot mistake own reconnection or foreground resumption for host absence` |
| R-MU-01 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`Netease playback acknowledgement matches VLC absolute identity for relative server media` |
| R-MU-02 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`Bili acknowledgement uses canonical selection and never accepts a previous track or local proxy` |
| R-MU-03 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`real sync callbacks never seek the old Netease song or another part of the same BV` |
| R-MU-04 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`server clock messages cannot discard the queue in a delayed initial restore` |
| R-MU-05 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`a delayed restore cannot replace a newer queue event or a retired connection` |
| R-MU-06 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`two explicit controls align paused zero without waiting for heartbeat cooldown` |
| R-MU-07 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`host offline enables only local playback controls and never viewer room broadcasts` |
| R-MU-08 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`own disconnection does not grant autonomous viewer control or permit stale online ACKs` |
| R-MU-09 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`musicQueue permission lets a viewer append directly while playback still requires host approval` |
| R-MU-10 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`a viewer without queue permission requests the host, and a rejected authoritative append cannot switch songs` |
| R-MU-11 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`slow same-song resolution survives repeated server heartbeats and keeps the newest paused clock` |
| R-MU-12 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`a real track change still retires an older pending song resolution` |
| R-MU-13 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`pause cancels late Bili recommendations without enqueueing or broadcasting stale playback` |
| R-MU-14 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`pause and seek invalidate pending FM selection but retain the active roaming session` |
| R-MU-15 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`explicit repeat-one repeats the FM song; disconnect stops its pending selection` |
| R-MU-16 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`late native events from the previous track cannot publish the new track clock or advance FM again` |
| R-MU-17 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`tail seek and transient native pause cannot broadcast a room pause or advance the queue` |
| R-MU-18 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`a playing tail seek follows queue policy instead of seeking into an EOF loop` |
| R-MU-19 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`system next/previous loads audio and metadata without a React commit in background` |
| R-MU-20 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`viewer receives the new host song while rendering is suspended` |
| R-MU-21 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`natural completion advances the host queue without waiting for a background JS timer` |
| R-MU-22 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`music resolution failure stays bounded across heartbeats and explicit room play can retry` |
| R-MU-23 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`native music failure does not rebuild on heartbeats and local play is an explicit retry` |
| R-MU-24 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`failed music seek keeps its prepared input and blocks automatic correction until a real control` |
| R-MU-25 | [musicPlayback.test.mjs](../ZV-iOS/tests/musicPlayback.test.mjs)：`another music track can recover from the previous track native failure` |
| R-PS-01 | [playbackSettings.test.mjs](../ZV-iOS/tests/playbackSettings.test.mjs)：`browser-only policy confirmation preserves a later pause, rate and clock without replacing VLC` |
| R-PS-02 | [playbackSettings.test.mjs](../ZV-iOS/tests/playbackSettings.test.mjs)：`paused native media-ready event finishes settings confirmation and applies the initial seek without playing` |
| R-PS-03 | [playbackSettings.test.mjs](../ZV-iOS/tests/playbackSettings.test.mjs)：`HLS settings wait for a confirmed native seek rather than the first-play or optimistic clock` |
| R-PS-04 | [playbackSettings.test.mjs](../ZV-iOS/tests/playbackSettings.test.mjs)：`HLS first-play without a VOD duration does not complete settings confirmation` |
| R-PS-05 | [playbackSettings.test.mjs](../ZV-iOS/tests/playbackSettings.test.mjs)：`a native seek failure remains an application failure after the media has loaded` |
| R-PS-06 | [playbackSettings.test.mjs](../ZV-iOS/tests/playbackSettings.test.mjs)：`late native seek retains its remaining confirmation budget after media preparation timeout` |
| R-PS-07 | [playbackSettings.test.mjs](../ZV-iOS/tests/playbackSettings.test.mjs)：`an expired native confirmation budget does not extend settings application indefinitely` |
| R-RS-01 | [roomSettings.test.mjs](../ZV-iOS/tests/roomSettings.test.mjs)：`viewers retain sharing and member access while host mutation controls stay absent or disabled` |
| R-RS-02 | [roomSettings.test.mjs](../ZV-iOS/tests/roomSettings.test.mjs)：`a late room snapshot cannot overwrite a newer settings broadcast from the active room` |
| R-RS-03 | [roomSettings.test.mjs](../ZV-iOS/tests/roomSettings.test.mjs)：`saving a password alone preserves untouched capacity and admission settings` |
| R-RS-04 | [roomSettings.test.mjs](../ZV-iOS/tests/roomSettings.test.mjs)：`admission approval reflects server acknowledgement and retains its value when rejected` |
| R-RS-05 | [roomSettings.test.mjs](../ZV-iOS/tests/roomSettings.test.mjs)：`playback requests remain manual until the host explicitly enables automatic approval` |
| R-RS-06 | [roomSettings.test.mjs](../ZV-iOS/tests/roomSettings.test.mjs)：`an audience client cannot auto-approve or execute another audience request` |
| R-SC-01 | [sessionCookieIsolation.test.mjs](../ZV-iOS/tests/sessionCookieIsolation.test.mjs)：`login, guest and refresh JSON requests cannot opt into a stale native cookie account` |
| R-SC-02 | [sessionCookieIsolation.test.mjs](../ZV-iOS/tests/sessionCookieIsolation.test.mjs)：`restored SessionProvider uses its Bearer account even with a stale account cookie present` |
| R-SC-03 | [sessionCookieIsolation.test.mjs](../ZV-iOS/tests/sessionCookieIsolation.test.mjs)：`auth/me from a different account cannot silently replace or persist the selected user` |
| R-SC-04 | [sessionCookieIsolation.test.mjs](../ZV-iOS/tests/sessionCookieIsolation.test.mjs)：`refresh returning a different account fails and never persists that account or token` |
| R-SC-05 | [sessionCookieIsolation.test.mjs](../ZV-iOS/tests/sessionCookieIsolation.test.mjs)：`logout while native cookie isolation is pending cannot open a late socket` |
| R-SC-06 | [sessionCookieIsolation.test.mjs](../ZV-iOS/tests/sessionCookieIsolation.test.mjs)：`switching account while native isolation is pending opens only the current account socket` |
| R-SC-07 | [sessionCookieIsolation.test.mjs](../ZV-iOS/tests/sessionCookieIsolation.test.mjs)：`socket handshake disables cookie polling and keeps the chosen explicit auth token` |
| R-SC-08 | [sessionCookieIsolation.test.mjs](../ZV-iOS/tests/sessionCookieIsolation.test.mjs)：`concurrent optional-auth music calls renew an expired NAS token before anonymous 200 responses can occur` |
| R-SC-09 | [sessionCookieIsolation.test.mjs](../ZV-iOS/tests/sessionCookieIsolation.test.mjs)：`pre-expiry timer and foreground renewal share the active NAS lease without per-song auth probes` |
| R-SC-10 | [sessionCookieIsolation.test.mjs](../ZV-iOS/tests/sessionCookieIsolation.test.mjs)：`logout during proactive token refresh prevents late music fetch, credential persistence and socket revival` |
| R-SC-11 | [sessionCookieIsolation.test.mjs](../ZV-iOS/tests/sessionCookieIsolation.test.mjs)：`switching NAS and account during renewal cannot send the retired music request or persist its refreshed token` |
| R-SC-12 | [sessionCookieIsolation.test.mjs](../ZV-iOS/tests/sessionCookieIsolation.test.mjs)：`automatic pre-expiry refresh stops after three failed attempts instead of looping on an old JWT` |
| R-SC-13 | [sessionCookieIsolation.test.mjs](../ZV-iOS/tests/sessionCookieIsolation.test.mjs)：`expired-token refresh failures are bounded and never fall through to anonymous music requests` |
| R-SC-14 | [sessionCookieIsolation.test.mjs](../ZV-iOS/tests/sessionCookieIsolation.test.mjs)：`a third-party NCM 401 on a fresh NAS lease does not refresh or log out that lease` |
| R-SF-02 | [sessionFreshness.test.mjs](../ZV-iOS/tests/sessionFreshness.test.mjs)：`relay authentication recovery is limited to one NAS 401 per logical media scope, including renewed listeners` |
| R-SR-01 | [sourceRoutingRegression.test.mjs](../ZV-iOS/tests/sourceRoutingRegression.test.mjs)：`an unlabelled old Kazumi state cannot attach its URL or audio to another legacy movie` |
| R-SR-02 | [sourceRoutingRegression.test.mjs](../ZV-iOS/tests/sourceRoutingRegression.test.mjs)：`metadata-based Kazumi resolution fails explicitly instead of playing an older signed URL` |
| R-SR-03 | [sourceRoutingRegression.test.mjs](../ZV-iOS/tests/sourceRoutingRegression.test.mjs)：`adding metadata-based proxy records removes the adding account token and entry-point host` |
| R-SR-04 | [sourceRoutingRegression.test.mjs](../ZV-iOS/tests/sourceRoutingRegression.test.mjs)：`explicit direct aggregate policy applies to the separate audio track too` |
| R-SR-05 | [sourceRoutingRegression.test.mjs](../ZV-iOS/tests/sourceRoutingRegression.test.mjs)：`legacy Kazumi audio rebases its own proxy and site headers without the adding account token` |
| R-SR-06 | [sourceRoutingRegression.test.mjs](../ZV-iOS/tests/sourceRoutingRegression.test.mjs)：`CMS batches retain failed selections and continue through later episodes with actual playback identities` |
| R-SR-07 | [sourceRoutingRegression.test.mjs](../ZV-iOS/tests/sourceRoutingRegression.test.mjs)：`leaving a CMS picker stops the remaining batch after the in-flight add returns` |
| R-SR-08 | [sourceRoutingRegression.test.mjs](../ZV-iOS/tests/sourceRoutingRegression.test.mjs)：`CMS rejects mismatched anime metadata and invalid episode indices before adding` |
| R-SR-09 | [sourceRoutingRegression.test.mjs](../ZV-iOS/tests/sourceRoutingRegression.test.mjs)：`HDR/Dolby metadata cannot bypass conservative filtering by omitting the isHdr flag` |
| R-ST-01 | [startup.test.mjs](../ZV-iOS/tests/startup.test.mjs)：`v4.7.4 refreshes 401 while preserving sessions on admission and permission 403` |
| R-ST-05 | [startup.test.mjs](../ZV-iOS/tests/startup.test.mjs)：`pre-cancelled and newly cancelled requests stop even if native transport ignores abort` |
| R-ST-07 | [startup.test.mjs](../ZV-iOS/tests/startup.test.mjs)：`logout and login invalidate late restore, verification and refresh results` |
