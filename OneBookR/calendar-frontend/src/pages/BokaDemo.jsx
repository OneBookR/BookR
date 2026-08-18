import React, { useState, useEffect, useCallback } from 'react';
import { Box, Container, Paper, Typography, TextField, Button, Alert, Snackbar, CircularProgress } from '@mui/material';
import GoogleLogo from '../assets/GoogleLogo.jsx';
import MicrosoftLogo from '../assets/MicrosoftLogo.jsx';
import { apiRequest, createApiUrl } from '../utils/apiConfig.js';
import DemoCalendarPicker from '../components/DemoCalendarPicker.jsx';

// ✅ "Boka demo": formulär -> logga in med egen kalender -> se en riktig
// jämförelse mot BookRs kalender -> välj tid -> auto-bokat i båda
// kalendrarna. Hela flödet sker på en och samma sida (tre interna steg),
// samma visuella system som landningssidan (App.jsx !user-vyn).
//
// OBS: gör sin EGEN sessionskoll (istället för att lita på App.jsx:s
// `user`-prop) — special-routes i App.jsx renderas innan App:s async
// /api/auth/me-koll hinner svara, så en prop skulle transient vara null
// även för en redan inloggad besökare som precis kom tillbaka från OAuth.
export default function BokaDemo() {
  const urlParams = new URLSearchParams(window.location.search);
  const leadIdFromUrl = urlParams.get('leadId');
  const authError = urlParams.get('error');

  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled) setUser(data); })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setCheckingSession(false); });
    return () => { cancelled = true; };
  }, []);

  // Om vi kommer tillbaka från OAuth med leadId i URL:en och redan är
  // inloggade, hoppa direkt till kalenderjämförelsen.
  const [step, setStep] = useState(() => (leadIdFromUrl ? 'calendar' : 'form'));
  const [leadId, setLeadId] = useState(() => leadIdFromUrl || sessionStorage.getItem('bookr_demo_lead_id') || null);
  const [companyName, setCompanyName] = useState(() => sessionStorage.getItem('bookr_demo_company') || '');

  const [form, setForm] = useState({ companyName: '', contactName: '', email: '', phone: '', address: '' });
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

    setIsSubmitting(true);
    try {
      const res = await apiRequest('/api/book-demo/lead', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.leadId) {
        setLeadId(data.leadId);
        sessionStorage.setItem('bookr_demo_lead_id', data.leadId);
        sessionStorage.setItem('bookr_demo_company', form.companyName.trim());
        setCompanyName(form.companyName.trim());
        setStep('login');
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
  const returnTo = encodeURIComponent(`/boka-demo?leadId=${leadId}`);

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

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'var(--background)' }}>
      <Container maxWidth={containerWidth} sx={{ pt: { xs: 6, md: 10 }, pb: 8 }}>
        <Typography sx={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', textAlign: 'center', mb: 5 }}>
          BookR
        </Typography>

        {step === 'form' && (
          <Paper elevation={0} sx={{ borderRadius: 6, border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)', boxShadow: 'var(--shadow-soft)', p: { xs: 3, md: 5 } }}>
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.03em', mb: 1 }}>
              Boka ett demo
            </Typography>
            <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, mb: 3.5 }}>
              Fyll i dina uppgifter, koppla din kalender och se direkt hur BookR hittar en gemensam tid — det tar under en minut.
            </Typography>

            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 2 }}>
              <TextField label="Företagsnamn" value={form.companyName} onChange={handleChange('companyName')} required fullWidth />
              <TextField label="Kontaktperson" value={form.contactName} onChange={handleChange('contactName')} required fullWidth />
              <TextField label="E-postadress" type="email" value={form.email} onChange={handleChange('email')} required fullWidth />
              <TextField label="Telefon (valfritt)" value={form.phone} onChange={handleChange('phone')} fullWidth />
              <TextField label="Adress (valfritt)" value={form.address} onChange={handleChange('address')} fullWidth />

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
            <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, mb: 3.5 }}>
              Vi jämför direkt mot BookRs kalender så du kan se — inte bara höra om — hur det fungerar.
            </Typography>

            {authError && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>
                Inloggningen misslyckades. Försök igen.
              </Alert>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Button
                variant="contained"
                href={createApiUrl(`/auth/google?returnTo=${returnTo}`)}
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
            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.03em', mb: 4 }}>
              Klar
            </Typography>
            <Paper elevation={0} sx={{ borderRadius: 6, border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)', boxShadow: 'var(--shadow-soft)', p: { xs: 3, md: 5 } }}>
              <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.7, mb: 2.5 }}>
                Nu har du gjort din första kalenderjämförelse med BookR.
              </Typography>
              <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.7, mb: 2.5 }}>
                Ganska skönt att inte behöva kolla i sin egna kalender innan du bokade något?
              </Typography>
              <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.7, mb: 4 }}>
                Vi ser fram emot att prata mer med er.
              </Typography>
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
