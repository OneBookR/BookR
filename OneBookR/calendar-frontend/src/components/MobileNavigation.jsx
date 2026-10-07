import React from 'react';
import { Box } from '@mui/material';
import { HOME_URL } from '../config';

// ✅ BUGFIX: den här komponenten var tidigare en ren stub (`return null`)
// trots att den togs emot props för och redan var monterad i App.jsx, och
// trots att innehållsytan runt den redan reserverade utrymme för den
// (pb: {xs: 8} i App.jsx — byggd för en bottennav som aldrig fanns). Kombinerat
// med att Header.jsx:s nav-knappar (1v1 Möte/Gruppmöte/Uppgift/Team) döljs
// under md-brytpunkten fanns det alltså INGEN väg att navigera mellan
// appens delar på mobil, bara loggan (hem) och avatar-menyn.
//
// Ikonerna matchar ShortcutDashboard.jsx:s egna enkla streck-SVG:er
// (OneOnOneIcon/TeamIcon m.fl.) istället för MUI:s fyllda Material-ikoner,
// för samma visuella språk som resten av "Starta något nytt"-korten.
function HomeIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 11l9-7 9 7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v9a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function MeetingIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" strokeLinecap="round" />
    </svg>
  );
}
function TaskIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8.5 12L11 14.5L15.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TeamIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="8" cy="9" r="3" />
      <circle cx="16" cy="9" r="3" />
      <path d="M2.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5M10.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" strokeLinecap="round" />
    </svg>
  );
}

const MobileNavigation = ({ currentPath = '', user, onNavigate, hidden = false }) => {
  if (!user || hidden) return null;

  const isTask = currentPath.includes('view=task');
  const isTeam = !isTask && currentPath.includes('meetingType=team');
  const isMeeting = !isTask && !isTeam && (
    currentPath.includes('meetingType=1v1') || currentPath.includes('meetingType=group') || currentPath.includes('group=')
  );
  const isHome = !isTask && !isTeam && !isMeeting;

  const tabs = [
    { key: 'hem', label: 'Hem', icon: <HomeIcon />, active: isHome, onClick: () => { window.location.href = HOME_URL; } },
    { key: 'mote', label: 'Möte', icon: <MeetingIcon />, active: isMeeting, onClick: () => onNavigate?.('1v1') },
    { key: 'uppgift', label: 'Uppgift', icon: <TaskIcon />, active: isTask, onClick: () => onNavigate?.('task') },
    { key: 'team', label: 'Team', icon: <TeamIcon />, active: isTeam, onClick: () => onNavigate?.('team') }
  ];

  return (
    <Box
      component="nav"
      aria-label="Mobilnavigation"
      sx={{
        display: { xs: 'flex', md: 'none' },
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1100,
        alignItems: 'stretch',
        bgcolor: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--border)',
        pt: 1,
        pb: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
        px: 0.75
      }}
    >
      {tabs.map((tab) => (
        <Box
          key={tab.key}
          component="button"
          onClick={tab.onClick}
          aria-current={tab.active ? 'page' : undefined}
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.4,
            py: 0.5,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: tab.active ? 'var(--text)' : '#9aa0ab',
            fontFamily: 'inherit'
          }}
        >
          {tab.icon}
          <Box component="span" sx={{ fontSize: 10.5, fontWeight: tab.active ? 700 : 600 }}>
            {tab.label}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

export default MobileNavigation;
