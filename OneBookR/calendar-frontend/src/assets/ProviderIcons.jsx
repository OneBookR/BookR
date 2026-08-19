import React from 'react';

// ✅ Google/Microsoft-leverantörsikoner + BookR-riktade synk-pilar, använda
// på landningssidan för att visuellt bevisa korsplattforms-stödet (Google
// och Microsoft kalendrar jämförs sida vid sida i samma vy).

export function GoogleIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85A10.99 10.99 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.85z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a10.99 10.99 0 0 0-9.82 6.05l3.66 2.85C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

export function MicrosoftIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="10.5" height="10.5" fill="#F25022" />
      <rect x="12.5" y="1" width="10.5" height="10.5" fill="#7FBA00" />
      <rect x="1" y="12.5" width="10.5" height="10.5" fill="#00A4EF" />
      <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900" />
    </svg>
  );
}

// direction="right": pilen pekar höger (används till vänster om BookR, flödar IN mot BookR).
// direction="left": pilen pekar vänster (används till höger om BookR, flödar IN mot BookR).
// Båda pekar alltså MOT mitten — aldrig genom varandra.
//
// vertical=true: samma "pekar in mot BookR"-logik men roterad 90° för att
// användas när layouten staplas vertikalt på mobil (se cross-platform-
// sync-sektionen i App.jsx) — annars wrap:ar tre 160px-kort + två 40px-
// horisontella pilar trasigt på smala skärmar (en ensam vågrät pil på egen
// rad ser trasigt ut).
export function SyncArrow({ direction = 'right', vertical = false }) {
  if (vertical) {
    // Pekar alltid NEDÅT — dvs in mot BookR-kortet som ligger i mitten av stacken.
    return (
      <svg width="16" height="32" viewBox="0 0 16 32" style={{ flexShrink: 0, color: 'var(--text-secondary)' }}>
        <line x1="8" y1="0" x2="8" y2="26" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 20 L8 26 L14 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (direction === 'left') {
    return (
      <svg width="40" height="16" viewBox="0 0 40 16" style={{ flexShrink: 0, color: 'var(--text-secondary)' }}>
        <line x1="40" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 2 L6 8 L12 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="40" height="16" viewBox="0 0 40 16" style={{ flexShrink: 0, color: 'var(--text-secondary)' }}>
      <line x1="0" y1="8" x2="34" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M28 2 L34 8 L28 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
