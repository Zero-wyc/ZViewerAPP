# iOS 1.2.1 / build 11 unsigned 交付

2026-09-30。基线 commit：e19f094；本版提交见 Git 日志。[原计划](../ios-continuation-plan.md)。

用户反馈上一轮视频播放、B站扫码、番剧和挂载视频正常。本版针对自动起播、播放条位置、全屏/旋转及 Android 页面差异修正客户端，**b11 真机复验仍待完成**。按最新要求仅提供 unsigned，不使用所提供的证书签名本版；服务端保持原有行为。

## 改动

- 对照离线 Android 平板虚拟机核对两种模式，连接隔离本地 v4.2.0，没有连接 NAS。一起看采用图标导航、评论/轨道/实时弹幕分区和可收起侧栏；一起听采用网易云/哔哩导航、折叠菜单、我的音乐登录页、居中播放条、队列及歌词面板。保留原有权限和同步行为。
- 时间/进度/播放/设置/全屏控件覆盖在视频内，字幕/弹幕及诊断改为设置面板，避免展开内容挤占视频。
- 全屏复用同一 VLC 实例，移除外层边距/安全区及房间 UI，填满可用窗口；退出恢复房间布局及之前方向策略。旋转只切换方向，按实际视频容器尺寸更新弹幕布局。
- iPad 设置 `UIRequiresFullScreen` 以允许方向锁，**本版关闭 Split View**。原生方向和画面比例需要用户复验。
- JS 和原生初始化前保留播放意图；初始暂停回调及加载期间的房主心跳不再将选片起播状态覆盖为暂停；仍支持加载中主动暂停和旧源回调隔离。
- 网易云登录状态按 v4.2.0 原始 DTO 读取，不要求不存在的 `success` 字段；扫码成功刷新歌单页，退出后恢复未登录界面。
- 文件/音乐/HTTP-FLV 继续单一 VLCKit，保留统一适配接口和服务端 8 MiB Range 上限。共享 Go、Android、鸿蒙及服务器实现未改。

## 包与构建

- [EAS build 11](https://expo.dev/accounts/YOUR_ACCOUNT/projects/zviewer-ios/builds/3f8cb619-c4c1-4a40-9e23-ef0cd0903c6d)：FINISHED，2026-09-30 06:04:07 UTC。
- 本地目标：`ZV-iOS/release-assets/ZViewer-1.2.1-b11-unsigned.ipa`，不提交 IPA 到 Git。用户自行签名安装；Release 内置 JS，不用 Metro，Expo Go 不能验收原生模块。
- 构建不要求 Apple 登录或设备注册；无 app 签名、描述文件或签名目录。ARM64 device/Mach-O IOS(2)，不使用模拟器包替代。

- IPA：**46,407,465 bytes**；SHA-256：`78ab5b572f0e3d129fa41f9674416b033e6d103682c5751e5b9dbc8a1e749537`，下载后与构建端摘要一致。
- com.zviewer.mobile；1.2.1 / 11；Mach-O ARM64 / platform IOS(2)，无应用签名/加密/描述文件/签名目录。
- 内置 JS **2,988,799 bytes**，包含新版房间和音乐代码；VLCKit/WebRTC/Hermes、B站/语音桥接类、麦克风说明、background audio、LocalNetworking 及图标字体齐全。
- 离线确认 `UIRequiresFullScreen=true` 及横竖屏声明；保留 BILICORE-LICENSE / OPUS-LICENSE。Opus host 50 帧编解码 smoke 通过，非真机采集结论。

## 证据及边界

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| 单测/lint/类型 | 35/35、通过、通过 | 含初始化前起播/延迟暂停回归；非设备解码 |
| iOS/Web 导出 | 通过 | 非真机运行 |
| Doctor | 20/21 | WebRTC New Architecture 未测试、本地模块无 Directory 元数据，未屏蔽 |
| 本地 UI | 30/30，零 JS 异常 | 两模式 1180×820/820×1180/390×844；全屏容器/控件、旋转操作、真实登录状态/退出；扫码/歌单/搜索 fixture，队列真后端 |
| Android 参考 | 实际平板虚拟机对照 | 截图为本地测试房间，不是 NAS；iOS 截图是 Web 布局预览，非 VLC 真机画面 |
| 历史协议/DAV | 16/16、7/7 | 沿用 b9 本地证据，语音/挂载为合成数据，未新增真机结论 |
| 历史桌面/原网页 Range | 脱敏记录核对通过 | 非 iOS VLCKit 长播放、短206及流量证明 |
| 服务器文件 | 三文件与原始备份 SHA 一致 | serverFiles.ts / range-stream.ts / http-proxy.ts，未改变分片行为 |
| EAS / IPA | FINISHED / 离线检查通过 | 设备编译、桥接、JS/字体/许可证、unsigned/方向声明/SHA，非真机布局验收 |

[脱敏记录](ios-1.2.1-11-evidence.json)。UI 对照：[Android 一起看](ios-1.2.1-11-ui/android-watch.png)、[iOS Web 一起看](ios-1.2.1-11-ui/ios-web-watch.png)、[Android 一起听](ios-1.2.1-11-ui/android-music.png)、[iOS Web 一起听](ios-1.2.1-11-ui/ios-web-music.png)。尺寸/安全区和字体存在平台差异，未声明像素完全一致。

## 用户复验

优先验证：选片即起播；播放条在视频内；全屏填满并能退出；反复横竖屏旋转后视频比例、侧栏、按钮及房间 UI 正常；一起看/一起听对照 Android。随后复验网易云真实扫码、歌单/VIP/歌词及后台播放。

用户的上一轮反馈未包含系统/时长/具体编码/seek/流量记录，不扩大为全部播放矩阵通过。十分钟 MKV/MP4/HLS、短206/seek/流量、分离音轨/PiP/后台、语音麦克风/回声/蓝牙/跨端、B站高画质/分P/过期、共享接收及权限/同步仍按原 plan 逐项记录。VLCKit4.0.0a24 为预发布版。

没有真机通过标签、push、TestFlight 或商店发布。b10 是中间构建，安装 b11。
