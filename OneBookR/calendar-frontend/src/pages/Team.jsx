import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Button, Card, CardContent, Grid, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Paper, Snackbar, Alert, Tabs, Tab } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';
import GroupsIcon from '@mui/icons-material/Groups';
import EventIcon from '@mui/icons-material/Event';

export default function Team({ user, onNavigateBack }) {
  const [currentTab, setCurrentTab] = useState(0);
  const [contacts, setContacts] = useState([]);
  const [newContact, setNewContact] = useState({ name: '', email: '' });
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [loading, setLoading] = useState(true);

  const saveContactsToGoogleDrive = async (contactsData) => {
    try {
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=media', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'bookr_team_contacts.json',
          parents: ['appDataFolder'],
          content: JSON.stringify(contactsData)
        })
      });
      return response.ok;
    } catch (error) {
      console.error('Failed to save to Google Drive:', error);
      return false;
    }
  };

  const loadContactsFromGoogleDrive = async () => {
    try {
      const searchResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='bookr_team_contacts.json' and parents in 'appDataFolder'`, {
        headers: { 'Authorization': `Bearer ${user.accessToken}` }
      });
      const searchData = await searchResponse.json();
      
      if (searchData.files && searchData.files.length > 0) {
        const fileId = searchData.files[0].id;
        const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { 'Authorization': `Bearer ${user.accessToken}` }
        });
        const contactsData = await fileResponse.json();
        return contactsData || [];
      }
      return [];
    } catch (error) {
      console.error('Failed to load from Google Drive:', error);
      return [];
    }
  };

  useEffect(() => {
    const loadContacts = async () => {
      setLoading(true);
      const savedContacts = await loadContactsFromGoogleDrive();
      setContacts(savedContacts);
      setLoading(false);
    };
    if (user?.accessToken) {
      loadContacts();
    }
  }, [user?.accessToken]);

  const handleAddContact = async () => {
    if (!newContact.name.trim() || !newContact.email.trim()) {
      setToast({ open: true, message: 'Fyll i både namn och e-post', severity: 'error' });
      return;
    }
    
    if (contacts.some(c => c.email.toLowerCase() === newContact.email.toLowerCase())) {
      setToast({ open: true, message: 'Kontakten finns redan', severity: 'error' });
      return;
    }
    
    const updatedContacts = [...contacts, { ...newContact, id: Date.now() }];
    const saved = await saveContactsToGoogleDrive(updatedContacts);
    
    if (saved) {
      setContacts(updatedContacts);
      setNewContact({ name: '', email: '' });
      setAddContactOpen(false);
      setToast({ open: true, message: 'Kontakt sparad till Google Drive!', severity: 'success' });
    } else {
      setToast({ open: true, message: 'Kunde inte spara kontakt', severity: 'error' });
    }
  };

  const handleDeleteContact = async (contactId) => {
    const updatedContacts = contacts.filter(c => c.id !== contactId);
    const saved = await saveContactsToGoogleDrive(updatedContacts);
    
    if (saved) {
      setContacts(updatedContacts);
      setToast({ open: true, message: 'Kontakt borttagen', severity: 'info' });
    } else {
      setToast({ open: true, message: 'Kunde inte ta bort kontakt', severity: 'error' });
    }
  };

  return (
    <>
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={onNavigateBack}
            sx={{ mb: 2 }}
          >
            Tillbaka
          </Button>
          
          <Typography variant="h3" sx={{ 
            fontWeight: 700,
            color: '#0a2540',
            mb: 1,
            fontSize: { xs: 28, md: 36 }
          }}>
            Team Dashboard
          </Typography>
          <Typography variant="h6" sx={{ color: '#666', mb: 4 }}>
            Hantera ditt team och planera möten tillsammans
          </Typography>
        </Box>

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 4 }}>
          <Tabs value={currentTab} onChange={(e, newValue) => setCurrentTab(newValue)}>
            <Tab label="Kontakter" icon={<PersonIcon />} />
            <Tab label="Team Möten" icon={<EventIcon />} />
            <Tab label="Inställningar" icon={<GroupsIcon />} />
          </Tabs>
        </Box>

        {currentTab === 0 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                Team Kontakter
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setAddContactOpen(true)}
              >
                Lägg till kontakt
              </Button>
            </Box>

            {loading ? (
              <Card sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h6" sx={{ color: '#666' }}>
                  Laddar kontakter...
                </Typography>
              </Card>
            ) : contacts.length === 0 ? (
              <Card sx={{ p: 6, textAlign: 'center' }}>
                <PersonIcon sx={{ fontSize: 64, color: '#ccc', mb: 2 }} />
                <Typography variant="h5" sx={{ color: '#666', mb: 2 }}>
                  Inga teamkontakter än
                </Typography>
                <Typography variant="body1" sx={{ color: '#999', mb: 3 }}>
                  Lägg till teammedlemmar för att enkelt kunna bjuda in dem till möten
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setAddContactOpen(true)}
                >
                  Lägg till första kontakten
                </Button>
              </Card>
            ) : (
              <Grid container spacing={3}>
                {contacts.map((contact) => (
                  <Grid item xs={12} sm={6} md={4} key={contact.id}>
                    <Card sx={{ 
                      p: 3, 
                      height: '100%',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: '0 8px 25px rgba(0,0,0,0.15)'
                      }
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <PersonIcon sx={{ fontSize: 40, color: '#635bff', mr: 2 }} />
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            {contact.name}
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#666' }}>
                            {contact.email}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          sx={{ flex: 1 }}
                        >
                          Bjud in
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          onClick={() => handleDeleteContact(contact.id)}
                        >
                          Ta bort
                        </Button>
                      </Box>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        )}

        {currentTab === 1 && (
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 4 }}>
              Team Möten
            </Typography>
            <Card sx={{ p: 6, textAlign: 'center' }}>
              <EventIcon sx={{ fontSize: 64, color: '#ccc', mb: 2 }} />
              <Typography variant="h5" sx={{ color: '#666', mb: 2 }}>
                Inga teammöten planerade
              </Typography>
              <Typography variant="body1" sx={{ color: '#999', mb: 3 }}>
                Skapa ett teammöte för att bjuda in flera teammedlemmar samtidigt
              </Typography>
              <Button variant="contained" startIcon={<AddIcon />}>
                Skapa teammöte
              </Button>
            </Card>
          </Box>
        )}

        {currentTab === 2 && (
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 4 }}>
              Team Inställningar
            </Typography>
            <Card sx={{ p: 4 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Allmänna inställningar
              </Typography>
              <Typography variant="body2" sx={{ color: '#666' }}>
                Här kan du konfigurera inställningar för ditt team i framtiden.
              </Typography>
            </Card>
          </Box>
        )}
      </Container>

      <Dialog open={addContactOpen} onClose={() => setAddContactOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Lägg till ny teamkontakt</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Namn"
            value={newContact.name}
            onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
            sx={{ mb: 2, mt: 1 }}
          />
          <TextField
            fullWidth
            label="E-postadress"
            type="email"
            value={newContact.email}
            onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddContactOpen(false)}>
            Avbryt
          </Button>
          <Button variant="contained" onClick={handleAddContact}>
            Lägg till
          </Button>
        </DialogActions>
      </Dialog>

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