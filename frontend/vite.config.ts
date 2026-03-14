import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // HTTPS dev varianta: omogoči secure context za kamero na telefonih/tablicah.
    // Vklopi z: VITE_HTTPS=1 npm run dev:https
    ...(process.env.VITE_HTTPS === '1' ? [basicSsl()] : []),
  ],
  server: {
    https: process.env.VITE_HTTPS === '1',
    // Stabilen port: če je že zaseden, naj Vite FAIL-a namesto da skoči na 5174/5175 ...
    // To prepreči situacijo, kjer teče več instanc in potem imaš razlike med http/https in "utripanje".
    port: 5173,
    strictPort: true,
    proxy: {
      // Omogoči klice iz drugih naprav (Network URL): browser kliče Vite, Vite proxy-ja na backend.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
