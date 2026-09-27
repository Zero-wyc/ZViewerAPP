# Android 内置 B 站代理验收报告

日期：2026-09-27。依据工作区中的《安卓内置CLI-自动最高画质方案.md》实施，方案快照见 [android-bilibili-plan.md](android-bilibili-plan.md)。

## 交付行为

Android 内置 Go 核心和 Capacitor 桥接，无需另外安装 CLI。登录后默认自动最高普通画质，以实际轨道、账号权限和设备能力决定，排除 HDR、杜比视界。普通账号不会获得会员权限。

没有 1080p 以上可播放轨道时优先 720p；已经选择的最高轨道失败时先尝试备用 CDN，再重新解析一次，再回退 720p。720p 也失败或不存在时尝试可用更低档位，全部失败则提示错误。恢复过程共享 60 秒预算，单次解析最长 45 秒、单次 DASH 加载最长 30 秒，并受剩余预算限制。

手动选择按影片保留，包括其分 P；其他影片默认自动最高。手动切源失败会恢复原可播放源、策略、实际画质标签和进度。播放源缓存区分账号会话、影片 URL/分 P、画质策略、代理实例及设备能力；账号或分 P 切换后不复用旧源。Android 观众按本机账号独立解析，房间继续同步进度与播放状态。

Cookie 只进入 Go/Java 原生侧，以 Android Keystore AES-GCM 加密保存在 `noBackupFilesDir`；JS 的登录响应移除 Cookie。代理仅监听 `127.0.0.1`，使用随机端口和随机路径，限制来源与已签发 CDN 地址，支持 Range、HEAD、取消和备用地址。房间广播使用上游媒体地址，不广播本机代理路径凭据。

## 本轮通过的检查

| 检查 | 结果与证据 |
| --- | --- |
| TypeScript 检查、Vite 构建、Capacitor 同步 | 通过 `npm run android:sync` |
| 前端单元测试 | `npm test`，6 项通过 |
| 浏览器回归 | `npm run test:e2e`，37 项全部通过；包含原有布局、音乐、语音、FLAC、房间与新增 B 站用例 |
| Go 核心及本机服务 | `npm run test:native`，两个包全部通过；`go vet ./...` 通过 |
| Android 编译与 Java 单元测试 | `:app:assembleDebug :app:testDebugUnitTest` 通过 |
| Android Lint | `:app:lintDebug` 通过；修复 API 27 主题属性位置及可选摄像头声明，仍有原有资源/构建建议警告 |
| Android 仪器测试 | `:app:connectedDebugAndroidTest`，2 项通过：原生服务生命周期、Keystore 加密读写和不可备份目录 |
| 从源码重建 AAR | 移走现有 `bilicore.aar` 后，Gradle 自动重建并成功打包 |
| 最终 APK 安装与原生桥接 | 模拟器安装成功，代理健康检查 HTTP 200，公开状态不含 Cookie |
| 实际 B 站二维码接口 | 原生生成 PNG 二维码、返回待扫码状态、保存至相册、取消后拒绝继续轮询，全部通过 |
| Android WebView 双轨播放 | 合成 H.264 1920×1080、1280×720 加 AAC 音频，在同一 MediaSource 播放；时间推进、跳至 4 秒后继续播放，均无媒体错误 |
| 前后台恢复 | Home 后返回客户端，原生服务地址不变、健康检查继续成功 |
| APK 签名和页对齐 | `apksigner verify --verbose`、`zipalign -c -P 16 4` 通过；APK 在 16 KB 页模式运行成功 |

浏览器新增场景包括：登录启用本机 DASH 默认值；手动选择与其他影片隔离；退出时缓存失效；实际档位与请求档位不同；本机地址不进入解析返回源；自动重试一次后回退 720p；720p 加载失败后回退 480p；切源保留 3 秒进度和暂停状态；正常暂停/短暂 stalled 不降画质；失败的手动选择恢复原源；登录事件只触发一次重载；分 P 缓存隔离；网络预读挂起时有限超时并取消。

Go 用例覆盖普通/会员权限、HDR/杜比排除、分辨率/帧率/编码筛选、缺失的高档位发现、最高仅 720p、无 720p 时真实 480p、显式更低档位、最终轨道 ID、分 P、未登录/取消/总超时，以及代理来源限制、CDN 地址校验、Range、HEAD 和备用 CDN。

本地原始证据保存在忽略的 `release/`：`browser-acceptance.log`、`frontend-unit.log`、`android-final-build.log`、`android-bilibili-smoke.json` 和 `android-bilibili-account.png`。仪器测试 XML 位于 `ZV-Android/app/build/outputs/androidTest-results/connected/debug/`。

## 测试环境与 APK

- Windows，Node 24、Go 1.26.8、JDK 21、Android SDK 36、NDK r30。
- Android 模拟器：Medium_Phone，Android 17 / API 37，x86_64，系统页大小 16384；浏览器回归使用本机 Chrome。
- APK：`release/ZViewer-Android-1.2.0-debug.apk`。
- 包名 `com.zviewer.mobile.debug`，versionName `1.2.0-debug`，versionCode `120`。与正式版并存，应用数据独立。
- 原生 ABI：`arm64-v8a`、`x86_64`；首版要求 64 位 Android，最低 API 24。
- 发布目录提供 `SHA256SUMS.txt`，APK、AAR、SDK 路径、测试日志和签名密钥均不提交到 Git。

## Git 仓库检查与整理

`ZViewer-client` 原本就是有效的独立 Git 仓库，origin 为 `https://github.com/Zero-wyc/ZViewerAPP.git`。保留原有历史和远程，以及本轮开始前已有的平台迁移；Android 路径迁移由 Git 识别为重命名。

补齐根许可证、CLI/Go/二维码许可证、第三方说明、贡献文档、`.editorconfig`、`.gitattributes`、构建产物忽略与 GitHub Actions 构建工作流。Gradle Wrapper 和必要的媒体库源码保留在 Git，`gradlew` 标记为可执行。检查未暂存密钥、账号存储、APK、AAR、本机 SDK 路径或 node_modules。`git fsck --full` 无对象损坏，`git diff --cached --check` 无格式错误。

GitHub Actions 配置已加入，本轮未推送或执行远程 CI；本地同等源码构建已验证。

## 未覆盖的实测

本轮没有真实账号登录凭据和连接的物理手机，因此没有完成扫码确认后的真实账号播放、普通/大会员 CDN 实测、4K/8K/高帧率实机解码、不同电脑/手机权限的双端同步，以及蓝牙、有声听感、长时间播放和系统杀进程恢复。相关账号及权限逻辑用可控接口测试验证；二维码生成/轮询为实际接口检查。WebView 媒体测试使用合成片段，不能当成真实 B 站会员视频播放证据。

本包可用于下一轮真实账号和物理设备验证，不应将本报告解读为所有 Android 设备或所有 B 站内容均已实测通过。
