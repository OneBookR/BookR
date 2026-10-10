import React from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';

function CalendarEditIcon({ size = 21 }) {
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
          bgcolor: 'var(--text)', border: '2px solid var(--surface-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
          <path d="M14.5 3.5L18 7L7 18H3.5V14.5L14.5 3.5Z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      </Box>
    </Box>
  );
}

// ✅ STYRD komponent (consent/busy/onEnable/onDisable som props, inte eget
// state) — till skillnad från UpcomingMeetingsCard.jsx behöver Task.jsx
// SJÄLV samma samtyckesflagga för draggableAccessor/selectable/
// loadRealEvents på kalendern nedanför, så en självförsörjande variant
// hade bara dubblerat state mellan komponenterna.
//
// Det här är ett BREDARE integritetsundantag än "Kommande möten"-kortets
// (calendarDetailsConsent): den flaggan gäller bara LÄSNING av mötestitlar.
// Den här (taskManagerCalendarConsent) gäller BÅDE läsning OCH att BookR
// får ändra/flytta/radera/skapa riktiga händelser — texten nedan måste
// därför vara ärlig om skrivdelen, inte bara nämna "se".
export default function TaskManagerCalendarConsentCard({ consent, busy, onEnable, onDisable }) {
  return (
    <Box sx={{ mb: 2 }}>
      {!consent ? (
        <Box
          sx={{
            display: 'flex', gap: 2, alignItems: 'flex-start', p: { xs: 2.5, sm: 3 },
            borderRadius: 4, border: '1px solid var(--border)', bgcolor: 'rgba(255,255,255,0.78)',
            boxShadow: '0 18px 40px rgba(15,23,42,0.05)',
          }}
        >
          <Box sx={{ width: 44, height: 44, borderRadius: 3, bgcolor: 'rgba(17,24,39,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text)' }}>
            <CalendarEditIcon />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', mb: 0.6 }}>
              Se och ändra din riktiga kalender här
            </Typography>
            <Typography sx={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              <Box component="span" sx={{ color: 'var(--text)', fontWeight: 700 }}>Idag visar Uppgifter bara anonyma "Upptagen"-block</Box>{' '}
              — aldrig titel, plats eller innehåll. Slår du på det här kan BookR (inklusive BookR:s AI-agent) visa dina riktiga händelser med titel, och du kan dra, ändra, radera och lägga till händelser direkt i kalendern härifrån.
            </Typography>
            <Typography sx={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', mt: 0.5 }}>
              Gäller bara din huvudkalender (inga delade/sekundära kalendrar), är frivilligt, och du stänger av det när du vill — dina egna ändringar i kalendern finns kvar även om du gör det.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mt: 1.75, flexWrap: 'wrap' }}>
              <Button
                onClick={onEnable}
                disabled={busy}
                sx={{
                  fontSize: 13, fontWeight: 700, px: 2.2, py: 1.1, borderRadius: 2.75, textTransform: 'none',
                  bgcolor: 'var(--text)', color: 'var(--surface-strong)', boxShadow: 'none',
                  '&:hover': { bgcolor: '#000', boxShadow: 'none' },
                }}
              >
                {busy ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : 'Slå på'}
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
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'var(--success)' }}>
            Riktig kalender på
          </Typography>
          <Box
            component="button"
            onClick={onDisable}
            aria-label="Stäng av riktig kalender i Uppgifter"
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
  );
}
