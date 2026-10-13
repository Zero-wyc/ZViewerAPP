# ZViewer-Client V1.8.5

🎉 **三端统一 1.8.5，iOS 已可用！** Android / HarmonyOS 为 **1.8.5 / 185**，iOS 为 **1.8.5 / build 23**。2026-10-13 用户确认 iOS 本轮真机测试全部通过，本次直接发布经过验收的 IPA，不重新消耗云端构建额度。

| 平台 | 当前状态与附件 |
| --- | --- |
| Android | 正式签名 `ZViewer-Android-1.8.5-release.apk`；纳入此前本地房间与旋转更新，版本、签名、资源和回归核验通过。 |
| HarmonyOS | 正式签名 `ZViewer-HarmonyOS-1.8.5-release.hap`；与 Android 共享业务和界面更新，使用 ArkWeb/ArkTS，版本、签名、资源和回归核验通过。 |
| iOS | **已可用，用户真机测试全部通过**；`ZViewer-1.8.5-b23-unsigned.ipa` 为未签名设备包，需个人签名后安装，内置 Release JS，无需 Metro/Expo Go。 |

功能对齐基线继续为服务端 v4.5.3（`9e2a0d4f3d9796067ac17274feabeccbb065d411`）。源码发布到 main，本次标签包含完整三端源码；使用 GitHub 自动生成的 Source code（zip / tar.gz），不单独上传源码附件。完整操作见 [README](https://github.com/Zero-wyc/ZViewerAPP/blob/main/README.md)。

## 🚀 新特性 / Features

- **Android/HarmonyOS 房间入口统一**：视频下方只保留聊天/片单，右上角房间按钮集中模式切换、房间设置、成员、审批、分享及离房；音乐头像菜单保留账号和音乐功能，一起听右侧面板只显示评论。
- **Android/HarmonyOS 全屏体验**：视频进入全屏默认锁定横屏，退出恢复自动旋转；全屏内可手动解锁，解锁按钮使用“打开的锁”，与重载视频圆箭头区分。
- **iOS 三种房间模式**：一起看、投屏、一起听；房间设置集中在全局入口，删除一起看/投屏和音乐账户菜单中的重复房间设置。
- **iOS 音乐操作**：搜索和“我的”采用弹出页，歌单增加返回上一级；四种播放顺序使用图标点按直接循环切换，加入按顺序播放与单曲循环。歌曲评论、播放列表在播放器内弹出，关闭后保留歌曲全屏页。
- **iOS 评论与弹幕**：房间评论使用右侧可拖动浮动按钮，保存位置并限制边界，视频/歌曲全屏时隐藏，退出后恢复；弹幕补充 25%–100% 显示区域。
- **iOS B站入口复用**：一起看、一起听及歌曲关联视频共用输入、搜索、账号、画质、解析与选 P，消除重复栏目；来源文字与箭头对齐。

## 🐛 错误修复 / Bug Fixes

- 修复 iOS 媒体加载/点击播放导致整页卡死的原生线程等待链：在创建 VLC 播放器前配置主队列异步事件回调，系统进度、中断和路由通知不再同步等待 UI；销毁前解除 delegate。
- 修复 iOS B站一起看有画面无声：分离音轨延后到播放输入就绪后挂载，只有成功后去重，失败允许重试；媒体来源恢复和跨端地址准备保留权威 BV/CID/P 身份。
- 修复 iOS 一起听返回桌面/锁屏后暂停：音频视图使用独立后台标记、关闭隐藏视频/PiP，后台配置并激活 playback 会话；空闲旧语音引擎不再改写共用音频会话。用户确认本轮起播、B站声音与后台播放测试通过。
- 修复一起听曲尾拖动后的无法播放与旧播放器事件污染；断线重连保留播放器，系统媒体在加载阶段登记；保留用户主动暂停意图和房主/观众控制权限。
- 修复 EAS prebuild 重装依赖覆盖 VLC 补丁：重装后重新应用，编译前强制核验。修正产物校验使用 macOS strings 漏扫段外导入类信息的误报，改为核验完整主程序字节和 VLCKit framework 定义。
- Android/HarmonyOS 保留隐藏房间面板的事件监听、嵌套返回及评论把手收起；显示操作串行执行，跳过过时请求，迟到全屏锁定由退出操作恢复，系统栏失败仍尝试恢复方向。

## ⚠️ 破坏性改动 / Breaking Changes

无新增服务端破坏性协议。Android/HarmonyOS 使用 1.8.5 / 185，iOS 使用独立内部构建号 23；显示版本统一，内部构建号无需相同。

- Android：Android 7.0 / API 24 起，64 位 ARM64/x86_64；沿用既有发布签名。
- HarmonyOS：工程最低 `6.1.0(23)`、目标 SDK 26，HAP 沿用既有签名；按设备开发者安装与 Profile 授权流程安装。
- iOS：iOS/iPadOS 16.4 起，iPhone/iPad；IPA 未签名，需自行签名侧载，不是 App Store/TestFlight 分发。旧 build 19/21/22 不作为当前可用包推荐。

iOS 当前曲后台持续播放已经用户验收；JS 被系统挂起时仍没有独立原生房间 Socket/自动切歌管线，不保证完整后台房间同步或自动跨曲。完整自签 HTTPS 证书例外尚未实现；来源需 Origin/Cookie 的部分聚合 HLS 仍受既有支持范围限制。手机客户端提供桌面投屏接收，不提供屏幕采集；一起听服务端队列当前接收 BV/CID，PGC 用于一起看及关联视频。公告继续排除。

## ⚡ 性能优化 / Performance Improvements

- 异步 VLC 回调移除底层锁持有期间对主线程的同步等待，恢复加载和播放控制期间的界面响应。
- 复用 B站选择与解析组件，保留取消代次、成功添加去重和音轨成功挂载去重，减少重复请求/添加。
- Android/HarmonyOS 房间设置保持业务监听而只隐藏面板，减少重复面板和模式切换时的状态断层；全屏显示请求合并过时操作。
- 延续自适应海报/搜索网格、手机和平板横竖布局、私人漫游会话复用和候选去重。

## 📖 文档与依赖更新 / Documentation & Dependencies

同步 README、CHANGELOG、三端维护文档和发布流程，README 完整补充三端安装、连接、房间入口、全屏、评论、音乐四种顺序与后台操作。iOS 从历史待验收状态更新为本轮用户真机确认可用，保留每次测试/构建的历史记录和当前后台业务限制。

Android/HarmonyOS 本轮未升级依赖，继续通过 `android:sync` / `harmony:web` 生成网页；iOS 保持独立 Expo SDK 57、React Native 0.86.3、VLCKit 和 LiveKit 工程。

验证：Android/HarmonyOS 76 项适配 + 4 项媒体回归、TypeScript/Vite、双端 Debug/Release 构建、原签名证书核对、各 29 个包内网页资源摘要通过；此前房间布局 30 组、旋转桥接界面 8 组检查记录保留。新增原生旋转的物理设备专项未扩写为已验收。iOS 179 项测试、lint/typecheck、两次云端源码补丁核验、完整二进制配置引用、139 项 ZIP CRC 和构建机/下载 SHA-256 一致；用户明确反馈本轮真机测试全部通过，不虚构设备型号或所有媒体格式/账号权限覆盖。

三端安装包、源码与自动源码归档均按发布范围审计账号凭据、私钥、签名材料与 AGENTS.md。发布附件为 APK、HAP、已验收 IPA 和三端 `SHA256SUMS.txt`。证据见 [三端发布验证](https://github.com/Zero-wyc/ZViewerAPP/blob/main/docs/client-v1.8.5-release-validation-20261013.md)、[iOS build 23](https://github.com/Zero-wyc/ZViewerAPP/blob/main/docs/releases/ios-1.8.5-23-validation.md)、[房间界面](https://github.com/Zero-wyc/ZViewerAPP/blob/main/docs/client-room-ui-validation-20261013.md) 与 [旋转验证](https://github.com/Zero-wyc/ZViewerAPP/blob/main/docs/client-fullscreen-orientation-validation-20261013.md)。

---
**完整变更记录**：

[client-v1.8.0...client-v1.8.5](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v1.8.0...client-v1.8.5)
