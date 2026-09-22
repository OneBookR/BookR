import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Container, Typography, Box, Button, Card, CardContent, Grid, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions, Paper, Snackbar, Alert,
  Switch, FormControlLabel, Chip, Autocomplete, Checkbox, Tabs, Tab, Avatar,
  CircularProgress
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';
import GroupsIcon from '@mui/icons-material/Groups';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditIcon from '@mui/icons-material/Edit';
import CheckBoxOutlineBlank from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBox from '@mui/icons-material/CheckBox';
import NotificationsIcon from '@mui/icons-material/Notifications';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/Link';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import BoltIcon from '@mui/icons-material/Bolt';
import { apiRequest } from '../utils/apiConfig.js';

const icon = <CheckBoxOutlineBlank fontSize="small" />;
const checkedIcon = <CheckBox fontSize="small" />;

export default function Team({ user, onNavigateBack }) {
  const [currentTab, setCurrentTab] = useState(0);
  const [contacts, setContacts] = useState([]);
  const [teams, setTeams] = useState([]);
  const [newContact, setNewContact] = useState({ name: '', email: '' });
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [newTeam, setNewTeam] = useState({ name: '', area: '', members: [] });
  const [editingTeam, setEditingTeam] = useState(null);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [loading, setLoading] = useState(true);

  // ✅ Direktåtkomst — riktig, backend-synkad relation (Firestore), till
  // skillnad från contacts/teams ovan som förblir en lokal adressbok.
  const [directAccessRequests, setDirectAccessRequests] = useState({ received: [], sent: [] });
  const [directAccessLinks, setDirectAccessLinks] = useState([]);
  const [directAccessBusyEmail, setDirectAccessBusyEmail] = useState(null); // vilken rad som just nu laddar
  const [calendarLinkPrompt, setCalendarLinkPrompt] = useState(null); // { returnTo } | null

  const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0];

  const linkedEmails = useMemo(
    () => new Set(directAccessLinks.map(l => l.withEmail?.toLowerCase())),
    [directAccessLinks]
  );
  const pendingSentEmails = useMemo(
    () => new Set(directAccessRequests.sent.map(r => r.toEmail?.toLowerCase())),
    [directAccessRequests.sent]
  );

  const loadDirectAccessData = useCallback(() => {
    apiRequest('/api/direct-access/requests')
      .then(res => (res.ok ? res.json() : { received: [], sent: [] }))
      .then(data => setDirectAccessRequests({ received: data.received || [], sent: data.sent || [] }))
      .catch(() => {});
    apiRequest('/api/direct-access/links')
      .then(res => (res.ok ? res.json() : { links: [] }))
      .then(data => setDirectAccessLinks(data.links || []))
      .catch(() => {});
  }, []);

  // Load contacts + teams (lokal adressbok) och direktåtkomst (backend)
  useEffect(() => {
    if (userEmail) {
      setLoading(true);
      const savedContacts = JSON.parse(localStorage.getItem(`bookr_team_contacts_${userEmail}`) || '[]');
      const savedTeams = JSON.parse(localStorage.getItem(`bookr_teams_${userEmail}`) || '[]');
      setContacts(savedContacts);
      setTeams(savedTeams);
      setLoading(false);
      loadDirectAccessData();
    }
  }, [userEmail, loadDirectAccessData]);

  // ✅ Läser ?tab= och ?directAccessLink= från URL:en — den senare kommer
  // tillbaka från /auth/google|microsoft/direct-access-kopplingen (se
  // server.js). Städar bort båda ur URL:en efter läsning.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'requests') setCurrentTab(2);
    else if (tab === 'teams') setCurrentTab(1);
    else if (tab === 'direct-access') setCurrentTab(3);

    const linkResult = params.get('directAccessLink');
    if (linkResult) {
      const messages = {
        success: { message: 'Kalendern kopplad! Du kan nu skicka eller acceptera direktåtkomst.', severity: 'success' },
        failed: { message: 'Kunde inte koppla kalendern. Försök igen.', severity: 'error' },
        noRefreshToken: { message: 'Google gav ingen ny åtkomst — gå till myaccount.google.com/permissions, ta bort BookR och försök igen.', severity: 'error' },
        emailMismatch: { message: 'Kopplingen gällde en annan e-postadress än ditt BookR-konto.', severity: 'error' },
        saveFailed: { message: 'Kalendern kopplades men kunde inte sparas. Försök igen.', severity: 'error' },
      };
      const result = messages[linkResult] || { message: 'Något gick fel vid kopplingen.', severity: 'error' };
      setToast({ open: true, ...result });
      if (linkResult === 'success') loadDirectAccessData();
    }

    if (tab || linkResult) {
      params.delete('tab');
      params.delete('directAccessLink');
      const newSearch = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Startar den engångskoppling av kalendern som krävs innan man kan
  // skicka ELLER acceptera en direktåtkomst-förfrågan (se NEEDS_CALENDAR_LINK
  // i server.js). tabParam avgör var man hamnar tillbaka efteråt.
  const startCalendarLink = (tabParam) => {
    const provider = user?.provider === 'microsoft' ? 'microsoft' : 'google';
    const returnTo = encodeURIComponent(`/?view=team&tab=${tabParam}`);
    window.location.href = `/auth/${provider}/direct-access?returnTo=${returnTo}`;
  };

  const handleRequestDirectAccess = async (toEmail) => {
    setDirectAccessBusyEmail(toEmail);
    try {
      const res = await apiRequest('/api/direct-access/request', {
        method: 'POST',
        body: JSON.stringify({ toEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setToast({ open: true, message: `Förfrågan skickad till ${toEmail}`, severity: 'success' });
        loadDirectAccessData();
      } else if (data.code === 'NEEDS_CALENDAR_LINK') {
        setCalendarLinkPrompt({ tabParam: 'contacts' });
      } else {
        setToast({ open: true, message: data.error || 'Kunde inte skicka förfrågan', severity: 'error' });
      }
    } catch {
      setToast({ open: true, message: 'Kunde inte skicka förfrågan', severity: 'error' });
    } finally {
      setDirectAccessBusyEmail(null);
    }
  };

  const handleRespondDirectAccessRequest = async (requestId, response) => {
    setDirectAccessBusyEmail(requestId);
    try {
      const res = await apiRequest(`/api/direct-access/requests/${requestId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ response }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setToast({ open: true, message: response === 'accept' ? 'Direktåtkomst aktiverad!' : 'Förfrågan nekad', severity: response === 'accept' ? 'success' : 'info' });
        loadDirectAccessData();
      } else if (data.code === 'NEEDS_CALENDAR_LINK') {
        setCalendarLinkPrompt({ tabParam: 'requests' });
      } else {
        setToast({ open: true, message: data.error || 'Kunde inte besvara förfrågan', severity: 'error' });
      }
    } catch {
      setToast({ open: true, message: 'Kunde inte besvara förfrågan', severity: 'error' });
    } finally {
      setDirectAccessBusyEmail(null);
    }
  };

  const handleRevokeDirectAccess = async (withEmail) => {
    setDirectAccessBusyEmail(withEmail);
    try {
      const res = await apiRequest('/api/direct-access/links/revoke', {
        method: 'POST',
        body: JSON.stringify({ withEmail }),
      });
      if (res.ok) {
        setToast({ open: true, message: 'Direktåtkomst avstängd', severity: 'info' });
        loadDirectAccessData();
      } else {
        setToast({ open: true, message: 'Kunde inte stänga av direktåtkomst', severity: 'error' });
      }
    } catch {
      setToast({ open: true, message: 'Kunde inte stänga av direktåtkomst', severity: 'error' });
    } finally {
      setDirectAccessBusyEmail(null);
    }
  };

  // Startar en kalenderjämförelse DIREKT (inga inbjudningar) med en eller
  // flera personer man redan har aktiv direktåtkomst med.
  const startDirectSession = async (emails, groupName) => {
    setToast({ open: true, message: 'Öppnar kalendrarna...', severity: 'info' });
    try {
      const res = await apiRequest('/api/direct-access/start-session', {
        method: 'POST',
        body: JSON.stringify({ emails, groupName }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.groupId) {
        window.location.href = `/?group=${data.groupId}`;
      } else {
        setToast({ open: true, message: data.error || 'Kunde inte öppna kalendrarna', severity: 'error' });
      }
    } catch {
      setToast({ open: true, message: 'Kunde inte öppna kalendrarna', severity: 'error' });
    }
  };

  // --- Contact Management ---
  const handleAddContact = async () => {
    if (!newContact.name.trim() || !newContact.email.trim()) {
      setToast({ open: true, message: 'Fyll i både namn och e-post', severity: 'error' });
      return;
    }
    if (contacts.some(c => c.email.toLowerCase() === newContact.email.toLowerCase())) {
      setToast({ open: true, message: 'Kontakten finns redan', severity: 'error' });
      return;
    }
    const updatedContacts = [...contacts, { ...newContact, id: Date.now(), directAccess: false }];
    localStorage.setItem(`bookr_team_contacts_${userEmail}`, JSON.stringify(updatedContacts));
    setContacts(updatedContacts);

    // OBS: att lägga till en kontakt skickar INTE någon kontaktförfrågan
    // längre. Förfråge-/direktåtkomst-flödet är inte färdigutvecklat, och
    // den gamla fallbacken skrev en pending request i mottagarens
    // localStorage vilket fick det att se ut som att de bjudit in dig.
    setNewContact({ name: '', email: '' });
    setAddContactOpen(false);
    setToast({ open: true, message: 'Kontakt sparad', severity: 'success' });
  };

  const handleDeleteContact = (contactId) => {
    const updatedContacts = contacts.filter(c => c.id !== contactId);
    localStorage.setItem(`bookr_team_contacts_${userEmail}`, JSON.stringify(updatedContacts));
    setContacts(updatedContacts);
    setToast({ open: true, message: 'Kontakt borttagen', severity: 'info' });
  };

  // --- Team Management ---
  const handleOpenEditDialog = (team) => {
    setEditingTeam(team);
    setNewTeam({ name: team.name, area: team.area, members: team.members });
    setCreateTeamOpen(true);
  };

  const handleCloseTeamDialog = () => {
    setCreateTeamOpen(false);
    setEditingTeam(null);
    setNewTeam({ name: '', area: '', members: [] });
  };

  const handleSaveTeam = () => {
    if (!newTeam.name.trim() || newTeam.members.length === 0) {
      setToast({ open: true, message: 'Teamnamn och minst en medlem krävs', severity: 'error' });
      return;
    }

    let updatedTeams;
    if (editingTeam) {
      // Update existing team
      updatedTeams = teams.map(t =>
        t.id === editingTeam.id ? { ...t, ...newTeam } : t
      );
      setToast({ open: true, message: 'Team uppdaterat!', severity: 'success' });
    } else {
      // Create new team
      updatedTeams = [...teams, { ...newTeam, id: Date.now() }];
      setToast({ open: true, message: 'Team skapat!', severity: 'success' });
    }

    localStorage.setItem(`bookr_teams_${userEmail}`, JSON.stringify(updatedTeams));
    setTeams(updatedTeams);
    handleCloseTeamDialog();
  };

  const handleDeleteTeam = (teamId) => {
    const updatedTeams = teams.filter(t => t.id !== teamId);
    localStorage.setItem(`bookr_teams_${userEmail}`, JSON.stringify(updatedTeams));
    setTeams(updatedTeams);
    setToast({ open: true, message: 'Team borttaget', severity: 'info' });
  };

  // ✅ Om avsändaren har aktiv direktåtkomst till ALLA medlemmar: gå rakt
  // in i en gemensam kalenderjämförelse — inga inbjudningar, inget
  // väntande. Annars: dagens beteende (riktiga mejlinbjudningar).
  const handleStartComparison = async (team) => {
    const memberEmails = team.members.map(m => m.email);
    const allHaveDirectAccess = memberEmails.every(e => linkedEmails.has(e.toLowerCase()));

    if (allHaveDirectAccess) {
      await startDirectSession(memberEmails, `${team.name} - Kalenderjämförelse`);
      return;
    }

    setToast({ open: true, message: 'Startar kalenderjämförelse...', severity: 'info' });

    try {
      // Skapa grupp via samma API-konfiguration som resten av BookR använder.
      const response = await apiRequest('/api/invite', {
        method: 'POST',
        body: JSON.stringify({
          emails: memberEmails,
          fromUser: userEmail,
          groupName: `${team.name} - Kalenderjämförelse`,
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.groupId) {
        setToast({
          open: true,
          message: `Kalenderjämförelse startad! Inbjudningar skickade till ${memberEmails.length} medlemmar.`,
          severity: 'success'
        });

        // Navigera till kalenderjämförelsen
        const params = new URLSearchParams();
        params.append('group', data.groupId);
        params.append('teamName', team.name);
        memberEmails.forEach(email => params.append('contactEmail', email));

        setTimeout(() => {
          window.location.href = `/?${params.toString()}`;
        }, 1500);
      } else {
        setToast({ open: true, message: 'Kunde inte skapa kalenderjämförelse', severity: 'error' });
      }
    } catch (err) {
      console.error('Error starting team comparison:', err);
      setToast({ open: true, message: 'Fel vid start av kalenderjämförelse', severity: 'error' });
    }
  };

  const pageCardSx = {
    borderRadius: 4,
    border: '1px solid var(--border)',
    bgcolor: 'rgba(255,255,255,0.78)',
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)',
    backdropFilter: 'blur(18px)'
  };

  const subduedPanelSx = {
    p: 2,
    borderRadius: 3,
    bgcolor: 'rgba(17,24,39,0.03)',
    border: '1px solid rgba(17,24,39,0.05)'
  };

  const primaryButtonSx = {
    borderRadius: 3,
    bgcolor: 'var(--text)',
    color: 'var(--surface-strong)',
    fontWeight: 700,
    textTransform: 'none',
    boxShadow: 'none',
    '&:hover': {
      bgcolor: '#000000',
      boxShadow: 'none'
    }
  };

  const secondaryButtonSx = {
    borderRadius: 3,
    borderColor: 'rgba(17,24,39,0.08)',
    color: 'var(--text)',
    textTransform: 'none',
    '&:hover': {
      borderColor: 'rgba(17,24,39,0.16)',
      bgcolor: 'rgba(17,24,39,0.03)'
    }
  };

  return (
    <>
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        {/* Header Banner */}
        <Box sx={{
          ...pageCardSx,
          p: { xs: 3, md: 4 },
          mb: 6,
          position: 'relative'
        }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={onNavigateBack}
            sx={{ ...secondaryButtonSx, mb: 3 }}
          >
            Tillbaka
          </Button>

          <Chip
            label="Team Space"
            sx={{
              mb: 2,
              bgcolor: 'rgba(17,24,39,0.04)',
              border: '1px solid rgba(17,24,39,0.06)',
              color: 'var(--text)',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase'
            }}
          />
          
          <Typography variant="h3" sx={{ 
            fontWeight: 800,
            letterSpacing: '-0.05em',
            color: 'var(--text)',
            mb: 1,
            fontSize: { xs: '2rem', md: '3rem' },
            lineHeight: 0.98,
            maxWidth: 760
          }}>
            Hantera kontakter och grupper i samma lugna BookR-flöde.
          </Typography>
          <Typography variant="h6" sx={{ 
            color: 'var(--text-secondary)',
            fontWeight: 400,
            fontSize: { xs: 16, md: 18 },
            lineHeight: 1.4,
            maxWidth: 760
          }}>
            Samla dina kontakter, bygg återkommande grupper och starta kalenderjämförelser utan att lämna samma visuella språk som resten av BookR.
          </Typography>
        </Box>

        {/* Tabs */}
        <Box sx={{ ...pageCardSx, p: 1, mb: 4 }}>
          <Tabs
            value={currentTab}
            onChange={(e, newValue) => setCurrentTab(newValue)}
            variant="scrollable"
            allowScrollButtonsMobile
            sx={{
              minHeight: 56,
              '& .MuiTabs-indicator': {
                height: '100%',
                borderRadius: 3,
                bgcolor: 'rgba(17,24,39,0.06)',
                zIndex: 0
              }
            }}
          >
            <Tab label={`Kontakter (${contacts.length})`} icon={<PersonIcon />} sx={{ minHeight: 56, zIndex: 1, textTransform: 'none', fontWeight: 700, color: 'var(--text)' }} />
            <Tab label={`Team (${teams.length})`} icon={<GroupsIcon />} sx={{ minHeight: 56, zIndex: 1, textTransform: 'none', fontWeight: 700, color: 'var(--text)' }} />
            <Tab label={`Förfrågningar (${directAccessRequests.received.length})`} icon={<NotificationsIcon />} sx={{ minHeight: 56, zIndex: 1, textTransform: 'none', fontWeight: 700, color: 'var(--text)' }} />
            <Tab label={`Direktåtkomst (${directAccessLinks.length})`} icon={<LinkIcon />} sx={{ minHeight: 56, zIndex: 1, textTransform: 'none', fontWeight: 700, color: 'var(--text)' }} />
          </Tabs>
        </Box>

        {/* Contacts Tab */}
        {currentTab === 0 && (
          <Box>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setAddContactOpen(true)}
              sx={{ ...primaryButtonSx, mb: 3 }}
            >
              Lägg till kontakt
            </Button>

            {loading ? (
              <Typography>Laddar kontakter...</Typography>
            ) : contacts.length === 0 ? (
              <Card sx={{ ...pageCardSx, p: 4, textAlign: 'center' }}>
                <PersonIcon sx={{ fontSize: 48, color: 'rgba(17,24,39,0.18)', mb: 2 }} />
                <Typography variant="h6" sx={{ color: 'var(--text)', fontWeight: 700 }}>Inga kontakter än</Typography>
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 2 }}>Lägg till teammedlemmar för att enkelt kunna bjuda in dem till möten.</Typography>
              </Card>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {contacts.map((contact) => {
                  const emailKey = contact.email?.toLowerCase();
                  const isLinked = linkedEmails.has(emailKey);
                  const isPending = pendingSentEmails.has(emailKey);
                  const isBusy = directAccessBusyEmail === contact.email;
                  return (
                    <Paper
                      key={contact.id}
                      sx={{
                        ...pageCardSx,
                        p: 3,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 2,
                        flexWrap: 'wrap'
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                          <Avatar sx={{ width: 36, height: 36, bgcolor: 'rgba(17,24,39,0.08)', color: 'var(--text)' }}>
                            {contact.name?.charAt(0)?.toUpperCase() || '?'}
                          </Avatar>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--text)' }}>
                            {contact.name}
                          </Typography>
                          {isLinked && (
                            <Chip
                              size="small"
                              icon={<LinkIcon sx={{ fontSize: 14 }} />}
                              label="Direktåtkomst aktiv"
                              sx={{ bgcolor: 'rgba(31,122,77,0.1)', color: 'var(--success)', fontWeight: 700, border: 'none' }}
                            />
                          )}
                          {!isLinked && isPending && (
                            <Chip
                              size="small"
                              icon={<HourglassTopIcon sx={{ fontSize: 14 }} />}
                              label="Väntar på svar"
                              sx={{ bgcolor: 'rgba(17,24,39,0.05)', color: 'var(--text-secondary)', fontWeight: 700, border: 'none' }}
                            />
                          )}
                        </Box>
                        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                          {contact.email}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        {isLinked ? (
                          <>
                            <Button
                              variant="contained"
                              size="small"
                              startIcon={<BoltIcon />}
                              disabled={isBusy}
                              onClick={() => startDirectSession([contact.email], `Möte med ${contact.name}`)}
                              sx={primaryButtonSx}
                            >
                              Boka möte direkt
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              disabled={isBusy}
                              onClick={() => handleRevokeDirectAccess(contact.email)}
                              sx={secondaryButtonSx}
                            >
                              Stäng av
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={isBusy ? <CircularProgress size={14} /> : <LinkIcon />}
                            disabled={isPending || isBusy}
                            onClick={() => handleRequestDirectAccess(contact.email)}
                            sx={secondaryButtonSx}
                          >
                            {isPending ? 'Väntar på svar' : 'Begär direktåtkomst'}
                          </Button>
                        )}
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() => handleDeleteContact(contact.id)}
                          sx={{ ...secondaryButtonSx, color: 'var(--error)', borderColor: 'rgba(180,35,24,0.18)' }}
                        >
                          Ta bort
                        </Button>
                      </Box>
                    </Paper>
                  );
                })}
              </Box>
            )}
          </Box>
        )}

        {/* Teams Tab */}
        {currentTab === 1 && (
          <Box>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateTeamOpen(true)}
              sx={{ ...primaryButtonSx, mb: 3 }}
            >
              Skapa team
            </Button>

            {loading ? (
              <Typography>Laddar team...</Typography>
            ) : teams.length === 0 ? (
              <Card sx={{ ...pageCardSx, p: 4, textAlign: 'center' }}>
                <GroupsIcon sx={{ fontSize: 48, color: 'rgba(17,24,39,0.18)', mb: 2 }} />
                <Typography variant="h6" sx={{ color: 'var(--text)', fontWeight: 700 }}>Inga team än</Typography>
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 2 }}>Skapa ett team för att enkelt bjuda in flera personer.</Typography>
                <Button variant="contained" onClick={() => setCreateTeamOpen(true)} sx={primaryButtonSx}>Skapa ditt första team</Button>
              </Card>
            ) : (
              <Grid container spacing={3}>
                {teams.map(team => {
                  const allHaveDirectAccess = team.members.every(member => linkedEmails.has(member.email?.toLowerCase()));
                  return (
                    <Grid item xs={12} sm={6} md={4} key={team.id}>
                      <Card sx={{ ...pageCardSx, p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <CardContent sx={{ flexGrow: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                             <Typography variant="h6" sx={{ fontWeight: 700, mr: 1, color: 'var(--text)' }}>{team.name}</Typography>
                             {allHaveDirectAccess && <CheckCircleIcon color="success" fontSize="small" />}
                          </Box>
                          <Chip label={team.area || 'Inget område'} size="small" sx={{ mb: 2, bgcolor: 'rgba(17,24,39,0.04)', color: 'var(--text)', border: '1px solid rgba(17,24,39,0.06)' }} />
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {team.members.map(m => <Chip key={m.email} label={m.name} size="small" variant="outlined" sx={{ borderColor: 'rgba(17,24,39,0.08)', color: 'var(--text-secondary)' }} />)}
                          </Box>
                        </CardContent>
                        <Box sx={{ p: 2, pt: 0, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          <Button variant="contained" size="small" startIcon={allHaveDirectAccess ? <BoltIcon /> : undefined} onClick={() => handleStartComparison(team)} sx={primaryButtonSx}>
                            {allHaveDirectAccess ? 'Boka direkt' : 'Starta jämföring'}
                          </Button>
                          <Button variant="outlined" size="small" onClick={() => handleOpenEditDialog(team)} sx={secondaryButtonSx}>Redigera</Button>
                          <Button variant="outlined" color="error" size="small" onClick={() => handleDeleteTeam(team.id)} sx={{ ...secondaryButtonSx, color: 'var(--error)', borderColor: 'rgba(180,35,24,0.18)' }}>Ta bort</Button>
                        </Box>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            )}
          </Box>
        )}

        {/* Direktåtkomst-förfrågningar */}
        {currentTab === 2 && (
          <Box>
            {directAccessRequests.received.length === 0 && directAccessRequests.sent.length === 0 ? (
              <Card sx={{ ...pageCardSx, p: 4, textAlign: 'center' }}>
                <NotificationsIcon sx={{ fontSize: 48, color: 'rgba(17,24,39,0.18)', mb: 2 }} />
                <Typography variant="h6" sx={{ color: 'var(--text)', fontWeight: 700 }}>Inga förfrågningar</Typography>
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>Du har inga väntande förfrågningar om direktåtkomst.</Typography>
              </Card>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {directAccessRequests.received.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 2, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 12.5 }}>
                      Väntar på dig
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {directAccessRequests.received.map((request) => (
                        <Paper key={request.id} sx={{ ...pageCardSx, p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--text)' }}>
                              {request.fromEmail}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                              Vill ha direktåtkomst till din kalender
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                              variant="contained"
                              size="small"
                              startIcon={directAccessBusyEmail === request.id ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <CheckIcon />}
                              disabled={directAccessBusyEmail === request.id}
                              onClick={() => handleRespondDirectAccessRequest(request.id, 'accept')}
                              sx={primaryButtonSx}
                            >
                              Acceptera
                            </Button>
                            <Button
                              variant="outlined"
                              color="error"
                              size="small"
                              startIcon={<CloseIcon />}
                              disabled={directAccessBusyEmail === request.id}
                              onClick={() => handleRespondDirectAccessRequest(request.id, 'decline')}
                              sx={{ ...secondaryButtonSx, color: 'var(--error)', borderColor: 'rgba(180,35,24,0.18)' }}
                            >
                              Neka
                            </Button>
                          </Box>
                        </Paper>
                      ))}
                    </Box>
                  </Box>
                )}

                {directAccessRequests.sent.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 2, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 12.5 }}>
                      Skickade — väntar på svar
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {directAccessRequests.sent.map((request) => (
                        <Paper key={request.id} sx={{ ...pageCardSx, p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--text)' }}>
                              {request.toEmail}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                              Har inte svarat än
                            </Typography>
                          </Box>
                          <Chip size="small" icon={<HourglassTopIcon sx={{ fontSize: 14 }} />} label="Väntar" sx={{ bgcolor: 'rgba(17,24,39,0.05)', color: 'var(--text-secondary)', fontWeight: 700 }} />
                        </Paper>
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )}

        {/* Direktåtkomst — vem du är kopplad med. Ömsesidigt: samma lista
            svarar på "vem har jag åtkomst till" OCH "vem har åtkomst till
            mig" — det är en och samma relation åt båda hållen. */}
        {currentTab === 3 && (
          <Box>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 3, maxWidth: 560 }}>
              Ömsesidigt — ni har full åtkomst till varandras kalendrar. Ingen aktiveras utan att båda har godkänt,
              och du kan stänga av när som helst.
            </Typography>
            {directAccessLinks.length === 0 ? (
              <Card sx={{ ...pageCardSx, p: 4, textAlign: 'center' }}>
                <LinkIcon sx={{ fontSize: 48, color: 'rgba(17,24,39,0.18)', mb: 2 }} />
                <Typography variant="h6" sx={{ color: 'var(--text)', fontWeight: 700 }}>Ingen direktåtkomst aktiv än</Typography>
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                  Begär direktåtkomst från en kontakt under Kontakter-fliken för att komma igång.
                </Typography>
              </Card>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {directAccessLinks.map((link) => {
                  const matchedContact = contacts.find(c => c.email?.toLowerCase() === link.withEmail?.toLowerCase());
                  const isBusy = directAccessBusyEmail === link.withEmail;
                  return (
                    <Paper key={link.pairKey} sx={{ ...pageCardSx, p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                        <Avatar sx={{ width: 36, height: 36, bgcolor: 'rgba(31,122,77,0.12)', color: 'var(--success)' }}>
                          {(matchedContact?.name || link.withEmail)?.charAt(0)?.toUpperCase() || '?'}
                        </Avatar>
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--text)' }}>
                            {matchedContact?.name || link.withEmail}
                          </Typography>
                          <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                            {matchedContact?.name ? link.withEmail : 'Ömsesidig direktåtkomst'}
                            {link.createdAt && ` · Sedan ${new Date(link.createdAt).toLocaleDateString('sv-SE')}`}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<BoltIcon />}
                          disabled={isBusy}
                          onClick={() => startDirectSession([link.withEmail], `Möte med ${matchedContact?.name || link.withEmail}`)}
                          sx={primaryButtonSx}
                        >
                          Boka möte direkt
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          disabled={isBusy}
                          onClick={() => handleRevokeDirectAccess(link.withEmail)}
                          sx={secondaryButtonSx}
                        >
                          Stäng av
                        </Button>
                      </Box>
                    </Paper>
                  );
                })}
              </Box>
            )}
          </Box>
        )}
      </Container>

      {/* Direktåtkomst kräver en engångskoppling av kalendern (offline-samtycke) */}
      <Dialog open={Boolean(calendarLinkPrompt)} onClose={() => setCalendarLinkPrompt(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { ...pageCardSx, bgcolor: 'rgba(255,255,255,0.96)' } }}>
        <DialogTitle>Koppla din kalender</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Direktåtkomst kräver en extra, engångskoppling av din kalender — så BookR kan hämta lediga tider åt dig
            utan att du behöver vara inloggad varje gång. Tar tio sekunder, och du kan stänga av det när du vill.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCalendarLinkPrompt(null)} sx={secondaryButtonSx}>Avbryt</Button>
          <Button
            variant="contained"
            onClick={() => startCalendarLink(calendarLinkPrompt?.tabParam || 'contacts')}
            sx={primaryButtonSx}
          >
            Koppla kalender
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Contact Dialog */}
      <Dialog open={addContactOpen} onClose={() => setAddContactOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { ...pageCardSx, bgcolor: 'rgba(255,255,255,0.94)' } }}>
        <DialogTitle>Lägg till ny teamkontakt</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Namn"
            fullWidth
            variant="outlined"
            value={newContact.name}
            onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
            sx={{ mt: 1 }}
          />
          <TextField
            margin="dense"
            label="E-postadress"
            type="email"
            fullWidth
            variant="outlined"
            value={newContact.email}
            onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddContactOpen(false)} sx={secondaryButtonSx}>Avbryt</Button>
          <Button onClick={handleAddContact} variant="contained" sx={primaryButtonSx}>Lägg till</Button>
        </DialogActions>
      </Dialog>

      {/* Create/Edit Team Dialog */}
      <Dialog open={createTeamOpen} onClose={handleCloseTeamDialog} maxWidth="sm" fullWidth PaperProps={{ sx: { ...pageCardSx, bgcolor: 'rgba(255,255,255,0.94)' } }}>
        <DialogTitle>{editingTeam ? 'Redigera team' : 'Skapa nytt team'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Teamnamn"
            fullWidth
            variant="outlined"
            value={newTeam.name}
            onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
            sx={{ mt: 1 }}
          />
          <TextField
            margin="dense"
            label="Område (t.ex. 'Projekt X', 'Ledningsgrupp')"
            fullWidth
            variant="outlined"
            value={newTeam.area}
            onChange={(e) => setNewTeam({ ...newTeam, area: e.target.value })}
          />
          <Autocomplete
            multiple
            options={contacts}
            disableCloseOnSelect
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, value) => option.email === value.email}
            value={newTeam.members}
            onChange={(event, newValue) => {
              setNewTeam({ ...newTeam, members: newValue });
            }}
            renderOption={(props, option, { selected }) => (
              <li {...props}>
                <Checkbox
                  icon={icon}
                  checkedIcon={checkedIcon}
                  style={{ marginRight: 8 }}
                  checked={selected}
                />
                {option.name} ({option.email})
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Välj medlemmar"
                placeholder="Kontakter"
              />
            )}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseTeamDialog} sx={secondaryButtonSx}>Avbryt</Button>
          <Button onClick={handleSaveTeam} variant="contained" sx={primaryButtonSx}>
            {editingTeam ? 'Uppdatera' : 'Skapa team'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToast({ ...toast, open: false })}
          severity={toast.severity}
          sx={{ width: '100%' }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
}