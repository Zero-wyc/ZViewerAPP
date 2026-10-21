# Android / HarmonyOS 2.1.7 / 217 验证记录

日期：2026-10-21（Asia/Shanghai）。本次为本地修复候选，未推送 GitHub、未创建 Release。原生工程、网页资源和本地提交均在指定 ZViewer-client 仓库完成。

## 现象、原因与修复

- 用户短链 `https://b23.tv/eI0bzE2` 已实际展开为 `BV1TYJQ63EKh`。当前代码首次解析已有短链分支，不能将其描述成完全没有短链实现；缺口在分享文本、展开后切画质/分 P 仍读取原短链，以及 Go 规范化时丢失 `?p=N`。共享输入处理和双端解析现保留分 P，后续操作复用展开后的规范地址，显式 CID/page 优先。服务端 `resolver.ts:expandBilibiliShortLink` 已按 GET 重定向、最终地址、BV/PGC 识别顺序处理，本次对齐这一顺序，不改服务器部署。
- `BV1N3nw6KEjc` 页面元数据实际为 1080×1920，AVC 轨道包含 1080P=1080×1920/24fps、720P=720×1280/24fps、480P=480×852/24fps。旧横屏能力和鸿蒙固定高度筛选误排除前两档，造成仅 480P 可选。能力探测现分别测量横屏、竖屏；鸿蒙保留 AVC、AAC 与 1080P 长短边性能上限，逐轴核对真实能力。不能把真正不支持的编码、帧率或尺寸强行放行。
- 一起看全屏按当前 video 的实际解码尺寸选择方向，监听 metadata/resize 处理迟到和换源，退出/离房恢复自动旋转。横屏视频保留原有横屏方向；同一比例的 resize 不反复覆盖用户主动解锁。其他投屏播放器沿用原方向规则。

## 自动化与构建

| 检查 | 结果 |
| --- | --- |
| npm run test:adaptation | 212 / 212 通过 |
| npm run test:media | 4 / 4 通过 |
| go test ./...（native/bilicore） | core、mobile 全部通过 |
| node vendor/local-patches.mjs --check | 6 / 6 通过 |
| TypeScript、Vite、android:sync、harmony:web | 全部通过 |
| Gradle Debug / 正式签名 Release | 通过；Go AAR 由修改后的源码重建 |
| Hvigor Debug / 正式签名 Release | 通过；临时本机签名配置已恢复 |

新增回归覆盖：分享文本与转义 URL、相似域名拒绝、竖屏能力检测成功/拒绝、ArkTS 720P/1080P 筛选、AVC/AAC 与帧率约束、短链展开不带凭据、分 P 参数及显式 CID/page 优先、添加后继续切画质和分 P、双端方向锁定及退出恢复。自动化保留 CLI-only 与原有账号边界。

## 两端实际运行时

Android：Medium_Phone x86_64，API 37，原生 WebView。HarmonyOS：Pura 90 Pro x86_64，API 26，原生 ArkWeb。安装最终源码构建的 Debug APK / 签名 Debug HAP，运行各自实际打包页面；未把页面导航到 Vite 或替换组件。

隔离服务复用本地上游真实鉴权、房间、Socket.IO、影片与状态广播，使用临时本地身份。实际视频来自用户指定 `BV1N3nw6KEjc` 的 AVC/AAC DASH 流，仅由回环 Range 代理补 Referer/CORS，无重编码或分辨率转换。解析端能力选择和短链分 P 另由上述 Go/ArkTS 夹具覆盖；本项原生实播不宣称完成了模拟器扫码登录后的一体化 B站添加流程。

| 场景 | Android | HarmonyOS |
| --- | --- | --- |
| 720×1280 AVC/AAC 双轨 DASH | 持续解码，进度与帧数增长 | 持续解码，进度与帧数增长 |
| 点击全屏 | 411×914，portrait-primary | 359×789，portrait-primary |
| 全屏内切换 1080×1920 DASH | 持续解码，保持竖屏 | 持续解码，保持竖屏 |
| 全屏内切换 640×360 横屏 HLS | 改为横屏 | 改为横屏 |
| 点击退出全屏 | 退出全屏，解除方向锁定 | 退出全屏，解除方向锁定 |

先前夹具的通配 CORS 不兼容 dash.js 携带凭证请求，另有隐藏目录 sendFile 规则导致横屏夹具 404；修正测试服务的 CORS，并改用已验证的本地 HLS 横屏样本后重跑。此处为测试夹具问题，未据此修改客户端网络策略。最终结果见忽略目录 `.ui-validation/bili-portrait-20261021/native-results.json` 与两端截图。

## 安装包

- Android Release APK：76,756,325 字节，2.1.7 / 217，apksigner 验证通过。
- HarmonyOS Release HAP：14,287,747 字节，2.1.7 / 217，debug=false，hap-sign-tool verify-app 通过。
- APK 33 个、HAP 31 个网页资源逐字节匹配最终同步目录；源码生成资源仍由 android:sync / harmony:web 维护。
- 最终包仅各计算一次 SHA-256，保存在 `release/client-v2.1.7/SHA256SUMS.txt`，后续发布直接复用。包位于同目录 `ZViewer-Android-2.1.7-release.apk`、`ZViewer-HarmonyOS-2.1.7-release.hap`。

## 边界与新增反馈

运行时证据来自模拟器 Debug 宿主；签名 Release 包完成版本、资源、签名检查，不扩大为正式包实体设备安装验收。未覆盖 API 23 鸿蒙真机、设备全部硬件解码器、扫码账号的一体化添加与 NAS 线上配置。iOS 不修改、不构建。

新增“仅登录服务端，未登录本机代理时无法添加”按用户要求只诊断，结果见 [账号路由核查](bilibili-server-login-diagnosis-20261021.md)：添加面板显示服务端登录状态，而 Android 添加入口强制要求本机代理，拦截发生在服务端请求之前。本项尚未改动，不能把前三项修复或上述实播称为解决了它。

本地测试服务、设备调试转发和模拟器在验证后停止，恢复测试前本机存储。临时会话、原始媒体 URL、签名材料、服务配置和 AGENTS 文件不进入提交。
