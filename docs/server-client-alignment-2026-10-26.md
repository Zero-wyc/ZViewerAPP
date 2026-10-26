# 服务端增量检查与客户端对齐方案（2026-10-26）

检查日期：2026-10-26（Asia/Shanghai）。范围以 Android / HarmonyOS 共享客户端为主，重点检查 HTTP 接口、Socket.IO 事件、鉴权、播放状态和媒体代理。本文记录检查结果和后续方案，不代表已经完成新版客户端适配或设备验收。

## 本地实施进展（2026-10-26）

原文保留审计时的事实与边界。本轮已实施 S01/S02 与 A01/A02/A03/A05，详见两端维护文档新增 2.2.2 / 223 记录。服务端新增元数据列增量迁移、房间/资源校验及 GUI NCM 组件交付；实际扫码 key/PNG/801、26 组合同、189 条路由及双端编译通过。尚未提交服务端 PR、发布或新增设备验收；音量均衡与移动后台为原计划可选项，未实现。

## 1. 结论

服务端在上次完整适配之后，主要完成了 **Node → Go 后端迁移**，并增加数据库自举、内置推流服务、更新源选择和若干并发、权限与播放清理修复。客户端无需整体更换 API 路径，也无需替换 Socket.IO 客户端，但目前不能判定为完全兼容。

本次确认两个应由服务端修复的问题：

1. **S01 / P1：播放状态查询和服务器心跳丢失策略字段。** 房主实时广播中的 `playsvideoEnabled`、`hostCliEnabled` 能正常转发，但 Go 播放记忆没有保存这些字段，查询 ACK 和服务器周期心跳会丢失它们。已在隔离进程复现。这是 Go 迁移引入的状态合同缺口。
2. **S02 / P1：B站代房主解析缺少房间准入校验。** 没有进入某房间的普通用户，即使读取片单得到 403，仍可通过该房间影片的 `movieId` 触发服务端选用房主的 B站 Cookie。已用虚构 Cookie 和完全拦截联网的测试传输复现。旧 Node 基线也有相同缺口，不能归为本轮 Go 新增问题。

客户端本轮应重点对齐：**NCM 服务不可用提示与恢复、直链错误分流、B站 MP4 默认画质与双端本机解析差异、删除与预览的生命周期检查**。音量均衡属于尚未移植的本地功能；GitCode 更新源属于管理端能力，当前移动客户端没有对应更新管理页面，不应据此新增整套后台功能。

检查数量与结论边界：

| 检查 | 本次结果 | 能证明什么 |
| --- | --- | --- |
| 冻结 HTTP 契约静态对账 | 189 条旧规则均覆盖；Go 归一化后 188 条，缺口 0、额外规则 0 | `HEAD /api/server-files/proxy` 由 Go 的 GET 规则天然支持；数量差不等于删接口 |
| 隔离进程 HTTP 路由探测 | 189/189 实际请求，0 跳过、0 请求异常、0 接口兜底 404 | 方法和路径仍存在；其中 171 条返回鉴权 401，不代表业务成功路径全部验收 |
| 上行 Socket 契约对账 | 65/65 事件保留，断连处理存在 | 事件名与处理器存在，不代表字段无遗漏 |
| 客户端 AST 辅助扫描 | `src/` 中 213 处 API 字符串/模板引用、154 个不同路径模式；57 处可直接读取事件名的 `.emit` 调用均落在旧事件契约内 | 不包括以事件常量传参的 emit；URL 包含公共前缀、动态来源和查询串片段，扫描用于导航，动态拼接另作源码核对 |
| 隔离本地合同检查 | 25 组检查完成，另外记录 S01 这一已确认缺陷 | 登录、刷新、进房、空状态、影片 DTO、删除清理、三种 Socket 传输、NCM 错误等有实际应答证据 |
| 独立权限边界复现 | S02 已确认；真实 B站请求 0 | 未入房请求能选用其他房主的虚构 Cookie；没有证明真实会员内容播放或 Cookie 明文泄露 |
| 现有 Go 测试 | `api / room / sio / auth / bilibili / ncm / proxy / updater` 8 个包通过，部分使用 Go 测试缓存 | 现有测试通过仍未覆盖 S01、S02，不能用来替代上述缺口检查 |

## 2. 基线、目标与检查口径

| 项目 | 固定版本/提交 | 说明 |
| --- | --- | --- |
| 客户端当前源码 | `52ef3098be79181d2f6bac14f97ad3159472a6d5` | 本地 `main` 与本次 fetch 后的 `origin/main` 一致；Android/HarmonyOS 2.2.1 / 222 |
| 上次完整协议对齐基线 | `e3af086c7bd98ee0d4697386b69678f92ea54d81` | 服务端 v4.7.4；客户端 2.1.9 记录了 A01–A06 完整对齐，后续版本在此基础上维护 |
| 后续部分功能同步参考 | `6f1e092920f4826e6296b25e42e5296d1379a53c` | 客户端 2.2.1 已同步私人漫游恢复、观众静音和逻辑房间分享等；不是第二次全量接口适配 |
| 本次上游审计目标 | `a34db94d8547c3fb292a442cbbf767922ab16129` | 2026-10-26 fetch 得到的 `Zero-wyc/ZViewer` main；距离完整基线 120 个提交，含合并，非合并提交 116 个 |
| 本地服务端工作区 | `56eb51c`，分支 `feat/cloudflared-download-source-20261026` | 比上游目标多 2 个桌面 Cloudflare 提交；已确认 `backend-go/` 与 `frontend/src/` 和上游目标无差异 |
| iOS | 2.1.10 / build31 | 独立 React Native 工程；本文不能作为 iOS 全量适配结论，本次没有启动 IPA 构建 |

完整历史区间：[v4.7.4 基线到本次 main](https://github.com/Zero-wyc/ZViewer/compare/e3af086c7bd98ee0d4697386b69678f92ea54d81...a34db94d8547c3fb292a442cbbf767922ab16129)。部分功能同步之后的区间：[6f1e092 到本次 main](https://github.com/Zero-wyc/ZViewer/compare/6f1e092920f4826e6296b25e42e5296d1379a53c...a34db94d8547c3fb292a442cbbf767922ab16129)。

版本边界来自 [Android 维护文档](android-maintenance-architecture.md)、[HarmonyOS 维护文档](harmonyos-maintenance-architecture.md) 和 [CHANGELOG](../CHANGELOG.md)。审计固定到上述提交，不依赖以后可能移动的 `main` 或“latest”。仓库根 `package.json` 的版本不能代替完整服务端协议版本判断。

本次只 fetch 引用、读取历史和源码、运行本地隔离检查并编写文档；没有切换或覆盖服务端桌面工作分支，没有连接 NAS SSH，也没有修改 NAS、客户端运行代码或服务端运行代码。

## 3. 上次适配以后，服务端改了什么

| 变化 | 代表提交 | 对客户端的实际影响 |
| --- | --- | --- |
| Go 后端基座及鉴权、媒体、挂载、房间、音乐等逐模块迁移 | `ff93b34` 起；`59b4f47` 契约快照；`a4cfc98` 切运行入口；`80a3454` 删除 Node 后端 | 运行实现变化最大；保留 URL 和事件名，但需检查 DTO、null/缺省/false、流式响应及状态恢复 |
| 默认 SQLite WAL、索引、热备份、新库建表和首次启动自举 | `46471fb`、`f9e3d4f`、`4dec508`、`9a5da21` | 部署和持久化变化；客户端不读 SQLite，不需要跟着更换存储实现 |
| Go Socket、播放并发、脏状态落盘、房间会话边界修复 | `2f8e1c9` / PR #30 | 不改事件名；踢人、转交房主更严格，断连和播放清理更可靠；仍有本文 S01/S02 缺口 |
| 删除当前影片时清播放记忆和字幕；网页同步清选择和源快照 | `2f8e1c9` | 客户端已有多数删除清理，但不能直接把网页补丁视作已覆盖所有移动预览路径 |
| 一起听 NCM 从进程内 npm 服务变为外部 HTTP 服务 | `4032a22`，交付说明见 `eede7b4` | API 前缀保留；部署遗漏更容易收到 503 `NCM_UNAVAILABLE`，客户端需明确提示和恢复入口 |
| 内置 Go RTMP/HTTP-FLV 服务，外部 NMS 变为可选配置 | `eede7b4` | OBS 配置 API、`/live` 和推流可用性事件沿用；不会要求移动端自己连接新的固定端口 |
| B站 MP4 匿名默认也请求 720P | `b616096`、`def12f9` | 解析参数不改，默认画质行为和说明改变；DASH 匿名上限不随之放宽，本机代理需独立核对 |
| Emby/Jellyfin 支持服务端 `EMBY_CLIENT_NAME` | `5b7ad48` | 服务端向上游发送的客户端标识可配置；移动端不需要新增请求字段 |
| 管理端和桌面端新增 GitCode 更新源，失败直接报错 | `d17c7ed`、`cfe41eb`、`b171600` | 管理设置新增 `updateUseGitCode`，更新检查新增 `info.source`；不影响普通观影 API |
| v4→Go 升级清 Node 遗留文件，更新包解压改标准库、失败硬终止 | `71d3d7c` 及 Go updater 迁移 | 服务端运维与错误语义；客户端不得把更新脚本已启动当成服务已经重启完成 |
| 私人漫游候选去重、失败恢复、坏源跳过 | `ab741db` | 2.2.1 已做对应移动实现，继续保留房间/曲目/代次和 ACK 防护 |
| 屏幕共享无音轨诊断、观众静音双向同步 | `91ca204` | 观众侧已同步；网页房主的 getDisplayMedia 文案不能覆盖 Android 原生采集实现 |
| 房间链接检测内网地址并提示 | `6f1e092` | 2.2.1 已按原生连接映射改为逻辑服务端地址，不应改回网页的 location 判断 |
| 一起听响度均衡及本地开关 | `0316263`、`59fc774` | 双端尚未接入；最终是本地偏好，不新增服务端全局开关或音乐同步字段 |
| Anime 浏览器迁目录、CLI 决策去重、CMS 缓存/URL 辅助整理 | `d2b22c8`、`7c71ade`、`ca6ca34`、`e30f841` | 主要为内部结构；共享客户端有定制代理和组件，不需要机械搬目录 |
| EasyTier、证书、Cloudflare、桌面图标、自动启动、GitCode/Release CI | 多条桌面与发布提交；PR #29/#31 已在目标历史中合并 | 无移动端 REST/Socket 合同新增；作为部署入口变化登记即可 |

Node 删除前的增量中，HTTP 注册和 Socket 上行注册没有出现需要移动端改名的变化；CMS ResolveCache 重构保留 `success/url/headers/format` 返回。删除的历史 `embeddedSubtitleEnabled`、`voiceTransportMode` 字段没有被当前双端共享源码读取。

## 4. 服务端问题 S01：权威播放快照丢字段（P1，已复现）

### 4.1 影响接口与根因

| 通道 | 当前行为 |
| --- | --- |
| 上行 `watch-together-state` → 对其他成员实时广播 | 原始 `state` 透传，策略和扩展字段保留 |
| `watch-together-request-state` 成功 ACK 的 `data.state` | 取 Go `Playback`，未声明字段被丢弃 |
| `server-heartbeat.state` | 同一份不完整快照，已实际复现 |
| `sync-heartbeat` 中 `source:'server'` 的 `state` | 使用同一 `Playback`；源码确认受相同问题影响 |
| `watch-together-check-status` 需要纠偏时的 `data.state`、房主恢复的 `playback` | 同样依赖播放记忆；需列入修复后的回归 |

`internal/room/playback_handlers.go` 将上行 JSON 解码为 `Playback`，而 `internal/room/playback.go` 的结构体没有 `playsvideoEnabled`、`hostCliEnabled`，也没有客户端已使用的部分番剧扩展字段。实时广播直接使用原始 JSON，因此表现为“实时状态正常，重新查询后字段消失”。旧 Node 播放记忆使用 `{ ...state, ...补丁字段 }`，在内存中保留上行扩展字段。

固定源码：[Go Playback](https://github.com/Zero-wyc/ZViewer/blob/a34db94d8547c3fb292a442cbbf767922ab16129/backend-go/internal/room/playback.go#L22)、[上行状态入库与原文广播](https://github.com/Zero-wyc/ZViewer/blob/a34db94d8547c3fb292a442cbbf767922ab16129/backend-go/internal/room/playback_handlers.go#L88)、[旧 Node 播放记忆](https://github.com/Zero-wyc/ZViewer/blob/e3af086c7bd98ee0d4697386b69678f92ea54d81/backend/src/modules/playback-memory/playback-memory.service.ts)。

### 4.2 最小复现与观察结果

隔离服务端、隔离新库、房主和游客观众：

1. 创建无需审批的一起看房间，添加并选中一条虚构 URL 影片。
2. 房主发送完整状态，其中包含：

```json
{
  "sourceUrl": "https://example.org/fixture.mp4",
  "sourceType": "url",
  "isPlaying": false,
  "currentTime": 12,
  "playbackRate": 1,
  "duration": 100,
  "playsvideoEnabled": false,
  "noProxyFallback": true,
  "hostCliEnabled": true,
  "epId": 1001,
  "seasonId": 2001,
  "seasonTitle": "contract season",
  "preview": false
}
```

3. 观众收到实时广播：上述字段保留。
4. 观众请求最新状态，并等待服务器心跳：两条应答均缺少 `playsvideoEnabled / hostCliEnabled / epId / seasonId / seasonTitle / preview`。`noProxyFallback:true` 正常保留。

这里的 `preview` 是番剧试看元数据，和预览播放标志 `isPreview` 是两个字段。普通进度、URL 和当前影片 ID仍能恢复，所以仅检查“能拿到状态”会漏过问题。

客户端 [WatchTogetherState](../src/upstream/modules/sync-playback/types.ts)、[restoreStateSnapshot](../src/upstream/modules/sync-playback/services/state-merge.ts) 与 [观众源处理](../src/upstream/modules/sync-playback/hooks/useVideoSource.ts) 会读取这些策略。现有代码只在同一来源内保留旧 `playsvideoEnabled`；首次进房、切片、新来源或无影片 ID 的预览不一定有可保留值。`hostCliEnabled` 丢失也会影响按房主 CLI 状态决定观众解析方式。

**影响是条件性的策略丢失，不能表述为所有媒体必然无法播放。** REST 影片 DTO 中的 `playsvideoEnabled:false` 本次实测正常，已有片单补查能缓解部分场景，但不能代替完整状态合同。

### 4.3 修复归属与对齐要求

- **服务端先修：** 同步 `Playback` 与真实客户端状态字段；可选布尔值必须区分缺省、false 和 true。至少保留上述两个策略字段，并逐项确认番剧字段。不能把 `false` 当零值忽略。
- 运行期缓存、请求 ACK、周期心跳、房主恢复应输出一致字段；需要跨重启保留的字段还要定义落盘或按影片重建规则。旧 Node 的数据库恢复是否完整需要另查，不能据内存透传认定它已经解决持久化。
- **客户端配合：** 从影片 DTO 获取有效默认策略；预览只能使用同一来源的明确策略。新来源不能继承旧影片的 false/true，也不能把“服务端漏字段”直接解释为“允许转码”。
- 新增回归必须发送带显式 false 的完整状态，再检查实时广播、查询 ACK、服务器心跳、纠偏、重连和重启恢复；仅验证事件数量没有意义。

本次只记录缺陷，没有修改服务端或提交修复 PR。

## 5. 服务端问题 S02：B站解析可越过房间使用房主凭证（P1，已复现）

### 5.1 入口与根因

```http
GET /api/stream/resolve-bilibili?url=<B站地址>&movieId=<影片ID>
```

接口要求持有有效 ZViewer 登录令牌，但 `movieId` 路径只通过 `RoomOwnerUserID(movieId)` 查房主，再读房主 B站 Cookie。中间没有检查请求者是否获准读取该房间；传入的 `url` 也没有在该分支绑定到影片记录。

这使得“可以调用解析接口”和“可以借用指定房间房主的解析身份”混成同一权限。问题不取决于客户端是否隐藏入口，必须在服务端修复。

源码：[解析身份选择](https://github.com/Zero-wyc/ZViewer/blob/a34db94d8547c3fb292a442cbbf767922ab16129/backend-go/internal/api/stream.go#L126)、[只按影片 ID 查房主](https://github.com/Zero-wyc/ZViewer/blob/a34db94d8547c3fb292a442cbbf767922ab16129/backend-go/internal/store/movie.go#L146)。旧 [Node resolve 路由](https://github.com/Zero-wyc/ZViewer/blob/e3af086c7bd98ee0d4697386b69678f92ea54d81/backend/src/routes/stream/resolve.ts) 也采用这一流程，属于继承问题。

### 5.2 本次复现证据

构造两个测试普通用户：A 为房主，B 为未申请、未获准进房的请求者。A 只绑定一个虚构 Cookie。使用测试 HTTP Transport 拦截全部 B站请求，实际联网请求为 0。

| 步骤 | 实际结果 |
| --- | --- |
| B 查询 A 的房间片单 | HTTP 403，正常拒绝 |
| 检查 B 在该房间的 session | 0 条 |
| B 携带该影片 `movieId` 调用 B站解析 | HTTP 200，进入 NDJSON 解析流程 |
| 拦截服务端上游请求 | 请求携带 A 的虚构 Cookie，确认发生跨房间身份借用 |
| 最终解析结果 | 因测试传输主动拒绝上游而返回 NDJSON 错误；不尝试真实媒体 |

本次确认的是**凭证使用越权**。没有证据表明 Cookie 字符串被直接返回给调用方，也没有实际验证第三方会员播放，不能把这两项写成已发生。

### 5.3 修复与客户端约定

1. 服务端先按 `movieId` 找到影片和所属房间，复用影片读取准入规则；未入房/未通过审批者返回 403，不得选取房主 Cookie。
2. 将请求 URL 的 BV/ep/ss 及分集参数绑定到该影片允许的资源范围，避免合法房间成员用一个 `movieId` 请求任意其他资源。
3. 明确无效 ID、影片不存在、房间关闭、会话结束的处理。修复后建议分别返回 400/404/403，不静默改用另一账号掩盖错误。
4. 不带 `movieId` 的自主解析继续使用请求者自己的账号；root/持久房主和已入房观众按现有权限设计处理。
5. 客户端继续使用真实当前影片 ID；遇到准入失败停止该次共享解析，提示重新入房或申请批准，不自动换成其他身份重试。

客户端入口：[bilibiliApi.resolveBilibili](../src/upstream/modules/bilibili/bilibiliApi.ts)、[resolveBilibiliOnline](../src/upstream/modules/room/watch-together/movie-source-resolver.ts)。现有 `movieId` 调用形式可继续使用，修复重点在服务端校验。

回归至少覆盖：未入房用户、待审批用户、其他房间成员、已结束 session、已关闭房间、合法观众、房主、自主解析，以及 `movieId` 与请求资源不匹配。

## 6. HTTP 接口逐类对齐

### 6.1 NCM：地址不变，部署依赖和失败提示需要对齐（A01 / P1）

Go 不再在进程内运行原网易云 npm API，改由服务端 `NCM_API_BASE` 指向独立 NCM 服务。默认地址是服务端自身回环 `http://127.0.0.1:36530`；Docker 配套 compose 的 music profile 提供独立服务。**客户端仍请求 ZViewer 的 `/api/music/...`，不能把该服务端回环地址抄进手机。**

继续使用：

- `/api/music/ncm/<上游接口>`：搜索、推荐、歌单、歌词、扫码登录等通用转发。
- `/api/music/login/status`、`/logout`、`/ncm-cookie`、`/ncm-cookie-login`。
- `/api/music/stream`、`/song-quality`、`/album/full`、`/cloud/upload`。

通用转发等路径在 NCM 不可达时返回：

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json

{"code":"NCM_UNAVAILABLE","message":"NCM 服务未启动"}
```

这是原本已有的业务错误形状，Go 外部化使其成为重要部署边界；**不能称为新加了一个音乐 URL，也不能假定所有音乐端点都统一返回这个 JSON**。Cookie 登录等部分路径仍有自身 500 错误包装，音频元素收到 503 也不能直接读取 JSON。

现客户端缺口：`MusicHomePage.tsx` 多处只读数组并静默显示空区块；`useNcmLogin.ts` 的二维码 key/图片接口只取字段，503 可能表现成“无二维码”或一般失败，没有统一辨认 `NCM_UNAVAILABLE`。API 层 `apiGet` 本身能返回 HTTP status，但业务层没有充分利用。

建议：

1. 在音乐业务层统一保留 HTTP 状态和 `code/message`，显示“服务器的网易云音乐服务不可用，请联系管理员或稍后重试”。把请求成功但列表为空和服务不可用分开。
2. 503 不等于 ZViewer 登录失效，不退出 App，不清空有效网易云凭证，也不把它改写成“Cookie 已过期”。
3. 为推荐、搜索、扫码、歌单和播放错误提供明确重试；恢复 NCM 后能重新加载。首页现有 `loadedRef` 一次加载门控需要有可控失效方式。
4. 保留已有 FM 有限退避、取消和坏源上限；服务整体不可用时避免持续跳歌或重复刷扫码请求。
5. 服务端部署检查和客户端提示同时完成；只改客户端无法提供不存在的 NCM 能力。

源码：[Go NCM 转发](https://github.com/Zero-wyc/ZViewer/blob/a34db94d8547c3fb292a442cbbf767922ab16129/backend-go/internal/ncm/forward.go#L42)、[服务端部署说明](https://github.com/Zero-wyc/ZViewer/blob/a34db94d8547c3fb292a442cbbf767922ab16129/README.md)、[客户端首页](../src/upstream/modules/music/pages/MusicHomePage.tsx)、[登录 Hook](../src/upstream/modules/music/hooks/useNcmLogin.ts)。

### 6.2 B站解析：参数保留，MP4 默认档位变化（A02 / P2）

`GET /api/stream/resolve-bilibili` 继续接收 `url / qn / codec / page / preferMp4 / forceDash / movieId`。返回仍支持 NDJSON：进度行、`status:'done'` 的完整结果、`status:'error'` 的业务失败。HTTP 200 不足以表示流式解析成功。

本次实际变化是 `Mp4TargetQn`：未指定 qn 的匿名 MP4 路径请求 64（720P）；显式 qn 仍尊重用户选择，只截断到 MP4 上限 64。**DASH 匿名上限没有变为 720P**；实际画质仍以返回的 `currentQn` 和片源为准。

客户端共享请求与 NDJSON 解析已存在，不需要重写；应更新“通常 480P/720P”一类说明，并检查：

- 服务器 MP4 匿名/登录、显式低 qn、默认 qn，能正确显示实际返回档位。
- Android 内嵌 Go 和 HarmonyOS ArkTS 是独立解析实现，服务器修复不会自动进入安装包。Android 实际入口是 `ResolveMobile`，不应只改旧 `Resolve` 函数。
- HarmonyOS `BilibiliResolver.ets` 当前把匿名默认设为 32，PGC 的 `preferMp4` 也沿用这个 qn。此分支存在与新服务端默认 MP4 规则不一致的源码证据；需区分 auto/manual/fallback，并在原生可用媒体上复验。
- 不能把所有路径统一改成 qn=64；本机 DASH 仍按账号、能力、手动选档和降级规则处理。保留 codec/HDR 预检、PGC 试看/分集和 cliOnly 身份边界。

源码：[Go MP4 规则](https://github.com/Zero-wyc/ZViewer/blob/a34db94d8547c3fb292a442cbbf767922ab16129/backend-go/internal/bilibili/permission.go)、[客户端请求与错误类](../src/upstream/modules/bilibili/bilibiliApi.ts)、[Android ResolveMobile](../native/bilicore/core/quality.go)、[HarmonyOS 解析器](../ZV-HarmonyOS/entry/src/main/ets/services/BilibiliResolver.ets)。

### 6.3 直链解析：错误不能一律回退旧 URL（A03 / P2）

接口保留：`GET /api/direct-resolve/movie?movieId=<id>`，成功为 `{success:true,directUrl}`。Go 审计修复了按任意用户挂载取凭证、不同用户共享签名直链缓存、多人并发空成功，以及更改 OpenList 密码仍用旧 token 的问题。

可见业务错误包括：400 `INVALID_MOVIE / INTERNAL_NETWORK_FORBIDDEN / UNREACHABLE` 等，404 `NOT_FOUND / MOUNT_NOT_FOUND`，401 `AUTH_FAILED`；房间准入和 ZViewer 令牌还由外层鉴权处理。具体错误以应答为准，不只按状态码猜。

现客户端 `resolveMovieDirectUrl` 丢弃业务 code，调用方捕获任何失败后继续用固化 `movie.url`。这会隐藏“挂载删除/凭证失效/无权访问”的真实原因，也可能继续尝试已经失效的签名 URL。

建议保留 `status/code/message`；对准入失败、挂载缺失、认证失败、明确禁止内网直连停止或引导处理；临时网络错误是否允许回退，要结合现有直连策略和旧 URL 有效性，不能自动转为服务器代理。上游挂载 401 与 App 登录 401 也应区分，避免无意义刷新会话。

S02 修复要求同样适用：客户端错误处理应尊重服务器的新准入失败，不以回退逻辑绕过它。

源码：[服务端直链解析](https://github.com/Zero-wyc/ZViewer/blob/a34db94d8547c3fb292a442cbbf767922ab16129/backend-go/internal/api/directresolve.go)、[客户端 directLinkApi](../src/upstream/modules/direct-link/directLinkApi.ts)、[当前无条件回退](../src/upstream/modules/room/watch-together/movie-source-resolver.ts)。本项回退策略风险为源码检查结论，本次未用真实挂载复现播放结果。

### 6.4 管理设置和更新源：新增字段，按移动端实际范围接入（A04 / P2，可选）

| 接口 | 变化/保持的规则 | 客户端处理 |
| --- | --- | --- |
| `GET /api/admin/settings` | `settings.updateUseGitCode:boolean`，偏好默认 true | 类型可补齐；普通用户不能改读管理接口来获取这个字段 |
| `PUT /api/admin/settings` | 可保存上述布尔值；false 必须保留，字符串 `"false"` 返回 400 | 如以后新增管理 UI，携带必要设置字段；该接口不是只发一个属性的 PATCH |
| `GET /api/system/update/check?includePrerelease=true` | `info.source` 为 `gitcode` 或 `github`；原 info 字段保留 | 展示实际源；不能仍声称检查与下载都固定来自 GitHub |
| `POST /api/system/update/apply[-stream]` | 使用所选源；GitCode 失败直接报错，不自动换源 | 明确显示错误；改源是用户操作 |
| `POST /api/system/update/upload[-stream]` | 原始二进制文件体，500MB 上限，流式接口仍为 SSE | 不能套 JSON apiPost 或 multipart；本轮移动端没有这套调用 |
| 桌面 GUI 托管时以上更新接口 | 鉴权后返回 409、`desktopManaged:true` | 引导使用 GUI 更新；401/403 优先于 409 |

偏好保存于服务端 `config/update-source.json`，不在 SQLite 新增该列。实际更新源还可能受 `ZVIEWER_UPDATE_SOURCE` 环境变量覆盖；管理设置显示的偏好值不一定等于一次更新检查的实际来源，应以 `info.source` 为准。GitHub CDN 加速只作用于 GitHub 路径，不能给 GitCode 下载地址加 GitHub 代理前缀。

本次实测发现单独 PUT `{updateUseGitCode:false}` 会先因缺少既有必填设置失败；带上现有设置后保存成功，显式 false 被保留。原必填要求不是本轮新加，接入时需遵守。

当前客户端只有 `systemSettingsStore.fetchAdminSettings()` 的读取能力，没有管理端页面及服务端更新调用；因此这是**类型/未来管理入口对齐**，不是当前播放功能的阻断项。公开 `/api/auth/public-settings` 没有 `updateUseGitCode`，不要假设所有设置都会公开返回。

源码：[Go admin DTO 与保存](https://github.com/Zero-wyc/ZViewer/blob/a34db94d8547c3fb292a442cbbf767922ab16129/backend-go/internal/api/admin.go#L573)、[更新结果类型](https://github.com/Zero-wyc/ZViewer/blob/a34db94d8547c3fb292a442cbbf767922ab16129/backend-go/internal/updater/types.go#L30)、[不自动回退的实际实现](https://github.com/Zero-wyc/ZViewer/blob/a34db94d8547c3fb292a442cbbf767922ab16129/backend-go/internal/updater/source.go#L169)、[客户端 settings store](../src/upstream/store/systemSettingsStore.ts)。部分旧注释仍写“GitCode 失败自动回退”，与实际实现不符；本文以执行路径为准。

### 6.5 影片、挂载、来源与媒体代理

| 接口组 | 当前合同与变化 | 对齐结论 |
| --- | --- | --- |
| `/api/rooms/:roomId/movies` 及 reorder / 单项更新删除 | GET/POST/PUT/DELETE 保留；创建为 HTTP 201；显式布尔 false 保留；影片 username/password 为 null | 客户端使用 `res.ok` 等成功判断；不从影片列表取挂载明文凭证 |
| WebDAV / OpenList / FTP 的 mounts / browse / resolve / proxy / stream | URL、参数模型保留；Go 更严格按协议输出 Range 长度，FTP 主机和端口解析修正 | 保留既有代理与直链决策；补 206/416、seek、取消与新签名 URL 验证 |
| Emby / Jellyfin resolve / movie-source / stream / proxy / image | 双前缀保留，多版本/HLS 子资源模型保留；`EMBY_CLIENT_NAME` 由服务端运维控制 | 不新增移动端参数；非法 HLS 子资源被置空，不能把原始带 key 的地址回退给客户端 |
| anime / ani-subs / Kazumi / CMS | sources/search/episodes/resolve/proxy 等保留；抓取改 Go 网络栈，失去原 PowerShell TLS 兜底；上游请求有超时 | 继续传 episode/playbackParams/sourceMeta；展示可恢复错误，真实站点仍需逐源验证 |
| 多源弹幕 / 字幕接口 | 保留路径、轨道和数据模型 | 不重新实现协议；验证空数组、null、偏移和大数据量 |
| `/api/stream/proxy*` | Range、流式取消、CORS 沿用；Go 实现承担新网络路径 | 不能根据进度流/媒体流是否带 Transfer-Encoding 头判断可用性 |
| B站收藏写入 | Go 不对副作用写请求自动重试 | 一次用户动作对应一次请求，失败显示重试，不能在客户端叠加无条件自动重投 |

## 7. Socket、鉴权与生命周期

### 7.1 连接与房间事件基本兼容

客户端仍可使用 `socket.io-client@4.8.3`。本次真实客户端验证了纯 WebSocket、纯 polling、polling→WebSocket 升级三种路径；没有证明 Android/HarmonyOS 原生通道、反代路径前缀或真实弱网也已通过新版 Go 验收。

| 场景 | 保持的合同 | 需保留的移动实现 |
| --- | --- | --- |
| 连接鉴权 | Cookie → `auth.token` → query token；逐包复核和到期断开 | `useSocket`、token refresh、有限重连、切服取消；不改成只支持 Cookie |
| HTTP 与公开设置 | 登录/刷新 token、用户 DTO、公开权限字段保留；HTTP 不写认证 Cookie | 原生通道的 Bearer、连接映射、HTTP/自签 HTTPS 既有处理 |
| create-room / register-host / request-join | ACK 与审批、已加入/等待批准流程保留 | 当前客户端依赖“已加入房间”等既有文案，本次实测该文案未变 |
| request-state 无播放状态 | `{success:true,data:null}`，向其他成员发起的请求状态事件可为零参数 | null 是明确空状态，不得与“data 缺失”混为一谈 |
| 房主状态与观众纠偏 | state/diff/seq/clientTs、serverTs、hostOnline 沿用 | 不额外再补一次传输延迟；S01 修复后必须保证全状态字段一致 |
| 一起听 music:* | queue-upsert、sync-state、get-state、控制申请、心跳等沿用 | 保留入队成功 ACK 后再起播；`music:get-state` 的 queue/syncState/serverTs/hostOnline 在顶层，不是 data 内 |
| 踢人与转交房主 | 目标必须属于当前房间且 session 有效，失败不再修改其他会话 | 操作失败刷新成员视图；不能用本地角色提升替代服务端确认 |
| 物理删房与断开 | 广播 `room-closed` 并清会话、播放记忆 | 已有媒体拆除和离房处理继续使用；不得在房间关闭后自动复活拉流 |

服务器 HTTP 健康接口 `/health` 的 `startedAt` 仍是毫秒数字，另有 `status/timestamp/restartCount`。首次启动数据库自举不需要移动端添加“初始化数据库”接口。

### 7.2 删除当前影片和预览（A05 / P2）

Go 已在删除当前影片时清空播放记忆和字幕；本次“REST 删除 → `current-movie:{movieId:null}` → request-state 的 data:null”实测通过。

当前客户端已经：

- 从权威 `movie-list` 中发现当前影片不存在时清选择、取消下载、递增加载代次并清源。
- 收到 `current-movie:null` 时取消旧加载。
- currentMovieId 清空时暂停元素、清媒体资源。
- 在 room-closed/离房/断连时停止媒体。

因此不能重复安排“从零实现删除同步”。仍需补查两处：

1. [useWatchTogether 的 null 清理 effect](../src/upstream/modules/room/watch-together/useWatchTogether.ts) 没有上游新增的 `isPreview` 保护；`previewPlay` 又会把 currentMovieId 置 null。已有影片切到预览时存在清理与新 attach 冲突的源码风险，应先用实际入口复现再修。
2. 只有 `current-movie:null`、没有配套 movie-list 的路径，没有统一清完整源快照；要区分恢复、预览和明确删除，不能一收到 null 就无条件清所有状态。

上游网页补丁应按移动端加载代次、viewerStateReceiver 和预览逻辑移植；不能整份覆盖。**上述两点是待复现/补测项，本次没有做移动 UI 播放复现。**

### 7.3 语音、WebRTC 与 OBS 接收

语音继续使用 `POST /api/voice/token`，body 为 roomId/可选 username，成功返回 `{success,url,token}`；mute/kick 继续传 roomId 和 LiveKit identity。`/rtc` 保留 HTTP/WS 隧道。没有改为其他语音 SDK，也不需要客户端生成服务器密钥。

推流继续通过 `query-stream-push-availability` 查询和 `/api/stream-push/obs-config/:roomId` 取配置，播放地址沿用逻辑服务器的 `/live/<streamKey>.flv`。Go 现在默认内置 RTMP/FLV；外部 NMS 仍为可选，探测可能有约 5 秒缓存。不要因迁移把手机拉流地址固定成服务器内网 3335 或环回地址。

本次没有启用真实 LiveKit/NMS 媒体面；以上是源码与现有局部测试结论，真实双向语音、OBS 推流、跨网接收仍待验收。

## 8. 已对齐、未接入及不需要移植的功能

| 项目 | 当前状态 | 后续动作 |
| --- | --- | --- |
| 私人漫游最近 12 首去重、补拉、有限恢复和坏源上限 | 2.2.1 已同步移动实现 | 重点补 Go 服务端/NCM 不可用时的组合验收 |
| 歌单/每日推荐首曲 ACK 后起播、队列、网易云封面 HTTPS | 2.2.1 已实现 | 遵守现有串行和取消规则，不能用网页实现覆盖 |
| 房间内网分享提示、逻辑服务器 URL、路径前缀 | 2.2.1 已实现 | 保留原生地址映射，不复制手机回环代理 URL |
| 屏幕共享观众 volumechange、点击开声 | 2.2.1 已实现 | 新 Go 端补真实流验收 |
| 网页房主 getDisplayMedia 无音轨/音轨中止提示 | 不等同于手机采集功能 | Android 由 ScreenShareService/AudioCapture 等原生实现承担，按平台状态反馈检查 |
| 音量均衡 | 双端未接入，既有维护文档已登记 | 可单独安排；本地设置、测量旁路、只衰减，验证 WebView/ArkWeb、后台锁屏和原生音量关系，不改服务器 DTO |
| Anime 组件目录搬迁、CLI helper 去重 | 未机械同步 | 按需做维护重构，不影响本轮接口兼容目标 |
| EasyTier、证书 GUI、Cloudflare、桌面更新、CI | 服务端/桌面/发布工具变化 | 移动端不复制实现；使用它们形成的新访问入口时再测连接 |
| iOS | 独立工程，未做本轮逐接口/native 审计 | 复用本文 S01/S02/NCM 的服务端合同结论，另列 iOS 适配任务；没有指示不启动 IPA 构建 |

## 9. 实施顺序与验收清单

### 第一阶段：先补服务端合同与权限边界

- [ ] S02：对 movieId 代解析增加房间读取权限与资源绑定，补合法/非法身份和资源组合测试。
- [ ] S01：补齐 Playback 策略与扩展字段，明确缓存、心跳、恢复与持久化的一致性。
- [ ] 检查目标部署是否实际提供 NCM；Go 源码已经同步，不等于 NAS 已升级，更不等于 NCM 已运行。

如后续实际修服务端，按项目规则在指定本地服务端目录测试，向 Zero-wyc/ZViewer 提交说明问题与更改内容的 PR；本文未启动这些修复。

### 第二阶段：Android / HarmonyOS 最小必要对齐

- [ ] A01：统一音乐服务不可用识别、提示和恢复；503 不清 App 登录和有效音乐凭证。
- [ ] A03：保留直链错误 code/status，区分准入、认证、挂载缺失和临时网络；保持 noProxyFallback。
- [ ] A02：更新 MP4 默认画质说明；分别处理本机 MP4 的 auto/manual/fallback 差异，保留 DASH 能力策略。
- [ ] A05：复现并处理影片→预览的清理冲突，补删片/清片单/重连/迟到广播检查。
- [ ] 在 Go 修复版本上验证完整状态，不能把缺字段的临时默认值包装为“服务端已经对齐”。
- [ ] 两端有实际运行代码修复/功能更新时同步更新 Android/HarmonyOS 维护文档；构建完成后在指定客户端仓库本地提交。

### 第三阶段：功能补齐与设备验收

- [ ] 按需实现音量均衡；A04 仅在需要移动管理入口时接入。
- [ ] 双端 HTTP、可信 HTTPS、自签例外、路径前缀、WebSocket 与 polling，含刷新/过期/切服。
- [ ] 房主/普通成员/游客/待审批/房管权限；转交、踢人、离房后不能复用旧会话。
- [ ] 一起看：片级转码 true/false、直连 true/false、同 URL 改策略、预览、删除当前片、新观众、断线恢复和服务器重启。
- [ ] B站 UGC/PGC、多 P、会员与试看、MP4/DASH/cliOnly、匿名/登录、HDR/codec 与实际画质。
- [ ] OpenList/WebDAV/FTP/Emby/Jellyfin：私有凭证隔离、改密码、挂载删除、直链过期、HLS 子资源、206/416 和取消。
- [ ] NCM 在线/停服/恢复；搜索/扫码/歌单/歌词/流/音质/漫游/锁屏后台；B站音乐仍可按其自身路径工作。
- [ ] 真正的跨设备屏幕共享开声、双向 LiveKit 语音、OBS 推流和移动接收。

## 10. 本次验证材料与可复核入口

### 10.1 保留在服务端仓库的合同与测试

- [HTTP 冻结清单](https://github.com/Zero-wyc/ZViewer/blob/a34db94d8547c3fb292a442cbbf767922ab16129/backend-go/testdata/contract/routes.json)：189 条旧规则；该数量包括 `/health`，不包括 NCM 透传的任意子路径、`/rtc`、`/live`、静态资源和 Socket 传输入口。
- [上行事件冻结清单](https://github.com/Zero-wyc/ZViewer/blob/a34db94d8547c3fb292a442cbbf767922ab16129/backend-go/testdata/contract/events.json)：65 个业务事件；不是全部下行事件清单。
- [迁移台账](https://github.com/Zero-wyc/ZViewer/blob/a34db94d8547c3fb292a442cbbf767922ab16129/backend-go/MIGRATION.md)：有阶段性旧描述，NMS 曾外部化但目标已经内置，不能只看早期段落。
- [上一轮 Go 并发与删除审计](https://github.com/Zero-wyc/ZViewer/blob/a34db94d8547c3fb292a442cbbf767922ab16129/backend-go/AUDIT-2026-10-25.md)：记录已合并修复，不代替本次新发现。

本次执行的仓库检查命令：

```powershell
# 在指定服务端仓库执行
node backend-go/scripts/route-audit.js --fixture backend-go/testdata/contract/routes.json --json
node backend-go/scripts/event-audit.js --fixture backend-go/testdata/contract/events.json

# 在 backend-go 中执行
go test ./internal/api ./internal/room ./internal/sio ./internal/auth ./internal/bilibili ./internal/ncm ./internal/proxy ./internal/updater
```

### 10.2 本地一次性证据

位于客户端仓库之外：`E:/Codex-bulid/ZViewer/tools/client-alignment-20261026/`，不作为发布源码或安装包内容。

| 文件 | 用途 |
| --- | --- |
| `inventory.cjs` / `inventory.json` | 共享源码 API 字符串/模板、Socket emit 辅助清单；动态路径需要人工解释 |
| `smoke.cjs` / `smoke-results.json` | 隔离进程 25 组合同检查、189 条实际路由探测、S01 实际字段差异 |
| `bili-boundary_test.go` / `overlay.json` | S02 独立复现；用 Go overlay 增补测试而不修改服务端源码 |

S02 复现测试是**确认当前错误行为**的测试，通过表示越权路径已复现，不表示产品已修好；正式修复应把断言改为“无权请求在读房主 Cookie 之前拒绝”。S01 也作为 findings 单独记录，没有被 25 组正常流程检查的通过结果掩盖。

本次服务端测试进程已停止。没有构建 Android/HarmonyOS 安装包、没有新增实体设备验收、没有启动 iOS 构建、没有发布 Release 或推送源码。后续实施须继续区分源码检查、本地受控应答、浏览器/模拟器和实体设备证据。
