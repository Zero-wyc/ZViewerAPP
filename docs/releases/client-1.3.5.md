# ZViewer-client 1.3.5 · Android / HarmonyOS

发布日期：2026-10-01。标签：`client-v1.3.5`。两端包名 `com.zviewer.mobile`，versionName `1.3.5`，versionCode `135`，目标 ZViewer 服务端 v4.2.1。

## 🚀 新特性 / Features

- 收起播放器的下箭头增加浅色圆形底板、深色图标、描边和阴影，触控区为 44px，提升黑色视频背景下的可见度。

## 🐛 错误修复 / Bug Fixes

- Android/HarmonyOS 一起听固定使用折叠导航，取消“展开完整导航”。旧版保存的展开偏好不会恢复完整导航，手机横屏与原生宽屏也保持折叠；四个网易云分区与哔哩哔哩入口保留。
- 音乐导航和账户菜单玻璃背景随深浅主题变化，修复浅色文字与强制深色底板的低对比度。
- 纯净视频完整显示画面，停止背景裁剪、拉伸、模糊和缩放；解除滑入动画对固定定位的影响，覆盖整个视口。退出恢复原背景偏好，视频元素持续复用；原生返回优先退出纯净模式。
- 修复无当前歌曲时音质状态反复重置引起的无限重渲染，空队列可正常打开和收起播放器。

## ⚠️ 破坏性改动 / Breaking Changes

- 无服务端协议或数据迁移改动。移动端移除完整导航切换入口；桌面网页保留完整导航。

## ⚡ 性能优化 / Performance Improvements

- 消除空队列播放器的重复渲染循环；纯净模式切换保留视频元素与播放引擎。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 更新 Android/HarmonyOS 维护架构、双端发布流程、HarmonyOS 构建说明、README 与更新记录，补充一起听的维护位置和回归清单。
- 双端版本同步为 1.3.5 / 135，沿用各自发布签名。依赖版本无新增调整；iOS 保持 GitHub 1.3.2 的源码不变，本次不发布 iOS 安装包。

## 验证与限制

- TypeScript/Vite、Android Capacitor 同步、HarmonyOS 网页同步、Gradle debug/release 与 Hvigor debug/release 构建通过。
- 浏览器、Android 手机模拟器 WebView、HarmonyOS Pura 90 Pro 模拟器 ArkWeb：用同一源码编译的实际 `MusicAppShell` 验证旧展开偏好、412px/892px/1280px 视口导航、四分区选择、深浅菜单、黑色视频画布上的箭头、三秒隐藏、点击关闭以及空队列打开播放器。没有组件运行时错误。
- 通过实际 `PlayerBackgroundLayer` 和 `useImmersiveMode` 验证三种背景偏好、横竖屏完整画面、无模糊/缩放、同一视频元素持续播放、退出恢复偏好、单击暂停/继续、双击与 Escape 退出；鸿蒙额外验证原生桥横竖屏旋转。
- 发布 APK/HAP 中的 12 个共享构建资源与 `dist/`、两端宿主资源按 SHA-256 比较一致。APK apksigner、HAP hap-sign-tool 验签与摘要检查通过，证书与旧版一致；正式 HAP `debug=false`，ArkWeb 调试关闭。
- 本轮验证使用模拟器和合成视频，黑色视频画布用于箭头对比度检查；未新增真实 B 站 CDN/DASH 解码、真机、平板硬件、蓝牙和长时间后台专项验收。宽屏检查指 CSS 视口，不能替代平板真机检查。

## 安装附件

- `ZViewer-Android-1.3.5-release.apk`：正式签名 APK，最低 Android API 24，目标 API 36，可覆盖同签名旧正式版。
- `ZViewer-HarmonyOS-1.3.5-release.hap`：release 签名 HAP，最低 HarmonyOS 6.1/API 23，目标 API 26；安装须符合设备的签名分发规则。
- `ZViewer-client-1.3.5-source.zip`：本标签 Git 快照，排除依赖、生成资源、临时验证数据、本机配置及签名材料。
- `SHA256SUMS.txt`：上述三个附件的 SHA-256 校验。

---
**完整变更记录**：[client-v1.3.2...client-v1.3.5](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v1.3.2...client-v1.3.5)
