# iOS 1.8.0 / build 18 验证记录

日期：2026-10-13。指定源码仓库为 `ZViewer-client`，iOS 工程为 `ZV-iOS`。用户授权完成源码及界面检查后构建 IPA，并将其补充到现有 `client-v1.8.0` Release，源码更新至 `main`。

## 界面对齐

Kazumi、ani-subs、传统番剧源统一采用简洁入口和独立搜索弹窗，对照 Android/HarmonyOS 的 `AnimeSourceBrowser` 及用户截图：源选择、关键词搜索/清空、切源自动搜索、展开/还原、海报墙/列表、选集、多选/全选及整部确认。成功项取消选择，失败项保留；操作底栏固定，长名称换行，封面保持比例。

| 视口 | 海报列数 | 横向溢出 | 底部添加按钮 |
| --- | --- | --- | --- |
| 390×844 | 2 | 无 | 可见 |
| 844×390 | 3 | 无 | 可见 |
| 768×1024 | 3 | 无 | 可见 |
| 1366×1024 | 4 | 无 | 可见 |

普通弹窗最大宽度 960；平板展开实测 1334，列表行占满内容宽度。浏览器使用可丢弃本机接口和几何封面，不使用生产账号或 NAS。图像及测量保存在本地忽略目录 `.ui-validation/ios-20261013`。此前 B站、媒体库和四种目录来源的对齐沿用同日各专项记录。

## 播放与重试修复

- 聚合番剧 HLS：服务端代理原样转发清单，导致相对子清单/分片相对代理路径解析。主媒体在 VLC 端恢复真实上游基址，保留来源 Referer/UA、默认 UA、CDN 签名及独立的房间身份；独立渐进音轨仍经过鉴权代理，以保留其自己的请求头。非法目标/头和聚合源内网边界继续校验。
- Emby/Jellyfin：完整广播不再继承上一集可选字段；识别双端 URL 的 `ep`；适配影片列表、当前影片与状态事件乱序。同 URL 的另一影片/分集也重新加载，不继承旧进度；原生换源中刷新 token 保留正确初始位置。
- 入房恢复：房主保留恢复进度和倍速并暂停，重复当前影片事件不会重新归零；主动换片/切集仍从零开始。观众拒绝旧连接、旧选片、旧分集的迟到状态回执。
- 一起听：按完整歌曲/分 P 身份校验同步和准备回执，阻止旧 VLC 进度/结束事件覆盖新歌曲；暂停、seek、断连或新选择使旧推荐/私人漫游请求失效；私人漫游尊重显式单曲循环。
- 批量添加：POST 已成功而刷新/开始播放失败时保留事务；番剧以稳定集数身份缓存未完成解析结果，避免签名 URL 轮换后重试重复 POST。缓存由添加面板持有，关闭/重开和切来源后仍保留，房间/账号变化时隔离；完成后删除缓存，之后明确再次添加属于新操作。

## 自动验证

- `npm test`：**159/159 通过**，包含真实生产模块、RN AbortController、房间事件顺序、播放器时序、组件音乐回调及批量签名重试。
- `npm run typecheck`、`npm run lint`：通过。
- Expo SDK 57 iOS 开发 bundle HTTP 200，Metro 预览可用；这不是原生构建检查。
- `stage-native-core.cjs --verify-only`：12 个来源文件通过，审核基线为 `02f62f1fc52f0c47f2a2f8e6fec8ed22d98539fc`。
- 前一轮本机 libVLC 3.0.24 辅助证据：原代理路径错误时进度为 0；恢复上游基址后主/子清单和分片收到 Referer/UA，进度达到 3026ms。该证据只验证桌面辅助场景。

## 原生与交付边界

源码版本为 **1.8.0 / 18**，构建对应源码提交 `0146c1f4ed3947a6a3276aa0282645ada331f237`。

| 项目 | 实际结果 |
| --- | --- |
| EAS 构建 | `a0c5ca7e-dbd1-4e8f-a3fc-7b458b1402fd`，`unsigned-device` / Release，FINISHED |
| 完成时间 | 2026-10-13 12:10:05.968（北京时间） |
| 文件 | `ZV-iOS/release-assets/ZViewer-1.8.0-b18-unsigned.ipa` |
| 大小 | 47,308,388 字节 |
| 包内版本 | `com.zviewer.mobile`，1.8.0 / 18 |
| 设备与内核 | iOS platform 2、ARM64、iPhone/iPad、最低 iOS 16.4；VLCKit + LiveKitWebRTC |
| 签名与完整性 | 主应用无签名、无 provisioning profile；139 个 ZIP 项全部 CRC 通过，需自行签名后安装 |
| 原生内容 | Release JS、本机 B站桥、系统媒体、LiveKit RN/WebRTC/Expo 注册及许可证齐全；Go 12 文件来源与审核清单一致 |

SHA-256：`b4485257ba0ec5b45d963f95c0c48294453cdbc0d86f2a858305ea1d833a68c8`，构建机打包、本地下载、GitHub 资产摘要及公开下载文件四者一致。详细结果见 [离线 IPA 检验](ios-1.8.0-18-ipa-inspection.json) 与 [交付验证 JSON](ios-1.8.0-18-validation.json)。

IPA 已追加到 [ZViewer-Client V1.8.0](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v1.8.0)。原 APK/HAP 大小与摘要保持不变；`SHA256SUMS.txt` 已更新为三平台 299 字节文件，四个附件均回读确认 `uploaded`。源码更新 main，原 `client-v1.8.0` 标签保留在 `534e537`；因此标签自动 Source code 仍是原双端快照，新 iOS 源码使用 [main](https://github.com/Zero-wyc/ZViewerAPP/tree/main) 或其 [自动归档](https://github.com/Zero-wyc/ZViewerAPP/archive/refs/heads/main.zip)。发布前源码归档和 EAS 上传审计未发现 AGENTS.md、真实本机账户信息、私钥或服务令牌；历史预览导出目录已从上传中排除。

需要 Origin/Cookie 的聚合 HLS 当前给出明确不支持提示；独立 HLS 音轨的专属请求头通道未完成设备验证。真实 iOS VLC 解码、会员片源、iOS Modal/安全区/键盘、LiveKit 互听、后台/蓝牙与跨端播放仍需设备验收，自动检查不等于所有场景无缺陷。未修改生产 NAS。
