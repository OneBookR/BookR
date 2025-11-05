const fromVite = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_BASE_URL : undefined;
const isLocalhost = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

export const API_BASE_URL =
  fromVite ||
  (isLocalhost ? 'http://localhost:3000' : 'https://www.onebookr.se');