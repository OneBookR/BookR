import { useState, useEffect } from 'react';

export const useTheme = () => {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDark));
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  const theme = {
    isDark,
    colors: isDark ? {
      bg: '#121212',
      surface: '#1e1e1e',
      primary: '#90caf9',
      text: '#ffffff',
      textSecondary: '#b0b0b0',
      border: '#333333',
      success: '#81c784',
      error: '#f48fb1',
      warning: '#ffb74d'
    } : {
      bg: '#ffffff',
      surface: '#f8f9fa',
      primary: '#1976d2',
      text: '#000000',
      textSecondary: '#666666',
      border: '#e0e3e7',
      success: '#4caf50',
      error: '#f44336',
      warning: '#ff9800'
    }
  };

  return { theme, toggleTheme };
};