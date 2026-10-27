# 最新服务端与双端对齐：2.3.1 / 231（2026-10-27）

## 同步基线

服务端指定目录 `E:/Codex-bulid/ZViewer/ZViewer-source code` 已通过 GitHub `upstream/main` 同步到 [`6d3c64b6d7c5f4a620f5c75517c4c251166b1f5a`](https://github.com/Zero-wyc/ZViewer/commit/6d3c64b6d7c5f4a620f5c75517c4c251166b1f5a)，本地分支为 `sync/upstream-20261027`，受 Git 管理的源码与该提交一致。更新前为 `e6bb441`；该 Emby/Jellyfin 修复已随 [PR #36](https://github.com/Zero-wyc/ZViewer/pull/36) 合入上游。本轮没有另改服务端运行代码或创建旧版备份。

本轮相关 Go 测试和合同检查运行于 `067b0fd`；收尾同步新增 `e28b18f`、`6d3c64b`，差异仅为 GitCode 发布 workflow 与同步脚本，`backend-go/`、`frontend/src/` 和 `desktop/` 无变化，因此没有重复构建或执行不受影响的测试。

客户端检查基线为指定仓库 `E:/Codex-bulid/ZViewer/ZViewer-client` 的 `main` / `9320991`（2.3.0 / 230）。按照用户补充要求，本次除检查外，还将 PR #36 的影片播放设置和相关解析链路移植到 Android / HarmonyOS 共享实现，版本更新为 2.3.1 / 231。

上次客户端音乐适配记录对应服务端 `9e62237`。从该提交到本次目标的增量包括 Emby/Jellyfin 播放修复、GitCode Release 排序、桌面 cloudflared 自动下载和发布工作流维护。后几项没有新增需要手机实现的播放接口或桌面组件管理入口。

## 发现与本轮处理

| 项目 | 2.3.0 源码缺口 | 2.3.1 处理 |
| --- | --- | --- |
| Emby/Jellyfin 起播解析 | 起播直接使用历史 `movie.url/format`；旧 HLS 记录和过期凭证不能通过新版 movie-source 自动刷新 | 起播与观众重载请求 `/api/{emby,jellyfin}/movie-source`，采用新格式、音轨、播放地址；保留片级浏览器转码策略 |
| 直连最终地址 | movie-source 包装层未接入 `direct=1`、`resolvedDirectUrl`、`audioTranscodeDisabled` | 直连起播才请求解析最终地址，优先直接读取 CDN；兼容旧服务端只返回稳定 `directUrl` 的情况；失败保留原错误，不静默改为服务器中转 |
| 影片级中转开关 | 仅 Anime/Kazumi/CMS 显示；Emby/Jellyfin 缺少同款入口 | 在同一「播放设置」区域复用现有 `PlaybackOptionButton` 胶囊组件，与「浏览器转码」共享圆角、边框、字号、图标尺寸及选中态。仅内网挂载隐藏；公网 HTTP/HTTPS、缺少地址及未知可达性均不额外隐藏 |
| 模式保存及清晰度 | 原保存链只有数据源的 `serverProxy`，不能直接用于 Emby/Jellyfin；版本列表只读取 `ms` | Emby/Jellyfin 切换保存 `directLink`、稳定 URL、format、audioCodec 与 multiVersion；同时识别 `ms` 和 `MediaSourceId`，保留所选版本。临时 CDN 签名地址不写入影片记录 |
| 保存、应用及错误重试 | 现有策略确认只包含 serverProxy / playsvideoEnabled；错误重试固定重发转码开关 | 确认快照包含 Emby 的直连策略、URL 和格式，避免迟到广播覆盖；复用 saving / applying 状态与正在播放影片的重载流程；重试保留原请求；离房、切服、权限或版本代次改变后不提交迟到解析结果 |
| 音轨提示 | Emby/Jellyfin 遇到 DTS 等编码一律显示媒体服务器已转 AAC | HLS 显示已请求服务端转码；原容器按浏览器转码开关说明处理方式，关闭时提示可能无声 |

开关仅房主且具备影片编辑权限时可操作，观众显示房主设定并禁用编辑。设置保存期间禁用清晰度切换；切集与版本变更继续使用共享代次保护。当前影片的设置通过既有重载流程保留播放位置、速率与暂停意图，非当前影片下次加载时生效。

## 继续保留的双端定制实现

- 网易云 Go 进程内 API：本次增量未修改音乐路径；2.3.0 已有 message/msg、业务错误、第三方账号 401 与普通 503 分流，不能重新登记为待适配外部 Node 组件。
- 播放状态策略/元数据、预览及删除清理、挂载直链错误、跨设备图片与 OBS 观看票据保留已有实现。路由审计显示新增观看票据 GET 端点；当前客户端已使用该接口，维护回归继续通过。
- Android 原生 B站解析、HarmonyOS 本机解析、手势、亮度和本机音量采用客户端定制链路，本次没有以服务端网页整仓覆盖。
- 上游一起听的「音量均衡」仍未移植，属于可选功能差异；后续需要分别验证 WebView/ArkWeb、后台播放与本机音量关系，不阻塞本次 HTTP/Socket 合同兼容。
- 桌面组件下载、GitCode 更新源排序和 Release 同步是服务端/桌面/发布能力，本轮不在手机增加对应管理页面。

## 验证

| 检查 | 结果及边界 |
| --- | --- |
| HTTP / Socket 静态合同 | 冻结 HTTP 清单无缺失；额外 GET `/api/stream-push/watch/{roomId}` 已有客户端适配；65 个上行业务事件仍有处理器。路径存在不代表每条业务成功流程均验收 |
| 服务端相关测试 | `go test ./internal/api ./internal/room ./internal/emby ./internal/proxy ./internal/updater ./internal/ncm` 通过，部分包命中缓存；未启用真实网易云账号的 NCM_LIVE 测试 |
| 客户端回归 | 120/120 通过，其中新增 14 项 Emby/Jellyfin 回归，执行实际 API 包装、解析器与 roomStore；覆盖两种协议、双向保存、版本保留、旧 HLS、直接 CDN、旧服务端、失败及迟到请求边界 |
| 类型 / 网页资源 | TypeScript 与 Vite 构建通过，网页资源同步至双端；保留既有 vendor 动态导入等非阻断构建提示 |
| 浏览器实际组件 | 使用真实 MovieListPanel / MovieRuntimeSettings 和受控 HTTP 响应，Emby、Jellyfin 均完成点击保存。直连→中转失败及重试、4K 版本保留、内网隐藏、观众禁用均检查；320/420 像素容器内两枚按钮正常排列，触摸目标高 44px，胶囊高 32px、字号 13px、圆角 9999px |
| 双端构建 | Android `assembleRelease`、HarmonyOS release `assembleHap` 通过；版本统一 2.3.1 / 231，沿用现有签名；临时鸿蒙签名配置已恢复；APK/HAP 签名验证通过 |

Ego 浏览器最初因窗口最小化无法截图，使用 computer-use 恢复窗口后完成截图检查并关闭本轮任务空间。浏览器宽度检查使用受限宽度的真实片单容器；没有将桌面浏览器结果登记为 Android WebView / HarmonyOS ArkWeb 真机验收。

安装包、构建日志、浏览器结果和截图位于忽略目录 `release/client-v2.3.1/`。最终 APK/HAP 各计算一次 SHA256，记录于 `SHA256SUMS.txt`，后续发布复用该记录。

本轮没有新增实体设备的真实 Emby/Jellyfin 听音或跨设备播放验收，没有连接 NAS SSH、部署 NAS、修改 Windows GUI、推送客户端源码、发布 GitHub Release，也没有修改或构建 iOS。
