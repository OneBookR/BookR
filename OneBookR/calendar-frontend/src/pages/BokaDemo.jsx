import React, { useState, useEffect, useCallback } from 'react';
import { Box, Container, Paper, Typography, TextField, Button, Alert, Snackbar, CircularProgress } from '@mui/material';
import GoogleLogo from '../assets/GoogleLogo.jsx';
import MicrosoftLogo from '../assets/MicrosoftLogo.jsx';
import { apiRequest, createApiUrl } from '../utils/apiConfig.js';
import DemoCalendarPicker from '../components/DemoCalendarPicker.jsx';
import LandingHeader from '../components/LandingHeader.jsx';
import CalendarPrivacyNote from '../components/CalendarPrivacyNote.jsx';
import { trackEvent } from '../utils/analytics.js';

// ✅ Delad fältstil så formulärets inputs matchar BookRs formspråk
// (mjuka hörn, border-token, svart fokus) istället för MUI-default.
const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2.5,
    bgcolor: 'var(--surface)',
    fontSize: 15,
    '& fieldset': { borderColor: 'var(--border)' },
    '&:hover fieldset': { borderColor: 'rgba(17,24,39,0.22)' },
    '&.Mui-focused fieldset': { borderColor: 'var(--text)', borderWidth: 1 },
  },
  '& .MuiInputLabel-root': { color: 'var(--text-secondary)', fontWeight: 600 },
  '& .MuiInputLabel-root.Mui-focused': { color: 'var(--text)' },
};

// ✅ Tre-stegs progress: formulär -> koppla kalender -> välj tid.
function StepDots({ active }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mb: 4 }}>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          sx={{
            width: i === active ? 22 : 7,
            height: 7,
            borderRadius: 999,
            bgcolor: i === active ? 'var(--text)' : 'rgba(17,24,39,0.16)',
            transition: 'all .3s ease',
          }}
        />
      ))}
    </Box>
  );
}

// ✅ Animerad checkmark i cirkel — samma nål-formspråk som resten av
// BookR (inline SVG, aldrig emoji). Ritas som en path som "ritas fram"
// via stroke-dasharray/offset för en subtil, engångs entrance-känsla.
function SuccessCheckIcon({ size = 64 }) {
  return (
    <Box
      sx={{
        width: size, height: size, borderRadius: '50%',
        bgcolor: 'rgba(31,122,77,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        '@keyframes bookr-check-draw': { to: { strokeDashoffset: 0 } },
        '@keyframes bookr-check-pop': { from: { transform: 'scale(0.7)', opacity: 0 }, to: { transform: 'scale(1)', opacity: 1 } }
      }}
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" style={{ animation: 'bookr-check-pop 320ms ease-out' }}>
        <path
          d="M4 12.5L9.5 18L20 6"
          stroke="var(--success)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="1"
          style={{
            strokeDasharray: 1,
            strokeDashoffset: 1,
            animation: 'bookr-check-draw 500ms 200ms ease-out forwards'
          }}
        />
      </svg>
    </Box>
  );
}

// ✅ "Boka demo": formulär -> logga in med egen kalender -> se en riktig
// jämförelse mot BookRs kalender -> välj tid -> auto-bokat i båda
// kalendrarna. Hela flödet sker på en och samma sida (tre interna steg),
// samma visuella system som landningssidan (App.jsx !user-vyn).
//
// OBS: gör sin EGEN sessionskoll (istället för att lita på App.jsx:s
// `user`-prop) — special-routes i App.jsx renderas innan App:s async
// /api/auth/me-koll hinner svara, så en prop skulle transient vara null
// även för en redan inloggad besökare som precis kom tillbaka från OAuth.
export default function BokaDemo({ variant = 'demo' }) {
  const isEnterprise = variant === 'enterprise';
  const routeBase = isEnterprise ? '/enterprise' : '/boka-demo';
  const urlParams = new URLSearchParams(window.location.search);
  const leadIdFromUrl = urlParams.get('leadId');
  const authError = urlParams.get('error');

  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setUser(data);
        // ✅ leadIdFromUrl betyder att vi precis kom tillbaka från en
        // OAuth-redirect (se returnTo i login-steget nedan) — logga
        // "inloggning klar" bara då, inte vid varje sidladdning med en
        // redan aktiv session.
        if (data && leadIdFromUrl) {
          trackEvent('demo_login_completed');
        }
      })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setCheckingSession(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Om vi kommer tillbaka från OAuth med leadId i URL:en och redan är
  // inloggade, hoppa direkt till kalenderjämförelsen.
  const [step, setStep] = useState(() => (leadIdFromUrl ? 'calendar' : 'form'));
  const [leadId, setLeadId] = useState(() => leadIdFromUrl || sessionStorage.getItem('bookr_demo_lead_id') || null);
  const [companyName, setCompanyName] = useState(() => sessionStorage.getItem('bookr_demo_company') || '');

  const [form, setForm] = useState({ companyName: '', contactName: '', email: '', phone: '', address: '', employees: '', seats: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [confirmedMeeting, setConfirmedMeeting] = useState(null);

  const handleChange = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!form.companyName.trim() || !form.contactName.trim() || !form.email.trim()) {
      setToast({ open: true, message: 'Företagsnamn, kontaktperson och e-post krävs.', severity: 'error' });
      return;
    }
    if (isEnterprise && (!form.employees.trim() || !form.seats.trim())) {
      setToast({ open: true, message: 'Ange antal anställda och antal säten.', severity: 'error' });
      return;
    }

    const payload = isEnterprise
      ? { ...form, leadType: 'enterprise' }
      : { companyName: form.companyName, contactName: form.contactName, email: form.email, phone: form.phone, address: form.address };

    setIsSubmitting(true);
    try {
      const res = await apiRequest('/api/book-demo/lead', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.leadId) {
        setLeadId(data.leadId);
        sessionStorage.setItem('bookr_demo_lead_id', data.leadId);
        sessionStorage.setItem('bookr_demo_company', form.companyName.trim());
        setCompanyName(form.companyName.trim());
        setStep('login');
        trackEvent('demo_form_submitted');
      } else {
        setToast({ open: true, message: data.error || 'Något gick fel. Försök igen.', severity: 'error' });
      }
    } catch (err) {
      setToast({ open: true, message: 'Nätverksfel. Försök igen.', severity: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  }, [form]);

  // ✅ Efter Google/Microsoft-inloggning måste vi hitta tillbaka hit MED
  // leadId kvar, så OAuth-returtVägen bär leadId i returnTo-frågesträngen.
  const returnTo = encodeURIComponent(`${routeBase}?leadId=${leadId}`);

  // Sessionskollen är klar men ingen användare hittades — leadId i URL:en
  // utan giltig session (t.ex. utgången cookie). Backa till login-steget.
  useEffect(() => {
    if (step === 'calendar' && !checkingSession && !user) {
      setStep('login');
    }
  }, [step, checkingSession, user]);

  // Om URL:en säger att vi ska vara i kalender-steget men sessionskollen
  // ännu inte bekräftat att vi faktiskt är inloggade, vänta — annars
  // hinner DemoCalendarPicker anropa en autentiserad endpoint för tidigt
  // och få ett 401 den inte kan återhämta sig snyggt från.
  if (step === 'calendar' && checkingSession) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'var(--background)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  // ✅ Kalendersteget behöver en bredare yta (veckovy) än formulär/login-
  // korten, som ska förbli smala och centrerade.
  const containerWidth = step === 'calendar' ? 'md' : 'sm';

  const activeStep = step === 'form' ? 0 : step === 'login' ? 1 : 2;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'var(--background)' }}>
      <LandingHeader showLogin={false} showDemo={false} />

      <Container maxWidth={containerWidth} sx={{ pt: { xs: 5, md: 8 }, pb: 8 }}>
        {!confirmedMeeting && <StepDots active={activeStep} />}

        {step === 'form' && (
          <Paper elevation={0} sx={{ borderRadius: 6, border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)', boxShadow: 'var(--shadow-soft)', p: { xs: 3, md: 5 } }}>
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.03em', mb: 1 }}>
              {isEnterprise ? 'Boka ett samtal om Enterprise' : 'Boka ett demo'}
            </Typography>
            <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, mb: 3.5 }}>
              {isEnterprise
                ? 'Fyll i era uppgifter så bokar vi en tid för att gå igenom en Enterprise-modell som passar er storlek — säten, villkor och onboarding.'
                : 'Fyll i dina uppgifter, koppla din kalender och se direkt hur BookR hittar en gemensam tid — det tar under en minut.'}
            </Typography>

            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 2 }}>
              <TextField label="Företagsnamn" value={form.companyName} onChange={handleChange('companyName')} required fullWidth sx={fieldSx} />
              <TextField label="Kontaktperson" value={form.contactName} onChange={handleChange('contactName')} required fullWidth sx={fieldSx} />
              <TextField label="E-postadress" type="email" value={form.email} onChange={handleChange('email')} required fullWidth sx={fieldSx} />
              <TextField label="Telefon (valfritt)" value={form.phone} onChange={handleChange('phone')} fullWidth sx={fieldSx} />
              <TextField label="Adress (valfritt)" value={form.address} onChange={handleChange('address')} fullWidth sx={fieldSx} />
              {isEnterprise && (
                <>
                  <TextField label="Antal anställda på företaget" type="number" value={form.employees} onChange={handleChange('employees')} required fullWidth sx={fieldSx} inputProps={{ min: 1 }} />
                  <TextField label="Antal säten ni behöver" type="number" value={form.seats} onChange={handleChange('seats')} required fullWidth sx={fieldSx} inputProps={{ min: 1 }} />
                </>
              )}

              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={isSubmitting}
                sx={{ mt: 1, py: 1.6, borderRadius: 3, bgcolor: 'var(--text)', color: 'var(--surface-strong)', fontWeight: 700, boxShadow: 'none', '&:hover': { bgcolor: '#000', boxShadow: 'none' } }}
              >
                {isSubmitting ? 'Skickar...' : 'Fortsätt'}
              </Button>
            </Box>
          </Paper>
        )}

        {step === 'login' && (
          <Paper elevation={0} sx={{ borderRadius: 6, border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)', boxShadow: 'var(--shadow-soft)', p: { xs: 3, md: 5 } }}>
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.03em', mb: 1 }}>
              Koppla din kalender
            </Typography>
            <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, mb: 2.5 }}>
              Vi jämför direkt mot BookRs kalender så du kan se — inte bara höra om — hur det fungerar.
            </Typography>

            <CalendarPrivacyNote phase="before" maxWidth="100%" sx={{ mb: 3.5 }} />

            {authError && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>
                Inloggningen misslyckades. Försök igen.
              </Alert>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Button
                variant="contained"
                href={createApiUrl(`/auth/google?returnTo=${returnTo}`)}
                onClick={() => trackEvent('demo_login_started', { provider: 'google' })}
                size="large"
                startIcon={<GoogleLogo size={20} />}
                fullWidth
                sx={{ py: 1.7, borderRadius: 3, bgcolor: 'var(--text)', color: 'var(--surface-strong)', boxShadow: 'none', '&:hover': { bgcolor: '#000', boxShadow: 'none' } }}
              >
                Fortsätt med Google
              </Button>
              <Button
                variant="outlined"
                href={createApiUrl(`/auth/microsoft?returnTo=${returnTo}`)}
                onClick={() => trackEvent('demo_login_started', { provider: 'microsoft' })}
                size="large"
                startIcon={<MicrosoftLogo size={20} />}
                fullWidth
                sx={{ py: 1.7, borderRadius: 3, borderColor: 'var(--border)', color: 'var(--text)', '&:hover': { borderColor: 'rgba(17,24,39,0.22)', bgcolor: 'rgba(17,24,39,0.02)' } }}
              >
                Fortsätt med Microsoft
              </Button>
            </Box>
          </Paper>
        )}

        {step === 'calendar' && !confirmedMeeting && (
          <DemoCalendarPicker
            leadId={leadId}
            companyName={companyName}
            onBooked={(meeting) => setConfirmedMeeting(meeting)}
            onError={(message) => setToast({ open: true, message, severity: 'error' })}
          />
        )}

        {confirmedMeeting && (
          <Box sx={{ textAlign: 'center' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
              <SuccessCheckIcon />
            </Box>

            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.03em', mb: 1 }}>
              Klart!
            </Typography>
            <Typography sx={{ fontSize: 15, color: 'var(--text-secondary)', mb: 4, maxWidth: 420, mx: 'auto', lineHeight: 1.6 }}>
              Ni ses redan i era kalendrar — ingen mer att göra från din sida.
            </Typography>

            <Paper elevation={0} sx={{ borderRadius: 6, border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)', boxShadow: 'var(--shadow-soft)', p: { xs: 3, md: 5 }, textAlign: 'left' }}>
              {/* Mötesdetaljer som ett tydligt kort, samma mönster som
                  bekräftelsedialogen i DemoCalendarPicker */}
              <Box
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5, p: 2, mb: 3,
                  borderRadius: 3, bgcolor: 'rgba(17,24,39,0.03)', border: '1px solid rgba(17,24,39,0.05)'
                }}
              >
                <Box
                  sx={{
                    width: 40, height: 40, borderRadius: 2.5, bgcolor: 'var(--text)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, fontSize: 13
                  }}
                >
                  {new Date(confirmedMeeting.start).toLocaleDateString('sv-SE', { day: 'numeric', timeZone: 'Europe/Stockholm' })}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, textTransform: 'capitalize' }}>
                    {companyName} x BookR – {isEnterprise ? 'Enterprise' : 'Demo'}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {new Date(confirmedMeeting.start).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' })}
                    {', '}
                    {new Date(confirmedMeeting.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })}
                    {' – '}
                    {new Date(confirmedMeeting.end).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })}
                  </Typography>
                </Box>
              </Box>

              {isEnterprise ? (
                <>
                  <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.7, mb: 2 }}>
                    Tack! Tiden ligger i era kalendrar.
                  </Typography>
                  <Typography sx={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, mb: 4 }}>
                    Vi går igenom en Enterprise-modell som passar er storlek — säten, villkor och onboarding — på mötet.
                  </Typography>
                </>
              ) : (
                <>
                  <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.7, mb: 2 }}>
                    Nu har du gjort din första kalenderjämförelse med BookR.
                  </Typography>
                  <Typography sx={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, mb: 2 }}>
                    Ganska skönt att slippa kolla i sin egen kalender innan man bokar något?
                  </Typography>
                  <Typography sx={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, mb: 4 }}>
                    Vi ser fram emot att prata mer med er.
                  </Typography>
                </>
              )}

              <Button
                href="/"
                variant="outlined"
                fullWidth
                sx={{ py: 1.6, borderRadius: 3, borderColor: 'var(--border)', color: 'var(--text)', fontWeight: 700, '&:hover': { borderColor: 'rgba(17,24,39,0.22)', bgcolor: 'rgba(17,24,39,0.02)' } }}
              >
                Tillbaka till startsidan
              </Button>
            </Paper>
          </Box>
        )}
      </Container>

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setToast({ ...toast, open: false })} severity={toast.severity} sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
