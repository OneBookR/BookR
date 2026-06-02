// ✅ TOKEN VALIDATION UTILITY
export class TokenValidator {
  static cache = new Map();
  static CACHE_DURATION = 30000; // 30 sekunder

  static async validateToken(token, provider = 'auto') {
    if (!token) return false;

    // ✅ CACHE CHECK
    const cacheKey = `${token.substring(0, 10)}_${provider}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.isValid;
    }

    try {
      let isValid = false;

      if (provider === 'google' || provider === 'auto') {
        try {
          const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          isValid = response.ok;
          
          if (isValid && provider === 'auto') {
            provider = 'google';
          }
        } catch (error) {
          console.warn('Google token validation failed:', error.message);
        }
      }

      if (!isValid && (provider === 'microsoft' || provider === 'auto')) {
        try {
          const response = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          isValid = response.ok;
          
          if (isValid && provider === 'auto') {
            provider = 'microsoft';
          }
        } catch (error) {
          console.warn('Microsoft token validation failed:', error.message);
        }
      }

      // ✅ CACHE RESULT
      this.cache.set(cacheKey, {
        isValid,
        provider: isValid ? provider : null,
        timestamp: Date.now()
      });

      return isValid;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  }

  static clearCache() {
    this.cache.clear();
  }

  static async validateUserSession() {
    try {
      // Använd apiRequest för konsistens
      const { apiRequest } = await import('./apiConfig.js');
      const response = await apiRequest('/api/user');

      if (response.status === 401) {
        const errorData = await response.json().catch(() => ({}));
        
        if (errorData.requiresReauth || errorData.code === 'TOKEN_EXPIRED') {
          console.log('🔄 Session expired, redirecting to login');
          this.clearCache();
          localStorage.removeItem('bookr_user');
          window.location.href = '/auth/logout';
          return false;
        }
      }

      return response.ok;
    } catch (error) {
      console.error('Session validation error:', error);
      return false;
    }
  }

  // ✅ NY METOD FÖR ATT HANTERA TOKEN EXPIRATION
  static handleTokenExpiration() {
    console.log('🔄 Token expired - cleaning up and redirecting');
    this.clearCache();
    localStorage.removeItem('bookr_user');
    sessionStorage.clear();
    
    setTimeout(() => {
      window.location.href = '/auth/logout';
    }, 1000);
  }
}

// ✅ EXPORT DEFAULT FUNCTION FOR EASY USE
export default TokenValidator;