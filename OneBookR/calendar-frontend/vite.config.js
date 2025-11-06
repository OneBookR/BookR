import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
      '/invite': 'http://localhost:3000',
      '/accept': 'http://localhost:3000',
      '/compare': 'http://localhost:3000',
    },
  },
});