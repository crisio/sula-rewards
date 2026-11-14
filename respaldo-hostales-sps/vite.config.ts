import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // En desarrollo, la API corre con `npm --prefix api run dev` (wrangler) en el puerto 8787.
  server: { proxy: { '/api': 'http://localhost:8787' } },
})
