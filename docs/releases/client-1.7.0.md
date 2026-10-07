# Android / HarmonyOS 1.7.0 / 170

2026-10-07 正式发布；目标上游 `ba033096bc9c3a85a2058918a002b80a5f484ec8`。用户已确认 Android / HarmonyOS 真机验收通过。APK/HAP 沿用本次已验收的正式签名构建，源码与 SHA-256 同版本发布；iOS 不在本轮范围内。构建、模拟器证据及验收记录见 [适配交付记录](client-1.7.0-adaptation.md)。

## 🚀 新特性 / Features

- 双端内置 B 站代理支持 ep/ss 番剧影视、整季分集、会员及试看信息，并使用每台设备自己的账号解析。/ Native PGC resolution, season episodes and per-device entitlement metadata.
- 支持影片 cliOnly、服务端解析默认值、PGC 分集和画质同步。/ Per-movie local-proxy requirement and updated parsing defaults.
- 首页增加 HTTPS 优先的自动地址选择、完整 URL 和按服务器证书例外。/ HTTPS-first address selection and server-scoped certificate exceptions.
- 一起听增加末尾推荐续播、默认来源页和房间评论；语音显示实际 UDP/TCP 线路。/ Music continuation, default source, room comments and selected voice transport.

## 🐛 错误修复 / Bug Fixes

- 补齐 PGC 元数据映射、ep/cid 对应与异步旧请求校验；手动不可用画质明确失败。/ Preserve PGC metadata and prevent stale episode or quality results.
- cliOnly 播放及缓冲禁止服务器媒体兜底和跨账号缓存误用。/ Enforce local media routing in playback, recovery and buffering.
- 修复鸿蒙 TLS 初始化及尾包关闭顺序、HLS 私有通道递归包装。/ Fix HarmonyOS TLS response draining and HLS connection routing.

## ⚠️ 破坏性改动 / Breaking Changes

- cliOnly 影片要求各成员自己的内置代理可用且账号拥有内容权限；房主会员资格不会传给观众。/ Each viewer needs a working local proxy and their own content entitlement.
- 语音继续要求 LiveKit 服务端；iOS 本轮未适配、未构建 IPA。/ LiveKit remains required; iOS is outside this delivery.

## ⚡ 性能优化 / Performance Improvements

- 服务端解析缓存增加分集/身份维度，本机缓冲缓存按账号会话隔离；过期解析不重挂播放器。/ Scope parsing and media caches to episode and session identity.
- 一起听侧坞保持挂载，减少全屏切换中的监听重建。/ Keep music dock listeners mounted across full-player transitions.

## 📖 文档与依赖更新 / Documentation & Dependencies

- 同步双端维护架构、方案实施状态和交付记录；版本统一为 1.7.0 / 170。/ Update both maintenance guides and delivery evidence.
- 30 项共享回归和 Go 测试通过，正式 APK/HAP 签名验证通过；会员 MP4 在两端模拟器约 400 秒位置继续出帧，用户确认双端真机验收通过。/ Verified regression tests, signed builds and user-confirmed acceptance on both mobile platforms.

---
**完整变更记录**：[client-v1.6.0...client-v1.7.0](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v1.6.0...client-v1.7.0)
