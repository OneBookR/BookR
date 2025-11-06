import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/mobile.css';
import './styles/theme.css';

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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
