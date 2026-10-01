# ZViewer-client 1.3.2 · Android / HarmonyOS

发布日期：2026-10-01。标签：`client-v1.3.2`。两端包名 `com.zviewer.mobile`，versionName `1.3.2`，versionCode `132`，目标 ZViewer 服务端 v4.2.1。

## 更新

- 修复 B 站房主播放状态早于影片列表到达时的本机解析竞态；移动端按自己的账号、代理实例和影片资料获取媒体源，避免误用房主电脑的 `127.0.0.1:9333`。
- 鸿蒙 CDN 代理保留签名 URL 查询参数，修正 User-Agent、Referer、可信备用地址和 Range/HEAD 响应处理，解决解析成功后视频仍无法播放的问题。
- Android 与 HarmonyOS 原生窗口支持透明系统栏与全面屏；系统栏、cutout 和导航区通过原生安全区同步到共享 CSS，图标颜色跟随深浅主题。
- 提升浅色首页访客说明、账号入口、房间在线状态与错误提示的对比度，修复播放设置的多余淡白色背景层。
- 整理两端维护说明，源码附件为本标签 Git 快照。iOS 源码保持此前 GitHub 主分支状态，不更新或发布 iOS 安装包。

## 验证

TypeScript/Vite、Android/HarmonyOS 共享资源同步、Gradle release 与 Hvigor release 构建通过。正式包版本 1.3.2 / 132；共享构建资源校验一致，鸿蒙额外注入 ArkWeb 桥接。

本次修复代码在 Android 手机模拟器、DevEco MatePad Pro 模拟器通过真实 B 站账号与 CDN 播放检查。Android 测得 1080P+ H.264/AAC、本机 Range/206、连续播放和延迟片单加载；鸿蒙测得 H.264/AAC 解码、Range/206 与横屏全屏。两端均无媒体请求发往房主电脑的 9333；浅/深色文字与原生安全区通过检查。用户确认当前客户端问题已解决后授权本次正式发布。

Android 触控暂停/拖动专项自动化没有完成全部稳定断言，不据此声明所有交互已专项通过。原 HEVC Main 10 在既有鸿蒙手机模拟器的解码限制仍存在，真机编码、蓝牙和长时间后台未新增专项测试。

## 安装附件

- `ZViewer-Android-1.3.2-release.apk`：正式签名 APK，沿用此前发布证书，可覆盖同签名旧正式版；最低 Android API 24，目标 API 36。
- `ZViewer-HarmonyOS-1.3.2-release.hap`：release 签名 HAP，沿用此前鸿蒙签名，最低 HarmonyOS 6.1/API 23，目标 API 26。安装受设备的签名分发规则约束。
- `ZViewer-client-1.3.2-source.zip`：对应本标签源码，不含依赖目录、生成产物、临时验收脚本、账号数据、签名材料或本机配置。
- `SHA256SUMS.txt`：上述三个附件的 SHA-256 完整性校验。

APK 使用 apksigner 验签并核对与 1.3.0 发布证书一致；HAP 使用 hap-sign-tool 验证签名和摘要，release 的 ArkWeb 调试关闭。附件完整哈希以发布校验文件为准。
