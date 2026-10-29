import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    // GitHub Pages publica el repo en https://crisio.github.io/sula-rewards/. En local o con dominio propio: VITE_BASE=/
    base: env.VITE_BASE || '/sula-rewards/',
    plugins: [react()],
  }
})
