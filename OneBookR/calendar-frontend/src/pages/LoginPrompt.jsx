import React from 'react';
import { API_BASE_URL } from '../config';

const LoginPrompt = () => {
  const handleLogin = () => {
    // Skapa state med aktuell URL för att komma tillbaka hit efter login
    const currentUrl = window.location.pathname + window.location.search + window.location.hash;
    const state = btoa(JSON.stringify({ returnUrl: currentUrl }));
    const googleLoginUrl = `${API_BASE_URL}/auth/google?state=${encodeURIComponent(state)}`;
    window.location.href = googleLoginUrl;
  };

  return (
    <div>
      <h2>Vänligen logga in</h2>
      <button onClick={handleLogin}>Logga in med Google</button>
    </div>
  );
};

export default LoginPrompt;
