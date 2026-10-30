# B站一起看恢复修复记录（2026-10-30）

本轮基于鸿蒙客户端中断排查实施客户端修复。版本保持 2.3.3 / 233，修改集中在共享播放器、房间同步与鸿蒙本地代理；Android 同步共享修改。本轮仅本地构建和提交，不修改 NAS 或服务端，不构建 iOS，不发布 Release。

## 修复行为

- 原生 B站恢复不再按影片终身累计四次：每次故障最多四次尝试，连续真实播放推进 15 秒后重置故障预算。自动画质只向下回退，手动画质保留用户选择并刷新地址。
- 恢复全过程有 60 秒截止时间，每次尝试最多 30 秒。解析、播放器队列、挂载、播放及等待进度都能取消；超时释放恢复锁和事件抑制，保留显式重载入口。重新点击重载会废弃旧任务并刷新音视频地址。
- 服务器、房间会话、影片、CID、本机账号、画质选择或播放器实例变化后，旧任务不能挂载源、写入状态或清理新播放器。观众本机覆盖同时检查视频与音频地址的有效期，距过期不足 60 秒时重新解析。
- 原生 B站无错误事件却连续 20 秒既无播放时间推进也无画面帧推进时，触发有界恢复；暂停、跳转、片尾、非原生源和正在恢复时不触发。
- 换源期间房主继续发送存活心跳，但时间与播放意图取自最近稳定状态，避免发布播放器重建时的临时零进度。用户暂停会冻结有效时间；手动同步及新观众请求完整状态使用同一稳定样本。恢复完成后立即广播最新画质、播放意图与完整源，剥除本机代理包装。
- 控制栏播放按钮与中间双击共用显式播放意图。引擎为重新挂载而临时暂停时，点击界面上的“暂停”仍记录暂停；即使 `pause()` 不再触发事件，按钮也立即切为“播放”并同步完整状态，异步恢复不能自行续播。
- 鸿蒙 `BilibiliLocalProxy` 的每个上游请求都在 `finally` 销毁。403 等候选重试、异常、下游断连或发送失败均释放上游请求与等待中的发送任务，迟到回调不能继续回复。
- DASH 的多个直接 SIDX 合并为实际分段时间与字节区间；保留时间间隙，避免只累加时长却漏掉分段。估算区间使用整数并遵守已知 EOF，206 的局部 `Content-Length` 不再被误当作文件总长。

## 源码与验证入口

| 范围 | 入口 |
| --- | --- |
| 恢复与观众覆盖 | `src/upstream/modules/sync-playback/hooks/useVideoSource.ts` |
| 可取消播放器队列 | `src/upstream/modules/player/hooks/usePlayerSource.ts`、`utils/abortable.ts` |
| 原生静默卡顿检查 | `src/upstream/modules/sync-playback/services/native-stall-recovery.ts` |
| 稳定心跳与完整同步 | `useHostHeartbeat.ts`、`useHostBroadcast.ts`、`useHostSync.ts`、`useHostStateRequest.ts` |
| 原生解析取消与有效期 | `src/upstream/modules/bilibili/cliApi.ts`、`sourceValidity.ts`、`room/watch-together/movie-source-resolver.ts` |
| 鸿蒙请求生命周期 | `ZV-HarmonyOS/entry/src/main/ets/services/BilibiliLocalProxy.ets` |
| DASH 索引 | `src/upstream/modules/player/engines/dash/mpd-builder.ts` |
| 专项回归 | `npm run test:bilibili` |
| 既有回归 | `npm run test:maintenance`、`npm run test:music:toolbar` |

专项测试执行实际 Hook、队列和代理源码，覆盖多轮恢复、截止时间、用户暂停、身份切换、旧任务失败、候选释放、下游断连、过期音频及多 SIDX。DASH 测试另用 FFmpeg 生成四个实际索引，按两条解析路径重建并解码媒体；这些受控测试不等同于原生设备验收。

最终源码验证通过：B站专项 77 项（恢复 29、队列取消 6、同步 20、鸿蒙代理 13、DASH 索引 9），既有维护 161 项、工具栏与音质 8 项，共 246 项。TypeScript / Vite 与 Android、HarmonyOS 签名构建通过。

## 本地交付与验收边界

安装包、构建日志、原生中断测试记录和各最终包一次 SHA256 保存在忽略目录 `release/bilibili-recovery-20261030/`。Android 交付签名 Release APK，HarmonyOS 交付签名 Release HAP；模拟器使用同源 Debug HAP 开启 ArkWeb 调试。签名注入完成后必须恢复 `build-profile.json5`，生成网页资源由平台同步脚本更新，不手工编辑。

原生验收使用保留数据的 Pura 90 Pro 模拟器（HarmonyOS 7.0 / API 26）、隔离的本地 Go 服务和实际 Socket.IO 观众连接，播放实际 B站 1080P 长视频，静音运行。仅阻断本机媒体代理请求，每轮 10 秒，放开后同时检查重新解析、实际画面帧与播放时间持续推进、恢复后完整房间状态及心跳。

三轮中断全部恢复：放开请求后首次持续推进分别约 45.6、25.4、22.1 秒，实际画质依次为 720P、480P、360P。每轮均重新解析两次，恢复后再检查至少 22 秒实际画面与时间推进，轮间正常播放 25 秒；第三轮未再因累计六次解析而耗尽旧版的终身恢复预算。恢复后完整状态均为有效非零进度及跨设备源，心跳最大间隔 2.018 秒，无未捕获异常，结束后已清除请求阻断。记录 `acceptance.json` 的一次 `suppressedZeroTimes` 发生于初始起播尚在 0 秒时，并非恢复倒退。此轮完成后，最终源码另补观众过期任务错误守卫和恢复暂停完整同步守卫，并重新运行全部回归、构建安装最终包。

最终同源 Debug HAP 另通过手动 720P 中断恢复与暂停补测（`pause-acceptance.json`）：实际控制栏暂停动作立即广播 1078.316 秒、`isPlaying=false` 和便携音视频源；手动同步与观众 `watch-together-request-state` 的服务器 ACK 均获得该暂停状态。恢复重新解析两次，画质保留 1280×720，挂载完成仍暂停在 1078.391 秒；再观察 6 秒，时间和画面帧均保持不变。17 次暂停心跳保持有效非零进度，恢复抑制期间时钟冻结。再次点击“播放”后，播放时间推进至 1085.888 秒、解码帧增至 275，无未捕获异常，请求阻断已清除。这里的观众证据是实际 Socket.IO 状态链路，不是第二台原生设备解码验收。

最终 Android Release APK、HarmonyOS Release HAP 和模拟器 Debug HAP 的各 31 份网页资源均与最终构建输出逐字节一致（入口 `index-Ffn2SUPY.js`）。正式包非调试、沿用现有签名，HarmonyOS 最低版本仍为 6.1 / API 23；签名配置已恢复为空。每个最终包仅计算一次 SHA256，记录在同目录 `SHA256SUMS.txt`，后续发布复用该记录。

这不能代替 HarmonyOS 6.1 / API 23 实体机、Android 实体机、后台运行或完整十小时自然播放验收。服务端原有的 `suppressed` 心跳持久化问题未在本轮修改；新版客户端通过稳定样本避免发送换源临时状态，旧客户端仍保留原风险。SIDX 扫描保持现有有界扫描策略，不声称支持任意位置或任意层级的全部索引格式。
