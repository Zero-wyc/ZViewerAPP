# HarmonyOS 0.1.0 build 4 — H3 实时音频检查点

- 被测代码基线：`3d83135`；测试日期：2026-09-29。
- 主测试设备：Pura 90 Pro 手机模拟器，HarmonyOS API 26。平板留到项目收尾。
- 服务端：用户提供的 Test1 房间。账号与地址不进入仓库或日志。

## 修改

- 语音加入时向系统申请麦克风权限；ArkWeb 只允许 `https://zviewer.local` 的音频捕获请求，拒绝其他来源与资源类型。
- 原生权限拒绝会返回网页层，允许再次尝试；仅由用户点击加入语音触发授权。
- 加入真实 FLV 样本与浏览器播放回归，覆盖附着、出画与释放。

## 验证

| 检查 | 结果 |
| --- | --- |
| `npm test` | 6/6 通过 |
| `npm run test:e2e` | 42/42 通过，含语音拒绝/迟到授权、模式切换、WebRTC 收流和 FLV 播放 |
| `npm run harmony:web`、Hvigor `assembleHap` | 通过；包仍未配置发布签名 |
| build 4 覆盖安装与启动 | Pura 90 Pro 模拟器通过，保留已有会话 |
| Test1 语音 | 系统授权后显示 1 人在线；静音、收起面板并重开保持状态；断开后回到未连接 |
| 后台恢复 | 测试时 Test1 被外部关闭，回到前台显示“房间已关闭”；结果不具有判定性 |

来电、蓝牙切换与后台持续通话尚无设备证据；一起听和 WebRTC 的设备端声画也未完整验收。因此此版为 H3 检查点，不标记 H3/H4 完成。H4 本机 B 站账号与代理尚未包含在此包中。

## 安装包与回滚

- 调试包：`ZV-HarmonyOS/entry/build/default/outputs/default/entry-default-unsigned.hap`；`versionCode=4`。
- SHA-256：`F4FA45017180F1F53C23B7002436616C5959BFF463A91BB3C419B9F004166984`。
- 该包仅供模拟器开发测试；回滚到 `3d83135` 可重新构建 build 3。
