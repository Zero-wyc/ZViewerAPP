# iOS 客户端维护架构

更新日期：2026-10-03。指定修改和 Git 仓库为 `E:/Codex-bulid/ZViewer/ZViewer-client`，iOS 工程位于 `ZV-iOS/`。当前 iOS 源码及 Release 版本为 **1.5.1**；本次未重新触发 Expo/EAS 构建，安装包复用 **1.5.0 / build 16**。IPA 内部版本仍为 1.5.0，不能将 Release 版本称为安装包内部版本；构建状态及摘要见本文末尾的交付记录。旧 b12/b15 的继续开发、预览和验收记录保留历史含义，不能替代本版本验收。

## 1. 工程与运行边界

Expo SDK 57、React 19.2.3、React Native 0.86.3、Expo Router；最低 iOS 16.4，bundle `com.zviewer.mobile`，支持 iPhone/iPad。`app.json` 和 config plugins 管理原生配置；`ios/` 为 CNG 生成目录，禁止把临时生成目录或 node_modules 中的手工修改作为唯一修复来源。

| 层 | 主要文件 | 职责 |
| --- | --- | --- |
| 入口/导航 | `src/app/_layout.tsx`、`src/app/index.tsx` | Provider、登录/游客、房间列表、全局外观 |
| 会话 | `src/state/session.tsx`、`src/lib/sessionLease.ts`、`src/lib/socket.ts` | 凭据恢复、HTTP/刷新令牌、业务 Socket、过期请求隔离 |
| 外观 | `src/state/appearance.tsx`、`src/lib/appearancePreferences.ts`、`Surface.tsx` | 深浅主题、背景、字体和透明度；普通偏好保存为文件 |
| 房间 | `src/app/room/[roomId].tsx`、`roomPlayback.ts`、`useWatchControl.ts` | 入房/房主/观众、片源状态组合、审批、心跳、方向/全屏 |
| 播放 | `VlcVideo.tsx`、`vlcPlayer.ts`、`mediaAdapter.ts`、`media.ts` | 单一 VLC 内核、原生控制端口、串行换源、私有鉴权 URL、秒/毫秒转换 |
| 片源 | `SourcePicker.tsx`、`MoviePanel.tsx`、`sources.ts`、`biliSelection.ts` | 添加/管理影片、目录与选集、分享链接规范化 |
| B 站 | `biliNative.ts`、`biliSelection.ts`、`BiliAccount.tsx`、`BiliMovieSettings.tsx` | 原生登录/本机解析、服务端回退、分 P/CID、单影片策略 |
| 字幕/弹幕 | `PlaybackControls.tsx`、`Subtitles.tsx`、`subtitleParser.ts`、`subtitleSync.ts`、`Danmaku.tsx`、`DanmakuManager.tsx` | 播放设置页签、原生字幕选择、文本字幕同步、弹幕导入/显示 |
| 一起听 | `MusicPanel.tsx`、`musicSyncReceipt.ts`、`MusicLibrary.tsx`、`musicCollection.ts`、`personalFm.ts`、`usePersonalFm.ts` | 音乐发现/队列/歌词、完整歌单、持续漫游、同步回执 |
| 系统媒体 | `useSystemMedia.ts`、`modules/zviewer-native/ios/ZVSystemMedia.swift` | 锁屏/控制中心信息及操作、原生 VLC 通知桥 |
| 语音/投屏 | `VoicePanel.tsx`、`voiceBinding.ts`、`voiceProtocol.ts`、`ScreenShare.tsx` | 独立语音连接、Opus/PCM、共享观看 WebRTC 和 OBS 流媒体 |

Expo Go 和 Web 仅用于界面/业务验证，不包含 VLC、本机 B 站或自定义语音模块；不能用预览中的“原生模块不可用”代表安装包解码失败。

## 2. 会话、片源和鉴权

- 登录/刷新凭据使用 SecureStore；恢复时并行读取并限制超时，联网验证后台进行。`SessionLease` 防止退出或更换账号后旧请求恢复旧会话，凭据写入串行化。
- `RoomPlayback` 组合播放状态、当前影片和片单的独立事件，等待权威影片 ID/CID 后才采用 B 站地址；不把其他设备的 127.0.0.1 CLI 代理地址交给本机 VLC。
- `nativeVideoSource` 保留服务端路径前缀，以本机 access token 生成播放 URL，房间中保存和广播的地址不含该私有 token。普通媒体拒绝用户名密码、非 HTTP(S) 和跨设备 loopback 地址；不转发固定 Range。
- `NativeMediaAdapter` 串行替换媒体，丢弃过期解析任务；鉴权更新保留同一媒体的位置，普通状态更新不会反复 seek 到旧广播时间。
- B 站 Cookie 留在原生 Keychain，JS 只获取状态和当前原生服务签发的随机端口/能力路径。各设备独立解析；本机与服务器 DASH 策略区分处理，解析/账号/画质缓存有作用域和失效控制。

## 3. 播放与轨道

`VlcPlayer` 将 VLC 毫秒转换为房间秒数。每次换源使用 revision，旧原生回调不影响新影片。首播准备期间保留请求的起播/暂停/seek 意图；播放器组件释放时停止旧视图。

轨道 ID 是当前 VLC 媒体中的轨道索引，换片时清空，禁止跨影片复用。`mediaSettings.tracks` 记录明确的本机选择；`selectedTracks` 在没有明确选择时读取原生 `selected` 标记。`settingsChange` 通知设置面板，选择字幕/音轨不需要等待下一个进度事件才刷新。音量保留本机偏好，字幕地址/延迟随换源清空。

`plugins/with-vlc-tracks.cjs` 在 iOS prebuild 修补固定版本的 expo-libvlc-player：

1. Swift `Tracks` 的 audio/video/subtitle 字段改为可选，缺省值不再隐式选择 0 号轨道。
2. 明确选择某条轨道前取消同类型旧选择；加载已选中的外部字幕 slave 前取消旧字幕，避免 VLC 4 同时叠加多个字幕轨道。
3. `MediaTrack` 返回实际 `selected` 状态，包括关闭轨道；首播及播放进度回调更新轨道状态，JS 对相同轨道列表去重，不重复触发 `sourceLoad`。
4. 补丁包含标记并可重复执行。升级 expo-libvlc-player/VLCKit 时必须复查 Swift 记录类型、选择 API 和替换位置，再进行原生编译及真机测试。

其他原生集成：`with-system-media.cjs` 桥接系统媒体操作/进度和后台所有权，`with-voice-audio.cjs` 维护语音拥有的音频会话；二者仍需与新的轨道补丁一起执行。

## 4. 字幕和播放设置

视频内的齿轮打开统一“播放设置”，包含 **播放 / 字幕 / 弹幕** 页签：

- 播放：画中画、倍速、本机音量、音轨；选中项有主题色高亮和勾号。
- 字幕：内嵌轨道、关闭字幕、外部 SRT/ASS/VTT 地址及原生延迟、导入/同步字幕和同步字幕样式。片下独立“字幕管理”按钮已移除，全屏也可访问同一设置。
- 弹幕：开关、字号、区域/样式相关控件及轨道导入/管理。房间聊天栏中的弹幕功能继续可用。

必须保证单一字幕渲染器：选择原生轨道或外部字幕会关闭 React Native 同步字幕层；开启有效同步字幕会取消原生字幕并清除外部地址，房主本地修改和观众收到更新均执行此规则。关闭字幕不重复列出 VLC 的 Disable 项。

复杂 ASS 的矢量、字体、定位和特效应由 VLC 原生内嵌/外部字幕渲染。`subtitleParser` 加 `SubtitleOverlay` 是简化文本同步路径，不是完整 libass 实现；经房间传输的 ParsedCue 不含原始 ASS 脚本及字体，不能承诺复杂 ASS 同步后的特效完全一致。

## 5. 一起听同步

房主发送 `music:sync-state` 和 `music:host-heartbeat`；观众应用状态并在漂移超过阈值时校正进度。`music:sync-ack` 仅表示一次曲目同步完成，不表示每次心跳。

build 16 的 `MusicSyncReceipt` 按服务器、用户、房间、Socket 连接 ID、trackKey 隔离回执；曲目准备完成且当前媒体身份匹配后发送一次。重复心跳、暂停/恢复、seek、同曲重试不连续发送；切歌、清空曲目、断线重连或重新加入时允许新的回执。解析或播放器错误、尚未就绪、房主自己不会发送“已同步”。

音乐库通过受控服务端接口访问网易云；完整歌单预加载后逐首等待入队确认，取消/失败不会误称全部完成。私人漫游在候选不足时持续补充，切账号、场景或停止后取消旧请求。歌词按歌曲和账号作用域缓存。

## 6. 原生模块和后台边界

本地 Expo Module 位于 `modules/zviewer-native/ios/`：

- `ZViewerNativeModule.swift`：JS/原生接口。
- `ZVBiliBridge`：共享 Go B 站实现的 ARM64 XCFramework 桥接。
- `ZVVoiceCodec`：AVAudioEngine 语音处理、Opus 1.6.1 编解码及旧版 PCM 接收。加入默认静音，后台/中断停止采集，离房释放连接和引擎。
- `ZVSystemMedia.swift`：Now Playing、远程控制及命令队列。`UIBackgroundModes` 包含 audio。

系统媒体控件/后台音频声明不等于 JS 完全挂起时房间业务持续运行。独立原生业务 Socket（旧计划 I13）的长期心跳、切歌/审批仍未闭环；蓝牙、来电、后台、弱网及 Android/鸿蒙互通需要设备矩阵验证。本轮没有扩大此前 UI 验收为完整音视频/语音验收。

## 7. 构建与本地提交

在 `ZViewer-client/ZV-iOS` 执行：

```powershell
npm run lint
npm run typecheck
npm test
npx expo export --platform ios --output-dir .expo-export-test/b16-ios
npx expo export --platform web --output-dir .expo-export-test/b16-web
node scripts/check-playback-settings-ui.cjs
python scripts/check-ass-media.py "E:/Codex-bulid/ZViewer/TEST视频/败犬女主太多了！ - S01E02 - 第2集.mkv"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-ios-unsigned.ps1
```

`unsigned-device` 是当前可复现的设备构建 profile。构建脚本在本仓库暂存 9 个共享 Go 来源及摘要；macOS EAS worker 校验固定 Go/Opus 下载摘要，构建 Bilicore/Opus 并执行编解码 smoke，CNG 应用 config plugins，安装 Pods 后以 iphoneos ARM64 Release 构建并打包内置 JS 的未签名 IPA。旧 simulator/development profile 没有相同 vendor 准备步骤，不能直接当作已可用的设备构建替代品。

```powershell
python scripts/inspect-unsigned-ipa.py <IPA绝对路径>
```

离线检查要求 iOS 设备 Mach-O、VLC/原生桥接/系统媒体、共享来源摘要、依赖许可证和内置 JS；拒绝误交模拟器包或带意外签名/描述文件的包。IPA 需用户自行签名后安装。本次 iOS 1.5.1 发布见 [发行说明](releases/ios-1.5.1-release-notes.md)；复用既有 build 16 IPA，不重新构建。每次构建交付后只在指定 `ZViewer-client` 仓库本地 commit，保留其他未跟踪资产。

## 8. 2026-10-03 截图反馈对应修复

| 反馈 | 定位和修复 | 验证 |
| --- | --- | --- |
| 音轨/字幕缺少高亮 | `RoomButton.selected`、原生 selected 回报、`settingsChange` 驱动 UI | 默认轨道/本机选择/换片清理单测；设置页签/倍速可视高亮 Web 检查 |
| 一起听连续“已同步” | 移除每次 adapter.apply 后的无条件回执，改用曲目/连接回执门控 | 30 次重复心跳、未就绪、旧曲迟到、切歌、重连的单测 |
| 两张同步观影 Invalid URL | `biliSelection` 提取完整分享文本中的 HTTP(S) 地址，保留分 P/CID；片单恢复、添加、本机/服务端解析统一处理 | 两个截图链接、BV、b23.tv、标题/标点、权威 CID、非法地址和既有鉴权规范化回归 |
| 字幕管理位置 | 统一播放设置页签，全屏仍可访问 | iPad 横屏/竖屏、iPhone 共 18 项检查，0 JS 异常 |
| ASS 特效旁的额外纯文本 | 原生轨道可选缺省/互斥选择、同步字幕层与原生渲染互斥 | 指定真实 MKV 的轨道/字体/ASS 内容和本地 Range/seek 检查；最终视觉效果待 iOS 真机复验 |

本轮自动验证：**74/74 单测**、lint/typecheck、iOS/Web 导出通过；播放设置 Web **18/18**（1180×820、820×1180、390×844 及全屏），已人工查看截图。Web 预览缺少原生轨道，不将 Web 中的倍速高亮检查等同于真机音轨/字幕高亮验收。

指定 MKV 长 1441.117 秒，HEVC/Opus，简日/繁日两条 ASS，26 个内嵌字体附件；每轨 2597 条 Dialogue、1775 个定位标签、1308 个绘图标签。桌面 libVLC 3 经本地 8 MiB 上限 Range 服务完成两字幕切换/关闭/恢复，以及 55/120/700/1300 秒 seek（15 个 206 请求）。这些是实际文件的解码/读取辅助证据，**不证明 iOS VLCKit 4 的重复字幕已经视觉验收**。

真机优先复验：播放该 MKV，切简日→繁日→关闭→简日，确认每次只有一个高亮项且特效保留、屏幕边缘无额外纯文本；再开启同步字幕、切回内嵌字幕，检查互斥。使用两个原分享文本对应影片测试观众晚加入/暂停/seek/重连；一起听保持同曲至少一分钟，房主每个观众仅收到一次同步提示，切歌或重连允许新提示。横竖屏和全屏均测试设置关闭/重开。

### build 16 交付记录

EAS：[1.5.0 / build 16](https://expo.dev/accounts/YOUR_ACCOUNT/projects/zviewer-ios/builds/a7973a7c-db58-437a-8957-81b05a759250)。状态 **FINISHED**，已下载并通过离线包检查。版本 **1.5.0 / 16**、bundle `com.zviewer.mobile`、iOS device ARM64、未签名/未加密、iPhone/iPad、最低 iOS 16.4，包含 VLC、自定义原生桥接、系统媒体及内置 JS（3,198,491 bytes）。检查到本轮播放设置/轨道/回执相关 JS 标记。

- 本地包：`ZV-iOS/release-assets/ZViewer-iOS-1.5.0-build16-unsigned.ipa`
- 大小：45,094,781 bytes。
- SHA-256：`1220bdd48cf9308eb98d2b71b32e95c365c8d3cfe312bdbb25ab92b0e3e28ac7`。
- [下载未签名 IPA](https://expo.dev/artifacts/eas/J-Bb1K9O9sMcYsQ2mRrnqzPN2Cq1GVDOJfOzyzmE9jM.ipa)；[离线检查 JSON](releases/ios-1.5.0-16-ipa-inspection.json)。
- 三尺寸布局和同步字幕→原生外部字幕→同步字幕切换 **18/18** Web 检查通过；本轮独立后端、Web 服务、VLC Range 服务均已关闭。
- 源码和维护文档本地提交主题：`fix(ios): resolve screenshot playback and sync issues`。完整哈希从本仓库对应 Git 记录获取。

安装需要自行签名；本轮未进行 iOS 真机视觉/音频复验，特别是 ASS 特效与边缘文本、原生音轨/字幕高亮、跨端真实听歌回执仍需按上述真机步骤复测。

本轮记录：[build 16 验证证据](releases/ios-1.5.0-16-validation.json)。既有 build 15 的发布/安装信息见 [build 15 交付记录](releases/ios-1.5.0-15-unsigned.md)。Expo API 与构建方式按 [SDK 57 文档](https://docs.expo.dev/versions/v57.0.0/)、[config mods](https://docs.expo.dev/config-plugins/mods/) 和 [EAS Build](https://docs.expo.dev/build/introduction/) 核对。

## 9. iOS 1.5.1 发布（2026-10-03）

- 独立 iOS Release/标签：[ios-v1.5.1](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/ios-v1.5.1)。源码 app.json、package.json 和 package-lock.json 版本同步为 1.5.1；构建号保留 16，本轮没有构建新的 IPA。
- 发布附件保留真实安装包文件名 `ZViewer-iOS-1.5.0-build16-unsigned.ipa`，内部版本 **1.5.0 / 16**，SHA-256 与上节一致。Release 说明在开头明确版本差异；附件仍需自行签名。
- 源码 ZIP 由发布标签对应的已提交源码生成，包含本轮 iOS 修复、维护文档及 vendor/mediabunny，排除未跟踪模板文件、构建缓存和私有凭据。
- 附件包含 IPA、源码 ZIP、原始 build 16 IPA 检查/验证 JSON 和本次发布 SHA256SUMS。使用既有 74 单测、18 Web 检查及真实 MKV 辅助验证证据；不新增真机验收结论。
