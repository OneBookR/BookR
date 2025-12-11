import React from 'react';
import { API_BASE_URL } from '../config';
import GoogleLogo from '../assets/GoogleLogo.jsx';

const LoginPrompt = () => {
  const handleLogin = () => {
    // Skapa state med aktuell URL för att komma tillbaka hit efter login
    const currentUrl = window.location.pathname + window.location.search + window.location.hash;
    const state = btoa(JSON.stringify({ returnUrl: currentUrl }));
    const googleLoginUrl = `https://www.onebookr.se/auth/google?state=${encodeURIComponent(state)}`;
    window.location.href = googleLoginUrl;
  };

  return (
    <div>
      <h2>Vänligen logga in</h2>
      <button onClick={handleLogin} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#4285f4', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
        <GoogleLogo size={20} />
        Logga in med Google
      </button>
    </div>
  );
};

export default LoginPrompt;
