# 用户反馈修订与第16轮原生验收

2026-10-22。源码在完整 check20（补丁、lint、TypeScript、409 / 409项）后冻结，仅将设备 build 元数据从26递增为27。第16次 Simulator Debug 构建成功，已安装并运行于 iPhone17Pro / iOS26.5及 iPadPro11M5 / iPadOS26.5。第二次 device ARM64 Release 生成[未签名IPA27](../ios-device-ipa-27-2026-10-22.json)；实际交付路径和检查以[设备证据](../ios-device-ipa-27-2026-10-22.json)为准。旧26包字节及摘要保持不变，没有 EAS、公开发布或 NAS 配置变更。

## 用户真机反馈

用户报告旧26包“一起听功能全部正常，包括原生音乐控件”。这支持用户实际安装、启动和所报音乐功能正常；机型、系统版本、时长及全部操作步骤未提供。它是用户报告，不能冒充主任务独立测量，也不能删除早期 Simulator 卡未显示、起播偏移、装饰恢复等历史事实。本轮没有重复音乐后台或投屏推流测试。

## 本轮结果

| 修改 | 实际结果 | 证据与边界 |
| --- | --- | --- |
| 连接页证书选项 | iPad原生连接页存在“允许服务器使用不受信任的证书”，默认关闭 | [26图](26-ipad-server-certificate.png)。偏好按HTTPS origin保存，独立端口、语音与CDN不共享例外。 |
| 证书传输 | 新原生桥 + React Native fetch / WebSocket，合成自签服务的23个检查均通过 | [结构化结果](server-certificate-build16.json)：严格拒绝→选定origin允许，JSON / Range / 图片响应 / Engine.IO、同源重定向、异origin严格验证、撤销活动HTTP及WS。发现RN默认WS Origin被现有Go代理拒绝，已仅为证书本地通道设置受支持Origin并实际复验。不是物理设备或VLC解码媒体验收。 |
| 投屏聊天布局 | phone旋转为横屏后聊天在右侧，竖屏在下方；手动全屏隐藏聊天，退出恢复，草稿保留 | [20图](20-casting-portrait-chat.png)、[21图](21-casting-landscape-chat.png)。只验接收页布局及等待场景，不重复媒体传输测试。 |
| 音乐设置 | 删除首排默认来源选择器，首项为网易云音质；“我的音乐”库仍保留 | [22图](22-music-settings.png)。音乐播放生命周期未变。 |
| 房间评论 | 右缘把手打开右侧滑出面板；phone横竖屏、键盘避让、发送测试消息、关闭重开后消息保留 | [23图](23-music-discussion-keyboard.png)、[24图](24-music-discussion-portrait.png)。滑动手势有实际组件回归，原生此次用AX点击开关；不把点击验证写成原生拖动验证。歌曲评论保持独立。 |
| 更多菜单 | phone和iPad当前竖屏窗口中紧贴省略号下方；phone旋转后底部不足一行时贴按钮上方 | [25图](25-watch-more-below.png)、[27图](27-ipad-watch-more-below.png)。以实际菜单内容高度及Modal坐标定位，旋转重测；不能宣称所有屏幕位置都能向下完整展开。iPad RotateLeft尝试没有改变portrait系统窗口，不记为iPad横屏通过。 |
| B站自动弹幕与隔离 | 实现及23项相关回归通过；本轮NAS原生切片验收仍阻塞 | 下述有限协议对照不能记自动轨道或P1→P2→MP4原生通过。 |

## B站原生验收的未定位阻塞

公开素材为BV19E411D78Q：P1 CID1475633911实际NAS弹幕接口1200条，P2 CID1475635389为2623条。独立test-operator账号测试房准备三个影片：P1、P2和公共MP4，未改用户其他房间。

phone测试房的REST及Node注册房主后Socket列表均包含数字ID75、76、77。原生真实UI发出的 `play-movie` 已记录为正确roomId及数字75；收到相应ACK `{success:false,message:"影片不存在"}`。Node注册同房后，标准数字75播放ACK成功且收到current-movie75。没有靠字符串重试或重复添加影片规避。此对照只证明两条实际路径表现不同，未定位成缓存、权限、cookie或具体服务端缺陷。

iPad随后按真正应用界面创建新一起看房间，直接register-host，不走调试自动入房；REST添加78、79、80后，UI播放78仍呈现相同错误。因此“仅调试asHost0路径导致”假设未成立。 随后在该iPad真实已连接的NAS WebSocket上只读查询request-movie-list，返回movies为空；紧接REST查询仍为数字78、79、80。此为同房REST与原生Socket实际状态不一致的直接证据（[28图](28-ipad-empty-nas-runtime-list.png)），尚不能据此断定多进程、权限或具体缓存实现。新Bili默认轨道、分P切换清旧轨道和再切MP4的原生结果均未记通过，仍需解决实际切片拒绝后补验。

实现中的作用域是movie ID、来源、CID、epId及currentPage，不包含令牌或播放时钟。自动CID查询取消旧读取；本客户端新轨道ID绑定媒体作用域，真切片清理排在已提交旧写ACK之后，旧排队写不再提交；viewer只本地加载、不冒充管理写权限。NAS旧协议没有movie字段，无作用域手动轨道仅初次当前片兼容，真切片后忽略；本次会话显式删除自动轨道会抑制重加，完整重新入房仍按自动加载策略取得。默认轨道隐藏及偏移不会被迟到自动读取覆盖。这些有23项专项及全量409项回归支持，不能替代本段缺少的原生切片验收。

仍保留此前独立问题：Jellyfin小MKV暂停seek灰屏与HLS小数定位、所选CMS / AniSubs上游失败、iPad真实resize及跨平台设备分支。609行清单没有整体关闭。
