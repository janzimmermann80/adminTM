import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Porty jsou řízené z kořenového .env (stejný soubor jako backend) → jeden zdroj pravdy.
// PORT     = port backendu (cíl proxy /api)  – default 3001
// FE_PORT  = port Vite dev serveru           – default 5173
// Každý projekt má svůj (gitignorovaný) .env, takže se okna VS Code o porty neperou.
export default defineConfig(({ mode }) => {
  const rootDir = fileURLToPath(new URL('..', import.meta.url))
  const env = loadEnv(mode, rootDir, '') // '' = načti i proměnné bez VITE_ prefixu
  const apiPort = env.PORT || '3001'
  const fePort = Number(env.FE_PORT || 5173)

  return {
    plugins: [react()],
    server: {
      port: fePort,
      strictPort: true, // radši spadni, než tiše naskočit na jiný port a rozbít proxy jinde
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
    base: '/new/',
    build: {
      outDir: 'dist',
    },
  }
})
