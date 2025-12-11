// filepath: /Users/valdemargoransson/Desktop/kalenderprojekt 22.11.24/OneBookR/calendar-frontend/src/utils/tokenValidator.js

/**
 * Validerar om en Google Calendar access token fortfarande är giltig
 * @param {string} token - Access token att validera
 * @returns {Promise<boolean>} - true om token är giltig, false annars
 */
export const validateToken = async (token) => {
  if (!token) {
    return false;
  }

  try {
    const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/settings/timezone', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.status !== 401;
  } catch (error) {
    console.error('Error validating token:', error);
    return false;
  }
};

/**
 * Validerar token och omdirigerar till login om den är ogiltig
 * @param {string} token - Access token att validera
 * @param {boolean} saveReturnUrl - Om true, sparar nuvarande URL för att återvända efter login
 * @returns {Promise<boolean>} - true om token är giltig, false annars (och omdirigerar)
 */
export const validateTokenAndRedirect = async (token, saveReturnUrl = true) => {
  const isValid = await validateToken(token);
  
  if (!isValid) {
    console.log('Token has expired, redirecting to login...');
    
    if (saveReturnUrl) {
      localStorage.setItem('bookr_return_url', window.location.href);
    }
    
    // Rensa användardata
    localStorage.removeItem('bookr_user');
    sessionStorage.removeItem('hasTriedSession');
    
    // Omdirigera till logout som rensar allt och sedan tillbaka till login
    setTimeout(() => {
      window.location.href = 'https://www.onebookr.se/auth/logout';
    }, 1500);
    
    return false;
  }
  
  return true;
};

/**
 * React hook för token-validering
 * @param {string} token - Access token att validera
 * @returns {Object} - { isValidating, isValid }
 */
export const useTokenValidation = (token) => {
  const [isValidating, setIsValidating] = React.useState(true);
  const [isValid, setIsValid] = React.useState(false);

  React.useEffect(() => {
    const validate = async () => {
      if (!token) {
        setIsValidating(false);
        setIsValid(false);
        return;
      }

      const valid = await validateTokenAndRedirect(token, true);
      setIsValid(valid);
      setIsValidating(false);
    };

    validate();
  }, [token]);

  return { isValidating, isValid };
};
