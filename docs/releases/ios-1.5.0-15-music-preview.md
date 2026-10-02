# b15 展开音乐播放器对齐补充

2026-10-02。用户指出展开页仍是旧界面。本次只修改指定客户端仓库的 iOS RN 展示与维护资料；源码仍为 1.5.0 / 15，**没有新增 EAS Build/Update 或 IPA**。

对照共享 ListenTogetherPanel、PlayerCardFace、PlayerSongControl、PlayerLyricPanel，实现封面背景模糊、播放卡与四角装饰、线条播放图标、音量、图标工具栏和独立歌词区。播放/seek/切歌/模式继续使用原有房主控制与观众申请，保留 VLC 和系统媒体所有权。

- iPad 竖屏和横屏均双栏；仅宽度低于 768pt 的竖屏手机使用单栏，并在播放卡/完整歌词之间切换。平板竖屏平衡卡与歌词宽度，避免歌词挤成窄列。
- 封面使用明确 width/height 与 contain，保留原图比例；按可用高度缩小，不再用百分比宽度与 aspectRatio 推算原生高度。短横屏播放键并入歌手行，音量仍可在浮动条调整。
- 歌词保留全部行、独立滚动、当前行反色、播放跟随、拖动后延迟恢复，点击沿用真实 seek 权限；无歌词不留下大块空栏。
- 默认浅色播放卡，与双端独立播放器色调一致；工具栏可切换并保存深浅色，不重建主音频。关联视频/队列/评论/播放模式/设置收进图标入口。队列与评论继续采用 iOS 弹窗过渡，没有伪装成双端侧边评论面板。
- 设置可更改播放模式和音质。纯净视频等待当前 VLC 加载代次就绪才可进入，避免 Expo Go 缺少内核时进入空白页；视频错误恢复播放信息层。

验证：59/59 单测、lint/typecheck、iOS/Web JS 导出通过。新增播放页 Web 31 项，覆盖 1180×820、820×1180、970×1390、390×844、844×390、320×568，封面宽高、控件边界、单双栏、80 行歌词、空队列、切换色调与真实房间模式更新。原房间 Web 59 项复验通过。两组 0 JS 异常；使用隔离官方 v4.2.1，本次封面和歌词是 fixture，不是音乐服务或播放验收。证据见 [music-evidence](ios-1.5.0-15-music-evidence.json)。

截图均为 RN Web 导出：[iPad 竖屏](ios-1.5.0-15-music-ui/expanded-music-820x1180.png)、[横屏](ios-1.5.0-15-music-ui/expanded-music-1180x820.png)、[手机](ios-1.5.0-15-music-ui/expanded-music-390x844.png)、[短横屏](ios-1.5.0-15-music-ui/expanded-music-844x390.png)、[小屏](ios-1.5.0-15-music-ui/expanded-music-320x568.png)。

现有 Expo Go 项目 Reload 查看。Metro 本机 manifest 和最新 iOS JS HTTP200，bundle 含新版卡/工具栏；本机外网 tunnel 探测超时，未把它记为成功。设备安全区/大字体/原生模糊/动画/旋转与实际音频仍待用户复验。原计划 I13 后台业务 Socket、系统完整歌词页等限制沿用；不宣称全应用像素级等价。界面确认前不提交云端构建。
