import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Force a single React instance across the bundle. Without this,
    // Vite's dep pre-bundling can hand react-leaflet (and its
    // @react-leaflet/core sub-dep) their own React copy, which trips
    // React's "Invalid hook call" guard at runtime.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // Pre-bundle these together so they share the deduplicated React.
    include: ['react-leaflet', '@react-leaflet/core', 'leaflet'],
  },
})
