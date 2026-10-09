# 服务端修复 PR #11

已提交：[Zero-wyc/ZViewer #11](https://github.com/Zero-wyc/ZViewer/pull/11)。上游提交 e869d972aa79b9d5d69311688750754590d2667c，7 个文件，维护者分支编辑关闭。以下为提交说明。

浏览器作为房主时，设置中已允许管理影片的普通用户在 Android/鸿蒙 App 点击切片，可能收到“无权限播放影片”；即使服务端接受选择，浏览器房主仍会继续广播旧影片。Kazumi 多级 HLS 则会把相对子清单/分片解析到服务端代理路径，导致播放失败。

## 问题与修复

1. **权限矩阵读取失败**：`canViewerPerform` 使用 `findOne({ order: ... })`，没有提供 `where`。当前 TypeORM 会抛出 selection conditions 错误，随后被 catch 转成 null，普通用户已勾选的 `manageMovie` 权限因此无效。补上空 where 条件，保留原有角色和权限校验，未授权用户仍被拒绝。
2. **浏览器房主忽略切片事件**：已有 currentMovieId 时，房主会忽略所有 `current-movie` 事件。改为只忽略恢复期间的残留 null，接受服务端校验通过的非空选择，让房主加载并广播新片源。
3. **切回原影片误恢复旧进度**：切片会重挂载播放器，但页面始终传入首次进房的 recoveredPlayback。改为仅初次挂载传递恢复记录，防止切回原影片时跳回旧时间并暂停。
4. **Kazumi HLS 代理基址错误**：支持识别 Kazumi、AniSubs 和通用代理；从 url 参数还原上游清单基址。按 hls.js 的 response/stats/context/networkDetails 回调顺序恢复 URL，子清单、分片、map 和密钥沿用原代理及防盗链参数，包括显式空 Referer。避免重复代理自身 API，逐请求补齐本机认证；客户端 token 不复制到上游媒体地址。

## 验证

- 本地运行服务端，设置中开启 Kazumi，浏览器房主 + 已授权普通用户 App 观众。
- Kazumi MXdm《成神之日》1、2、3 集：Android WebView、HarmonyOS ArkWeb 分别安装测试，模拟器顺序运行。主清单、相对子清单和分片返回 200，1280×720 视频解码帧和播放时间持续增加；观众切片后浏览器房主加载对应新集。
- 回归“第三集 → 第一集 → 第二集 → 第三集”，切回原影片不再恢复首次进房的暂停进度。
- `npm run build -w backend`、`npm run build -w frontend` 通过。
- `node --test backend/scripts/test-room-permission.cjs`：1 项通过，使用真实 TypeORM/sql.js 验证允许、显式拒绝、guest 拒绝及权限变更。
- `node --test frontend/scripts/test-watch-kazumi.mjs`：4 项通过，覆盖实际 loader、回调顺序、嵌套清单/分片/密钥、认证边界、房主事件和恢复记录；使用 Node.js 24。
- 客户端同步适配后的 31 项适配测试、4 项媒体回归及双端构建通过。客户端代码属于独立仓库，不包含在本 PR 中。

生产 NAS 未修改。设备测试范围是模拟器；尚未覆盖物理设备、iOS 或所有第三方线路。第三方 CDN 自身的 403 不属于此次代理路径修复。
