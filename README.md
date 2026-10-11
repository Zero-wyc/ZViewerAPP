# ZViewer Mobile Client

<img src="public/favicon.jpg" alt="ZViewer" width="88" height="88" />

面向手机和平板的 ZViewer 客户端，支持同步观影、一起听、房间语音、弹幕与字幕。Android 和 HarmonyOS 将界面与播放器打包进安装包，通过你填写的服务器地址连接 [ZViewer 服务端](https://github.com/Zero-wyc/ZViewer)。本仓库提供共享前端和原生宿主源码。

[下载安装包](https://github.com/Zero-wyc/ZViewerAPP/releases/latest) · [反馈问题](https://github.com/Zero-wyc/ZViewerAPP/issues) · [更新记录](CHANGELOG.md) · [开发指南](CONTRIBUTING.md)

## 当前版本

| 平台 | 版本 | 说明 |
| --- | --- | --- |
| Android | **1.7.3 / 173** | 正式签名 APK，内置 Go B 站代理 |
| HarmonyOS | **1.7.3 / 173** | 正式签名 HAP，ArkWeb / ArkTS 宿主 |
| iOS | 独立 1.5.1 源码 / Release | IPA 内部版本为 1.5.0（build 16）；本次未更新 |

双端本轮对齐 **服务端 v4.4.7**，源码参考 `32d3cdecb498e12af7bd5e0f5acd49b6b8576e08`。用户已确认双端检测通过。[ZViewer-Client V1.7.3](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v1.7.3) 提供 APK、HAP 和 SHA256SUMS.txt；源码同步 main，使用 GitHub 自动生成的 Source code（zip / tar.gz），不另附源码 ZIP。

本次新增 B 站搜索、片单触屏排序与自动连播、弹幕连续添加，以及 Emby/Jellyfin 海报墙和全选。单集恢复横向封面，媒体库放大后目录区使用更多可用空间。详见 [发行说明](docs/releases/client-1.7.3.md)、[对齐记录](docs/client-v1.7.2-alignment-447-validation-20261011.md) 和 [媒体库修复记录](docs/client-v1.7.3-media-browser-fix-20261011.md)。1.7.1 的 Kazumi HLS 与切片进度修复继续保留，对应服务端修复已包含在 v4.4.7 中；请同步更新服务器和房主网页。Kazumi 仍需在设置中手动启用。

## 安装与连接

1. 从最新 Release 下载对应的 `ZViewer-Android-1.7.3-release.apk` 或 `ZViewer-HarmonyOS-1.7.3-release.hap`。Android 按系统提示允许安装；鸿蒙安装说明见 [维护文档](docs/harmonyos-maintenance-architecture.md)。
2. 准备可访问的 ZViewer 服务端，填写服务器地址。支持完整 HTTP/HTTPS 地址、HTTPS 优先探测及按服务器授权的证书例外。
3. 使用服务器账号登录；服务器允许游客时可使用游客身份。
4. 选择房间，或在服务器授权允许时创建同步观影、一起听房间。

Android 最低版本为 **Android 7.0 / API 24**；当前 APK 包含 ARM64 和 x86_64 原生库，需要 64 位 Android。保持 Android System WebView / Chrome 更新，媒体能力仍取决于设备。HarmonyOS 工程最低 SDK 配置为 `6.1.0(23)`，目标 SDK 为 26，设备支持以发布包和维护文档为准。

推荐 HTTPS。应用允许局域网 HTTP 与混合内容；服务器或反向代理需要允许客户端来源的 API 和 Socket.IO 连接。证书例外仅作用于你选择的服务器，不全局关闭 TLS 校验。

正式 Android 包名为 `com.zviewer.mobile`，调试包为 `com.zviewer.mobile.debug`。本轮沿用既有发布签名；自行构建或其他签名的同包名应用不保证能覆盖安装。需要卸载旧包时先保存服务器地址和设置，卸载会清除本地数据。

## 功能与使用

- **房间与同步观影**：账号/游客登录、会话恢复、片单、聊天、评论、字幕与播放控制。可观看桌面端发起的屏幕共享，手机端不提供屏幕采集。
- **片单管理**：展开完整片单进行搜索、上移/下移排序；排序仅限 root 或创建房间的管理员，搜索过滤时不能排序。房主可开启自动连播，默认关闭，按完整片单播放，末尾停止。
- **B 站**：关键词搜索后直接解析，支持分 P、ep/ss 番剧影视与本机账号授权。双端内置登录与代理，无需另装 CLI；Cookie 保存在原生侧，房主与观众独立选择本机画质。
- **媒体库**：Emby/Jellyfin 列表与海报墙切换、年份、剧集/季/单集导航、缺图占位。进入单集目录后可多选或全选，按目录顺序批量添加；放大扩展目录显示区域，原生返回先退出面板全屏，再关闭面板。
- **弹幕与字幕**：连续添加多集并标记已添加，支持本地 XML/JSON 弹幕及文本/PGS 字幕。手机弹幕默认随画面缩放，字号和字幕大小可调整。
- **一起听与语音**：音乐、歌单、歌词及 LiveKit 房间语音，保留麦克风权限、静音和成员管理；折叠面板或切换标签不主动结束通话。
- **移动体验**：深浅主题、全局背景、窄屏设置、平板布局、旋转控制、系统播放信息与控件、二级面板内部滚动和返回层级。

B 站默认选择本机账号有权限、视频实际提供且设备支持的最高普通画质，排除 HDR 和杜比视界；手动选择按影片保留。媒体来源、账号授权和房间权限由对应平台及服务端决定，格式播放还依赖设备解码能力。

## iOS 状态

`ZV-iOS/` 为独立 Expo/React Native + VLC 工程，不直接使用双端共享界面。当前 iOS 源码及独立 Release 为 1.5.1，复用未签名的 1.5.0（build 16）IPA，需自行签名安装。本次未构建 IPA，也未完成 v4.4.7 与 LiveKit 的 iOS 对齐。

iOS 更新受 Expo Build 额度及本地 Mac 构建条件影响，可能晚于双端。UI 验收与后台同步、音视频及语音覆盖边界见 [iOS 维护文档](docs/ios-maintenance-architecture.md) 和 [1.5.1 发行说明](docs/releases/ios-1.5.1-release-notes.md)。

## 本地开发与检查

使用 Node.js 24 和 npm；Android 原生构建还需要 Go 1.26.8、JDK 21、Android SDK Platform / Build Tools 36 和 NDK r30。HarmonyOS 使用 DevEco Studio 及对应 SDK，详见 [开发指南](CONTRIBUTING.md) 和平台维护文档。

```sh
npm ci
npm run dev -- --host 127.0.0.1
npm run test:adaptation
npm run test:media
npm run build
```

浏览器调试需要自己的 ZViewer 服务端。仓库保留适配与媒体回归测试；本轮 43 项适配、4 项媒体回归通过，另外完成 64 组媒体库布局、17 组选择行为与双端原生批量添加验证。用户已确认双端检测通过，自动化证据和具体覆盖边界保留在本轮验证记录中。

### Android 构建

配置 `JAVA_HOME`、`ANDROID_HOME`（或本机 `ZV-Android/local.properties`）与 `ANDROID_NDK_HOME`，确保 Go 和 Node 在 PATH：

```powershell
npm run android:sync
cd ZV-Android
.\gradlew.bat assembleDebug
```

Gradle 自动从 `native/bilicore/` 构建 AAR，输出 `ZV-Android/app/build/outputs/apk/debug/app-debug.apk`；macOS/Linux 使用 `sh gradlew assembleDebug`。

正式签名包需要在当前构建进程注入：

| 变量 | 内容 |
| --- | --- |
| `ZVIEWER_KEYSTORE` | 仓库外发布密钥库的绝对路径 |
| `ZVIEWER_STORE_PASSWORD` | 密钥库密码 |
| `ZVIEWER_KEY_ALIAS` | 签名别名 |
| `ZVIEWER_KEY_PASSWORD` | 密钥密码 |

随后运行 `assembleRelease`，输出 `ZV-Android/app/build/outputs/apk/release/app-release.apk`。缺少签名配置时构建失败；发布前使用 `apksigner verify` 并记录 SHA-256。不要提交密钥、密码、SDK 本地配置或登录令牌。

### HarmonyOS 构建

```sh
npm run harmony:web
```

随后在 DevEco Studio 打开 `ZV-HarmonyOS/`，配置本机 SDK 与签名并构建 HAP。网页资源由脚本同步至 `entry/src/main/resources/rawfile/web/`，不手改生成文件。发布私钥和 Profile 不包含在公开源码中，详见 [HarmonyOS 维护文档](docs/harmonyos-maintenance-architecture.md)。

## 代码与维护边界

| 路径 | 用途 |
| --- | --- |
| `src/App.tsx`、`src/mobile/` | 连接、登录、大厅和移动房间布局 |
| `src/upstream/` | 从 ZViewer 导入并适配的共享业务 |
| `src/platform/` | Capacitor / ArkWeb 原生能力契约与适配器 |
| `ZV-Android/`、`native/bilicore/` | Android 宿主与内置 Go 播放代理 |
| `ZV-HarmonyOS/` | ArkTS / ArkWeb 原生宿主 |
| `ZV-iOS/` | 独立 Expo / React Native / VLC 工程 |
| `scripts/` | 构建、资源同步与回归检查 |
| `public/`、`vendor/mediabunny/` | 静态资源与媒体库本地补丁 |
| `docs/` | 平台维护架构、验收记录与发行说明 |

共享业务通过 `src/platform/` 访问原生能力，不直接依赖 Capacitor 或 ArkTS。HarmonyOS 使用 `zviewerNative` 桥；iOS 独立移植业务和能力。新增评论独立窗口、全屏评论侧坞与修饰键快捷唤出不在本次移植范围，原有评论保留。

维护入口：[Android](docs/android-maintenance-architecture.md) · [HarmonyOS](docs/harmonyos-maintenance-architecture.md) · [跨平台移植](PORTING.md) · [双端发布流程](docs/mobile-release-maintenance.md)。`scripts/import-core.mjs` 为维护用上游导入工具，普通安装、构建和测试无需运行；更新媒体库时保留 [本地补丁](vendor/mediabunny/LOCAL-PATCHES.md)。历史变更见 [CHANGELOG](CHANGELOG.md) 和 [Releases](https://github.com/Zero-wyc/ZViewerAPP/releases)。

## 致谢与许可

原项目由 **Zero-wyc** 开发，本项目保留原作者署名与 [MIT 许可证](UPSTREAM-LICENSE)，感谢原作者提供播放器、同步、音乐与语音等基础功能。

第三方组件遵循各自许可证；`vendor/mediabunny` 保留 MPL-2.0 声明和本地修改记录，详见 [第三方说明](THIRD-PARTY-NOTICES.md)。本项目不附带服务端账号、影片或音乐资源。
