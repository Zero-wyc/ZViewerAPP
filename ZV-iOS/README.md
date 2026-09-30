# ZViewer iOS

独立 Expo SDK 57 / React Native 工程。当前交付 **1.2.1 / build 11 未签名真机测试包**；文件、音乐和 HTTP-FLV 使用单一 VLCKit，保留统一播放器适配接口及 v4.2.0 的 8 MiB Range 行为。

## 已实现

- 对照 Android 平板虚拟机的一起看/一起听界面：绿色/深灰、图标导航、聊天分区及可收起侧栏；登录/游客/会话刷新、审批/密码/成员权限。
- 片单、服务器文件、WebDAV/FTP/OpenList/Emby/Jellyfin 挂载管理、AniSubs/旧番剧/Kazumi。
- VLC 播放/同步、分离音轨、进度/倍速/音量、字幕/全屏/PiP；字幕文件导入与房间同步，弹幕导入/编辑/在线搜索/叠加。
- 一起听队列/同步/审批/循环，网易云账号/歌单/歌词/音质、B站音乐；原有 WebRTC 共享接收和 OBS-FLV。
- **本机 B站 Go bilicore**：QR、Keychain Cookie、搜索/推荐/收藏/关注/合集/分 P/画质/歌词/有限回退；各端独立解析，房间只广播 BV 原地址。
- **房间语音**：AVAudioEngine/回声处理、Opus 48kHz/20ms、旧 PCM 接收、既有媒体 Socket、静音/禁言/踢出/重连/释放；收起面板继续通话，离房释放。
- b11 修正：保留初始化前起播意图；播放条覆盖在视频内；全屏移除外层留白，旋转操作独立，退出恢复之前方向策略。iPad `requireFullScreen` 用于使方向锁生效，**关闭 Split View**。
- 网易云使用折叠菜单、我的音乐登录页、居中底部播放条、独立队列/歌词面板；适配原始登录状态 DTO，扫码成功刷新歌单，退出恢复登录页。

用户已反馈上一轮视频、B站扫码、番剧和挂载视频正常。**b11 自动起播/全屏/旋转/样式仍待真机复验**，语音、同步及扩展媒体矩阵仍待测。状态及限制见 [原 plan](../docs/ios-continuation-plan.md) 和 [b11 交付记录](../docs/releases/ios-1.2.1-11-unsigned.md)。

## 未签名真机构建

```powershell
cd ZV-iOS
./scripts/build-ios-unsigned.ps1
# 等待完成：./scripts/build-ios-unsigned.ps1 -Wait
```

脚本先暂存共享 Go 源，再将 EAS archive 限定本工程。自定义 workflow 校验固定 Go/Opus 下载摘要、构建依赖、运行 Opus 编解码检查，以 CNG 生成项目并编译 iphoneos ARM64 Release。包内置 JS，不需要 Apple 登录、设备注册或 Metro。

本版 IPA：`release-assets/ZViewer-1.2.1-b11-unsigned.ipa`（不提交 Git）。按最新要求仅交付 unsigned，**需要用户自行签名后安装**。Expo Go 不能加载 VLC/Go/语音原生模块。旧 development/simulator profile 尚未配置本模块对应的 vendor 准备步骤，当前请用 unsigned-device；模拟器包不能改后缀当真机包。

## 验证与限制

```sh
npm ci
npm test
npm run lint
npm run typecheck
npx expo-doctor
npx expo export --platform ios
python scripts/inspect-unsigned-ipa.py release-assets/ZViewer-1.2.1-b11-unsigned.ipa
```

本版 35 项单测、lint/类型、iOS/Web 导出通过；Doctor 20/21，Directory 提示 WebRTC New Architecture 未测试、私有本地模块无元数据，未屏蔽。EAS 设备编译和 IPA 平台/桥接/JS/方向声明检查见版本记录。

`check-room-ui.cjs` 本轮 30 项检查通过，含两模式三尺寸、全屏填满/控件位置、旋转操作不切换全屏、真实登录状态及退出、扫码后刷新；`check-room-protocol.cjs` 和 `check-mount-flow.cjs` 历史分别 16 项协议、7 项挂载通过。仅使用隔离的本地 v4.2.0；音乐上游扫码/歌单/搜索、语音包和 DAV 为 fixture，不等于真实账号、麦克风或 NAS 验收。`check-local-results.mjs` 核对此前桌面 VLC/原网页 Range 证据。本轮未连接 NAS。

VLCKit 4.0.0a24 是预发布版，expo-libvlc-player 固定 57.0.54。真机续读/编码/后台/PiP、蓝牙/来电、语音回声、B站账号/高画质/失效和 Android 同房同步均待测。复杂 ASS 样式使用 VLC 外部字幕；同步 RN 字幕层显示文本和基础样式。

CNG 管理生成原生目录；维护本地 Expo Module/config plugin，不手改生成项目，不执行 Capacitor 同步。以 [AGENTS.md](AGENTS.md) 为规范。
