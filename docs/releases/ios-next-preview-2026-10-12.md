# iOS 下一版源码预览记录（2026-10-12）

本记录保留当时源码预览阶段的状态。用户确认 Expo Go 界面通过并授权构建后，已生成 **1.7.5 / build 17** 真机 IPA；新的功能复核、签名修复和实际包证据见 [构建记录](ios-1.7.5-17-unsigned.md)。

预览阶段按 [iOS 更新计划](../ios-follow-up-update-plan-2026-10-12.md) 实施，对照双端 1.7.5 与本地服务端 v4.5.1 / `c8fa5bad0c6efcffbc0dc3bfe4c199f8a9b8d8f6`。当时交付范围是源码与 Expo 界面检查，**没有构建 IPA、运行 prebuild、触发 EAS 或发布 Release**。当时应用版本维持 1.5.1，buildNumber 16；已发布 1.5.0 / 16 安装包不含这些更新。

## 🚀 新特性 / Features

- LiveKit RN token/identity 语音，REST 禁言/移除、管理员 mute 与主动关麦分离、进入只听、房间/账号/服务器生命周期释放。原生 SDK 和新桥接实现已写入源码，实际听音尚未验证。
- Emby/Jellyfin 挂载搜索、目录、单集/批量添加、整部/整季单卡，真实 itemId/mountId 分集映射和 MediaSourceId 版本选择。
- PGC ep/ss 链接与番剧/影视搜索、搜索结果内选 P/集、整部多 P 卡、本机解析门控；原生桥传 epId/seasonId/page/cid，房间不使用其他设备的 loopback 地址。
- 番剧关键词跨来源保留，切源非空关键词自动搜索、完整来源菜单、海报回退与错误重试。
- 清空片单二次确认及服务器权威更新、完整长片名、授权观众 play-movie 切片、房主自动续播到下一部且末项停播。
- 弹幕 dandanplay/protobuf JSON 与 UTF-8 请求体限额，在线连续添加与实际轨道已添加标记；PGS 同步 PNG bitmap 校验及内容画布比例显示。
- 网易云 Cookie 登录/用户主动复制、默认音乐页、B站末尾推荐续播和房间讨论；保留私人 FM 与 build 16 的一次性同步回执。
- 自动/自定义服务器 URL、原生无凭据 HTTPS 探测和同端口明文证据回退；证书错误不自动降级；Socket.IO 的子路径前缀配置为传输 path。

## 🐛 错误修复 / Bug Fixes

- 本机测试服务器的相对 /api 地址可使用用户指定的本机服务器；其他来源的 loopback 仍拒绝，广播地址仍规范化为相对 API。
- Emby/Jellyfin 观众以权威 movieId stream 播放，切集/版本清理旧请求；自己的 PUT 广播更新分集后重置控件状态，避免忙状态残留。
- 网易云业务 401 不触发本站登录清除；取消、失败和旧会话不伪装保存成功。
- 清空当前影片立即暂停，延迟状态事件不能恢复已清空来源；权限矩阵切片与 REST 片单管理权限分别判定。

## ⚠️ 破坏性改动 / Breaking Changes

- 当前语音页面不再交换旧 Socket.IO PCM/Opus 媒体帧；需要匹配服务端 LiveKit 和包含新 SDK 的开发/正式包。Expo Go、旧包仍可检查界面，但新原生功能不可用。
- 本地弹幕导入限额按计划收敛为 5 MiB / 20000 条，8/9 模式丢弃；超限拒绝保存。

## ⚡ 性能优化 / Performance Improvements

- 目录、搜索、图片、选集和语音采用取消/作用域检查；图片仅保留受限数据，不创建永久缓存。
- WebRTC 统一为 @livekit/react-native-webrtc，不保留两套 WebRTC 二进制依赖。ScreenShare 仍有原生能力检查。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 更新三端维护文档和 CHANGELOG。保持 RN / src/platform / ArkWeb 生成资源边界。
- 固定 LiveKit RN 3.0.0、WebRTC 144.2.0、插件 1.0.3、livekit-client 2.22.3；通过 expo install 安装，锁文件同步。
- Go 来源 manifest 锁定客户端提交 `40471c9eecc7c3651908dc027388480895a94ec3`，12 个生产 Go/模块/许可文件逐个验证 SHA-256 与 Git 内容。新增/缺失/改动来源均失败关闭。
- Expo 的版本检查推荐 57.0.27 等补丁，但包解析返回 ETARGET，已恢复可用 SDK 57.0.26 基线并校准锁文件；未假称所有原生依赖已完成兼容验证。

## 验证证据与边界

| 项目 | 本轮结果 |
| --- | --- |
| 纯逻辑测试 | 88/88，通过；覆盖旧行为及 PGC、媒体库身份/顺序/取消、权威空源、权限、LiveKit token、弹幕限额、PGS PNG、来源篡改、HTTPS 探测 |
| lint / typecheck | 通过 |
| expo config | SDK 57.0.0 配置可解析，新插件可发现；不生成原生目录 |
| Metro iOS 开发 bundle | HTTP 200；仅证明 JS 依赖可打包，不是 IPA 或原生模块测试 |
| Web iPhone 布局 | 320×760、393×852；长标题、来源菜单、番剧切源保留词并自动查询、媒体库整季添加检查 |
| Web iPad 布局 | 1024×768；整季卡从 1/2 切至 2/2，加载真实版本 ID 选项，1080P→720P、清空取消/确认后权威 0 部检查 |
| 测试服务 | 仅本机隔离 UI fixture，临时测试用户/房间/媒体；无 NAS SSH、无运行中服务端修改。此 fixture 不证明真实 Emby/Jellyfin 或服务端全流程 |
| 原生构建 / 设备 / 真实跨端 | 本轮未做，依用户要求不构建 |

本地 UI 截图位于 `.ui-validation/ios-20261012/iphone-anime.jpg`、`ipad-versions.jpg`。测试夹具仅用于开发验证，目录被 Git 忽略，不发布为产品功能。Expo Go 可预览 RN 控件，不将“缺少原生模块”提示误判为新 IPA 的运行结果。

本轮未实施完整自签证书例外传输通道与后台独立业务 Socket。原生 LiveKit/VLC/音频中断、PGC 会员正片、Emby/Jellyfin 真实 HLS master/variant/segment/key 与 Range/seek、跨端语音、ASS/PGS 真机解码和 iPad 物理旋转均留待下一阶段；旧 build 16 的设备结论不延伸到本轮。

---
**完整变更记录**：本地 Git 源码检查点；未推送 GitHub、未生成新标签或 Release。下一次用户授权构建时递增版本/buildNumber，集中验证原生依赖、更新本记录并本地提交。

参考官方资料：[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)、[LiveKit Expo](https://docs.livekit.io/transport/sdk-platforms/expo/)、[Socket.IO path 与 namespace](https://socket.io/docs/v4/client-options/#path)。
