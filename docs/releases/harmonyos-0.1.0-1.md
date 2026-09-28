# HarmonyOS 0.1.0 build 1 — H0 检查点

- 被测代码提交：`922eeca`；上一个鸿蒙验收标签：无。
- 状态：模拟器启动检查点，H0 尚未验收，用户未验收；不打发布标签。
- 工具：DevEco Studio 26.0.0.851、HarmonyOS SDK 26.0.0.105、Hvigor 6.26.8、ohpm 26.0.0.630、DevEco Node 24.14.1；查阅/测试日期：2026-09-28。
- 设备：MatePad Pro 12 与 Pura 90 Pro 本地模拟器，API 26；真机：未测试。服务端：未连接。

## 范围与结果

| 检查 | 预期 | 实际 | 结果 |
| --- | --- | --- | --- |
| `npm test` | 共享测试通过 | 6/6 通过 | 通过 |
| `npm run build` | 既有网页构建通过 | 通过，有 Vite 大 chunk 提示 | 通过 |
| `npm run harmony:web` | 生成相对资源并同步 rawfile | 通过 | 通过 |
| Hvigor `assembleHap` | ArkTS/HAP 编译通过 | 通过，生成 unsigned HAP；无 signingConfig | 模拟器可用 |
| MatePad 启动 | 本地首页渲染 | 显示连接服务器页；桥日志 `harmony` | 通过 |
| Pura 90 Pro 启动 | 手机竖屏首页渲染 | 显示连接服务器页；桥日志 `harmony` | 通过 |
| MatePad 系统返回 | 返回桌面 | 返回桌面，应用仍可重启 | 通过 |
| 真实服务器、登录、房间 | 应按 Android 1.2.1 对照 | 本次未连接服务端 | 未验收 |
| 方向/沉浸、媒体、麦克风 | H0 后续及 H1–H4 能力 | 尚未实现原生适配 | 未验收 |
| 签名/真机安装 | 签名 HAP 真机启动 | 未配置签名、无真机证据 | 阻塞 H0 验收 |

网页入口保持 Android 当前 React 界面及连接流程，未改共享业务代码。本次只验证连接页外观与本地资源加载，不代表账号、房间或媒体链路通过。

## 产物与证据

- 模拟器调试包：`ZV-HarmonyOS/entry/build/default/outputs/default/entry-default-unsigned.hap`（仓库忽略的本地产物）。
- SHA-256：`7AF744C0DFEF501B1F9DB51AB1645A0A2D2C36802470C9184741F562022DA096`。
- [MatePad 页面](assets/harmonyos-h0-matepad.jpeg)、[Pura 页面](assets/harmonyos-h0-pura90.jpeg)。
- ArkWeb 初次直接加载 `resource://` 时 ES module/CSS 遭 CORS 阻止；改用本地虚拟 HTTPS Origin 与 rawfile 拦截后，两设备均显示 React 页面。华为[白屏排查说明](https://developer.huawei.com/consumer/cn/doc/doccenter-dev-faq/faqs-arkweb-174)描述了该限制和拦截方案。

## 后续与回滚

H0 仍需原生方向/沉浸与资源能力检查，调试签名 HAP 和真机启动；随后才能验收 H1 的服务器业务链路。当前包不能作为正式或真机安装包。用户验收结论：待测试。

如需撤销本次宿主代码，用 `git revert 922eeca` 产生回滚提交，再重新执行网页与 Hvigor 构建；后续覆盖升级须递增 `versionCode`。本检查点无已通过的鸿蒙标签可供回退。
