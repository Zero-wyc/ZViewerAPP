# iOS 1.8.5 / build 22 播放卡死回归修复

日期：2026-10-13。用户明确要求先认真检查，合并 B站有声播放与一起听后台音频修复，再提交 IPA 构建供手动测试。本次构建失败，无可交付 IPA；后续 build 23 仅修正产物验证方式并重建，不推送或发布 GitHub Release。

## 用户反馈与定位

build 21 真机反馈：加载时卡顿，Jellyfin 添加后点击播放卡死；B站视频无法起播，一起听也卡死。因此 build 21 停止推荐，既有构建成功、离线检查与 JS 测试不表示原生运行通过。

与当前依赖匹配的 VLCKit `4.0.0-a24` 官方源码显示：默认事件配置没有 dispatch queue、同步执行回调；状态回调经 `VLCEventsHandler` 直接调用 delegate。libvlc 播放器持递归锁，允许同线程重入。我们的 `ZViewerVlcProgress` 进度通知在该回调中发出，原系统媒体 observer 指定 `queue:.main`，通知发布线程同步等待主线程；主线程同时执行播放器方法时等待 VLC 锁，两者形成互等。该路径共用于视频和音乐，符合用户反馈；本轮没有真机线程栈。

参考核对的是所用版本的原始源码，而非按名字推断 API：

- [VLCEventsConfiguration.m](https://code.videolan.org/videolan/VLCKit/-/blob/4.0.0-a24/Sources/Events/VLCEventsConfiguration.m)：Default 为无队列/同步，Legacy 为主队列/异步。
- [VLCEventsHandler.m](https://code.videolan.org/videolan/VLCKit/-/blob/4.0.0-a24/Sources/Events/VLCEventsHandler.m)：配置决定 inline / dispatch_async / dispatch_sync。
- [VLCMediaPlayer.m](https://code.videolan.org/videolan/VLCKit/-/blob/4.0.0-a24/Sources/Playback/VLCMediaPlayer.m)：initCommon 捕获共享事件配置，状态 delegate 经 handler 执行。
- [VLCLibrary.m](https://code.videolan.org/videolan/VLCKit/-/blob/4.0.0-a24/Sources/Core/VLCLibrary.m)：默认加载 Default 配置，提供共享配置 setter。

## 修改

- 创建播放器之前设置 `VLCLibrary.sharedEventsConfiguration = VLCEventsLegacyConfiguration()`，使回调先退出底层线程，再异步在主线程处理。内核仍为 VLCKit 4，Legacy 是该版本的官方事件调度配置名称。
- 系统媒体进度、中断及路由通知以 `queue:nil` 接收，显式 main.async 处理，不同步等待 UI；保留空 URI 拒绝、来源比较和用户暂停意图。
- 销毁播放器先解除 delegate，再停止，减少延迟回调访问已释放视图的风险。
- 保留 B站分离音轨延迟挂载、成功去重及重试；一起听保留原生 backgroundAudio、关闭隐藏视频/PiP、后台 `.playback / .default` 音频会话与空闲语音引擎不争抢会话。
- EAS 依赖重装后重新打补丁，编译前检查异步事件配置必须早于播放器构造，检查系统 observer 不能同步等待主队列；打包前要求主程序确实引用 `VLCEventsLegacyConfiguration`。

## 本地检查

- 178/178 测试、lint、类型检查通过。
- worker 线程与共享锁模型能观察旧等待链阻塞，异步方式连续 10 次完成。此模型验证线程等待关系，不代表真机播放或 VLCKit 解码测试。
- 缺补丁、事件配置位于构造之后、旧同步系统 observer、缺分离音轨/后台参数均会被验证器拒绝。
- 从原始 npm 57.0.54 依赖应用全部补丁通过，重复执行不改变播放器源码。build 21 的真实 VLCKit framework 可检索到官方事件配置类和共享配置 setter。
- 上传范围 192 个文件审计通过；12 个共享 Go 来源文件与基线 `02f62f1fc52f0c47f2a2f8e6fec8ed22d98539fc` 核验通过。

## 构建

- 源码提交：`30688d2cafb71d2006667beac26f3a1cd8667670`。
- EAS：`1885fd07-2ea6-40da-b6e7-549f5533023c`，unsigned-device / Release，目标 1.8.5 / 22、`com.zviewer.mobile`。
- EAS 于 2026-10-13 20:17:13（北京时间）报错：`Missing native bridge: VLCEventsLegacyConfiguration`。设备 Release 的 Xcode 编译已成功，失败发生在其后的原生符号检查，未执行 IPA 打包及上传。
- 两次源码补丁检查通过。新增检查使用 macOS `strings` 默认的 Mach-O 段扫描；导入 Objective-C 类名可位于段外的链接数据，因此主程序缺少 `strings` 输出不能断定没有链接引用。Apple cctools `misc/strings.c` 核对了此行为；已有 build 21 主程序的 `_OBJC_CLASS_$_VLCMediaPlayer` 原始字节存在但不位于文件段内，作为实际产物交叉核对。
- build 23 改为 Node 读取完整主程序和 VLCKit framework 二进制；仍要求主程序存在事件配置类及 setter 引用，框架存在对应类定义，保留所有源码补丁及顺序检查。参考 [Apple strings 源码](https://github.com/apple-oss-distributions/cctools/blob/main/misc/strings.c)。
- build 22 没有下载产物或设备验收结果。后续交付见 build 23 验证记录。

## 必须由用户完成的真机复验

| 场景 | 检查 |
| --- | --- |
| Jellyfin 添加并播放 | 不卡死，视频起播、有声；暂停/恢复/seek、切换影片正常。 |
| 服务端添加 B站，iOS 一起看 | 起播、有画面和声音；真实音轨显示；暂停/拖动不挂起。 |
| iOS 添加 B站，网页加入 | 双端播放同一 P，有声；控制及进度同步。 |
| 网易云和 B站一起听 | 前台正常播放与响应；退桌面、息屏保持同曲数分钟，声音继续。 |
| 主动暂停再退后台 | 保持暂停；控制中心恢复后有声。 |
| 前后台反复切换、语音/蓝牙/来电 | 不冻结、不抢占错误会话；符合用户当前播放意图。 |

需要自行签名后安装。Windows 上无法运行 iOS 原生解码和后台生命周期，不能保证设备验收已通过。JS 被系统暂停时仍无独立原生房间 Socket/切歌/观众审批管线；当前修复针对音频持续播放和线程卡死，不宣称完整后台同步/自动切歌闭环。
