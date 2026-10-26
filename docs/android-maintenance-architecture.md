# Android 客户端维护文档

更新日期：2026-10-26（Asia/Shanghai）。本文是日常维护入口，已整合原发布、连接修复、服务端对齐与屏幕共享文档。历史运行证据和当前源码检查分开记录。

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

相邻服务端源码已从 `0af85d0954bb5a71bd0b6225b5a1322c1f8815fb` 快进更新至上游 main `6f1e092920f4826e6296b25e42e5296d1379a53c`，共 17 个提交。原工作区干净，通过指定服务端目录中的 `git fetch --no-tags upstream main` 与 `git merge --ff-only upstream/main` 更新；本地配置、数据库及运行数据未替换，未创建旧版本备份。此记录只代表本地源码，不代表 NAS 部署。

### 双端共用修复与入口

- 私人漫游：`src/upstream/modules/music/personal-fm.ts` 改为回避最近 12 首历史，而非整个历史；候选耗尽时额外补拉一次，允许历史重复，仍排除当前曲和池内重复。`MusicFmPage.tsx` 的手动下一首也采用该兜底，并保留每次异步后的会话代次校验。
- 恢复与取消：`music/fm-recovery.ts` 与 `hooks/useListenTogether.ts` 在补拉或入队确认失败后按 2 / 5 / 10 秒重试，用尽后显示失败。仅当前房间、当前曲、当前房主和有效代次可恢复；暂停、seek、换曲、换模式、离房或换 socket 后的旧任务不能恢复播放。入队必须先收到成功 ACK，失败不提前消耗候选。媒体加载错误可自动跳过，滚动一分钟最多 4 次；连续坏源达到上限后退出自动续播。用户播放意图单独保存，手动暂停后的迟到媒体错误不会跳歌或重新起播。
- 屏幕共享观众：`screen-sharing/components/WebrtcWatchPage.tsx` 监听真实 video 的 `volumechange`，把自动播放回退和播放器静音变化同步到控制栏；存在远端音轨且静音时显示“点击开启声音”。按钮在用户手势内取消静音并尝试播放，失败时提示重试。挂载、换 video 与换流时重新订阅，清理旧监听。Android 原生 MediaProjection/系统音频采集仍由既有平台桥管理。
- 房间分享：`room/roomShareLink.ts` 先经 `logicalConnectionUrl` 还原真实服务器，再拼接房间路径；保留服务器路径前缀，编码房间 ID，移除账号、查询参数和 hash。`RoomInfoPanel.tsx` 以这个地址检测内网，并保留“仍然复制”选项。不得直接复制 `getApiUrl()` 的原生回环端口或私有能力路径，也不能用移动端资源页的 `window.location.hostname` 判断服务器地址。
- 地址提示：`lib/netAddress.ts` 覆盖 IPv4 私网、回环、链路本地、CGNAT、IPv6 ULA/链路本地/IPv4-mapped 和常见本地域名。URL 规范化同时覆盖展开写法和十六进制 IPv4-mapped。此分类只提示字面地址范围，不做 DNS 查询，也不保证域名公网可达。

上游的 B站 CLI 决策去重、Anime 浏览器目录搬迁和桌面组网改造本轮未机械覆盖移动端定制代码。后端 CMS 缓存及 URL 辅助重构未改变所查 REST/Socket 请求合同；移除的 `embeddedSubtitleEnabled` / `voiceTransportMode` 历史字段未被当前双端源码读取。上游新“音量均衡”依赖 captureStream 旁路测量与元素音量增益，双端本轮尚未接入；后续须分别验证 WebView/ArkWeb 支持、锁屏后台、用户音量和实际听感，不能标为全量功能对齐。

### 本轮验证、安装包与后续验收

| 检查 | 实际结果与边界 |
| --- | --- |
| 服务端本地隔离回归 | backend TypeScript 编译、15 项媒体、10 项音乐回归通过；临时数据库下 89 项基础、16 项边界、23 项额外同步检查全部通过，代理及持久化服务测试通过。测试脚本已结束本地服务，不连接 NAS。 |
| 客户端回归 | `npm run test:maintenance` 54/54 通过，覆盖 FM 候选与 ACK、恢复上限及取消、暂停后的迟到错误、逻辑分享地址、B站独立音轨、后台可见性、沉浸租约和滑动切歌；TypeScript/Vite 生产构建通过。 |
| Android 构建 | `npm run android:sync` 后 `ZV-Android/gradlew.bat assembleDebug` 通过。2.2.0-debug / 221，应用 ID `com.zviewer.mobile.debug`，最低 API 24、目标 API 36，APK v2 签名验证通过；不是正式 Release 包。 |
| HarmonyOS 构建 | 同一 Vite 输出经 `ZV-HarmonyOS/scripts/sync-web.mjs` 同步，Hvigor Debug assembleHap 通过；2.2.0 / 221，debug=true，最低 6.1.0(23)，本次未配置签名，HAP 为 unsigned。 |
| 浏览器组件检查 | 本机夹具使用真实共享组件，验证内网提示及确认复制、公网服务器经原生回环映射后仍复制逻辑地址、外部 video 静音变化更新控制栏和开声提示。远端轨道由夹具模拟，未验证真实媒体解码或听音。 |
| 设备与发布 | 本次 adb / hdc 均无设备；没有新增真机验收，没有部署 NAS、推送源码、发布 Release 或构建 iOS。2.2.0 发布时的历史用户验收不覆盖本轮新增修复。 |

本轮本地包集中在忽略目录 `release/daily-maintenance-20261025/`：`ZViewer-Android-2.2.0-maintenance-debug.apk` 与 `ZViewer-HarmonyOS-2.2.0-maintenance-debug-unsigned.hap`。包内网页资源按本轮生成目录逐字节比对，鸿蒙以同步后 HTML 为准；每个最终包仅构建后计算一次 SHA256，摘要保存在同目录，不在后续发布时重复计算。维护代码完成后在指定客户端仓库本地提交。

真机补验顺序：房主启动漫游并离开漫游页，持续播放至补拉；模拟短暂网络失败和坏曲；在重试前暂停、seek、换曲、切房，确认不自动复活。随后验证锁屏后台与通知栏操作、共享观看自动静音及开声、HTTP/HTTPS 和带路径前缀服务器的跨设备分享。鸿蒙 unsigned 包需本机有效签名后才能安装；API 26 模拟器不能替代 API 23 实体验收。

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
| 首页、房间、移动布局 | `src/App.tsx`、`src/mobile/MobileRoom.tsx`、`src/mobile/mobile.css`；房间状态与权限在 `src/upstream/store/roomStore.ts` 及相关 hooks。 |
| 服务器连接与凭据 | `src/platform/connectionTransport.ts`、`serverConnection.ts` 与 `ZV-Android/app/src/main/java/com/zviewer/mobile/ServerConnectionPlugin.java`；连接证书和私有凭据留在原生侧，不能进入房间广播、网页日志或发布源码。 |
| 媒体播放与同步 | `src/upstream/modules/player/`、`sync-playback/`、`src/platform/playerDisplay.ts`；真实媒体身份与设备本地可播 URL 分离，切片/seek/离房要废弃过期异步任务。 |
| 视频显示、返回与系统媒体 | `src/mobile/PlayerDisplayControls.tsx`、`useNativeBack.ts`、`useSystemMediaSession.ts`；原生实现为 `PlayerDisplayPlugin.java`、`SystemMediaSessionPlugin.java`、`PlaybackService.java`。全屏退出须恢复方向与系统栏。 |
| B 站解析、账号、代理 | `native/bilicore/core/`、`native/bilicore/mobile/`、`scripts/build-bilicore.mjs`、`BilibiliProxyPlugin.java`、`src/platform/bilibiliProxy.ts`；WBI、PGC、UGC、画质与音轨仍需分别回归。Cookie 留在本机原生/Go 层。 |
| 媒体库与番剧 | `src/upstream/modules/emby/`、`jellyfin/`、`kazumi/`、`anisubs/`、`modules/player/services/library-hls-proxy.ts`；HLS 相对路径用选定服务器路由，媒体库版本使用真实 MediaSource ID。 |
| 音乐与语音 | `src/upstream/modules/music/`、`voice-chat/`、`src/mobile/useMusicAudioRouting.ts`、`AudioRoutingPlugin.java`；私人漫游仅房主在片单写入成功确认后推进，LiveKit 使用服务端返回的 URL/token/identity。 |
| 更新入口 | `src/mobile/AboutApp.tsx`、`appUpdates.ts`、`src/platform/appUpdates.ts`、`ExternalLinksPlugin.java`；只识别正式客户端 Release 和 APK，下载链接由系统浏览器打开。 |

`src/upstream` 是按服务端协议移植的共享业务，`src/mobile` 是双端移动 UI，`src/platform` 是可替换平台契约。`public/` 与 `vendor/mediabunny/` 是运行时资源；更新上游时应做定向移植，保留本地桥、补丁和生成物边界。`patches/playsvideo+0.4.7.patch` 是媒体修复的安装时依赖，不能作为旧过程文件删除。

### 共享层与宿主的调用链

React 页面先调用 `src/platform/contracts.ts` 中定义的能力，再由 `runtime.ts` 选择 Capacitor 插件。`MainActivity.java` 注册插件，Java 宿主负责权限、WebView、系统媒体和到 Go 解析器的连接。新增平台能力时，应先确定请求参数、返回值、失败码和取消语义，再同步 HarmonyOS 的 `zviewerNative` 方法；仅在 Java 增加方法会使鸿蒙共享页面落入不可用状态。

根目录 `npm run build` 的 `dist/` 会在 `android:sync` 后进入 Android `app/src/main/assets/public/`。`src/`、`public/` 和 `vendor/` 是源，生成的网页资源不能手工修复。上游服务端改动需要先确认 REST/Socket DTO 与房间权限，再将差异定向移植到 `src/upstream`，不要覆盖 `src/platform`、原生插件、本机连接通道、主题和本地媒体补丁。

## 服务器连接与凭据

### HTTP、HTTPS与原生通道

修复“地址探测成功，但游客/账号登录提示无法连接服务器”。旧版 `probe()` 在 WebView 请求失败后可由原生探测判定地址可用，而登录与后续 REST/Socket 仍直接访问内网 HTTP；两条请求路径可能产生不同结果。`native/bilicore/mobile/server_connection.go` 现在为 HTTP 地址也创建仅绑定当前服务器的随机回环通道，统一承载公开设置、登录 POST、Cookie、REST、Socket.IO/WebSocket 与流式/Range 请求；HTTPS 仍按既有证书策略处理。`connectionTransport.ts` 补齐明文 `ws:` 映射，保存与广播继续使用逻辑服务器地址。空地址且关闭证书例外表示关闭原生通道，切服、断开会清理连接与 Cookie。

共享 `serverConnection.ts` 对证书例外通道返回的 502 追加原始地址的无凭据原生诊断，仅在确认 TLS/端口不可用时继续 HTTP 候选；真实后端 502、401/403、证书错误，以及没有有效 HTTP 公开接口证据的网络错误，不会触发自动降级。`App.tsx` 登录复用刚确认的地址和通道，修改地址、模式或证书选项时清除选择，避免登录时重新探测协议和重开通道。问题证据、双端运行验证及本地安装包见 [内网连接修复验证](#历史验证与待验边界)。本次统一版本为 2.1.10 / 220，正式安装包已发布，构建记录位于 `release/client-v2.1.10/`。

探测不带账号凭据；证书例外仅绑定当前服务器origin，外部媒体CDN及独立语音服务器继续严格校验证书。退出、换账号、切服、关闭例外时清理Cookie、回环通道及旧代次。持久化和广播使用逻辑服务器URL，随机127.0.0.1端口及能力路径只在本机使用。账号密码、Cookie、token、二维码、原始日志和签名材料不得纳入源码。

## 影片、播放策略与跨来源同步

### 片级播放设置与媒体应用事务

本轮基线为服务端 `e3af086c7bd98ee0d4697386b69678f92ea54d81`。新增 `PlaybackOptionButton.tsx` 与 `MovieRuntimeSettings.tsx`：非 B站影片卡使用图标＋粗体中文的独立胶囊按钮，保留服务器中转与浏览器转码两个布尔值；添加面板按用户后续要求恢复 `PlaybackOptionToggle.tsx` 的说明卡＋滑动开关，沿用原草稿默认值与来源可见性。按用户后续反馈将可见胶囊缩为 32px、文字 12–13px、图标约 13–14px；`PlaybackOptionButton.css` 通过所在面板容器宽度（cqw/clamp）和字体比例适配窄屏/分屏，允许整按钮换行。外层触摸高度保留 44px，展开标题图标缩为 14px，不全局缩放其他控件。胶囊开启时使用 primary 实心填充、on-primary 对比色和勾选图标，关闭为表面色描边；勾选位预留宽度避免状态变化时跳动。影片卡默认折叠；屏幕共享隐藏，观众只读，写入要求当前分享端且具 root/持久房间所有者权限，REST 鉴权仍由服务器执行。

最终对齐由 `.playback-option-content` 对称预留半个勾号区域：左侧图标固定，文字与图标垂直居中；关闭时文字在图标右侧剩余区域居中，开启时文字左移半个勾号区域并显示右侧勾号，按钮宽高和图标边界不变。普通状态过渡 160ms，减少动态效果时接近即时切换。320/393/768px、100%/130% 字体、深浅主题、系统字体与实际载入的华文行楷共 24 组实测通过；字体行框与图标垂直中心误差小于 0.004px。该结果为实际组件浏览器几何验证，不能替代原生宿主或真机验收。

`roomStore.saveMoviePlaybackSettings` 只 PUT 改动字段，确认响应 Movie（兼容旧响应时 GET），按房间会话、逻辑服务器、事务令牌保护。`setMovies` 暂存保存中的策略，已确认值与无版本广播冲突时 GET 权威片单；GET 请求代次和 saving 阶段快照拒绝迟到结果。保存与媒体应用状态分开，当前影片交给 `useWatchTogether` 的完整源标识重载；非当前影片只保存。应用保留时间、倍速、暂停意图，成功 attach 后才写入可广播播放状态。失败保留新设置，停止失败管线、广播上次成功源的暂停态并显示重试；换片、离房、身份变化和旧回调失效，不反向 PUT 自动回滚。

ani-subs 返回明确片级转码值；Kazumi 采用元数据解析并兼容旧 HTTP(S)/代理记录，拒绝 `kazumi://` 占位地址作为回退媒体，保留必要源站头并剥离添加者的服务端凭据。Kazumi/CMS 代理使用相对地址，经本机所选服务器、路径前缀与原生连接通道完成鉴权，避免固定到添加者入口。观众以广播 `noProxyFallback` 对中转双向协调，保留片级 false、清理旧音轨/编码。

B站 JSON/NDJSON/CLI 接收 `isHdr/hdrType/videoCodecid`，按真实 codec/profile 做三态能力预检；明确不支持时保留旧引擎与档位，缺字段或探测不可用按未知处理。手动本机选档先解析预检再确认，旧会话结果不提交。仍保留普通 SDR/AVC/AAC 策略与原有 HDR/Dolby 过滤；手动 HDR 和音乐背景 HDR 按执行文档 B01 后置，未获得真实设备显示验收。`desktopManaged` 类型项 B02 本轮未实施。

语音 `transport.ts` 监看实际活动 publisher/subscriber PC/ICE，加入、重连与中断开启约 10 秒媒体窗口；等待麦克风授权不计入超时。每轮提示一次，恢复后清除；SDK 私有诊断不可用显示待确认，不直接断开通话。PC 替换、离房、重试均清理监听与计时器；线路仅采用当前 selected candidate pair。客户端不设置 UDP/TCP/TURN 固定端口，不修改 NAS 网络。

Android `native/bilicore/core/resolver.go/quality.go/pgc.go` 的实际 UGC/PGC 请求统一 `buildFnval`，修正会员、8K、AV1 位组合，MP4 保持 fnval=1；历史回归曾截获真实请求验证。修改后重建 ARM64/x86_64 Go AAR，再同步网页资源和构建 APK。

### 串行切源、预览与失败重试

依据 [双端检查报告](#历史验证与待验边界)，对齐固定服务端源码 `fe55ddebedb91a4834d6752c5619ea75efec0bbd`。广播、请求状态 ACK 与网页房主预览统一交给 `useViewerStateSync` 串行应用，只在实际 attach 成功后记录源、转码与中转策略；同 URL 改策略也重新加载，同策略只同步播放字段。队列保留最新状态，取消旧下载，失败可重试；订阅独占队列，离房/换片/切房后的迟到任务不能写回。请求期间收到新广播时忽略旧 ACK，服务器心跳继续只校正当前媒体。

`usePlayerSource` 在串行队列内按已成功加载的 PlayerSource 与 video 元素去重，比较地址、音轨、格式、编解码、headers、Blob 和两项策略；移除只按 URL 的提前返回，避免加载中策略切回被丢弃。失败清空已应用标记，不把已销毁的旧引擎记为可复用。观众重新解析 anime/Kazumi/CMS 时保留广播中的明确策略，禁止旧片单强制覆盖直连；预览不重新解析上一影片。HLS 传入恢复起点，并等待首帧数据（readyState ≥ 2）后才返回，避免 ArkWeb 连续重载后过早 seek。

访问统计使用 `movie-source/media-policy.ts`：数据源取 serverProxy、挂载取 directLink，已解析的服务端媒体代理 URL 优先判为中转，预览可由 noProxyFallback 判断；显示与复制共用该结果。WebDAV/OpenList 字幕仍使用原挂载标记。删除当前选择器未使用的单集预览回调与失效属性，保留多选/批量加入片单；其他预览入口与专用事件完整透传中转/转码策略。直连错误指引覆盖数据源与挂载，保留原生 HTTP/证书通道。

本次不覆盖 Android Go/HarmonyOS ArkTS 的 B站内置解析、账号边界或 CLI-only 规则；不修改 iOS、不构建 IPA。模拟器、正式签名包与未覆盖的真机范围分别见 [2.1.5 验证记录](#历史验证与待验边界)。

### 跨来源完整快照

双端共用 `src/upstream/modules/sync-playback/services/state-merge.ts` 的 `restoreStateSnapshot`。房主消息中的完整 state 为权威快照；显式清空旧状态中已不存在的音轨、CID、格式、编解码与清晰度字段，避免 JSON 省略 undefined 后由 diff 浅合并保留 B站音轨，令 Kazumi HLS 误入 DASH。`useViewerStateSync` 与 `usePlaybackStateRequest` 使用该恢复函数；心跳仍只校正同一媒体的播放进度，不恢复迟到旧源。

### 房间权限、媒体库和字幕

房间状态以服务端当前影片、片单和角色广播为权威。`roomStore.ts` 记录的影片 ID、CID、剧集和服务器逻辑 URL 跨设备一致；Go 本机代理的随机回环 URL 只能在当前设备解析/播放时产生，不能写进片单、缓存的逻辑身份或 Socket 广播。观众拿到播放状态早于片单元数据时，`useVideoSource` 应等待匹配影片资料；切 P/集、离房、切服或新请求开始后，旧解析结果必须失效。

`MovieListPanel.tsx`、`MoviePushPanel.tsx` 和 `playlistOrder.ts` 管理片单展示、添加、排序。完整排列与 root/房主权限由共享层先校验，服务端仍作最终鉴权。清空片单使用单次服务端删除请求并等待权威广播；响应失败不能先清 UI。自动续播位于 `room/watch-together/autoContinue.ts`，只从最新片单选下一部；房间/角色/模式变更需取消等待中的推进。`src/upstream/modules/sync-playback/` 负责房主/观众心跳、seek 抑制和状态合并，播放控制改动必须联测媒体换源与自然结束。

`src/upstream/modules/player/engines/` 根据媒体格式选择 MP4、HLS、DASH、FLV 或浏览器转码路径。`library-hls-proxy.ts` 处理媒体库主/子清单、相对分片与鉴权；`patches/playsvideo+0.4.7.patch` 修复 MKV cue 与 AAC 时间轴，`modules/subtitles/pgs-decoder.ts` 负责 PGS 位图。只有解析返回、Range=206 或容器识别成功，不代表设备解码成功；HEVC/Opus、ASS/PGS 与多音轨需按具体设备实播、拖动和字幕切换记录。

2026-10-14 HLS 连接核查：HTTPS 登录与游客登录都将服务端返回的 token 保存到本机，主清单、分片与密钥的服务端代理请求使用 URL token 鉴权，不能因 hls.js 未启用 Cookie 凭证就推断请求必然 401。修复共享 `getApiUrl()` 在证书例外回环通道下的尾斜杠，避免无路径前缀的服务器被拼成 `//api/...`；HLS loader 的 API 判定统一使用逻辑服务器地址，避免把本机通道对应的 API 再重建为代理请求。历史HLS鉴权回归使用实际 token 存储和 URL 构造函数覆盖双端来源、HTTP/HTTPS、路径前缀、证书例外通道、相对密钥与分片；这是自动化验证，不等于真机或线上故障复现。截图错误 URL 只展示前 80 字符，不能用它判断末尾是否带 token。

## B站账号、解析与设备能力

### 短链、分P、竖屏与账号路由

`modules/bilibili/input.ts` 提取分享文本里的 B站地址，保留查询参数；`MoviePushPanel.tsx` 的首次解析、切画质与切分 P，以及 `movie-source-resolver.ts` 的历史短链恢复，统一使用展开后的逻辑地址。`native/bilicore/core/mobile_input.go` 跟随受限重定向，不发送账号凭据；规范化时保留 `?p=N`。`quality.go` 在显式 CID/分 P 缺失时从 URL 选择分 P，返回规范地址保留实际分 P。服务器已有“先展开再识别 BV/ep/ss”的实现，本次只对齐客户端，不修改或部署服务器。

`nativeQualityPolicy.ts` 对横竖两组宽高分别执行 MediaCapabilities 检测，继续核对 codec、smooth、帧率及账号真实权限。Android `quality.go` 仍按实测能力逐轴筛选；无能力参数的 AVC 1080P30 保守默认补齐竖屏尺寸，不将空能力列表当成支持。实际反馈视频的 720P=720×1280、1080P=1080×1920，旧横屏能力 1920×1080 会误排除两档；480×852 则可通过。

`PlayerControlBar.tsx → PlayerDisplayControls.tsx → playerDisplay.ts` 读取当前 videoWidth/videoHeight，竖屏全屏请求 portrait，横屏和未知尺寸沿用 landscape。监听 loadedmetadata/resize 处理迟到元数据与全屏换源；相同比例的尺寸事件不反复覆盖手动解锁。方向请求保留串行代次保护，退出、卸载、离房解除锁定并退出沉浸模式。投屏与其他播放器沿用已有方向规则。

后续根据用户确认修复“仅登录服务端无法添加”：`getActiveCliProxyUrl` 在两端均要求 ready 且 loggedIn，普通内容无本机登录时进入服务端解析；`getBilibiliInputResolvePolicy` 为添加、切画质与分 P 统一检查 PGC CLI-only 条件。已登录本机的解析失败继续抛出，不静默切账号；CLI-only 不能走服务端。服务端 DASH 使用共享画质选择器，本机登录并启用 CLI 时保留 NativeQualitySelect。账号卡片分别显示服务端与本机状态，试看提示引用“当前解析账号”。

### B站双实现与质量规则

Android 的 `native/bilicore/core/wbi.go`、`pgc.go`、`resolver.go`、`quality.go` 与 `mobile/mobile.go` 构成 WBI、UGC/PGC、画质和本机 HTTP 代理链。根前端 `src/upstream/modules/bilibili/` 展示质量与解析状态。HarmonyOS 的 ArkTS WBI/Resolver 是独立实现：改签名、重排表、特殊字符编码、会员错误、分 P/集、DASH 音轨或业务 `result` 解析时，两边都要用同一固定输入向量与真实请求核对。普通画质自动选择要排除设备不兼容的 HDR/Dolby 档位；手选画质失败不能悄悄报告更高或不同轨道。

账号登录且本机代理可用时，默认“自动最高”只在账号权限、真实轨道与设备解码能力允许的普通画质中选择；HDR/杜比档位不能只按 qn 数值自动选入。没有可播的 1080p 以上画质，或高画质恢复预算耗尽时，优先尝试真实可用的 720p；若源站不提供 720p，继续尝试实际可播的更低档位并显示真实画质。会员/地域/影片删除等权限错误不能靠降画质掩盖。用户手选画质后以手选为准，登录回调或代理重连不能擅自升档；切 P 与换片须重新核对当前媒体身份、实际轨道和音视频同步。

`cliOnly` 影片必须先保持原有逻辑身份，只允许本机 CLI/本机账号路径解析。房主的桌面 `127.0.0.1` 地址不可能供观众设备使用，服务器代理兜底也不能突破 `cliOnly` 约束。Android 的服务器连接例外只作用于明确选择的 origin；随机私有通道供 HTTP、Range 与 WebSocket 使用，撤销时关闭在途请求。普通外域仍按系统 TLS 校验，不要全局关闭证书验证。

## 界面、选集与显示偏好

### 完整名称与列表网格

共享前端新增 `src/upstream/hooks/useFullMediaNames.ts` 与 `components/FullMediaNameToggle.tsx`。标题区的“完整显示”滑动开关默认打开，偏好以 `zviewer-show-full-media-names` 保存在当前设备的 localStorage，并即时同步同一应用中的浏览器和选集入口；存储不可用时保留本次运行的内存偏好。开启时列表与海报卡片的影片、剧集和分集名称按可用宽度自动换行，无行数截断，连续英文或文件名也可断行；关闭后恢复列表单行省略、海报标题两行省略。标题与操作按自然宽度优先同排，空间不足才换行；目录导航独立保持单行，各级名称以相同宽度分配空间，超长省略，不受完整显示开关影响。剧集整部添加按钮单独留出操作行，多选和批量添加沿用原逻辑。

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

Android 后台路径：`useAppVisibility` 使用 `App.appStateChange` 区分应用后台与保持活动的 PlaybackWebView；后台只暂停静音 MV 和画面校正，主音频、媒体会话与原前台播放服务继续工作，返回前台恢复画面并对齐主音频。没有修改 Android 原生服务注册或房间播放权限。

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


### Android采集与观看

`ScreenSharePlugin.java`、`ScreenShareService.java`、`ScreenShareAudioCapture.java` 负责MediaProjection、前台服务和系统/麦克风音频，`AudioRoutingPlugin.java` 与房间语音协调；仅在显式系统授权后采集。`MediaProjection.Callback.onStop` 与应用主动停止都需清掉虚拟屏幕、编码资源、音频录制和通知。观看端保留Activity系统PiP与应用内兜底；测试时按Home后仍需实际画面持续推进，进入事件本身不足以通过。

Android共享旋转依据真实捕获方向更新发送尺寸，帧率、内容比例和系统/麦克风切换分别验收。后台共享、蓝牙与系统中断需要实体设备验证；旧模拟器或合成回环结果不可外推。


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
| 网页已修复但 APK 仍旧 | `npm run android:sync` 是否重建并复制最新 `dist`；包内资源摘要是否与输出一致。 |
| B站能解析却黑屏/无声 | 实际选中的视频/音频轨道、CDN Range、WebView 解码器和原生代理请求；区分 WBI/权限、CDN 和编解码失败。 |
| 观众反复换源或跳回旧进度 | current-movie 与片单到达顺序、movieId/CID、请求代次、主动 seek 抑制及旧心跳。 |
| 自签服务器 API 可用但媒体/Socket 失败 | selected origin、原生私有通道、Range/WS Upgrade、路径前缀与撤销后的连接清理。 |
| 后台系统控件失效 | `SystemMediaSessionPlugin`、`PlaybackService`、媒体 sessionId、权限与前后台生命周期；构建通过不等于锁屏实测。 |
| 浅色弹窗文字或模糊异常 | 根 CSS 变量、Portal 边界、播放器黑色画布和内部面板叠加的 blur/文字阴影。 |

## 构建、发布与清理

工具链按仓库锁定版本准备：Node24、JDK21、Android SDK36/NDK r30、Go模块要求见 `native/bilicore/go.mod`；配置本机ANDROID_HOME、ANDROID_NDK_HOME与JAVA_HOME。签名只通过环境变量提供。

```powershell
npm ci
npm run typecheck
npm run android:sync
Set-Location ZV-Android
.\gradlew.bat assembleDebug
```

Gradle的 `buildBilibiliCore` 调用 `scripts/build-bilicore.mjs` 生成ARM64/x86_64 AAR。改Go后重建AAR，再同步网页，再构建APK；不能复用旧AAR冒充修复进入包体。Debug包名带 `.debug`，可与正式包并存。正式签名由 `ZVIEWER_KEYSTORE`、`ZVIEWER_STORE_PASSWORD`、`ZVIEWER_KEY_ALIAS`、`ZVIEWER_KEY_PASSWORD` 提供，禁止写进源码或日志。

检查版本、签名、最低系统与网页资源；每个最终安装包仅构建后计算一次SHA，发布复用保存摘要。完成可交付版本后在指定客户端仓库本地commit。GitHub Release标题为 `ZViewer-Client V版本号`，发行说明保留 Features、Bug Fixes、Breaking Changes、Performance Improvements、Documentation & Dependencies及完整变更链接；未特别安排时发布Android/HarmonyOS，源码从main获取，不另打源码包。当前Android/HarmonyOS为2.2.0 / 221；iOS保留2.1.10 / build31及其原发行附件，完整源码见main。

测试脚本、夹具、一次性UI检查及历史证据本次移入回收站，已同步移除失效npm测试入口。日常运行 `npm run typecheck` / `npm run build`；今后若建立新回归，应针对实际问题和当前合同。保留构建工具、依赖、Go AAR、签名源材料、`release/` 与iOS的 `release-assets/`。`dist/`、平台build、Gradle/Hvigor/Vite缓存可重新生成；同步到宿主的网页资源由同步脚本维护，不能手改。


## 本次整理与后续记录

2026-10-23仅做上游源码同步、客户端测试/缓存清理、文档整合及命令入口维护。未构建APK/HAP/IPA，未启动或修改NAS服务。清理前的版本/测试历史可通过Git查询；后续功能修复同时维护Android和HarmonyOS两份文档，具体设备型号、OS、角色、网络、版本与未通过项必须据实填写。

清理复核：2026-10-23的95项清理中，94项已确认在回收站；`.ui-validation/` 约3.88GiB超过E盘回收站1GiB限额，Windows未将其保留在回收站，目录已直接清除，未满足该项目的可回收要求。该目录为历史测试产物，正式release、已安装依赖和签名源材料保留。今后先查容量再回收，不能只凭API的SendToRecycleBin参数判定已回收。

本次整理后检查：共享前端TypeScript与Vite生产构建、Go `go build ./...`、iOS VLC持久补丁检查/ESLint/TypeScript及12个共享Go来源核验均通过。文档链接按保留文档与项目入口复核；这些结果不包含已移走的历史测试，也不新增APK/HAP/IPA或设备验收。
