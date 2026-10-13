# 双端旋转图标与全屏横屏验证

日期：2026-10-13。基于 **1.8.0 / 180** 的本地候选，包含先前房间入口/评论侧栏优化。本次没有发布 GitHub Release，也没有修改 iOS。

## 行为

- 已锁定时显示打开的锁图标 `LockKeyholeOpen`，提示“解除旋转锁定（自动旋转）”；重载视频继续使用圆箭头。
- Android/HarmonyOS 的视频网页全屏和容器全屏均默认锁定横屏；即使设备已处于横屏，也请求横屏目标。
- 退出全屏、播放器卸载或离房时恢复自动旋转和系统栏；全屏内手动解锁不因普通重绘被覆盖，再次进入全屏重新锁定横屏。
- 原生显示调用串行执行，过时的排队请求被跳过；迟到的进入操作完成后，由最新退出操作恢复方向，失败不阻塞后续操作。系统栏与方向独立尝试恢复。
- Android 原生方法新增 `{ isLandscape: boolean }` 参数，未传目标仍保留旧切换行为；鸿蒙使用既有布尔目标原生桥。
- 普通浏览器不会因为全屏尝试强制移动端方向锁定。

## 已完成检查

| 检查 | 结果 |
| --- | --- |
| 适配回归 | 76 项通过，含 `scripts/player-display.test.mjs` 新增 7 项：双端明确横屏目标/退出恢复、迟到原生锁定、过时请求、操作失败恢复及普通浏览器边界 |
| 媒体回归 | 4 项通过 |
| 控件与桥接模拟 | 实际 `ScreenOrientationButton`、`PlayerDisplayControls` 和 `playerDisplay` 适配层，模拟 Android/HarmonyOS 原生桥；360×800 / 852×393、深浅主题共 8 组通过 |
| 交互 | 新图标与重载图标不同、点击全屏横屏目标、全屏内手动解锁后重绘、再次进入全屏、卸载恢复、`fullscreenchange` 路径通过 |
| 网页构建 | TypeScript/Vite、`android:sync`、`harmony:web` 通过 |
| 原生构建 | Android Gradle、HarmonyOS Hvigor Debug/Release 通过 |
| 签名/资源 | APK/HAP 验签通过，沿用现有发布签名；双端各 29 个网页文件与最终构建逐项 SHA-256 一致；鸿蒙生成入口桥接脚本一致、签名模板已恢复 |

本地夹具、日志、截图及安装包验证结果分别在 `.ui-validation/orientation-ui/`。界面检查的原生方法与全屏事件采用模拟响应，不证明物理手机方向传感器、系统旋转开关、ArkWeb/WebView 全屏或设备系统栏实机表现；本轮尚未完成真机验收。

本地签名安装包和 `SHA256SUMS.txt` 位于 `release/orientation-ui-20261013/`，保留 1.8.0 / 180；此前候选和已发布附件保留在各自目录。

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| ZViewer-Android-1.8.0-release.apk | 43169943 | `fed518231f10b4f9625ae7b6f800cf60bb0895f99e1e07bd35640f7553c56573` |
| ZViewer-HarmonyOS-1.8.0-release.hap | 14185775 | `4d132f699c63c6676e7e1ae5ddefbee88f24f86f608fd7c61a8fca4a3a85031f` |
