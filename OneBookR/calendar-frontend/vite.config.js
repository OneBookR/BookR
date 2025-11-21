import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/auth': 'http://127.0.0.1:3000',
      '/api': 'http://127.0.0.1:3000',
      '/invite': 'http://127.0.0.1:3000',
      '/accept': 'http://127.0.0.1:3000',
      '/compare': 'http://127.0.0.1:3000',
    },
  },
});