import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Button, Card, CardContent, Grid, Chip, IconButton, Badge, Paper, Snackbar, Alert } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import CheckIcon from '@mui/icons-material/Check';
import EventIcon from '@mui/icons-material/Event';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LogoutIcon from '@mui/icons-material/Logout';
import TaskIcon from '@mui/icons-material/Task';
import NotificationsIcon from '@mui/icons-material/Notifications';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import CloseIcon from '@mui/icons-material/Close';
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
    if (user?.email) {
      fetchTimeProposals();
    }
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
          const suggestionsResponse = await fetch(`https://www.onebookr.se/api/group/${invitation.groupId}/suggestions`);
          if (suggestionsResponse.ok) {
            const suggestionsData = await suggestionsResponse.json();
            const userSuggestions = suggestionsData.suggestions.filter(s => 
              !s.votes[userEmail] && !s.finalized
            );
            allProposals.push(...userSuggestions.map(s => ({...s, groupId: invitation.groupId})));
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

  const formatProposalDateTime = (proposal) => {
    if (!proposal) return '';
    // Hantera olika format för tidsförslag
    const startTime = proposal.startTime || proposal.start;
    if (!startTime) return '';
    const date = new Date(startTime);
    return date.toLocaleDateString('sv-SE') + ' ' + date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  };

  const getTimeUntilMeeting = (startTime) => {
    if (!startTime) return '';
    const now = new Date();
    const meetingStart = new Date(startTime.dateTime || startTime);
    const diffMs = meetingStart - now;
    
    if (diffMs < 0) {
      return 'Nu';
    } else {
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      
      if (diffDays > 0) {
        return `${diffDays} dag${diffDays > 1 ? 'ar' : ''}`;
      } else if (diffHours > 0) {
        const remainingMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        if (remainingMinutes > 0) {
          return `${diffHours} h ${remainingMinutes} min`;
        } else {
          return `${diffHours} h`;
        }
      } else if (diffMinutes > 0) {
        return `${diffMinutes} min`;
      } else {
        return 'Nu';
      }
    }
  };

  return (
    <>


      <Container maxWidth="xl" sx={{ mt: 12, mb: 4, px: { xs: 2, sm: 3 } }}>
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

      {/* Moderna action cards med bredare layout */}
      <Box sx={{ mb: 8, px: { xs: 2, sm: 3 } }}>
        <Grid container spacing={{ xs: 3, md: 3 }} sx={{ justifyContent: 'flex-start' }}>
          <Grid item xs={12} sm={6} lg={4}>
            <Card sx={{ 
              height: 85, 
              width: 300,
              cursor: 'pointer', 
              background: 'rgba(255,255,255,0.98)',
              borderRadius: 4,
              boxShadow: '0 12px 48px 0 rgba(99,91,255,0.12), 0 2px 12px 0 rgba(60,64,67,.08)',
              border: '1.5px solid #e3e8ee',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': { 
                transform: 'translateY(-8px) scale(1.02)',
                boxShadow: '0 20px 60px 0 rgba(99,91,255,0.18), 0 4px 16px 0 rgba(60,64,67,.12)'
              }
            }} 
                  onClick={() => onNavigateToMeeting('1v1')}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', height: '100%', gap: 2, p: 0, pl: 2, pr: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 60, height: '100%' }}>
                  <PersonIcon sx={{ fontSize: 36, color: '#635bff' }} />
                </Box>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#0a2540', mb: 0.3, fontSize: 16, lineHeight: 1.2 }}>1v1 Meeting</Typography>
                  <Typography variant="body2" sx={{ color: '#425466', fontSize: 12, lineHeight: 1.3 }}>Jämför kalendrar och hitta ledig tid</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} lg={4}>
            <Card sx={{ 
              height: 85, 
              width: 300,
              cursor: 'pointer', 
              background: 'rgba(255,255,255,0.98)',
              borderRadius: 4,
              boxShadow: '0 12px 48px 0 rgba(99,91,255,0.12), 0 2px 12px 0 rgba(60,64,67,.08)',
              border: '1.5px solid #e3e8ee',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': { 
                transform: 'translateY(-8px) scale(1.02)',
                boxShadow: '0 20px 60px 0 rgba(99,91,255,0.18), 0 4px 16px 0 rgba(60,64,67,.12)'
              }
            }} 
                  onClick={() => onNavigateToMeeting('group')}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', height: '100%', gap: 2, p: 0, pl: 2, pr: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 60, height: '100%' }}>
                  <GroupIcon sx={{ fontSize: 36, color: '#635bff' }} />
                </Box>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#0a2540', mb: 0.3, fontSize: 16, lineHeight: 1.2 }}>Group Meeting</Typography>
                  <Typography variant="body2" sx={{ color: '#425466', fontSize: 12, lineHeight: 1.3 }}>Bjud in flera och hitta gemensam tid</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} lg={4}>
            <Card sx={{ 
              height: 85, 
              width: 300,
              cursor: 'pointer', 
              background: 'rgba(255,255,255,0.98)',
              borderRadius: 4,
              boxShadow: '0 12px 48px 0 rgba(99,91,255,0.12), 0 2px 12px 0 rgba(60,64,67,.08)',
              border: '1.5px solid #e3e8ee',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': { 
                transform: 'translateY(-8px) scale(1.02)',
                boxShadow: '0 20px 60px 0 rgba(99,91,255,0.18), 0 4px 16px 0 rgba(60,64,67,.12)'
              }
            }} 
                  onClick={() => onNavigateToMeeting('task')}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', height: '100%', gap: 2, p: 0, pl: 2, pr: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 60, height: '100%' }}>
                  <TaskIcon sx={{ fontSize: 36, color: '#635bff' }} />
                </Box>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#0a2540', mb: 0.3, fontSize: 16, lineHeight: 1.2 }}>Create Task</Typography>
                  <Typography variant="body2" sx={{ color: '#425466', fontSize: 12, lineHeight: 1.3 }}>Schemalägg tid för uppgifter</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* Översikt sektion */}
      <Box sx={{ mb: 4, px: { xs: 2, sm: 3 } }}>
        <Typography variant="h4" sx={{ 
          fontWeight: 600,
          color: '#0a2540',
          fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
          mb: 4,
          textAlign: 'left'
        }}>Översikt</Typography>
        
        <Grid container spacing={{ xs: 3, md: 3 }} sx={{ justifyContent: 'flex-start' }}>
          {/* Invites sektion */}
          <Grid item xs={12} sm={12} md={4}>
            <Card sx={{ 
              height: 480,
              width: 500,
              background: 'rgba(255,255,255,0.98)',
              borderRadius: 4,
              boxShadow: '0 12px 48px 0 rgba(99,91,255,0.12), 0 2px 12px 0 rgba(60,64,67,.08)',
              border: '1.5px solid #e3e8ee',
              display: 'flex',
              flexDirection: 'column',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: '0 16px 56px 0 rgba(99,91,255,0.15), 0 4px 16px 0 rgba(60,64,67,.1)'
              }
            }}>
            <Box sx={{ p: 3, borderBottom: '1px solid #e3e8ee' }}>
              <Typography variant="h5" sx={{ 
                fontWeight: 600,
                color: '#0a2540',
                fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif"
              }}>Inbjudningar</Typography>
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
              {invites.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography sx={{ color: '#425466', fontWeight: 400 }}>Inga inbjudningar just nu</Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {invites.map((invite, index) => (
                    <Card key={index} sx={{ 
                      p: 2, 
                      borderRadius: 2,
                      background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        transform: 'translateY(-1px)',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.1)'
                      }
                    }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                        {invite.fromEmail}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#666', display: 'block', mb: 2 }}>
                        {new Date(invite.createdAt).toLocaleDateString()}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button 
                          size="small" 
                          variant="outlined" 
                          onClick={() => handleInviteResponse(invite.groupId, invite.inviteeId, 'decline')}
                          sx={{ fontSize: 11, py: 0.5, px: 1.5 }}
                        >
                          Neka
                        </Button>
                        <Button 
                          size="small" 
                          variant="contained" 
                          onClick={() => handleInviteResponse(invite.groupId, invite.inviteeId, 'accept')}
                          sx={{ fontSize: 11, py: 0.5, px: 1.5 }}
                        >
                          Acceptera
                        </Button>
                      </Box>
                    </Card>
                  ))}
                </Box>
              )}
            </Box>
          </Card>
        </Grid>

        {/* Time Proposals sektion */}
        <Grid item xs={12} sm={6} md={4}>
            <Card sx={{ 
              height: 480,
              width: 500,
              background: 'rgba(255,255,255,0.98)',
              borderRadius: 4,
              boxShadow: '0 12px 48px 0 rgba(99,91,255,0.12), 0 2px 12px 0 rgba(60,64,67,.08)',
              border: '1.5px solid #e3e8ee',
              display: 'flex',
              flexDirection: 'column',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: '0 16px 56px 0 rgba(99,91,255,0.15), 0 4px 16px 0 rgba(60,64,67,.1)'
              }
            }}>
            <Box sx={{ p: 3, borderBottom: '1px solid #e3e8ee' }}>
              <Typography variant="h5" sx={{ 
                fontWeight: 600,
                color: '#0a2540',
                fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif"
              }}>Tidsförslag</Typography>
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
              {timeProposals.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography sx={{ color: '#425466', fontWeight: 400 }}>Inga tidsförslag just nu</Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {timeProposals.map((proposal, index) => (
                    <Card key={index} sx={{ 
                      p: 3, 
                      borderRadius: 2,
                      background: 'linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      border: '1px solid rgba(255,193,7,0.2)',
                      transition: 'all 0.3s ease',
                      minHeight: 120,
                      '&:hover': {
                        transform: 'translateY(-1px)',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.1)'
                      }
                    }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, fontSize: 16 }}>
                        {proposal.title || 'Tidsförslag'}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#1976d2', display: 'block', mb: 1, fontWeight: 600, fontSize: 14 }}>
                        📅 {formatProposalDateTime(proposal)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#666', display: 'block', mb: 2, fontSize: 12 }}>
                        Från: {proposal.fromEmail}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, mt: 'auto' }}>
                        <Button 
                          size="small" 
                          variant="outlined" 
                          onClick={() => handleProposalResponse(proposal.id, 'decline')}
                          sx={{ fontSize: 11, py: 0.5, px: 1.5 }}
                        >
                          Neka
                        </Button>
                        <Button 
                          size="small" 
                          variant="contained" 
                          onClick={() => handleProposalResponse(proposal.id, 'accept')}
                          sx={{ fontSize: 11, py: 0.5, px: 1.5 }}
                        >
                          Acceptera
                        </Button>
                      </Box>
                    </Card>
                  ))}
                </Box>
              )}
            </Box>
          </Card>
        </Grid>

        {/* Upcoming Meetings sektion */}
        <Grid item xs={12} sm={6} md={4}>
            <Card sx={{ 
              height: 480,
              width: 500,
              background: 'rgba(255,255,255,0.98)',
              borderRadius: 4,
              boxShadow: '0 12px 48px 0 rgba(99,91,255,0.12), 0 2px 12px 0 rgba(60,64,67,.08)',
              border: '1.5px solid #e3e8ee',
              display: 'flex',
              flexDirection: 'column',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: '0 16px 56px 0 rgba(99,91,255,0.15), 0 4px 16px 0 rgba(60,64,67,.1)'
              }
            }}>
            <Box sx={{ p: 3, borderBottom: '1px solid #e3e8ee' }}>
              <Typography variant="h5" sx={{ 
                fontWeight: 600,
                color: '#0a2540',
                fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif"
              }}>Kommande möten</Typography>
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
              {upcomingMeetings.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography sx={{ color: '#425466', fontWeight: 400 }}>Inga kommande möten</Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {upcomingMeetings.slice(0, 5).map((meeting) => {
                    const timeUntil = getTimeUntilMeeting(meeting.start);
                    const isUrgent = timeUntil === 'Nu' || timeUntil.includes('min');
                    
                    return (
                      <Card key={meeting.id} sx={{ 
                        p: 2, 
                        borderRadius: 2,
                        background: isUrgent ? 'linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)' : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                        border: isUrgent ? '1px solid #f44336' : '1px solid rgba(255,255,255,0.2)',
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          transform: 'translateY(-1px)',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.1)'
                        }
                      }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                          {meeting.summary || 'Untitled Meeting'}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#1976d2', display: 'block', mb: 1, fontWeight: 600 }}>
                          📅 {formatDateTime(meeting.start)}
                        </Typography>
                        <Typography variant="caption" sx={{ 
                          color: isUrgent ? '#d32f2f' : '#4caf50', 
                          display: 'block', 
                          mb: 1, 
                          fontWeight: 600,
                          fontSize: 12
                        }}>
                          ⏰ {timeUntil}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#666', display: 'block', mb: 2, fontSize: 11 }}>
                          {meeting.organizer?.displayName || meeting.organizer?.email || 'Unknown organizer'}
                        </Typography>
                        {(meeting.hangoutLink || meeting.conferenceData?.entryPoints?.[0]?.uri) && (
                          <Button 
                            size="small" 
                            variant="contained" 
                            onClick={() => window.open(meeting.hangoutLink || meeting.conferenceData?.entryPoints?.[0]?.uri, '_blank')}
                            sx={{ fontSize: 11, py: 0.5, px: 1.5 }}
                          >
                            Gå med i mötet
                          </Button>
                        )}
                      </Card>
                    );
                  })}
                </Box>
              )}
            </Box>
          </Card>
        </Grid>
      </Grid>
      </Box>
      </Container>

      {/* Footer */}
      <Box
        component="footer"
        sx={{
          width: '100%',
          bgcolor: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          mt: 8,
          py: 4
        }}
      >
        <Container maxWidth="lg">
          <Typography variant="body2" sx={{ 
            textAlign: 'center',
            color: '#64748b' 
          }}>
            © 2024 BookR. Alla rättigheter förbehållna.
          </Typography>
        </Container>
      </Box>

      {/* Floating Notification Icon */}
      <IconButton
        onClick={() => setSidebarOpen(!sidebarOpen)}
        sx={{
          position: 'fixed',
          top: '50%',
          right: 20,
          transform: 'translateY(-50%)',
          width: 60,
          height: 60,
          backgroundColor: '#635bff',
          color: 'white',
          boxShadow: '0 4px 20px rgba(99, 91, 255, 0.3)',
          zIndex: 1200,
          '&:hover': {
            backgroundColor: '#7a5af8',
            boxShadow: '0 6px 25px rgba(99, 91, 255, 0.4)',
            transform: 'translateY(-50%) scale(1.1)'
          },
          transition: 'all 0.3s ease'
        }}
      >
        <Badge 
          badgeContent={invites.length + timeProposals.length} 
          color="error"
          sx={{
            '& .MuiBadge-badge': {
              fontSize: '10px',
              minWidth: '18px',
              height: '18px',
              top: -8,
              right: -8
            }
          }}
        >
          <NotificationsIcon sx={{ fontSize: 28 }} />
        </Badge>
      </IconButton>

      {/* Sidebar Modal */}
      {sidebarOpen && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => setSidebarOpen(false)}
        >
          <Box
            sx={{
              width: 400,
              maxHeight: '80vh',
              backgroundColor: '#fff',
              borderRadius: 3,
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <Box sx={{ p: 3, borderBottom: '1px solid #e0e3e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#1976d2' }}>
                Notifikationer
              </Typography>
              <IconButton onClick={() => setSidebarOpen(false)} size="small">
                <CloseIcon />
              </IconButton>
            </Box>

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
            <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
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
                        <Typography variant="caption" sx={{ color: '#1976d2', display: 'block', fontWeight: 600, mb: 1 }}>
                          📅 {formatProposalDateTime(proposal)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#666', display: 'block' }}>
                          Från: {proposal.fromEmail}
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
        </Box>
      )}

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