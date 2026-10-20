# ZViewer-Client V2.1.4

Android / HarmonyOS 同步为 **2.1.4 / 214**。本次重新构建正式签名 APK/HAP，包含此前未公开发布的 2.1.2、2.1.3 和 2.1.4 本地更新。详细证据与验收范围见 [验证记录](https://github.com/Zero-wyc/ZViewerAPP/blob/main/docs/client-2.1.4-validation.md)。

## 🚀 新特性 / Features

- 完善投屏方向适配，在同一采集、发送轨道与连接中持续处理横屏和竖屏。

## 🐛 错误修复 / Bug Fixes

- 修复安卓、鸿蒙作为观众时，B站 DASH 切换 Kazumi HLS 残留旧音轨和 CID、误用 DASH 播放器的问题；完整快照恢复兼容现有房主消息，保留切片与会话保护。
- 修复媒体库 HLS 在 v4.6.4 中的专用 stream/proxy 基址、反代前缀、子清单与分片鉴权；修复断线后的重新准入和过期应答隔离。
- 修复普通房间 owner 的排序、删除、清空与改名权限处理，保持服务端最终授权。
- 修正鸿蒙投屏旋转仍固定在初始画布的问题：在同一次原生采集中按物理屏幕比例去掉系统补边，持续输出方向正确的横屏/竖屏帧，保持原连接与音频。
- 实际送达帧提供分辨率和帧率统计，生成轨道配置帧率不可用时不显示为实测值。
- 保留 Android 2.1.3 的原生旋转修复。

## ⚠️ 破坏性改动 / Breaking Changes

- 媒体库 HLS 采用服务端 v4.6.4 最低契约；移除无效的直链/挂载中转开关，保留 Kazumi、CMS、anime 的服务器转发选项。
- 鸿蒙最低 SDK 保持 6.1.0(23)，运行时检查投屏所需帧处理能力。网页观众仍需部署服务端 [PR #22](https://github.com/Zero-wyc/ZViewer/pull/22) 中的对应修复；更新 App 不会修改旧网页资源。

## ⚡ 性能优化 / Performance Improvements

- 逐帧转交可见区域与显示尺寸，释放全部帧资源；不读像素、不使用 Canvas 定时绘制，也不额外申请采集或创建另一套编码器。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 同步两端维护文档、源码说明和验证记录；192 项适配、4 项媒体测试通过，双端模拟器实际验证 B站与 DM HLS 观众播放及切换。
- 鸿蒙旋转实现已有此前用户真机验收，本次新构建包不扩大该验收范围。
- 仅发布 Android APK、HarmonyOS HAP 与 `SHA256SUMS.txt`；源码同步 main，使用 GitHub 自动生成的源码归档。iOS 不修改、不构建、不发布。

---
**完整变更记录**：[v2.1.1...client-v2.1.4](https://github.com/Zero-wyc/ZViewerAPP/compare/v2.1.1...client-v2.1.4)
