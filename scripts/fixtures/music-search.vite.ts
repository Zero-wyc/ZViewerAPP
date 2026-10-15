import { defineConfig } from 'vite'
import base from '../../vite.config.ts'

// Intercept at the API boundary only in this isolated fixture. Real navigation,
// search pages, query mapping and result components remain in the test bundle.
const isolate = {
  name: 'isolated-music-search-data', enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (id.replaceAll('\\', '/').split('?')[0].endsWith('/upstream/lib/api.ts')) {
      return code.replace('const { _retried, headers, refreshAuth',
        'if ((window as any).__musicSearchResponse) return (window as any).__musicSearchResponse(String(input));\n  const { _retried, headers, refreshAuth')
    }
  },
}
export default defineConfig({
  ...base,
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.url': '"https://localhost/music-search-fixture.js"' },
  plugins: [isolate, ...base.plugins],
  server: { host: '127.0.0.1', port: 4182, strictPort: true },
  build: { outDir: '.ui-validation/music-search/bundle', emptyOutDir: true, minify: true,
    lib: { entry: 'scripts/fixtures/music-search.tsx', formats: ['iife'], name: 'ZViewerMusicSearch', fileName: () => 'fixture.js' }, cssCodeSplit: false },
})
