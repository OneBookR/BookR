import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Paper, Alert } from '@mui/material';

const VenueAdmin = () => {
  const [venueData, setVenueData] = useState({
    name: '',
    website: '',
    scheduleUrl: '',
    contactEmail: ''
  });
  const [uniqueLink, setUniqueLink] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const response = await fetch('/api/venues/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(venueData)
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setUniqueLink(result.uniqueLink);
        setMessage('Hall registrerad! Dela länken med dina kunder.');
      } else {
        setMessage('Fel vid registrering: ' + result.error);
      }
    } catch (error) {
      setMessage('Fel vid registrering');
    }
  };

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
          
          <TextField
            fullWidth
            label="Schema URL (länk till ert bokningssystem)"
            value={venueData.scheduleUrl}
            onChange={(e) => setVenueData({...venueData, scheduleUrl: e.target.value})}
            margin="normal"
            required
            helperText="T.ex. länk till Matchi eller annat bokningssystem"
          />
          
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