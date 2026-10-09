import React, { useState, useEffect, useRef } from 'react';
import {
  Container, Typography, Box, Button, TextField, Switch, FormControlLabel,
  Paper, Snackbar, Alert, CircularProgress, IconButton
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MicIcon from '@mui/icons-material/Mic';
import SendIcon from '@mui/icons-material/Send';
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
};

const EXAMPLES = [
  'Avboka alla möten idag',
  'Boka om mötet med Peter till nästa vecka',
  'Skicka ett mail till Anders att jag blir 5 min sen',
  'Vilka har jag möte med idag?'
];

// ✅ Röst = webbläsarens inbyggda taligenkänning (Web Speech API) — bara
// Chrome/Edge stödjer den idag. Fyller textfältet, skickar INTE
// automatiskt, så man alltid ser vad den uppfattade innan man går vidare.
function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function VoiceAssistant({ user, onNavigateBack }) {
  const [command, setCommand] = useState('');
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoExecute, setAutoExecute] = useState(false);
  const [pending, setPending] = useState(null); // { preview, pendingActionId }
  const [lastResult, setLastResult] = useState('');
  // ✅ Hela den pågående tråden (om Claude bett om ett förtydligande) —
  // skickas med nästa anrop så Claude inte tappar den ursprungliga
  // avsikten. Nollställs så fort ett kommando faktiskt löser sig
  // (bekräftelse, svar eller utförande).
  const [conversationHistory, setConversationHistory] = useState([]);
  const [log, setLog] = useState([]);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const recognitionRef = useRef(null);

  const notify = (message, severity = 'success') => setToast({ open: true, message, severity });

  const loadAll = () => {
    Promise.all([
      apiRequest('/api/voice/settings').then(r => (r.ok ? r.json() : { autoExecute: false })),
      apiRequest('/api/voice/log').then(r => (r.ok ? r.json() : { log: [] }))
    ]).then(([settings, logData]) => {
      setAutoExecute(Boolean(settings.autoExecute));
      setLog(logData.log || []);
    });
  };

  useEffect(() => { loadAll(); }, []);

  const toggleAutoExecute = async (value) => {
    setAutoExecute(value);
    await apiRequest('/api/voice/settings', { method: 'PATCH', body: JSON.stringify({ autoExecute: value }) });
  };

  const startListening = () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      return notify('Röstinmatning stöds inte i den här webbläsaren — använd textfältet istället.', 'error');
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'sv-SE';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      setCommand(event.results[0][0].transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const submitCommand = async () => {
    if (!command.trim()) return;
    setLoading(true);
    setLastResult('');
    setPending(null);
    try {
      // ✅ Kontakter (namn+mejl) finns bara i webbläsarens lokala
      // adressbok (samma som Team.jsx använder) — backend har ingen
      // server-side kontaktlista med namn, så vi skickar med den här.
      let contacts = [];
      try {
        contacts = JSON.parse(localStorage.getItem(`bookr_team_contacts_${user?.email}`) || '[]')
          .filter(c => c?.email)
          .map(c => ({ name: c.name || '', email: c.email }));
      } catch { /* korrupt localStorage — strunta i kontakterna, inte kritiskt */ }

      const res = await apiRequest('/api/voice/command', { method: 'POST', body: JSON.stringify({ command, contacts, conversationHistory }) });
      const data = await res.json().catch(() => ({}));
      if (data.error) {
        setLastResult(data.error);
        // ✅ Fortsätt samma tråd — Claude bad om ett förtydligande, nästa
        // kommando är sannolikt bara svaret på den frågan.
        setConversationHistory(data.conversationHistory || []);
      } else if (data.needsConfirmation) {
        setPending({ preview: data.preview, cards: data.cards, pendingActionId: data.pendingActionId });
        setConversationHistory([]); // löst — nästa kommando är en ny tråd
      } else if (data.executed) {
        setLastResult(data.result);
        notify('Klart!');
        setConversationHistory([]);
      }
      setCommand('');
      loadAll();
    } catch {
      notify('Kunde inte skicka kommandot', 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmPending = async () => {
    if (!pending) return;
    setLoading(true);
    try {
      const res = await apiRequest(`/api/voice/confirm/${pending.pendingActionId}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (data.executed) {
        setLastResult(data.result);
        notify('Klart!');
      } else {
        notify(data.error || 'Kunde inte utföra åtgärden', 'error');
      }
      setPending(null);
      loadAll();
    } catch {
      notify('Kunde inte utföra åtgärden', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
      <Button startIcon={<ArrowBackIcon />} onClick={onNavigateBack} sx={{ ...secondaryButtonSx, mb: 3 }}>
        Tillbaka
      </Button>

      <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', mb: 0.5 }}>
        Kommandon
      </Typography>
      <Typography sx={{ color: 'var(--text-secondary)', mb: 1 }}>
        Skriv eller säg vad BookR ska göra — avboka, boka om, skicka ett mejl, eller fråga om dina möten.
      </Typography>
      <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 3 }}>
        Exempel: {EXAMPLES.map((e, i) => `"${e}"`).join(' · ')}
      </Typography>

      {conversationHistory.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
            Fortsätter föregående fråga — svara direkt, du behöver inte upprepa kommandot.
          </Typography>
          <Button size="small" onClick={() => { setConversationHistory([]); setLastResult(''); }} sx={{ textTransform: 'none', fontWeight: 700 }}>
            Börja om
          </Button>
        </Box>
      )}

      <Paper sx={{ ...pageCardSx, p: 3.5, mb: 3 }}>
        <FormControlLabel
          control={<Switch checked={autoExecute} onChange={e => toggleAutoExecute(e.target.checked)} />}
          label="Utför direkt utan bekräftelse (handsfree)"
          sx={{ mb: 2 }}
        />

        {/* ✅ En mall att PRATA UTIFRÅN i ett enda svep — inte tre separata
            fält man ska fylla i och pausa mellan. Rent visuell guide. */}
        <Box sx={{
          display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 1, mb: 1.5,
          p: 1.5, borderRadius: 2.5, bgcolor: 'rgba(17,24,39,0.03)', border: '1px dashed var(--border)'
        }}>
          {[
            { label: 'Vad', hint: 'avboka, boka om, maila, fråga...' },
            { label: 'Med vem', hint: 'ett namn, eller "alla"' },
            { label: 'När', hint: 'idag, imorgon, nästa vecka...' }
          ].map(({ label, hint }) => (
            <Box key={label}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--text-secondary)', display: 'block' }}>{label}</Typography>
              <Typography variant="caption" sx={{ color: 'var(--text-secondary)', opacity: 0.75 }}>{hint}</Typography>
            </Box>
          ))}
        </Box>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            fullWidth multiline minRows={2}
            placeholder='Säg eller skriv allt i ett svep, t.ex. "Boka om mötet med Valdemar till nästa vecka"'
            value={command}
            onChange={e => setCommand(e.target.value)}
            sx={fieldSx}
          />
          <IconButton
            onClick={listening ? stopListening : startListening}
            sx={{ bgcolor: listening ? 'var(--error)' : 'rgba(17,24,39,0.06)', color: listening ? '#fff' : 'var(--text)', '&:hover': { bgcolor: listening ? 'var(--error)' : 'rgba(17,24,39,0.1)' } }}
          >
            <MicIcon />
          </IconButton>
        </Box>
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" startIcon={<SendIcon />} onClick={submitCommand} disabled={loading || !command.trim()} sx={primaryButtonSx}>
            {loading ? 'Tolkar...' : 'Skicka'}
          </Button>
        </Box>
      </Paper>

      {pending && (
        <Paper sx={{ ...pageCardSx, p: 3, mb: 3, border: '1.5px solid var(--text)' }}>
          <Typography sx={{ fontWeight: 700, mb: 1.5, color: 'var(--text)' }}>Bekräfta</Typography>

          {pending.cards?.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
              {pending.cards.map((c, i) => (
                <Box key={i} sx={{
                  display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 1,
                  p: 1.5, borderRadius: 2.5, bgcolor: 'rgba(17,24,39,0.03)'
                }}>
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--text-secondary)', display: 'block' }}>Vad</Typography>
                    <Typography sx={{ color: 'var(--text)' }}>{c.what}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--text-secondary)', display: 'block' }}>Med vem</Typography>
                    <Typography sx={{ color: 'var(--text)' }}>{c.withWhom}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--text-secondary)', display: 'block' }}>När</Typography>
                    <Typography sx={{ color: 'var(--text)' }}>{c.when}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography sx={{ whiteSpace: 'pre-line', color: 'var(--text-secondary)', mb: 2 }}>{pending.preview}</Typography>
          )}

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={() => setPending(null)} sx={secondaryButtonSx}>Avbryt</Button>
            <Button variant="contained" onClick={confirmPending} disabled={loading} sx={primaryButtonSx}>Bekräfta</Button>
          </Box>
        </Paper>
      )}

      {loading && !pending && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
      )}

      {lastResult && !pending && (
        <Paper sx={{ ...pageCardSx, p: 3, mb: 3 }}>
          <Typography sx={{ whiteSpace: 'pre-line', color: 'var(--text)' }}>{lastResult}</Typography>
        </Paper>
      )}

      <Typography sx={{ fontWeight: 700, mb: 1.5, color: 'var(--text)' }}>Historik</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {log.length === 0 && <Typography sx={{ color: 'var(--text-secondary)' }}>Inga kommandon än.</Typography>}
        {log.map(entry => (
          <Paper key={entry.id} sx={{ ...pageCardSx, p: 2 }}>
            <Typography sx={{ fontWeight: 600, color: 'var(--text)' }}>{entry.command}</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-line', color: 'var(--text-secondary)' }}>{entry.message}</Typography>
          </Paper>
        ))}
      </Box>

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} sx={{ width: '100%' }}>{toast.message}</Alert>
      </Snackbar>
    </Container>
  );
}
