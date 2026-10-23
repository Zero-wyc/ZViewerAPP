# ZViewer-Client V2.1.10

本版统一提供 Android、HarmonyOS 和 iOS 安装包。安卓 / 鸿蒙重点修复内网服务器连接，iOS 重点修复一起听的切歌、进度定位和关联视频播放。

| 平台 | 当前安装包 | 安装要求 |
| --- | --- | --- |
| Android | [2.1.10（220）APK](https://github.com/Zero-wyc/ZViewerAPP/releases/download/client-v2.1.10/ZViewer-Android-2.1.10-release.apk) | Android 7.0 / API 24 起，64 位设备，正式签名。 |
| HarmonyOS | [2.1.10（220）HAP](https://github.com/Zero-wyc/ZViewerAPP/releases/download/client-v2.1.10/ZViewer-HarmonyOS-2.1.10-release.hap) | HarmonyOS 6.1 / API 23 起，按设备支持的开发者安装流程安装，签名与授权需匹配。 |
| iOS / iPadOS | [2.1.10（build 31）未签名 IPA](https://github.com/Zero-wyc/ZViewerAPP/releases/download/client-v2.1.10/ZViewer-iOS-2.1.10-31-unsigned.ipa) | iOS / iPadOS 16.4 起，需自行签名后侧载；内置运行资源，无需连接开发电脑。 |

安卓 / 鸿蒙安装包沿用 10 月 22 日发布的构建；iOS build 31 于 10 月 23 日补充到本 Release。

## 🚀 新特性 / Features

- iOS 新建房间默认开启“自动通过播放控制申请”，一起看、一起听均可在房间设置中关闭。它与入房审批分开控制。
- iOS 按账号权限和设备实际解码能力提供 B站画质，通过硬件探测的设备最高可提供 4K 30fps SDR；HDR、杜比、AV1 和 60fps 暂未开放。

## 🐛 错误修复 / Bug Fixes

- **Android / HarmonyOS：** 修复内网地址检测成功后仍无法登录、开启证书例外后误报 502 的问题。只输入 `IP:端口`、使用自动模式，即可识别 HTTP / HTTPS 并连接房间。
- **Android / HarmonyOS：** 补齐登录、接口、媒体和房间连接的通道处理，以及断开、切换服务器后的清理，减少连接状态不一致。
- **iOS：** 修复一起听 B站歌曲切换或拖动进度后停住的问题，保留暂停状态和实际播放进度。
- **iOS：** 修复关联视频反复暂停追赶、切歌后画面不连续的问题；按原比例显示完整画面，比例不同时留黑边。
- **iOS：** 修复本机 B站登录状态恢复、画质切换失败后的状态保留，以及播放控制申请的处理。开启自动通过时，操作成功后再向申请者确认。

## ⚠️ 破坏性改动 / Breaking Changes

- 无新增破坏性改动，各平台最低系统要求见上表。
- iOS 提供的是未签名 IPA，需要自己的有效签名及设备授权，当前不通过 App Store / TestFlight 分发。
- 当前三端完整源码请使用 [main 分支](https://github.com/Zero-wyc/ZViewerAPP/tree/main) 或 [main 源码 ZIP](https://github.com/Zero-wyc/ZViewerAPP/archive/refs/heads/main.zip)。原发布标签保留安卓 / 鸿蒙发布时的快照，Release 底部自动生成的标签源码压缩包不包含后续 iOS 修复。

## ⚡ 性能优化 / Performance Improvements

- 登录复用已经确认的服务器地址和连接通道，减少重复检测；修改地址或连接选项后重新检测。
- iOS 一起听减少重复播放、暂停和定位命令，轻微音画偏差采用平滑校正，减少反复缓冲。
- iOS 缓存解码能力探测结果，减少重复解析时的等待。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 重写 README，统一版本、安装方式、功能入口和源码下载说明；补齐 iOS 回传源码、维护文档与构建记录。
- iOS build 30 已收到用户“测试通过”的反馈；build 31 在相同播放与房间逻辑上统一版本号并重新构建，macOS 检查与安装包检查通过。具体范围见 [iOS 验收记录](https://github.com/Zero-wyc/ZViewerAPP/blob/main/docs/ios-macos-development-status.md) 和 [build 31 构建记录](https://github.com/Zero-wyc/ZViewerAPP/blob/main/docs/evidence/ios-device-ipa-31-2026-10-23.json)。
- 安卓 / 鸿蒙的内网登录、房间连接与安装包检查见 [连接验证记录](https://github.com/Zero-wyc/ZViewerAPP/blob/main/docs/lan-connection-fix-20261022.md)。模拟器、用户测试和安装包检查按各自范围记录。
- iOS 使用已构建验证的 VLCKit `4.0.0a25`；安卓 / 鸿蒙依赖沿用原发布配置。校验文件复用构建时生成的 `SHA256SUMS.txt` 和 `SHA256SUMS-iOS-2.1.10-31.txt`。

---
**完整变更记录**：[Android / HarmonyOS：2.1.9 → 2.1.10](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v2.1.9...client-v2.1.10) · [iOS 后续更新及源码补齐](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v2.1.10...main)
