import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createLiveBridgePlugin } from './server/viteBridgePlugin';

export default defineConfig({
  plugins: [react(), createLiveBridgePlugin()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          react: ['react', 'react-dom', 'zustand'],
        },
      },
    },
  },
});
