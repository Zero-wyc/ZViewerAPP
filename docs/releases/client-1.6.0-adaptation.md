# Android / HarmonyOS 1.6.0 / 160 新服务端适配交付

日期：2026-10-04。实施仓库：`E:/Codex-bulid/ZViewer/ZViewer-client`；分支：`adapt/android-harmony-upstream-20261004`。这是本地开发验收交付，没有发布 GitHub Release，也没有升级用户现有服务端。

| 基线 | 内容 |
| --- | --- |
| 客户端施工前提交 | `9464d12d9f1b34d2f11c4904ce7fa7993850e83b` |
| 目标服务端 | `9827929088a31d7cb1d6bf7ceac096df640a2416`，`v4.3.7-4-g9827929` |
| 双端版本 | `1.6.0`，versionCode `160` |
| Android 交付 | `release/client-v1.6.0/ZViewer-Android-1.6.0-debug.apk`，包名 `com.zviewer.mobile.debug`，内部 versionName `1.6.0-debug`，调试签名 |
| HarmonyOS 交付 | `release/client-v1.6.0/ZViewer-HarmonyOS-1.6.0-unsigned.hap`，bundle `com.zviewer.mobile`，未签名 |
| 源码与核对 | 同目录 `ZViewer-client-1.6.0-source.zip`、`SOURCE-COMMIT.txt`、`SHA256SUMS.txt`；源码仅来自本地提交，不含未跟踪 iOS 文件、依赖、构建缓存或 QA 服务配置 |

## 🚀 新特性 / Features

- 语音接入 `livekit-client`，通过所选服务器的 `/api/voice/token` 获取 URL/token，按 identity 加入和管理成员；主房间 Socket 保留。
- PGS 有序解码与位图 cue 链路完整移植，按视频内容区缩放，文本字幕和设备偏好保留。
- 本地 B站 XML/JSON、dandanplay JSON 弹幕导入，最多 5 MiB / 20000 条，排序与截断反馈。房间上传沿用原 API；JSON 大于 1 MiB 时明确拒绝，避免触发锁定后端的请求体限制。
- 鸿蒙单文件 XML/JSON 使用系统 DocumentViewPicker 回调；Android 沿用系统文件选择，不增加全盘存储权限。
- 网易云 Cookie 登录/主动读取复制，业务鉴权错误与无效 Cookie 区分，剪贴板不可用时提供手动复制；关闭后临时值清空，原扫码保留。

## 🐛 错误修复 / Bug Fixes

- 离房、切服、被踢、连接失败和卸载统一释放原始/处理后的采集、AudioContext 和远端 audio；token/权限/connect/publish 的过期结果不能重启采集。
- 管理员解除禁言仍尊重用户主动闭麦；重连中媒体状态准确，自动播放阻止提供点击恢复。
- 修正 Matroska 元素 ID 和压缩类型，字幕取消/切片结果隔离；移植视频 CueTrack 选择、AAC priming、实际采样率与尾部裁剪补丁。
- 房间弹幕保存失败回滚并向 UI 抛错，拒绝权限不再误报成功；异步导入检查房间变化。
- 我的音乐去掉未实现的下载/本地管理 Tab。

## ⚠️ 破坏性改动 / Breaking Changes

- 语音要求 LiveKit 服务端；不支持旧 v4.2.1 语音事件，不做静默旧协议回退。普通房间业务继续走 Socket.IO。
- 同账号 identity 相同，另一设备加入会顶替原连接并提示。新服务端仍需自行核验 token 路由的入房访问控制，客户端入房门禁不替代服务端校验。
- 此次产物用于验收：调试 APK 与正式包名不同；未签名 HAP 需使用既有证书/Profile 签名后用于真机。没有创建或替换正式签名密钥。

## ⚡ 性能优化 / Performance Improvements

- 删除旧语音处理器、独立媒体 Socket 与旧多实例检测，避免并行语音链路。
- SDK 重订阅去重、幂等音频资源清理；PGS 按顺序保留解码状态。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 锁定 playsvideo `0.4.7` 并提交 patch，postinstall 为 `patch-package --error-on-fail`；根 lockfile 同步 LiveKit 与补丁工具。
- 更新双端维护手册、共同发布流程、README、CHANGELOG 和原方案实施状态；补 LiveKit Apache 2.0 许可。
- 回归脚本需要 Node 24，依赖通过正常 `npm ci` 安装（不跳过 postinstall）。

## 构建与校验

在指定客户端根目录执行：

```powershell
npm run test:media
npm run test:adaptation
npm run android:sync
npm run harmony:web
```

媒体 4 项、适配 14 项，共 **18 项通过**；TypeScript/Vite 两次构建通过。媒体测试覆盖视频 cue、AAC priming/采样率、PGS RLE、压缩元数据；适配测试覆盖晚到权限/连接/切服清理、禁言与主动闭麦、错误重试、弹幕格式/限额、Cookie 权限/请求/状态刷新。测试 harness 的生命周期断言与真实联调结果分开解释。

Android 在 `ZV-Android` 执行，JDK 为 Android Studio JBR：

```powershell
.\gradlew.bat assembleDebug --console=plain
```

Gradle 构建成功，沿用 bilicore AAR。HarmonyOS 在 `ZV-HarmonyOS` 使用现有 DevEco SDK/JBR/Hvigor：

```powershell
hvigorw.bat --mode module -p product=default -p buildMode=debug assembleHap --no-daemon
```

Hvigor 构建成功，报告 `No signingConfig found`，因此产物明确为 unsigned。现有大 chunk、mediabunny 动态导入、dashjs ESM、Gradle 弃用与 ArkTS API 警告保留，没有构建错误。鸿蒙目标 API 26、兼容 API 23；没有新增最低 API 设备验收。

## 原生应用联调证据

测试后端由锁定源码编译到客户端忽略目录 `.ui-validation/upstream-20261004/`，使用独立 SQLite 配置、测试账号与内嵌 LiveKit，`STREAM_PUSH_ENABLED=0`。应用/API 测试端口 3346，LiveKit HTTP 3336、UDP 3333、RTC TCP 7881；只用于这次隔离联调。客户端按响应 URL 连接，没有将测试端口写入产品。

| 检查 | 实际结果与边界 |
| --- | --- |
| Android 原生 WebView + Harmony ArkWeb + 桌面 SDK | 两端测试账号/游客实际加入同一房间，与桌面 SDK 三方加入 LiveKit；桌面发布测试音轨，两端远端 RMS 非零（约 0.0309 / 0.3015），桌面收到两端媒体字节（约 80769 / 67666）。证明采集/传输/解码通路，不代表人工真机听音。 |
| 语音管理/面板 | 禁言、解禁尊重主动闭麦、踢出清除 audio、重新加入、收起面板保持会话通过；重连和晚到结果由自动回归覆盖。 |
| 房间弹幕 | 原生 UI 导入保存后另一端收到广播；游客上传被 403 拒绝并回滚；不会弹出保存成功。 |
| 文件选择 | 双端系统选择器真实返回 XML 文件及中文内容；鸿蒙专用回调可以浏览并取消后重开。JSON 解析由自动回归覆盖，未逐种原生文件格式重复选择。 |
| Cookie | 双端菜单和弹窗布局通过；登录用户缺 MUSIC_U 收到后端 400，复制空值有反馈；游客不能提交/读取。未使用真实有效网易云 Cookie。 |
| PGS/解码 | 双端提取出两条测试 PGS cue，PNG 按画布位置缩放；H.264/AAC 片段实际解码并推进，Android/Harmony 分别观察到 24/73 帧。测试素材为合成片段，不是全长真实 PGS 电影。 |
| 真实 MKV | 现有 639554584 字节 HEVC/Opus/ASS MKV 用 HTTP Range 提取出 467 条 ASS。此项为 Android 原生字幕提取证据，不代表该文件已完成双端完整播放/seek 验收。 |

原生联调脚本在结束时恢复原服务端和登录存储，没有更改用户服务端配置。截图、原生选择器布局、媒体统计和构建日志保存在 `.ui-validation/upstream-20261004/`，不进入源码归档。核心原生桥、B站随机回环代理/凭据存储、系统媒体会话和音乐外部管理语音语义保留。

## 正式发布前剩余验收

- 使用现有正式签名配置生成 release APK/HAP，并在真实 Android/鸿蒙设备安装。
- 首次麦克风授权、拒绝后重试、双向人工听音、音乐共存、扬声器/耳机/蓝牙、前后台/锁屏恢复和重复快速进退。
- 用户部署的 `/rtc` HTTP/validate 与 WebSocket Upgrade、实际 UDP/TURN 可达性及网络断开恢复。页面/API 正常不代表媒体网络正常；503 按未就绪反馈。
- 真实长 MKV 的 PGS/ASS/SRT、冷启动、连续加载、多次前后 seek、切影片取消、音画偏移、内存释放及新版桌面与双端字幕广播一致性。原鸿蒙 HEVC Main 10 限制仍保留。
- 真实网易云 Cookie/扫码/退出、原生 JSON 文件与重复同名选择、弹幕偏移/隐藏/删除/重载；文件根缓存修复、业务 Socket 重连、系统控件、B站双轨 Range、主题/旋转和屏幕共享等完整保留功能矩阵。

方案第 9 节完整验收表仍是正式验收清单；上述已通过的子集不能替代剩余场景。可用施工前提交回档，但旧客户端语音须与旧服务端搭配。

---
**完整变更记录**：本地 `git log 9464d12..HEAD`，交付包旁的 `SOURCE-COMMIT.txt` 记录本轮最终提交；上游范围见 [原适配方案](../upstream-2026-10-04-android-harmony-adaptation.md)。
