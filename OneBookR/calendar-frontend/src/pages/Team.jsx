import React, { useState, useEffect } from 'react';
import {
  Container, Typography, Box, Button, Card, CardContent, Grid, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions, Paper, Snackbar, Alert,
  Switch, FormControlLabel, Chip, Autocomplete, Checkbox, Tabs, Tab, Avatar
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
import { apiRequest } from '../utils/apiConfig.js';

const icon = <CheckBoxOutlineBlank fontSize="small" />;
const checkedIcon = <CheckBox fontSize="small" />;

export default function Team({ user, onNavigateBack }) {
  const [currentTab, setCurrentTab] = useState(0);
  const [contacts, setContacts] = useState([]);
  const [teams, setTeams] = useState([]);
  const [contactRequests, setContactRequests] = useState([]);
  const [newContact, setNewContact] = useState({ name: '', email: '' });
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [newTeam, setNewTeam] = useState({ name: '', area: '', members: [] });
  const [editingTeam, setEditingTeam] = useState(null);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [loading, setLoading] = useState(true);

  const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0];

  // Load contacts, teams and contact requests from localStorage
  useEffect(() => {
    if (userEmail) {
      setLoading(true);
      const savedContacts = JSON.parse(localStorage.getItem(`bookr_team_contacts_${userEmail}`) || '[]');
      const savedTeams = JSON.parse(localStorage.getItem(`bookr_teams_${userEmail}`) || '[]');
      const savedRequests = JSON.parse(localStorage.getItem(`bookr_contact_requests_${userEmail}`) || '[]');
      setContacts(savedContacts);
      setTeams(savedTeams);
      setContactRequests(savedRequests);
      setLoading(false);
    }
  }, [userEmail]);

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
    
    // Skicka kontaktförfrågan via BookR backend
    try {
      await fetch('https://www.onebookr.se/api/contact-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromEmail: userEmail,
          fromName: user.displayName || userEmail,
          toEmail: newContact.email,
          toName: newContact.name,
          message: `${user.displayName || userEmail} vill lägga till dig som kontakt i BookR`
        })
      });
    } catch (error) {
      console.log('Failed to send contact request via API, using localStorage fallback');
    }
    
    // Fallback: Spara lokalt också
    const existingRequests = JSON.parse(localStorage.getItem(`bookr_contact_requests_${newContact.email}`) || '[]');
    const newRequest = {
      id: Date.now(),
      fromEmail: userEmail,
      fromName: user.displayName || userEmail,
      timestamp: new Date().toISOString()
    };
    existingRequests.push(newRequest);
    localStorage.setItem(`bookr_contact_requests_${newContact.email}`, JSON.stringify(existingRequests));
    
    setNewContact({ name: '', email: '' });
    setAddContactOpen(false);
    setToast({ open: true, message: 'Kontakt sparad och vänförslag skickat!', severity: 'success' });
  };

  const handleDeleteContact = (contactId) => {
    const updatedContacts = contacts.filter(c => c.id !== contactId);
    localStorage.setItem(`bookr_team_contacts_${userEmail}`, JSON.stringify(updatedContacts));
    setContacts(updatedContacts);
    setToast({ open: true, message: 'Kontakt borttagen', severity: 'info' });
  };

  const handleToggleDirectAccess = (contactId) => {
    const updatedContacts = contacts.map(c =>
      c.id === contactId ? { ...c, directAccess: !c.directAccess } : c
    );
    localStorage.setItem(`bookr_team_contacts_${userEmail}`, JSON.stringify(updatedContacts));
    setContacts(updatedContacts);
    setToast({ open: true, message: 'Inställning sparad!', severity: 'success' });
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

  const handleStartComparison = async (team) => {
    const memberEmails = team.members.map(m => m.email);
    const directAccessEmails = team.members
      .filter(member => {
        const contact = contacts.find(c => c.email === member.email);
        return contact && contact.directAccess;
      })
      .map(member => member.email);
    const allHaveDirectAccess = team.members.every(member => {
        const contact = contacts.find(c => c.email === member.email);
        return contact && contact.directAccess;
    });

    setToast({ open: true, message: 'Startar kalenderjämförelse...', severity: 'info' });

    try {
      // Skapa grupp via samma API-konfiguration som resten av BookR använder.
      const response = await apiRequest('/api/invite', {
        method: 'POST',
        body: JSON.stringify({
          emails: memberEmails,
          fromUser: userEmail,
          groupName: `${team.name} - Kalenderjämförelse`,
          directAccessEmails
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
        if (allHaveDirectAccess) {
          params.append('directAccess', 'true');
        }
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

  // Handle contact requests
  const handleContactRequest = (requestId, action) => {
    const request = contactRequests.find(r => r.id === requestId);
    if (!request) return;
    
    if (action === 'accept') {
      // Lägg till som kontakt
      const newContact = {
        id: Date.now(),
        name: request.fromName,
        email: request.fromEmail,
        directAccess: false
      };
      const updatedContacts = [...contacts, newContact];
      localStorage.setItem(`bookr_team_contacts_${userEmail}`, JSON.stringify(updatedContacts));
      setContacts(updatedContacts);
      setToast({ open: true, message: `${request.fromName} är nu din kontakt!`, severity: 'success' });
    }
    
    // Ta bort förfrågan
    const updatedRequests = contactRequests.filter(r => r.id !== requestId);
    localStorage.setItem(`bookr_contact_requests_${userEmail}`, JSON.stringify(updatedRequests));
    setContactRequests(updatedRequests);
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
            <Tab label={`Förfrågningar (${contactRequests.length})`} icon={<NotificationsIcon />} sx={{ minHeight: 56, zIndex: 1, textTransform: 'none', fontWeight: 700, color: 'var(--text)' }} />
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
                {contacts.map((contact) => (
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
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Avatar sx={{ width: 36, height: 36, bgcolor: 'rgba(17,24,39,0.08)', color: 'var(--text)' }}>
                          {contact.name?.charAt(0)?.toUpperCase() || '?'}
                        </Avatar>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--text)' }}>
                          {contact.name}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                        {contact.email}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={contact.directAccess || false}
                            onChange={() => handleToggleDirectAccess(contact.id)}
                          />
                        }
                        label="Direktåtkomst"
                        labelPlacement="start"
                        sx={{ m: 0, color: 'var(--text-secondary)' }}
                      />
                      <Chip
                        label={contact.directAccess ? 'Aktiv åtkomst' : 'Ingen åtkomst'}
                        size="small"
                        sx={{
                          bgcolor: contact.directAccess ? 'rgba(31,122,77,0.1)' : 'rgba(17,24,39,0.04)',
                          color: contact.directAccess ? 'var(--success)' : 'var(--text-secondary)',
                          border: `1px solid ${contact.directAccess ? 'rgba(31,122,77,0.14)' : 'rgba(17,24,39,0.06)'}`
                        }}
                      />
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
                ))}
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
                  const allHaveDirectAccess = team.members.every(member => {
                      const contact = contacts.find(c => c.email === member.email);
                      return contact && contact.directAccess;
                  });
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
                          <Button variant="contained" size="small" onClick={() => handleStartComparison(team)} sx={primaryButtonSx}>Starta jämföring</Button>
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

        {/* Contact Requests Tab */}
        {currentTab === 2 && (
          <Box>
            {loading ? (
              <Typography>Laddar förfrågningar...</Typography>
            ) : contactRequests.length === 0 ? (
              <Card sx={{ ...pageCardSx, p: 4, textAlign: 'center' }}>
                <NotificationsIcon sx={{ fontSize: 48, color: 'rgba(17,24,39,0.18)', mb: 2 }} />
                <Typography variant="h6" sx={{ color: 'var(--text)', fontWeight: 700 }}>Inga förfrågningar</Typography>
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>Du har inga väntande kontaktförfrågningar.</Typography>
              </Card>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {contactRequests.map((request) => (
                  <Paper
                    key={request.id}
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
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--text)' }}>
                        {request.fromName}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                        {request.fromEmail}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
                        {new Date(request.timestamp).toLocaleDateString()}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        variant="contained"
                        color="success"
                        size="small"
                        startIcon={<CheckIcon />}
                        onClick={() => handleContactRequest(request.id, 'accept')}
                        sx={primaryButtonSx}
                      >
                        Acceptera
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        startIcon={<CloseIcon />}
                        onClick={() => handleContactRequest(request.id, 'decline')}
                        sx={{ ...secondaryButtonSx, color: 'var(--error)', borderColor: 'rgba(180,35,24,0.18)' }}
                      >
                        Neka
                      </Button>
                    </Box>
                  </Paper>
                ))}
              </Box>
            )}
          </Box>
        )}
      </Container>

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