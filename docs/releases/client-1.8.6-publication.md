# ZViewer-Client V1.8.6 双端发布记录

> 后续更新（2026-10-14）：iOS 修复已继续在 Mac 上完成，本轮按用户最新要求交付本地设备 Release IPA 和 Git 提交。追加说明见 [1.8.6 发行说明](client-1.8.6.md)，包与校验记录见 [本地交付](ios-1.8.6-25-local-20261014.md)。下文与 publication JSON 保留首次双端公开发布时的真实回执，不作为新 IPA 上传成功的凭证。

日期：2026-10-14。用户授权发布 Android/HarmonyOS 并同步远端源码；明确 iOS 当前仍有同步问题，1.8.6 / build 25 暂缓发布。

## 发布范围

- 发布地址：[ZViewer-Client V1.8.6](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v1.8.6)，正式版本，标题采用用户规定格式。
- 附件仅正式签名 APK、HAP 和双端 SHA256SUMS。没有 IPA、没有单独源码 ZIP，历史 1.8.5 IPA 保留原有名称与附件。
- 完整已提交源码同步 [main](https://github.com/Zero-wyc/ZViewerAPP/tree/main)，包含独立 iOS 候选工程，但文档明确其同步问题未解决、没有发布验收。GitHub 自动生成标签源码归档。
- 先合并远端 `b17d23a`、`27501a6` 的 README 更新，保留远端历史。预先存在的未跟踪 iOS 计划文件未加入提交。

## 安装包与校验

| 安装包 | 版本 | 字节数 | SHA-256 |
| --- | --- | ---: | --- |
| ZViewer-Android-1.8.6-release.apk | 1.8.6 / 186 | 28,871,799 | `756ae3a6cbf103a5b9312ebf926f63bb5588ae9f6d89a15a4f8682af331959c7` |
| ZViewer-HarmonyOS-1.8.6-release.hap | 1.8.6 / 186 | 14,193,024 | `b47b31735b0c95f05584a1f051becbffcd8a5a3722d06122b5fdccc84d317d73` |

沿用 10 月 13 日构建包，发布准备没有改动运行时代码或重新构建。已有版本、签名、既有证书、各 29 项网页资源摘要及 ZIP CRC 核验；76 项适配、4 项媒体、3 项更新回归与五种尺寸深浅主题界面验证记录保留，物理设备专项边界不扩大。候选构建细节见 [历史验证](client-1.8.6-local-validation.md)。

发布前审计已提交源码和附件，排除账号、密码、签名私钥、配置秘密和 AGENTS.md。发布时校验 Release 附件数量、名字、大小、服务端 digest 和 uploaded 状态；发布后匿名下载并比对 SHA-256、检查远端 main/tag 及自动生成源码归档。经核验的远端结果保存在 [publication JSON](client-1.8.6-publication.json)。

正式 Release **ID 412215310**，状态 Published / Latest，非预发行。源码标签固定在 `ffa4f29cd4323f868a22e066716fb98861901c1c`；本记录的核验回执作为后续文档提交同步 main，不移动发布标签。三个远端附件 uploaded 状态、字节数及 digest 全部匹配；匿名下载重新计算 SHA-256 通过。GitHub 自动源码归档 **959 个文件**与标签 Git 对象完整匹配，0 内容差异、无 AGENTS.md 或私有账号/密码。应用更新检查已对实际公开 Release 验证，安卓匹配 APK、鸿蒙匹配 HAP。
