import React from 'react';
import { Container, Typography, Box, Paper, Button, Grid } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EmailIcon from '@mui/icons-material/Email';

const Kontakt = () => {
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
          Kontakta oss
        </Typography>
        
        <Typography variant="body1" sx={{ mb: 4, textAlign: 'center', lineHeight: 1.7 }}>
          Vi hjälper gärna till med frågor om BookR eller teknisk support.
        </Typography>
        
        <Grid container spacing={4} justifyContent="center">
          <Grid item xs={12} md={8}>
            <Box sx={{ 
              textAlign: 'center', 
              p: 3, 
              border: '1px solid #e2e8f0', 
              borderRadius: 2,
              bgcolor: '#f8fafc'
            }}>
              <EmailIcon sx={{ fontSize: 48, color: '#635bff', mb: 2 }} />
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, color: '#0a2540' }}>
                E-post
              </Typography>
              <Typography variant="body1" sx={{ mb: 3, color: '#475569' }}>
                Skicka dina frågor eller feedback till oss
              </Typography>
              <Button
                variant="contained"
                href="mailto:info@onebookr.se"
                startIcon={<EmailIcon />}
                sx={{
                  bgcolor: '#635bff',
                  px: 4,
                  py: 1.5,
                  '&:hover': { bgcolor: '#7a5af8' }
                }}
              >
                info@onebookr.se
              </Button>
            </Box>
          </Grid>
        </Grid>
        
        <Box sx={{ mt: 4, p: 3, bgcolor: '#f1f5f9', borderRadius: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: '#0a2540' }}>
            Vanliga frågor
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: '#475569' }}>
            <strong>Q: Är BookR gratis att använda?</strong><br />
            A: Ja, BookR är helt gratis för privatpersoner.
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: '#475569' }}>
            <strong>Q: Vilken kalenderinformation kan BookR se?</strong><br />
            A: Vi ser endast om du är upptagen eller ledig vid specifika tider, inte vad dina möten handlar om.
          </Typography>
          <Typography variant="body2" sx={{ color: '#475569' }}>
            <strong>Q: Kan jag använda BookR utan Google-kalender?</strong><br />
            A: För närvarande stöder vi endast Google-kalender, men vi arbetar på att lägga till fler kalendertjänster.
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
};

export default Kontakt;