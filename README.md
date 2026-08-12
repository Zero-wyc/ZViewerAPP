<div align="center">
  <img src="frontend/favicon.jpg" alt="ZViewer Logo" width="120" height="120" style="border-radius: 24px;">
  <h1>ZViewer</h1>
  <p>跨平台在线视频播放与屏幕共享平台</p>
  <p>
    <strong>React + TypeScript + Capacitor + Vite</strong>
  </p>
</div>

---

## 简介

ZViewer 是一个功能丰富的在线视频播放与屏幕共享平台，同时支持 **Web 浏览器** 和 **Android 移动端** 访问。它提供流畅的视频播放体验、多人同步观影房间、实时屏幕共享、弹幕互动等功能，适合与朋友一起远程观影或协作演示。

> ZViewer 需要配合 [ZViewer 后端服务](https://github.com/nicepkg/zviewer-server) 一起使用。

## 截图

| 首页 | 观影房间 | 屏幕共享 |
|------|----------|----------|
| ![Home](screenshots/home.png) | ![Room](screenshots/room.png) | ![Share](screenshots/share.png) |

## 功能特性

### 🎬 视频播放
- 支持多种流媒体协议：**HLS**、**DASH**、**FLV**、**MP4** 等
- 基于 **ArtPlayer** 的高性能播放器，支持自定义控件
- 弹幕系统（实时弹幕与预加载弹幕）
- 字幕解析与叠加显示（SRT/ASS/VTT 等格式）
- 播放进度记忆与同步
- 倍速播放、画中画、全屏等标准功能

### 🖥️ 屏幕共享
- 推流端实时捕获屏幕/窗口/浏览器标签页
- 观看端通过 **FLV over HTTP** 拉流低延迟观看
- 清晰度选择、暂停共享、连接状态面板
- 支持 WebRTC 与 HTTP-FLV 混合传输方案

### 👥 多人观影房间
- 创建/加入观影房间，邀请链接一键分享
- **同步播放**：房主控制播放进度，所有成员实时同步
- 内置 **Bilibili 番剧** 解析与选集
- 影片列表管理与推送
- 观影房间信息面板与成员列表
- 房间内实时弹幕聊天
- 影院模式布局

### 🌐 媒体源集成
- **Emby** 媒体库浏览
- **Jellyfin** 媒体库浏览
- **WebDAV** 挂载浏览
- **FTP** 浏览
- **文件系统挂载** 管理
- **开放列表**（Open List）挂载
- **AniSubs** 字幕搜索与集成
- **Kazumi** 番剧聚合选择

### 🎤 语音聊天
- 房间内实时语音通信
- 麦克风控制与状态指示

### 🔐 用户系统
- 注册/登录凭据认证
- **Guest 匿名降级**：未登录用户自动获取匿名身份
- 身份角色：管理员、已登录用户、访客
- Bilibili 账号绑定
- 个人资料设置

### 👑 管理后台
- 用户管理（列表、角色分配、状态管理）
- 系统设置（注册开关、站点名称、公告等）
- AniSubs 字幕源管理
- 服务器端文件管理
- Bilibili 下载任务管理

### 🎨 主题系统
- **Material Design 3 (Material You)** 动态主题
- 基于壁纸自动提取色彩（`@material/material-color-utilities`）
- 亮色/暗色模式切换
- 自定义强调色
- 全站统一的设计语言

### 📱 跨平台
- **Web**：部署至任意静态服务器即可访问
- **Android**：通过 Capacitor 打包为原生 APK
- 响应式布局，适配手机与平板

## 技术栈

| 技术 | 说明 |
|------|------|
| **React 18** | UI 框架 |
| **TypeScript** | 类型安全 |
| **Vite 8** | 构建工具 |
| **Tailwind CSS** | 原子化样式 |
| **Material Design 3** | 动态色彩系统 |
| **Zustand** | 轻量级状态管理 |
| **React Router v6** | 路由管理 |
| **ArtPlayer** | 核心视频播放器 |
| **hls.js / dash.js / flv.js** | 流媒体协议支持 |
| **danmaku.js** | 弹幕渲染引擎 |
| **Socket.IO** | 实时通信 |
| **Capacitor 8** | 跨平台容器（Android） |
| **Lucide React** | 图标库 |

## 开始使用

### 环境要求

- **Node.js** >= 18
- **npm** >= 9

### 安装与运行

```bash
# 1. 克隆项目
git clone https://github.com/nicepkg/ZViewerAPP.git
cd ZViewerAPP

# 2. 安装依赖
npm install
cd frontend && npm install && cd ..

# 3. 配置环境变量（可选）
# 复制示例文件并根据需要修改
cp frontend/.env.example frontend/.env

# 4. 启动开发服务器
cd frontend && npm run dev
```

开发服务器默认运行在 `http://localhost:5174`，API 代理到 `http://localhost:3333`（可通过 `VITE_API_TARGET` 环境变量修改）。

### 构建生产版本

```bash
cd frontend && npm run build
```

构建产物输出到 `frontend/dist/` 目录，可部署到任意静态文件服务器。

### Android 构建

```bash
# 同步 Capacitor 配置
npx cap sync

# 使用 Android Studio 打开并构建
npx cap open android
```

预构建的 APK 文件位于项目根目录 `ZViewer-Android-debug.apk`。

## 项目结构

```
ZViewerAPP/
├── android/                    # Android 原生项目（Capacitor）
├── frontend/                   # 前端源码
│   ├── public/                 # 静态资源
│   ├── src/
│   │   ├── components/         # 通用组件
│   │   │   ├── ui/             # 基础 UI 组件（Button, Input, Modal 等）
│   │   │   ├── VideoPlayer/    # 视频播放器组件
│   │   │   └── VideoControls/  # 播放器控制组件
│   │   ├── hooks/              # 自定义 Hooks
│   │   ├── lib/                # 工具库（API 请求、主题、字幕解析等）
│   │   ├── modules/            # 功能模块
│   │   │   ├── room/           # 观影房间
│   │   │   ├── screen-sharing/ # 屏幕共享
│   │   │   ├── voice-chat/     # 语音聊天
│   │   │   ├── emby/           # Emby 集成
│   │   │   ├── jellyfin/       # Jellyfin 集成
│   │   │   ├── webdav/         # WebDAV 集成
│   │   │   ├── ftp/            # FTP 集成
│   │   │   ├── mounts/         # 挂载管理
│   │   │   ├── bilibili/       # Bilibili 解析
│   │   │   ├── anisubs/        # AniSubs 字幕
│   │   │   ├── kazumi/         # Kazumi 番剧
│   │   │   ├── server-files/   # 服务器文件管理
│   │   │   ├── admin/          # 管理后台
│   │   │   ├── art-player/     # 直播播放器
│   │   │   └── ...             # 其他模块
│   │   ├── pages/              # 页面级组件
│   │   ├── store/              # Zustand 状态管理
│   │   ├── types/              # TypeScript 类型定义
│   │   ├── utils/              # 工具函数
│   │   ├── App.tsx             # 应用入口及路由
│   │   ├── main.tsx            # 渲染入口
│   │   └── index.css           # 全局样式
│   ├── index.html
│   ├── vite.config.ts          # Vite 配置
│   ├── tailwind.config.js      # Tailwind 配置
│   ├── tsconfig.json           # TypeScript 配置
│   └── package.json
├── capacitor.config.json       # Capacitor 配置
├── package.json                # 根依赖（Capacitor CLI）
└── ZViewer-Android-debug.apk   # 预构建 Android APK
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_API_TARGET` | 后端 API 地址 | `http://localhost:3333` |
| `VITE_LIVE_TARGET` | HTTP-FLV 直播拉流地址 | `http://localhost:3335` |

## 相关项目

- [ZViewer 后端服务](https://github.com/nicepkg/zviewer-server) — Go 语言编写的后端服务，提供 API、WebSocket、流媒体转发等能力

## 许可

本项目基于 [ISC License](LICENSE) 开源。