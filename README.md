# ZViewer Mobile Client

<img src="public/favicon.jpg" alt="ZViewer" width="88" height="88" />

面向手机和平板的 ZViewer 客户端工程。现有 Android 应用使用 React、TypeScript 和 Capacitor；`ZV-iOS/` 是独立的 Expo/React Native 工程，已接入登录、房间、VLC 媒体、本机 B站与语音，HarmonyOS 保留独立宿主目录。Android/鸿蒙当前发布 1.7.0 已适配 [Zero-wyc/ZViewer](https://github.com/Zero-wyc/ZViewer) `ba03309`（2026-10-07 方案的固定目标），保留移动端与原生 B 站适配。

本仓库是 **移动客户端共享源码与原生宿主**，不是服务端，也不是直接加载远程网页的地址壳。应用界面与播放器随安装包打包，通过你填写的服务器地址连接 ZViewer 服务。

现有共享前端已经按多平台边界整理：业务代码不直接依赖 Android 或 Capacitor，原生能力统一通过 `src/platform/` 调用。Expo iOS 工程独立移植业务与原生能力，真机 UI 已通过用户验收；完整后台业务同步及部分原生媒体场景仍有待验收；HarmonyOS 已通过 ArkWeb `JavaScriptProxy` 接入共享前端，详见 [移植指南](PORTING.md)。

[下载安装包](https://github.com/Zero-wyc/ZViewerAPP/releases) · [反馈问题](https://github.com/Zero-wyc/ZViewerAPP/issues) · [更新记录](CHANGELOG.md)

## 当前发布：Android/鸿蒙 1.7.0 / 170

双端支持 B 站 ep/ss 番剧影视、本机账号会员/试看解析与 cliOnly，增加 HTTPS 优先地址选择、按服务器证书例外、一起听末尾推荐/默认来源/房间评论和实际语音线路徽标。用户已确认双端真机验收通过，[client-v1.7.0 Release](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v1.7.0) 提供正式签名 APK/HAP、源码 ZIP 和 SHA-256。30 项共享回归、Go 测试、双端模拟器证书通道及会员 MP4 约 400 秒位置出帧通过；详细证据与自动验证覆盖边界见 [1.7.0 交付记录](docs/releases/client-1.7.0-adaptation.md)。本轮不涉及 iOS。

## 历史发布：Android/鸿蒙 1.6.0 / 160

双端升级 LiveKit 语音、PGS 位图字幕和 AAC/seek 修复，新增本地 XML/JSON 弹幕及网易云 Cookie 登录/复制，清理我的音乐空 Tab。18 项自动回归与双端模拟器联调通过；发布沿用既有签名的正式 APK 和 HAP；用户已确认鸿蒙纯外网域名语音可连接，其他真机场景按交付记录保留验收边界，详见 [1.6.0 交付记录](docs/releases/client-1.6.0-adaptation.md)。新版本语音要求 LiveKit 服务端，不支持旧 v4.2.1 的语音协议。**iOS 目前尚未适配本次新版本服务端（含 LiveKit 语音），本次不发布 iOS 安装包。** 发行说明见 [1.6.0 Release](docs/releases/client-1.6.0.md)。

## 历史发布：Android/鸿蒙 1.5.0，iOS 源码/Release 1.5.1

Android 和 HarmonyOS 同步 ZViewer 服务端 v4.2.1，使用同一套连接页、房间、全局背景与深浅主题。双端接入系统播放控件、封面与歌词，完善后台播放和自动旋转；一起听横屏背景铺满屏幕，曲绘避让摄像头，追加视频弹窗适配主题与窄屏。一起看使用中间双击播放/暂停、全屏左右双击各跳转15秒；一起听仅在视频全屏采用相同手势。Android/鸿蒙包版本为 1.5.0，versionCode 为 150；iOS 源码与独立 `ios-v1.5.1` Release 版本为 1.5.1，本次未重新进行 Expo/EAS 构建，复用已修复的 1.5.0 / build 16 未签名 IPA；安装包内部版本仍为 1.5.0（16）。

发布构建、源码清理边界与设备验收见 [双端维护与发布流程](docs/mobile-release-maintenance.md)，双端变更见 [1.5.0 发布记录](docs/releases/client-1.5.0.md)，iOS 修复及包版本说明见 [1.5.1 发行说明](docs/releases/ios-1.5.1-release-notes.md)。

Android 内置 B 站登录与 Go 播放代理，无需另外安装 CLI。扫码登录后，默认选择账号有权限、视频有实际轨道、设备支持的最高普通画质，自动排除 HDR 和杜比视界。最高画质播放失败时，有限恢复后优先回退 720p；没有 720p 则使用真实可用的更低档位。

手机端弹幕默认开启“随屏幕缩放”，让字号随播放区域变化；可以在弹幕设置中关闭，关闭后的选择会保留。桌面网页的默认值不变。

手动选择按影片保留，房主与观众独立选择本机画质；Cookie 在 Android Keystore 加密后保存在不可备份目录。正式版包名 `com.zviewer.mobile`；调试包使用独立包名 `com.zviewer.mobile.debug`。本轮模拟器验收范围见 [适配记录](docs/android-v4.2.1-adaptation-report.md)。

**iOS 更新说明：** 由于 Expo Build 的额度限制，iOS 端更新与错误修复会出现延迟，不会与 Android/鸿蒙两端同步完成（除非有人有 Mac 帮忙编译）。

iOS 包为未签名的 iPhone/iPad ARM64 Release，需要自行签名安装；内置 JS，无需运行 Metro。UI 验收不代表后台同步、音视频及语音所有真机场景通过。构建完成后的包与校验记录见 [iOS 维护文档](docs/ios-maintenance-architecture.md)与 [1.5.1 发行说明](docs/releases/ios-1.5.1-release-notes.md)。

## 安装与连接

1. 从 Releases 下载 `ZViewer-Android-版本号-release.apk`，按系统提示允许对应来源安装应用。
2. 准备可访问的 ZViewer 服务端，在客户端填写服务器地址。
3. 使用服务器账号登录；服务器允许游客时，也可以游客身份进入。
4. 选择房间，或在服务器授权允许的情况下创建同步观影、一起听房间。

Android 工程最低版本为 Android 7.0 / API 24。请保持 Android System WebView / Chrome 更新；系统版本达到最低要求，并不代表所有媒体编码、WebRTC 或 Web Audio 功能都能在该设备上使用。当前目标服务端为 v4.2.1，验证范围见 [安卓适配记录](docs/android-v4.2.1-adaptation-report.md)。

推荐 HTTPS。为兼容局域网部署，本应用允许 HTTP 和混合内容；不要在不可信网络中使用明文连接。服务器或反向代理需要允许客户端来源的 API 请求及 Socket.IO 连接，客户端不会绕过服务端权限或跨域限制。

**安装迁移提醒：** 当前包名是 `com.zviewer.mobile`，v1.1.0 使用本次 Android 适配的独立发布签名，不保证能覆盖安装仓库旧版本。不同包名可能并存；若已有同包名的调试版或其他签名版本，安装可能被拒绝。请先记录服务器地址和设置，确认需要后再卸载旧包；卸载会清除其本地数据。

## 功能

- 自定义服务端、账号或游客登录、会话恢复、房间列表与权限检查。
- 同步观影、片单、聊天、弹幕、字幕与播放控制。
- Android 内置 B 站扫码登录、自动最高画质、真实档位展示与有限播放回退。
- 一起听音乐，设置页适配窄屏，平板保留多列布局。
- 观看桌面端发起的屏幕共享；手机端不提供屏幕采集或发起共享。
- 房间语音：申请麦克风权限、加入与退出、静音和成员状态。折叠面板、切换标签或房间模式不主动结束通话。
- 顶栏旋转屏幕控制，全屏播放时保留播放器内的旋转入口。
- 手机字幕默认 12px，短边达到 600 CSS px 的平板默认 15px；可手动调整。
- 与原网页项目一致的应用图标，原生启动背景与即时加载页，加载异常时可重试。

媒体来源、账号服务和房间权限仍由服务端及对应平台决定。部分格式依赖设备解码能力；本项目不承诺支持所有媒体。

## 本地开发

推荐使用 Node.js 24、npm、Go 1.26.8、JDK 21、Android SDK Platform 36 / Build Tools 36 和 NDK r30。Gradle Wrapper 已包含在仓库内。详细环境配置见 [CONTRIBUTING.md](CONTRIBUTING.md)。

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

终端会显示访问地址。浏览器调试时仍需要自己的服务端。

```sh
npm run build
```

测试目录和测试脚本已从客户端交付树清理。发布前请按 Android/HarmonyOS 维护文档执行设备验收，并保留脱敏的发布记录。

## 跨平台边界

- `src/platform/contracts.ts` 是现有 Capacitor/ArkWeb 客户端的原生能力契约；Expo iOS 工程尚未接入。
- 显示、生命周期、音频路由和麦克风权限均通过 `src/platform/` 适配器访问。
- Android 继续使用现有 Java Capacitor 插件；插件名与方法保持兼容。
- iOS Expo 工程使用 React Native，需要单独迁移界面和平台能力。
- HarmonyOS 在 ArkWeb 中注入 `zviewerNative`，不在 React 业务层引入 ArkTS 分支。
- 平台边界由 `src/platform/` 目录和代码评审维护；业务模块不应直接导入 Capacitor。

新平台适配、桥接方法和维护流程见 [PORTING.md](PORTING.md)。

## Android 构建

先配置 `JAVA_HOME`、Android SDK（`ANDROID_HOME` 或本机 `ZV-Android/local.properties`）和 `ANDROID_NDK_HOME`，确保 Go 与 Node 在 PATH，再同步前端资源：

```sh
npm ci
npm run android:sync
npm run android:open
```

Windows PowerShell 调试包：

```powershell
cd ZV-Android
.\gradlew.bat assembleDebug
```

Gradle 自动从 `native/bilicore/` 构建 AAR，不需要手动复制预编译文件。当前 APK 包含 ARM64 和 x86_64 原生库，要求 64 位 Android。输出：`ZV-Android/app/build/outputs/apk/debug/app-debug.apk`。macOS / Linux 使用 `sh gradlew assembleDebug`。

### 正式签名包

签名密钥必须保存在仓库外。将以下环境变量注入当前构建进程：

| 变量 | 内容 |
| --- | --- |
| `ZVIEWER_KEYSTORE` | 发布密钥库的绝对路径 |
| `ZVIEWER_STORE_PASSWORD` | 密钥库密码 |
| `ZVIEWER_KEY_ALIAS` | 签名密钥别名 |
| `ZVIEWER_KEY_PASSWORD` | 签名密钥密码 |

配置后运行：

```powershell
npm run android:sync
cd ZV-Android
.\gradlew.bat assembleRelease
```

输出：`ZV-Android/app/build/outputs/apk/release/app-release.apk`。缺少签名配置时 release 构建会失败，不会把未签名包当正式包发布。发布前使用 Android SDK 的 `apksigner verify --verbose --print-certs` 检查 APK，并记录 SHA-256。

维护者应安全备份密钥与密码，后续版本继续使用同一签名。不要提交密钥、密码、SDK 本地路径或登录令牌。仓库不包含现有发布密钥，自行构建的签名包不保证能覆盖安装官方发布包。

## 目录

| 路径 | 用途 |
| --- | --- |
| `src/App.tsx` | 连接服务端、登录和房间大厅 |
| `src/mobile/` | 移动端房间布局与平台无关的 React Hook |
| `src/platform/` | 原生能力契约及 Android/iOS/HarmonyOS 适配边界 |
| `src/upstream/` | 从 ZViewer 导入并适配的业务模块 |
| `ZV-Android/` | Capacitor Android 工程、Gradle 配置与 Java 原生插件 |
| `native/bilicore/` | 从 ZViewerCLI 4.1.2 提取的 Go 核心、移动代理与测试 |
| `docs/` | 实施方案与验收报告 |
| `ZV-iOS/` | Expo/React Native iOS 源码 1.5.1 与原生模块（复用 1.5.0 / build 16 IPA） |
| `ZV-HarmonyOS/` | HarmonyOS ArkTS/ArkWeb 原生宿主（已完成） |
| `public/` | 图标、字体及音频工作线程资源 |
| `vendor/mediabunny/` | 媒体库本地副本及 DTS / FLAC 补丁 |
| `docs/` | 平台维护架构、验收记录和发布说明 |

`scripts/generate-android-icons.ps1` 从 `public/favicon.jpg` 生成 Android 启动器图标。`scripts/import-core.mjs` 是维护用的上游导入工具，依赖相邻的 ZViewer 4.1.7 源码目录；普通安装、构建和测试**不需要运行它**。更新媒体库时请保留 [本地补丁](vendor/mediabunny/LOCAL-PATCHES.md)。

## 验证范围

自动化覆盖不等于所有设备实测。发布前已进行浏览器回归和 Android release 构建检查；1.1.1 音频测试版由用户确认手机测试通过，但其他设备、耳机型号、后台行为及具体媒体兼容性仍需实测。

v1.1.0 修复了 24 位 FLAC 封装为 MP4 时位深声明不一致引起的 Chromium MSE 错误。回归使用合成音频，尚未取得用户原始报错媒体，因此不承诺所有类似播放错误均已解决。

## 致谢与许可

原项目由 **Zero-wyc** 开发，本项目保留原作者署名与 [MIT 许可证](UPSTREAM-LICENSE)。感谢原作者提供的播放器、同步、音乐、语音等基础功能。

第三方组件仍遵循各自许可证；本仓库的 `vendor/mediabunny` 文件保留 MPL-2.0 声明及本地修改记录，详见 [第三方说明](THIRD-PARTY-NOTICES.md)。本项目不附带服务端账号、受版权保护的影片或音乐资源。
