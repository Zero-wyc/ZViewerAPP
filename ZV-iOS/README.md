# ZViewer iOS

`ZV-iOS/` 是独立的 Expo SDK 57 / React Native 0.86 客户端，使用 Expo Router、VLCKit、LiveKit 与项目自有原生模块。当前版本为 **2.3.6 / build 40**，可在 [2.3.6 Release](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v2.3.6) 下载 `ZViewer-iOS-2.3.6-build40-unsigned.ipa`，与 Android / HarmonyOS 2.3.6 安装包集中发布。需要自行签名后侧载，最低 iOS / iPadOS 16.4，Release 安装后无需 Metro 或开发电脑。

本版包含 Mac build32 至 build40 的更新：OBS 只读观看票据、Emby/Jellyfin 及挂载资源刷新、评论分页、一起听导航与设置、网易云/B站来源内切歌、清空全部同步停止，以及歌单详情“全部播放”完整加载后替换整个房间列表。共享 Go 来源为 `7ebacfb`，继续使用固定的 VLCKit 4.0.0a25。Windows 合并后 VLC 补丁、lint、类型检查、18项合同测试及12个共享来源检查通过；Mac 设备构建与模拟器证据的范围见 [iOS 维护文档](../docs/ios-maintenance-architecture.md)。

保留 build31 的播放器栏、字幕/弹幕设置、方向切换、投屏全屏/刷新/聊天、房间设置与 LiveKit 音量操作。build30 的用户“测试通过”反馈属于历史版本，不扩展为本次验收。媒体内核仍为 `NativeMediaAdapter → VlcPlayer → VlcVideo` 单一 VLCKit 实例；除 WebRTC / OBS 接收外，本版包含原生主动共享测试能力与画质/帧率设置。旧系统广播扩展需要有效的宿主/扩展签名及共享权限，build37 方向修复仍待真机复验。

## 日常开发与检查

```sh
npm ci
npm run check
npm run test:contracts
node scripts/stage-native-core.cjs --verify-only
npm start
```

`npm run check` 运行 VLC 持久补丁检查、lint 和 TypeScript；`npm run test:contracts` 运行18项协议与音乐队列测试；`stage-native-core.cjs --verify-only` 单独核对12个共享 Go 来源。历史测试与一次性检查已移入回收站，当前check不包含原有433项测试；原生编译和运行仍需macOS/Xcode。普通界面改动先用 Expo Go 或 Expo Web 预览；这些环境没有项目的 VLC、Go、LiveKit、Keychain 和 Swift 模块，结果只代表 JS/UI 流程。关闭开发服务后，确认 Expo 使用的 8081 端口已释放。

## 原生工程与 IPA

`ios/` 是 Expo CNG 生成目录。持久原生改动写入 `app.json`、`plugins/` 或 `modules/zviewer-native/`，不要以手改生成目录或 `node_modules` 作为唯一来源。iOS IPA/EAS 构建须按项目维护流程明确安排；设备构建需要 Mac/Xcode。交付前检查 Bundle ID、版本/build、ARM64 设备切片、未签名状态、生产 JS、VLC/LiveKit/原生桥、共享 Go 来源摘要、依赖许可和 IPA SHA-256。自动测试、Web 预览、模拟器及 IPA 离线检查不能替代实际设备播放、麦克风、蓝牙、锁屏和后台验收。

历史版本与发布状态可查看客户端 Git 历史和 [GitHub Releases](https://github.com/Zero-wyc/ZViewerAPP/releases)。发行源码不得包含凭据、Cookie、私钥、证书、provisioning profile、构建缓存或 `AGENTS.md`。
