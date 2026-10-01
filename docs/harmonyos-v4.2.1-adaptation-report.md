# HarmonyOS 同步 Android v4.2.1 适配与验收

日期：2026-10-01。依据 `harmonyos-global-appearance-sync-plan.md`，同步仓库当前 Android v4.2.1 共享前端及全局外观。客户端包版本保持 `1.2.1` / `versionCode 122`，未执行发布或版本升级。

## 实施结果

- `src/platform/runtime.ts` 增加 `isGlobalAppearanceRuntime()`，仅 Android/HarmonyOS 启用全局外观。
- `src/App.tsx` 使用能力函数，把鸿蒙房间和连接/列表页面放入同一持续挂载的 `MobileAppearance`。
- `src/mobile/MobileRoom.tsx` 使用同一能力函数，显示“房间设置 → 外观设置”。房间内隐藏首页悬浮按钮。
- 复用已有根节点主题变量、Material/玻璃样式、背景和 `zcontrol-theme-storage`；主题不进入房间广播或服务端状态。
- `Index.ets` 仅增加 `BuildProfile.DEBUG` 控制的 ArkWeb 调试，便于检查打包应用；release 自动关闭。原有原生返回、权限、导航限制和 B 站代理接口沿用。
- 执行 `npm run harmony:web`，TypeScript/Vite 构建通过并重新生成全部 `rawfile/web` 资源；Hvigor debug `assembleHap` 成功。通过 DevEco Studio Run 启动 Pura 90 Pro 模拟器并安装运行本轮 HAP。

## 验收环境

DevEco Studio 26.0、Pura 90 Pro 手机模拟器、HarmonyOS 7.0/API 26、虚拟本地来源 `https://zviewer.local`。遵循项目手机模拟器交付规则，不推断平板或真机结果。

从 `ZViewer-source code` 重新构建并启动 v4.2.1 后端，监听 3421；独立测试配置、数据库及上传目录位于工作区 `.harmony-421/server/`，用户视频通过只读根目录访问。通过 hdc 反向转发连接模拟器。原模拟器服务器会话、主题和偏好已备份用于测试后恢复，不把令牌写入本报告。

启动时 DevEco 报 `00801005`（不足以分配 4 GiB 虚拟内存）。临时把手机模拟器内存由 4096 调为 3072 MiB 并冷启动后成功；测试后恢复配置原件。

## 外观与交互

| 场景 | 实测结果 |
| --- | --- |
| 平台与 CSS | 原生桥识别 `harmony`；根节点主题属性、`100dvh`、`backdrop-filter` 可用，竖屏 viewport 359×722。 |
| 连接页/房间列表 | 浅色、深色、跟随系统通过；CDP 模拟系统色彩偏好变化，ArkWeb `matchMedia` change 能更新 auto 主题。连接页沿用房间主题。 |
| 背景连续性 | 首页进入房间、同步观影切换一起听，壁纸保持同一 DOM 元素。水平 12%、垂直 -8% 对应背景 transform 正确。 |
| 玻璃与动画 | 透明度 65%、模糊 16 px 生效；精简动画使外观面板模糊为 0 px，关闭后恢复 16 px。 |
| 房间/Portal | 标题、聊天/片单/房间、语音面板沿用外观；body 房间弹窗浅色背景实测 `rgba(247, 249, 255, 0.6)`、`blur(12px)`。 |
| 视频不重建 | H.264 已播放后切换主题、关闭外观面板、横竖屏和全屏，原 video DOM 引用不变。播放器画布保持黑色。 |
| 一起听不重建 | 使用实际产品音乐播放流程，仅将音乐流替换为本地合成音视频 fixture；音频时间推进至 2.195624 秒，浅/深色切换后同一 audio 元素保持播放。未据此声明网易云 VIP/CDN 服务验证通过。 |
| 原生返回 | hdc 注入系统 Back：关闭外观并保留视频/语音面板；再次返回关闭语音并留在房间；播放器设置与播放全屏均能先关闭。 |
| 横竖屏/安全区 | 原生横屏切换与恢复竖屏通过；横屏 document scrollWidth 不超过 viewport；未见固定背景或弹窗水平溢出。 |
| 前后台 | Home 后启动原 Ability，房间、壁纸、音频元素和外观偏好保持。 |
| 完整进程重启 | force-stop 后重新启动 Ability，所有外观 localStorage 值一致，深色主题及背景参数恢复；应用回到房间列表。 |

## 用户视频和编码对照

三个原文件均保持不变，经服务器文件代理播放。

| 文件 | 编码 | 模拟器结果 |
| --- | --- | --- |
| `C:\Users\FredQ\Videos\S01E04.mp4` | H.264/AAC、1920×1080，时长 1421.461708 秒 | 播放从 1.027279 推进到 3.531121 秒；89 帧、readyState 4、无 MediaError。暂停保持稳定，跳至 60 秒并以 1.5 倍速恢复，推进至 61.006897 秒、144 帧。 |
| `C:\Users\FredQ\Videos\S01E01.mkv` | HEVC Main 10、10 位、Opus、1920×1080 | demux 158 ms、两条 ASS 字幕各提取 437 cues；时间 0、视频 0 帧、MediaError 3：`PipelineStatus::PIPELINE_ERROR_DECODE`。 |
| `C:\Users\FredQ\Videos\白圣女与黑牧师 - S01E02 - 第2集.mkv` | HEVC Main 10、10 位、FLAC、1920×1080 | demux 66.9 ms、两条 ASS 字幕各提取 437 cues；同样 0 帧和 `PIPELINE_ERROR_DECODE`。 |
| 原 HEVC 视频轨的 12 秒 MP4 对照（移除音轨、不转视频） | 原始 HEVC Main 10 | 仍报相同解码错误、0 帧，排除仅由 MKV 容器、Opus/FLAC 音轨或外观造成。 |
| 本地合成 H.264 MKV 对照 | H.264/AAC、640×360 | 通过同一播放器链路实际推进至 1.030407 秒、30 帧、无 MediaError。 |

本轮外观同步验收通过。两部原始 HEVC 文件的**视频播放未通过**：ArkWeb 宣称 MIME 可用、得到 metadata 和解封装成功都不能证明设备可解码。此结果限定当前模拟器，不外推到 HarmonyOS 真机。按计划将 HEVC 解码列为独立限制；未加入视频转码或其他解码器来改变本次范围。

## 交付与后续维护

HAP：`ZV-HarmonyOS/entry/build/default/outputs/default/entry-default-signed.hap`，debug 构建，本轮 SHA-256：

`5fd23e3a25840f5c6f8b9dca326eaf84a7df5ec701d108d6fadea6ac65515157`

证据位于工作区 `.harmony-421/`：`appearance-results.json`、`playback-results.json`、`control-results.json`、`lifecycle-results.json`、`runtime-results.json`、脱敏测试脚本及连接页、房间、弹窗、语音、横屏、全屏、音乐与重启截图。构建日志位于 `.ui-validation/harmony-421-hvigor.log`。这些是本机验收资料，未恢复此前删除的交付测试目录。

麦克风拒绝/重新授权、真人双向听感、长时间后台、第三方登录和 B 站真实 CDN、平板及真机编码能力未执行本轮专项测试；原生权限实现未改动。需要支持上述 HEVC 文件时，应针对实际目标设备验证视频解码能力，或另行提供视频转码/解码路径。

验收结束恢复原服务器会话和用户偏好，移除临时会话备份；关闭本机测试后端及其媒体/音乐监听，撤销本轮 hdc 转发，恢复模拟器配置。本轮没有提交 Git、创建 PR 或发布应用。

## 2026-10-01 浅色可读性与背景框修复

针对用户截图补查实际 HAP：浅色播放设置继承了播放器的白色文字和 Artplayer 阴影，首页 B 站账号固定使用浅绿色；弹幕分组的不透明底色及内部 glass-strong 的第二层模糊分别形成了多余背景。第一次仅去掉分组底色后仍有矩形，继续定位并去掉 main/side 内部模糊，经截图确认矩形边界消失。

修复集中在共享 `src/mobile/appearance.css`：dialog 重新绑定所选主题的文字、表面、玻璃变量并取消文字阴影；内部滑块分组透明；内部主面板与字体子面板取消 backdrop-filter，仅保留外层玻璃；mobile-text-button 跟随主题强调色。

使用 hdc 命令行安装重建的 debug HAP，通过 ArkWeb CDP 在同一 Pura 90 Pro 模拟器验收。浅色标题/标签为 `#1c293a`、次级文字为 `#43566b`，账号为 `#1463b6`；内部模糊为 `none`，分组背景透明。横屏全屏截图、字体子页、深色模式通过；主题切换后 video DOM 引用保持一致，画布保持黑色。TypeScript/Vite、rawfile 同步与 Hvigor 构建通过。

本次最新 HAP SHA-256：`f9ece8cfdc9ab5b26be7b88f5425f5c45e1d64bcff0b2843b4a88dce3356a8fe`。证据为 `.harmony-421/contrast-before.json`、`contrast-after.json`、`contrast-extra.json`，以及 `contrast-after-{lobby,settings,font,dark}.png`；构建日志为 `contrast-web.log` 和 `contrast-hvigor.log`。验收结束恢复原连接与偏好、关闭本轮本机服务并移除转发。原 HEVC 模拟器限制沿用上节记录。
