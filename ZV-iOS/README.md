# ZViewer iOS

独立 Expo SDK 57 / React Native 工程，当前 **源码/Release 1.5.1，复用内部版本 1.5.0 / build 16 的未签名 IPA，本次未重新进行 Expo/EAS 构建**。对照 client-v1.5.0 固定参考迁移产品行为，与隔离的官方服务端 v4.2.1 联调。保持 `NativeMediaAdapter → VlcPlayer → VlcVideo` 单一 VLCKit 内核，WebRTC 仅用于既有共享观看接收。

按用户要求集中实现功能后交用户自行签名和验收。**2026-10-02 用户确认此前 b15 的 iOS 真机 UI 检测通过。build 16 的轨道选择与 ASS 原生显示，以及音视频、语音和后台功能的完整真机矩阵仍待验收**。功能、构建和逐项限制见 [b15 预览记录](../docs/releases/ios-1.5.0-15-preview.md)；历史 b12 证据保留在 [原计划](../docs/ios-continuation-plan.md)。

b14 修复开屏原生纵向布局增长、会话恢复等待和退出后旧请求回写，并校验损坏外观偏好；原 b13 功能继续保留。具体根因、回归与当前包见 [开屏复核](../docs/ios-openscreen-fix-summary.md)。

历史 [b15 功能/布局补充](../docs/releases/ios-1.5.0-15-followup-preview.md)：整份歌单播放/追加、连续私人漫游、在线弹幕搜索弹窗和双列集名、横竖展开菜单、音乐首页与日推日期。当时用户完成真机 UI 复验并提交 unsigned-device EAS Build；原 I13 限制保留。

**更新说明：** 由于 Expo Build 的额度限制，iOS 端更新与错误修复会出现延迟，不会与 Android/鸿蒙两端同步完成（除非有人有 Mac 帮忙编译）。

当前发布见 [iOS 1.5.1 发行说明](../docs/releases/ios-1.5.1-release-notes.md)与[维护文档](../docs/ios-maintenance-architecture.md)，使用独立标签 `ios-v1.5.1`。本轮修复播放设置/字幕/弹幕分页、轨道选中提示、音乐同步确认重复、B站分享文本解析和字幕重复渲染。历史 [1.5.0 / b15 交付记录](../docs/releases/ios-1.5.0-15-unsigned.md)及其 `client-v1.5.0` 附件保留。

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

此前用户已在 Expo Go 完成 b15 真机 UI 检测并确认通过；最新修复的 build 16 IPA 已构建和检查。1.5.1 发布复用该包，本次不运行下列构建命令。Expo Go 可预览图片、expo-blur 和 RN 界面；VLC/本机 B站/语音仍需安装包测试。以后先完成界面与本地检查，再按维护者授权提交云构建。下面保留后续需要重新构建时的操作。

```powershell
cd ZV-iOS
./scripts/build-ios-unsigned.ps1
# 等待完成：./scripts/build-ios-unsigned.ps1 -Wait
```

上传脚本先规范 Bash 为 LF，再验证 9 个共享 Go/依赖/许可证文件与参考 `1ca96fd46963ff5cb89beb6c3d31e1d7b9f501fc` 一致、生成来源摘要。EAS archive 限定本工程；workflow 下载校验固定 Go/Opus、重建 ARM64 vendors、host Opus smoke、CNG/Pods、iphoneos Release 和 unsigned IPA。

本次复用包（内部版本 1.5.0 / build 16）：`release-assets/ZViewer-iOS-1.5.0-build16-unsigned.ipa`，构建及校验状态见维护文档，不提交 Git；内置 JS，无需 Metro，**用户自行签名后安装**。Expo Go 不含 VLC/Go/语音桥接。当前仅 unsigned-device 准备 vendors，development/simulator 尚需相应流程。

```sh
npm ci
npm test
npm run lint
npm run typecheck
npx expo-doctor
npx expo export --platform ios
# 后续 IPA 构建完成后再检查：
python scripts/inspect-unsigned-ipa.py release-assets/ZViewer-iOS-1.5.0-build16-unsigned.ipa
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

b15 展开播放器补充：`check-music-player-ui.cjs`（同隔离端口/依赖，支持 IOS_TEST_OUTPUT）覆盖六尺寸、80 行歌词与封面/控件边界，共 31 项。原房间 59 项复验通过。播放卡/图标工具栏/完整歌词区与双端结构对齐，iPad 竖屏双栏；原生安全区/大字体/音频仍待验收。无新 EAS Build/Update，见 [音乐页补充](../docs/releases/ios-1.5.0-15-music-preview.md)。

### 2026-10-02 音乐首页横幅与滑动补充

iOS 横幅改为加载原始宽图并等比铺满，去掉仅用于专辑封面的 CDN 方图裁切；支持手动左右滑动、双向首尾循环和定位条，短拖动/竖向滚动不切图，手动操作避开自动轮播。70 单测、60 项 RN Web/CDP 触摸与既有功能检查、lint/typecheck、本地 iOS/Web 导出通过；这不是 UIKit 真机通过证明。只修改 iOS 与维护记录，双端程序未变；没有新增 EAS Build/Update 或 IPA，继续 Expo Go Reload。
详见 [横幅补充](../docs/releases/ios-1.5.0-15-banner-preview.md)。
