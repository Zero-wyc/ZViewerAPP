# ZViewer-Client V2.4.0

Android / HarmonyOS 更新为 **2.4.0（versionCode 240）**，对齐服务端 main `ebddfb99`。

## 🚀 新特性 / Features

- B站入口支持直播间链接、直播清晰度、封面和未开播房间添加，播放时重新获取有效流地址。
- 房主可用“优先直连 / 服务器中转”按钮切换直播线路，新增直播默认中转；直连持续失败后有界回退服务器代理。
- 直播状态与线路同步给观众，保留播放 / 暂停、音量、亮度、弹幕与全屏操作。

## 🐛 错误修复 / Bug Fixes

- 修复同一流地址切换线路不重新挂载、默认中转设置被公共添加封装覆盖的问题。
- 直播绕过点播 CLI、旧签名地址恢复、原生点播清晰度及 VIP 筛选；切换和重载使用直播清晰度接口。
- 直播不再应用点播进度 / 倍速同步；隐藏时轴、倍速和同步按钮，阻止手势、键盘、进度审批及系统 seek，避免跳转或速度残留。
- 修复向上展开菜单的定位，并清理换源后的字幕探测计时器和监听。

## ⚠️ 破坏性改动 / Breaking Changes

- 本次没有新增通用协议破坏性改动；B站直播功能需要包含 `/api/stream/resolve-bilibili-live` 的新版服务端。
- 屏幕共享和语音沿用 **Piik v24** 要求，旧 SFU / LiveKit 服务端仍不兼容。
- 本次仅发布 Android / HarmonyOS；iOS / iPadOS 保持 2.3.6 / build 40。最低系统和发布签名沿用既有要求。

## ⚡ 性能优化 / Performance Improvements

- 直播直连模式允许设备自行获取 CDN 媒体流，服务器中转可按兼容性需要选择；失败回退有边界并释放旧加载资源。
- 内嵌字幕探测在 canplay 后 800ms 执行，8 秒兜底，减少与首帧加载争用。
- 直播不运行点播缓存、完整缓冲下载及进度校正流程。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 更新 README、CHANGELOG、服务端文件级对齐记录和 Android / HarmonyOS 维护文档，直播回归加入 CI。
- 425 项客户端回归、类型检查、生产构建、服务端相关 Go 测试、独立后端构建及双端签名 / 版本 / 资源检查通过。
- 隔离本地服务验证真实 HTTP / Socket 建房、直播添加及线路回读，真实直播接口验证未开播状态；浏览器实际组件验证两种响应时序和多宽度 DOM，鸿蒙模拟器安装启动及原生桥接加载通过。未完成实体手机、真实开播流、声音 / 后台及长时弱网验收；NAS 未部署。
- 附件为签名 APK、HAP 和 `SHA256SUMS.txt`，校验值复用最终构建记录。源码同步 main 并使用 GitHub 自动归档，不单独打包 Source Code。

---

**完整变更记录**：[client-v2.3.9...client-v2.4.0](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v2.3.9...client-v2.4.0)
