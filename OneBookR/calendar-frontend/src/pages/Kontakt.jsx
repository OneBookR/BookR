import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Alert, CircularProgress } from '@mui/material';
import LandingHeader from '../components/LandingHeader.jsx';
import Footer from '../components/Footer.jsx';
import { apiRequest } from '../utils/apiConfig.js';

const FAQ = [
  {
    q: 'Är BookR gratis att använda?',
    a: 'Ja — Free-planen är gratis och kräver inget kort. Personer du bjuder in loggar alltid in och svarar helt gratis, oavsett vilken plan du själv har.'
  },
  {
    q: 'Vilken kalenderinformation kan BookR se?',
    a: 'Bara om du är upptagen eller ledig vid specifika tider — aldrig vad mötena handlar om, om du inte själv ger separat samtycke till det.'
  },
  {
    q: 'Fungerar BookR med Outlook, eller bara Google Kalender?',
    a: 'Båda — och de går att blanda. Du kan köra Microsoft Outlook och jämföra direkt mot en kollega som kör Google Kalender, utan att någon behöver byta tjänst.'
  }
];

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 3,
    bgcolor: 'rgba(255,255,255,0.72)',
    '& fieldset': { borderColor: 'rgba(17,24,39,0.08)' },
    '&:hover fieldset': { borderColor: 'rgba(17,24,39,0.16)' },
    '&.Mui-focused fieldset': { borderColor: 'var(--text)' }
  },
  '& .MuiInputLabel-root.Mui-focused': { color: 'var(--text)' }
};

const Kontakt = () => {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success'|'error', text }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    setStatus(null);
    try {
      const response = await apiRequest('/api/contact', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (response.ok) {
        setStatus({ type: 'success', text: 'Tack! Vi har tagit emot ditt meddelande och återkommer så snart vi kan.' });
        setForm({ name: '', email: '', message: '' });
      } else {
        setStatus({ type: 'error', text: data.error || 'Något gick fel — mejla oss istället på info@onebookr.se.' });
      }
    } catch (error) {
      setStatus({ type: 'error', text: 'Något gick fel — mejla oss istället på info@onebookr.se.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'var(--background)' }}>
      <LandingHeader returnTo="/kontakt" />

      <Box sx={{ maxWidth: 880, mx: 'auto', px: { xs: 3, md: 6 }, pt: { xs: 6, md: 10 }, pb: { xs: 8, md: 10 } }}>

        {/* Hero */}
        <Box sx={{ textAlign: 'center', mb: { xs: 5, md: 6 } }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '2.1rem', md: '3rem' }, lineHeight: 1.1, letterSpacing: '-0.04em', fontWeight: 800, color: 'var(--text)', mb: 2 }}>
            Kontakta oss
          </Typography>
          <Typography sx={{ fontSize: { xs: 15, md: 17 }, lineHeight: 1.6, color: 'var(--text-secondary)', fontWeight: 500, maxWidth: 560, mx: 'auto' }}>
            Frågor om BookR, feedback eller teknisk support — skriv till oss så återkommer vi så snart vi kan.
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 320px' }, gap: 3, mb: { xs: 6, md: 8 } }}>

          {/* Formulär */}
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{
              p: { xs: 3, md: 4 }, borderRadius: 4, border: '1px solid var(--border)',
              bgcolor: 'rgba(255,255,255,0.78)', backdropFilter: 'blur(18px)',
              boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)',
              display: 'flex', flexDirection: 'column', gap: 2
            }}
          >
            <TextField
              fullWidth label="Ditt namn" required sx={fieldSx}
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            />
            <TextField
              fullWidth label="Din e-post" type="email" required sx={fieldSx}
              value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
            />
            <TextField
              fullWidth label="Meddelande" required multiline minRows={4} sx={fieldSx}
              value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
            />
            <Button
              type="submit" variant="contained" disabled={sending}
              sx={{
                mt: 0.5, py: 1.4, borderRadius: 999, bgcolor: 'var(--text)', color: 'var(--surface-strong)',
                fontWeight: 700, textTransform: 'none', boxShadow: 'none', '&:hover': { bgcolor: '#000000', boxShadow: 'none' }
              }}
            >
              {sending ? <CircularProgress size={20} sx={{ color: 'var(--surface-strong)' }} /> : 'Skicka meddelande'}
            </Button>
            {status && (
              <Alert severity={status.type} sx={{ borderRadius: 3 }}>{status.text}</Alert>
            )}
          </Box>

          {/* Direktkontakt */}
          <Box sx={{
            p: { xs: 3, md: 3.5 }, borderRadius: 4, border: '1px solid var(--border)',
            bgcolor: 'rgba(255,255,255,0.78)', backdropFilter: 'blur(18px)',
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)',
            display: 'flex', flexDirection: 'column', gap: 0.75, height: 'fit-content'
          }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Föredrar mejl?
            </Typography>
            <Box component="a" href="mailto:info@onebookr.se" sx={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
              info@onebookr.se
            </Box>
            <Typography sx={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, mt: 0.5 }}>
              Går lika bra — vi läser båda inkorgarna.
            </Typography>
          </Box>
        </Box>

        {/* FAQ */}
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', mb: 2 }}>
            Vanliga frågor
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {FAQ.map((item) => (
              <Box key={item.q} sx={{
                p: 2.5, borderRadius: 4, border: '1px solid var(--border)',
                bgcolor: 'rgba(255,255,255,0.78)', backdropFilter: 'blur(18px)',
                boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)'
              }}>
                <Typography sx={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text)', mb: 0.5 }}>
                  {item.q}
                </Typography>
                <Typography sx={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  {item.a}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Footer />
    </Box>
  );
};

export default Kontakt;
