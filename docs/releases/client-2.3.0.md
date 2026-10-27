# ZViewer-Client V2.3.0

Android / HarmonyOS 更新为 **2.3.0（230）**。本版合并此前本地 2.2.8；iOS 保持 2.1.10 / build 31。

## 🚀 新特性 / Features

- 一起看与投屏均支持左侧上下滑调节当前 App 窗口亮度，投屏的 WebRTC、OBS/FLV 均支持右侧上下滑调节本机播放器音量；显示百分比提示，普通窗口与全屏均可用。
- 亮度支持 5%–100%，全屏切换保留，离开播放器恢复原有亮度策略；音量支持 0–100%，与静音按钮同步。
- 一起看单击视频隐藏/显示控制栏，左侧双击后退 15 秒、右侧前进 15 秒、中部播放/暂停；横向拖动预览进度、松手跳转。移除旧隐藏控制栏按钮。

## 🐛 错误修复 / Bug Fixes

- 关闭播放器内置触摸跳转，避免与自定义手势重复执行；控制栏、设置面板和画中画保留各自交互，投屏直播不触发进度跳转。
- 取消手势、换片、切换播放器和退出时清理待定操作，避免迟到请求改变播放或覆盖其他播放器的亮度；观众继续使用原有播放控制申请。
- 兼容新 Go 网易云接口的 message / msg 错误，隔离云盘登录错误，区分临时 503 与旧版明确的服务不可用状态。

## ⚠️ 破坏性改动 / Breaking Changes

- 无新增破坏性改动。最低系统要求与签名身份沿用现有版本：Android 7.0 / API 24、HarmonyOS 6.1 / API 23。

## ⚡ 性能优化 / Performance Improvements

- 亮度请求串行处理并跳过被新请求取代的写入，减少持续滑动的无效调用；横向进度拖动在松手时提交一次。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 更新 Android / HarmonyOS 维护文档、手势验收记录、README 和 CHANGELOG；依赖未变，iOS 未修改或构建。
- 106 项自动回归、TypeScript/Vite、双端签名构建通过；真实播放器组件完成 MP4、MediaStream 和 HTTP-FLV 解码及手势检查。用户已确认上一版一起看手势通过；新增亮度在浏览器验证到原生桥边界，没有新增真机背光、触摸或听音验收。
- 提供签名 APK、HAP 与构建时生成的 SHA256SUMS.txt。源码提交 main，使用 GitHub 自动生成的源码归档。

---
**完整变更记录**：[client-v2.2.7...client-v2.3.0](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v2.2.7...client-v2.3.0)
