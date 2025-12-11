import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // ✅ ENKEL PROXY - BARA BACKEND
    proxy: {
      '/auth': 'http://127.0.0.1:3000',
      '/api': 'http://127.0.0.1:3000',
    },
  },
  build: {
    // ✅ OPTIMERA BUILD
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          calendar: ['react-big-calendar', 'moment'],
          mui: ['@mui/material', '@mui/icons-material'],
        },
      },
    },
    // ✅ MINDRE BUNDLE SIZE
    target: 'es2020',
    minify: 'terser',
    sourcemap: false,
  },
  // ✅ OPTIMERA DEPENDENCIES
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-big-calendar', 'moment'],
  },
});