import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import { apiRequest } from '../utils/apiConfig.js';
import { trackEvent } from '../utils/analytics.js';

function CalendarCheckIcon({ size = 21 }) {
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="6" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4 10H20" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 4V7.5M16 4V7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <Box
        sx={{
          position: 'absolute', right: -4, bottom: -4, width: 16, height: 16, borderRadius: '50%',
          bgcolor: 'var(--success)', border: '2px solid var(--surface-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
          <path d="M5 13L10 18L19 7" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Box>
    </Box>
  );
}

function VideoIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M15 10L20 7V17L15 14" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <rect x="4" y="6" width="11" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

// sv-SE veckodagsförkortning, versal, utan punkt ("tors." -> "TORS")
function dayLabel(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
  if (diffDays === 0) return 'IDAG';
  if (diffDays === 1) return 'IMORGON';
  return date.toLocaleDateString('sv-SE', { weekday: 'short' }).replace('.', '').toUpperCase();
}

function timeLabel(dateStr) {
  return new Date(dateStr).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

function durationLabel(start, end) {
  if (!end) return null;
  const mins = Math.round((new Date(end) - new Date(start)) / 60000);
  if (mins <= 0) return null;
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// Visas bara om mötet börjar inom två timmar — annars skymmer den bara listan.
function soonLabel(start) {
  const diffMs = new Date(start) - new Date();
  if (diffMs < 0 || diffMs > 2 * 60 * 60 * 1000) return null;
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `Om ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `Om ${h} h ${m} min` : `Om ${h} h`;
}

function meetingProvider(m) {
  const url = m.hangoutLink || m.conferenceUri || '';
  if (m.hangoutLink || url.includes('meet.google.com')) return 'Google Meet';
  if (url.includes('teams.microsoft.com')) return 'Microsoft Teams';
  if (url) return 'Videomöte';
  return null;
}

// ✅ "Kommande möten" — medvetet skild från kärnfunktionen (kalender-
// jämförelse), som ALDRIG läser mer än ledigt/upptaget. Det här kortet
// visar riktiga mötestitlar och tider, vilket är ett aktivt undantag från
// integritetspolicyns löfte ("Vi läser inte titel, plats eller deltagare
// på dina kalenderhändelser") — därför krävs ett explicit, granulärt och
// återkalleligt samtycke (calendarDetailsConsent) innan vi någonsin
// hämtar det från /api/calendar/upcoming. Se designcanvasen "Kommande
// möten" för bakgrund.
export default function UpcomingMeetingsCard({ initialConsent }) {
  const [consent, setConsent] = useState(Boolean(initialConsent));
  const [dismissed, setDismissed] = useState(false);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/calendar/upcoming');
      if (res.ok) {
        const data = await res.json();
        setMeetings(data.events || []);
      }
    } catch { /* tyst — kortet visar bara tomt läge */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (consent) fetchMeetings();
  }, [consent, fetchMeetings]);

  const handleEnable = async () => {
    setBusy(true);
    try {
      const res = await apiRequest('/api/calendar/details-consent', {
        method: 'POST',
        body: JSON.stringify({ consent: true }),
      });
      if (res.ok) {
        trackEvent('upcoming_meetings_consent_given');
        setConsent(true);
      }
    } catch { /* knappen förblir klickbar — inget delvis tillstånd att städa upp */ }
    setBusy(false);
  };

  const handleDisable = async () => {
    setConsent(false);
    setMeetings([]);
    trackEvent('upcoming_meetings_consent_revoked');
    apiRequest('/api/calendar/details-consent', {
      method: 'POST',
      body: JSON.stringify({ consent: false }),
    }).catch(() => {});
  };

  if (dismissed) return null;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 1.5 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Kommande möten
        </Typography>
        {consent && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'var(--success)' }}>På</Typography>
            <Box
              component="button"
              onClick={handleDisable}
              aria-label="Stäng av mötesöversikt"
              sx={{
                width: 34, height: 20, borderRadius: 999, bgcolor: 'var(--success)', position: 'relative',
                border: 'none', p: 0, cursor: 'pointer', flexShrink: 0,
                '&::after': {
                  content: '""', position: 'absolute', top: 3, left: 17, width: 14, height: 14,
                  borderRadius: '50%', bgcolor: '#fff',
                },
              }}
            />
          </Box>
        )}
      </Box>

      {!consent ? (
        <Box
          sx={{
            display: 'flex', gap: 2, alignItems: 'flex-start', p: { xs: 2.5, sm: 3.5 },
            borderRadius: 5, border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)',
            boxShadow: '0 20px 60px rgba(15,23,42,0.07)',
          }}
        >
          <Box sx={{ width: 44, height: 44, borderRadius: 3, bgcolor: 'rgba(17,24,39,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text)' }}>
            <CalendarCheckIcon />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', mb: 0.6 }}>
              Vill du se dina möten här också?
            </Typography>
            <Typography sx={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              <Box component="span" sx={{ color: 'var(--text)', fontWeight: 700 }}>Idag läser BookR aldrig innehållet i din kalender</Box>{' '}
              — vi kollar bara ledigt/upptaget. Slår du på det här visar vi mötestitlar och tider för de kommande två veckornas videomöten (Google Meet, Teams m.fl.), direkt i översikten.
            </Typography>
            <Typography sx={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', mt: 0.5 }}>
              Frivilligt, gäller bara den här vyn, och du stänger av det när du vill.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mt: 1.75, flexWrap: 'wrap' }}>
              <Button
                onClick={handleEnable}
                disabled={busy}
                sx={{
                  fontSize: 13, fontWeight: 700, px: 2.2, py: 1.1, borderRadius: 2.75, textTransform: 'none',
                  bgcolor: 'var(--text)', color: 'var(--surface-strong)', boxShadow: 'none',
                  '&:hover': { bgcolor: '#000', boxShadow: 'none' },
                }}
              >
                {busy ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : 'Visa mina möten'}
              </Button>
              <Button
                onClick={() => setDismissed(true)}
                sx={{ fontSize: 13, fontWeight: 700, px: 1.5, py: 1.1, borderRadius: 2.75, textTransform: 'none', color: 'var(--text-secondary)' }}
              >
                Inte nu
              </Button>
            </Box>
            <Typography sx={{ fontSize: 11, color: 'var(--text-secondary)', mt: 1.5 }}>
              Läs mer i{' '}
              <Box component="a" href="/integritetspolicy" sx={{ color: 'var(--text-secondary)', textDecorationStyle: 'dotted' }}>
                integritetspolicyn
              </Box>.
            </Typography>
          </Box>
        </Box>
      ) : loading ? (
        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={22} sx={{ color: 'var(--text-secondary)' }} />
        </Box>
      ) : meetings.length === 0 ? (
        <Box sx={{ py: 4, px: 2, textAlign: 'center', borderRadius: 3.5, bgcolor: 'rgba(17,24,39,0.02)', border: '1px dashed rgba(17,24,39,0.12)' }}>
          <Typography sx={{ color: 'var(--text-secondary)', fontSize: 14 }}>Inga videomöten inbokade de kommande två veckorna.</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {meetings.map((meeting) => {
            const soon = soonLabel(meeting.start);
            const provider = meetingProvider(meeting);
            const duration = durationLabel(meeting.start, meeting.end);
            const joinUrl = meeting.hangoutLink || meeting.conferenceUri;
            return (
              <Box
                key={meeting.id}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 2, p: '12px 16px',
                  borderRadius: 3.5, bgcolor: 'rgba(17,24,39,0.025)', border: '1px solid rgba(17,24,39,0.05)',
                }}
              >
                <Box sx={{ width: 58, flexShrink: 0, textAlign: 'center', py: 0.9, borderRadius: 2.5, bgcolor: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
                  <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', color: 'var(--text-secondary)' }}>
                    {dayLabel(meeting.start)}
                  </Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                    {timeLabel(meeting.start)}
                  </Typography>
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }} noWrap>
                    {meeting.title}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'var(--text-secondary)', mt: 0.25 }} noWrap>
                    {[duration, provider].filter(Boolean).join(' · ') || 'Möte'}
                  </Typography>
                </Box>
                {soon && (
                  <Typography sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--success)', bgcolor: 'rgba(31,122,77,0.1)', px: 1.1, py: 0.5, borderRadius: 999, flexShrink: 0 }}>
                    {soon}
                  </Typography>
                )}
                {joinUrl && (
                  <Button
                    size="small"
                    onClick={() => window.open(joinUrl, '_blank')}
                    startIcon={<VideoIcon />}
                    sx={{ bgcolor: 'var(--text)', color: 'var(--surface-strong)', borderRadius: 2.5, flexShrink: 0, fontWeight: 700, textTransform: 'none', '&:hover': { bgcolor: '#000' } }}
                  >
                    Gå med
                  </Button>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
