# Android / HarmonyOS 1.7.6 对齐与布局验证

日期：2026-10-13。双端 **1.7.6 / 176**，依据 [v4.5.3 更新方案](安卓鸿蒙对齐服务端v4.5.3更新方案-2026-10-13.md)。上游 main 已通过 GitHub 接口复核为 `9e2a0d4f3d9796067ac17274feabeccbb065d411`。这是本地签名构建，尚未发布 Release；本轮没有修改 iOS 或操作 NAS。

## 已实施

- 默认音乐音量读取公开设置 `roomDefaultMusicVolume`，缺省 50%；有效本地音量优先，无效记录回退。晚到设置、切服、静音、预载升格和手调存储失败保护保留。
- FM 候选/历史/模式迁入共享房间会话；房主入队确认后切曲，8 秒 ack 超时明确失败。自然结束和播放器/系统媒体下一首补拉新候选；页面切换继续。普通曲目/B站插播、模式切换、暂停、拖动、离房/断连/销毁取消旧请求结果，旧空响应也不触发跨会话默认源请求。显式单曲循环、普通队列、B站推荐续播及现有本机解析/连接映射保留。
- 鸿蒙实际 ArkTS WBI 重排与 Go 固定向量一致，规范化签名和实际查询共用；Android 重生成 AAR，包含此前 Go WBI 与 UGC 响应形状修复。
- B站影片搜索使用按行排列的自适应网格，缩小封面，随弹窗实际宽度增加列数；标题、UP 名、播放/弹幕数、分 P 与分页保留。

## 验证结果

| 项目 | 实际结果 |
| --- | --- |
| 适配回归 | `npm run test:adaptation`：69/69；其中新增音量/FM/WBI/旧会话回退 13 项 |
| 媒体回归 | `npm run test:media`：4/4 |
| Android 核心 | `go test ./core` 通过；用本机 Go 1.26.8 重生成 AAR，Gradle 实际执行 buildBilibiliCore |
| 共享构建 | TypeScript/Vite、android:sync、harmony:web 通过；生成资源不手改 |
| 搜索响应式 | 320×568、360×800、393×852 两列；852×393、768×1024 四列，深浅主题及普通/展开各一次，共 20 组，无页面或网格横向溢出；顺序与接口一致，16:9 封面和分 P 回填正常 |
| FM 自然结束 | 实际浏览器 Audio 播放 0.6 秒 WAV；6 个浏览器可信 ended，对应 6 首不同歌曲，跨批次补拉；中途切离/重挂 FM 页面持续；确认 ack 后才切曲 |
| 权限/竞态 | 普通曲、离房/模式/用户操作取消旧请求、失去控制权、入队拒绝、空候选、重复/历史去重、100 首历史上限；浏览器房主转观众拒绝启动、迟到 ack 不覆盖暂停 |
| 音量 | 0/35/100、有效本地 0/1、无效记录、旧服务端缺字段、503 失败、安全 50% 回退、迟到设置及 localStorage 写入失败；8 组浏览器场景，另有纯逻辑向量 |
| 原生构建 | Android Gradle Debug/Release 与 HarmonyOS Hvigor Debug/Release 成功；鸿蒙 ArkTS 编译包含实际 WBI helper |
| 签名/包含性 | APK 签名与 1.7.5 证书一致，清单 1.7.6/176；HAP 签名/摘要及既有证书链一致，AppScope 1.7.6/176；双端包内各 29 个共享网页文件逐一摘要比对一致，鸿蒙独立校验生成桥接入口；无公告实现或 AGENTS.md |

浏览器 FM 场景使用模拟网易云候选、短 WAV 与 Socket ack 夹具，**未使用真实网易云账号/VIP音源，也未把模拟 ack 作为真实服务端入队或数据库证明**。本轮 adb/hdc 没有连接设备，未执行新包安装、原生搜索/UGC/PGC在线解析、真实后台/息屏/锁屏/蓝牙/语音路由或安卓↔鸿蒙观众同步专项；这些保留为用户设备验收项。历史 1.7.5 的设备结论不转用为 1.7.6 验收。现有构建输出中的 mediabunny 动态导入、dash.js ESM 和体积提示为既有警告。

原始测试、截图与签名/资产证据在忽略目录 `.ui-validation/align453/`。测试夹具、账户/日志和私有签名材料不加入源码。

## 本地安装包

目录：`release/client-v1.7.6/`，内含签名 APK、HAP、SHA256SUMS.txt。当前没有推送或发布 GitHub Release。

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| ZViewer-Android-1.7.6-release.apk | 43169563 | `8343f29dcfc3f15a8afdf2cd53264bd9185cd1fbd9814091da76c53cbfa6bae4` |
| ZViewer-HarmonyOS-1.7.6-release.hap | 14181682 | `95ce517a5b311da4ea530ba842a22c52ca1237d3be163ef92ed6c45ead89d8a8` |

维护入口：[Android](android-maintenance-architecture.md)、[HarmonyOS](harmonyos-maintenance-architecture.md)。
