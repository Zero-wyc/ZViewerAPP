# iOS 回传源码与 Windows 同步记录

日期：2026-10-23（北京时间）。本次将 macOS 已完成的 iOS 2.1.10 / build31 源码同步回指定 Windows 客户端仓库，并补齐 GitHub main，更新 README 与现有 Release 正文。

## 源码核对

- Windows 原提交：`736452e4bbb7c293bbe511f1099fc581cbd4143d`。
- 同步前 GitHub main：`e3b2be4`；回传包源码：`c2e17f2ccbdc3c3d2b3a980d1a3158fdedd02762`。
- 远端已包含大部分 iOS 移植、版本更新、VLC 持久补丁和默认审批设置，但漏同步回传包中的 19 个文件：6 个业务源码、6 个测试、4 份构建 / 运行证据及 3 份维护和发行文档。
- 补齐 `MusicVideoSync`、一起听 B站 `avformat` 输入策略、持久播放器替换参数、完整画面显示和音乐控制申请；iOS 程序及测试与回传包一致，保留远端已有内容。
- 原有 1.9.6 发行说明改名与远端内容完全一致，随远端更新保留；同步前的本地改动另保存在 Git stash 中。
- 回传原始提交仅保留作本地对比，公开提交使用整理后的文件内容。测试记录中的个人账号、私有服务器地址和 macOS 用户目录已脱敏；不纳入凭据、签名材料、安装包或 `AGENTS.md`。

## 当前发行内容

| 平台 | 版本 | 本次处理 |
| --- | --- | --- |
| Android / HarmonyOS | 2.1.10 / 220 | 保留现有正式安装包和发布标签，无程序修改或重新构建。 |
| iOS | 2.1.10 / build31 | 同步 macOS 源码与构建证据，复用已发布的未签名 ARM64 IPA。 |

build31 在用户已反馈“测试通过”的 build30 播放与房间逻辑上统一版本元数据后构建。该反馈和 macOS 构建检查沿用回传记录；本次没有重新构建 IPA，也没有新增 iOS 原生运行或真机验收。

README 与 Release 统一说明安装要求、版本及源码入口。`client-v2.1.10` 标签保留安卓 / 鸿蒙原发布快照，当前完整三端源码使用 main。已发布的 APK、HAP、IPA 和两份构建时生成的 SHA 文件均保持原样，本次没有重复计算安装包 SHA。

## Windows 检查结果

- `npm run check` 中的 VLC 持久补丁检查、ESLint 和 TypeScript 通过。
- 433 项测试中：422 项通过，8 项按测试自身条件跳过，3 项因 Windows 缺少 `xcrun` 无法执行；完整命令因此返回非零，不能记为 433 项全通过。
- 环境受限项为 `musicAudioSessionNative.test.mjs` 的 1 项与 `systemMediaInputNative.test.mjs` 的 2 项 Swift 原生测试；保留原测试，不通过改断言或强制跳过制造通过结果。
- `node scripts/stage-native-core.cjs --verify-only` 通过，核对 12 个共享 Go 来源文件及其 `736452e` 来源提交。
- 回传材料中的 macOS 433 项通过、模拟器实测和 build31 安装包离线检查分别保留，详见 [iOS 开发记录](ios-macos-development-status.md) 与 [build31 证据](evidence/ios-device-ipa-31-2026-10-23.json)。

Windows 检查不能替代 macOS Swift 测试、Xcode 编译或实际 iPhone / iPad 验收。用户未提供的设备型号、系统、时长及逐项结果不作扩展认定。
