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
    const allHaveDirectAccess = team.members.every(member => {
        const contact = contacts.find(c => c.email === member.email);
        return contact && contact.directAccess;
    });

    setToast({ open: true, message: 'Startar kalenderjämförelse...', severity: 'info' });

    try {
      // Skapa grupp och skicka inbjudningar
      const response = await fetch('https://www.onebookr.se/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails: memberEmails,
          fromUser: userEmail,
          fromToken: user.accessToken || 'mock_token',
          groupName: `${team.name} - Kalenderjämförelse`,
          isTeamMeeting: true,
          teamName: team.name,
          hasDirectAccessTeam: allHaveDirectAccess
        })
      });

      const data = await response.json();
      
      if (data.groupId) {
        // Skicka e-postinbjudningar till alla teammedlemmar
        const invitationPromises = memberEmails.map(email => 
          fetch('https://www.onebookr.se/api/send-team-invitation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toEmail: email,
              fromEmail: userEmail,
              fromName: user.displayName || userEmail,
              teamName: team.name,
              groupId: data.groupId,
              hasDirectAccess: allHaveDirectAccess
            })
          })
        );

        await Promise.all(invitationPromises);
        
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

  return (
    <>
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        {/* Header Banner */}
        <Box sx={{
          background: 'rgba(255,255,255,0.98)',
          borderRadius: 3,
          p: 4,
          mb: 6,
          textAlign: 'center',
          boxShadow: '0 8px 40px 0 rgba(99,91,255,0.10), 0 1.5px 6px 0 rgba(60,64,67,.06)',
          border: '1.5px solid #e3e8ee'
        }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={onNavigateBack}
            sx={{ position: 'absolute', top: 20, left: 20 }}
          >
            Tillbaka
          </Button>
          
          <Typography variant="h3" sx={{ 
            fontWeight: 700,
            letterSpacing: -1.5,
            fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
            color: '#0a2540',
            mb: 1,
            fontSize: { xs: 28, md: 36 },
            lineHeight: 1.08
          }}>
            Team Management
          </Typography>
          <Typography variant="h6" sx={{ 
            color: '#425466',
            fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
            fontWeight: 400,
            fontSize: { xs: 16, md: 18 },
            lineHeight: 1.4,
            letterSpacing: -0.5
          }}>
            Hantera dina team och kontakter för smidigare mötesbokning
          </Typography>
        </Box>

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 4 }}>
          <Tabs value={currentTab} onChange={(e, newValue) => setCurrentTab(newValue)}>
            <Tab label={`Kontakter (${contacts.length})`} icon={<PersonIcon />} />
            <Tab label={`Team (${teams.length})`} icon={<GroupsIcon />} />
            <Tab label={`Förfrågningar (${contactRequests.length})`} icon={<NotificationsIcon />} />
          </Tabs>
        </Box>

        {/* Contacts Tab */}
        {currentTab === 0 && (
          <Box>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setAddContactOpen(true)}
              sx={{ mb: 3 }}
            >
              Lägg till kontakt
            </Button>

            {loading ? (
              <Typography>Laddar kontakter...</Typography>
            ) : contacts.length === 0 ? (
              <Card sx={{ p: 4, textAlign: 'center', bgcolor: '#f8f9fa' }}>
                <PersonIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
                <Typography variant="h6" sx={{ color: '#666' }}>Inga kontakter än</Typography>
                <Typography variant="body2" sx={{ color: '#999', mb: 2 }}>Lägg till teammedlemmar för att enkelt kunna bjuda in dem till möten.</Typography>
              </Card>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {contacts.map((contact) => (
                  <Paper
                    key={contact.id}
                    sx={{
                      p: 3,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: '1px solid #e0e3e7'
                    }}
                  >
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {contact.name}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#666' }}>
                        {contact.email}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={contact.directAccess || false}
                            onChange={() => handleToggleDirectAccess(contact.id)}
                          />
                        }
                        label="Direktåtkomst"
                        labelPlacement="start"
                      />
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        onClick={() => handleDeleteContact(contact.id)}
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
              sx={{ mb: 3 }}
            >
              Skapa team
            </Button>

            {loading ? (
              <Typography>Laddar team...</Typography>
            ) : teams.length === 0 ? (
              <Card sx={{ p: 4, textAlign: 'center', bgcolor: '#f8f9fa' }}>
                <GroupsIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
                <Typography variant="h6" sx={{ color: '#666' }}>Inga team än</Typography>
                <Typography variant="body2" sx={{ color: '#999', mb: 2 }}>Skapa ett team för att enkelt bjuda in flera personer.</Typography>
                <Button variant="contained" onClick={() => setCreateTeamOpen(true)}>Skapa ditt första team</Button>
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
                      <Card sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <CardContent sx={{ flexGrow: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                             <Typography variant="h6" sx={{ fontWeight: 600, mr: 1 }}>{team.name}</Typography>
                             {allHaveDirectAccess && <CheckCircleIcon color="success" fontSize="small" />}
                          </Box>
                          <Chip label={team.area || 'Inget område'} size="small" sx={{ mb: 2 }} />
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {team.members.map(m => <Chip key={m.email} label={m.name} size="small" variant="outlined" />)}
                          </Box>
                        </CardContent>
                        <Box sx={{ p: 2, pt: 0, display: 'flex', gap: 1 }}>
                          <Button variant="contained" size="small" onClick={() => handleStartComparison(team)}>Starta jämföring</Button>
                          <Button variant="outlined" size="small" onClick={() => handleOpenEditDialog(team)}>Redigera</Button>
                          <Button variant="outlined" color="error" size="small" onClick={() => handleDeleteTeam(team.id)}>Ta bort</Button>
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
              <Card sx={{ p: 4, textAlign: 'center', bgcolor: '#f8f9fa' }}>
                <NotificationsIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
                <Typography variant="h6" sx={{ color: '#666' }}>Inga förfrågningar</Typography>
                <Typography variant="body2" sx={{ color: '#999' }}>Du har inga väntande kontaktförfrågningar.</Typography>
              </Card>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {contactRequests.map((request) => (
                  <Paper
                    key={request.id}
                    sx={{
                      p: 3,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: '1px solid #e0e3e7'
                    }}
                  >
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {request.fromName}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#666' }}>
                        {request.fromEmail}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#999' }}>
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
                      >
                        Acceptera
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        startIcon={<CloseIcon />}
                        onClick={() => handleContactRequest(request.id, 'decline')}
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
      <Dialog open={addContactOpen} onClose={() => setAddContactOpen(false)} maxWidth="sm" fullWidth>
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
          <Button onClick={() => setAddContactOpen(false)}>Avbryt</Button>
          <Button onClick={handleAddContact} variant="contained">Lägg till</Button>
        </DialogActions>
      </Dialog>

      {/* Create/Edit Team Dialog */}
      <Dialog open={createTeamOpen} onClose={handleCloseTeamDialog} maxWidth="sm" fullWidth>
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
          <Button onClick={handleCloseTeamDialog}>Avbryt</Button>
          <Button onClick={handleSaveTeam} variant="contained">
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