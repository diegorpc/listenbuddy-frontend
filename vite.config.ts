import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_BASE_URL?.replace(/\/$/, '')
  const shouldProxy = Boolean(apiUrl && /^https?:\/\/localhost(?::\d+)?$/.test(apiUrl))

  const serverConfig: Record<string, unknown> = {
    cors: {
      origin: true,
      credentials: false,
    },
  }

  if (shouldProxy && apiUrl) {
    serverConfig.proxy = {
      '/api': {
        target: apiUrl,
        changeOrigin: true,
        secure: false,
      },
    }
  }

  return {
    plugins: [
      vue(),
      vueJsx(),
      vueDevTools(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    server: serverConfig,
  }
})
