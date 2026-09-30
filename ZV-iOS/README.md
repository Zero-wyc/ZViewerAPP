# ZViewer iOS

独立 Expo SDK 57 / React Native 客户端，与根目录 Vite/Capacitor Android 工程独立安装。

目前为 **1.2.1 / build 2 待验收候选**。当前 Android 的绿色主色、深灰 surface/text、大厅宽度与聊天/片单/房间入口作为界面基准；完整原生布局/旋转及多设备体验仍待 P1 验收。

## 当前能力

- 自定义服务端、账号/游客登录、设备 SecureStore 会话恢复和令牌刷新；Web 预览会话仅存内存。
- 房间列表、创建、密码/审批加入、聊天、现有片单与基础播放同步。
- iOS 仅使用 VLCKit：MP4、MKV、HLS 和现有单轨代理 URL 统一经过 NativeMediaAdapter → VlcPlayer → 原生视图，无 AVPlayer 分支。
- VLC 自行管理 Range；客户端不发送 `rangeMode=avplayer`，适配现有 8 MiB 分片响应。诊断检查范围、总长、实际短响应及下一分片，并支持取消和脱敏。

**本轮单内核候选已完成原生编译，尚待真机验收。** 本地未修改的 v4.2.0 服务端下，桌面 libVLC 3.0.23 播放用户提供的 MKV、MP4 均完成十分钟连播、三点 seek、暂停恢复及停止流量检查；原网页 MP4 播放、暂停、退出检查通过。这些是独立的桌面证据，不能代替 iOS VLCKit 4.0.0a24 验收。iOS 模拟器原生包已由 EAS 编译成功，仍无签名 IPA。分离音视频、来源浏览完整移植、字幕弹幕、一起听、语音、共享观看与 B 站原生代理仍按阶段推进。

依据：[后续交付计划](../docs/ios-continuation-plan.md)、[单内核交付记录](../docs/releases/ios-1.2.1-2-vlc.md)、[此前 AVPlayer 复测记录](../docs/releases/ios-1.2.1-2.md)、[Expo 工程约定](AGENTS.md)。历史记录不能作为当前内核的验收结论。

## 开发与验证

```sh
cd ZV-iOS
npm ci
npm start
npm test
npm run lint
npm run typecheck
npx expo-doctor
npx expo export --platform ios
```

历史房间诊断脚本（Node 22.18+，ffprobe 可选）：

```sh
npm run test:live-media -- <仓库外的账密文件路径> [房间名称]
```

账密文件包含服务器 URL、`账号：...`、`密码：...`。脚本默认禁止远程访问；仅在重新明确授权远程诊断后使用 `--allow-remote`。本轮不使用此脚本连接 NAS。客户端拒绝房间中的 loopback 媒体 URL；本地桌面与网页验证使用独立的本地测试脚本，见交付记录。诊断的 ready 只表示检查通过，不能代替原生播放验收。

`eas.json` 已包含 development、ios-simulator、preview、production；关联 `@fredqin2006/zviewer-ios`。实际真机构建仍需 Apple 签名和设备配置：

```sh
npx eas-cli@latest build --platform ios --profile development
```

Windows 首次真机注册/签名可在交互式 PowerShell 执行 `./scripts/build-ios-device.ps1`。脚本先调用 `device:create`，按提示在 iPad Safari 打开注册链接，再启动 development 构建；Apple 登录和双重验证只在本机 EAS 提示中输入。已注册设备可使用 `-SkipDeviceRegistration`。构建 archive 限定为当前 Expo 目录。安装成功后使用 `npx expo start --dev-client --tunnel` 生成播放验收入口；`npx expo start --go --tunnel` 仅用于页面预览。

VLCKit 是自定义原生模块，Expo Go 无法播放。`expo-libvlc-player` 固定为 57.0.54，其 iOS pod 使用 VLCKit 4.0.0a24；升级需重新原生编译及验收。HLS 清单鉴权、子分片、音轨/字幕及 HEVC/Opus 硬件行为仍须分别在真机验证。

不要把账密、证书、令牌或安装包放入版本库。生成的 ios/android 目录由 CNG 管理；不执行 Capacitor iOS 同步。优先使用 HTTPS；局域网 HTTP、系统权限、耳机/后台与 iPad/iPhone/Android 对测须完成真机验证。
