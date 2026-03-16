import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy REST API to the collaboration server in dev
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
