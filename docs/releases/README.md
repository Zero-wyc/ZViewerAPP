# GitHub Release 附件约定

从 `client-v1.2.1-b122` 起，双端 Release 的安装附件仅提供 Android APK 与 HarmonyOS HAP；继续提供对应标签的源码 ZIP 和 SHA-256 校验文件。正式上架所需 APP 文件保存在本地构建产物或发布后台，不作为 GitHub Release 附件。

当前双端正式发布为 [`client-v1.5.0`](client-1.5.0.md)，Android/HarmonyOS 均为 1.5.0 / 150。iOS 另行发布 1.5.0 / b15 未签名 IPA，用户已确认真机 UI 通过，详见 [iOS 记录](ios-1.5.0-15-unsigned.md)。上一版记录见 [1.3.5](client-1.3.5.md)。

独立 iOS Release 使用 ios-v1.5.0 标签，提供未签名 IPA、对应提交源码 ZIP 和 SHA256SUMS.txt；保留双端既有标签与附件。由于 Expo Build 的额度限制，iOS 端更新与错误修复会出现延迟，不会与 Android/鸿蒙两端同步完成（除非有人有 Mac 帮忙编译）。
