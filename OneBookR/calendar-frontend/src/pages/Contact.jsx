import React, { useState } from 'react';
import { Container, Typography, TextField, Button, Box, Paper, Alert, AppBar, Toolbar } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LoginIcon from '@mui/icons-material/Login';

export default function Contact() {
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMsg, setContactMsg] = useState('');
  const [contactStatus, setContactStatus] = useState('');

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    setContactStatus('');
    try {
      const res = await fetch('https://www.onebookr.se/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          message: contactMsg,
        }),
      });
      if (res.ok) {
        setContactStatus('Tack! Vi har tagit emot din förfrågan.');
        setContactName('');
        setContactEmail('');
        setContactMsg('');
      } else {
        setContactStatus('Något gick fel. Försök igen senare.');
      }
    } catch {
      setContactStatus('Något gick fel. Försök igen senare.');
    }
  };

  return (
    <div>
      <AppBar
        position="fixed"
        color="default"
        elevation={1}
        sx={{
          bgcolor: '#fff',
          borderBottom: '1px solid #e0e3e7',
          zIndex: 1201
        }}
      >
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', minHeight: 64 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{
                fontWeight: 800,
                fontSize: 28,
                color: '#1976d2',
                letterSpacing: 1,
                fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
                mr: 2,
                userSelect: 'none',
                cursor: 'pointer'
              }}
              onClick={() => window.location.href = '/'}>
                BookR
              </Box>
              <Typography variant="subtitle2" sx={{ color: '#888', fontWeight: 400, fontSize: 16 }}>
                Kontakta oss
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                color="inherit"
                sx={{ fontWeight: 500, color: '#666' }}
                onClick={() => window.location.href = '/about'}
              >
                Om oss
              </Button>
              <Button
                color="inherit"
                sx={{ fontWeight: 500, color: '#666' }}
                onClick={() => window.location.href = '/contact'}
              >
                Kontakta oss
              </Button>
            </Box>
          </Box>
          <Box>
            <Button
              color="primary"
              variant="contained"
              startIcon={<LoginIcon />}
              onClick={() => window.location.href = '/'}
              sx={{ fontWeight: 600, borderRadius: 2, ml: 2 }}
            >
              Logga in
            </Button>
          </Box>
        </Toolbar>
      </AppBar>
      
      <Container maxWidth="md" sx={{ mt: 15, mb: 5 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => window.history.back()}
          sx={{ mb: 3, fontWeight: 600 }}
        >
          Tillbaka
        </Button>
      <Paper sx={{ p: 4, borderRadius: 3, boxShadow: '0 2px 8px rgba(60,64,67,.06)' }}>
        <Typography variant="h4" gutterBottom sx={{
          fontWeight: 600,
          color: '#0a2540',
          fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
          mb: 3
        }}>
          Kontakta oss
        </Typography>
        
        <Typography variant="body1" sx={{ color: '#425466', mb: 4, fontSize: 16 }}>
          Har du frågor om BookR eller behöver hjälp? Skicka oss ett meddelande så återkommer vi så snart som möjligt.
        </Typography>

        <form onSubmit={handleContactSubmit}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              label="Ditt namn"
              variant="outlined"
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              required
              fullWidth
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                }
              }}
            />
            <TextField
              label="Din e-post"
              variant="outlined"
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              required
              fullWidth
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                }
              }}
            />
            <TextField
              label="Meddelande"
              variant="outlined"
              value={contactMsg}
              onChange={e => setContactMsg(e.target.value)}
              required
              fullWidth
              multiline
              minRows={4}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                }
              }}
            />
            <Button 
              type="submit" 
              variant="contained" 
              color="primary" 
              size="large"
              sx={{ 
                mt: 2, 
                fontWeight: 600,
                borderRadius: 2,
                py: 1.5
              }}
            >
              Skicka meddelande
            </Button>
          </Box>
        </form>
        
        {contactStatus && (
          <Alert 
            severity={contactStatus.startsWith('Tack') ? 'success' : 'error'} 
            sx={{ mt: 3 }}
          >
            {contactStatus}
          </Alert>
        )}
      </Paper>
      </Container>
    </div>
  );
}