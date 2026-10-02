import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * dash.js 5.2.0 上游缺陷运行时补丁。
 *
 * dash.js destroy 后，PlaybackController/ABR 规则（BolaRule、
 * SwitchHistoryRule、DroppedFramesRule、StreamController.onEnded 等）的
 * 残留回调仍挂在 video 元素上；此时 getStreamInfo() 已返回 null，
 * 回调内部直接读 `.id` 抛 "can't access property \"id\", D is null"，
 * 每次引擎切换（清理旧 dash 实例）后随 video 事件刷屏。
 *
 * 处理方式：把包产物中所有未判空的 `getStreamInfo().id` 改写为可选链
 * `getStreamInfo()?.id`，残留回调静默降级（id 为 undefined 不再崩溃）。
 * 通过 vite 插件在加载时转换（dev 走 optimizeDeps 的 Rolldown 插件——
 * dashjs 被内联进 .vite/deps 预构建产物，常规 transform 不经过；
 * build 走 Rolldown transform），不修改物理文件、不影响 lockfile。
 * 上游修复后移除本插件即可。
 */
const DASHJS_NULL_GUARD_RULES = [
  { from: 'getStreamInfo().id', to: 'getStreamInfo()?.id' },
] as const

function applyDashjsNullGuards(code: string): string {
  let out = code
  for (const rule of DASHJS_NULL_GUARD_RULES) {
    out = out.split(rule.from).join(rule.to)
  }
  // PlaybackController 的 seeked/progress 回调也持有已被 reset 置空的 streamInfo。
  out = out.replace(/(streamId:\s*)([A-Za-z_$][\w$]*)\.id/g, '$1$2?.id')
  return out
}

/** 是否为 dashjs 的压缩产物文件（esm/umd、all/mss 变体） */
function isDashjsDistFile(id: string): boolean {
  return /dashjs[/\\]dist[/\\].*dash\.all(\.mss)?\.min\.js$/.test(
    id.replace(/\\/g, '/')
  )
}

const dashjsNullGuardPlugin: Plugin = {
  name: 'dashjs-5-2-0-null-guard',
  enforce: 'pre',
  // 生产构建（rollup）：转换 dashjs 产物
  transform(code, id) {
    if (isDashjsDistFile(id)) {
      return applyDashjsNullGuards(code)
    }
  },
}

export default defineConfig({
  plugins: [dashjsNullGuardPlugin, react()],
  resolve: {
    alias: {
      '@': new URL('./src/upstream', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
      mediabunny: new URL('./vendor/mediabunny', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    },
    dedupe: ['mediabunny'],
  },
  optimizeDeps: { exclude: ['playsvideo'], rolldownOptions: { plugins: [dashjsNullGuardPlugin] } },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
})
