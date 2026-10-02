# ZViewer iOS

独立 Expo SDK 57 / React Native 工程，当前 **1.5.0 / b15 源码 Expo Go 界面预览（未构建新 IPA）**。对照 client-v1.5.0 固定参考迁移产品行为，与隔离的官方服务端 v4.2.1 联调。保持 `NativeMediaAdapter → VlcPlayer → VlcVideo` 单一 VLCKit 内核，WebRTC 仅用于既有共享观看接收。

按用户要求集中实现功能后交用户自行签名和验收。**候选版尚未完成真机验收，不能视为双端等效版**。功能、构建和逐项限制见 [b15 预览记录](../docs/releases/ios-1.5.0-15-preview.md)；历史 b12 证据保留在 [原计划](../docs/ios-continuation-plan.md)。

b14 修复开屏原生纵向布局增长、会话恢复等待和退出后旧请求回写，并校验损坏外观偏好；原 b13 功能继续保留。具体根因、回归与当前包见 [开屏复核](../docs/ios-openscreen-fix-summary.md)。

## b13 功能基线

- 当前影片/片单/播放状态乱序协调，规范 URL/cid 本机解析，切换与重连代次隔离；观众 watch 控制申请和房主审批统一进入屏内/手势/系统命令路径。
- 影片级 B站 CLI/服务器 MP4/管理员 DASH、自动/手动与真实 qn、失败保留策略和进度；解析有限缓存、账号会话/cid/服务器/策略隔离。Go 来源逐文件固定核对和打包摘要。
- 语音稳定 instanceId、volatile 拥塞丢帧、媒体初始化 ACK 后收发和断线重绑；后台释放麦克风/语音音频，前台静音重入。
- 重复曲目按队列项推进，四种播放模式/结束处理；账号/音质/服务器改变重新取流。歌词 20 项/5 分钟请求合并、旧曲隔离、失败重试和当前行。
- 两模式 Now Playing 状态/标题/封面/动作、sessionId 比较清理、原生 VLC 命令和进度桥接；后台 audio 声明；封面流式读取 ≤2 MB。
- 浅/深/系统主题、本地背景文件、圆角/透明度/模糊/位置/缩放/旋转/遮罩及减少动态效果；持续根主题和独立 Modal 覆盖，普通表面替代不可用玻璃效果。
- 手动旋转锁/恢复自动、全屏临时锁/恢复、安全区；一起看三分区双击与 ±15 秒，一起听纯净视频手势控制真实音频。
- 音乐静音关联视频搜索/分 P/追加/删除、画质/解析策略/同源重加；44pt 收起按钮、图片规范化/失败占位、评论/楼层回复。番剧多选、批量/部分失败保留重试。

既有片单、挂载管理、字幕弹幕、网易云账号/歌单、B站 QR/Keychain/目录、共享观看接收及 OBS-FLV 保留。

## 预览和构建

**用户要求先 Expo Go 验收界面。** 使用 `npx expo start --go --tunnel --port 8081`，当前服务保持运行；VLC/本机 B站/语音不可在 Expo Go 验收。b15 对齐全局主题/背景、首页/大厅、房间标签/竖屏视频下方评论、片单/集中选集、音乐/设置弹窗；B站入口显示文字，标题/提示有主题底色和对比度保护。图片及 expo-blur 可在 Expo Go 预览。原先待中的 b14 EAS 已取消，后续 EAS Build 必须待用户确认界面及再次构建。下面是届时构建操作，当前不要执行。

```powershell
cd ZV-iOS
./scripts/build-ios-unsigned.ps1
# 等待完成：./scripts/build-ios-unsigned.ps1 -Wait
```

上传脚本先规范 Bash 为 LF，再验证 9 个共享 Go/依赖/许可证文件与参考 `1ca96fd46963ff5cb89beb6c3d31e1d7b9f501fc` 一致、生成来源摘要。EAS archive 限定本工程；workflow 下载校验固定 Go/Opus、重建 ARM64 vendors、host Opus smoke、CNG/Pods、iphoneos Release 和 unsigned IPA。

计划下一包：`release-assets/ZViewer-1.5.0-b15-unsigned.ipa`，**目前不存在、尚未构建**，不提交 Git；内置 JS，无需 Metro，**用户自行签名后安装**。Expo Go 不含 VLC/Go/语音桥接。当前仅 unsigned-device 准备 vendors，development/simulator 尚需相应流程。

```sh
npm ci
npm test
npm run lint
npm run typecheck
npx expo-doctor
npx expo export --platform ios
# 后续 IPA 构建完成后再检查：
python scripts/inspect-unsigned-ipa.py release-assets/ZViewer-1.5.0-b15-unsigned.ipa
```

b14 的 59 项单测、lint/typecheck、iOS/Web 导出、37 项 Yoga 布局记录（含旧版复现）、13 项真实 Provider 的模拟原生端口回归、20 项开屏 Web 和 43 项既有 Web 房间布局复验通过。Yoga 使用独立 3.2.1 WASM，并启用与 RN Fabric 默认一致的 ErrataAll；这些检查不能替代 UIKit 真机。Doctor 20/21：WebRTC New Architecture 未测试、私有本地模块无 Directory 元数据，未屏蔽。Go 两包可编译但源目录无测试，不等于 CDN 回归。

新脚本 `check-ios-421.cjs`（协议/合成语音帧）、`check-ios-range-421.cjs`（本地 MKV 传输）、`check-continuation-ui.cjs`（Web 三尺寸布局，网易云上游 fixture）需隔离官方 v4.2.1 服务和 Web 导出服务，默认端口 7343/7347。不连接 NAS，不读取用户音乐/B站账号；历史报告不覆盖。

## 验收边界

真机出声/解码、十分钟 MKV/MP4、HEVC/FLAC/HLS/分离轨、实际 CDN/账号、跨端语音/蓝牙/来电、原生方向/键盘/大字体/PiP/安全区，均待后续新包验证。系统完整歌词页没有等价实现，保留应用内歌词。

后台 host 播放/暂停/seek 有原生通路；**JS 完全暂停时没有独立原生房间 Socket 心跳/切歌/观众审批管线**，待前台恢复回流，不能宣称完整后台同步闭环。重复曲目的跨端同步未新增线上队列项字段。重连完整既有成员列表受现有服务端契约限制。

继续 `UIRequiresFullScreen=true`，iPad Split View 关闭；复杂 ASS 特效使用 VLC 原文件。无自动 push、标签、证书签名、TestFlight 或商店发布。CNG 管理生成目录，维护本地 Module/config plugin，不手改生成工程，不执行 Capacitor iOS 同步；遵循 [AGENTS.md](AGENTS.md)。

开屏回归脚本：`check-home-ui.cjs`、`check-session-startup.cjs` 默认输出隔离 b14 测试目录，依赖本工作区已有 Playwright/esbuild；既有 `check-continuation-ui.cjs` 支持 `IOS_TEST_OUTPUT` 避免覆盖历史证据。`check-home-yoga.mjs` 使用工程实际 homeLayout 样式，在工程外 `npm pack yoga-layout@3.2.1` 并解包，再传入包的 `dist/src/index.js` 路径；不添加应用运行时依赖。

b15 新增 `check-room-yoga.mjs`：六尺寸/两模式/侧栏共 24 组实际 roomLayout 模型；扩展 Web 房间回归为 59 项，覆盖用户 iPad 尺寸及手机短横屏。用户 Expo Go 真实运行仍待验收。

本轮界面验证：59 单测、29 首页/59 房间音乐/21 来源 Web，0 JS 异常。首页包括两主题/黑白背景/低透明度的文字对比度；check-native-parity.cjs 包含 60 来源/80 集、分列、多选重试和真实后端保存，支持 IOS_TEST_OUTPUT。iOS/Web 导出及 expo-blur ~57.0.3/默认壁纸纳入通过，Doctor 20/21 提示未隐藏。b14 首页 Yoga/Provider 是历史专项证据，不是当前原生完整页面验收。
