import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Button, Paper, 
  Alert, Snackbar, Card, CardContent, Divider, Grid
} from '@mui/material';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { API_BASE_URL } from '../config';

const localizer = momentLocalizer(moment);

const BusinessAdmin = () => {
  const [business, setBusiness] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [meetings, setMeetings] = useState([]);

  useEffect(() => {
    // Kolla om användaren är inloggad
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('auth');
    console.log('[DEBUG][BusinessAdmin] authToken:', authToken);
    
    if (authToken) {
      try {
        const decoded = JSON.parse(atob(authToken));
        console.log('[DEBUG][BusinessAdmin] Decoded user:', decoded.user);
        setUser(decoded.user);
        
        // Rensa auth-parameter
        urlParams.delete('auth');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, '', newUrl);
      } catch (e) {
        console.error('Fel vid dekodning av auth token:', e);
      }
    } else {
      // Försök hämta från session
      fetch(`${API_BASE_URL}/api/user`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          console.log('[DEBUG][BusinessAdmin] Fetched user from session:', data?.user);
          if (data && data.user) {
            setUser(data.user);
          }
        })
        .catch(() => {});
    }
    
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) {
      // Hämta företagsinformation för inloggad användare
      const userEmail = user.email || user.emails?.[0]?.value;
      console.log('[DEBUG][BusinessAdmin] Fetching business for email:', userEmail);
      
      fetch(`${API_BASE_URL}/api/business/by-email/${encodeURIComponent(userEmail)}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          console.log('[DEBUG][BusinessAdmin] Fetched business:', data?.business);
          if (data && data.business) {
            setBusiness(data.business);
          }
        })
        .catch(() => {
          // Inget företag hittat - låt business vara null
          setBusiness(null);
        });
    }
  }, [user]);
  
  // Hämta möten när business är laddat
  useEffect(() => {
    if (business?.bookingCode) {
      console.log('[DEBUG][BusinessAdmin] Fetching meetings for bookingCode:', business.bookingCode);
      fetch(`${API_BASE_URL}/api/business/${business.bookingCode}/meetings`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          console.log('[DEBUG][BusinessAdmin] Fetched meetings:', data?.meetings);
          if (data && data.meetings) {
            setMeetings(data.meetings);
          }
        })
        .catch(() => {});
    }
  }, [business]);

  const bookingUrl = business ? `https://www.onebookr.se/book/${business.bookingCode}` : '';

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setToast({ open: true, message: 'Kopierat! 📋', severity: 'success' });
  };

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 10 }}>
        <Typography>Laddar...</Typography>
      </Container>
    );
  }

  if (!user) {
    return (
      <Container maxWidth="md" sx={{ mt: 10 }}>
        <Alert severity="warning">
          Du måste logga in för att komma åt admin-panelen.
          <Button 
            onClick={() => {
              const state = btoa(JSON.stringify({ type: 'business-admin' }));
              window.location.href = `https://www.onebookr.se/auth/google?state=${encodeURIComponent(state)}`;
            }}
            sx={{ ml: 2 }}
          >
            Logga in
          </Button>
        </Alert>
      </Container>
    );
  }

  if (!business) {
    return (
      <Container maxWidth="md" sx={{ mt: 10 }}>
        <Alert severity="warning" sx={{ mb: 3 }}>
          Detta konto finns inte som registrerat företag.
        </Alert>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Vill du registrera dig som företag?
          </Typography>
          <Button 
            variant="contained" 
            href="/business-signup"
            sx={{ mr: 2 }}
          >
            Registrera företag
          </Button>
          <Button 
            variant="outlined" 
            href="/"
          >
            Tillbaka till startsidan
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', py: 8 }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h3" sx={{
            fontSize: { xs: '2.5rem', md: '3.5rem' },
            fontWeight: 700,
            color: '#0a2540',
            mb: 2,
            fontFamily: "'Inter', 'Segoe UI', 'Roboto', sans-serif"
          }}>
            Admin Dashboard
          </Typography>
          <Typography variant="h6" sx={{
            color: '#425466',
            fontWeight: 400
          }}>
            {business.companyName}
          </Typography>
          <Typography variant="body2" sx={{ color: '#666', mt: 1 }}>
            Inloggad som: {user.email || user.displayName} 🟢 Google-kalender ansluten
          </Typography>
        </Box>

        {/* Bokningskod och länk */}
        <Paper sx={{
          p: 6,
          borderRadius: 4,
          boxShadow: '0 12px 48px rgba(99,91,255,0.15)',
          border: '1px solid #e3e8ff',
          mb: 4
        }}>
          <Typography variant="h5" sx={{ 
            color: '#0a2540', 
            fontWeight: 600, 
            mb: 3,
            textAlign: 'center'
          }}>
            🔗 Din bokningslänk
          </Typography>
          
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Typography variant="h6" sx={{ color: '#666', mb: 2 }}>
              Bokningskod:
            </Typography>
            <Box sx={{
              bgcolor: '#f8f9ff',
              border: '2px solid #635bff',
              borderRadius: 3,
              p: 2,
              mb: 3,
              display: 'inline-block'
            }}>
              <Typography variant="h4" sx={{
                color: '#635bff',
                fontWeight: 800,
                letterSpacing: 2,
                fontFamily: 'monospace'
              }}>
                {business.bookingCode}
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 3 }} />

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h6" sx={{ color: '#666', mb: 2 }}>
              Fullständig bokningslänk:
            </Typography>
            <Box sx={{
              bgcolor: '#f8f9ff',
              border: '1px solid #e3e8ff',
              borderRadius: 2,
              p: 2,
              mb: 3,
              wordBreak: 'break-all'
            }}>
              <Typography variant="body1" sx={{
                color: '#635bff',
                fontWeight: 500,
                fontFamily: 'monospace'
              }}>
                {bookingUrl}
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                onClick={() => copyToClipboard(bookingUrl)}
                sx={{
                  background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                  fontWeight: 600,
                  borderRadius: 3
                }}
              >
                📋 Kopiera länk
              </Button>
              
              <Button
                variant="outlined"
                onClick={() => window.open(bookingUrl, '_blank')}
                sx={{
                  borderColor: '#635bff',
                  color: '#635bff',
                  fontWeight: 600,
                  borderRadius: 3
                }}
              >
                🔗 Testa länk
              </Button>
            </Box>
          </Box>
        </Paper>

        {/* Instruktioner */}
        <Paper sx={{
          p: 4,
          borderRadius: 4,
          border: '1px solid #e3e8ff'
        }}>
          <Typography variant="h6" sx={{ 
            color: '#0a2540', 
            fontWeight: 600, 
            mb: 3
          }}>
            📖 Så använder du din bokningslänk
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body1" sx={{ color: '#425466' }}>
              <strong>1.</strong> Lägg till länken på din hemsida som en knapp eller länk
            </Typography>
            <Typography variant="body1" sx={{ color: '#425466' }}>
              <strong>2.</strong> Kunder klickar på länken och loggar in med Google
            </Typography>
            <Typography variant="body1" sx={{ color: '#425466' }}>
              <strong>3.</strong> BookR jämför era kalendrar och visar lediga tider
            </Typography>
            <Typography variant="body1" sx={{ color: '#425466' }}>
              <strong>4.</strong> Kunden väljer tid - mötet skapas automatiskt i båda era kalendrar!
            </Typography>
          </Box>
          
          <Box sx={{ mt: 4, p: 3, bgcolor: '#f8f9ff', borderRadius: 2 }}>
            <Typography variant="body2" sx={{ color: '#666', fontStyle: 'italic' }}>
              💡 Tips: Skapa en knapp på din hemsida med texten "Boka tid" som länkar till din BookR-länk
            </Typography>
          </Box>
        </Paper>
        
        {/* Möteskalender */}
        <Paper sx={{
          p: 4,
          borderRadius: 4,
          border: '1px solid #e3e8ff',
          mt: 4
        }}>
          <Typography variant="h6" sx={{ 
            color: '#0a2540', 
            fontWeight: 600, 
            mb: 3
          }}>
            📅 Dina bokade möten
          </Typography>
          
          {meetings.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography sx={{ color: '#666' }}>
                Inga möten bokade ännu. När kunder bokar tider via din länk visas de här.
              </Typography>
            </Box>
          ) : (
            <>
              <Box sx={{ height: 400, mb: 4 }}>
                <Calendar
                  localizer={localizer}
                  events={meetings.map(meeting => ({
                    ...meeting,
                    start: new Date(meeting.start),
                    end: new Date(meeting.end)
                  }))}
                  startAccessor="start"
                  endAccessor="end"
                  titleAccessor="title"
                  style={{ height: '100%' }}
                  views={['month', 'week', 'day']}
                  defaultView="week"
                />
              </Box>
              
              <Typography variant="h6" sx={{ mb: 2, color: '#0a2540' }}>
                Kommande möten
              </Typography>
              <Grid container spacing={2}>
                {meetings.map(meeting => (
                  <Grid item xs={12} md={6} key={meeting.id}>
                    <Card sx={{ border: '1px solid #e3e8ff' }}>
                      <CardContent>
                        <Typography variant="h6" sx={{ mb: 1 }}>
                          {meeting.title}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#666', mb: 1 }}>
                          📅 {new Date(meeting.start).toLocaleString('sv-SE')}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#666', mb: 1 }}>
                          📧 {meeting.clientEmail}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#666' }}>
                          📍 {meeting.location}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </>
          )}
        </Paper>
      </Container>

      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast({ ...toast, open: false })}
      >
        <Alert severity={toast.severity} onClose={() => setToast({ ...toast, open: false })}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default BusinessAdmin;