# Android / HarmonyOS 维护与发布

更新日期：2026-10-01。当前双端版本为 1.3.0 / 130，目标服务端 v4.2.1。iOS 是未完善的独立工程，本次保持 GitHub 主分支已有源码不变，不同步资源或发布 iOS 安装包。

## 源码与资源

产品行为修改仓库根 `src/`；Android 的 Capacitor 和 HarmonyOS 的 ArkWeb 同时消费该共享前端。外观判断使用 `isGlobalAppearanceRuntime()`，不要给两端复制独立 CSS。设备字体、系统安全区、系统栏与媒体解码器仍由平台决定，验收比较应用内控件、颜色、布局和交互。

同步分别运行 `npm run android:sync` 和 `npm run harmony:web`。Android 生成资源在 `ZV-Android/app/src/main/assets/public`；鸿蒙资源在 `ZV-HarmonyOS/entry/src/main/resources/rawfile/web`。这些目录由构建生成，不直接修改或提交。鸿蒙在同步时插入本地桥接启动脚本，两端网页入口允许不同，但共享 JS/CSS/字体等资源应与本次构建一致。

播放器画布和基础控件保持深色。播放设置 dialog 使用主题文字及表面变量、取消继承的文字阴影；只让外层 card 提供玻璃，内部 main/side 禁用模糊，弹幕分组透明。浅色强调文字为 `#1463b6`，正文为 `#1c293a`，次级为 `#43566b`。

## 版本与签名

同时更新根 `package.json`、`package-lock.json`、Android `app/build.gradle` 和鸿蒙 `AppScope/app.json5`，两端 versionCode 必须高于旧版。iOS 版本与依赖不属于本次发布范围。

Android 使用仓库外持久发布密钥，通过 `ZVIEWER_KEYSTORE`、`ZVIEWER_STORE_PASSWORD`、`ZVIEWER_KEY_ALIAS`、`ZVIEWER_KEY_PASSWORD` 注入 Gradle，运行 `assembleRelease`。发布前以 apksigner 验证签名，并与上一版证书 SHA-256 比较。

HarmonyOS 使用 DevEco Studio 的本机签名配置，运行 release `assembleHap`，保持最低兼容 6.1 / API 23。仓库中的 `build-profile.json5` 保持无私钥和密码的模板；本机签名材料与路径仅用于本地构建，不进入提交或源码 ZIP。release 禁用 ArkWeb 调试。

## 验收与清理

优先通过 adb / hdc 命令行安装，使用 debug 包的 WebView/ArkWeb CDP 检查实际打包界面。Android 手机模拟器与 DevEco Pura 90 Pro 手机模拟器分别检查浅/深色连接与列表、播放设置、弹幕字体页、横竖屏、全屏、原生返回、主题持久化及切换后的媒体 DOM 持续性。测试服务器使用隔离数据库和只读用户视频；结束恢复原连接与偏好，关闭服务器并撤销转发。

从交付树清理旧测试目录、fixture、废弃测试命令、编辑器过程目录及临时缓存；保留平台原生源码、Gradle wrapper、Go 模块、网页静态资源、媒体库及许可证。删除前核对构建依赖，删除后重新构建两端。iOS 目录、测试和其维护资料不在本次清理范围。历史适配报告保留有用的编码与设备限制证据，过程脚本、账号数据、日志与密钥不发布。

## GitHub 发布

本仓库沿用一个双端 Release：`client-v1.3.0`，包含签名 APK、签名 HAP、对应提交源码 ZIP 和 `SHA256SUMS.txt`。不上传 APP 上架包、AAR、私钥、服务器数据或 iOS 安装包。发布说明列出设备实测和已知限制；不能把解析成功当作媒体解码通过。

CI 只执行现有的依赖安装、共享前端同步和 Android debug 构建；已删除的测试命令不能继续留在 workflow。源码发布应核对目标提交、附件版本与 SHA-256 一致。
