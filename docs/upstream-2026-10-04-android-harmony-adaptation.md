# 2026-10-04 上游更新与 Android / HarmonyOS 服务端适配方案

> 第 1–10 节保留初始源码差异核对与施工方案（其中“当前/待实施”描述为施工前状态）。2026-10-04 已按方案完成双端 1.6.0 / 160 开发交付，实施与验证状态见第 11 节及交付记录；没有升级用户正在使用的服务端。

## 1. 本次拉取结果与比较基线

| 项目 | 核对结果 |
| --- | --- |
| 上游 | https://github.com/Zero-wyc/ZViewer ，默认分支 `main` |
| 源码目录 | `E:\Codex-bulid\ZViewer\ZViewer-source code` |
| 拉取时最新提交 | `9827929088a31d7cb1d6bf7ceac096df640a2416`，2026-10-04；`git describe` 为 `v4.3.7-4-g9827929`，即 v4.3.7 之后还有 4 个提交 |
| 本地更新方式 | 添加 `upstream` 远程并 fetch，在 `upstream-main` 分支跟踪 `upstream/main`；工作树与该提交一致 |
| 更新前源码 | `7d4b29f070be863b53f55928f201af3188e826b9`；保留原 `master`，另建 `backup/source-before-upstream-20261004`，没有覆盖或丢弃原媒体修复 |
| 客户端目录 | `E:\Codex-bulid\ZViewer\ZViewer-client`，核对时 HEAD 为 `9464d12d9f1b34d2f11c4904ce7fa7993850e83b` |
| 双端维护基线 | 维护手册中的客户端 1.5.0 / 150、共享业务 v4.2.1；根 `package.json` 当前版本仍为 1.5.0，iOS 发布版本不等于双端版本 |
| 上游比较区间 | `v4.2.1`（`fc15964b0340e4286b6bd0625febbcca5180ddd0`）→ `9827929`，共 42 个文件变化 |

更新前源码是独立快照历史，不能直接当成上游 main 的祖先执行普通快进。其基础快照 `6110e20` 与 v4.2.1 仅 README、CI 文件不同，因此以 v4.2.1 比较业务变化有依据。原目录的 PGS/音画修复已通过上游 PR #9 合入；它们在“更新前源码 → 最新源码”中不再显示为新增，但当前客户端还没有对应实现，仍必须列入双端移植清单。

依据：[Android 维护架构](android-maintenance-architecture.md)、[HarmonyOS 维护架构](harmonyos-maintenance-architecture.md)、[共同发布维护](mobile-release-maintenance.md)、[移植边界](../PORTING.md)。以下 `frontend/`、`backend/` 路径属于源码目录；`src/`、`ZV-Android/`、`ZV-HarmonyOS/`、`native/` 路径属于指定客户端仓库。

## 2. 结论与实施优先级

| 优先级 | 上游变化 | 当前双端影响 | 适配范围 |
| --- | --- | --- | --- |
| P0，连接新服务端必做 | 语音彻底迁移 LiveKit，删除旧 VoiceChatHandler | 客户端仍发送旧语音 Socket.IO 事件，不能与新语音服务互通 | 共享语音 hook、面板、旧媒体 Socket 清理；两端权限与音频路由回归 |
| P0，部署联调前置 | 内嵌 LiveKit、`/rtc` 信令反代、UDP 媒体及可选 TURN/TLS | 页面/API 正常不代表语音媒体通；旧容器只替换 JS 可能没有伴生二进制 | 服务端部署与网络配置；客户端处理不可用状态 |
| P1，媒体修复 | PGS 位图字幕、Matroska 元素/压缩修正、playsvideo seek/AAC 修复 | 当前双端缺失位图 cue 链路及依赖补丁 | 共享字幕、播放器依赖及安装补丁流程 |
| P1，新增能力 | XML/JSON 本地弹幕导入 | 缺少导入入口和 `local` 源类型 | 共享解析/UI；鸿蒙文件选择按实测补宿主能力 |
| P1，产品对齐 | 网易云 Cookie 登录/复制 | 现有扫码流程可保留；新接口尚无移动入口 | 共享音乐账号 UI 与 API，不改 B 站原生凭据体系 |
| P2，界面同步 | 我的音乐移除下载/本地管理空 Tab、首页按钮换位 | 非协议阻断项 | 按移动布局选择性同步 |
| 服务端独立修复 | 新建文件根后失效根目录缓存；推流启动开关；打包瘦身 | 大多不需要客户端协议修改 | 文件根刷新及推流关闭回归；不移植服务器打包工具 |

房间、影片、音乐同步仍使用业务 Socket.IO；此次不能把整个 `useSocket.ts` 删除或替换。更新记录经过 mediasoup 阶段，但最终源码是 LiveKit，不应移植中间版本的 mediasoup 实现。

## 3. P0：共享语音改为 LiveKit

### 3.1 最新 REST 契约

来源：`backend/src/routes/voice.routes.ts`，由 `backend/src/index.ts` 挂载到 `/api/voice`。

| 接口 | 请求 body | 成功响应/语义 | 客户端处理 |
| --- | --- | --- | --- |
| `POST /api/voice/token` | `{ roomId, username? }` | `{ success: true, url, token }`，LiveKit 房间名由服务端生成 `voice:<roomId>` | 使用现有 `apiFetch` 鉴权/刷新机制；将返回的 `url`、`token` 交给 `Room.connect` |
| `POST /api/voice/mute` | `{ roomId, identity, muted }` | `{ success: true }`；静音目标音轨并更新 `metadata.adminMuted` | 目标传 LiveKit identity，不再传业务 Socket ID |
| `POST /api/voice/kick` | `{ roomId, identity }` | `{ success: true }`；移除目标参与者 | 收到断开后清理语音状态与麦克风 |

三个接口使用 ZViewer 的 `authenticateToken`。缺 roomId 为 400；token 在服务未配置时返回 503；管理接口权限不足返回 403，mute 目标不在线返回 404。错误按 HTTP 状态与 `success/message` 处理，401 继续走既有认证机制；403、503、网络失败均不可当作旧协议服务器而偷偷回退。

成员身份为 `user:<userId>` 或 `guest:<随机值>`。hook 和面板统一将 `VoiceMember.socketId/userId` 用法迁移为 `id/username`，用 `selfId` 判断本人；成员音量、禁言集、选中成员均按 identity 索引。旧 `peerLatencies` 是旧传输的统计，不能继续展示为 LiveKit 延迟。

当前 token 路由只检查认证和 roomId 非空，没有与签发同时核验密码/审批/实际入房状态；mute/kick 才检查房主/房管等权限。这是服务端需另行审查的边界，客户端应在业务入房成功后才允许加入语音，但这不能替代服务端访问校验。不要在文档或 UI 中宣称 token 已完整校验入房权限。

### 3.2 修改哪些文件

1. 根 `package.json` 增加上游声明的 `livekit-client: ^2.22.3`，更新客户端自己的 lockfile。保留 Capacitor、React、Vite、mediabunny vendor 等本地依赖布局，不覆盖整份上游 package.json。
2. 以 `frontend/src/modules/voice-chat/hooks/useVoiceChat.ts` 为协议参考，重构 `src/upstream/modules/voice-chat/hooks/useVoiceChat.ts`；一起迁移 `components/VoiceChatPanel.tsx`。当前客户端没有该模块的 `index.ts`，调用点使用直接导入；只有需要统一导出时才新增，不能把上游的导出文件当作现有客户端路径。
3. 从 `src/upstream/hooks/useSocket.ts` 移除新服务端不再使用的 `getVoiceMediaSocket`、`setVoiceMediaRequested`、`resetVoiceMediaSocket` 及其认证恢复分支，先搜索所有调用点。保留主 Socket、登录刷新、房间重连及 `dispatchRoomMediaTeardown`。
4. 保留 `src/mobile/MobileRoom.tsx` 的持久语音面板、`onConnectionChange`、`onAudioSessionChange`；新 hook 用实际 LiveKit 连接状态实现原来的 `mediaConnected` 显示。SDK 重连中不能继续显示“媒体正常”，收起面板不能挂断。
5. 保留 `src/mobile/useMusicAudioRouting.ts` 与 `src/platform/` 边界；一起听已有 `voiceManagedExternally`，不能移植后又创建第二个语音实例。

### 3.3 移植时必须补齐的移动生命周期

上游浏览器 hook 不能整文件覆盖移动版本：

- 将直接 `navigator.mediaDevices.getUserMedia` 改成 `permissions.requestMicrophoneStream(...)`，保留鸿蒙先申请原生麦克风权限的过程。拒绝权限要回滚 joining 和音频路由状态。
- 采用上游默认硬件采样率、AEC/NS/AGC、单声道采集，发布参考 `AudioPresets.music`、`dtx: false`、`red: true`；不要重新固定 AudioContext 为 48 kHz。音质和蓝牙行为仍需设备实测。
- 接入 `ROOM_MEDIA_TEARDOWN_EVENT`。离房、切服务器、退出账号、被踢、组件卸载、连接失败统一幂等清理：disconnect、停止原始采集流全部 tracks、关闭 capture/levels AudioContext、移除远端和反送 audio、清空 refs/成员/禁言/音量状态。
- 源码中的 teardown 未完整停止 `localStreamRef` 原始采集流，Disconnected 分支仅复位部分 UI；移动移植要补上，不能把“界面断开”当成“麦克风释放”。
- 加入过程增加 generation/取消标记；等待 token、权限或 connect 期间若离房，不允许旧 Promise 随后发布音轨或覆盖新房间。
- 管理员禁言与用户主动闭麦分别存状态，metadata 解除禁言后仍尊重用户闭麦意愿；回调读取最新状态，避免照搬闭包中的旧 `micEnabled`。
- 音频 autoplay 失败要提供点击恢复入口，不能只吞异常；重订阅去重，恢复前台后检查音轨和实际出声。
- 同账号两设备的 identity 相同，上游明确采用重连顶替语义。旧 `multiInstance` 不能继续假定同账号多客户端一定可同时发声；若要支持，必须协调服务端身份策略。

### 3.4 新旧服务器策略

本次目标优先支持锁定的最新上游提交。若后续要求继续连接 v4.2.1，需另设明确的 legacy/livekit 适配器与经过验证的能力判断，不能同时启动两条语音链路。此次差异没有新增统一语音 capabilities 接口；404 也可能来自代理配置错误，不能单凭一次失败判定版本。未实现双协议时，应向旧服务器用户明确提示语音版本不兼容，普通房间功能照常工作。

## 4. P0：两端宿主与服务端联调

| 检查点 | Android | HarmonyOS |
| --- | --- | --- |
| 麦克风 | 沿用 Manifest/宿主 WebView 权限；验证首次授权、拒绝后重试 | 沿用 `permissions.ts → requestMicrophonePermission → Index.ets`；ArkWeb 的 `TYPE_AUDIO_CAPTURE` 授权仍限定 `https://zviewer.local` |
| 网络来源 | REST 继续使用用户设置的服务端地址与现有鉴权 | 同左；`zviewer.local` 是资源源站，不是 LiveKit 服务器 |
| 音频路由 | 保留 `AudioRoutingPlugin.java` 和共享语音会话回调 | 保留桥接可选方法和降级语义；实测音乐与语音同时播放 |
| 后台 | 原有 PlaybackService/SystemMediaSession 的音乐后台能力不等于后台采集权限 | 原有 AVSession + AUDIO_PLAYBACK 连续任务不等于后台通话能力 |
| 原生修改触发条件 | 只有设备实测证明现有权限/音频桥不足才修改宿主 | 文件选择或采集桥有缺口时按契约补 ArkTS，不能放开任意导航来解决网络问题 |

LiveKit URL 优先采用 token 响应中的 `url`。服务端可用 `LIVEKIT_URL` 显式指定，否则按请求 Host / X-Forwarded-Host、协议推导 ws/wss。不要用 `window.location.origin` 构造地址，也不要硬编码 `127.0.0.1:3336` 或容器 IP；SDK 自行使用 `/rtc` 相关路径，不额外盲目追加一次 `/rtc`。

部署核对 `backend/src/services/livekit-server.manager.ts`、`backend/src/index.ts`、`docker-compose.linux-single.yml`：

- 默认页面/API/信令走 TCP 3333，内嵌 LiveKit HTTP/API 默认 TCP 3336；客户端媒体默认走 UDP 3333。外层 HTTP 反代要同时透传 `/rtc` 的普通 HTTP（含 validate）和 WebSocket Upgrade，正确传 Host/Proto。
- Docker 需包含 livekit-server 伴生二进制，并更新 compose 的 UDP 3333 映射；旧镜像仅在线替换 JS 不一定满足条件。是否需要公网映射取决于部署场景，纯内网使用只验证内网可达性。
- 可选 TURN/TLS 默认 TCP 5349，需完整 `LIVEKIT_TURN_DOMAIN/CERT/KEY` 配置及可达地址；它不是只开 HTTP 反代就自动具备的能力。
- 503 表示语音服务未就绪/未配置，UI 应允许稍后重试；token 成功但 ICE 无媒体时应定位网络、UDP/TURN，不应反复要求重新登录。
- `STREAM_PUSH_ENABLED=0` 停止 NMS，释放 3334/3335。一起看直链/音乐和 LiveKit 语音不能因此一起禁用；推流相关入口要正确展示不可用。此次未发现配套的新能力查询接口，不凭空增加客户端请求。

## 5. P1：PGS 字幕与音画同步

以下上游文件需要映射到客户端 `src/upstream/` 同路径，一起审阅、移植：

| 上游 `frontend/src/` 下路径 | 作用与实施要求 |
| --- | --- |
| `lib/mkv/ebml.ts`、`lib/mkv/matroska-demuxer.ts` | 修正 language/content encoding 元素 ID；区分无压缩 -1、zlib 0、header stripping 3，并携带 compression settings |
| `modules/subtitles/pgs-decoder.ts`（新增） | PGS palette/RLE/object/presentation 解码，产生带画布位置的 PNG 位图 cue |
| `modules/subtitles/mkv-embedded.ts` | 接入 PGS/压缩恢复；PGS 必须有序解码，不能沿用文本字幕的乱序 seek 优先并发；完成/取消不得串入新影片 |
| `lib/subtitleParser.ts` | `ParsedCue.bitmap` 的 src/x/y/width/height/canvasWidth/canvasHeight 完整类型 |
| `hooks/useSubtitles.ts` | 消费 `chunk.cues`、位图位置参与去重、AbortController 与 epoch 防过期结果 |
| `components/VideoPlayer/SubtitleOverlay.tsx` | 位图按视频内容区域与原始画布缩放，保留既有文本字幕与安全区处理 |

房间内可能收到新版桌面端的 bitmap cue；双端只移植解码器而不更新 hook、渲染和类型，仍不能显示。检查广播序列化和 PNG 数据体积，验证房主/观众跨端一致性。

还需迁移源码根 `patches/playsvideo+0.4.7.patch`：视频 CueTrack 筛选、AAC 编码 priming 丢弃、ADTS 实际采样率、尾部裁剪以及字幕探测失败不拖垮 demux。客户端目前只声明 `playsvideo ^0.4.7`，没有相应 patch-package 安装脚本；必须建立可重现补丁机制并更新 lockfile，不能只手改 node_modules。若锁定版本或已有补丁与上游不同，逐段合并验证。不要复制服务端的 `prune-pkg-bloat.js` 到客户端 postinstall。

验收必须用真实 MKV（文本/PGS、不同音轨），覆盖冷启动、连续加载、多次前后 seek、切换影片取消、双端与桌面观众字幕位置、音画偏移和内存释放。可移植 `scripts/media-regression.test.mjs` 的相关断言并调整路径；它不能替代设备播放证据。维护手册中的鸿蒙 HEVC Main 10 零帧限制仍单独记录，PGS 或封装修复不代表硬件解码能力提升。

## 6. P1：本地弹幕导入

移植 `frontend/src/modules/danmaku/localImport.ts` 至 `src/upstream/modules/danmaku/localImport.ts`；同步 `types.ts` 中 `DanmakuSource` 的 `local`，以及 `modules/room/watch-together/DanmakuTrackCard.tsx` 的入口/标签/颜色。

- 支持 B站 XML、B站 JSON、dandanplay JSON；沿用上游排序、有效性过滤与最多 20000 条截断提示。
- 走已有 `useDanmakuStore.addTrack`：当前 store 在有 roomId 时调用 `POST /api/rooms/:roomId/danmaku-tracks`，提交 `{ trackId, label, source, items, offset, hidden }`，无 roomId 时只更新本地状态。不要为这项功能发明新的上传 API。`local` 只用于轨道，不应进入远程搜索来源列表；搜索所有 `Record<DanmakuSource,...>` 补齐枚举映射。
- Android 先验证 WebView 的 `<input type=file>` 能返回 XML/JSON，取消选择后不报错、连续选择同文件可触发；不要直接申请全盘存储权限。
- 当前 `Index.ets` 未发现显式文件选择回调。鸿蒙先实测 ArkWeb 默认行为；若无法返回 File，再通过系统文档选择器/宿主回调补齐，并保持共同业务解析代码。此项是待验证缺口，不是已确认的系统能力结论。
- 移动导入按钮按维护要求保持可触达尺寸；大文件先做大小限制/错误反馈，必要时放到 Worker 解析，不能仅依赖解析后的条目截断来防止 UI 卡顿。
- 验证空文件、畸形 XML/JSON、超限、中文文件名、同名多次导入、偏移/隐藏/删除及切房清理；另测房主上传、观众权限拒绝、其他成员重载后的共享结果。现有 addTrack 上传失败只记录日志、没有向调用方抛错，因此导入 UI 不能把 Promise 完成一律显示为“已同步房间”；实施时补充服务端失败反馈或区分本机导入与房间保存状态。

## 7. P1/P2：音乐账号和界面

来源：`backend/src/routes/music.ts`、`frontend/src/pages/ProfilePage.tsx`。

| 新接口 | 契约 | 双端实现 |
| --- | --- | --- |
| `POST /api/music/ncm-cookie-login` | `{ cookie: string }`；支持 Cookie header 字符串或 Set-Cookie JSON 数组字符串，须含 MUSIC_U；服务端验证后返回 `{ success, profile: { nickname, avatarUrl } }` | 在共享音乐账号入口新增输入弹窗，成功后调用既有 `fetchLoginStatus` 刷新 store |
| `GET /api/music/ncm-cookie` | `{ success: true, cookie: string }`；没有已存凭据可返回空字符串 | 用户主动点击后读取并复制；剪贴板不可用时提供受控手动复制方式 |

游客 userId ≤ 0 返回 401；缺字段、缺 MUSIC_U、过期/无效 Cookie 返回 400。界面需区分“先登录 ZViewer”与“网易云凭据无效”，不能把每个 401 都当成 ZViewer 会话过期。原有扫码和退出接口保留。

建议落点为 `src/upstream/modules/music/hooks/useNcmLogin.ts`、`components/MusicQrLoginModal.tsx`、`components/MusicTopNav.tsx`，必要时新增独立 Cookie 弹窗。当前移动首页由 `src/App.tsx` 实现，不能直接覆盖上游 ProfilePage/HomePage。Cookie 提交成功或关闭后清空输入，不写日志、房间广播或永久 localStorage；这与 B站原生本机 Cookie 是两套不同凭据体系，不改 `native/bilicore` 或 ArkTS B站存储。

`MusicMyPage.tsx` 同步移除“下载管理 / 本地管理”空 Tab，只保留歌单/收藏，修正旧 Tab 索引状态；保留移动菜单折叠、歌词/系统媒体会话、旋转与触摸行为。上游 HomePage 交换“房间列表 / 加入房间”按钮位置仅属产品布局，可按移动首页布局选择跟进，无须修改房间协议。

## 8. 不需移植到客户端的上游变化

- `backend/src/routes/serverFiles.ts` 新增根目录后调用 `invalidateRootRegistry()`：服务端修复；双端只回归新增后刷新列表和立即访问，不增加客户端缓存绕过逻辑。
- Dockerfile、build-all/build-exe、LiveKit 伴生程序、自动更新替换清单、Node 打包版本及依赖裁剪属于服务端发布链，不进入 APK/HAP。
- 本区间没有改动 B站解析服务或移动原生协议，不能借更新覆盖既有本机随机端口代理、Cookie 隔离、CDN 签名参数、Range、等待 current-movie 的竞态修复。
- 共享前端在指定客户端仓库实现一次；Android Java 与 HarmonyOS ArkTS 各自维护，不互相复制。`rawfile/web` 始终由脚本生成。

## 9. 建议施工顺序、验收与回档

1. 在指定客户端仓库建立本轮适配分支，保存明确基线；当前存在无关 iOS 未跟踪文件，禁止用 `git add .` 纳入本轮提交。
2. 先完成 P0 共享语音迁移和服务端联调配置，再在 Android 验证登录用户/游客与桌面互通、双向出声、禁言/解禁/踢出、网络重连。
3. 复用同一共享产物验证 HarmonyOS，补权限/音频路由的实际差异；不要把 Android 通过当作鸿蒙通过。
4. 分批移植媒体补丁、本地弹幕、音乐账号功能；每批保持可审阅差异，再完整构建两端。
5. 每次修复或功能更新同步两份维护架构文档；完成一个版本构建后按 AGENTS.md 做本地 commit，记录服务端 SHA、客户端 SHA、构建命令与设备证据。该要求在后续真正实施/构建时执行，本轮仅交付方案。

共享构建命令（在 `E:\Codex-bulid\ZViewer\ZViewer-client` 执行）：

```powershell
npm run build
npm run android:sync
npm run harmony:web
```

随后按现有 Android Gradle 与鸿蒙 Hvigor/DevEco 发布流程生成 APK/HAP，沿用现有签名配置。不得手工修改 `ZV-HarmonyOS/entry/src/main/resources/rawfile/web/`。

| 验收组 | 必须记录的证据 |
| --- | --- |
| 新协议连接 | token 请求到用户所选服务器，返回 URL 在设备可达，HTTP validate/WS Upgrade 成功，双向音频实际可听 |
| 权限与异常 | 游客、登录用户、过期认证、拒绝麦克风、503 未就绪、403 管理拒绝；失败后能重试且无残留采集 |
| 身份与生命周期 | 同账号双设备顶替提示；收起面板不断音；离房/切服/被踢后麦克风指示关闭；快速进退没有过期音轨 |
| 路由与后台 | 音乐+语音、扬声器/耳机/蓝牙、横竖屏、前后台、锁屏、恢复；分别记录是否支持，不推断后台通话已具备 |
| 媒体 | 真实 MKV 的 PGS/ASS/SRT、seek、持续出声与画面推进、字幕缩放；B站双轨 Range/206 与既有本机代理不回归 |
| 功能 | 两端 XML/JSON 选择导入、坏文件/超限；网易云扫码/Cookie/复制/退出与游客拒绝 |
| 保留功能 | 观众权限、业务 Socket 重连、系统通知控件、歌词/封面、主题安全区、屏幕共享观看 |

若需要还原本轮更新前的源码，可在源码目录 `git switch master` 或切换备份分支；执行前先检查工作树，不能强制丢弃后续修改。客户端后续回退使用每批本地提交。退回旧客户端会重新失去新服务器语音兼容性，回退方案必须标注服务端版本搭配。

## 10. 初始方案核验边界（实施前历史）

已核验 Git 上游 HEAD、源码工作树、v4.2.1 至最新提交差异、当前客户端实现及两端维护手册。没有执行安装依赖、构建、真实服务端升级或设备测试；上述验收表全部是后续工作，不是本轮通过记录。

可复核上游：[本轮提交](https://github.com/Zero-wyc/ZViewer/commit/9827929088a31d7cb1d6bf7ceac096df640a2416)、[完整比较](https://github.com/Zero-wyc/ZViewer/compare/v4.2.1...9827929088a31d7cb1d6bf7ceac096df640a2416)。

## 11. 2026-10-04 实施结果：双端 1.6.0 / 160

| 方案项 | 本次交付状态 |
| --- | --- |
| P0 LiveKit | REST/identity、移动权限与音频路由、幂等清理、取消竞态、主动闭麦、重连状态和恢复出声入口已完成；移除旧媒体 Socket/processor/multiInstance。 |
| P0 服务端联调 | 使用锁定源码编译隔离测试后端及伴生 LiveKit，推流关闭；Android、鸿蒙、桌面 SDK 三方入会并验证实际媒体字节/解码电平。没有升级用户运行中的服务端或验证其代理/TURN。 |
| P1 媒体 | PGS 解码/类型/hook/渲染和 Matroska 修正、可重现 playsvideo 补丁已完成；双端测试片解码与定位、真实 MKV ASS 提取通过，完整长片/seek/跨端字幕广播仍待验收。 |
| P1 弹幕 | XML/JSON、local 枚举、大小/条数限制、权限失败回滚已完成；双端系统选择器实际返回 XML，鸿蒙已补专用 DocumentViewPicker 回调；房主保存/观众广播/观众拒绝通过。 |
| P1/P2 音乐 | Cookie 登录/主动复制、游客限制、临时值清理和空 Tab 删除已完成；错误、空值与移动弹窗通过，真实有效 Cookie 与扫码仍需人工验收。 |
| 版本与构建 | 1.6.0 / 160，共享网页、APK 与 HAP 构建通过，18 项自动回归通过；本地提交记录在源码归档旁。APK 调试签名，HAP 未签名，未发布 GitHub Release。 |

维护手册、复现命令、产物和剩余验收见 [1.6.0 双端交付记录](releases/client-1.6.0-adaptation.md)。
