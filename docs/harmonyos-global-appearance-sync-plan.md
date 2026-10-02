# 鸿蒙客户端同步 Android 全局外观引擎方案

更新日期：2026-10-01

实施状态：2026-10-01 已完成共享外观接入、网页资源同步、HAP 编译和 DevEco Studio Pura 90 Pro 手机模拟器外观验收。遵循当前项目的手机模拟器交付规则，本轮不重复平板或真机验收。原始视频中 H.264 MP4 通过，两部 HEVC Main 10 MKV 在该模拟器解码失败；此限制按下文“平台差异和风险”单独处理。详细结果见 [`harmonyos-v4.2.1-adaptation-report.md`](harmonyos-v4.2.1-adaptation-report.md)。

## 目标

让 HarmonyOS ArkWeb 客户端与 Android 客户端使用同一套移动端背景和玻璃 UI：连接页、房间列表、同步观影房间、一起听房间、房间弹窗和播放器设置都读取同一份主题状态。

Android 本次改动没有新增服务端协议或原生播放器能力。核心是把 `MobileAppearance` 从“只包首页”扩展为“可包住房间页面的全局外观壳”，再把主题 CSS 变量同步到 `document.documentElement`，使 `body` Portal 弹窗也能继承主题。

## Android 已完成的改动

| 文件 | Android 改动 | 鸿蒙同步要求 |
| --- | --- | --- |
| `src/App.tsx` | 生成 `roomContent`；Android 将房间和首页放入同一个 `MobileAppearance` | 将平台条件从 Android 扩展为 Android 或 HarmonyOS，或抽成 `isGlobalAppearanceRuntime()`；不能让 HarmonyOS 房间继续绕过外观壳 |
| `src/mobile/MobileAppearance.tsx` | 支持 `global`、`room`；监听 `mobile-appearance-open`；向根节点同步 `data-mobile-appearance-theme`、`data-mobile-reduced-motion` 和外观 CSS 变量 | 共享代码可直接复用；确认 ArkWeb 的 `matchMedia`、CSS `backdrop-filter`、`dvh` 和 `data-*` 属性正常工作 |
| `src/mobile/MobileRoom.tsx` | 房间设置增加“外观设置”入口；Android 显示该入口，房间内隐藏悬浮外观按钮 | 鸿蒙应显示同一入口；不需要新增 ArkTS 页面，仍由共享 React 面板处理 |
| `src/mobile/appearance.css` | 增加全局 Material 颜色变量、玻璃变量、房间面板样式、Portal 弹窗样式和播放器黑色画布隔离 | 共享 CSS 通过 `npm run harmony:web` 复制到 `rawfile/web`；在 ArkWeb 真机检查透明度、模糊、层级和安全区 |
| `src/platform/runtime.ts` | 使用 `getRuntimePlatform() === 'android'` 限定 Android 行为 | 改成共享的 `android || harmony` 判断，或增加 `isGlobalAppearanceRuntime()`；不要在组件内直接读取 Capacitor 或 `zviewerNative` |
| `src/mobile/useNativeBack.ts` | 返回键发现 `[data-mobile-appearance]` 时优先关闭外观面板 | 现有 HarmonyOS `onBackPress`/生命周期桥接应继续触发同一网页返回逻辑；无需新增外观专用 ArkTS action |

## 鸿蒙需要修改的内容

### 1. 共享前端层

建议先修改共享代码，使两个 ArkWeb 宿主使用同一行为：

1. 在 `src/platform/runtime.ts` 增加明确的能力函数，例如 `isGlobalAppearanceRuntime()`，返回 Android 或 HarmonyOS。
2. 在 `src/App.tsx` 使用该能力函数决定是否把房间放进 `MobileAppearance`。
3. 在 `src/mobile/MobileRoom.tsx` 使用同一能力函数显示房间内“外观设置”入口。
4. 保持 `MobileAppearance` 的主题存储键和字段不变，避免 Android 与 HarmonyOS 产生两套外观偏好。
5. 运行 TypeScript/Vite 构建，确认 Portal 组件仍可读取根节点的变量。

推荐的判断形式：

```ts
export function isGlobalAppearanceRuntime(): boolean {
  const platform = getRuntimePlatform()
  return platform === 'android' || platform === 'harmony'
}
```

### 2. HarmonyOS 构建与资源同步

执行：

```powershell
npm run harmony:web
```

该命令会重新构建网页并把产物复制到：

```text
ZV-HarmonyOS/entry/src/main/resources/rawfile/web/
```

不要直接修改 `rawfile/web` 里的生成文件。随后在 DevEco Studio 或命令行重新构建 HAP。

### 3. ArkWeb 宿主检查

本次功能原则上不需要新增 ArkTS 原生接口，但需要确认以下已有能力不被全局外观层影响：

| 文件 | 检查项 |
| --- | --- |
| `ZV-HarmonyOS/entry/src/main/ets/pages/Index.ets` | ArkWeb 页面来源、资源拦截、返回事件、状态栏/安全区和 WebView 生命周期不因新增根级 fixed 背景而异常 |
| `ZV-HarmonyOS/scripts/bridge-bootstrap.js` | `window.zviewerNative.platform` 仍为 `harmony`，使 `getRuntimePlatform()` 能正确识别鸿蒙 |
| `ZV-HarmonyOS/entry/src/main/ets/entryability/EntryAbility.ets` | 前后台切换后外观设置和房间状态不丢失 |
| `Index.ets` 麦克风权限逻辑 | 语音面板改为玻璃样式后，权限弹窗和语音面板仍可操作 |

不需要把背景图片、主题值或外观面板复制到 ArkTS；这些属于网页层状态，由 Zustand 持久化到 ArkWeb 的 `localStorage`。

## 鸿蒙验收顺序

1. 共享前端执行 `npm run build`，确认没有 TypeScript/Vite 错误。
2. 执行 `npm run harmony:web`，检查 `rawfile/web` 更新时间和资源完整性。
3. 编译并安装 HarmonyOS HAP。
4. 在连接页打开外观设置，依次验证浅色、深色、跟随系统、玻璃透明度、模糊度、精简动画和背景位置。
5. 创建或加入房间，确认标题栏、聊天/片单/房间面板、语音面板和房间弹窗沿用背景引擎。
6. 切换同步观影与一起听，确认背景层不重建，播放器/音乐播放器仍可操作。
7. 打开房间设置中的外观面板，修改主题后确认视频元素没有被重建。
8. 使用鸿蒙返回键关闭外观面板，再关闭播放器设置、语音面板和全屏，确认返回优先级正确。
9. 横竖屏切换并检查安全区、固定背景、弹窗层级和是否出现水平溢出。
10. 重启应用，确认主题和背景仍从 `localStorage` 恢复。

## 平台差异和风险

- HarmonyOS 使用 ArkWeb，不应假定 Android WebView 的 `backdrop-filter`、`dvh`、视频全屏和 CSS fixed 层行为完全一致，需要真实设备确认。
- 设备媒体解码能力与背景适配无关；H.265/HEVC 播放问题继续按设备解码能力单独处理。
- 播放器区域继续保持黑色画布和独立控件颜色，避免壁纸导致视频控制条对比度不足。
- 外观设置使用 `localStorage`，不会进入房间 Socket 广播，也不应写入服务端房间状态。
- 鸿蒙代理、B 站 Cookie、WBI、CDN 白名单和 Range/HEAD 逻辑不需要因本次外观同步而改变。

## 完成定义

- Android 和 HarmonyOS 的连接页、房间列表、观影房间、一起听房间视觉一致。
- 两个平台都能从房间设置打开外观面板。
- 主题切换不会重建视频或音乐播放器。
- 返回键、旋转、全屏、语音权限和 ArkWeb 生命周期没有回归。
- `npm run harmony:web` 后生成目录与共享源码一致，HAP 构建成功并按当前 `ZV-HarmonyOS/README.md` 的交付设备规则完成验收；本轮使用 Pura 90 Pro 手机模拟器，真机/平板不推断为已通过。
