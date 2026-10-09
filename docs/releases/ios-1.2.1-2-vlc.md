# iOS 1.2.1 / build 2：单一 VLCKit 候选

日期：2026-09-30（Asia/Shanghai）。基线：ZViewer-client `a0be50d` 及已有 Expo 工作区。状态：源码候选与原生模拟器编译完成，真机未验收；不创建通过标签，不作为完整 iOS 功能交付。Git checkpoint 保存本轮 iOS 工程，不包含既有 Android/鸿蒙及根工程改动。

## 决策与实现

用户最新要求：iOS 仅使用 VLCKit，保留统一播放器适配接口，客户端主动适配服务端，非必要不修改服务端。已移除 expo-video 依赖、AVPlayer 配置及切换分支；MP4、MKV、HLS 均使用 `NativeMediaAdapter → VlcPlayer → VlcVideo`，没有按后缀选择内核。

- `expo-libvlc-player` 固定 57.0.54，iOS pod 为 **VLCKit 4.0.0a24（预发布版）**；EAS 已验证该组合可以原生编译，编码/硬件/系统行为仍须真机测试。
- 秒/毫秒转换、初始 seek、播放/暂停/倍速、房间心跳使用同一接口。切源串行执行；原生回调带加载序号，旧源不能覆盖新源；令牌刷新保留本机进度；离房和卸载释放播放器。
- VLC 自行发 Range。客户端去除固定 Range 和 `rangeMode=avplayer`，接受偏移、长度及总长正确的短 206，诊断额外验证下一分片。现有服务端 8 MiB 上限保留。
- 仅自己的规范化 API 地址使用当前会话鉴权；VLCKit 桥接使用服务器已有的 `?token=` 入口。带令牌播放 URL 只保留在客户端播放状态中，原始房间 URL 不改写。外部源只允许 Referer/User-Agent，不传房主 Cookie/Authorization。
- 使用 Android 绿色主色和深灰 surface/text，沿用聊天/片单/房间入口及双列布局。快退/播放暂停/快进、扩大与恢复播放器接入统一控制；扩大时保持一个原生播放器。完整沉浸、旋转、多尺寸截图及 P1 页面拆分尚未验收。
- Expo Go/Web 预览缺少 VLC 时显示明确构建提示，不使用备用内核。

## 服务端及本地验证

仅使用用户指定的 `ZViewer-source-code` v4.2.0 源码、本地独立配置/数据库和以下只读视频；本轮单内核验证**未访问 NAS**。之前服务端实验移入仓库外目录，正式源码不保留实验修改。`serverFiles.ts`、`range-stream.ts`、`http-proxy.ts` 与实验前备份 SHA-256 相同；Jellyfin/Emby 实验参数已撤回。不新增转码、HLS 服务或取消浏览器分片上限。

| 本地样本 | 桌面 libVLC 3.0.23 验证 |
| --- | --- |
| `C:/Users/FredQ/Videos/S01E01.mkv` | 10 分钟连播；90/700/1300 秒跳转；暂停恢复及停止；解码视频/音频计数持续增加 |
| `C:/Users/FredQ/Videos/S01E04.mp4` | 同上 |

本地服务绑定 `127.0.0.1:7333`，`CONFIG_DIR`/`UPLOADS_DIR` 指向仓库外 `local-ios-validation`，测试目录挂载为只读。桌面 VLC 经本机临时转发连接此服务器；鉴权不进入进程参数或报告。两部影片十分钟分别读取约 203/194 MiB（包含容器定位与预读），均跨过多个 8 MiB 响应。暂停稳定后观察 10 秒、停止稳定后观察 5 秒，两片新增读取字节及请求数均为零。没有用桌面结论冒充 iOS 结果。

原服务端网页源码构建后通过本地 Vite preview（127.0.0.1:7336）代理到同一后端；独立 headless Chrome 播放 MP4 两分钟，读取 70,062,440 字节（约 67 MiB），没有一次读取整片。暂停稳定后观察 15 秒、退出后观察 10 秒，新增字节与请求均为零。响应最大 8 MiB。此结果覆盖当前本地文件路径，不声称覆盖所有代理或浏览器环境。

[脱敏结构化证据](ios-1.2.1-2-vlc-results.json)保留 Range/Content-Range、实际读取字节、时间及状态，未包含服务 URL、账号或令牌。可执行 `node scripts/check-local-results.mjs` 离线核对全部断言。

### 本地复测入口

测试脚本位于 `ZV-iOS/scripts/local-vlc-check.py` 和 `local-web-check.cjs`；只连接固定 loopback 端口，使用本地新数据库的默认 root 账号，不能用于生产服务。依赖 Windows VLC 3.x 默认安装位置、Python、源码目录已安装的 Playwright/Socket.IO 和 Chrome。脚本使用用户本轮指定的视频路径，报告写入仓库外 `local-ios-validation`；复测前建立该目录及独立配置/上传目录。

1. 在服务端源码执行 `npm ci --ignore-scripts`、`npm run build -w backend`、`npm run build -w frontend`。
2. 使用独立 `CONFIG_DIR`、`UPLOADS_DIR`，`HOST=127.0.0.1`、`PORT=7333`、`HTTPS=false`、`RTMP_PORT=7334`、`HTTP_FLV_PORT=7335` 启动 `backend/dist/index.js`；不得复用 NAS 配置。
3. 执行 Python 脚本：创建/复用只读本地测试目录并检查 HEAD；若挂载注册缓存尚未更新，等待后重试。VLC 测试约 11 分钟。
4. 在 frontend 目录设置 `VITE_API_TARGET=http://127.0.0.1:7333`，执行 `npx vite preview --host 127.0.0.1 --port 7336`；执行网页脚本。它只在本地数据库创建测试房间/片单，不连接用户现有房间。
5. 核对新的两个报告：连续播放、seek、解码计数、分片响应上限、暂停/停止或退出后字节与请求数。重新收集证据后更新版本记录，不能直接沿用本次通过结论。

## 自动检查与构建产物

| 项目 | 结果 |
| --- | --- |
| iOS `npm test` | 21/21，通过；含分片续读诊断、鉴权边界、切源竞争、初始暂停、旧回调隔离及释放 |
| `npm run lint` / `npm run typecheck` | 通过 |
| `npx expo-doctor` | 21/21，通过 |
| `npx expo export --platform ios` | 通过，JS/Hermes 导出 |
| 服务端原 Range 测试 | 23/23，通过 |
| 原服务端 backend/frontend 构建 | 通过（frontend 有既有构建警告） |
| 本地结果离线断言 | 通过 |
| EAS `ios-simulator` 原生构建 | **FINISHED**，VLCKit pod/Swift 桥接/Xcode 编译通过 |
| 签名 preview/真机 IPA | 无可用内部测试签名凭据；尚无 IPA |

EAS 构建：[700fa19a-2710-4574-b675-6ce96fa44d8c](https://expo.dev/accounts/YOUR_ACCOUNT/projects/zviewer-ios/builds/700fa19a-2710-4574-b675-6ce96fa44d8c)。产物：[模拟器 archive](https://expo.dev/artifacts/eas/Mnzr8xO4zGXVcjcEL12_p8BdVEczDAJS3dQvp8S-F_k.tar.gz)，含 `ZViewer.app`，**不能安装到 iPhone/iPad**。

本地副本：`E:/Codex-bulid/ZViewer/local-ios-validation/zviewer-ios-1.2.1-b2-vlc-simulator.tar.gz`。SHA-256：`E6DB9CB7578F2DC1C05420748A2DC032D9E5F71A408356534AAB9A94A2F846F9`。原生构建捕获本轮播放器运行代码；之后仅整理测试脚本、注释和文档。

## 剩余验收与回退

P0 仍需 Apple 签名/设备注册、development/preview 真机包：iPhone/iPad 启动与登录、上述两个文件各十分钟、三点 seek、暂停/恢复/离房、断线重连、横竖屏、安全区、耳机/后台及 Android 同步偏差。HLS 子分片鉴权、HEVC/Opus、ASS 和附图/音轨仍要在实际 VLCKit 4.0.0a24 上验证；普通直连 HLS 的格式支持不等于私有代理鉴权已通过。尚不支持分离音视频源。

用户已确认有 Apple Developer 账号。提供 `ZV-iOS/scripts/build-ios-device.ps1` 注册/构建入口；Apple 登录、双重验证及 iPad 注册由用户在本机交互式终端/设备完成，未收集账号密码。已启动的 Expo Go 隧道用于页面预览，无法验收 VLCKit；新增开发依赖 `@expo/ngrok` 只用于扫码连接。签名包完成后改用 development build 二维码。

完整来源浏览、字幕/弹幕、一起听、语音、共享观看和 B 站原生代理按 continuation plan 推进。用户真机结论：未验收；本次不进入 P2–P5，也不修改 Android/鸿蒙共享协议。

Git 状态为候选 checkpoint；最终提交号由交付报告及 `git log` 对照。没有发布包需要回退；后续撤销使用 `git revert`，已发布版本恢复代码须递增 buildNumber，不执行 reset --hard。未 push 或发布商店。
