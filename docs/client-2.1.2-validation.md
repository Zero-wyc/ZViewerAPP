# 2.1.2 / 212 Android / HarmonyOS 本地交付与验证

日期：2026-10-20（Asia/Shanghai）。客户端起点 `4b96025`；实施依据为 [v4.6.4 检查报告](安卓鸿蒙对齐服务端v4.6.4检查报告-2026-10-20.md)。目标为报告中已下载的 `cbdd6cc6e16cc661de092627405c9e191d296c45`，包含 v4.6.4 正式版后的 main 修改；不以服务端保留的旧 Git HEAD 或 package.json=1.0.0 判断协议版本。

本轮完成双端客户端更新、本地构建和 Git 提交，不推送或发布 Release，不修改 NAS 容器，不改动或构建 iOS。

## 已完成的报告项目

| 项目 | 实施与验证 |
| --- | --- |
| 媒体库 HLS 基址 | 不再调用 movie-source 还原媒体库上游基址或使用通用代理。stream/proxy 清单及子清单、TS/fMP4、AES KEY、MAP 均以所选逻辑服务端为基址，保留反代前缀、资源身份、ms/at；在每次实际请求时附加当前成员 token，并转换原生传输 URL。按用户补充要求删除此处旧服兼容；未重写、跨影片或混合路由直接报错。 |
| Socket 主动断开 | 服务端主动断开和认证握手错误走唯一刷新任务；成功后新 socket 经原准入入口恢复。网络失败保留身份并提供重试；明确撤销退出登录并回收媒体。每轮一次刷新，30 秒最多三次连续恢复，主动离房/注销/切服作废旧任务。 |
| directLinkProxy 删除 | 从 DTO、映射、增改类型、添加入口、resolver 删除。directLink=true 的视频与挂载直链不允许失败后暗中转发；挂载表单继续提供真实 directLink 选项。serverProxy 仅保留 anime/ani-subs、Kazumi、CMS 的使用及开关；原生本机代理/证书通道保留。 |
| 普通 owner 管理 | root 或正数 userId 匹配 owner 时允许排序、清空、删除及改名。公开列表不返回 owner，改用服务端验证成功的 register-host 应答以及 host-transferred.newOwnerUserId；本地 isHost 不单独授予 REST 权限，不查询管理 API。当前服务端显式转交会修改持久化 owner，按该字段更新权限。manageMovie 的 Socket 控制范围保持独立。 |
| 403 与准入 | API 默认只对 401 刷新。REST 及 HLS 的明确准入 403 通知当前房间，撤下媒体后最多自动重新准入一次，失败保留可重试状态；其他 403 维持业务错误。旧服务器迟到的 401 不得刷新新服务器身份，晚到 refresh 不得写回或重发请求。被踢/关房后迟到应答或重连不得复活媒体。 |
| 平台边界 | Android PiP、HarmonyOS WebRTC PiP 禁用、原生采集和账号边界保持；HarmonyOS compatibleSdkVersion 仍为 6.1.0(23)，target 为 26.0.0。不迁移桌面代码、网页 Cookie 页面或无差异 vendor。 |

## 自动化与真实本地协议

- 客户端 `npm run test:adaptation` **181 项通过**；`npm run test:media` **4 项通过**；`vendor/local-patches.mjs --check` **6 项通过**。前端类型检查及 Vite 构建、两端资源同步通过。构建仍有既有的大 chunk、vendor 动态导入及 dashjs ESM 警告。
- 新增测试包括真实 Socket.IO 主动断开后的新 socket/新 token/重新加入；并发刷新去重、网络重试、撤销、离房/切服取消、连续断开上限；401/403 分类及迟到响应隔离；普通 owner 与非 owner 权限；重新准入次数上限、关房/被踢与迟到批准。HLS 矩阵覆盖两端来源、根路径/反代前缀、普通/原生证书传输、Emby/Jellyfin、stream/proxy，以及子清单/KEY/MAP/分片、当前 token 轮换、未重写和跨影片清单拒绝。
- 在指定本地服务端重新运行锁定依赖 `npm ci` 及 backend 构建，随后 `npm run test:server` 通过：接口/Socket 审查 **89 项**、边界 **16 项**、同步/鉴权扩展 **23 项**、代理 **2 项**、服务 **9 项**，总计 **139 项**。使用全新隔离数据库，未访问 NAS SSH 或运行数据；包含普通 owner、游客审批/容量/隔离、禁言、撤销、Range 代理和媒体库清单重写等实际服务端检查。
- 另以当前生产 socket-auth 中间件、真实数据库与刷新路由运行 **4 秒 access token TTL**：当前 useSocket/恢复器在到期后取得新 token，以不同 socket ID 再次 register-host，并读取片单返回 200；随后调用实际令牌撤销服务，refresh 被拒绝，退出登录、socket 清空和媒体回收通过。进房状态机的迟到 ack/终态保护另由客户端测试覆盖。
- 这些本地数据源和数据库均为隔离夹具，不代表生产媒体库、NAS 或公网原生验收。服务端静态前端旧 dist 没有作为本轮前端证据；原生测试直接运行各安装包中的客户端。

## 原生运行时

测试使用生产 REST/Socket/媒体库路由和隔离的 H.264/fMP4 HLS 资源，服务端地址带 `/base` 前缀。安装包播放器、原生连接层和 HLS loader 均为实际实现，没有注入替代媒体引擎；只写入隔离的游客登录态作为测试准备，结束后恢复原页面及本地存储。两个模拟器轮流运行，前一端退出后再启动另一端；测试结束关闭模拟器及本轮隔离服务。

### Android

Medium_Phone x86_64 模拟器、Android API 37，最终 Debug APK 覆盖安装成功。包内实际 WebView 播放 640×360 HLS：4.09 → 11.24 秒，18 → 125 个解码帧，readyState=4、播放中，无新 JavaScript 未处理异常。全部媒体库请求保持 /base/api/jellyfin/stream，包含初始化 MAP 与 fMP4 分片；没有额外 movie-source 查询、通用媒体代理或浏览器侧上游凭据。浏览器调试截图未捕获视频画面，另以 ADB 系统截图确认彩条和动态测试画面正常，系统截图证据为 android-system.png。此结果不代表实体 Android 设备、真实媒体库或扬声器验收。

### HarmonyOS

Pura 90 Pro x86_64、OpenHarmony 7.0.0 / API 26，最终签名 Debug HAP 覆盖安装成功。包内实际 ArkWeb 播放 640×360 HLS：1.91 → 8.93 秒，12 → 118 个解码帧，readyState=4、播放中，无新 JavaScript 未处理异常。全部媒体库请求保持 /base/api/jellyfin/stream，包含初始化 MAP 与 fMP4 分片，未请求 movie-source 或向浏览器暴露媒体库上游凭据。首轮隔离房主会话失效导致“分享端不在线”，为夹具增加每次验收前重新 register-host 与重发播放状态后独立重跑通过；未修改客户端来绕过准入。API 26 模拟器结果不替代 API 23 或实体设备验收。

## 最终安装包与限制

交付目录 `release/client-v2.1.2/`，Android/HarmonyOS 均为 2.1.2 / 212。APK 经 apksigner v2 验证通过，HAP 经 hap-sign-tool verify-app 验证通过且包内 debug=false。APK 33 个、HAP 31 个网页资源与各平台最终同步目录逐字节一致；未改动的 Bilicore 原生库沿用现有构建缓存。正式发布签名与 Debug 运行时结果分别记录；每个最终交付 APK/HAP 仅在构建后计算一次 SHA-256，保存于同目录 `SHA256SUMS.txt`。不重复下载或计算校验，不复用 2.1.1 安装包。

本轮没有验证真实 Emby/Jellyfin 实时转码、生产挂载、私有证书实际联网、扬声器声音、多设备跨网语音、OBS 实推流、长播、全部多版本切换或 HarmonyOS 6.1/API 23 真机。HLS 测试媒体仅含视频轨，解码画面和进度推进不能证明声音。设备结果只覆盖各自记录的模拟器与场景。

本地证据位于忽略目录 `.ui-validation/alignment-464/` 和相关构建日志；其中私有会话、签名配置、模拟器存储及数据库不提交。原始检查报告保留为升级前证据，不重写为已完成的新版验收报告。
