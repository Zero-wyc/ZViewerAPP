# ZViewer-Client V2.1.5

Android / HarmonyOS 同步为 **2.1.5 / 215**，对齐服务端 v4.7.1 后的 `fe55dde`。两端分别完成本次源码构建的模拟器验收；真机范围、构建与验证证据见 [验证记录](https://github.com/Zero-wyc/ZViewerAPP/blob/main/docs/client-2.1.5-validation.md)。

## 🚀 新特性 / Features

- 完善数据源直连与服务器中转策略的一致应用，访问统计同时覆盖数据源、挂载与预览。

## 🐛 错误修复 / Bug Fixes

- 修复播放地址不变时修改直连或转码策略未重新生效，及底层只按 URL 去重的问题；广播、状态恢复与网页预览共用串行队列，保留进度、暂停和倍速。
- 修复加载途中再次切换策略、旧应答和旧片单设置覆盖新策略；失败可重试，迟到任务不能复活旧会话。
- 修复鸿蒙 HLS 连续重载后可能停在 seek：从恢复位置加载分片，首帧数据就绪后再应用进度。
- 修正数据源访问模式显示及复制文本；保留挂载字幕原有回退策略。完善预览事件的中转/转码字段及直连失败指引。

## ⚠️ 破坏性改动 / Breaking Changes

- 无新增破坏性改动。移除未使用的旧单集预览回调，当前多选与批量加入片单保持不变。
- 鸿蒙最低 SDK 保持 6.1.0(23)；Android 最低 API 24。iOS 保持当前版本，本次不构建或发布。

## ⚡ 性能优化 / Performance Improvements

- 相同媒体与策略复用已加载引擎；并发状态只处理最新待应用值，减少重复加载和无效下载。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 同步安卓、鸿蒙维护文档、检查报告后续实施记录及发布说明；依赖版本不变。
- 206 项适配、4 项媒体、6 项 vendor 补丁检查通过；Android 与 HarmonyOS 模拟器验证策略切换、暂停倍速、预览与刷新恢复，实际时间和解码帧持续推进。模拟器验收不扩大为 API 23 或实体设备验收。
- 提供正式签名 APK、HAP 与构建时生成的 `SHA256SUMS.txt`。源码发布到 main，使用 GitHub 自动生成的源码归档，不另附源码压缩包。

---
**完整变更记录**：[client-v2.1.4...client-v2.1.5](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v2.1.4...client-v2.1.5)
