import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Button, Paper, 
  Alert, Snackbar, Card, CardContent, Divider
} from '@mui/material';
import { API_BASE_URL } from '../config';

const BusinessAdmin = () => {
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    // Hämta företagsinformation baserat på inloggad användare
    // För nu använder vi mock-data
    const mockBusiness = {
      companyName: 'Test Företag AB',
      businessType: 'Frisör/Skönhetssalong',
      contactPerson: 'Anna Andersson',
      bookingCode: 'ABC123XY',
      googleEmail: 'test@example.com'
    };
    
    setBusiness(mockBusiness);
    setLoading(false);
  }, []);

  const bookingUrl = business ? `https://www.onebookr.se/book/${business.bookingCode}` : '';

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setToast({ open: true, message: 'Kopierat! 📋', severity: 'success' });
  };

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 10 }}>
        <Typography>Laddar...</Typography>
      </Container>
    );
  }

  if (!business) {
    return (
      <Container maxWidth="md" sx={{ mt: 10 }}>
        <Alert severity="error">
          Företag inte hittat. <Button href="/business-signup">Registrera företag</Button>
        </Alert>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', py: 8 }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h3" sx={{
            fontSize: { xs: '2.5rem', md: '3.5rem' },
            fontWeight: 700,
            color: '#0a2540',
            mb: 2,
            fontFamily: "'Inter', 'Segoe UI', 'Roboto', sans-serif"
          }}>
            Admin Dashboard
          </Typography>
          <Typography variant="h6" sx={{
            color: '#425466',
            fontWeight: 400
          }}>
            {business.companyName}
          </Typography>
        </Box>

        {/* Bokningskod och länk */}
        <Paper sx={{
          p: 6,
          borderRadius: 4,
          boxShadow: '0 12px 48px rgba(99,91,255,0.15)',
          border: '1px solid #e3e8ff',
          mb: 4
        }}>
          <Typography variant="h5" sx={{ 
            color: '#0a2540', 
            fontWeight: 600, 
            mb: 3,
            textAlign: 'center'
          }}>
            🔗 Din bokningslänk
          </Typography>
          
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Typography variant="h6" sx={{ color: '#666', mb: 2 }}>
              Bokningskod:
            </Typography>
            <Box sx={{
              bgcolor: '#f8f9ff',
              border: '2px solid #635bff',
              borderRadius: 3,
              p: 2,
              mb: 3,
              display: 'inline-block'
            }}>
              <Typography variant="h4" sx={{
                color: '#635bff',
                fontWeight: 800,
                letterSpacing: 2,
                fontFamily: 'monospace'
              }}>
                {business.bookingCode}
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 3 }} />

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h6" sx={{ color: '#666', mb: 2 }}>
              Fullständig bokningslänk:
            </Typography>
            <Box sx={{
              bgcolor: '#f8f9ff',
              border: '1px solid #e3e8ff',
              borderRadius: 2,
              p: 2,
              mb: 3,
              wordBreak: 'break-all'
            }}>
              <Typography variant="body1" sx={{
                color: '#635bff',
                fontWeight: 500,
                fontFamily: 'monospace'
              }}>
                {bookingUrl}
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                onClick={() => copyToClipboard(bookingUrl)}
                sx={{
                  background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                  fontWeight: 600,
                  borderRadius: 3
                }}
              >
                📋 Kopiera länk
              </Button>
              
              <Button
                variant="outlined"
                onClick={() => window.open(bookingUrl, '_blank')}
                sx={{
                  borderColor: '#635bff',
                  color: '#635bff',
                  fontWeight: 600,
                  borderRadius: 3
                }}
              >
                🔗 Testa länk
              </Button>
            </Box>
          </Box>
        </Paper>

        {/* Instruktioner */}
        <Paper sx={{
          p: 4,
          borderRadius: 4,
          border: '1px solid #e3e8ff'
        }}>
          <Typography variant="h6" sx={{ 
            color: '#0a2540', 
            fontWeight: 600, 
            mb: 3
          }}>
            📖 Så använder du din bokningslänk
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body1" sx={{ color: '#425466' }}>
              <strong>1.</strong> Lägg till länken på din hemsida som en knapp eller länk
            </Typography>
            <Typography variant="body1" sx={{ color: '#425466' }}>
              <strong>2.</strong> Kunder klickar på länken och loggar in med Google
            </Typography>
            <Typography variant="body1" sx={{ color: '#425466' }}>
              <strong>3.</strong> BookR jämför era kalendrar och visar lediga tider
            </Typography>
            <Typography variant="body1" sx={{ color: '#425466' }}>
              <strong>4.</strong> Kunden väljer tid - mötet skapas automatiskt i båda era kalendrar!
            </Typography>
          </Box>
          
          <Box sx={{ mt: 4, p: 3, bgcolor: '#f8f9ff', borderRadius: 2 }}>
            <Typography variant="body2" sx={{ color: '#666', fontStyle: 'italic' }}>
              💡 Tips: Skapa en knapp på din hemsida med texten "Boka tid" som länkar till din BookR-länk
            </Typography>
          </Box>
        </Paper>
      </Container>

      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast({ ...toast, open: false })}
      >
        <Alert severity={toast.severity} onClose={() => setToast({ ...toast, open: false })}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default BusinessAdmin;