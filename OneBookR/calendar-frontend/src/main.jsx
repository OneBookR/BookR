import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/mobile.css';
import './styles/theme.css';
import { versionCheck } from './services/versionCheck';

// NYTT: Initiera tema från localStorage vid start
const initializeTheme = () => {
  const isDarkMode = localStorage.getItem('darkMode') === 'true';
  document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  if (isDarkMode) {
    document.documentElement.style.colorScheme = 'dark';
  }
};

initializeTheme();

// Lyssna på tema-ändringar
window.addEventListener('storage', (e) => {
  if (e.key === 'darkMode') {
    initializeTheme();
  }
});

if (import.meta.env.PROD) {
  // Version checks and service workers are production-only.
  // In development they can cache stale Vite assets and break optimized deps.
  versionCheck.init();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('Service Worker registration failed:', err);
      });
    });
  }
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));

      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      }
    } catch (error) {
      console.warn('Development cache cleanup failed:', error);
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
