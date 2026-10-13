# Android / HarmonyOS 1.8.0 发布验证

日期：2026-10-13。将已完成的 [1.7.6 功能对齐](client-v1.7.6-alignment-453-validation-20261013.md) 升为 **1.8.0 / 180**，重新构建 Android / HarmonyOS。服务端对齐基线为 v4.5.3，提交 `9e2a0d4f3d9796067ac17274feabeccbb065d411`。

## 本轮构建与附件

| 检查 | 结果 |
| --- | --- |
| 版本 | 根包和锁文件、Android Gradle、HarmonyOS AppScope 同步；实际 APK 清单和 HAP module.json 均为 1.8.0 / 180 |
| 网页构建 | `npm run android:sync`、`npm run harmony:web` 成功，包含 TypeScript / Vite 检查；生成资源不手改 |
| Android | Gradle Debug / Release 成功；APK v2 签名验证通过，发布证书 SHA-256 与 1.7.5 一致；ARM64 / x86_64 Go 原生库与本轮打包输入一致 |
| HarmonyOS | Hvigor Debug / Release 成功；HAP 验签通过，既有证书链一致，包内 release / debug=false；本机签名配置构建后还原 |
| 资源一致性 | 双端各 29 个网页文件逐项 SHA-256 比对通过；鸿蒙入口包含对应生成桥接脚本；包内不包含公告实现或 AGENTS.md |

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| ZViewer-Android-1.8.0-release.apk | 43169567 | `7c9143e07b0dfac4bd72805305b3e185252915a534eac26ec3bbeae42913f711` |
| ZViewer-HarmonyOS-1.8.0-release.hap | 14181683 | `ddd7eb811904a0f6ce160d8b55b1a955f1aeccd95e521c5d59d2089b8b09ad57` |

附件目录为 `release/client-v1.8.0/`，同时生成 `SHA256SUMS.txt`。Release 仅附 APK、HAP、校验文件，源码由 GitHub 自动归档。

## 文档与源码

README、CHANGELOG、双端维护架构与发布流程同步版本、功能、下载入口和验证边界。README 区分 iOS 已发布的独立 1.5.1 Release、本地 1.7.5 / build 17 候选与后续源码修复；本轮没有构建或发布 IPA。两个 iOS 本地验证脚本改从环境变量读取登录信息和个人媒体路径，不改 iOS 产品行为。并行进行的未提交 iOS 产品改动不纳入本次发布提交。

发布前以固定 Git 提交对象为源审计本地源码归档，检查 AGENTS.md、私钥、签名材料、令牌及已知签名凭据。发布时核对远端 main、`client-v1.8.0` 标签和 Release 对应同一提交，逐项核对上传附件的状态、字节数与 SHA-256，并回读 GitHub README 和自动源码归档。审计与远端回执保存于忽略目录 `.ui-validation/release180/` 和 `release/client-v1.8.0/`，不将私有材料加入源码。

## 验证边界

1.7.6 阶段已有 69 项适配、4 项媒体回归、Go 核心、20 组搜索布局与 8 组音量场景证据；真实浏览器短音频自然结束验证私人漫游连续播放，但候选与入队 ack 使用夹具。1.8.0 的功能代码与该阶段相同，本轮重新构建并校验版本、签名与资源。

本轮没有新增物理设备安装、真实网易云/VIP 音源、原生 B 站在线解析、后台锁屏、蓝牙或跨端同步验收。既有浏览器、协议与构建结果不能替代这些设备专项。布局检查覆盖无冲突、无横向溢出、整体界面和谐及服务端功能对齐；设备字体、安全区和媒体解码仍以实际设备为准。

维护入口：[Android](android-maintenance-architecture.md)、[HarmonyOS](harmonyos-maintenance-architecture.md)、[发行说明](releases/client-1.8.0.md)。
