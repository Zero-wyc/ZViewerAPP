# ZViewer-Client V2.1.3

Android / HarmonyOS 2.1.3 / 213，本地构建，尚未发布 Release。验证范围与真机限制见 [交付记录](../client-2.1.3-validation.md)。

## 🚀 新特性 / Features

- 无新增独立功能。

## 🐛 错误修复 / Bug Fixes

- 修复 Android 13 及以下投屏过程中横竖屏保持初始方向；同步更新原采集 Surface、虚拟显示与 WebRTC 输出，支持宿主退到后台和连续旋转。
- 鸿蒙增加原生屏幕尺寸/方向通知，在原采集轨道调整宽高约束，保持原授权、音频和连接；停止后丢弃旧事件。
- 保留 Android 14+ 实际被采集区域的尺寸回调，避免单应用共享错误使用全屏尺寸。

## ⚠️ 破坏性改动 / Breaking Changes

- 沿用 2.1.2 的媒体库 HLS 服务端 v4.6.4 最低契约，无新增协议变化。

## ⚡ 性能优化 / Performance Improvements

- 合并快速旋转的更新，只执行最新尺寸；无需重复申请屏幕权限、重开采集或重建观众连接。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 同步 Android/HarmonyOS 维护文档与实测记录；184 项适配和 4 项媒体测试通过。
- HarmonyOS 最低 SDK 保持 6.1.0(23)，iOS 不修改、不构建。

---
**完整变更记录**：本地 Git 从 `16afdd8` 到本次修复提交；本轮未创建发布标签。
