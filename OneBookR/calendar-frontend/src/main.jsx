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

// Initialisera version-check för cache-busting
versionCheck.init();

// Registrera Service Worker för offline-support och cache-kontroll
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('Service Worker registration failed:', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
