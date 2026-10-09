# 1.7.1 本地联调记录（2026-10-09）

浏览器房主 + 已授权 App 观众，Kazumi 设置已开启；本地电脑运行最新服务端源码，隔离数据库、配置与测试账号。NAS 部署及其源码未修改。安卓和鸿蒙模拟器顺序运行，完成后关闭。

## 根因与改动

服务端 TypeORM 权限矩阵查询缺少 where，错误被吞后将已授权普通用户当作无权限；修复查询条件，保留权限拒绝语义。浏览器房主忽略已有影片时的 current-movie，改为接受非空选择。播放器重挂载会重复使用首次进房的恢复快照，网页及 MobileRoom 仅在 init 挂载传入该快照。

Kazumi HLS 主清单的相对子清单被拼到服务端代理路径，App 还重复代理自身 API。hls-proxy.ts 统一识别 Kazumi/AniSubs/通用代理，恢复真实上游基址，保留 Referer（包括空值）、User-Agent、Origin、源 Cookie，子清单/分片/map/密钥沿用原代理。服务端网页的 hls.js 回调参数顺序同时修正。客户端将认证限定在所选服务器 API，先还原逻辑地址再映射本机通道，避免漏 token 或将 token 发给上游。

客户端修改只位于指定 ZViewer-client 仓库；服务端目录没有 Git，原始修改文件保存在忽略的本地 baseline，完整服务端补丁作为 docs/upstream/watch-kazumi-20261009.patch 纳入客户端 Git，便于回档。源快照的四个原始生产文件与上游 main ba033096bc9c3a85a2058918a002b80a5f484ec8 一致。

## 安装包验收

Kazumi MXdm《成神之日》1、2、3 集，多级 HLS，浏览器房主分别接受 Android WebView / HarmonyOS ArkWeb 普通用户切片。第一集含刷新后恢复跟播，第二/第三集直接在片单切换，验证新集主清单路径、对应时长、解码帧和播放时间。主清单、相对子清单和分片均 200。房主回归第三集→第一集→第二集→第三集，切回原影片从头播放，不再跳回旧恢复记录并暂停。

| 平台 | 集数 | 时间推进（秒） | 解码帧 | 分辨率 | 结果 |
|---|---|---|---|---|---|
| android | 1 | 0.844 → 3.392 | 13 → 73 | 1280×720 | 通过 |
| android | 2 | 0.755 → 3.533 | 20 → 87 | 1280×720 | 通过 |
| android | 3 | 0.577 → 3.117 | 15 → 76 | 1280×720 | 通过 |
| harmony | 1 | 0.828 → 3.506 | 22 → 86 | 1280×720 | 通过 |
| harmony | 2 | 0.435 → 2.954 | 12 → 73 | 1280×720 | 通过 |
| harmony | 3 | 0.363 → 2.880 | 11 → 72 | 1280×720 | 通过 |

修复前 Android HLS 宽度 0、帧数 0，错误代理子清单 401；仅元数据、片单高亮或 master 200 不作为成功依据。原始响应记录与截图保存在忽略的 .ui-validation/test1-20261009，未上传测试账号、token、服务器配置或 NAS 凭据。

## 构建与回归

- npm run test:adaptation：31 项通过（含连接通道、认证、播放源和恢复状态）。
- npm run test:media：4 项通过。
- npm run android:sync + Gradle assembleDebug：通过，Android 1.7.1 / 171，com.zviewer.mobile.debug。
- npm run harmony:web + Hvigor assembleHap：通过，HarmonyOS 1.7.1 / 171，unsigned debug HAP 已安装模拟器。rawfile/web 由脚本生成。
- 服务端 frontend/backend 分别构建通过；frontend/scripts/test-watch-kazumi.mjs 4 项、backend/scripts/test-room-permission.cjs 真实 TypeORM/sql.js 1 项通过。

这是本地 debug 验收，不是正式发行或物理设备验收；未覆盖实际音轨输出、所有第三方线路或 iOS。DM84 MP4 线路初查可播放，此次重点复现和修复的是 MXdm 多级 HLS；上游 CDN 自身 403 仍需区分线路问题。

## 上游 PR 与部署

[Zero-wyc/ZViewer #11](https://github.com/Zero-wyc/ZViewer/pull/11)，分支 fix/viewer-switch-kazumi-hls，提交 e869d972aa79b9d5d69311688750754590d2667c。7 个服务端仓库文件，未混入客户端、部署配置或测试凭据。PR 已提交且未合并；关闭维护者修改 fork 分支选项。

完整修复需要更新服务端后端、前端网页并刷新浏览器房主，同时更新 App。NAS 当前仍使用原部署，不代表 NAS 问题已经在线修复。第三方 Kazumi 需继续在设置中手动启用。

## 本地交付

release/client-v1.7.1-test1/ZViewer-Android-1.7.1-debug.apk 与 ZViewer-HarmonyOS-1.7.1-unsigned-debug.hap，哈希见同目录 SHA256SUMS.txt。HAP 为模拟器使用的未签名测试包，未生成正式签名安装包或 GitHub Release。
