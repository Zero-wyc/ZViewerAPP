# ZViewer Mobile Client

**Android / HarmonyOS 1.8.6 已发布**：主页新增“关于应用”、当前版本、启动及手动检查更新，以及对应平台下载提示；界面跟随全局外观，双端构建号为 **186**。

**iOS 1.9.0 / build 26**：播放设置、弹幕类型、房间语音与房间设置对齐另外两端；投屏补齐全屏、刷新和聊天，屏幕方向改为一键切换，音乐菜单互斥并改善文字可读性。使用 Mac 本地 Xcode 构建设备 Release IPA，需自行签名后侧载，见 [iOS 1.9.0 发行说明](docs/releases/ios-1.9.0-release-notes.md)。

<img src="public/favicon.jpg" alt="ZViewer" width="88" height="88" />

面向手机和平板的 ZViewer 客户端，支持一起看、一起听、投屏接收、房间语音、弹幕与字幕。三端均将界面与播放器打包进安装包，填写服务器地址后连接 [ZViewer 服务端](https://github.com/Zero-wyc/ZViewer)。本仓库提供 Android/HarmonyOS 共享前端、原生宿主及独立 iOS 工程源码。

[下载安卓/鸿蒙 1.8.6](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v1.8.6) · [下载 iOS 1.9.0](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/ios-v1.9.0) · [反馈问题](https://github.com/Zero-wyc/ZViewerAPP/issues) · [更新记录](CHANGELOG.md) · [开发指南](CONTRIBUTING.md)

## 最新公开发行与三端状态

| 平台 | 版本 | 交付和目前状态 |
| --- | --- | --- |
| Android | **1.8.6 / 186** | 正式签名 APK；新增关于应用和更新检查，保持既有房间、全屏与本机解析行为。 |
| HarmonyOS | **1.8.6 / 186** | 正式签名 HAP；共用更新页，通过 ArkTS 读取原生版本并打开系统浏览器下载。 |
| iOS | **1.9.0 / build 26** | 未签名设备 Release IPA，需个人签名后侧载；界面已在模拟器检查，真实媒体、语音及后台专项边界见发行记录。 |

Android/HarmonyOS 继续使用 [ZViewer-Client V1.8.6](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v1.8.6)。独立 [iOS 1.9.0](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/ios-v1.9.0) 提供 `ZViewer-iOS-1.9.0-release.ipa` 和 `SHA256SUMS.txt`；Source code 使用该标签的 GitHub 自动源码归档，包含本次 iOS 修改。

保留服务端 v4.5.3 对齐的默认音乐音量、私人漫游续播、媒体库多版本/整季、番剧浏览、B站搜索和本机解析等既有功能。本地服务端源码已更新到 `89eafa5`，未修改 NAS 容器。详见 [1.8.6 发行说明](docs/releases/client-1.8.6.md) 与 [发布验证](docs/releases/client-1.8.6-publication.md)。

## 安装与连接

| 平台 | 安装包与方法 | 系统要求 |
| --- | --- | --- |
| Android | 下载 `ZViewer-Android-1.8.6-release.apk`，允许安装该来源的应用后安装；相同发布签名可覆盖旧正式版。 | Android 7.0 / API 24 起；APK 含 ARM64 / x86_64，需要 64 位设备；保持 System WebView / Chrome 更新。 |
| HarmonyOS | 下载 `ZViewer-HarmonyOS-1.8.6-release.hap`，按设备支持的开发者安装/调试流程安装；可通过 DevEco Studio 或已连接设备的 HDC 安装。此 HAP 不是应用商店分发包。 | 工程最低 SDK `6.1.0(23)`，目标 SDK 26；本机发布 Profile 和设备授权限制以安装结果为准。 |
| iOS | 下载 `ZViewer-iOS-1.9.0-release.ipa`，用自己的证书及设备授权工具重新签名后侧载；不是直接点击即可安装的商店包。内置 Release JS，无需 Expo Go、Metro 或开发电脑。 | iOS / iPadOS 16.4 起，iPhone / iPad；签名有效期与安装设备资格由自己的签名方式决定。 |

三端首次启动的操作相同：

1. 准备可访问的 ZViewer 服务端，在连接页填写完整 HTTP/HTTPS 地址；支持 HTTPS 优先探测。
2. 使用服务端账号登录；服务器允许游客时可选择游客身份。
3. 从大厅进入房间，按提示输入密码或等待房主审批；有创建权限时可新建房间。
4. 在房间中使用一起看、一起听或接收桌面端投屏；添加媒体、控制播放和管理成员按服务端角色/房主权限开放。

推荐使用 HTTPS；三端允许局域网 HTTP。Android/HarmonyOS 支持针对所选服务器的证书例外通道，不全局关闭 TLS 校验；iOS 尚无完整自签证书例外通道。反向代理需要允许客户端来源的 API 与 Socket.IO 连接。

Android 正式包名为 `com.zviewer.mobile`，调试包为 `com.zviewer.mobile.debug`。Android/HarmonyOS 沿用既有发布签名；其他人自行构建或使用不同签名的安装包不保证可以覆盖安装。iOS 更新时需沿用适当的个人签名身份。需要卸载时请先保存服务器地址和设置，卸载会清除应用本地数据。

## 三端房间操作

| 操作 | Android / HarmonyOS | iOS |
| --- | --- | --- |
| 房间信息、成员与设置 | 点右上角房间按钮；房主在此切换一起看/一起听，并管理名称、密码、审批、成员和分享。视频下方只保留聊天/片单，音乐头像菜单保留音乐功能。 | 点全局房间设置；模式统一显示“一起看 / 投屏 / 一起听”，房间信息、在线成员、加入条件与审批集中在此。一起看/投屏不再有重复房间设置。 |
| 添加和选择视频 | 在片单/添加影片中选择 B站、媒体库或其他来源；搜索、分 P、分集、多选/全选与添加按来源提供。 | 在添加影片中选来源；B站、媒体库、目录及番剧使用独立弹窗，可搜索、展开、选择 P/集及批量添加；一起听和关联视频复用同一套 B站选择器。 |
| 视频全屏与旋转 | 点全屏默认锁定横屏；需要跟随设备时点“打开的锁”解除锁定，与重载视频的圆箭头区分；退出全屏恢复自动旋转。 | 使用播放器全屏及旋转控制；浮动房间评论按钮在视频或歌曲全屏时隐藏，退出后恢复。 |
| 聊天和评论 | 视频下方进入聊天；一起听右侧把手展开评论侧栏，点把手收起。 | 右侧浮动评论按钮打开弹窗；可拖动更换位置并保存，避免挡住播放器操作；歌曲评论使用播放器内的弹窗。 |
| 语音 | 点顶部耳机按钮进入房间语音，首次授予麦克风权限；可以静音/取消静音、收起面板。 | 通过房间语音入口使用 LiveKit，首次授予麦克风权限；按角色权限控制静音与成员。 |
| 离房 | 使用顶部返回或房间面板的离开入口，确认后停止本机播放。 | 使用房间离开入口，确认后清理本机播放、系统媒体信息和语音会话。 |

投屏是接收桌面/网页端发起的屏幕共享；手机客户端不提供屏幕采集。观众播放控制按房主审批与服务端权限执行，不因客户端显示按钮而绕过授权。

## 一起听操作

1. 进入一起听后选择网易云或哔哩哔哩。网易云可搜索歌曲、导入歌单、浏览“我的”和推荐，登录后使用账号授权内容；B站可搜索/输入视频并选择 P。iOS 的搜索和“我的”采用弹出页，歌单页“搜索音乐”左侧的返回按钮可回到上一级。
2. 由房主播放或加入歌曲。展开底部播放器可查看封面、完整歌词和进度，拖动进度定位；可打开播放列表和歌曲评论。iOS 打开这些弹窗会保留歌曲全屏页，关闭后回到原播放页。
3. 点播放顺序图标直接循环切换 **顺序循环 → 按顺序播放 → 单曲循环 → 随机播放**；房主负责切换。按顺序播放到队列末尾会停止，除非当前开启了对应漫游/推荐续播；单曲循环重复当前歌曲。
4. 在音乐账户/设置里登录、选择音质和默认来源页。首次音量读取服务端默认值，有效本地音量优先；私人漫游和 B站末尾推荐按设置及账号权限工作。
5. iOS 一起听可返回桌面或锁屏继续播放当前曲，并使用系统播放信息与控件；本轮用户真机复验通过。后台音频继续播放与后台房间业务是不同能力：JS 被系统挂起时，尚无独立原生房间 Socket/自动切歌管线，不保证后台自动跨曲或完整房间同步。

## 视频来源与移动体验

- **B站**：支持关键词、分享链接、分 P、番剧/影视及本机账号授权；Android 内置 Go 代理，HarmonyOS 使用 ArkTS 解析桥，iOS 使用原生 Go/Objective-C 桥与 VLC。账号凭据保存在原生侧，画质按账号、影片与设备能力选择，默认排除 HDR/杜比视界。当前服务端一起听队列接收 BV/CID，PGC 可用于一起看及关联视频。
- **Emby/Jellyfin**：列表/海报墙、搜索、年份、剧集/季/单集导航、多版本、整季与按顺序批量添加；支持缺图占位和扩展目录。iOS 本轮 Jellyfin 点击播放卡死问题已修复并经用户测试。
- **片单**：完整标题、搜索、排序、删除/清空与权限控制；房主可开启默认关闭的自动连播，按完整片单播放至末尾。
- **弹幕/字幕**：连续选集、已添加标记、本地 XML/JSON、文本和 PGS 字幕；字号可调。iOS 支持在线弹幕搜索、显示区域 25%–100% 和固定 / 滚动 / 彩色 / 高级类型过滤，移除手动文件导入及 JSON 编辑。
- **外观/布局**：深浅/系统主题、全局背景、手机和平板横竖屏、二级面板滚动与返回层级。Kazumi 仍需在设置中手动启用，公告继续排除。

## iOS 1.9.0 界面与操作更新

播放设置仅保留字幕 / 弹幕页，移除音轨选择；四类弹幕可独立显示或屏蔽。方向按钮点击切换并锁定横竖屏，再次点击解除锁定；进入全屏锁横屏，退出恢复自动旋转。投屏提供全屏、刷新、暂停接收与内嵌聊天。房间面板集中展示模式、状态、分享、在线成员与审批；房间语音补充音量与成员状态。网易云导航和头像菜单互斥，采用不透明背景，“音乐设置”统一从头像进入。

源码检查及模拟器证据见 [界面对齐记录](docs/ios-player-share-ui-20261014.md)，设备 IPA 核验见 [1.9.0 构建记录](docs/releases/ios-1.9.0-26-validation.md)。

## iOS 1.8.6 本地修复与验证（历史）

2026-10-14 在 Mac 上根据实际反馈继续开发：聚合 HLS 保留服务器代理并改写相对清单，统一当前影片身份以避免暂停/恢复反复重载；VLC 跳转完成后执行最新播放意图。网易云曲尾续播修复迟到的 `:start-paused` 回调导致下一首停在 0 秒的问题，音乐进度条支持点击定位和暂停跳转。

模拟器已验证 B站与 Kazumi《败犬女主太多了！》播放、网页房主暂停/恢复和观众跳转；Jellyfin 同一动漫剧集播放、暂停跳转及中途重新加入也已验证。iOS 单独作为一起听房主的网易云末尾连续换曲通过。视频诊断按钮已移除，普通视频控制栏移到画面下方；自动续播放在搜索影片同一行，保留原业务页面主题。

本轮交付为本地设备 Release IPA 和 Git 提交，不将模拟器结果扩大为真机验收。后台当前歌曲音频和 Now Playing 接入保留；锁屏/控制中心按钮、后台自然自动跨曲、长期后台房间同步仍待验证，JS 被系统挂起时无独立原生房间业务连接。

构建与检查见 [iOS README](ZV-iOS/README.md)、[Mac 开发记录](docs/ios-mac-development-20261014.md) 和 [本轮 IPA 交付记录](docs/releases/ios-1.8.6-25-local-20261014.md)。本机可通过 Xcode 构建，无需消费 EAS 云端额度；未签名 IPA 需自行签名安装，包内包含 Release JS，无需 Metro 或 Expo Go。

## 本地开发与检查

使用 Node.js 24 和 npm；Android 原生构建还需要 Go 1.26.8、JDK 21、Android SDK Platform / Build Tools 36 和 NDK r30。HarmonyOS 使用 DevEco Studio 及对应 SDK，详见 [开发指南](CONTRIBUTING.md) 和平台维护文档。

```sh
npm ci
npm run dev -- --host 127.0.0.1
npm run test:adaptation
npm run test:media
npm run build
```

浏览器调试需要自己的 ZViewer 服务端。功能回归与搜索布局、音量、私人漫游验证见 [对齐记录](docs/client-v1.7.6-alignment-453-validation-20261013.md)。本轮 1.8.5 双端 Debug/Release 构建、包内版本、签名及各 29 个共享网页资源摘要检查通过，详见 [构建与发布验证](docs/client-v1.8.5-release-validation-20261013.md)；iOS 已获用户本轮真机通过确认，其他专项覆盖边界见记录。

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

共享业务通过 `src/platform/` 访问原生能力，不直接依赖 Capacitor 或 ArkTS。HarmonyOS 使用 `zviewerNative` 桥；iOS 独立移植业务和能力。Android/HarmonyOS 保留移动评论侧栏；iOS 已提供可拖动的浮动房间评论入口及播放器内歌曲评论弹窗。桌面式修饰键快捷唤出不移植，公告继续排除。

维护入口：[Android](docs/android-maintenance-architecture.md) · [HarmonyOS](docs/harmonyos-maintenance-architecture.md) · [iOS](docs/ios-maintenance-architecture.md) · [跨平台移植](PORTING.md) · [三端发布流程](docs/mobile-release-maintenance.md)。`scripts/import-core.mjs` 为维护用上游导入工具，普通安装、构建和测试无需运行；更新媒体库时保留 [本地补丁](vendor/mediabunny/LOCAL-PATCHES.md)。历史变更见 [CHANGELOG](CHANGELOG.md) 和 [Releases](https://github.com/Zero-wyc/ZViewerAPP/releases)。

## 致谢与许可

原项目由 **Zero-wyc** 开发，本项目保留原作者署名与 [MIT 许可证](UPSTREAM-LICENSE)，感谢原作者提供播放器、同步、音乐与语音等基础功能。

第三方组件遵循各自许可证；`vendor/mediabunny` 保留 MPL-2.0 声明和本地修改记录，详见 [第三方说明](THIRD-PARTY-NOTICES.md)。本项目不附带服务端账号、影片或音乐资源。
