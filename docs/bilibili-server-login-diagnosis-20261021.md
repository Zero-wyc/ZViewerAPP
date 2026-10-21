# 仅登录服务端 B站后客户端无法添加：诊断记录

日期：2026-10-21。先根据用户截图只读定位，随后用户确认“如果是客户端缺陷请修复后测试”，已完成修复与双端验证。服务器与 NAS 部署未修改。

## 修复前的触发链

1. `MoviePushPanel.tsx` 的账号卡片调用 `getBilibiliLoginStatus()` 与 `getBilibiliUserInfo()`，前者请求服务端 `/api/stream/bilibili/login-status`。卡片“已登录，可解析高画质视频”表示服务端存储的当前用户 B站账号状态，不表示原生内置代理已登录。
2. `movie-source-resolver.ts:getActiveCliProxyUrl()` 在 Android 要求本机代理 `ready && loggedIn` 才返回代理地址。服务端 Cookie 不会自动同步到本机。
3. 添加入口 `handleResolve` 无本机代理时，进入 `if (!resolved)`，随即因 `isEmbeddedBilibiliHost()` 抛出截图中的“本机 B 站代理不可用，请登录 B 站或重启内置代理后重试”。其后的 `resolveBilibili(...)` 服务端请求不会执行。
4. 此拦截已存在于本次修复前提交 `559b984`，不是 2.1.7 新增；现有 `alignment-447.test.mjs` 也明确覆盖“本机代理缺失时不发服务端解析请求”。因此只登录服务端的 Android 用户，可稳定命中这一分支，完整 BV 或 `m.bilibili.com/video/BV...` 同样如此，与短链是否成功展开无关。

## 修复前与设置及播放路径的关系

普通视频的添加入口没有先检查 `bilibiliDefaultParseMode` 或影片的 CLI-only 条件，所有内置客户端一律在上述位置挡住服务端兜底。所以调整普通视频的 MP4/DASH 默认解析设置，不能消除截图中的这一错误；请求尚未发送，不能将该提示归因于服务端解析失败。

普通影片的实际播放路径 `resolveBilibiliOnline()` 则允许在 `cliEnabled=false` 或未取得本机代理时使用服务端解析。`parseOptions.ts` 也只有在本机已登录、代理就绪时才默认启用本机 CLI。这与添加入口的无条件本机限制不一致。

HarmonyOS 的 `getActiveCliProxyUrl()` 对 ready 的本机代理允许匿名路径，可能进入本机匿名解析而不是立即显示同一提示；但服务端卡片与本机状态仍是两套状态，原生解析失败仍会直接抛出，不自动改用服务端账号。不能把 Android 的触发条件原样套到鸿蒙。

明确标记为 `Movie.cliOnly=true` 或番剧/影视默认模式 `bilibiliPgcDefaultMode=cliOnly` 的内容，应继续要求各成员使用本机代理与自己的账号，不能用服务端账号绕过。

## 已实施的修复

普通 B站内容未登录本机时使用服务端账号解析。`getActiveCliProxyUrl()` 对 Android/HarmonyOS 都要求 ready 且 loggedIn，避免鸿蒙匿名代理抢占服务端账号路径；添加入口移除无条件本机拦截。`getBilibiliInputResolvePolicy()` 统一添加、预览、切画质及分 P 的 PGC CLI-only 检查；本机或强制 CLI 解析错误继续抛出，不切换账号。播放、观众与媒体包装继续使用同一 getActiveCliProxyUrl，CLI-only 在解析和 attach 前保持强制校验。

添加面板的账号卡片改为“服务端 B站账号”，退出和登录按钮也注明服务端；另显示“本机 B站账号”及当前解析来源。试看提示改为“当前解析账号”，避免将服务器结果误称为本机账号结果。服务端 DASH 的房主画质选择保留共享 Select，仅在实际使用已登录本机 CLI 时展示 NativeQualitySelect。

215 项适配与 4 项媒体回归通过。两端分别确认本机未登录，使用隔离服务端的登录状态与解析响应夹具，经真实鉴权、房间和影片 REST 完成短链解析、720P 切换、P2 选择和添加；普通播放从服务端重新解析并解码。CLI-only 未登录阻断、已登录本机权限失败不得服务端兜底由回归用例覆盖。原生账号隔离方式、构建和验收边界见 [2.1.7 验证记录](client-2.1.7-validation.md)。

本次没有在反馈用户的线上账号下解析，也未核对其私有服务器配置；该缺陷的直接来源已由源码与回归确认。原生验证采用隔离 B站 API 夹具，不冒充真实线上 B站账号或 NAS 验收。
