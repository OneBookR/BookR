import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Button, Card, CardContent, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Paper, Snackbar, Alert } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';

export default function TeamContacts({ user, onNavigateBack }) {
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
      <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={onNavigateBack}
            sx={{ mb: 2 }}
          >
            Tillbaka
          </Button>
          
          <Typography variant="h4" sx={{ 
            fontWeight: 600,
            color: '#0a2540',
            mb: 1
          }}>
            Team Kontakter
          </Typography>
          <Typography variant="body1" sx={{ color: '#666', mb: 4 }}>
            Hantera dina teamkontakter för snabbare mötesbokning
          </Typography>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setAddContactOpen(true)}
            sx={{ mb: 3 }}
          >
            Lägg till kontakt
          </Button>

          {loading ? (
            <Card sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h6" sx={{ color: '#666', mb: 1 }}>
                Laddar kontakter...
              </Typography>
            </Card>
          ) : contacts.length === 0 ? (
            <Card sx={{ p: 4, textAlign: 'center' }}>
              <PersonIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
              <Typography variant="h6" sx={{ color: '#666', mb: 1 }}>
                Inga kontakter än
              </Typography>
              <Typography variant="body2" sx={{ color: '#999' }}>
                Lägg till teammedlemmar för att enkelt kunna bjuda in dem till möten
              </Typography>
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
                    border: '1px solid #e0e3e7',
                    borderRadius: 2,
                    '&:hover': {
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }
                  }}
                >
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                      {contact.name}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#666' }}>
                      {contact.email}
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
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
      </Container>

      <Dialog open={addContactOpen} onClose={() => setAddContactOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Lägg till ny kontakt</DialogTitle>
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