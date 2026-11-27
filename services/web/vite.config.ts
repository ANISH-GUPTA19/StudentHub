import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8000'
    }
  }
})
