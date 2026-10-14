# iOS 1.9.0 / build 26 构建与核验

日期：2026-10-14。按用户授权在 Mac 本地构建独立 iOS Release，发布标签为 `ios-v1.9.0`。Android/HarmonyOS 维持 1.8.6；历史标签及附件保留。

## 产物

- 文件：`ZViewer-iOS-1.9.0-release.ipa`，47,127,566 bytes。
- SHA-256：`a58f82dd9f7573160a7a5145d2f61ba61ce361536d6f0b7f2f5f9891a9e06b41`。
- 应用：`com.zviewer.mobile`，1.9.0 / 26，最低 iOS 16.4，支持 iPhone / iPad。
- Mach-O：ARM64，LC_BUILD_VERSION 为 iOS device；未签名、未加密，无 provisioning profile。
- 生产 JS：6,348,784 bytes，内置 Hermes Release bundle，启动无需 Metro。检查确认包含本轮弹幕类型、方向按钮和音乐菜单模块，未包含隔离 fixture / 私有 Debug 配置标记。
- 包含 VLCKit、LiveKit WebRTC、B站 / 语音 / 系统媒体原生桥及后台 audio 声明。Go 来源保持固定参考 `02f62f1fc52f0c47f2a2f8e6fec8ed22d98539fc`，12 份源码、摘要与许可证核验通过。
- 机器可读的完整包检查：[IPA inspection](ios-1.9.0-26-ipa-inspection.json)。

## 检查结果

- `npm run check`：原生补丁 / 来源检查、lint、TypeScript 和 227 项测试通过。
- Expo CNG 重新生成设备工程、CocoaPods 安装、`build-unsigned-ios.sh` 的 Xcode Release device build 成功；原生桥链接、VLC 事件配置、设备架构与签名状态检查通过。
- 界面对齐、投屏全屏与刷新、方向按钮、房间设置、音乐菜单互斥、四类弹幕开关及对齐均有 iOS 模拟器检查记录。阶段性浏览器检查包括播放 / 投屏 49 项、房间设置 31 项、弹幕 / 音乐菜单 81 项；最后两项入口 / 对齐微调另经原生模拟器及 lint / TypeScript 确认。详见 [界面对齐记录](../ios-player-share-ui-20261014.md)。
- 本轮没有执行真实跨端 WebRTC / OBS、语音听感 / 蓝牙、硬件解码、锁屏系统按钮或后台自然跨曲专项；不将本地 fixture、单测与包检查扩大为完整真机验收。

## 分发

公开附件为未签名设备 IPA 与 `SHA256SUMS.txt`，安装时需个人证书和设备授权后侧载。源码通过同一发行提交的 GitHub 标签自动归档，不额外上传源码 ZIP。生成工程、Pods、调试会话、缓存、私钥和 IPA 均不进入 Git 源码。

[iOS 1.9.0 Release](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/ios-v1.9.0) · [发行说明](ios-1.9.0-release-notes.md)
