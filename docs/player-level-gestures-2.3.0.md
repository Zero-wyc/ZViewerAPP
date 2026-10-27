# 2.3.0：播放器亮度与投屏音量手势（2026-10-27）

## 用户反馈与范围

用户已确认 2.2.8 一起看手势验收通过。本轮新增一起看与投屏左侧亮度，以及投屏右侧本机播放器音量，并由助手完成可执行的回归、浏览器与签名构建检查后发布 2.3.0。2.2.8 的一起看手势和网易云新服务端兼容一并进入此次正式发行。Android / HarmonyOS 统一 2.3.0 / 230；iOS 保持 2.1.10 / build 31，未修改或构建；未连接或部署 NAS。

## 实现

- watchVideoGestures 保留一起看的单击显隐、左右双击 15 秒、中部双击播放/暂停及横向拖动；左半边纵向滑动识别为 brightness，右半边识别为 volume。控制按钮和设置面板不拦截，touch-action 仍仅覆盖视频表面。
- useScreenShareLevelGestures 共用于 WebRTC 与 OBS/FLV，普通窗口和全屏均支持左右两侧纵向手势。直播不启用横向进度跳转；保持全屏单击显隐和双击播放/暂停。画中画禁用该手势层，退出观看释放亮度。MutationObserver 只在底层 video 更换时重绑，覆盖 ArtPlayer 在后续 effect 中才创建的情况。
- 原生亮度使用 Android WindowManager.LayoutParams.screenBrightness，以及 HarmonyOS Window.setWindowBrightness；读取窗口/系统当前值作为起点。亮度范围 5%–100%，只改变 App 窗口覆盖值，不写系统亮度设置。结束观看恢复原始覆盖值（通常为 -1，跟随系统）；全屏切换保留当前播放器亮度。
- playerBrightness 将原生请求串行化、跳过被新请求取代的写入；多个播放器以最新调节者为当前所有者，旧播放器退出不覆盖新播放器，最后退出恢复原值。取消后或卸载后的迟到读取不能继续调节；读取失败显示提示并可重试。
- 投屏音量直接操作当前 video.volume / muted，范围 0–100%，与现有静音按钮保持同步，不改发布端或房间音量。手势显示亮度/音量百分比。FLV 和 LiveArtPlayer 明确关闭内置触摸跳转，避免重复执行。
- 原生接口参考：[Android 窗口属性](https://developer.android.com/reference/android/view/WindowManager.LayoutParams#screenBrightness)、[HarmonyOS Window](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/js-apis-window)。HarmonyOS 参数、设置读取与恢复值同时依据本机 SDK 声明检查。

## 验证记录

| 项目 | 结果与边界 |
| --- | --- |
| 共享自动回归 | 106/106 通过；新增左侧亮度与 8 项亮度/投屏回归，覆盖边界、写入合并、多个所有者、迟到读取、取消、失败重试、普通窗口/全屏、直播不 seek 和双击暂停。 |
| 类型与构建 | TypeScript、Vite、双端资源同步、Android assembleRelease 和 HarmonyOS release assembleHap 全部通过。现有发布签名沿用，临时鸿蒙签名配置已恢复。 |
| 一起看浏览器 | 真实 WatchTogetherPanel / Core，180 秒合成 MP4 解码；左滑亮度由默认 0.6 升至 1，再降至约 0.5833，视频仍暂停，音量与进度未被调节。离开恢复 -1。 |
| WebRTC 浏览器 | 真实 RemoteVideoPlayer / LiveArtPlayer、WatchControlsBar 与共享手势；MediaStream 由本地视频 captureStream 产生，没有远端 PeerConnection。右侧下滑音量由 0.7 到约 0.3667，左侧上滑亮度到约 0.9333；进入全屏保留该亮度，继续滑动后约 0.7573，音量约 0.5427。双击暂停保持可用。离开恢复 -1。 |
| FLV 浏览器 | 真实 FlvPlayer / flv.js 解码本地合成 HTTP-FLV，320×180、readyState=4、时间继续增长；右侧滑动音量约 0.3667，左侧亮度约 0.9333，有百分比提示；全屏保留亮度，继续调到约 0.7573，音量约 0.1906；切回一起看后恢复 -1。 |
| 验收限制 | 浏览器使用 Pointer 鼠标输入，原生亮度桥为受控夹具；adb / hdc 当前无设备。未新增实体设备屏幕背光、触摸手感、系统自动亮度或听音验收；不将本地 MediaStream 算作真实远端网络验收。 |

## 交付与发布

安装包、签名检查、构建日志、106 项测试日志、截图及构建时各一次 SHA256 记录放在忽略目录 release/client-v2.3.0/。发布复用构建时摘要，不重新计算包哈希。源码提交 main，目标标签 client-v2.3.0，发行标题 ZViewer-Client V2.3.0；仅上传 APK、HAP 和 SHA256SUMS.txt，源码采用 GitHub 自动归档。
