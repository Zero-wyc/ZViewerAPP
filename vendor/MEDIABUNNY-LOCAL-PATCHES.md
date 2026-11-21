# mediabunny 与 playsvideo 维护记录

Android 和 HarmonyOS 共用 `mediabunny@1.66.2` 的 npm 模块副本，许可证位于
[`mediabunny/LICENSE`](mediabunny/LICENSE)。依赖来自服务端 `f7b2a589`。

```sh
node vendor/fetch-mediabunny.mjs
node vendor/local-patches.mjs --check
npm run test:playsvideo
```

- 抓取脚本锁定 npm 版本，按文件清单重建 `mediabunny/dist/modules`，保留许可证和最小入口配置。
- 1.66.2 已内建 Matroska DTS 编码映射和 FLAC MP4 位深读取，原 mediabunny 本地补丁退役。
- playsvideo 的 `dist/pipeline/demux.js` 保留音轨兼容规则。音轨须可识别、具备 decoder config，且能被当前 fMP4 或音频 WASM 管线处理。TrueHD 虽可识别，仍会让位给可用音轨；没有可用音轨时，有视频的片源继续播画面。
- 纯音频重封装使用时间分段。客户端的 MKV 内嵌字幕由 `src/upstream/modules/subtitles/mkv-embedded.ts` 独立提取。保留 playsvideo 的本地 MKV cue、音频时间轴及移动端 WASM 加载适配。
