import React, { useEffect, useState } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import Contact from './pages/Contact.jsx';
import About from './pages/About.jsx';
import { Container, Typography, Button, Box, Alert, Paper, Divider, Grid } from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import GroupIcon from '@mui/icons-material/Group';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SecurityIcon from '@mui/icons-material/Security';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';

function App() {
  const [user, setUser] = useState(null);

  // Spara URL-parametrar i localStorage om det finns group-parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const groupId = urlParams.get('group');
    const inviteeId = urlParams.get('invitee');
    
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
    fetch('http://localhost:3000/api/user', {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUser(data.user);
        }
      })
      .catch(err => {
        console.error('Kunde inte hämta användardata:', err);
      });
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

  // Enkel routing
  const path = window.location.pathname;
  if (path === '/contact') {
    return <Contact />;
  }
  if (path === '/about') {
    return <About />;
  }

  if (!user) {
    // Använd state-parameter för OAuth istället för redirect
    const urlParams = new URLSearchParams(window.location.search);
    const groupId = urlParams.get('group');
    const inviteeId = urlParams.get('invitee');
    
    let googleLoginUrl = 'http://localhost:3000/auth/google';
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
              px: { xs: 0, md: 4 },
              py: 0,
            }}
          >
            <Paper
              elevation={0}
              sx={{
                p: { xs: 4, sm: 7, md: 9 },
                borderRadius: 8,
                mb: 5,
                mt: 10,
                maxWidth: 540,
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
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                    <GroupIcon sx={{ color: 'primary.main', mr: 1 }} />
                    <Typography variant="subtitle1" sx={{ color: 'text.secondary' }}>
                      Perfekt för grupper, team och vänner
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                    <AccessTimeIcon sx={{ color: 'primary.main', mr: 1 }} />
                    <Typography variant="subtitle1" sx={{ color: 'text.secondary' }}>
                      Spara tid – slipp kalenderkaoset!
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                    <SecurityIcon sx={{ color: 'primary.main', mr: 1 }} />
                    <Typography variant="subtitle1" sx={{ color: 'text.secondary' }}>
                      Säker inloggning med Google
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                    <EmojiEventsIcon sx={{ color: 'primary.main', mr: 1 }} />
                    <Typography variant="subtitle1" sx={{ color: 'text.secondary' }}>
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
              <Button
                variant="contained"
                color="primary"
                href={googleLoginUrl}
                size="large"
                sx={{
                  mt: 2,
                  px: 6,
                  py: 1.7,
                  fontWeight: 600,
                  fontSize: 18,
                  borderRadius: 4,
                  fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
                  background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                  boxShadow: '0 2px 16px 0 rgba(99,91,255,0.13), 0 0.5px 2px 0 rgba(60,64,67,.06)',
                  transition: 'box-shadow 0.2s, background 0.2s',
                  textTransform: 'none',
                  letterSpacing: 0.1,
                  animation: 'fadeInUp 1.5s 0.38s cubic-bezier(.23,1.01,.32,1) both',
                  '&:hover': {
                    background: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)',
                    boxShadow: '0 0 0 4px #e9e5ff, 0 8px 32px 0 rgba(99,91,255,0.18)',
                  },
                }}
              >
                Logga in med Google
              </Button>
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
              © {new Date().getFullYear()} BookR – Hitta lediga tider tillsammans | <a href="mailto:support@bookr.se" style={{ color: '#1976d2', textDecoration: 'none' }}>support@bookr.se</a>

            </Box>
          </Container>
        </Box>
      </>
    );
  }

  return (
    <>
      {loginIndicator}
      <Box sx={{ mt: 12 }} /> {/* Lägg till marginal under indikatorn */}
      <Dashboard user={user} />
    </>
  );
}

export default App;
