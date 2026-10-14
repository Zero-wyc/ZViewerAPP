# HarmonyOS 客户端维护文档

更新日期：2026-10-14。本文与同目录的 Android、iOS 维护文档采用统一命名 `平台-maintenance-architecture.md`。

## 当前状态与范围

- HarmonyOS 源码及已发布安装包为 **1.8.6 / versionCode 186**，服务端协议以已集成的 v4.5.3 为基线。版本以 `package.json`、`ZV-HarmonyOS/AppScope/app.json5` 为准。
- 客户端源码和 Git 操作均在 `E:/Codex-bulid/ZViewer/ZViewer-client`；共享 React/Vite 前端与 Android 相同，原生部分使用 HarmonyOS ArkTS 与 ArkWeb。
- B站 Cookie、服务端凭据和本机代理状态只保存在原生侧。不能进入 React 状态持久化、网页日志、Socket 房间广播或公开源码。

## 代码入口

| 功能 | 维护入口与约束 |
| --- | --- |
| 宿主启动和 ArkWeb 生命周期 | `ZV-HarmonyOS/entry/src/main/ets/entryability/EntryAbility.ets`、`pages/Index.ets`；页面创建 `zviewerHost` 并注入 `window.zviewerNative`，加载生成的 `rawfile/web`。 |
| 连接与网络路由 | `services/ServerConnection.ets`、`src/platform/connectionTransport.ts`、`serverConnection.ts`；按已选服务器建立安全通道，原生持有连接状态与证书。 |
| B站解析和本机代理 | `services/BilibiliResolver.ets`、`BilibiliWbi.ets`、`BilibiliLocalProxy.ets`、`BilibiliCredentialStore.ets`；分别维护签名、UGC/PGC 解析、本机媒体代理与凭据生命周期。Cookie 不回传 WebView 或广播。 |
| 播放器与系统媒体 | `services/NativeMediaSession.ets`、`src/platform/mediaSession.ts`、`playerDisplay.ts`、`lifecycle.ts`；维护媒体会话、音频焦点、方向/沉浸栏和页面/房间退出清理。 |
| 共享界面和业务 | 根目录 `src/App.tsx`、`src/upstream/`、`src/mobile/`、`src/platform/`；HarmonyOS 通过平台契约分派能力，避免在共享 UI 中直接调用 ArkTS。 |
| 更新入口 | `src/mobile/AboutApp.tsx`、`src/mobile/appUpdates.ts`、`ExternalLinks` 平台能力；HarmonyOS 入口显示宿主版本并打开正式 Release 下载地址。 |

共享业务仍需遵守移动端房间权限、播放器异步取消、真实媒体身份与本机代理 URL 分离等约束。原生 ArkTS API、WebView 注入、权限与系统媒体行为只在 HarmonyOS 工程验证，不能用 Android 插件或 iOS Expo 模拟替代。

### ArkWeb 与平台桥的完整路径

根项目 `npm run harmony:web` 先以相对资源路径构建 Vite，再由 `ZV-HarmonyOS/scripts/sync-web.mjs` 复制到 `entry/src/main/resources/rawfile/web/`。`Index.ets` 将这些文件通过固定虚拟来源 `https://zviewer.local` 提供给 ArkWeb；`scripts/bridge-bootstrap.js` 在 React 启动前完成 `zviewerHost` 握手，暴露共享前端需要的 `window.zviewerNative`。修改桥接时核对 `src/platform/contracts.ts`、bootstrap 的 action/超时/错误、`Index.ets` 分发以及具体 service 的返回数据。固定来源与本地资源路径校验是安全边界，不能为了播放外部媒体而放开任意网页导航。

原生能力包括应用生命周期、返回键、麦克风权限、服务器连接、B站登录/代理、播放器方向与沉浸模式、系统媒体信息及下载页系统浏览器。共享组件只调用 `src/platform`，不要在 React 组件直接写 ArkTS 特例。ArkWeb 网络、DOM 与设备系统解码器与 Android WebView 不同，同一 `dist` 仍要分别安装验证。

### 房间与播放器维护约束

`src/upstream/store/roomStore.ts` 持有房间影片、片单、角色及模式；`src/upstream/modules/room/watch-together/` 与 `sync-playback/` 处理房主/观众控制。影片 ID、CID/ep 与服务器逻辑 URL 可跨设备传播，本机代理地址只供当前 HAP 播放，不能写入片单或广播。若播放状态先于 current-movie/片单到达，先等待权威影片资料再解析；切 P/集、离房和切服后废弃旧请求。排序必须完整且限有权限的角色；清空片单等待服务器结果与广播，失败不提前清屏；自动连播从最新片单选下一条。

共享媒体引擎在 `src/upstream/modules/player/engines/`，媒体库 HLS 鉴权与相对清单在 `player/services/library-hls-proxy.ts`，PGS/MKV 在 `subtitles/` 和 `patches/playsvideo+0.4.7.patch`。实际可播性取决于 ArkWeb 与设备编解码器。已有 Pura 90 Pro 模拟器上 H.264 MP4/MKV 可播放，而特定 HEVC Main 10 MKV 解封装后仍零帧并报 `PIPELINE_ERROR_DECODE`；这类问题先核对视频 codec 与系统能力，不能把解封装/字幕提取成功当成解码通过。

房间模式固定为一起看、投屏、一起听。当前移动 UI 的房间设置集中在右上角，音乐账号菜单只处理账号与音乐设置，评论侧栏按移动规则展示。`MobileAppearance.tsx`、`appearance.css` 的根变量覆盖 body Portal；切主题要保持原视频/音频 DOM 不变，播放器画布保持黑色。全屏默认横屏，手动解锁后尊重系统旋转开关；退出全屏/离房恢复系统栏和安全区。`Index.ets` 将 WindowAvoidArea 转成 `--native-safe-*`，与网页 safe-area 合并，横屏短高度仍需保证确认按钮可达。

### B站 ArkTS 解析与回环代理

`BilibiliWbi.ets` 对关键词和 API 参数签名，`BilibiliResolver.ets` 解析普通 BV、分 P/CID、PGC ep/ss、实际 qn 与 DASH 音视频轨，`BilibiliCredentialStore.ets` 保存本机账号，`BilibiliLocalProxy.ets` 提供 `/resolve` 与媒体代理。Android Go 实现是行为参照而非共享二进制；WBI 字符重排、UTF-8/特殊字符、UGC 的字符串 `result`、会员错误及画质筛选须在 ArkTS 单独测试。

自动画质只从当前账号确有权限、解析结果确有视频与音频轨道、设备能够解码的普通档位选择；不按 qn 最大值直接选择 HDR/杜比。高画质不可用时核对源站实际提供的 720p，再考虑更低档位；手动画质不得被登录回调、代理重连或房间心跳擅自改写。解析成功但无声时，先检查 DASH 音轨与设备播放链路，再区分账号权限、CDN 和解码失败。修复上述规则时，须与 Android Go 的固定向量分别验证，不能因为共享 Web 页面通过就判定 ArkTS 解析正确。

代理只监听随机 `127.0.0.1` 端口和随机能力路径，限制 Host/Origin、HTTP 方法、CDN 域名和端口，正确转发签名查询参数及 Range/HEAD；CDN 请求不带账号 Cookie。房主桌面 CLI 的回环地址不是鸿蒙设备可访问的源，`cliOnly` 也不能改走服务器代理兜底。解析成功后至少核对实际视频/音轨、206 Range、持续帧推进、暂停与 seek；仅见 200 响应不够。

### 系统媒体、语音与安全区

`NativeMediaSession.ets` 创建 AVSession、封面 PixelMap 和后台 AUDIO_PLAYBACK 连续任务，通过 `Index.ets` 的 update/clear action 连接 `src/mobile/useSystemMediaSession.ts`。更新/清除应核对 sessionId，旧媒体不能清掉新媒体。播放中维持后台任务，暂停/离房释放任务与资源；歌词长度、封面回调、秒/毫秒换算以及锁屏命令应回归。原生系统媒体能显示，不代表长期 JS 房间 Socket 一定保持活动。

`voice-chat/hooks/useVoiceChat.ts` 使用 LiveKit `/api/voice/token` 返回的 URL/token/identity，并调用管理 mute/kick；`Index.ets` 处理麦克风授权和 ArkWeb 音频捕获。加入只听、用户主动闭麦、管理员禁言、撤销权限、切房、断网重连要分别验证；离房必须释放音轨与 Web Audio 资源。投屏为观看端，来自 `src/upstream/modules/screen-sharing/`，本手机客户端不负责采集屏幕。

### 常见故障定位

| 现象 | 优先核对 |
| --- | --- |
| React 已更新，HAP 还是旧界面 | 是否运行 `npm run harmony:web`，`rawfile/web` 是否重新生成，包内资源摘要是否匹配。 |
| HAP 白屏或资源 404 | `https://zviewer.local` 映射、相对资源路径、bootstrap 是否先于 React 执行以及 ArkWeb console。 |
| 桥方法超时/字段缺失 | `contracts.ts`、bootstrap action、`Index.ets` 分发、service 返回结构及取消清理。 |
| B站解析成功但无画面或无声 | 本机代理 Range/HEAD、签名 URL、CDN 白名单、音视频实际轨道及设备编解码器。 |
| 进度跳回或旧片重载 | current-movie/片单事件到达顺序、movieId/CID、请求代次、服务器心跳与主动 seek 抑制。 |
| 全屏后留黑边或状态栏 | WindowAvoidArea、`--native-safe-*`、orientation/immersive action、退出恢复与主题 Portal。 |
| 媒体通知出现但后台停播 | AVSession 与 AUDIO_PLAYBACK 任务是否同时有效；暂停、离房、系统回收与实际设备后台策略。 |

## 验证矩阵

共享改动覆盖账号/游客、创建/加入/审批/离房、片单权限、普通 MP4 与媒体库 HLS、B站 BV/分 P/PGC、弹幕与字幕、一起听和 LiveKit。ArkTS 改动增加固定来源导航、回环代理安全、系统返回、麦克风拒绝后重试、前后台恢复、全屏/旋转和系统媒体。区分单元/桥接替身、ArkWeb 调试、模拟器、物理手机/平板结果；模拟器成功不得外推 HEVC Main 10、真实蓝牙/后台或生产穿透网络。

## 构建与维护顺序

1. 服务端升级时先核对本地服务端 REST/Socket 合同、角色权限和媒体身份；在本仓库定向移植共享层差异，检查 ArkTS 独立的 WBI、代理、证书和媒体桥。若共享契约变化，同时核对 Android 维护文档及平台实现。
2. 共享前端改动在根目录运行 `npm run test:adaptation`、`npm run test:media`、`npm run build`。
3. 执行 `npm run harmony:web`，通过 `ZV-HarmonyOS/scripts/sync-web.mjs` 更新 `entry/src/main/resources/rawfile/web/`。该目录是生成物，禁止直接修改。
4. 在 DevEco Studio 打开 `ZV-HarmonyOS/`，配置本机 HarmonyOS SDK 与签名后构建 HAP；版本代码与 Android 保持一致。发布签名密钥及 Profile 不放入源码。
5. 检查 HAP 版本、签名、包内网页资源和 SHA-256；完成一个可交付版本后在客户端仓库本地提交。

`build/`、`.hvigor/`、生成的 `rawfile/web/`、本地 SDK/签名配置属于机器生成或私有产物，不进入源码发布。浏览器桥接替身、模拟器和包体检查仅代表对应验证级别；ArkWeb 真机播放、真实账号、后台/蓝牙音频和跨设备同步须按实际设备单独记录。历史版本与发行记录可从 Git 历史及 GitHub Releases 查询。
