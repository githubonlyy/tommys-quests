import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // host:true so the tablet on the same WiFi can reach the dev server
  server: { host: true, port: 5173 },
})
