# ZViewer-Client V1.9.0

发布日期：2026-10-14

## 🚀 新特性 / Features

- Android 与 HarmonyOS 统一升级至 `1.9.0 / versionCode 190`。
- 普通 HLS 直链优先请求源站，直连失败且策略允许时自动回退一次服务端代理。
- 三端统一提供 Android APK、HarmonyOS HAP 与 iOS `1.9.0 / build 26` IPA。

## 🐛 错误修复 / Bug Fixes

- 修复 HLS 引擎未读取 `allowFallback`、导致普通跨域 m3u8 一律被强制中转的问题。
- 修复 HLS 回退后子清单、密钥、分片和 map 资源错误复用主清单 URL 的问题。
- 保留带防盗链请求头、B 站 DASH、媒体库 HLS 转码及 Kazumi/AniSubs 代理链路。
- 修复证书例外通道在服务器无路径前缀时可能生成 `//api/...` 的 URL 问题。

## ⚠️ 破坏性改动 / Breaking Changes

- 无协议或服务端 API 破坏性变更。
- iOS IPA 仍为未签名设备 Release 包，安装前需要使用个人证书重新签名。

## ⚡ 性能优化 / Performance Improvements

- 普通 HLS 直链播放优先走源站，减少服务端媒体中转带宽和额外网络跳数。
- 直连失败时限制为单次代理回退，避免直连与代理之间循环重试。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 同步 Android、HarmonyOS、iOS 维护文档、README 与 CHANGELOG。
- 新增 HLS 鉴权、来源恢复、回退生命周期和非 HLS 路由矩阵回归测试。
- 保持现有依赖版本，本次未引入新的运行时依赖。

---
**完整变更记录**：

- `npm run test:adaptation`：81 项通过。
- `npm run test:media`：4 项通过。
- `npm run build`、`npm run android:sync`、`npm run harmony:web`：通过。
- Android Release APK 已通过 `apksigner` v2 签名验证；HarmonyOS Release HAP 已通过 `hap-sign-tool verify-app` 验证。
- 用户提供的 `https://vv.jisuzyv.com/play/6dBXyzQa/index.m3u8` 主清单、分片和密钥只读请求均返回 HTTP 200 且允许跨域。
