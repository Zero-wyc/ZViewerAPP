# HarmonyOS 0.1.0 build 14 — H5 发布候选

- 测试日期：2026-09-29。
- 代码基线：`2257dc1` 加本次 1080P 高码率代理修复。
- 主测试设备：Pura 90 Pro 手机模拟器，HarmonyOS API 26；按约定平板测试留到项目收尾后由用户进行。
- 服务端：用户提供的 Test1 房间；账号、Cookie 与服务器凭据未写入仓库或测试日志。

## 本次修复

- 清理 B 站高码率备用地址中的 `nbs` 查询参数。该参数会使相关 CDN 明确拒绝 Range 请求并返回 403。
- 修复 ArkTS 流式代理的事件时序：缓存先于 `headersReceive` 到达的数据块，在响应头确认后按原顺序转发，避免每个 DASH Range 片段丢失开头约 1–4 KB。
- 拒绝带 CDN `deny-reason`、缺少 `Content-Range` 或返回文本/XML 的伪媒体响应，并在内容长度不完整时中止该节点。
- `versionCode` 提升到 14。

## H3–H5 验证结果

| 检查 | 结果 |
| --- | --- |
| MP4、MKV、字幕、弹幕、房主切换片源 | 用户此前已验收通过 |
| B 站扫码登录与账号恢复 | 用户已确认登录成功；覆盖安装后会话仍保留 |
| B 站画质列表 | 自动最高、1080P 高码率、1080P、720P、480P、360P 均可选择 |
| 1080P 高码率 | 手机模拟器真实声画播放通过；时间从 00:00 持续前进，并成功 seek 到 01:54 |
| DASH Range 完整性 | 修复后 262144/262144 字节完整转发，后续视频与音频分片长度均与 CDN 声明一致 |
| `npm test` | 6/6 通过 |
| `npx playwright test tests/native-bilibili.spec.ts` | 8/8 通过 |
| `npm run harmony:web` | 通过 |
| Hvigor debug `assembleHap` | 通过；无 ArkTS 编译错误 |
| build 14 覆盖安装与启动 | Pura 90 Pro 模拟器通过 |

H3 语音与后台恢复、H4 B 站登录/画质/播放，以及 H5 的共享层和原生构建回归均已完成手机模拟器验证。来电、蓝牙、平板适配与实体设备专项测试未在本轮重复执行，按用户约定留作后续补充。

## 候选包与签名状态

- unsigned HAP：`ZV-HarmonyOS/entry/build/default/outputs/default/entry-default-unsigned.hap`
- SHA-256：`0FF1DFE4BC4035431067DE9E0552F820558FC888754B1F6141A733D18324E15B`
- 工程当前未配置 `signingConfigs`；正式签名和发布由用户后续完成。
- 回滚基线：`2257dc1`。覆盖升级时继续递增 `versionCode`，不依赖降级安装。
