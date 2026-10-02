# ZViewer-client 1.3.0 · Android / HarmonyOS

发布日期：2026-10-01。发布标签：`client-v1.3.0`。两端包名 `com.zviewer.mobile`，versionName `1.3.0`，versionCode `130`。

## 更新

- Android / HarmonyOS 共享业务对齐 ZViewer 服务端 v4.2.1，包括观影、同步、音乐、语音与媒体路径适配；保留各平台原生 B 站代理。
- 连接页、房间列表、观影和一起听共用全局背景、深浅主题与玻璃参数；切换主题保持活动媒体元素。
- 修复浅色播放设置白色文字与继承阴影，账号入口采用主题强调色。
- 去掉弹幕分组的不透明底色及内部 main/side 重复模糊，消除淡白色矩形背景。
- 更新 Android/HarmonyOS 维护资料与双端发布流程；清理旧测试、fixture 和过程配置，修正 CI 调用已删除测试命令的问题。
- iOS 不改动、不发布；本标签的 iOS 源码保持此前 GitHub 主分支状态，不包含本机尚未发布的 iOS 提交。

## 验证

在独立发布工作区执行 npm ci、TypeScript/Vite、Android sync、HarmonyOS rawfile sync、Gradle release/debug 与 Hvigor release/debug 构建。Android 和鸿蒙均用相对资源路径，12 个共享产物 SHA-256 逐一一致；鸿蒙入口另含 ArkWeb 桥接启动脚本。

Android Medium_Phone（API 36、16 KB 页）与 DevEco Pura 90 Pro（HarmonyOS 7/API 26）手机模拟器通过 adb/hdc/CDP 检查浅/深色列表、观影、横屏全屏设置、弹幕字体页、系统返回和旋转恢复。正文颜色、次级文字、强调色、设置标签和视频持续性一致；内部模糊为 none、分组透明、播放器画布黑色。使用用户 `S01E04.mp4` 检查实际视频播放。原会话与偏好在结束时恢复，测试服务和临时转发关闭。

APK 经 apksigner 校验，非调试正式包，签名证书 SHA-256 与前版一致：`51b892a049a1650a03dc0a3baf9406db85b9fb91267851f15ee697df2d2ccc9b`。HAP 经 hap-sign-tool verify-app 校验，release profile、代码签名及摘要验证通过；release BuildProfile.DEBUG=false。

## 安装附件

- `ZViewer-Android-1.3.0-release.apk`：签名 APK，arm64-v8a / x86_64，最低 Android API 24、目标 API 36。
- `ZViewer-HarmonyOS-1.3.0-release.hap`：签名 HAP，最低 HarmonyOS 6.1 / API 23、目标 API 26，沿用鸿蒙发布签名。安装仍受设备对签名来源的分发要求约束。
- `ZViewer-client-1.3.0-source.zip`：本标签完整 Git 源码快照，不包含依赖目录、生成资源、过程文件、私钥或本机配置。
- `SHA256SUMS.txt`：上述附件的完整性校验。

APK SHA-256：`0e19ed6c4187195c442d26973f1941b1a0eb4f527a25551164367ad3b3f572f6`。

HAP SHA-256：`589b2eafb149f71083f7f4a4cb028c924c4fa5d056e4842dee1ae72873cb863a`。

## 验证范围

应用内共用 UI 已在两个手机模拟器对照；系统字体、安全区、系统栏及设备解码器由各平台决定。本轮没有新增平板、真机、蓝牙/耳机或真人语音听感验收。Pura 90 Pro 模拟器仍不能解码两部用户 HEVC Main 10 MKV，H.264 可播放；解封装、字幕提取或 MIME 支持不能当作视频解码通过，详见鸿蒙 v4.2.1 适配报告。
