# Android / HarmonyOS 1.7.5 长标题与源菜单验证

日期：2026-10-12。双端版本 **1.7.5 / 175**，基于此前本地提交 `6c4c059`；本版包含其服务端 v4.5.1 对齐功能。公告继续排除，iOS 不涉及。用户授权源码推送 `Zero-wyc/ZViewerAPP` main 并发布双端 Release。

## 修复

- `MovieListPanel` 普通与展开列表共用完整多行标题：取消单行省略，不限制行数；连续英文/数字可断行。图标、播放及删除按钮保留独立网格列，卡片随文字高度增长。
- `AnimeSourceBrowser` 的源选择使用 `Select.menuWidth="content"`：按实际选项文字宽度增宽菜单，为勾选图标和滚动条预留空间，并调整靠近右边缘的菜单位置。选项保持单行；触发器和搜索栏保留原宽度。极端超出整个视口的名称允许菜单内部横向滚动，不撑宽页面。其他选择器默认与触发器等宽。
- package/lockfile、Android Gradle、HarmonyOS AppScope 版本同步为 1.7.5 / 175，沿用既有发布签名。共享业务、媒体协议及平台桥接边界保持。

## 本轮验证

- **40 组共享布局检查**：320×568、360×800、393×852、852×393、768×1024；深浅主题，普通/展开片单及 ani-subs 源菜单。20 条混合中文/英文长标题全部完整显示，未与按钮重叠，无横向页面/片单溢出；8 个源名（包含比现有源名更长的名称）完整单行显示，菜单保持在视口内，源切换可用。
- **8 组实际 App 检查**：Medium Phone Android 模拟器 WebView 与 Pura 90 Pro HarmonyOS 模拟器 ArkWeb，使用本次 175 Debug 安装包。各检查普通/展开片单的 5 条长标题，以及普通/展开番剧浏览面板内的源菜单。服务器实际返回 10 个 ani-subs 来源，包括“森之屋动漫”；全部单行显示、无省略和横向溢出，可正常选源。已目视抽查两端截图。
- **56 项适配 + 4 项媒体回归**通过。TypeScript/Vite、`android:sync`、`harmony:web`、Android Gradle Debug/Release、HarmonyOS Hvigor Debug/Release 均成功。
- Android 正式签名验证通过，APK 清单版本 1.7.5 / 175，证书 SHA-256 与此前发布一致。HarmonyOS 代码/权限签名及摘要验证通过，证书链与 1.7.3 一致；构建后签名模板恢复干净状态。
- 两个正式包内各 **29 个共享网页文件**与最终构建逐个比对；HarmonyOS 入口按生成器注入桥接脚本，按其生成文件单独比对。包内无 AGENTS.md 和公告实现。

本轮界面测试使用独立本地服务器、测试房间及媒体夹具，没有操作 NAS。测试结束恢复两端模拟器原连接和本地偏好。原始截图、布局结果、签名及包内比对证据保存在忽略目录 `.ui-validation/ui175/`，测试账户、日志和签名材料不进入源码提交。

此前服务端固定提交 `c8fa5bad0c6efcffbc0dc3bfe4c199f8a9b8d8f6` 的搜索、整剧、切集/多版本、实际解码与观众同步/清空，以及真实第三方番剧采样记录见 [1.7.4 对齐验证](client-v1.7.4-alignment-451-validation-20261012.md)。本轮未重复全部播放专项；模拟器与协议夹具不替代用户物理设备、真实媒体库、长期转码、蓝牙/后台及所有证书通道验收。

## 安装包与发布

本地签名附件位于 `release/client-v1.7.5/`，GitHub Release 仅上传下列安装包及 `SHA256SUMS.txt`。源码使用 main 对应发布提交的 GitHub 自动归档，不另上传源码 ZIP；发布前核对源码与归档不含测试凭据、签名材料和 AGENTS.md。

| 安装包 | 字节数 | SHA-256 |
| --- | ---: | --- |
| ZViewer-Android-1.7.5-release.apk | 43,361,855 | `1196201af7b3e8f672dfa4410892fbbd61712b705de9687a6c8b24fa6aea899d` |
| ZViewer-HarmonyOS-1.7.5-release.hap | 14,178,568 | `0f992fc7a1afac19ac1701e7ccc8f02fcbab9a413a4be537da3ae62491c47943` |

[ZViewer-Client V1.7.5](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v1.7.5) · [发行说明](releases/client-1.7.5.md)
