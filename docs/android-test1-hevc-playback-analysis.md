# Test 1 房间 HEVC 黑屏排查

日期：2026-10-01。环境：现有 Android 模拟器、当前 1.2.1-debug APK、Test 1 房间。此次完成原因定位与对照测试，未修改播放器代码或正式房间片单。

## 结论

两部视频均为 1920×1080 的 HEVC/H.265 Main 10、10 位 `yuv420p10le`。当前模拟器的 Android WebView 不支持该视频配置。音轨可播放或转成 AAC，所以 HLS 路径会出现进度推进而画面宽高为 0；playsvideo 路径则拒绝加载，报 `Playback selection failed` / `hls-video-unsupported`。

这不是对所有 H.265 的判定：同一 WebView 对测试的 HEVC Main 8 位 MIME 返回支持，对 Main 10 返回不支持。playsvideo 的视频管线为直通重封装，专用 FFmpeg 包用于音频转码，不能把不支持的 HEVC 视频转成 H.264。

## 服务器视频

| 影片 | 原文件视频 | 原音轨 | 代理与 HLS 验证 |
| --- | --- | --- | --- |
| 白圣女与黑牧师 S01E01，movieId 163 | HEVC Main 10、1080P、10 位 | FLAC、48 kHz、双声道 | 原 MKV Range 返回 206；Jellyfin `at=1` 返回的真实 TS 分片仍为 HEVC Main 10，音轨变为 AAC。 |
| 杜鹃的婚约 S02E02，movieId 165 | HEVC Main 10、1080P、10 位 | AAC、44.1 kHz、双声道 | 原 MKV Range 返回 206；playsvideo 成功 demux，随后报 `hls-video-unsupported`。`at=1` 的 TS 分片仍为 HEVC Main 10。 |

HLS 检查记录了实际视频 codec `hvc1.2.4.H123.B0` / `hvc1.2.4.L120.B0`，以及 `bufferAddCodecError`、`bufferAppendError` 的致命媒体错误。下载与容器解析成功不能证明视频解码成功。

现有 Jellyfin `/resolve`、`/proxy`、`/stream` 音频转码路线仅设置 AAC 等音频参数，未按当前客户端的视频能力请求兼容编码。在独立诊断流中追加 H.264 参数的尝试仍返回 HEVC，不能把它记为已修复；实际需要确认 Jellyfin 最终输出的编码，或实现支持该配置的其他视频解码路径。

## 本地源码服务器对照

从 `ZViewer-source code` 构建并运行后端，使用独立配置和数据库，监听 3421。通过只读根目录访问用户视频，未改写原文件。测试后恢复模拟器原服务器与房间会话，并关闭临时服务器。

| 用户文件 | 实际编码 | 当前 APK 实测 |
| --- | --- | --- |
| `C:\Users\FredQ\Videos\S01E04.mp4` | H.264 High、8 位、AAC、1080P | 正常画面 1920×1080；推进至 15.83 秒，解码 383 帧，readyState 4。 |
| `C:\Users\FredQ\Videos\S01E01.mkv` | HEVC Main 10、10 位、Opus、1080P | demux 成功；`hls-video-unsupported`，视频宽高与帧数为 0。 |
| `C:\Users\FredQ\Videos\白圣女与黑牧师 - S01E02 - 第2集.mkv` | HEVC Main 10、10 位、FLAC、1080P | demux 约 133 毫秒完成，时长 1421.1 秒；同样报 `hls-video-unsupported` / `no-supported-option`，15 秒采样没有视频帧。 |

记录和脱敏诊断脚本位于工作区 `.codex-android-421/`：`test1-local-results.json`、`test1-same-hevc-results.json`、`test1-diagnosis.json`、`test1-h264-*-results.json`。局部 MKV 头部和 TS 分片仅用于 ffprobe 诊断。

## 后续处理范围

要在该模拟器播放这些文件，需要把视频实际转为支持的编码（例如 H.264 8 位），或提供能解码 HEVC Main 10 的视频播放实现。仅改变 MKV/MP4 容器、转音轨、重载或启用现有 playsvideo 开关无法补足视频解码能力。真机的 HEVC Main 10 支持需按实际设备确认。
