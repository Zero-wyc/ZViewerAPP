# Android v4.2.1 适配记录

日期：2026-10-01。依据 `android-v4.2.1-compatibility-analysis.md` 的 A01～A17 完成共享业务层迁移，目标宿主为 `ZV-Android`。Android Java 插件、移动界面默认值与 mediabunny 本地补丁沿用现有实现。后续真实高画质排查修正了 Go B 站核心的 CDN 代理策略，见下文。

## 实施内容

| 项目 | 结果 |
| --- | --- |
| A01～A03 语音 | 独立 websocket Manager；`voice-join` 下发令牌后等待 `voice-media-init` ACK；Opus/PCM 通过 `voice-media-data` 收发。房间恢复 ACK 后重入语音并绑定新令牌，媒体重连复用当前令牌。补齐超时、取消、媒体连接状态、鉴权刷新与退出清理，传输使用 volatile 防积压。同步 PLC、拥塞码率、质量统计及稳定 instanceId；保留 Android 麦克风权限和音乐路由。 |
| A04～A07 B 站 | DASH 缺省允许，管理员设置优先；CLI 开启但不可用时保留开关并走服务器 MP4。服务器自动选档不传固定 qn，采用真实 currentQn。创建影片返回 Movie，按实际格式给创建的 id 保存偏好。观众首次播放与重载共用本地解析覆盖流程，保留 cid、账号会话、能力缓存、自动/手动策略、失败回滚和暂停意图。 |
| A08～A12 播放器 | 固定 Video.js 10.0.0-rc.4，DASH Adapter 使用 dash.js 5.2；保留自研 sidx/moov/虚拟 MPD/Blob 构建。移除旧 DASH 引擎与 SwarmCloud P2P，迁移旧偏好时保留格式和缓冲开关。MPD 中的 API 基址使用所选服务端。电影级 playsvideo 开关决定 MKV/重封装路线。增加 attach 取消、销毁后的 seek 取消、超时和游离元素守卫。修复 dash.js 销毁后的 streamInfo 空引用。 |
| A13～A14 一起听 | 重复歌曲按队列位置推进；并发懒解析等待同一个 Promise；解析缓存隔离账号、服务器和模式。暂停/换曲/离房取消重试与过期解析，限制 1/2/3 秒重试。保留隐藏媒体元素挂 DOM 与 Android 音频路由；本机 B 站音轨和歌词背景通过本机代理取流。增加背景服务器 DASH 与分辨率设置，并遵守管理员 DASH 开关。 |
| A15 FLV/HLS | FLV 直播统一到播放器引擎，保留有限重连、事件、缓冲清理与远程 FLV 基址。HLS 修复 Loader 回调参数顺序、代理清单相对基址与分片/密钥鉴权，并透传源 headers。 |
| A16～A17 界面 | Kazumi/AniSubs 选集支持多选，逐集沿用已有添加接口，保留失败项并移除成功选择，报告部分失败；补齐统计与评论界面变化。保留移动字幕/弹幕默认值、旋转安全区和宿主控制。诊断按已有开关启用。 |

## 已完成验证

本机使用 `ZViewer-source code` 的 v4.2.1 构建服务端与官方网页，服务监听 3421；测试数据存于独立临时 SQLite 和 uploads 目录。未修改用户正式服务器数据，也未打开服务端单账号多实例测试开关。Android 为 Medium_Phone 模拟器，通过 adb 安装调试 APK、reverse 端口、WebView CDP 联调。

| 场景 | 结果与证据 |
| --- | --- |
| 编译 | TypeScript/Vite、Capacitor sync、Gradle assembleDebug 均成功；package-lock 固定新增依赖。 |
| 安卓 ↔ 官方网页语音 | 使用 Android 测试 root 与官方网页游客同房；双向媒体帧传输通过（采样 Android 上行 101 帧、官方接收 101 帧；官方上行 229 帧、Android 接收 203 帧）。媒体连接独立于房间主连接。 |
| 语音网络与退出 | WebView 模拟断网 1.5 秒，恢复后重入房间和语音并再次绑定；退出语音停止上行，重新加入可用，确认离房后语音面板消失。 |
| Android MP4/DASH | 合成 H.264/AAC 素材实际播放推进；暂停、1.5 倍速、跳至 7 秒、恢复均通过；换片后无旧视频继续播放。 |
| DASH 缓冲与代理 | 桌面 Chromium 执行相同模块：流模式、Blob 缓冲模式、跳至 17 秒通过。显式 Range `bytes=0-12582911` 返回 206，Content-Range `bytes 0-12582911/33012042`，Content-Length 和实际长度均为 12582912（12 MiB）。取消的 attach 以 AbortError 退出，游离媒体不会调用 play。 |
| B 站本机真实播放 | 使用模拟器已有原生登录会话与 BV1xx411c7mD，自动最高解析为 DASH、cid 62131、实际 qn 32（该视频可选 32/16），在 APK 内播放推进至 2.07 秒，时长 2055 秒。未将 Cookie 或本机代理凭据写入房间广播或验收记录。 |
| 模式与迁移 | 服务器 DASH 允许/禁止、CLI 不可用的 MP4 回退及开关保留、旧 P2P 偏好迁移保留格式与缓冲设置均通过。 |
| 一起听回归 | Chromium 挂载实际 useListenTogether hook，以合成音频代替第三方音乐流：DOM 音频播放推进至 0.55 秒；队列 `[歌曲1, 歌曲1, 歌曲2]` 连续下一首到达歌曲2；暂停停止音频；临时 play 拒绝后的重试在 teardown 时取消，仅调用一次；卸载移除音频元素。未声称第三方音乐登录/VIP 服务已验证。 |
| Android HLS/FLV/MKV/FLAC | 合成素材实际播放；HLS readyState 就绪、时间推进至 0.42 秒；FLV 0.36 秒、MKV 0.40 秒；MKV 中 16/24 位 FLAC 音轨经 playsvideo 播放均推进，无 MediaError。 |

原始测试脚本、合成素材与本机联调记录保存在工作区临时 `.codex-android-421/`，未重新引入此前从客户端交付树删除的旧测试目录。模拟器原有服务器与登录会话已恢复，含凭据的临时 localStorage 备份已移除。

## 验证边界与交付

模拟器已验证传输帧、解码和媒体时间推进；真人双向听感、蓝牙/有线耳机、真机权限拒绝与长时间后台、弱网音质、4K/VIP 视频、实际多 P 切换、跨账号切换、各第三方番剧规则源和直播推流的断流恢复仍需设备/内容专项验收。以上不标为已通过；本次未重新发布这些原生功能。

调试 APK 位于 `ZV-Android/app/build/outputs/apk/debug/app-debug.apk`。版本保持现有 1.2.1-debug，未发布、未签发 release、未提交 APK/AAR。官方 v4.2.1 语音协议为本轮目标，旧服务端的 `voice-audio-data` 不提供兼容回退。

适配初次验收 APK 的 SHA-256 为 `73b670f4eb382df415e3d974e74073b801e437a2b822b81ae3c6e8b8ff405413`。后续高画质修复已重新构建并覆盖同一路径，最新 APK 的校验值与验证记录见 [Android B 站高画质播放修复](android-bilibili-cdn-playback-fix.md)。

构建保留的非阻塞告警：大 chunk、mediabunny 动态导入与 dash.js CommonJS/ESM 告警。CLI 联调结束后恢复模拟器原有服务器会话并停止临时测试进程。
