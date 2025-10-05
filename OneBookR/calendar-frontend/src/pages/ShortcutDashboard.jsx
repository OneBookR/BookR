import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Button, Card, CardContent, Grid, Chip } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EventIcon from '@mui/icons-material/Event';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LogoutIcon from '@mui/icons-material/Logout';
import TaskIcon from '@mui/icons-material/Task';
import InvitationSidebar from './InvitationSidebar.jsx';

export default function ShortcutDashboard({ user, onNavigateToMeeting }) {
  const [invites, setInvites] = useState([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);

  useEffect(() => {
    if (!user?.email) return;
    
    // Hämta invites från samma endpoint som InvitationSidebar
    fetch(`https://www.onebookr.se/api/invitations/${encodeURIComponent(user.email)}`)
    .then(res => res.json())
    .then(data => setInvites((data.invitations || []).filter(inv => !inv.responded)))
    .catch(err => console.log('Failed to fetch invites:', err));

    // Hämta upcoming meetings från Google Calendar
    if (user.accessToken) {
      fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${new Date().toISOString()}&maxResults=5&singleEvents=true&orderBy=startTime`, {
        headers: { 'Authorization': `Bearer ${user.accessToken}` }
      })
      .then(res => res.json())
      .then(data => setUpcomingMeetings(data.items || []))
      .catch(err => console.log('Failed to fetch calendar events:', err));
    }
  }, [user?.email]);

  const handleInviteResponse = (groupId, inviteeId, response) => {
    if (response === 'accept') {
      window.location.href = `/?group=${groupId}&invitee=${inviteeId}`;
    } else {
      // För decline, uppdatera invitation som responded
      fetch(`https://www.onebookr.se/api/invitation/${inviteeId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: 'decline' })
      })
      .then(() => {
        setInvites(prev => prev.filter(invite => invite.inviteeId !== inviteeId));
      })
      .catch(err => console.log('Failed to decline invite:', err));
    }
  };

  const formatDateTime = (dateTime) => {
    if (!dateTime) return '';
    const date = new Date(dateTime.dateTime || dateTime);
    return date.toLocaleDateString('sv-SE') + ' ' + date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      <InvitationSidebar user={user} />
      <Button
        variant="outlined"
        startIcon={<LogoutIcon />}
        onClick={() => window.location.href = 'https://www.onebookr.se/auth/logout'}
        sx={{
          position: 'fixed',
          top: 80,
          left: 20,
          zIndex: 1000,
          borderColor: '#635bff',
          color: '#635bff',
          borderRadius: 2,
          fontWeight: 600,
          '&:hover': {
            borderColor: '#7a5af8',
            color: '#7a5af8',
            bgcolor: 'rgba(99,91,255,0.05)'
          }
        }}
      >
        Logga ut
      </Button>
      <Container maxWidth="lg" sx={{ mt: 12, mb: 4, px: { xs: 2, sm: 3 } }}>
      {/* Clean Banner */}
      <Box sx={{
        background: 'rgba(255,255,255,0.98)',
        borderRadius: 3,
        p: 4,
        mb: 6,
        textAlign: 'center',
        boxShadow: '0 8px 40px 0 rgba(99,91,255,0.10), 0 1.5px 6px 0 rgba(60,64,67,.06)',
        border: '1.5px solid #e3e8ee'
      }}>
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Typography variant="h3" sx={{ 
            fontWeight: 700,
            letterSpacing: -1.5,
            fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
            color: '#0a2540',
            mb: 1,
            fontSize: { xs: 28, md: 36 },
            lineHeight: 1.08
          }}>
            BookR Dashboard
          </Typography>
          <Typography variant="h6" sx={{ 
            color: '#425466',
            fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
            fontWeight: 400,
            fontSize: { xs: 16, md: 18 },
            lineHeight: 1.4,
            letterSpacing: -0.5
          }}>
            Välj vad du vill göra - hitta lediga tider eller skapa uppgifter
          </Typography>
        </Box>
      </Box>

      {/* Moderna action cards */}
      <Grid container spacing={{ xs: 3, md: 4 }} sx={{ mb: 6, px: { xs: 1, sm: 0 } }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ 
            height: 190, 
            cursor: 'pointer', 
            background: 'rgba(255,255,255,0.98)',
            borderRadius: 3,
            boxShadow: '0 8px 40px 0 rgba(99,91,255,0.10), 0 1.5px 6px 0 rgba(60,64,67,.06)',
            border: '1.5px solid #e3e8ee',
            transition: 'all 0.3s ease',
            '&:hover': { 
              transform: 'translateY(-4px)',
              boxShadow: '0 12px 50px 0 rgba(99,91,255,0.15), 0 2px 8px 0 rgba(60,64,67,.08)'
            }
          }} 
                onClick={() => onNavigateToMeeting('1v1')}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, textAlign: 'center', p: 3 }}>
              <PersonIcon sx={{ fontSize: 48, color: '#635bff' }} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#0a2540', mb: 0.5, fontSize: 18 }}>1v1 Meeting</Typography>
                <Typography variant="body2" sx={{ color: '#425466', fontSize: 14, lineHeight: 1.4 }}>Jämför kalendrar och hitta ledig tid</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ 
            height: 190, 
            cursor: 'pointer', 
            background: 'rgba(255,255,255,0.98)',
            borderRadius: 3,
            boxShadow: '0 8px 40px 0 rgba(99,91,255,0.10), 0 1.5px 6px 0 rgba(60,64,67,.06)',
            border: '1.5px solid #e3e8ee',
            transition: 'all 0.3s ease',
            '&:hover': { 
              transform: 'translateY(-4px)',
              boxShadow: '0 12px 50px 0 rgba(99,91,255,0.15), 0 2px 8px 0 rgba(60,64,67,.08)'
            }
          }} 
                onClick={() => onNavigateToMeeting('group')}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, textAlign: 'center', p: 3 }}>
              <GroupIcon sx={{ fontSize: 48, color: '#635bff' }} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#0a2540', mb: 0.5, fontSize: 18 }}>Group Meeting</Typography>
                <Typography variant="body2" sx={{ color: '#425466', fontSize: 14, lineHeight: 1.4 }}>Bjud in flera och hitta gemensam tid</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ 
            height: 190, 
            cursor: 'pointer', 
            background: 'rgba(255,255,255,0.98)',
            borderRadius: 3,
            boxShadow: '0 8px 40px 0 rgba(99,91,255,0.10), 0 1.5px 6px 0 rgba(60,64,67,.06)',
            border: '1.5px solid #e3e8ee',
            transition: 'all 0.3s ease',
            '&:hover': { 
              transform: 'translateY(-4px)',
              boxShadow: '0 12px 50px 0 rgba(99,91,255,0.15), 0 2px 8px 0 rgba(60,64,67,.08)'
            }
          }} 
                onClick={() => onNavigateToMeeting('task')}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, textAlign: 'center', p: 3 }}>
              <TaskIcon sx={{ fontSize: 48, color: '#635bff' }} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#0a2540', mb: 0.5, fontSize: 18 }}>Create Task</Typography>
                <Typography variant="body2" sx={{ color: '#425466', fontSize: 14, lineHeight: 1.4 }}>Schemalägg tid för uppgifter</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Invites och Upcoming Meetings med förbättrad design */}
      <Grid container spacing={{ xs: 3, md: 4 }} sx={{ px: { xs: 1, sm: 0 } }}>
        {/* Invites sektion */}
        <Grid item xs={12} md={6}>
          <Typography variant="h5" sx={{ 
            mb: 3, 
            fontWeight: 600,
            color: '#0a2540',
            fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif"
          }}>Inbjudningar</Typography>
          {invites.length === 0 ? (
            <Card sx={{ 
              p: 3, 
              textAlign: 'center', 
              background: 'rgba(255,255,255,0.98)',
              borderRadius: 3,
              boxShadow: '0 8px 40px 0 rgba(99,91,255,0.10), 0 1.5px 6px 0 rgba(60,64,67,.06)',
              border: '1.5px solid #e3e8ee'
            }}>
              <Typography sx={{ color: '#425466', fontWeight: 400 }}>Inga inbjudningar just nu</Typography>
            </Card>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {invites.map((invite, index) => (
                <Card key={index} sx={{ 
                  p: 3, 
                  borderRadius: 3,
                  background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.12)'
                  }
                }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        Inbjudan från {invite.fromEmail}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        Kalenderjämförelse • {new Date(invite.createdAt).toLocaleDateString()}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Grupp: {invite.groupName || 'Namnlös grupp'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button 
                        size="small" 
                        variant="outlined" 
                        startIcon={<CloseIcon />}
                        onClick={() => handleInviteResponse(invite.groupId, invite.inviteeId, 'decline')}
                        sx={{
                          borderColor: '#635bff',
                          color: '#635bff',
                          borderRadius: 2,
                          fontWeight: 600,
                          '&:hover': {
                            borderColor: '#7a5af8',
                            color: '#7a5af8',
                            bgcolor: 'rgba(99,91,255,0.05)'
                          }
                        }}
                      >
                        Neka
                      </Button>
                      <Button 
                        size="small" 
                        variant="contained" 
                        startIcon={<CheckIcon />}
                        onClick={() => handleInviteResponse(invite.groupId, invite.inviteeId, 'accept')}
                        sx={{
                          background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                          color: 'white',
                          borderRadius: 2,
                          fontWeight: 600,
                          boxShadow: '0 2px 16px 0 rgba(99,91,255,0.13)',
                          '&:hover': {
                            background: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)',
                            boxShadow: '0 0 0 4px #e9e5ff, 0 8px 32px 0 rgba(99,91,255,0.18)'
                          }
                        }}
                      >
                        Acceptera
                      </Button>
                    </Box>
                  </Box>
                </Card>
              ))}
            </Box>
          )}
        </Grid>

        {/* Upcoming Meetings sektion */}
        <Grid item xs={12} md={6}>
          <Typography variant="h5" sx={{ 
            mb: 3, 
            fontWeight: 600,
            color: '#0a2540',
            fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif"
          }}>Kommande möten</Typography>
          {upcomingMeetings.length === 0 ? (
            <Card sx={{ 
              p: 3, 
              textAlign: 'center', 
              background: 'rgba(255,255,255,0.98)',
              borderRadius: 3,
              boxShadow: '0 8px 40px 0 rgba(99,91,255,0.10), 0 1.5px 6px 0 rgba(60,64,67,.06)',
              border: '1.5px solid #e3e8ee'
            }}>
              <Typography sx={{ color: '#425466', fontWeight: 400 }}>Inga kommande möten</Typography>
            </Card>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {upcomingMeetings.slice(0, 3).map((meeting) => (
                <Card key={meeting.id} sx={{ 
                  p: 3, 
                  borderRadius: 3,
                  background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.12)'
                  }
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                    <EventIcon sx={{ color: '#1976d2', mt: 0.5 }} />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {meeting.summary || 'Untitled Meeting'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        30 min • {formatDateTime(meeting.start)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {meeting.organizer?.displayName || meeting.organizer?.email || 'Unknown organizer'}
                      </Typography>
                    </Box>
                    <Chip 
                      label="24 min" 
                      size="small" 
                      sx={{ bgcolor: '#fff3e0', color: '#e65100' }}
                    />
                  </Box>
                </Card>
              ))}
            </Box>
          )}
        </Grid>
      </Grid>
      </Container>
    </>
  );
}