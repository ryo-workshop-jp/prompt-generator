import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/prompt-generator/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@dnd-kit')) return 'dnd-kit';
          if (id.includes('@heroicons')) return 'icons';
          if (id.includes('react')) return 'react';
          return 'vendor';
        }
      }
    }
  },
  // 保存はブラウザー内とExportで行う。開発サーバーにはファイル書き込みAPIを置かない。
  plugins: [react()],
})
