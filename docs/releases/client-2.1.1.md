# ZViewer-Client V2.1.1

Android / HarmonyOS 2.1.1 / 211 本地签名包交付，尚未推送或发布 GitHub Release；验证层级见 [验证记录](../client-2.1.1-validation.md)。

## 🚀 新特性 / Features

- 在“添加影片”左侧增加仅房主可见的自动连播滑块，影片结束后按片单顺序请求下一部，片单末尾停止。

## 🐛 错误修复 / Bug Fixes

- 修复初始播放状态先于片单和当前影片到达时，误判换片导致 B站持续黑屏。
- 修复窄屏评论数量白底白字，保持工具栏两种色调下可读。
- 处理默认弹幕轨道写入的权限拒绝，保留本机弹幕显示。
- 转码引擎与服务器中转统一使用相同滑块、容器和文字样式。

## ⚠️ 破坏性改动 / Breaking Changes

- 无。当前服务端没有自动连播开关同步协议，开关由房主本机控制，观众不显示；实际切片通过既有服务端事件同步。

## ⚡ 性能优化 / Performance Improvements

- 无单独性能调整；保留此前的播放器缓存、超时和平台独立解析路径。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 同步双端维护文档，增加初始化时序行为回归与窄屏/平板布局验收。
- 双端升至 2.1.1 / 211，重新构建正式签名 APK/HAP；iOS 未改动、未构建。

---
**完整变更记录**：[client-v2.0.0...main](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v2.0.0...main)（本地提交推送后可见本轮变更）。
