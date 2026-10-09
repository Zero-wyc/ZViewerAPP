## 🚀 新特性 / Features

- 本次为 Android / HarmonyOS 1.7.1（171）问题修复版本。

## 🐛 错误修复 / Bug Fixes

- 修复 Kazumi 多级 HLS 相对子清单、分片、初始化片段和密钥的代理地址，避免重复代理服务器 API，保留片源要求的请求头。
- 修复私有连接通道中媒体认证 token 的附加位置；仅向所选服务器 API 发送认证信息。
- 修复切换影片后重复恢复首次进房的旧进度和暂停状态。
- 配套服务端修复已提交 [Zero-wyc/ZViewer #11](https://github.com/Zero-wyc/ZViewer/pull/11)：权限矩阵查询、浏览器房主接收观众切片，以及网页 HLS 与进度恢复问题。

## ⚠️ 破坏性改动 / Breaking Changes

- 无客户端破坏性改动。浏览器房主与 App 观众完整切片修复需要服务端同时更新 PR #11 的前端和后端，并刷新房主网页；仅安装 App 无法修复旧服务端逻辑。
- Kazumi 仍需在设置中手动启用。本次不包含 iOS 更新。

## ⚡ 性能优化 / Performance Improvements

- 消除 HLS 对服务器代理地址的重复封装，减少错误请求和失败重试。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 更新安卓、鸿蒙维护文档与本地联调记录；31 项适配测试、4 项媒体回归通过。
- 双端模拟器分别验证《成神之日》1–3 集实际解码、播放时间推进、浏览器房主切片同步和切回原影片；用户确认双端测试通过并授权发布。正式包沿用既有发布证书，未改动 NAS 部署。
- Release 提供正式签名 APK、HAP 和 SHA256SUMS.txt；源码已同步 main，使用 GitHub 自动生成的 Source code (zip / tar.gz)，不再单独上传源码 ZIP。发布源码排除 AGENTS.md、测试凭据和签名私钥。

---
**完整变更记录**：[client-v1.7.0...client-v1.7.1](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v1.7.0...client-v1.7.1)
