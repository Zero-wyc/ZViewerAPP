# client 1.5.0 指定仓库同步记录

日期：2026-10-02。指定客户端修改与 Git 仓库：`E:/Codex-bulid/ZViewer/ZViewer-client`。

## 来源与范围

- 来源标签：`client-v1.5.0`；源码提交：`1ca96fd46963ff5cb89beb6c3d31e1d7b9f501fc`。服务端目标仍为 v4.2.1。
- 原开发目录程序停留在 1.3.0；本次同步共享前端、平台契约、Android/HarmonyOS 原生系统媒体/后台/旋转、音乐歌词/视频/手势、版本文件及发布维护文档。
- 实际写入 69 个内容不同或缺失文件；对 600 个非 iOS 发布基线文件逐字节/SHA-256 校验一致。三份维护/计划文档另行保留并补充，因此不纳入这 600 项计数。
- 保留本地 ZV-iOS 程序、未跟踪的 iOS 资源及历史 iOS 发布证据，校验 125 个文件摘要不变；iOS 后续计划明确对齐 client 1.5.0，但没有实施这些 iOS 功能或构建新 IPA。
- 按发布标签使用鸿蒙无签名配置模板；原本机配置随覆盖前备份保存，未提交密钥或签名材料。原有未跟踪 iOS 编辑器配置/图片等未加入本次提交。

## 覆盖前备份

本机备份位于 `E:/Codex-bulid/ZViewer/.codex-sync-150/backup.zip`，清单位于同目录 manifest.json。ZIP 的 before/ 保存被覆盖或删除文件的原始内容，另含 tracked.patch 与文件清单；写入前已验证 ZIP CRC 和原始字节一致性。备份可能含本机配置，仅保留本地，不提交或发布。

恢复时根据 before/、清单中的 created/removed 和对应 Git 提交选择性恢复；不要整库 reset --hard。此次采用文件级同步并记录来源，不移动发布标签、不覆盖 iOS，也未把 main 强制重置到发布分支。

## 本地验证

| 项目 | 本次结果 |
| --- | --- |
| npm run android:sync | TypeScript/Vite 构建成功，Capacitor 安卓资源同步成功 |
| Gradle assembleDebug | BUILD SUCCESSFUL；Android 1.5.0-debug / 150 |
| npm run harmony:web | TypeScript/Vite 构建成功，鸿蒙 rawfile 资源重新生成 |
| Hvigor debug assembleHap | BUILD SUCCESSFUL；HarmonyOS 1.5.0 / 150，未配置签名，生成 unsigned HAP |
| 包内共享资源 | dist/assets 的 12 个文件与 APK/HAP 内对应文件逐字节相同 |
| 源码/保留范围 | 600 个发布文件一致，125 个 iOS 文件摘要不变 |

构建告警保留：Vite 大 chunk、mediabunny 动态导入、dash.js CommonJS/ESM，Gradle flatDir/弃用 API，ArkTS 设备能力/异常处理/弃用 API；未为同步任务改变发布源码来屏蔽告警。

本次未安装或运行设备测试，不将原 1.5.0 用户验收记为本次结果；未重签正式版、上传附件、push 或发布新 Release。构建完成后在指定客户端仓库做本地 Git 提交。

## 构建产物（不提交）

| 文件（仓库相对路径） | SHA-256 |
| --- | --- |
| ZV-Android/app/build/outputs/apk/debug/app-debug.apk | 46ccf3a017c711ed6cd24e7f58a25c6f7cea5081090cb15dce19e31fc21aefcd |
| ZV-HarmonyOS/entry/build/default/outputs/default/entry-default-unsigned.hap | 0efd3cccc13361b1b36d3adcd4ab8e5b2bbfce6b766b3036eaf31b0819395eb6 |

## 维护交接

- 根目录 `E:/Codex-bulid/ZViewer/Agents.md` 新增第 3 条：ZViewer-client 为指定客户端修改仓库，所有客户端修改及 Git 操作均在此仓库完成，不在其他发布工作树改动或提交。该文件位于客户端 Git 根目录之外，已本地保存，不伪称包含在客户端提交中。
- [Android 维护架构](android-maintenance-architecture.md) 与 [HarmonyOS 维护架构](harmonyos-maintenance-architecture.md) 补齐 1.5.0 代码入口、生命周期和 iOS 状态。
- [iOS 后续开发计划](ios-continuation-plan.md) 使用固定 1.5.0 基线，保留 b12 历史，新增 I12～I17 系统媒体、后台、歌词、旋转、手势与音乐界面任务。
