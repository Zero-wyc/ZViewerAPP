# ZViewer-client 1.2.1 build 122 — Android / HarmonyOS

发布标签：`client-v1.2.1-b122`。

## 安装包

- Android：`ZViewer-Android-1.2.1-release.apk`，与原 Android 1.2.1 正式版相同，versionCode 121。
- HarmonyOS：`ZViewer-HarmonyOS-1.2.1-b122-release.hap`，versionName 1.2.1、versionCode 122，最低兼容 HarmonyOS 6.1.0（API 23），目标 API 26。
- `ZViewer-client-1.2.1-b122-source.zip`：本标签的完整 Git 源码快照。
- `SHA256SUMS.txt`：上述附件的 SHA-256 校验值。

## 修复与验收

- 修复鸿蒙 6.1 设备安装时提示 SDK 版本过低：将 `compatibleSdkVersion` 从 26 降至 23，保留 API 26 编译和目标版本。
- 连接的 ALN-AL10 真机为 HarmonyOS 6.1.0.135、API 24。用户确认兼容版真机测试通过。
- 构建号由 121 提升至 122，以支持覆盖升级；Android 安装包未重新构建。
- Release HAP 经过签名验证。自行侧载时仍须满足设备对测试签名或分发来源的要求；直接 `hdc install` Release 签名曾返回来源不受信任（9568322），这是独立于 SDK 版本的限制。
- 旧 `client-v1.2.1` Release 保留为历史版本；本标签包含最新兼容源码。
