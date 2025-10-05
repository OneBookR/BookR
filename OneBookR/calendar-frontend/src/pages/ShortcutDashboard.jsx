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
        variant="contained"
        startIcon={<LogoutIcon />}
        onClick={() => window.location.href = 'https://www.onebookr.se/auth/logout'}
        sx={{
          position: 'fixed',
          top: 80,
          left: 20,
          zIndex: 1000,
          background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)',
          color: 'white',
          borderRadius: 3,
          boxShadow: '0 4px 15px rgba(255, 107, 107, 0.3)',
          fontWeight: 600,
          '&:hover': {
            background: 'linear-gradient(135deg, #ee5a24 0%, #ff6b6b 100%)',
            transform: 'translateY(-2px)',
            boxShadow: '0 6px 20px rgba(255, 107, 107, 0.4)'
          }
        }}
      >
        Logga ut
      </Button>
      <Container maxWidth="lg" sx={{ mt: 12, mb: 4, px: { xs: 2, sm: 3 } }}>
      {/* Modern Banner */}
      <Box sx={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: 4,
        p: 4,
        mb: 6,
        color: 'white',
        textAlign: 'center',
        boxShadow: '0 8px 32px rgba(102, 126, 234, 0.3)',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23ffffff" fill-opacity="0.05"%3E%3Ccircle cx="30" cy="30" r="4"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
          opacity: 0.3
        }
      }}>
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Typography variant="h3" sx={{ 
            fontWeight: 800, 
            mb: 2, 
            fontSize: { xs: 28, md: 36 },
            textShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            BookR Dashboard
          </Typography>
          <Typography variant="h6" sx={{ 
            opacity: 0.95, 
            fontWeight: 400,
            fontSize: { xs: 16, md: 18 }
          }}>
            Välj vad du vill göra - hitta lediga tider eller skapa uppgifter
          </Typography>
        </Box>
      </Box>

      {/* Moderna action cards */}
      <Grid container spacing={{ xs: 3, md: 4 }} sx={{ mb: 6, px: { xs: 1, sm: 0 } }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ 
            height: 140, 
            cursor: 'pointer', 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            borderRadius: 3,
            boxShadow: '0 4px 20px rgba(102, 126, 234, 0.3)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': { 
              transform: 'translateY(-8px) scale(1.02)',
              boxShadow: '0 12px 40px rgba(102, 126, 234, 0.4)'
            }
          }} 
                onClick={() => window.location.href = '/compare'}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, textAlign: 'center' }}>
              <PersonIcon sx={{ fontSize: 48, color: 'white', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18, mb: 0.5 }}>1v1 Meeting</Typography>
                <Typography variant="body2" sx={{ opacity: 0.9, fontSize: 13 }}>Jämför kalendrar och hitta ledig tid</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ 
            height: 140, 
            cursor: 'pointer', 
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            color: 'white',
            borderRadius: 3,
            boxShadow: '0 4px 20px rgba(240, 147, 251, 0.3)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': { 
              transform: 'translateY(-8px) scale(1.02)',
              boxShadow: '0 12px 40px rgba(240, 147, 251, 0.4)'
            }
          }} 
                onClick={() => window.location.href = '/compare'}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, textAlign: 'center' }}>
              <GroupIcon sx={{ fontSize: 48, color: 'white', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18, mb: 0.5 }}>Group Meeting</Typography>
                <Typography variant="body2" sx={{ opacity: 0.9, fontSize: 13 }}>Bjud in flera och hitta gemensam tid</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ 
            height: 140, 
            cursor: 'pointer', 
            background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            color: 'white',
            borderRadius: 3,
            boxShadow: '0 4px 20px rgba(79, 172, 254, 0.3)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': { 
              transform: 'translateY(-8px) scale(1.02)',
              boxShadow: '0 12px 40px rgba(79, 172, 254, 0.4)'
            }
          }} 
                onClick={() => onNavigateToMeeting('task')}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, textAlign: 'center' }}>
              <TaskIcon sx={{ fontSize: 48, color: 'white', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18, mb: 0.5 }}>Create Task</Typography>
                <Typography variant="body2" sx={{ opacity: 0.9, fontSize: 13 }}>Schemalägg tid för uppgifter</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Invites och Upcoming Meetings med förbättrad design */}
      <Grid container spacing={{ xs: 3, md: 4 }} sx={{ px: { xs: 1, sm: 0 } }}>
        {/* Invites sektion */}
        <Grid item xs={12} md={6}>
          <Box sx={{ 
            background: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
            borderRadius: 3,
            p: 3,
            mb: 2,
            color: 'white',
            textAlign: 'center'
          }}>
            <Typography variant="h5" sx={{ fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>Inbjudningar</Typography>
          </Box>
          {invites.length === 0 ? (
            <Card sx={{ 
              p: 4, 
              textAlign: 'center', 
              borderRadius: 3,
              background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
              border: 'none',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
            }}>
              <Typography sx={{ color: '#666', fontWeight: 500 }}>Inga inbjudningar just nu</Typography>
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
                        variant="contained" 
                        startIcon={<CloseIcon />}
                        onClick={() => handleInviteResponse(invite.groupId, invite.inviteeId, 'decline')}
                        sx={{
                          background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)',
                          color: 'white',
                          borderRadius: 2,
                          fontWeight: 600,
                          '&:hover': {
                            background: 'linear-gradient(135deg, #ee5a24 0%, #ff6b6b 100%)',
                            transform: 'scale(1.05)'
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
                          background: 'linear-gradient(135deg, #51cf66 0%, #40c057 100%)',
                          color: 'white',
                          borderRadius: 2,
                          fontWeight: 600,
                          '&:hover': {
                            background: 'linear-gradient(135deg, #40c057 0%, #51cf66 100%)',
                            transform: 'scale(1.05)'
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
          <Box sx={{ 
            background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
            borderRadius: 3,
            p: 3,
            mb: 2,
            color: 'white',
            textAlign: 'center'
          }}>
            <Typography variant="h5" sx={{ fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>Kommande möten</Typography>
          </Box>
          {upcomingMeetings.length === 0 ? (
            <Card sx={{ 
              p: 4, 
              textAlign: 'center', 
              borderRadius: 3,
              background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
              border: 'none',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
            }}>
              <Typography sx={{ color: '#666', fontWeight: 500 }}>Inga kommande möten</Typography>
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