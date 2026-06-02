import React from 'react';
import { Box, Container, Typography, Link, Grid } from '@mui/material';

const Footer = () => {
  return (
    <Box sx={{
      bgcolor: '#f8fafc',
      borderTop: '1px solid #e2e8f0',
      mt: 'auto',
      py: 4
    }}>
      <Container maxWidth="lg">
        <Grid container spacing={4}>
          <Grid item xs={12} md={4}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: '#0a2540' }}>
              BookR
            </Typography>
            <Typography variant="body2" sx={{ color: '#475569', mb: 2 }}>
              Hitta lediga tider och schemalägg möten enkelt med vår kalenderjämförelsetjänst.
            </Typography>
            <Link href="mailto:info@onebookr.se" sx={{ color: '#635bff', textDecoration: 'none' }}>
              info@onebookr.se
            </Link>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: '#0a2540' }}>
              Policyer
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <a href="https://www.iubenda.com/privacy-policy/71871656" target="_blank" rel="noopener noreferrer" style={{ color: '#475569', textDecoration: 'none', fontSize: '14px' }}>Integritetspolicy</a>
              <a href="https://www.iubenda.com/privacy-policy/71871656/cookie-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#475569', textDecoration: 'none', fontSize: '14px' }}>Cookiepolicy</a>
              <a href="https://www.iubenda.com/villkor-och-bestammelse/71871656" target="_blank" rel="noopener noreferrer" style={{ color: '#475569', textDecoration: 'none', fontSize: '14px' }}>Villkor och bestämmelser</a>
            </Box>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: '#0a2540' }}>
              Information
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Link href="/om-oss" sx={{ color: '#475569', textDecoration: 'none', fontSize: '14px' }}>
                Om oss
              </Link>
              <Link href="/kontakt" sx={{ color: '#475569', textDecoration: 'none', fontSize: '14px' }}>
                Kontakt
              </Link>
            </Box>
          </Grid>
        </Grid>
        
        <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            © 2024 BookR. Alla rättigheter förbehållna.
          </Typography>
        </Box>
      </Container>
      
      {/* ✅ GDPR & PRIVACY SECTION */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 1 }}>
          📋 Integritet & Policyer
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Link
            href="https://www.iubenda.com/privacy-policy/71871656"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: '#635bff', textDecoration: 'none', fontSize: '0.75rem' }}
          >
            Integritetspolicy
          </Link>
          <Link
            href="https://www.iubenda.com/privacy-policy/71871656/cookie-policy"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: '#635bff', textDecoration: 'none', fontSize: '0.75rem' }}
          >
            Cookiepolicy
          </Link>
          <Link
            href="https://www.iubenda.com/villkor-och-bestammelse/71871656"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: '#635bff', textDecoration: 'none', fontSize: '0.75rem' }}
          >
            Villkor
          </Link>
        </Box>
      </Box>

      {/* ✅ GDPR COMPLIANCE INFO */}
      <Typography variant="caption" sx={{ color: '#475569', display: 'block', mb: 1 }}>
        🔒 Vi skyddar din integritet - Ingen kalenderdata sparas permanent
      </Typography>
      
      <script type="text/javascript">
        {`(function (w,d) {var loader = function () {var s = d.createElement("script"), tag = d.getElementsByTagName("script")[0]; s.src="https://cdn.iubenda.com/iubenda.js"; tag.parentNode.insertBefore(s,tag);}; if(w.addEventListener){w.addEventListener("load", loader, false);}else if(w.attachEvent){w.attachEvent("onload", loader);}else{w.onload = loader;}})(window, document);`}
      </script>
    </Box>
  );
};

export default Footer;