# ZViewer-Client V2.3.5

Android / HarmonyOS 更新为 **2.3.5（235）**，对齐 2026-10-31 服务端 main `e1ed57c3`。

## 🚀 新特性 / Features

- 语音面板支持服务器语音组件按需安装、下载进度、安装状态与失败重试。
- 房间语音入口与流量统计遵守服务端管理员的显示设置；兼容旧服务端的默认显示。

## 🐛 错误修复 / Bug Fixes

- 登录令牌到期后最多三次续期重连，临时网络错误不会误判永久失效；踢出、关房、退出及切换身份不会被迟到恢复重新加入。
- OBS 停流或直播正常结束后持续重连，宽限期内首次进入时不会被 30 秒起播超时永久中止；等待恢复时保持连接中，离房停止重试。
- B站已指定分P的链接不再重复弹出选择，切换画质保留 page/CID；外部 CLI 自动补齐缺失的分P CID。
- 一起听相关推荐、自动续播和观众申请统一使用每P名称与时长；暂停、切房、换曲和断线后不执行迟到续播。
- 语音状态请求在换服、换账号或切房时取消，旧状态不能覆盖已完成的安装；隐藏入口保留既有语音连接。

## ⚠️ 破坏性改动 / Breaking Changes

- 无新增破坏性改动。Android 7.0 / API 24、HarmonyOS 6.1 / API 23 与既有签名保持不变。
- 新语音下载和显示设置需要相应新版服务端；旧服务端保留原有语音加入流程。

## ⚡ 性能优化 / Performance Improvements

- 分P详情查询合并并限量缓存，推荐与导入复用元数据。
- 语音下载轮询避免请求重叠；媒体恢复、离房与取消及时清理定时器和监听。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 324 项客户端自动回归通过；服务端全量 Go 测试、生产构建、18 组新接口/设置检查、10 项真实 RTMP/FLV 集成与历史合同检查通过。
- 更新双端维护文档、README、CHANGELOG 和 [对齐记录](https://github.com/Zero-wyc/ZViewerAPP/blob/client-v2.3.5/docs/server-client-alignment-2026-10-31.md)，新增对齐测试纳入 CI；依赖版本未变。
- TypeScript/Vite 与双端签名构建通过，沿用上一正式版签名；两包各 31 个网页资源与本次输出一致。语音面板 6 组浏览器受控交互通过，未将浏览器结果记为原生设备验收。
- 提供签名 APK、HAP 和构建时生成的 SHA256SUMS；源码发布至 main，使用 GitHub 自动源码归档。
- 本轮无 Android/HarmonyOS 实体设备在线，未新增真机或长时间后台验收；iOS 未修改或构建，NAS 未部署。

---
**完整变更记录**：[client-v2.3.4...client-v2.3.5](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v2.3.4...client-v2.3.5)
