# ZViewer-client 1.2.1 — Android / HarmonyOS

发布日期：2026-09-29。Release 标签：`client-v1.2.1`。

## 安装包

- Android：`ZViewer-Android-1.2.1-release.apk`，沿用已发布的 Android 1.2.1 正式包，SHA-256 与原 Release 一致。
- HarmonyOS：版本 1.2.1，versionCode 121，包名 `com.zviewer.mobile`，目标与最低兼容 API 26。
- `ZViewer-HarmonyOS-1.2.1-release.app.zip`：解压后获得 Release 签名 APP，用于鸿蒙发布流程；GitHub 不允许直接上传 `.app` 扩展名。
- `ZViewer-HarmonyOS-1.2.1-release.hap`：Release 签名模块包，用于支持相应签名分发方式的设备安装。GitHub 下载不等于应用市场上架，安装仍受设备与签名分发策略限制。
- `SHA256SUMS.txt`：附件完整性校验。

## 鸿蒙更新

- 交付 ArkTS / ArkWeb 原生宿主、手机全面屏与显示控制、生命周期及麦克风接入。
- 支持房间播放、MP4 / MKV、字幕、弹幕与按房间权限切换片源。
- 修复 B 站扫码凭据获取、画质列表与本地媒体代理。
- 修复 1080P 高码率 CDN 参数及 Range 响应头/数据到达顺序问题，避免媒体分片开头丢失。
- 鸿蒙应用版本与 Android 对齐为 1.2.1。

## 验证与范围

- 先前手机模拟器验收及回归记录见 `harmonyos-0.1.0-14.md`；本次只调整版本并制作 Release 包，不重复播放验收。
- 本次 Release assembleApp 构建成功，独立 HAP 与 APP 外层签名验证通过，共享层单元测试 6/6 通过。APP 内的 HAP 未独立签名；设备安装请使用单独提供的签名 HAP。
- 平板、实体设备来电和蓝牙专项测试未在本次发布中新增验证。
- Android 二进制保持原 v1.2.1 发布基线；本标签源码还包含后续共享层与鸿蒙实现，不代表重建了 Android 包。
- 私有签名材料与本机签名配置不随源码发布。自行构建时在 DevEco Studio 配置自己的签名。
- 原 Android `v1.2.1` 标签与 Release 保留；本次双端源码基线使用新标签 `client-v1.2.1`。
