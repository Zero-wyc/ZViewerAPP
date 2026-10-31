# ZViewer 客户端

<img src="public/favicon.jpg" alt="ZViewer" width="88" height="88" />

ZViewer 是一款手机和平板客户端，用来和朋友一起看视频、一起听音乐、接收投屏和进行房间语音。使用前需要准备可访问的 [ZViewer 服务端](https://github.com/Zero-wyc/ZViewer)，再在 App 中填写地址并登录。

[下载当前版本](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v2.3.5) · [发行说明](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v2.3.5) · [反馈问题](https://github.com/Zero-wyc/ZViewerAPP/issues) · [历史更新](CHANGELOG.md)

## 下载与安装

Android / HarmonyOS 当前版本为 **2.3.5（235）**；iOS / iPadOS 保持 **2.1.10（build 31）**。

| 平台 | 版本与下载 | 安装方式与系统要求 |
| --- | --- | --- |
| Android | **2.3.5（235）** · [APK](https://github.com/Zero-wyc/ZViewerAPP/releases/download/client-v2.3.5/ZViewer-Client-2.3.5-android.apk) | 允许安装该来源的应用后安装。要求 Android 7.0 / API 24 或更高版本、64 位设备；APK 包含 ARM64 / x86_64。 |
| HarmonyOS | **2.3.5（235）** · [HAP](https://github.com/Zero-wyc/ZViewerAPP/releases/download/client-v2.3.5/ZViewer-Client-2.3.5-harmonyos.hap) | 要求 HarmonyOS 6.1 / API 23 或更高版本。通过 DevEco Studio、HDC 等设备支持的开发者安装方式安装，签名及设备授权需匹配；当前不是应用商店安装包。 |
| iOS / iPadOS | **2.1.10（build 31）** · [未签名 IPA](https://github.com/Zero-wyc/ZViewerAPP/releases/download/client-v2.1.10/ZViewer-iOS-2.1.10-31-unsigned.ipa) | 要求 iOS / iPadOS 16.4 或更高版本，支持 iPhone 和 iPad。需使用自己的有效证书及设备授权签名后侧载，不能直接点击 IPA 安装。 |

iOS 安装包已经内置运行所需的 JavaScript，安装后无需 Expo Go、Metro 或连接开发电脑。Android 和 HarmonyOS 也将界面、播放器打包在 App 内，仍需连接服务端获取房间和媒体。

Android / HarmonyOS 沿用既有发布签名；签名一致时可按平台规则覆盖旧正式版。iOS 更新需保持兼容的个人签名身份。卸载前请保存服务器地址和设置，卸载会清除本机数据。

## 2.3.5 更新了什么

- 对齐最新服务端的语音组件按需下载，显示服务器下载进度、安装状态与失败重试，并遵守管理员的入口显示设置。
- 登录到期后有界续期重连；OBS 停流后持续等待恢复，宽限期内首次进入房间也不会因 30 秒超时永久停止拉流。
- B站已指定分P的链接直接使用对应分P，切画质保留选择；一起听相关推荐、续播与观众申请统一显示每P名称和时长。
- 保留 2.3.4 的原生 B站恢复、暂停意图与双端代理修复。验证范围见 [2.3.5 发行说明](docs/releases/client-2.3.5.md)和 [服务端对齐记录](docs/server-client-alignment-2026-10-31.md)。

## 第一次连接

1. 准备一个可访问的 ZViewer 服务端地址。Android / HarmonyOS 可输入 `IP:端口` 并选择自动模式，也可填写完整 HTTP / HTTPS 地址；iOS 请填写完整地址。
2. 如果自己的 HTTPS 服务器使用自签名证书，在连接页允许该服务器使用不受信任的证书。此选项默认关闭，只对选定服务器生效。
3. 使用服务端账号登录；服务端允许游客时，也可以选择游客登录。
4. 在大厅加入房间，或在拥有权限时创建房间。有密码或入房审批的房间需要按提示完成准入。
5. 进入房间后选择一起看、一起听或投屏。添加媒体、控制播放和管理成员仍由房主身份与服务端权限决定。

建议使用 HTTPS。局域网 HTTP 也受支持；使用反向代理时，需要让 API 和 Socket.IO 连接正常通过。

## 可以做什么

| 功能 | 使用方式 |
| --- | --- |
| 一起看 | 从 B站、Emby / Jellyfin、目录、番剧或 CMS 等已配置来源添加视频；按来源提供搜索、分 P、分集和批量添加。房主控制播放，观众按权限操作。 |
| 一起听 | 选择网易云或 B站歌曲，管理队列、查看歌词和评论、拖动进度；提供顺序循环、按顺序播放、单曲循环和随机播放。账号授权内容需要登录对应音乐账号。 |
| 投屏与屏幕共享 | 接收网页或桌面端的 WebRTC / OBS 投屏。Android / HarmonyOS 还可在系统授权及设备支持时共享本机屏幕；iOS 当前提供接收功能。 |
| 房间语音与聊天 | 在房间中打开语音入口，按需授予麦克风权限；支持聊天、成员列表和房间设置。播放控制申请与入房审批分别管理。 |
| 弹幕与字幕 | 支持弹幕显示、类型过滤及字幕；入口和格式支持因平台不同，iOS 设置中提供字幕 / 弹幕页和在线弹幕管理。 |
| 外观与横竖屏 | 支持深浅主题、背景和布局设置。视频全屏按实际画面方向适配；iPad 方向与窗口由系统管理。 |

媒体内容和来源由使用者及服务端提供。本项目不附带服务端账号、影片或音乐资源；Kazumi 来源需在设置中手动启用。

### 一起听常用操作

1. 从音乐面板搜索歌曲、导入歌单或选择 B站视频，加入队列后播放。
2. 展开底部播放器查看完整歌词和进度；歌曲评论与播放列表可单独打开，关闭后回到播放器。
3. Android / HarmonyOS 点击播放模式图标，依次切换“列表循环 → 单曲循环 → 随机播放”；“按顺序播放（播完停止 / B站推荐连播）”可从右上角更多菜单选择。
4. 从音乐账号 / 设置入口登录并调整音质。iOS 的房间评论位于右侧抽屉，歌曲评论在播放器内独立打开。

### iOS 使用说明

- B站可选画质同时受账号权限和设备解码能力限制；通过硬件解码探测的设备最高可提供 4K 30fps SDR，HDR、杜比、AV1 和 60fps 当前未开放。模拟器的画质限制更低。
- 一起听支持当前曲目的后台音频和系统媒体控制。系统长时间挂起 App 后的自动切歌、房间同步及后台恢复仍受限制，不能保证所有设备与网络场景都连续运行。
- 模拟器、自动检查和安装包检查各有验证范围，具体记录及尚待验收的场景见 [iOS 维护文档](docs/ios-maintenance-architecture.md)。

## 获取源码

当前完整三端源码以 [main 分支](https://github.com/Zero-wyc/ZViewerAPP/tree/main) 为准，可直接 [下载 main 源码 ZIP](https://github.com/Zero-wyc/ZViewerAPP/archive/refs/heads/main.zip)。

`client-v2.3.5` 标签保留本版源码快照；继续开发请使用 main。iOS 工程保持 2.1.10 / build 31，本轮安卓/鸿蒙适配未移植到 iOS。无需额外下载手工打包的 Source Code 附件。

## 本地开发

使用 Node.js 24 和 npm。先在仓库根目录安装依赖：

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

共享前端检查：

```sh
npm run typecheck
npm run build
```

Android 原生构建需要 JDK、Android SDK / NDK 和 Go，版本要求见 [Android 维护文档](docs/android-maintenance-architecture.md)。生成网页资源并同步宿主后构建：

```powershell
npm run android:sync
cd ZV-Android
.\gradlew.bat assembleDebug
```

HarmonyOS 先运行 `npm run harmony:web`，再用 DevEco Studio 打开 `ZV-HarmonyOS/`，配置本机 SDK、设备授权和签名后构建。不要手改自动生成的网页资源，详见 [HarmonyOS 维护文档](docs/harmonyos-maintenance-architecture.md)。

iOS 需要在子目录单独安装依赖：

```sh
cd ZV-iOS
npm ci
npm run check
npm start
```

`npm run check` 包含 VLC 持久补丁检查、lint 和 TypeScript；历史回归源码已按清理要求移入回收站，当前命令不包含历史测试。原生编译和运行仍需要 macOS / Xcode。Expo Go / Web 可用于预览界面，VLC、Go、LiveKit 等自定义原生能力需要原生 App。IPA 构建在 macOS 上按 [iOS 维护流程](docs/ios-maintenance-architecture.md)另行安排。

正式签名需要自己的密钥、证书及授权材料。不要将密码、Cookie、令牌、签名文件或本机 SDK 配置提交到仓库。安装包的 SHA-256 在构建结束时计算一次，发布时复用对应校验文件。

## 代码与维护入口

| 路径 | 用途 |
| --- | --- |
| `src/mobile/`、`src/upstream/`、`src/platform/` | Android / HarmonyOS 的界面、共享业务和原生能力适配 |
| `ZV-Android/`、`native/bilicore/` | Android 原生宿主与共享 Go 解析核心 |
| `ZV-HarmonyOS/` | HarmonyOS ArkTS / ArkWeb 宿主 |
| `ZV-iOS/` | 独立 Expo / React Native / VLC 客户端 |
| `scripts/`、`docs/` | 构建工具与三端维护文档 |
| `public/`、`vendor/` | 静态资源、媒体库及其本地补丁 |

维护文档：[Android](docs/android-maintenance-architecture.md) · [HarmonyOS](docs/harmonyos-maintenance-architecture.md) · [iOS](docs/ios-maintenance-architecture.md) · [跨平台移植](PORTING.md) · [贡献指南](CONTRIBUTING.md)。

## 致谢与许可

原项目由 **Zero-wyc** 开发，本项目保留原作者署名与 [MIT 许可证](UPSTREAM-LICENSE)，感谢原作者提供播放器、同步、音乐与语音等基础功能。

第三方组件遵循各自许可证；`vendor/mediabunny` 保留 MPL-2.0 声明和 [本地修改记录](vendor/mediabunny/LOCAL-PATCHES.md)，详见 [第三方说明](THIRD-PARTY-NOTICES.md)。
