import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Button, Card, CardContent, Grid, Chip, IconButton, Badge, Paper, Snackbar, Alert } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EventIcon from '@mui/icons-material/Event';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LogoutIcon from '@mui/icons-material/Logout';
import TaskIcon from '@mui/icons-material/Task';
import NotificationsIcon from '@mui/icons-material/Notifications';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import InvitationSidebar from './InvitationSidebar.jsx';

export default function ShortcutDashboard({ user, onNavigateToMeeting }) {
  const [invites, setInvites] = useState([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const [timeProposals, setTimeProposals] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('invitations');
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    if (!user?.email) return;
    
    // Hämta invites från samma endpoint som InvitationSidebar
    fetch(`https://www.onebookr.se/api/invitations/${encodeURIComponent(user.email)}`)
    .then(res => res.json())
    .then(data => setInvites((data.invitations || []).filter(inv => !inv.responded)))
    .catch(err => console.log('Failed to fetch invites:', err));

    // Hämta upcoming meetings från Google Calendar (endast möten med Google Meet länk)
    if (user.accessToken) {
      fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${new Date().toISOString()}&maxResults=10&singleEvents=true&orderBy=startTime`, {
        headers: { 'Authorization': `Bearer ${user.accessToken}` }
      })
      .then(res => res.json())
      .then(data => {
        const meetings = (data.items || []).filter(event => 
          event.hangoutLink || 
          (event.conferenceData && event.conferenceData.entryPoints) ||
          (event.location && event.location.includes('meet.google.com'))
        );
        setUpcomingMeetings(meetings);
      })
      .catch(err => console.log('Failed to fetch calendar events:', err));
    }

    // Hämta tidsförslag (samma logik som CompareCalendar)
    fetchTimeProposals();
  }, [user?.email]);

  const handleInviteResponse = (groupId, inviteeId, response) => {
    if (response === 'accept') {
      window.location.href = `/?group=${groupId}&invitee=${inviteeId}`;
    } else {
      // Använd samma API som CompareCalendar
      const invitation = invites.find(inv => inv.inviteeId === inviteeId);
      if (invitation) {
        fetch(`https://www.onebookr.se/api/invitation/${invitation.id}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ response: 'decline' })
        })
        .then(res => {
          if (res.ok) {
            setInvites(prev => prev.filter(invite => invite.inviteeId !== inviteeId));
          }
        })
        .catch(err => {
          console.log('Failed to decline invite:', err);
          // Ta bort lokalt som fallback
          setInvites(prev => prev.filter(invite => invite.inviteeId !== inviteeId));
        });
      }
    }
  };

  const fetchTimeProposals = async () => {
    try {
      const userEmail = user.email || user.emails?.[0]?.value || user.emails?.[0];
      if (!userEmail) return;
      
      const invitationsResponse = await fetch(`https://www.onebookr.se/api/invitations/${encodeURIComponent(userEmail)}`);
      if (invitationsResponse.ok) {
        const invitationsData = await invitationsResponse.json();
        const allProposals = [];
        
        for (const invitation of invitationsData.invitations) {
          if (invitation.accepted || invitation.responded) {
            const suggestionsResponse = await fetch(`https://www.onebookr.se/api/group/${invitation.groupId}/suggestions`);
            if (suggestionsResponse.ok) {
              const suggestionsData = await suggestionsResponse.json();
              const userSuggestions = suggestionsData.suggestions.filter(s => 
                !s.votes[userEmail] && !s.finalized
              );
              allProposals.push(...userSuggestions.map(s => ({...s, groupId: invitation.groupId})));
            }
          }
        }
        
        setTimeProposals(allProposals);
      }
    } catch (error) {
      console.error('Fel vid hämtning av tidsförslag:', error);
    }
  };

  const voteSuggestion = async (suggestionId, vote, targetGroupId) => {
    try {
      const response = await fetch(`https://www.onebookr.se/api/group/${targetGroupId}/suggestion/${suggestionId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email || user.emails?.[0]?.value || user.emails?.[0],
          vote,
        }),
      });
      if (response.ok) {
        const voteText = vote === 'accepted' ? 'accepterat' : 'nekat';
        setToast({ open: true, message: `Du har ${voteText} tidsförslaget!`, severity: 'success' });
        fetchTimeProposals();
      }
    } catch (error) {
      setToast({ open: true, message: 'Kunde inte registrera röst. Försök igen.', severity: 'error' });
    }
  };

  const handleProposalResponse = (proposalId, response) => {
    const proposal = timeProposals.find(p => p.id === proposalId);
    if (proposal) {
      voteSuggestion(proposalId, response, proposal.groupId);
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

      {/* Invites, Time Proposals och Upcoming Meetings med förbättrad design */}
      <Grid container spacing={{ xs: 3, md: 4 }} sx={{ px: { xs: 1, sm: 0 } }}>
        {/* Invites sektion */}
        <Grid item xs={12} md={4}>
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
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      Inbjudan från {invite.fromEmail}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Kalenderjämförelse • {new Date(invite.createdAt).toLocaleDateString()}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 13 }}>
                      {invite.fromEmail}
                    </Typography>
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

        {/* Time Proposals sektion */}
        <Grid item xs={12} md={4}>
          <Typography variant="h5" sx={{ 
            mb: 3, 
            fontWeight: 600,
            color: '#0a2540',
            fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif"
          }}>Tidsförslag</Typography>
          {timeProposals.length === 0 ? (
            <Card sx={{ 
              p: 3, 
              textAlign: 'center', 
              background: 'rgba(255,255,255,0.98)',
              borderRadius: 3,
              boxShadow: '0 8px 40px 0 rgba(99,91,255,0.10), 0 1.5px 6px 0 rgba(60,64,67,.06)',
              border: '1.5px solid #e3e8ee'
            }}>
              <Typography sx={{ color: '#425466', fontWeight: 400 }}>Inga tidsförslag just nu</Typography>
            </Card>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {timeProposals.map((proposal, index) => (
                <Card key={index} sx={{ 
                  p: 3, 
                  borderRadius: 3,
                  background: 'linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                  border: '1px solid rgba(255,193,7,0.2)',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.12)'
                  }
                }}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {proposal.title || 'Tidsförslag'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {formatDateTime(proposal.startTime)} - {formatDateTime(proposal.endTime)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 13 }}>
                      {proposal.fromEmail}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button 
                        size="small" 
                        variant="outlined" 
                        startIcon={<CloseIcon />}
                        onClick={() => handleProposalResponse(proposal.id, 'decline')}
                        sx={{
                          borderColor: '#f57c00',
                          color: '#f57c00',
                          borderRadius: 2,
                          fontWeight: 600,
                          '&:hover': {
                            borderColor: '#ef6c00',
                            color: '#ef6c00',
                            bgcolor: 'rgba(245, 124, 0, 0.05)'
                          }
                        }}
                      >
                        Neka
                      </Button>
                      <Button 
                        size="small" 
                        variant="contained" 
                        startIcon={<CheckIcon />}
                        onClick={() => handleProposalResponse(proposal.id, 'accept')}
                        sx={{
                          background: 'linear-gradient(90deg, #f57c00 0%, #ff9800 100%)',
                          color: 'white',
                          borderRadius: 2,
                          fontWeight: 600,
                          '&:hover': {
                            background: 'linear-gradient(90deg, #ef6c00 0%, #f57c00 100%)'
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
        <Grid item xs={12} md={4}>
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
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {meeting.summary || 'Untitled Meeting'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {formatDateTime(meeting.start)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 13 }}>
                      {meeting.organizer?.displayName || meeting.organizer?.email || 'Unknown organizer'}
                    </Typography>
                    {(meeting.hangoutLink || meeting.conferenceData?.entryPoints?.[0]?.uri) && (
                      <Button 
                        size="small" 
                        variant="contained" 
                        onClick={() => window.open(meeting.hangoutLink || meeting.conferenceData?.entryPoints?.[0]?.uri, '_blank')}
                        sx={{
                          background: 'linear-gradient(90deg, #1976d2 0%, #1565c0 100%)',
                          color: 'white',
                          borderRadius: 2,
                          fontWeight: 600,
                          '&:hover': {
                            background: 'linear-gradient(90deg, #1565c0 0%, #0d47a1 100%)'
                          }
                        }}
                      >
                        Gå med i mötet
                      </Button>
                    )}
                  </Box>
                </Card>
              ))}
            </Box>
          )}
        </Grid>
      </Grid>
      </Container>

      {/* Sidebar */}
      <Box
        sx={{
          position: 'fixed',
          top: 112,
          right: 0,
          height: 'calc(100vh - 112px)',
          width: sidebarOpen ? 400 : 60,
          backgroundColor: '#fff',
          boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
          border: '1px solid #e0e3e7',
          transition: 'all 0.3s ease',
          zIndex: 1200,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Sidebar toggle button */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarOpen ? 'space-between' : 'center',
            p: sidebarOpen ? 2 : 1,
            borderBottom: '1px solid #e0e3e7',
            minHeight: 64
          }}
        >
          {sidebarOpen && (
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#1976d2' }}>
              Notifikationer
            </Typography>
          )}
          <IconButton
            onClick={() => setSidebarOpen(!sidebarOpen)}
            sx={{
              color: '#666',
              '&:hover': { bgcolor: '#f5f5f5' }
            }}
          >
            {sidebarOpen ? (
              <ChevronLeftIcon />
            ) : (
              <Badge 
                badgeContent={invites.length + timeProposals.length} 
                color="error"
                sx={{
                  '& .MuiBadge-badge': {
                    fontSize: '10px',
                    minWidth: '16px',
                    height: '16px'
                  }
                }}
              >
                <NotificationsIcon sx={{ fontSize: 28 }} />
              </Badge>
            )}
          </IconButton>
        </Box>

        {/* Sidebar content */}
        {sidebarOpen && (
          <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Tabs */}
            <Box sx={{ display: 'flex', borderBottom: '1px solid #e0e3e7' }}>
              <Button
                onClick={() => setSidebarTab('invitations')}
                sx={{
                  flex: 1,
                  py: 2,
                  borderRadius: 0,
                  borderBottom: sidebarTab === 'invitations' ? '2px solid #1976d2' : 'none',
                  color: sidebarTab === 'invitations' ? '#1976d2' : '#666',
                  fontWeight: sidebarTab === 'invitations' ? 600 : 400,
                  fontSize: 12
                }}
                startIcon={<GroupIcon />}
              >
                Inbjudningar
              </Button>
              <Button
                onClick={() => setSidebarTab('proposals')}
                sx={{
                  flex: 1,
                  py: 2,
                  borderRadius: 0,
                  borderBottom: sidebarTab === 'proposals' ? '2px solid #1976d2' : 'none',
                  color: sidebarTab === 'proposals' ? '#1976d2' : '#666',
                  fontWeight: sidebarTab === 'proposals' ? 600 : 400,
                  fontSize: 12
                }}
                startIcon={<EventIcon />}
              >
                Tidsförslag
              </Button>
            </Box>

            {/* Content */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              {sidebarTab === 'invitations' ? (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 2, color: '#666' }}>
                    Inbjudningar till kalenderjämförelse
                  </Typography>
                  {invites.length === 0 ? (
                    <Typography variant="body2" sx={{ color: '#999', textAlign: 'center', mt: 4 }}>
                      Inga inbjudningar just nu
                    </Typography>
                  ) : (
                    invites.map((invitation) => (
                      <Paper
                        key={invitation.id}
                        sx={{
                          p: 2,
                          mb: 2,
                          borderRadius: 2,
                          border: '1px solid #e0e3e7',
                          '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                          {invitation.fromEmail}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#1976d2', display: 'block', fontWeight: 600 }}>
                          {invitation.groupName}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#666', display: 'block', mb: 1 }}>
                          Vill jämföra kalendrar med dig
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#999', fontSize: 11 }}>
                          {new Date(invitation.createdAt).toLocaleDateString()}
                        </Typography>
                        <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                          <Button 
                            size="small" 
                            variant="contained" 
                            sx={{ fontSize: 12 }}
                            onClick={() => window.location.href = `/?group=${invitation.groupId}&invitee=${invitation.inviteeId}`}
                          >
                            Gå med
                          </Button>
                          <Button 
                            size="small" 
                            variant="outlined" 
                            sx={{ fontSize: 12 }}
                            onClick={() => handleInviteResponse(invitation.groupId, invitation.inviteeId, 'decline')}
                          >
                            Neka
                          </Button>
                        </Box>
                      </Paper>
                    ))
                  )}
                </Box>
              ) : (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 2, color: '#666' }}>
                    Tidsförslag du har fått
                  </Typography>
                  {timeProposals.length === 0 ? (
                    <Typography variant="body2" sx={{ color: '#999', textAlign: 'center', mt: 4 }}>
                      Inga tidsförslag just nu
                    </Typography>
                  ) : (
                    timeProposals.map((proposal) => (
                      <Paper
                        key={proposal.id}
                        sx={{
                          p: 2,
                          mb: 2,
                          borderRadius: 2,
                          border: '1px solid #e0e3e7',
                          '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                          {proposal.title || 'Mötesförslag'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#666', display: 'block' }}>
                          Från: {proposal.fromEmail}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#1976d2', display: 'block' }}>
                          {new Date(proposal.start).toLocaleDateString()} {new Date(proposal.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                        <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                          <Button 
                            size="small" 
                            variant="contained" 
                            sx={{ fontSize: 12 }}
                            onClick={() => handleProposalResponse(proposal.id, 'accepted')}
                          >
                            Acceptera
                          </Button>
                          <Button 
                            size="small" 
                            variant="outlined" 
                            sx={{ fontSize: 12 }}
                            onClick={() => handleProposalResponse(proposal.id, 'declined')}
                          >
                            Neka
                          </Button>
                        </Box>
                      </Paper>
                    ))
                  )}
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* Toast-meddelanden */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToast({ ...toast, open: false })}
          severity={toast.severity}
          sx={{ width: '100%', borderRadius: 2 }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
}