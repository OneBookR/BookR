const host = typeof window !== 'undefined' ? window.location.hostname : '';
const port = typeof window !== 'undefined' ? window.location.port : '';
const isLocalNetwork = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3})$/.test(host);

// Tillåt override via env (Vite)
const envBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) || undefined;

// ✅ Använd Vite-proxy när vi kör lokalt eller via LAN-IP eller på dev-porten
export const API_BASE_URL = envBase ?? ((isLocalNetwork || port === '5173') ? '' : 'https://www.onebookr.se');

// NYTT: enkel debug-varning (ej blockerande)
if (typeof window !== 'undefined' && host !== 'localhost' && API_BASE_URL === '') {
  console.warn('[BookR] Du använder dev via IP:', host, '- se till att DEV_HOST matchar backend callback-URL annars tappar du session.');
}

// DEBUG
if (typeof window !== 'undefined') {
  console.log('[API Config] host:', host, 'port:', port, 'isLocalNetwork:', isLocalNetwork);
  console.log('[API Config] Final API_BASE_URL:', API_BASE_URL || '(vite proxy)');
}

export const CURRENT_HOST = host;