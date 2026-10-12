# GitHub Release 附件约定

当前双端 Release 的安装附件为签名 Android APK、HarmonyOS HAP 和 `SHA256SUMS.txt`。源码使用 GitHub 自动生成的 Source code（zip / tar.gz），不再单独打包上传源码 ZIP。正式上架所需 APP 文件保存在本地构建产物或发布后台，不作为 GitHub Release 附件。

历史联合客户端正式发布为 [`client-v1.5.0`](client-1.5.0.md)，Android/HarmonyOS 为 1.5.0 / 150，iOS 为 1.5.0 / b15 未签名 IPA。用户已确认 iOS 真机 UI 通过，iOS 附件追加在同一 Release，详见 [iOS 记录](ios-1.5.0-15-unsigned.md)。上一版记录见 [1.3.5](client-1.3.5.md)。

当前双端 Release 为 [`client-v1.7.5`](client-1.7.5.md)，版本 **1.7.5 / 175**，对齐服务端 v4.5.1，公告不加入客户端。本次不更新 iOS，源码中的 iOS 工程保留既有版本。现有独立 `ios-v1.5.1` Release 为历史 iOS 发布。

由于 Expo Build 的额度限制，iOS 端更新与错误修复会出现延迟，不会与 Android/鸿蒙两端同步完成（除非有人有 Mac 帮忙编译）。
