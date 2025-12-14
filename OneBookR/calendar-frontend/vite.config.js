import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ✅ LÄSA VERSION FRÅN package.json FÖR CACHE-BUSTING
const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
const appVersion = packageJson.version;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      react: resolve(__dirname, './node_modules/react'),
      'react-dom': resolve(__dirname, './node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // ✅ ROBUST PROXY - BACKEND MED LOGGING
    proxy: {
      '/auth': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('🚨 [Vite Proxy Error]:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('📤 [Vite Proxy]:', req.method, req.url, '-> http://127.0.0.1:3000' + req.url);
          });
        }
      },
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('🚨 [Vite Proxy Error]:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('📤 [Vite Proxy]:', req.method, req.url, '-> http://127.0.0.1:3000' + req.url);
          });
        }
      }
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
        // ✅ CACHE-BUSTING: Lägg till hash i filnamn
        entryFileNames: 'js/[name]-[hash].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|gif|svg/.test(ext)) {
            return `assets/images/[name]-[hash][extname]`;
          } else if (/woff|woff2|eot|ttf|otf/.test(ext)) {
            return `assets/fonts/[name]-[hash][extname]`;
          } else if (ext === 'css') {
            return `css/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
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