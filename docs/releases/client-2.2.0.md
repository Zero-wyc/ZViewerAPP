# ZViewer-Client V2.2.0

Android / HarmonyOS 更新为 **2.2.0（221）**，本轮改动已收到用户“真机验证通过”的反馈。iOS 保持 2.1.10 / build 31，本次不提供新的 iOS 安装包。

## 🚀 新特性 / Features

- 统一分集卡片：主题色外框、有封面则展示封面，无封面直接显示集数；按屏幕空间与字号自动调整网格列数。
- 一起听采用新的沉浸播放器布局：展开后覆盖房间顶栏，保留方形封面；手机和平板竖屏使用单列布局，大屏自动放大封面、铺开控制区，横屏播放内容与竖向工具栏合并为一张卡片。
- 红心和评论放到歌曲名称旁，长歌名循环滚动；收起态保留播放与列表，通过左右滑动文字区域切歌。

## 🐛 错误修复 / Bug Fixes

- 修复选中集数后文字偏移、选源下拉菜单横向扩张的问题。
- 修复播放器内容显示不全、播放控制拥挤、歌手行未对齐及大屏留白不均；矮屏工具栏可滚动，保留原功能和权限。
- 修复深浅背景下按钮看不清的问题，按钮跟随背板配色，播放键保持主题色背景；删除歌词面板四角装饰。
- 一起看横屏直接展示原“更多”菜单操作，倍速菜单向上弹出，选中态使用主题色；竖屏控制栏保持原布局。
- 修复一起听 B站后台音频路径与前后台可见性处理，优先使用独立音轨，避免静音背景视频在后台干扰播放。

## ⚠️ 破坏性改动 / Breaking Changes

- 无。最低系统要求保持 Android 7.0 / API 24、HarmonyOS 6.1 / API 23。
- Android / HarmonyOS 沿用既有签名；鸿蒙 HAP 按设备支持的开发者方式安装，签名和设备授权仍需匹配。

## ⚡ 性能优化 / Performance Improvements

- 长歌名仅在溢出时启动滚动；封面与控制区按剩余空间伸缩，减少不必要的占位。
- 优化后台静音视频和音频同步任务，避免隐藏界面持续追赶进度；解析回退仅针对对应失败类型执行。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 更新 README、CHANGELOG 和安卓/鸿蒙维护文档，记录本轮真机验收及正式包检查；依赖版本不变。
- 提供正式签名 APK、HAP 与构建时生成的 `SHA256SUMS.txt`；源码发布到 [main](https://github.com/Zero-wyc/ZViewerAPP/tree/main)，可使用 [GitHub 自动生成的源码 ZIP](https://github.com/Zero-wyc/ZViewerAPP/archive/refs/heads/main.zip)，不另附源码包。
- iOS 继续从 [2.1.10 Release](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v2.1.10) 下载，未将本轮双端界面改动记为 iOS 更新。

---
**完整变更记录**：[client-v2.1.10...client-v2.2.0](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v2.1.10...client-v2.2.0)
