import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Paper, Alert } from '@mui/material';

const VenueAdmin = () => {
  const [user, setUser] = useState(null);
  const [venueData, setVenueData] = useState({
    name: '',
    website: '',
    contactEmail: ''
  });
  const [uniqueLink, setUniqueLink] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('auth');

    if (authToken) {
      try {
        const decoded = JSON.parse(atob(authToken));
        setUser(decoded.user);
        setVenueData(prev => ({
          ...prev,
          contactEmail: decoded.user.email || ''
        }));
        
        urlParams.delete('auth');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, '', newUrl);
      } catch (e) {
        console.error('Error decoding auth token:', e);
      }
    } else {
      fetch('/api/user', { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.user) {
            setUser(data.user);
            setVenueData(prev => ({
              ...prev,
              contactEmail: data.user.email || ''
            }));
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!user) {
      setMessage('Du måste logga in först');
      return;
    }
    
    try {
      const response = await fetch('/api/venues/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...venueData,
          googleEmail: user.email,
          googleToken: user.accessToken
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setUniqueLink(result.uniqueLink);
        setMessage('Hall registrerad! Din Google Kalender är ansluten.');
      } else {
        setMessage('Fel vid registrering: ' + result.error);
      }
    } catch (error) {
      setMessage('Fel vid registrering');
    }
  };

  if (!user) {
    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', p: 3, textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom>
          Hall-admin
        </Typography>
        <Typography variant="body1" sx={{ mb: 3 }}>
          Logga in med Google för att ansluta din halls kalender
        </Typography>
        <Button 
          variant="contained" 
          href="/auth/google"
          size="large"
        >
          Logga in med Google
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Registrera din Tennis/Padelhall
      </Typography>
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Hallens namn"
            value={venueData.name}
            onChange={(e) => setVenueData({...venueData, name: e.target.value})}
            margin="normal"
            required
          />
          
          <TextField
            fullWidth
            label="Hemsida"
            value={venueData.website}
            onChange={(e) => setVenueData({...venueData, website: e.target.value})}
            margin="normal"
          />
          
          <Alert severity="info" sx={{ my: 2 }}>
            Din Google Kalender används som schema. Lediga tider hämtas automatiskt från din kalender.
          </Alert>
          
          <TextField
            fullWidth
            label="Kontakt e-post"
            type="email"
            value={venueData.contactEmail}
            onChange={(e) => setVenueData({...venueData, contactEmail: e.target.value})}
            margin="normal"
            required
          />
          
          <Button 
            type="submit" 
            variant="contained" 
            fullWidth 
            sx={{ mt: 2 }}
          >
            Registrera hall
          </Button>
        </form>
      </Paper>

      {message && (
        <Alert severity={uniqueLink ? 'success' : 'error'} sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}

      {uniqueLink && (
        <Paper sx={{ p: 3, bgcolor: 'success.light' }}>
          <Typography variant="h6" gutterBottom>
            Din unika BookR-länk:
          </Typography>
          <TextField
            fullWidth
            value={uniqueLink}
            InputProps={{ readOnly: true }}
            sx={{ mb: 2 }}
          />
          <Typography variant="body2">
            Lägg till denna länk på er hemsida så att kunder kan jämföra sina scheman med era lediga tider!
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default VenueAdmin;