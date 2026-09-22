import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Typography, Button, TextField, CircularProgress } from '@mui/material';
import { apiRequest } from '../utils/apiConfig.js';
import { GoogleIcon, MicrosoftIcon } from '../assets/ProviderIcons.jsx';
import CalendarPrivacyNote from '../components/CalendarPrivacyNote.jsx';

const GOOGLE_FONT_URLS = {
  Manrope: 'Manrope:wght@400;600;700;800',
  Inter: 'Inter:wght@400;600;700;800',
  Poppins: 'Poppins:wght@400;600;700;800',
  'Playfair Display': 'Playfair+Display:wght@400;600;700;800',
  Roboto: 'Roboto:wght@400;600;900',
};

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2.5,
    bgcolor: '#fff',
    fontSize: 15,
    '& fieldset': { borderColor: 'rgba(17,24,39,0.14)' },
    '&:hover fieldset': { borderColor: 'rgba(17,24,39,0.28)' },
  },
};

// ✅ Publik bokningssida (à la Calendly), /boka/:slug — wirad i App.jsx
// (path.startsWith('/boka/')) precis som /venue/:id sedan innan. ?embed=1
// gör layouten tajtare för <iframe>-inbäddning på en extern hemsida.
//
// Besökaren väljer mellan två vägar:
//  - "Logga in med Google/Microsoft" — BookRs egen styrka: en RIKTIG
//    kalenderjämförelse mellan besökaren och sidans ägare, bara ömsesidigt
//    lediga tider visas, och mötet bokas in i BÅDA kalendrarna.
//  - Fortsätt utan att logga in — ser bara ägarens lediga tider och bokar
//    manuellt (namn + e-post), ingen inloggning krävs alls.
//
// Inloggningen öppnas i en NY FLIK (window.open), inte via window.top.
// window.top.location fungerade inte: sajtbyggare som Wix lägger sina
// iframes i en sandbox UTAN allow-top-navigation, så ett försök att byta
// ut hela toppfönstret blockeras helt tyst av webbläsaren — inloggningen
// hamnade då kvar INUTI den sandboxade iframen, och Googles egna
// inloggningssidor vägrar helt att renderas i ett iframe (anti-
// clickjacking, deras policy, inget vi kan ändra på) — därav 403:an. Att
// öppna en ny flik är en annan sorts operation som tillåts även i en
// sandboxad iframe (kräver bara allow-popups, standard i de flesta
// sajtbyggare) och ger en helt vanlig, oinbäddad flik där Google-
// inloggningen fungerar precis som väntat.
export default function PublicBookingPage() {
  const slug = useMemo(() => window.location.pathname.split('/')[2] || '', []);
  const embed = useMemo(() => new URLSearchParams(window.location.search).get('embed') === '1', []);

  const [page, setPage] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [authMode, setAuthMode] = useState('checking'); // 'checking' | 'choosing' | 'manual' | 'loggedIn'
  const [visitor, setVisitor] = useState(null); // { email, name, provider } när inloggad
  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState(null); // { meetLink } | null
  const [error, setError] = useState('');
  const [loginPopupUrl, setLoginPopupUrl] = useState(null); // reservlänk om window.open blockerades

  const dates = useMemo(() => {
    const list = [];
    const d = new Date();
    for (let i = 0; list.length < 10 && i < 30; i++) {
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      list.push(day);
    }
    return list;
  }, []);

  useEffect(() => {
    if (!slug) { setNotFound(true); return; }
    apiRequest(`/api/public/booking-page/${encodeURIComponent(slug)}`)
      .then(res => (res.ok ? res.json() : Promise.reject(res)))
      .then(data => setPage(data))
      .catch(() => setNotFound(true));
  }, [slug]);

  // Redan inloggad (t.ex. tillbaka från /auth/google)? Hoppa förbi valet.
  useEffect(() => {
    apiRequest('/api/auth/me')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.email) {
          setVisitor({ email: data.email, name: data.displayName || data.name || '', provider: data.provider });
          setAuthMode('loggedIn');
          setForm((f) => ({ ...f, name: data.displayName || data.name || f.name, email: data.email }));
        } else {
          setAuthMode('choosing');
        }
      })
      .catch(() => setAuthMode('choosing'));
  }, []);

  // Ladda vald typsnitt från Google Fonts (redan tillåtet i appens CSP).
  useEffect(() => {
    const font = page?.branding?.font;
    if (!font || !GOOGLE_FONT_URLS[font]) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${GOOGLE_FONT_URLS[font]}&display=swap`;
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, [page?.branding?.font]);

  const loadSlots = useCallback((date) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    setLoadingSlots(true);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const endpoint = authMode === 'loggedIn' ? 'mutual-availability' : 'availability';
    apiRequest(`/api/public/booking-page/${encodeURIComponent(slug)}/${endpoint}?date=${dateStr}`)
      .then(res => (res.ok ? res.json() : { slots: [] }))
      .then(data => setSlots(data.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [slug, authMode]);

  useEffect(() => {
    if (page && (authMode === 'manual' || authMode === 'loggedIn') && dates.length > 0) loadSlots(dates[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, authMode]);

  const startLogin = (provider) => {
    const returnTo = encodeURIComponent(`/boka/${slug}`);
    const target = `/auth/${provider}?returnTo=${returnTo}`;
    // Ny flik, inte window.top — se kommentaren högst upp för varför.
    const win = window.open(target, '_blank', 'noopener,noreferrer');
    if (!win) {
      // Popup blockerad av webbläsaren (ovanligt för ett direkt klick, men
      // händer) — visa en vanlig klickbar länk som reservväg istället.
      setLoginPopupUrl(target);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSlot || !form.name.trim() || !form.email.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await apiRequest(`/api/public/booking-page/${encodeURIComponent(slug)}/book`, {
        method: 'POST',
        body: JSON.stringify({
          start: selectedSlot.start,
          end: selectedSlot.end,
          visitorName: form.name.trim(),
          visitorEmail: form.email.trim(),
          message: form.message.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setBooked({ meetLink: data.meetLink || null });
      } else {
        setError(data.error || 'Kunde inte boka mötet. Försök igen.');
        if (data.code === 'SLOT_TAKEN' && selectedDate) loadSlots(selectedDate);
      }
    } catch {
      setError('Kunde inte boka mötet. Försök igen.');
    } finally {
      setSubmitting(false);
    }
  };

  const accent = page?.branding?.primaryColor || '#111827';
  const font = (page?.branding?.font && GOOGLE_FONT_URLS[page.branding.font]) ? page.branding.font : 'Manrope';
  const hideBranding = Boolean(page?.branding?.hideBookrBranding);

  const pageStyle = {
    minHeight: embed ? 'auto' : '100vh',
    background: embed ? 'transparent' : '#f7f7f3',
    fontFamily: `'${font}', 'Segoe UI', sans-serif`,
    padding: embed ? '16px' : '48px 20px',
    boxSizing: 'border-box',
  };

  if (notFound) {
    return (
      <Box sx={{ ...pageStyle, textAlign: 'center', pt: 10 }}>
        <Typography sx={{ fontSize: 20, fontWeight: 800 }}>Sidan hittades inte</Typography>
        <Typography sx={{ color: '#5f6470', mt: 1 }}>Länken är felaktig eller inte längre aktiv.</Typography>
      </Box>
    );
  }

  if (!page || authMode === 'checking') {
    return (
      <Box sx={{ ...pageStyle, display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress size={28} sx={{ color: accent }} />
      </Box>
    );
  }

  return (
    <Box sx={pageStyle}>
      <Box sx={{ maxWidth: 480, mx: 'auto' }}>
        <Box
          sx={{
            bgcolor: '#fff', borderRadius: 5, border: '1px solid rgba(17,24,39,0.09)',
            boxShadow: '0 24px 80px rgba(15,23,42,0.08)', p: { xs: 3, sm: 4 },
          }}
        >
          {page.branding?.logoUrl && (
            <Box component="img" src={page.branding.logoUrl} alt={page.displayName} sx={{ maxHeight: 44, maxWidth: '70%', mb: 2.5, objectFit: 'contain' }} />
          )}
          <Typography sx={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: '#111827' }}>
            {page.displayName}
          </Typography>
          {page.bio && (
            <Typography sx={{ fontSize: 14, color: '#5f6470', mt: 0.75, lineHeight: 1.6 }}>{page.bio}</Typography>
          )}
          <Typography sx={{ fontSize: 12.5, color: '#5f6470', mt: 1.5, fontWeight: 700 }}>
            {page.durationMinutes} minuter
          </Typography>

          {booked ? (
            <Box sx={{ mt: 3.5, textAlign: 'center', py: 2 }}>
              <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: `${accent}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 13L10 18L19 7" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Box>
              <Typography sx={{ fontSize: 17, fontWeight: 800, color: '#111827' }}>Mötet är bokat!</Typography>
              <Typography sx={{ fontSize: 13.5, color: '#5f6470', mt: 0.75 }}>
                En kalenderinbjudan är på väg till {form.email}.
              </Typography>
              {booked.meetLink && (
                <Typography sx={{ fontSize: 13, mt: 1.5 }}>
                  <a href={booked.meetLink} target="_blank" rel="noopener noreferrer" style={{ color: accent, fontWeight: 700 }}>Möteslänk</a>
                </Typography>
              )}
              <Button
                onClick={() => {
                  setBooked(null);
                  setSelectedSlot(null);
                  setError('');
                  setForm((f) => ({ ...f, message: '' }));
                  if (selectedDate) loadSlots(selectedDate);
                }}
                sx={{ mt: 2.5, fontSize: 13, color: accent, textTransform: 'none', fontWeight: 700 }}
              >
                ← Boka en till tid
              </Button>
            </Box>
          ) : authMode === 'choosing' ? (
            <Box sx={{ mt: 3.5 }}>
              <Typography sx={{ fontSize: 13.5, color: '#5f6470', mb: 2, lineHeight: 1.6 }}>
                Logga in med din egen kalender så visar vi bara tider som passar er <strong>båda</strong> — annars ser
                du {page.displayName.split(' ')[0]}s lediga tider och väljer själv. Inloggningen öppnas i en ny flik.
              </Typography>
              <CalendarPrivacyNote phase="before" maxWidth="100%" sx={{ mb: 2.5 }} />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button
                  onClick={() => startLogin('google')}
                  startIcon={<GoogleIcon size={18} />}
                  fullWidth
                  sx={{ py: 1.2, borderRadius: 2.5, border: '1px solid rgba(17,24,39,0.14)', color: '#111827', fontWeight: 700, textTransform: 'none', justifyContent: 'flex-start', px: 2 }}
                >
                  Logga in med Google
                </Button>
                <Button
                  onClick={() => startLogin('microsoft')}
                  startIcon={<MicrosoftIcon size={18} />}
                  fullWidth
                  sx={{ py: 1.2, borderRadius: 2.5, border: '1px solid rgba(17,24,39,0.14)', color: '#111827', fontWeight: 700, textTransform: 'none', justifyContent: 'flex-start', px: 2 }}
                >
                  Logga in med Microsoft
                </Button>
              </Box>
              <Button
                onClick={() => setAuthMode('manual')}
                fullWidth
                sx={{ mt: 2, py: 1, fontSize: 13, color: '#5f6470', textTransform: 'none', fontWeight: 600 }}
              >
                Fortsätt utan att logga in
              </Button>
              {loginPopupUrl && (
                <Typography sx={{ fontSize: 12.5, color: '#5f6470', mt: 1.5, textAlign: 'center' }}>
                  Din webbläsare blockerade fönstret —{' '}
                  <a href={loginPopupUrl} target="_blank" rel="noopener noreferrer" style={{ color: accent, fontWeight: 700 }}>
                    klicka här för att logga in
                  </a>.
                </Typography>
              )}
            </Box>
          ) : !selectedSlot ? (
            <>
              {authMode === 'loggedIn' && (
                <Typography sx={{ fontSize: 12, color: accent, fontWeight: 700, mt: 2 }}>
                  Inloggad som {visitor?.email} — visar tider som passar er båda.
                </Typography>
              )}
              <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', mt: 2, pb: 1 }}>
                {dates.map((d) => {
                  const active = selectedDate && d.toDateString() === selectedDate.toDateString();
                  return (
                    <Box
                      key={d.toISOString()}
                      onClick={() => loadSlots(d)}
                      sx={{
                        flexShrink: 0, minWidth: 56, textAlign: 'center', py: 1, px: 0.5, borderRadius: 2.5, cursor: 'pointer',
                        bgcolor: active ? accent : 'rgba(17,24,39,0.04)', color: active ? '#fff' : '#111827',
                        border: active ? 'none' : '1px solid rgba(17,24,39,0.08)',
                      }}
                    >
                      <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', opacity: 0.8 }}>
                        {d.toLocaleDateString('sv-SE', { weekday: 'short' })}
                      </Typography>
                      <Typography sx={{ fontSize: 15, fontWeight: 800 }}>{d.getDate()}</Typography>
                    </Box>
                  );
                })}
              </Box>

              {loadingSlots ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={22} sx={{ color: accent }} />
                </Box>
              ) : slots.length === 0 ? (
                <Typography sx={{ fontSize: 13.5, color: '#5f6470', textAlign: 'center', py: 4 }}>
                  Inga lediga tider den här dagen.
                </Typography>
              ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 2 }}>
                  {slots.map((s) => (
                    <Button
                      key={s.start}
                      onClick={() => setSelectedSlot(s)}
                      sx={{
                        borderRadius: 2.5, py: 1, fontWeight: 700, textTransform: 'none', color: accent,
                        border: `1px solid ${accent}`, '&:hover': { bgcolor: `${accent}12` },
                      }}
                    >
                      {new Date(s.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                    </Button>
                  ))}
                </Box>
              )}
            </>
          ) : (
            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
              <Button onClick={() => setSelectedSlot(null)} sx={{ fontSize: 12.5, color: '#5f6470', textTransform: 'none', p: 0, mb: 2 }}>
                ← Välj en annan tid
              </Button>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#111827', mb: 2 }}>
                {new Date(selectedSlot.start).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
                {' · '}
                {new Date(selectedSlot.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <TextField label="Namn" required fullWidth value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={fieldSx} />
                <TextField
                  label="E-post" type="email" required fullWidth value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={authMode === 'loggedIn'}
                  sx={fieldSx}
                />
                <TextField label="Meddelande (valfritt)" multiline minRows={2} fullWidth value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} sx={fieldSx} />
              </Box>
              {error && <Typography sx={{ fontSize: 13, color: '#b42318', mt: 1.5 }}>{error}</Typography>}
              <Button
                type="submit"
                disabled={submitting}
                fullWidth
                sx={{ mt: 2.5, py: 1.4, borderRadius: 2.75, bgcolor: accent, color: '#fff', fontWeight: 700, textTransform: 'none', '&:hover': { bgcolor: accent, opacity: 0.9 } }}
              >
                {submitting ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Boka möte'}
              </Button>
            </Box>
          )}
        </Box>

        {!hideBranding && (
          <Typography sx={{ textAlign: 'center', fontSize: 11.5, color: '#9ca3af', mt: 2 }}>
            Bokat med{' '}
            <a
              href="https://www.onebookr.se"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#9ca3af', fontWeight: 700 }}
            >
              BookR
            </a>
          </Typography>
        )}
      </Box>
    </Box>
  );
}
