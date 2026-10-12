# ZViewer-Client V1.7.5

Android / HarmonyOS **1.7.5 / 175**，对齐服务端 **v4.5.1**（核验提交 `c8fa5bad0c6efcffbc0dc3bfe4c199f8a9b8d8f6`）。包含此前未发布的 1.7.4 本地更新和本轮界面修复；iOS 本轮未更新。公告按用户要求排除。

## 🚀 新特性 / Features

- Kazumi/ani-subs 共用番剧浏览器：切源保留关键词与放大状态、集中选集、认证海报回退和失败项重试。
- Emby/Jellyfin 搜索、整剧/整季单卡、卡内切集和多版本选择；补齐无 tag 海报、集号及总集数。
- 按 root/房间创建者权限清空整个片单，保留二次确认与断连保护；B 站搜索结果内选择分 P。

## 🐛 错误修复 / Bug Fixes

- 长片名在普通和展开片单中完整多行显示，中文、英文及连续长字符串不会挤压播放/删除按钮。
- 展开的 ani-subs/Kazumi 源菜单按最长名称增宽，长源名单行完整显示；靠近屏幕边缘时自动调整位置，触发器与搜索栏保留原布局。
- 修复媒体库转码 HLS 的相对分片与直链 MediaSourceId，切集/版本/房间的迟到响应及清空后的残留播放。
- 修复窄屏确认栏、长面包屑及搜索框挤压；完善音量拖动取消与嵌套滚动锁。

## ⚠️ 破坏性改动 / Breaking Changes

无新增客户端破坏性协议。新增搜索、清空及媒体库多版本功能需要相应服务端接口，建议同步更新服务端和房主网页。既有设备编解码与原生能力限制保持。

## ⚡ 性能优化 / Performance Improvements

媒体版本信息按需加载；失败集数重试只补未成功条目。过期图片 Blob、拖动监听及播放请求按生命周期释放。

## 📖 文档与依赖更新 / Documentation & Dependencies

同步双端维护文档、README、CHANGELOG 和验收记录，依赖版本未升级。56 项适配与 4 项媒体回归通过，双端 Debug/Release 签名构建通过。40 组本轮布局检查覆盖手机窄屏、横屏、平板、深浅主题、普通/展开片单及源菜单；此前 1.7.4 已完成 102 组共享界面和双端模拟器播放联调。

验收范围见 [1.7.5 验证记录](https://github.com/Zero-wyc/ZViewerAPP/blob/main/docs/client-v1.7.5-ui-validation-20261012.md)。模拟器、协议夹具与布局检查不替代用户真机、真实媒体库及长期播放验收。

发布附件为签名 APK、签名 HAP 和 `SHA256SUMS.txt`。源码使用 GitHub 自动生成的 Source code（zip / tar.gz），不另附源码压缩包。

---
**完整变更记录**：

[client-v1.7.3...client-v1.7.5](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v1.7.3...client-v1.7.5)
