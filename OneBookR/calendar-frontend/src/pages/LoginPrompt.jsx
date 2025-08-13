import React from 'react';

const LoginPrompt = () => {
  // NYTT: Skicka med redirect-parametern
  const redirectUrl = window.location.pathname + window.location.search + window.location.hash;
  const googleLoginUrl = `http://localhost:3000/auth/google?redirect=${encodeURIComponent(redirectUrl)}`;

  const handleLogin = () => {
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
