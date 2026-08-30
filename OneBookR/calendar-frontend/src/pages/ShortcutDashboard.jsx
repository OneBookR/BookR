import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Button, IconButton, Badge, Paper, Snackbar, Alert } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import EventIcon from '@mui/icons-material/Event';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LogoutIcon from '@mui/icons-material/Logout';
import NotificationsIcon from '@mui/icons-material/Notifications';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import CloseIcon from '@mui/icons-material/Close';
import ContactsIcon from '@mui/icons-material/Contacts';
import AddIcon from '@mui/icons-material/Add';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';
import InvitationSidebar from './InvitationSidebar.jsx';
import ContactSettings from '../components/ContactSettings.jsx';
import ContactManager from './ContactManager.jsx';
import Team from './Team.jsx';
import { apiRequest, createApiUrl } from '../utils/apiConfig.js';

// Exportera kontakter så att andra komponenter kan använda dem
export const getStoredContacts = () => {
  return JSON.parse(localStorage.getItem('bookr_contacts') || '[]');
};

// ✅ REDESIGN: egna stroke-baserade SVG-ikoner för "Starta något nytt"-
// korten — matchar mockupen i designcanvasen och resten av appens
// formspråk (Logo.jsx, ProviderIcons.jsx). Ersätter MUI:s fyllda
// Material-ikoner (PersonIcon/GroupIcon/TaskIcon/GroupsIcon) bara här —
// samma ikoner i sidebar-tabbar/notiser rörs inte.
function OneOnOneIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function GroupMeetingIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="8" cy="9" r="3" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16" cy="9" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M2.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5M10.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function TaskTimeIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.5 12L11 14.5L15.5 9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TeamIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 9.5H21" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="8" cy="14" r="1.4" fill="currentColor" />
      <circle cx="12" cy="14" r="1.4" fill="currentColor" />
    </svg>
  );
}

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
    apiRequest(`/api/invitations/${encodeURIComponent(userEmail)}`)
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

    // Hämta upcoming meetings via backend-proxy — accessToken hanteras server-side
    apiRequest('/api/calendar/upcoming')
      .then(res => res.json())
      .then(data => {
        const meetings = (data.events || []).filter(event =>
          event.hangoutLink ||
          event.conferenceUri ||
          (event.location && event.location.includes('meet.google.com'))
        );
        setUpcomingMeetings(meetings);
      })
      .catch(err => console.log('Failed to fetch calendar events:', err));

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
        await apiRequest(`/api/invitation/${invitation.id}/respond`, {
          method: 'POST',
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
        const joinRes = await apiRequest(`/api/group/join`, {
          method: 'POST',
          body: JSON.stringify({
            groupId,
            invitee: inviteeId,
            email: userEmail
          })
        });
        
        if (joinRes.ok) {
          // Markera inbjudan som svarad
          await apiRequest(`/api/invitation/${invitation.id}/respond`, {
            method: 'POST',
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
        await apiRequest(`/api/invitation/${invitation.id}/respond`, {
          method: 'POST',
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
      
      const invitationsResponse = await apiRequest(`/api/invitations/${encodeURIComponent(userEmail)}`);
      if (invitationsResponse.ok) {
        const invitationsData = await invitationsResponse.json();
        const allProposals = [];
        
        for (const invitation of invitationsData.invitations) {
          const suggestionsResponse = await apiRequest(`/api/group/${invitation.groupId}/suggestions`);
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
      
      const response = await apiRequest(`/api/group/${targetGroupId}/suggestion/${suggestionId}/vote`, {
        method: 'POST',
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
      
      await apiRequest(`/api/contact-request`, {
        method: 'POST',
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


  const currentUserEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0] || '';

  const actionCards = [
    {
      title: '1:1-möte',
      description: 'Jämför två kalendrar och hitta en ren, tydlig mötestid.',
      accent: 'Snabbast väg till ett beslut',
      icon: <OneOnOneIcon size={22} />,
      onClick: () => handleNavigateToMeeting('1v1')
    },
    {
      title: 'Gruppmöte',
      description: 'Bjud in flera deltagare och hitta gemensamma luckor utan brus.',
      accent: 'Bra för team och workshops',
      icon: <GroupMeetingIcon size={22} />,
      onClick: () => handleNavigateToMeeting('group')
    },
    {
      title: 'Uppgiftstid',
      description: 'Schemalägg uppgifter direkt i kalendern och se när de som snabbast kan vara klara utifrån ditt eget schema.',
      accent: 'Kommer snart',
      icon: <TaskTimeIcon size={22} />,
      comingSoon: true,
      onClick: undefined
    },
    {
      title: 'Team',
      description: 'Hantera kontakter, direktåtkomst och återkommande gruppflöden.',
      accent: hasDirectAccessTeam ? 'Direktåtkomst aktiv' : 'Bygg ett återanvändbart teamflöde',
      icon: <TeamIcon size={22} />,
      onClick: () => handleNavigateToMeeting('team')
    }
  ];



  if (currentView === 'team') {
    return <Team user={user} onNavigateBack={() => setCurrentView('dashboard')} />;
  }

  // ✅ REDESIGN: "DashboardMixNarrow" — vald riktning ur designcanvasen
  // https://claude.ai/code/artifact/28a4696a-6797-4c4c-b79f-68b3091477b5
  // (mix av Riktning B "aktivitet först" och Riktning C "glesare, större
  // plattor"). Smal centrerad kolumn (max 800px) istället för den gamla
  // hero+statistikpanel-strukturen: väntande aktivitet (inbjudningar +
  // tidsförslag) ligger som fullbredds-rader överst, sedan de fyra
  // startvalen som större tvåkolumns-plattor, sedan kommande möten som en
  // kompakt lista. All state/logik ovan är oförändrad — bara markup/layout
  // är ny. "Öppna möten" (fanns i gamla layouten men inte i mockupen) får
  // en egen sektion längst ner istället för att tappa funktionalitet.
  const pendingCount = invites.length + timeProposals.length;
  const greetingName = (user?.displayName || currentUserEmail || '').split(' ')[0] || currentUserEmail;

  return (
    <>
      {/* ✅ BUGFIX: maxWidth="sm" är MUI:s breakpoint-namn för 600px, inte
          mockupens ~800px-kolumn — gav för smala kort (nästan kvadratiska
          istället för liggande/rektangulära). sx maxWidth skriver över med
          ett explicit pixelvärde. */}
      <Container maxWidth={false} sx={{ maxWidth: 800, mt: { xs: 11, md: 13 }, mb: 6, px: { xs: 2, sm: 3 }, mx: 'auto' }}>
        <Box sx={{ mb: 4 }}>
          <Typography sx={{ fontSize: { xs: 26, md: 30 }, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)' }}>
            Hej{greetingName ? `, ${greetingName}` : ''}
          </Typography>
          <Typography sx={{ mt: 0.75, fontSize: 15, color: 'var(--text-secondary)' }}>
            {pendingCount > 0
              ? `${pendingCount} sak${pendingCount > 1 ? 'er' : ''} väntar på dig innan du börjar något nytt.`
              : 'Allt är uppdaterat — inget väntar på ditt svar just nu.'}
          </Typography>
        </Box>

        {/* Aktivitetsflöde — inbjudningar och tidsförslag, alltid synligt högst upp */}
        {(invites.length > 0 || timeProposals.length > 0) && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 4.5 }}>
            {invites.map((invite, index) => (
              <Box
                key={`invite-${index}`}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 2, p: '18px 20px',
                  borderRadius: 4.5, border: '1.5px solid rgba(17,24,39,0.14)',
                  bgcolor: 'var(--surface-strong)', boxShadow: '0 18px 40px rgba(15,23,42,0.05)'
                }}
              >
                <Box sx={{ width: 40, height: 40, borderRadius: 3, bgcolor: 'rgba(17,24,39,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text)' }}>
                  {invite.type === 'contact_request' ? <PersonIcon sx={{ fontSize: 19 }} /> : <GroupIcon sx={{ fontSize: 19 }} />}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }} noWrap>
                    {invite.type === 'contact_request' ? 'Kontaktförfrågan' : (invite.groupName || 'Kalenderjämförelse')}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: 'var(--text-secondary)', mt: 0.25 }} noWrap>
                    Från: {invite.fromName || invite.fromEmail}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                  {invite.type === 'contact_request' ? (
                    <>
                      <Button size="small" variant="outlined" onClick={() => handleInviteResponse(invite.id, null, 'decline')} sx={{ borderColor: 'var(--border)', color: 'var(--text)', borderRadius: 2.5 }}>Neka</Button>
                      <Button size="small" variant="contained" onClick={() => handleInviteResponse(invite.id, null, 'accept')} sx={{ bgcolor: 'var(--text)', borderRadius: 2.5, '&:hover': { bgcolor: '#000' } }}>Acceptera</Button>
                    </>
                  ) : (
                    <>
                      <Button size="small" variant="outlined" onClick={() => handleInviteResponse(invite.groupId, invite.inviteeId, 'decline')} sx={{ borderColor: 'var(--border)', color: 'var(--text)', borderRadius: 2.5 }}>Neka</Button>
                      <Button size="small" variant="contained" onClick={() => handleInviteResponse(invite.groupId, invite.inviteeId, 'accept')} sx={{ bgcolor: 'var(--text)', borderRadius: 2.5, '&:hover': { bgcolor: '#000' } }}>Gå med</Button>
                    </>
                  )}
                </Box>
              </Box>
            ))}

            {timeProposals.map((proposal, index) => (
              <Box
                key={`proposal-${index}`}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 2, p: '18px 20px',
                  borderRadius: 4.5, border: '1.5px solid rgba(17,24,39,0.14)',
                  bgcolor: 'var(--surface-strong)', boxShadow: '0 18px 40px rgba(15,23,42,0.05)'
                }}
              >
                <Box sx={{ width: 40, height: 40, borderRadius: 3, bgcolor: 'rgba(31,122,77,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--success)' }}>
                  <AccessTimeIcon sx={{ fontSize: 19 }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }} noWrap>
                    {proposal.title || 'Tidsförslag'}: {formatProposalDateTime(proposal)}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: 'var(--text-secondary)', mt: 0.25 }} noWrap>
                    Föreslaget av {proposal.fromEmail}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                  <Button size="small" variant="outlined" onClick={() => handleProposalResponse(proposal.id, 'decline')} sx={{ borderColor: 'var(--border)', color: 'var(--text)', borderRadius: 2.5 }}>Neka</Button>
                  <Button size="small" variant="contained" onClick={() => handleProposalResponse(proposal.id, 'accept')} sx={{ bgcolor: 'var(--text)', borderRadius: 2.5, '&:hover': { bgcolor: '#000' } }}>Acceptera</Button>
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {/* Starta något nytt — större tvåkolumns-plattor */}
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 2 }}>
          Starta något nytt
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 4.5 }}>
          {actionCards.map((action) => (
            <Paper
              key={action.title}
              elevation={0}
              onClick={action.comingSoon ? undefined : action.onClick}
              aria-disabled={action.comingSoon || undefined}
              sx={{
                position: 'relative',
                p: 3.5, borderRadius: 5.5, border: '1px solid var(--border)',
                bgcolor: 'var(--surface-strong)', boxShadow: '0 20px 60px rgba(15,23,42,0.07)',
                transition: 'transform 180ms ease, box-shadow 180ms ease',
                ...(action.comingSoon
                  ? { cursor: 'default', opacity: 0.62 }
                  : {
                      cursor: 'pointer',
                      '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 26px 70px rgba(15,23,42,0.1)' },
                    }),
              }}
            >
              {action.comingSoon && (
                <Box
                  sx={{
                    position: 'absolute', top: 14, right: 14,
                    px: 1, py: 0.25, borderRadius: 999,
                    bgcolor: 'rgba(17,24,39,0.06)', color: 'var(--text-secondary)',
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}
                >
                  Snart
                </Box>
              )}
              <Box sx={{ width: 44, height: 44, borderRadius: 3, bgcolor: 'rgba(17,24,39,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2.25, color: 'var(--text)' }}>
                {action.title === 'Team' ? (
                  <Badge variant="dot" color="success" invisible={!hasDirectAccessTeam} sx={{ '& .MuiBadge-dot': { boxShadow: '0 0 0 2px #fff' } }}>
                    {action.icon}
                  </Badge>
                ) : action.icon}
              </Box>
              <Typography sx={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', mb: 0.75 }}>
                {action.title}
              </Typography>
              <Typography sx={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                {action.description}
              </Typography>
            </Paper>
          ))}
        </Box>

        {/* Kommande möten — kompakt lista */}
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1.5 }}>
          Kommande möten
        </Typography>
        {upcomingMeetings.length === 0 ? (
          <Box sx={{ py: 4, px: 2, textAlign: 'center', borderRadius: 3.5, bgcolor: 'rgba(17,24,39,0.02)', border: '1px dashed rgba(17,24,39,0.12)', mb: 4.5 }}>
            <Typography sx={{ color: 'var(--text-secondary)', fontSize: 14 }}>Inga kommande möten</Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mb: 4.5 }}>
            {upcomingMeetings.slice(0, 5).map((meeting) => {
              const timeUntil = getTimeUntilMeeting(meeting.start);
              const meetUrl = meeting.hangoutLink || meeting.conferenceUri;
              return (
                <Box
                  key={meeting.id}
                  sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2,
                    p: '14px 18px', borderRadius: 3.5, bgcolor: 'rgba(17,24,39,0.025)', border: '1px solid rgba(17,24,39,0.05)'
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }} noWrap>
                      {meeting.title || 'Untitled Meeting'}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: 'var(--text-secondary)', mt: 0.25 }} noWrap>
                      {formatDateTime(meeting.start)} · om {timeUntil}
                    </Typography>
                  </Box>
                  {meetUrl && (
                    <Button size="small" variant="contained" onClick={() => window.open(meetUrl, '_blank')} sx={{ bgcolor: 'var(--text)', borderRadius: 2.5, flexShrink: 0, '&:hover': { bgcolor: '#000' } }}>
                      Gå med
                    </Button>
                  )}
                </Box>
              );
            })}
          </Box>
        )}

        {/* Öppna möten — behållen från tidigare layout, egen sektion */}
        {leftMeetings.length > 0 && (
          <>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1.5 }}>
              Öppna möten
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {leftMeetings.map((meeting) => (
                <Box key={meeting.id} sx={{ p: '14px 18px', borderRadius: 3.5, bgcolor: 'rgba(17,24,39,0.025)', border: '1px solid rgba(17,24,39,0.05)' }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                    {meeting.groupName || 'Kalenderjämförelse'}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'var(--text-secondary)', mt: 0.25, mb: 1.25 }}>
                    Medlemmar: {meeting.members.join(', ')}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" variant="contained" onClick={() => window.location.href = `/?group=${meeting.id}`} sx={{ bgcolor: 'var(--text)', borderRadius: 2.5, '&:hover': { bgcolor: '#000' } }}>
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
                      sx={{ borderColor: 'var(--border)', color: 'var(--text)', borderRadius: 2.5 }}
                    >
                      Stäng möte
                    </Button>
                  </Box>
                </Box>
              ))}
            </Box>
          </>
        )}
      </Container>

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
          backgroundColor: 'var(--text)',
          color: 'var(--surface-strong)',
          boxShadow: '0 14px 30px rgba(15, 23, 42, 0.18)',
          zIndex: 1200,
          '&:hover': {
            backgroundColor: '#000000',
            boxShadow: '0 18px 36px rgba(15, 23, 42, 0.24)',
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
              backgroundColor: 'rgba(255,255,255,0.88)',
              borderRadius: 4,
              border: '1px solid var(--border)',
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18)',
              backdropFilter: 'blur(20px)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <Box sx={{ p: 3, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em' }}>
                Notifikationer
              </Typography>
              <IconButton onClick={() => setSidebarOpen(false)} size="small" sx={{ color: 'var(--text)' }}>
                <CloseIcon />
              </IconButton>
            </Box>

            {/* Tabs */}
            <Box sx={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
              <Button
                onClick={() => setSidebarTab('invitations')}
                sx={{
                  flex: 1,
                  py: 2,
                  borderRadius: 0,
                  borderBottom: sidebarTab === 'invitations' ? '2px solid var(--text)' : 'none',
                  color: sidebarTab === 'invitations' ? 'var(--text)' : 'var(--text-secondary)',
                  fontWeight: sidebarTab === 'invitations' ? 700 : 500,
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
                  borderBottom: sidebarTab === 'proposals' ? '2px solid var(--text)' : 'none',
                  color: sidebarTab === 'proposals' ? 'var(--text)' : 'var(--text-secondary)',
                  fontWeight: sidebarTab === 'proposals' ? 700 : 500,
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
                  <Typography variant="subtitle2" sx={{ mb: 2, color: 'var(--text-secondary)' }}>
                    Inbjudningar till kalenderjämförelse
                  </Typography>
                  {invites.length === 0 ? (
                    <Typography variant="body2" sx={{ color: 'var(--text-secondary)', textAlign: 'center', mt: 4 }}>
                      Inga inbjudningar just nu
                    </Typography>
                  ) : (
                    invites.map((invitation) => (
                      <Paper
                        key={invitation.id}
                        sx={{
                          p: 2,
                          mb: 2,
                          borderRadius: 3,
                          border: '1px solid rgba(17,24,39,0.06)',
                          bgcolor: 'rgba(17,24,39,0.025)',
                          boxShadow: 'none',
                          '&:hover': { boxShadow: '0 12px 30px rgba(15,23,42,0.06)' }
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 700, mb: 1, color: 'var(--text)' }}>
                          {invitation.fromName || invitation.fromEmail}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'var(--text-secondary)', display: 'block', mb: 1 }}>
                          {invitation.type === 'contact_request' ? 'Vill lägga till dig som kontakt' : 'Vill jämföra kalendrar med dig'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                          {new Date(invitation.createdAt).toLocaleDateString() + ' ' + new Date(invitation.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                        <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                          {invitation.type === 'contact_request' ? (
                            <>
                              <Button 
                                size="small" 
                                variant="contained" 
                                sx={{ fontSize: 12, bgcolor: 'var(--text)', '&:hover': { bgcolor: '#000' } }}
                                onClick={() => handleInviteResponse(invitation.id, null, 'accept')}
                              >
                                Acceptera
                              </Button>
                              <Button 
                                size="small" 
                                variant="outlined" 
                                sx={{ fontSize: 12, borderColor: 'var(--border)', color: 'var(--text)' }}
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
                                sx={{ fontSize: 12, bgcolor: 'var(--text)', '&:hover': { bgcolor: '#000' } }}
                                onClick={() => window.location.href = `/?group=${invitation.groupId}&invitee=${invitation.inviteeId}`}
                              >
                                Gå med
                              </Button>
                              <Button 
                                size="small" 
                                variant="outlined" 
                                sx={{ fontSize: 12, borderColor: 'var(--border)', color: 'var(--text)' }}
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
                  <Typography variant="subtitle2" sx={{ mb: 2, color: 'var(--text-secondary)' }}>
                    Tidsförslag du har fått
                  </Typography>
                  {timeProposals.length === 0 ? (
                    <Typography variant="body2" sx={{ color: 'var(--text-secondary)', textAlign: 'center', mt: 4 }}>
                      Inga tidsförslag just nu
                    </Typography>
                  ) : (
                    timeProposals.map((proposal) => (
                      <Paper
                        key={proposal.id}
                        sx={{
                          p: 2,
                          mb: 2,
                          borderRadius: 3,
                          border: '1px solid rgba(17,24,39,0.06)',
                          bgcolor: 'rgba(17,24,39,0.025)',
                          boxShadow: 'none',
                          '&:hover': { boxShadow: '0 12px 30px rgba(15,23,42,0.06)' }
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 700, mb: 1, color: 'var(--text)' }}>
                          {proposal.title || 'Mötesförslag'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'var(--text-secondary)', display: 'block', fontWeight: 600, mb: 1 }}>
                          {formatProposalDateTime(proposal)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'var(--text-secondary)', display: 'block' }}>
                          Från: {proposal.fromEmail}
                        </Typography>
                        <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                          <Button 
                            size="small" 
                            variant="contained" 
                            sx={{ fontSize: 12, bgcolor: 'var(--text)', '&:hover': { bgcolor: '#000' } }}
                            onClick={() => handleProposalResponse(proposal.id, 'accept')}
                          >
                            Acceptera
                          </Button>
                          <Button 
                            size="small" 
                            variant="outlined" 
                            sx={{ fontSize: 12, borderColor: 'var(--border)', color: 'var(--text)' }}
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