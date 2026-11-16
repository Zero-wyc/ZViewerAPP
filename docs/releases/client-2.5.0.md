# ZViewer-Client V2.5.0

Android / HarmonyOS **2.5.0（versionCode 250）**，对齐服务端 main `ec0ac153` 与新版 CLI 解析源码。

## 🚀 新特性 / Features

- 新增房间 Live2D 角色：公共模型库、模型选择、表情、动作、戳一戳、语音口型与本机摄像头动捕；手机可用触摸入口操作，位置和大小保存为本机偏好。
- B站点播新增“房主身份 / 本机账号”解析来源；房主身份由服务端按房间权限解析，媒体继续由各端内置 CLI 拉取，账号 Cookie 不下发给观众。
- B站直播支持内置 CLI 线路；AniSubs 默认搜索全部站点，聚合去重后可切换具体来源。

## 🐛 错误修复 / Bug Fixes

- 更新 Android Go 与 HarmonyOS ArkTS 内置解析器，保留原生 Cookie 保护、取消、CDN 备用地址和安全目标校验。
- 对齐直播本地代理与服务器中转语义，修复无效 FLV 追帧配置、同地址线路切换和解析错误码传递。
- 角色资源分别使用 App 内置运行时和所选服务器的模型库地址，适配原生连接通道、全屏层和相机权限；静音、退出房间和关闭采集后清理角色口型及摄像头状态。

## ⚠️ 破坏性改动 / Breaking Changes

- 房主身份解析、聚合搜索和 Live2D 功能需要包含对应接口的新版服务端；本次客户端按 main `ec0ac153` 验证。
- `cliOnly` 内容继续要求各成员本机账号拥有播放资格；房主解析不会绕过该约束。管理员关闭房主身份解析时按服务端错误提示处理。
- 共享和语音继续要求 Piik v24。最低系统与签名沿用原要求；本次发布 Android / HarmonyOS。

## ⚡ 性能优化 / Performance Improvements

- 角色渲染与摄像头推理按需加载；复用房间语音电平，避免为口型重复打开麦克风。拖动和缩放保留本地偏好，减少房间广播。
- 直播在允许范围内主动追帧，番剧全站搜索由服务端并发聚合，减少逐站查找操作。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 同步双端维护文档、CLI 来源说明、适配记录和发布版本；新增 Pixi / Cubism 引擎及 MediaPipe 本地推理依赖，保留资源许可说明。
- 验证结果见 [本次交付记录](../server-alignment-2026-11-16.md)。发布签名 APK、HAP 和构建时记录的 SHA256SUMS，源码使用 GitHub 自动归档；APK 为 83,767,120 字节，SHA256 为 `2eb5c061ca73fcc9d6682d8e6bfc726ca24fb7f5a123fbfbf9cb7593bd9cd702`；HAP 为 30,476,076 字节，SHA256 为 `d943056e514c62293e8a2cf5afe649d247ac51cd4f52081e94924f26218cda19`。
- 本次自动回归共 550 项通过；未连接实体 Android / HarmonyOS 设备，iOS 未构建。服务端 Live2D 房主离房清理修复已提交上游 PR #46，未把尚未合入的服务端改动写成客户端 Release 已包含内容。

---
**完整变更记录**：[client-v2.4.0...client-v2.5.0](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v2.4.0...client-v2.5.0)
