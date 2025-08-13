import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Lägg till denna rad
    proxy: {
      '/auth': 'http://localhost:3000',
      '/invite': 'http://localhost:3000',
      '/accept': 'http://localhost:3000',
      '/compare': 'http://localhost:3000',
    },
  },
});