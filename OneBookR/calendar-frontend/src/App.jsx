import React, { useEffect, useState } from 'react';
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
import MobileNotSupported from './pages/MobileNotSupported.jsx';
import MobileNavigation from './components/MobileNavigation.jsx';
import { Container, Typography, Button, Box, Alert, Paper, Divider, Grid } from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import GroupIcon from '@mui/icons-material/Group';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SecurityIcon from '@mui/icons-material/Security';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';

function App() {
  const [user, setUser] = useState(() => {
    // Försök hämta användare från localStorage vid start
    try {
      const savedUser = localStorage.getItem('bookr_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('shortcut'); // 'shortcut' eller 'dashboard'
  const [isMobile, setIsMobile] = useState(false);

  // Kontrollera om det är mobil
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Spara användare i localStorage när den ändras
  useEffect(() => {
    if (user) {
      localStorage.setItem('bookr_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('bookr_user');
      localStorage.removeItem('pendingGroupJoin');
      sessionStorage.removeItem('hasTriedSession');
      sessionStorage.removeItem('currentGroupName');
      sessionStorage.removeItem('currentGroupMembers');
    }
  }, [user]);

  // Logout-funktion
  const handleLogout = () => {
    setUser(null);
    // Rensa alla relevanta localStorage och sessionStorage-nycklar
    localStorage.removeItem('bookr_user');
    localStorage.removeItem('pendingGroupJoin');
    sessionStorage.removeItem('hasTriedSession');
    sessionStorage.removeItem('currentGroupName');
    sessionStorage.removeItem('currentGroupMembers');
    window.location.href = 'https://www.onebookr.se/auth/logout';
  };

  // Visa mobilsida om användaren är inloggad på mobil
  if (user && isMobile) {
    return <MobileNotSupported user={user} onLogout={handleLogout} />;
  }

  // Spara URL-parametrar i localStorage om det finns group-parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const groupId = urlParams.get('group');
    const inviteeId = urlParams.get('invitee');
    
    // Sätt currentView baserat på URL-parametrar
    if (groupId) {
      setCurrentView('dashboard');
    }
    
    if (groupId && !user) {
      // Spara parametrarna i localStorage
      localStorage.setItem('pendingGroupJoin', JSON.stringify({
        groupId,
        inviteeId,
        hash: window.location.hash
      }));
    }
  }, [user]);

  useEffect(() => {
    // Kolla först efter auth-parameter i URL
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('auth');
    
    // Kontrollera om vi kommer från logout (ingen auth-token och ingen sparad användare)
    const hasLoggedOut = !authToken && !localStorage.getItem('bookr_user');
    if (hasLoggedOut) {
      // Säkerställ att allt är rensat efter logout
      setUser(null);
      localStorage.removeItem('bookr_user');
      localStorage.removeItem('pendingGroupJoin');
      sessionStorage.removeItem('hasTriedSession');
      sessionStorage.removeItem('currentGroupName');
      sessionStorage.removeItem('currentGroupMembers');
    }

    // Om vi redan har en användare, gör inget mer
    if (user) {
      setLoading(false);
      return;
    }

    if (authToken) {
      try {
        // Dekoda och sätt user direkt
        const decoded = JSON.parse(atob(authToken));
        setUser(decoded.user);
        setLoading(false);

        // Rensa auth-parametern från URL för att undvika loop
        urlParams.delete('auth');
        const newUrl =
          window.location.pathname +
          (urlParams.toString() ? '?' + urlParams.toString() : '') +
          window.location.hash;
        window.history.replaceState({}, '', newUrl);
      } catch (e) {
        console.error('Error decoding auth token:', e);
        setUser(null);
        setLoading(false);
      }
    } else {
      // Om ingen auth-token, försök hämta användaren från backend-session (om det finns)
      // Men bara om vi inte redan försökt
      const hasTriedSession = sessionStorage.getItem('hasTriedSession');
      if (!hasTriedSession) {
        sessionStorage.setItem('hasTriedSession', 'true');
        fetch('https://www.onebookr.se/api/user', {
          credentials: 'include'
        })
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data && data.user) {
              setUser(data.user);
            }
            setLoading(false);
          })
          .catch(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }
  }, []);

  // Efter inloggning, återställ URL om det finns sparade parametrar
  useEffect(() => {
    if (user) {
      const pendingJoin = localStorage.getItem('pendingGroupJoin');
      if (pendingJoin) {
        try {
          const { groupId, inviteeId, hash } = JSON.parse(pendingJoin);
          localStorage.removeItem('pendingGroupJoin');
          
          // Bygg ny URL med parametrarna
          const newUrl = `${window.location.pathname}?group=${groupId}${inviteeId ? `&invitee=${inviteeId}` : ''}${hash || ''}`;
          
          // Omdirigera endast om vi inte redan är på rätt URL
          if (window.location.href !== window.location.origin + newUrl) {
            window.location.replace(newUrl);
          }
        } catch (e) {
          localStorage.removeItem('pendingGroupJoin');
        }
      }
    }
  }, [user]);

  // Indikator för inloggning
  const loginIndicator = (
    <Box sx={{ position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 2000, mb: 0 }}>
      {user ? (
        <Alert severity="success" sx={{ borderRadius: 0 }}>
          Inloggad som {user.email || user.displayName || 'okänd användare'}
        </Alert>
      ) : (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>
          Inte inloggad – logga in för att använda kalenderfunktionerna.
        </Alert>
      )}
    </Box>
  );

  // Animation keyframes injected once
  useEffect(() => {
    if (!document.getElementById('landing-animations')) {
      const style = document.createElement('style');
      style.id = 'landing-animations';
      style.innerHTML = `
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(40px);}
          to { opacity: 1; transform: translateY(0);}
        }
        @keyframes floatCalendar {
          0% { transform: translateY(0) scale(1);}
          50% { transform: translateY(-18px) scale(1.04);}
          100% { transform: translateY(0) scale(1);}
        }
        @keyframes gradientMove {
          0% { background-position: 0% 50%;}
          100% { background-position: 100% 50%;}
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    if (window.location.pathname === '/business-admin' && !user) {
      console.log('[DEBUG] Redirecting to Google-login for business-admin');
      const state = btoa(JSON.stringify({ type: 'business-admin' }));
      window.location.href = `https://www.onebookr.se/auth/google?state=${encodeURIComponent(state)}`;
    }
  }, [user]);

  // Enkel routing - kontrollera business-sidor först
  const path = window.location.pathname;
  if (path === '/business-signup') {
    return <BusinessSignup />;
  }
  if (path === '/business-admin') {
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('auth');
    console.log('[DEBUG] /business-admin, authToken:', authToken);
    if (!user && authToken) {
      try {
        const decoded = JSON.parse(atob(authToken));
        console.log('[DEBUG] Decoded user from authToken:', decoded.user);
        setUser(decoded.user);
        setLoading(false);
        urlParams.delete('auth');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '') + window.location.hash;
        window.history.replaceState({}, '', newUrl);
      } catch (e) {
        console.error('[DEBUG] Error decoding authToken:', e);
        setUser(null);
        setLoading(false);
      }
      return (
        <>{loginIndicator}<Box sx={{ mt: 12, textAlign: 'center' }}><span>Laddar admin...</span></Box></>
      );
    }
    if (!user) {
      console.log('[DEBUG] Ingen user, visar laddar admin...');
      return (<>{loginIndicator}<Box sx={{ mt: 12, textAlign: 'center' }}><span>Laddar admin...</span></Box></>);
    }
    console.log('[DEBUG] Visar BusinessAdmin, user:', user);
    return <BusinessAdmin user={user} />;
  }
  if (path === '/contact') {
    return <Contact />;
  }
  if (path === '/about') {
    return <About />;
  }
  if (path === '/om-oss') {
    return <OmOss />;
  }
  if (path === '/kontakt') {
    return <Kontakt />;
  }
  if (path === '/om-oss') {
    return <OmOss />;
  }
  if (path === '/waitlist') {
    return <Waitlist />;
  }
  if (path === '/admin/waitlist') {
    return <WaitlistAdmin />;
  }
  if (path === '/venue-admin') {
    return <VenueAdmin />;
  }
  if (path.startsWith('/venue/')) {
    return <VenueBooking />;
  }

  // NYTT: Visa laddar tills vi vet om användaren är inloggad
  if (loading) {
    return (
      <>
        {loginIndicator}
        <Box sx={{ mt: 12, textAlign: 'center' }}>
          <span>Laddar...</span>
        </Box>
      </>
    );
  }

  if (!user) {
    // Använd state-parameter för OAuth istället för redirect
    const urlParams = new URLSearchParams(window.location.search);
    const groupId = urlParams.get('group');
    const inviteeId = urlParams.get('invitee');
    // NYTT: Business admin redirect
    if (window.location.pathname === '/business-admin') {
      const state = btoa(JSON.stringify({ type: 'business-admin' }));
      window.location.href = `https://www.onebookr.se/auth/google?state=${encodeURIComponent(state)}`;
      return null;
    }
    let googleLoginUrl = 'https://www.onebookr.se/auth/google';
    if (groupId) {
      const state = btoa(JSON.stringify({ groupId, inviteeId, hash: window.location.hash }));
      googleLoginUrl += `?state=${encodeURIComponent(state)}`;
    }

    return (
      <>
        {loginIndicator}
        <Box
          sx={{
            mt: 8,
            minHeight: '100vh',
            bgcolor: 'transparent',
            background: 'none',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            width: '100vw',
            position: 'absolute',
            left: 0,
            top: 0,
            zIndex: 0,
          }}
        >
          {/* Floating calendar animation background */}
          <Box
            sx={{
              position: 'fixed',
              top: { xs: 60, sm: 80 },
              left: { xs: '50%', sm: '60%' },
              zIndex: 0,
              width: { xs: 180, sm: 260 },
              height: { xs: 180, sm: 260 },
              transform: 'translate(-50%, 0)',
              opacity: 0.18,
              pointerEvents: 'none',
              filter: 'blur(0.5px)',
              animation: 'floatCalendar 4.5s ease-in-out infinite',
              display: { xs: 'none', sm: 'block' },
            }}
          >
            {/* SVG calendar illustration */}
            <svg width="100%" height="100%" viewBox="0 0 260 260" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="20" y="40" width="220" height="180" rx="24" fill="#635bff" fillOpacity="0.13"/>
              <rect x="35" y="60" width="190" height="140" rx="18" fill="#fff" fillOpacity="0.9" />
              <rect x="35" y="60" width="190" height="30" rx="8" fill="#635bff" fillOpacity="0.18"/>
              <rect x="60" y="100" width="30" height="30" rx="6" fill="#635bff" fillOpacity="0.13"/>
              <rect x="105" y="100" width="30" height="30" rx="6" fill="#635bff" fillOpacity="0.13"/>
              <rect x="150" y="100" width="30" height="30" rx="6" fill="#635bff" fillOpacity="0.13"/>
              <rect x="60" y="145" width="30" height="30" rx="6" fill="#635bff" fillOpacity="0.13"/>
              <rect x="105" y="145" width="30" height="30" rx="6" fill="#635bff" fillOpacity="0.13"/>
              <rect x="150" y="145" width="30" height="30" rx="6" fill="#635bff" fillOpacity="0.13"/>
            </svg>
          </Box>
          <Container
            maxWidth={false}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              minHeight: '100vh',
              width: '100vw',
              px: { xs: 2, sm: 3, md: 4 },
              py: 0,
            }}
          >
            {/* BookR Logo */}
            <Box sx={{
              textAlign: 'center',
              mb: 4,
              mt: 10
            }}>
              <Typography sx={{
                fontWeight: 800,
                fontSize: { xs: 24, sm: 28, md: 32 },
                color: '#635bff',
                letterSpacing: 0.5,
                fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
                textShadow: '0 2px 4px rgba(99,91,255,0.2)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': {
                  transform: 'scale(1.05)',
                  textShadow: '0 4px 8px rgba(99,91,255,0.3)'
                }
              }}
              onClick={() => window.location.href = '/'}>
                BookR
              </Typography>
            </Box>
            
            <Paper
              elevation={0}
              sx={{
                p: { xs: 3, sm: 5, md: 7 },
                borderRadius: { xs: 4, sm: 8 },
                mb: 5,
                maxWidth: { xs: '100%', sm: 540 },
                width: '100%',
                mx: 'auto',
                background: 'rgba(255,255,255,0.98)',
                boxShadow: '0 8px 40px 0 rgba(99,91,255,0.10), 0 1.5px 6px 0 rgba(60,64,67,.06)',
                border: '1.5px solid #e3e8ee',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                backdropFilter: 'blur(2px)',
                zIndex: 1,
                animation: 'fadeInUp 0.9s cubic-bezier(.23,1.01,.32,1) both',
              }}
            >
              <CalendarMonthIcon sx={{
                fontSize: 56,
                color: '#635bff',
                mb: 2,
                animation: 'floatCalendar 4.5s ease-in-out infinite',
                filter: 'drop-shadow(0 2px 8px #635bff22)',
              }} />
              <Typography variant="h2" gutterBottom sx={{
                fontWeight: 700,
                letterSpacing: -1.5,
                fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
                color: '#0a2540',
                mb: 1,
                fontSize: { xs: 28, sm: 38 },
                lineHeight: 1.08,
                animation: 'fadeInUp 1.1s 0.1s cubic-bezier(.23,1.01,.32,1) both',
              }}>
                Vi hittar lediga tider för alla
              </Typography>
              <Typography variant="h5" gutterBottom sx={{
                color: '#425466',
                mb: 2,
                fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
                fontWeight: 400,
                fontSize: 20,
                lineHeight: 1.4,
                letterSpacing: -0.5,
                animation: 'fadeInUp 1.2s 0.18s cubic-bezier(.23,1.01,.32,1) both',
              }}>
                Jämför din Google-kalender och hitta era gemensamma lediga tider
              </Typography>
              <hr className="stripe-divider" style={{ width: '100%' }} />
              <Grid container spacing={2} justifyContent="center" sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'center', sm: 'flex-start' } }}>
                    <GroupIcon sx={{ color: 'primary.main', mr: 1 }} />
                    <Typography variant="subtitle1" sx={{ color: 'text.secondary', fontSize: { xs: 14, sm: 16 } }}>
                      Perfekt för grupper, team och vänner
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'center', sm: 'flex-start' } }}>
                    <AccessTimeIcon sx={{ color: 'primary.main', mr: 1 }} />
                    <Typography variant="subtitle1" sx={{ color: 'text.secondary', fontSize: { xs: 14, sm: 16 } }}>
                      Spara tid – slipp kalenderkaoset!
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'center', sm: 'flex-start' } }}>
                    <SecurityIcon sx={{ color: 'primary.main', mr: 1 }} />
                    <Typography variant="subtitle1" sx={{ color: 'text.secondary', fontSize: { xs: 14, sm: 16 } }}>
                      Säker inloggning med Google
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'center', sm: 'flex-start' } }}>
                    <EmojiEventsIcon sx={{ color: 'primary.main', mr: 1 }} />
                    <Typography variant="subtitle1" sx={{ color: 'text.secondary', fontSize: { xs: 14, sm: 16 } }}>
                      Få förslag på bästa mötestider
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
              <Typography variant="body1" sx={{
                color: '#425466',
                mb: 3,
                mt: 2,
                fontSize: 17,
                lineHeight: 1.7,
                fontWeight: 400,
                letterSpacing: -0.2,
                animation: 'fadeInUp 1.3s 0.22s cubic-bezier(.23,1.01,.32,1) both',
              }}>
                BookR hjälper dig och dina vänner eller kollegor att snabbt hitta tider då alla kan. Logga in med Google, bjud in andra och se direkt när ni är lediga samtidigt.
              </Typography>
              <Typography variant="h4" gutterBottom sx={{
                fontWeight: 600,
                color: '#0a2540',
                fontSize: 22,
                mb: 2,
                letterSpacing: -0.5,
                animation: 'fadeInUp 1.4s 0.28s cubic-bezier(.23,1.01,.32,1) both',
              }}>
                {window.location.search.includes('group=') 
                  ? 'Logga in för att jämföra kalendrar' 
                  : 'Välkommen till BookR'}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, fontSize: 14 }}>
                Genom att logga in godkänner du våra{' '}
                <a href="https://www.iubenda.com/villkor-och-bestammelse/71871656" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>användarvillkor</a> och{' '}
                <a href="https://www.iubenda.com/privacy-policy/71871656" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>integritetspolicy</a>
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', alignItems: 'center' }}>
                <Button
                  variant="contained"
                  href={googleLoginUrl}
                  size="large"
                  sx={{
                    px: 6,
                    py: 1.7,
                    fontWeight: 600,
                    fontSize: 18,
                    borderRadius: 4,
                    fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
                    background: '#4285f4',
                    color: 'white',
                    textTransform: 'none',
                    letterSpacing: 0.1,
                    minWidth: 280,
                    '&:hover': {
                      background: '#3367d6',
                    },
                  }}
                >
                  📧 Logga in med Google
                </Button>
                
                <Button
                  variant="contained"
                  href={(() => {
                    let microsoftLoginUrl = 'https://www.onebookr.se/auth/microsoft';
                    if (groupId) {
                      const state = btoa(JSON.stringify({ groupId, inviteeId, hash: window.location.hash }));
                      microsoftLoginUrl += `?state=${encodeURIComponent(state)}`;
                    }
                    return microsoftLoginUrl;
                  })()}
                  size="large"
                  sx={{
                    px: 6,
                    py: 1.7,
                    fontWeight: 600,
                    fontSize: 18,
                    borderRadius: 4,
                    fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
                    background: '#0078d4',
                    color: 'white',
                    textTransform: 'none',
                    letterSpacing: 0.1,
                    minWidth: 280,
                    '&:hover': {
                      background: '#106ebe',
                    },
                  }}
                >
                  🏢 Logga in med Microsoft
                </Button>
                
                <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', mt: 1 }}>
                  Fungerar med Google Kalender, Outlook och Apple Kalender*
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center' }}>
                  *Apple Kalender-användare kan logga in med sitt Google- eller Microsoft-konto
                </Typography>
              </Box>

            </Paper>

            <Box sx={{ maxWidth: 700, width: '100%', mx: 'auto', textAlign: 'center', mb: 4 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Din kalenderdata används endast för att hitta gemensamma lediga tider och delas aldrig vidare.
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                <b>Så fungerar det:</b> <br />
                1. Logga in med Google <br />
                2. Bjud in vänner eller kollegor <br />
                3. Jämför era kalendrar och hitta gemensamma lediga tider <br />
                4. Föreslå och boka möten direkt – med Google Meet-länk!
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
                <b>Tips:</b> Du kan använda BookR för både jobb och fritid. Allt sker säkert och privat.
              </Typography>
            </Box>
            {/* Footer */}
            <Box
              component="footer"
              sx={{
                width: '100%',
                bgcolor: 'transparent',
                textAlign: 'center',
                py: 3,
                mt: 'auto',
                color: 'text.secondary',
                fontSize: 15,
                letterSpacing: 0.2,
                borderTop: '1px solid #e0e3e7',
              }}
            >
              © {new Date().getFullYear()} BookR – Hitta lediga tider tillsammans | 
              <a href="https://www.iubenda.com/privacy-policy/71871656" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2', textDecoration: 'none', margin: '0 8px' }}>Integritetspolicy</a> | 
              <a href="https://www.iubenda.com/villkor-och-bestammelse/71871656" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2', textDecoration: 'none', margin: '0 8px' }}>Användarvillkor</a> | 
              <a href="https://www.iubenda.com/privacy-policy/71871656/cookie-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2', textDecoration: 'none', margin: '0 8px' }}>Cookiepolicy</a> | 
              <a href="mailto:info@onebookr.se" style={{ color: '#1976d2', textDecoration: 'none', margin: '0 8px' }}>info@onebookr.se</a>
            </Box>
          </Container>
        </Box>
      </>
    );
  }



  // Hantera navigation mellan vyer
  const handleNavigateToMeeting = (type) => {
    if (type === 'task') {
      // Navigera till task-vy
      const url = new URL(window.location);
      url.searchParams.set('view', 'task');
      window.history.pushState({}, '', url);
      setCurrentView('task');
    } else {
      setCurrentView('dashboard');
      // Sätt URL-parameter för att indikera mötestyp
      const url = new URL(window.location);
      url.searchParams.set('meetingType', type);
      window.history.pushState({}, '', url);
    }
  };

  // Kontrollera om vi ska visa dashboard direkt (t.ex. vid group-inbjudningar)
  const urlParams = new URLSearchParams(window.location.search);
  const groupId = urlParams.get('group');
  const viewParam = urlParams.get('view');
  const meetingType = urlParams.get('meetingType');
  const shouldShowDashboard = groupId || currentView === 'dashboard' || meetingType;
  const shouldShowTask = viewParam === 'task';

  return (
    <>
      {loginIndicator}
      <Header user={user} onNavigate={handleNavigateToMeeting} />
      <Box sx={{ mt: { xs: 14, sm: 16 }, minHeight: 'calc(100vh - 200px)', px: { xs: 1, sm: 2 }, pb: { xs: 8, sm: 0 } }}>
        {shouldShowTask ? (
          <Task user={user} />
        ) : shouldShowDashboard ? (
          <Dashboard user={user} onNavigateToMeeting={handleNavigateToMeeting} />
        ) : (
          <ShortcutDashboard user={user} onNavigateToMeeting={handleNavigateToMeeting} />
        )}
      </Box>
      {!shouldShowTask && <Footer />}
      <MobileNavigation currentPath={window.location.pathname + window.location.search} user={user} />
    </>
  );
}

export default App;
