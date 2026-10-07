# Android / HarmonyOS 1.7.0 适配交付

日期：2026-10-07。版本：**1.7.0 / 170**。用户确认双端真机验收通过后，授权上传 `Zero-wyc/ZViewerAPP` 并发布 `client-v1.7.0`。正式 APK/HAP 保持已验收构建不变，补充文档后提交发布源码与 SHA-256；未部署生产服务端，iOS 不在本轮范围内。

## 用户真机验收与发布

2026-10-07，用户确认“真机验收通过，上传GitHub仓库并发布Release版本”。据此记录双端本版真机验收通过。用户未逐项提供设备型号和场景日志，不将这条确认扩写为各账号、编码、网络与外设组合的独立测量证据。下方自动验证和模拟器统计保留原始范围。

发布地址：[client-v1.7.0](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v1.7.0)。附件固定为正式签名 APK、正式签名 HAP、提交源码 ZIP 和 `SHA256SUMS.txt`，不包含 APP 归档。发布前复核远端附件大小/摘要，发布后核对 main、标签、latest 与附件。

## 基线与交付物

- 指定仓库：`E:/Codex-bulid/ZViewer/ZViewer-client`，从 `e9106e914cb15b487ef4f5c18f73f00695265681` 增量修改。
- 目标上游：`ba033096bc9c3a85a2058918a002b80a5f484ec8`，采用 2026-10-07 方案中已经核验的源码快照。这里的“最新”指该方案的固定目标，没有将后续远端变动自动混入交付。
- 按映射合并共享代码，保留移动端增强；没有运行旧 `import-core.mjs`，没有覆盖 iOS 工程。
- 本地目录：`release/client-v1.7.0/`。正式签名 APK、正式签名 HAP、发布提交后的源码 ZIP、`SOURCE-COMMIT.txt`、`SHA256SUMS.txt` 和脱敏 `evidence/` 同目录保留。`SOURCE-COMMIT.txt` 区分安装包构建提交与仅补充文档的发布提交。
- Android 包名 `com.zviewer.mobile`、最低 API 24；调试包名仍为 `com.zviewer.mobile.debug`。鸿蒙原有最低 API 与解码能力边界保留。
- APK 经 apksigner 验证，沿用已有发布证书，SHA-256 为 `51b892a049a1650a03dc0a3baf9406db85b9fb91267851f15ee697df2d2ccc9b`。HAP 经 hap-sign-tool 验证，release Profile、代码签名和内容摘要均通过，使用已有发布密钥和证书。
- 私有签名配置只在本机构建时注入，构建后恢复干净配置；密钥、密码、Profile、Cookie 和设备私有回环路径不纳入源码归档。

## 完成的适配

### PGC 与本机账号

共享层和 Go / ArkTS 原生解析器支持 ep、ss、番剧完整地址及受限短链展开，返回正确的季标题、分集、epId、cid、currentPage、会员 badge 和 preview。修复上游归一化路径漏掉顶层 PGC 元数据的问题；运行时保留本机解析的试看信息，不能只用房主的状态代表观众权限。

整季解析先定位目标 ep，切集同时更新 ep URL、cid 和 currentPage。解析与手动画质切换保留影片、房间、账号 sessionVersion 和画质 revision 校验；广播与影片 DTO 尚未对应时等待，防止旧请求覆盖新集。本机质量选择继续筛选设备支持的普通编码和 AAC 音轨，不把 HDR、杜比或 HEVC Main 10 当作新增能力。手动档位不可用时报错并沿用回滚路径，不静默返回其他 MP4 档位。多段 durl 暂不伪装成单文件播放，提示改用 DASH。

PGC 解析区分会员/地区/下架等业务失败，并以真实 durl / DASH 时长辅助判断试看。Cookie 留在原生侧，短链展开不携带账号凭据。服务端重解析传递 movieId 和 page，由目标服务端查其房主身份；本机扫码账号不会上传为服务端 Cookie。

### cliOnly、媒体与缓存

影片的 cliOnly 随新增请求一次性写入，DTO 与更新链路保留。解析、挂载、观众覆盖、画质切换、恢复和缓冲模式均受本机代理门控；本机离线或权限失败时禁止服务器视频/音频兜底。移动阻塞层提供登录 B 站、重启内置代理和重试入口。

原始 CDN 地址留在房间数据中，每台设备在实际播放/下载时包装自己的代理。写入房间前剥离本机回环代理及服务器私有连接别名。cliOnly 缓冲必须先按本机账号解析，再查带账号会话维度的缓存，防止命中其他账号已有的整片 Blob。PGC MP4 经允许的代理注入防盗链头；仅 html5 形态的 B 站 MP4 使用免防盗链直连。HLS 相对与绝对资源沿用同一服务器连接映射，避免私有通道递归包装为服务端代理目标。

接入服务端普通视频/PGC 默认模式及 configured 标记，保留已登录内置代理自动高画质与用户显式选择的优先级。旧服务端缺少新字段时保留缺省行为。

### 服务器地址与证书例外

首页支持 HTTPS 优先的自动选择，以及自定义完整 HTTP/HTTPS URL；保留路径、IPv4/IPv6 和显式端口，拒绝嵌入凭据与无效协议。探测不带业务 Cookie、Authorization 或令牌。只有诊断证明相同端口提供有效明文 ZViewer 服务时才允许 HTTP 回退；证书、业务和一般网络错误不会直接降级。

“允许此服务器使用不受信任的证书”默认关闭，按服务器保存，连接状态可撤销并断开。共享层经 `src/platform/serverConnection.ts` 和 `connectionTransport.ts` 映射请求；Android 的 `ServerConnectionPlugin.java` 调用 Go 原生通道，鸿蒙的 `ServerConnection.ets` 提供相同语义。

例外仅用于选定 origin 的私有随机回环通道，覆盖 API、原生 Cookie、NDJSON、Range/HEAD、媒体及 WebSocket。独立外域保持证书校验，切服/撤销关闭旧请求与升级后的 Socket。鸿蒙 TLS Socket 必须先 bind 再注册监听；响应按 Content-Length / chunked 边界排空，修复 peer close 先于尾部消息导致空响应或媒体截断的问题。没有全局 WebView SSL 放行。

### 语音与一起听

LiveKit 徽标从实际 selected candidate pair 判断 UDP/TCP，统计不可用时不猜测线路；返回的同源信令 URL 可经服务器私有通道，独立 WSS 保持严格校验。保留既有 token / 权限 / connect / publish 的取消控制、原生音频路由和音轨清理。

一起听自然结束可继续推荐，新增默认来源页及房间评论入口；全屏播放器展开时侧坞保持挂载并隐藏，避免评论监听中断。语音仍由移动宿主持有单一实例，不新增重复 LiveKit 面板。旧 PGS、Matroska/AAC、本地弹幕、网易云 Cookie、主题、手势和系统媒体功能保留。

## 验证证据

| 层次 | 实际结果 | 边界 |
| --- | --- | --- |
| 共享自动回归 | `test:adaptation` 26 项、`test:media` 4 项全部通过 | 包括 PGC/原生契约、地址候选、证书回退、cliOnly/缓冲、媒体路由、语音生命周期；不代表人工听音 |
| Go 自动回归 | `go test ./...` 通过；新增 PGC/短链 5 项、服务器通道 3 项 | Go / ArkTS 使用同一脱敏 PGC fixture；ArkTS 通道另有尾包关闭顺序回归 |
| 网页与原生构建 | TypeScript/Vite、Android Debug/Release、鸿蒙 Debug/Release 构建通过，双方网页由同步脚本生成 | Vite 既有包体提示与 Gradle 弃用提示保留，无构建错误 |
| Android / 鸿蒙签名 | 正式 APK / HAP 的签名与内容摘要验证通过 | 本地交付，不等于应用商店审核或远端发布 |
| 实际打包的 WebView / ArkWeb | 自签名严格连接拒绝；选定服务器例外后 API、原生 Cookie、NDJSON、206 Range、MP4 起播/seek、Socket.IO polling → WebSocket 通过 | 使用隔离测试服务；外域仍拒绝，撤销后 fetch/Socket 均关闭。不是生产穿透地址验收 |
| 免费 PGC | 两端实际解析 ss41410 首集 ep508404，25 集信息一致；MP4 206、实际时长约 1449.94 秒、跳至约 400 秒后继续出帧 | 使用本机已有授权账号，不输出身份或 Cookie |
| 会员 PGC | 两端本机账号 vipStatus=1；ep508405 badge=会员、cid=785728276、currentPage=2、preview=false | MP4 手动 qn16；没有将该低档测试误称为全部画质实播 |
| 会员流实际播放 | 两端 206 `bytes 0-1023/45619339`；播放器 duration=1449.982667 秒；Android seek=400.610613、鸿蒙 seek=400.611986，均继续出帧且 error=0 | 已播放到所测片段的常见六分钟试看边界之后；没有连续观看完整 24 分钟，也没有人工确认声音 |

模拟器：Android Medium Phone；鸿蒙 Pura 90 Pro / API 26。脱敏记录位于交付目录 `evidence/`：双端 connection、free-pgc、member-pgc 共六份 JSON。PGC 流地址、Cookie、签名材料和服务器私有连接路径未放入证据。

## 自动验证覆盖边界（用户真机验收前记录）

用户现已确认本版双端真机验收通过；以下保留代理执行阶段未取得独立设备日志的项目，不将历史“待验收”描述作为发布阻塞，也不伪造新增实测统计。

- PGC DASH 已有双端解析与编码/AAC 选择契约回归；本轮真实会员内容的画面/seek 证据来自 MP4，未新增双端 PGC DASH 实播或人工音频验收。
- 非会员真实试看、失效 Cookie、房主/观众不同账号与服务端会员/非会员交叉矩阵未完成现场测试；fixture 覆盖不替代真实账号矩阵。
- 真实房间中的连续快速 BV 多 P / ep 切换、跨端同步与多次手动画质切换尚需联调，自动竞态门控不等于全部操作验收。
- 未取得用户实际穿透地址；缺链、过期、域名不匹配及生产代理的组合没有全部实测。实际隔离自签名服务已验证例外作用域、外域隔离和撤销。
- 新 UDP/TCP 徽标完成 selected candidate 回归；本轮没有新增真实 LiveKit 双向听音、独立 WSS/UDP/TURN、蓝牙、耳机、后台锁屏或权限拒绝后真机重试验收。
- 一起听推荐、默认页和评论已移植并通过编译；完整触屏、键盘、自然结束推荐及系统控件场景仍待真机验证。历史版本的设备验收不能算作 1.7.0 新增验收。

## 回档与后续维护

完成构建后在指定仓库提交全部本次源码、测试和文档；提交 ID 记录于交付目录 `SOURCE-COMMIT.txt`。源码 ZIP 从该提交生成，校验文件覆盖 APK、HAP 和 ZIP。没有在其他发布工作树修改或提交客户端。

回档以本地提交或原基线为依据，保留后来新增工作与本机凭据。后续共享修改重新执行 `android:sync`、`harmony:web`；原生 Go 修改重建 AAR，ArkTS 修改重建 HAP。签名配置仍在仓库外维护，不提交生成网页、AAR、安装包或私有材料。
