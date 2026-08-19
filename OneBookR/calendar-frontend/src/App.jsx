import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import ShortcutDashboard from './pages/ShortcutDashboard.jsx';
import Task from './pages/Task.jsx';
import Contact from './pages/Contact.jsx';
import About from './pages/About.jsx';
import OmOss from './pages/OmOss.jsx';
import Kontakt from './pages/Kontakt.jsx';
import Integritetspolicy from './pages/Integritetspolicy.jsx';
import Waitlist from './pages/Waitlist.jsx';
import WaitlistAdmin from './pages/WaitlistAdmin.jsx';
import BusinessSignup from './pages/BusinessSignup.jsx';
import BusinessAdmin from './pages/BusinessAdmin.jsx';
import VenueAdmin from './pages/VenueAdmin.jsx';
import VenueBooking from './pages/VenueBooking.jsx';
import BokaDemo from './pages/BokaDemo.jsx';
import Footer from './components/Footer.jsx';
import Header from './components/Header.jsx';
import MobileNavigation from './components/MobileNavigation.jsx';
import GoogleLogo from './assets/GoogleLogo.jsx';
import MicrosoftLogo from './assets/MicrosoftLogo.jsx';
import { GoogleIcon, MicrosoftIcon, SyncArrow } from './assets/ProviderIcons.jsx';
import { Container, Typography, Button, Box, Alert, Paper, CircularProgress } from '@mui/material';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import CookieBanner from './components/CookieBanner.jsx';
import { apiRequest, createApiUrl } from './utils/apiConfig.js';

function App() {
  // User-state initieras tom — sanningskällan är serverns session-cookie
  const [user, setUser] = useState(null);
  
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('shortcut');
  const [isMobile, setIsMobile] = useState(false);

  // ✅ URL PARAMS
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);

  // OBS: params är riktig React-state, inte en useMemo av window.location.
  // window.location.search muteras utanför Reacts kontroll (via
  // history.replaceState i t.ex. handleLeaveGroup), och en useMemo med
  // tom dependency-array fångar bara URL:en vid första renderingen — den
  // uppdateras aldrig efteråt. Det gjorde att "Lämna grupp" tog bort
  // ?group= ur adressfältet men params.groupId förblev satt för alltid,
  // så shouldShowDashboard förblev true och man landade kvar i gruppvyn.
  // Varje ställe som muterar URL:en måste nu även anropa setParams.
  const [params, setParams] = useState(() => ({
    groupId: urlParams.get('group'),
    inviteeId: urlParams.get('invitee'),
    authToken: urlParams.get('auth'),
    view: urlParams.get('view'),
    meetingType: urlParams.get('meetingType'),
    error: urlParams.get('error')
  }));

  const authReturnTo = useMemo(() => {
    const currentPath = window.location.pathname + window.location.search;
    const params = new URLSearchParams(window.location.search);
    const groupId = params.get('group');
    const invitee = params.get('invitee');
    const directAccess = params.get('directAccess');

    if (groupId || invitee || directAccess) {
      console.log(`📌 [Invitation Link Detected]`);
      console.log(`   Group: ${groupId}`);
      console.log(`   Invitee: ${invitee}`);
      console.log(`   Saving to localStorage (persistent)...`);
      // ✅ Använd localStorage istället för sessionStorage - bevaras genom Gmail login
      localStorage.setItem('invitation_group', groupId || '');
      localStorage.setItem('invitation_invitee', invitee || '');
      localStorage.setItem('invitation_directAccess', directAccess || '');
    }

    const encoded = encodeURIComponent(currentPath || '/');
    console.log(`📨 [Auth Return Path]`);
    console.log(`   Current path: ${currentPath}`);
    console.log(`   Encoded for URL: ${encoded}`);
    return encoded;
  }, []);

  // USER DATA — accessToken exponeras aldrig i klient-state
  const userData = useMemo(() => ({
    email: user?.email || user?.emails?.[0]?.value || user?.emails?.[0],
    provider: user?.provider || (user?.mail ? 'microsoft' : 'google'),
    isLoggedIn: Boolean(user?.email)
  }), [user]);

  // ✅ MOBILE DETECTION
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);


  // ✅ HANDLE VIEW ROUTING
  useEffect(() => {
    if (user && params.groupId) {
      setCurrentView('dashboard');
    } else if (params.view === 'task') {
      setCurrentView('task');
    } else if (params.meetingType) {
      setCurrentView('dashboard');
    }
  }, [user, params.groupId, params.view, params.meetingType]);

  // ✅ ERROR HANDLING
  useEffect(() => {
    if (params.error) {
      console.error('❌ Auth error from URL:', params.error);
      // Clear the error from URL
      const url = new URL(window.location);
      url.searchParams.delete('error');
      window.history.replaceState({}, '', url);
    }
  }, [params.error]);

  // ✅ LOGOUT SUCCESS HANDLING
  useEffect(() => {
    const logout = urlParams.get('logout');
    if (logout === 'success') {
      console.log('✅ Logout successful');
      setUser(null);
      const url = new URL(window.location);
      url.searchParams.delete('logout');
      url.searchParams.delete('t');
      window.history.replaceState({}, '', url);
    }
  }, [urlParams]);

  // Hämta session-baserad användarinfo vid app-start — tokens hanteras bara på servern
  useEffect(() => {
    const checkUser = async () => {
      try {
        const res = await apiRequest('/api/auth/me');

        if (res.ok) {
          const data = await res.json();
          setUser(data);
          console.log('✅ User authenticated:', data.email);

          // ✅ Restora från localStorage (persistent genom Gmail login + OAuth)
          // OBS: körs ALDRIG om vi redan står på en annan special-route (t.ex.
          // /boka-demo) — annars kapar gammal localStorage från ett tidigare
          // besök i det vanliga inbjudningsflödet bort användaren mitt i ett
          // helt orelaterat flöde och kastar in dem i den vanliga dashboarden
          // istället. Det här hände på riktigt: en användare som testat
          // "Bjud in vänner" innan hamnade i CompareCalendar istället för
          // boka-demo-kalendern efter att ha loggat in där.
          const isOnUnrelatedSpecialRoute = window.location.pathname !== '/' &&
            ['/business-signup', '/business-admin', '/contact', '/about', '/om-oss', '/kontakt', '/waitlist', '/admin/waitlist', '/venue-admin', '/integritetspolicy', '/boka-demo'].includes(window.location.pathname);

          const savedGroup = isOnUnrelatedSpecialRoute ? null : localStorage.getItem('invitation_group');
          const savedInvitee = isOnUnrelatedSpecialRoute ? null : localStorage.getItem('invitation_invitee');
          const savedDirectAccess = isOnUnrelatedSpecialRoute ? null : localStorage.getItem('invitation_directAccess');

          console.log(`📌 [Post-Login Restoration Check]`);
          console.log(`   Current path: ${window.location.pathname}`);
          console.log(`   Saved Group (localStorage): ${savedGroup}`);
          console.log(`   Saved Invitee (localStorage): ${savedInvitee}`);
          console.log(`   Restoration flag: ${localStorage.getItem('post_login_restored')}`);

          if ((savedGroup || savedInvitee) && !localStorage.getItem('post_login_restored')) {
            console.log(`📍 Restoring invitation parameters from localStorage...`);
            localStorage.setItem('post_login_restored', 'true');
            const url = new URL(window.location);
            if (savedGroup) url.searchParams.set('group', savedGroup);
            if (savedInvitee) url.searchParams.set('invitee', savedInvitee);
            if (savedDirectAccess) url.searchParams.set('directAccess', savedDirectAccess);
            const finalUrl = url.toString();
            console.log(`   Final URL: ${finalUrl}`);
            window.location.href = finalUrl;
            return;
          }

          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.get('group') && !localStorage.getItem('post_login_reloaded')) {
            console.log(`📍 URL has group param, reloading...`);
            localStorage.setItem('post_login_reloaded', 'true');
            window.location.reload();
            return;
          }
        } else {
          const errorData = await res.json().catch(() => ({}));

          if (errorData.code === 'TOKEN_EXPIRED' || errorData.requiresReauth) {
            console.log('🔄 Token expired, forcing re-authentication');
            setUser(null);
            const url = new URL(window.location);
            url.searchParams.set('error', 'token_expired');
            window.history.replaceState({}, '', url);
          } else {
            console.log('ℹ️ User not authenticated');
            setUser(null);
          }
        }
      } catch (error) {
        console.error('❌ Failed to check user:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkUser();
  }, []);

  // ✅ HANDLE LEAVE GROUP
  const handleLeaveGroup = useCallback(() => {
    // Rensa URL parametrar
    const url = new URL(window.location);
    url.searchParams.delete('group');
    url.searchParams.delete('invitee');
    url.searchParams.delete('directAccess');
    url.searchParams.delete('contactEmail');
    url.searchParams.delete('contactName');
    url.searchParams.delete('meetingType');

    window.history.replaceState({}, '', url);

    // ✅ Rensa även localStorage-kvarlevorna från inbjudningsflödet — annars
    // ligger de kvar och kapar en helt orelaterad framtida session (t.ex.
    // /boka-demo) tillbaka till den här gamla gruppen efter nästa inloggning
    // (se restoration-logiken i checkUser ovan för hela historien).
    localStorage.removeItem('invitation_group');
    localStorage.removeItem('invitation_invitee');
    localStorage.removeItem('invitation_directAccess');
    localStorage.removeItem('post_login_restored');
    localStorage.removeItem('post_login_reloaded');

    // ✅ Måste även nollställa params-state — annars förblir params.groupId
    // satt (se kommentar vid params-state ovan) och shouldShowDashboard
    // stannar kvar på true trots att URL:en och currentView är rensade.
    setParams(prev => ({ ...prev, groupId: null, inviteeId: null, meetingType: null }));

    // Återgå till shortcut dashboard
    setCurrentView('shortcut');
  }, []);



  // ✅ NAVIGATION HANDLER
  const handleNavigateToMeeting = useCallback((type) => {
    if (type === 'task') {
      const url = new URL(window.location);
      url.searchParams.set('view', 'task');
      window.history.replaceState({}, '', url);
      setParams(prev => ({ ...prev, view: 'task' }));
      setCurrentView('task');
    } else {
      const url = new URL(window.location);
      url.searchParams.set('meetingType', type);
      window.history.replaceState({}, '', url);
      setParams(prev => ({ ...prev, meetingType: type }));
      setCurrentView('dashboard');
    }
  }, []);

  // ✅ SPECIAL ROUTES CHECK
  const path = window.location.pathname;
  const isSpecialRoute = ['/business-signup', '/business-admin', '/contact', '/about', '/om-oss', '/kontakt', '/waitlist', '/admin/waitlist', '/venue-admin', '/integritetspolicy', '/boka-demo'].includes(path) || path.startsWith('/venue/');

  // ✅ RENDER SPECIAL ROUTES
  if (isSpecialRoute) {
    const RouteComponent = {
      '/business-signup': BusinessSignup,
      '/business-admin': BusinessAdmin,
      '/contact': Contact,
      '/about': About,
      '/om-oss': OmOss,
      '/kontakt': Kontakt,
      '/waitlist': Waitlist,
      '/admin/waitlist': WaitlistAdmin,
      '/venue-admin': VenueAdmin,
      '/integritetspolicy': Integritetspolicy,
      '/boka-demo': BokaDemo
    }[path] || (path.startsWith('/venue/') ? VenueBooking : null);

    if (RouteComponent) {
      return <RouteComponent user={user} />;
    }
  }

  // ✅ LOADING STATE
  if (loading) {
    return (
      <Box sx={{ mt: 12, textAlign: 'center', p: 4 }}>
        <CircularProgress size={40} />
        <Typography sx={{ mt: 2 }}>Laddar BookR...</Typography>
      </Box>
    );
  }

  // ✅ LANDNINGSSIDA (cold outreach) — matchar den godkända designen i
  // designcanvasen (OptionA). Ersätter den gamla enklare login-vyn.
  if (!user) {
    const errorMessage = (() => {
      if (!params.error) return null;
      if (params.error === 'google_auth_failed') return 'Google-inloggning misslyckades. Försök igen.';
      if (params.error === 'microsoft_auth_failed') return 'Microsoft-inloggning misslyckades. Försök igen.';
      if (params.error === 'callback_failed') return 'Inloggning misslyckades. Försök igen.';
      if (params.error === 'token_expired') return 'Din session har gått ut. Logga in igen för att fortsätta.';
      if (params.error === 'oauth_state_mismatch') return 'Inloggningen avbröts av säkerhetsskäl. Försök igen.';
      if (params.error === 'access_restricted') return 'BookR är just nu under privat beta. Vill du testa produkten? Boka ett demo istället.';
      return 'Ett fel uppstod vid inloggning.';
    })();
    const logoutMessage = urlParams.get('logout') === 'success' ? 'Du har loggats ut. Logga in igen för att fortsätta.' : null;

    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'var(--background)' }}>
        <CookieBanner />

        <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 3, md: 8 }, pt: { xs: 6, md: 8 }, pb: { xs: 8, md: 12 } }}>

          {/* Top bar */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: { xs: 6, md: 10 } }}>
            <Typography sx={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)' }}>
              BookR
            </Typography>
            <Box
              sx={{
                display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 1, px: 1.75, py: 0.75,
                borderRadius: 999, border: '1px solid var(--border)', bgcolor: 'rgba(255,255,255,0.6)',
                fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                color: 'var(--text-secondary)'
              }}
            >
              Schemaläggning utan krångel
            </Box>
          </Box>

          {/* Hero */}
          <Box sx={{ maxWidth: 760, mx: 'auto', textAlign: 'center', mb: 7 }}>
            <Typography
              variant="h1"
              sx={{ fontSize: { xs: '1.9rem', sm: '2.4rem', md: '3.5rem' }, lineHeight: 1.08, letterSpacing: '-0.04em', fontWeight: 800, mb: 3, color: 'var(--text)' }}
            >
              Sluta fråga <Box component="span" sx={{ color: 'var(--text-secondary)' }}>&quot;funkar 14:00?&quot;</Box> i mejltråden.
            </Typography>
            <Typography sx={{ fontSize: { xs: 17, md: 19 }, lineHeight: 1.6, color: 'var(--text-secondary)', fontWeight: 500, mb: 2.5, maxWidth: 620, mx: 'auto' }}>
              BookR jämför allas kalendrar direkt och visar de tider som faktiskt fungerar för alla — ingen mer fram-och-tillbaka i mejl eller Slack.
            </Typography>
            <Typography sx={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)', fontWeight: 600, mb: 4, maxWidth: 540, mx: 'auto' }}>
              Ett snabbt avstämningsmöte, en stor gruppintervju eller en blockerad uppgiftstid — samma verktyg, samma enkla flöde.
            </Typography>
            <Button
              href="/boka-demo"
              variant="contained"
              size="large"
              sx={{
                px: 4, py: 1.8, borderRadius: 3.5, bgcolor: 'var(--text)', color: 'var(--surface-strong)',
                fontWeight: 700, fontSize: 16, boxShadow: 'none',
                '&:hover': { bgcolor: '#000000', boxShadow: 'none' }
              }}
            >
              Kom igång gratis →
            </Button>
          </Box>

          {/* Product hero visual: real-looking calendar comparison */}
          <Box
            sx={{
              maxWidth: 1040, mx: 'auto', borderRadius: { xs: 5, md: 8 }, border: '1px solid var(--border)',
              bgcolor: 'var(--surface)', backdropFilter: 'blur(20px)', boxShadow: '0 40px 120px rgba(15,23,42,0.14)',
              p: 1, mb: 9, position: 'relative', overflow: 'hidden'
            }}
          >
            <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top left, rgba(17,24,39,0.06), transparent 40%)', pointerEvents: 'none' }} />

            <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1, px: { xs: 1.75, md: 2.5 }, pt: 1.75, pb: 1.25 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'rgba(17,24,39,0.14)' }} />
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'rgba(17,24,39,0.14)' }} />
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'rgba(17,24,39,0.14)' }} />
              <Typography sx={{ ml: 1.5, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>app.onebookr.se</Typography>
            </Box>

            <Box sx={{ position: 'relative', bgcolor: 'var(--surface-strong)', borderRadius: { xs: 4, md: 6 }, border: '1px solid var(--border)', p: { xs: '18px 12px 20px', md: '28px 32px 32px' }, m: { xs: '0 6px 6px', md: '0 8px 8px' } }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: { xs: 2, md: 2.75 }, flexWrap: 'wrap', gap: 0.5 }}>
                <Typography sx={{ fontSize: { xs: 16, md: 19 }, fontWeight: 800, letterSpacing: '-0.03em' }}>Jämför kalendrar</Typography>
                <Typography sx={{ fontSize: { xs: 11, md: 13 }, fontWeight: 700, color: 'var(--text-secondary)' }}>Torsdag 21 augusti</Typography>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '28px repeat(3, 1fr)', md: '48px repeat(3, 1fr)' }, columnGap: 0 }}>
                <Box />
                {[
                  { label: 'Du', provider: 'google' },
                  { label: 'Kund A', provider: 'microsoft' },
                  { label: 'Kund B', provider: 'google' }
                ].map((col) => (
                  <Box key={col.label} sx={{ textAlign: 'center', pb: 1.5, px: 0.25 }}>
                    <Typography sx={{ fontSize: { xs: 11, md: 13 }, fontWeight: 800, mb: 0.5, whiteSpace: 'nowrap' }}>{col.label}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                      {col.provider === 'google' ? <GoogleIcon size={12} /> : <MicrosoftIcon size={12} />}
                      <Typography sx={{ fontSize: { xs: 0, md: 10 }, display: { xs: 'none', md: 'block' }, fontWeight: 700, color: 'var(--text-secondary)' }}>
                        {col.provider === 'google' ? 'Google' : 'Microsoft'}
                      </Typography>
                    </Box>
                  </Box>
                ))}

                {[
                  { hour: '10', busy: [true, false, true] },
                  { hour: '11', busy: [false, true, false] },
                  { hour: '12', busy: [true, true, false] },
                  { hour: '13', busy: [false, false, true] }
                ].map((row) => (
                  <React.Fragment key={row.hour}>
                    <Typography sx={{ fontSize: { xs: 10, md: 12 }, color: 'var(--text-secondary)', fontWeight: 700, pt: 0.75 }}>{row.hour}</Typography>
                    {row.busy.map((isBusy, i) => (
                      <Box key={i} sx={{ height: { xs: 32, md: 44 }, m: { xs: '2px 3px', md: '2px 6px' }, borderRadius: 2, bgcolor: isBusy ? 'rgba(17,24,39,0.09)' : 'transparent' }} />
                    ))}
                  </React.Fragment>
                ))}

                <Typography sx={{ fontSize: { xs: 10, md: 12 }, color: 'var(--text)', fontWeight: 800, pt: 1.5 }}>14</Typography>
                <Box
                  sx={{
                    gridColumn: 'span 3', m: { xs: '4px 3px', md: '4px 6px' }, borderRadius: 3, border: '2px solid var(--text)',
                    bgcolor: '#fff', px: { xs: 1.25, md: 2 }, py: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: 0.75, boxShadow: '0 12px 28px rgba(17,24,39,0.1)'
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'var(--success)', flexShrink: 0 }} />
                    <Typography sx={{ fontSize: { xs: 12, sm: 14 }, fontWeight: 800, letterSpacing: '-0.01em', whiteSpace: { xs: 'normal', sm: 'nowrap' } }}>
                      Alla tre lediga — 14:00
                    </Typography>
                  </Box>
                  <Box sx={{ fontSize: 12, fontWeight: 700, px: 1.75, py: 0.75, borderRadius: 999, bgcolor: 'var(--text)', color: '#fff', flexShrink: 0 }}>Boka</Box>
                </Box>

                <Typography sx={{ fontSize: { xs: 10, md: 12 }, color: 'var(--text-secondary)', fontWeight: 700, pt: 0.75 }}>15</Typography>
                {[true, false, true].map((isBusy, i) => (
                  <Box key={i} sx={{ height: { xs: 32, md: 44 }, m: { xs: '2px 3px', md: '2px 6px' }, borderRadius: 2, bgcolor: isBusy ? 'rgba(17,24,39,0.09)' : 'transparent' }} />
                ))}
              </Box>
            </Box>
          </Box>

          {/* Cross-platform sync: Google <-> BookR <-> Microsoft */}
          <Box
            sx={{
              maxWidth: 900, mx: 'auto', borderRadius: 6, border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)',
              boxShadow: 'var(--shadow-soft)', p: { xs: 3, md: '40px 44px' }, mb: 9
            }}
          >
            <Box sx={{ textAlign: 'center', mb: 3.5 }}>
              <Typography sx={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.03em', mb: 0.75 }}>
                Spelar ingen roll vem som använder vad
              </Typography>
              <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: 480, mx: 'auto' }}>
                Google Kalender och Microsoft Outlook läser varandra rakt igenom BookR — ingen part behöver byta system eller exportera något manuellt.
              </Typography>
            </Box>
            {/* xs: vertikal stack med nedåtpekande pilar (in mot BookR-kortet i mitten).
                sm+: horisontell rad som tidigare — tre 160px-kort + två 40px-pilar
                (≈560px) får inte plats på en 320–375px mobilskärm utan att wrap:a trasigt. */}
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', justifyContent: 'center', gap: { xs: 0, sm: 3 } }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.25, width: 160 }}>
                <Box sx={{ width: 56, height: 56, borderRadius: 3, border: '1px solid var(--border)', bgcolor: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <GoogleIcon size={26} />
                </Box>
                <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Google Kalender</Typography>
              </Box>

              <Box sx={{ display: { xs: 'block', sm: 'none' } }}><SyncArrow vertical /></Box>
              <Box sx={{ display: { xs: 'none', sm: 'block' } }}><SyncArrow direction="right" /></Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.25, width: 160 }}>
                <Box sx={{ width: 64, height: 64, borderRadius: 4, bgcolor: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>BookR</Typography>
                </Box>
                <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Jämför &amp; matchar</Typography>
              </Box>

              <Box sx={{ display: { xs: 'block', sm: 'none' } }}><SyncArrow vertical /></Box>
              <Box sx={{ display: { xs: 'none', sm: 'block' } }}><SyncArrow direction="left" /></Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.25, width: 160 }}>
                <Box sx={{ width: 56, height: 56, borderRadius: 3, border: '1px solid var(--border)', bgcolor: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MicrosoftIcon size={24} />
                </Box>
                <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Microsoft Outlook</Typography>
              </Box>
            </Box>
          </Box>

          {/* Value stats */}
          <Box sx={{ maxWidth: 900, mx: 'auto', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5, mb: 9 }}>
            <Box sx={{ p: 4, borderRadius: 5, border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)' }}>
              <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 0.75 }}>Fler bokade möten</Typography>
              <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                Varje extra mejl i tur och ordning är en chans att tappa kunden. En direkt bokningslänk höjer andelen som faktiskt landar ett möte.
              </Typography>
            </Box>
            <Box sx={{ p: 4, borderRadius: 5, border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)' }}>
              <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 0.75 }}>Inget faller mellan stolarna</Typography>
              <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                Ingen mer trådar som tystnar innan en tid är satt. Så länge alla svarat finns det alltid en tid kvar att välja.
              </Typography>
            </Box>
          </Box>

          {/* 3-step how it works */}
          <Box sx={{ maxWidth: 900, mx: 'auto', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 3, mb: 9 }}>
            {[
              { n: '01', title: 'Koppla kalender', body: 'Google eller Microsoft, klart på tio sekunder.' },
              { n: '02', title: 'Bjud in', body: 'Skicka en länk — mottagaren loggar in med Google, inget konto behövs.' },
              { n: '03', title: 'Välj en tid', body: 'BookR visar bara luckorna som passar alla.' }
            ].map((step) => (
              <Box key={step.n} sx={{ textAlign: 'center' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)', mb: 1.25 }}>{step.n}</Typography>
                <Typography sx={{ fontSize: 17, fontWeight: 700, mb: 0.75 }}>{step.title}</Typography>
                <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{step.body}</Typography>
              </Box>
            ))}
          </Box>

          {/* Scales from 1:1 to group */}
          <Box
            sx={{
              maxWidth: 900, mx: 'auto', borderRadius: 5, border: '1px solid var(--border)', bgcolor: 'var(--surface)',
              backdropFilter: 'blur(18px)', p: { xs: 3, md: '32px 36px' }, mb: 8,
              display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, gap: 4
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexShrink: 0 }}>
              <Box sx={{ width: 44, height: 44, borderRadius: 3, bgcolor: 'var(--text)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>1:1</Box>
              <Box sx={{ width: 24, height: 1, bgcolor: 'var(--border)' }} />
              <Box sx={{ width: 44, height: 44, borderRadius: 3, bgcolor: 'var(--text)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>10:1</Box>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 16, fontWeight: 700, mb: 0.5 }}>Från snabbt avstämningsmöte till stor grupp</Typography>
              <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                Fungerar lika bra för ett enda möte som för tio personer från olika företag utan synkade kalendrar. Alla loggar in med Google och går rakt in i samma jämförelse — inget konto att skapa, ingen väntan.
              </Typography>
            </Box>
          </Box>

          {/* Login card */}
          <Paper
            elevation={0}
            sx={{
              maxWidth: 460, mx: 'auto', borderRadius: 6, border: '1px solid var(--border)',
              bgcolor: 'var(--surface-strong)', boxShadow: 'var(--shadow-soft)', p: { xs: 3, sm: 5 }
            }}
          >
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.03em', mb: 1, textAlign: 'center' }}>
              Kom igång
            </Typography>
            <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', mb: 3.5 }}>
              Ingen kreditkort krävs.
            </Typography>

            {(errorMessage || logoutMessage) && (
              <Alert
                severity={params.error === 'token_expired' ? 'warning' : 'error'}
                sx={{ mb: 3, borderRadius: 3 }}
              >
                {errorMessage || logoutMessage}
              </Alert>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Button
                variant="contained"
                href={createApiUrl(`/auth/google?returnTo=${authReturnTo}`)}
                size="large"
                startIcon={<GoogleLogo size={20} />}
                fullWidth
                sx={{
                  py: 1.7, borderRadius: 3, bgcolor: 'var(--text)', color: 'var(--surface-strong)',
                  boxShadow: 'none', '&:hover': { bgcolor: '#000000', boxShadow: 'none' }
                }}
              >
                Fortsätt med Google
              </Button>

              <Button
                variant="outlined"
                href={createApiUrl(`/auth/microsoft?returnTo=${authReturnTo}`)}
                size="large"
                startIcon={<MicrosoftLogo size={20} />}
                fullWidth
                sx={{
                  py: 1.7, borderRadius: 3, borderColor: 'var(--border)', color: 'var(--text)',
                  '&:hover': { borderColor: 'rgba(17,24,39,0.22)', bgcolor: 'rgba(17,24,39,0.02)' }
                }}
              >
                Fortsätt med Microsoft
              </Button>
            </Box>

            {params.error === 'token_expired' && (
              <Typography variant="body2" sx={{ mt: 2, color: 'var(--text-secondary)', textAlign: 'center' }}>
                Logga in igen för att komma tillbaka till din kalenderjämförelse.
              </Typography>
            )}
          </Paper>
        </Box>
      </Box>
    );
  }

  // ✅ MAIN APP
  const shouldShowTask = params.view === 'task' || currentView === 'task';
  const shouldShowDashboard = Boolean(params.groupId || currentView === 'dashboard' || params.meetingType);

  return (
    <>
      <CookieBanner />
      {/* ✅ HEADER ALLTID SYNLIG NÄR INLOGGAD */}
      <Header
        user={user} 
        onNavigate={handleNavigateToMeeting}
        onLeaveGroup={handleLeaveGroup}
      />
      
      {/* Success indicator */}
      <Box sx={{ position: 'fixed', top: 80, left: 0, width: '100%', zIndex: 1000, pointerEvents: 'none' }}>
        <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Box
            sx={{
              px: 1.5,
              py: 1,
              borderRadius: 999,
              border: '1px solid var(--border)',
              bgcolor: 'rgba(255,255,255,0.82)',
              color: 'var(--text-secondary)',
              backdropFilter: 'blur(18px)',
              boxShadow: '0 10px 30px rgba(15, 23, 42, 0.07)'
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              Inloggad som {userData.email || 'okänd användare'}
            </Typography>
          </Box>
        </Container>
      </Box>
      
      <Box sx={{ mt: 12, minHeight: 'calc(100vh - 200px)', px: { xs: 1, sm: 2 }, pb: { xs: 8, sm: 0 } }}>
        <ErrorBoundary componentName="MainRouter">
          {shouldShowTask ? (
            <Task user={user} />
          ) : shouldShowDashboard ? (
            <Dashboard
              user={user}
              onNavigateToMeeting={handleNavigateToMeeting}
              groupId={params.groupId}
            />
          ) : (
            <ShortcutDashboard 
              user={user} 
              onNavigateToMeeting={handleNavigateToMeeting} 
            />
          )}
        </ErrorBoundary>
      </Box>
      
      {!shouldShowTask && <Footer />}
      <MobileNavigation currentPath={window.location.pathname + window.location.search} user={user} onNavigate={handleNavigateToMeeting} />
    </>
  );
}

export default App;
