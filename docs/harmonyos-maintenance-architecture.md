# HarmonyOS 客户端维护文档

## 2.3.4 / 234 正式发行（2026-10-30）

用户已确认本轮“测试通过”，并授权提交源码及发布 Android / HarmonyOS 2.3.4。客户端源码更新至 main，正式版本统一为 2.3.4 / 234，发行见 [ZViewer-Client V2.3.4](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v2.3.4)及 [发行说明](releases/client-2.3.4.md)。本版包含下节全部 B站恢复、暂停意图、稳定同步、地址有效期、DASH 索引及鸿蒙代理生命周期修复。用户反馈未指定设备型号、系统版本或时长，不扩展为所有实体设备通过。

正式 HAP 位于 `release/client-v2.3.4/ZViewer-Client-2.3.4-harmonyos.hap`，最低 HarmonyOS 6.1 / API 23，沿用既有签名及授权要求；同目录提供 Android APK、构建日志和最终构建时各一次 SHA256，发布复用对应校验记录。依赖版本不变，临时签名材料不进入源码。修复阶段已通过 246 项回归、类型检查、双端签名构建及鸿蒙模拟器中断与暂停补测，详见 [B站恢复修复记录](bilibili-watch-recovery-2026-10-30.md)。下文 2.3.3 / 233 的本地证据保留，API 26 模拟器结果不代替 API 23 实体机验收；iOS 未改动或构建，NAS 与服务端未修改。

## B站一起看恢复修复（2026-10-30，本地验证版）

版本保持 2.3.3 / 233。共享播放器修复恢复次数终身耗尽和无截止时间的问题：正常播放推进 15 秒后重置预算，每轮最多四次、全过程最多 60 秒；手动画质保留选择并刷新，静默卡顿 20 秒触发恢复。挂载与解析可取消，旧房间、账号、影片或画质任务不能污染新状态。心跳与新观众完整同步使用稳定进度和用户暂停意图，恢复后广播最新便携源；过期音视频地址、多 SIDX 与字节区间同时修复。

ArkTS `BilibiliLocalProxy` 为每个候选请求补齐 `finally` 销毁，下游关闭、错误及发送失败立即取消上游，结算等待并忽略迟到回调。控制栏和中间双击共用显式播放意图，恢复中暂停立即同步，挂载完成不会自动续播。246 项回归、类型检查与双端签名构建通过；Pura 90 Pro（7.0 / API 26）原生模拟器三轮中断恢复及最终包手动 720P 恢复暂停补测通过，未做 6.1 实体机验收。安装包在 `release/bilibili-recovery-20261030/`，每包一次 SHA256；实施入口及证据边界见 [B站恢复修复记录](bilibili-watch-recovery-2026-10-30.md)。本轮仅本地构建与提交，未推送或发布 Release；iOS 未构建，NAS 与服务端未修改。

## 2.3.3 / 233 正式发行（2026-10-29）

本轮授权将全部 2.3.3 源码更新至客户端仓库 main，并发布 [ZViewer-Client V2.3.3](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v2.3.3)。正式 HAP 复用下节 `release/client-v2.3.3-portrait-lyrics-20261029/` 的最终签名包，包含全部横屏与竖屏修订；发布阶段复用构建时的 SHA256 记录。源码使用 GitHub 自动归档，发行说明见 [client-2.3.3.md](releases/client-2.3.3.md)。下文的本地、未构建和未发布表述记录各次迭代当时的状态，最终行为以本节及 [最终布局记录](listen-ui-2.3.3.md) 为准。169 项回归与双端构建已通过，本次没有新增真机 ArkWeb 验收。

## 2.3.3 竖屏歌词按钮与本地构建（2026-10-29）

竖屏罗马音、翻译图标移入歌词面板右下角，与音质标识共用 `PlayerLyricPanelShell` 页脚。移除面板上方独立按钮行及其样式，歌词面板向上扩展填满原按钮行占用的空间；图标继承歌词面板色调，页脚独立占位，不覆盖滚动歌词。歌曲信息与播放控制保留在下方。

本次安装包包含下节此前未构建的横屏、封面、图标和歌词渐隐修订，版本保持 2.3.3（233）。TypeScript/Vite 构建、161 项维护回归和 8 项工具栏/音质回归通过；受控真实组件验证 393×852、320×568、852×393、720×320 的页脚位置、歌词填充、按钮唯一性与无溢出，实际点击确认罗马音和翻译行能显示、隐藏并恢复。393×852 与 320×568 的歌词面板顶部均等于内容区起点 84 CSS px，下方歌曲信息无重叠。检查记录位于仓库外 `tools/portrait-lyric-footer-20261029/checks.json`；截图接口超时，回退捕获也未获得有效画面，本次不计入截图或真机 ArkWeb 验收。

HarmonyOS 签名 Release HAP 已构建，交付路径 `release/client-v2.3.3-portrait-lyrics-20261029/ZViewer-Client-2.3.3-harmonyos.hap`；同目录提供安卓签名 APK 与构建日志。原签名辅助脚本在 Windows PowerShell 5 下将普通编译警告视为终止错误，改用本机 PowerShell 7 执行后构建成功；构建后 `build-profile.json5` 已逐字节恢复。每个最终安装包仅计算一次 SHA256，记录在 `SHA256SUMS.txt`。本次仅本地构建和提交，未推送或发布 GitHub Release。

## 2.3.3 横屏与图标补充修订（2026-10-29，未构建）

低于 520 CSS px 的横屏顶栏由 76px 压到 52px，内容区顶部留白随之缩减（约多出 22px 给歌词和左卡），左右/底部内边距接入 `--app-safe-left/right/bottom`，避开挖孔、刘海与手势条；提示条位置随顶栏下移，卡片与歌词间距 20px→12px。播放页图标统一只保留图标：竖屏歌词模式的“罗马音/翻译”文字按钮改为与横屏一致的 CaseSensitive/Languages 图标，播放页各图标按钮移除 `title` 悬浮/长按名称，原信息并入 `aria-label`（含观众“申请”语义）。横屏歌词页脚补齐歌词层同款 45% surface 底色，消除页脚处的灰色色带。TypeScript 通过；受控 ListenTogetherPanel 在 852×393、720×320、915×412（模拟左 32px 挖孔与 16px 手势条）验证顶栏 52px、内容自 56px 起、安全区避让、无横向溢出，明暗两种外观及 393×852 竖屏歌词图标均检查；截图在仓库外 tools/listen-landscape-20261029/。未构建安装包、未真机验收。

小屏横屏恢复封面（取代 2.3.3 复核版“低于 520px 隐藏封面”）：有歌词时左卡改为网格，标题左侧显示 clamp(56px,20dvh,80px) 方形缩略图（cover 裁切），进度与五键仍占整宽，保持信息/进度/五键上中下三段；无歌词或手动收起歌词时左卡加宽至 min(760px,100%)，左列为整高方形封面（宽取 100dvh 减上下留白与 45% 卡宽中较小者），右列为信息、进度、五键。点缩略图收起歌词显示大封面，点大封面重新展开歌词。852×393、720×320、915×412（模拟挖孔）两态均无卡内滚动和横向溢出，1280×720 宽屏与 393×852 竖屏截图无变化。

按截图反馈，小屏横屏左卡（含无歌词大封面右列）不再把信息/进度/五键拉到上中下，改为一组固定间距（--lt-compact-gap：有歌词 clamp(6px,3dvh,16px)、无歌词 clamp(8px,4dvh,22px)）整体垂直居中，上下 1fr 空行吸收余量；间距用 margin 而非 row-gap，避免空行额外计间距导致 720×320 卡内溢出。歌词滚动层（`.music-lyric-scroll`）加上下渐隐遮罩（顶 20px、底 clamp(32px,14%,72px)），行在面板边缘与页脚处淡出而非硬切。852×393、720×320、915×412 两态均无卡内滚动。

## 2.3.3 界面复核修订（2026-10-28，未发布）

最终小屏横屏采用歌曲信息/进度/五键三段等间距分布；纯净视频恢复 MonitorPlay 图标。歌词增加顶部留白与内容尺寸观察，旋转和页脚变化后继续校正高亮行位置。

按截图反馈继续调整一起听：歌名独占整行并在溢出时滚动；下一行左侧歌手、右侧红心/歌词/评论，仅显示图标，歌词/评论页也保留。删除底部工具栏；更多仅由右上角控制，隐藏当前布局已展示的功能，加入底部滑入/退出与遮罩淡入淡出，并尊重减少动态效果偏好。低于 520 CSS px 的横屏隐藏封面，左侧显示歌曲信息与五键，右侧歌词/评论面板上下对齐；横屏纯净视频固定在更多左侧，无背景视频时禁用；罗马音/翻译图标与音质同处歌词框内右下角独立页脚。高度足够的横屏恢复封面。

TypeScript/Vite、161 项维护测试及 8 项工具栏测试通过；双端签名构建通过。受控真实 ListenTogetherPanel 在 393×852、320×568、852×393、720×320、1280×720 检查两行信息、溢出、封面阈值、横屏对齐、菜单去重与歌词/评论切换，明暗两种外观均检查。浏览器截图保存在仓库外 tools/listen-ui-refinement-20261028/，安装包在忽略目录 release/client-v2.3.3-ui-refined/；每包最终构建只记录一次 SHA256。本轮保留 2.3.3/233 版本号，本地提交，未发布、未改 NAS、未做真机验收，iOS 未构建。

## 2.3.3 / 233 一起听触屏界面改版（2026-10-28，本地验证版）

本轮按 P0 / P1 / P2 一起实施，详见 [一起听改版与验证记录](listen-ui-2.3.3.md)。歌词页保留进度与播放控制，小播放条整条点开/上滑展开且进度只读；歌曲行单击播放并提供显式菜单；队列改为贴底面板，清空需确认，支持拖动排序、键盘排序和左滑显示删除。常驻评论及队列入口各一个，按用户截图反馈去除重复；横屏同样采用精简工具栏。

三种常用播放模式轮换，兼容旧房间的按顺序播放/B站推荐连播并移入更多菜单；观众保留只读模式图标、控制权说明和申请回执，审批改为大按钮卡片。成员入口合并房主/本人/在线观众，展示同步回执；服务端未提供的其他用户头像或房主姓名使用文字头像/房主占位，不推断个人资料。设置分为外观与默认折叠的高级，歌词改为文字加粗淡化，音质移至独立页脚，网易云喜欢状态统一缓存并保护迟到响应。

TypeScript/Vite、161 项维护回归与 8 项工具栏回归通过。浏览器在 393×852 和 852×393 检查真实页面；受控真实组件另验证观众申请、审批、清空取消/确认、完整队列排序载荷和管理权限。Android/HarmonyOS Release 签名构建通过，安装包及一次 SHA256 在忽略目录 release/client-v2.3.3/。这些是浏览器、受控组件和构建结果，不等于真机触摸/后台播放或双实体设备同步验收。本轮本地提交，未推送或发布 Release，iOS 未修改或构建。

## 2.3.2 / 232 音量均衡与B站分P（2026-10-27）

用户已确认本地网页验收通过，并授权提交服务端PR、更新客户端main及发布Android/HarmonyOS。此前暂停发布的记录已由本条更新；2.3.1的Emby/Jellyfin界面适配一并进入本版。iOS未修改/构建，NAS未操作。

一起听设置页新增音量均衡，默认关闭；偏好和响度缓存每设备独立，不参与房间同步。19项设置与服务端逐项对照。使用上游K加权、-14LUFS目标，仅衰减最多12dB；用户音量独立保存，主播放与无缝预载使用相同增益。captureStream仅作静音分析支路，不接管媒体元素输出；捕获/建图失败回退，换曲、关闭及离房释放资源。真实设置组件验证开关、刷新保留、静音起播、关闭/卸载清理，数学及生命周期分支由回归覆盖；未做原生设备扬声器听感或后台响度采样结论。

B站多P按CID、每P名称与实际时长逐首导入队列，现有上一首、下一首及播完切换均可使用；房主/房管按顺序导入，离房/断线/失败停止批次。共享请求正确传入安卓Go/鸿蒙ArkTS本地解析器已支持的CID。服务端解析模式需要包含本轮PR的服务端，旧队列请删除旧整段条目后重新添加。详见 [分P修复与静音验收](bilibili-multipart-listen-2026-10-27.md)。

网页端补齐客户端已有的两项白屏修复：工具栏按正常流子项测高，防止侧挂队列触发side/sheet布局循环；空歌曲音质状态统一空值并以Object.is比较。展开播放器不再重复挂载底栏弹窗，竖屏不挂载桌面弹窗。两端实际组件在1280×900、1180×520、393×852、852×393各开关4轮；空队列、网易云3首、B站150首均无异常。示例150P真实本地API、Socket、CDN静音验证入队、上下首与片尾切P；依用户要求未做长单P长时间测试。

156项维护回归、8项工具栏/空歌曲回归、TypeScript/Vite、双端签名构建及签名验证通过；服务端Go全量、音乐22项和媒体17项通过。版本2.3.2/232，安装包在忽略目录release/client-v2.3.2/，各包仅在最终构建时计算一次SHA256，发布复用该记录。两端维护文档均已更新；无在线adb/hdc设备，浏览器和包验证不能替代WebView/ArkWeb实体设备实测。

## 2.3.1 / 231 Emby/Jellyfin 播放设置对齐（2026-10-27）

服务端指定目录最终同步至上游 `6d3c64b`，PR #36 已合入；收尾相对测试基线 `067b0fd` 仅新增 GitCode 发布脚本。按用户提供的「浏览器转码」截图，在影片「播放设置」内复用同一个 PlaybackOptionButton 胶囊组件增加 Emby/Jellyfin「服务器中转」，仅内网挂载隐藏。切换保存 directLink、稳定条目/版本 URL、格式及音轨，兼容 ms / MediaSourceId；最终 CDN 地址仅用于起播，不持久化。起播及观众重载刷新 movie-source，修复旧 HLS 格式和过期地址路径；复用已有保存/应用、播放位置和迟到请求保护，失败重试保留原模式。

详见 [最新服务端对齐记录](server-client-alignment-latest-2026-10-27.md)。120 项回归、TypeScript/Vite、双端签名 Release 构建及签名验证通过，临时鸿蒙签名配置已恢复；浏览器真实片单检查同款样式、320/420px 容器、双向保存与失败重试、版本保留、内网隐藏和观众禁用。安装包及各一次 SHA256 在忽略目录 release/client-v2.3.1/。本轮仅本地提交，未推送/发布、未部署 NAS、未新增 ArkWeb 实体设备听音验收，iOS 未修改或构建。音量均衡仍为可选未移植功能。

## 2.3.0 / 230 亮度与投屏音量手势（2026-10-27）

用户已确认 2.2.8 一起看手势通过，本版合并发布。一起看与投屏（WebRTC / OBS-FLV）新增左侧上下滑调当前 App 窗口亮度；投屏新增右侧上下滑调本机播放器音量。亮度 5%–100%、音量 0–100%，手势显示百分比；不改变发布端或房间音量。窗口亮度在全屏切换时保留，离开播放器后恢复原值；不修改系统亮度设置。一起看原有进度/双击及观众申请流程、投屏直播不跳进度和全屏双击暂停均保留。

按 [实现与验收记录](player-level-gestures-2.3.0.md)，Android / HarmonyOS 原生亮度桥、串行更新与播放器所有者恢复已接入，取消/退出不继续应用迟到读取。106 项回归、TypeScript/Vite、双端 Release 签名构建通过；真实播放器浏览器夹具验证了 MP4、MediaStream、HTTP-FLV 解码及手势，并记录亮度恢复、全屏保持和音量同步。原生亮度为受控桥边界，adb / hdc 无设备，没有新增背光/真机触摸/听音验收。安装包和各一次 SHA256 在忽略目录 release/client-v2.3.0/，发布复用该摘要。iOS 未修改或构建，NAS 未部署。

## 2.2.8 / 229 一起看手势与新服务端兼容（2026-10-27，本地签名验证版）

本地服务端已从 GitHub upstream/main 快进至 9e62237。按 [增量检查与实现记录](server-client-alignment-2026-10-27.md)，44 个网易云调用路径均保留；共享 musicApi 兼容 message / msg、隔离云盘上传的网易云账号 401，并将普通 503 与旧服务器明确的 NCM_UNAVAILABLE 区分。桌面组件按需下载不需要手机适配；非音乐 HTTP / 一起看 Socket 合同未见本轮变更。

一起看移除控制栏及“更多”菜单的隐藏按钮与旧隐藏模式。单击视频显隐控制栏；左侧双击后退 15 秒、右侧前进 15 秒、中部播放/暂停，普通窗口和全屏均适用。横向拖动预览进度、松手提交一次；右半边纵向滑动调本机播放器音量。观众仍申请控制，房主沿用同步链；多指、取消、换源、权限变化与卸载不提交迟到跳转。关闭 ArtPlayer 默认触摸跳转，touch-action 仅作用于视频表面，保留设置面板滚动；一起听手势未改。

97 项维护回归、TypeScript/Vite、Android 与 HarmonyOS Release 签名构建通过，版本统一 2.2.8 / 229；签名验证通过，鸿蒙临时配置已恢复。实际播放器组件在浏览器中解码 180 秒合成视频并完成显隐、双击、拖动、音量、控制按钮、全屏与观众本地不越权检查。原生桥和房间请求为受控边界；adb / hdc 无设备，没有新增真机触摸/听音或实际多端同步验收。安装包及各一次 SHA256 在忽略目录 release/watch-gestures-20261027/。未推送/发布、未部署 NAS、未修改或构建 iOS。

## 2.2.7 / 228 OBS 观众兼容修复（2026-10-26，正式发布）

旧客户端以发布码拼接 FLV 地址，服务端停止向观众下发发布码后会显示“推流密钥未获取”。发布码长度调整本身不影响观看；新版继续使用房间准入后的独立观看票据，MobileRoom 与 StreamPushViewer 移除遗留 streamKey 参数，观看不获取 OBS 发布配置。失败展示服务端原因和“重新连接”，重试废弃旧请求，切房/切服/禁用或退出后旧响应不能恢复播放；观看地址校验目标房间和非空票据，绑定请求开始时的连接及路径前缀。FLV 不降级到通用代理或发布码地址。

83 项维护回归、类型检查/Vite、Android 与 HarmonyOS Release 签名构建通过，统一为 2.2.7 / 228。真实本地 Go 服务与 Socket.IO 验证无发布码观众的准入拒绝及批准；ego-browser 操作实际 StreamPushViewer 的重试按钮后解码 H.264/AAC 直播，640×360、readyState=4，帧数和播放时间持续增加。用户先确认 OBS 发布端通过，随后确认 2.2.7 客户端复测通过并授权发布；该反馈不扩展为所有设备、公网或后台场景验收。iOS 未修改或构建。

签名与 31 项网页资源逐项比对通过，沿用既有签名、非 Debug、无 Agents.md/私有签名源文件；临时鸿蒙签名配置已恢复。安装包与各一次 SHA256 在忽略目录 release/client-obs-viewer-20261026/；正式发行见 [ZViewer-Client V2.2.7](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v2.2.7)，源码同步 main。

## 2.2.6 / 227 资源权限与图片合同修复（2026-10-26，本地验证版）

按 [客户端实施记录](resource-remediation-2026-10-26.md) 同步服务端 S01～S15：Emby/Jellyfin 相对封面与签名能力、当前原生取图通道及有界续签；网易云剩余头像/弹窗图片统一规范化；推流观众领取独立观看票据，拒绝后不回退发布密钥；本地影片按 movieId 播放；字幕 413/超限与权限失败在选轨前处理并保留旧字幕。服务端同址挂载按明确 sourceMountId 绑定，删除/改密不静默换账号。原有 B站封面、NCM 错误分流、退出保留输入及播放策略继续保留。

81 项共享维护回归、类型检查/Vite、Android/HarmonyOS Release 签名构建通过；版本统一 2.2.6 / 227。APK/HAP 各 31 个网页资源匹配，签名校验通过、非 Debug、签名身份沿用；临时鸿蒙签名配置已恢复。安装包与一次 SHA256 记录在忽略目录 release/resource-remediation-20261026/。仅本地构建，未发布 GitHub Release；iOS 未修改或构建，Android/HarmonyOS 实体设备通知栏/锁屏/穿透仍待验收。

## 2.2.5 / 226 正式发布与退出登录输入保留（2026-10-26）

共享入口 src/App.tsx 登录成功后保留账号/密码字段；退出时删除活动会话及令牌、断开连接和清理房间状态，字段留在当前 App 内存，密码显示恢复隐藏。再次登录须主动提交，不自动重新认证。恢复上次会话时从用户信息回填已知用户名；密码不新增落盘保存，重启后未知密码仍为空。

scripts/login-session.test.mjs 执行实际 App 的登录/退出处理器，覆盖保留输入、清令牌与会话、隐藏密码、退出不自动重登、显式重登，以及恢复会话后保留用户名。与既有维护回归共 76 项通过；TypeScript/Vite、Android/HarmonyOS 2.2.5 / 226 正式签名构建和包内容检查通过，沿用既有签名。最终包各只计算一次 SHA256，发布复用构建记录。构建证据在忽略目录 release/client-v2.2.5/。

用户已确认此前一起听、一起看、投屏整体测试及 2.2.3 的 B站封面修复测试通过。新增登录修改使用共享处理器回归与构建验证，没有将其记为新增实体设备验收。本轮不修改或构建 iOS。2.2.2/2.2.3 为本地测试构建，统一随 2.2.5 发布。

更新日期：2026-10-26（Asia/Shanghai）。本文是日常维护入口，已整合原发布、连接修复、服务端对齐与屏幕共享文档。历史运行证据和当前源码检查分开记录。

## 2.2.3 / 224 一起听 B站封面跨设备修复（2026-10-26，本地测试版）

用户反馈上一版整体播放的一起听、一起看、投屏等均通过；本次单独修复 B站选曲页有封面、展开播放器与系统控件无封面的问题，不将上一版验收算作本修复的实体设备验收。

- 本机 GUI 数据库只读检查确认，B站队列保存了 localhost 的图片代理 URL；手机收到后请求的是手机自身。网页选曲页临时代理化正常，入队后地址失去跨设备可用性。服务端原样持久化/下发，客户端也未重绑当前连接，双方共同修复。
- shared music/utils/neteaseImage.ts 新增 portableMusicCoverUrl：从历史 localhost、私有通道、相对或嵌套 proxy-image 中取出合法 B站原图；入队、推荐、控制申请及试听使用原图。store 不再把本机代理地址存入队列。
- 展开播放器、底栏、SongRow 和 systemArtworkUrl 在展示/系统媒体更新时按当前 getApiUrl 代理化，保留路径前缀和图片裁剪参数，重连不复用旧端口/通道。网易云 HTTPS/尺寸规则保留，其他来源不擅自改写。
- Go 服务端写队列与构造广播/get-state DTO 同步规范化；历史记录读取时修复应答，不批量覆写用户数据库。图片接口与白名单、音频解析/同步规则保留。服务端仍只本地修改，未提交 PR。

验证：74 项客户端维护回归通过（封面 10 项）；含队列身份保留、旧代理、路径前缀、本机连接通道变更和系统媒体地址。隔离 Go 服务与两个 Socket.IO 客户端验证入队、广播/get-state、新落库，图片代理实测 200 image/jpeg、53,737 字节。浏览器真实 PlayerCardFace 解码 781×439；真实 useSystemMediaSession 在受控原生桥边界传出相同 URL，独立 HTTP 读取成功；尚未新增 Android/HarmonyOS 实体设备通知栏/锁屏验收。

TypeScript/Vite、Android Debug APK 与 HarmonyOS 未签名 Debug HAP 构建通过，版本统一 2.2.3 / 224。安装包在忽略目录 release/music-artwork-20261026/，每个最终包仅计算一次 SHA256。GUI 同步位置 E:/Codex-bulid/zviewer-windows-x64-GUI；保留配置、数据库与证书。未发布、未推送、未操作 NAS、未修改或构建 iOS。一次性验证文件在仓库外 tools/music-artwork-20261026/。

## 2.2.2 / 223 服务端 Go 合同对齐（2026-10-26，本地验证版）

本轮按 [对齐方案](server-client-alignment-2026-10-26.md) 实施 S01/S02 配合与 A01/A02/A03/A05；服务端修改保留在本地，暂不提交 PR。GUI 音乐故障根因是 Go 迁移把 NCM 外部化后，打包和启动链路漏带组件，默认扫码接口 503。已记入服务端仓库的修复说明和后续 PR 待办。

- music/musicApi.ts 统一保留音乐 HTTP/业务错误，服务不可用时显示提示与重试；重试重建内容页，首页一次加载门控可重新执行。503 不清 App/网易云登录，第三方音乐 401/403 不刷新 App 会话。扫码错误停止动画并提供重试，异步取消、轮询并发和有限失败保护生效。
- 直链解析保留 status/code/message，失败停止，不使用固化旧签名或切服务器代理；上游挂载 AUTH_FAILED 不刷新 App 登录。保留 noProxyFallback。
- 广播状态构建传递 epId/seasonId/seasonTitle/preview；观众以影片 DTO 明确策略兜底。服务端 Playback 指针布尔与可空 metadata JSON 列保证显式 false、心跳/ACK/恢复及换源清理；旧库只增列，不重建旧行。
- 影片转预览时不执行 currentMovieId:null 的媒体清理；预览取消旧下载，迟到完成不播放/广播，删片清完整源快照。
- Android ResolveMobile 与 HarmonyOS PGC MP4 默认请求 64，手动/恢复低档仍受尊重；本机 UGC 与 DASH 的账号/设备规则不一概改成 64。界面说明改为默认请求 720P，实际以片源返回为准。
- 管理设置补 updateUseGitCode 可选类型；未新增移动后台或音量均衡，iOS 未修改/构建。

验证：TypeScript/Vite、既有 66 项维护与新增 3 项对齐回归通过；Android Debug APK（独立 .debug）和 HarmonyOS 未签名 Debug HAP 编译通过。浏览器受控接口确认离线提示、账号保留、恢复后二维码图像加载；真实 useWatchTogether 配合受控媒体加载器确认影片转预览清理次数为 0。Ego 窗口最小化导致截图不可用，未登记截图验收。服务端 Go 全套测试、权限矩阵、旧库增量迁移、26 组合同检查通过；189 条路由探测只证明路径存在。随包 NCM 实际取得 key/PNG、轮询 801，未扫码登录。

安装包位于忽略目录 release/alignment-20261026/，每个最终包仅计算一次 SHA256。没有设备安装/实体设备媒体验收，没有发布 Release、推送源码、提交服务端 PR 或连接 NAS。GUI 更新位置为 E:/Codex-bulid/zviewer-windows-x64-GUI，保留原数据库、配置与证书。

## 2026-10-26 服务端接口增量检查

已完成 [服务端增量检查与客户端对齐方案](server-client-alignment-2026-10-26.md)：从上次完整适配的 v4.7.4 `e3af086` 检查至上游 main `a34db94`，并区分 2.2.1 已同步的后续功能。旧 HTTP/Socket 路径和事件名保留；隔离检查确认 Go 权威播放快照丢策略字段，以及继承自 Node 的 B站 movieId 代房主解析缺少房间准入校验。NCM 外部依赖、音乐不可用提示、直链错误分流、MP4 本机策略和预览清理列有后续方案。

本次仅检查与文档更新，Android/HarmonyOS 仍为 2.2.1 / 222，未实施适配、构建安装包或增加设备验收。当前本地服务端在 `56eb51c`，比上游目标多两条桌面 Cloudflare 提交，`backend-go/` 与 `frontend/src/` 和审计目标一致；不代表 NAS 已更新。

## 2.2.1 歌单布局、自动起播与封面修复（2026-10-25）

用户已反馈上一轮维护功能“经播放测试无问题”，并授权由助手自行验收界面后发布。本次 Android / HarmonyOS 统一为 **2.2.1 / 222**，目标 Release 为 [ZViewer-Client V2.2.1](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v2.2.1)，发行说明见 [2.2.1](releases/client-2.2.1.md)。不将浏览器检查记为实体设备验收；iOS 保持 2.1.10 / build 31，没有启动构建。

- `music/pages/MusicMyPage.tsx` 删除详情历史栈和前进／后退箭头，保留“返回列表”。封面信息区不再保留收藏／下载占位，手机端缩短播放全部区和列表的上间距；触摸按钮最小 44px。返回列表、重新选歌单、长标题、列表滚动和歌曲操作继续可用。
- `music/hooks/usePlaylistPlayback.ts` 与 `music/playlistPlayback.ts` 共用歌单／每日推荐的播放全部链路：每首按顺序发送 `music:queue-upsert`，首曲收到成功 ACK 后调用既有 `playSong`，其余歌曲继续加入。首曲只入队一次，首次确认前不抢播；8 秒 ACK 超时或拒绝时停止并报告已加入数量。连续点击受 busy 锁保护，换歌单、换推荐日期、身份/房间/socket 变化、卸载或断连时不再开始后续操作。每日推荐不再调用可能暂停当前曲且重复入队的 `handlePlayRow`。
- 封面诊断：每日推荐 `mapSong` 原样保留了网易云的 HTTP 图片，而 SongRow 在列表展示时自行改为 HTTPS；完整播放器与底部条直接读队列原值，导致安全资源页的加载路径不一致。公开歌曲元数据查询确认截图对应歌曲返回 HTTP CDN 地址；同一图片 HTTPS 响应 200，浏览器实际解码尺寸 600×600。
- `music/utils/neteaseImage.ts` 的 `musicCoverUrl` 只规范网易云 CDN，升级 HTTPS 并替换已有 `param`，保留其他查询参数。每日推荐映射、队列入口、完整播放器、底部条与 SongRow 共用；B站图片代理、鉴权查询和本地资源不改写。`MusicCoverImage.tsx` 在失败后显示音乐占位，按封面 key 重挂载，避免破图与旧错误污染新曲；仅网易云图片使用 no-referrer，不放宽宿主混合内容或证书策略。

验证记录：`npm run test:maintenance` **66/66**，TypeScript/Vite 与双端资源同步通过。真实 MusicMyPage 在 320 / 393 / 768 / 1024px 视口下无横向溢出，历史切换箭头为零；播放全部按钮至少 44px，普通手机布局中封面底至按钮顶约 14px。夹具 ACK 验证 54 首按序入队、首曲起播一次；每日推荐夹具也验证了实际 HTTP 元数据经映射、入队、起播回调到 HTTPS 封面组件的链路，以及破图占位和重新加载。远端队列 ACK 由夹具模拟，浏览器图片请求为真实 CDN 请求；这些结果不证明新增功能已在实体设备听音验收。

正式构建：Android `assembleRelease`、HarmonyOS Release `assembleHap` 均通过，APK/HAP 签名检查成功并与 2.2.0 保持相同身份。Android 为 `com.zviewer.mobile` / API 24 / target 36；鸿蒙 debug=false、最低 6.1.0(23)。两包分别为 **76,769,577 / 14,335,026 字节**，各 31 项 Vite 资源核对一致（鸿蒙按注入桥接后的 HTML）；源码及包内未发现账户凭据、Agents.md 或私有签名源文件。临时鸿蒙签名配置已恢复，每包仅构建后计算一次 SHA256，后续上传复用摘要。安装包及本机检查输出保存在忽略目录 `release/client-v2.2.1/`。

## 2026-10-25 日常维护与上游更新

相邻服务端源码已从 `0af85d0954bb5a71bd0b6225b5a1322c1f8815fb` 快进更新至上游 main `6f1e092920f4826e6296b25e42e5296d1379a53c`，共 17 个提交。原工作区干净，在指定服务端目录中执行 `git fetch --no-tags upstream main`、`git merge --ff-only upstream/main`；保留本地配置、数据库和运行数据，不另建旧源码备份。本地源码更新不代表 NAS 已部署。

### 双端共享代码与鸿蒙边界

- `src/upstream/modules/music/personal-fm.ts` 将历史去重缩为最近 12 首；候选耗尽后补拉一次并允许历史重复，继续排除当前曲和池内重复。`MusicFmPage.tsx` 的手动下一首同步使用此兜底，异步返回仍校验 generation，旧模式或旧房间不能提交。
- `music/fm-recovery.ts`、`hooks/useListenTogether.ts` 对补拉/入队确认失败实行 2 / 5 / 10 秒有界重试；房间、房主、当前曲、generation 任一失效即不恢复。暂停、seek、换曲、换模式、离房、换 socket 会取消旧任务；成功 ACK 前不消耗候选。媒体错误可自动跳过，一分钟最多 4 次，连续失败达到上限后关闭自动续播。播放意图独立于媒体事件，手动暂停后的迟到错误不能跳歌或起播。现有 ArkWeb 元素挂载、后台播放租约、原生 AVSession 与通知栏逻辑保留。
- `screen-sharing/components/WebrtcWatchPage.tsx` 订阅真实 video 的 `volumechange` 并在换元素/换流时重绑，防止实际静音与控制栏不同步。有远端音轨且静音时显示“点击开启声音”，在点击手势内尝试取消静音与播放；旧监听随元素退役清除。此为观众共享前端修复；宿主屏幕采集、系统音频、麦克风协调及 `MobileScreenShareHost` 的原生能力提示继续沿用既有平台桥。
- `room/roomShareLink.ts` 先经 `logicalConnectionUrl` 从随机本机回环通道还原真实服务器，保留路径前缀、编码 roomId，并清除账号、查询参数及 hash。`RoomInfoPanel.tsx` 对该逻辑链接提示内网范围，可选择“仍然复制”。鸿蒙资源宿主 `https://zviewer.local` 和 `ServerConnection.ets` 的私有回环端口均不得进入对外分享链接。
- `lib/netAddress.ts` 分类 IPv4 私网、回环、链路本地、CGNAT、IPv6 ULA/链路本地/IPv4-mapped 及常见本地域名；URL 规范化覆盖展开 IPv6 和十六进制映射。只做地址字面提示，不执行 DNS 探测，不承诺域名已可从公网访问。

上游的 B站 CLI 去重、Anime 组件目录重构和桌面组网代码本轮未整体覆盖双端定制实现。后端 CMS ResolveCache / URL 辅助整理未改变所查 REST/Socket 合同；删除的 `embeddedSubtitleEnabled`、`voiceTransportMode` 历史字段不被当前共享源码读取。上游新音量均衡使用 captureStream 旁路测量和音量增益，本轮双端未接入；需要另行验证 ArkWeb/WebView 支持、锁屏后台、用户音量及听感，不能把本轮称为上游全部新功能移植。

### 本轮验证与可复现构建

| 检查 | 结果与边界 |
| --- | --- |
| 服务端 | backend 编译、15 项媒体、10 项音乐回归通过；隔离临时数据库下 89 项基础、16 项边界、23 项额外同步检查全部通过，代理和持久化服务测试通过。本地服务已由测试脚本关闭，未修改 NAS。 |
| 共享回归 | `npm run test:maintenance` 54/54 通过：FM 去重与 ACK、恢复/取消、暂停后的迟到错误、逻辑分享链接、B站音轨、后台可见性、沉浸租约及手势；TypeScript/Vite 构建通过。 |
| 双端包 | Android Debug assembleDebug、HarmonyOS Debug assembleHap 均通过，网页资源来自同一 Vite 输出；鸿蒙 HTML 按 sync-web 注入桥接后检查。Android 为 `com.zviewer.mobile.debug` / API 24，鸿蒙为 `com.zviewer.mobile` / 6.1.0(23)。两端保持 2.2.0 / 221。 |
| 鸿蒙签名 | 本轮没有注入签名材料，输出 debug=true 的 unsigned HAP；未经有效签名不能直接安装。编译成功不能代替 ArkWeb 运行或实体设备验收。 |
| 浏览器 | 真实 RoomInfoPanel/WebrtcWatchPage 在本机夹具中完成内网提醒及确认复制、公网与原生回环地址还原、video 静音事件更新按钮和开声提示检查；远端轨道为模拟状态，无真实解码或听音结论。 |
| 尚未完成 | adb / hdc 无设备；本轮未新增真机验收、未推送/发布 Release、未部署 NAS、未修改或构建 iOS。旧 2.2.0 用户验收只覆盖当时发布代码。 |

命令入口：共享代码执行 `npm run test:maintenance`、`npm run android:sync`；同一次 Vite 输出再运行 `node ZV-HarmonyOS/scripts/sync-web.mjs`。在 `ZV-HarmonyOS/` 工作目录中使用本机 DevEco 工具，执行 `hvigorw --mode module -p product=default -p module=entry@default -p buildMode=debug assembleHap --no-daemon`。本机通过 `DEVECO_SDK_HOME`、`NODE_HOME` 指定已安装的 SDK/Node，不把路径或签名材料写入工程；在客户端根目录执行 Hvigor 会因缺少 `hvigor/hvigor-config.json5` 失败。

本轮包集中在忽略目录 `release/daily-maintenance-20261025/`，文件为 `ZViewer-Android-2.2.0-maintenance-debug.apk`、`ZViewer-HarmonyOS-2.2.0-maintenance-debug-unsigned.hap`。最终包内网页资源与宿主生成目录逐字节比对，鸿蒙使用转换后的 HTML；每个最终包构建后只计算一次 SHA256 并保存摘要。完成后在指定客户端仓库本地提交。

实体补验：房主漫游跨页面持续补拉、临时断网恢复、无版权/坏源自动跳过；在重试前暂停/seek/换曲/换模式/离房，确认不被迟到回调恢复；验证锁屏后台及通知栏控制。再测共享观看静音/开声，以及 HTTP、证书通道、路径前缀下对外复制真实服务器链接。最低系统仍为 API 23，API 26 模拟器结果须单独记录。

## 2.2.0 发布与真机验收记录

2026-10-23 用户明确反馈“真机验证通过”，并要求提交源码及发布 2.2.0。该反馈登记为本轮双端界面与播放修复的用户验收；未补写具体设备型号、系统版本或测试时长。此前各轮“待真机验证”属于当时状态，历史记录保留。本次正式包与已验收代码保持相同业务逻辑，统一版本为 2.2.0 / versionCode 221。

发布目标为 [ZViewer-Client V2.2.0](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v2.2.0)，源码提交至 main，标签为 `client-v2.2.0`；仅发布 Android / HarmonyOS，iOS 保持 2.1.10 / build 31，未启动 IPA 构建。发行说明见 [2.2.0](releases/client-2.2.0.md)，源码使用 GitHub 自动归档，不另附手工源码压缩包。

正式构建及检查：TypeScript/Vite、双端资源同步、32 项音轨/后台可见性/显示租约/滑动切歌回归、Android assembleRelease 与 HarmonyOS Release assembleHap 均通过。APK 版本 2.2.0 / 221、正式包名 `com.zviewer.mobile`、最低 API 24，v2 签名与上一正式版一致且非 Debug；HAP 为 2.2.0 / 221、debug=false、最低 HarmonyOS 6.1 / API 23，verify-app 与上一版证书链一致性通过。两包各 31 个前端资源与本次输出一致；鸿蒙 HTML 按同步脚本注入原生桥后比对。公开源码及包体未包含账户凭据、Agents.md 或私有签名源文件，临时鸿蒙签名配置已恢复。

最终安装包保存在 `release/client-v2.2.0/`：`ZViewer-Android-2.2.0-release.apk` 为 76,767,409 字节，`ZViewer-HarmonyOS-2.2.0-release.hap` 为 14,330,925 字节。每包仅构建后计算一次 SHA256，后续上传复用 `package-metadata.json` 与 `SHA256SUMS.txt`，不重新计算。正式包检查独立于此前 Debug 包及用户真机反馈。

## 当前基线与目录边界

| 项目 | 当前基线与使用规则 |
| --- | --- |
| Android / HarmonyOS | 2.2.1 / versionCode 222；当前维护与发布证据见文首，用户播放反馈、浏览器检查与正式包验签分别记录。 |
| iOS | 独立 `ZV-iOS/` 工程，2.1.10 / build31；详见 [iOS 维护文档](ios-maintenance-architecture.md)。 |
| 客户端仓库 | 所有客户端源码、文档与 Git 操作均在本仓库；共享前端为 `src/`，平台分派为 `src/platform/`。 |
| 服务端源码 | 2026-10-26 核对本地 `56eb51c`：后端及网页源码与上游 main `a34db94` 一致，另有两条桌面 Cloudflare 提交；见 [接口增量检查](server-client-alignment-2026-10-26.md)。新一轮客户端适配尚未实施，NAS 部署未核实。 |
| CLI 源码 | 相邻 `ZViewerCLI-4.1.2/` 保留原目录名，内容已更新至上游 v4.5.5 / main `101659b01a3a9248cea8b32c7eb18b6f76d842f1`，目录名不代表内容版本。 |
| 已完成的双端协议对齐 | 最近实现基于服务端 v4.7.4 `e3af086c7bd98ee0d4697386b69678f92ea54d81`；本次更新只拉取源码，未新增兼容性或设备验收结论。 |

共享 UI 与业务写在 `src/upstream/`、`src/mobile/`，平台能力经 `src/platform/` 调用。不能整体复制服务端 frontend/backend 覆盖客户端，也不能直接修改生成资源代替改源文件。Android、ArkWeb、iOS 原生结果分别验收。

相关入口：[Android 维护文档](android-maintenance-architecture.md)、[HarmonyOS 维护文档](harmonyos-maintenance-architecture.md)、[项目说明](../README.md)。


## 架构与源码入口

| 功能 | 维护入口与约束 |
| --- | --- |
| 宿主启动和 ArkWeb 生命周期 | `ZV-HarmonyOS/entry/src/main/ets/entryability/EntryAbility.ets`、`pages/Index.ets`；页面创建 `zviewerHost` 并注入 `window.zviewerNative`，加载生成的 `rawfile/web`。 |
| 连接与网络路由 | `services/ServerConnection.ets`、`src/platform/connectionTransport.ts`、`serverConnection.ts`；按已选服务器建立安全通道，原生持有连接状态与证书。 |
| B站解析和本机代理 | `services/BilibiliResolver.ets`、`BilibiliWbi.ets`、`BilibiliLocalProxy.ets`、`BilibiliCredentialStore.ets`；分别维护签名、UGC/PGC 解析、本机媒体代理与凭据生命周期。Cookie 不回传 WebView 或广播。 |
| 播放器与系统媒体 | `services/NativeMediaSession.ets`、`src/platform/mediaSession.ts`、`playerDisplay.ts`、`lifecycle.ts`；维护媒体会话、音频焦点、方向/沉浸栏和页面/房间退出清理。 |
| 共享界面和业务 | 根目录 `src/App.tsx`、`src/upstream/`、`src/mobile/`、`src/platform/`；HarmonyOS 通过平台契约分派能力，避免在共享 UI 中直接调用 ArkTS。 |
| 更新入口 | `src/mobile/AboutApp.tsx`、`src/mobile/appUpdates.ts`、`ExternalLinks` 平台能力；HarmonyOS 入口显示宿主版本并打开正式 Release 下载地址。 |

共享业务仍需遵守移动端房间权限、播放器异步取消、真实媒体身份与本机代理 URL 分离等约束。原生 ArkTS API、WebView 注入、权限与系统媒体行为只在 HarmonyOS 工程验证，不能用 Android 插件或 iOS Expo 模拟替代。

### ArkWeb 与平台桥的完整路径

根项目 `npm run harmony:web` 先以相对资源路径构建 Vite，再由 `ZV-HarmonyOS/scripts/sync-web.mjs` 复制到 `entry/src/main/resources/rawfile/web/`。`Index.ets` 将这些文件通过固定虚拟来源 `https://zviewer.local` 提供给 ArkWeb；`scripts/bridge-bootstrap.js` 在 React 启动前完成 `zviewerHost` 握手，暴露共享前端需要的 `window.zviewerNative`。修改桥接时核对 `src/platform/contracts.ts`、bootstrap 的 action/超时/错误、`Index.ets` 分发以及具体 service 的返回数据。固定来源与本地资源路径校验是安全边界，不能为了播放外部媒体而放开任意网页导航。

原生能力包括应用生命周期、返回键、麦克风权限、服务器连接、B站登录/代理、播放器方向与沉浸模式、系统媒体信息及下载页系统浏览器。共享组件只调用 `src/platform`，不要在 React 组件直接写 ArkTS 特例。ArkWeb 网络、DOM 与设备系统解码器与 Android WebView 不同，同一 `dist` 仍要分别安装验证。

## 服务器连接与凭据

### HTTP、HTTPS与原生通道

修复截图中的“连接地址已显示 HTTP，但游客登录提示无法连接服务器”。旧版 ArkWeb 请求失败后，公开设置可以由原生 HTTP 探测兜底；后续登录和 REST/Socket 没有同一路径保障。`ServerConnection.ets` 现在将已有的单服务器回环通道扩展到 HTTP：HTTP 上游使用 `TCPSocket`，HTTPS 证书例外使用 `TLSSocket`，分别按 SDK 的参数格式连接与发送；随机路径、宿主/Origin 限制、Cookie 隔离、流式与 WebSocket 转发继续共用。常规 HTTPS 不改变证书策略，最低系统仍为 6.1.0(23)。空地址且关闭证书例外会关闭监听、活动连接与 Cookie。

共享 `connectionTransport.ts` 补齐 `ws:` 映射；`serverConnection.ts` 对证书通道 502 先做无凭据原生诊断，只有明确 TLS/端口不可用才尝试 HTTP。`App.tsx` 登录复用已确认的地址及通道，地址、模式、证书选项变化会清除该选择。逻辑 HTTP 地址持久化，随机回环地址不进入房间广播或存储。问题证据、双端运行验证和本地包见 [内网连接修复验证](#历史验证与待验边界)。本次统一版本为 2.1.10 / 220，正式安装包已发布，构建记录位于 `release/client-v2.1.10/`；模拟器验证与用户实体手机验收分别记录。

探测不带账号凭据；证书例外仅绑定当前服务器origin，外部媒体CDN及独立语音服务器继续严格校验证书。退出、换账号、切服、关闭例外时清理Cookie、回环通道及旧代次。持久化和广播使用逻辑服务器URL，随机127.0.0.1端口及能力路径只在本机使用。账号密码、Cookie、token、二维码、原始日志和签名材料不得纳入源码。

## 影片、播放策略与跨来源同步

### 片级播放设置与媒体应用事务

本轮基线为服务端 `e3af086c7bd98ee0d4697386b69678f92ea54d81`。新增 `PlaybackOptionButton.tsx` 与 `MovieRuntimeSettings.tsx`：非 B站影片卡使用图标＋粗体中文的独立胶囊按钮，保留服务器中转与浏览器转码两个布尔值；添加面板按用户后续要求恢复 `PlaybackOptionToggle.tsx` 的说明卡＋滑动开关，沿用原草稿默认值与来源可见性。按用户后续反馈将可见胶囊缩为 32px、文字 12–13px、图标约 13–14px；`PlaybackOptionButton.css` 通过所在面板容器宽度（cqw/clamp）和字体比例适配窄屏/分屏，允许整按钮换行。外层触摸高度保留 44px，展开标题图标缩为 14px，不全局缩放其他控件。胶囊开启时使用 primary 实心填充、on-primary 对比色和勾选图标，关闭为表面色描边；勾选位预留宽度避免状态变化时跳动。影片卡默认折叠；屏幕共享隐藏，观众只读，写入要求当前分享端且具 root/持久房间所有者权限，REST 鉴权仍由服务器执行。

最终对齐由 `.playback-option-content` 对称预留半个勾号区域：左侧图标固定，文字与图标垂直居中；关闭时文字在图标右侧剩余区域居中，开启时文字左移半个勾号区域并显示右侧勾号，按钮宽高和图标边界不变。普通状态过渡 160ms，减少动态效果时接近即时切换。320/393/768px、100%/130% 字体、深浅主题、系统字体与实际载入的华文行楷共 24 组实测通过；字体行框与图标垂直中心误差小于 0.004px。该结果为实际组件浏览器几何验证，不能替代 ArkWeb 宿主或鸿蒙真机验收。

`roomStore.saveMoviePlaybackSettings` 只 PUT 改动字段，确认响应 Movie（兼容旧响应时 GET），按房间会话、逻辑服务器、事务令牌保护。`setMovies` 暂存保存中的策略，已确认值与无版本广播冲突时 GET 权威片单；GET 请求代次和 saving 阶段快照拒绝迟到结果。保存与媒体应用状态分开，当前影片交给 `useWatchTogether` 的完整源标识重载；非当前影片只保存。应用保留时间、倍速、暂停意图，成功 attach 后才写入可广播播放状态。失败保留新设置，停止失败管线、广播上次成功源的暂停态并显示重试；换片、离房、身份变化和旧回调失效，不反向 PUT 自动回滚。

ani-subs 返回明确片级转码值；Kazumi 采用元数据解析并兼容旧 HTTP(S)/代理记录，拒绝 `kazumi://` 占位地址作为回退媒体，保留必要源站头并剥离添加者的服务端凭据。Kazumi/CMS 代理使用相对地址，经本机所选服务器、路径前缀与原生连接通道完成鉴权，避免固定到添加者入口。观众以广播 `noProxyFallback` 对中转双向协调，保留片级 false、清理旧音轨/编码。

B站 JSON/NDJSON/CLI 接收 `isHdr/hdrType/videoCodecid`，按真实 codec/profile 做三态能力预检；明确不支持时保留旧引擎与档位，缺字段或探测不可用按未知处理。手动本机选档先解析预检再确认，旧会话结果不提交。仍保留普通 SDR/AVC/AAC 策略与原有 HDR/Dolby 过滤；手动 HDR 和音乐背景 HDR 按执行文档 B01 后置，未获得真实设备显示验收。`desktopManaged` 类型项 B02 本轮未实施。

语音 `transport.ts` 监看实际活动 publisher/subscriber PC/ICE，加入、重连与中断开启约 10 秒媒体窗口；等待麦克风授权不计入超时。每轮提示一次，恢复后清除；SDK 私有诊断不可用显示待确认，不直接断开通话。PC 替换、离房、重试均清理监听与计时器；线路仅采用当前 selected candidate pair。客户端不设置 UDP/TCP/TURN 固定端口，不修改 NAS 网络。

HarmonyOS `BilibiliResolver.ets` 的实际 UGC/PGC 请求使用修正后的 `buildFnval`，MP4 单独保持 fnval=1；定向测试执行真实调用路径，Hvigor 编译校验 ArkTS。共享资源仅由 `npm run harmony:web` 生成，签名材料仅临时注入本机 build-profile 并恢复；最低 SDK 仍为 6.1.0(23)。

### 串行切源、预览与失败重试

依据 [双端检查报告](#历史验证与待验边界)，对齐固定服务端源码 `fe55ddebedb91a4834d6752c5619ea75efec0bbd`。广播、请求状态 ACK 与网页房主预览统一交给 `useViewerStateSync` 串行应用，只在实际 attach 成功后记录源、转码与中转策略；同 URL 改策略也重新加载，同策略只同步播放字段。队列保留最新状态，取消旧下载，失败可重试；订阅独占队列，离房/换片/切房后的迟到任务不能写回。请求期间收到新广播时忽略旧 ACK，服务器心跳继续只校正当前媒体。

`usePlayerSource` 在串行队列内按已成功加载的 PlayerSource 与 video 元素去重，比较地址、音轨、格式、编解码、headers、Blob 和两项策略；移除只按 URL 的提前返回，避免加载中策略切回被丢弃。失败清空已应用标记，不把已销毁的旧引擎记为可复用。观众重新解析 anime/Kazumi/CMS 时保留广播中的明确策略，禁止旧片单强制覆盖直连；预览不重新解析上一影片。HLS 传入恢复起点，并等待首帧数据（readyState ≥ 2）后才返回，避免 ArkWeb 连续重载后过早 seek。

访问统计使用 `movie-source/media-policy.ts`：数据源取 serverProxy、挂载取 directLink，已解析的服务端媒体代理 URL 优先判为中转，预览可由 noProxyFallback 判断；显示与复制共用该结果。WebDAV/OpenList 字幕仍使用原挂载标记。删除当前选择器未使用的单集预览回调与失效属性，保留多选/批量加入片单；其他预览入口与专用事件完整透传中转/转码策略。直连错误指引覆盖数据源与挂载，保留原生 HTTP/证书通道。

本次不覆盖 Android Go/HarmonyOS ArkTS 的 B站内置解析、账号边界或 CLI-only 规则；不修改 iOS、不构建 IPA。模拟器、正式签名包与未覆盖的真机范围分别见 [2.1.5 验证记录](#历史验证与待验边界)。

### 跨来源完整快照

与 Android 共用 `src/upstream/modules/sync-playback/services/state-merge.ts` 的 `restoreStateSnapshot`，在房主广播和首次进房恢复时按完整 state 清空旧影片字段。JSON 会省略 undefined，旧版 diff 浅合并因此可能残留 B站 audioUrl、CID 和编解码信息，导致 Kazumi HLS 被错误选为 DASH。接收端改为完整快照，心跳仍只校正同一媒体的进度；ArkTS 原生解析和媒体桥不改。

### 房间权限、媒体库和字幕

`src/upstream/store/roomStore.ts` 持有房间影片、片单、角色及模式；`src/upstream/modules/room/watch-together/` 与 `sync-playback/` 处理房主/观众控制。影片 ID、CID/ep 与服务器逻辑 URL 可跨设备传播，本机代理地址只供当前 HAP 播放，不能写入片单或广播。若播放状态先于 current-movie/片单到达，先等待权威影片资料再解析；切 P/集、离房和切服后废弃旧请求。排序必须完整且限有权限的角色；清空片单等待服务器结果与广播，失败不提前清屏；自动连播从最新片单选下一条。

共享媒体引擎在 `src/upstream/modules/player/engines/`，媒体库 HLS 鉴权与相对清单在 `player/services/library-hls-proxy.ts`，PGS/MKV 在 `subtitles/` 和 `patches/playsvideo+0.4.7.patch`。实际可播性取决于 ArkWeb 与设备编解码器。已有 Pura 90 Pro 模拟器上 H.264 MP4/MKV 可播放，而特定 HEVC Main 10 MKV 解封装后仍零帧并报 `PIPELINE_ERROR_DECODE`；这类问题先核对视频 codec 与系统能力，不能把解封装/字幕提取成功当成解码通过。

房间模式固定为一起看、投屏、一起听。当前移动 UI 的房间设置集中在右上角，音乐账号菜单只处理账号与音乐设置，评论侧栏按移动规则展示。`MobileAppearance.tsx`、`appearance.css` 的根变量覆盖 body Portal；切主题要保持原视频/音频 DOM 不变，播放器画布保持黑色。全屏默认横屏，手动解锁后尊重系统旋转开关；退出全屏/离房恢复系统栏和安全区。`Index.ets` 将 WindowAvoidArea 转成 `--native-safe-*`，与网页 safe-area 合并，横屏短高度仍需保证确认按钮可达。

2026-10-14 HLS 连接核查：普通 HTTPS 模式使用本机保存的登录/游客 token，为服务端代理清单、分片和密钥请求附加 URL token，不依赖跨域 Cookie。已发现并修复一个条件性缺陷：启用服务器证书例外且服务器没有路径前缀时，共享 API 基址的尾斜杠可能生成 `//api/...`；HLS loader 的 API 识别还需将本机地址还原为逻辑地址。修复只涉及共享前端，ArkTS 的凭据隔离和证书例外范围保持原有规则。既有历史回归覆盖普通连接、证书通道、路径前缀、主清单、相对密钥、异域分片和 token 不泄漏到上游 URL。自动化验证不代表 ArkWeb 真机实播，原先安卓截图的具体原因仍需实际响应状态/设备日志确认。

## B站账号、解析与设备能力

### 短链、分P、竖屏与账号路由

共享 `modules/bilibili/input.ts` 提取分享文本，`MoviePushPanel.tsx` 在切画质/分 P 时复用 resolvedUrl；`movie-source-resolver.ts` 将历史短链交给本机解析。`BilibiliResolver.ets` 先展开受限 B站短链，再识别视频/PGC，保留 URL 的分 P；`BilibiliLocalProxy.ets` 透传显式 page，CID 优先于 page，显式 page 优先于 URL 参数。返回规范视频地址包含实际分 P，重定向不携带 Cookie。

共享 `nativeQualityPolicy.ts` 增加竖屏宽高检测。ArkTS 原有固定“宽≤1920、高≤1080”会误排除 720×1280 和 1080×1920，现改为长边≤1920、短边≤1080，并同时逐轴核对真实能力上限与帧率，保留 AVC、AAC、会员与原有性能限制。检测不支持的竖屏尺寸不得仅交换宽高后强行放行。

一起看控制栏传入实际 videoRef，由 `PlayerDisplayControls.tsx` 根据解码宽高决定 portrait/landscape，并在 loadedmetadata/resize 后复核。`playerDisplay.ts` 保留串行请求与失效代次；Index.ets 既有原生方向桥接直接执行目标方向。退出与离房解除锁定，手动解锁不会被相同比例的 resize 立即覆盖。投屏与其他播放器沿用原规则，最低 SDK 仍为 6.1.0(23)。

后续修复“仅登录服务端无法添加”：共享 `getActiveCliProxyUrl` 在鸿蒙也要求 ready 且 loggedIn，不再把匿名本机代理当作已登录账号路径。普通内容无本机登录时使用服务端账号；`getBilibiliInputResolvePolicy` 为添加、切画质与分 P 统一检查 CLI-only，明确要求本机账号的内容不得走服务器。已登录本机的权限错误继续直接提示。服务端 DASH 使用共享画质选择器，账号卡片分别注明两处登录状态，试看提示使用“当前解析账号”。

### B站 ArkTS 解析与回环代理

`BilibiliWbi.ets` 对关键词和 API 参数签名，`BilibiliResolver.ets` 解析普通 BV、分 P/CID、PGC ep/ss、实际 qn 与 DASH 音视频轨，`BilibiliCredentialStore.ets` 保存本机账号，`BilibiliLocalProxy.ets` 提供 `/resolve` 与媒体代理。Android Go 实现是行为参照而非共享二进制；WBI 字符重排、UTF-8/特殊字符、UGC 的字符串 `result`、会员错误及画质筛选须在 ArkTS 单独测试。

自动画质只从当前账号确有权限、解析结果确有视频与音频轨道、设备能够解码的普通档位选择；不按 qn 最大值直接选择 HDR/杜比。高画质不可用时核对源站实际提供的 720p，再考虑更低档位；手动画质不得被登录回调、代理重连或房间心跳擅自改写。解析成功但无声时，先检查 DASH 音轨与设备播放链路，再区分账号权限、CDN 和解码失败。修复上述规则时，须与 Android Go 的固定向量分别验证，不能因为共享 Web 页面通过就判定 ArkTS 解析正确。

代理只监听随机 `127.0.0.1` 端口和随机能力路径，限制 Host/Origin、HTTP 方法、CDN 域名和端口，正确转发签名查询参数及 Range/HEAD；CDN 请求不带账号 Cookie。房主桌面 CLI 的回环地址不是鸿蒙设备可访问的源，`cliOnly` 也不能改走服务器代理兜底。解析成功后至少核对实际视频/音轨、206 Range、持续帧推进、暂停与 seek；仅见 200 响应不够。

## 界面、选集与显示偏好

### 完整名称与列表网格

ArkWeb 与 Android 共用 `src/upstream/hooks/useFullMediaNames.ts` 和 `components/FullMediaNameToggle.tsx`。标题区的“完整显示”滑动开关默认打开，偏好以 `zviewer-show-full-media-names` 保存在当前设备的 localStorage，并即时同步同一应用中的浏览器和选集入口；存储不可用时保留本次运行的内存偏好。开启时列表与海报卡片的影片、剧集和分集名称按可用宽度自动换行，无行数截断，连续英文或文件名也可断行；关闭后恢复列表单行省略、海报标题两行省略。标题与操作按自然宽度优先同排，空间不足才换行；目录导航独立保持单行，各级名称以相同宽度分配空间，超长省略，不受完整显示开关影响。剧集整部添加按钮单独留出操作行，多选和批量添加沿用原逻辑。

实际番剧入口为 `AnimeSourceBrowser.tsx → EmbyBrowser.tsx`，覆盖 Kazumi、ani-subs 与 CMS 的搜索结果和进入后的选集；Emby/Jellyfin 媒体库复用同一浏览器。B站搜索入口 `BiliSearchModal.tsx` 的搜索卡片、详情标题和分 P 名称，以及 `MoviePushPanel.tsx` 解析影片后的“选择分集”弹窗，都读取相同完整名称偏好。已添加影片的实际切集入口位于 `MovieListPanel.tsx`，仅为该处 `Select` 启用 `wrapLabels={showFullNames}`，使选中项与展开选项均可换行；普通来源、画质等下拉框保持原来的紧凑规则。`AnimeEpisodePicker.tsx` 当前未作为实际选集组件挂载。

共享 `hooks/useEpisodeViewMode.ts` 与 `components/EpisodeViewToggle.tsx` 提供显式“列表 / 网格”按钮，默认列表，按 `zviewer-episode-view-mode` 保存本机偏好并在各实际选集入口间共享。2026-10-23 将网格下限从 120px 调整为 5.5rem（默认字号约 88px），由实际选集区域宽度计算列数，常规手机可排三列，窄屏或大字号自动减少，平板/横屏继续增加且无四列上限。列表仍每集一行，完整名称偏好继续控制换行，搜索结果的列表/海报墙偏好保持独立。

分集统一使用 `components/EpisodeCard.tsx` 与 `EpisodeCard.css`：主题色描边、至少 44px 触摸高度，选中为 primary 实心、对比文字和勾号；没有封面或图片最终加载失败时收起图片区，只显示集名，不显示 Film/Play 占位图标。自定义源使用已有封面及原图片代理回退，Emby/Jellyfin 使用各自挂载图片代理，B站搜索分 P 使用已取得的视频封面；解析结果没有封面字段时不额外请求。保留多选、全选、批量添加、失败项保留和原页面切换行为。覆盖 Kazumi、ani-subs、CMS、Emby、Jellyfin、B站搜索分 P 和解析分集，也同步备用 `AnimeEpisodePicker`；WebDAV/OpenList/FTP 和服务器文件页仍采用其文件浏览布局。

房间设置、外观与本机B站入口保持独立。Portal使用当前主题，视频画布保持黑色；主题或字体变化不重建播放器。完整名称、网格偏好只保存在本机。添加影片保留说明卡加滑动Switch，运行期片级设置使用图标、粗体中文、实心选中态和勾号；两处不能混成同一界面。窄屏、横屏短高度、130%字体、安全区、键盘及返回键须单独检查。更多菜单使用实际按钮位置和菜单高度定位，操作不穿透到视频手势。

## 音乐、队列与语音

### 2026-10-23 播放页配色与大屏布局修复

横屏将播放内容和原竖向工具栏合并到同一张卡片，工具顺序及业务回调保留。卡片提供稳定的亮/暗背板，卡内按钮跟随播放页 UI 深浅色，避免应用主题与视频背景造成图标失配；开关选中使用主题容器色，红心保留语义色。工具按钮保持 44px 触摸区域，矮窗口可独立滚动，队列溢出时继续使用视口内的 sheet。高窗口中，播放内容和工具组各自垂直居中；内容超高时从起点滚动，避免首项不可达。歌手行去掉偏移装饰并与迷你三键居中对齐，横屏播放按钮继续使用主题色背景。

完整播放器的竖屏判断改为视口方向，不再限制 768px 以下；平板竖屏沿用手机单列、歌词/卡片切换、五键主控制与水平辅助工具。大屏竖屏使用可用宽度的 82%（最大 900px），封面随剩余高度伸缩，歌曲信息、播放控制和底部工具同宽铺开，避免把手机尺寸卡片缩在屏幕中部。方形封面、原按钮功能、长歌名循环滚动保留。模式和列表按钮明确使用卡片文字色：浅色背板黑色，深色背板白色；竖屏顶部状态文字同样跟随深浅色。歌词面板四角定位方框按要求全部删除，保留歌词滚动、点击定位及音质文字。

浏览器真实组件检查覆盖 320–1280px 宽、375–1440px 高、16/22/24px 字号与深浅 UI/相反应用主题，另覆盖 26px 顶部和 28px 底部安全区。检查通过：无横向溢出、方形封面、音量可达、横屏两栏互不重叠、大屏上下留白均衡；网易云 11 项和 B站 12 项工具均保留 44px 区域；队列弹出不被工具栏裁剪；切歌/播放、主题色开关状态、UI 深浅翻转、平板歌词视图与横竖方向切换通过。这些是隔离模拟数据的浏览器组件证据，不代表原生系统栏、联网播放或真机后台音频验收。

TypeScript/Vite 生产构建、双端网页资源同步、Android Debug APK 和 HarmonyOS Debug HAP 构建通过。测试包位于 `release/music-adaptive-20261023/`：`ZViewer-Android-2.1.10-music-adaptive-debug.apk`（78,383,029 字节）与 `ZViewer-HarmonyOS-2.1.10-music-adaptive-debug-unsigned.hap`（14,463,491 字节），最终包各计算一次 SHA256 并保存同目录摘要。保持 2.1.10 / 220；Android 为独立 `.debug` 包，鸿蒙为未签名包。未安装、未推送、未发布，未构建 iOS。

### 2026-10-23 一起听沉浸播放器与自适应布局

本轮最终 TypeScript/Vite、网页资源同步、Android Debug APK 与 HarmonyOS Debug HAP 构建通过。安装包位于 `release/music-immersive-20261023/`：`ZViewer-Android-2.1.10-music-ui-debug.apk`（79,615,712 字节）和 `ZViewer-HarmonyOS-2.1.10-music-ui-debug-unsigned.hap`（14,461,623 字节）。版本保持 2.1.10 / 220；Android 为独立 `.debug` 应用，鸿蒙包未签名；最终包各计算一次 SHA256，记录在同目录 `SHA256SUMS.txt`。未安装设备、未推送或发布。

完整播放器展开后，移动端覆盖整个视口并隐藏房间顶栏；Android/HarmonyOS 通过 `useMusicOverlayImmersive` 申请系统栏沉浸显示，收起动画结束或组件卸载时恢复。该显示租约与一起看的显示队列共用代次，旧清理不能覆盖新播放器的全屏状态；不旋转或解锁用户当前方向。右上收起按钮固定 44px 并避让安全区，系统返回在离房确认前先收起播放器。

竖屏采用方形封面、歌曲信息、细进度条、主播放控制、音量和辅助工具的布局；播放卡按内容收缩，封面先让出控制区高度，极小屏可在卡内滚动。主控制行按“播放模式 / 上一首 / 播放暂停 / 下一首 / 队列”排列，实心图标与主题色中央按钮配合；模式仍限房主。红心与评论移到歌名旁；歌词/评论视图由工具栏接回入口，避免功能丢失或重复。长歌名仅在溢出时无缝循环，字体加载后的宽度变化会重新测量。无封面歌曲也能从小播放器打开完整播放器。未增加下载、分享、音质等功能。

收起态使用紧凑悬浮播放条：方形封面、溢出循环歌名、播放/暂停和列表；移除收起态的切歌按键，改由歌名/歌词文字区域左右滑动切歌（左滑下一首、右滑上一首）。`useMusicTrackSwipe` 复用原权限回调，过滤轻点、纵向/斜向滑动、长时间拖动、取消和非主指针；支持方向键等价操作。桌面宽屏维持原有控制。播放条同时避让原生底部与横屏侧边安全区。5 项手势回归通过；浏览器合成触摸实测左右滑动各切一次、纵向不切歌，播放与列表点击通过，320/393/667px 三种宽度均无横向溢出。


组件回归覆盖 393×852、393×700、320×568、320×480、667×375 与 16/22/24px 字号，包含 26px 顶部和 28px 底部安全区、横/方/竖封面及无封面；无横向溢出，主按钮/音量/辅助入口可达。实点切歌、播放暂停、模式切换、队列和评论入口；长歌名循环动画已确认。模拟原生桥展开/收起调用依次为 true/false，8 项显示租约行为测试通过；这些是浏览器与代码证据，系统栏和锁屏后台音频仍待真机验收。


### 2026-10-23 手机反馈修复

验证完成：一起听覆盖 393×852、393×700、320×568 及两组矮横屏；320px/22px 字号的 11 个工具按钮均在 28px 安全区上方，实点播放/暂停和队列成功；320×480 大字体下卡内滚动可达音量。19 项音轨/解析回退/生命周期回归通过，命令为 `node --experimental-strip-types --experimental-vm-modules --test scripts/music-background-audio.test.mjs`。TypeScript/Vite、双端资源同步、Android Debug APK 和 HarmonyOS Debug HAP 构建通过，测试包在 `release/ui-fixes-20261023/`；Android 为 `.debug` 应用，HarmonyOS 未签名，各最终包仅计算一次 SHA256。维持 2.1.10 / 220，未安装、未发布；无连接设备，后台/锁屏续播仍待真机验收。

- 分集卡选中前后保留相同文字空间；网格无封面卡两侧等宽预留勾选位置，有封面卡的勾选留在封面上。`Select` 内容宽度改为测量不参与 flex-grow 的文字，并为所有项保留相同勾选宽度，避免 RAF 定位时不断扩大菜单；长来源名受视口约束。
- `PlayerControlBar` 按实际横竖屏方向切换：横屏直接显示倍速、发送弹幕、同步、重载和隐藏控制栏，倍速通过 portal 向上展开，窄横屏可换行；竖屏保持原控制栏布局。选中及展开状态使用主题色，横屏倍速选项至少 40px。
- 一起听完整播放器让封面先为控制区和底部工具栏让出高度，进度、播放三键、音量保留 12–18px 间距；极端大字体/矮窗口可在卡内滚动，工具栏单独保留高度与原生安全区。
- B站音频解析优先独立 DASH 音轨，不再把无音轨的 DASH 视频流交给 `<audio>`；`audioOnly` 仅在确有音轨时跳过无关的视频编码检查，普通一起看调用保持原检查。旧服务端仅返回音视频合一 MP4 时仍兼容，其后台行为须按系统实测。

回归记录：使用真实共享组件的本机模拟数据，确认选集选中前后文字居中、短来源菜单连续测量宽度稳定、长来源在 320px/22px 字号下不越界；横屏 852×393、667×375、568×320 及竖屏 393×852、768×1024 的控制按钮在视口内，验证向上选速到 1.5x、同步与重载回调。浏览器组件与音轨解析回归不能代替手机锁屏/退后台播放验收；本次 adb/hdc 检查均无设备。

HarmonyOS 后台路径：`EntryAbility.onDidBackground` 在系统完成退后台后通知 `NativeMediaSession`；仅当 audioPlayback 长时任务已获准且当前媒体仍在播放时激活 ArkWeb。前后台状态通过 `zviewer:app-visibility` 传给共享页面，暂停静音 MV 与画面追帧，保留主音频。回前台恢复画面并对齐音频。AVSession、后台任务及系统音频焦点沿用现有所有者；ArkWeb 在锁屏/后台的实际调度仍需真机验证，不能由 SDK 编译通过推断已验收。

2026-10-23 一起听视觉统一：`modules/music/music-ui.css` 仅作用于 `.music-app-shell` 内的显式组件类，导航改主题胶囊，搜索/账户入口、首页推荐卡、歌曲行、登录卡、底部播放条和侧坞统一圆角与描边；完整播放器更新封面、歌词外框及工具栏，去除方块/括号装饰。顶部导航、底部播放键和侧边工具位置保持原结构，轮播下一张保留在右下角。286 个 JSX 事件及回调经 AST 对比保持一致；store、音频引擎、房间同步、播放权限、队列与背景偏好均不改。

本次验证：TypeScript/Vite 生产构建、双端网页资源同步、Android Debug APK 与 HarmonyOS Debug HAP 编译通过。真实共享组件使用本机模拟数据检查，选集覆盖 320/393/768px、深浅主题和 100%/130% 根字号共 12 组，均无横向溢出且触摸高度不小于 44px；393px 默认三列、320px 默认两列，极窄大字可降为一列。另检查有封面、无封面、图片最终失败收起、列表/网格切换及全选 45 集确认回调。一起听首页/底栏覆盖三个宽度与深浅主题共 6 组，另打开队列、完整播放器并检查按钮可达。上述为浏览器组件与编译证据，不是联网播放或真机验收；当时 adb/hdc 无设备连接。安装包位于忽略目录 `release/ui-refresh-20261023/`：Android 为独立 `.debug` 包，鸿蒙为未签名 HAP；维持版本 2.1.10 / 220，未发布 GitHub Release。

音乐协议区分服务器权威时钟、房主存活和本机播放意图。`music:sync-heartbeat` 的 position 已由服务器外推，客户端不能重复加上旧 updatedAt 的同一段时间；0 秒有效。迟到 get-state、切曲、切服和旧连接 ACK 不能覆盖新媒体。队列写入权限与播放控制权限独立，失败不先切歌；服务器确认排序后才更新权威片单。

小播放器和完整播放器的队列弹层只有一个所有者；旧关闭回调不能关闭另一所有者的新弹层。界面主题切换、队列展开和全屏不可重建主音频/视频。房间评论、歌曲评论、B站原视频评论分别绑定自身媒体与会话。

语音走 LiveKit 的 `/api/voice/token` 与实际 publisher/subscriber PC/ICE。SDK joined 和 token 成功不代表音频已通；加入、重连、PC 替换后开启约 10 秒媒体窗口，等待麦克风授权不计入。每轮提示一次，恢复后清除；诊断不可用时显示待确认，不主动断开。显示实际 selected candidate pair 的 UDP/TCP，不在客户端硬编码 TURN 端口或修改 NAS 网络。用户闭麦、管理员禁言、收听音量和麦克风增益分开维护，离房释放资源。


## 手机屏幕共享与观看

### 共享会话、画质和旋转

`src/upstream/modules/screen-sharing/` 维护房间信令，`src/platform/screenShare.ts` 分派 Android 与 HarmonyOS。每次采集带独立 sessionId；早到 ICE 有界缓存，旧 offer/answer、方向事件和停止回调不得改变新会话。拒绝权限、取消、系统停止、切房、离房和断网都必须释放采集、轨道、PeerConnection、音频图和后台任务。

共享画质通过 `screenShareQuality.ts` 选择，宽高是上限且不放大。`screenShareFrameMeter.ts` 记录实际帧与实际尺寸；配置帧率、track.getSettings().frameRate 与实测帧率必须分开。旋转继续使用同一采集和发送轨道，不重新授权、不重建 PeerConnection；物理屏幕比例改变后按实际内容裁去系统采集画布补边，保留视频/应用自身黑边。

系统音频与麦克风分别开关，房间语音和屏幕共享通过 `microphoneCapture.ts`、`roomMicrophoneCoordination.ts` 协调；管理员禁言不能被共享入口绕过。暂停时关闭发送音视频，恢复沿用当前选择。无系统音轨时提示停止后重新授权，不假造支持。


### 固定采集画布与真实旋转

用户真机仍失败，不能沿用 2.1.3 自动化通过结论。实际日志显示 display.change 已报告 2720×1260，而原视频帧仍是竖屏；交换 applyConstraints 上限后反而从 592×1280 缩成 334×720。ArkWeb 的原生采集画布保持初始方向，原生方向监听本身有效。

`harmonyScreenShare.ts → screenShareVideoTransform.ts` 对同一次 getDisplayMedia 采集的私有克隆创建 MediaStreamTrackProcessor，经 VideoFrame.visibleRect 去除与物理屏幕比例不符的系统画布补边，由 MediaStreamTrackGenerator 输出同一发送轨道；保留应用/视频自身的补边。原始采集请求不设置随初始方向固定的宽高，发送帧再按所选画质限幅，始终不放大。整个链路不读像素、不做 Canvas 定时绘制、不额外采集或创建另一套编码器，旋转无需重新授权或重建 PeerConnection。停止同时取消 reader、writer 与私有轨道，防止等待中的读写阻碍清理；所有输入/转换帧在 finally 释放。运行时先检查所需帧接口，缺少时明确报告不可用，最低 SDK 仍为 6.1.0(23)。

`screenShareFrameMeter.ts` 从实际送达帧读取 displayWidth/displayHeight；宽高与实测帧率不再依赖可能缺失或无限大的生成轨道 getSettings。系统音频/麦克风仍走原混音图，暂停同时控制原视频与发送视频；已停止或旧 session 的方向事件不得影响新会话。

### ArkWeb授权与观看

`ScreenShareCapturePolicy.ets` 与 `Index.ets` 将原生采集授权限制到固定本地来源、当前用户手势和有效session。拒绝、超时或迟到授权不能重新拉起已退役会话；取消须同时处理原生handler和JS轨道。`BackgroundMediaTasks.ets` 持有实际需要的连续任务，停止/离房时释放。

现行鸿蒙已提供视频、系统音频和麦克风采集，旧1.9.5“麦克风未开放”“仅观看”的记录不再代表当前实现。早期API26模拟器房主采集曾超时，后续API26真机签名214已获用户验收；不能由此推定API23全部通过。

鸿蒙WebRTC系统PiP在实际ArkWeb回环及H.264跨应用实验中均白屏，当前已移除系统和应用内小窗入口，不凭能力标志重新开放。Android的Activity PiP结果不能代替鸿蒙。未来恢复须有原生渲染面与跨应用持续出帧证据。


## 历史验证与待验边界

| 范围 | 已有记录 | 边界或后续动作 |
| --- | --- | --- |
| 2.1.10 内网连接 | 249 项适配、4 项媒体及 Go core/mobile 历史通过；最终220 Debug 双端通过真实本地 HTTP、自签名HTTPS登录、Socket握手与实际进房，Android房主/HarmonyOS观众同房。 | 属于 WebView/ArkWeb 模拟器结果；未覆盖所有实体手机或 HarmonyOS API23 真机。 |
| HTTP 登录补测 | 用户提供的 LAN 目标上，两端自动/完整HTTP、证书开关与账号/游客组合共10/10通过。 | LAN 地址、账号和隔离服务数据不写入维护文档。证书异常不得以普通网络失败为由静默降级。 |
| 2.1.9 播放设置 | 240 项适配、4 项媒体、6 项vendor及Go历史通过；320/393/768px、100%/130%字体、主题及两类字体共24组组件几何验证。 | 浏览器几何结果独立于原生宿主和真机。历史误填4.1.9/419的播放证据不改称219重测。 |
| 220 正式 APK | 76,761,865字节；历史apksigner v2、aapt 2.1.10/220与33个网页资源一致性通过。 | 本次未重建或重算安装包SHA。 |
| 220 正式 HAP | 14,303,171字节；历史verify-app、2.1.10/220、debug=false与31个网页资源一致性通过。 | Debug运行、Release静态检查与用户真机反馈分别记载。 |
| 屏幕共享旋转 | HarmonyOS API26实体手机同一会话五轮横竖切换，592×1280 / 1260×582持续解码；签名214交付后用户反馈“验收通过”。 | 开发时临时模块加载与最终签名HAP证据分开；不能外推API23、后台、蓝牙或所有设备。 |
| HDR/杜比 | 已透传HDR/codec元数据并做真实设备能力三态预检。 | 手动HDR、音乐背景HDR与真实显示验收继续后置，旧执行项B01未全部关闭；desktopManaged类型项B02未实施。 |
| 新服务端main | 2026-10-23已同步源码。 | 本次不自动宣告对齐，不修改NAS部署；后续按实际REST/Socket差异单独评估。 |

回归时至少覆盖：账号/游客、自动/完整URL与路径前缀、审批/进退房、房主/观众、短链/分P/PGC、媒体库HLS密钥与Range、MKV/字幕、两种片级策略四组合、暂停/1.5倍速保留、跨源清理、音乐队列/失败恢复、语音权限、共享停止/旋转/后台与主题安全区。截图、HTTP200、签令连接成功和单次起播不能替代持续帧推进及真实听音。

历史细节可在Git中查询清理前提交 `fdf6bb664348268116f5f8e2b0e74d371b2b579b` 的原始文档和测试；本次整合后不再依赖已移走的 `.ui-validation/`、`docs/evidence/` 或测试夹具。历史通过数只记录当时范围，当前源码检查见文末。


## 故障定位

| 现象 | 优先核对 |
| --- | --- |
| React 已更新，HAP 还是旧界面 | 是否运行 `npm run harmony:web`，`rawfile/web` 是否重新生成，包内资源摘要是否匹配。 |
| HAP 白屏或资源 404 | `https://zviewer.local` 映射、相对资源路径、bootstrap 是否先于 React 执行以及 ArkWeb console。 |
| 桥方法超时/字段缺失 | `contracts.ts`、bootstrap action、`Index.ets` 分发、service 返回结构及取消清理。 |
| B站解析成功但无画面或无声 | 本机代理 Range/HEAD、签名 URL、CDN 白名单、音视频实际轨道及设备编解码器。 |
| 进度跳回或旧片重载 | current-movie/片单事件到达顺序、movieId/CID、请求代次、服务器心跳与主动 seek 抑制。 |
| 全屏后留黑边或状态栏 | WindowAvoidArea、`--native-safe-*`、orientation/immersive action、退出恢复与主题 Portal。 |
| 媒体通知出现但后台停播 | AVSession 与 AUDIO_PLAYBACK 任务是否同时有效；暂停、离房、系统回收与实际设备后台策略。 |

## 构建、发布与清理

当前最低系统为HarmonyOS6.1 / API23，编译/目标SDK按 `ZV-HarmonyOS/build-profile.json5` 的26配置维护。API26模拟器或实机通过不代替API23实机验收。

```powershell
npm ci
npm run typecheck
npm run harmony:web
```

随后在DevEco Studio打开 `ZV-HarmonyOS/`，使用本机SDK和签名配置构建Debug或Release HAP。`harmony:web` 内部先构建网页再同步到 `entry/src/main/resources/rawfile/web/`；这是生成目录，禁止直接修改。ArkTS修改须完成Hvigor编译与实际ArkWeb运行。签名密钥、证书、Profile及本机SDK路径不进入源码，安装仍受Profile设备授权和安装来源限制。

发布前检查版本、签名、最低SDK与包内资源；每包仅在最终构建时计算一次SHA，发布复用保存摘要。完成版本后在指定客户端仓库本地commit，同步Android维护文档。Release标题为 `ZViewer-Client V版本号`，保留五类中英发行说明与完整变更记录；默认发布Android/HarmonyOS，源码使用main，不另打源码包。iOS构建必须有用户明确指示。

本次将测试脚本、夹具、一次性UI验证、旧证据和可重建缓存移入回收站，失效npm测试入口已移除。日常检查用 `npm run typecheck` / `npm run build`，ArkTS仍需SDK编译。保留依赖、原生构建工具、签名源材料、正式 `release/` 及iOS `release-assets/`。`.hvigor/`、`entry/build/` 和Vite缓存可重建，不能将缓存清理称为释放同等磁盘空间，回收站仍占用磁盘。


## 本次整理与后续记录

2026-10-23仅做上游源码同步、客户端测试/缓存清理、文档整合及命令入口维护。未构建APK/HAP/IPA，未启动或修改NAS服务。清理前的版本/测试历史可通过Git查询；后续功能修复同时维护Android和HarmonyOS两份文档，具体设备型号、OS、角色、网络、版本与未通过项必须据实填写。

清理复核：2026-10-23的95项清理中，94项已确认在回收站；`.ui-validation/` 约3.88GiB超过E盘回收站1GiB限额，Windows未将其保留在回收站，目录已直接清除，未满足该项目的可回收要求。该目录为历史测试产物，正式release、已安装依赖和签名源材料保留。今后先查容量再回收，不能只凭API的SendToRecycleBin参数判定已回收。

本次整理后检查：共享前端TypeScript与Vite生产构建、Go `go build ./...`、iOS VLC持久补丁检查/ESLint/TypeScript及12个共享Go来源核验均通过。文档链接按保留文档与项目入口复核；这些结果不包含已移走的历史测试，也不新增APK/HAP/IPA或设备验收。
