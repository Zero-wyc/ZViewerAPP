# iOS 1.5.0 / build 15 未签名交付

2026-10-02。用户已确认 iOS 真机 UI 检测通过，授权 EAS unsigned-device 构建及 GitHub iOS Release。版本与 Android/鸿蒙 1.5.0 对齐。

构建前复核：70 单测、lint/typecheck 通过；Expo Doctor 20/21，保留 react-native-webrtc New Architecture 未测试与 zviewer-native 缺目录元数据提示。共享 Go 9 个来源文件与 client-v1.5.0 固定提交一致，原生源码在云端重建。

此记录将在构建完成并检查 IPA 后补齐构建 ID、SHA-256、包结构和发布附件。UI 验收不替代实际音视频/语音及后台矩阵；I13 独立业务 Socket 尚未完成。

由于 Expo Build 的额度限制，iOS 端更新与错误修复会出现延迟，不会与 Android/鸿蒙两端同步完成（除非有人有 Mac 帮忙编译）。
