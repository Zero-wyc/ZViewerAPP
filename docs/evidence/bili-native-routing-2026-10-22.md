# B站 native 分支与分 P 证据（2026-10-22）

本轮 NAS 4.7.4，WATCH 房间中 iPad 为站点 root 房主、iPhone 为另一站点账号观众。两台均为 Simulator；NAS 身份与各自 B站身份分开核对。受测公开普通视频 BV19E411D78Q，P1 CID1475633911，P2 CID1475635389。

主任务实际确认 iPad 服务器 DASH 与 phone 本机 CLI DASH 起播；P1 两条分支均返回实际 QN64、AVC + AAC、audioSlaves=1。随后通过 iPad 原生 UI 切到 P2，两个分支均收到 CID1475635389 / currentPage2；主任务目视 iPad P2 画面。phone P2 的解析日志不单独代替其画面证据，也不由 audioSlaves=1 推断听感或音频持续性。

下面仅摘录 Metro11 的解析分支事件，不含签名 URL、token、Cookie 或本机能力代理路径。它们证明使用的实际分支、格式、P / CID / QN 与 source slave 数；后续原生帧、音轨解码、时钟、暂停 / seek / rate、前后台、切回 P1 和跨来源串扰须分别补证。UI / 会话后续修订后的最终干净回归也尚未由本文件证明。

```jsonl
{"event":"resolved-source","branch":"server","format":"mp4","currentQn":64,"cid":1475633911,"currentPage":1,"audioSlaves":0,"serverApi":true,"localLoopback":false}
{"event":"resolved-source","branch":"local-cli","format":"dash","currentQn":64,"cid":1475633911,"currentPage":1,"videoCodec":"avc1.640028","audioCodec":"mp4a.40.2","audioSlaves":1,"serverApi":false,"localLoopback":true}
{"event":"resolved-source","branch":"server","format":"mp4","currentQn":64,"cid":1475633911,"currentPage":1,"audioSlaves":0,"serverApi":true,"localLoopback":false}
{"event":"resolved-source","branch":"server","format":"dash","currentQn":64,"cid":1475633911,"currentPage":1,"videoCodec":"avc1.640028","audioCodec":"mp4a.40.2","audioSlaves":1,"serverApi":true,"localLoopback":false}
{"event":"resolved-source","branch":"server","format":"dash","currentQn":64,"cid":1475633911,"currentPage":1,"videoCodec":"avc1.640028","audioCodec":"mp4a.40.2","audioSlaves":1,"serverApi":true,"localLoopback":false}
{"event":"resolved-source","branch":"local-cli","format":"dash","currentQn":64,"cid":1475635389,"currentPage":2,"videoCodec":"avc1.640028","audioCodec":"mp4a.40.2","audioSlaves":1,"serverApi":false,"localLoopback":true}
{"event":"resolved-source","branch":"server","format":"dash","currentQn":64,"cid":1475635389,"currentPage":2,"videoCodec":"avc1.640028","audioCodec":"mp4a.40.2","audioSlaves":1,"serverApi":true,"localLoopback":false}
{"event":"resolved-source","branch":"local-cli","format":"dash","currentQn":64,"cid":1475635389,"currentPage":2,"videoCodec":"avc1.640028","audioCodec":"mp4a.40.2","audioSlaves":1,"serverApi":false,"localLoopback":true}
{"event":"resolved-source","branch":"server","format":"dash","currentQn":64,"cid":1475635389,"currentPage":2,"videoCodec":"avc1.640028","audioCodec":"mp4a.40.2","audioSlaves":1,"serverApi":true,"localLoopback":false}
```
