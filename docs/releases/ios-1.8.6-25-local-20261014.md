# iOS 1.8.6 / build 25 Mac 本地交付

日期：2026-10-14。此记录描述在 Mac 本地构建设备 Release IPA；真实公开上传状态另见 [client-v1.8.6 发布回执](client-1.8.6-publication.json) 和 GitHub Release 页面。

## 构建与产物

- 工具链：macOS Apple Silicon、Xcode 27.0、iOS SDK 27.0、Node 24、CocoaPods 1.16.2；本机 IPA 使用 Release 配置，无 EAS 云构建。
- 应用：`com.zviewer.mobile`，版本 1.8.6 / build 25，最低 iOS 16.4，iPhone/iPad；device arm64，非 simulator slice。
- IPA：`ZViewer-iOS-1.8.6-release.ipa`，47,101,914 bytes，SHA-256 `ccfbd670a2a7e56ceb4cd86b7bbe3f56414882afaeb1a155f039165519786e33`。
- Bundle 内含 6,301,428-byte Release `main.jsbundle`、VLCKit、LiveKit WebRTC、Bilibili 和语音原生桥、后台 audio 声明及 Go 原生来源/许可证摘要；无签名、无 provisioning profile，未加密。侧载需使用自己的证书和设备授权签名。
- 固定 Bilicore 来源通过 `02f62f1fc52f0c47f2a2f8e6fec8ed22d98539fc` 与逐文件 SHA-256 校验；Go 压缩包经固定摘要核验。设备 Opus ARM64 与 macOS 宿主 smoke test 通过。

## 验证范围

- `npm run check`：199 项测试、lint、TypeScript 通过。
- Xcode Release device build 成功；应用与 VLCKit 的原生桥及事件配置引用检查通过。
- 离线 IPA 检查确认 arm64 / iOS device platform、版本与 build、Release JS、预期 framework、bundle ID 及未签名状态。
- 模拟器实际验证 B站与 Kazumi《败犬女主太多了！》播放/暂停/恢复/观众跳转、Jellyfin 动漫剧集播放与 seek 恢复、iOS 单独房主的网易云曲尾自动切歌；详细场景见 [Mac 开发记录](../ios-mac-development-20261014.md)。

模拟器结果不代表真机硬件解码和物理设备体验已通过。系统媒体/后台切歌还有清楚的验收边界：锁屏或控制中心媒体按钮、后台自然播完自动切歌及长时间后台房间同步尚未通过端到端验证。

本地构建输入和原件保留于 `ZV-iOS/ios/build/ZViewer-unsigned.ipa`，可分发副本为 `ZV-iOS/release-assets/ZViewer-iOS-1.8.6-release.ipa`；生成的工程、Pods、缓存、设备包与私有调试会话均由 `.gitignore` 排除，不进入源码提交。
