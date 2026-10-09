# iOS 1.2.1 / build 2：P0 复测记录（阻塞，未交付）

> 历史 AVPlayer 记录。用户随后明确采用单一 VLCKit、客户端适配现有服务端；下文的“先修复通用代理”恢复条件已被新决策替代。当前代码与验证以 [单内核记录](ios-1.2.1-2-vlc.md) 为准，本文件保留当时测试事实。

日期：2026-09-30（Asia/Shanghai）。本轮代码基线：ZViewer-client HEAD `a0be50d` 加既有未提交 Expo 工程；本轮最终提交：无。上一个 iOS 真机通过版本/标签：无。build 2 是待验收候选，不是已发布版本。

## 服务端与实际媒体链路

用户确认服务器已部署 v4.2.0，未提供部署时间和运行包哈希；测试账号登录成功（admin）。本轮未修改服务端或部署配置。服务器文件浏览接口要求 root，旧 `Test/S01E01.mp4` 路径返回 404，不能沿用为验收样本。

核对上游 [v4.2.0](https://github.com/Zero-wyc/ZViewer/releases/tag/v4.2.0)：annotated tag 对象 `8022246b245832b4e61e146c6509a14bc3f198b8`，目标 commit `cbc19ef8ad99371601d8282e58acfdf2fef2fae3`。[serverFiles.ts](https://github.com/Zero-wyc/ZViewer/blob/v4.2.0/backend/src/routes/serverFiles.ts) 的本地文件路由识别 `rangeMode=avplayer`；[http-proxy.ts](https://github.com/Zero-wyc/ZViewer/blob/v4.2.0/backend/src/services/proxy/http-proxy.ts) 的通用上游代理仍调用 `clampRangeHeader(rawRange, MAX_RANGE_CHUNK_BYTES)`，没有对应的 AVPlayer 分支。Jellyfin `/api/jellyfin/stream` 使用此通用代理。上游标签源码核对不等于验证部署包哈希。

用户称测试房间为 Test 1；列表当时只返回 `房间 K7y3Jx3J`，脚本以唯一在线房间为候选进入，片单含下表两部影片。当前选中 MKV，状态暂停、约 0.822 秒。测试仅以观众加入/请求状态和媒体数据，结束后断开，不切换影片、不修改播放、不发送聊天。

| 样本 | 编码/容器（ffprobe） | HEAD 长度 | 网络结果 |
| --- | --- | --- | --- |
| 不良少女 - S01E01 - 第1集.mp4 | H.264 High / AAC LC，1080p，1422.463 秒 | 395279826 | 首/中/尾短 Range 与 416 通过；开放和 9 MiB Range 失败 |
| 安达与岛村 - S01E01 - 第1集.mkv | HEVC Main 10 / Opus，ASS 字幕、MJPEG 附图和附件，1446.2 秒 | 470132854 | 同样存在大 Range 截断；另需 MKV 原生解封装/音频/字幕适配 |

对两部影片分别请求 `Range: bytes=0-9437183`，期望 206、9437184 字节。实际均为 206、`Content-Range: bytes 0-8388607/<总长>`、`Content-Length: 8388608`。额外加入 `rangeMode=avplayer` 结果相同。短 Range 正常不能解除阻塞。大 Range 只验证响应头，随后取消，不下载整个媒体；短 Range 读取并核对实际 32 字节。未验证取消后服务端资源释放或反向代理带宽。

[脱敏原始记录](ios-1.2.1-2-media.jsonl)包含 room、六项 Range 诊断、带/不带 AVPlayer 参数的大响应头，以及 ffprobe 的编码结果；不包含服务地址、账号、密码、令牌或完整媒体 URL。ffprobe 通过绑定 127.0.0.1、随机地址的临时转发读取，鉴权仅在脚本内存，未进入进程参数或文件。

## 本轮客户端改动

- 单轨 Jellyfin/Emby/WebDAV/FTP/OpenList/SMB URL 可使用原生媒体传输；这不是上述来源浏览 UI 的完整移植。`hls` 和 `m3u8` 格式均识别为 HLS。
- API 鉴权同时核对规范化后的 origin 和反向代理路径边界；固定 Range、房主凭据和 Cookie 不进入媒体请求。拒绝 loopback 与 URL 内嵌凭据。
- 新增首/中/尾/开放/跨 8 MiB/416 检查；大范围立即取消，HLS 清单不套用文件 Range 判断；诊断切源/离房可取消并脱敏。
- NativeMediaAdapter 串行切源，防止慢旧源覆盖新源；同源状态更新不反复 seek，令牌更换保留本机进度；已知 MKV 明确提示尚无验证回退。
- 关闭/被踢/离房停播并阻止旧加入回调；仅消费统一 sync-heartbeat，避免重复处理同一心跳；片单选片先确认服务端 ack。
- 房主原生播放/暂停/倍速及全屏跳转接入广播。跳转通过原生进度事件的时间不连续检测，仍需 iOS 与 Android 真机对测；约两秒同步目标尚未验收。
- 配色采用当前 Android 的绿色主色及深灰 surface/text token，大厅最大宽度 640。保留聊天/片单/房间页签与双列条件。完整旋转、语音入口、房间模块拆分与多尺寸截图验收属于 P1，本轮未宣布完成。
- package/app 版本统一为 1.2.1，buildNumber 2；Expo 依赖通过 expo install 修正。EAS 关联 `@YOUR_ACCOUNT/zviewer-ios`，项目 ID `0b2a3a4d-2f06-4cb4-9ca7-6d57a123e31c`，版本由本地配置管理。

## 验证

Windows、Node 24.18.0；Expo 57.0.26、RN 0.86.3、expo-video 57.0.5。未修改 Android/鸿蒙/共享 Web 协议或 Go 核心，因此未执行 Android/HAP 构建。设备、iOS/iPadOS、Expo 宿主：尚未提供。

| 命令/项目 | 结果 |
| --- | --- |
| `npm test` | 14/14，通过；含权限边界、完整范围、8 MiB 回归、取消、HLS、切源竞争/鉴权刷新/释放 |
| `npm run lint` | 通过，零错误/警告 |
| `npm run typecheck` | 通过 |
| `npx expo-doctor` | 21/21，通过（首次 20/21，修正补丁依赖后通过） |
| `npx expo export --platform ios` | 通过；仅 JS/Hermes/资源导出，不是 IPA 或原生编译 |
| `npm install --package-lock-only --ignore-scripts` | 成功，audit 0 vulnerabilities（后续 expo install 同为 0） |
| `node scripts/live-media-check.mjs <仓库外账密文件>` | 请求成功、ffprobe 成功；两部影片的开放/大 Range 验证失败 |
| `npx eas-cli@latest build --platform ios --profile preview --non-interactive --freeze-credentials --no-wait` | 失败：远程账户没有适合 internal distribution 的签名凭据；未提交构建任务、未产出 IPA |
| `git diff --check` | 通过；未暂存其他既有修改 |

测试脚本依赖 Node 的 TypeScript strip 支持（Node 22.18+），ffprobe 可选；Node 对本工程 CommonJS 配置下的 TS 模块自动检测警告是非失败输出。真实媒体测试结果由调用者检查 `category`/`checks`，命令退出 0 表示脚本执行完成，不表示 iOS 播放通过。

## 阶段结论与恢复条件

**P0 仍阻塞；未完成 iOS 后续交付，未进入 P2–P5。** 根据 continuation plan 第 7 节“用户真机验收未通过前不进入下一步功能添加”，不能据现有结果宣布正常播放、完整界面对齐或全功能交付。

恢复需先修复实际 Jellyfin 通用代理的完整 Range 响应，再重复六项检查，并补齐 Apple 签名/设备注册生成 development/preview IPA。真机完成 MP4 连播 10 分钟、三点 seek、暂停恢复、离房重进、断线恢复、横竖屏/iPad/iPhone 安全区，以及 Android 观众同步约两秒目标；单独确定 MKV 的兼容方案。尚未验证 HLS 分片或播放器行为。

IPA/安装入口/SHA-256：无。原生构建日志：凭据初始化阶段失败，无构建 job。用户真机结论：未验收。遵守用户“成功交付再 commit”的条件，本轮未执行 git commit/push/通过标签。现有未提交工作保留，不能仅检出 HEAD 恢复本轮 Expo 工程；验收后按 continuation plan 的明确文件清单保存提交。

回退：尚无发布包需要回退；本轮修改为工作区候选。后续提交后以 git revert 和递增 buildNumber 回退，不执行 reset --hard。
