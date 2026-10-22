# Native opening / continuous audio / cancellation evidence

2026-10-22，第 11 轮原生构建及后续定位修订。仅记录脱敏诊断；媒体地址、认证及临时端口均不保存于仓库。

## 原因与修订

- 第 10 轮真实 iPad Simulator 冷进入暂停的小 Mux HLS，opening 后立即 stopping / stopped，无 ready / duration。官方 libVLC 的 set-pause 在输入尚不能暂停时调用 stop；同版 macOS VLCKit 小 HLS 探针复现。`ZViewerOpeningPauseGuard` 仅对 canPause 且 playing 的输入发暂停，opening 阶段保留意图。
- 真实后台音乐观众曾按约 6 秒冷却反复校时，旧定位每次先暂停约 2.18 秒再恢复。新路径只对播放中的后台音频启用，不暂停，公开 jump ACK 后等待两个后续实际递增样本。每个新样本仍以 0.5 秒限差验证，8 秒有界，回传实际时钟。
- 旧完成函数在取消前仍持有代次，可能向当前输入发暂停；持久音乐换源也未立即撤销旧定位。取消现先失效代次、摘除完成函数，再结束旧请求；stop、两层 destroy 和 replaceSource 都覆盖。

## 有界验证

生成补丁中的同一段 Swift 方法使用已安装 VLCKit 4.0.0a24 的 macOS framework 编译。本地合成 60 秒 WAV，dummy 音频输出，不访问 NAS；这是协议与实际时钟证据，不能证明可听音频或 iOS AudioSession 行为。

```text
issued actual=1074 playing=true
audio-seek target=30000 actual=31072 advancing=2 duration=1.204 success=1
progress actual=31072 elapsed=1.208 playing=true
progress actual=31766 elapsed=1.859 playing=true
progress actual=32072 elapsed=2.174 playing=true
progress actual=32765 elapsed=2.847 playing=true
result=pass pausedEvents=0
```

Swift mock 覆盖 opening pause 不停止、可暂停输入正常暂停、ACK 缓存目标不能提前通过、两个实际递增样本、取消一次结算、旧输入不能控制替代输入、被取代的暂停定位不能再暂停新音频、最新显式暂停优先。原生专项 10 / 10 通过；包含 JS 定位失败恢复、设置事务预算等共 30 / 30 通过。typecheck 与标准 expo lint 通过。

## 第 11 轮实际失败与后续 V2

iPad Simulator 自然 B站 → NCM 切歌：新曲 revision 4 于 18:53:19.925 初始化，20.337 ready / autoplay=true，20.373 迟到 paused / autoplay=true；28.393 以 `target=1 actual=7079 advancing=0 duration=8.028 success=0` 报定位失败。原因是首版仅在发 jump 之前恢复 paused，jump 后迟到暂停仍被 seek 持有者挡住。

后续 V2 在每段实际 paused 状态按最新播放意图请求一次恢复；实际已在目标 ±500ms 内的新曲不发额外 jump，但不提前完成。实际 paused 时间从验证外推中扣除；不扩大限差，不伪造回传位置。追加异步回归覆盖两条路径。V2 生产补丁已冻结，等待后续二进制 NAS 验收。

```text
case=late-pause  # 探针在 jump 后注入一次 pause
state=paused -> playing
target=30000 actual=31022 advancing=2 duration=1.159 success=1
later=31959,32026,32953 playing=true pausedEvents=1

case=near-zero  # 实际 0，目标 1ms；不发 jump
target=1 actual=1071 advancing=2 duration=1.141 success=1
later=1936,2073,2924 playing=true pausedEvents=0
```

## 尚未通过

后续二进制 Simulator 冷暂停准备、音乐观众连续校时、自然切歌及换曲取消仍需实际验收。暂停 MKV 66 的 137.207 秒虽然 clock / ACK 匹配，真实画面为灰屏；原片同位置参考帧为清晰彩色。小 Mux HLS 24.346 秒也未由当前视频帧算法稳定确认。该两项不能由此音频实测、mock 或此前整数定位替代；本轮未加入未经证实的帧刷新实验，也未恢复大电影 81 秒探针。

独立 AppKit drawable / 公开 snapshot 反证：Mux 在 jump ACK `24346`、自身成功帧回调之后暂停时钟为 `35533`，snapshot 已有画面；有界静音解码的另一轮终值为 `26633`，仍越过目标。MKV 66 在 32MiB / 45 秒读取硬限内 snapshot 仍为开头画面，自身 seek 帧回调未到且先触发读取上限，不能证明最终失败原因。snapshot 门控与静音解码均未达到目标位置和画面同时可确认的要求，未合入生产。
