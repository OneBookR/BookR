import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import LandingHeader from '../components/LandingHeader.jsx';
import Footer from '../components/Footer.jsx';

const FEATURES = [
  {
    title: 'Kalenderjämförelse',
    desc: 'Bjud in en person eller en hel grupp och se era gemensamma lediga tider direkt — ingen mer fram-och-tillbaka om "när passar det dig?".'
  },
  {
    title: 'Google ↔ Microsoft, sömlöst',
    desc: 'Äkta cross-platform-synk. Du kör Outlook och din kollega kör Google Kalender? BookR jämför ändå rätt, utan att någon behöver byta kalendertjänst.'
  },
  {
    title: 'Egen bokningssida',
    desc: 'En länk du delar där andra bokar en tid direkt i din kalender — utan att de behöver logga in eller koppla något själva.'
  },
  {
    title: 'Uppgiftshantering',
    desc: 'Säg hur många timmar en uppgift tar, så hittar BookR lediga arbetspass åt dig i din egen kalender och packar dem effektivt.'
  }
];

const OmOss = () => {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'var(--background)' }}>
      <LandingHeader returnTo="/om-oss" />

      <Box sx={{ maxWidth: 880, mx: 'auto', px: { xs: 3, md: 6 }, pt: { xs: 6, md: 10 }, pb: { xs: 8, md: 10 } }}>

        {/* Hero */}
        <Box sx={{ textAlign: 'center', mb: { xs: 6, md: 8 } }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '2.1rem', md: '3rem' }, lineHeight: 1.1, letterSpacing: '-0.04em', fontWeight: 800, color: 'var(--text)', mb: 2 }}>
            Vi gör det enkelt att hitta en tid som faktiskt passar.
          </Typography>
          <Typography sx={{ fontSize: { xs: 15, md: 17 }, lineHeight: 1.6, color: 'var(--text-secondary)', fontWeight: 500, maxWidth: 620, mx: 'auto' }}>
            BookR jämför kalendrar, föreslår tider alla är lediga, och sköter resten — mötesinbjudan, möteslänk och allt däremellan.
          </Typography>
        </Box>

        {/* Varför */}
        <Box sx={{ mb: { xs: 6, md: 8 } }}>
          <Typography sx={{ fontSize: { xs: 15, md: 16.5 }, lineHeight: 1.75, color: 'var(--text)', fontWeight: 500 }}>
            Vi byggde BookR för att koordinera möten fortfarande tar för lång tid — särskilt så fort fler än två personer, eller fler än en kalendertjänst, är inblandade. Istället för ännu en mejltråd om lediga tider ska du kunna se svaret direkt, oavsett om alla inblandade kör Google, Microsoft, eller en blandning av båda.
          </Typography>
        </Box>

        {/* Vad vi gör */}
        <Box sx={{ mb: { xs: 6, md: 8 } }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', mb: 2.5 }}>
            Vad BookR gör
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            {FEATURES.map((f) => (
              <Box key={f.title} sx={{
                p: 2.75, borderRadius: 4, border: '1px solid var(--border)',
                bgcolor: 'rgba(255,255,255,0.78)', backdropFilter: 'blur(18px)',
                boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)'
              }}>
                <Typography sx={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', mb: 0.75, letterSpacing: '-0.01em' }}>
                  {f.title}
                </Typography>
                <Typography sx={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  {f.desc}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Integritet */}
        <Box sx={{
          p: { xs: 3, md: 4 }, borderRadius: 4, border: '1px solid var(--border)',
          bgcolor: 'rgba(255,255,255,0.78)', backdropFilter: 'blur(18px)',
          boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)', mb: { xs: 6, md: 8 }
        }}>
          <Typography sx={{ fontWeight: 800, fontSize: 18, color: 'var(--text)', mb: 1.25, letterSpacing: '-0.02em' }}>
            Säkerhet och integritet
          </Typography>
          <Typography sx={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            BookR ser bara om du är upptagen eller ledig vid en given tid — aldrig vad mötet handlar om eller vilka tidigare händelser som ligger i din kalender, om du inte uttryckligen ger ditt samtycke till mer. Dina uppgifter delas aldrig med tredje part, och all behandling sker enligt GDPR. Läs mer i vår{' '}
            <Box component="a" href="/integritetspolicy" sx={{ color: 'var(--text)', fontWeight: 700 }}>
              integritetspolicy
            </Box>.
          </Typography>
        </Box>

        {/* CTA */}
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600, mb: 2 }}>
            Har du frågor, feedback eller vill se en demo?
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button href="/kontakt" variant="contained" sx={{
              bgcolor: 'var(--text)', color: 'var(--surface-strong)', borderRadius: 999, px: 3.5, py: 1.25,
              fontWeight: 700, textTransform: 'none', boxShadow: 'none', '&:hover': { bgcolor: '#000000', boxShadow: 'none' }
            }}>
              Kontakta oss
            </Button>
            <Button href="/priser" sx={{
              border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 999, px: 3.5, py: 1.25,
              fontWeight: 700, textTransform: 'none'
            }}>
              Se priser
            </Button>
          </Box>
        </Box>
      </Box>

      <Footer />
    </Box>
  );
};

export default OmOss;
