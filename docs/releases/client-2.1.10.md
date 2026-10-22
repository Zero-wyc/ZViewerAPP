# ZViewer-Client V2.1.10

Android / HarmonyOS 同步更新为 **2.1.10 / 220**，修复内网 HTTP 登录与自动识别问题。只输入 `IP:端口`，在自动模式勾选证书例外时，可以连接 HTTP 或自签名 HTTPS 服务端并进入房间。

## 🚀 新特性 / Features

- 无新增独立功能，本版集中修复内网服务器连接。

## 🐛 错误修复 / Bug Fixes

- 修复地址检测成功后，游客/账号登录仍提示“无法连接服务器”。双端 HTTP 登录、接口、Cookie、WebSocket 与媒体请求统一经过当前服务器专用原生通道。
- 修复开启证书例外后，临时 HTTPS 通道返回 502 导致无法自动识别 HTTP；服务器直接关闭或重置 TLS 握手时，使用无凭据公开接口验证 HTTP 后再回退。
- 补齐明文 WebSocket、同源 HTTP 重定向与断开/切服清理；实际后端错误、证书错误及无有效 HTTP 证据的网络失败不会触发自动降级。

## ⚠️ 破坏性改动 / Breaking Changes

- 无。最低系统版本保持 Android API 24、HarmonyOS 6.1.0(23)。
- 本次发布 Android APK 与 HarmonyOS HAP；iOS 沿用现有版本。

## ⚡ 性能优化 / Performance Improvements

- 登录复用刚确认的服务器地址与原生通道，减少重复协议探测和连接重建；修改地址、模式或证书选项后重新检测。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 同步双端维护文档、README、更新记录和[内网连接验证记录](https://github.com/Zero-wyc/ZViewerAPP/blob/main/docs/lan-connection-fix-20261022.md)，依赖版本不变。
- 249 项适配、4 项媒体及 Go 回归通过。使用本地真实服务端启动 HTTP / 自签名 HTTPS，安卓与鸿蒙原生模拟器均以纯 IP:端口、自动模式和证书例外完成登录、Socket.IO 握手与实际进房；实体设备范围在验证记录中单独说明。
- 发布签名 APK、HAP 和构建时一次生成的 `SHA256SUMS.txt`；源码同步 main / `client-v2.1.10`，使用 GitHub 自动源码归档。

---
**完整变更记录**：[client-v2.1.9...client-v2.1.10](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v2.1.9...client-v2.1.10)
