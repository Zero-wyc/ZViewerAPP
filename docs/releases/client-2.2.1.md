# ZViewer-Client V2.2.1

Android / HarmonyOS 更新为 **2.2.1（222）**。iOS 保持 2.1.10 / build 31。

## 🚀 新特性 / Features

- 歌单与每日推荐的“播放全部”在首曲确认入队后自动起播，其余歌曲按原顺序继续加入；操作期间防止重复点击。

## 🐛 错误修复 / Bug Fixes

- 移除歌单详情左上角的前进／后退切换箭头，保留手机端“返回列表”；删除未使用的操作占位，压缩封面与歌曲列表之间的异常留白。
- 修复每日推荐列表能显示封面、播放器却出现破图的问题：网易云封面统一使用 HTTPS，裁剪参数按显示尺寸替换；完整播放器和底部播放条提供加载失败占位，切曲后可重新加载。
- 修复每日推荐“播放全部”重复加入首曲、当前首曲被切成暂停的问题；入队失败、切换歌单或日期、离房后停止旧任务。
- 修复私人漫游长时间播放后候选耗尽停播，增加有界重试与坏源跳过，暂停后的迟到回调不会重新起播。
- 修复屏幕共享观众静音状态与控制栏不一致，提供点击开声提示；分享房间链接时还原真实服务器地址，并提示内网访问范围。

## ⚠️ 破坏性改动 / Breaking Changes

- 无。最低系统保持 Android 7.0 / API 24、HarmonyOS 6.1 / API 23，沿用既有发布签名。

## ⚡ 性能优化 / Performance Improvements

- 删除歌单详情历史导航状态和空白占位；网易云大小封面使用对应裁剪尺寸，避免重复累加裁剪参数。
- 漫游只回避近期历史，候选耗尽时有限补拉；失败恢复和连续坏源跳过均设置上限。

## 📖 文档与依赖更新 / Documentation & Dependencies

- 同步 README、CHANGELOG 与 Android / HarmonyOS 维护文档；依赖版本不变。
- 66 项自动回归、共享组件界面检查与双端正式签名构建通过。此前维护功能由用户反馈播放测试无问题；本轮新增界面和封面修复的检查为浏览器、回调和构建证据，未补写实体设备验收。
- 提供正式签名 APK、HAP 和构建时生成的 `SHA256SUMS.txt`。源码已同步 [main](https://github.com/Zero-wyc/ZViewerAPP/tree/main)，使用 GitHub 自动生成的源码归档，不另附源码包。
- iOS 本次未修改或构建，继续使用 [2.1.10 Release](https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v2.1.10)。

---
**完整变更记录**：[client-v2.2.0...client-v2.2.1](https://github.com/Zero-wyc/ZViewerAPP/compare/client-v2.2.0...client-v2.2.1)
