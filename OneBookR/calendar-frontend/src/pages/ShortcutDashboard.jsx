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
      {/* Clean Banner */}
      <Box sx={{
        background: '#1976d2',
        borderRadius: 2,
        p: 4,
        mb: 6,
        color: 'white',
        textAlign: 'center',
        boxShadow: '0 2px 8px rgba(25, 118, 210, 0.2)'
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
            height: 120, 
            cursor: 'pointer', 
            bgcolor: '#1976d2',
            color: 'white',
            borderRadius: 2,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.2s ease',
            '&:hover': { 
              transform: 'translateY(-2px)',
              boxShadow: '0 4px 16px rgba(25, 118, 210, 0.3)'
            }
          }} 
                onClick={() => window.location.href = '/compare'}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
              <PersonIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>1v1 Meeting</Typography>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Jämför kalendrar</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ 
            height: 120, 
            cursor: 'pointer', 
            bgcolor: '#1976d2',
            color: 'white',
            borderRadius: 2,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.2s ease',
            '&:hover': { 
              transform: 'translateY(-2px)',
              boxShadow: '0 4px 16px rgba(25, 118, 210, 0.3)'
            }
          }} 
                onClick={() => window.location.href = '/compare'}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
              <GroupIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Group Meeting</Typography>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Bjud in flera</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ 
            height: 120, 
            cursor: 'pointer', 
            bgcolor: '#757575',
            color: 'white',
            borderRadius: 2,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.2s ease',
            '&:hover': { 
              transform: 'translateY(-2px)',
              boxShadow: '0 4px 16px rgba(117, 117, 117, 0.3)'
            }
          }} 
                onClick={() => onNavigateToMeeting('task')}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
              <TaskIcon sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Create Task</Typography>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Schemalägg tid</Typography>
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
            bgcolor: '#f5f5f5',
            borderRadius: 2,
            p: 2,
            mb: 2,
            textAlign: 'center'
          }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#333' }}>Inbjudningar</Typography>
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
            bgcolor: '#f5f5f5',
            borderRadius: 2,
            p: 2,
            mb: 2,
            textAlign: 'center'
          }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#333' }}>Kommande möten</Typography>
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