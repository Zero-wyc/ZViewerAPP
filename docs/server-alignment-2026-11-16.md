# Android / HarmonyOS 服务端与内置 CLI 对齐（2026-11-16）

## 固定基线与交付范围

本地服务端 `ZViewer-source code` 已从 `ebddfb990552b2971bbdd37b53747ce5728db9da` 快进至 GitHub main `ec0ac1530b6790e85b17936efc31d266bb6c2997`，共 57 个提交。客户端从 `6730fe445ab474c12f9f411d476efb5984dc1c98`（2.4.0 / 240）适配 Android 与 HarmonyOS，目标版本 2.5.0 / 250。所有客户端修改与 Git 操作在指定 `ZViewer-client` 仓库完成。

用户已授权更新源码、自动验证、构建和发布 Release，并特别要求升级内置 CLI 解析器。服务端仅更新指定本地源码并隔离运行测试；默认双端为 Android 与 HarmonyOS。

## 增量合同与实施映射

| 上游变化 | 双端实施与验证重点 |
| --- | --- |
| CLI 上游更新至 v5.2.1，增加解析来源与网络层行为 | 逐文件比较真实 CLI 上游与 Android `native/bilicore`、HarmonyOS `BilibiliResolver.ets` / `BilibiliLocalProxy.ets`，移植适用变更，保留移动输入、安全凭据、Cookie/TLS 与 Piik 传输；重建 Android AAR 和鸿蒙 ArkTS 原生解析代码 |
| 点播 CLI 可使用房主身份解析；`cliHost` / `skipCdnCheck` 参数和管理员许可 | 通过现有鉴权 `apiFetch` 请求服务端解析，Cookie 不下发；本机库只转发媒体。新增房主 / 本机账号选择并保留 `cliOnly` 的本机账号权限边界 |
| 直播本地 CLI 线路与中转线路、FLV 实际追帧 | 解析与媒体路由分离；每端使用自己的内置代理，保证线路切换重挂载、取消、资源清理与失败边界；移除不存在的 flv.js 配置 |
| Live2D 公共模型库、角色、表情 / 动作 / 戳一戳、动捕与语音口型 | 新增按需加载模块与移动触摸入口，复用 Socket 房间身份及全屏容器；本地偏好保存位置和大小；模型和 API 经过所选服务器传输，相机画面只在本机推理 |
| Live2D 独立公开开关、房间退出和权限策略 | 禁用时不加载渲染器；切房、断连、卸载清理订阅和采集；本地视角不写全房间位置 |
| AniSubs 全站并发聚合、去重标题与站点选择 | 默认全部站点，处理聚合来源与取消，保留移动列表及播放入口 |
| CMS / Kazumi 解析、系统出口代理、公共模型上传与安全检查 | 核对 REST 合同；通过最新本地真实服务端和相关 Go 测试验证，不把服务端修复重复移入客户端 |

## 验证与发布要求

实施后运行受影响的客户端行为回归、TypeScript 检查、生产构建和原生 Go 测试；隔离服务端使用全新数据库和回环端口。双端同步同一份最终网页资源，构建正式签名 APK / HAP，检查版本、签名延续与包内资源；最终安装包仅在构建时各计算一次 SHA256，发布复用记录。

发布前更新 Android / HarmonyOS 维护文档、版本和发行说明，审计源码排除账号、密码、私钥及 AGENTS.md。完成本地提交后同步 main 和版本标签，发布 APK / HAP / SHA256SUMS，源码使用 GitHub 自动归档。验证结果在完成后补充，实体设备与模拟 / 自动验证分别说明。

## 交付验证结果

- CLI 对齐回归已覆盖房主 / 本机解析来源、直播授权与 CDN 校验、取消清理、长连接、HarmonyOS 直播 `readTimeout=0` 和 FLV 追帧；alignment 102/102、Bilibili 79/79、live 11/11 通过。完整已记录回归为 550/550，TypeScript、Vite、Android 网页同步、HarmonyOS 网页同步、原生 Go 与 HarmonyOS Release 编译通过。
- Android 正式 APK 为 83,767,120 字节，SHA256 `2eb5c061ca73fcc9d6682d8e6bfc726ca24fb7f5a123fbfbf9cb7593bd9cd702`；v2 签名通过，证书 SHA-256 `51b892a049a1650a03dc0a3baf9406db85b9fb91267851f15ee697df2d2ccc9b`，61 个网页资源逐项匹配。
- HarmonyOS 正式 HAP 为 30,476,076 字节，SHA256 `d943056e514c62293e8a2cf5afe649d247ac51cd4f52081e94924f26218cda19`；`hap-sign-tool verify-app` 的代码签名、权限签名和 SHA-256 摘要通过，59 个网页资源逐项匹配，证书链与上一正式包一致。
- 源码审计检查 1,102 个跟踪文件和 115 个工作区文件，未命中账号、密码、私钥、凭据文件或 `AGENTS.md`。服务端 Live2D 房主离房清理修复已提交上游 PR #46，但在该 PR 合入前不作为客户端 Release 已包含的服务端 main 修复声明。
- 本轮未连接实体 Android / HarmonyOS 设备，未构建 iOS，未部署 NAS；浏览器、模拟器、原生编译和包体校验不能替代实体设备播放、摄像头、动捕、后台与长时间弱网验收。
