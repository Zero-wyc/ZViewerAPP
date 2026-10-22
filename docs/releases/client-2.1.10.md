# ZViewer-Client V2.1.10

iOS **1.9.0 / build28** 以追加附件合并到本Release，原Android / HarmonyOS附件和tag保留。

Android / HarmonyOS 同步更新为 **2.1.10 / 220**，修复内网 HTTP 登录与自动识别问题。只输入 `IP:端口`，在自动模式勾选证书例外时，可以连接 HTTP 或自签名 HTTPS 服务端并进入房间。

## 🚀 新特性 / Features

- iOS按VideoToolbox精确尺寸、硬件会话及实际关键帧解码探测开放AVC High / HEVC Main、8bit420 SDR，最高4K30；横竖尺寸分别探测。Simulator仍为AVC720P30 / 480P30，60fps、AV1、HDR与杜比未开放。

## 🐛 错误修复 / Bug Fixes

- iOS修复本机CLI匿名ready时未从Keychain恢复登录、前台状态更新及过期响应覆盖。画质切换按真实错误分类，失败保留原画质、暂停状态和进度；本机失败不会静默借用服务器账号。
- iOS房主片单在服务端内存丢失时仅重新注册一次并重试，观众不抢房主；HTTP / WebSocket使用当前服务器Go专用通道。

- 修复地址检测成功后，游客/账号登录仍提示“无法连接服务器”。双端 HTTP 登录、接口、Cookie、WebSocket 与媒体请求统一经过当前服务器专用原生通道。
- 修复开启证书例外后，临时 HTTPS 通道返回 502 导致无法自动识别 HTTP；服务器直接关闭或重置 TLS 握手时，使用无凭据公开接口验证 HTTP 后再回退。
- 补齐明文 WebSocket、同源 HTTP 重定向与断开/切服清理；实际后端错误、证书错误及无有效 HTTP 证据的网络失败不会触发自动降级。

## ⚠️ 破坏性改动 / Breaking Changes

- 无。最低系统版本保持 Android API 24、HarmonyOS 6.1.0(23)。
- iOS最低iOS / iPadOS16.4，IPA未签名，需自行签名侧载；内置Release JS，无需Metro。

## ⚡ 性能优化 / Performance Improvements

- iOS解码探测成功缓存600秒，空结果30秒，总预算3秒，避免每次解析重复探测。

- 登录复用刚确认的服务器地址与原生通道，减少重复协议探测和连接重建；修改地址、模式或证书选项后重新检测。

## 📖 文档与依赖更新 / Documentation & Dependencies

- iOS补丁、lint、TypeScript与421 / 421项检查通过；20个自主合成AVC / HEVC横竖尺寸关键帧原生夹具通过。Simulator Debug19冷启动恢复扫码登录，自动 / 360P / 480P / 720P解析成功，实际480P→720P切换和播放推进通过，超限画质准确提示并保留进度。
- device ARM64 Release离线验包通过，IPA为49,284,918B，SHA256 `d0f65fd17efee9144d39ac458b79ad21a6611c7dfda5f42ee4583d00c1b36e20`；附独立iOS SHA文件。关键帧探测不代表高码率持续播放或音画同步，第三代iPad Pro真机尚未验收。
- 原tag不移动，自动源码归档对应原tag；新增iOS源码见main本轮发布提交及维护文档。

- 同步双端维护文档、README、更新记录和[内网连接验证记录](https://github.com/Zero-wyc/ZViewerAPP/blob/main/docs/lan-connection-fix-20261022.md)，依赖版本不变。
- 249 项适配、4 项媒体及 Go 回归通过。使用本地真实服务端启动 HTTP / 自签名 HTTPS，安卓与鸿蒙原生模拟器均以纯 IP:端口、自动模式和证书例外完成登录、Socket.IO 握手与实际进房；实体设备范围在验证记录中单独说明。
- 发布签名 APK、HAP 和构建时一次生成的 `SHA256SUMS.txt`；Android / HarmonyOS源码对应原 `client-v2.1.10` 自动归档；新增iOS源码同步main。

---
**完整变更记录**：[client-v2.1.9...client-v2.1.10](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v2.1.9...client-v2.1.10)
