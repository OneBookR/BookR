import React, { useEffect, useState } from 'react';
import { Container, Typography, Box, Paper, Switch, TextField, Button, Alert, CircularProgress } from '@mui/material';
import { apiRequest } from '../utils/apiConfig.js';
import { HOME_URL } from '../config';

// Admin-only — länken hit visas bara under profilmenyn för ADMIN_EMAILS
// (server.js). Ingen annan användare ser att den här sidan existerar.
export default function AdminFeatureFlags({ user }) {
  const [flags, setFlags] = useState(null); // null = laddar
  const [emailDrafts, setEmailDrafts] = useState({});
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState('');
  const [newKey, setNewKey] = useState('');

  useEffect(() => {
    if (!user) return;
    apiRequest('/api/admin/feature-flags')
      .then(async res => {
        if (res.status === 401 || res.status === 403) { setForbidden(true); return; }
        if (!res.ok) { setError('Kunde inte hämta flaggor.'); return; }
        const data = await res.json();
        const list = data.flags || [];
        setFlags(list);
        setEmailDrafts(Object.fromEntries(list.map(f => [f.key, f.earlyAccessEmails.join(', ')])));
      })
      .catch(() => setError('Kunde inte ansluta till servern.'));
  }, [user]);

  const save = async (key, patch) => {
    const target = flags.find(f => f.key === key);
    const body = {
      enabled: target.enabled,
      earlyAccessEmails: target.earlyAccessEmails,
      ...patch
    };
    setSavingKey(key);
    setError('');
    try {
      const res = await apiRequest(`/api/admin/feature-flags/${encodeURIComponent(key)}`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error();
      setFlags(prev => prev.map(f => (f.key === key ? { ...f, ...body } : f)));
      setEmailDrafts(prev => ({ ...prev, [key]: body.earlyAccessEmails.join(', ') }));
    } catch {
      setError(`Kunde inte spara "${key}".`);
    } finally {
      setSavingKey('');
    }
  };

  const toggleEnabled = key => {
    const target = flags.find(f => f.key === key);
    save(key, { enabled: !target.enabled });
  };

  const saveEmails = key => {
    const emails = (emailDrafts[key] || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);
    save(key, { earlyAccessEmails: emails });
  };

  const createFlag = async () => {
    const key = newKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!key) return;
    setSavingKey(key);
    setError('');
    try {
      const res = await apiRequest(`/api/admin/feature-flags/${encodeURIComponent(key)}`, {
        method: 'POST',
        body: JSON.stringify({ enabled: false, earlyAccessEmails: [user.email] })
      });
      if (!res.ok) throw new Error();
      const created = { key, enabled: false, earlyAccessEmails: [user.email] };
      setFlags(prev => [...(prev || []), created]);
      setEmailDrafts(prev => ({ ...prev, [key]: user.email }));
      setNewKey('');
    } catch {
      setError(`Kunde inte skapa "${key}".`);
    } finally {
      setSavingKey('');
    }
  };

  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ mt: 10, textAlign: 'center' }}>
        <Typography>Logga in som admin för att se den här sidan.</Typography>
      </Container>
    );
  }

  if (forbidden) {
    return (
      <Container maxWidth="sm" sx={{ mt: 10, textAlign: 'center' }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Ingen åtkomst</Typography>
        <Typography sx={{ color: 'var(--text-secondary)', mb: 3 }}>
          Det här kontot har inte admin-behörighet.
        </Typography>
        <Button href={HOME_URL} variant="outlined">Till startsidan</Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 6, mb: 8 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>Feature flags</Typography>
      <Typography sx={{ color: 'var(--text-secondary)', mb: 4 }}>
        Av för alla tills du slår på den. Lägg till mejladresser för att testa en funktion live i produktion innan den är publik.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {flags === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <>
          {flags.length === 0 && (
            <Typography sx={{ color: 'var(--text-secondary)', mb: 3 }}>
              Inga flaggor skapade än.
            </Typography>
          )}
          {flags.map(flag => (
            <Paper
              key={flag.key}
              variant="outlined"
              sx={{ p: 2.5, mb: 2, borderRadius: 3, border: '1px solid var(--border)' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{flag.key}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                    {flag.enabled ? 'På för alla' : 'Av'}
                  </Typography>
                  <Switch
                    checked={flag.enabled}
                    disabled={savingKey === flag.key}
                    onChange={() => toggleEnabled(flag.key)}
                  />
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  size="small"
                  fullWidth
                  label="Early access-mejl (kommaseparerat)"
                  value={emailDrafts[flag.key] || ''}
                  onChange={e => setEmailDrafts(prev => ({ ...prev, [flag.key]: e.target.value }))}
                />
                <Button
                  size="small"
                  variant="outlined"
                  disabled={savingKey === flag.key}
                  onClick={() => saveEmails(flag.key)}
                >
                  Spara
                </Button>
              </Box>
            </Paper>
          ))}

          <Paper variant="outlined" sx={{ p: 2.5, mt: 3, borderRadius: 3, border: '1px dashed var(--border)' }}>
            <Typography variant="body2" sx={{ mb: 1.5, color: 'var(--text-secondary)' }}>
              Ny flagga (t.ex. <span style={{ fontFamily: 'monospace' }}>booking_pages</span>)
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                size="small"
                fullWidth
                placeholder="flagg_namn"
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createFlag()}
              />
              <Button variant="contained" onClick={createFlag} disabled={!newKey.trim()}>
                Skapa
              </Button>
            </Box>
          </Paper>
        </>
      )}
    </Container>
  );
}
