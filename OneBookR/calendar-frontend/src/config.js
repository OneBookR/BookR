// ✅ SIMPLIFIED CONFIG - API URLs now handled by apiConfig.js
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

// ✅ ENVIRONMENT FLAGS
export const IS_DEVELOPMENT = isDevelopment;
export const IS_PRODUCTION = isProduction;

// ✅ BASIC URLs FOR DISPLAY ONLY
export const HOME_URL = isDevelopment
  ? 'http://localhost:5173'
  : 'https://www.onebookr.se';

export const CURRENT_HOST = typeof window !== 'undefined' ? window.location.hostname : '';

// ✅ LEGACY EXPORTS FOR COMPATIBILITY
export const API_BASE_URL = isDevelopment ? 'http://localhost:3000' : 'https://www.onebookr.se';
export const LOGOUT_URL = isDevelopment ? 'http://localhost:3000/auth/logout' : 'https://www.onebookr.se/auth/logout';

// ✅ FEATURE FLAGS
export const FEATURES = {
  NOTIFICATIONS: true,
  PWA: true,
  DARK_MODE: true,
  TUTORIALS: true,
  CONTACT_MANAGEMENT: true
};

// ✅ DEBUG ONLY IN DEVELOPMENT
if (isDevelopment && typeof console !== 'undefined') {
  console.log('[Config] Environment:', isProduction ? 'production' : 'development');
  console.log('[Config] API Base URL:', 'vite proxy');
  console.log('[Config] Logout URL:', '/auth/logout');
  console.log('[Config] Home URL:', HOME_URL);
  console.log('[Config] Host:', CURRENT_HOST);
}