import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const DEV_API_ORIGIN = 'https://teamsuite-seven.vercel.app'

/** Vercel `api/*.ts` handlers are not frontend modules. Do not parse them as CSS/JS. */
function skipVercelApiAsFrontend() {
  return {
    name: 'skip-vercel-api-as-frontend',
    enforce: 'pre' as const,
    resolveId(source: string) {
      const bare = source.split('?')[0]?.replace(/\\/g, '/') ?? ''
      if (
        bare === '/api/club-media' ||
        bare.endsWith('/api/club-media') ||
        /(^|\/)api\/.+\.ts$/.test(bare)
      ) {
        return { id: source, external: true }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), skipVercelApiAsFrontend()],
  server: {
    proxy: {
      '/api': {
        target: DEV_API_ORIGIN,
        changeOrigin: true,
        secure: true,
      },
    },
  },
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
