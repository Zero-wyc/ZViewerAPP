# ZViewer-Client V2.2.7

Android / HarmonyOS 更新为 **2.2.7（228）**。iOS 保持 2.1.10 / build 31。

## 🚀 新特性 / Features

- OBS 观看连接失败时显示具体原因，并提供“重新连接”入口。

## 🐛 错误修复 / Bug Fixes

- 修复观众端显示“推流密钥未获取”而无法观看 OBS 直播的问题。客户端使用房间准入后的独立观看票据，不再依赖房主发布密钥或其长度。
- 修复重新连接、切换房间或服务器、退出后旧请求恢复播放的问题；观看地址绑定目标房间与当前连接，不回退到发布码地址或通用代理。
- 合并 2.2.6 本地验证版：完善 Emby/Jellyfin 海报的当前连接取图与续签，规范网易云头像、歌单和搜索图片。
- 服务器文件按影片身份校验房间准入；字幕权限失败、格式错误或超过 2 MiB 时提示并保留原字幕。

## ⚠️ 破坏性改动 / Breaking Changes

- OBS 观看及资源访问需配套更新后的 ZViewer 服务端。旧客户端按发布码拼接 FLV 地址的方式不再受支持，请覆盖安装新版。
- OBS 房主发布密钥恢复为八位；仍在使用上一轮 32 位配置的房主需重新下载 OBS 配置。观众无需获取或填写发布密钥。
- 最低系统与签名要求不变：Android 7.0 / API 24、HarmonyOS 6.1 / API 23，沿用既有发布签名。

## ⚡ 性能优化 / Performance Improvements

- 海报按期限与前台状态续签，仅更新封面，不覆盖当前播放状态；废弃旧观看请求，避免无效加载与多余连接。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 更新 README、CHANGELOG、Android / HarmonyOS 维护文档及资源合同记录，依赖不变。
- 83 项维护回归、TypeScript/Vite、双端 Release 签名构建与内置网页资源检查通过；实际观看组件完成准入拒绝、批准、重试与直播解码。用户已确认 OBS 发布端和客户端复测通过，未将其扩大为所有设备或公网场景验收。
- 提供正式签名 APK、HAP 与构建时生成的 `SHA256SUMS.txt`。源码更新至 [main](https://github.com/Zero-wyc/ZViewerAPP/tree/main)，使用 GitHub 自动生成的源码归档。
- 服务端 OBS 握手和八位密钥修复见 [PR #35](https://github.com/Zero-wyc/ZViewer/pull/35)。iOS 本次未修改或构建，继续使用 [2.1.10 Release](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v2.1.10)。

---
**完整变更记录**：[client-v2.2.5...client-v2.2.7](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v2.2.5...client-v2.2.7)
