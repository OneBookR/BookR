import React from 'react';
import { Box, Typography } from '@mui/material';

function ShieldCheckIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3L19 5.8V11C19 15.4 16.1 19 12 20.2C7.9 19 5 15.4 5 11V5.8L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 11.6L11 13.6L15 9.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ✅ Delad integritetsnotis för demo-flödet. Det viktigaste
// förtroendebudskapet: BookR ser bara ledigt/upptaget, aldrig innehållet,
// kollen är en engångshändelse och inget sparas.
//   phase="before" — visas INNAN användaren kopplar sin kalender (steg 2)
//   phase="after"  — visas när jämförelsen redan är gjord (välj tid-steget)
export default function CalendarPrivacyNote({ phase = 'before', maxWidth = 468, sx }) {
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'flex-start', gap: 1.5, textAlign: 'left',
        p: 2, borderRadius: 3.5, border: '1px solid var(--border)', bgcolor: 'rgba(17,24,39,0.03)',
        maxWidth, mx: 'auto', ...sx,
      }}
    >
      <Box sx={{ color: 'var(--text-secondary)', display: 'flex', flexShrink: 0, mt: '1px' }}>
        <ShieldCheckIcon size={18} />
      </Box>
      <Typography sx={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <Box component="span" sx={{ color: 'var(--text)', fontWeight: 700 }}>
          {phase === 'before'
            ? 'BookR läser aldrig innehållet i din kalender.'
            : 'Vi ser aldrig vad som står i din kalender.'}
        </Box>{' '}
        {phase === 'before'
          ? 'För att hitta gemensamma tider kollar vi bara om du är ledig eller upptagen — inte mötestitlar, deltagare eller detaljer. Det sker en enda gång och ingen kalenderinformation sparas.'
          : 'BookR läste bara av om du är ledig eller upptagen — inte mötestitlar, deltagare eller detaljer. Kollen gjordes en gång, nu, och ingen kalenderinformation sparas.'}
      </Typography>
    </Box>
  );
}
