# ZViewer-Client V2.1.0

本地交付版：Android / HarmonyOS 2.1.0 / 210，对齐服务端 v4.5.9。尚未发布 GitHub Release；设备和网络验收范围见 [验证记录](../client-2.1.0-validation.md)。

## 🚀 新特性 / Features

- 增加 TVBox JSON CMS 采集源，支持搜索、播放组/集数选择、入片单及播放时重新解析。
- 一起看、一起听接入服务器权威进度和定期自检；保留旧服务端兼容路径。
- 添加面板提供服务器中转开关，贯通挂载身份及媒体请求路由。

## 🐛 错误修复 / Bug Fixes

- 修复房主离线后自主暂停被缓存在线状态撤销、强制同步无法回到零，以及迟到应答影响新影片。
- 修复当前服务器媒体 token 续期后仍复用旧 token；播放期有限恢复保留进度、暂停状态和倍速。
- 修复多轨字幕 worker 响应串用风险，补齐原生共享失败通知及 P2P 候选排队。
- 修复鸿蒙安全区事件先于 Web 控制器绑定时的冷启动崩溃，销毁后丢弃迟到桥响应。

## ⚠️ 破坏性改动 / Breaking Changes

- 新增影片关闭服务器中转时，媒体按直连策略播放；源站需要提供相应访问/CORS 能力。失败后不会静默占用服务器媒体带宽，可开启中转后重新添加。
- CMS 功能需要支持相关接口的服务端；仍保留 v4.5.3 基础同步兼容。iOS 不在本次交付范围。

## ⚡ 性能优化 / Performance Improvements

- 合并进度校正路径，避免新旧心跳重复 seek；追赶区间按实际领先/落后调整倍速。
- playsvideo 增加活动超时和关键帧缓存，字幕解析移至 worker，并展示媒体准备阶段。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 迁移至本地 vendor/playsvideo，保留 MKV/AAC/DTS/FLAC 补丁、许可证及可复现的 mediabunny 补丁脚本。
- 同步双端维护文档、更新指南执行状态及 2.1.0 交付验证记录。
- 交付新构建的正式签名 APK、HAP 和 SHA256SUMS.txt；源码在本地 main 提交，后续发布使用 GitHub 自动源码归档。

---
**完整变更记录**：[client-v2.0.0...main](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v2.0.0...main)（本地提交推送后可见本轮变更）。
