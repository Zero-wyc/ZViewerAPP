# iOS 1.5.0 / b15 全应用界面预览

2026-10-02。用户要求全应用对齐 Android/HarmonyOS，先使用 Expo Go 验收。**本轮未提交新的 EAS Build/Update，未构建 b15 IPA。** 早期 b14 `0665bfa3…` 不含后续修复；另一 b14 `95eec7cf…` 已于 09:02:31Z 确认取消。

## 本次实现

保留 RN + VLC，对照共享 App/MobileRoom/MobileAppearance 和 upstream 片单、选集、音乐导航、房间信息组件移植视觉字段与交互。

| 区域 | 改动 | iOS 入口 |
| --- | --- | --- |
| 全局外观 | 双端浅深蓝色主题、四档圆角、玻璃透明度/模糊、背景/位置/缩放/旋转/双色遮罩和精简动态效果 | mobileDesign、appearance、AppearanceSettings、Surface |
| 首页/大厅 | 品牌卡、账号/游客、密码可见、可见的“B站账号”文字、外观入口、紧凑房间列表；创建支持人数/审批 | app/index |
| 文字可读性 | 标题/提示的主题底色最低 90% 不透明度；房间顶栏、侧栏、音乐和弹窗也保护文字；小屏顶部避让外观按钮，账号/状态另起一行 | Surface、app/index |
| 房间 | 图标顶栏、聊天/片单/房间标签；宽屏并列，竖屏评论/片单位于视频下方；View 明确分配媒体区域，横竖屏不坍缩 | app/room、roomLayout |
| 片单/来源 | 紧凑片单/搜索/更多操作；来源下拉独立滚动，只显示当前来源；添加弹窗随内容收缩 | MoviePanel、SourcePicker、SourceDropdown |
| 番剧/B站分P | 集数集中在最高 200pt 滚动区，平板两列/手机一列；单集、多选/全选/清空、失败项保留重试 | AnimePicker、EpisodePicker |
| 房间设置/语音 | 房间信息/在线成员/加入条件分组；成员管理展开；语音收起保留连接 | RoomSettings、VoicePanel |
| 一起听 | 网易云折叠菜单/B站导航、账号和模式菜单、浮动播放条、短横屏；统一队列/评论/关联视频弹窗与画质下拉 | MusicPanel、MusicVideo、SongComments |
| 播放设置/弹窗 | 固定关闭区、限定宽高、正文滚动、iOS 键盘避让、强调色随主题；视频画布保持黑色 | PlaybackControls、AppDialog |

默认背景复用双端 public/Nacho3.jpg，打包为 assets/images/mobile-wallpaper.jpg；根导航层透明，避免覆盖图片。自定义背景仍存应用文档目录引用，不把大图写入 SecureStore。[SDK57 官方文档确认 expo-blur 包含在 Expo Go](https://docs.expo.dev/versions/v57.0.0/sdk/blur-view/)，使用 ~57.0.3。图片、主题和模糊预览无需额外云端构建。

开屏修复保留：按钮默认不增长；本机读取各 5 秒、HTTP 含响应体 15 秒上限；会话代次隔离、损坏偏好回退、地址可清空。

## 验证

- 59/59 单测、lint（无缓存）、typecheck、iOS/Web 导出通过。iOS Hermes 导出含 25 个资源及 139,152 bytes 的默认背景；不等于新 IPA 或设备编译。
- 首页 Web 29 项，含六尺寸、账号/游客、重试/退出/清地址/超时/损坏偏好及可见 B站文字；两主题 × 黑白背景 × 20% 玻璃偏好下，标题/提示对比度均 ≥4.5。
- 房间/音乐/设置 Web 59 项，含竖屏视频下方面板、用户 1390×970 尺寸、手机 844×390 横屏、反复开关来源、全屏/旋转和播放设置。
- 来源/选集 21 项：60 来源/80 集、下拉和集数滚动、单双列、单集不关闭、多选失败重试、全选清空、片单搜索，官方 v4.2.1 后端真实保存 sourceMeta。上游番剧/音乐是 fixture。
- 上述三组 Web 均为 0 JS 异常。房间 Yoga 24 组读取实际 roomLayout，并检查竖屏上下分配；固定顶栏高度为保守模型，一起听+侧栏组合仅测试框架，实际一起听隐藏侧栏。
- b14 首页 Yoga 37 条/Provider 13 项保留为历史专项证据，不能替代当前完整页面或实际 Keychain 验收。
- Expo Doctor 20/21，保留 react-native-webrtc 新架构未测试、zviewer-native 无 Directory 元数据提示，未屏蔽。
- 当前 Expo Go SDK57 manifest、iOS JS、默认壁纸均 HTTP200，JS 含壁纸和 ExpoBlurView。开发服务存活期间可扫码；未使用 EAS Update。

见 [脱敏证据及源码 SHA-256](ios-1.5.0-15-preview-evidence.json)。辅助截图：[主页背景](ios-1.5.0-15-ui/home-ipad.png)、[小屏首页](ios-1.5.0-15-ui/home-small-phone.png)、[竖屏房间](ios-1.5.0-15-ui/watch-portrait.png)、[集中选集](ios-1.5.0-15-ui/source-tablet.png)、[一起听](ios-1.5.0-15-ui/music-ipad.png)。它们是 RN Web 导出截图，不能标为 iOS 原生截图。

## 预览和剩余交付

已有 Expo Go 项目 Reload；或 npx expo start --go --tunnel --port 8081 后扫码。房主可切换模式，观众沿用服务端权限。用户已看到背景并指出入口和文字可读性，本轮已修改；整体原生对齐仍待复验，不能宣称完全等效或像素级对齐。

Expo Go 不包含 VLC/本机 B站/Opus 语音/自定义系统媒体桥接，不能验收解码、出声、后台或系统控件。[原 I01～I17 和设备矩阵](../ios-continuation-plan.md) 保留：I13 原生独立房间 Socket 心跳/后台切歌/观众审批尚未闭环；I14 系统完整歌词页有平台差异。长时播放/HLS 子资源、真实账号/CDN、跨端真人语音、原生方向/键盘/大字体/PiP 仍待设备。

用户确认界面并明确要求后才提交下一次编号 15 的 EAS Build；届时重建原生 vendors、核验来源/内置 JS/许可证/IPA SHA-256，再交用户签名安装。不自动推送、打标签或发布。
