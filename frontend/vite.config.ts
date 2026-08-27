import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['events', 'stream', 'util', 'buffer', 'process'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Split the large, rarely-changing vendor libraries into their own
        // long-cached chunks so they load in parallel and stay cached across
        // routes and deploys. Purely a bundling change — no runtime behaviour.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@mui') || id.includes('@emotion')) return 'vendor-mui'
          if (id.includes('@tanstack')) return 'vendor-query'
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('react-router') ||
            id.includes('@remix-run') ||
            id.includes('/scheduler/')
          ) return 'vendor-react'
          // No catch-all: everything else stays with the code that imports it,
          // exactly as before. Keeps the split acyclic and avoids a giant
          // shared vendor blob.
          return undefined
        },
      },
    },
  },
  server: {
    host: true,
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
