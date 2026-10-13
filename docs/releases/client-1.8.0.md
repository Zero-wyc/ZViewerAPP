# ZViewer-Client V1.8.0

Android / HarmonyOS **1.8.0 / 180**，对齐服务端 **v4.5.3**（本次对齐核验提交 `9e2a0d4f3d9796067ac17274feabeccbb065d411`）。包含此前未发布的 1.7.6 本地更新，统一以 1.8.0 重新打包发布。本次追加 iOS **1.8.0 / build 18** 未签名设备 IPA，原 APK/HAP 保持不变。

## 🚀 新特性 / Features

- 一起听读取服务端默认音乐音量，缺省为 50%；有效本地音量优先，保留静音和手动调整，主音频与预载音频使用一致音量。
- 私人漫游支持房间级连续播放：自然结束、播放器及系统控件的下一首可继续获取候选，切换页面保留会话；房主收到入队成功确认后才切歌并广播。
- B 站视频搜索采用紧凑自适应网格，手机两列，横屏和平板按可用宽度增加列数；保留 16:9 封面、标题、UP 主、播放/弹幕数、分 P 和分页。
- iOS 纳入 LiveKit 房间语音、媒体库分集/版本及整季、番剧批量添加、片单清空等此前源码更新。B站、媒体库、四种目录来源与番剧采用独立浏览/搜索弹窗，支持海报墙/列表、展开、搜索、选集、多选/全选和固定操作底栏，手机与平板横竖屏自适应。

## 🐛 错误修复 / Bug Fixes

- 修复鸿蒙实际 ArkTS WBI 签名的重排表、查询排序、UTF-8/空格编码及特殊字符过滤，使签名内容与实际请求一致。
- Android 重新生成 Go B 站核心，纳入 WBI 修复，并正确区分普通视频 `result:"suee"` 状态字符串与 PGC 对象响应。
- 防止晚到的默认音量覆盖本次手动调整；私人漫游在暂停、拖动、切模式、离房或断连后丢弃旧结果，避免迟到确认触发误播放。
- 私人漫游候选按当前歌曲和播放历史去重，入队拒绝或超时保留候选，旧会话的空响应不会在新连接发起回退请求。
- iOS 修复 RN AbortController 缺少 `throwIfAborted` 导致的媒体库/番剧/FM 添加错误；原生 Go 同步普通视频 UGC 响应解析修复。
- iOS 聚合 HLS 恢复真实上游基址，保留 Referer/UA 和 CDN 签名，修复相对子清单及分片解析错误；独立渐进音轨保留自己的鉴权代理。
- iOS 修复 Emby/Jellyfin 切集事件乱序、同 URL 新影片/分集未重载及房主入房进度恢复；丢弃旧连接、旧选片和旧分集的迟到状态回执。
- iOS 一起听按完整歌曲/分 P 身份校验同步，隔离旧播放器进度/结束事件；取消旧推荐/FM 请求，保留私人漫游单曲循环意图。
- iOS 批量添加在 POST 成功但刷新/开始播放失败后保留事务与解析结果，关闭重开及签名 URL 轮换后重试不会重复添加已创建条目。

## ⚠️ 破坏性改动 / Breaking Changes

无新增客户端破坏性协议。建议服务端更新至 v4.5.3 以使用对应默认音量与漫游行为；旧服务端缺少默认音量字段时安全回退为 50%。公告与此前排除的独立评论窗口不加入本次客户端更新。

iOS IPA 为 **未签名的 iPhone/iPad 设备包**，最低 iOS 16.4，需自行签名后侧载安装。需要 Origin/Cookie 的聚合 HLS 当前显示不支持提示；iOS 完整自签证书例外通道尚未实现。旧 build 17 不包含本轮源码修复。

## ⚡ 性能优化 / Performance Improvements

B 站搜索按结果容器宽度自动排布，缩小封面并提高一屏信息密度；私人漫游保存最多 100 首历史，复用房间会话并限制过期请求和重复候选。

iOS 番剧海报墙按可用宽度排布，保留封面比例；批量重试复用未完成集数的解析结果和已创建条目，减少重复解析与请求。

## 📖 文档与依赖更新 / Documentation & Dependencies

Android/HarmonyOS 版本为 1.8.0 / 180，iOS 为 1.8.0 / 18，同步 README、CHANGELOG、各平台维护文档和发布流程。双端依赖版本未升级；iOS 使用 Expo SDK 57、React Native 0.86.3、LiveKit RN 3.0.0 与 LiveKit WebRTC 144.2.0，纳入前期已固定的原生依赖。共享网页通过 `android:sync` / `harmony:web` 生成，iOS 保持独立 Expo/RN/VLC 工程，平台桥和签名材料保留各自维护边界。

原双端发布已通过网页同步及 Debug/Release 构建；APK/HAP 内部版本均为 1.8.0 / 180，APK v2 签名与既有证书一致，HAP 验签和既有证书链核对通过，两端各 29 个共享网页资源摘要与构建结果一致，详见 [1.8.0 构建与发布验证](https://github.com/Zero-wyc/ZViewerAPP/blob/main/docs/client-v1.8.0-release-validation-20261013.md)。

iOS 已通过 **159 项测试、lint、类型检查**及四种尺寸的番剧布局/添加流程验证。EAS 设备 Release 构建完成，包内 1.8.0 / 18、ARM64、VLC/LiveKit、Release JS、原生桥及源码来源检查通过，全 ZIP CRC 与构建机/下载文件 SHA-256 一致。Go 来源校验固定到 `02f62f1fc52f0c47f2a2f8e6fec8ed22d98539fc` 的 12 个文件，源码归档与 EAS 上传排除账号凭据、签名材料、AGENTS.md 和历史预览导出目录。详见 [iOS 1.8.0 / build 18 验证记录](https://github.com/Zero-wyc/ZViewerAPP/blob/main/docs/releases/ios-1.8.0-18-validation.md)。真实 iPhone/iPad VLC 解码、LiveKit 互听、后台和跨端同步仍需设备验收。

此前 1.7.6 对齐阶段通过 69 项适配、4 项媒体回归、Go 核心测试、20 组搜索布局和 8 组音量场景；浏览器短音频与模拟候选/入队确认覆盖私人漫游自然结束续播及权限竞态。双端当时已完成 Debug/Release 构建、签名与包内资源核验。详细证据见 [1.7.6 对齐验证](https://github.com/Zero-wyc/ZViewerAPP/blob/main/docs/client-v1.7.6-alignment-453-validation-20261013.md)。这些是此前功能实现的验证记录，不代表本轮新增真机验收；真实网易云/VIP 音源、原生 B 站在线解析、物理设备、后台锁屏、蓝牙与跨端同步仍待专项验收。

发布附件包含 `ZViewer-Android-1.8.0-release.apk`、`ZViewer-HarmonyOS-1.8.0-release.hap`、`ZViewer-1.8.0-b18-unsigned.ipa` 和三平台 `SHA256SUMS.txt`。

**iOS 源码已更新至 main。** 保留既有 `client-v1.8.0` 标签 `534e537`，因此 Release 自动生成的 Source code（zip / tar.gz）仍是原双端发布快照。包含本轮 iOS 修复的源码请使用 [main 源码](https://github.com/Zero-wyc/ZViewerAPP/tree/main) 或 [GitHub 生成的 main 源码 ZIP](https://github.com/Zero-wyc/ZViewerAPP/archive/refs/heads/main.zip)；不额外上传源码附件。

---
**完整变更记录**：

[client-v1.7.5...client-v1.8.0](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v1.7.5...client-v1.8.0)

[iOS 追加修复：client-v1.8.0...0146c1f](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v1.8.0...0146c1f)
