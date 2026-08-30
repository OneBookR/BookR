import React from 'react';
import { Box, Typography, Button, Alert } from '@mui/material';
import { trackEvent, EVENTS } from '../utils/analytics.js';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorId: null
    };
  }

  static getDerivedStateFromError(error) {
    return { 
      hasError: true, 
      error,
      errorId: Date.now() // Unique error ID
    };
  }

  componentDidCatch(error, errorInfo) {
    // GA4: vilka delar av appen kraschar för riktiga användare.
    if (this.props.reportErrors !== false) {
      trackEvent(EVENTS.ERROR_SHOWN, {
        context: this.props.componentName || 'Unknown',
        message: String(error?.message || '').slice(0, 120),
      });
    }

    const errorDetails = {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      component: this.props.componentName || 'Unknown',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // ✅ LOG ERROR IN DEVELOPMENT MED BÄTTRE STRUKTUR
    if (process.env.NODE_ENV === 'development') {
      console.group('🚨 React Error Boundary');
      console.error('Component:', this.props.componentName);
      console.error('Error:', error);
      console.error('Error Info:', errorInfo);
      console.error('Full Details:', errorDetails);
      
      // ✅ SPECIFIK HANTERING FÖR VANLIGA FEL
      if (error.message.includes('is not defined')) {
        console.warn('💡 Tip: Detta verkar vara en "function not defined" error. Kontrollera att alla funktioner är deklarerade innan de används.');
      }
      
      if (error.message.includes('Cannot access')) {
        console.warn('💡 Tip: Detta verkar vara en "temporal dead zone" error. Kontrollera ordningen på variabel-deklarationer.');
      }
      
      console.groupEnd();
    }

    // ✅ SEND TO ERROR TRACKING IN PRODUCTION
    if (process.env.NODE_ENV === 'production' && this.props.reportErrors !== false) {
      this.reportError(errorDetails);
    }

    this.setState({ error, errorInfo });
  }

  reportError = async (errorDetails) => {
    try {
      await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorDetails)
      });
    } catch (reportError) {
      // Silent fail - don't throw on error reporting
      console.warn('Failed to report error:', reportError);
    }
  };

  handleRetry = () => {
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorId: null
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { hasError, error, errorId } = this.state;
    const { componentName, fallback } = this.props;

    // ✅ SILENT COMPONENTS - Don't show UI for certain components
    if (hasError && this.props.silent) {
      return null;
    }

    // ✅ CUSTOM FALLBACK
    if (hasError && fallback) {
      return fallback(error, this.handleRetry);
    }

    // ✅ DEFAULT ERROR UI
    if (hasError) {
      return (
        <Box sx={{ 
          p: 3, 
          textAlign: 'center',
          maxWidth: 600,
          mx: 'auto',
          my: 4
        }}>
          <Alert 
            severity="error" 
            sx={{ 
              mb: 3,
              textAlign: 'left',
              '& .MuiAlert-message': { width: '100%' }
            }}
          >
            <Typography variant="h6" sx={{ mb: 1 }}>
              Ett fel uppstod{componentName ? ` i ${componentName}` : ''}
            </Typography>
            
            <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
              {error?.message || 'Något gick fel i applikationen'}
            </Typography>
            
            {process.env.NODE_ENV === 'development' && (
              <Typography variant="caption" sx={{ 
                fontFamily: 'monospace',
                bgcolor: 'rgba(0,0,0,0.05)',
                p: 1,
                borderRadius: 1,
                display: 'block',
                mt: 1,
                fontSize: 10
              }}>
                Error ID: {errorId}
              </Typography>
            )}
          </Alert>
          
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button 
              variant="contained" 
              onClick={this.handleRetry}
              size="large"
            >
              Försök igen
            </Button>
            
            <Button 
              variant="outlined" 
              onClick={this.handleReload}
              size="large"
            >
              Ladda om sidan
            </Button>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
