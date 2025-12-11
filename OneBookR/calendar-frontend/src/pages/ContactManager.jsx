import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Button, Card, CardContent,
  List, ListItem, ListItemText, ListItemSecondaryAction,
  Switch, IconButton, Chip, Avatar, Paper, Alert, Snackbar
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ContactSettings from '../components/ContactSettings.jsx';

export default function ContactManager({ user, onNavigateBack }) {
  const [contacts, setContacts] = useState([]);
  const [contactRequests, setContactRequests] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    const savedContacts = JSON.parse(localStorage.getItem('bookr_contacts') || '[]');
    setContacts(savedContacts);
    
    // Hämta kontaktförfrågningar för denna användare
    const userEmail = user.email || user.emails?.[0]?.value || user.emails?.[0];
    const savedRequests = JSON.parse(localStorage.getItem(`bookr_contact_requests_${userEmail}`) || '[]');
    setContactRequests(savedRequests);
  }, [user]);

  const handleAcceptRequest = (request) => {
    const newContact = {
      id: Date.now(),
      name: request.name || request.email.split('@')[0],
      email: request.email
    };
    
    const updatedContacts = [...contacts, newContact];
    setContacts(updatedContacts);
    localStorage.setItem('bookr_contacts', JSON.stringify(updatedContacts));
    
    const userEmail = user.email || user.emails?.[0]?.value || user.emails?.[0];
    const updatedRequests = contactRequests.filter(req => req.email !== request.email);
    setContactRequests(updatedRequests);
    localStorage.setItem(`bookr_contact_requests_${userEmail}`, JSON.stringify(updatedRequests));
    
    setToast({ open: true, message: 'Kontakt accepterad!', severity: 'success' });
  };

  const handleDeclineRequest = (request) => {
    const userEmail = user.email || user.emails?.[0]?.value || user.emails?.[0];
    const updatedRequests = contactRequests.filter(req => req.email !== request.email);
    setContactRequests(updatedRequests);
    localStorage.setItem(`bookr_contact_requests_${userEmail}`, JSON.stringify(updatedRequests));
    
    setToast({ open: true, message: 'Kontaktförfrågan nekad', severity: 'info' });
  };

  const handleToggleAccess = (contactId, hasAccess) => {
    const contactSettings = JSON.parse(localStorage.getItem('bookr_contact_settings') || '{}');
    const newSettings = {
      ...contactSettings,
      [contactId]: { hasCalendarAccess: hasAccess }
    };
    localStorage.setItem('bookr_contact_settings', JSON.stringify(newSettings));
    
    setToast({ 
      open: true, 
      message: hasAccess ? 'Direkttillgång aktiverad' : 'Direkttillgång inaktiverad', 
      severity: 'success' 
    });
  };

  const getContactSetting = (contactId) => {
    const contactSettings = JSON.parse(localStorage.getItem('bookr_contact_settings') || '{}');
    return contactSettings[contactId]?.hasCalendarAccess || false;
  };

  return (
    <>
      <Container maxWidth="xl" sx={{ mt: 12, mb: 4, px: { xs: 2, sm: 3 } }}>
        <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={onNavigateBack}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h3" sx={{ 
            fontWeight: 700,
            color: '#0a2540',
            fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif"
          }}>
            Kontakter
          </Typography>
        </Box>

        {/* Kontaktförfrågningar */}
        {contactRequests.length > 0 && (
          <Card sx={{ mb: 4, borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, color: '#1976d2' }}>
                Kontaktförfrågningar ({contactRequests.length})
              </Typography>
              {contactRequests.map((request, index) => (
                <Paper key={index} sx={{ p: 2, mb: 2, bgcolor: '#fff3e0', border: '1px solid #ffcc02' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography sx={{ fontWeight: 600 }}>
                        {request.email} har lagt till dig som kontakt
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#666' }}>
                        Vill du tillåta direktbokning av möten?
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleDeclineRequest(request)}
                      >
                        Neka
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => handleAcceptRequest(request)}
                      >
                        Acceptera
                      </Button>
                    </Box>
                  </Box>
                </Paper>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Mina kontakter */}
        <Card sx={{ borderRadius: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Mina kontakter ({contacts.length})
              </Typography>
              <Button
                variant="outlined"
                onClick={() => setSettingsOpen(true)}
                disabled={contacts.length === 0}
              >
                Inställningar
              </Button>
            </Box>
            
            {contacts.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <PersonAddIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
                <Typography sx={{ color: '#999' }}>
                  Inga kontakter än
                </Typography>
              </Box>
            ) : (
              <List>
                {contacts.map((contact) => {
                  const hasAccess = getContactSetting(contact.id);
                  return (
                    <ListItem key={contact.id} sx={{ 
                      border: '1px solid #e0e3e7',
                      borderRadius: 2,
                      mb: 1,
                      bgcolor: hasAccess ? '#e8f5e8' : '#fff'
                    }}>
                      <Avatar sx={{ mr: 2, bgcolor: hasAccess ? '#4caf50' : '#635bff' }}>
                        {contact.name.charAt(0).toUpperCase()}
                      </Avatar>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <span>{contact.name}</span>
                            {hasAccess && (
                              <Chip 
                                label="Direkttillgång" 
                                size="small" 
                                color="success"
                                sx={{ fontSize: 10 }}
                              />
                            )}
                          </Box>
                        }
                        secondary={contact.email}
                      />
                      <ListItemSecondaryAction>
                        <Switch
                          checked={hasAccess}
                          onChange={(e) => handleToggleAccess(contact.id, e.target.checked)}
                          color="success"
                        />
                      </ListItemSecondaryAction>
                    </ListItem>
                  );
                })}
              </List>
            )}
          </CardContent>
        </Card>
      </Container>

      <ContactSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        contacts={contacts}
        onUpdateContactSettings={handleToggleAccess}
      />

      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast({ ...toast, open: false })}
      >
        <Alert severity={toast.severity}>
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
}