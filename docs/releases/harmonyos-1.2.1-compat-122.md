# HarmonyOS 6.1 compatibility candidate — 1.2.1 build 122

- `compatibleSdkVersion`: `6.1.0(23)`，覆盖 HarmonyOS 6.1 的 API 23 及以上设备。
- `targetSdkVersion`: 仍为 `26.0.0`；使用 API 26 SDK 编译。
- 应用 `versionName` 保持 `1.2.1`，`versionCode` 从 121 提升到 122，便于覆盖升级。
- `assembleApp` Release 构建成功；包内元数据确认 compatible API 23、target API 26，独立 HAP 的 Release 签名验证通过。
- 已连接的 ALN-AL10 真机为 HarmonyOS 6.1.0.135、API 24。直接使用 `hdc install` 安装 Release 签名 HAP 返回 `9568322: not trusted app source`，需要测试签名或合规分发渠道才能在真机继续验证。此错误发生在签名来源检查，尚未到应用启动阶段。
- 用户已确认兼容版真机测试通过。测试签名或设备分发签名仍是将 Release HAP 安装到真机的独立要求；具体测试项目以用户实际验收为准。
- 本地 `build-profile.json5` 带有私有签名配置；提交到仓库的版本仅含 SDK 兼容值，不含证书路径或密码。
