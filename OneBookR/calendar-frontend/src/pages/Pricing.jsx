import React, { useState, useCallback, useEffect } from 'react';
import { Box, Typography, Button, Alert, Snackbar, CircularProgress } from '@mui/material';
import LandingHeader from '../components/LandingHeader.jsx';
import { apiRequest, createApiUrl } from '../utils/apiConfig.js';
import { trackEvent } from '../utils/analytics.js';

const CHECK = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
    <path d="M5 12.5L10 17.5L19 7" stroke="var(--success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    desc: 'För att komma igång och testa BookR på riktigt.',
    priceMonthly: '0', priceYearly: '0',
    noteMonthly: 'kr · för alltid', noteYearly: 'kr · för alltid',
    cta: 'Kom igång gratis',
    highlight: false,
    features: [
      'Full cross-platform-synk — Google ↔ Microsoft',
      '3 sessioner per månad',
      'Max 5 deltagare per session',
      'Auto-bokning + möteslänk',
      'Inbjudna gäster alltid gratis',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    desc: 'För dig som bokar möten varje vecka.',
    priceMonthly: '149', priceYearly: '119',
    noteMonthly: 'kr/mån per användare', noteYearly: 'kr/mån · årsvis 1 428 kr',
    cta: 'Välj Pro',
    highlight: true,
    plusOf: 'Free',
    features: [
      'Obegränsade sessioner',
      'Upp till 10 kalendrar per session',
      'Bokningssida med ditt namn',
      'Uppgiftshantering',
      'Prioriterad e-postsupport',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    desc: 'För team som bokar tillsammans.',
    priceMonthly: '229', priceYearly: '179',
    noteMonthly: 'kr/säte/mån · minst 3 säten', noteYearly: 'kr/säte/mån · årsvis 2 148 kr',
    cta: 'Välj Business',
    highlight: false,
    plusOf: 'Pro',
    features: [
      'Upp till 20 deltagare per session',
      'White-label bokningssida — er egen branding',
      'Centraliserad fakturering',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    desc: 'För stora byråer och bolag med förhandlade avtal.',
    priceMonthly: 'Offert', priceYearly: 'Offert',
    noteMonthly: 'från ~15 000 kr/mån', noteYearly: 'från ~15 000 kr/mån',
    cta: 'Kontakta oss',
    dark: true,
    plusOf: 'Business',
    features: [
      'Förhandlat årsavtal med volymvillkor',
      'Dedikerad onboarding för teamet',
    ],
  },
];

export default function Pricing({ user }) {
  const [yearly, setYearly] = useState(false);
  const [busy, setBusy] = useState(null); // plan-id under bearbetning
  const [toast, setToast] = useState({ open: false, message: '', severity: 'error' });
  const billingParam = new URLSearchParams(window.location.search).get('billing');
  const cancelled = billingParam === 'cancelled';
  const [activating, setActivating] = useState(billingParam === 'success');
  // Pro/Business är låsta tills PAID_PLANS_ENABLED=true på servern. Default
  // låst — vi visar "Kommer snart" och döljer priset.
  const [paidEnabled, setPaidEnabled] = useState(false);

  const period = yearly ? 'yearly' : 'monthly';

  useEffect(() => {
    apiRequest('/api/billing/config')
      .then((r) => r.json())
      .then((d) => setPaidEnabled(Boolean(d?.paidPlansEnabled)))
      .catch(() => setPaidEnabled(false));
  }, []);

  // Kärnlogiken: POSTa checkout och skicka vidare till Stripe. period skickas
  // explicit så auto-återupptagningen kan använda värdet från URL:en.
  const startCheckout = useCallback(async (planId, per) => {
    trackEvent('checkout_started', { plan: planId, period: per });
    setBusy(planId);
    try {
      const res = await apiRequest('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: planId, period: per }),
      });
      if (res.status === 401) {
        // Inte inloggad än → logga in och kom tillbaka hit med checkout-avsikten
        // i URL:en, så vi automatiskt fortsätter till Stripe efteråt.
        const back = `/priser?checkout=${planId}&period=${per}`;
        window.location.href = createApiUrl(`/auth/google?returnTo=${encodeURIComponent(back)}`);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      if (res.status === 503) {
        setToast({ open: true, message: 'Betalning är inte aktiverat än. Hör av dig till info@onebookr.se.', severity: 'info' });
      } else {
        setToast({ open: true, message: data.error || 'Kunde inte starta checkout. Försök igen.', severity: 'error' });
      }
    } catch {
      setToast({ open: true, message: 'Nätverksfel. Försök igen.', severity: 'error' });
    } finally {
      setBusy(null);
    }
  }, []);

  const handleCta = useCallback((plan) => {
    if (plan.id === 'free') {
      // Free-signup: logga in (ingen whitelist krävs för /priser-flödet) och
      // skickas sen rakt in i appen på Free-nivå.
      window.location.href = user?.email
        ? '/'
        : createApiUrl(`/auth/google?returnTo=${encodeURIComponent('/priser?welcome=free')}`);
      return;
    }
    if (plan.id === 'enterprise') {
      window.location.href = '/enterprise';
      return;
    }
    startCheckout(plan.id, period);
  }, [user, period, startCheckout]);

  // Free-signup: tillbaka från inloggning med ?welcome=free → in i appen.
  useEffect(() => {
    if (!user?.email) return;
    if (new URLSearchParams(window.location.search).get('welcome')) {
      window.location.href = '/';
    }
  }, [user]);

  // Kom tillbaka från inloggning med ?checkout=pro&period=monthly → fortsätt
  // automatiskt till Stripe (en gång).
  useEffect(() => {
    if (!user?.email) return;
    const p = new URLSearchParams(window.location.search);
    const co = p.get('checkout');
    if (co !== 'pro' && co !== 'business') return;
    const per = p.get('period') === 'yearly' ? 'yearly' : 'monthly';
    setYearly(per === 'yearly');
    startCheckout(co, per);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Tillbaka från lyckad checkout → poll:a tills webhooken satt planen,
  // skicka sen in i appen.
  useEffect(() => {
    if (billingParam !== 'success') return;
    let tries = 0;
    const iv = setInterval(async () => {
      tries += 1;
      try {
        const res = await apiRequest('/api/billing/status');
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.plan && data.plan !== 'free') {
          clearInterval(iv);
          window.location.href = '/';
          return;
        }
      } catch { /* fortsätt försöka */ }
      if (tries >= 12) { // ~24 s
        clearInterval(iv);
        setActivating(false);
        setToast({ open: true, message: 'Betalningen gick igenom men kontot tar en stund att aktivera. Ladda om sidan om en minut.', severity: 'info' });
      }
    }, 2000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingParam]);

  const seg = (active) => ({
    padding: '9px 20px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: 'none', fontFamily: 'inherit',
    background: active ? 'var(--text)' : 'transparent',
    color: active ? 'var(--surface-strong)' : 'var(--text-secondary)',
  });

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'var(--background)' }}>
      <LandingHeader returnTo="/priser" />

      {activating && (
        <Box sx={{ maxWidth: 480, mx: 'auto', px: 3, pt: { xs: 10, md: 16 }, textAlign: 'center' }}>
          <CircularProgress size={32} sx={{ color: 'var(--text)', mb: 3 }} />
          <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.03em', mb: 1 }}>
            Betalningen gick igenom
          </Typography>
          <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Aktiverar ditt konto — du skickas vidare automatiskt om någon sekund.
          </Typography>
        </Box>
      )}

      <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 3, md: 6 }, pt: { xs: 5, md: 8 }, pb: { xs: 8, md: 12 }, display: activating ? 'none' : 'block' }}>

        {cancelled && (
          <Alert severity="info" sx={{ mb: 4, borderRadius: 3, maxWidth: 760, mx: 'auto' }}>
            Checkouten avbröts — ingen betalning gjordes. Välj en plan när du är redo.
          </Alert>
        )}

        {/* Hero */}
        <Box sx={{ maxWidth: 720, mx: 'auto', textAlign: 'center', mb: 5 }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.9rem', md: '2.8rem' }, lineHeight: 1.1, letterSpacing: '-0.04em', fontWeight: 800, mb: 2 }}>
            Betala för tiden du sparar — inte för dina gäster.
          </Typography>
          <Typography sx={{ fontSize: { xs: 15, md: 17 }, lineHeight: 1.6, color: 'var(--text-secondary)', fontWeight: 500, mb: 3.5 }}>
            Varje plan har äkta synk mellan Google Kalender och Microsoft Outlook — utan att motparten kopplar in sin kalender. Personer du bjuder in loggar in gratis och betalar aldrig något.
          </Typography>
          {paidEnabled && (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, p: 0.5, borderRadius: 999, border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)' }}>
              <button type="button" style={seg(!yearly)} onClick={() => setYearly(false)}>Månadsvis</button>
              <button type="button" style={seg(yearly)} onClick={() => setYearly(true)}>Årsvis · spara upp till 22%</button>
            </Box>
          )}
        </Box>

        {/* Plan cards */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2.5, alignItems: 'start' }}>
          {PLANS.map((plan) => {
            const locked = (plan.id === 'pro' || plan.id === 'business') && !paidEnabled;
            const price = locked ? 'Snart' : (yearly ? plan.priceYearly : plan.priceMonthly);
            const note = locked ? '' : (yearly ? plan.noteYearly : plan.noteMonthly);
            const isNum = /^\d/.test(price);
            return (
              <Box
                key={plan.id}
                sx={{
                  position: 'relative',
                  display: 'flex', flexDirection: 'column', borderRadius: 5, p: 3.5,
                  bgcolor: plan.dark ? 'var(--text)' : 'var(--surface-strong)',
                  border: plan.highlight ? '2px solid var(--text)' : '1px solid var(--border)',
                  boxShadow: plan.highlight ? '0 24px 80px rgba(15,23,42,0.12)' : '0 20px 60px rgba(15,23,42,0.07)',
                  opacity: locked ? 0.72 : 1,
                }}
              >
                {locked && (
                  <Box sx={{ position: 'absolute', top: 14, right: 14, px: 1, py: 0.25, borderRadius: 999, bgcolor: 'rgba(17,24,39,0.06)', color: 'var(--text-secondary)', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Snart
                  </Box>
                )}
                <Typography sx={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: plan.dark ? '#fff' : 'var(--text)' }}>{plan.name}</Typography>
                <Typography sx={{ fontSize: 13, lineHeight: 1.5, my: 1, minHeight: 42, color: plan.dark ? 'rgba(255,255,255,0.62)' : 'var(--text-secondary)' }}>{plan.desc}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                  <Typography sx={{ fontSize: isNum ? 40 : 26, fontWeight: 800, letterSpacing: '-0.04em', color: plan.dark ? '#fff' : 'var(--text)' }}>{price}</Typography>
                  {isNum && <Typography sx={{ fontSize: 15, fontWeight: 700, color: plan.dark ? 'rgba(255,255,255,0.62)' : 'var(--text-secondary)' }}>kr</Typography>}
                </Box>
                <Typography sx={{ fontSize: 12, mt: 0.5, mb: 2.5, minHeight: 32, color: plan.dark ? 'rgba(255,255,255,0.62)' : 'var(--text-secondary)' }}>{locked ? 'Prissättning öppnar snart' : (isNum ? note.replace(/^kr\s*·?\s*/, '') : note)}</Typography>

                <Button
                  onClick={() => handleCta(plan)}
                  disabled={busy === plan.id || locked}
                  variant={plan.highlight || plan.dark ? 'contained' : 'outlined'}
                  sx={{
                    py: 1.4, borderRadius: 3, fontWeight: 700, fontSize: 14, boxShadow: 'none', textTransform: 'none',
                    ...(plan.dark
                      ? { bgcolor: '#fff', color: 'var(--text)', '&:hover': { bgcolor: '#f0f0f0' } }
                      : plan.highlight
                      ? { bgcolor: 'var(--text)', color: 'var(--surface-strong)', '&:hover': { bgcolor: '#000' } }
                      : { borderColor: 'var(--border)', color: 'var(--text)', '&:hover': { borderColor: 'rgba(17,24,39,0.22)', bgcolor: 'rgba(17,24,39,0.02)' } }),
                    '&.Mui-disabled': locked ? { bgcolor: 'rgba(17,24,39,0.05)', color: 'var(--text-secondary)', border: 'none' } : {},
                  }}
                >
                  {busy === plan.id ? <CircularProgress size={18} sx={{ color: 'inherit' }} /> : locked ? 'Kommer snart' : plan.cta}
                </Button>

                <Box sx={{ height: '1px', bgcolor: plan.dark ? 'rgba(255,255,255,0.14)' : 'var(--border)', my: 2.5 }} />
                {plan.plusOf && (
                  <Typography sx={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', mb: 0.5, color: plan.dark ? 'rgba(255,255,255,0.6)' : 'var(--text-secondary)' }}>
                    Allt i {plan.plusOf}, plus:
                  </Typography>
                )}
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {plan.features.map((f) => (
                    <Box component="li" key={f} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45, color: plan.dark ? 'rgba(255,255,255,0.92)' : 'var(--text)' }}>
                      {CHECK}
                      <span>{f}</span>
                    </Box>
                  ))}
                </Box>
              </Box>
            );
          })}
        </Box>

        <Typography sx={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', mt: 3 }}>
          {paidEnabled
            ? 'Priser exkl. moms. Två betalperioder: månad eller år. Byt eller säg upp när du vill.'
            : 'Kom igång gratis idag. Pro och Business öppnar för köp inom kort.'}
        </Typography>

        {/* Kort FAQ */}
        <Box sx={{ maxWidth: 720, mx: 'auto', mt: { xs: 8, md: 12 } }}>
          <Typography sx={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', textAlign: 'center', mb: 3 }}>Vanliga frågor</Typography>
          {[
            ['Behöver personerna jag bjuder in ett konto?', 'Nej. Inbjudna gäster loggar in med Google eller Microsoft och går rakt in i sessionen. De betalar aldrig något — bara du som organisatör har en plan.'],
            ['Vad är en session?', 'En kalenderjämförelse där BookR matchar två eller fler kalendrar och visar de tider som är lediga för alla. Du kan boka flera möten ur samma session.'],
            ['Ser BookR vad som står i min kalender?', 'Nej. Vi läser bara av om du är ledig eller upptagen — aldrig mötestitlar, deltagare eller innehåll. Ingen kalenderinformation sparas.'],
            ['Kan jag byta plan när som helst?', 'Ja. Uppgraderingar gäller direkt, nedgraderingar vid nästa faktureringsperiod. Ingen bindningstid.'],
          ].map(([q, a]) => (
            <Box key={q} sx={{ bgcolor: 'var(--surface-strong)', border: '1px solid var(--border)', borderRadius: 4, p: 3, mb: 1.5 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 0.75 }}>{q}</Typography>
              <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{a}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Snackbar open={toast.open} autoHideDuration={5000} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setToast({ ...toast, open: false })} severity={toast.severity} sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
