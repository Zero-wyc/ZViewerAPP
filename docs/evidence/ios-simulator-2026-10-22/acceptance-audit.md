# 交付材料一致性审计（2026-10-22）

当前快照为**16次Simulator Debug、2次device ARM64 Release，总18次原生构建成功；check20补丁检查、lint、TypeScript与409 / 409项通过**。其后仅buildNumber26→27元数据。Debug16已安装并运行phone / iPad，iPad新房准入成功；phone本轮投屏 / 评论 / More GUI见[反馈专项](feedback-build16.md)及20–27图，证书例外另有[23项真实合成传输检查](server-certificate-build16.json)。不把UI、API、自动回归或合成网络当新媒体解码 / 物理设备通过，也不宣布609项全部通过。

More现使用portal相对trigger与真实内容高度：phone竖屏在按钮下方，横屏底部不足时贴按钮上方8pt；不是全部情形都在下方。iPad portrait系统窗口下方与连接页证书默认off另有实见；iPad横屏及320pt / 全安全区 / 实际键盘边界仍待原生。投屏横屏聊天右侧 / 竖屏下方与manualFullscreen草稿恢复，音乐设置首项网易云音质、右侧房间评论横竖屏 / 键盘 / 实际发送后重开保留均在本次phone观察范围。

最新[第15包Home / Lock](music-background-build15-home-lock.json)支持主音频限定通过：Home NCM→Bili新输入ready后原生30.923秒，Lock Bili→NCM新输入ready后原生30.972秒；12:19:15确认原PID3018回前台。装饰再次失败后清除灰色残影、回退普通背景并保留错误，原生回退已验（[18图](18-ipad-music-video-fallback.png)）。初始paused0后UI play却跳31.172秒、NowPlaying卡未显示、装饰实际播放恢复失败均独立保留，精确零点起播不能记通过。

历史[第14包](music-background-build14-home-lock.json)所列Home / Lock及同PID正向继续保留，旧非零31352ms恢复无推进失败没有被15自然跨曲结果关闭。[17图](17-ipad-music-background-return-failure.png)仍是14装饰恢复失败证据；18回退成功不改写装饰失败事实。

[第13包前台失败](music-background-build13-foreground-failure.json)与[第12包SIGABRT](music-background-build12-crash.json) / [观察](music-background-build12-observation.json)改列历史，事实不删：13包初始1ms seek超时且没有Home / Lock；12包原生unowned销毁崩溃、重开为新PID。销毁修复有实际Swift正 / 负对照，14包本轮同PID恢复没有再现该次崩溃；不外推所有生命周期。历史checkpoint为dc20696，已交付26源码checkpoint为9e7ff04；本轮16 / 27后续本地提交由主任务收口。


最新[第27包设备IPA](../ios-device-ipa-27-2026-10-22.json)为1.9.0(27)、com.zviewer.mobile、最低iOS16.4、iPhone+iPad；49276344B，SHA256 `50d2fefce399827831e52cf20a6c4a0ca077e02f71f085a1efc031c3804c6671`，Hermes6622435B、device arm64 / IOS2、unsigned / 无profile，native / debug / 已知私密检查通过，已交付[文件](../ios-device-ipa-27-2026-10-22.json)。真机待用户验证；本文复用构建时记录摘要，没有重新计算IPA。旧[26包](../ios-device-ipa-2026-10-22.json)及原文件不覆盖，用户报告真机一起听及原生音乐控件全部正常，但型号 / OS / 时长未给、agent未独立观察，不改写Simulator历史负例、不外推27新功能。公开GitHub仍26，无push、EAS或新公开发布。

证书例外默认关、逐规范origin保存，传输仅映射选定NAS；Debug16合成原生23项支持REST / Range / image / Engine.IO WSS、redirect与撤销活动HTTP / WS，独立voice / foreign port / hostname仍严格，不代表实际媒体解码。B站自动弹幕与防串片23专项通过、P1 / P2实际数据1200 / 2623条，但新专用房UI play返回影片不存在，REST有75 / 76 / 77且原生room / numeric movieID一致；iPad真正GUI建房后78同错而Node数字75成功，不能归因为仅调试asHost0、缓存、权限或Cookie，新增原生闭环不通过，不能先归为已修客户端问题。当前iPad真实NAS WebSocket已确认所选origin / path正确且readyState1，只读request-movie-list返回movies:[]，紧接同房REST仍为78 / 79 / 80（28图）；这是实际Socket / REST片单不一致，根因仍未定位，不能归为多worker、缓存、权限或鉴权。

## 范围与计数

[逐项清单](../../ios-acceptance-checklist.md)、[开发状态](../../ios-macos-development-status.md)、[维护架构](../../ios-maintenance-architecture.md)、本目录索引及来源 / 音乐证据已核对。旧9次构建、298 / 343检查数和固定横屏只可作为历史；iPad旧账号Cookie造成的入房失败已由第9轮原生复测解决，不能继续写成当前入房阻塞。

机器可核对的计数见[acceptance-audit.json](acceptance-audit.json)：

- 609个D类要求，609个唯一ID，无重号。
- 待验 / 外部阻塞标记的精确行数见JSON；许多已有局部实现、协议或原生证据，不能解读为对应数量未实现。
- 14行显式外部阻塞；同一上游问题会映射到多个要求，与待验行重叠，不是14个独立服务故障。
- 当前12个已观察问题组中8组仍开放、4组为所列原生范围修复通过（同组可映射多行）；新增NAS片单播放路径差异仍调查（Node数字75成功而phone同ID拒绝，iPad真正GUI建房后78也拒绝），不能归因具体客户端 / 服务端缺陷。第15包主音频所列后台跨曲、同PID恢复及失败surface回退为限定通过，初始零点偏移 / 旧非零恢复 / 锁屏卡 / 装饰实际播放分开保留；字体与转交亦为限定场景通过。计数不是609项通过率。

显式待验标记较多的族包括：音乐界面40 / 42、B站39 / 39、语音27 / 27、尺寸 / 生命周期26 / 29、聊天26 / 30、片级策略22 / 25。这里表示每行仍有未执行分支，不能抹去同一行已记录的有限通过。纯引用映射行不递归展开计数；JSON保存实际检索表达式与各族数字。

## 当前问题与最小后续顺序

| 顺序 | 证据与当前状态 | 最小后续 |
| --- | --- | --- |
| 1 | Jellyfin HLS小数暂停seek失败；公开小HLS的冷暂停准备及精确定位仍须当前二进制实测。66 MKV虽clock / ACK正确，137.207秒画面灰色，而同时间原片有界Range参考帧有彩色画面。 | 以较小素材确认真实暂停画面和实际时钟，不继续重复大电影；不将macOS无视频探针或ACK当Simulator画面通过。 |
| 2 | 第15包主audio Home / Lock自然跨曲及原PID恢复已验，失败surface清除回退也已验；初始paused0→play跳31.172秒、卡未显示、装饰实际播放失败仍保留，14旧非零恢复未关闭。 | 先定位初始暂停时钟与恢复位置，不把自然曲终 / 返回错误回退当精准起播或装饰播放成功；卡、第二端听音 / 同步与物理设备另验。 |
| 3 | 新NAS专用房75 / 76 / 77 REST存在，Node数字75成功而phone同ID拒绝，iPad真正GUI建房后78也拒绝；原生ID已核对；iPad真实Socket只读movies为空而紧接同房REST为78 / 79 / 80（28图），根因未定位，B站自动弹幕原生闭环待验。CMS均HTML / 403 / 404、AniSubs所选resolve404、Emby无挂载等旧边界继续保留。 | 先基于现有ID和服务端记录定位NAS播放运行态，保留可见失败，不改用户NAS设置；停止重复扫描CMS / AniSubs，Emby / 多版本 / 目录直连等取得合适素材后另验。 |
| 4 | [房间原生记录](../room-ui-live-font-transfer-2026-10-22.md)已证明phone1.353→1→1.353完整、iPad编辑草稿保留并取消，以及iPad1→phone3→iPad1无重连连续双向转交。 | 两者所列场景已关闭。字体其余页 / 横屏短高度、其他角色和异常网络仍分别验收，不再要求重复同一往返。 |
| 5 | iPad已取消强制全屏并构建安装，拖手柄却未产生window尺寸变化；来源取消 / 长名 / 偏好持久化有实现及定向回归。 | 实际resize与各来源真实UI操作保持待验；不得由配置或50项来源回归关闭。用户已停止投屏重复验证，不重新扩展该测试范围。 |

26包用户真机一起听及原生音乐控件报告单列，未给型号 / OS / 时长，不能据此关闭所有物理专项。27包真机、设备HDR / 硬解 / 吞吐、蓝牙 / 来电 / 系统挂起，以及Android / HarmonyOS真实互操作，仍是独立边界；ReplayKit发送依用户要求排除本轮。这些不应伪装为Simulator已经覆盖，也不应与已观察的起播、ASS字幕或后台切歌相互代替。

音乐有界失败补证：实际生产回调本地探针复现失败resolve后5个普通心跳将次数2→7。MusicPanel已保留adapter失败门控，seek失败不重建有效input、普通样本不继续纠偏，显式控制 / 切源仍可恢复；4项新运行时回归与相关合同共51 / 51通过。第12 / 13历史失败、第14 / 15包限定原生正向与剩余问题分记，不将JS模拟端口提升为听感或全部后台验收通过。

## 材料检查

本轮定向核对的正文与JSON未发现已知临时会话中的凭据值或JWT形态；feedback-build16及iPad26 / 27图已归档，全部所查本地Markdown链接可解析。扫描范围及计数见JSON，不能扩展为对全部历史仓库、截图像素或任意未知秘密的保证。截图仅归档已审核的clean文件，私有原片参考帧、完整媒体URL和原始日志仍在仓库外。

预存`docs/releases/client-v1.9.6.md`→`client-1.9.6.md`重命名状态未触碰。最终提交前仍由主任务核对实际diff、最终检查与提交号；后续改动若产生新事实，应同步更新本快照和总表。
