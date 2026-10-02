# Android B 站高画质播放修复

日期：2026-10-01。用户反馈原房间中的 B 站视频无法正常播放，随后要求用新房间、其他高画质视频排查。使用已运行的 Android 模拟器、adb 和 WebView CDP 复现，测试房间为“安卓高画质排查 10-01”。

## 原因与改动

问题发生在 `native/bilicore/mobile/mobile.go` 的本机媒体代理。新房间从零播放同一视频也出现首帧长时间等待、播放约 20 秒后停滞，因此跳转不是复现的必要条件。

1. B 站音轨返回慢速 `mcdn.bilivideo.cn` 主节点；代理原先按主节点、备用节点顺序逐个尝试，备用列表还含同一主地址。每个分片可能重复等待 10 秒响应头超时，音频跟不上已下载的视频，播放器无法继续推进。
2. 解析返回 `*.mountaintoys.cn` 边缘节点，但本机白名单只覆盖 bilivideo 域名。另一部视频进一步复现 HTTPS 4483 端口被拒绝：代理在访问同轨备用 CDN 前就返回 `unissued media URL` 的 403。

修复对同轨候选 URL 去重，优先使用解析结果中的普通 CDN，然后边缘节点，最后 mcdn。补齐 mountaintoys 子域、B 站精确 Akamai 节点，以及仅限 HTTPS mountaintoys 的 4483 端口。继续要求 URL 来自当前账号会话的解析登记；其他域名、伪造后缀、用户信息和非允许端口仍被拒绝。媒体请求不发送账号 Cookie，保留 Range、206、Content-Range、完整响应体和取消语义。此次通过备用 CDN 获取相同画质的流。

## 验证

- 同一视频 `BV16vaZ6jEFh`：1080P+（qn 112）、H.264/AAC，约 2 秒开始播放；连续采样 37.8 秒，播放从 0.09 秒推进至 35.40 秒，readyState 始终为 4，缓冲至 61.04 秒。记录的 36 个媒体请求全部为 206，响应头耗时最高 400 毫秒。
- 另一部视频 `BV1GJ411x7h7`：初始手动 1080P 解析返回 qn 80，实际前端自动最高解析为 qn 112（1080P+），H.264/AAC。补齐端口后约 2 秒已 readyState 4；继续播放采样 41.7 秒，从 27.07 秒推进至 66.74 秒，缓冲至 95.12 秒，所有采样 readyState 4、无 seeking 或 MediaError，记录的 18 个媒体请求全部为 206。
- 已返回原房间，以观众身份恢复原视频。此时房主进度已到片尾 1668.74 秒；约 4 秒完成对应位置的缓冲与定位，readyState 4、seeking false。原房间没有剩余播放时段，故持续播放验证采用上述排查房间的两部真实高画质视频。
- Go 回归测试覆盖候选去重及失败切换、已登记 4483 边缘地址使用普通备用 CDN、12 MiB Range 完整传输、Cookie 隔离和未登记 URL 拒绝；`go test ./mobile ./core` 通过。
- Gradle `assembleDebug` 成功；调试 APK 已覆盖安装到当前模拟器，原生 B 站账号保留。

本机原始脚本和脱敏采样位于工作区 `.codex-android-421/`。仅创建并修改排查房间的测试片单。

## APK

路径：`ZV-Android/app/build/outputs/apk/debug/app-debug.apk`，大小 58575507 字节。

SHA-256：`da60b4e84ceea0f47edf53bf7e18a2dab9d9339e2049a08833ce8d505228dc95`。
