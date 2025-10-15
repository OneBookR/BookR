import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Button, Card, CardContent, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Paper, Snackbar, Alert, Switch, FormControlLabel, Tabs, Tab, Avatar } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';
import NotificationsIcon from '@mui/icons-material/Notifications';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import VisibilityIcon from '@mui/icons-material/Visibility';

export default function TeamContacts({ user, onNavigateBack }) {
  const [currentTab, setCurrentTab] = useState(0);
  const [contacts, setContacts] = useState([]);
  const [contactRequests, setContactRequests] = useState([]);
  const [directAccessContacts, setDirectAccessContacts] = useState([]);
  const [newContact, setNewContact] = useState({ name: '', email: '' });
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0];
    if (userEmail) {
      // Hämta både gamla och nya kontakter
      const oldContacts = JSON.parse(localStorage.getItem('bookr_contacts') || '[]');
      const teamContacts = JSON.parse(localStorage.getItem(`bookr_team_contacts_${userEmail}`) || '[]');
      
      // Kombinera och ta bort dubbletter
      const allContacts = [...oldContacts, ...teamContacts];
      const uniqueContacts = allContacts.filter((contact, index, self) => 
        index === self.findIndex(c => c.email.toLowerCase() === contact.email.toLowerCase())
      );
      
      setContacts(uniqueContacts);
      
      // Ladda kontaktförfrågningar
      const savedRequests = JSON.parse(localStorage.getItem(`bookr_contact_requests_${userEmail}`) || '[]');
      setContactRequests(savedRequests);
      
      // Ladda kontakter som har gett dig direktåtkomst
      const directAccessList = JSON.parse(localStorage.getItem(`bookr_direct_access_granted_${userEmail}`) || '[]');
      setDirectAccessContacts(directAccessList);
      
      // Lyssna på storage events för att uppdatera kontaktförfrågningar
      const handleStorageChange = () => {
        const updatedRequests = JSON.parse(localStorage.getItem(`bookr_contact_requests_${userEmail}`) || '[]');
        setContactRequests(updatedRequests);
        
        const updatedDirectAccess = JSON.parse(localStorage.getItem(`bookr_direct_access_granted_${userEmail}`) || '[]');
        setDirectAccessContacts(updatedDirectAccess);
      };
      
      window.addEventListener('storage', handleStorageChange);
      return () => window.removeEventListener('storage', handleStorageChange);
    }
    setLoading(false);
  }, [user]);

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
    const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0];
    
    if (userEmail) {
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
      
      // Trigga uppdatering av kontaktlistan
      window.dispatchEvent(new StorageEvent('storage', {
        key: `bookr_contact_requests_${newContact.email}`,
        newValue: JSON.stringify(existingRequests)
      }));
      window.dispatchEvent(new Event('teamContactsUpdated'));
    }
  };

  const handleDeleteContact = (contactId) => {
    const contactToDelete = contacts.find(c => c.id === contactId);
    const updatedContacts = contacts.filter(c => c.id !== contactId);
    const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0];
    
    if (userEmail && contactToDelete) {
      // Ta bort från både gamla och nya kontakter
      const oldContacts = JSON.parse(localStorage.getItem('bookr_contacts') || '[]');
      const teamContacts = JSON.parse(localStorage.getItem(`bookr_team_contacts_${userEmail}`) || '[]');
      
      const updatedOldContacts = oldContacts.filter(c => c.email !== contactToDelete.email);
      const updatedTeamContacts = teamContacts.filter(c => c.email !== contactToDelete.email);
      
      localStorage.setItem('bookr_contacts', JSON.stringify(updatedOldContacts));
      localStorage.setItem(`bookr_team_contacts_${userEmail}`, JSON.stringify(updatedTeamContacts));
      
      setContacts(updatedContacts);
      setToast({ open: true, message: 'Kontakt borttagen', severity: 'info' });
      
      // Trigga uppdatering av kontaktlistan
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('teamContactsUpdated'));
    }
  };

  const handleToggleDirectAccess = (contactId) => {
    const updatedContacts = contacts.map(c => 
      c.id === contactId ? { ...c, directAccess: !c.directAccess } : c
    );
    const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0];
    
    if (userEmail) {
      localStorage.setItem(`bookr_team_contacts_${userEmail}`, JSON.stringify(updatedContacts));
      setContacts(updatedContacts);
      setToast({ open: true, message: 'Inställning sparad!', severity: 'success' });
    }
  };

  const handleContactRequest = (requestId, action) => {
    const request = contactRequests.find(r => r.id === requestId);
    if (!request) return;
    
    const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0];
    
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
      // Ge direktåtkomst tillbaka till den som skickade förfrågan
      const directAccessKey = `bookr_direct_access_granted_${request.fromEmail}`;
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
      
      setToast({ open: true, message: `${request.fromName} är nu din kontakt och har fått direktåtkomst!`, severity: 'success' });
    }
    
    // Ta bort förfrågan
    const updatedRequests = contactRequests.filter(r => r.id !== requestId);
    localStorage.setItem(`bookr_contact_requests_${userEmail}`, JSON.stringify(updatedRequests));
    setContactRequests(updatedRequests);
  };

  const handleViewCalendar = (contact) => {
    // Navigera till kalenderjämförelse med direktåtkomst
    const params = new URLSearchParams();
    params.append('directAccess', 'true');
    params.append('contactEmail', contact.email);
    params.append('contactName', contact.name);
    window.location.href = `/?${params.toString()}`;
  };

  // Simulera att någon ger dig direktåtkomst (detta skulle normalt komma från backend)
  const simulateDirectAccessGrant = (fromEmail, fromName) => {
    const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0];
    if (!userEmail) return;
    
    const existingDirectAccess = JSON.parse(localStorage.getItem(`bookr_direct_access_granted_${userEmail}`) || '[]');
    
    // Kolla om kontakten redan finns
    if (!existingDirectAccess.find(c => c.email === fromEmail)) {
      const newDirectAccessContact = {
        id: Date.now(),
        name: fromName,
        email: fromEmail,
        grantedAt: new Date().toISOString()
      };
      
      existingDirectAccess.push(newDirectAccessContact);
      localStorage.setItem(`bookr_direct_access_granted_${userEmail}`, JSON.stringify(existingDirectAccess));
      setDirectAccessContacts(existingDirectAccess);
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

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 4 }}>
          <Tabs value={currentTab} onChange={(e, newValue) => setCurrentTab(newValue)}>
            <Tab label={`Kontakter (${contacts.length})`} icon={<PersonIcon />} />
            <Tab label={`Förfrågningar (${contactRequests.length})`} icon={<NotificationsIcon />} />
            <Tab label={`Direktåtkomst (${directAccessContacts.length})`} icon={<VisibilityIcon />} />
          </Tabs>
        </Box>

        {currentTab === 0 && (
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
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={contact.directAccess}
                          onChange={() => handleToggleDirectAccess(contact.id)}
                          color="primary"
                        />
                      }
                      label="Direktåtkomst"
                      labelPlacement="start"
                      sx={{ mr: 2 }}
                    />
                    <Button
                      variant="outlined"
                      color="error"
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

        {currentTab === 1 && (
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600, color: '#0a2540', mb: 3 }}>Kontaktförfrågningar</Typography>
          {loading ? (
            <Typography>Laddar förfrågningar...</Typography>
          ) : contactRequests.length === 0 ? (
            <Card sx={{ p: 4, textAlign: 'center' }}>
              <NotificationsIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
              <Typography variant="h6" sx={{ color: '#666', mb: 1 }}>
                Inga kontaktförfrågningar
              </Typography>
              <Typography variant="body2" sx={{ color: '#999' }}>
                När någon lägger till dig som kontakt kommer det att visas här
              </Typography>
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
                    border: '1px solid #e0e3e7',
                    borderRadius: 2,
                    '&:hover': {
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: '#1976d2' }}>
                      {request.fromName.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {request.fromName}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#666' }}>
                        {request.fromEmail}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#999' }}>
                        {new Date(request.timestamp).toLocaleDateString('sv-SE')}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="contained"
                      color="success"
                      startIcon={<CheckIcon />}
                      onClick={() => handleContactRequest(request.id, 'accept')}
                    >
                      Acceptera
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
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

        {currentTab === 2 && (
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600, color: '#0a2540', mb: 3 }}>Kontakter med direktåtkomst</Typography>
          <Typography variant="body2" sx={{ color: '#666', mb: 3 }}>
            Dessa kontakter har gett dig direktåtkomst till sina kalendrar. Du kan se deras lediga tider utan att de behöver gå med i kalenderjämförelsen.
          </Typography>
          
          {loading ? (
            <Typography>Laddar direktåtkomst-kontakter...</Typography>
          ) : directAccessContacts.length === 0 ? (
            <Card sx={{ p: 4, textAlign: 'center' }}>
              <VisibilityIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
              <Typography variant="h6" sx={{ color: '#666', mb: 1 }}>
                Inga direktåtkomst-kontakter
              </Typography>
              <Typography variant="body2" sx={{ color: '#999' }}>
                När någon ger dig direktåtkomst till sin kalender kommer de att visas här
              </Typography>
            </Card>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {directAccessContacts.map((contact) => (
                <Paper
                  key={contact.id}
                  sx={{
                    p: 3,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid #e0e3e7',
                    borderRadius: 2,
                    bgcolor: '#f8fff8',
                    borderLeft: '4px solid #4caf50',
                    '&:hover': {
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: '#4caf50' }}>
                      {contact.name.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {contact.name}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#666' }}>
                        {contact.email}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#4caf50', fontWeight: 600 }}>
                        ✓ Direktåtkomst aktiverad
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="contained"
                      color="success"
                      startIcon={<CalendarTodayIcon />}
                      onClick={() => handleViewCalendar(contact)}
                    >
                      Visa kalender
                    </Button>
                  </Box>
                </Paper>
              ))}
            </Box>
          )}
        </Box>
        )}
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