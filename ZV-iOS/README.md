# ZViewer iOS

`ZV-iOS/` 是独立的 Expo SDK 57 / React Native 0.86 客户端，使用 Expo Router、VLCKit、LiveKit 与项目自有原生模块；它不通过 Capacitor 加载根目录客户端。当前版本为 **1.9.0 / build 26**，发布标签为 [`ios-v1.9.0`](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/ios-v1.9.0)。对应设备 Release IPA 未签名，安装前需使用个人证书和设备授权侧载；IPA 内置生产 JS，不依赖 Metro。

本版主要更新播放器栏与字幕/弹幕设置、方向切换、投屏全屏/刷新/聊天、房间设置和 LiveKit 音量操作。媒体内核仍为 `NativeMediaAdapter → VlcPlayer → VlcVideo` 单一 VLCKit 实例；投屏只接收 WebRTC 画面，不采集屏幕。维护入口、模块边界、运行限制和故障定位见 [iOS 维护文档](../docs/ios-maintenance-architecture.md)。

## 日常开发与检查

```sh
npm ci
npm run check
npm start
```

`npm run check` 运行原生来源及 VLC 补丁检查、lint、TypeScript 和 `tests/*.test.mjs`。普通界面改动先用 Expo Go 或 Expo Web 预览；这些环境没有项目的 VLC、Go、LiveKit、Keychain 和 Swift 模块，结果只代表 JS/UI 流程。关闭开发服务后，确认 Expo 使用的 8081 端口已释放。

## 原生工程与 IPA

`ios/` 是 Expo CNG 生成目录。持久原生改动写入 `app.json`、`plugins/` 或 `modules/zviewer-native/`，不要以手改生成目录或 `node_modules` 作为唯一来源。iOS IPA/EAS 构建须按项目维护流程明确安排；设备构建需要 Mac/Xcode。交付前检查 Bundle ID、版本/build、ARM64 设备切片、未签名状态、生产 JS、VLC/LiveKit/原生桥、共享 Go 来源摘要、依赖许可和 IPA SHA-256。自动测试、Web 预览、模拟器及 IPA 离线检查不能替代实际设备播放、麦克风、蓝牙、锁屏和后台验收。

历史版本与发布状态可查看客户端 Git 历史和 [GitHub Releases](https://github.com/Zero-wyc/ZViewerAPP/releases)。发行源码不得包含凭据、Cookie、私钥、证书、provisioning profile、构建缓存或 `AGENTS.md`。
