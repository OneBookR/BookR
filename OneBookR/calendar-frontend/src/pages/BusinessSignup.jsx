import React, { useState } from 'react';
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

  const handleGoogleLogin = async () => {
    try {
      // Implementera Google OAuth här
      // För nu simulerar vi inloggning
      const mockUser = {
        email: 'business@example.com',
        name: 'Business Owner',
        googleId: '123456789'
      };
      setGoogleUser(mockUser);
      setFormData(prev => ({ ...prev, contactPerson: mockUser.name }));
    } catch (error) {
      setToast({ open: true, message: 'Kunde inte logga in med Google', severity: 'error' });
    }
  };

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
          googleEmail: googleUser.email,
          googleId: googleUser.googleId
        })
      });

      if (response.ok) {
        const data = await response.json();
        setBookingCode(data.bookingCode);
        setShowCodeModal(true);
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

      {/* Bokningskod Modal */}
      {showCodeModal && (
        <Box sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          bgcolor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <Paper sx={{
            p: 6,
            borderRadius: 4,
            textAlign: 'center',
            maxWidth: 500,
            mx: 2,
            background: 'linear-gradient(135deg, #f8fff8 0%, #e8f5e8 100%)',
            border: '2px solid #4caf50'
          }}>
            <Typography sx={{ fontSize: '4rem', mb: 2 }}>🏢</Typography>
            <Typography variant="h4" sx={{
              color: '#2e7d32',
              fontWeight: 700,
              mb: 3
            }}>
              Företag registrerat!
            </Typography>
            <Typography variant="h6" sx={{
              color: '#1b5e20',
              mb: 2,
              fontWeight: 600
            }}>
              Detta är din bokningskod:
            </Typography>
            <Box sx={{
              bgcolor: '#fff',
              border: '3px solid #4caf50',
              borderRadius: 3,
              p: 3,
              mb: 4
            }}>
              <Typography variant="h3" sx={{
                color: '#2e7d32',
                fontWeight: 800,
                letterSpacing: 2,
                fontFamily: 'monospace'
              }}>
                {bookingCode}
              </Typography>
            </Box>
            <Typography variant="body1" sx={{
              color: '#1b5e20',
              mb: 3,
              lineHeight: 1.6
            }}>
              Spara denna kod! Du hittar den även i din admin-panel när du loggar in.
            </Typography>
            <Button
              variant="contained"
              onClick={() => {
                setShowCodeModal(false);
                window.location.href = '/business-admin';
              }}
              sx={{
                bgcolor: '#4caf50',
                color: '#fff',
                fontWeight: 600,
                py: 1.5,
                px: 4,
                borderRadius: 3,
                '&:hover': {
                  bgcolor: '#45a049'
                }
              }}
            >
              Gå till Admin-panel
            </Button>
          </Paper>
        </Box>
      )}

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