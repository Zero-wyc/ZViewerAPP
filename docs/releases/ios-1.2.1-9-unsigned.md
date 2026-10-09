# iOS 1.2.1 / build 9 未签名交付

2026-09-30。基线 commit：625d615；本轮提交见 Git 日志。**源码和设备包已完成，用户真机尚未测试。** [原计划](../ios-continuation-plan.md)。

## 范围

单一VLCKit、Android风格房间/权限、来源/挂载管理、番剧、字幕/弹幕导入同步、一起听/共享接收；本机Go B站QR/Keychain/目录/分P/画质/音乐/回退；原生Opus/PCM语音及音频会话。保留统一适配接口及v4.2.0的8MiB分片；没有本轮服务端或共享Go实现修改，未连接NAS。

## 设备包

- [EAS b9 构建](https://expo.dev/accounts/YOUR_ACCOUNT/projects/zviewer-ios/builds/10d2231e-6e5f-4269-8147-35b312846918)：FINISHED，2026-09-30 04:08:23 UTC。
- 本地：ZV-iOS/release-assets/ZViewer-1.2.1-b9-unsigned.ipa，**46,352,519 bytes**，不提交二进制。
- SHA-256：`f5bbda4dd8fed7bf9c16f208a9dc3803ec015c74bbda6f6f1abe3683f285302c`。
- com.zviewer.mobile；1.2.1 / 9；ARM64、Mach-O LC_BUILD_VERSION=IOS(2)，非模拟器；无app签名/描述文件/签名目录、无加密。
- 内置JS 2,928,565 bytes；VLCKit/WebRTC/Hermes；设备binary含ZViewerNativeModule/ZVBiliBridge/ZVVoiceCodec，麦克风说明、background audio及LocalNetworking。
- 固定VLCKit4.0.0a24/expo-libvlc-player57.0.54；workflow校验Go/Opus下载摘要、设备编译及host Opus50帧编解码smoke。

**用户自行签名后安装**；Release无需Metro，Expo Go不能验收原生模块。b4/b6/b8均为中间包，请用b9。

## 验证证据

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| 单测/lint/类型 | 34/34、通过、通过 | 纯策略/边界 |
| iOS/Web导出 | 通过 | 非设备运行 |
| Doctor | 20/21 | WebRTC New Architecture未测试、本地私有模块无Directory元数据，未屏蔽 |
| 本地UI | 16/16、零JS异常；1180×820/820×1180/390×844无横向溢出 | Expo Web；NCM搜索fixture，真后端队列 |
| 语音/字幕/弹幕协议 | 16/16 | 原版本地服务器，合成Opus/PCM，非麦克风 |
| DAV/片单/观众Range | 7/7 | 合成DAV；metadata/movieId代理/密码保留，非NAS解码 |
| Go core/mobile | 编译通过，无现存测试文件 | 未恢复用户删除的测试 |
| EAS设备编译/IPA | 通过 | 编译/链接/包结构 |
| 历史桌面/原网页Range | 脱敏证据核对通过 | 非iOS VLCKit续读证明 |

脱敏摘要见 [b9 验证记录](ios-1.2.1-9-evidence.json)。构建日志确认 Opus host 50 帧编解码通过；IPA 内包含 BILICORE-LICENSE 和 OPUS-LICENSE。仓库外 local-ios-validation 保存详细 JSON、历史 Range 记录和截图；不提交原 EAS 日志或签发链接。

## 真机待测

MP4/MKV/HLS十分钟、seek/短206/退出后流量；分离音轨/字幕/PiP/后台；语音麦克风/回声/蓝牙/来电/跨端；真实B站QR/权限/CDN/分P/高画质/失效；NCM账号/VIP/歌词；真实共享/ICE、挂载/番剧、布局/权限/同步。详见原plan。

服务端无SMB配置API；房主重连完整名单受既有协议限制；RN同步字幕不完整复刻ASS特效；旧development/simulator profile未准备native vendors。没有真机通过标签、TestFlight/商店发布或push。
