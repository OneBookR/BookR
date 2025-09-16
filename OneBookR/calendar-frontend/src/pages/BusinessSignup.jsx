import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Button, TextField, Paper, 
  Alert, Snackbar, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import { API_BASE_URL } from '../config';

const BusinessSignup = () => {
  const [formData, setFormData] = useState({
    companyName: '',
    businessType: '',
    contactPerson: '',
    phone: '',
    address: '',
    website: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [googleUser, setGoogleUser] = useState(null);
  const [bookingCode, setBookingCode] = useState(null);
  const [showCodeModal, setShowCodeModal] = useState(false);

  const businessTypes = [
    'Frisör/Skönhetssalong',
    'Terapeut/Psykolog',
    'Massör/Naprapat',
    'Advokat/Juridisk rådgivning',
    'Tandläkare/Tandvård',
    'Läkare/Vårdcentral',
    'Konsult/Rådgivning',
    'Personlig tränare/Gym',
    'Veterinär',
    'Annat'
  ];

  const handleGoogleLogin = () => {
    // Omdirigera till Google OAuth med business-state
    const state = btoa(JSON.stringify({ type: 'business-signup' }));
    window.location.href = `${API_BASE_URL}/auth/google?state=${encodeURIComponent(state)}`;
  };

  // Kolla om användaren kommer tillbaka från Google OAuth
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('auth');
    
    if (authToken) {
      try {
        const decoded = JSON.parse(atob(authToken));
        setGoogleUser(decoded.user);
        setFormData(prev => ({ ...prev, contactPerson: decoded.user.displayName || decoded.user.name || '' }));
        
        // Rensa auth-parameter
        urlParams.delete('auth');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, '', newUrl);
      } catch (e) {
        console.error('Fel vid dekodning av auth token:', e);
      }
    }
  }, []);

  const handleInputChange = (field) => (event) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!googleUser) {
      setToast({ open: true, message: 'Du måste logga in med Google först', severity: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/business/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          googleEmail: googleUser.email || googleUser.emails?.[0]?.value,
          googleId: googleUser.id,
          googleToken: googleUser.accessToken
        })
      });

      if (response.ok) {
        const data = await response.json();
        setBookingCode(data.bookingCode);
        // Omdirigera direkt till admin-sidan istället för att visa modal
        window.location.href = '/business-admin';
      } else {
        const error = await response.json();
        setToast({ open: true, message: error.message || 'Något gick fel', severity: 'error' });
      }
    } catch (error) {
      setToast({ open: true, message: 'Något gick fel. Försök igen.', severity: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', py: 8 }}>
      <Container maxWidth="md">
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h3" sx={{
            fontSize: { xs: '2.5rem', md: '3.5rem' },
            fontWeight: 700,
            color: '#0a2540',
            mb: 2,
            fontFamily: "'Inter', 'Segoe UI', 'Roboto', sans-serif"
          }}>
            Registrera ditt företag
          </Typography>
          <Typography variant="h6" sx={{
            color: '#425466',
            fontWeight: 400,
            maxWidth: 600,
            mx: 'auto'
          }}>
            Få din egen bokningslänk och låt kunder boka tider direkt från din hemsida
          </Typography>
        </Box>

        <Paper sx={{
          p: 6,
          borderRadius: 4,
          boxShadow: '0 12px 48px rgba(99,91,255,0.15)',
          border: '1px solid #e3e8ff',
          maxWidth: 600,
          mx: 'auto'
        }}>
          {!googleUser ? (
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h6" sx={{ mb: 3, color: '#0a2540' }}>
                Steg 1: Logga in med Google
              </Typography>
              <Typography variant="body2" sx={{ mb: 4, color: '#666' }}>
                Vi behöver tillgång till din Google-kalender för att hantera bokningar
              </Typography>
              <Button
                variant="contained"
                onClick={handleGoogleLogin}
                sx={{
                  py: 2,
                  px: 4,
                  borderRadius: 3,
                  background: 'linear-gradient(90deg, #4285f4 0%, #34a853 100%)',
                  fontWeight: 600,
                  fontSize: '1.1rem',
                  '&:hover': {
                    background: 'linear-gradient(90deg, #3367d6 0%, #2d8f47 100%)'
                  }
                }}
              >
                🔗 Logga in med Google
              </Button>
            </Box>
          ) : (
            <Box>
              <Alert severity="success" sx={{ mb: 4 }}>
                Inloggad som: {googleUser.email}
              </Alert>
              
              <Typography variant="h6" sx={{ mb: 3, color: '#0a2540' }}>
                Steg 2: Företagsinformation
              </Typography>
              
              <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <TextField
                  label="Företagsnamn *"
                  value={formData.companyName}
                  onChange={handleInputChange('companyName')}
                  required
                  fullWidth
                />
                
                <FormControl fullWidth required>
                  <InputLabel>Bransch *</InputLabel>
                  <Select
                    value={formData.businessType}
                    onChange={handleInputChange('businessType')}
                    label="Bransch *"
                  >
                    {businessTypes.map((type) => (
                      <MenuItem key={type} value={type}>{type}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                
                <TextField
                  label="Kontaktperson *"
                  value={formData.contactPerson}
                  onChange={handleInputChange('contactPerson')}
                  required
                  fullWidth
                />
                
                <TextField
                  label="Telefonnummer"
                  value={formData.phone}
                  onChange={handleInputChange('phone')}
                  fullWidth
                />
                
                <TextField
                  label="Adress"
                  value={formData.address}
                  onChange={handleInputChange('address')}
                  fullWidth
                  multiline
                  rows={2}
                />
                
                <TextField
                  label="Hemsida"
                  value={formData.website}
                  onChange={handleInputChange('website')}
                  fullWidth
                  placeholder="https://..."
                />
                
                <Button
                  type="submit"
                  variant="contained"
                  disabled={isSubmitting}
                  sx={{
                    py: 2.5,
                    borderRadius: 3,
                    background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    mt: 2,
                    '&:hover': {
                      background: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)'
                    }
                  }}
                >
                  {isSubmitting ? 'Registrerar företag...' : 'Skapa företagskonto'}
                </Button>
              </Box>
            </Box>
          )}
        </Paper>

        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <Typography variant="body2" sx={{ color: '#666', mb: 2 }}>
            Efter registrering får du:
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
            {[
              '🔗 Unik bokningslänk',
              '📅 Admin-dashboard',
              '⚡ Automatiska bokningar',
              '📧 E-postbekräftelser'
            ].map((feature, index) => (
              <Typography key={index} variant="body2" sx={{ color: '#635bff', fontWeight: 600 }}>
                {feature}
              </Typography>
            ))}
          </Box>
        </Box>
      </Container>



      <Snackbar
        open={toast.open}
        autoHideDuration={6000}
        onClose={() => setToast({ ...toast, open: false })}
      >
        <Alert severity={toast.severity} onClose={() => setToast({ ...toast, open: false })}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default BusinessSignup;