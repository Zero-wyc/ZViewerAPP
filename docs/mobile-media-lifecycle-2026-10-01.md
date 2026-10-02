# 双端系统媒体控件、后台播放与旋转验收

日期：2026-10-01。开发分支：`fix/mobile-media-lifecycle`，基于已发布的 1.3.5 / 135。本次提供本地调试验证包，不覆盖已有 GitHub Release 或 tag。架构与后续发布步骤见 [双端维护文档](mobile-release-maintenance.md)。

## 问题与修复

- 一起听横屏完整播放器仍占用房间顶栏高度：共享移动端 CSS 在播放器覆盖层展开且横屏时隐藏房间顶栏；回到竖屏或收起播放器后恢复返回入口。
- Android 一起听/一起看没有应用自己的系统媒体会话与后台播放服务：新增原生 MediaSession、媒体通知、播放期间的前台服务和 CPU 播放锁。系统按钮回到共享播放器，继续沿用房间控制权限。
- HarmonyOS 控制中心封面缺失：原生下载封面，解码并传入 AVSession 的 PixelMap；下载失败使用应用图标。封面切换使用请求代次检查，避免迟到的旧图片覆盖新歌曲。
- 后台视频音轨中断：Android 首轮试验中，仅添加前台服务和播放锁仍在约 79 秒后停止推进。最终增加只在播放期间启用的 WebView 窗口可见性策略；暂停、退出时恢复正常生命周期。HarmonyOS 在实际播放期间申请 AUDIO_PLAYBACK 连续任务，暂停/退出时释放。
- 自动旋转与手动锁定混用：Android 默认及解锁为 FULL_USER；HarmonyOS 为 AUTO_ROTATION_RESTRICTED。两端尊重系统旋转开关。方向按钮首次切换并锁定，再次恢复自动旋转；离开房间也恢复。

## 环境与方法

使用 Android Medium Phone 与 HarmonyOS Pura 90 Pro 模拟器，安装实际原生调试包。全程通过 adb / hdc / CDP 操作，没有使用 computeruse。服务端从本机 `ZViewer-source code` 拉起，使用独立数据库、测试房间和只读素材目录。

一起看通过实际房间、Socket、影片列表与视频播放器播放 420 秒 H.264/AAC 素材；一起听通过真实音乐 Provider、播放器和原生桥接播放 420 秒 AAC 素材，音乐接口使用本地确定性替身。歌曲与封面是测试素材，未将在线网易云或 B 站账户作为后台时长验收的前提。

后台测试先进入系统桌面并关闭屏幕，按 30 秒间隔连接 CDP 采样，采样后断开调试连接。检查时间推进、readyState、paused、muted、音量，以及原生音频流和后台宿主状态；没有仅凭前台服务或 paused=false 判定通过。

## 实测结果

| 项目 | Android | HarmonyOS |
| --- | --- | --- |
| 一起听系统控件 | 暂停、继续、上一首、下一首通过，锁屏状态也通过 | 控制中心暂停、继续、上一首、下一首通过 |
| 一起看系统控件 | 后台暂停及继续通过 | AVSession 元数据与音频流正常；后台持续播放通过 |
| 系统封面 | 原生位图元数据已接入 | 控制中心截图确认显示测试歌曲封面 |
| 自动方向变化 | 模拟器加速度传感器触发竖屏→横屏；恢复竖屏通过 | 模拟器物理旋转触发横竖屏切换通过 |
| 方向按钮 | 锁定横屏 914×411、恢复竖屏 411×914；横屏顶栏隐藏，竖屏恢复 | 锁定横屏 789×359、恢复竖屏 359×789；横屏顶栏隐藏，竖屏恢复 |
| 一起听后台 | 333 秒后仍持续播放，系统暂停/继续有效 | 300.688 秒内进度 0.940→301.239 秒，每次采样持续推进 |
| 一起看后台 | 303 秒内进度 2.392→305.481 秒，每次采样持续推进 | 301 秒内进度 1.581→266.860 秒，每次采样持续推进；模拟器音频时钟慢于墙钟 |
| 退出清理 | 离开/卸载播放器后会话消失，暂停释放播放锁 | 暂停后音频流移除，卸载播放器后 AVSession 数量为 0；连续任务与图片按生命周期释放 |

原始结果保留在本机忽略目录 `release/media-qa/`，主要文件包括 `android-watch-long.jsonl`、`harmony-watch-long.jsonl`、`harmony-music-long.jsonl`、`harmony-system-controls.json`、双端 `*-manual-orientation.json`，以及 `harmony-media-control-final.png`。日志、账号与隔离数据库不进入源码提交或源码包。

## 验证边界

已验证原生构建和模拟器播放管线、后台时长、系统控件及布局。尚未验收真机数小时待机、厂商省电策略、蓝牙/耳机按钮、系统来电、强制 Doze、系统进度条拖动和多用户审批场景；后续正式发布前按维护文档补验。模拟器采样与系统音频流证据不能代替真机听音。

本地包使用调试构建；Android 采用独立 debug 应用标识，HarmonyOS 使用本机开发签名。源码继续保持 1.3.5 / 135，正式升级须分配新版本并重新签名构建。

## 平台资料

- [Android MediaSession](https://developer.android.com/reference/android/media/session/MediaSession)
- [Android 媒体播放前台服务类型](https://developer.android.com/develop/background-work/services/fgs/service-types#media)
- [Android WebView](https://developer.android.com/reference/android/webkit/WebView)
- HarmonyOS 行为与接口以本机 API 23 SDK 的 AVSessionKit、BackgroundTasksKit 和 ArkWeb 类型声明为准。
