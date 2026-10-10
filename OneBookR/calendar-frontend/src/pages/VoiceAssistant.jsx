import React, { useState, useEffect, useRef } from 'react';
import {
  Container, Typography, Box, Button, TextField, Switch, FormControlLabel,
  Paper, Snackbar, Alert, CircularProgress, IconButton
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MicIcon from '@mui/icons-material/Mic';
import SendIcon from '@mui/icons-material/Send';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import PauseIcon from '@mui/icons-material/Pause';
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

// ✅ Röst in = webbläsarens inbyggda taligenkänning (Web Speech API),
// Chrome/Edge-stöd. Röst ut = en riktig molnröst (ElevenLabs, via
// backend) istället för webbläsarens robotaktiga inbyggda talsyntes.
function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// En enda delad <audio>-tagg, återanvänd för varje svar — se
// unlockTtsAudio() för varför den måste vara EN instans som hålls vid liv.
let ttsAudioEl = null;
function getTtsAudioEl() {
  if (!ttsAudioEl) {
    ttsAudioEl = new Audio();
    ttsAudioEl.preload = 'auto';
  }
  return ttsAudioEl;
}

// Kortast möjliga, giltiga tysta ljudfil — bara till för att "låsa upp"
// uppspelning, spelas aldrig hörbart.
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAAAA';

// ✅ Samma rotorsak som tidigare löstes för webbläsarens speechSynthesis
// gäller lika mycket för <audio>: iOS (Safari OCH Chrome på iPhone —
// samma WebKit-motor under huven) tillåter bara uppspelning som en
// DIREKT fortsättning av en användares knapptryckning. Vårt riktiga
// play() sker efter två await-anrop (tolka kommandot + hämta ljudet från
// ElevenLabs), långt efter att interaktionen "räknas" som giltig. Men en
// och samma <audio>-ELEMENT som en gång blivit upplåst via ett lyckat
// play() i en riktig klick-handler förblir upplåst för resten av sidans
// session, även när man senare bara byter .src och kör play() async —
// därför återanvänds samma element hela tiden istället för att skapa ett
// nytt per svar.
let ttsUnlocked = false;
function unlockTtsAudio() {
  if (ttsUnlocked) return;
  const el = getTtsAudioEl();
  el.src = SILENT_WAV;
  el.play().then(() => { ttsUnlocked = true; el.pause(); }).catch(() => {});
}

// ✅ Hämtar en riktig, mänsklig uppläsning från backend (ElevenLabs)
// istället för webbläsarens inbyggda talsyntes. Samma anrops-form
// (onEnd/onError) som tidigare så resten av komponenten är opåverkad.
async function speak(text, { onEnd, onError } = {}) {
  if (!text) { onEnd?.(); return; }
  try {
    const res = await apiRequest('/api/voice/speak', { method: 'POST', body: JSON.stringify({ text }) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `TTS ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const el = getTtsAudioEl();
    el.src = url;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      onEnd?.();
    };
    el.onended = finish;
    // ✅ Tar med MediaError-koden och blobbens storlek/typ i felet —
    // "uppspelningsfel" ensamt säger ingenting om VARFÖR. Koderna är
    // standardiserade: 1=avbruten, 2=nätverksfel, 3=kunde inte avkoda,
    // 4=formatet stöds inte/okänt.
    el.onerror = () => {
      const codeNames = { 1: 'avbruten', 2: 'nätverksfel', 3: 'kunde inte avkoda ljudet', 4: 'format stöds inte' };
      const reason = codeNames[el.error?.code] || 'okänt fel';
      console.error('[Röst] Uppspelningsfel:', { code: el.error?.code, reason, blobSize: blob.size, blobType: blob.type });
      onError?.(`${reason} (${blob.size} bytes, ${blob.type || 'okänd typ'})`);
      finish();
    };
    await el.play();
    // ✅ Säkerhetsnät: onended är inte 100% pålitlig i alla webbläsare —
    // UI:t ska ALDRIG kunna fastna i "pratar"-läget utan en väg vidare.
    setTimeout(finish, Math.max(6000, text.length * 110));
  } catch (err) {
    console.error('[Röst] Kunde inte spela upp talsvaret:', err);
    onError?.(String(err?.message || err));
    onEnd?.();
  }
}

// Sidoknapp (mute/pausa) — samma stil som i mockupen: en neutral,
// återhållsam 52px-cirkel som bara mörknar lite när den är aktiv.
function SideButton({ onClick, active, disabled, label, children }) {
  return (
    <IconButton
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      sx={{
        width: 52, height: 52,
        bgcolor: active ? 'var(--text)' : 'rgba(17,24,39,0.04)',
        color: active ? 'var(--surface-strong)' : 'var(--text)',
        border: '1px solid', borderColor: active ? 'var(--text)' : 'rgba(17,24,39,0.09)',
        '&:hover': { bgcolor: active ? '#000' : 'rgba(17,24,39,0.08)' },
        '&.Mui-disabled': { opacity: 0.35 },
      }}
    >
      {children}
    </IconButton>
  );
}

// Huvudknappen — en enda tunn ring + en solid cirkel, exakt stilen som
// godkändes i mockupen. Ikonen/färgen byter beroende på läge: mikrofon
// medan BookR lyssnar, tre pulserande punkter medan den tänker, en vit
// kvadrat medan den pratar.
function VoiceOrb({ phase, onClick }) {
  const fill = phase === 'thinking' ? '#3a3f4d' : 'var(--text)';
  return (
    <Box
      onClick={phase === 'thinking' ? undefined : onClick}
      sx={{
        position: 'relative', width: 104, height: 104, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: phase === 'thinking' ? 'default' : 'pointer',
      }}
    >
      {phase !== 'thinking' && (
        <Box sx={{
          position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(17,24,39,0.22)',
          animation: 'voiceRing 2.4s ease-out infinite',
        }} />
      )}
      <Box sx={{
        width: 72, height: 72, borderRadius: '50%', bgcolor: fill,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
      }}>
        {phase === 'thinking' ? (
          [0, 0.2, 0.4].map((delay) => (
            <Box key={delay} sx={{
              width: 6, height: 6, borderRadius: '50%', bgcolor: '#fff',
              animation: 'voiceDot 1.4s ease-in-out infinite', animationDelay: `${delay}s`,
            }} />
          ))
        ) : phase === 'speaking' ? (
          <Box sx={{ width: 20, height: 20, borderRadius: '5px', bgcolor: '#fff' }} />
        ) : (
          <MicIcon sx={{ color: '#fff', fontSize: 26 }} />
        )}
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
  // ✅ Mute stänger bara av RÖSTEN (talsyntesen) — samtalet/lyssningen
  // fortsätter som vanligt, man ser bara svaret som text istället.
  // Sparas per användare så den inte glöms bort mellan sessioner.
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem(`bookr_voice_muted_${user?.email}`) === '1'; } catch { return false; }
  });
  const recognitionRef = useRef(null);
  const skipContinueRef = useRef(false); // sant vid manuellt avbrutet tal — hindra auto-lyssna efteråt
  // ✅ "Tänker"-läget i orben ska bara visas när det var ETT röstkommando
  // som väntar på svar — inte när man skrev i textfältet, då ska orben
  // inte dyka upp alls.
  const isVoiceLoadingRef = useRef(false);

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

  useEffect(() => { loadAll(); }, []);
  // Sluta tala/lyssna om man lämnar sidan mitt i ett samtal.
  useEffect(() => () => { try { ttsAudioEl?.pause(); } catch {} recognitionRef.current?.stop(); }, []);

  const toggleAutoExecute = async (value) => {
    setAutoExecute(value);
    await apiRequest('/api/voice/settings', { method: 'PATCH', body: JSON.stringify({ autoExecute: value }) });
  };

  const startListening = () => {
    // ✅ Måste ske HÄR, synkront, innan något annat — det här är den enda
    // platsen koden körs direkt inuti en användares knapptryckning. Se
    // kommentaren vid unlockTtsAudio().
    unlockTtsAudio();
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
    try { getTtsAudioEl().pause(); } catch {}
    setSpeaking(false);
  };

  const toggleMuted = () => {
    setMuted((prev) => {
      const next = !prev;
      try { localStorage.setItem(`bookr_voice_muted_${user?.email}`, next ? '1' : '0'); } catch {}
      if (next) stopSpeaking();
      return next;
    });
  };

  // Pausa = avbryt det som pågår just nu (lyssning eller tal), utan att
  // skicka något. Under "tänker" finns inget att pausa.
  const handlePause = () => {
    if (listening) stopListening();
    else if (speaking) stopSpeaking();
  };

  // Tryck på själva huvudknappen: medan BookR lyssnar skickar det det du
  // redan sagt direkt (istället för att vänta på att man tystnar). Medan
  // BookR pratar avbryter det och börjar lyssna igen direkt — man kan
  // alltså "avbryta" den mitt i och ställa en ny fråga.
  const handleOrbTap = () => {
    if (listening) {
      const text = liveTranscript.trim();
      recognitionRef.current?.stop();
      setListening(false);
      if (text) submitCommand(text, true);
    } else if (speaking) {
      stopSpeaking();
      startListening();
    }
  };

  // ✅ Alltid synlig nödutgång under ett röstsamtal — oavsett vad
  // taligenkänningen eller talsyntesen råkar göra i bakgrunden ska man
  // alltid kunna ta sig tillbaka till textfältet och skriva/prata igen.
  const forceReset = () => {
    skipContinueRef.current = true;
    try { getTtsAudioEl().pause(); } catch {}
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
    isVoiceLoadingRef.current = isVoice;
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
        // ✅ Mute: visa svaret tyst istället för att läsa upp det, men
        // fortsätt samtalet (lyssna igen) precis som om det pratat klart.
        if (muted) {
          if (continueListening) startListening();
          return;
        }
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
        // ✅ Ett riktigt samtal, inte en fråga i taget — efter att BookR
        // svarat fortsätter den lyssna direkt, precis som Claude/ChatGPTs
        // röstläge. Ingen ny knapptryckning för att fortsätta prata.
        speakIfVoice(data.result, true);
      }
      setCommand('');
      loadAll();
    } catch {
      notify('Kunde inte skicka kommandot', 'error');
    } finally {
      setLoading(false);
      isVoiceLoadingRef.current = false;
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

  const phase = listening ? 'listening' : speaking ? 'speaking' : (loading && isVoiceLoadingRef.current) ? 'thinking' : null;
  const voiceActive = Boolean(phase);
  const phaseLabel = phase === 'listening' ? 'Lyssnar...' : phase === 'thinking' ? 'Tänker...' : phase === 'speaking' ? 'BookR svarar' : '';

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
      <style>{`
        @keyframes voiceRing { 0% { transform: scale(0.88); opacity: .45; } 100% { transform: scale(1.4); opacity: 0; } }
        @keyframes voiceDot { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
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
          // ✅ Den här vyn ersätter textfältet medan BookR lyssnar, tänker
          // eller pratar tillbaka — samma ljusa, minimalistiska stil som
          // godkändes i mockupen: mute — huvudknapp — pausa.
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, py: 3 }}>
            <Typography sx={{ fontSize: 22, fontWeight: 500, color: phase === 'listening' ? 'var(--text)' : 'var(--text-secondary)', textAlign: 'center', minHeight: 36, maxWidth: 560 }}>
              {phase === 'listening' ? (liveTranscript || ' ') : (lastResult || pending?.preview || ' ')}
            </Typography>
            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              {phaseLabel}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <SideButton onClick={toggleMuted} active={muted} label="Stäng av ljud">
                <VolumeOffIcon fontSize="small" />
              </SideButton>
              <VoiceOrb phase={phase} onClick={handleOrbTap} />
              <SideButton onClick={handlePause} disabled={phase === 'thinking'} label="Pausa">
                <PauseIcon fontSize="small" />
              </SideButton>
            </Box>
            <Button onClick={forceReset} sx={{ ...secondaryButtonSx, border: 'none', color: 'var(--text-secondary)' }}>
              Skriv istället
            </Button>
          </Box>
        ) : (
          <>
            {/* ✅ Huvudvägen in är att TRYCKA OCH PRATA — samma idé som i
                mockupen. Textfältet nedanför är ett alternativ, inte
                huvudvägen, så det ska inte vara det första man ser. */}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 1, mb: 3 }}>
              <IconButton
                onClick={startListening}
                sx={{
                  width: 88, height: 88, bgcolor: 'var(--text)', color: '#fff',
                  boxShadow: '0 14px 30px rgba(17,24,39,0.18)',
                  '&:hover': { bgcolor: '#000' },
                }}
              >
                <MicIcon sx={{ fontSize: 30 }} />
              </IconButton>
              <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-secondary)', textTransform: 'uppercase', mt: 1 }}>
                Tryck för att prata
              </Typography>
            </Box>

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

            <Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--text-secondary)', display: 'block', mb: 0.5 }}>
              Eller skriv istället
            </Typography>
            <TextField
              fullWidth multiline minRows={2}
              placeholder='T.ex. "Boka om mötet med Valdemar till nästa vecka"'
              value={command}
              onChange={e => setCommand(e.target.value)}
              sx={fieldSx}
            />
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
