# HarmonyOS 应用维护架构整理

更新日期：2026-10-13

## 2026-10-13：1.8.5 / 185 三端统一发布

将此前房间入口/音乐评论侧栏优化及 `48e0e5c` 的旋转解锁图标、全屏默认横屏更新统一以 **1.8.5 / 185** 重新打包。根 package/lockfile、Android Gradle、HarmonyOS AppScope 已同步；本轮没有再修改这些行为，保留 src/platform 和各自原生桥。网页分别由 android:sync / harmony:web 生成，沿用原发布签名。

76 项适配 + 4 项媒体回归、TypeScript/Vite、双端 Debug/Release 构建通过；实际 APK/HAP 版本 1.8.5 / 185、签名及既有证书一致，两端各 29 项共享网页资源摘要匹配。此前房间 30 组布局和旋转 8 组桥接界面记录继续有效，尚未将物理设备旋转专项记为通过。用户本轮真机“全部通过”的确认指向 iOS build 23，不挪用为安卓/鸿蒙新增实机证明。

按用户指示源码上传 main，发布 client-v1.8.5 三端 Release。README 和发行说明完整展示三端操作与状态，iOS 当前可用，Android/HarmonyOS 发布签名 APK/HAP，iOS 沿用已验收的未签名 IPA，不重新云构建。见 [1.8.5 发行说明](releases/client-1.8.5.md) 和 [三端发布验证](client-v1.8.5-release-validation-20261013.md)。下方候选状态是历史记录。

## 2026-10-13：旋转解锁图标与全屏横屏默认值（本地构建）

顶部及播放器的旋转解锁按钮由圆箭头改为 `LockKeyholeOpen`（打开的锁），提示“解除旋转锁定（自动旋转）”，与重载视频的圆箭头区分。视频进入网页或原生容器全屏时，Android/HarmonyOS 默认锁定横屏并启用沉浸显示；退出全屏、卸载播放器或离房时恢复自动旋转。全屏期间手动解除锁定后，普通重绘不会重新锁定，下次进入全屏重新使用横屏默认值。

HarmonyOS 沿用既有 `toggleOrientation(true)` 原生桥和 ArkTS `LANDSCAPE` 设置，无需修改 ArkTS 方向实现；解除锁定继续使用 `AUTO_ROTATION_RESTRICTED`。共享 `setPlayerFullscreen` 串行处理原生显示操作，跳过已被后续请求取代的排队操作，快速退出后迟到的锁定调用会由退出恢复操作收尾；系统栏操作失败也会尝试恢复方向。普通浏览器全屏不强制调用移动端方向锁定。

76 项适配（含 7 项方向/全屏回归）、4 项媒体测试、8 组双平台桥接模拟界面检查及双端 Debug/Release 构建通过；网页只由 `harmony:web` 生成，HAP 验签、既有证书链及 29 个网页文件摘要比对通过，公开签名模板已还原。本地候选保留 **1.8.0 / 180**，位于 `release/orientation-ui-20261013/`，包含此前房间界面优化，未发布。原生实机旋转和全屏仍待验收，详见 [验证记录](client-fullscreen-orientation-validation-20261013.md)。

## 2026-10-13：双端房间入口与评论侧栏优化（本地构建）

基于 **1.8.0 / 180** 完成本地界面优化：一起看视频下方仅保留“聊天 / 片单”，删除“房间”标签；模式切换、房间状态、名称/密码/审批设置、在线观众、分享及离房统一进入右上角房间按钮。一起听头像菜单不再接收 `roomModeMenu`，保留音乐账户与音乐设置功能；`MusicAppShell.commentsOnlyDock` 使移动房间右侧侧栏仅显示评论，移除房间状态、流量统计与重复语音面板。

`MobileRoom` 的房间 Modal 使用可选 `keepMounted`：收起后隐藏界面并释放滚动锁/返回处理，但保留 `RoomInfoPanel` 的房间设置、禁言和房管事件监听。切换模式仍由房主调用原有 `useRoomModeSwitch`，观众跟随广播，忙碌/断线时禁用按钮。侧栏悬停仅处理鼠标指针，触摸通过点击切换；把手层级高于面板，展开后仍可点击收起。

69 项适配、4 项媒体回归、TypeScript/Vite、Android 与 HarmonyOS Debug/Release 构建通过。30 组共享布局及交互检查覆盖五种尺寸、深浅主题，模式往返、嵌套设置返回、评论发送、关闭设置后的事件同步和观众权限通过。网页仅由 `harmony:web` 生成；HAP 验签、既有证书链及包内 29 个网页资源摘要比对通过，构建后已还原公开签名模板。安装包为 `release/room-ui-20261013/` 中的本地候选，未发布；浏览器隔离夹具不等同于鸿蒙真机 ArkWeb 验收。详见 [验证记录](client-room-ui-validation-20261013.md)。

## 2026-10-13：1.8.0 / 180 发布

按用户要求，将已实现的 1.7.6 / 176 服务端 v4.5.3 对齐内容统一升为 **1.8.0 / 180** 重新打包，源码发布至 `Zero-wyc/ZViewerAPP` main，Release 标签为 `client-v1.8.0`。鸿蒙 AppScope 的 `versionName` / `versionCode`、根包版本与 Android 同步更新；网页仍只通过 `npm run harmony:web` 生成，继续使用既有发布签名，公开构建配置保留无私钥和密码的模板。发布附件为 APK、HAP、SHA256SUMS.txt，源码使用 GitHub 自动生成归档。

本版包括默认音乐音量、私人漫游连续播放、B 站搜索自适应多列及实际 ArkTS WBI 修复，详见 [1.8.0 发行说明](releases/client-1.8.0.md)。本轮 `harmony:web`、Debug/Release 构建通过，HAP 的 `module.json` 为 1.8.0 / 180，验签通过且证书链与既有版本一致，包内 29 个共享网页文件与构建结果摘要匹配，详见 [1.8.0 构建与发布验证](client-v1.8.0-release-validation-20261013.md)。下方 1.7.6 记录保留此前功能验证范围；物理设备、真实音源、后台锁屏、蓝牙与跨端同步仍需专项验证。本轮未构建或发布 iOS。

## 2026-10-13：1.7.6 / 176 对齐服务端 v4.5.3（本地构建）

已通过 GitHub 接口确认上游 main 为 `9e2a0d4f3d9796067ac17274feabeccbb065d411`，与本次更新方案一致。共享业务增加 `roomDefaultMusicVolume`（缺省 50%）和 `initialMusicVolume`；有效本地 0～1 音量优先，包括 0/1，无效记录安全回退。公开设置晚到不会覆盖本次手动调整，即使存储写入失败；主音频、预载和升格统一音量，切服仍由原有 settingsRevision 隔离旧响应。

`personal-fm.ts` 保存房间级候选、最多 100 首历史、模式及请求代次。只有房主启用 FM，等待 `music:queue-upsert` 的 `afterCurrent: true` 成功 ack 后再播放和广播；8 秒超时/拒绝不丢候选。自然 ended、播放器与系统下一首共用续播入口。切页面保留会话；普通歌曲/B站插播停用 FM；暂停、进度拖动、离房、断连、切模式和组件销毁使旧请求失效。重复/当前/已播放候选被去重，显式单曲循环仍循环当前曲。旧模式空响应不能在新连接发起默认源回退。

B站添加影片搜索结果改为按行排序的 CSS Grid，按结果容器宽度自动排布；320/360/393 手机两列，852 横屏和 768 平板四列，16:9 封面，标题两行、UP 名省略、计数换行。搜索输入可收缩，分页、分 P 选择、图片代理及关闭时请求取消保留。原生导航、系统媒体、语音音频路由和连接证书通道沿用原有实现。

69 项适配、4 项媒体回归、Go 核心测试、20 组搜索布局与 8 组播放器音量场景通过。浏览器用真实 0.6 秒 WAV 音频自然 ended 连续 6 首并跨候选批次，中途卸载/重挂 FM 页面保持会话；模拟 ack 验证拒绝/迟到权限边界。双端 Debug/Release 构建和签名验证通过，包内各 29 个共享网页文件与最终构建一致。验证是本地隔离夹具，不等同于真实网易云/VIP、B站在线解析、物理设备、后台锁屏、蓝牙或跨端验收。当前 adb/hdc 无连接设备，本轮未安装/执行原生设备专项，未发布 GitHub Release。详细记录见 [1.7.6 验证](client-v1.7.6-alignment-453-validation-20261013.md)。

HarmonyOS 实际 ArkTS 签名新增 `BilibiliWbi.ets`，由 `BilibiliResolver.signedPlayUrl` 调用。重排表与 Go 固定向量一致，查询排序、UTF-8、空格 %20、特殊字符过滤同时用于摘要和发出请求；不依赖 Android Go AAR。原生 WBI/PGC 回归和 Hvigor ArkTS 编译通过；正式证书链与既有版本一致。网页资源只由 `harmony:web` 生成，构建后签名模板恢复。此前共享 Go UGC 修复只影响 Go 核心，不能宣称鸿蒙使用该核心。



## 2026-10-13：共享 B站普通视频响应修复（源码）

`native/bilicore/core/resolver.go` 仅在 `data.result` 是对象时展开 PGC 响应。普通视频 playurl 的 `result:"suee"` 是状态字符串，过去被误当作嵌套对象，导致本机解析失败；`ugc_test.go` 已覆盖真实响应形状。共享 Go 11 项测试通过，用户提供的公开视频 `BV1UHpw6LESy` 经匿名真实请求返回第 1 P、480P 视频及 AAC 音轨。此次只更新共享源码，当前 HarmonyOS 1.7.5 / 175 安装包未重建；生成资源和 ArkTS 桥未修改。iOS 修复与界面记录见 [2026-10-13 源码预览](releases/ios-follow-up-fixes-2026-10-13.md)。

## 2026-10-12：共享 B站 WBI 核心修复

iOS IPA 复核时修正 `native/bilicore/core/wbi.go` 的 WBI 字符重排表、空格百分号编码和特殊字符过滤，并加入固定签名向量测试。此共享源码修复供后续双端构建使用；当前 HarmonyOS 1.7.5 / 175 安装包未重新构建，生成资源未更新，不能视为已包含修复。iOS 搜索桥使用同一协议规则的 Objective-C 签名函数，构建机另跑原生中文关键词签名检查。

## 2026-10-12：iOS 独立源码预览对齐

iOS 在 `ZV-iOS/` 以 RN 控件实现本版片单长标题、番剧切源/选集、Emby/Jellyfin 整季/版本与清空入口，语音迁移为 LiveKit。当前只完成源码和 Expo 预览检查；双端 1.7.5 的构建、原生桥及生成资源未变化。跨端真实语音/影片仍待 iOS 新原生包联调，不沿用双端验收结果。实施详情见 [iOS 预览记录](releases/ios-next-preview-2026-10-12.md)。

## 2026-10-12：1.7.5 / 175 长标题与番剧源菜单修复

本版汇总下方 1.7.4 本地对齐内容，并按用户要求发布 Android/HarmonyOS **1.7.5 / 175**。`MovieListPanel` 的普通与展开片单共用完整多行标题，不使用单行省略或行数截断；连续英文字符串允许断行，播放/删除按钮仍占独立网格列。

`Select` 新增可选 `menuWidth="content"`，只在 `AnimeSourceBrowser` 的源选择启用。展开后按真实文字宽度、内边距、勾选图标及滚动条预留空间，菜单受视口限制并在右侧空间不足时向左调整；触发器宽度与搜索栏不改变，其他选择器默认行为保留。源选项保持单行，极端超出整个视口的名称可在菜单内横向滚动，不撑宽页面。

HarmonyOS 网页仍仅通过 `npm run harmony:web` 生成；AppScope 版本为 1.7.5 / 175，沿用既有签名。公告仍排除。40 组共享布局检查覆盖五种屏幕尺寸、深浅主题和普通/展开状态，56 项适配、4 项媒体回归及双端 Debug/Release 构建通过。ArkWeb、包内资源及安装包校验记录见 [1.7.5 验证记录](client-v1.7.5-ui-validation-20261012.md)，发行说明见 [client-v1.7.5](releases/client-1.7.5.md)。未修改 ArkTS 桥、NAS 或 iOS。

## 2026-10-12：1.7.4 / 174 本地对齐服务端 v4.5.1

本轮本地开发版本 **1.7.4 / 174**，服务端固定提交 `c8fa5bad0c6efcffbc0dc3bfe4c199f8a9b8d8f6`。共享番剧浏览器/认证海报、切源保留与失败项重试，Emby/Jellyfin 搜索/海报元数据/整剧整季/切集多版本、媒体库 HLS 相对分片、一键清空与播放生命周期、B 站搜索分 P 和音量拖动清理已实现。**按用户要求不加入公告**；评论新窗口/侧坞/快捷键仍排除，iOS 不涉及。

维护入口：`AnimeSourceBrowser`/`AnimePoster`、`EmbyBrowser`/媒体库 API 与 `seriesPages.ts`/`mediaLibraryUrl.ts`、`MoviePushPanel`/`MovieListPanel`、`roomStore`、`library-hls-proxy.ts`/`hls-engine`、`useWatchTogether`、`useVolumeSliderDrag`/`bodyScrollLock`。播放/显示使用选定服务器通道，持久化与广播保持逻辑 URL；版本用真实 MediaSource ID，观众按房间影片 ID 播放，媒体凭据不进入房间状态。没有新增或替换原生桥、B 站解析和编解码能力。

56 项适配、4 项媒体回归、102 组共享浏览器布局、两端实际 App 各两种媒体库普通/放大共 8 组、16 组房主/普通浏览器观众 MP4→切集→转码 HLS→清空记录通过。两端 Debug/Release 构建及既有发布签名验证通过，包内网页与最终 dist 比对。Medium Phone / Pura 90 Pro 均为模拟器；真实第三方番剧 10 组查询有结果/详情，首图 9 组成功、1 组上游 502。用户物理设备、真实媒体库正片、自签 HTTPS、后台/蓝牙与生产源仍需独立验收。

本地交付 `release/client-v1.7.4-test1/`，源码本地提交；未上传 GitHub、发布 Release 或修改 NAS。完整证据与边界见 [1.7.4 对齐验证](client-v1.7.4-alignment-451-validation-20261012.md) 和 [发行说明](releases/client-1.7.4.md)。下方 1.7.3 及更早记录保留其历史发布状态。

### 1.7.3 用户验收与发布确认

2026-10-11 用户确认 Android / HarmonyOS 检测通过，授权源码同步 `Zero-wyc/ZViewerAPP` main 并发布 `client-v1.7.3`，同时更新过时 README。复用已验收的 1.7.3 / 173 既有发布签名 HAP/APK，提供校验文件，不单独上传源码 ZIP。下方为历史阶段记录，未扩写用户未提供的设备型号/单项验收统计；iOS 不涉及。见 [1.7.3 发行说明](releases/client-1.7.3.md)。

## 2026-10-11：1.7.3 / 173 媒体库截图问题修复

共享 `EmbyBrowser` 与 Jellyfin 同步恢复单集封面（16:9）、目录区 flex 填充和真正的面板放大，并增加当前目录全选/取消全选。仅选 file，按目录顺序回传既有批量添加；换目录清空，加载时禁止提交。保留 ArkWeb 图片私有连接映射、安全区和原生返回，不修改 ArkTS 解析/媒体协议；网页由 harmony:web 生成。

43 项适配、4 项媒体回归、64 组布局和 17 组选择场景通过；Pura 90 Pro ArkWeb 与 Android WebView 分别从 App 添加入口验证 Emby/Jellyfin 的封面、目录实际增高和全选 24 集批量写入。本轮 Debug/Release 构建、既有发布签名/摘要验证通过，签名配置注入后恢复，未发布，iOS 不涉及。证据与模拟器/真实媒体库覆盖边界见 [1.7.3 修复记录](client-v1.7.3-media-browser-fix-20261011.md)。以下旧版本为历史记录。

## 2026-10-11：1.7.2 / 172 对齐服务端 v4.4.7

本次本地版本 **1.7.2 / 172**，参考服务端 `32d3cdecb498e12af7bd5e0f5acd49b6b8576e08`。共享 B 站搜索、触屏片单排序/自动连播、弹幕连续添加、Emby/Jellyfin 海报墙与紧凑单集网格、二级面板布局和返回同步更新。入口及权限/生命周期约束见 [Android 同期记录](android-maintenance-architecture.md)，详细证据见 [1.7.2 验证记录](client-v1.7.2-alignment-447-validation-20261011.md)。下方为历史版本记录；未发布 GitHub，iOS 不涉及。

海报地址通过共享 `connectionTransport` 使用当前服务器及原生私有通道，不误请求 ArkWeb 本地页面、不拼挂载 API Key。`Modal` 和 `overlayBack` 在原生返回中优先退出面板全屏/关闭顶层面板，继续既有播放与设置返回链；保留 ArkWeb、zviewerNative、原生凭据、AVSession 和后台任务边界。未修改 Go/ArkTS 解析协议，未移植评论新窗口/侧坞/快捷键。网页只通过 `harmony:web` 生成，不能手改 rawfile。

43 项共享适配和 4 项媒体测试、TypeScript/Vite、Hvigor debug/release HAP 构建通过。最终 HAP 沿用既有发布密钥、证书和 Profile，代码签名、权限签名、内容摘要验证及模拟器安装通过。签名配置仅构建期间注入，完成后恢复干净 build-profile，不提交私密配置。Pura 90 Pro ArkWeb 359×789 通过 Emby/Jellyfin 海报/单集共 4 组，实际图片代理、整齐双列、多选、底部操作及面板返回通过；本地 v4.4.7 下手机房主 MP4 → HLS → MP4 自然连播、普通浏览器观众解码与时间推进、末尾停止通过。短片加载有过渡延迟，没有测量严格跨端同步误差。物理手机、真实媒体库、自签名设备通道、B 站/Kazumi 正片及听音/蓝牙/后台完整验收边界见验证记录。

### 1.7.0 真机验收与发布确认

2026-10-07 用户确认 Android / HarmonyOS 真机验收通过，授权上传 `Zero-wyc/ZViewerAPP` 并发布 `client-v1.7.0`。沿用已验收的正式签名 APK/HAP，补充发布文档和提交源码归档；下方“本地交付/待验收”表述保留为发布前阶段记录。未把总体确认扩写成没有提供日志的设备/单项统计。见 [1.7.0 交付记录](releases/client-1.7.0-adaptation.md)。

## 2026-10-07：1.7.0 / 170 双端适配交付

当前本地交付版本为 **1.7.0 / 170**，目标上游 `ba033096bc9c3a85a2058918a002b80a5f484ec8`。正式 HAP 使用既有密钥、证书与 release Profile，代码签名和内容摘要验证通过。与正式 APK、源码提交 ZIP、校验文件及脱敏证据同目录交付，尚未发布远端 Release。下方 1.6.0 及更早结论按原版本解释；本轮不涉及 iOS。详见 [1.7.0 交付记录](releases/client-1.7.0-adaptation.md)、[发行说明](releases/client-1.7.0.md)。

`BilibiliResolver.ets` / `BilibiliLocalProxy.ets` 新增 ep/ss、整季、短链、会员/试看字段、PGC MP4/DASH 与明确业务错误。处理 result / data.result 包裹，按目标 ep 确定 cid/currentPage；与 Go 共用契约 fixture。沿用本机凭据存储、随机回环路径、Host/Origin 校验、CDN 域名和备用地址；编码能力与 AAC 筛选、手动质量失败行为保持一致。多段 MP4 不拼成伪单文件，提示 DASH。原 HEVC Main 10 限制不变。

新增 `services/ServerConnection.ets`，经 `Index.ets` → `bridge-bootstrap.js` → `src/platform/serverConnection.ts` 实现按服务器证书例外和无凭据探测。只在选定 origin 的私有回环通道接受用户例外，原生 Cookie 不回传 JS，API/NDJSON/Range/HTTP 与 WS 升级同作用域；其他域名保持严格验证，撤销关闭旧 Socket。TLS Socket 先 bind 再注册监听，按响应长度/分块边界排空队列，处理 peer close 先于尾部 message 的顺序，避免空响应和媒体截断。保留连接数、头部与队列大小边界，没有全局 ArkWeb SSL 放行。

共享 cliOnly、PGC 元数据、多 P/ep 竞态、默认模式、缓冲缓存身份隔离、HLS 连接路由、语音线路与一起听增量见 [Android 同期维护记录](android-maintenance-architecture.md)。本机账号不上传为服务器 Cookie，房主会员资格不代表观众权限。网页只通过 `npm run harmony:web` 生成 rawfile，不能手改。

Pura 90 Pro / API 26 打包调试 HAP 实测自签名证书严格拒绝、例外 API/原生 Cookie/NDJSON/206/MP4 seek/Socket.IO WebSocket、外域隔离和撤销通过。已有本机会员账号实测免费集与会员 ep508405：实际时长约 1449.98 秒，跳至约 400 秒继续出帧、error=0，返回非试看。共享回归 30 项、Go 测试及 ArkTS 契约/尾包顺序回归通过，正式 Debug/Release 构建通过。

本轮会员实播为 MP4；PGC DASH、非会员/服务端账号交叉、真实快速切集、穿透与 LiveKit 新线路双向听音、真机音频/蓝牙/后台/系统控件没有全部现场验收。未把帧统计或历史设备结果扩展为 1.7.0 全场景验收。签名材料只在构建时注入，构建后恢复干净 `build-profile.json5`；不提交私有配置或生成 HAP/rawfile。

## 2026-10-04：1.6.0 / 160 新服务端适配交付

当前双端发布版本为 **1.6.0 / 160**，目标上游 `9827929088a31d7cb1d6bf7ceac096df640a2416`（v4.3.7 后 4 个提交）；已发布的 1.5.0 与下方历史结论仍按原版本解释。完整变更和验证见 [交付记录](releases/client-1.6.0-adaptation.md)。**iOS 尚未适配本次新服务端与 LiveKit，本轮无 IPA。**

共享前端已同步 LiveKit `/api/voice/token/mute/kick`、identity 管理、有序 PGS 位图字幕与 Matroska/AAC 补丁、本地 XML/JSON 弹幕、网易云 Cookie 登录/主动复制和我的音乐空 Tab 清理。实现入口与生命周期约束见 [Android 同期维护记录](android-maintenance-architecture.md)；语音继续经过 `permissions.requestMicrophoneStream` 与原生权限桥，音频会话沿用既有平台契约。

`Index.ets` 新增 `onShowFileSelector → picker.DocumentViewPicker`，仅处理单文件 XML/JSON 输入，按后缀筛选、只返回一个 URI。取消/失败返回空数组，页面销毁释放未完成回调；其他文件输入保留 ArkWeb 默认行为。默认选择器此前出现“无法打开”，补回调后 API 26 Pura 90 Pro 模拟器可浏览下载目录，并实际向网页返回 XML File 与中文内容；取消后可再次打开。没有增加全盘存储权限或放开外部导航。

HAP 已构建并安装到该模拟器；与 Android、桌面 SDK 的三方 LiveKit 联调取得实际解码电平和桌面收到的鸿蒙媒体字节。禁言/解禁/踢出、收起面板、弹幕广播与权限回滚、Cookie 入口错误反馈通过。PGS 画布定位、H.264/AAC 测试片画面推进通过。所有网页资源由 `npm run harmony:web` 生成，不能手改 rawfile。

交付物为 **1.6.0 / 160 正式签名 HAP**，使用既有 ZV.p12、发布证书和 release Profile，签名验证通过，发布证书身份与 1.3.0 一致。用户已确认鸿蒙纯外网域名语音可连接，见 [发行说明](releases/client-1.6.0.md)；真机音频、蓝牙、后台通话、生产代理/UDP/TURN、真实长片 seek 与字幕跨端广播尚待验收。原 HEVC Main 10 解码限制不因本次字幕修复解除；API 23 最低版本未新增设备验证。18 项共享回归通过不等于所有真机场景验收。

本轮 iOS 对齐补充：以共享 MusicHomePage/MusicDailyPage/MusicFmPage/DanmakuSearchModal 为参考，新增整份歌单替换或追加、连续漫游、来源下拉与双列弹幕选集、横竖菜单切换、音乐首页卡及日推历史日期。仅 iOS RN 业务与维护资料修改；本端原生和共享运行代码未改、未重新发布。69 项单测与隔离 v4.2.1 的 Web/协议检查通过，真机和完整权限差异保留；没有 EAS 云构建。详见 [预览补充](releases/ios-1.5.0-15-followup-preview.md)。

源码核对基线：`client-v1.5.0`，提交 `1ca96fd46963ff5cb89beb6c3d31e1d7b9f501fc`。2026-10-02 已将该标签的共享前端、Android/HarmonyOS 原生源码及版本文件同步至指定仓库 `E:/Codex-bulid/ZViewer/ZViewer-client`，保留 iOS b12 源码与证据。下述新增路径现已在本目录可读，亦可用 `git show client-v1.5.0:<路径>` 复核。见 [本地同步与验证](client-1.5.0-local-sync-2026-10-02.md)。本次构建验证不代表新增设备验收。

## 1. 当前开发进程

| 客户端 | 当前状态 | 维护结论 |
| --- | --- | --- |
| Android | 发布版本 1.8.0 / 180；既有签名 APK | 对齐 v4.5.3；与 HarmonyOS 同步发布 |
| HarmonyOS | 发布版本 1.8.0 / 180；ArkWeb 正式签名 HAP | 功能验证与设备边界见上方记录；ArkTS 独立维护与 HEVC Main 10 限制保留 |
| iOS | 独立已发布 1.5.1；本地候选 1.7.5 / build 17 | 本轮未构建或发布；候选与后续源码修复边界见 [iOS 维护文档](ios-maintenance-architecture.md) |

HarmonyOS 应用不是另写一套业务前端。它将根项目构建出的 `dist/` 放入 `entry/src/main/resources/rawfile/web/`，由 ArkWeb 以固定本地来源加载；平台能力通过 `zviewerHost` 注入，再由 `bridge-bootstrap.js` 暴露为共享前端识别的 `window.zviewerNative`。

1.3.5 的一起听导航在鸿蒙手机、横屏和平板固定折叠，忽略旧的展开偏好；播放器下箭头增加浅色圆形底板。房间玻璃背景使用主题变量，纯净视频关闭装饰性模糊和缩放。维护位置与回归清单见 [双端维护与发布](mobile-release-maintenance.md#一起听界面维护135)。

1.5.0 新增原生系统播放控件、封面及歌词同步，完善后台播放和自动旋转，修复横屏安全区、头像与追加视频弹窗。一起看采用中间双击播放、全屏左右双击跳转15秒；一起听仅在视频全屏使用相同手势。用户已确认双端测试全部通过，维护位置与正式构建验收见 [1.5.0 发布记录](releases/client-1.5.0.md)。

## 2. 代码归属边界

### 2.1 Android 与 HarmonyOS 共同维护

| 代码 | 作用 | HarmonyOS 维护动作 |
| --- | --- | --- |
| `src/App.tsx` | 服务端连接、账号/游客登录、会话恢复、房间列表和创建 | 修改后运行 `npm run harmony:web`，再编译 HAP |
| `src/mobile/` | 移动端房间壳、B 站账号、返回、旋转和音乐音频路由 | 不在组件内写 ArkTS 分支；通过 `src/platform/` 调用 |
| `src/upstream/` | 播放器、同步观影、一起听、语音、屏幕共享、弹幕、字幕、音乐和挂载浏览器 | 这里是产品功能的共享源代码 |
| `src/platform/contracts.ts` | Android Capacitor 和 HarmonyOS ArkWeb 的原生能力契约 | 新增能力先定义共同语义，再在 ArkTS 实现 |
| `src/platform/bilibiliProxy.ts`、`runtime.ts` 等 | 运行时识别、B 站代理、显示、生命周期、音频和权限入口 | 保持 `zviewerNative` 返回结构与 Android 插件一致 |
| `public/`、`vendor/mediabunny/` | 网页资源和媒体依赖 | 构建产物由脚本复制，不手工改 rawfile |
| 根目录构建配置 | Vite、TypeScript、依赖和相对资源路径 | HarmonyOS 使用 `npm run harmony:web` 生成相对路径 |
| B 站质量策略和协议 | `src/upstream/modules/bilibili/` 的 UI、状态和请求契约 | ArkTS 负责实现同一行为，不要改变网页层接口 |

### 2.2 HarmonyOS 独自维护

| 路径 | 内容 | 维护要点 |
| --- | --- | --- |
| `ZV-HarmonyOS/entry/src/main/ets/pages/Index.ets` | ArkWeb 宿主、虚拟本地源、资源拦截、导航限制、返回事件和麦克风权限 | 只允许 `https://zviewer.local`，不要放开任意外部导航 |
| `ZV-HarmonyOS/entry/src/main/ets/entryability/EntryAbility.ets` | Ability 生命周期和安全区 | 生命周期变化要和网页 `appLifecycle` 行为配合 |
| `ZV-HarmonyOS/scripts/bridge-bootstrap.js` | `zviewerHost` 到 `window.zviewerNative` 的异步请求桥 | action 名称和超时必须兼容 `src/platform/contracts.ts` |
| `BilibiliCredentialStore.ets` | B 站 Cookie 的本地安全存储 | Cookie 不返回到 JS 状态、日志或房间事件 |
| `BilibiliResolver.ets` | WBI 签名、视频信息、DASH/MP4 解析、普通画质筛选和实际 qn | 规则变化时与 Android Go 核心对照验证 |
| `BilibiliLocalProxy.ets` | 回环端口、随机路径、CDN 白名单、Range/HEAD、备用地址和解析接口 | 代理只监听 `127.0.0.1`，不把本机 URL 广播给其他设备 |
| `build-profile.json5`、`entry/` 配置与签名配置 | API、产品、权限、HAP 构建 | 证书、Profile、密码和本机 SDK 路径放在仓库外 |

Android 不直接引用这些 ArkTS 文件；Android 的等价实现位于 `ZV-Android/`、`native/bilicore/` 和 Java 插件。

### 2.3 生成目录与源代码

`ZV-HarmonyOS/entry/src/main/resources/rawfile/web/` 是生成目录，源代码在根 `src/`、`public/` 和 `vendor/`。任何共享网页改动都应重新运行：

```powershell
npm run harmony:web
```

不要直接修改生成的 `rawfile/web` 文件来修复功能；下一次构建会覆盖它。

## 3. 当前功能与代码入口

| 功能 | 共享代码 | HarmonyOS 独有代码 | 维护说明 |
| --- | --- | --- | --- |
| 服务端连接、账号/游客登录、令牌刷新和会话恢复 | `src/App.tsx`、`src/upstream/lib/api.ts`、`src/upstream/store/authStore.ts`、`src/upstream/hooks/useSocket.ts` | ArkWeb 网络权限和宿主生命周期 | 业务协议在共享层，宿主只提供运行环境 |
| 全局背景、主题、玻璃 UI 和外观设置 | `src/platform/runtime.ts` 的 `isGlobalAppearanceRuntime()`、`src/App.tsx`、`src/mobile/{MobileAppearance,MobileRoom}.tsx`、`appearance.css`、`themeStore.ts` | ArkWeb DOM/localStorage；`Index.ets` 原生返回事件 | Android/HarmonyOS 共用持续挂载的外观壳；房间设置显示外观入口，根节点变量覆盖 body Portal；外观返回优先于播放器设置、全屏、语音和离房 |
| 房间列表、创建、加入、密码/审批、房主/观众状态 | `src/App.tsx`、`src/mobile/MobileRoom.tsx`、`src/mobile/useMobileRoom.ts`、`src/upstream/store/roomStore.ts` | 无额外房间业务实现 | 服务端权限仍是最终来源 |
| 同步观影、MP4/MKV、DASH、FLV 和播放器控制 | `src/upstream/modules/room/watch-together/`、`sync-playback/`、`player/` | ArkWeb WebView 和系统解码器 | 真实设备编码能力仍需按发布设备验证 |
| 片单、分集、弹幕、字幕、聊天和评论 | `MovieListPanel.tsx`、`useWatchTogether.ts`、`danmaku/`、`subtitles/`、`CommentPanel.tsx` | 无额外业务实现 | 共享网页保持 Android 与 HarmonyOS 交互一致 |
| B 站扫码登录、普通画质选择、手动选档和回退 | `src/mobile/BilibiliAccount.tsx`、`src/upstream/modules/bilibili/`、`src/platform/bilibiliProxy.ts` | `BilibiliResolver.ets`、`BilibiliLocalProxy.ets`、`BilibiliCredentialStore.ets`、`Index.ets` | 登录凭据留在 ArkTS；网页只得到状态和播放结果 |
| B 站双轨播放与本机代理 | `src/upstream/modules/player/engines/`、`useVideoSource.ts`、`nativeQualityPolicy.ts` | `BilibiliLocalProxy.ets` 的 `/resolve`、`/proxy`、Range/HEAD 和 CDN 校验 | 解析成功不等于播放成功；需要验证拖动、暂停和备用地址 |
| 一起听、音乐队列、歌词和同步 | `src/upstream/modules/music/`、`src/mobile/useMusicAudioRouting.ts` | `setMediaPlaybackPreferred` 在 ArkWeb 桥接中降级或实现 | 平台缺少可选方法时应回退到网页行为 |
| 语音聊天和麦克风权限 | `src/upstream/modules/voice-chat/`、`src/platform/permissions.ts` | `Index.ets` 的 `requestMicrophonePermission`、ArkWeb 音频捕获权限 | 检查拒绝、重新授权和前后台恢复 |
| 屏幕共享观看 | `src/upstream/modules/screen-sharing/` | ArkWeb WebRTC/推流播放 | HarmonyOS 客户端不提供屏幕采集端 |
| FTP、WebDAV、OpenList、Emby、Jellyfin、服务端文件和直链 | `src/upstream/modules/{ftp,webdav,openlist,emby,jellyfin,server-files,direct-link}/` | 无额外业务实现 | 受服务端配置和设备解码器限制 |
| 旋转、沉浸式显示、返回键和最小化 | `src/mobile/PlayerDisplayControls.tsx`、`src/mobile/useNativeBack.ts`、`src/platform/{playerDisplay,lifecycle}.ts` | `Index.ets` 的 orientation、immersive、`onBackPress` 和 `minimizeApp` | 原生只执行系统动作，页面状态由 React 管理 |

## 4. HarmonyOS 升级顺序

系统媒体由 `NativeMediaSession.ets` 实现，通过 `Index.ets` 的 `updateMediaSession`/`clearMediaSession` 和 `bridge-bootstrap.js` 与共享播放器连接。封面下载后解码为 PixelMap；播放必须同时具备 AVSession 与 AUDIO_PLAYBACK 连续任务。暂停释放连续任务，退出销毁会话与图片资源。默认及解除手动锁定使用 AUTO_ROTATION_RESTRICTED，尊重系统旋转开关。契约与回归要求见 [双端维护与发布](mobile-release-maintenance.md#系统媒体控件后台播放与旋转2026-10-01)。

1. 共享业务改根项目 `src/`，完成 `npm run build`。
2. 运行 `npm run harmony:web`，确认 `rawfile/web` 已重新生成。
3. 需要系统能力时，先确认 `src/platform/contracts.ts` 的可选方法和降级行为。
4. ArkTS 改动按 `Index.ets` → `bridge-bootstrap.js` → 对应 service 的顺序检查请求链路。
5. B 站改动同时对照 Android 的 Go 解析和 HarmonyOS 的 `BilibiliResolver.ets`，确保权限、实际轨道和回退规则一致。
6. 在 DevEco Studio 或命令行构建 `entry`，再使用当前发布设备规则进行安装验收。

## 5. 维护检查清单

- 网页改动后重新生成 rawfile，不修改生成目录作为长期修复。
- 桥接改动检查 `zviewerHost` 的 method list、action、超时、错误回传和 `window.zviewerNative` 的字段。
- 本地资源拦截继续限制固定来源、禁止路径穿越并拒绝非本地导航。
- B 站代理继续限制回环 Host、Origin、CDN 域名、Range 和请求方法。
- Cookie 只在 ArkTS/安全存储/上游请求链路中流转，不进入 React 状态、日志、Socket 或房间广播。
- 播放器改动检查单轨、DASH 双轨、FLV、字幕、弹幕、seek、前后台和设备解码能力。
- 发布改动核对 `docs/releases/`、HAP/APPS 包版本、签名和 API 兼容性；签名材料不进仓库。
- `Index.ets` 通过生成的 `BuildProfile.DEBUG` 控制 ArkWeb 调试；debug 包可用 hdc 转发 `webview_devtools_remote_<pid>` 检查实际 HAP，release 自动关闭。应用进程重启后需重新发现 PID 和建立转发，不能继续使用旧 socket。
- 外观验收需断言主题切换前后 video/audio 为同一 DOM 元素，检查原生返回、横竖屏、Portal、前后台和进程重启后的主题持久化；播放器画布保持黑色。
- 播放设置 dialog 位于深色播放器 DOM 内，需在 dialog 边界重新绑定主题文字、表面与玻璃变量并移除继承的文字阴影。仅外层 dialog card 提供玻璃模糊；内部 main/side 面板取消 backdrop-filter，弹幕滑块分组保持透明，避免叠出淡白色矩形。首页 B 站账号等 mobile-text-button 使用主题强调色，不能固定为浅绿色。回归需看横屏全屏截图，同时检查内部 blur 为 none。
- 本轮 Pura 90 Pro（HarmonyOS 7/API 26）实测 H.264 MP4 与 H.264 MKV 可播放；用户的两部 HEVC Main 10 MKV 解封装和字幕提取成功，但视频零帧并报 `PIPELINE_ERROR_DECODE`。保留视频编码、移除音轨并换为 MP4 后仍失败，不应把 MIME 支持或解封装成功记作解码通过。详见本轮适配记录。

## 2026-10-01 B 站代理、影片时序与全面屏修复

在用户当前 DevEco MatePad Pro 模拟器原房间验证 HarmonyOS B 站影片：本机登录有效；native `/resolve` 返回 200、本次实际选择 1080P (qn 80)、H.264/AAC；Range 请求返回 206，视频为 1920×1080、readyState 4 且视频帧持续解码。本机媒体请求使用随机端口 33745，没有请求房主桌面 CLI 的 9333。HarmonyOS 横屏播放器全屏覆盖 WebView viewport，退出后恢复系统栏与安全区。

播放状态早于 current-movie 和影片列表到达时，观众端等候对应影片资料后再解析/attach；读取 local movieId 时须在异步等待后使用最新 store 值，并在影片已切换时取消过期解析。嵌入式客户端不能将房主 `127.0.0.1:9333` CLI 地址当作设备可达源；客户端本地代理仍使用独立随机回环端口，不需改成 9333。

ArkTS CDN 代理须原样转发 DASH 签名 URL 查询参数，包括 `nbs`。此 B 站 CDN 对常见完整移动 User-Agent 拒绝请求，使用 `Mozilla/5.0` 和尾斜杠 B 站 Referer 后成功取得 Range/206。只放行实际解析返回并核验过的 bilibili/Akamai/mountaintoys CDN 和受限 HTTPS 端口；Cookie 不发给 CDN。

Android `MainActivity` 使用原生 WindowInsets，HarmonyOS `Index.ets` 使用 WindowAvoidArea，把系统栏和 cutout 安全区同步到根 CSS `--native-safe-*`；共享 `appearance.css` 以 `--app-safe-*` 合并浏览器 safe-area。浅色访客标题/正文分别使用 `#1c293a`、`#43566b`，系统栏图标随主题切换。Android 手机模拟 viewport 411×914、HarmonyOS 首页横竖屏的浅/深色实测安全区内显示且无水平溢出。两端播放设置弹窗的内部模糊为 none、分组透明且文字阴影为 none，避免重复淡白色背景框。

Android 模拟器本机 B 站账号有效；隔离房间真实 CDN 播放连续 16 秒且帧数持续增加，延迟影片列表后解析正常，测试中收到 25 个 Range/206 响应并确认没有 9333 请求。用户原房间另行确认 1080P+ 高画质解析与 CDN 数据加载，无改动原房间播放状态。HarmonyOS 横屏全屏已验收。暂停/拖动与 Android 原生全屏专项操作脚本未最终通过，不将其记录为已验收。HEVC Main 10 在既有模拟器的解码限制不属于本次 B 站/界面修复，不应把轨道解析或解封装成功当作可播放。

## 6. 1.5.0 新增维护入口与回归

鸿蒙系统入口为 `Index.ets → services/NativeMediaSession.ets`，由 bridge-bootstrap.js 暴露 update/clear；AVSession 与 AUDIO_PLAYBACK 连续任务共同生效。module.json5 声明 audioPlayback 与 KEEP_BACKGROUND_RUNNING。暂停停止任务，离开销毁会话/请求/PixelMap；默认/解锁使用 AUTO_ROTATION_RESTRICTED。系统歌词写入 lyric/singleLyricText。

| 能力 | 共享源码入口（仓库相对路径） | 维护要求 |
| --- | --- | --- |
| 系统媒体 | `src/mobile/useSystemMediaSession.ts`、`src/platform/{contracts,mediaSession}.ts`；`src/upstream/modules/room/watch-together/WatchTogetherCore.tsx` 与音乐 `hooks/useMediaSession.ts` | 一起看/一起听均接入；sessionId/actions 校验，业务秒/系统毫秒，观众命令经过审批；旧播放器只能清理自己的会话 |
| 歌词与封面 | `src/upstream/modules/music/hooks/useSystemLyrics.ts`、`utils/lyricRequest.ts` | 合并请求、20 项/5 分钟缓存、LRC 上限 65536 字符；媒体桥接上限 262144 字符；切无歌词曲清空，旧图片回调不能覆盖新曲 |
| 旋转与手势 | `src/mobile/PlayerDisplayControls.tsx`、`src/platform/playerDisplay.ts`、`src/mobile/videoGestures.ts`；`useWatchGestures.ts`、`useMusicVideoGestures.ts` | 首次切换锁定、再次自动；中心双击播放，全屏侧边 ±15 秒；音乐仅纯净模式启用并操作音频；单击显示控件 |
| 音乐 UI | `src/upstream/modules/music/components/{MusicTopNav,MusicAppShell,MusicVideoModal}.tsx`、`hooks/useBackgroundVideoSync.ts`、`utils/neteaseImage.ts` | 宽屏仍折叠、44px 可见关闭区、背景铺满/前景避让、弹窗与键盘滚动、头像占位、删除后同源重加重新加载 |

系统控件权限、真正后台音频、旧会话清理、歌词快切、系统旋转锁和触屏去重需单独回归。后台不能只看 paused=false；需确认后台状态、时间推进和实际音轨输出。历史解码限制继续保留。所有客户端修改及 Git 操作统一在指定 ZViewer-client 仓库完成，遵循根 Agents.md。

## 7. 文档入口

- 双端版本、清理与发布步骤：[`mobile-release-maintenance.md`](mobile-release-maintenance.md)
- 当前 1.8.0 发行说明：[`releases/client-1.8.0.md`](releases/client-1.8.0.md)

- 共享移植边界：[`PORTING.md`](../PORTING.md)
- HarmonyOS 发布说明：[`ZV-HarmonyOS/README.md`](../ZV-HarmonyOS/README.md)
- Android 全局外观同步方案：[`harmonyos-global-appearance-sync-plan.md`](harmonyos-global-appearance-sync-plan.md)
- HarmonyOS v4.2.1 同步与模拟器验收：[`harmonyos-v4.2.1-adaptation-report.md`](harmonyos-v4.2.1-adaptation-report.md)
- Android 对照架构：[`android-maintenance-architecture.md`](android-maintenance-architecture.md)
- iOS 后续开发：[`ios-continuation-plan.md`](ios-continuation-plan.md)

## 2026-10-02 iOS 界面对齐交接

双端继续共用 src/，iOS 使用 RN + VLC。mobileDesign、Surface/AppDialog、来源下拉/集中选集移植产品布局与字段；默认背景复用 public/Nacho3.jpg，首页 B站账号改为可见文字，标题/提示有主题底色，竖屏评论位于视频下方。59 单测、29 首页/59 房间/21 来源 Web、24 Yoga 通过；只修改 iOS 与维护文档，未改双端程序。本轮无新增 EAS Build/Update 或 IPA，继续 Expo Go 预览；I13 后台业务 Socket 和原生等效验收保持待完成。详见 [b15 预览](releases/ios-1.5.0-15-preview.md)。

### 2026-10-02 展开音乐播放器补充

展开页重做为共享双端的播放卡/图标工具栏/独立完整歌词结构；iPad 竖屏双栏，窄屏手机切换歌词，短横屏压缩控件，封面明确宽高防止拉伸。新增 31 项播放页 Web 和既有 59 项房间复验均通过，0 JS 异常；59 单测、lint/typecheck 和 iOS/Web 导出通过。源码编号仍为 15，无新云端构建/更新或 IPA，继续 Expo Go Reload。原生安全区、大字体、旋转、VLC 出声和后台限制仍待设备验证。详见 [音乐页补充](releases/ios-1.5.0-15-music-preview.md)。

### 2026-10-02 音乐首页横幅与滑动补充

iOS 横幅改为加载原始宽图并等比铺满，去掉仅用于专辑封面的 CDN 方图裁切；支持手动左右滑动、双向首尾循环和定位条，短拖动/竖向滚动不切图，手动操作避开自动轮播。70 单测、60 项 RN Web/CDP 触摸与既有功能检查、lint/typecheck、本地 iOS/Web 导出通过；这不是 UIKit 真机通过证明。只修改 iOS 与维护记录，双端程序未变；没有新增 EAS Build/Update 或 IPA，继续 Expo Go Reload。
详见 [横幅补充](releases/ios-1.5.0-15-banner-preview.md)。

### 2026-10-02 iOS 发布交接

用户确认 iOS 真机 UI 通过；本轮 iOS 对齐版本 1.5.0，以未签名 IPA 独立发布。Android/鸿蒙源码已与现有 client-v1.5.0 发布提交核对一致，未重新构建双端包。由于 Expo Build 的额度限制，iOS 端更新与错误修复会出现延迟，不会与 Android/鸿蒙两端同步完成（除非有人有 Mac 帮忙编译）。


## 2026-10-09 1.7.1 Kazumi 与授权切片修复

共享 HLS loader 支持 Kazumi/AniSubs 代理上游基址及防盗链参数继承，避免重复代理和相对子清单错误；媒体鉴权先还原所选服务器逻辑 URL，再映射本机通道，token 仅附到同源 API。MobileRoom 只在首次播放器挂载传入恢复记录，切回原片不再恢复旧暂停状态。保留 src/platform/ 连接边界与既有原生播放策略。

31 项适配、4 项媒体回归和 Android/HarmonyOS debug 构建通过；浏览器房主 + 已授权普通用户在两个模拟器顺序测试 Kazumi《成神之日》1/2/3 集，1280×720 解码、时间推进及切片同步通过。详见 [本地验收](watch-kazumi-local-validation-20261009.md)。服务端权限矩阵查询与浏览器事件修复见 [PR #11](https://github.com/Zero-wyc/ZViewer/pull/11)，NAS 未改动，完整生效需要后续更新服务端网页/后端及 App。此次未发布正式版本，未覆盖物理设备或 iOS；鸿蒙交付为 unsigned debug HAP。


## 2026-10-09：1.7.1 / 171 正式发布

用户确认双端测试通过并授权发布 [ZViewer-Client V1.7.1](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v1.7.1)。正式签名 APK/HAP 沿用已有发布证书，校验版本、签名和共享资源；源码推送 Zero-wyc/ZViewerAPP 的 main，移除跟踪的 AGENTS.md 并加入忽略规则，排除测试账号、配置和签名私钥。Release 附件仅 APK、HAP、SHA256SUMS.txt，源码采用 GitHub 自动生成的 zip/tar.gz。此前 debug 联调记录保留其当时的验收边界；本次用户确认不补写未知真机型号或专项测量数据。

服务端修复仍由 [PR #11](https://github.com/Zero-wyc/ZViewer/pull/11) 交付；NAS 未改动，完整切片修复需要服务端前后端和 App 一并更新。本次不构建 iOS IPA。
