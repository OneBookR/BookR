const isLocalhost = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

// DEBUG: Logga vilken URL som väljs
if (typeof window !== 'undefined') {
  console.log('[API Config] isLocalhost:', isLocalhost);
  console.log('[API Config] hostname:', window.location.hostname);
}

export const API_BASE_URL =
  isLocalhost ? 'http://localhost:3000' : 'https://www.onebookr.se';

console.log('[API Config] Final API_BASE_URL:', API_BASE_URL);

// (Valfritt) console.log provider-stöd
console.log('[Meet Providers] Tillgängliga:', ['meet','teams']);