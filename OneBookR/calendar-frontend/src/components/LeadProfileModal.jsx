import React, { useState, useMemo } from 'react';
import {
  Dialog, Box, Typography, TextField, MenuItem, Button, CircularProgress,
} from '@mui/material';
import { apiRequest } from '../utils/apiConfig.js';
import { trackEvent } from '../utils/analytics.js';

const BRANSCH_OPTIONS = [
  'Rekrytering & bemanning',
  'Konsult & rådgivning',
  'IT & mjukvara',
  'Bygg & fastighet',
  'Vård & hälsa',
  'Finans & juridik',
  'Handel & e-handel',
  'Marknadsföring & kommunikation',
  'Utbildning',
  'Offentlig sektor',
  'Annat',
];

const EMPLOYEE_OPTIONS = [
  { value: 'bara-jag', label: 'Bara jag' },
  { value: '2-10', label: '2–10' },
  { value: '11-50', label: '11–50' },
  { value: '51-200', label: '51–200' },
  { value: '201-1000', label: '201–1000' },
  { value: '1000+', label: '1000+' },
];

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'icloud.com', 'me.com', 'yahoo.com', 'protonmail.com', 'proton.me', 'msn.com',
]);

// Gissar ett företagsnamn från e-postdomänen (t.ex. anna@acme.se -> "Acme")
// — sparar ett fält att fylla i för de flesta. Tomt för vanliga privata
// mejladresser, där en gissning bara vore fel.
function guessCompanyName(email) {
  const domain = email?.split('@')[1]?.toLowerCase();
  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) return '';
  const label = domain.split('.')[0];
  if (!label) return '';
  return label
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

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

// ✅ Fångar en snabb företagsprofil (bransch, antal anställda, företagsnamn)
// från personer som kommer in i BookR via en delad inbjudningslänk — en
// av de viktigaste marknadsföringskanalerna. Visas EN gång per konto
// (styrs av leadProfileStatus från /api/auth/me), aldrig igen efter svar
// eller "Hoppa över". Medvetet snabbt: tre fält, ett förifyllt, ett klick
// vardera på de andra två.
export default function LeadProfileModal({ open, onClose, groupId, userEmail }) {
  const [companyName, setCompanyName] = useState(() => guessCompanyName(userEmail));
  const [bransch, setBransch] = useState('');
  const [employees, setEmployees] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => Boolean(companyName.trim() && bransch && employees) && !submitting,
    [companyName, bransch, employees, submitting]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await apiRequest('/api/lead-profile', {
        method: 'POST',
        body: JSON.stringify({ groupId, bransch, employees, companyName: companyName.trim() }),
      });
      if (res.ok) {
        trackEvent('lead_profile_submitted', { bransch, employees });
        onClose();
      } else {
        setSubmitting(false);
      }
    } catch {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    trackEvent('lead_profile_skipped');
    apiRequest('/api/lead-profile/skip', { method: 'POST', body: JSON.stringify({ groupId }) }).catch(() => {});
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleSkip}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 6, border: '1px solid var(--border)', boxShadow: 'var(--shadow-soft)' } }}
    >
      <Box component="form" onSubmit={handleSubmit} sx={{ p: { xs: 3, sm: 4 } }}>
        <Box
          sx={{
            width: 48, height: 48, borderRadius: '50%', bgcolor: 'rgba(17,24,39,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2.5,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="10" width="7" height="10" rx="1.3" stroke="var(--text)" strokeWidth="1.7" />
            <rect x="13" y="4" width="7" height="16" rx="1.3" stroke="var(--text)" strokeWidth="1.7" />
            <path d="M6.5 13.5H8.5M6.5 16.5H8.5M15.5 8H17.5M15.5 11H17.5M15.5 14H17.5" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </Box>

        <Typography sx={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', mb: 0.75 }}>
          Vilka är ni?
        </Typography>
        <Typography sx={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55, mb: 3 }}>
          Hjälper oss bygga BookR åt fler som er. Tar tio sekunder.
        </Typography>

        <Box sx={{ display: 'grid', gap: 2 }}>
          <TextField
            label="Företagsnamn"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            autoFocus
            fullWidth
            sx={fieldSx}
          />
          <TextField
            select
            label="Bransch"
            value={bransch}
            onChange={(e) => setBransch(e.target.value)}
            fullWidth
            sx={fieldSx}
          >
            {BRANSCH_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>{opt}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Antal anställda"
            value={employees}
            onChange={(e) => setEmployees(e.target.value)}
            fullWidth
            sx={fieldSx}
          >
            {EMPLOYEE_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>
        </Box>

        <Button
          type="submit"
          disabled={!canSubmit}
          fullWidth
          sx={{
            mt: 3, py: 1.6, borderRadius: 3, bgcolor: 'var(--text)', color: 'var(--surface-strong)',
            fontWeight: 700, fontSize: 15, textTransform: 'none', boxShadow: 'none',
            '&:hover': { bgcolor: '#000', boxShadow: 'none' },
            '&.Mui-disabled': { bgcolor: 'rgba(17,24,39,0.08)', color: 'var(--text-secondary)' },
          }}
        >
          {submitting ? <CircularProgress size={20} sx={{ color: 'inherit' }} /> : 'Skicka'}
        </Button>

        <Button
          onClick={handleSkip}
          fullWidth
          sx={{
            mt: 1, py: 1, borderRadius: 3, color: 'var(--text-secondary)', fontWeight: 700,
            fontSize: 13, textTransform: 'none', '&:hover': { bgcolor: 'rgba(17,24,39,0.03)' },
          }}
        >
          Hoppa över
        </Button>
      </Box>
    </Dialog>
  );
}
