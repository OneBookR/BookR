// ✅ ENKEL OCH ROBUST CONFIG
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

// ✅ SMART API BASE URL DETECTION
export const API_BASE_URL = (() => {
  // Vite environment variable override
  if (import.meta.env?.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // Development: Use Vite proxy (empty string)
  if (isDevelopment) {
    return '';
  }
  
  // Production: Use www subdomain consistently
  return 'https://www.onebookr.se';
})();

// ✅ LOGOUT URL BASERAT PÅ ENVIRONMENT
export const LOGOUT_URL = isDevelopment 
  ? '/auth/logout'  // Vite proxy
  : 'https://www.onebookr.se/auth/logout';

// ✅ HOME URL BASERAT PÅ ENVIRONMENT  
export const HOME_URL = isDevelopment
  ? 'http://localhost:5173'
  : 'https://www.onebookr.se';

// ✅ ENKEL HOST DETECTION
export const CURRENT_HOST = typeof window !== 'undefined' ? window.location.hostname : '';

// ✅ ENVIRONMENT FLAGS
export const IS_DEVELOPMENT = isDevelopment;
export const IS_PRODUCTION = isProduction;

// ✅ FEATURE FLAGS
export const FEATURES = {
  NOTIFICATIONS: true,
  PWA: true,
  DARK_MODE: true,
  TUTORIALS: true,
  CONTACT_MANAGEMENT: true
};

// ✅ API ENDPOINTS
export const ENDPOINTS = {
  USER: '/api/user',
  AVAILABILITY: '/api/availability',
  INVITATIONS: '/api/invitations',
  GROUPS: '/api/groups',
  SUGGESTIONS: '/api/suggestions'
};

// ✅ DEBUG ONLY IN DEVELOPMENT
if (isDevelopment && typeof console !== 'undefined') {
  console.log('[Config] Environment:', isProduction ? 'production' : 'development');
  console.log('[Config] API Base URL:', API_BASE_URL || 'vite proxy');
  console.log('[Config] Logout URL:', LOGOUT_URL);
  console.log('[Config] Home URL:', HOME_URL);
  console.log('[Config] Host:', CURRENT_HOST);
}