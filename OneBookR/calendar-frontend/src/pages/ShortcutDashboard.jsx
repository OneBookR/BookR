import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Button, Card, CardContent, Grid, Chip } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EventIcon from '@mui/icons-material/Event';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LogoutIcon from '@mui/icons-material/Logout';
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
          zIndex: 1000
        }}
      >
        Logga ut
      </Button>
      <Container maxWidth="lg" sx={{ mt: 12, mb: 4 }}>
      <Typography variant="h4" sx={{ mb: 4, textAlign: 'center', fontWeight: 600 }}>
        BookR
      </Typography>

      {/* Stora knappar för att skapa möten */}
      <Grid container spacing={3} sx={{ mb: 6 }}>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: 120, cursor: 'pointer', '&:hover': { boxShadow: 4 } }} 
                onClick={() => onNavigateToMeeting('1v1')}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
              <PersonIcon sx={{ fontSize: 40, color: '#1976d2' }} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>New 1v1 Meeting</Typography>
                <Typography variant="body2" color="text.secondary">Create an invite to a 1v1 meeting</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: 120, cursor: 'pointer', '&:hover': { boxShadow: 4 } }} 
                onClick={() => onNavigateToMeeting('group')}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
              <GroupIcon sx={{ fontSize: 40, color: '#1976d2' }} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Group Meeting</Typography>
                <Typography variant="body2" color="text.secondary">Create an invite to a 2+ meeting</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Invites och Upcoming Meetings */}
      <Grid container spacing={4}>
        {/* Invites sektion */}
        <Grid item xs={12} md={6}>
          <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>Invites</Typography>
          {invites.length === 0 ? (
            <Card sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">Inga inbjudningar just nu</Typography>
            </Card>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {invites.map((invite, index) => (
                <Card key={index} sx={{ p: 2 }}>
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
                      >
                        Deny
                      </Button>
                      <Button 
                        size="small" 
                        variant="contained" 
                        startIcon={<CheckIcon />}
                        onClick={() => handleInviteResponse(invite.groupId, invite.inviteeId, 'accept')}
                      >
                        Accept
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
          <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>Upcoming meetings</Typography>
          {upcomingMeetings.length === 0 ? (
            <Card sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">Inga kommande möten</Typography>
            </Card>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {upcomingMeetings.slice(0, 3).map((meeting) => (
                <Card key={meeting.id} sx={{ p: 2 }}>
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