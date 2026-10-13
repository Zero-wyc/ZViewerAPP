# ZViewer Mobile Client

**本地候选 1.8.6**：针对最新服务端同步机制修复 iOS 进度反复纠偏、后台音乐换源及末尾拖动；Android/HarmonyOS 增加主页“关于应用”、启动检查更新和对应平台下载提示。iOS 为 **build 25**，双端为 **186**；安装包和验证见 [本地验证记录](docs/releases/client-1.8.6-local-validation.md)，尚未发布，新增行为待真机复验。

最新公开发行仍为 **1.8.5**。此前用户确认 build 23 的起播卡死、B站声音及同曲后台播放修复通过；后续反馈的同步纠偏和后台跨曲播放问题由本次候选处理，不将此前验收扩大到这些新场景。

<img src="public/favicon.jpg" alt="ZViewer" width="88" height="88" />

面向手机和平板的 ZViewer 客户端，支持一起看、一起听、投屏接收、房间语音、弹幕与字幕。三端均将界面与播放器打包进安装包，填写服务器地址后连接 [ZViewer 服务端](https://github.com/Zero-wyc/ZViewer)。本仓库提供 Android/HarmonyOS 共享前端、原生宿主及独立 iOS 工程源码。

[下载 1.8.5 安装包](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v1.8.5) · [反馈问题](https://github.com/Zero-wyc/ZViewerAPP/issues) · [更新记录](CHANGELOG.md) · [开发指南](CONTRIBUTING.md)

## 最新公开发行与三端状态

| 平台 | 版本 | 交付和目前状态 |
| --- | --- | --- |
| Android | **1.8.5 / 185** | 既有发布签名 APK；包含房间入口统一、评论侧栏简化、全屏默认横屏和打开的锁图标；本轮构建、签名、资源与 80 项回归通过。 |
| HarmonyOS | **1.8.5 / 185** | 既有发布签名 HAP；与 Android 共用业务和上述界面更新，使用 ArkWeb/ArkTS；本轮构建、签名、资源与 80 项回归通过。 |
| iOS | **1.8.5 / build 23** | **已可用，用户确认本轮真机测试全部通过。** 发布经过验收的原始 IPA，需自行签名安装；VLC 播放、B站声音、一起听后台/锁屏播放修复已进入包内。 |

[ZViewer-Client V1.8.5](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v1.8.5) 提供 APK、HAP、IPA 和三端 `SHA256SUMS.txt`。源码同步 [main](https://github.com/Zero-wyc/ZViewerAPP/tree/main)，本次 Release 标签包含三端源码，直接使用 GitHub 自动生成的 Source code（zip / tar.gz），不另上传源码 ZIP。iOS 沿用已验收 build 23，没有为发布重新构建 IPA。

服务端功能对齐基线为 **v4.5.3**（`9e2a0d4f3d9796067ac17274feabeccbb065d411`）；本次没有更新服务端。保留默认音乐音量、私人漫游续播、媒体库多版本/整季、番剧浏览、B站搜索和本机解析等既有功能。详见 [1.8.5 发行说明](docs/releases/client-1.8.5.md) 与 [三端发布验证](docs/client-v1.8.5-release-validation-20261013.md)。

## 安装与连接

| 平台 | 安装包与方法 | 系统要求 |
| --- | --- | --- |
| Android | 下载 `ZViewer-Android-1.8.5-release.apk`，允许安装该来源的应用后安装；相同发布签名可覆盖旧正式版。 | Android 7.0 / API 24 起；APK 含 ARM64 / x86_64，需要 64 位设备；保持 System WebView / Chrome 更新。 |
| HarmonyOS | 下载 `ZViewer-HarmonyOS-1.8.5-release.hap`，按设备支持的开发者安装/调试流程安装；可通过 DevEco Studio 或已连接设备的 HDC 安装。此 HAP 不是应用商店分发包。 | 工程最低 SDK `6.1.0(23)`，目标 SDK 26；本机发布 Profile 和设备授权限制以安装结果为准。 |
| iOS | 下载 `ZViewer-iOS-1.8.5-release.ipa`，用自己的证书及设备授权工具重新签名后侧载；不是直接点击即可安装的商店包。内置 Release JS，无需 Expo Go、Metro 或开发电脑。 | iOS / iPadOS 16.4 起，iPhone / iPad；签名有效期与安装设备资格由自己的签名方式决定。 |

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
- **弹幕/字幕**：连续选集、已添加标记、本地 XML/JSON、文本和 PGS 字幕；字号可调。iOS 补充弹幕显示区域 25%–100%，滚动与底部固定弹幕使用所选范围。
- **外观/布局**：深浅/系统主题、全局背景、手机和平板横竖屏、二级面板滚动与返回层级。Kazumi 仍需在设置中手动启用，公告继续排除。

## iOS 可用状态与验收

**iOS 1.8.5 / build 23 已处于可用状态。** 用户在 2026-10-13 明确反馈本轮“测试全部通过”，可使用此包安装体验；原 build 19/21/22 的问题与失败记录保留为历史，发行附件只使用已验收的 build 23。

本轮修复 VLC 回调与主线程互等，恢复正常起播和界面响应；B站分离音轨在输入就绪后挂载并允许失败重试；音乐使用独立后台音频标记、关闭隐藏视频/PiP、激活播放音频会话。原生补丁在云端依赖重装后重新应用并在编译前核验，产物检查覆盖完整二进制引用，避免把未打补丁的包当成新包交付。

179 项自动测试、lint、类型检查、两次云端补丁核验及设备 IPA 离线检查通过；用户确认解决了本轮报告的播放、声音和后台问题。该确认不扩写为未提供的设备型号、长时间压力测试或所有账号/媒体格式兼容结论。安卓鸿蒙此次版本重打包验证通过，新增原生旋转行为的物理设备专项沿用 [旋转验证记录](docs/client-fullscreen-orientation-validation-20261013.md) 的边界。

操作与维护见 [iOS README](ZV-iOS/README.md)、[iOS 维护文档](docs/ios-maintenance-architecture.md) 和 [build 23 验证记录](docs/releases/ios-1.8.5-23-validation.md)。由于云端 IPA 构建额度限制，后续 iOS 更新可能晚于 Android/HarmonyOS；界面通常先以 Expo Go 预览，原生修复在维护者明确授权后才构建。

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
