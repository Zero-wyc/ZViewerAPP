# iOS 1.2.1 / build 12 unsigned 修复交付

2026-09-30，基线 commit：95bb3bd。本版只修改 iOS 客户端，继续单一 VLCKit 和原有播放器适配接口；服务端、共享 Go 和其他客户端保持原样。按用户最新要求交付 unsigned，由用户自行签名安装。[原 plan](../ios-continuation-plan.md)。

## 修正

- 网易云下拉菜单原本固定在音乐容器 `left:16/top:62`，所以在居中导航下错位。现在菜单作为按钮定位容器的子视图，左边缘与按钮对齐，位于按钮下方 8px；随窗口、侧栏和内容宽度变化重新布局，不依赖屏幕坐标或方向回调。选择菜单项、切换到 B站、搜索或账号操作会关闭菜单。
- “添加影片” SourcePicker 的 Modal 原本漏配 `supportedOrientations`。RN 0.86 默认仅支持 portrait，和房间横屏锁存在方向配置冲突；现在显式 fullScreen，允许 portrait / portrait-upside-down / landscape，与 app 允许的方向一致。弹窗开关和布局回调不调用方向锁，不更改房间方向策略。
- 持续旋转的 UIKit 事件日志未采集；上述冲突已修正，**是否消除真机持续旋转需要用 b12 复验**。Web 预览不能验证 iPad 原生方向过渡。

参考：[RN 0.86 Modal 支持方向](https://reactnative.dev/docs/0.86/modal#supportedorientations)、[Expo SDK57 方向锁](https://docs.expo.dev/versions/v57.0.0/sdk/screen-orientation/)。同时核对已安装 RN 的 NativeComponent 默认 portrait 和 Fabric Modal 方向掩码实现。仍保留 `UIRequiresFullScreen=true`，iPad Split View 继续关闭。

## 自动验证

- 35/35 单测、lint、typecheck、iOS/Web 导出通过。
- 本地 v4.2.0 页面检查 **37/37，零 JS 异常**：新增三尺寸菜单锚点及切换页面检查；1180×820 / 820×1180 / 390×844 各连续三次打开/关闭添加影片弹窗，检查当前窗口尺寸及恢复。
- 原有房间/队列/账号状态/全屏容器/控件检查继续通过。网易云扫码/歌单/搜索使用上游 fixture，房间/队列/登录状态/退出使用真实隔离本地后端；没有连接 NAS。
- 依赖没有变化，Doctor 沿用 b11 的 20/21：WebRTC New Architecture 未测试、本地模块无 Directory 元数据，未隐藏。历史语音/DAV/Range 证据和未验收项见原 plan；本轮未重复宣布真机通过。

截图是 **Expo Web 布局预览**：[横屏菜单](ios-1.2.1-12-ui/ncm-menu-landscape.png)、[手机菜单](ios-1.2.1-12-ui/ncm-menu-phone.png)、[横屏添加影片](ios-1.2.1-12-ui/source-picker-landscape.png)。不包含用户账号或真机解码结论。

## 未签名设备包

- [EAS build 12](https://expo.dev/accounts/YOUR_ACCOUNT/projects/zviewer-ios/builds/b559808d-4da0-4828-a3a6-ebd5f985dce7)。FINISHED，2026-09-30T06:55:04.640Z。
- 本地目标：`ZV-iOS/release-assets/ZViewer-1.2.1-b12-unsigned.ipa`，不提交 IPA；Release 内置 JS，无需 Expo Go/Metro。不使用用户证书签名。
- IPA **46,407,060 bytes**；SHA-256：`532efd15d4327b8219fda437224aa9b9b41407b60a3d56f22a545a034110374a`，与构建端摘要一致。
- com.zviewer.mobile / 1.2.1 / 12；ARM64 Mach-O platform IOS(2)，无 app 签名、描述文件、签名目录或加密。内置 JS **2,988,995 bytes**，确认包含本次菜单和 SourcePicker 更新；VLCKit/WebRTC/Go/语音桥接及许可证齐全。
- 离线确认 UIRequiresFullScreen 及全部横竖屏声明；不替代原生弹窗运行验收。Opus host 50 帧编解码通过，非设备采集结果。
- 脱敏证据：[b12 JSON](ios-1.2.1-12-evidence.json)。

## 真机复验

1. 安装 b12，横屏进入一起看，连续三次打开添加影片、滚动来源列表、点击完成；方向应保持，页面不能循环旋转或重影。
2. 弹窗打开时手动转动设备；在系统允许方向或房间锁定方向下布局应稳定，关闭后保持既有方向策略。两侧横屏和竖屏分别验收。
3. 一起听从网易云/哔哩页面分别打开菜单，确认位于网易云按钮下方；菜单打开时旋转或展开/收起侧栏，确认仍对齐且可选择、关闭。
4. 回归选片起播、全屏进出、扫码/音乐播放。其他语音/同步/媒体矩阵待验收项保留，不扩大上一轮视频正常反馈。

没有 push、标签、TestFlight 或商店发布。
