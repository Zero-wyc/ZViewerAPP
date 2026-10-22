# Android / HarmonyOS 2.1.10 内网连接修复验证

日期：2026-10-22（Asia/Shanghai）。最终版本为 **2.1.10 / versionCode 220**。

## 问题与原因

用户截图显示完整 `http://IP:端口` 已被确认，游客登录仍报“无法连接服务器，请检查地址、网络或跨域设置”。源码中地址探测允许原生 HTTP 请求兜底，但登录、REST 和房间连接仍走网页直接请求；原生探测成功并不能保证 WebView / ArkWeb 的跨域、明文和内网请求路径可用。

另在 Android 原生宿主复现：自动模式开启证书例外后，向 HTTP 端口建立 TLS 的私有通道产生 502，旧逻辑把它当成服务器业务响应，停止 HTTP 候选。部分服务器直接关闭/重置 TLS 握手时，原生探测还可能仅返回一般网络错误。

## 修复范围

- Android Go 与 HarmonyOS ArkTS 为 HTTP 地址提供当前服务器专用的随机回环通道，统一承载公开设置、账号/游客登录 POST、Cookie、REST、Socket.IO/WebSocket、流式和 Range 请求。
- HarmonyOS 明文上游使用 `TCPSocket`，证书例外 HTTPS 上游使用 `TLSSocket`；分别按 SDK 参数格式发送。共享映射补齐 `ws:`，逻辑服务器 URL 持久化，回环 URL 不写入会话或房间广播。
- 证书通道 502 会追加无凭据原生诊断；TLS 握手直接断开等不确定失败，仅在同端口的 HTTP 公开接口返回有效 ZViewer 设置时确认 HTTP。证书错误、真实 401/403/502 或无有效 HTTP 证据时不降级。
- 登录复用已经确认的地址和通道，改地址、连接模式或证书选项后重新检测；断开和切服清理旧监听、连接与 Cookie。保留常规 HTTPS 验证和既有最低系统要求。

## 用户指定的本地真实服务端验收

按“拉起本地服务端，纯 IP:端口、自动模式并忽略证书，进入 HTTP / HTTPS 房间”的要求执行。

从 `ZViewer-source code/backend/src/index.ts` 所在的当前本地服务端源码重新编译，使用原始启动入口运行两个独立实例。数据库、测试账号、上传目录、证书和日志均隔离到本机测试目录；没有连接 NAS SSH 或修改部署。HTTP 与 HTTPS 都加载真实认证、房间 REST、Socket.IO 及准入处理器，未用模拟登录接口替代。

| 最终 220 Debug 宿主 | 仅输入的地址 | 连接选项 | 实际选择 | 登录、Socket、实际进房 |
| --- | --- | --- | --- | --- |
| Android API 37 | `192.168.100.203:14581` | 自动 + 证书例外 | HTTP | 通过 |
| HarmonyOS API 26 | `192.168.100.203:14581` | 自动 + 证书例外 | HTTP | 通过 |
| Android API 37 | `192.168.100.203:14582` | 自动 + 证书例外 | 自签名 HTTPS | 通过 |
| HarmonyOS API 26 | `192.168.100.203:14582` | 自动 + 证书例外 | 自签名 HTTPS | 通过 |

每组均由实际登录页检测地址，再提交账号密码；确认登录请求使用原生通道、Socket.IO 握手成功，并收到实际房间准入成功后的 `zviewer:room-ready`。Android 作为房主、HarmonyOS 作为观众同时位于同一房间；HTTP 与 HTTPS 的房间 REST 均报告 `sharerOnline=true`、`viewerCount=1`，两端查询一致。进房截图已目视确认。

HTTPS 使用服务端自身生成、包含测试 IP 的自签证书；开启当前服务器例外可以正常进房，但两端独立的严格原生探测仍返回 `certificate_untrusted`，确认没有全局关闭证书验证。

## 用户提供地址的补测

以 `192.168.100.50:3333` 为真实可访问 HTTP 目标，双端分别覆盖自动模式/自定义完整 HTTP 地址、证书选项开/关的四组游客登录，以及一组账号登录，共 **10 / 10** 通过。每组均成功获取房间列表并完成 Socket.IO 握手。

为验证探测与登录不再分离，在原生宿主中受控阻断网页直接访问该 LAN 地址：旧流程可复现截图中的“地址确认成功、登录网络失败”；修复后所有上述组合仍通过原生通道成功。该受控复现验证了请求路径问题，不把它表述为已抓取用户实体手机的底层网络错误原因。

## 自动化、构建与安装包

| 检查 | 结果 |
| --- | --- |
| `npm run test:adaptation` | 249 / 249 通过 |
| `npm run test:media` | 4 / 4 通过 |
| Go `go test ./...` | core / mobile 通过 |
| TypeScript / Vite、`android:sync`、`harmony:web` | 通过 |
| Android Go AAR | 本次修改已重建 ARM64 / x86_64 |
| Gradle Debug / 签名 Release | 2.1.10 / 220 通过 |
| Hvigor Debug / 签名 Release | 2.1.10 / 220 通过 |

定向回归覆盖无凭据探测、TLS 直接断开后的 HTTP 证据、证书/业务错误保留、取消选择、HTTP 登录 POST 与路径前缀、HTTP/TLS Cookie、Range、流式撤销、WebSocket 双工与关闭、同源重定向，以及 ArkTS 关闭事件先于末段消息时的完整转发。

最终目录为 `release/client-v2.1.10/`：

| 资产 | 大小 | 验证 |
| --- | --- | --- |
| `ZViewer-Android-2.1.10-release.apk` | 76,761,865 字节 | apksigner v2 通过；aapt 确认 2.1.10 / 220；33 个网页资源与同步目录一致 |
| `ZViewer-HarmonyOS-2.1.10-release.hap` | 14,303,171 字节 | hap-sign-tool verify-app 通过；module.json 确认 2.1.10 / 220、debug=false；31 个网页资源与同步目录一致 |
| `SHA256SUMS.txt` | 最终构建完成时每包仅计算一次 | 发布复用保存摘要，不重复计算或下载校验 |

本机忽略证据位于 `.ui-validation/lan-connection-20261022/`：最终 `local-native-results.json`、四张协议/宿主进房截图、`native-results.json`、`certificate-scope.json`、版本记录、构建与包检查日志。真实服务端编译与隔离数据位于工作区 `tools/lan-connection-20261022/`；测试身份、签名配置、证书私钥和 Agents.md 不进入发行源码。

## 范围与发布状态

本轮完成最终 220 Debug 包的真实 Android WebView / HarmonyOS ArkWeb 模拟器进房验收，以及正式签名 Release 包静态检查。用户实体手机，尤其 HarmonyOS API 23 实机的网络策略仍需安装后复测；未将本次连接验收扩大为所有实体设备、媒体播放或语音验收。iOS 不修改、不构建、不发布。

源码与正式 Release 发布待最终确认。发行目标为 main / `client-v2.1.10`，标题 **ZViewer-Client V2.1.10**，发行资产仅 APK、HAP、`SHA256SUMS.txt`，使用 GitHub 自动源码归档。

发行说明：[2.1.10](releases/client-2.1.10.md)。目标 Release：[client-v2.1.10](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v2.1.10)。
