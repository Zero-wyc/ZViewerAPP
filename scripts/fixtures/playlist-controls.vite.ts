import { defineConfig } from 'vite'
import base from '../../vite.config.ts'
const isolate = {
  name: 'isolated-playlist-room', enforce: 'pre' as const,
  load(id: string) {
    const path = id.replaceAll('\\', '/').split('?')[0]
    if (path.endsWith('/hooks/useSocket.ts')) return 'export const useSocket=()=>({socket:window.__playlistFixture.socket,connected:true});export const resetSocket=()=>{};export const reconnectSocket=()=>{}'
  },
}
export default defineConfig({ ...base,
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.url': '"https://localhost/playlist-fixture.js"' },
  plugins: [isolate, ...base.plugins],
  server: { host: '127.0.0.1', port: 4183, strictPort: true },
  build: { outDir: '.ui-validation/playlist-controls/bundle', emptyOutDir: true, minify: true,
    lib: { entry: 'scripts/fixtures/playlist-controls.tsx', formats: ['iife'], name: 'ZViewerPlaylistControls', fileName: () => 'fixture.js' }, cssCodeSplit: false },
})
