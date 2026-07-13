import React, { useState, useEffect } from 'react';
import { Box, Button, Switch, Typography, Divider, Paper, Collapse } from '@mui/material';

const STORAGE_KEY = 'bookr_cookie_consent';

const DEFAULT_PREFS = {
  necessary: true,   // alltid på, kan inte stängas av
  analytics: false,
  marketing: false,
  personalization: false,
};

function loadSavedConsent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Ogiltigt om det saknar version-flagga
    if (!parsed.savedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveConsent(prefs) {
  const record = { ...prefs, necessary: true, savedAt: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  return record;
}

function activateAnalytics() {
  if (typeof window.gtag === 'function') return; // redan aktiv
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=G-BN7W80K6QD';
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', 'G-BN7W80K6QD', { anonymize_ip: true });
}

function applyConsent(prefs) {
  if (prefs.analytics) activateAnalytics();
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);

  useEffect(() => {
    const saved = loadSavedConsent();
    if (saved) {
      applyConsent(saved);
    } else {
      setVisible(true);
    }
  }, []);

  function handleAcceptAll() {
    const all = { necessary: true, analytics: true, marketing: true, personalization: true };
    applyConsent(saveConsent(all));
    setVisible(false);
  }

  function handleRejectAll() {
    applyConsent(saveConsent(DEFAULT_PREFS));
    setVisible(false);
  }

  function handleSaveCustom() {
    applyConsent(saveConsent(prefs));
    setVisible(false);
  }

  function toggle(key) {
    setPrefs(p => ({ ...p, [key]: !p[key] }));
  }

  if (!visible) return null;

  return (
    <Box
      role="dialog"
      aria-modal="true"
      aria-label="Cookie-inställningar"
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        p: { xs: 1, sm: 2 },
      }}
    >
      <Paper
        elevation={8}
        sx={{
          maxWidth: 560,
          mx: 'auto',
          p: 3,
          borderRadius: 2,
          bgcolor: '#fff',
        }}
      >
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Vi använder cookies
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Vi (www.onebookr.se) använder nödvändiga cookies för att tjänsten ska fungera.
          Med ditt samtycke kan vi även använda analys- och marknadsföringscookies.
          Du kan när som helst ändra dina val.
        </Typography>

        <Collapse in={expanded}>
          <Divider sx={{ mb: 2 }} />

          <PreferenceRow
            label="Nödvändiga"
            description="Krävs för att tjänsten ska fungera. Kan inte stängas av."
            checked={true}
            disabled
          />
          <PreferenceRow
            label="Analys"
            description="Hjälper oss förstå hur tjänsten används (Google Analytics med anonymiserad IP)."
            checked={prefs.analytics}
            onChange={() => toggle('analytics')}
          />
          <PreferenceRow
            label="Marknadsföring"
            description="Används för personanpassade annonser av utvalda tredjeparter."
            checked={prefs.marketing}
            onChange={() => toggle('marketing')}
          />
          <PreferenceRow
            label="Personalisering"
            description="Anpassar innehållet baserat på dina preferenser."
            checked={prefs.personalization}
            onChange={() => toggle('personalization')}
          />

          <Divider sx={{ mt: 2, mb: 2 }} />
        </Collapse>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button
            size="small"
            onClick={() => setExpanded(e => !e)}
            sx={{ mr: 'auto', color: 'text.secondary' }}
          >
            {expanded ? 'Dölj inställningar' : 'Anpassa'}
          </Button>

          <Button variant="outlined" size="small" onClick={handleRejectAll}>
            Avvisa alla
          </Button>

          {expanded && (
            <Button variant="outlined" size="small" onClick={handleSaveCustom}>
              Spara val
            </Button>
          )}

          <Button variant="contained" size="small" onClick={handleAcceptAll}>
            Acceptera alla
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

function PreferenceRow({ label, description, checked, disabled, onChange }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1.5 }}>
      <Switch
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        size="small"
        sx={{ mt: -0.5, mr: 1 }}
      />
      <Box>
        <Typography variant="body2" fontWeight={600}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {description}
        </Typography>
      </Box>
    </Box>
  );
}
