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

// ✅ Röst in = webbläsarens inbyggda taligenkänning (Web Speech API).
// Röst ut = webbläsarens inbyggda talsyntes. Bara Chrome/Edge stödjer
// taligenkänning idag; talsyntes har betydligt bredare stöd. Ingen av
// dem kräver ett nytt API-beroende eller en nyckel.
function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// ✅ Modulnivå-referens som håller utterance-objektet vid liv — i flera
// webbläsare kan garbage collection annars tysta talet helt om inget
// håller en referens till det, en känd och lätt att missa bugg i Web
// Speech API. Samma anledning till de 80ms fördröjningen efter
// cancel(): cancel()+speak() i samma tick kan tysta NÄSTA replik helt.
let currentUtterance = null;
let cachedVoices = [];

// Röster laddas asynkront i flera webbläsare — finns inget svenskt (eller
// inget alls) tillgängligt när man frågar direkt efter sidladdning.
function primeVoices() {
  if (!window.speechSynthesis) return;
  const load = () => { cachedVoices = window.speechSynthesis.getVoices() || []; };
  load();
  window.speechSynthesis.onvoiceschanged = load;
}

function pickVoice() {
  if (!cachedVoices.length) cachedVoices = window.speechSynthesis?.getVoices() || [];
  return cachedVoices.find(v => v.lang?.toLowerCase().startsWith('sv'))
    || cachedVoices.find(v => v.default)
    || cachedVoices[0]
    || null;
}

// ✅ Loggar/rapporterar nu VARFÖR det eventuellt tystnar (event.error från
// webbläsaren — t.ex. "not-allowed", "synthesis-failed", "canceled" —
// istället för att bara tyst anta att allt gick bra). onError låter UI:t
// visa den riktiga anledningen för första gången, istället för att gissa.
function speak(text, { onEnd, onError } = {}) {
  if (!text) { onEnd?.(); return; }
  if (!window.speechSynthesis) {
    console.warn('[Röst] speechSynthesis finns inte i den här webbläsaren/kontexten.');
    onError?.('Talsyntes stöds inte i den här webbläsaren');
    onEnd?.();
    return;
  }
  try {
    window.speechSynthesis.cancel();
  } catch { /* inget att avbryta */ }

  setTimeout(() => {
    try {
      const utter = new SpeechSynthesisUtterance(text);
      const voice = pickVoice();
      if (voice) utter.voice = voice;
      utter.lang = voice?.lang || 'sv-SE';
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        currentUtterance = null;
        onEnd?.();
      };
      utter.onstart = () => console.log('[Röst] Talar nu:', text.slice(0, 60), 'röst:', voice?.name || '(ingen vald — webbläsarens default)');
      utter.onend = finish;
      utter.onerror = (e) => {
        console.error('[Röst] Talsyntesfel:', e.error, e);
        onError?.(e.error || 'okänt fel');
        finish();
      };
      currentUtterance = utter;
      window.speechSynthesis.speak(utter);
      // ✅ Säkerhetsnät: onend/onerror är inte 100% pålitliga i alla
      // webbläsare — UI:t ska ALDRIG kunna fastna i "pratar"-läget utan
      // en väg vidare, oavsett vad talsyntesen gör.
      setTimeout(finish, Math.max(4000, text.length * 90));
    } catch (err) {
      console.error('[Röst] Kunde inte starta talsyntes:', err);
      onError?.(String(err?.message || err));
      onEnd?.();
    }
  }, 80);
}

// Orben — samma visuella idé som godkändes i mockupen, nu byggd på
// riktigt. En enda komponent, återanvänd för både "lyssnar" och "svarar".
function VoiceOrb() {
  return (
    <Box sx={{ position: 'relative', width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {[0, 0.65, 1.3].map((delay) => (
        <Box key={delay} sx={{
          position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid rgba(17,24,39,0.28)',
          animation: 'voiceRing 2.6s cubic-bezier(.4,0,.3,1) infinite', animationDelay: `${delay}s`
        }} />
      ))}
      <Box sx={{
        width: 96, height: 96, borderRadius: '50%',
        background: 'linear-gradient(160deg, #1a2030 0%, #111827 60%, #05070c 100%)',
        boxShadow: '0 20px 48px rgba(17,24,39,0.28), inset 0 1px 1px rgba(255,255,255,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.6,
        animation: 'voiceBreathe 2.6s ease-in-out infinite'
      }}>
        {[0, 0.15, 0.3, 0.45, 0.6].map((delay) => (
          <Box key={delay} sx={{
            width: 4, borderRadius: '3px', bgcolor: '#fff', height: 10,
            animation: 'voiceBar 1.1s ease-in-out infinite', animationDelay: `${delay}s`
          }} />
        ))}
      </Box>
    </Box>
  );
}

export default function VoiceAssistant({ user, onNavigateBack }) {
  const [command, setCommand] = useState('');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoExecute, setAutoExecute] = useState(false);
  const [pending, setPending] = useState(null); // { preview, cards, pendingActionId }
  const [lastResult, setLastResult] = useState('');
  const [briefing, setBriefing] = useState('');
  // ✅ Hela den pågående tråden (om Claude bett om ett förtydligande) —
  // skickas med nästa anrop så Claude inte tappar den ursprungliga
  // avsikten. Nollställs så fort ett kommando faktiskt löser sig.
  const [conversationHistory, setConversationHistory] = useState([]);
  const [log, setLog] = useState([]);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const recognitionRef = useRef(null);
  const skipContinueRef = useRef(false); // sant vid manuellt avbrutet tal — hindra auto-lyssna efteråt

  const notify = (message, severity = 'success') => setToast({ open: true, message, severity });

  const loadAll = () => {
    Promise.all([
      apiRequest('/api/voice/settings').then(r => (r.ok ? r.json() : { autoExecute: false })),
      apiRequest('/api/voice/log').then(r => (r.ok ? r.json() : { log: [] })),
      apiRequest('/api/voice/briefing').then(r => (r.ok ? r.json() : { text: '' }))
    ]).then(([settings, logData, briefingData]) => {
      setAutoExecute(Boolean(settings.autoExecute));
      setLog(logData.log || []);
      setBriefing(briefingData.text || '');
    });
  };

  useEffect(() => { loadAll(); primeVoices(); }, []);
  // Sluta tala/lyssna om man lämnar sidan mitt i ett samtal.
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch {} recognitionRef.current?.stop(); }, []);

  const toggleAutoExecute = async (value) => {
    setAutoExecute(value);
    await apiRequest('/api/voice/settings', { method: 'PATCH', body: JSON.stringify({ autoExecute: value }) });
  };

  const startListening = () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      return notify('Röstinmatning stöds inte i den här webbläsaren — använd textfältet istället.', 'error');
    }
    setLiveTranscript('');
    const recognition = new SpeechRecognition();
    recognition.lang = 'sv-SE';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const result = event.results[0];
      const transcript = result[0].transcript;
      setLiveTranscript(transcript);
      // ✅ Skickas automatiskt så fort man slutat prata — ingen knapptryckning
      // krävs, det är hela poängen med att kunna köra det handsfree.
      if (result.isFinal) {
        setListening(false);
        submitCommand(transcript, true);
      }
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

  const stopSpeaking = () => {
    skipContinueRef.current = true;
    try { window.speechSynthesis.cancel(); } catch {}
    setSpeaking(false);
  };

  // ✅ Alltid synlig nödutgång under ett röstsamtal — oavsett vad
  // taligenkänningen eller talsyntesen råkar göra i bakgrunden ska man
  // alltid kunna ta sig tillbaka till textfältet och skriva/prata igen.
  const forceReset = () => {
    skipContinueRef.current = true;
    try { window.speechSynthesis.cancel(); } catch {}
    recognitionRef.current?.stop();
    setListening(false);
    setSpeaking(false);
  };

  // isVoice = kommandot kom från mikrofonen, inte textfältet — bara då
  // pratar BookR tillbaka. Skriver man tyst vid skrivbordet ska det
  // vara tyst, inte läsas upp.
  const submitCommand = async (overrideText, isVoice = false) => {
    const text = (overrideText ?? command).trim();
    if (!text) return;
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

      const res = await apiRequest('/api/voice/command', { method: 'POST', body: JSON.stringify({ command: text, contacts, conversationHistory }) });
      const data = await res.json().catch(() => ({}));

      const speakIfVoice = (message, continueListening) => {
        if (!isVoice || !message) return;
        skipContinueRef.current = false;
        setSpeaking(true);
        speak(message, {
          onEnd: () => {
            setSpeaking(false);
            if (continueListening && !skipContinueRef.current) startListening();
          },
          // ✅ Visar den RIKTIGA anledningen om talsyntesen misslyckas,
          // istället för att bara tystna utan förklaring.
          onError: (reason) => notify(`Talsyntesen svarade inte: ${reason}`, 'error')
        });
      };

      if (data.error) {
        setLastResult(data.error);
        // ✅ Fortsätt samma tråd — Claude bad om ett förtydligande, nästa
        // kommando är sannolikt bara svaret på den frågan. Pratar man med
        // mikrofonen fortsätter BookR att lyssna automatiskt efter att
        // den läst upp frågan — ingen ny knapptryckning behövs.
        setConversationHistory(data.conversationHistory || []);
        speakIfVoice(data.error, true);
      } else if (data.needsConfirmation) {
        setPending({ preview: data.preview, cards: data.cards, pendingActionId: data.pendingActionId });
        setConversationHistory([]);
        speakIfVoice(data.preview, false);
      } else if (data.executed) {
        setLastResult(data.result);
        notify('Klart!');
        setConversationHistory([]);
        speakIfVoice(data.result, false);
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

  const voiceActive = listening || speaking;

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
      <style>{`
        @keyframes voiceRing { 0% { transform: scale(0.72); opacity: .5; } 75% { opacity: 0; } 100% { transform: scale(1.55); opacity: 0; } }
        @keyframes voiceBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes voiceBar { 0%, 100% { height: 10px; } 50% { height: 28px; } }
      `}</style>

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
        Exempel: {EXAMPLES.map((e) => `"${e}"`).join(' · ')}
      </Typography>

      {briefing && (
        <Paper sx={{ ...pageCardSx, p: 2.5, mb: 3, bgcolor: 'rgba(17,24,39,0.03)', boxShadow: 'none' }}>
          <Typography sx={{ color: 'var(--text)', fontSize: 14.5 }}>{briefing}</Typography>
        </Paper>
      )}

      {conversationHistory.length > 0 && !voiceActive && (
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
        {voiceActive ? (
          // ✅ Den här vyn ersätter textfältet medan BookR lyssnar eller
          // pratar tillbaka — samma orb som i mockupen, nu levande.
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, py: 3 }}>
            <VoiceOrb />
            <Typography sx={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', textAlign: 'center', minHeight: 36, maxWidth: 560 }}>
              {listening ? (liveTranscript || 'Lyssnar...') : (lastResult || pending?.preview || 'Svarar...')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button onClick={listening ? stopListening : stopSpeaking} sx={secondaryButtonSx}>
                {listening ? 'Avbryt' : 'Tyst'}
              </Button>
              <Button onClick={forceReset} sx={secondaryButtonSx}>Skriv istället</Button>
            </Box>
          </Box>
        ) : (
          <>
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
                onClick={startListening}
                sx={{ bgcolor: 'rgba(17,24,39,0.06)', color: 'var(--text)', '&:hover': { bgcolor: 'rgba(17,24,39,0.1)' } }}
              >
                <MicIcon />
              </IconButton>
            </Box>
            <Box sx={{ mt: 2 }}>
              <Button variant="contained" startIcon={<SendIcon />} onClick={() => submitCommand()} disabled={loading || !command.trim()} sx={primaryButtonSx}>
                {loading ? 'Tolkar...' : 'Skicka'}
              </Button>
            </Box>
          </>
        )}
      </Paper>

      {pending && !voiceActive && (
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

      {loading && !pending && !voiceActive && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
      )}

      {lastResult && !pending && !voiceActive && (
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
