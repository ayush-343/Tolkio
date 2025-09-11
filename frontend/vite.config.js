import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API requests during development to the backend server so that
    // the browser sees a same-origin request and cookies (jwt) will be
    // stored/sent correctly while running Vite on a different port.
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Put all node_modules into a single vendor chunk to avoid
          // circular cross-chunk initialization issues (eg. stream packages
          // referencing each other across chunks which can access
          // lexical bindings before initialization).
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1200, // increase warning limit to focus on real issues
  },
})
