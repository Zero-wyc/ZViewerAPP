# iOS 1.7.5：媒体修复与简洁搜索弹窗（源码预览）

日期：2026-10-13。本轮未启动 EAS、未生成新 IPA、未发布或推送。版本配置保持 1.7.5 / build 17；现有 build 17 安装包不包含本页修复，不能通过旧 IPA 验收这些更改。Expo Go 用于界面预览，本机 B站、VLC 和 LiveKit 仍需未来明确授权的原生构建及设备验收。

## 问题与修改

- **Jellyfin / Emby、番剧源、网易云私人漫游**：React Native 0.86.3 安装的 `abort-controller` 信号没有 `throwIfAborted()`，调用直接产生 `undefined is not a function`。统一改用 `checkAbort`，保留取消任务前后检查。媒体库单集和整季路径、番剧 HLS 与必要请求头、FM 入队后恢复真实队列身份分别抽为可验证的生产流程。Kazumi 不重复代理已经属于服务端的 `/api/` 地址。
- **普通 B站本机解析**：UGC playurl 的 `data.result` 是状态字符串 `"suee"`；旧 Go 代码盲目展开该字段，报 JSON 字符串不能解码为 map。现在只展开对象形状的 PGC envelope，保留普通视频的 DASH 数据。测试加入真实 UGC 响应形状。
- **选择后直接播放**：单 P 搜索结果点击卡片即解析、添加并请求播放；多 P / 番剧先进入选集，点击对应 P / 集即完成相同流程。显示分集加载、解析、添加及播放加载状态；失败保留链接并提供重试。添加成功而播放/刷新失败时，重试复用已创建影片，避免重复 POST。房间保存规范 B站链接与 CID，不保存本机临时代理 URL。
- **弹窗简化**：添加影片仅显示来源、链接/搜索、解析与紧凑登录卡；画质设置折叠。搜索使用独立弹窗，支持展开/还原；视频、番剧、影视由单一选择器切换，个人栏目折叠。
- **封面与响应式**：原生与服务端搜索 DTO 都保留封面、时长、作者、播放数；B站图片 HTTP 链接升级 HTTPS。网格按实际弹窗内容宽度计算 1–4 列，每列目标最小宽度 220，间距 12。图片通过跨端 `Image.getSize` 获取原尺寸并按比例计算高度，使用 contain，方向变化时重新计算宽度；16:9、9:16、1:1 封面不会统一拉成横图。
- **目录桥**：Objective-C catalog 增加 WBI `view` 元数据查询，只为选择分 P 读取信息，不先执行完整播放解析。Expo Go 普通视频搜索/元数据可用服务端合同预览，缺少原生解析时明确显示安装包要求和重试入口。

## 验证及边界

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| iOS JS 测试 | 105/105 通过 | 使用项目实际 RN AbortController，覆盖双媒体库单集/整季、Kazumi、FM、直接添加播放、取消、失败重试及封面计算 |
| 类型检查 / lint | 通过 | 修改后的完整 iOS 源码 |
| 共享 Go 测试 | 11/11 通过 | UGC 字符串状态、PGC、分 P、DASH/AAC、WBI、移动端输入与连接探测 |
| 用户视频匿名检查 | 第 1 P，CID 42512224146，qn 32，AAC mp4a.40.2 | 元数据和 playurl 使用真实网络请求及生产 Go 解析器；nav 以匿名状态模拟，无个人 Cookie；未执行 iPhone VLC 解码 |
| Jellyfin / Emby 添加界面 | 本机测试房间可添加单片，片单与成功计数更新 | 可丢弃 fixture 合同验证，不是 NAS 正片播放验收 |
| 普通 B站选择失败反馈 | 关闭搜索弹窗、保留链接、显示缺少原生模块及重试按钮 | Expo / Web 预览，没有假报播放成功 |

真实浏览器预览使用可丢弃的本机服务和几何封面测试数据，检查 12 张卡片：

| 视口 | 搜索列数 | 封面检查 |
| --- | --- | --- |
| 手机竖屏 390×844 | 1 | 横、竖、方封面均按原比例，卡片不越界 |
| 手机横屏 844×390 | 3 | 同上 |
| 平板竖屏 768×1024 | 2 | 同上 |
| 平板横屏 1366×1024 | 3（普通弹窗）、4（展开弹窗） | 同上；展开内容宽度 1279，卡片未越界 |

比例误差仅来自亚像素舍入，最大小于 0.000004。这些检查证明响应式布局与反馈，不替代 iOS 原生 Modal、图片网络、真实媒体库 Range/HLS/seek、私人漫游会员歌曲、LiveKit 跨端互听或 B站账号权限的设备验收。旧 build 17 的原生桥和 Go 二进制不会被 Expo 热更新替换。

脱敏验证摘要见 [验证 JSON](ios-follow-up-fixes-2026-10-13-validation.json)。界面截图和真实 API 诊断原始响应只保存在被忽略的本机验证目录，不将临时 CDN 签名地址发布到源码。

## 维护入口

- `src/lib/cancellation.ts`、`mediaLibrary.ts`、`animeSources.ts`、`personalFm.ts`：取消兼容与媒体提交流程。
- `SourcePicker.tsx`、`BiliCatalog.tsx`、`SourcePoster.tsx`、`BiliAccount.tsx`、`AppDialog.tsx`：简洁弹窗、分 P、搜索封面及自适应。
- `biliSelectionFlow.ts`、`movieAddition.ts`、`MoviePanel.tsx`：直接添加播放与重试去重。
- `modules/zviewer-native/ios/ZVBiliBridge.m`、共享 `native/bilicore/core/resolver.go`：目录元数据与普通视频响应修复。
- `tests/mediaRepair.test.mjs`：实际 RN 信号与业务回归。

共享 Go 修改须以本地审核提交更新 `scripts/native-core-baseline.json` 的引用和 LF 归一化摘要，再执行 `stage-native-core.cjs --verify-only`。本轮只验证来源，不启动 native build。新包授权后需更新 iOS 维护文档、检验包内来源并在指定仓库提交。
