# Android / HarmonyOS 1.7.4 对齐服务端 v4.5.1

日期：2026-10-12。双端本地版本 **1.7.4 / 174**；客户端起点 `e31a232c6ad8f766403d3757203335d7bb9f462b`，目标服务端提交 `c8fa5bad0c6efcffbc0dc3bfe4c199f8a9b8d8f6`。实施依据为[最新更新指南](安卓鸿蒙对齐服务端v4.5.1更新指南-2026-10-12.md)。按用户本轮指令，**公告不加入客户端**；独立评论窗口、评论侧坞及快捷键仍排除。iOS 不涉及。本次仅本地源码、提交和安装包交付，未上传 GitHub 或发布 Release。

## 实现与维护入口

| 功能 | 实现与边界 |
| --- | --- |
| 共享番剧浏览器 | `AnimeSourceBrowser` 复用 `EmbyBrowser`；Kazumi/ani-subs 独立源 ID、线路与集数元数据。稳定面板保持关键词和放大状态；切源非空词自动查询，过期搜索/详情/添加结果失效，不重建 Modal。已失效来源回退当前可用来源并提示。 |
| 番剧添加与海报 | 单击选集、确认才添加；批量返回成功 ID，失败项保留，重试不重复，不自动播放。直连海报失败才用认证 Blob 代理；检查图片类型、取消旧请求、释放 Object URL，按服务器/条目重置失败状态。 |
| 媒体库搜索与显示 | Emby/Jellyfin 接官方 SearchTerm 接口；目录/搜索独立状态。补集号、原始路径、总集数、时长、电影/文件角标；无 tag 仍请求代理，允许服务端取子项封面。保留 16:9 单集、2:3 剧集/季、全选、原顺序添加和实际放大增高。 |
| 整剧/整季 | `seriesPages.ts` 按服务端返回顺序逐季枚举 Episode/Video，连续 pages 保留 itemId/mountId；明确的“整部”快捷入口生成一张影片卡，普通批量仍生成独立条目。切房使枚举及解析失效。 |
| 切集与版本 | DTO、添加/更新类型传递 pages 与 multiVersion；Emby/Jellyfin 在 B 站切页逻辑前分流。版本懒加载，按实际 MediaSource ID 切换；同步 URL、format、audioCodec、duration。切集/切版本请求彼此失效，清空/离房后旧请求不能写回。直链将上游 ms 参数规范为 MediaSourceId，保留签名参数。 |
| 媒体库 HLS | 实测发现服务端转码清单的相对分片会错误落到 `/api/emby/stream0.ts`。`library-hls-proxy.ts` 在 HLS 加载器内按房间影片 ID 获取新鲜清单基地址，沿用现有认证媒体代理读取子清单、分片及密钥；媒体凭据留在播放器内存，不写入 Movie/房间广播。仅同上游 origin 继承媒体查询参数，跨域不继承。 |
| 清空片单 | 一次 DELETE 清整个房间，root/创建房间的 admin 入口，二次点击确认、断连/忙态门控。主卡与展开窗口共用操作；失败不清本地状态。同房间重新加入也用 session revision 隔离迟到响应。接受服务器空片单/current-movie null，停止媒体、取消解析/缓冲/自动连播和旧恢复快照。 |
| B 站与音量 | 搜索结果新增分 P 页，选定 URL 继续交给既有本机解析，不新增服务端账号兜底。横/竖音量拖动覆盖 pointercancel、后台、旋转、失焦、卸载；Modal 和拖动共用滚动锁，避免互相提前解锁。 |
| 设置生命周期 | 切服失效旧 public-settings 请求，旧权限不能覆盖新服务器。未加入公告组件、入口、设置或公告专用原生能力。 |

所有共享业务在指定 `ZViewer-client` 仓库完成；保留 `src/platform`、Android Java/Go、鸿蒙 ArkTS、签名配置及媒体恢复契约。HarmonyOS 网页仅由 `npm run harmony:web` 生成。挂载起始目录修复主要由服务端生效，未在 App 增加取父目录补丁。

## 验证结果

- **56 项适配、4 项媒体回归**通过；新增行为测试覆盖整卡顺序、迟到响应、清空失败和权限、媒体版本、HLS 基地址、直链参数与嵌套滚动锁。
- TypeScript/Vite、`android:sync`、`harmony:web`，Android Gradle Debug/Release 及 HarmonyOS Hvigor Debug/Release 构建通过。使用既有发布签名；Android 签名验证、鸿蒙代码/权限签名和摘要验证通过。鸿蒙加密签名配置只在 Hvigor 构建期间注入，结束后恢复干净配置。
- **102 组共享浏览器检查**：320×568、360×800、393×852、852×393、768×1024；两种媒体库、两种番剧源、深浅主题、普通/放大、媒体库单集、3,600 条集数/线路与 B 站多 P。检查横向溢出、按钮可达、真实图片解码、认证海报回退、放大后滚动区增高及原生返回层次。修复了窄屏确认栏、长面包屑和源选择挤压搜索框；失败项重试只提交剩余 ID。
- **8 组实际 App 面板检查**：Medium Phone Android WebView 和 Pura 90 Pro HarmonyOS ArkWeb，从正常 App 添加入口分别检查 Emby/Jellyfin 普通/放大。无 tag 剧集海报实际加载，整剧只写一张卡，6 个分集页保留完整 itemId/mountId。这里设备名称指模拟器。
- **本地真实协议联调**：两种媒体库分别搜索电影/剧集/单集、枚举两季、无 tag 海报回退、多版本切换和音频转码、普通观众没有自有挂载时按 movieId 访问、媒体 Range/206。root/创建者清空成功，普通观众和其他 admin 均为 403。
- **16 组播放/清空记录**：两种 App 房主分别与普通浏览器观众播放 H.264/AAC 短片；初始 MP4、切第 2 集、切需要音频转码的 HLS 版本均实际解码并推进时间。清空后两侧暂停并移除 src，片单为空，旧媒体不复活。没有测量严格同步误差或人工听音。
- **10 组真实第三方番剧查询**：Kazumi DM84 与 ani-subs 当前可用来源分别搜索芙莉莲、鬼灭、咒术、间谍、海贼王；均返回结果、cover 和详情。记录多条标题、全部结果的 cover 数及首匹配详情；首图代理 9/10 返回图片，ani-subs“咒术”首图上游 502。该结果属于本轮采样，不代表所有源稳定或正片已播放；详情条目可能包含多条线路，不能当作唯一集数。

隔离服务端从上述固定提交重新构建，以独立数据库和端口启动；没有连接 NAS SSH、修改 NAS 容器或替换运行中的生产服务。源码环境 public-settings 默认报告 1.0.0；本轮服务端身份以 Git 提交和重构建证据判断，不把该默认值当作生产 v4.5.1 的发行编号。

原始日志、截图、接口记录和签名/包内资源比对保存在忽略目录 `.ui-validation/alignment451/`。`ui-results.json`、`native-results.json`、`protocol-results.json`、`playback-results.json`、`anime-live-results.json` 分别对应上述覆盖；测试账户与配置不进入源码提交。

## 本地交付与验收边界

签名安装包位于 `release/client-v1.7.4-test1/`：`ZViewer-Android-1.7.4-release.apk`、`ZViewer-HarmonyOS-1.7.4-release.hap`、`SHA256SUMS.txt`。最终包内共享网页与 dist 比对；源码不提交生成网页、安装包、签名材料、测试数据库或 AGENTS.md。

模拟器和协议夹具通过不等于物理设备/用户媒体库验收。用户服务器的真实 Emby/Jellyfin 库、完整正片及长期转码、真实 B 站会员/非会员多 P/PGC、HTTP/HTTPS/自签例外的全部设备通道、非根 FTP/WebDAV/OpenList、软键盘实机、后台/旋转取消拖动、蓝牙/系统控件等仍需用户设备回归；既有平台编解码限制保持不变。原有房间名同步和挂载路径行为保留，本轮没有重新宣称全部生产场景已验收。
