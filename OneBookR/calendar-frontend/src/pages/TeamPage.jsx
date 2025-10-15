import React, { useState, useEffect } from 'react';
import {
  Container, Typography, Box, Button, Card, CardContent, Grid, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions, Paper, Snackbar, Alert,
  Switch, FormControlLabel, Chip, Avatar, Autocomplete, Checkbox
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';
import GroupsIcon from '@mui/icons-material/Groups';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckBoxOutlineBlank from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBox from '@mui/icons-material/CheckBox';

const icon = <CheckBoxOutlineBlank fontSize="small" />;
const checkedIcon = <CheckBox fontSize="small" />;

export default function TeamPage({ user, onNavigateBack }) {
  const [contacts, setContacts] = useState([]);
  const [teams, setTeams] = useState([]);
  const [newContact, setNewContact] = useState({ name: '', email: '' });
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [newTeam, setNewTeam] = useState({ name: '', area: '', members: [] });
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [loading, setLoading] = useState(true);

  const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0];

  // Load contacts and teams from localStorage
  useEffect(() => {
    if (userEmail) {
      setLoading(true);
      const savedContacts = JSON.parse(localStorage.getItem(`bookr_team_contacts_${userEmail}`) || '[]');
      const savedTeams = JSON.parse(localStorage.getItem(`bookr_teams_${userEmail}`) || '[]');
      setContacts(savedContacts);
      setTeams(savedTeams);
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
    setNewContact({ name: '', email: '' });
    setAddContactOpen(false);
    
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
  const handleCreateTeam = () => {
    if (!newTeam.name.trim() || newTeam.members.length === 0) {
      setToast({ open: true, message: 'Teamnamn och minst en medlem krävs', severity: 'error' });
      return;
    }
    const updatedTeams = [...teams, { ...newTeam, id: Date.now() }];
    localStorage.setItem(`bookr_teams_${userEmail}`, JSON.stringify(updatedTeams));
    setTeams(updatedTeams);
    setNewTeam({ name: '', area: '', members: [] });
    setCreateTeamOpen(false);
    setToast({ open: true, message: 'Team skapat!', severity: 'success' });
  };

  const handleDeleteTeam = (teamId) => {
    const updatedTeams = teams.filter(t => t.id !== teamId);
    localStorage.setItem(`bookr_teams_${userEmail}`, JSON.stringify(updatedTeams));
    setTeams(updatedTeams);
    setToast({ open: true, message: 'Team borttaget', severity: 'info' });
  };

  const handleStartComparison = (team) => {
    const memberEmails = team.members.map(m => m.email);
    const allHaveDirectAccess = team.members.every(member => {
        const contact = contacts.find(c => c.email === member.email);
        return contact && contact.directAccess;
    });

    const params = new URLSearchParams();
    if (allHaveDirectAccess) {
        params.append('directAccess', 'true');
        params.append('teamName', team.name);
        memberEmails.forEach(email => params.append('contactEmail', email));
        window.location.href = `/?${params.toString()}`;
    } else {
        // Use InviteFriend logic implicitly by redirecting with prefilled emails
        const prefilledEvent = new CustomEvent('prefilledContacts', { detail: { emails: memberEmails } });
        window.dispatchEvent(prefilledEvent);
        onNavigateBack(); // Go back to dashboard where InviteFriend is
    }
  };

  return (
    <>
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={onNavigateBack} sx={{ mb: 2 }}>
            Tillbaka till Dashboard
          </Button>
          <Typography variant="h4" sx={{ fontWeight: 600, color: '#0a2540' }}>Team Dashboard</Typography>
          <Typography variant="body1" sx={{ color: '#666' }}>Hantera dina team och kontakter för smidigare mötesbokning.</Typography>
        </Box>

        {/* Teams Section */}
        <Box sx={{ mb: 5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>Mina Team</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateTeamOpen(true)}>Skapa Team</Button>
          </Box>
          {loading ? <Typography>Laddar team...</Typography> : teams.length === 0 ? (
            <Card sx={{ p: 4, textAlign: 'center', bgcolor: '#f8f9fa' }}>
              <GroupsIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
              <Typography variant="h6" sx={{ color: '#666' }}>Du har inga team än</Typography>
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
                        <Button variant="outlined" color="error" size="small" onClick={() => handleDeleteTeam(team.id)}>Ta bort</Button>
                      </Box>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Box>

        {/* Contacts Section */}
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>Teamkontakter</Typography>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setAddContactOpen(true)}>Lägg till kontakt</Button>
          </Box>
          {loading ? <Typography>Laddar kontakter...</Typography> : contacts.length === 0 ? (
            <Card sx={{ p: 4, textAlign: 'center', bgcolor: '#f8f9fa' }}>
              <PersonIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
              <Typography variant="h6" sx={{ color: '#666' }}>Inga kontakter än</Typography>
            </Card>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {contacts.map((contact) => (
                <Paper key={contact.id} sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e0e3e7' }}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{contact.name}</Typography>
                    <Typography variant="body2" sx={{ color: '#666' }}>{contact.email}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <FormControlLabel control={<Switch checked={contact.directAccess || false} onChange={() => handleToggleDirectAccess(contact.id)} />} label="Direktåtkomst" labelPlacement="start" />
                    <Button variant="outlined" color="error" size="small" onClick={() => handleDeleteContact(contact.id)}>Ta bort</Button>
                  </Box>
                </Paper>
              ))}
            </Box>
          )}
        </Box>
      </Container>

      {/* Add Contact Dialog */}
      <Dialog open={addContactOpen} onClose={() => setAddContactOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Lägg till ny teamkontakt</DialogTitle>
        <DialogContent>
          <TextField autoFocus margin="dense" label="Namn" fullWidth variant="outlined" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} sx={{ mt: 1 }} />
          <TextField margin="dense" label="E-postadress" type="email" fullWidth variant="outlined" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddContactOpen(false)}>Avbryt</Button>
          <Button onClick={handleAddContact} variant="contained">Lägg till</Button>
        </DialogActions>
      </Dialog>

      {/* Create Team Dialog */}
      <Dialog open={createTeamOpen} onClose={() => setCreateTeamOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Skapa nytt team</DialogTitle>
        <DialogContent>
          <TextField autoFocus margin="dense" label="Teamnamn" fullWidth variant="outlined" value={newTeam.name} onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })} sx={{ mt: 1 }} />
          <TextField margin="dense" label="Område (t.ex. 'Projekt X', 'Ledningsgrupp')" fullWidth variant="outlined" value={newTeam.area} onChange={(e) => setNewTeam({ ...newTeam, area: e.target.value })} />
          <Autocomplete
            multiple
            options={contacts}
            disableCloseOnSelect
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, value) => option.email === value.email}
            onChange={(event, newValue) => {
              setNewTeam({ ...newTeam, members: newValue });
            }}
            renderOption={(props, option, { selected }) => (
              <li {...props}>
                <Checkbox icon={icon} checkedIcon={checkedIcon} style={{ marginRight: 8 }} checked={selected} />
                {option.name} ({option.email})
              </li>
            )}
            renderInput={(params) => (
              <TextField {...params} label="Välj medlemmar" placeholder="Kontakter" />
            )}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateTeamOpen(false)}>Avbryt</Button>
          <Button onClick={handleCreateTeam} variant="contained">Skapa team</Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setToast({ ...toast, open: false })} severity={toast.severity} sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
}