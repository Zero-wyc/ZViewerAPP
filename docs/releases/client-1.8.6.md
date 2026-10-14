# ZViewer-Client V1.8.6

**本次仅发布 Android / HarmonyOS，版本 1.8.6 / 186。iOS 1.8.6 / build 25 仍存在同步问题，按用户要求暂缓发布，本次不包含任何 IPA 附件。** 完整源码同步 main，iOS 候选源码保留供后续修复，不代表 iOS 已通过验收。

## 🚀 新特性 / Features

- 安卓、鸿蒙主页新增“关于应用”，显示实际安装版本与构建号，可手动检查更新及查看发布记录。
- 每次启动自动检查正式客户端版本，发现更新后提示下载对应 APK/HAP；通过系统浏览器下载，不静默安装。
- 关于与更新界面跟随深浅主题、圆角和玻璃外观设置，适配手机、平板和横竖屏。

## 🐛 错误修复 / Bug Fixes

- 更新检查按数字比较版本，仅匹配当前平台正式安装包，排除预发行、debug/unsigned、iOS 独立标签和源码附件。
- 手动检查提供离线、超时及限流反馈，检查失败不误报为最新版。
- iOS 同步问题仍未解决，候选修复仅保留在源码，本次不将其列为已验收修复。

## ⚠️ 破坏性改动 / Breaking Changes

- 安卓、鸿蒙无破坏性改动，沿用既有发布签名。鸿蒙 HAP 仍需使用设备支持的开发者安装流程及匹配的 Profile/设备授权。
- 本次 Release 不提供 iOS 安装包；历史公开 IPA 仍在 1.8.5 Release，不扩大此前测试结论。

## ⚡ 性能优化 / Performance Improvements

- 同一启动周期避免重复自动检查提示；请求设有超时，未发现更新时不弹出提示。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 更新 README、CHANGELOG 和三端维护文档，明确双端发布与 iOS 暂缓状态；本次沿用已验证签名包，没有重新构建 iOS。
- 附件仅为 `ZViewer-Android-1.8.6-release.apk`、`ZViewer-HarmonyOS-1.8.6-release.hap` 和双端 `SHA256SUMS.txt`。
- 完整源码同步 main，使用 GitHub 自动生成的 Source code（zip / tar.gz），不另上传源码压缩包。源码与包不包含私有账号、密码或 AGENTS.md。
- 验证：76 项适配、4 项媒体、3 项更新回归、5 种尺寸深浅主题界面，以及版本、签名、证书和共享资源摘要检查通过。构建与浏览器验证不代替物理设备专项验收。

---
**完整变更记录**：[client-v1.8.5...client-v1.8.6](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v1.8.5...client-v1.8.6)
