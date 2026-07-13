import React from 'react';
import { Box, Container, Typography, Link, Grid } from '@mui/material';

const Footer = () => {
  return (
    <Box sx={{
      mt: 'auto',
      px: { xs: 2, md: 4 },
      pb: { xs: 10, sm: 4 },
      pt: 2
    }}>
      <Container maxWidth="lg">
        <Box
          sx={{
            border: '1px solid var(--border)',
            borderRadius: { xs: 4, md: 6 },
            bgcolor: 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(18px)',
            boxShadow: '0 16px 48px rgba(15, 23, 42, 0.05)',
            px: { xs: 3, md: 5 },
            py: { xs: 4, md: 5 }
          }}
        >
        <Grid container spacing={4}>
          <Grid item xs={12} md={4}>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5, color: 'var(--text)', letterSpacing: '-0.04em' }}>
              BookR
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 2, maxWidth: 280, lineHeight: 1.7 }}>
              Jämför kalendrar, hitta gemensamma tider och skapa en bokningsupplevelse som känns enkel från första klicket.
            </Typography>
            <Link href="mailto:info@onebookr.se" sx={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 700 }}>
              info@onebookr.se
            </Link>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: 'var(--text)' }}>
              Policyer
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <a href="https://www.iubenda.com/privacy-policy/71871656" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '14px' }}>Integritetspolicy</a>
              <a href="https://www.iubenda.com/privacy-policy/71871656/cookie-policy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '14px' }}>Cookiepolicy</a>
              <a href="https://www.iubenda.com/villkor-och-bestammelse/71871656" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '14px' }}>Villkor och bestämmelser</a>
            </Box>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: 'var(--text)' }}>
              Information
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Link href="/om-oss" sx={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '14px' }}>
                Om oss
              </Link>
              <Link href="/kontakt" sx={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '14px' }}>
                Kontakt
              </Link>
            </Box>
          </Grid>
        </Grid>
        
        <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
            © 2026 BookR. Alla rättigheter förbehållna. Ingen kalenderdata sparas permanent.
          </Typography>
        </Box>
        </Box>
      </Container>
    </Box>
  );
};

export default Footer;