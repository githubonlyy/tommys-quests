import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // relative base so the build works at any URL path (GitHub Pages subpath included)
  base: './',
  plugins: [react(), tailwindcss()],
  // host:true so the tablet on the same WiFi can reach the dev server
  // allowedHosts lets Tailscale-served hostnames through Vite's host check
  server: { host: true, port: 5173, allowedHosts: ['.ts.net'] },
})
