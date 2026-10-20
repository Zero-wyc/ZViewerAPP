# 2.1.3 / 213：双端投屏横竖屏动态切换

日期：2026-10-20（Asia/Shanghai）。客户端起点 `16afdd8`（2.1.2 / 212），修改仅在指定客户端仓库。本轮本地构建、提交，不推送、不发布，不修改 NAS/服务端或 iOS。

## 问题与修复

用户报告手机开始投屏后，切换横屏/竖屏，观众画面的方向一直停在开始时。接收端 `WebrtcWatchPage.tsx` 已监听视频 resize/loadedmetadata 并周期读取实际视频尺寸；本轮不增加信令协议或通过强制观众旋转掩盖源尺寸问题。

### Android

原 `ScreenSharePlugin.java` 只通过 MediaProjection.Callback.onCapturedContentResize 更新采集尺寸。该回调从 Android 14 / API 34 起提供，旧系统没有更新入口；具体契约见 [Android 官方投屏说明](https://developer.android.com/media/grow/media-projection) 和 [回调参考](https://developer.android.com/reference/android/media/projection/MediaProjection.Callback)。

修复在 API 33 及以下注册应用级 DisplayManager.DisplayListener，以实际默认显示器的物理尺寸更新采集。Activity 关联的 Display 会使用该窗口的旧配置，后台尺寸读取须使用应用级上下文。显示事件合并等待 150ms，并在已有的 2 秒统计周期复核尺寸，覆盖旋转事务尚未提交、事件合并及应用处于后台的情况。API 34+ 继续使用系统给出的实际被采集区域尺寸，避免把单应用共享误当全屏共享。

尺寸变化统一进入 resizeCapture：按原画质预算保持比例计算偶数宽高，临时解除 VirtualDisplay 的 Surface 绑定，同步纹理、WebRTC 输出适配及 VirtualDisplay 大小，然后重新绑定原 Surface。保留同一 MediaProjection、视频轨道及 PeerConnection，不重复申请权限或重建投屏。停止时注销监听、取消排队的尺寸更新；旧 session 回调不得影响新采集。

### HarmonyOS

原 getDisplayMedia 使用开始方向的 width/height 上限，之后没有重新 applyConstraints。修复在 ScreenShareCapturePolicy 的已授权、实际开始会话中监听原生 display.change，按当前物理尺寸与 Orientation 发送带 sessionId 的 screen-capture-resize 事件；后台不依赖宿主 WebView 的旧窗口尺寸，停止时注销原生监听。

`harmonyScreenShare.ts` 在原视频轨道上使用 `screenShareResize.ts` 重新计算并应用当前方向的画质/帧率约束。请求串行，快速旋转只处理最新方向；旧会话、无效尺寸、停止后的迟到响应不生效。不重新 getDisplayMedia，不改变麦克风、系统音频、授权或 PeerConnection。收到原生尺寸后，页面窗口 resize 不覆盖原生结果；统计仍读取实际 getSettings，不把请求尺寸冒充实测。约束被系统拒绝时保留采集并记录固定诊断，不能把一次 applyConstraints 调用当作真机方向验收。

## 自动化与构建

- 184 项适配测试、4 项媒体测试通过；新增覆盖原生方向事件、横竖屏约束切换、暂停时旋转、原轨道/PeerConnection 保留、旧 session、排队去重、停止清理及原生监听注销。
- 前端类型检查与构建、Android 资源同步、HarmonyOS 网页资源同步通过；原生 Gradle Debug/Release 与 Hvigor Debug/Release 构建通过。
- 双端版本均为 2.1.3 / 213。HarmonyOS 最低 SDK 保持 6.1.0(23)，目标 SDK 26；保留鸿蒙 WebRTC PiP 禁用及 Android 原生 PiP。

## 原生与真实媒体证据

### Android API 33：旧版复现

使用已安装的 Android 13 / API 33 x86_64 系统镜像建立本轮隔离 AVD，不下载镜像、不改用户原有 AVD。2.1.2 Debug APK 的原生采集通过系统授权后，真实 WebRTC 经本机鉴权 TURN 向 Chrome 接收端传输测试图案。WebView 109 中只挂载测试控制和图案，不将其作为完整客户端界面验收。

同一 session：起始竖屏为 576×1280；系统界面已变成横屏，原生统计及观众视频仍为 576×1280，等待 14 秒后仍未变化；反向横屏同样失败，解码帧持续增加。该证据确认是采集尺寸固定，并非传输停止。

首轮增加显示监听后，观众能切至 1280×576，但快速回竖屏出现一次尺寸滞后。此失败促成 150ms 合并与统计周期尺寸复核。后台检查另确认 Activity 上下文的 Display 保留旧窗口方向，改为应用级上下文后，同一会话通过 0° → 90° → 0° → 270° → 0° 检查：物理屏幕 1080×2400 / 2400×1080，观众视频 576×1280 / 1280×576 对应切换；宿主 WebView 一直保持 412×915，观众解码帧 29 → 100，连接始终 connected。停止后 media_projection=null。

### Android API 34+

Medium_Phone、Android 17 / API 37 x86_64，安装最终 Debug APK，系统授权选择 Share entire screen。同一会话在系统设置应用前台通过相同五个方向检查：观众视频持续在 576×1280 和 1280×576 之间切换，解码帧 25 → 77、连接始终 connected；宿主仍为 411×914。验证了 API 34+ 的采集区域回调路径，没有复用旧 API 的全屏尺寸回退。停止后 media_projection=null。未覆盖单应用共享及实体设备。

### HarmonyOS

Pura 90 Pro x86_64、OpenHarmony 7.0.0 / API 26，最终签名 Debug HAP 覆盖安装成功。使用实际鸿蒙适配器调用原生采集并确认系统授权后，45 秒内仍未取得屏幕流，适配器返回 capture-start-failed，系统日志出现此前记录过的 BaseScreenCaptureSource window callback is nullptr。此次失败发生在取得轨道之前，未进入旋转约束更新阶段，不能据此判定旋转修复通过或失败。

鸿蒙本轮完成源码修复、自动化测试和 Debug/Release 构建；原生旋转效果仍待真机验证。建议在同一投屏会话中检查竖屏 → 横屏 → 竖屏 → 反向横屏，随后切到其他应用重复旋转，确认观众实际画面方向和视频宽高同步变化、帧持续前进；再检查暂停/恢复及停止，确认无需再次授权且停止后不再采集。模拟器和轨道/事件夹具不能替代 API 23 真机采集验收。

## 交付与限制

安装包输出 `release/client-v2.1.3/`，正式 APK 与 HAP 均从本轮源码重新构建。每个最终交付文件仅在构建后计算一次 SHA-256，保存到同目录 SHA256SUMS.txt；APK 经 apksigner v2、HAP 经 hap-sign-tool verify-app 验证通过，HAP debug=false；包内网页资源分别 33 个、31 个，与最终生成目录逐字节一致。本机签名材料和测试会话不提交。

本轮证据位于忽略目录 `.ui-validation/screen-rotation-20261020/` 及相关构建日志。Android 原生测试使用隔离图案、本地 DTO 信令转发和真实接收帧，不代表公网、真实房间、长播、音频、全部画质档位或实体设备验收。测试结束停止采集与本轮测试服务，并退出模拟器。
