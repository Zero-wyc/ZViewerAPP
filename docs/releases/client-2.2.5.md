# ZViewer-Client V2.2.5

Android / HarmonyOS 更新为 **2.2.5（226）**。iOS 保持 2.1.10 / build 31。

## 🚀 新特性 / Features

- 退出当前服务器后保留本次运行中填写的用户名与密码，方便主动重新登录；退出正常清除登录令牌，并恢复密码隐藏显示。

## 🐛 错误修复 / Bug Fixes

- 修复一起听 B站封面无法在展开播放器、队列和系统媒体控件显示的问题。共享曲目使用原图地址，各设备按当前服务器连接加载；兼容历史队列中的旧代理地址。
- 修复网易云服务不可用时仍持续显示二维码生成动画的问题；显示具体错误与重新获取入口，保留音乐账号，限制重复轮询并支持取消。
- 对齐 Go 服务端完整播放快照和番剧字段，保留明确的 false 策略；影片转预览或取消加载后，迟到结果不再恢复旧媒体。
- 挂载直链失败保留服务端错误并停止，不使用过期地址；第三方音乐或挂载鉴权失败不触发 App 会话刷新。

## ⚠️ 破坏性改动 / Breaking Changes

- 无。最低系统保持 Android 7.0 / API 24、HarmonyOS 6.1 / API 23，沿用既有签名。密码仅保留于当前应用运行期间，不新增密码落盘保存。

## ⚡ 性能优化 / Performance Improvements

- 二维码轮询增加并发、取消和有限失败保护，防止关闭弹窗后继续请求。
- B站封面沿用当前设备图片代理，避免反复请求其他设备的 localhost 地址；原生番剧 MP4 默认请求 64，保留手动与恢复档位。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 更新 README、CHANGELOG 和 Android / HarmonyOS 维护文档；合并此前 2.2.2、2.2.3 本地测试修复，依赖不变。
- 76 项维护与登录行为回归、TypeScript/Vite、双端正式签名构建和包内容检查通过。用户已反馈一起听、一起看、投屏及 B站封面修复测试通过；新增登录逻辑使用共享 App 行为回归验证，未补写新增实体设备验收。
- 提供正式签名 APK、HAP 和构建时生成的 `SHA256SUMS.txt`。源码同步至 [main](https://github.com/Zero-wyc/ZViewerAPP/tree/main)，使用 GitHub 自动生成的源码归档。
- iOS 本次未修改或构建，继续使用 [2.1.10 Release](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v2.1.10)。服务端 GUI 网易云组件、播放合同及封面修复另行向上游提交 PR。

---
**完整变更记录**：[client-v2.2.1...client-v2.2.5](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v2.2.1...client-v2.2.5)
