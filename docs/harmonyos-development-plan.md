# HarmonyOS 客户端开发与验收文档

更新日期：2026-09-28。适用目录：`ZV-HarmonyOS/`。功能/交互基线：用户确认当前阶段完善的 Android 1.2.1（Git HEAD `f815daf`）。
当前鸿蒙目录只有 README；没有 ArkTS 工程、HAP、签名/真机测试证据。本文是待实施计划，不代表鸿蒙功能已完成。

## 1. 开发前必读与指南核验

每次开始开发、升级 SDK、配置权限/签名、打包或发布前，必须阅读：
1. 用户提供的 [鸿蒙应用开发发布完整指南](../../鸿蒙应用开发发布完整指南.md)（2025 版，位于仓库外，交接需一并提供）。
2. 本文、[PORTING](../PORTING.md)、[贡献说明](../CONTRIBUTING.md)、[平台契约](../src/platform/contracts.ts)、[Android 变更记录](../CHANGELOG.md)。
3. 对应已安装 SDK/API 的华为官方文档；记录 IDE、SDK、API、Hvigor、ohpm、Node、设备系统版本和实际查阅日期。

指南用于覆盖环境→账号→工程→权限→签名→测试→发布全过程；其示例不是可以直接照抄的项目配置。冲突时以实际 SDK schema、官方文档和本项目需求为准，记录纠正依据。

| 指南内容 | 本项目处理规范 |
| --- | --- |
| “DevEco 5.0 最新”、Node 18、API 9/12 与 4.0/5.0 示例混用 | 在 H0 冻结一致的 HarmonyOS 工具链/最低支持版本；不混用旧 Java 鸿蒙、OpenHarmony 示例与商业 HarmonyOS 工程配置 |
| 调试/发布证书数量、有效期、地区数据 | 不当作永久规则；在开发者控制台核对，只记录本项目证书状态，不复制营销性数字 |
| “发布证书有完整权限” | 签名不授予任意系统权限；声明、用户授权与受限权限资格分别核验 |
| hdc install certificate.cer | 不作为部署命令；签名材料由工具用于签署应用，真机安装签名 HAP，按工具帮助/官方流程检查 |
| build-profile JSON、环境变量占位、ProGuard 示例 | 用当前 DevEco 模板/schema 和支持的签名/混淆机制；不假设任意字符串自动环境展开，不把 Android ProGuard 当 ArkTS 混淆方案 |
| 摄像头、定位、存储示例 | 仅按实际功能申请。显示 B 站二维码供用户扫码不需要本机摄像头；语音才申请麦克风 |
| “零崩溃、3秒、500MB、A+、AES-256、区块链证书”等 | 不宣称统一官方审核硬指标；本项目先测性能基线并定义阈值，发布规则从当期官方渠道核对 |

官方参考：[开发入门与签名](https://developer.huawei.com/consumer/cn/develop-novice-guide/)、[DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/)、[ArkWeb 应用与页面通信](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/web-app-page-data-channel)、[本地媒体会话](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-V5/local-avsession-V5)。新 API 必须按目标 API 可用性核对。华为入门文档明确真机运行需签名 HAP，预览器/模拟器验证不能取代真机验收。

## 2. 总体架构与当前缺口

采用 ArkTS Stage 模型 + ArkWeb 本地资源宿主，优先复用根 React DOM 前端，使布局与 Android 自然保持一致。鸿蒙不是 APK 兼容壳，不用 Capacitor 生成鸿蒙工程。

```text
ZViewer-client/
  src/                         Android/鸿蒙 Web 业务和界面
    platform/                  Web 宿主的平台边界
  public/ vendor/ tests/       公共资源、网页媒体依赖与测试
  packages/protocol/           待提取：三端 DTO/事件/权限
  packages/shared/             待提取：三端纯规则
  native/bilicore/             已有 Go 核心；鸿蒙绑定待验证
  ZV-Android/                 已有 Java/Capacitor 宿主
  ZV-iOS/                     独立 Expo/RN 工程
  ZV-HarmonyOS/               待创建：
    AppScope/
    entry/src/main/ets/
    entry/src/main/resources/rawfile/web/
    entry/src/main/module.json5
    build-profile.json5
    oh-package.json5
```

packages 目录是规划；尚未实现。鸿蒙脚本应从根目录构建 dist，将版本一致的产物同步入 rawfile/web（或经验证的资源方案），不复制维护另一份 src，不提交生成的打包资源。

现有平台层仅预留 zviewerNative 和返回事件。旋转/沉浸/音频/权限/最小化没有鸿蒙实现；BilibiliProxy 当前仅启用 Android，HarmonyNativeBridge 没有 B 站方法，不能宣称接壳即有全部功能。

## 3. 完整软件实现目标

| 范围 | 目标行为 | 主要实现与可行性验收 |
| --- | --- | --- |
| 启动/连接 | ZViewer 图标/启动背景、异常重试、自定义服务器、HTTPS 与明确的 LAN 策略 | 本地资源/字体/worker/WASM 均可加载；无网启动可显示连接页；鉴权和 Socket 的 Origin/CORS 实测 |
| 账号/大厅 | 账号/游客、刷新恢复、换服务器、房间列表、创建、容量/权限限制 | 复用 Web 业务；鸿蒙持久化/清理与升级恢复，服务端权限最终校验 |
| 房间 | 密码、审批、房主/观众/管理权限、踢出、转让、重连、关闭/离开 | 保持事件契约和资源生命周期；与 Android/iOS 基础链路对测 |
| 片单/选源 | 添加、删除、顺序、选片、分 P、清晰度、各源浏览入口 | 对照 Android B站、Emby/Jellyfin、OpenList/WebDAV/FTP、挂载/服务器文件和番剧入口逐一验证 API/权限 |
| 同步观影 | 播放/暂停/seek、进度/速率、心跳、重入房间与断网恢复 | 先 MP4/HLS，再 DASH 分离音视频、FLV、MKV/WASM；每类源做独立能力验证 |
| 媒体格式 | 记录实际设备支持的编码、容器、音轨和字幕；保留 16/24位 FLAC 回归 | Android 媒体库可进入 ArkWeb 但不保证内核支持；失败再评估 AVPlayer/原生解封装/服务端兼容输出 |
| 聊天/弹幕 | 评论历史、发送、实时弹幕、轨道、样式/过滤和权限 | 复用 Web；弹幕随屏缩放默认开，用户修改持久化；大量消息和全屏性能测试 |
| 字幕 | 选择/加载/样式、内嵌字幕能力和时间轴 | 复用解析/叠加；手机默认12、短边≥600 CSS px默认15，并验证密度/系统字体下的效果 |
| 一起听 | 音乐账号/来源、搜索/队列/歌单、歌词、同步切歌和设置 | 复用现有模块，分别验证 Web Audio/AudioWorklet/音频解码；系统媒体会话由鸿蒙适配 |
| 房间语音 | 权限、加入/退出/静音/成员状态；收起面板不挂断，离房释放 | 沿用 Socket.IO Opus/PCM 帧协议，验证 WebCodecs/PCM回退与 Web Audio；缺失则原生采集/编解码桥接 |
| 屏幕共享观看 | WebRTC 接收、OBS HTTP-FLV观看两条链路；手机不发起屏幕采集 | ArkWeb RTCPeerConnection 与 FLV/MSE 分别验证；不支持时使用原生接收器或兼容输出，不能只改客户端信令 |
| 内置 B站账号 | 扫码展示/保存分享、取消/过期/注销、安全存储 | ArkTS 原生模块处理凭据，返回非秘密状态；账号不是房间共享数据 |
| B站画质/代理 | 每人用自己的账号；最高有权普通画质、排除 HDR/杜比、手动保留、有限恢复优先720p | Go规则候选复用；本机代理 Range/HEAD/取消/备用CDN、随机路径、loopback、后台恢复和真实声画测试 |
| 系统交互 | 顶栏/全屏旋转、沉浸、安全区、软键盘、返回层级、长按粘贴、图标与主题一致 | 窗口/系统栏/输入法/ArkWeb能力经平台层调用；避免 native inset 与 CSS safe-area 双重留白 |
| 音频/后台 | 媒体与语音切换、有线/蓝牙/来电、后台恢复、锁屏控制 | ArkTS 音频会话/AVSession；后台运行按所选 SDK 规则声明，不依赖后台 JS 定时器永久运行 |
| 发布/升级 | 签名HAP真机安装、覆盖升级保留设置、稳定错误恢复 | 版本/签名/BundleName匹配，隐私文案、许可和商店资料齐备后方可发布 |

目标是 Android 当前功能等效，不承诺任何设备支持任意格式。尚未支持的能力显示明确状态，不保留点击后无响应的入口。

## 4. 界面及操作规范

- 基准文件：src/App.tsx、src/mobile/MobileRoom.tsx、src/mobile/mobile.css、PlayerDisplayControls.tsx 和各业务模块。
- 流程保持连接→登录/游客→大厅→房间；顶栏返回、房名、旋转、语音、设置，聊天/片单/房间页签和播放控制顺序一致。
- 手机竖屏上下布局，宽屏横向播放器/侧栏；标签切换不销毁播放器，旋转保留时间点、草稿、语音。
- 返回先退出全屏/关闭覆盖层，再执行离房确认，最后遵循宿主导航；系统返回不能同时被宿主和网页处理两次。
- 页面内容、标签名、权限提示、失败重试及默认设置与 Android 对齐；不另造鸿蒙菜单体系。
- 对照截图覆盖窄屏手机、平板、横竖屏、键盘、较大字号、安全区；测试触控滚动、复制粘贴与读屏语义。尺寸阈值以实际窗口/CSS视口核验。

## 5. 三端共享与无法共享部分

| 内容 | 共享程度 | 鸿蒙实现方法 |
| --- | --- | --- |
| DTO、Socket、权限、错误码、纯房间状态、字幕歌词解析/同步算法 | 可提取为纯 TS 三端共享包，目前未建立 | 与 Expo 使用相同 fixtures；ArkWeb直接用JS，不能假设受限ArkTS可直接编译全部TS代码 |
| React DOM 页面、CSS、public、网页播放器与音乐组件 | Android/鸿蒙可复用，Expo不能直接复用 | 打包根dist，先验证 ES/WASM/MSE/WebCodecs/AudioWorklet/WebRTC；iOS 用 RN/原生渲染实现同语义 |
| UI 设计 token、素材和操作规范 | 三端共同维护 | Web使用CSS，Expo转换为RN样式；鸿蒙壳负责系统边界 |
| native/bilicore Go 核心 | 共享源码和策略测试的候选 | 先验证目标 HarmonyOS SDK/ABI、Go runtime、网络/TLS、构建与桥接；gomobile AAR/XCFramework 不能直接用于鸿蒙 |
| Go 无法落地时的解析代理 | 协议/策略可共享，实现不能强行共享 | 评估 ArkTS/C++原生实现并共用测试样本；服务端代理只能作为明确标注的过渡差异，不能伪称已有本机CLI |
| Capacitor Java、Swift Expo Module、Gradle/Xcode | 不能复用二进制或宿主代码 | ArkTS实现窗口、权限、生命周期、媒体会话、存储；经统一行为契约调用 |
| 凭据与用户数据 | 只共享模型/迁移规则，不跨端自动共享数据 | Android Keystore、iOS Keychain、鸿蒙按目标SDK选 HUKS/安全存储，Cookie 不过 JS/房间广播 |
| 测试 | 纯规则/协议样本三端共享 | Playwright仅覆盖网页；鸿蒙加原生/签名HAP真机测试，不能用Android通过替代 |

## 6. ArkWeb 桥接与媒体工程规范

1. Stage UIAbility 管理宿主；业务页面仍在 Web 层。ArkTS不复制房间状态机，不散布平台判断到共享组件。
2. 用当前 SDK 的 javaScriptProxy/消息通道建立桥；在页面初始化前完成握手。现契约检查 window.zviewerNative.platform === 'harmony'，应由JS包装层显式设置；不要假设代理能直接暴露普通对象属性或自动返回 JS Promise。
3. Promise桥采用请求ID、响应/错误、超时、取消及销毁清理；能力表标注实际实现，缺失能力不能默默当作成功。
4. 已有显示/音频/权限接口按 contracts.ts 实现；返回用 zviewer:native-back。补 B站 start/status/createQr/pollQr/cancelQr/logout/saveQr 契约，并移除功能层仅Android判断的依赖，保留Android回归。
5. 本地页面URL、资源根路径与可信Origin要先验证：/assets、/voice-processor.js、字体、动态import、worker/WASM不能因 rawfile 加载改变而失效；麦克风/安全上下文、CORS、WebSocket、环回代理逐项验证。
6. 桥仅暴露给受信本地内容，外链交系统浏览器/隔离视图；导航与参数校验、方法白名单、异步异常处理必须明确。不得放宽为任意网页可调用原生权限。
7. 麦克风同时处理系统权限与Web组件媒体授权。只在用户加入语音时请求；拒绝、永久拒绝、取消、离房后的迟到授权都释放资源。
8. 原生替代播放器必须接入一致的 MediaAdapter 状态/释放协议，并验证字幕弹幕叠加、点击层级、全屏和同步，不能只证明AVPlayer能单独出画。
9. WebView销毁/离房清理Socket监听、MediaStream、AudioContext、播放器、定时器、代理连接；前台恢复重新检查会话和源有效性。

## 7. 环境、签名与发布规范

- Windows 上使用 DevEco Studio 的 HarmonyOS SDK、匹配 Node/ohpm/Hvigor 和 hdc；H0 记录绝对工具路径/版本，避免与根 npm 的 Node 或 Android JDK 混淆。此轮未检查本机工具安装完备性。
- Stage phone/tablet 工程由实际版本模板生成；冻结 bundleName（拟 com.zviewer.mobile，须控制台确认）、versionName、递增 versionCode、最低/目标API，证书与Profile一致。
- 权限按需：网络、用户主动语音所需麦克风，以及经验证需要的保存/分享或后台能力；使用系统选择器时遵循其授权机制，不申请无关位置/通讯录/广泛存储。
- 先完成账号实名认证/应用登记与调试签名，关联测试设备，验证Profile/证书期限；正式发布使用对应发布材料，测试覆盖升级签名连续性。
- 私钥/p12、密码、Profile/p7b、SDK路径和账号令牌在仓库外管理；补齐忽略规则并审查 staged diff。环境变量签名注入必须经工具验证，不能照搬指南伪配置。
- 初期记录 hdc list targets、Hvigor帮助和实际构建任务；签名HAP用当前 hdc 安装并检查退出码、启动与 hilog。APP/HAP发布形态按当前官方分发要求核对。
- 上架前准备真实截图、隐私政策/权限用途、第三方许可、合法演示服务器和版本说明，核对控制台要求；不上报含Cookie/token的日志，不把“已打包”标为“已发布”。

## 8. 分阶段交付

| 阶段 | 可交付版本 | 继续条件 |
| --- | --- | --- |
| H0 工具/宿主验证 | 可安装签名HAP、加载本地页面、桥握手、资源清单 | phone/tablet最小启动、方向/返回、Origin与日志有效 |
| H1 业务与界面 | 登录、大厅、房间、聊天、片单 | Android操作对照通过，权限/断线恢复通过 |
| H2 媒体可行性 | MP4/HLS/同步、字幕弹幕，再验证复杂格式 | 10分钟播放、3点seek、退出/重入、双端同步；每类格式实测 |
| H3 实时/音频 | 一起听、Socket语音、WebRTC和FLV观看 | 拒绝授权/迟到授权、收起面板、切模式、来电/蓝牙/后台通过 |
| H4 内置B站 | 原生账号、代理、画质/回退 | 工具链先通过，再普通/会员/失效账号、720p/1080p真实声画与seek验证 |
| H5 发布候选 | 全量回归、升级、性能/耗电与发布材料 | 用户真机通过、代码提交/标签、证据和可回滚版本齐全 |

iOS上游截断问题的修复发布情况作为共同服务端兼容矩阵的一项；不把尚未发布的服务端行为当作鸿蒙既有依赖，也不为适配鸿蒙破坏Android当前可用路径。

## 9. 每个版本必须测试、commit 与可回滚

每个内部测试版和正式候选版都执行：实现 → 可行性验证 → 记录结果 → Git commit → 提供安装包 → 用户验收。用户测试未通过则修复当前版，先不添加下一步功能。

- 根 npm test / npm run build；改Web共享层跑 npm run test:e2e；改Go跑 npm run test:native。改跨端契约必须回归Android构建和已实现的Expo能力，结果分别记录。
- DevEco/Hvigor 编译与签名校验，真机安装/启动/覆盖升级；只通过编译或预览不能验收版本。
- 真机测试登录/房间、此版功能主链路、横竖屏/键盘/返回、断网/恢复、播放/seek、权限、后台与资源释放；至少手机和平板目标设备有覆盖计划，缺设备标为未验收。
- 性能可行性记录首帧、seek恢复、长时间内存/CPU、耗电、音画同步及语音延迟；先建立基线，再设明确阈值。
- 写 docs/releases/harmonyos-<版本>-<构建号>.md：被测commit、工具/SDK/设备/服务端、步骤与预期/实际、通过/失败/阻塞、截图/脱敏hilog、包位置/SHA-256和用户结论。
- 在 ZViewer-client 根执行 git status、git diff --check、审阅暂存差异，按具体路径暂存该版代码/锁文件/测试/说明，提交如 feat(harmonyos): complete <scope> with validation；禁止把密钥、HAP、缓存或无关未完成工作混入。
- 可行性失败/设备缺失仍可 commit checkpoint 保存工作，但必须标记阻塞，不能标为已完成；用户通过后记录验收提交及唯一 harmonyos-v<版本>-b<构建号> 标签。
- 共享修改的提交需能辨认影响的三个客户端；每版记录上一个通过标签。回滚用 git revert 创建撤销记录，重新构建与回归；安装升级的 versionCode 继续递增，不依赖降级安装。
- commit 不是 push/上架；后两者按用户明确安排执行。完成报告必须列出commit、证据、HAP及残余差异。

### 版本记录模板

版本/构建号：
被测commit / 最终提交或标签 / 上一个通过标签：
工具链与API/设备系统/服务端：
功能范围、共享代码变更、Android操作对照：
测试步骤/预期/实际/通过或失败：
原生构建与签名结果：
HAP位置、SHA-256、脱敏证据：
用户验收/未验收项：
回滚目标与恢复测试：
