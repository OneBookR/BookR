import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import ShortcutDashboard from './pages/ShortcutDashboard.jsx';
import Task from './pages/Task.jsx';
import Contact from './pages/Contact.jsx';
import About from './pages/About.jsx';
import OmOss from './pages/OmOss.jsx';
import Kontakt from './pages/Kontakt.jsx';
import Waitlist from './pages/Waitlist.jsx';
import WaitlistAdmin from './pages/WaitlistAdmin.jsx';
import BusinessSignup from './pages/BusinessSignup.jsx';
import BusinessAdmin from './pages/BusinessAdmin.jsx';
import VenueAdmin from './pages/VenueAdmin.jsx';
import VenueBooking from './pages/VenueBooking.jsx';
import Footer from './components/Footer.jsx';
import Header from './components/Header.jsx';
import MobileNavigation from './components/MobileNavigation.jsx';
import GoogleLogo from './assets/GoogleLogo.jsx';
import MicrosoftLogo from './assets/MicrosoftLogo.jsx';
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
  const params = useMemo(() => ({
    groupId: urlParams.get('group'),
    inviteeId: urlParams.get('invitee'),
    authToken: urlParams.get('auth'),
    view: urlParams.get('view'),
    meetingType: urlParams.get('meetingType'),
    error: urlParams.get('error')
  }), [urlParams]);

  const authReturnTo = useMemo(() => {
    const currentPath = window.location.pathname + window.location.search;
    return encodeURIComponent(currentPath || '/');
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

          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.get('group') && !sessionStorage.getItem('post_login_reloaded')) {
            sessionStorage.setItem('post_login_reloaded', 'true');
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
    
    // Återgå till shortcut dashboard
    setCurrentView('shortcut');
  }, []);



  // ✅ NAVIGATION HANDLER
  const handleNavigateToMeeting = useCallback((type) => {
    if (type === 'task') {
      const url = new URL(window.location);
      url.searchParams.set('view', 'task');
      window.history.replaceState({}, '', url);
      setCurrentView('task');
    } else {
      const url = new URL(window.location);
      url.searchParams.set('meetingType', type);
      window.history.replaceState({}, '', url);
      setCurrentView('dashboard');
    }
  }, []);

  // ✅ SPECIAL ROUTES CHECK
  const path = window.location.pathname;
  const isSpecialRoute = ['/business-signup', '/business-admin', '/contact', '/about', '/om-oss', '/kontakt', '/waitlist', '/admin/waitlist', '/venue-admin'].includes(path) || path.startsWith('/venue/');

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
      '/venue-admin': VenueAdmin
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

  // ✅ LOGIN SCREEN
  if (!user) {
    const featureItems = [
      'Koppla kalender och se tillgänglighet direkt',
      'Jämför tider med team eller kontaktpersoner',
      'Skicka vidare en ren bokningsupplevelse utan onödigt brus'
    ];

    const previewItems = [
      { label: 'Kalenderstatus', value: 'Synkad på 12 sek' },
      { label: 'Tillgänglighet', value: '3 gemensamma luckor idag' },
      { label: 'Mötestyp', value: '15, 30 eller 60 minuter' }
    ];

    return (
      <Box
        sx={{
          minHeight: '100vh',
          px: { xs: 2, md: 4 },
          py: { xs: 3, md: 5 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <CookieBanner />
        <Container maxWidth="lg">
          <Box
            sx={{
              position: 'relative',
              overflow: 'hidden',
              border: '1px solid var(--border)',
              borderRadius: { xs: 4, md: 8 },
              background: 'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.62) 100%)',
              boxShadow: 'var(--shadow-soft)',
              backdropFilter: 'blur(26px)'
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(circle at top left, rgba(17,24,39,0.08), transparent 32%), radial-gradient(circle at bottom right, rgba(17,24,39,0.06), transparent 28%)',
                pointerEvents: 'none'
              }}
            />
            <Box
              sx={{
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: '1.15fr 0.85fr' },
                gap: { xs: 4, lg: 5 },
                p: { xs: 3, sm: 4, md: 6 }
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 4 }}>
                <Box>
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      px: 1.5,
                      py: 0.75,
                      mb: 3,
                      borderRadius: 999,
                      border: '1px solid var(--border)',
                      bgcolor: 'rgba(255,255,255,0.66)',
                      color: 'var(--text)',
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase'
                    }}
                  >
                    BookR scheduling
                  </Box>

                  <Typography
                    variant="h1"
                    sx={{
                      fontSize: { xs: '2.5rem', md: '4.6rem' },
                      lineHeight: 1,
                      letterSpacing: '-0.06em',
                      fontWeight: 800,
                      maxWidth: 680
                    }}
                  >
                    En renare väg till rätt mötestid.
                  </Typography>

                  <Typography
                    variant="h6"
                    sx={{
                      mt: 3,
                      maxWidth: 560,
                      color: 'var(--text-secondary)',
                      fontWeight: 500,
                      lineHeight: 1.6,
                      fontSize: { xs: '1rem', md: '1.15rem' }
                    }}
                  >
                    BookR hjälper dig jämföra kalendrar, hitta gemensamma luckor och skicka vidare en bokningsupplevelse som känns snabb, tydlig och professionell.
                  </Typography>
                </Box>

                <Box sx={{ display: 'grid', gap: 1.5, maxWidth: 560 }}>
                  {featureItems.map((item) => (
                    <Box
                      key={item}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        px: 2,
                        py: 1.5,
                        borderRadius: 3,
                        border: '1px solid var(--border)',
                        bgcolor: 'rgba(255,255,255,0.55)'
                      }}
                    >
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          bgcolor: 'var(--text)'
                        }}
                      />
                      <Typography sx={{ color: 'var(--text)', fontWeight: 600 }}>
                        {item}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>

              <Paper
                elevation={0}
                sx={{
                  p: { xs: 3, md: 4 },
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  bgcolor: 'var(--surface)',
                  backdropFilter: 'blur(18px)'
                }}
              >
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 800, letterSpacing: '-0.04em' }}>
                  Fortsätt till ditt arbetsflöde
                </Typography>

                <Typography variant="body1" sx={{ mb: 3, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  Logga in med din kalenderleverantör för att synka tillgänglighet och börja boka med ett mer avskalat gränssnitt.
                </Typography>

                {params.error && (
                  <Alert
                    severity={params.error === 'token_expired' ? 'warning' : 'error'}
                    sx={{ mb: 3, borderRadius: 3 }}
                  >
                {params.error === 'google_auth_failed' && 'Google-inloggning misslyckades. Försök igen.'}
                {params.error === 'microsoft_auth_failed' && 'Microsoft-inloggning misslyckades. Försök igen.'}
                {params.error === 'callback_failed' && 'Inloggning misslyckades. Försök igen.'}
                {params.error === 'token_expired' && 'Din session har gått ut. Logga in igen för att fortsätta.'}
                {!['google_auth_failed', 'microsoft_auth_failed', 'callback_failed', 'token_expired'].includes(params.error) && 'Ett fel uppstod vid inloggning.'}
                {urlParams.get('logout') === 'success' && 'Du har loggats ut. Logga in igen för att fortsätta.'}
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
                      py: 1.7,
                      borderRadius: 3,
                      bgcolor: 'var(--text)',
                      color: 'var(--surface-strong)',
                      boxShadow: 'none',
                      '&:hover': {
                        bgcolor: '#000000',
                        boxShadow: 'none'
                      }
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
                      py: 1.7,
                      borderRadius: 3,
                      borderColor: 'var(--border)',
                      color: 'var(--text)',
                      '&:hover': {
                        borderColor: 'rgba(17,24,39,0.22)',
                        bgcolor: 'rgba(17,24,39,0.02)'
                      }
                    }}
                  >
                    Fortsätt med Microsoft
                  </Button>
                </Box>

                <Box
                  sx={{
                    mt: 3,
                    pt: 3,
                    borderTop: '1px solid var(--border)',
                    display: 'grid',
                    gap: 1.25
                  }}
                >
                  {previewItems.map((item) => (
                    <Box
                      key={item.label}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 2,
                        px: 2,
                        py: 1.5,
                        borderRadius: 3,
                        bgcolor: 'rgba(17,24,39,0.03)',
                        border: '1px solid rgba(17,24,39,0.04)'
                      }}
                    >
                      <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {item.label}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'var(--text)', fontWeight: 700 }}>
                        {item.value}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                {params.error === 'token_expired' && (
                  <Typography variant="body2" sx={{ mt: 2, color: 'var(--text-secondary)' }}>
                    Logga in igen för att komma tillbaka till din kalenderjämförelse.
                  </Typography>
                )}
              </Paper>
            </Box>
          </Box>
        </Container>
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
