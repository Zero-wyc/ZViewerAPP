# iOS 继续开发与验收文档

更新：2026-09-30。工程：ZV-iOS/；界面和权限语义基准：Android 1.2.1。

**本轮后续源码及未签名设备包已交付：1.2.1 / build 9。真机尚未验收。** 语音和本机 B站 CLI 已实现并编入本版，不再列为未开发；编译、桌面播放和协议 fixture 不能代替 iPad 验收。

## 1. 当前决策

- 独立 Expo/RN；单一 VLCKit 文件/音乐/HTTP-FLV 内核，NativeMediaAdapter → VlcPlayer → VlcVideo。WebRTC 仅接收原有实时共享。
- 客户端适配 v4.2.0，保留 8 MiB Range 上限，不引入默认转码/HLS；本轮正式服务端无交付改动，共享 Go 实现及其他客户端未修改。
- 只连接隔离的本地服务及指定的 S01E01.mkv / S01E04.mp4；本轮未连接 NAS。
- 用户无付费 Apple team，先交付未签名 ARM64 Release，用户稍后自行签名/安装/测试。内置 JS，不用 Expo Go/Metro。
- Android 绿色主色/深灰背景、聊天/片单/房间、控制顺序与权限语义；iPad 双列、窄屏单列。

参考：[Expo 规范](../ZV-iOS/AGENTS.md)、[README](../ZV-iOS/README.md)、[b9 交付证据](releases/ios-1.2.1-9-unsigned.md)、[历史单内核基线](releases/ios-1.2.1-2-vlc.md)。缺失的历史外部手册不作为当前证据。

## 2. 已实现和待验证

| 阶段/项目 | 已实现 | 当前证据 | 有待测试验证 |
| --- | --- | --- | --- |
| 工程/连接 | SDK57.0.26、RN0.86.3、React19.2.3；地址/账号/游客/SecureStore/刷新/换服务器 | 单测、本地登录、JS 导出、设备编译 | 安装/启动/升级、HTTP 局域网权限、过期/后台恢复 |
| P0 单内核/同步 | VLC 串行切源/seek/倍速/心跳、令牌轮换保进度、旧回调隔离、分离音轨/释放 | 单测、设备编译、桌面及原网页 Range | **iOS** MKV/MP4/HLS 十分钟、短206续读、seek/取消、分离轨、跨端同步/流量 |
| P1 房间/权限 | 列表/创建/加入/审批/密码/离开/关闭、房主恢复/转交、成员事件、禁言/踢出/管理员、名称/模式/加入条件 | 16 项本地 UI、真实 Socket 事件 | Android 同房全权限、断线/重连/已有名单恢复、失败提示 |
| P1 布局/系统 | 响应布局、全屏/旋转、模式滚动复位、VLC PiP/后台配置、持久化偏好 | 三尺寸无横向溢出、零 JS 异常、编译 | iPad/iPhone/分屏、大字体/键盘、安全区、PiP/耳机/蓝牙/来电 |
| P2 片单/来源 | CRUD/排序/选片/直链/服务器文件；WebDAV/FTP/OpenList/Emby/Jellyfin 挂载 CRUD/测试/账号字段；AniSubs/旧番剧/Kazumi | 本地文件 UI；7 项 DAV 流程含观众通过房主挂载读取 Range；协议对照 | 各类真实挂载/媒体/账号、番剧解析、切源/跨端 |
| P2 字幕 | 内置/外部 URI/延迟；SRT/ASS/VTT/SMI/SUB 导入；房间同步、轨道/基础样式/偏好 | 解析/边界单测；真实 subtitle-update/request 权限与缓存 | MKV/鉴权/延迟/旋转；复杂 ASS 特效用 VLC 原文件，RN 层不完整复刻 |
| P2 弹幕 | 实时/轨道、暂停/seek/滚动/顶底/上限/偏好；XML/JSON 导入/编辑/偏移/隐藏/删除/在线搜索 | 时间轴/导入单测；实际服务端持久化/广播 | 碰撞/密度/性能、大文件/在线来源、Android 对照 |
| P3 一起听 | VLC 音频/队列/同步/审批/循环；网易云扫码/账号/搜索/用户歌单/推荐/歌词/音质；B站音乐/歌词 | 搜索 fixture + 真后端队列增删/广播、时钟单测、编译 | 真实扫码/VIP/歌词、后台/拖动/循环、Android 同步 |
| P3 房间语音 | AVAudioEngine/回声处理、Opus48kHz单声道20ms/32kbps、PCM 接收；主/媒体 Socket、静音/禁言/踢出、有限缓存/重连/释放；收起继续 | Opus host 编解码检查、原生编译、16 项真实协议（合成包） | **麦克风/扬声器/回声/延迟**、蓝牙/来电/后台/弱网、Android/鸿蒙双向 |
| P3 共享观看 | 原有 offer/answer/ICE/viewer-ready、重连/释放；OBS HTTP-FLV → VLC | 页面降级、WebRTC/VLC 编译 | 真实桌面画面/声音、NAT/ICE/弱网恢复，两路径分别验收 |
| P4 本机 B站 CLI | 共享 Go → ARM64 XCFramework → 本地 Expo Module；QR/Keychain、目录/分P/歌词；普通最高有权画质/设备能力、排除HDR/杜比、720p/480p有限回退 | Go 编译、CID/URL 边界单测、原生链接、IPA 桥接类 | **真实账号/CDN**、高画质/HEVC/分离轨/分P、过期/回退、音乐 |
| P5 设备交付 | 无凭据 workflow/CNG/iphoneos ARM64 Release/内置JS/未签名IPA、构建及检查脚本/许可证 | EAS FINISHED、Mach-O/桥接/框架/JS/SHA 检查 | 用户签名安装及真机结论；TestFlight/商店未进行 |

房间已拆分播放器、来源/片单、房间设置、字幕弹幕、音乐、语音、共享组件。普通 URL 继续拒绝 loopback/用户名密码；本机代理只接受原生当前会话签发的随机端口/能力路径。Cookie 留在原生 Keychain，不跨 JS；房间只广播 BV 原地址，各端独立解析。

## 3. 自动验证

- **34/34 单测**：鉴权/URL/Range/取消、切源/暂停/释放/音轨、字幕/弹幕/歌词、语音包和 B站 CID/分P。
- lint、类型、iOS/Web 导出通过。Doctor **20/21**：Directory 提示 WebRTC New Architecture 未测试和本地私有模块无元数据，未隐藏。
- 原版本地 v4.2.0：**16/16 UI**（零 JS 异常）、**16/16 语音/字幕/弹幕协议**、**7/7 DAV 流程**。音乐搜索/语音包/DAV 为 fixture，非真实音频或远端挂载验收。
- EAS b9 Release 成功；包内有 VLCKit/WebRTC/Go及语音桥接/JS/许可证。摘要见版本记录。
- 此前桌面 VLC3.0.23 两文件十分钟/seek/暂停恢复；原网页两分钟/暂停/退出后无新增请求或字节，脱敏记录离线核对通过。**不等于 iOS VLCKit4.0.0a24 实测。**
- 正式 serverFiles.ts/range-stream.ts/http-proxy.ts 与原备份一致。

## 4. 真机验收顺序

逐项记录设备/系统/build、步骤、结果及脱敏证据。当前用户真机结论：**未测试**。

1. 自行签名安装 **b9**，直接启动；登录、局域网权限、过期/重连/离房。
2. S01E01.mkv、S01E04.mp4 各至少十分钟；90/700/1300秒 seek（按时长调整）、暂停/恢复/离房重进，核对画面/声音/字幕。
3. 起始/中间/末尾/开放 Range、短206下一分片、416/取消/恢复，统计暂停/离房后新增字节/请求；保留8MiB上限，不以取消上限作为修复。
4. HLS/FLV/FLAC、具体编码、分离音轨/子分片鉴权/字幕分别记录，不仅按扩展名宣布支持。
5. iPad/iPhone/Android 同房：暂停/seek/倍速、晚加入/重连、审批/管理员/转交，同步目标约2秒，排查重复加载/旧进度。
6. 语音默认静音→开麦→双向，收起/禁言/踢出/重连/离房、边看边聊；Android/鸿蒙Opus/PCM、回声/蓝牙/后台/来电/弱网。
7. B站QR/退出、推荐/搜索/收藏/分P/高画质/分离轨/过期回退；网易云账号/VIP/歌词/后台/审批。
8. 横竖屏/分屏/全屏/PiP/键盘、大字幕/弹幕性能；真实WebRTC共享和OBS-FLV各自验收。

失败修对应客户端链路，不以编译/桌面证据替代，不创建“真机通过”标签。

## 5. 保留限制及发布后续

- v4.2.0 无独立 SMB 配置 API；可使用服务器已挂载的 SMB 文件目录，未新增服务器 API。
- register-host 不返回完整既有成员列表；房主重连后的名单恢复仍需跨端验证，不能凭后续进出事件宣布完整恢复。
- RN 同步字幕显示文本和基础样式，不完整复刻 ASS 特效；VLC 外部 URI 使用原文件解析。
- VLCKit 为预发布版；WebRTC New Architecture/硬件编解码仍待运行验证。
- 仅 unsigned-device 准备 native vendors；旧 development/simulator profile 需要对应准备步骤。
- 无 packages/shared/protocol，本版复用既有 DTO/Socket/Go，不导入 Capacitor；未来共享改动单独回归其他端。
- 用户签名/真机反馈后修正并递增 build；正式签名/升级/隐私/TestFlight/商店另行处理，未自动 push/上架。

## 6. 开发与 Git

SDK57官方文档和AGENTS为准，expo install；CNG/config plugin/本地Expo Module，不手改生成项目。每版记录测试/构建/摘要/真实剩余项。仅暂存本版iOS代码/锁文件/文档/脱敏证据，不混入既有Android/鸿蒙/根工程改动，不提交账号/原日志/证书/IPA。用户已授权源码/包检查后Git提交；未真机验收不创建通过标签。回滚用git revert，不reset --hard。

本轮文件和SHA-256见 [b9交付记录](releases/ios-1.2.1-9-unsigned.md)。
