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

发布前固定 Git 提交和自动本地源码归档共 942 个文件审计通过，排除 AGENTS.md、真实账号/密码/令牌/私钥及签名材料；Android/HarmonyOS 签名密码及编码形式均未匹配。扫描器候选经逐项核对均为保留的测试夹具、动态登录令牌拼接或 password 页面枚举，不是用户凭据。三端安装包 606 个成员 CRC/已知秘密/账户名审计通过；VLCKit 的私钥格式头字符串是加密库格式支持，未包含私钥负载。

Android 原生库在去路径/去调试信息构建后重新核验，ARM64/x86_64 各 128 个导出动态符号集合与先前候选完全相同；发布签名证书不变。README 本地链接 23 项检查通过。主工程最终源码包含此隐私构建修正；iOS 仍为经过真机验收的既有包。

远端发布过程依次核对 main、固定标签、Release 标题/正文、4 个附件上传状态/字节数/哈希；公开下载、README 和 GitHub 自动源码归档回读后记录实际结果。


## GitHub 发布与公开回读（已完成）

Release [ZViewer-Client V1.8.5](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v1.8.5) 已正式发布（draft=false / prerelease=false），并设为 Latest；Release ID `411685859`。发布时 main、client-v1.8.5 标签与 Release 源码均对应 `363497316545c6d29d1a083b630c34b4031d3dbe`，包含三端源码。本记录的后续提交仅补充发布回执，标签保留固定发布源码，不移动标签。

4 个远端附件上传状态、字节数与 SHA-256 均与本地一致；匿名公开完整下载 APK/HAP/IPA/SHA256SUMS.txt，返回 HTTP 200 并再次核对哈希一致。远端 main README 内容与已审阅源码完全一致，包含三端操作及“iOS 已处于可用状态”。GitHub 自动生成的标签源码 ZIP 共 942 个文件，经声明的 bat 换行规范化后与固定 Git 对象逐项一致；私钥/真实令牌/签名材料/已知签名密码及编码形式/AGENTS.md 审计通过。

三端软件版本和安装包详情见上表。完整网络回执及本地审计记录保存在忽略目录 release/client-v1.8.5/ 与 .ui-validation/release185/，公开检查摘要见 [发布验证 JSON](releases/client-1.8.5-publication.json)。
