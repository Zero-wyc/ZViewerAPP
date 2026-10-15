# ZViewer-Client V1.9.5

发布日期：2026-10-15。Android / HarmonyOS：`1.9.5 / 195`。

## 🚀 新特性 / Features

- 投屏接收在横屏时自动进入全屏；全屏单击显示/隐藏控制栏，双击暂停/恢复本机播放。
- Android WebRTC 接入系统 Activity 画中画；系统不可用时提供应用内小窗。
- 统一 B站 SVG 账号入口：白底矩形，未登录黑色、已登录粉色；账号弹窗只把“已登录”标为粉色。
- 使用应用图标替换 Z 字标；关于入口悬浮在外观按钮上方，顶部连接状态仅显示图标。

## 🐛 错误修复 / Bug Fixes

- 移除 WebRTC 投屏批注，全屏隐藏分辨率与连接信息。
- 修复一起看更多菜单被播放器裁切；优先向下展开，空间不足时向上避让并滚动，始终保留更多按钮的点击区域。
- 修复提示、确认框及设置弹窗文字对比度不足；关于标题背景与弹窗统一，连接页底部说明使用可读卡片。
- 修复创建房间设置被关于/外观悬浮按钮遮挡，批准开关和创建按钮正常接收点击。
- 房间设置中的外观和账号入口并排显示，各有外框；连接模式下拉框与表单统一。

## ⚠️ 破坏性改动 / Breaking Changes

- 鸿蒙 WebRTC 在已解码 H.264 画面后，跨应用系统画中画仍显示白屏；按要求取消鸿蒙画中画及应用内小窗入口。
- WebRTC 观看端不再提供批注功能；无服务端协议变更。
- 本次仅发布 Android 与 HarmonyOS。iOS 仍为 1.9.0 / build 26，未构建或重新上传 IPA。

## ⚡ 性能优化 / Performance Improvements

- Android 画中画保留原 video、MediaStream 与接收连接，避免重新创建解码器；退出、离房和取消时恢复布局并清理状态。
- 旋转与菜单定位复用已有播放状态，手势排除拖动、长按、多指及按钮操作。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 同步 Android/HarmonyOS 维护文档、README 和 CHANGELOG。
- 95 项适配/媒体测试通过；浏览器覆盖双端三种视口、深浅主题、登录两态、文字对比度及弹窗层级。两个模拟器的实际 WebView/ArkWeb 已复查。
- 模拟器投屏来源为设备内真实 RTC 回环和本机测试信令；物理设备、生产房主和后台长期运行仍需专项验收。
- 正式包沿用原发布签名，提供 `SHA256SUMS.txt`；未新增运行时依赖。源码由 GitHub 自动归档，无额外源码压缩包。
- Android APK 已通过 v2 签名验证，HarmonyOS HAP 已通过 `hap-sign-tool verify-app`；双端证书与上一版一致，包内版本及网页资源核对通过。

---
**完整变更记录**：[client-v1.9.0...client-v1.9.5](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v1.9.0...client-v1.9.5)
