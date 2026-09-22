import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Container, Typography, Box, Button, TextField, MenuItem, Switch,
  FormControlLabel, Paper, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Chip
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { apiRequest } from '../utils/apiConfig.js';

const FONTS = ['Manrope', 'Inter', 'Poppins', 'Playfair Display', 'Roboto'];
const WEEKDAYS = [
  { value: 1, label: 'Mån' }, { value: 2, label: 'Tis' }, { value: 3, label: 'Ons' },
  { value: 4, label: 'Tors' }, { value: 5, label: 'Fre' },
];
const DURATIONS = [15, 30, 45, 60];

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2.5, bgcolor: 'var(--surface)', fontSize: 15,
    '& fieldset': { borderColor: 'var(--border)' },
    '&:hover fieldset': { borderColor: 'rgba(17,24,39,0.22)' },
    '&.Mui-focused fieldset': { borderColor: 'var(--text)', borderWidth: 1 },
  },
  '& .MuiInputLabel-root': { color: 'var(--text-secondary)', fontWeight: 600 },
};

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // å/ä/ö -> a/a/o
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 40);
}

// ✅ Ägarens inställningsvy för den publika bokningssidan (/boka/:slug).
// Renderas som en egen currentView i ShortcutDashboard.jsx, samma mönster
// som Team.jsx. Free ser bara en uppgraderings-prompt; Pro får en egen
// sida (namn/bio/tider) men BookR-brandingen låst; Business/Enterprise
// låser upp logga/färg/typsnitt + möjlighet att dölja BookR-footern.
export default function BookingPageSettings({ user, onNavigateBack }) {
  const plan = user?.plan || 'free';
  const canUsePage = plan !== 'free';
  const canBrand = plan === 'business' || plan === 'enterprise';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingSlug, setExistingSlug] = useState(null);
  const [form, setForm] = useState({
    slug: '', displayName: user?.displayName || user?.name || '', bio: '',
    durationMinutes: 30, bufferMinutes: 0, activeWeekdays: [1, 2, 3, 4, 5],
    startTime: '09:00', endTime: '17:00',
    branding: { logoUrl: '', primaryColor: '#111827', font: 'Manrope', hideBookrBranding: false },
  });
  const [slugStatus, setSlugStatus] = useState(null); // 'checking' | 'available' | 'taken' | 'invalid' | null
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [calendarLinkPrompt, setCalendarLinkPrompt] = useState(false);
  const slugCheckTimer = useRef(null);

  useEffect(() => {
    if (!canUsePage) { setLoading(false); return; }
    apiRequest('/api/booking-page/me')
      .then(res => (res.ok ? res.json() : { page: null }))
      .then(data => {
        if (data.page) {
          setForm({
            slug: data.page.slug, displayName: data.page.displayName, bio: data.page.bio || '',
            durationMinutes: data.page.durationMinutes, bufferMinutes: data.page.bufferMinutes || 0,
            activeWeekdays: data.page.activeWeekdays, startTime: data.page.startTime, endTime: data.page.endTime,
            branding: data.page.branding || { logoUrl: '', primaryColor: '#111827', font: 'Manrope', hideBookrBranding: false },
          });
          setExistingSlug(data.page.slug);
        } else {
          setForm((f) => ({ ...f, slug: slugify(f.displayName) }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [canUsePage]);

  const checkSlug = useCallback((slug) => {
    if (slugCheckTimer.current) clearTimeout(slugCheckTimer.current);
    if (!slug || slug === existingSlug) { setSlugStatus(slug === existingSlug && slug ? 'available' : null); return; }
    if (slug.length < 3) { setSlugStatus('invalid'); return; }
    setSlugStatus('checking');
    slugCheckTimer.current = setTimeout(() => {
      apiRequest('/api/booking-page/slug-check', { method: 'POST', body: JSON.stringify({ slug }) })
        .then(res => res.json())
        .then(data => setSlugStatus(data.available ? 'available' : (data.reason === 'INVALID_FORMAT' ? 'invalid' : 'taken')))
        .catch(() => setSlugStatus(null));
    }, 400);
  }, [existingSlug]);

  const toggleWeekday = (day) => {
    setForm((f) => ({
      ...f,
      activeWeekdays: f.activeWeekdays.includes(day) ? f.activeWeekdays.filter((d) => d !== day) : [...f.activeWeekdays, day].sort(),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiRequest('/api/booking-page', { method: 'POST', body: JSON.stringify(form) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setExistingSlug(data.slug);
        setToast({ open: true, message: 'Bokningssidan är sparad!', severity: 'success' });
      } else if (data.code === 'NEEDS_CALENDAR_LINK') {
        setCalendarLinkPrompt(true);
      } else {
        setToast({ open: true, message: data.error || 'Kunde inte spara', severity: 'error' });
      }
    } catch {
      setToast({ open: true, message: 'Kunde inte spara', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const startCalendarLink = () => {
    const provider = user?.provider === 'microsoft' ? 'microsoft' : 'google';
    const returnTo = encodeURIComponent('/?view=booking-page');
    window.location.href = `/auth/${provider}/direct-access?returnTo=${returnTo}`;
  };

  const bookingUrl = existingSlug ? `${window.location.origin}/boka/${existingSlug}` : null;
  const embedSnippet = existingSlug
    ? `<iframe src="${window.location.origin}/boka/${existingSlug}?embed=1" style="width:100%;max-width:480px;height:680px;border:none;" title="Boka möte"></iframe>`
    : null;

  const copyToClipboard = (text, label) => {
    navigator.clipboard?.writeText(text).then(() => setToast({ open: true, message: `${label} kopierad!`, severity: 'success' }));
  };

  const pageCardSx = {
    borderRadius: 4, border: '1px solid var(--border)', bgcolor: 'rgba(255,255,255,0.78)',
    boxShadow: '0 18px 40px rgba(15,23,42,0.05)', backdropFilter: 'blur(18px)',
  };
  const primaryButtonSx = {
    borderRadius: 3, bgcolor: 'var(--text)', color: 'var(--surface-strong)', fontWeight: 700,
    textTransform: 'none', boxShadow: 'none', '&:hover': { bgcolor: '#000', boxShadow: 'none' },
  };
  const secondaryButtonSx = {
    borderRadius: 3, borderColor: 'rgba(17,24,39,0.08)', color: 'var(--text)', textTransform: 'none',
    '&:hover': { borderColor: 'rgba(17,24,39,0.16)', bgcolor: 'rgba(17,24,39,0.03)' },
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
      <Button startIcon={<ArrowBackIcon />} onClick={onNavigateBack} sx={{ ...secondaryButtonSx, mb: 3 }}>
        Tillbaka
      </Button>

      <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', mb: 0.5 }}>
        Bokningssida
      </Typography>
      <Typography sx={{ color: 'var(--text-secondary)', mb: 4 }}>
        En egen sida där andra kan boka en tid direkt i din kalender — utan att du behöver göra något.
      </Typography>

      {!canUsePage ? (
        <Paper sx={{ ...pageCardSx, p: 4, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'var(--text)', mb: 1 }}>Kräver Pro eller högre</Typography>
          <Typography sx={{ color: 'var(--text-secondary)', mb: 2.5, maxWidth: 420, mx: 'auto' }}>
            Med Pro får du en egen bokningssida med ditt namn. Med Business låser du upp full white-label —
            egen logga, färg och typsnitt, och BookRs logga syns aldrig.
          </Typography>
          <Button variant="contained" href="/priser" sx={primaryButtonSx}>Se planer</Button>
        </Paper>
      ) : loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Paper sx={{ ...pageCardSx, p: 3.5 }}>
            <Typography sx={{ fontWeight: 700, mb: 2, color: 'var(--text)' }}>Grundinställningar</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Webbadress"
                value={form.slug}
                onChange={(e) => { const s = slugify(e.target.value); setForm({ ...form, slug: s }); checkSlug(s); }}
                helperText={
                  slugStatus === 'checking' ? 'Kollar tillgänglighet…' :
                  slugStatus === 'taken' ? 'Upptagen — välj en annan.' :
                  slugStatus === 'invalid' ? 'Minst 3 tecken, bara a-z, 0-9 och bindestreck.' :
                  slugStatus === 'available' ? `Tillgänglig: ${window.location.origin}/boka/${form.slug}` :
                  `${window.location.origin}/boka/...`
                }
                FormHelperTextProps={{ sx: { color: slugStatus === 'taken' || slugStatus === 'invalid' ? 'var(--error)' : slugStatus === 'available' ? 'var(--success)' : 'var(--text-secondary)' } }}
                fullWidth sx={fieldSx}
              />
              <TextField label="Namn" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} fullWidth sx={fieldSx} />
              <TextField label="Kort presentation (valfritt)" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} multiline minRows={2} fullWidth sx={fieldSx} />
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <TextField select label="Mötestid" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} sx={{ ...fieldSx, minWidth: 140 }}>
                  {DURATIONS.map((d) => <MenuItem key={d} value={d}>{d} min</MenuItem>)}
                </TextField>
                <TextField label="Starttid" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} sx={{ ...fieldSx, minWidth: 130 }} />
                <TextField label="Sluttid" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} sx={{ ...fieldSx, minWidth: 130 }} />
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {WEEKDAYS.map((d) => (
                  <Chip
                    key={d.value}
                    label={d.label}
                    onClick={() => toggleWeekday(d.value)}
                    sx={{
                      fontWeight: 700, cursor: 'pointer',
                      bgcolor: form.activeWeekdays.includes(d.value) ? 'var(--text)' : 'rgba(17,24,39,0.05)',
                      color: form.activeWeekdays.includes(d.value) ? 'var(--surface-strong)' : 'var(--text-secondary)',
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Paper>

          <Paper sx={{ ...pageCardSx, p: 3.5, opacity: canBrand ? 1 : 0.55 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Typography sx={{ fontWeight: 700, color: 'var(--text)' }}>White-label branding</Typography>
              {!canBrand && <Chip size="small" label="Business" sx={{ bgcolor: 'rgba(17,24,39,0.06)', color: 'var(--text-secondary)', fontWeight: 700 }} />}
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pointerEvents: canBrand ? 'auto' : 'none' }}>
              <TextField
                label="Logga (URL)"
                value={form.branding.logoUrl || ''}
                onChange={(e) => setForm({ ...form, branding: { ...form.branding, logoUrl: e.target.value } })}
                placeholder="https://dinsida.se/logo.png"
                fullWidth sx={fieldSx}
              />
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Accentfärg</Typography>
                  <input
                    type="color"
                    value={form.branding.primaryColor}
                    onChange={(e) => setForm({ ...form, branding: { ...form.branding, primaryColor: e.target.value } })}
                    style={{ width: 40, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'none' }}
                  />
                </Box>
                <TextField select label="Typsnitt" value={form.branding.font} onChange={(e) => setForm({ ...form, branding: { ...form.branding, font: e.target.value } })} sx={{ ...fieldSx, minWidth: 160 }}>
                  {FONTS.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                </TextField>
              </Box>
              <FormControlLabel
                control={<Switch checked={form.branding.hideBookrBranding} onChange={(e) => setForm({ ...form, branding: { ...form.branding, hideBookrBranding: e.target.checked } })} />}
                label="Dölj BookRs logga på sidan"
              />
            </Box>
          </Paper>

          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || slugStatus === 'taken' || slugStatus === 'invalid' || !form.slug || !form.displayName.trim()}
            sx={{ ...primaryButtonSx, alignSelf: 'flex-start', px: 3, py: 1.2 }}
          >
            {saving ? <CircularProgress size={18} sx={{ color: 'inherit' }} /> : 'Spara'}
          </Button>

          {existingSlug && (
            <Paper sx={{ ...pageCardSx, p: 3.5 }}>
              <Typography sx={{ fontWeight: 700, mb: 2, color: 'var(--text)' }}>Dela din sida</Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
                <Button variant="outlined" endIcon={<OpenInNewIcon />} href={bookingUrl} target="_blank" sx={secondaryButtonSx}>
                  {bookingUrl}
                </Button>
                <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => copyToClipboard(bookingUrl, 'Länken')} sx={{ color: 'var(--text-secondary)', textTransform: 'none' }}>
                  Kopiera länk
                </Button>
              </Box>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', mb: 1 }}>
                Klistra in på din egen hemsida:
              </Typography>
              <Box sx={{ bgcolor: 'rgba(17,24,39,0.04)', borderRadius: 2.5, p: 2, fontFamily: 'monospace', fontSize: 12.5, color: 'var(--text)', overflowX: 'auto', whiteSpace: 'pre' }}>
                {embedSnippet}
              </Box>
              <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => copyToClipboard(embedSnippet, 'Koden')} sx={{ mt: 1, color: 'var(--text-secondary)', textTransform: 'none' }}>
                Kopiera kod
              </Button>
            </Paper>
          )}
        </Box>
      )}

      <Dialog open={calendarLinkPrompt} onClose={() => setCalendarLinkPrompt(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { ...pageCardSx, bgcolor: 'rgba(255,255,255,0.96)' } }}>
        <DialogTitle>Koppla din kalender</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            En bokningssida behöver kunna visa lediga tider och boka in möten även när du inte är inloggad —
            det kräver en engångskoppling av din kalender. Tar tio sekunder.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCalendarLinkPrompt(false)} sx={secondaryButtonSx}>Avbryt</Button>
          <Button variant="contained" onClick={startCalendarLink} sx={primaryButtonSx}>Koppla kalender</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} sx={{ width: '100%' }}>{toast.message}</Alert>
      </Snackbar>
    </Container>
  );
}
