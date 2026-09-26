import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const DEV_API_ORIGIN = 'https://teamsuite-seven.vercel.app'
const APP_BUILD_ID =
  (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '').slice(0, 12) ||
  `dev-${Date.now()}`

function appVersionPlugin(): Plugin {
  const payload = JSON.stringify({
    buildId: APP_BUILD_ID,
    builtAt: new Date().toISOString(),
  })
  return {
    name: 'app-version',
    configureServer(server) {
      server.middlewares.use('/app-version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(payload)
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'app-version.json',
        source: payload,
      })
    },
  }
}

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
  define: {
    __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
  },
  plugins: [react(), skipVercelApiAsFrontend(), appVersionPlugin()],
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
