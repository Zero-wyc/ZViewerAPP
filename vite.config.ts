import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': new URL('./src/upstream', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
      mediabunny: new URL('./vendor/mediabunny', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    },
    dedupe: ['mediabunny'],
  },
  optimizeDeps: { exclude: ['playsvideo'] },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
})
