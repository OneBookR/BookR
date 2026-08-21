import React from 'react';
import { Box } from '@mui/material';

// ✅ BookRs logga (godkänd riktning: "ordmärke + jämförelse-mark", vald ur
// designcanvasen https://claude.ai/code/artifact/23f9d850-403c-4646-9c93-2e60f9cd5296).
// Ikonen är två överlappande tidsblock med en bock — en bokstavlig symbol
// för att jämföra två kalendrar och hitta den gemensamma lediga tiden.
// Stroke-baserad inline SVG, matchar appens formspråk (aldrig emoji som ikon).

// Ikonen ensam — används som favicon/app-ikon och där utrymmet är för
// litet för hela ordmärket.
export function LogoMark({ size = 24, dark = false }) {
  const fg = dark ? '#f7f7f3' : '#111827';
  const bg = dark ? '#111827' : '#f7f7f3';
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }}>
      <rect x="4" y="10" width="26" height="26" rx="7" stroke={fg} strokeWidth="2.2" />
      <rect x="14" y="4" width="26" height="26" rx="7" fill={bg} stroke={fg} strokeWidth="2.2" />
      <path d="M20 17L23.5 20.5L30 13" stroke="#1f7a4d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Fullt ordmärke — ikon + "BookR"-text. Används i topbaren/headern.
export function Logo({ iconSize = 28, fontSize = 22, dark = false, onClick, sx }) {
  const fg = dark ? '#f7f7f3' : '#111827';
  return (
    <Box
      onClick={onClick}
      sx={{ display: 'flex', alignItems: 'center', gap: iconSize < 24 ? 1 : 1.25, cursor: onClick ? 'pointer' : 'default', ...sx }}
    >
      <LogoMark size={iconSize} dark={dark} />
      <Box
        component="span"
        sx={{ fontSize, fontWeight: 800, letterSpacing: '-0.04em', color: fg, fontFamily: "'Manrope', 'Segoe UI', sans-serif" }}
      >
        BookR
      </Box>
    </Box>
  );
}
