# ZViewer 1.6.0 · Android / HarmonyOS 新服务端适配

发布日期：2026-10-04。Android 与 HarmonyOS 版本均为 **1.6.0 / 160**，适配服务端 `9827929`（v4.3.7 后 4 个提交）。

**iOS 目前尚未适配本次新版本服务端，尤其是 LiveKit 语音协议。本次不发布 iOS 安装包；源码归档中的 iOS 工程仍为既有版本，不包含此次适配。**

## 🚀 新特性 / Features

- Android / HarmonyOS 接入 LiveKit 房间语音，支持成员管理、管理员禁言与踢出，保留原生麦克风权限、音频路由和收起面板后的会话。
- 新增 PGS 位图字幕解码与定位显示，保留文本字幕及设备设置。
- 支持导入 B站 XML/JSON 与 dandanplay JSON 本地弹幕；鸿蒙接入系统文件选择器。文件上限 5 MiB、最多 20000 条。
- 新增网易云 Cookie 登录和主动读取/复制，保留扫码登录。

## 🐛 错误修复 / Bug Fixes

- 修复离房、切服、被踢、连接失败和过期异步操作的语音资源释放；管理员解禁尊重用户主动闭麦，自动播放受阻时支持点击恢复。
- 修复 MKV 压缩元数据、视频 CueTrack 选择、AAC priming、实际采样率与尾部裁剪，改善字幕和音画定位。
- 房间弹幕上传失败回滚并明确反馈，权限拒绝不再误报成功；上传 JSON 超过服务端 1 MiB 限制时提前提示。
- 网易云业务鉴权错误与会话过期区分，关闭 Cookie 弹窗后清空临时值；移除尚未实现的音乐下载/本地管理 Tab。

## ⚠️ 破坏性改动 / Breaking Changes

- **语音需要部署 LiveKit 的新服务端；不兼容旧 v4.2.1 语音协议。** 房间基础业务仍使用 Socket.IO。域名访问还需服务端正确配置 LiveKit 的反向代理和媒体网络。
- 同账号使用相同 identity，第二台设备加入语音会顶替第一台设备并提示。
- **iOS 尚未适配新服务端，本次适配仅覆盖 Android / HarmonyOS。**
- HarmonyOS 兼容 API 23（HarmonyOS 6.1）及以上，Android 最低 API 24；沿用既有发布签名与应用标识。

## ⚡ 性能优化 / Performance Improvements

- 删除旧语音处理器、独立媒体 Socket 和旧多实例检测，统一由 LiveKit 管理媒体连接。
- 去重远端订阅并统一清理音频资源；PGS 按顺序保留解码状态。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 升级 `livekit-client` 至 2.22.3，锁定 playsvideo 0.4.7 并提供可重现补丁；保留源码中的 `vendor/mediabunny`。
- 同步 Android / HarmonyOS 维护文档、适配方案、发布流程与许可证。安装依赖请运行正常的 `npm ci`，不要跳过 postinstall。
- 18 项共享自动回归、TypeScript/Vite 构建及双端 Release 构建通过，APK/HAP 签名验证通过。双端原生联调已验证媒体传输、语音管理、XML 选择、弹幕广播和测试字幕；**用户已确认鸿蒙通过域名在纯外网可连接语音**。
- 蓝牙/耳机、后台锁屏通话、首次拒绝权限后重试、真实长片完整播放/seek、有效网易云 Cookie 等场景仍待单独验收；详见仓库中的 `docs/releases/client-1.6.0-adaptation.md`。

本次附件：`ZViewer-Android-1.6.0-release.apk`、`ZViewer-HarmonyOS-1.6.0-release.hap`、`ZViewer-client-1.6.0-source.zip`、`SHA256SUMS.txt`。

---

**完整变更记录**：[client-v1.5.0...client-v1.6.0](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v1.5.0...client-v1.6.0)
