import { defineConfig } from 'vite'
import base from '../../vite.config'

// Keep the real shell, widget, full player, queue, store and layout hook.
// Stub unrelated network pages and OS media session writes during UI acceptance.
const isolate = {
  name: 'isolated-music-queue-data', enforce: 'pre' as const,
  load(id: string) {
    const path = id.replaceAll('\\', '/').split('?')[0]
    const page = path.match(/\/modules\/music\/pages\/(Music\w+Page)\.tsx$/)
    if (page) return `export const ${page[1]}=()=>null`
    if (path.endsWith('/music/components/MusicSideDock.tsx')) return 'export const MusicSideDock=()=>null'
    if (path.endsWith('/music/hooks/useMediaSession.ts')) return 'export const useMediaSessionSync=()=>{}'
    if (path.endsWith('/hooks/useCliAgent.ts')) return 'export const useCliAgent=()=>({agents:[]});export const CLI_DEFAULT_PORT=9333;export const CLI_HEALTH_URL=""'
    if (path.endsWith('/music/hooks/useNcmLogin.ts')) return 'export const useNcmLogin=()=>({});export const ncmVipLabel=()=>""'
  },
}
export default defineConfig({
  ...base,
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.url': '"https://localhost/music-queue-fixture.js"' },
  plugins: [isolate, ...base.plugins],
  server: { host: '127.0.0.1', port: 4181, strictPort: true },
  build: { outDir: '.ui-validation/music-queue/bundle', emptyOutDir: true, minify: true,
    lib: { entry: 'scripts/fixtures/music-queue.tsx', formats: ['iife'], name: 'ZViewerMusicQueue', fileName: () => 'fixture.js' }, cssCodeSplit: false },
})
