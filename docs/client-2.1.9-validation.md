# Android / HarmonyOS 2.1.9 / 219 验证记录

日期：2026-10-22（Asia/Shanghai）。状态：**最终 2.1.9 / 219 双端 Debug 模拟器界面复核通过，正式签名 Release 的签名、资源及版本检查通过，已发布 GitHub Latest 正式 Release**。同一播放代码的 HLS 双向互测在此前误填版本 4.1.9 / 419 的 Debug 包完成，以下单独记录，不作为 219 包重新执行 HLS 的证明。此前公开版本为 2.1.7 / 217；历史本地运行证据见 [2.1.8 记录](client-2.1.8-validation.md)。

客户端修改和 Git 操作均在指定 `ZViewer-client` 仓库。服务端固定基线为 `e3af086c7bd98ee0d4697386b69678f92ea54d81`（v4.7.4），客户端公开基线为 `5e829a491d3bd0612fb48c5294ae463312f8c066`（2.1.7）。本轮不修改 NAS 或服务端部署；iOS 不修改、不构建、不发布。

## 实现范围

| 项目 | 实际实现 |
| --- | --- |
| A01 播放设置界面 | 非 B站影片卡新增默认折叠的运行时设置；中转与转码独立，观众只读、屏幕共享隐藏。添加面板保留原 `PlaybackOptionToggle` 说明卡与 Switch，草稿默认值及来源显隐保持。 |
| A02 即时应用事务 | 最小 PUT，消费权威 Movie，兼容旧响应后读取片单；协调 HTTP/Socket 乱序及迟到 GET。当前影片保存后真实重载，保留进度、倍速与暂停意图；成功 attach 后才广播，失败保留新设置并暂停房间，可重试。非当前影片只保存。 |
| A03 解析与观众同步 | ani-subs 保留明确 false；Kazumi 优先元数据解析，兼容有效旧 URL 和代理解包，保留源站头，拒绝占位地址及添加者的服务端凭据。Kazumi/CMS 相对代理按各自选中服务器、路径前缀和原生通道鉴权，观众中转策略双向协调。 |
| A04 B站请求 | Go/ArkTS 实际 UGC/PGC fnval 位修正，保留会员、8K、AV1 与 MP4 分支；Android Go AAR 已重建。 |
| A05 解码防护 | JSON/NDJSON/CLI 接收 HDR 元数据，按准确 codec/profile 进行支持/不支持/未知预检。明确不支持的手选档位保留原播放；账号边界与普通 SDR 策略保持。 |
| A06 语音媒体监看 | 监看实际活动 publisher/subscriber PC/ICE，加入、重连和中断约 10 秒反馈；等待麦克风权限不计时。诊断不可用不直接断开通话，旧 PC、监听与计时器清理，仅以当前 selected pair 显示线路。 |

B01 移动端手动 HDR/音乐背景 HDR 后置，保留 HDR/Dolby 过滤；B02 可选 `desktopManaged` 类型本轮未实施。没有为新版默认端口新增手动 UDP/TCP 开关，也未改动已部署的 NAS 网络。

## 胶囊最终交互与几何验证

`PlaybackOptionButton.tsx` / `.css` 固定左侧图标与外层尺寸，内容区对称预留半个勾号区域。关闭时，文字在图标右侧剩余区域居中；开启时，文字向左移半个勾号区域，右侧勾号出现，同时以 primary 实心背景与 on-primary 文字区分。文字行框和左图标垂直居中。可见胶囊保持紧凑，正常字体约 12–13px、图标约 13–14px，外层触摸高度至少 44px，按面板宽度与字体大小适配，空间不足整按钮换行。

实际组件在隔离 Vite 夹具中由 Ego 加载，使用产品 `MovieRuntimeSettings` 与 `MoviePushPanel`；受控保存函数用于 UI 状态，真实 REST/Socket 事务由下方行为回归及历史原生本地服务互测覆盖。

- 最终几何矩阵：320/393/768px × 字体 100%/130% × 深/浅主题 × 系统字体/华文行楷，共 **24 / 24** 通过。华文行楷由本机 STXingkai FontFace 实际载入，不把字体声明当作已载入证据。
- 图标与文字行框垂直中心最大误差 **0.00390625px**；关闭时文字在右侧剩余区域的中心误差最大 **0.0015625px**。开启后文字左移 **9–12.35px**，左侧图标及按钮 x/y/宽/高保持不变，勾号可见；关闭时勾号隐藏。
- 无横向溢出、截字或遮挡，触摸高度至少 44px；添加区仍有原说明与两个 Switch。此前同一功能还通过 40 组宽度/字体/深浅/蓝红主题的选中对比色、四种组合、忙态、只读及草稿独立性检查。
- 正常标签/勾号过渡为 160ms；减少动态效果设置生效时为接近即时的 10µs。几何最终态测量仅在夹具中关闭过渡，另移除夹具覆盖后检查真实 reduced-motion 与 normal 样式。
- 浏览器窗口最小化，截图与 CDP 截图均被明确拒绝，故此项为 DOM/CSS 几何与交互验证，不声称截图视觉验收。TaskSpace 已关闭，测试不触碰线上身份。

本机忽略证据：`.ui-validation/alignment-474/pill-alignment-geometry.json`、`pill-alignment-motion.json`、`settings-feedback-matrix.json`、`settings-feedback-interaction.json`。这些夹具文件不进入发行源码。

## 自动化与构建

| 检查 | 最终本轮结果 |
| --- | --- |
| npm run test:adaptation | 240 / 240 通过 |
| npm run test:media | 4 / 4 通过 |
| go test ./... | core、mobile 全部通过 |
| node vendor/local-patches.mjs --check | 6 / 6 补丁在位 |
| TypeScript / Vite | android:sync、harmony:web 内构建通过 |
| Android Go AAR | 修改后的 ARM64 / x86_64 产物已重建 |
| Gradle Debug / 正式签名 Release | 最终 2.1.9 / 219 构建通过 |
| Hvigor Debug / 正式签名 Release | 最终 2.1.9 / 219 构建通过 |

行为用例覆盖最小写入、HTTP/Socket 双向顺序、缺 Movie 兼容、迟到片单与 GET、重复操作、403/超时权威刷新、旧房间/服务器取消、同 URL 策略一次 attach、进度/倍速/暂停保持及失败正确暂停。源解析用例验证旧 Kazumi、占位 URL 拒绝、源站头、两个中转方向、LAN/公网与路径前缀，以及第三方媒体不接收 ZViewer token。B站请求测试截获实际 Go/ArkTS 参数，解码预检与语音监看有独立行为回归。接口夹具通过不扩大为线上源站或真机能力验收。

## 最终 219 Debug 宿主复核

最终 2.1.9 / 219 Debug APK / 签名 Debug HAP 已在 Android API 37 与 HarmonyOS API 26 模拟器的实际打包页面完成界面复核；页面 origin 分别为 `https://localhost` 与 `https://zviewer.local`，没有导航到 Vite 或替换产品组件。双端关闭/选中截图已目视检查，添加区两张原说明 Switch 卡保留，胶囊文字与图标对齐、选中实色/勾号、状态切换与无横向溢出符合要求。

| 最终宿主界面检查 | Android | HarmonyOS |
| --- | --- | --- |
| 图标/文字垂直中心误差 | 0.000035px | 0.0022px |
| 关闭时右侧区域居中误差 | 0px | 约 0.000002px |
| 开启后标签左移 | 9.5px | 9px |
| button / pill / icon 位置和尺寸 | x/y/宽/高固定 | x/y/宽/高固定 |
| 原添加说明卡、选中实色与勾号、无横溢出 | 通过 | 通过 |
| 减少动态效果 | 实际 0.01ms | 实际 0.01ms |

正确版本的证据位于 `.ui-validation/release-219/native/`：`summary.json`、`android-geometry.json`、`harmony-geometry.json`、两端版本记录和对应的 `selected-preview`、`unchecked-preview`、`original-draft-cards.png`。本项确认实际安装的 Android versionName=2.1.9-debug / code219、HarmonyOS versionName=2.1.9 / code219；正式签名 Release 仍只计入下节静态验包。

219 复核后的原存储与导航已恢复，模拟器配置按原字节还原，测试服务和调试转发全部停止；恢复证据为同目录 `cleanup-results.json`。

### 同代码播放互测：4.1.9 / 419 历史 Debug 包

本轮版本元数据更正前，误填为 4.1.9 / 419 的 Debug 包通过本地 H264/AAC HLS 解码与四种运行中策略切换，分别由 Android、HarmonyOS 充当房主并以另一端为观众。更正为 2.1.9 / 219 时仅修改版本元数据，UI 与播放逻辑相同；正确 219 包已另行重建并执行上方原生界面轻量复核。本表实际运行包为 419，不能表述为 219 完整播放重测。

每次切换后双端保持 10 秒、暂停、1.5 倍速，恢复后进度和实际解码帧继续增长：

| 同代码 419 Debug 播放场景 | Android 房主 → HarmonyOS 观众 | HarmonyOS 房主 → Android 观众 |
| --- | --- | --- |
| 中转/转码四种组合切换 | 通过 | 通过 |
| 每次切换后的 10 秒 / paused / 1.5x | 双端保持 | 双端保持 |
| 恢复后实际解码帧 | 房主 36、观众 40，持续增长 | 房主 54、观众 38，持续增长 |

历史运行汇总见 `.ui-validation/release-419/native/summary.json`。本项使用隔离的真实本地房间/API/Socket 与 HLS 媒体环境，不扩大为线上源站或真实设备验收；正确 219 Release 包的静态检查另列如下。测试环境恢复与临时服务清理已完成。

早期 218 亦完成双向房主/观众 HLS 互测，具体夹具问题、诊断和原有测试范围见历史记录；218、419 和正确 219 的安装及测试范围分别登记。

## 最终安装包与静态检查

目录：`release/client-v2.1.9/`。

| 资产 | 大小与版本 | 静态检查 |
| --- | --- | --- |
| `ZViewer-Android-2.1.9-release.apk` | 76,761,773 字节；2.1.9 / 219 | apksigner v2 通过，aapt 确认版本；33 个网页资源与最终同步目录逐字节一致 |
| `ZViewer-HarmonyOS-2.1.9-release.hap` | 14,303,786 字节；2.1.9 / 219，debug=false | hap-sign-tool verify-app 通过；module.json 确认版本；31 个网页资源与最终同步目录逐字节一致 |
| `SHA256SUMS.txt` | 构建完成时分别计算一次 SHA-256 | 后续交付和发布复用，不重复计算或为发布重新构建 |

正式签名 Release 静态验包、Debug 原生宿主运行和真实设备验收分开记录；签名及资源一致不表示已完成正式包实体设备安装/播放验收。签名材料、本机配置、Agents.md、测试身份及缓存不进入公开源码。

正确包的版本/签名/资源检查日志位于 `.ui-validation/release-219/`，SHA 与包元数据记录为 `release/client-v2.1.9/SHA256SUMS.txt`、`package-metadata.json`；每个最终包摘要只计算一次。

## 未覆盖与发布状态

真实双设备语音、局域网 UDP/公网 TCP/TURN 选路、移动硬件 HDR 显示、HarmonyOS API 23 实体设备和全部设备硬件解码仍未验收。本轮不构建或发布 iOS，也不以浏览器、模拟器或能力声明替代真机结论。

源码已推送 main，版本标签 `client-v2.1.9` 指向构建源码提交 `f021bb0146baad0643ed3315ca4c994e6711899f`。正式发行标题为 **ZViewer-Client V2.1.9**，于 2026-10-22 11:04:06（Asia/Shanghai） 发布（Release ID 420262477）；API 确认 draft=false、prerelease=false，Latest 为该标签。APK、HAP、`SHA256SUMS.txt` 三项资产均为 uploaded，名称、大小及服务端摘要与构建记录一致；复用构建时摘要，未重复下载或计算校验。源码与包审查无阻断项，使用 GitHub 自动源码归档，不另打源码压缩包。

发行说明：[2.1.9](releases/client-2.1.9.md)。正式 Release：[client-v2.1.9](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v2.1.9)。远端发布元数据保存在本机忽略目录 `release/client-v2.1.9/published-release.json`；状态以实际 API 确认为据。
