import React, { useState, useEffect } from 'react';
import {
  Container, Typography, Box, Button, TextField, MenuItem, Switch,
  Paper, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Tabs, Tab, IconButton
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { apiRequest } from '../utils/apiConfig.js';

const pageCardSx = {
  borderRadius: 4, border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)',
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
const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2.5, bgcolor: 'var(--surface)', fontSize: 15,
    '& fieldset': { borderColor: 'var(--border)' },
    '&:hover fieldset': { borderColor: 'rgba(17,24,39,0.22)' },
    '&.Mui-focused fieldset': { borderColor: 'var(--text)', borderWidth: 1 },
  },
  '& .MuiInputLabel-root': { color: 'var(--text-secondary)', fontWeight: 600 },
};

const PLACEHOLDER_HELP = 'Platshållare: {{taskName}}, {{meetingTime}}, {{meetingTitle}}, {{bookingLink}}';

// ✅ Regler — automatiska mail-regler + mallar, bakom feature-flaggan
// 'rules_engine'. Syskon till BookingPageSettings.jsx, samma mönster:
// egen currentView i ShortcutDashboard.jsx.
export default function Rules({ user, onNavigateBack }) {
  const [tab, setTab] = useState('templates');
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [rules, setRules] = useState([]);
  const [activity, setActivity] = useState([]);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [calendarLinkPrompt, setCalendarLinkPrompt] = useState(false);

  const [templateForm, setTemplateForm] = useState({ name: '', subject: '', bodyHtml: '', bodyText: '' });
  const [ruleForm, setRuleForm] = useState({ type: 'reminder_before_meeting', templateId: '', offsetMinutes: 120 });
  const [sendForm, setSendForm] = useState({ recipientEmail: '', templateId: '' });
  const [saving, setSaving] = useState(false);

  const loadAll = () => {
    setLoading(true);
    Promise.all([
      apiRequest('/api/rules/templates').then(r => (r.ok ? r.json() : { templates: [] })),
      apiRequest('/api/rules').then(r => (r.ok ? r.json() : { rules: [] })),
      apiRequest('/api/rules/activity').then(r => (r.ok ? r.json() : { activity: [] })),
    ]).then(([t, r, a]) => {
      setTemplates(t.templates || []);
      setRules(r.rules || []);
      setActivity(a.activity || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadAll(); }, []);

  const notify = (message, severity = 'success') => setToast({ open: true, message, severity });

  const createTemplate = async () => {
    if (!templateForm.name || !templateForm.subject || !templateForm.bodyHtml) {
      return notify('Namn, ämne och innehåll krävs', 'error');
    }
    setSaving(true);
    try {
      const res = await apiRequest('/api/rules/templates', { method: 'POST', body: JSON.stringify(templateForm) });
      if (!res.ok) throw new Error();
      setTemplateForm({ name: '', subject: '', bodyHtml: '', bodyText: '' });
      notify('Mall sparad!');
      loadAll();
    } catch {
      notify('Kunde inte spara mallen', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (id) => {
    try {
      await apiRequest(`/api/rules/templates/${id}`, { method: 'DELETE' });
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch {
      notify('Kunde inte ta bort mallen', 'error');
    }
  };

  const createRule = async () => {
    if (!ruleForm.templateId) return notify('Välj en mall', 'error');
    setSaving(true);
    try {
      const res = await apiRequest('/api/rules', {
        method: 'POST',
        body: JSON.stringify({
          type: ruleForm.type,
          templateId: ruleForm.templateId,
          offsetMinutes: ruleForm.type === 'reminder_before_meeting' ? Number(ruleForm.offsetMinutes) : undefined,
          enabled: true
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.code === 'NEEDS_CALENDAR_LINK') {
        setCalendarLinkPrompt(true);
        return;
      }
      if (!res.ok) throw new Error();
      notify('Regel skapad!');
      loadAll();
    } catch {
      notify('Kunde inte skapa regeln', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (rule) => {
    setRules(prev => prev.map(r => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)));
    try {
      await apiRequest(`/api/rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !rule.enabled }) });
    } catch {
      notify('Kunde inte ändra regeln', 'error');
      loadAll();
    }
  };

  const deleteRule = async (id) => {
    try {
      await apiRequest(`/api/rules/${id}`, { method: 'DELETE' });
      setRules(prev => prev.filter(r => r.id !== id));
    } catch {
      notify('Kunde inte ta bort regeln', 'error');
    }
  };

  const sendNow = async () => {
    if (!sendForm.recipientEmail || !sendForm.templateId) return notify('Mottagare och mall krävs', 'error');
    setSaving(true);
    try {
      const res = await apiRequest('/api/rules/send-now', { method: 'POST', body: JSON.stringify(sendForm) });
      if (!res.ok) throw new Error();
      notify('Mail skickat!');
      setSendForm({ recipientEmail: '', templateId: '' });
      loadAll();
    } catch {
      notify('Kunde inte skicka mailet', 'error');
    } finally {
      setSaving(false);
    }
  };

  const startCalendarLink = () => {
    const provider = user?.provider === 'microsoft' ? 'microsoft' : 'google';
    const returnTo = encodeURIComponent('/?view=rules');
    window.location.href = `/auth/${provider}/direct-access?returnTo=${returnTo}`;
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
      <Button startIcon={<ArrowBackIcon />} onClick={onNavigateBack} sx={{ ...secondaryButtonSx, mb: 3 }}>
        Tillbaka
      </Button>

      <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', mb: 0.5 }}>
        Regler
      </Typography>
      <Typography sx={{ color: 'var(--text-secondary)', mb: 3 }}>
        Sätt upp vad BookR ska göra automatiskt — påminnelser innan möten, uppföljning när någon nekar, eller skicka ett mail manuellt.
      </Typography>

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 3, borderBottom: '1px solid var(--border)' }}>
        <Tab value="templates" label="Mallar" />
        <Tab value="rules" label="Regler" />
        <Tab value="send" label="Skicka nu" />
        <Tab value="activity" label="Aktivitet" />
      </Tabs>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <>
          {tab === 'templates' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Paper sx={{ ...pageCardSx, p: 3.5 }}>
                <Typography sx={{ fontWeight: 700, mb: 2, color: 'var(--text)' }}>Ny mall</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField label="Namn" value={templateForm.name} onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })} fullWidth sx={fieldSx} />
                  <TextField label="Ämnesrad" value={templateForm.subject} onChange={e => setTemplateForm({ ...templateForm, subject: e.target.value })} fullWidth sx={fieldSx} />
                  <TextField
                    label="Innehåll (HTML eller vanlig text)"
                    value={templateForm.bodyHtml}
                    onChange={e => setTemplateForm({ ...templateForm, bodyHtml: e.target.value })}
                    multiline minRows={4} fullWidth sx={fieldSx}
                    helperText={PLACEHOLDER_HELP}
                  />
                  <Box>
                    <Button variant="contained" onClick={createTemplate} disabled={saving} sx={primaryButtonSx}>Spara mall</Button>
                  </Box>
                </Box>
              </Paper>

              {templates.map(t => (
                <Paper key={t.id} sx={{ ...pageCardSx, p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 700, color: 'var(--text)' }}>{t.name}</Typography>
                    <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>{t.subject}</Typography>
                  </Box>
                  <IconButton onClick={() => deleteTemplate(t.id)}><DeleteOutlineIcon /></IconButton>
                </Paper>
              ))}
            </Box>
          )}

          {tab === 'rules' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Paper sx={{ ...pageCardSx, p: 3.5 }}>
                <Typography sx={{ fontWeight: 700, mb: 2, color: 'var(--text)' }}>Ny regel</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField select label="Typ" value={ruleForm.type} onChange={e => setRuleForm({ ...ruleForm, type: e.target.value })} fullWidth sx={fieldSx}>
                    <MenuItem value="reminder_before_meeting">Påminnelse innan ett möte (Task Manager)</MenuItem>
                    <MenuItem value="decline_followup">Uppföljning när någon nekar en inbjudan</MenuItem>
                  </TextField>
                  {ruleForm.type === 'reminder_before_meeting' && (
                    <TextField
                      label="Minuter innan mötet"
                      type="number"
                      value={ruleForm.offsetMinutes}
                      onChange={e => setRuleForm({ ...ruleForm, offsetMinutes: e.target.value })}
                      sx={{ ...fieldSx, maxWidth: 220 }}
                    />
                  )}
                  <TextField select label="Mall" value={ruleForm.templateId} onChange={e => setRuleForm({ ...ruleForm, templateId: e.target.value })} fullWidth sx={fieldSx}>
                    {templates.length === 0 && <MenuItem value="" disabled>Skapa en mall först</MenuItem>}
                    {templates.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                  </TextField>
                  <Box>
                    <Button variant="contained" onClick={createRule} disabled={saving} sx={primaryButtonSx}>Skapa regel</Button>
                  </Box>
                </Box>
              </Paper>

              {rules.map(r => (
                <Paper key={r.id} sx={{ ...pageCardSx, p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 700, color: 'var(--text)' }}>
                      {r.type === 'reminder_before_meeting' ? `Påminnelse ${r.offsetMinutes} min innan` : 'Uppföljning vid nekad inbjudan'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                      {templates.find(t => t.id === r.templateId)?.name || 'Okänd mall'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Switch checked={Boolean(r.enabled)} onChange={() => toggleRule(r)} />
                    <IconButton onClick={() => deleteRule(r.id)}><DeleteOutlineIcon /></IconButton>
                  </Box>
                </Paper>
              ))}
            </Box>
          )}

          {tab === 'send' && (
            <Paper sx={{ ...pageCardSx, p: 3.5 }}>
              <Typography sx={{ fontWeight: 700, mb: 2, color: 'var(--text)' }}>Skicka ett mail nu</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField label="Mottagarens mejl" value={sendForm.recipientEmail} onChange={e => setSendForm({ ...sendForm, recipientEmail: e.target.value })} fullWidth sx={fieldSx} />
                <TextField select label="Mall" value={sendForm.templateId} onChange={e => setSendForm({ ...sendForm, templateId: e.target.value })} fullWidth sx={fieldSx}>
                  {templates.length === 0 && <MenuItem value="" disabled>Skapa en mall först</MenuItem>}
                  {templates.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                </TextField>
                <Box>
                  <Button variant="contained" onClick={sendNow} disabled={saving} sx={primaryButtonSx}>Skicka</Button>
                </Box>
              </Box>
            </Paper>
          )}

          {tab === 'activity' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {activity.length === 0 && (
                <Typography sx={{ color: 'var(--text-secondary)' }}>Inget skickat än.</Typography>
              )}
              {activity.map(a => (
                <Paper key={a.id} sx={{ ...pageCardSx, p: 2, display: 'flex', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 600, color: 'var(--text)' }}>{a.subject}</Typography>
                    <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>{a.recipientEmail}</Typography>
                  </Box>
                  <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>{a.status}</Typography>
                </Paper>
              ))}
            </Box>
          )}
        </>
      )}

      <Dialog open={calendarLinkPrompt} onClose={() => setCalendarLinkPrompt(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { ...pageCardSx, bgcolor: 'rgba(255,255,255,0.96)' } }}>
        <DialogTitle>Koppla din kalender</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            En regel som bevakar nekade inbjudningar behöver kunna läsa din kalender även när du inte är
            inloggad — det kräver en engångskoppling. Tar tio sekunder.
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
