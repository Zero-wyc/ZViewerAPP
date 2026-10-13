# ZViewer-Client V1.8.0

Android / HarmonyOS **1.8.0 / 180**，对齐服务端 **v4.5.3**（本次对齐核验提交 `9e2a0d4f3d9796067ac17274feabeccbb065d411`）。包含此前未发布的 1.7.6 本地更新，统一以 1.8.0 重新打包发布；本轮未构建或发布 iOS。

## 🚀 新特性 / Features

- 一起听读取服务端默认音乐音量，缺省为 50%；有效本地音量优先，保留静音和手动调整，主音频与预载音频使用一致音量。
- 私人漫游支持房间级连续播放：自然结束、播放器及系统控件的下一首可继续获取候选，切换页面保留会话；房主收到入队成功确认后才切歌并广播。
- B 站视频搜索采用紧凑自适应网格，手机两列，横屏和平板按可用宽度增加列数；保留 16:9 封面、标题、UP 主、播放/弹幕数、分 P 和分页。

## 🐛 错误修复 / Bug Fixes

- 修复鸿蒙实际 ArkTS WBI 签名的重排表、查询排序、UTF-8/空格编码及特殊字符过滤，使签名内容与实际请求一致。
- Android 重新生成 Go B 站核心，纳入 WBI 修复，并正确区分普通视频 `result:"suee"` 状态字符串与 PGC 对象响应。
- 防止晚到的默认音量覆盖本次手动调整；私人漫游在暂停、拖动、切模式、离房或断连后丢弃旧结果，避免迟到确认触发误播放。
- 私人漫游候选按当前歌曲和播放历史去重，入队拒绝或超时保留候选，旧会话的空响应不会在新连接发起回退请求。

## ⚠️ 破坏性改动 / Breaking Changes

无新增客户端破坏性协议。建议服务端更新至 v4.5.3 以使用对应默认音量与漫游行为；旧服务端缺少默认音量字段时安全回退为 50%。公告与此前排除的独立评论窗口不加入本次客户端更新。

## ⚡ 性能优化 / Performance Improvements

B 站搜索按结果容器宽度自动排布，缩小封面并提高一屏信息密度；私人漫游保存最多 100 首历史，复用房间会话并限制过期请求和重复候选。

## 📖 文档与依赖更新 / Documentation & Dependencies

双端版本统一为 1.8.0 / 180，同步 README、CHANGELOG、Android/HarmonyOS 维护文档和发布流程，依赖版本未升级。共享网页通过 `android:sync` / `harmony:web` 生成，平台桥和签名材料保留各自维护边界。

本轮重新构建已通过网页同步及双端 Debug/Release 构建；APK/HAP 内部版本均为 1.8.0 / 180，APK v2 签名与既有证书一致，HAP 验签和既有证书链核对通过，两端各 29 个共享网页资源摘要与构建结果一致，详见 [1.8.0 构建与发布验证](https://github.com/Zero-wyc/ZViewerAPP/blob/main/docs/client-v1.8.0-release-validation-20261013.md)。同时清理两个 iOS 本地测试脚本的硬编码路径和固定登录值，未构建或发布 iOS 产品。

此前 1.7.6 对齐阶段通过 69 项适配、4 项媒体回归、Go 核心测试、20 组搜索布局和 8 组音量场景；浏览器短音频与模拟候选/入队确认覆盖私人漫游自然结束续播及权限竞态。双端当时已完成 Debug/Release 构建、签名与包内资源核验。详细证据见 [1.7.6 对齐验证](https://github.com/Zero-wyc/ZViewerAPP/blob/main/docs/client-v1.7.6-alignment-453-validation-20261013.md)。这些是此前功能实现的验证记录，不代表本轮新增真机验收；真实网易云/VIP 音源、原生 B 站在线解析、物理设备、后台锁屏、蓝牙与跨端同步仍待专项验收。

发布附件仅包含 `ZViewer-Android-1.8.0-release.apk`、`ZViewer-HarmonyOS-1.8.0-release.hap` 和 `SHA256SUMS.txt`。源码同步至 main，使用 GitHub 自动生成的 Source code（zip / tar.gz），不另附源码压缩包。

---
**完整变更记录**：

[client-v1.7.5...client-v1.8.0](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v1.7.5...client-v1.8.0)
