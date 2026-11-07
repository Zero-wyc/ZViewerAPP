# 服务端 v5.2.1 更新解读与 Android / HarmonyOS 屏幕共享适配执行文档

日期：2026-11-07。状态：源码审计与实施方案，客户端尚未实施。

## 1. 本轮实际完成与基线

| 项目 | 审计基线 / 本轮结果 |
| --- | --- |
| 服务端目录 | `E:/Codex-bulid/ZViewer/ZViewer-source code` |
| 更新前服务端 | `7b5047289a46c2c03188d380ddf431e8dbfbecc7`，包含 v5.1.8 |
| 更新后服务端 | GitHub `Zero-wyc/ZViewer` 的 `main`：`130ca3fb89b68a062d464d8672ff885c855000a9` |
| 更新方式 | 工作区干净；fetch 后 `git merge --ff-only upstream/main`，前进 88 个提交；未创建旧源码备份 |
| 最新正式版 | v5.2.1，发行提交 `f23ac89307864ca155da2cc9273ded10cf2dacae`；北京时间 2026-11-06 22:44:45 发布 |
| main 与正式版区别 | main 在正式版后另有 3 个提交，见第 2 节 |
| 客户端目录 | `E:/Codex-bulid/ZViewer/ZViewer-client` |
| 当前客户端 | 2.3.7 / 237，`52a67278321bf02386dd9d7b997fc98f705a1a2c` |
| 本轮改动 | 本文及双端维护指南的兼容性说明；没有修改客户端程序、构建安装包或发布 Release |
| 部署边界 | 更新的是本地源码，未更新 NAS 容器，未连接 NAS SSH |

正式版信息来自本轮 GitHub Releases API；协议结论来自上述固定提交的本地源码。发行说明包含大量开发阶段提交，判断最终实现时以当前路由注册和实际调用为准。

**核心结论：2.3.7 的屏幕共享与语音不能直接兼容新服务端。需要迁移共享控制面、观众接收端和语音协议，同时保留手机原生采集。仅修改 Socket.IO 事件名不能完成适配。**

## 2. 新版本具体改了什么

| 变化 | 实际含义 | 客户端影响 |
| --- | --- | --- |
| 屏幕共享改用 Piik | 独立裸 WebSocket `/signal`，协议 `piik-v24`；服务端下发连接拓扑 | 共享不再经旧 Socket.IO `signal-*` 事件协商 |
| 观众互助 | 服务端可让观众从另一位观众接收，并向自己的下游转发 | 观众端从“只接房主的一条 PC”变成按连接管理的媒体端点 |
| 共享生命周期重做 | 独立认证、开播代际、暂停、停止、路由修订号 | 原生采集状态不能直接等同于服务端已开播 |
| 语音迁移 | 默认使用 Piik `room-voice-*`；仍留有 Socket.IO 自建 SFU 分支 | 原 LiveKit SDK、取 token、安装组件流程需要按后端能力分流 |
| 参数与质量 | 网页端支持共享中调整参数、自定义帧率、混音、编码健康降档及逐边统计 | 手机端需要补能力接口，不能照抄网页的帧率上限 |
| 房间持久化 | 主库旁保存 `piik-rooms.sqlite` 与 `piik-bindings.json` | 重连仍重新领凭证；不能把旧 token 永久缓存 |
| 数据库升级修复 | 启动逐表逐列检查；提供显式 `--upgrade-db` | 老库缺结构时需按服务端升级流程处理，不能清库重建 |
| 管理端房管管理 | 新增管理员查询、任命、撤销房管的 REST 接口 | 已有房间成员同步应继续消费 `moderators-changed` |
| 删除 LiveKit 伴生进程 | GUI 和服务端不再依赖 `livekit-server.exe` | 手机“下载 / 安装语音组件”的入口不能继续用于 Piik 后端 |

main 比 v5.2.1 额外包含：

1. `c0c95033`：镜像 `:latest` 校验兼容索引延迟，属于 CI 修复。
2. `1969844d`：嵌入式 OBS 的 `/live` 改为进程内直接输出，取消内部 3335 回环监听。客户端继续使用后端的鉴权观看地址；外置 NMS 的配置另行保留。
3. `130ca3fb`：GitCode 发行镜像补同步入口与重试，属于发布流程。

## 3. 已确认的兼容断点

| 当前客户端入口 | 现状 | v5.2.1 / 当前 main 下的结果 |
| --- | --- | --- |
| `src/mobile/screenShareSession.ts` | 监听 `viewer-ready`，发送 `signal-offer`，处理旧 answer / ICE；最多维护 4 位直连观众 | 服务端已删除这条共享信令链，房主采集成功也不能完成观众协商 |
| `screen-sharing/hooks/useViewerPeerConnection.ts` | 固定 ICE 列表，发送 `viewer-ready`，等待房主 offer | 收不到新协议的 offer、路由和开播状态 |
| `screen-sharing/hooks/useSignalingChannel.ts` | 订阅旧 `signal-offer/answer/ice-candidate` | 需要由 Piik 连接层替换 |
| `screen-sharing/components/WebrtcWatchPage.tsx` | 使用旧接收 hook 和 `useP2PTunnel` | 需保留播放外壳，替换媒体会话；旧 P2P 开关不能继续控制 Piik |
| `voice-chat/hooks/useVoiceChat.ts` | `livekit-client` + `POST /api/voice/token`；REST 禁言 / 移出 | token、mute、kick 路由已移除；原 `/rtc` 隧道也已删除 |
| `voice-chat/hooks/useVoiceComponent.ts` | 读取嵌套 `data.status`，支持 `/api/voice/install` | 新状态为顶层 `available/backend`，旧解析会保留默认值；安装路由不存在 |
| `MobileScreenShareHost.tsx` | 从静态 `ICE_SERVERS` 启动原生采集与发送；采集成功后立即展示共享 | 要从 Piik 凭证 / 认证结果取得 ICE，并等待开播确认 |

注意：服务端仍保留 `sharer-ready`，但它只是一起看 / 一起听的房主就绪通知。不得因为事件还存在就判断旧屏幕共享兼容，也不要全局删除其他模式依赖它的代码。

## 4. REST 合同与调用顺序

| 接口 | 请求 / 返回要点 | 客户端处理 |
| --- | --- | --- |
| `POST /api/share/piik/session` | JSON `{ "roomId": "<ZViewer房间ID>" }`；返回 `success, roomId, role, token?/viewerGrant?, signalPath, protocol, iceConfig` | 先成功加入 ZViewer 房间，再领取；返回的 `roomId` 是映射后的 Piik 房间码 |
| `DELETE /api/share/piik/session` | 同样传 ZViewer 房间 ID；只有房主可调用 | 结束对应整个 Piik 房间，会通知 `room-closed`；不能作为普通“停止共享”按钮 |
| `GET /api/voice/status` | 顶层 `{ success: true, available: boolean, backend: "piik" \| "sfu" }` | 按后端类型选择语音实现；`available=false` 明确禁用加入 |
| `POST /api/voice/piik/session` | JSON `{ "roomId": "<ZViewer房间ID>" }`；凭证结构与共享相同 | 用于单独进入语音；共享与语音最终复用同一房间连接 |
| WebSocket `/signal` | 裸 WebSocket，非 Socket.IO namespace | 建连后先发 `authenticate`，收到 `authenticated` 后才进入业务状态 |

错误语义：

- 共享凭证 `409` 且 `code=HOST_NOT_SHARING`：展示等待房主，做有界退避；不是鉴权过期。
- `401`：经现有 `apiFetch` 执行有限认证续期；换身份、退出后取消迟到结果。
- `403`：未进房或准入失败；不能靠无限刷新 token 或切旧协议绕过。
- `503`：Piik 未启用 / 正在重启；给出明确错误，不盲目退回旧信令。
- 单独语音在房主尚未建立 Piik 房间时也会返回 `409`，但当前没有共享接口的 `HOST_NOT_SHARING` 机器码；先补统一错误码或依据已验证合同处理，不按任意 `409` 无限重试。

当前没有可调用的 `GET /api/share/capabilities`。`main.go` 的相关注释是遗留描述，不能据此实现能力探测。

## 5. P0：先解决手机连接、Cookie 与地址映射

这是迁移的第一道验收门。网页同源可用不等于打包后的 App 可用。

### 5.1 地址

- 上游 `piik-signal/client.ts` 从 `window.location.href` 生成 `/signal`；手机页面来自本地 WebView，直接复制会连接本机页面源。
- 应从当前选定服务器的逻辑地址及 REST 返回的 `signalPath` 构造 WS 地址，保留服务前缀、端口、IPv6 方括号，再调用 `connectionUrl()` 映射本地通道。
- `signalPath="/signal"` 是服务端内部根路径；外部若部署在 `/edge`，应依反代映射得到 `/edge/signal`。不能用 `new URL('/signal', base)` 无条件抹掉前缀。
- 已映射的 `getApiUrl()` 不应再次拼接本地能力 token；逻辑 URL 与物理通道 URL 只转换一次。
- 会话池的键至少包含服务器、登录身份、ZViewer 房间和本次房间生命周期。上游只有 `room:${roomID}`，不足以隔离手机换服 / 换号。

修改入口：`src/platform/connectionTransport.ts`、`serverConnection.ts`、`src/upstream/lib/api.ts`，以及拟新增的 `src/upstream/modules/piik-signal/`。

### 5.2 站点通行证

REST 领凭证还会写入 `zv_piik_site`：`HttpOnly`、`Path=/signal`、10 分钟、`SameSite=Lax`，HTTPS 时有 `Secure`。房主即使持有正确 token，没有升级请求中的站点通行证也会被拒；观众可凭 grant 通过另一条校验分支。

当前双端 HTTP / 用户授权证书例外通道已有 Cookie 保存与 WebSocket Upgrade 转发；严格 HTTPS 则直接交给 WebView。由源码可确认两条路径不同，**严格 HTTPS 的跨站 Lax Cookie 与来源校验需要单独验证**，本轮没有真机证据证明它已可用。

推荐先验证并按需扩展现有单服务器原生通道，使领凭证和 `/signal` 共用同一 Cookie 仓库。严格 HTTPS 扩展必须继续验证证书，不能为了传 Cookie 自动启用证书例外。也可在后续服务端方案中设计经鉴权的一次性升级票据，但当前没有该接口，不能假设已支持。

平台入口：

| 平台 | 现有文件 | 必查内容 |
| --- | --- | --- |
| Android | `native/bilicore/mobile/server_connection.go`；`ServerConnectionPlugin.java` | Cookie jar 收到 `Set-Cookie` 后，WS Upgrade 按远端 `/signal` 路径携带 Cookie；Origin 与目标一致；TLS 策略保持 |
| HarmonyOS | `ZV-HarmonyOS/entry/src/main/ets/services/ServerConnection.ets` | Cookie Path 匹配、过期、Upgrade、Origin、IPv6；严格 HTTPS 与例外模式分别验证 |
| 共享 JS | `src/platform/connectionTransport.ts` | WS/WSS 映射、前缀与单次转换；换服即销毁旧通道 |

验收：两端分别在 HTTP、严格 HTTPS、用户明确启用的证书例外路径完成真实 REST -> Cookie -> WS -> `authenticated`。诊断只记录状态与错误码，不输出 token、grant、Cookie 或本地通道能力 token。

## 6. P0：新增共用 Piik 信令层

优先移植服务端前端的 `piik-signal/{protocol,client,link}.ts`，适配 API、地址、身份隔离与现有中文提示后再使用。

必须具备：

1. `piik-v24` 合同；JSON 只编码一次，不再外包 Socket.IO 信封。
2. 每次新连 / 重连先重新领取凭证；区分 ZViewer 房间 ID、Piik 房间码、Piik `peerId` 和 `connectionId`。
3. 按房间复用一条连接，引用计数释放。共享停止但语音仍在时保留 WS；退出语音也不能误关共享。
4. 同一会话稳定的 `clientId`；合法不透明 ID 为 8~128 位 `[A-Za-z0-9_-]`，可沿用上游 32 位随机十六进制生成方式。
5. 认证超时、有限退避、重连取消；`SESSION_REPLACED`、准入拒绝、非法消息等终止状态不得无限重试。
6. 服务端 `protocol` 与客户端支持值不一致时明确拒绝，不能静默进入“连接中”。

房主认证形状示意，字段值需来自本次凭证与当前会话：

```json
{
  "type": "authenticate",
  "protocol": "piik-v24",
  "roomId": "<REST返回的Piik房间码>",
  "role": "host",
  "token": "<本次房主凭证>",
  "clientId": "<稳定的不透明ID>",
  "roomOnly": true,
  "roomSession": true,
  "routePolicy": {
    "peerOnly": false,
    "topologyOptimization": true,
    "natPrediction": false
  }
}
```

观众认证使用 `role="viewer"`、`viewerGrant` 和同类 `clientId`，不携带房主 token。没有开始采集时房主只进房，不发 `start-sharing`。

## 7. P0：共享生命周期与原生发送

### 7.1 状态顺序

ZViewer 入房成功 -> 领取 Piik 凭证 -> 认证 -> 系统采集授权 / 采集准备 -> `start-sharing` -> `sharing-started` -> 路由分配 -> 媒体连通。

采集与认证的准备可并行，但开始分配观众前必须已有可发送轨。界面应分别表达“已采集”“等待开播确认”“等待观众”“媒体已连接”，不能把 `native.start()` 成功当成完整开播成功。

`start-sharing` 带新的 `shareGeneration` 与 `routePolicy`。普通停止发送 `stop-sharing`，释放采集与共享出边，保留仍由语音持有的房间连接。再次开播必须换代际；不可对普通停止调用 REST DELETE 结束整个 Piik 房间。

### 7.2 修改文件与职责

| 文件 | 具体改动 |
| --- | --- |
| `src/mobile/screenShareSession.ts` | 将旧 `viewer-ready` 驱动替换为 Piik 会话 / 路由；保留现有采集取消和迟到回调保护 |
| `src/mobile/MobileScreenShareHost.tsx` | 连接新控制器；ICE 改取服务器；区分采集与发布状态；普通停止与离房分开 |
| `src/platform/contracts.ts` | 连接结构增加 `connectionId/remotePeerId/revision` 等明确字段；新增发送参数、逐边统计能力 |
| `src/platform/screenShare.ts` | 对齐 Android 插件与 HarmonyOS 实现的新增能力；统一事件结构 |
| `ZV-Android/app/src/main/java/com/zviewer/mobile/ScreenSharePlugin.java` | PC 以连接 ID 管理；ICE、应答、关闭、统计绑定当前连接实例；保留 MediaProjection、音频采集和前台服务 |
| `src/platform/harmonyScreenShare.ts` | 保留 ArkWeb 原生捕获、横竖屏变换与混音；抽出可供 Piik 使用的发送端点或采集流能力 |

协议层不能把 Piik `peerId` 当成 Socket.IO ID，也不能只用对端 ID 标识一条长期 PC。换父 / 重试时同一对端可能对应新的 `connectionId`；所有异步结果必须绑定当前会话与当前边。

建议按现有 port 演进，而不是另造一套原生插件。以下是待实施接口约定，不是当前已有能力：

| 接口 / 事件 | 建议变更 |
| --- | --- |
| `ScreenSharePeer` | 保留本地 `sessionId`，以 `connectionId` 标识 PC，另存 `remotePeerId` 和 `revision`；兼容旧服时由适配器转换旧 peerId |
| `createOffer/setAnswer/addIceCandidate/removePeer` | 统一使用上述连接引用；异步操作结束时再次确认当前 PC 实例，已替换连接的结果直接丢弃 |
| `ScreenShareEvent` | 新分支回传 `connectionId`，ICE / peer-state 不再只携带对端 ID；采集事件仍只按本地 sessionId 管理 |
| `setVideoOptions`（新增） | 对当前采集与全部出边更新分辨率 / FPS；返回实际接受的配置及覆盖原因；首次迁移可先不开放 UI 热更新 |
| `getConnectionStats`（新增） | 返回指定连接的采样时间、累计 bytes / frames / packets、RTT、抖动和编码受限证据；不返回原始 SDP 或候选中的隐私数据 |

Android 首阶段可以继续使用原生 `createOffer/setAnswer/addIceCandidate/removePeer`，但由 Piik 父节点候选决定何时调用，并在桥接层增加连接身份校验。不要把原生视频帧经 JS 传给网页端点。

HarmonyOS 的实际采集实现位于 `src/platform/harmonyScreenShare.ts`，并非需要重写为另一套 ArkTS WebRTC Sender。可在平台模块中暴露不跨原生帧桥的流句柄 / 端点，复用浏览器 Piik 媒体逻辑；系统授权和横竖屏处理继续由现有桥负责。

继续保留用户点击触发系统捕获授权的路径，避免长串认证请求耗尽浏览器的临时用户激活。WS 重连后必须重新确认认证角色、ICE、当前开播状态和路由，重建失效媒体边；不能只恢复 socket-open 后沿用旧 PC / 旧确认状态。

## 8. P0：观众端迁移与观众互助

修改 `WebrtcWatchPage.tsx` 的数据源，移植 `piik-share/session.ts`、`endpoint.ts` 与 viewer hook；保留 `RemoteVideoPlayer`、现有全屏、横竖屏、亮度 / 本机音量手势、Android / HarmonyOS 小窗及聊天。

| 消息 | 处理规则 |
| --- | --- |
| `route-update` | 保存 `revision`、`assignment.upstream/childPeerIds`；父节点在 `phase="prepare"` 下按 candidate 发 offer |
| `signal` | 使用 `fromPeerId/targetPeerId`；载荷 `kind="description"/"candidate"`，始终带 `connectionId` |
| `route-transport-connected` | 当前子节点确认媒体传输已连通后上报，带对应 revision 与 connectionId |
| `route-ready` | 按当前路由状态结算；不得仅因 WS 已连接就发送 |
| `route-failed` | 仅报告当前有效入边的真实失败；换父关闭旧边不能再报告旧边失败 |
| `host-status` / `sharing-stopped` | 区分暂停、停止和房主离线；冻结画面不能误显示为播放正常 |
| `room-closed` | 停止会话与所有重试；释放媒体；不能重新领旧房间凭证死循环 |

观众互助的实际媒体工作：接收上游轨 -> 挂到下游 PC -> 按路由更新换父 -> 接续新轨。首轨未到便先创建下游时，后续补轨还需验证协商是否真正生效，不能只测 `addTrack()` 被调用。

新观众可以先声明 `relay-capacity: { downstreamEdges: 0 }` 作为最小接收验收阶段；真正具备转发、后台存活与设备预算后再声明非零容量。上游声明 3 不代表所有手机都适合照搬。纯接收模式可能使房主出边预算耗尽、后续观众等待，不能据此宣称已完成多人互助。

现有本地 4 观众硬上限不能继续当房间容量。当前 Piik 协议上限为 20 位观众，单端媒体复制预算上限为 3；房间成员数、房主直接连接数、总观众数应分别统计。

## 9. P0：语音一起迁移

共享和语音必须共用第 6 节的连接池。分别创建房主 WS 会触发唯一房主连接冲突；后开的功能可能顶替原连接。

| 文件 / 模块 | 适配内容 |
| --- | --- |
| `voice-chat/hooks/useVoiceComponent.ts` | 支持新顶层 `available/backend`，取消 Piik 的组件下载 / 安装；旧结构仅用于明确识别的旧服 |
| `voice-chat/hooks/useVoiceChat.ts` | 按 backend 分派；Piik 使用 `piik-voice`；旧 LiveKit 仅保留在旧服实现中 |
| 拟移植 `piik-voice/{protocol,signal,endpoint,usePiikVoice}.ts` | `subscribe-room-voice`、join/publish/unpublish/leave、state、signal、transport；支持多 publication 与双向媒体 |
| `src/platform/microphoneCapture.ts` | 沿用麦克风租约、语音 / 共享互斥策略和退出取消；不要复制一套独立采集 |
| `VoiceChatPanel.tsx` | 保留音量、电平、监听、音频自动播放恢复；成员展示不能沿用 LiveKit identity 假设 |
| `voice-chat/transport.ts` | 将依赖 LiveKit 内部 PC 的诊断换成当前端点的逐边统计 |

语音命令由服务端分配 `send/receive` 授权与 publication。应答方回 answer 前也要挂上授权的本地麦克风轨，否则会出现“能听别人、别人听不到自己”。单人语音房没有连接边时应视为就绪，不能永久“连接中”。

### 9.1 服务端仍缺少语音管理能力

当前 Piik `room-voice-command` 没有房主对他人禁言 / 移出动作。上游网页 `muteVoiceMember()` 实际只将本机该成员音量归零，`kickVoiceMember()` 返回不支持。

手机不能把本地静音包装成“全房间禁言成功”。第一阶段应明确区分个人静音与房主管理，禁用未支持的管理动作；如要维持原 2.3.7 的服务端强制禁言 / 移出能力，需要服务端配合增加身份映射、授权命令、媒体侧执行和状态广播，再提交上游 PR。仅改客户端无法补齐。

Piik peer 与 ZViewer 用户 / 房间成员的映射也不能从 LiveKit identity 继续推导。昵称展示、管理员目标身份和踢出后的访问撤销应由经鉴权的合同保证；本轮只确认存在缺口，未实现该扩展。

## 10. P1：暂停、音频、画质、统计与降档

| 项目 | 当前差异 | 具体适配 |
| --- | --- | --- |
| 暂停 | 当前原生主要使用 track.enabled；新协议还需服务端暂停状态 | 发送 `set-sharing-paused`，同时暂停每条出边的音视频发送；恢复时用当前轨，暂停中新增连接也不得漏发 |
| 系统声 / 麦克风 | 双端已有混音和语音优先策略 | 迁移时复用；不能同时把同一麦克风经共享和语音重复广播；系统捕获不到声音时明确状态 |
| 帧率 | 手机为 30/60/90 离散类型；网页支持 1~240 且按分辨率收窄 | `contracts.ts`、`screenShareQuality.ts` 与平台实现改为能力范围；鸿蒙当前代码上限 60，不盲目放到 240 |
| 参数热更新 | 手机当前提示停止共享后再改画质 | 新增采集约束 / 原生 capture 参数与每条 sender 参数更新；修改后回读实际接受值 |
| 分辨率 / 横竖屏 | 鸿蒙已有比例变换与原生显示尺寸通知 | 保留该链；不裁剪、不强行放大；换源 / 换尺寸时验证 replaceTrack 与音频图生命周期 |
| 编码选择 | 当前 H.264 优先 | 按双端真实能力协商 H.264 / VP8，拒绝把网页专用预检接口当成原生能力；至少验证两种方向的互通 |
| 码率 | 最新网页不再设置视频固定 maxBitrate | 手机区分协商 / 拥塞控制与画质档位，不能沿用任意硬上限后声称完成同等画质 |
| 逐边统计 | 当前桥只有采集尺寸 / FPS，缺原生 PC getStats 输出 | Android 增加结构化 getStats；HarmonyOS 读取 PC；按 connectionId 独立保留采样基线 |
| 自动降档 | 新网页使用编码帧、采集帧、CPU 受限证据 | 复用 `health.ts` 与纯函数，按边观察；新边 / 换流重置基线，避免一次抖动反复降档 |

参数与统计的具体文件：`src/platform/contracts.ts`、`screenShareQuality.ts`、`screenShareFrameMeter.ts`、`harmonyScreenShare.ts`、`ScreenSharePlugin.java`、`screen-sharing/hooks/useConnectionStats.ts` 及拟移植的 Piik stats / health 模块。

界面应区分请求帧率、采集实测 FPS、编码 / 接收 FPS；不把 `getSettings().frameRate` 或配置目标当成实测。累计 bytes / frames 需按时间窗口求差；中继节点不能把同一路入 / 出媒体重复汇总成观看流量。

## 11. 服务端实现边界：不能照搬发行过程中的中间方案

1. **当前 Piik 共享端点只处理 `transport="direct"`。** `endpoint.ts` 明确跳过 SFU candidate；bridge 装配也没有接入 Piik SFU。代码库保留 SFU 包不等于新共享具备自动 SFU 回退。
2. **默认 ICE 是公共 STUN。** 当前 bridge 的默认列表没有 TURN，main 也没有把 TURN 配置接入它。困难 NAT 下的可达性要实测，不能沿用旧 LiveKit 的 TCP / TURN 结论。
3. `SHARE_MEDIA_PORT`、`SHARE_MEDIA_TCP_PORT` 和公共 IP 配置仍用于保留的自建媒体面。它们不证明 Piik 共享会走该媒体面；不要给手机增加“指定 3337 即可兜底”的逻辑。
4. 开发阶段的 Socket.IO `share` 严格信封、`share.host-pressure`、`share.quality`、旧 share backend 开关已经整体替换 / 删除。当前产品端点使用 `signal/route-*` 与本地 health monitor，不应从提交标题拼出一套混合协议。
5. NAT 预测虽出现在移植代码和早期提交中，当前产品策略是 `natPrediction:false`；第一阶段不启用未接线能力。
6. 旧 `useP2PTunnel` / DataChannel 分片通道不等于 Piik 的观众互助；Piik 分支必须退出旧链路。
7. 暂停、端点重协商和重连仍需手机媒体级验证。上游假 PC 测试通过不能替代音视频帧验收。

需要 SFU / TURN 兜底、超过 20 观众或房主语音管理时，均列为服务端协作事项，不纳入纯客户端迁移完成承诺。

## 12. 兼容旧服务端与其他房间模式

推荐保留清晰的协议分派，避免对可连接的旧服造成回归：

| 服务端响应 | 共享 / 语音选择 |
| --- | --- |
| 确认支持 `piik-v24` / `backend="piik"` | 使用 Piik；本次会话中失败按实际原因处理 |
| `backend="sfu"` | 仅在实现并验证对应 Socket.IO `voice` 协议后使用该分支；它不是 LiveKit |
| 明确识别旧版嵌套 status / LiveKit 合同 | 使用原 LiveKit 与旧共享实现 |
| 新能力接口真实 404 且旧合同确认存在 | 可选择旧服分支 |
| 401 / 403 / 409 / 503、网络错误或不认识的协议 | 不用旧协议掩盖；分别续期、等待、提示或终止 |

共享的能力识别应在完成入房后领取凭证并检查合同；不能在未入房状态下把“403”当不支持。清理旧文件和删除 `livekit-client` 依赖，应等旧服支持策略明确后再做。

一起看 / 一起听保留现有 Socket.IO 房间、播放同步、成员快照、长播续期与聊天；`sharer-ready` 的房间通知职责继续保留。OBS `stream-push` 继续走现有鉴权 HTTP-FLV，与 WebRTC Piik 分支分开验收。

## 13. 推荐实施批次与交付门

| 批次 | 内容 | 通过标准 |
| --- | --- | --- |
| A：连通地基 | 地址映射、严格 HTTPS Cookie、凭证 / 错误合同、共用连接池 | 两端真实 WS 认证；共享与语音引用互不误关；换服 / 换号无串会话 |
| B：最小可用 | 新观众接收；Android / HarmonyOS 原生房主发送；暂停 / 停止 / 再开播 | 网页 <-> 两端交叉观看，首帧、音频、暂停和恢复真实通过 |
| C：多人及语音 | 观众转发 / 换父；Piik 语音；后台与系统终止 | 至少 4 观众含真实中转；共享与语音同时运行，任一退出另一项保留 |
| D：体验与诊断 | 参数热更新、逐边统计、编码健康、有限恢复、UI 文案 | 配置与实测分开，降档有证据，长时连接及弱网恢复通过 |
| E：正式交付 | 双端维护文档、版本 / 签名构建、回归、真机证据、本地提交 | 不以浏览器 / 模拟器结果代替实体设备；发布另按用户授权执行 |

批次 A/B/C 都是兼容性核心工作，不应只完成新观众页面就宣布双端适配完毕。P1 体验项目可分后续版本交付，但必须把未实现能力明确标注。

所有客户端程序、文档和 Git 操作仍在指定 `ZViewer-client` 内完成。HarmonyOS 的 `entry/src/main/resources/rawfile/web` 是生成目录，只经 `npm run harmony:web` 更新；本方案不修改 iOS，不启动 IPA 构建。

## 14. 必须补的验证

| 验证层 | 必测内容 | 结果应证明什么 |
| --- | --- | --- |
| 协议 / 单元 | REST 结构、协议版本、一次 JSON 编码、身份 / 连接 ID、迟到回调、连接池释放 | 状态机与合同正确 |
| 原生连接集成 | HTTP / HTTPS / 证书例外、Cookie Path、WS Upgrade、前缀、IPv6、换服注销 | 打包 App 的真实信令可达与隔离 |
| 两端接收 | 网页房主 -> Android / HarmonyOS 观众；两个手机房主交叉观看 | 实际持续解码和声音，不能只检查 PC connected |
| 原生发送 | 两端房主 -> 网页及手机；系统授权取消 / 停止、旋转、后台、再开播 | 采集、编码、音频路由和系统服务行为 |
| 树形拓扑 | 至少 4 观众；证实有观众实际发送下游；中间节点离开触发换父 | 新连接持续出帧，旧连接不误报失败，不遗留采集 / PC |
| 共享 + 语音 | 两种启动顺序；单人语音；双方通话；停共享后语音不断，离语音后共享不断 | 共用连接、双向轨与麦克风策略正确 |
| 质量 | FPS / 尺寸热更新、暂停新观众、CPU 编码不足、逐边统计 | 实测变化与 UI 一致，暂停无持续音视频泄漏 |
| 生命周期 | 网络切换、重启服务端、准入撤销、踢出、换房 / 换服 / 换号 | 有界恢复，终止状态不复活旧会话 |
| 回归 | 当前维护 / B站 / 工具栏 / 对齐回归，加一起看、一起听、OBS | 旧功能不因迁移新信令回归 |

真实网络至少覆盖同 LAN 与手机蜂窝跨网。Piik 直连不通时应准确展示失败；在未实现服务端兜底前不能把复杂 NAT 场景记为通过。

## 15. 本轮已执行的检查与未完成边界

已通过：

```powershell
# cwd: ZViewer-source code/backend-go
go test ./internal/api ./internal/share/piikbridge ./internal/db ./internal/nms

# cwd: ZViewer-source code
node --experimental-strip-types --test "frontend/src/modules/piik-signal/__tests__/*.test.ts" "frontend/src/modules/piik-share/__tests__/*.test.ts" "frontend/src/modules/piik-voice/__tests__/*.test.ts"
```

Go 四个包均通过；前端 Piik 相关测试 39 / 39。覆盖了既有接口、站点票据与来源、共享 / 语音握手、映射持久化、暂停换轨、换父清理、参数回读、逐边统计、连接复用及语音应答轨等对应测试。

这些是更新后服务端源码的定向测试，不是新客户端验证。本轮未运行新客户端构建、手机跨端媒体验证、NAS 部署或新服务端生产数据库升级。数据库升级工具测试使用隔离测试数据；正式数据未改动。

## 16. 源码索引

下列服务端链接对应本轮本地固定的 `130ca3fb` 源码；客户端链接对应本轮审计的 2.3.7。后续上游更新时重新检查合同。

| 编号 | 文件 | 依据 |
| --- | --- | --- |
| S01 | [api/piikshare.go](../../ZViewer-source%20code/backend-go/internal/api/piikshare.go) | REST 方法、角色、映射房间码、409 机器码、DELETE 语义 |
| S02 | [api/piikvoice.go](../../ZViewer-source%20code/backend-go/internal/api/piikvoice.go)；[api/voice.go](../../ZViewer-source%20code/backend-go/internal/api/voice.go) | 语音凭证、新状态结构、旧路由消失 |
| S03 | [piikbridge/ticket.go](../../ZViewer-source%20code/backend-go/internal/share/piikbridge/ticket.go)；[origins.go](../../ZViewer-source%20code/backend-go/internal/share/piikbridge/origins.go) | Cookie、来源与升级验证 |
| S04 | [piikbridge/bridge.go](../../ZViewer-source%20code/backend-go/internal/share/piikbridge/bridge.go)；[bindings.go](../../ZViewer-source%20code/backend-go/internal/share/piikbridge/bindings.go) | 默认 ICE、装配、持久化、结束房间 |
| S05 | [protocol/constants.go](../../ZViewer-source%20code/backend-go/internal/piik/server/protocol/constants.go)；[scalars.go](../../ZViewer-source%20code/backend-go/internal/piik/server/protocol/scalars.go) | piik-v24、观众 / 复制预算、ID 约束 |
| S06 | [piik-signal/protocol.ts](../../ZViewer-source%20code/frontend/src/modules/piik-signal/protocol.ts)；[client.ts](../../ZViewer-source%20code/frontend/src/modules/piik-signal/client.ts)；[link.ts](../../ZViewer-source%20code/frontend/src/modules/piik-signal/link.ts) | 线上形状、认证 / 重连、房间共用连接 |
| S07 | [piik-share/session.ts](../../ZViewer-source%20code/frontend/src/modules/piik-share/session.ts)；[endpoint.ts](../../ZViewer-source%20code/frontend/src/modules/piik-share/endpoint.ts) | 开播代际、路由、信令、暂停、逐边统计、仅 direct |
| S08 | [piik-share/usePiikShareHost.ts](../../ZViewer-source%20code/frontend/src/modules/piik-share/usePiikShareHost.ts)；[health.ts](../../ZViewer-source%20code/frontend/src/modules/piik-share/health.ts) | 采集 / 发送参数热更新、自动降档 |
| S09 | [piik-voice/protocol.ts](../../ZViewer-source%20code/frontend/src/modules/piik-voice/protocol.ts)；[endpoint.ts](../../ZViewer-source%20code/frontend/src/modules/piik-voice/endpoint.ts)；[usePiikVoice.ts](../../ZViewer-source%20code/frontend/src/modules/piik-voice/usePiikVoice.ts) | publication、发送授权、语音管理缺口 |
| S10 | [room/webrtc_handlers.go](../../ZViewer-source%20code/backend-go/internal/room/webrtc_handlers.go) | sharer-ready 只剩房间通知 |
| S11 | [main.go](../../ZViewer-source%20code/backend-go/cmd/zviewer-server/main.go)；[db/upgrade.go](../../ZViewer-source%20code/backend-go/internal/db/upgrade.go) | 实际装配、显式数据库升级 |
| S12 | [docs/piik-embedding-plan.md](../../ZViewer-source%20code/docs/piik-embedding-plan.md) | S5 删除清单、浏览器冒烟历史、上游待定事项；不作为手机验收 |
| C01 | [screenShareSession.ts](../src/mobile/screenShareSession.ts)；[MobileScreenShareHost.tsx](../src/mobile/MobileScreenShareHost.tsx) | 当前旧共享控制器和房主入口 |
| C02 | [contracts.ts](../src/platform/contracts.ts)；[harmonyScreenShare.ts](../src/platform/harmonyScreenShare.ts) | 原生接口与鸿蒙采集实现 |
| C03 | [ScreenSharePlugin.java](../ZV-Android/app/src/main/java/com/zviewer/mobile/ScreenSharePlugin.java) | Android 原生发送 |
| C04 | [WebrtcWatchPage.tsx](../src/upstream/modules/screen-sharing/components/WebrtcWatchPage.tsx)；[useViewerPeerConnection.ts](../src/upstream/modules/screen-sharing/hooks/useViewerPeerConnection.ts) | 当前观众端 |
| C05 | [useVoiceChat.ts](../src/upstream/modules/voice-chat/hooks/useVoiceChat.ts)；[useVoiceComponent.ts](../src/upstream/modules/voice-chat/hooks/useVoiceComponent.ts) | 当前 LiveKit / 组件接口 |
| C06 | [server_connection.go](../native/bilicore/mobile/server_connection.go)；[ServerConnection.ets](../ZV-HarmonyOS/entry/src/main/ets/services/ServerConnection.ets)；[connectionTransport.ts](../src/platform/connectionTransport.ts) | 双端 Cookie、TLS、WS 通道和地址映射 |

本方案实施完成后，将已落实的合同、源码入口、排障方式、测试与真机边界同步写入双端维护指南，并在每个完成构建的版本后做指定客户端仓库的本地 Git 提交。
