# Android / HarmonyOS 2.1.8 / 218 验证记录

> 历史本地迭代记录：2.1.8 / 218 未公开发行。本轮最终版本已按用户指定调整为 **4.1.9 / 419**，包含后续胶囊文字对齐与状态动画修订；最终安装包、419 宿主复核及发布状态以 [4.1.9 验证记录](client-4.1.9-validation.md) 和 [4.1.9 发行说明](releases/client-4.1.9.md) 为准。下文版本、包大小和验收结论仅对应当时的 218 构建，不能冒充最终 419 验收。

日期：2026-10-22（Asia/Shanghai）。状态：本地构建、自动化与模拟器验证完成，待用户真机验收，尚未推送或发布。客户端源码、平台工程与 Git 操作均在指定 `ZViewer-client` 仓库。基线：客户端 `5e829a4`（2.1.7），服务端固定 `e3af086c7bd98ee0d4697386b69678f92ea54d81`（v4.7.4）。本轮只更新 Android/HarmonyOS；未修改 NAS、服务端部署或 iOS。

## 实现范围

- A01：非 B站影片卡采用图标＋粗体中文胶囊按钮，移除运行时辅助说明及滑动开关。添加面板按用户最终要求恢复原有说明卡＋滑动开关，保留草稿默认值和来源显隐。中转仅 anime/Kazumi/CMS 显示，两项独立；影片卡默认折叠，观众只读，屏幕共享隐藏。按用户反馈将图标由 16px 缩至约 13–14px、文字 12–13px、可见胶囊 32px，外层点击区域保留至少 44px；按所在面板宽度自适应。
- A02：最小 PUT；消费权威 Movie，缺字段旧响应则 GET；保存中的 Socket 策略不提前应用，确认值与旧广播冲突时重新读取片单。GET 代次、保存阶段、房间/服务器会话及操作令牌共同保护。当前影片使用完整播放标识，保留时间/倍速/暂停意图，成功 attach 后才写可广播状态；失败停止管线并同步上次成功源的暂停态，新设置保留，可重试。非当前影片只保存。
- A03：ani-subs 明确 false 不丢失；Kazumi 元数据解析、有效旧 URL 回退、代理解包与源站头保留，拒绝占位地址与添加者凭据；Kazumi/CMS 相对代理按各自选中服务解析；观众中转策略双向同步。
- A04：Go 与 ArkTS 的真实 UGC/PGC fnval 位修正，保留会员、AV1、8K 和 MP4 分支；Go AAR 已重建。
- A05：JSON/NDJSON/CLI 接收 HDR 元数据，准确 codec/profile 三态预检，明确不支持时不销毁旧源，手动本机选档先解析确认。B01 手动 HDR/音乐背景 HDR 按计划后置，保留现有普通 SDR 与 HDR/Dolby 过滤；B02 可选 desktopManaged 类型未实施。
- A06：实际活动 publisher/subscriber PC/ICE 媒体监看，约 10 秒加入/重连/中断反馈，每轮提示有上限；等待麦克风权限不计时。诊断不可用不误断通话，旧 PC、计时器与回调清理，线路只认当前 selected pair。

## 自动化与构建

| 检查 | 本轮结果 |
| --- | --- |
| npm run test:adaptation | 240 / 240 通过 |
| npm run test:media | 4 / 4 通过 |
| go test ./... | core、mobile 全部通过 |
| node vendor/local-patches.mjs --check | 6 / 6 补丁在位 |
| TypeScript / Vite | 通过 |
| npm run native:android | ARM64 / x86_64 Go AAR 重建通过；trimpath、-s -w |
| npm run android:sync / harmony:web | 通过；只用生成脚本同步平台资源 |
| Gradle Debug / 正式签名 Release | 通过 |
| Hvigor Debug / 正式签名 Release | 通过；临时本机签名配置已恢复 |

A01/A02 新行为用例覆盖：Socket 先于 HTTP、HTTP 先于 Socket、最小写入、缺 Movie 响应兼容、非当前影片、重复操作、403/超时后权威刷新、旧房间/服务器、保存期间旧 GET、两个权威 GET 乱序、同 URL 策略一次 attach、进度/倍速/暂停、加载中暂停、应用失败的正确房间暂停、切回上一影片、离房后的旧 attach 不广播。独立审查发现并修复的请求乱序与应用前状态泄露问题均进入回归。

解析用例通过实际 helper/解析链路验证旧 Kazumi、占位 URL 拒绝、源站头、代理解包、两个中转方向、LAN/公网入口及路径前缀，第三方 URL 不收到 ZViewer token。B站用例截获实际 Go/ArkTS 请求，验证精确 profile 与未知能力、旧引擎及失败选档保持。语音用例覆盖双 PC、替换监听、当前线路、10 秒每轮反馈、恢复、权限等待与离房清理。接口/浏览器夹具结果不扩大为线上源站或真实设备验收。

## 浏览器与原生运行

首轮浏览器验证（添加面板随后按用户要求恢复，见文末修订）：Ego 中加载实际 `MovieRuntimeSettings` 与 `MoviePushPanel` 的隔离组件夹具，320/360/393/768/914px × 深浅主题 × 100%/130% 字体共 20 组布局测量通过。胶囊无横向溢出/截字，字重 700，触摸高度至少 44px；四种组合、保存期间双按钮禁用与 aria-busy、观众只读、分享端非 owner 只读、Enter 操作、运行设置与添加草稿互不影响均通过。该夹具的保存响应受控，真实 API 乱序由上述 roomStore 行为测试和原生本地服务验证；不将组件夹具算作设备播放验收。Ego 窗口最小化导致 screenshot 拒绝，未据此声称浏览器截图视觉验收。TaskSpace 和 Vite 夹具服务已关闭。

后续图标尺寸反馈已单独回归：同样 20 组宽度/主题/字体组合均通过，正常字体实测图标 12.95–14.04px、可见胶囊 32px、最小点击高度 44px，Space 操作与保存忙态保持。容器查询按实际面板宽度缩放，字号下限使用 rem 以尊重字体放大；窄屏允许整按钮换行。最终包已复装两端 Debug 宿主核对实际页面。

原生运行使用 Android Medium_Phone x86_64 / API 37 与 HarmonyOS Pura 90 Pro x86_64 / API 26，安装本轮源码构建的 Debug APK / 签名 Debug HAP，实际页面 origin 分别为 `https://localhost` 与 `https://zviewer.local`，未导航到 Vite 或替换产品组件。隔离服务复用上游真实鉴权、数据库、影片 PUT/GET 与 Socket.IO；仅 ani-subs 解析和严格限于本地夹具文件的媒体代理返回本地 H264/AAC HLS。生产回环地址中转受 SSRF 规则保护，测试没有放宽生产规则。临时身份与数据库只在忽略目录。

| 场景 | Android 房主 → HarmonyOS 观众 | HarmonyOS 房主 → Android 观众 |
| --- | --- | --- |
| 影片卡播放设置默认收起、展开后观众只读 | 通过 | 通过 |
| 中转/转码四种组合、最小字段 PUT | 通过 | 通过 |
| 同 URL 只改策略真实重挂载 | 每次 loadeddata 增加一次 | 每次 loadeddata 增加一次 |
| 暂停在 10 秒、1.5 倍速后切设置 | 双端保持 | 双端保持 |
| 恢复播放 | 两端时间及解码帧数增长 | 两端时间及解码帧数增长 |

初次测试中 Pura 热启动后的媒体管线未初始化，普通 MP4 与 MSE sourceopen 也无响应；前台、屏幕唤醒和鉴权正常仍复现。临时关闭热启动后冷启动恢复，原配置按原字节恢复，随后双向播放测试通过。没有因此修改生产媒体引擎。前期夹具还经历了 60 秒样本结束以及回环代理 403，均在独立夹具中处理后重测。失败诊断、最终 `android-host-results.json` / `harmony-host-results.json`、截图与本机诊断位于 `.ui-validation/alignment-474/native/`；不提交测试身份、原始 token、设备存储或签名材料。前次紧凑图标包复装后实际测量：Android 411×914，图标 14.04px、文字 13px / 700、可见胶囊 32px、点击 44px；HarmonyOS 359×789，图标 12.96px、文字 12px / 700、可见胶囊 32px、点击 44px。均无横向溢出或残留 transform，最终截图与 `responsive-ui-results.json` 已保存；片段预览为 `harmony-compact-preview.png`。完整播放互测后只调整展示组件与 CSS，最终包再次安装进行上述显示检查，播放逻辑保持同一实现。

## 安装包与签名

最终安装包位于 `release/client-v2.1.8/`：

- `ZViewer-Android-2.1.8-release.apk`：76,761,577 字节，2.1.8 / 218，apksigner verify 通过。
- `ZViewer-HarmonyOS-2.1.8-release.hap`：14,303,786 字节，2.1.8 / 218，debug=false，hap-sign-tool verify-app 通过。
- APK 的 33 个、HAP 的 31 个网页资源与最终脚本同步目录逐字节相同；临时 HarmonyOS 签名配置已恢复。
- 每个最终包在本次构建完成后各计算一次 SHA-256，记录于同目录 `SHA256SUMS.txt` 和 `package-metadata.json`，后续发布复用，不重复构建校验。

该目录为本地忽略产物，不代表 GitHub 已发布。正式签名 Release 完成静态包检查；原生运行时证据来自 Debug 宿主，不能替代正式包实体设备验收。

## 验收边界

真实双设备语音、局域网 UDP/公网 TCP/TURN 选路、移动硬件 HDR 显示、HarmonyOS API 23 实体设备尚待用户环境验证。普通自动 SDR/账号边界继续回归；不因能力声明、浏览器或模拟器结果宣称真机 HDR 或通话验收通过。iOS 不构建。公开下载仍为此前用户验收并发布的 2.1.7；本轮没有源代码推送、标签或 Release 操作。

## 本地提交

本轮源码、维护文档与执行/验证记录一起在指定仓库本地提交，未包含原有的 1.9.6 发行说明改名；没有执行 push、tag 或 GitHub Release。

## 后续界面修订：添加面板恢复与选中态增强

用户要求添加面板维持原样式，并指出运行时胶囊单独开启时高亮不明显。`MoviePushPanel` 已恢复 `PlaybackOptionToggle` 的标题、说明与滑动开关，仅修改草稿；`PlaybackOptionButton` 仅供影片卡运行时使用，开启态改为主题色实心填充＋on-primary 对比文字＋勾选标记，关闭态保留表面色描边。勾选位置始终占位避免按钮宽度随状态跳动，图标/文字的自适应与 44px 点击区域保持。

本次仅修改展示组件与样式，重新进行浏览器实际组件验证和双端构建；前文双向模拟器播放互测对应同一播放逻辑，未将本次样式验证冒充重新进行全部原生播放/真机验收。后续签名安装包、资源一致性和构建时 SHA 记录替换为本轮新构建结果。

本次修订复跑适配回归 240/240 通过。Ego 实际组件完成 40 组宽度（320/360/393/768/844px）、字体 100%/130%、深浅与蓝/红主题组合：选中背景等于主题 primary、文字为 on-primary、勾号可见；关闭为表面色与描边、勾号隐藏；标签无截字或横向溢出，字重 700，点击高度至少 44px，状态切换不改变宽度。添加区原说明与 Switch 可见，修改草稿不产生运行设置请求；四种组合、忙态与只读状态通过。颜色矩阵在隔离夹具中关闭过渡动画以读取最终样式；最小化浏览器拒绝截图，未将此项描述为截图视觉验收。证据为忽略目录 `settings-feedback-matrix.json` 与 `settings-feedback-interaction.json`。TaskSpace 和 Vite 已关闭。
