# ZViewer 三端 1.8.5 发布验证

日期：2026-10-13。用户确认 iOS 本轮真机测试全部通过，并授权将此前安卓/鸿蒙本地更新和已验收 iOS IPA 同步发布 1.8.5，源码上传 Zero-wyc/ZViewerAPP main。

## 版本与来源

| 平台 | 实际版本 | 来源与处理 |
| --- | --- | --- |
| Android | 1.8.5 / 185 | 纳入 `7ce2de1` 房间入口/评论布局和 `48e0e5c` 全屏方向/解锁图标本地更新，统一升版后重新签名构建。 |
| HarmonyOS | 1.8.5 / 185 | 同一共享前端及既有 ArkTS 原生桥，升版、harmony:web、Hvigor 重新构建并沿用既有签名。 |
| iOS | 1.8.5 / 23 | 直接发布 EAS `4b32aadb-a320-404a-9904-3863a92e6f86` 生成、用户已验收的 IPA；不再启动构建，字节与验收包完全相同。 |

服务端功能基线保持 v4.5.3 / `9e2a0d4f3d9796067ac17274feabeccbb065d411`，本次不修改服务端/NAS。iOS 修复来源为 `30688d2`、产物检查修正 `b27b170` 和交付记录 `bd64edb`。

## 本轮核验

| 项目 | 结果 |
| --- | --- |
| Android/HarmonyOS 回归 | 76 项适配 + 4 项媒体测试通过。 |
| 网页构建/生成 | android:sync、harmony:web、TypeScript/Vite 通过；不手改生成目录。 |
| Android 原生 | Debug/Release 成功；APK 1.8.5 / 185；v2 验签、原发布证书一致；ARM64/x86_64 Go 库与本轮输入匹配；trimpath / -s -w 重构建去除 Go 和 C/NDK 的本机用户名/绝对调试路径。 |
| HarmonyOS 原生 | Debug/Release 成功；HAP 1.8.5 / 185、debug=false/release；验签及既有证书链一致；私有签名配置构建后恢复为公开模板。 |
| 双端资源 | 各 29 个共享网页文件 SHA-256 与本轮 dist 匹配；鸿蒙生成桥接入口一致；包内无 AGENTS.md/公告实现。 |
| iOS 自动核验 | 既有 179 项测试、lint/typecheck；云端两次补丁核验、完整二进制配置引用、设备 ARM64、139 项 ZIP CRC、来源/许可及构建机与下载哈希一致。 |
| iOS 用户验收 | 2026-10-13 用户明确“测试全部通过”，本轮起播卡死、B站声音和一起听退桌面/锁屏问题获通过确认；iOS 当前可用。没有新设备型号、时长或逐项日志。 |

前期 [房间界面 30 组](client-room-ui-validation-20261013.md) 和 [旋转桥接 8 组](client-fullscreen-orientation-validation-20261013.md) 记录继续有效；本次安卓鸿蒙只升版重打包，未扩写真机旋转专项通过结论。iOS 当前曲后台播放可用，但 JS 挂起时仍无独立原生房间 Socket/自动切歌管线。该验收不代表所有设备、媒体格式或会员权限均已验证。

## 安装包

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| ZViewer-Android-1.8.5-release.apk | 28868247 | `e099b492f938c2bfa80755e931d665693ebd416892c38a740da43d32ffe58653` |
| ZViewer-HarmonyOS-1.8.5-release.hap | 14185775 | `ffa4012a7a72e7e85d4a81320ab659b3364b2b79e037093804d4f28879304eb2` |
| ZViewer-1.8.5-b23-unsigned.ipa | 47330464 | `fbbe04318a395e15da2b15c1723cb8457cc3e660652c2443c7473ebcd6a69b9c` |

本地目录 `release/client-v1.8.5/`，包含上述三端包与 SHA256SUMS.txt。iOS 未签名，需个人签名；HAP 安装遵循设备开发者/Profile 授权，APK 沿用正式签名。

## 源码与发布记录

README 完整展示三端状态与操作；CHANGELOG、三端维护文档和 iOS 验收 JSON 同步更新。发布标题为 `ZViewer-Client V1.8.5`，标签 `client-v1.8.5`，附件 APK/HAP/IPA/SHA256SUMS.txt，源码使用 GitHub 自动归档，不附加源码 ZIP。未将历史未签名/失败构建或其他本地计划作为发布附件。

本地固定提交源码审计、远端 main/标签/Release/附件与自动归档回读结果在发布完成后补充。
