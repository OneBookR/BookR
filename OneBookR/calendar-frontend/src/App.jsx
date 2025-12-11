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
import { API_BASE_URL } from './config';

function App() {
  // ✅ ALLA HOOKS ÖVERST - INGEN KONDITIONELL LOGIK
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('bookr_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  
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

  // ✅ USER DATA
  const userData = useMemo(() => ({
    email: user?.email || user?.emails?.[0]?.value || user?.emails?.[0],
    provider: user?.provider || (user?.mail ? 'microsoft' : 'google'),
    accessToken: user?.accessToken,
    isLoggedIn: Boolean(user && user.accessToken)
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

  // ✅ USER PERSISTENCE
  useEffect(() => {
    if (user) {
      localStorage.setItem('bookr_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('bookr_user');
    }
  }, [user]);

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

  // ✅ USER CHECK WITH TOKEN VALIDATION
  useEffect(() => {
    const checkUser = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/user`, {
          credentials: 'include'
        });
        
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          console.log('✅ User authenticated:', data.user.email);
        } else {
          const errorData = await res.json().catch(() => ({}));
          
          // ✅ HANTERA TOKEN EXPIRATION
          if (errorData.code === 'TOKEN_EXPIRED' || errorData.requiresReauth) {
            console.log('🔄 Token expired, clearing user data and forcing re-authentication');
            setUser(null);
            localStorage.removeItem('bookr_user');
            
            // ✅ VISA MEDDELANDE OM TOKEN HAR GÅTT UT
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
    return (
      <Box sx={{ mt: 8, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Container maxWidth="sm">
          <Paper elevation={3} sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, color: '#1976d2' }}>
              Välkommen till BookR
            </Typography>
            
            {params.error && (
              <Alert severity={params.error === 'token_expired' ? 'warning' : 'error'} sx={{ mb: 3 }}>
                {params.error === 'google_auth_failed' && 'Google-inloggning misslyckades. Försök igen.'}
                {params.error === 'microsoft_auth_failed' && 'Microsoft-inloggning misslyckades. Försök igen.'}
                {params.error === 'callback_failed' && 'Inloggning misslyckades. Försök igen.'}
                {params.error === 'token_expired' && 'Din session har gått ut. Logga in igen för att fortsätta.'}
                {!['google_auth_failed', 'microsoft_auth_failed', 'callback_failed', 'token_expired'].includes(params.error) && 'Ett fel uppstod vid inloggning.'}
              </Alert>
            )}
            
            <Typography variant="body1" sx={{ mb: 3, color: '#666' }}>
              Jämför kalendrar och hitta lediga tider enkelt
            </Typography>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Button
                variant="contained"
                href={`${API_BASE_URL}/auth/google`}
                size="large"
                startIcon={<GoogleLogo size={20} />}
                fullWidth
                sx={{ py: 1.5 }}
              >
                Logga in med Google
              </Button>
              
              <Button
                variant="contained"
                href={`${API_BASE_URL}/auth/microsoft`}
                size="large" 
                startIcon={<MicrosoftLogo size={20} />}
                fullWidth
                sx={{ py: 1.5 }}
              >
                Logga in med Microsoft
              </Button>
            </Box>

            {params.error === 'token_expired' && (
              <Typography variant="body2" sx={{ mt: 2, color: '#666', fontStyle: 'italic' }}>
                🔄 Logga in igen för att komma åt kalenderjjämförelsen
              </Typography>
            )}
            
            <Typography variant="caption" sx={{ mt: 2, display: 'block', color: '#666' }}>
              Debug: API_BASE_URL = {API_BASE_URL || 'vite proxy'}
            </Typography>
          </Paper>
        </Container>
      </Box>
    );
  }

  // ✅ MAIN APP
  const shouldShowTask = params.view === 'task' || currentView === 'task';
  const shouldShowDashboard = Boolean(params.groupId || currentView === 'dashboard' || params.meetingType);

  return (
    <>
      {/* ✅ HEADER ALLTID SYNLIG NÄR INLOGGAD */}
      <Header 
        user={user} 
        onNavigate={handleNavigateToMeeting}
        onLeaveGroup={handleLeaveGroup}
      />
      
      {/* Success indicator */}
      <Box sx={{ position: 'fixed', top: 64, left: 0, width: '100%', zIndex: 1000 }}>
        <Alert severity="success" sx={{ borderRadius: 0, py: 0.5 }}>
          <Typography variant="caption">
            Inloggad som {userData.email || 'okänd användare'}
          </Typography>
        </Alert>
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
      <MobileNavigation currentPath={window.location.pathname + window.location.search} user={user} />
    </>
  );
}

export default App;
