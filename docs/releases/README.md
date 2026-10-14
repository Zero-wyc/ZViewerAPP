# GitHub Release 附件约定

2026-10-14：独立 iOS **1.9.0 / build 26** 使用 `ios-v1.9.0` 标签，提供设备 Release 未签名 `ZViewer-iOS-1.9.0-release.ipa` 与 `SHA256SUMS.txt`，源码使用标签自动归档；见 [发行说明](ios-1.9.0-release-notes.md) 和 [构建核验](ios-1.9.0-26-validation.md)。Android/HarmonyOS 当前为 `client-v1.8.6`。以下保留各版本当时的记录。

默认双端 Release 的安装附件为签名 Android APK、HarmonyOS HAP 和 `SHA256SUMS.txt`。源码使用 GitHub 自动生成的 Source code（zip / tar.gz），不再单独打包上传源码 ZIP。正式上架所需 APP 文件保存在本地构建产物或发布后台，不作为 GitHub Release 附件。

历史联合客户端正式发布为 [`client-v1.5.0`](client-1.5.0.md)，Android/HarmonyOS 为 1.5.0 / 150，iOS 为 1.5.0 / b15 未签名 IPA。用户已确认 iOS 真机 UI 通过，iOS 附件追加在同一 Release，详见 [iOS 记录](ios-1.5.0-15-unsigned.md)。上一版记录见 [1.3.5](client-1.3.5.md)。

当前双端 Release 为 [`client-v1.8.0`](client-1.8.0.md)，Android/HarmonyOS 版本 **1.8.0 / 180**，对齐服务端 v4.5.3，公告不加入客户端。原签名 APK、HAP 与双端摘要保留，`SHA256SUMS.txt` 已更新为三平台校验文件。

2026-10-13：按用户明确授权，iOS **1.8.0 / build 18** 未签名 IPA 已构建并补充到现有 `client-v1.8.0` Release，远端回读确认 APK、HAP、IPA 和 `SHA256SUMS.txt` 共 4 个附件；实际包检查与发布结果见 [iOS build 18 验证记录](ios-1.8.0-18-validation.md)。本次追加不改变默认双端附件约定，安装 IPA 仍需自行签名。独立 `ios-v1.5.1` Release 为历史 iOS 发布。

原 `client-v1.8.0` 标签保留在 `534e537`；Release 自动生成的 Source code（zip / tar.gz）始终对应该双端发布快照，不包含随后提交的 iOS 修复。本次 iOS 源码检查点 [`0146c1f`](https://github.com/Zero-wyc/ZViewerAPP/commit/0146c1f) 已推送至 [main](https://github.com/Zero-wyc/ZViewerAPP/tree/main)；[main 源码归档](https://github.com/Zero-wyc/ZViewerAPP/archive/refs/heads/main.zip)随分支更新，不能作为原标签快照的别名。不另行打包上传源码 ZIP。

由于 Expo Build 的额度限制，iOS 端更新与错误修复会出现延迟，不会与 Android/鸿蒙两端同步完成（除非有人有 Mac 帮忙编译）。
