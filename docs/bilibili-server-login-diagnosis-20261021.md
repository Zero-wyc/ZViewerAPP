# 仅登录服务端 B站后客户端无法添加：诊断记录

日期：2026-10-21。根据用户截图与本地源码检查；本项按“先找问题”处理，不修改账号路由，不连接 NAS SSH，不改服务端设置。

## 已确认的触发链

1. `MoviePushPanel.tsx` 的账号卡片调用 `getBilibiliLoginStatus()` 与 `getBilibiliUserInfo()`，前者请求服务端 `/api/stream/bilibili/login-status`。卡片“已登录，可解析高画质视频”表示服务端存储的当前用户 B站账号状态，不表示原生内置代理已登录。
2. `movie-source-resolver.ts:getActiveCliProxyUrl()` 在 Android 要求本机代理 `ready && loggedIn` 才返回代理地址。服务端 Cookie 不会自动同步到本机。
3. 添加入口 `handleResolve` 无本机代理时，进入 `if (!resolved)`，随即因 `isEmbeddedBilibiliHost()` 抛出截图中的“本机 B 站代理不可用，请登录 B 站或重启内置代理后重试”。其后的 `resolveBilibili(...)` 服务端请求不会执行。
4. 此拦截已存在于本次修复前提交 `559b984`，不是 2.1.7 新增；现有 `alignment-447.test.mjs` 也明确覆盖“本机代理缺失时不发服务端解析请求”。因此只登录服务端的 Android 用户，可稳定命中这一分支，完整 BV 或 `m.bilibili.com/video/BV...` 同样如此，与短链是否成功展开无关。

## 与设置及播放路径的关系

普通视频的添加入口没有先检查 `bilibiliDefaultParseMode` 或影片的 CLI-only 条件，所有内置客户端一律在上述位置挡住服务端兜底。所以调整普通视频的 MP4/DASH 默认解析设置，不能消除截图中的这一错误；请求尚未发送，不能将该提示归因于服务端解析失败。

普通影片的实际播放路径 `resolveBilibiliOnline()` 则允许在 `cliEnabled=false` 或未取得本机代理时使用服务端解析。`parseOptions.ts` 也只有在本机已登录、代理就绪时才默认启用本机 CLI。这与添加入口的无条件本机限制不一致。

HarmonyOS 的 `getActiveCliProxyUrl()` 对 ready 的本机代理允许匿名路径，可能进入本机匿名解析而不是立即显示同一提示；但服务端卡片与本机状态仍是两套状态，原生解析失败仍会直接抛出，不自动改用服务端账号。不能把 Android 的触发条件原样套到鸿蒙。

明确标记为 `Movie.cliOnly=true` 或番剧/影视默认模式 `bilibiliPgcDefaultMode=cliOnly` 的内容，应继续要求各成员使用本机代理与自己的账号，不能用服务端账号绕过。

## 建议修复边界（尚未实施）

普通 B站内容在未登录本机时允许明确使用服务端账号解析；本机已登录时继续按本机偏好，权限错误不悄悄切账号。添加、预览、切画质、分 P、正式播放、重载和观众路径应共用同一来源选择规则。账号卡片分别注明“服务端账号”和“本机账号”，显示当前实际使用的解析来源。CLI-only 仍在解析和播放前强制校验本机账号，不开放服务端兜底。

尚未核对反馈用户的线上服务端配置，也未在其账号下发起解析；上述结论依据截图的精确错误文案、既有源码分支与回归用例，足以确定该提示的直接来源。服务器其他权限或配置是否还会产生后续问题，需要在普通视频请求能够到达服务端后再检查。
