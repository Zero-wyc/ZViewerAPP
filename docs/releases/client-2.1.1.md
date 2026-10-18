# ZViewer-Client V2.1.1

Android / HarmonyOS **2.1.1 / 211**，对齐服务端 v4.5.9。本次包含此前未公开的 2.1.0 更新及本轮播放、窄屏界面修复。提供正式签名 APK、HAP 和 SHA256SUMS.txt；源码同步 main，使用 GitHub 自动归档。iOS 保持 1.9.0 / build 26，本轮未改动、未构建或上传 IPA。

## 🚀 新特性 / Features

- 增加 TVBox JSON CMS 采集源，支持搜索、播放组/集数选择、入片单及播放时重新解析。
- 一起看、一起听接入服务器权威进度和定期自检；保留旧服务端兼容路径。
- 添加影片面板提供服务器中转开关，贯通挂载身份及媒体请求路由。
- 在“添加影片”左侧同一行增加房主专属自动连播滑块。开关由房主本机控制，房主端在影片结束后请求下一部；切片结果由服务端确认并同步，片单末尾停止。观众不显示开关。

## 🐛 错误修复 / Bug Fixes

- 修复初始播放状态先于片单和当前影片到达时，误判换片导致 B站持续黑屏。
- 修复窄屏网易云评论数量白底白字；浏览器转码引擎与服务器中转统一滑块、容器和文字样式。
- 修复房主离线后自主暂停被缓存在线状态撤销、强制同步无法回到零，以及迟到应答影响新影片。
- 修复服务器媒体 token 续期后仍复用旧 token；播放期有限恢复保留进度、暂停状态和倍速。
- 修复鸿蒙 Web 控制器尚未绑定时的冷启动崩溃，销毁后丢弃迟到桥响应。
- 修复多轨字幕 worker 响应串用风险，补齐原生共享失败通知及 P2P 候选排队；默认弹幕轨道写入被拒绝时保留本机显示并处理异步拒绝。

## ⚠️ 破坏性改动 / Breaking Changes

- 新增影片关闭服务器中转时，媒体按直连策略播放；源站需要提供相应访问/CORS 能力。失败后不会静默占用服务器媒体带宽，可开启中转后重新添加。
- CMS 功能需要支持相关接口的服务端；仍保留 v4.5.3 基础同步兼容。自动连播沿用现有房主本地开关逻辑，没有新增共享开关协议。

## ⚡ 性能优化 / Performance Improvements

- 合并进度校正路径，避免新旧心跳重复 seek；追赶区间按实际领先/落后调整倍速。
- playsvideo 增加活动超时和关键帧缓存，字幕解析移至 worker，并展示媒体准备阶段。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 迁移至本地 vendor/playsvideo，保留 MKV/AAC/DTS/FLAC 补丁、许可证及可复现的 mediabunny 补丁脚本。
- 同步 Android、HarmonyOS 维护文档、README 和双端更新指南执行状态。
- 已完成 170 项适配、4 项媒体回归和 10 组窄屏/平板明暗布局检查；Android 与 HarmonyOS 模拟器连接实际服务端验证 B站播放，Android 验证自然结束连播和片单末尾停止。用户确认播放正常后结束测试，后续真机实测由用户进行。验证层级、签名包信息与未覆盖范围见 [2.1.1 验证记录](https://github.com/Zero-wyc/ZViewerAPP/blob/client-v2.1.1/docs/client-2.1.1-validation.md)；服务端对齐范围见 [2.1.0 验证记录](https://github.com/Zero-wyc/ZViewerAPP/blob/client-v2.1.1/docs/client-2.1.0-validation.md)。

---
**完整变更记录**：[client-v2.0.0...client-v2.1.1](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v2.0.0...client-v2.1.1)
