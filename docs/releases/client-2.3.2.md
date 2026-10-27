# ZViewer-Client V2.3.2

Android / HarmonyOS 更新为 **2.3.2（232）**，合并此前未发布的 2.3.1；iOS / iPadOS 保持 2.1.10 / build 31。

## 🚀 新特性 / Features

- 一起听设置页新增「音量均衡」，默认关闭；降低偏响歌曲音量，减少切歌音量差异。开关与响度缓存每设备独立，不参与房间同步，不改变用户保存音量。
- B站多分 P 视频可按各 P 名称、CID 和实际时长逐首加入房间歌单，支持现有上一首、下一首与播完自动切换；房主或房管按顺序导入。
- 影片「播放设置」增加 Emby/Jellyfin「服务器中转」，与「浏览器转码」采用相同胶囊样式；仅内网挂载隐藏，切换保留所选清晰度版本、播放地址与格式。

## 🐛 错误修复 / Bug Fixes

- 修复 B站多 P 合集总时长被当作第一 P 时长，导致大幅跳转落到片尾、提前进入下一首；播放后续条目时传递正确 CID。
- 完善 Emby/Jellyfin 模式保存、起播地址刷新、失败重试与迟到请求隔离，避免旧 HLS 格式或过期 CDN 地址影响播放。
- 音量均衡关闭、不支持或捕获失败时恢复原播放路径；无缝预载与主音频共用本机增益，释放换曲、关闭及离房后的分析资源。
- 服务端网页展开播放器打开队列、清空队列白屏已在配套 [服务端 PR #38](https://github.com/Zero-wyc/ZViewer/pull/38) 修复；客户端已有对应防护，本版新增回归覆盖。

## ⚠️ 破坏性改动 / Breaking Changes

- 无新增系统或签名要求：Android 7.0 / API 24，HarmonyOS 6.1 / API 23。
- 服务端解析模式下完整分 P 支持需要服务端包含 [PR #38](https://github.com/Zero-wyc/ZViewer/pull/38)；旧队列中保存为整段视频的条目需删除后重新添加，才会展开为逐首歌曲。NAS 未自动更新。

## ⚡ 性能优化 / Performance Improvements

- 响度分析使用独立静音支路，不接管主音频输出；缓存每首的增益，静音、暂停或不支持的设备不进行无效采样。
- 分 P 导入逐首等待回执，离房、断线或失败即停止，避免过期批次继续写入旧房间队列。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 更新 Android / HarmonyOS 维护文档、分 P 静音验收记录、README 与 CHANGELOG；依赖未变，iOS 未修改或构建。
- 156 项维护回归、8 项工具栏/空歌曲回归、TypeScript/Vite、双端签名构建与签名验证通过。真实本地 API、Socket 队列及 B站媒体完成 150 P 入队、上下首和片尾切 P 静音测试；四种窗口尺寸反复开关队列、空队列和两类音源检查通过，用户确认本地网页验收通过。
- 浏览器及签名包验证不替代安卓 WebView / 鸿蒙 ArkWeb 实体设备听感、后台和兼容性测试。
- 提供签名 APK、HAP 及构建时生成的 SHA256SUMS.txt；源码更新 main，使用 GitHub 自动生成的源码归档。

---
**完整变更记录**：[client-v2.3.0...client-v2.3.2](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v2.3.0...client-v2.3.2)
