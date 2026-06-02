// Security headers för Railway production
export const RAILWAY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY', 
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; connect-src 'self' https://accounts.google.com https://www.googleapis.com https://login.microsoftonline.com https://graph.microsoft.com; script-src 'self' 'unsafe-inline' https://accounts.google.com;"
};
