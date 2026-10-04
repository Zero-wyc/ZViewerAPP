# Android / HarmonyOS 维护与发布

更新日期：2026-10-04。当前双端开发交付为 1.6.0 / 160，适配上游 `9827929`（v4.3.7 后 4 个提交），详见 [交付与验收边界](releases/client-1.6.0-adaptation.md)。此次提供调试 APK、未签名 HAP 和源码；正式发布仍需原有签名与真机验收。最近双端已发布版本仍为 1.5.0 / 150。本篇同时保留 2026-10-02 将 iOS 1.5.0 / b15 未签名 IPA 追加到 `client-v1.5.0` Release 的历史说明，见 [iOS 交付](releases/ios-1.5.0-15-unsigned.md)。

从 1.6.0 起 `npm install` / `npm ci` 的 postinstall 使用 `patch-package --error-on-fail` 安装锁定的 playsvideo 0.4.7 补丁。不要跳过安装脚本或复制服务端依赖裁剪脚本。回归入口为 `npm run test:media` 与 `npm run test:adaptation`，当前测试脚本使用 Node 24 的 TypeScript 去类型能力。

## 源码与资源

产品行为修改仓库根 `src/`；Android 的 Capacitor 和 HarmonyOS 的 ArkWeb 同时消费该共享前端。外观判断使用 `isGlobalAppearanceRuntime()`，不要给两端复制独立 CSS。设备字体、系统安全区、系统栏与媒体解码器仍由平台决定，验收比较应用内控件、颜色、布局和交互。

同步分别运行 `npm run android:sync` 和 `npm run harmony:web`。Android 生成资源在 `ZV-Android/app/src/main/assets/public`；鸿蒙资源在 `ZV-HarmonyOS/entry/src/main/resources/rawfile/web`。这些目录由构建生成，不直接修改或提交。鸿蒙在同步时插入本地桥接启动脚本，两端网页入口允许不同，但共享 JS/CSS/字体等资源应与本次构建一致。

播放器画布和基础控件保持深色。播放设置 dialog 使用主题文字及表面变量、取消继承的文字阴影；只让外层 card 提供玻璃，内部 main/side 禁用模糊，弹幕分组透明。浅色强调文字为 `#1463b6`，正文为 `#1c293a`，次级为 `#43566b`。

## 版本与签名

同时更新根 `package.json`、`package-lock.json`、Android `app/build.gradle` 和鸿蒙 `AppScope/app.json5`，两端 versionCode 必须高于旧版。iOS 版本与依赖不属于本次发布范围。

1.3.5 从 GitHub 的 1.3.2 主分支创建独立发布工作树，再合入已验证的一起听修复。原开发目录中的未提交改动保持原样；发布前确认 `ZV-iOS/` 相对上一版没有变化。每次完成一个版本的构建后，本地提交 Git，源码 ZIP 从该发布提交生成。

Android 使用仓库外持久发布密钥，通过 `ZVIEWER_KEYSTORE`、`ZVIEWER_STORE_PASSWORD`、`ZVIEWER_KEY_ALIAS`、`ZVIEWER_KEY_PASSWORD` 注入 Gradle，运行 `assembleRelease`。发布前以 apksigner 验证签名，并与上一版证书 SHA-256 比较。

HarmonyOS 使用 DevEco Studio 的本机签名配置，运行 release `assembleHap`，保持最低兼容 6.1 / API 23。仓库中的 `build-profile.json5` 保持无私钥和密码的模板；本机签名材料与路径仅用于本地构建，不进入提交或源码 ZIP。release 禁用 ArkWeb 调试。

## 验收与清理

### 系统媒体控件、后台播放与旋转（2026-10-01）

共享入口是 `src/mobile/useSystemMediaSession.ts` 和 `src/platform/mediaSession.ts`。一起听通过 `useMediaSessionSync` 读取真实音频元素；一起看通过 `WatchTogetherCore` 读取当前影片与视频元素。网页保持 Media Session API 行为，Android/HarmonyOS 使用原生媒体会话。桥接进度、时长使用秒，原生系统接口转换为毫秒。系统按钮仍经过房主/观众控制权限与审批，不能绕过房间规则。

每个播放器生成独立 sessionId，退出时只清除自己持有的会话，避免旧播放器的延迟清理删除新会话。歌曲/影片、封面、播放状态变化才刷新元数据与通知，进度持续更新。封面相对地址以服务端地址解析，原生下载并解码；不能把 ArkWeb 本地来源或未解码的网络地址当作系统封面。

Android 新增 `SystemMediaSessionPlugin`、`PlaybackService`、`PlaybackWebView`：媒体前台服务公开播放通知与 MediaSession，播放期间持有 PARTIAL_WAKE_LOCK；WebView 只在服务确认正在播放时保留媒体管线活跃，防止后台窗口不可见导致视频音轨暂停。暂停释放播放锁并恢复正常后台窗口状态；离开播放器、销毁宿主时释放会话和服务。不要用无条件常驻、循环唤醒或忽略所有窗口可见性事件替代这项有播放状态边界的策略。

HarmonyOS 新增 `NativeMediaSession.ets`：创建 AVSession、设置解码后的 PixelMap 封面，并在实际播放期间申请 AUDIO_PLAYBACK 连续任务。`module.json5` 同时声明 `backgroundModes: ["audioPlayback"]` 和 `ohos.permission.KEEP_BACKGROUND_RUNNING`。系统继续播放先恢复 Web 引擎，再把命令送回共享播放器。暂停停止连续任务，离开或销毁时销毁会话、取消封面请求并释放图片资源。

Android 默认/解除手动锁定使用 FULL_USER，HarmonyOS 使用 AUTO_ROTATION_RESTRICTED，两端尊重系统自动旋转开关。播放器方向按钮首次点击切换并锁定方向，再次点击恢复自动旋转；离开房间恢复自动策略。一起听完整播放器覆盖层在横屏隐藏房间顶栏，收起覆盖层或回到竖屏后恢复；不要在横屏普通音乐导航页隐藏返回入口。

验收使用隔离的 source-code 服务端、命令行 adb/hdc、原生调试包和至少 5 分钟音视频素材。后台播放必须同时确认宿主已经进入后台、进度持续推进、音轨未静音及系统音频流有效，不能仅看 paused=false 或前台服务存在。还需验证系统播放/暂停/切歌/拖动、封面切换、恢复前台、退出后的后台资源释放，以及系统旋转开关开/关与手动锁定恢复。模拟器结果不替代真机省电策略、蓝牙设备和长时间待机验收。

1.5.0 汇总已发布 1.3.5 之后的系统媒体、横屏、头像、歌词、弹窗和手势维护提交。用户确认双端测试全部通过后，双端 versionName/versionCode 升级为 1.5.0/150，重新构建正式签名包并发布新标签，保留既有发布 tag。

实际验证范围、问题复现与后台时长数据见 [2026-10-01 系统媒体与旋转验收](mobile-media-lifecycle-2026-10-01.md)。

### 一起听界面维护（1.3.5）

- `MusicTopNav.tsx` 使用 `isGlobalAppearanceRuntime()` 与窄屏判断固定移动端折叠导航。Android/HarmonyOS 的横屏与平板也不能展开；旧偏好 `musicNavCollapsed=false` 不能恢复完整导航。保留网易云的首页、私人漫游、云盘、我的音乐，以及哔哩哔哩入口；桌面网页仍可切换完整导航。
- `MusicAppShell.tsx` 的下箭头使用 `music-player-collapse-button` 样式：44px 触控区、浅色圆形底板、深色图标、描边和阴影。保持触屏唤出后三秒自动隐藏和桌面悬停逻辑，避免在黑色视频中丢失操作入口。
- 房间 `.glass-strong` 背景使用 `var(--glass-bg)`，避免硬编码深色底板与浅色主题深色文字组合。纯净视频使用 `contain`，关闭装饰性模糊和缩放；覆盖层通过 `data-music-immersive` 固定到视口，切换时保持同一视频元素。原生返回先退出纯净模式。
- `useSongQuality.ts` 对无歌曲的状态统一用 `null` 比较，避免保存 `-1` 却与 `undefined` 比较，导致空队列打开播放器无限重渲染。保留空队列打开、收起的回归检查。
- 回归至少覆盖：旧展开偏好、手机横竖屏、原生宽屏、深浅主题菜单、黑色视频上的下箭头和点击关闭；纯净模式继续检查视频边界、媒体元素连续性与原生返回。记录实际检查范围，不能以模拟器 UI 检查代替真机解码和后台专项验收。

本版结果与安装附件见 [1.3.5 发布记录](releases/client-1.3.5.md)。

### 横屏背景、头像、歌词与一起看手势（2026-10-02）

展开的一起听横屏覆盖层应铺满视口，包括摄像头和底部导航区域。安全区只加在 `.music-player-content` 与收起按钮上，不能继续给外层 `.mobile-room-music` 留 padding，否则视频/渐变背景会露出左侧、底部壁纸。曲绘和歌词等前景仍保留安全区与额外间距。横屏收起、回到竖屏后恢复房间原有安全区与顶栏。

Android/HarmonyOS 的一起听工具栏隐藏浏览器全屏按钮，由原生窗口与展开播放器负责显示区域；桌面网页保留该按钮。纯净视频入口及带背景的收起箭头继续保留。

网易云评论、楼层回复和个人头像统一经过 `utils/neteaseImage.ts`：网易云 CDN 的 HTTP 地址升级 HTTPS，协议相对地址补全 HTTPS，使用 `URL.searchParams.set` 设置尺寸并保留已有参数。图片使用 `no-referrer`，空地址和加载失败使用内置默认头像。不要直接拼接第二个 `?param=`，也不要把非网易云地址任意改成 HTTPS。

`utils/lyricRequest.ts` 为界面与系统会话共享网易云歌词/哔哩哔哩 AI 字幕请求，按 API 地址和请求路径去重；缓存最多 20 项、有效期 5 分钟，失败请求允许重试。`useSystemLyrics.ts` 在原生端独立于展开歌词面板获取数据，转为带毫秒时间戳的 LRC；迟到的旧曲请求不能覆盖新曲，切到无歌词歌曲立即清空旧歌词。系统当前行按实际音频进度更新，包含拖动进度与切歌。界面中的逐行偏移、翻译显示偏好仍属于界面设置，不应宣称已经同步到系统。

鸿蒙通过 AVMetadata 的 `lyric` 和 `singleLyricText` 发布完整 LRC 与当前行；安卓发布兼容性自定义元数据键 `android.media.metadata.LYRICS`，并使用 `DISPLAY_DESCRIPTION` / 播放通知 `subText` 发送当前行。安卓标准媒体控件没有鸿蒙式独立歌词页，实际展示取决于系统或媒体控制器，不能仅凭写入自定义键承诺所有系统都能展开完整歌词（参见 [Android 媒体展示说明](https://developer.android.com/media/implement/surfaces/mobile)）。两端媒体桥接负载上限为 262144 字符，系统 LRC 上限为 65536 字符，避免原来的 16384 字符限制截断正常歌词。

一起看原生手势由 `useWatchGestures.ts` 在播放器捕获阶段处理。视频表面单击只显示控件，中间三分之一双击切换播放/暂停；全屏状态下左右三分之一双击分别后退/前进 15 秒，范围限制在 0 到时长内，未知时长不跳转。全屏包括网页全屏和播放器容器全屏。显式播放按钮、进度条、设置等控件继续使用原有操作。触屏双击需要同一区域、相邻点且间隔不超过 320ms，拖动、长按和取消不组成双击；处理后抑制浏览器合成的重复 dblclick。观众手势仍通过原来的播放、暂停、跳转申请，不能绕过房主审批；卸载必须移除捕获监听。桌面网页维持原来的播放器手势。

本轮两端构建、模拟器检查与测试边界见 [2026-10-02 播放器界面与手势验收](mobile-player-ui-2026-10-02.md)。后台播放已由用户确认通过，本轮未重复长时间后台专项测试。

### 追加视频弹窗与一起听全屏手势（2026-10-02 跟进）

`MusicVideoModal` 使用 body portal，避免被完整播放器的动画 transform 和 overflow 裁切。宽度以 450px 为上限、同时受视口与安全区约束；高度以可用空间为上限，标题与关闭按钮固定在弹窗头部，内容独立滚动。手机窄屏的搜索/删除按钮放在视频信息下面，分P列表只在自身范围内横向滚动。账号昵称、视频标题、UP主、歌曲名不能撑宽容器。颜色、背景、圆角与模糊使用外观/MD 主题变量，禁止恢复固定黑底和白字。键盘缩小视口时仍应能滚动操作；关闭按钮至少 44px，可通过遮罩、Esc 或原生返回关闭，关闭后恢复焦点。原生返回的弹窗监听使用捕获阶段，避免同时触发离房确认。

`src/mobile/videoGestures.ts` 是一起看和一起听原生手势的共同判定器。一起看的入口仍为 `useWatchGestures`；一起听使用 `useMusicVideoGestures`，**只在纯净视频全屏（immersive=true）启用**。普通展开音乐界面、视频背景和音乐卡片不启用视频双击手势。全屏中间三分之一双击播放/暂停，左右三分之一双击跳转 15 秒；单击只唤出退出按钮，按钮三秒后隐藏，Esc 与原生返回继续退出。网易云追加视频、哔哩哔哩原视频使用相同规则，网页播放器保持旧手势。

一起听视频恒静音并跟随音乐，因此手势必须调用 `handlePlayPause` / `handleLyricSeek`，作用于实际音频并保留观众审批及进度等位锁，不能单独操作背景 video 的 currentTime/play/pause。进度按音频时长限制在 0 到末尾，未知时长不跳转。监听存续期间通过最新回调 ref 读取命令，避免播放状态重渲染清空触屏双击去重标记，导致浏览器合成的 dblclick 再执行一次。

删除视频关联会卸载 video 元素，`useBackgroundVideoSync` 在源清空时必须释放引擎、清空已应用 URL 与画面就绪标记。否则重新追加同一 URL 会被当成已经加载，新的 video 没有 src。回归同时检查搜索、分P选择、删除、同源重新追加与静音视频的播放/暂停/进度跟随。

追加视频与一起听全屏的开发构建结果见 [验收记录](mobile-music-video-2026-10-02.md)，其中记录的 1.3.5 / 135 是当时的调试版本；以上功能已纳入 [1.5.0 正式发布](releases/client-1.5.0.md)。

优先通过 adb / hdc 命令行安装，使用 debug 包的 WebView/ArkWeb CDP 检查实际打包界面。Android 手机模拟器与 DevEco Pura 90 Pro 手机模拟器分别检查浅/深色连接与列表、播放设置、弹幕字体页、横竖屏、全屏、原生返回、主题持久化及切换后的媒体 DOM 持续性。测试服务器使用隔离数据库和只读用户视频；结束恢复原连接与偏好，关闭服务器并撤销转发。

从交付树清理旧测试目录、fixture、废弃测试命令、编辑器过程目录及临时缓存；保留平台原生源码、Gradle wrapper、Go 模块、网页静态资源、媒体库及许可证。删除前核对构建依赖，删除后重新构建两端。iOS 目录、测试和其维护资料不在本次清理范围。历史适配报告保留有用的编码与设备限制证据，过程脚本、账号数据、日志与密钥不发布。

## GitHub 发布

本仓库沿用一个双端 Release：当前为 `client-v1.5.0`，包含签名 APK、签名 HAP、对应提交源码 ZIP 和 `SHA256SUMS.txt`。不上传 APP 上架包、AAR、私钥、服务器数据；iOS 未签名 IPA 追加在同一 `client-v1.5.0` Release，不另建 iOS 标签。发布说明列出实际验收范围；不能把解析成功当作媒体解码通过。

CI 只执行现有的依赖安装、共享前端同步和 Android debug 构建；已删除的测试命令不能继续留在 workflow。源码发布应核对目标提交、附件版本与 SHA-256 一致。

Android SDK setup 的 packages 显式指定 `platform-tools`。旧 setup-android v3 默认还安装 Google 已移除的 `tools` 包，2026-10-01 发布后的 CI 因 `Failed to find package 'tools'` 中止；此环境修复作为后续维护提交进入 main，不修改 1.3.0 安装包或已发布标签。

B 站移动端回归使用隔离数据库与测试房间，确认本机扫码账号、最高可用画质、真实 CDN Range/206 和影片列表延迟时序。房主桌面 CLI `127.0.0.1:9333` 只能由房主电脑访问，不是客户端代理端口；Android/HarmonyOS 分别启动自己的随机本机回环代理，并保留 CDN 已签名查询参数。测试结束恢复 Android 模拟器分辨率/密度和客户端原房间会话，关闭测试服务并撤销 adb/hdc 转发。
