import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    include: ['@line/liff']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@line/liff')) return 'liff'
          if (id.includes('node_modules')) return 'vendor'
        }
      }
    }
  }
})
