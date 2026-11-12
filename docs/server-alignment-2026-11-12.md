# Android / HarmonyOS 服务端增量对齐（2026-11-12）

## 固定基线与范围

服务端指定目录从 `130ca3fb89b68a062d464d8672ff885c855000a9` 快进更新到 GitHub main `ebddfb990552b2971bbdd37b53747ce5728db9da`，共 18 个提交。客户端基于 `4e0a220`（2.3.9 / 239）适配 Android 和 HarmonyOS。按用户后续授权，版本确定为 2.4.0 / 240，自行验收后本地提交、推送 main，并发布 `client-v2.4.0`。此次不包含 NAS 部署或 iOS 修改 / 构建。

## 合同审计与实施清单

| 服务端变化 | 客户端入口及处理 |
| --- | --- |
| 新增 GET `/api/stream/resolve-bilibili-live?url=&qn=&movieId=`，movieId 校验房间访问并使用房主 Cookie；未开播为成功响应但无流地址 | `src/upstream/modules/bilibili/bilibiliApi.ts`、`types.ts`、新增 `live.ts`；使用现有 apiFetch 原生传输，支持取消和超时，不转交本机点播代理 |
| 直播间标准 / blanc / h5 / blackboard URL；返回 FLV 或 HLS、清晰度、封面、直播状态和签名有效期 | `src/upstream/modules/room/components/MoviePushPanel.tsx` 支持预解析、未开播添加、直播清晰度；不写入点播 CLI/DASH 偏好 |
| 直播影片通过 source=bilibili 保存规范直播间链接，新增时 serverProxy=true；取流地址不能缓存 | `src/upstream/modules/room/watch-together/movie-source-resolver.ts` 优先直播分支，跳过点播缓存、恢复旧地址和本机点播代理；新增直播设置组件并接入 `MovieListPanel.tsx` |
| WatchTogetherState 增加 isLive、liveDirect | `sync-playback/types.ts`、`services/state-merge.ts`、房主/观众 hooks 全链路保留；线路改变即使 URL 相同也重新挂载；直播不校正进度、不广播 seek/rate |
| 直播直连由播放引擎控制，失败时可回退服务器中转 | `player/types.ts`、`services/url-proxy.ts`、FLV/HLS 引擎；保留移动端取消、资源释放与传输映射，不能照搬上游丢失这些行为 |
| 直播控制栏不提供点播时轴/倍速 | `room/watch-together/PlayerControlBar.tsx`、`WatchTogetherCore.tsx`；保留手机手势、横竖屏、全屏和音量行为 |
| Jellyfin 拆分上游协议、修复账号修改后 userId；WebDAV/FTP/OpenList 少一次首播往返；OBS metadata/序列头补发 | 对外 REST 路径和客户端挂载结构保持兼容；核对 `modules/emby` 与挂载流程，更新服务端源码即可生效 |
| 网页多语言入口、仓库链接和发布镜像调整 | 手机无对应网页语言体系/发布镜像，不引入桌面导航；移植适用的下拉弹层定位修复 |

## 验证与交付门槛

验证直播 URL、解析鉴权参数与取消、未开播添加、房主/观众直播标记、同 URL 线路重挂载、禁用 seek/rate、直连失败回退和清理；运行受影响客户端回归、TypeScript/Vite 构建，同步双端资源并生成本地安装包。更新两份维护文档和版本，安装包仅在构建时计算一次 SHA256。本地/模拟证据与实体设备、真实直播 CDN 和弱网验收分别记录。

## 执行结果

- 已按上述文件映射实施，保留移动端原生传输、点播恢复与 Piik 边界。另修复验收发现的公共添加封装覆盖 serverProxy、直播清晰度进入原生点播策略及点播倍速残留问题。
- 425 项客户端回归全部通过：对齐 101、B站 77、维护 172、Piik 60、音乐工具栏 8、直播 7；TypeScript 与生产构建通过，直播回归加入 CI。
- 服务端相关九组 Go 包测试及独立后端构建通过。使用全新隔离数据库、回环地址和专用端口启动本地真实服务，验证健康检查、HTTP 登录、Socket 建房、直播添加、直连 / 中转保存与列表回读、未登录 401、无效链接及 movieId 对应链接不符 400。真实直播解析接口返回 200 / liveStatus=0 / 无流地址，未验证实际开播 CDN 播放。
- 浏览器使用实际 React 组件、roomStore 和 API 传输，配合模拟接口验证开播 / 未开播均提交规范直播间链接、serverProxy=true、duration=0、cliOnly=false；两种 REST / 推送时序均按确认路线触发重载，观众不可改线路。320 / 393 / 760 / 852 宽 DOM 检查无横向溢出，直播无点播时轴 / 倍速 / 同步入口，页面无未处理 JS 错误。属于组件与 DOM 验证，不是截图或真实直播播放器验收。
- Android APK（76,667,053 字节）与 HarmonyOS HAP（13,942,598 字节）签名构建通过，版本均为 2.4.0 / 240，签名身份与 2.3.9 一致，包内网页资源分别 33 / 31 项与宿主生成资源匹配。HAP 为 debug=false。最终包各在构建时计算一次 SHA256，发布复用记录。
- 鸿蒙模拟器安装、启动 HAP 并回读版本，ArkWeb 与原生桥接加载通过，布局包含连接界面。Android 只有离线模拟器；未获得双端实体设备、真实直播音画、后台及长时弱网证据，不继承旧版真机验收结论。
- 更新 README、CHANGELOG、Android / HarmonyOS 维护文档和 [2.4.0 发行说明](releases/client-2.4.0.md)。源码审计覆盖全部已跟踪文件和本次变更，不发布账号、密码、私有签名文件或 AGENTS.md；附件仅 APK / HAP / SHA256SUMS，源码由 GitHub 自动归档。
