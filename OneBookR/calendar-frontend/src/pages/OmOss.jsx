import React from 'react';
import { Container, Typography, Box, Paper, Button } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const OmOss = () => {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => window.history.back()}
        sx={{ mb: 3, color: '#635bff' }}
      >
        Tillbaka
      </Button>
      
      <Paper sx={{ p: 4, borderRadius: 3 }}>
        <Typography variant="h3" sx={{ 
          fontWeight: 700, 
          color: '#0a2540', 
          mb: 3,
          textAlign: 'center'
        }}>
          Om BookR
        </Typography>
        
        <Typography variant="body1" sx={{ mb: 3, lineHeight: 1.7 }}>
          BookR är en smart kalenderjämförelsetjänst som hjälper dig och dina vänner, kollegor eller familj att hitta gemensamma lediga tider snabbt och enkelt.
        </Typography>
        
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, color: '#635bff' }}>
          Vår Mission
        </Typography>
        <Typography variant="body1" sx={{ mb: 3, lineHeight: 1.7 }}>
          Vi vill göra det enkelt att koordinera möten och aktiviteter genom att eliminera det eviga fram-och-tillbaka-mejlandet om "när passar det dig?". Med BookR ser du direkt när alla är lediga.
        </Typography>
        
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, color: '#635bff' }}>
          Hur det fungerar
        </Typography>
        <Typography variant="body1" sx={{ mb: 3, lineHeight: 1.7 }}>
          BookR integrerar säkert med din Google-kalender för att visa när du är ledig. När du bjuder in andra kan ni tillsammans se era gemensamma lediga tider och enkelt föreslå och boka möten - komplett med Google Meet-länkar.
        </Typography>
        
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, color: '#635bff' }}>
          Säkerhet och Integritet
        </Typography>
        <Typography variant="body1" sx={{ mb: 3, lineHeight: 1.7 }}>
          Din integritet är viktig för oss. Vi använder endast den kalenderinformation som behövs för att visa lediga tider och delar aldrig dina personuppgifter med tredje part. All data behandlas enligt GDPR och våra strikta säkerhetsriktlinjer.
        </Typography>
        
        <Box sx={{ textAlign: 'center', mt: 4 }}>
          <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
            Har du frågor eller feedback?
          </Typography>
          <Button
            variant="contained"
            href="mailto:info@onebookr.se"
            sx={{
              bgcolor: '#635bff',
              '&:hover': { bgcolor: '#7a5af8' }
            }}
          >
            Kontakta oss
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default OmOss;