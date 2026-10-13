# iOS 1.7.5 / build 17

> 2026-10-13 运行反馈补充：此 IPA 存在 RN `throwIfAborted` 缺失引发的媒体添加/漫游错误，以及普通 B站 UGC 响应字符串解析错误。已在 [后续源码修复与预览](ios-follow-up-fixes-2026-10-13.md) 修正，旧 IPA 不包含修复。本页为历史构建记录，不能视为这些功能的真机验收。

本版按 [iOS 更新计划](../ios-follow-up-update-plan-2026-10-12.md) 和双端 1.7.5 / 175 对齐。用户已确认 Expo Go 界面验证通过，本轮继续复核 B站解析、搜索、播放和服务端 v4.5.1 的 LiveKit 新接口，再生成真机 ARM64 IPA。

## 🚀 新特性 / Features

- 包含本轮预览实现的媒体库搜索、整季选集、影片版本、番剧/影视检索和分集、清空/排序/续播、一起听来源与讨论、PGS 同步及连接路径处理。详细范围见 [源码预览记录](ios-next-preview-2026-10-12.md)。
- 房间语音使用 LiveKit：`POST /api/voice/token` 获取 `{ success, url, token }`，保留服务端返回的信令地址；SDK `Room.connect` 自动订阅远端音轨，默认只听。麦克风由用户主动授权开启，管理操作调用 `/api/voice/mute` 和 `/api/voice/kick`，使用 LiveKit participant identity。

## 🐛 错误修复 / Bug Fixes

- 修正共享 Go WBI 字符重排表、空格编码和特殊字符过滤；iOS 原生搜索签名明确使用 ASCII 安全字符集，中文关键词按 UTF-8 百分号编码。
- 按分 P 返回的 CID/epId 再解析，避免番剧换集携带上一集身份。取消或换账号后旧解析不能交给播放器；番剧本机解析门控早于服务端回退。
- 后台、离房或管理员禁言在开启麦克风期间到达时，发布完成后再次检查并关闭采集；解禁不会自动开启用户麦克风。RTC globals 只注册一次。
- 原生解析响应先验证字典类型，并将地区限制、会员权限、登录失效与 CID 不匹配显示为对应业务提示。

## ⚠️ 破坏性改动 / Breaking Changes

- 本版语音要求支持 LiveKit 新接口且正确配置 LiveKit 的服务端。旧 Socket.IO 音频帧协议不再承担房间通话。
- IPA 延续个人侧载的未签名方式，安装前需签名。iOS 最低版本 16.4，同时支持 iPhone/iPad。

## ⚡ 性能优化 / Performance Improvements

- 保留按服务器/账号/媒体/画质隔离的解析缓存和过期任务失效；音频会话初始化与释放串行执行，避免房间切换时互相覆盖。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 应用版本、package 版本与 lock 根版本均为 1.7.5；iOS buildNumber 从 16 递增到 17。
- LiveKit RN 3.0.0、其 WebRTC 144.2.0、Expo 插件 1.0.3、JS SDK 2.22.3。房间语音与屏幕分享共用 LiveKit 的 WebRTC 包，移除另一套原生 WebRTC。
- 上传排除 AGENTS.md、环境变量文件、签名材料、开发日志和本地测试工具；仅上传审核后的 12 文件原生 Go 源码清单。源码基线为 `a8abd646e0071a0708a4614e18d9d6cc31389f70`。

验证证据：

- JS 自动化测试 **96/96**；lint、TypeScript 检查通过。
- Go 核心/移动服务测试 **11 项**通过：PGC 身份/权限/试看、普通视频第 2 P + DASH/AAC、WBI 固定向量、短链无凭据重定向、Range/TLS/WebSocket 与撤销。
- B站匿名公开接口实测：nav 提供 WBI key；签名视频信息 `code=0`；中文关键词搜索 `code=0`，20 条结果。该检查没有使用个人账号或 Cookie。
- macOS 构建机编译并运行实际 `ZVBiliSigning.m` 的中文/特殊字符签名检查；Opus 主机编码解码检查通过。这些检查不等同于 iPhone 音频采集验收。

EAS 构建 `89ddf07c-5855-46dd-b40b-6d09e58843aa` 于 2026-10-12 20:17:36（Asia/Shanghai）完成。实际文件 `ZV-iOS/release-assets/ZViewer-1.7.5-b17-unsigned.ipa`，**47,277,098 字节**；SHA-256 与构建机一致：`cfa4bd0478892f6ba21af4154c020eef3e75d7f52258e36a81615ede74a51302`。

本地检查实际 IPA 确认：1.7.5 / 17、设备 ARM64/platform IOS、iPhone/iPad、最低 iOS 16.4、未签名且无 provisioning profile；内置 Release JS、VLCKit、LiveKitWebRTC 及 LiveKit/Expo/B站桥。Go provenance 与 12 文件审核基线一致，包含依赖许可证。没有混入原版 WebRTC 内核。证据：[包检验 JSON](ios-1.7.5-17-ipa-inspection.json)、[验证 JSON](ios-1.7.5-17-validation.json)。

验证边界：LiveKit 新接口、SDK 初始化、原生依赖、权限、订阅/发布、管理员操作与生命周期在代码和构建层面贯通；没有将 Expo Go 预览作为真实通话证据。会员正片、真实设备 B站 seek/音视频同步、跨端互听、耳机与系统来电仍需安装新包验收。完整自签证书例外通道及后台独立业务 Socket 仍为计划中独立待实施项；本轮没有重新构建安卓/鸿蒙包。

参考：[LiveKit Expo 接入](https://docs.livekit.io/transport/sdk-platforms/expo/)、[Expo 自定义构建](https://docs.expo.dev/custom-builds/get-started/)、[WBI 实现与固定重排表](https://github.com/ymt200120/bili-subtitle/blob/main/src/core/wbi.js)。

---
**完整变更记录**：预览源码检查点 `b327750`；共享 WBI 修复检查点 `a8abd64`；本地 Git 提交 `feat(ios): build 1.7.5 with verified Bilibili and LiveKit` 记录本包配置、验证及维护文档。不推送 GitHub、不创建 Release。
