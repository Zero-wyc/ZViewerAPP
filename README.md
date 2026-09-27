# ZViewer for Android

<img src="public/favicon.jpg" alt="ZViewer" width="88" height="88" />

面向手机和平板的 ZViewer Android 客户端，使用 React、TypeScript 和 Capacitor 构建。播放、同步、音乐与语音模块基于 [Zero-wyc/ZViewer](https://github.com/Zero-wyc/ZViewer) 4.1.7 的前端代码适配。

本仓库是 **Android 客户端源码**，不是服务端，也不是直接加载远程网页的地址壳。应用界面与播放器随 APK 打包，通过你填写的服务器地址连接 ZViewer 服务。

[下载安装包](https://github.com/Zero-wyc/ZViewerAPP/releases) · [反馈问题](https://github.com/Zero-wyc/ZViewerAPP/issues) · [更新记录](CHANGELOG.md)

## 安装与连接

1. 从 Releases 下载 `ZViewer-Android-版本号-release.apk`，按系统提示允许对应来源安装应用。
2. 准备可访问的 ZViewer 服务端，在客户端填写服务器地址。
3. 使用服务器账号登录；服务器允许游客时，也可以游客身份进入。
4. 选择房间，或在服务器授权允许的情况下创建同步观影、一起听房间。

Android 工程最低版本为 Android 7.0 / API 24。请保持 Android System WebView / Chrome 更新；系统版本达到最低要求，并不代表所有媒体编码、WebRTC 或 Web Audio 功能都能在该设备上使用。当前适配基于 ZViewer 4.1.7，其他服务端版本需自行验证兼容性。

推荐 HTTPS。为兼容局域网部署，本应用允许 HTTP 和混合内容；不要在不可信网络中使用明文连接。服务器或反向代理需要允许客户端来源的 API 请求及 Socket.IO 连接，客户端不会绕过服务端权限或跨域限制。

**安装迁移提醒：** 当前包名是 `com.zviewer.mobile`，v1.1.0 使用本次 Android 适配的独立发布签名，不保证能覆盖安装仓库旧版本。不同包名可能并存；若已有同包名的调试版或其他签名版本，安装可能被拒绝。请先记录服务器地址和设置，确认需要后再卸载旧包；卸载会清除其本地数据。

## 功能

- 自定义服务端、账号或游客登录、会话恢复、房间列表与权限检查。
- 同步观影、片单、聊天、弹幕、字幕与播放控制。
- 一起听音乐，设置页适配窄屏，平板保留多列布局。
- 观看桌面端发起的屏幕共享；手机端不提供屏幕采集或发起共享。
- 房间语音：申请麦克风权限、加入与退出、静音和成员状态。折叠面板、切换标签或房间模式不主动结束通话。
- 顶栏旋转屏幕控制，全屏播放时保留播放器内的旋转入口。
- 手机字幕默认 12px，短边达到 600 CSS px 的平板默认 15px；可手动调整。
- 与原网页项目一致的应用图标，原生启动背景与即时加载页，加载异常时可重试。

媒体来源、账号服务和房间权限仍由服务端及对应平台决定。部分格式依赖设备解码能力；本项目不承诺支持所有媒体。

## 本地开发

推荐使用 Node.js 24 LTS、npm、JDK 21，以及包含 Android SDK Platform 36 / Build Tools 36 的 Android Studio。Gradle Wrapper 已包含在仓库内。工程的 Gradle daemon 配置使用 JetBrains JDK 21。

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

终端会显示访问地址。浏览器调试时仍需要自己的服务端；自动化测试则使用仓库内的模拟服务器。

```sh
npm test
npm run test:e2e
npm run build
```

端到端测试使用本机 Google Chrome，测试端口为 5187 和 3347。首次运行前请安装 Chrome。测试包含手机/平板布局、启动加载与重试、房间流程、屏幕共享接收、模拟麦克风语音链路及 16/24 位 FLAC 的实际 MSE 播放。

## Android 构建

先配置 `JAVA_HOME`、Android SDK（`ANDROID_HOME` 或本机 `android/local.properties`），再同步前端资源：

```sh
npm ci
npm run android:sync
npm run android:open
```

Windows PowerShell 调试包：

```powershell
cd android
.\gradlew.bat assembleDebug
```

输出：`android/app/build/outputs/apk/debug/app-debug.apk`。macOS / Linux 使用 `sh gradlew assembleDebug`。

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
cd android
.\gradlew.bat assembleRelease
```

输出：`android/app/build/outputs/apk/release/app-release.apk`。缺少签名配置时 release 构建会失败，不会把未签名包当正式包发布。发布前使用 Android SDK 的 `apksigner verify --verbose --print-certs` 检查 APK，并记录 SHA-256。

维护者应安全备份密钥与密码，后续版本继续使用同一签名。不要提交密钥、密码、SDK 本地路径或登录令牌。仓库不包含现有发布密钥，自行构建的签名包不保证能覆盖安装官方发布包。

## 目录

| 路径 | 用途 |
| --- | --- |
| `src/App.tsx` | 连接服务端、登录和房间大厅 |
| `src/mobile/` | 移动端房间布局与原生显示控制 |
| `src/upstream/` | 从 ZViewer 导入并适配的业务模块 |
| `android/` | Capacitor Android 工程与原生插件 |
| `public/` | 图标、字体及音频工作线程资源 |
| `vendor/mediabunny/` | 媒体库本地副本及 DTS / FLAC 补丁 |
| `tests/` | 单元测试、浏览器回归及模拟服务器 |

`scripts/generate-android-icons.ps1` 从 `public/favicon.jpg` 生成 Android 启动器图标。`scripts/import-core.mjs` 是维护用的上游导入工具，依赖相邻的 ZViewer 4.1.7 源码目录；普通安装、构建和测试**不需要运行它**。更新媒体库时请保留 [本地补丁](vendor/mediabunny/LOCAL-PATCHES.md)。

## 验证范围

自动化覆盖不等于所有设备实测。发布前已进行浏览器回归和 Android release 构建检查，但仍需在实际手机上确认原生粘贴菜单、旋转、麦克风权限、后台行为及具体媒体兼容性。

v1.1.0 修复了 24 位 FLAC 封装为 MP4 时位深声明不一致引起的 Chromium MSE 错误。回归使用合成音频，尚未取得用户原始报错媒体，因此不承诺所有类似播放错误均已解决。

## 致谢与许可

原项目由 **Zero-wyc** 开发，本项目保留原作者署名与 [MIT 许可证](UPSTREAM-LICENSE)。感谢原作者提供的播放器、同步、音乐、语音等基础功能。

第三方组件仍遵循各自许可证；本仓库的 `vendor/mediabunny` 文件保留 MPL-2.0 声明及本地修改记录，详见 [第三方说明](THIRD-PARTY-NOTICES.md)。本项目不附带服务端账号、受版权保护的影片或音乐资源。
