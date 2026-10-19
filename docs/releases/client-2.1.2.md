# ZViewer-Client V2.1.2

Android / HarmonyOS 2.1.2 / 212，本地构建，尚未发布 GitHub Release。对齐 v4.6.4 检查报告固定的服务端 main/cbdd6cc6；验证范围见 [交付记录](../client-2.1.2-validation.md)。

## 🚀 新特性 / Features

- 普通用户房间所有者可使用排序、清空、删除及改名入口，权限以服务端验证的所有权为准。

## 🐛 错误修复 / Bug Fixes

- 修复媒体库 HLS 子资源被拼到上游 NAS、反代路径前缀丢失及重复通用代理的问题。
- 修复服务端因令牌到期主动断开后一直停留重连；恢复后重新准入，撤销身份正确退出，网络失败提供重试。
- 修复 403 业务拒绝触发多余 token 刷新，以及离房、切服、关房或被踢后旧响应恢复会话的问题。
- 移除直链和挂载面板中的无效服务器中转开关，保留 anime、Kazumi、CMS 中转与本机原生连接通道。

## ⚠️ 破坏性改动 / Breaking Changes

- Emby/Jellyfin 转码 HLS 要求服务端 v4.6.4 或更新的重写清单契约；按用户要求移除该部分旧服兼容。
- 移除已被服务端删除的 directLinkProxy 字段；视频直链和挂载直链失败时直接提示，不暗中改走服务器转发。

## ⚡ 性能优化 / Performance Improvements

- 媒体库 HLS 不再为还原上游清单额外查询 movie-source，也不进行第二层通用代理。
- Socket 刷新去重且连续恢复次数有界；403 业务拒绝不重复刷新身份。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 同步 Android/HarmonyOS 维护文档、检查报告实施记录及自动化测试；不迁移无差异 vendor，不构建 iOS。
- 181 项客户端适配、4 项媒体、6 项 vendor 补丁检查与 139 项本地服务端回归通过；原生检查和未覆盖场景以交付记录为准。

---
**完整变更记录**：本地 Git 从 `4b96025` 到本次更新提交；本轮未创建发行标签或 Release。
