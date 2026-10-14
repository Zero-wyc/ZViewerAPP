# 2026-10-14 Mac 本地开发接续

当前基线为 1.8.6 / build 25，Git HEAD `46d88c656ad42c085de870d6276624ec3aee6435`。用户反馈网页房主播放 B站、聚合番剧时 iOS 无法播放且进度跳动，仍需原生联调；自动测试通过不能视为修复验收。

## 工作区与本机工具

实际开发仓库位于工作区的 `ZViewer-client/`，迁移包原来的同名目录改为指向该仓库的链接。这样保留迁移脚本入口，同时避开 Hermes CocoaPods helper 在带中文路径下的二进制/UTF-8 编码错误。

已校验迁移包 974 个文件，恢复完整 Git 历史；共享 Go 的 12 个来源文件继续按原基线验证。Node 使用 24.21.0；本机 `~/.local/bin/pod` 通过用户目录内 Homebrew portable Ruby 4.0.7 运行 CocoaPods 1.16.2。系统 Ruby 2.6 不支持 Expo helper 的 `filter_map`，不再用于 Pods。没有升级应用锁定的 Expo / RN / VLC。

Go 1.27.1 的原始下载域名连接失败，下载同版本镜像后仍使用项目锁定的 SHA256 验证。VLCKit 下载完成后的中断恢复也使用 podspec 中原有 SHA256 校验完整压缩包，再填充 CocoaPods 缓存；没有替换依赖版本或省略校验。

## 本地命令

在 `ZV-iOS/` 执行：

```sh
npm ci
npm run check
# 首次准备模拟器原生库（不会生成设备库）：
bash scripts/prepare-native-ios-simulator.sh
# 已有 ios/ 时保留实验；需要时显式执行 prebuild：
npx expo prebuild --platform ios --no-install
npm run native:patch
(cd ios && pod install)
bash scripts/build-ios-simulator.sh
# 另一个终端启动开发服务：
npx expo start --dev-client --localhost --port 8081
```

`check` 先恢复并核验 VLC 原生补丁，再运行 lint、类型检查、测试。迁移包原来的 02 脚本漏掉补丁步骤，第一次检查 184/185，应用已有补丁后 185/185 通过。

模拟器构建脚本验证 Go 来源、VLC 补丁以及 Bilicore 的 simulator 平台标记，只编译本机架构。Simulator 的 ARM64 库不能用于 iPhone 设备包。生成的 `ios/`、Vendor、Pods、DerivedData、账号和安装包均不提交。

## Debug 联调

本机已启动 iPhone 18 Pro / iOS 27.0，UDID 可从 `xcrun simctl list devices booted` 获取。当前 Xcode 27 使用 Device Hub 显示模拟器，已经能直接读取业务画面；此前也使用过 `serve-sim` 的 localhost 镜像。模拟器截图与原生日志用于验收，镜像服务不应暴露到外网。

`ZViewerNative` 的 `debugLaunchConfiguration` 仅在 `#if DEBUG` 下导出。JS 同样要求 `__DEV__`，从进程环境读入私有会话与目标房间，不在 Expo public env、源码或日志里放账号。可以通过以下脚本重复进入指定测试房间：

```sh
python3 scripts/launch-simulator-debug.py \
  --session-file /absolute/private/test-session.json \
  --room-id TEST_ROOM_ID
```

会话 JSON 包含 `server` 或 `serverUrl`、`accessToken`、`refreshToken` 和 `user`；应保存在仓库外或被忽略的本机目录并限制权限。不要将实际账号复制进本文件。

`[ZViewerWatch]` 的 Debug 日志记录加载、播放状态、进度、seek 与准备/解析门控，排查时比较 `position`、`targetTime`、`preparing`、`busy`、`ready`，不记录媒体 URL、请求头或账号。

## 当前验证边界

- 来源 gate、Bilicore simulator 标记、Opus 宿主 50 帧编解码 smoke 通过。
- lint、typecheck、199 项回归通过（包括 HLS 清单、缺失影片 ID、解析复用、暂停 seek 和 scene 生命周期）。
- CocoaPods 完整安装成功（122 项依赖，123 个 pods）。
- 浏览器 root 房主已完成一个公开 B站视频的实际起播与进度采集；原普通账号用于另一端，房间审批关闭。临时旧房间已清理。
- 模拟器 ARM64 Debug 构建已完成并安装。第一次启动被 iOS 27 的 UIScene 生命周期要求中止，已通过 CNG 插件接入锁定 Expo 包现有的 `EXExpoAppSceneDelegate`，保留工厂、链接和生命周期转发；两项幂等/manifest 回归通过，重新构建、安装和实际业务页面启动成功。当前 Debug 页首出现的齿轮和首次 Development Build 页面属于 Expo 调试工具，此前业务页面沿用原样式；后续按用户要求只调整房间视频区域，见下节。
- 无 EAS、设备 IPA、签名、上传或公开发布。

## 2026-10-14 播放联调修复

网页 root 房主与模拟器另一账号在同一临时房间联调；加入审批关闭，仅修改临时房间与片单。账号、会话和原生日志保存在仓库外，以下不记录其值。

- Kazumi / DM84 的《败犬女主太多了！》第 1 集为 HLS。实际清单可访问，但 Mac 直连 TS 分片返回 403；同一分片通过测试服务器代理返回 206，签名为 MPEG-TS。旧候选解包聚合代理并直连 CDN，导致播放停住后反复同步纠偏。
- `media.ts` 保留聚合 HLS 代理；`hlsPlaylist.ts` 递归改写清单、分片、密钥和初始化段，`hlsNative.ts` 只将改写后的 VOD 清单写入应用私有缓存，媒体数据继续流过已有服务器代理。保留 Referer / UA / Origin / Cookie 与服务器鉴权，不将房间 URL 改成本机文件。不修改服务器程序或 NAS 配置。清单限制大小、深度、数量、超时，并拒绝循环和私网目标；直播清单明确报错。
- 网页控制消息省略 movieId，服务器心跳携带 currentMovieId。`RoomPlayback` 为所有来源绑定权威当前影片 ID，避免同一 Kazumi 输入在暂停/播放时被当成新片。`NativeMediaAdapter` 复用同一请求的解析结果；会话、画质、集数、来源或显式重试变化仍重新解析。
- `VlcPlayer` 保留一个初始 seek 通道，移除视图 time prop 的重复 seek；暂停 seek 用独立事件更新控制栏，不伪造原生进度。5 秒稳定窗口不依赖下一个进度回调，避免暂停后永久卡在 seeking。
- 此 Mac 的 iOS 27 模拟器 VideoToolbox 出现绿屏/黑屏和 buffer deadlock。仅在 Debug 模拟器使用 `codec=avcodec`，并保持 options 引用稳定；模拟器关闭不支持的 PiP。真实设备的解码方式与普通视频 PiP 不变。
- 已在模拟器观察到 Kazumi 实际动画画面、连续进度、网页暂停/恢复和观众前进 15 秒；控制消息日志显示 resolve=false，未重新加载同一影片。B站 MP4 已显示正常画面、持续进度，暂停/恢复复用原输入。
- Release 模式 iOS JS/Hermes bundle 导出成功，仅为 JS 打包检查；不是设备 IPA 或真机验收。后续仍需真实 iPhone/iPad 验证、特别是硬件解码、后台和跨集。

启动脚本使用 Expo 现有 `--initialUrl` 参数直接连接 Metro，避免系统 deep-link 确认和调试启动器入口。启动前检查 Metro 状态；`--native-log /absolute/private/log` 可选写出私有原生日志，可能包含媒体地址，不应提交或共享。测试完成后暂停临时房间的影片。

## 2026-10-14 视频区域 UI 与 Jellyfin 验证

- 按用户要求移除独立「播放诊断」入口、诊断弹窗及其网络探测状态；保留正常播放错误提示与重试，以及仅 Debug 的脱敏日志。
- 普通模式将进度、播放、跳转与设置控件放在画面下方，不遮挡字幕；视频与控制栏共用圆角容器。竖屏按画面和控制栏实际高度布局，片单紧接视频，保留原页面主题和其他业务界面。全屏继续使用可隐藏的浮层控件。
- 实际测试 Jellyfin / NAS《败犬女主太多了！》S01E01（MKV、HEVC 10bit、内嵌 ASS），已出现动画画面、中文字幕及连续原生进度。首段连续播放通过，但暂停后 seek / 中途重新加入时出现原生解码时钟停滞，因此不能将 Jellyfin 跳转恢复记为通过。
- 对同一文件的 HEAD、首/中/尾 Range、开放区间、大于 8 MiB 的区间及 416 响应进行了检查，分段读取与鉴权正常。模拟器线程采样显示 MKV demux / PCR 等待解码缓冲，仍需结合锁定 VLCKit 和真机继续排查。
- 尝试过的模拟器 clock-master 参数和等待首个进度再 seek 的实验未能消除该问题，已经撤回；不把无效实验带入设备版本。

## 2026-10-14 后续联调与紧凑布局

- 「自动续播」移至搜索影片框右侧，两者保持同一行；搜索框伸缩，开关保留可点击宽度。管理账号的清空片单操作放到标题栏。普通观众保留禁用开关，房主控制权限不变。368 × 800 模拟器竖屏已视觉确认，修改后 TypeScript 与 MoviePanel ESLint 通过。
- VLC 跳转使用锁定 VLCKit 的 jump completion，在完成后应用最新播放意图；旧输入与旧跳转回调不覆盖新输入，暂停输入设有有界回退。Debug 模拟器将 avcodec 解码线程限制为 1；设备仍使用原解码配置。
- 新构建 Jellyfin / NAS 同一剧集在 1:24 暂停，观众请求前进 15 秒到 1:39，房主自动批准，恢复后原生连续进度已到 2:08。中途冷启动首次因私有联调文件的 access token 已过期而返回 HTTP 403；更新本地测试会话后在约 7 分钟重新加入，出现动画、中文字幕和连续进度至 8:36。结束时网页暂停在 9:01，继续保留测试房间。此轮结果补充此前失败记录，不代表所有 seek 点、完整剧集或真机均已验收。
- 一起听复用后台原生音频视图，socket 状态立即送入原生播放器，切歌立即更新标题等媒体信息，不等待恢复前台后 React 提交。结束事件的续播不受普通进度广播节流影响；系统命令检查媒体身份，旧歌曲的命令不能作用于新歌曲。
- 后台切歌过渡使用有界后台任务，主音乐播放者使用 playback 音频会话且不设 mixWithOthers；后台辅助视图保留混音，避免夺取主媒体会话。模拟器锁屏时已验证 applicationState=background、切歌后的 Now Playing 标题/时长/播放速率以及音频会话 options=0。
- 模拟器锁屏未显示媒体卡，控制中心甚至未显示普通系统控件，因此尚未通过系统下一首按钮、锁屏操作或后台自然播完切歌的端到端验收；不能用原生信息更新代替这些实际测试。后续需继续原生/真机验证。

## 2026-10-14 iOS 单独一起听：网易云末尾续播

本轮使用 iPhone 18 Pro / iOS 27.0 模拟器，iOS 单独进入一起听测试房间并成为音乐房主，网易云队列共有 52 首。网页账号不参与房主控制。

- 已复现：接近结尾时旧歌曲能够发出 ended，队列也选择了下一首，但 VLC 的 `:start-paused` 回调迟于播放请求到达，导致下一首停在 0 秒，界面仍显示播放状态。问题位于原生播放意图执行，不是片单未更新。
- `vlc-seek.cjs` 在音频输入的 paused 回调后，异步检查最新播放意图、输入实例、加载 revision、seek 状态和实际 paused 状态，再恢复播放。主动暂停会清除 autoplay；旧歌曲和旧回调不能恢复新输入。seek 继续由原生 jump completion 完成，避免在 VLC 回调持锁期间同步调用播放。
- 补丁可以升级已经包含 seek completion 的依赖，也能从 prebuild / native:patch 重建。编译前检查与既有原生补丁回归加入恢复条件，防止依赖重新安装后丢失修复。
- 一起听监听独立 seekChange 更新暂停定位的时间文字。音乐进度条保留拖动期间的初始传入值，避免房间时钟持续改写原生拖动；iOS 支持点击进度条定位。完整播放器和底部播放器共用该组件。
- Debug 的 `[ZViewerMusic]` 仅记录加载 revision、位置、时长、播放意图、实际播放与 ended / seeking，不记录媒体地址、账号或鉴权。

| 实际模拟器操作 | 结果 |
| --- | --- |
| 《吹梦到西洲》定位到 315.555 / 316.186 秒（距结尾约 0.63 秒） | 自动切换《KING》，实际进度继续至 0:26 |
| 《KING》定位到 131.990 / 134.815 秒 | 自动切换《すずめ feat.十明》，实际进度继续至 0:44 |
| 暂停《すずめ feat.十明》，定位到 231.436 / 236.390 秒 | 保持暂停；手动恢复后自动切换《枯野舟歌》并起播 |
| 《枯野舟歌》自然播完 | 自动切换《raputa》，实际进度继续至 0:46 |
| 暂停《raputa》，定位到 183.390 / 187.316 秒 | 时间立即显示 3:03；保持暂停，手动恢复后自动切换《夜に駆ける》，持续播放超过 1 分钟 |

XcodeBuildMCP ARM64 Debug 构建成功，已安装至模拟器；`npm run check` 的 lint、TypeScript 和 199 项测试全部通过。本轮验收为模拟器前台、iOS 单独作为音乐房主的网易云末尾续播；真机、系统媒体按钮与锁屏后台自然切歌仍沿用上一节的待验收边界。

调试启动脚本支持 `--app-path /absolute/path/ZViewer.app`，可安装 XcodeBuildMCP 返回的构建产物，避免误装另一个 DerivedData 目录里的旧包。
