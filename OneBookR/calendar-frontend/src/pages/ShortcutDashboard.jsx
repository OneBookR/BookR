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
import ContactsIcon from '@mui/icons-material/Contacts';
import AddIcon from '@mui/icons-material/Add';
import GroupsIcon from '@mui/icons-material/Groups';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';
import InvitationSidebar from './InvitationSidebar.jsx';
import ContactSettings from '../components/ContactSettings.jsx';
import ContactManager from './ContactManager.jsx';
import Team from './Team.jsx';

// Exportera kontakter så att andra komponenter kan använda dem
export const getStoredContacts = () => {
  return JSON.parse(localStorage.getItem('bookr_contacts') || '[]');
};

export default function ShortcutDashboard({ user, onNavigateToMeeting }) {
  const [invites, setInvites] = useState([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const [timeProposals, setTimeProposals] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('invitations');
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [leftMeetings, setLeftMeetings] = useState([]);
  const [contactsModalOpen, setContactsModalOpen] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', email: '' });
  const [contacts, setContacts] = useState([]);
  const [contactSettingsOpen, setContactSettingsOpen] = useState(false);
  const [teams, setTeams] = useState([]);
  const [hasDirectAccessTeam, setHasDirectAccessTeam] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' eller 'team'


  useEffect(() => {
    const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0];
    if (!userEmail) return;
    
    // Hämta invites från samma endpoint som InvitationSidebar
    fetch(`https://www.onebookr.se/api/invitations/${encodeURIComponent(userEmail)}`)
    .then(res => res.json())
    .then(data => setInvites((data.invitations || []).filter(inv => !inv.responded)))
    .catch(err => console.log('Failed to fetch invites:', err));
    
    // Hämta kontaktförfrågningar från localStorage
    const contactRequests = JSON.parse(localStorage.getItem(`bookr_contact_requests_${userEmail}`) || '[]');
    console.log('Contact requests found:', contactRequests);
    
    // Lägg till kontaktförfrågningar till invites för att visa dem i notifikationer
    const formattedRequests = contactRequests.map(req => ({
      id: `contact_${req.id}`,
      type: 'contact_request',
      fromEmail: req.fromEmail,
      fromName: req.fromName,
      createdAt: req.timestamp,
      groupName: 'Kontaktförfrågan'
    }));
    
    setInvites(prev => [...prev, ...formattedRequests]);

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
    if (userEmail) {
      fetchTimeProposals();
    }
    
    // Lyssna på localStorage-ändringar för kontaktförfrågningar
    const handleStorageChange = () => {
      const updatedRequests = JSON.parse(localStorage.getItem(`bookr_contact_requests_${userEmail}`) || '[]');
      const formattedRequests = updatedRequests.map(req => ({
        id: `contact_${req.id}`,
        type: 'contact_request',
        fromEmail: req.fromEmail,
        fromName: req.fromName,
        createdAt: req.timestamp,
        groupName: 'Kontaktförfrågan'
      }));
      
      setInvites(prev => {
        // Ta bort gamla kontaktförfrågningar och lägg till nya
        const nonContactInvites = prev.filter(inv => !inv.type || inv.type !== 'contact_request');
        return [...nonContactInvites, ...formattedRequests];
      });
    };
    
    // Hämta lämnade möten från localStorage
    const savedLeftMeetings = JSON.parse(localStorage.getItem('leftMeetings') || '[]');
    setLeftMeetings(savedLeftMeetings);
    
    // Hämta sparade kontakter från localStorage
    const savedContacts = JSON.parse(localStorage.getItem('bookr_contacts') || '[]');
    setContacts(savedContacts);

    // Hämta teams och kontakter för att kolla direktåtkomst
    const savedTeamContacts = JSON.parse(localStorage.getItem(`bookr_team_contacts_${userEmail}`) || '[]');
    const savedTeams = JSON.parse(localStorage.getItem(`bookr_teams_${userEmail}`) || '[]');
    setTeams(savedTeams);

    const directAccessTeamExists = savedTeams.some(team =>
      team.members.every(member => {
        const contact = savedTeamContacts.find(c => c.email === member.email);
        return contact && contact.directAccess;
      })
    );
    setHasDirectAccessTeam(directAccessTeamExists);
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [user?.email]);

  const handleNavigateToMeeting = (type) => {
    if (type === 'team') {
      setCurrentView('team');
    } else {
      // Befintlig logik för 1v1, group, task
      window.location.href = `/?meetingType=${type}`;
    }
  };

  const handleInviteResponse = async (groupId, inviteeId, response) => {
    const invitation = invites.find(inv => inv.inviteeId === inviteeId || inv.id === groupId);
    if (!invitation) return;
    
    // Hantera kontaktförfrågningar
    if (invitation.type === 'contact_request') {
      const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0];
      const contactRequests = JSON.parse(localStorage.getItem(`bookr_contact_requests_${userEmail}`) || '[]');
      const requestId = parseInt(invitation.id.replace('contact_', ''));
      
      if (response === 'accept') {
        // Lägg till som kontakt
        const teamContacts = JSON.parse(localStorage.getItem(`bookr_team_contacts_${userEmail}`) || '[]');
        const newContact = {
          id: Date.now(),
          name: invitation.fromName,
          email: invitation.fromEmail,
          directAccess: false
        };
        teamContacts.push(newContact);
        localStorage.setItem(`bookr_team_contacts_${userEmail}`, JSON.stringify(teamContacts));
        
        // Ge direktåtkomst tillbaka till den som skickade förfrågan
        const directAccessKey = `bookr_direct_access_granted_${invitation.fromEmail}`;
        const directAccessList = JSON.parse(localStorage.getItem(directAccessKey) || '[]');
        if (!directAccessList.find(c => c.email === userEmail)) {
          directAccessList.push({
            id: Date.now(),
            name: user.displayName || userEmail,
            email: userEmail,
            grantedAt: new Date().toISOString()
          });
          localStorage.setItem(directAccessKey, JSON.stringify(directAccessList));
        }
        
        setToast({ open: true, message: `${invitation.fromName} är nu din kontakt och har fått direktåtkomst!`, severity: 'success' });
      }
      
      // Ta bort förfrågan
      const updatedRequests = contactRequests.filter(req => req.id !== requestId);
      localStorage.setItem(`bookr_contact_requests_${userEmail}`, JSON.stringify(updatedRequests));
      
      // Ta bort från invites
      setInvites(prev => prev.filter(inv => inv.id !== invitation.id));
      
      // Trigga storage event för att uppdatera andra komponenter
      window.dispatchEvent(new Event('storage'));
      return;
    }

    // Hantera vanliga kalenderinbjudningar
    if (response === 'accept') {
      // Markera som svarad innan redirect
      try {
        await fetch(`https://www.onebookr.se/api/invitation/${invitation.id}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ response: 'accept' })
        });
      } catch (err) {
        console.log('Failed to mark invitation as responded:', err);
      }
      
      // Skapa öppet möte med gruppnamn
      const openMeeting = {
        id: groupId,
        groupName: invitation.groupName || 'Kalenderjämförelse',
        members: [invitation.fromEmail, user.email || user.emails?.[0]?.value || user.emails?.[0]],
        leftAt: new Date().toISOString()
      };
      const existingMeetings = JSON.parse(localStorage.getItem('leftMeetings') || '[]');
      const updatedMeetings = existingMeetings.filter(m => m.id !== groupId);
      updatedMeetings.push(openMeeting);
      localStorage.setItem('leftMeetings', JSON.stringify(updatedMeetings));
      setLeftMeetings(updatedMeetings);
      
      setInvites(prev => prev.filter(invite => invite.inviteeId !== inviteeId && invite.id !== invitation.id));
      window.location.href = `/?group=${groupId}&invitee=${inviteeId}`;
    } else if (response === 'accept_passive') {
      // Acceptera utan att gå in i kalenderjämföraren - ge direktåtkomst
      try {
        // Först, lägg till inbjudaren som kontakt med direktåtkomst
        const userEmail = user.email || user.emails?.[0]?.value || user.emails?.[0];
        const teamContactsKey = `bookr_team_contacts_${userEmail}`;
        const existingContacts = JSON.parse(localStorage.getItem(teamContactsKey) || '[]');
        
        // Kolla om kontakten redan finns
        const existingContactIndex = existingContacts.findIndex(c => c.email.toLowerCase() === invitation.fromEmail.toLowerCase());
        
        if (existingContactIndex >= 0) {
          // Uppdatera befintlig kontakt med direktåtkomst
          existingContacts[existingContactIndex].directAccess = true;
        } else {
          // Lägg till ny kontakt med direktåtkomst
          existingContacts.push({
            id: Date.now(),
            name: invitation.fromEmail.split('@')[0], // Använd första delen av e-posten som namn
            email: invitation.fromEmail,
            directAccess: true
          });
        }
        
        localStorage.setItem(teamContactsKey, JSON.stringify(existingContacts));
        
        // Lägg till i inbjudarens direktåtkomst-lista också
        const inviterDirectAccessKey = `bookr_direct_access_granted_${invitation.fromEmail}`;
        const inviterDirectAccessList = JSON.parse(localStorage.getItem(inviterDirectAccessKey) || '[]');
        if (!inviterDirectAccessList.find(c => c.email === userEmail)) {
          inviterDirectAccessList.push({
            id: Date.now(),
            name: user.displayName || userEmail,
            email: userEmail,
            grantedAt: new Date().toISOString()
          });
          localStorage.setItem(inviterDirectAccessKey, JSON.stringify(inviterDirectAccessList));
        }
        
        // Sedan, gå med i gruppen
        const joinRes = await fetch(`https://www.onebookr.se/api/group/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupId,
            token: user.accessToken,
            invitee: inviteeId,
            email: userEmail
          })
        });
        
        if (joinRes.ok) {
          // Markera inbjudan som svarad
          await fetch(`https://www.onebookr.se/api/invitation/${invitation.id}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response: 'accept' })
          });
          
          // Skapa öppet möte med gruppnamn
          const openMeeting = {
            id: groupId,
            groupName: invitation.groupName || 'Kalenderjämförelse',
            members: [invitation.fromEmail, userEmail],
            leftAt: new Date().toISOString()
          };
          const existingMeetings = JSON.parse(localStorage.getItem('leftMeetings') || '[]');
          const updatedMeetings = existingMeetings.filter(m => m.id !== groupId);
          updatedMeetings.push(openMeeting);
          localStorage.setItem('leftMeetings', JSON.stringify(updatedMeetings));
          setLeftMeetings(updatedMeetings);
          
          setInvites(prev => prev.filter(invite => invite.inviteeId !== inviteeId && invite.id !== invitation.id));
          setToast({ open: true, message: `Du har gett ${invitation.fromEmail} direktåtkomst till din kalender!`, severity: 'success' });
        } else {
          setToast({ open: true, message: 'Kunde inte acceptera inbjudan.', severity: 'error' });
        }
      } catch (err) {
        console.log('Failed to join group passively:', err);
        setToast({ open: true, message: 'Kunde inte acceptera inbjudan.', severity: 'error' });
      }
    } else {
      // Neka inbjudan
      try {
        await fetch(`https://www.onebookr.se/api/invitation/${invitation.id}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ response: 'decline' })
        });
        setInvites(prev => prev.filter(invite => invite.inviteeId !== inviteeId && invite.id !== invitation.id));
        setToast({ open: true, message: 'Inbjudan nekad.', severity: 'info' });
      } catch (err) {
        console.log('Failed to decline invite:', err);
        // Ta bort lokalt som fallback
        setInvites(prev => prev.filter(invite => invite.inviteeId !== inviteeId && invite.id !== invitation.id));
        setToast({ open: true, message: 'Inbjudan nekad.', severity: 'info' });
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
      const userEmail = user.email || user.emails?.[0]?.value || user.emails?.[0];
      if (!userEmail) {
        throw new Error('Användarens e-post saknas');
      }
      
      const response = await fetch(`https://www.onebookr.se/api/group/${targetGroupId}/suggestion/${suggestionId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          vote,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const voteText = vote === 'accepted' ? 'accepterat' : 'nekat';
      setToast({ open: true, message: `Du har ${voteText} tidsförslaget!`, severity: 'success' });
      await fetchTimeProposals();
    } catch (error) {
      console.error('Error voting on suggestion:', error);
      setToast({ open: true, message: `Kunde inte registrera röst: ${error.message}`, severity: 'error' });
      throw error;
    }
  };

  const handleProposalResponse = async (proposalId, response) => {
    try {
      const proposal = timeProposals.find(p => p.id === proposalId);
      if (!proposal) {
        setToast({ open: true, message: 'Förslaget kunde inte hittas', severity: 'error' });
        return;
      }
      
      const vote = response === 'accept' ? 'accepted' : 'declined';
      await voteSuggestion(proposalId, vote, proposal.groupId);
      // Ta bort förslaget från listan efter svar
      setTimeProposals(prev => prev.filter(p => p.id !== proposalId));
    } catch (error) {
      console.error('Error handling proposal response:', error);
      setToast({ open: true, message: 'Kunde inte svara på förslaget', severity: 'error' });
    }
  };

  const handleAddContact = async () => {
    if (!newContact.name.trim() || !newContact.email.trim()) {
      setToast({ open: true, message: 'Fyll i både namn och e-post', severity: 'error' });
      return;
    }
    
    // Kontrollera om kontakten redan finns
    if (contacts.some(c => c.email.toLowerCase() === newContact.email.toLowerCase())) {
      setToast({ open: true, message: 'Kontakten finns redan', severity: 'error' });
      return;
    }
    
    const updatedContacts = [...contacts, { ...newContact, id: Date.now() }];
    setContacts(updatedContacts);
    localStorage.setItem('bookr_contacts', JSON.stringify(updatedContacts));
    
    // Skicka kontaktförfrågan via BookR backend
    try {
      const userEmail = user.email || user.emails?.[0]?.value || user.emails?.[0];
      const userName = user.displayName || userEmail;
      
      await fetch('https://www.onebookr.se/api/contact-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromEmail: userEmail,
          fromName: userName,
          toEmail: newContact.email,
          toName: newContact.name,
          message: `${userName} vill lägga till dig som kontakt i BookR`
        })
      });
      
      // Fallback: Spara lokalt också
      const existingRequests = JSON.parse(localStorage.getItem(`bookr_contact_requests_${newContact.email}`) || '[]');
      const newRequest = {
        id: Date.now(),
        fromEmail: userEmail,
        fromName: userName,
        timestamp: new Date().toISOString()
      };
      existingRequests.push(newRequest);
      localStorage.setItem(`bookr_contact_requests_${newContact.email}`, JSON.stringify(existingRequests));
      
    } catch (error) {
      console.error('Failed to send contact request:', error);
    }
    
    setNewContact({ name: '', email: '' });
    setContactsModalOpen(false);
    setToast({ open: true, message: 'Kontakt tillagd och förfrågan skickad!', severity: 'success' });
  };

  const handleDeleteContact = (contactId) => {
    const updatedContacts = contacts.filter(c => c.id !== contactId);
    setContacts(updatedContacts);
    localStorage.setItem('bookr_contacts', JSON.stringify(updatedContacts));
    setToast({ open: true, message: 'Kontakt borttagen', severity: 'info' });
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



  if (currentView === 'team') {
    return <Team user={user} onNavigateBack={() => setCurrentView('dashboard')} />;
  }

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
                  onClick={() => handleNavigateToMeeting('1v1')}>
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
                  onClick={() => handleNavigateToMeeting('group')}>
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
                  onClick={() => handleNavigateToMeeting('task')}>
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
                  onClick={() => handleNavigateToMeeting('team')}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', height: '100%', gap: 2, p: 0, pl: 2, pr: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 60, height: '100%' }}>
                  <Badge
                    variant="dot"
                    color="success"
                    invisible={!hasDirectAccessTeam}
                    sx={{
                      '& .MuiBadge-dot': {
                        boxShadow: '0 0 0 2px #fff',
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                      }
                    }}
                  >
                    <GroupsIcon sx={{ fontSize: 36, color: '#635bff' }} />
                  </Badge>
                </Box>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#0a2540', mb: 0.3, fontSize: 16, lineHeight: 1.2 }}>TEAM</Typography>
                  <Typography variant="body2" sx={{ color: '#425466', fontSize: 12, lineHeight: 1.3 }}>Hantera teamkontakter</Typography>
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
              width: 400,
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
                      background: '#f8f9fa',
                      boxShadow: 'none',
                      border: '1px solid #dee2e6',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        transform: 'translateY(-1px)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                      }
                    }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                        {invite.groupName || 'Kalenderjämförelse'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#1976d2', display: 'block', mb: 1, fontWeight: 600 }}>
                        Från: {invite.fromName || invite.fromEmail}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#666', display: 'block', mb: 2 }}>
                        {new Date(invite.createdAt).toLocaleDateString() + ' ' + new Date(invite.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {invite.type === 'contact_request' ? (
                          <>
                            <Button 
                              size="small" 
                              variant="outlined" 
                              onClick={() => handleInviteResponse(invite.id, null, 'decline')}
                              sx={{ fontSize: 10, py: 0.5, px: 1 }}
                            >
                              Neka
                            </Button>
                            <Button 
                              size="small" 
                              variant="contained" 
                              onClick={() => handleInviteResponse(invite.id, null, 'accept')}
                              sx={{ fontSize: 10, py: 0.5, px: 1 }}
                            >
                              Acceptera
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button 
                              size="small" 
                              variant="outlined" 
                              onClick={() => handleInviteResponse(invite.groupId, invite.inviteeId, 'decline')}
                              sx={{ fontSize: 10, py: 0.5, px: 1 }}
                            >
                              Neka
                            </Button>
                            <Button 
                              size="small" 
                              variant="outlined" 
                              onClick={() => handleInviteResponse(invite.groupId, invite.inviteeId, 'accept_passive')}
                              sx={{ fontSize: 10, py: 0.5, px: 1, bgcolor: 'rgba(25,118,210,0.1)' }}
                            >
                              Ge tillgång
                            </Button>
                            <Button 
                              size="small" 
                              variant="contained" 
                              onClick={() => handleInviteResponse(invite.groupId, invite.inviteeId, 'accept')}
                              sx={{ fontSize: 10, py: 0.5, px: 1 }}
                            >
                              Gå med
                            </Button>
                          </>
                        )}
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
              width: 400,
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
                      p: 2, 
                      borderRadius: 2,
                      background: '#f8f9fa',
                      boxShadow: 'none',
                      border: '1px solid #dee2e6',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        transform: 'translateY(-1px)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
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
              width: 400,
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
                        background: '#f8f9fa',
                        boxShadow: 'none',
                        border: '1px solid #dee2e6',
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          transform: 'translateY(-1px)',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
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
        
        {/* Öppna möten sektion - under de andra tre */}
        <Grid container spacing={{ xs: 3, md: 3 }} sx={{ justifyContent: 'flex-start', mt: 4 }}>
          <Grid item xs={12} sm={12} md={4}>
            <Card sx={{ 
              height: 480,
              width: 400,
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
              }}>Öppna möten</Typography>
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
              {leftMeetings.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography sx={{ color: '#425466', fontWeight: 400, mb: 2 }}>Inga öppna möten just nu</Typography>
                  <Typography variant="caption" sx={{ color: '#666' }}>När du lämnar ett möte kommer det att visas här</Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {leftMeetings.map((meeting) => (
                    <Card key={meeting.id} sx={{ 
                      p: 2, 
                      borderRadius: 2,
                      background: '#f8f9fa',
                      boxShadow: 'none',
                      border: '1px solid #dee2e6',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        transform: 'translateY(-1px)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                      }
                    }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                        {meeting.groupName || 'Kalenderjämförelse'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#666', display: 'block', mb: 1 }}>
                        Medlemmar: {meeting.members.join(', ')}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#999', display: 'block', mb: 2, fontSize: 11 }}>
                        Lämnade: {new Date(meeting.leftAt).toLocaleString()}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button 
                          size="small" 
                          variant="contained" 
                          onClick={() => window.location.href = `/?group=${meeting.id}`}
                          sx={{ fontSize: 11, py: 0.5, px: 1.5 }}
                        >
                          Gå in i mötet
                        </Button>
                        <Button 
                          size="small" 
                          variant="outlined" 
                          onClick={() => {
                            const updatedMeetings = leftMeetings.filter(m => m.id !== meeting.id);
                            setLeftMeetings(updatedMeetings);
                            localStorage.setItem('leftMeetings', JSON.stringify(updatedMeetings));
                          }}
                          sx={{ fontSize: 11, py: 0.5, px: 1.5 }}
                        >
                          Stäng möte
                        </Button>
                      </Box>
                    </Card>
                  ))}
                </Box>
              )}
            </Box>
          </Card>
          </Grid>
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
                          {invitation.fromName || invitation.fromEmail}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#666', display: 'block', mb: 1 }}>
                          {invitation.type === 'contact_request' ? 'Vill lägga till dig som kontakt' : 'Vill jämföra kalendrar med dig'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#999', fontSize: 11 }}>
                          {new Date(invitation.createdAt).toLocaleDateString() + ' ' + new Date(invitation.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                        <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                          {invitation.type === 'contact_request' ? (
                            <>
                              <Button 
                                size="small" 
                                variant="contained" 
                                sx={{ fontSize: 12 }}
                                onClick={() => handleInviteResponse(invitation.id, null, 'accept')}
                              >
                                Acceptera
                              </Button>
                              <Button 
                                size="small" 
                                variant="outlined" 
                                sx={{ fontSize: 12 }}
                                onClick={() => handleInviteResponse(invitation.id, null, 'decline')}
                              >
                                Neka
                              </Button>
                            </>
                          ) : (
                            <>
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
                            </>
                          )}
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
                            onClick={() => handleProposalResponse(proposal.id, 'accept')}
                          >
                            Acceptera
                          </Button>
                          <Button 
                            size="small" 
                            variant="outlined" 
                            sx={{ fontSize: 12 }}
                            onClick={() => handleProposalResponse(proposal.id, 'decline')}
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

      {/* Kontakter Modal */}
      <Dialog 
        open={contactsModalOpen} 
        onClose={() => setContactsModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 600, color: '#0a2540' }}>
          Hantera kontakter
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 2, color: '#666' }}>
              Lägg till ny kontakt
            </Typography>
            <TextField
              fullWidth
              label="Namn"
              value={newContact.name}
              onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="E-postadress"
              type="email"
              value={newContact.email}
              onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
              sx={{ mb: 2 }}
            />
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddContact}
              >
                Lägg till kontakt
              </Button>
              <Button
                variant="outlined"
                onClick={() => setContactSettingsOpen(true)}
                disabled={contacts.length === 0}
              >
                Inställningar
              </Button>
            </Box>
          </Box>
          
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 2, color: '#666' }}>
              Sparade kontakter ({contacts.length})
            </Typography>
            {contacts.length === 0 ? (
              <Typography variant="body2" sx={{ color: '#999', textAlign: 'center', py: 2 }}>
                Inga kontakter sparade än
              </Typography>
            ) : (
              <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                {contacts.map((contact) => (
                  <Paper
                    key={contact.id}
                    sx={{
                      p: 2,
                      mb: 1,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: '1px solid #e0e3e7'
                    }}
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {contact.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#666' }}>
                        {contact.email}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => handleDeleteContact(contact.id)}
                    >
                      Ta bort
                    </Button>
                  </Paper>
                ))}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContactsModalOpen(false)}>
            Stäng
          </Button>
        </DialogActions>
      </Dialog>

      {/* Kontakt-inställningar Modal */}
      <ContactSettings
        open={contactSettingsOpen}
        onClose={() => setContactSettingsOpen(false)}
        contacts={contacts}
        onUpdateContactSettings={(contactId, settings) => {
          // Uppdatera kontakt-inställningar
          console.log('Uppdaterar inställningar för kontakt:', contactId, settings);
        }}
      />
    </>
  );
}