# ZViewer 1.8.6 本地候选验证

日期：2026-10-13。用户授权修复 iOS 最新同步机制兼容、息屏/桌面音乐切歌和末尾拖动问题，并构建 IPA；随后为 Android/HarmonyOS 加入关于应用和更新提示。仅本地构建和提交，未发布 GitHub。

## 变更依据与实现

- 服务端基线：[89eafa5](https://github.com/Zero-wyc/ZViewer/commit/89eafa51253e7b548c416c2a7282e8f688111ce5)，已下载覆盖指定本地源码目录。新服务端同时提供房主采样和每 2 秒服务器权威推算样本；旧 iOS 每个样本相差 2 秒就 seek，并在心跳中反复重新解析。
- iOS 使用单一服务器时钟、媒体就绪/身份/seek 门控和稳定窗口，纯进度心跳不取消解析；加入 clientTs 和每 10 秒 CHECK_STATUS 自愈。
- iOS 音乐保留同一原生视图并直接换源，加载编号隔离旧回调；系统媒体控制立即执行，有限后台任务覆盖换曲间隙。仍依赖音频后台资格维持业务 JS/Socket，没有独立原生业务 Socket。
- 音乐末尾拖动按播放模式执行下一首/单曲循环/末曲停止；外部源诊断避免把 HEAD 探测失败误说成服务器不可达。
- 双端新增关于应用、原生当前版本、启动自动检查、手动检查和安装包下载提示。仅选择稳定 client Release 和对应 APK/HAP，通过系统浏览器下载；界面跟随深浅主题、圆角和玻璃设置。

## 已完成验证

- iOS lint/typecheck；185 项逻辑与真实组件回调回归，包括两条心跳交替、加载/seek 门控、纯进度不重解析、音乐复用原生视图、旧回调、Expo nativeEvent 编号、末尾三种队列策略。
- Android/HarmonyOS：76 项适配、4 项媒体、3 项更新服务回归通过；TypeScript/Vite、ArkTS Release、Android Release、签名/既有证书一致性、各 29 项共享资源摘要校验通过。
- 关于/更新页：320×568、390×844、844×390、768×1024、1366×1024，深浅主题、自动弹出、版本显示、手动检查、正确 HAP 下载链接、无更新、离线反馈、Escape 关闭及横向无溢出；0 页面异常。此部分是浏览器和桥接替身验证。
- iOS 最终构建：[build 25](https://expo.dev/builds/e2402c07-9b01-4fe8-8e51-21dc8109f840)。中间 build 24 已编译，但最终交付使用补齐原始 Expo 事件编号兼容后的 build 25。
- 最新服务端 ZIP 的 744 个文件覆盖比对，归一化换行后 0 内容差异；本地真实 Socket.IO 运行上游 PlaybackMemoryHandler、HeartbeatHandler、PlaybackBroadcasterService，验证两种心跳、自检漂移/健康回复、serverTs 和暂停控制。数据库/权限使用隔离替身，此项不证明生产数据库/账号审批或真机播放。
- build 25 状态 FINISHED，离线检查确认 ARM64 iOS 设备包、1.8.6 / 25、未签名/未加密、Release JS、VLC/LiveKit/本机桥接与后台 audio 声明；原生 replaceSource、加载编号、切歌后台任务、JS 自检/clientTs/nativeEvent 标记均存在。三端 ZIP CRC 和 606 个包内文件隐私扫描通过；暂存源码 955 个文件扫描无私有账号、签名密码或 AGENTS.md。

## 交付与待验收

本地候选安装包在 `release/client-v1.8.6/`，SHA256SUMS 随包提供。Android/HarmonyOS 采用既有发布签名；iOS 内部 1.8.6 / 25、未签名，需要自行签名后安装。

| 安装包 | 字节数 | SHA-256 |
| --- | ---: | --- |
| ZViewer-1.8.6-b25-unsigned.ipa | 47,339,166 | `2d025c71ed87ca2b540c85df94abc04de0024c1d04d66400d51c97f606ea1f49` |
| ZViewer-Android-1.8.6-release.apk | 28,871,799 | `756ae3a6cbf103a5b9312ebf926f63bb5588ae9f6d89a15a4f8682af331959c7` |
| ZViewer-HarmonyOS-1.8.6-release.hap | 14,193,024 | `b47b31735b0c95f05584a1f051becbffcd8a5a3722d06122b5fdccc84d317d73` |

原始离线包检查见 [iOS inspection](ios-1.8.6-25-ipa-inspection.json)；三端构建/测试/签名/资源/隐私检查摘要见 [validation JSON](client-1.8.6-validation.json)。正式 IPA [云端下载](https://expo.dev/artifacts/eas/1p5_0YQ0T7X_TQ_dGOHbkzxkDbCEYq4v3uDRj8F0jss.ipa)。

1. 最新服务端下，网页/安卓/鸿蒙房主播放 B站和聚合番剧，iOS 观众连续观看至少 5 分钟；暂停/恢复/拖动/切 P/晚加入/重连后检查没有持续反复拉进度。
2. iOS 一起听分别作为房主和观众，网易云与 B站各连续三首；锁屏和桌面状态分别测试自然结束、房主远程切歌和控制中心 next/prev，检查新曲有声且全房间状态一致。
3. 播放中把进度拖到末尾，分别测试顺序循环、单曲循环、顺序末曲；主动暂停期间拖动仍保持暂停。
4. 安卓/鸿蒙安装候选，主页打开关于应用检查真实版本；正式 Release 发布后验证启动提示、平台安装包链接和系统浏览器下载。GitHub 暂时不可达时不把失败标为最新版。

构建/离线包检查不能代替以上设备验收。当前公开 1.8.5 低于候选 1.8.6，候选本身不会因为未发布而误报存在更新；自动提示的新版本路径已用 1.8.7 夹具验证。
