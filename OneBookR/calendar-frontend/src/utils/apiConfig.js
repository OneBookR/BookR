// 🔧 ROBUST API CONFIGURATION FOR BOOKR
// Detta är den ENDA källan för API URL-konfiguration

import { trackEvent, EVENTS } from './analytics.js';

// Byter ut ID-liknande segment mot :id så GA4-dimensionen inte
// exploderar i unika värden (t.ex. /api/group/abc123/join -> /api/group/:id/join).
function sanitizeEndpointForAnalytics(endpoint) {
  try {
    const path = String(endpoint).split('?')[0];
    return path
      .split('/')
      .map(seg =>
        /^[0-9]+$/.test(seg) || /^[A-Za-z0-9_-]{16,}$/.test(seg) || seg.includes('@')
          ? ':id'
          : seg
      )
      .join('/');
  } catch {
    return 'unknown';
  }
}

/**
 * Bestämmer API base URL baserat på miljö
 * DEVELOPMENT: Använd alltid localhost:3000 för direkta anrop
 * PRODUCTION: Använd onebookr.se
 */
export function getApiBaseUrl() {
  // 1. Kontrollera environment variable först
  if (import.meta.env?.VITE_API_BASE_URL) {
    console.log('🔧 [API Config] Using VITE_API_BASE_URL:', import.meta.env.VITE_API_BASE_URL);
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // 2. Kontrollera om vi är i development (localhost)
  const hostname = window.location.hostname;
  const isDevelopment = hostname === 'localhost' || hostname === '127.0.0.1';
  
  if (isDevelopment) {
    console.log('🔧 [API Config] Development detected - using localhost:3000');
    return 'http://localhost:3000';
  }
  
  // 3. Production fallback
  console.log('🔧 [API Config] Production mode - using onebookr.se');
  return 'https://www.onebookr.se';
}

/**
 * Skapar en komplett API URL
 */
export function createApiUrl(endpoint) {
  const baseUrl = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const fullUrl = `${baseUrl}${cleanEndpoint}`;
  
  console.log(`🔧 [API Config] ${endpoint} -> ${fullUrl}`);
  return fullUrl;
}

/**
 * Robust fetch wrapper som alltid använder rätt API URL
 */
export async function apiRequest(endpoint, options = {}) {
  const url = createApiUrl(endpoint);
  
  const defaultOptions = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  };
  
  const finalOptions = { ...defaultOptions, ...options };
  
  console.log(`🌐 [API Request] ${finalOptions.method || 'GET'} ${url}`);
  
  const method = finalOptions.method || 'GET';

  try {
    const response = await fetch(url, finalOptions);
    if (!response.ok) {
      // 401/429 är förväntade flödestillstånd (utloggad, rate limit) —
      // logga allt utom dem som fel så signalen inte dränks i brus.
      if (response.status !== 401 && response.status !== 429) {
        trackEvent(EVENTS.API_ERROR, {
          endpoint: sanitizeEndpointForAnalytics(endpoint),
          method,
          status: response.status,
        });
      }
    }
    return response;
  } catch (error) {
    console.error(`❌ [API Request] Failed ${url}:`, error);
    trackEvent(EVENTS.API_ERROR, {
      endpoint: sanitizeEndpointForAnalytics(endpoint),
      method,
      status: 0, // 0 = nätverksfel / ingen respons
    });
    throw error;
  }
}

// Export den aktuella API base URL för kompatibilitet
export const API_BASE_URL = getApiBaseUrl();

console.log('🔧 [API Config] Initialized with base URL:', API_BASE_URL);