# ZViewer Android

> ZViewer 的 Android 客户端，基于 Capacitor 将 Web 应用包装为原生 APK。

## 项目结构

```
ZViewerAPP/
├── frontend/                 # 前端代码（Vite + React + TypeScript，从主项目独立复制）
│   ├── src/
│   │   ├── pages/
│   │   │   ├── ServerConfigPage.tsx   # 服务器地址配置页（首次启动）
│   │   │   └── BilibiliAccountPage.tsx # B站 账号管理（扫码登录）
│   │   ├── lib/
│   │   │   └── zviewer-plugin.ts      # 原生插件前端桥接层
│   │   └── ...（其余与主项目一致）
│   └── dist/                  # 前端构建产物
├── android/                  # Android 原生工程
│   └── app/src/main/java/com/zviewer/app/
│       ├── MainActivity.java
│       └── plugins/
│           └── ZViewerPlugin.java     # 原生插件（HTTP 代理、视频解析、全屏等）
├── capacitor.config.json     # Capacitor 配置
├── package.json
└── ZViewer-Android-debug.apk # 最新构建产物
```

## 功能特性

### 原生功能（ZViewerPlugin）

| 功能 | 说明 |
|---|---|
| **B站 独立登录** | 扫码登录，Cookie 持久化到本地 SharedPreferences |
| **视频解析** | 直接调用 B站 API 解析视频流，不依赖服务器 |
| **MPD 生成** | 从 B站 DASH 数据生成标准 MPD XML |
| **本地代理** | 本地 HTTP 代理服务器，支持 Range 断点续传，解决 CDN 防盗链 |
| **沉浸式全屏** | 全屏时隐藏系统状态栏/导航栏 |
| **CLI 高画质代理** | 房间内启用 CLI 模式时，使用本地代理获取高画质流 |

### 前端功能

与主项目一致，完整保留：

- 房间系统（创建/加入房间、一起看、房主控制）
- 多源视频（Bilibili、WebDAV、FTP、Emby、Jellyfin 等）
- 弹幕、评论、屏幕共享、主题系统

## 前置条件

| 工具 | 版本 |
|---|---|
| Node.js | >= 18 |
| Java JDK | >= 17 |
| Android SDK | API 36+ |
| Gradle | 通过 gradlew 自动管理 |

## 编译与构建

```powershell
# 1. 构建前端
cd frontend
npm install
npm run build

# 2. 同步到 Android 项目
cd ..
npx cap sync android

# 3. 构建 APK
cd android
$env:ANDROID_HOME = "D:\Software\Windows11\AndroidStudioSDK"
.\gradlew.bat assembleDebug
```

产物在 `android\app\build\outputs\apk\debug\app-debug.apk`，也会自动复制到根目录 `ZViewer-Android-debug.apk`。

## 安装到设备

```powershell
# 连接设备后
adb install -r ZViewer-Android-debug.apk
```

## 首次使用

1. 安装 APK 后打开应用
2. 输入你的 ZViewer 服务器地址（如 `https://your-server.com`）
3. 进入主界面 → 登录/注册账号
4. 进入房间，选择视频源开始播放

## 与主项目的关系

- **前端代码**：从主项目 `ZViewer/frontend` **独立复制**，手动同步
- **原生插件**：`ZViewerPlugin.java` 是 Android 专用，主项目不包含
- **服务器地址**：客户端-服务端分离架构，用户需填写服务器地址

## 常见问题

### 编译失败：ANDROID_HOME 未设置

```powershell
$env:ANDROID_HOME = "D:\Software\Windows11\AndroidStudioSDK"
```

建议将 `ANDROID_HOME` 设为系统环境变量。

### 前端修改不生效

记得重新执行：
```powershell
npm run build && npx cap sync android
```

### 插件注册失败

确保 `MainActivity.java` 在 `super.onCreate()` 之前注册插件：

```java
registerPlugin(ZViewerPlugin.class);
super.onCreate(savedInstanceState);
```

### 模拟器 adb 连接

```powershell
adb connect 127.0.0.1:16416
adb devices
```