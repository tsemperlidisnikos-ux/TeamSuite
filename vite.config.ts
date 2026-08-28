import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('recharts') || id.includes('d3-')) return 'charts'
          if (id.includes('pdf-lib') || id.includes('pdfjs')) return 'pdf'
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/')) {
            return 'react-vendor'
          }
          if (id.includes('@vercel/blob') || id.includes('zod')) return 'utils'
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
})
