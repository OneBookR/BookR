const isLocalhost = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

// DEBUG
if (typeof window !== 'undefined') {
  console.log('[API Config] isLocalhost:', isLocalhost);
  console.log('[API Config] hostname:', window.location.hostname);
  console.log('[API Config] port:', window.location.port);
}

// ✅ FIX: Tom sträng för localhost (= använd Vite proxy)
export const API_BASE_URL = isLocalhost ? '' : 'https://www.onebookr.se';

console.log('[API Config] Final API_BASE_URL:', API_BASE_URL);