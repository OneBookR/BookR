import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, List, ListItem, ListItemText, ListItemSecondaryAction,
  Switch, Typography, Box, Chip, Avatar, Divider
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SecurityIcon from '@mui/icons-material/Security';

export default function ContactSettings({ 
  open, 
  onClose, 
  contacts, 
  onUpdateContactSettings 
}) {
  const [contactSettings, setContactSettings] = useState({});

  useEffect(() => {
    // Hämta sparade inställningar från localStorage
    const savedSettings = JSON.parse(localStorage.getItem('bookr_contact_settings') || '{}');
    setContactSettings(savedSettings);
  }, [contacts]);

  const handleToggleAccess = (contactId, hasAccess) => {
    const newSettings = {
      ...contactSettings,
      [contactId]: {
        ...contactSettings[contactId],
        hasCalendarAccess: hasAccess
      }
    };
    
    setContactSettings(newSettings);
    localStorage.setItem('bookr_contact_settings', JSON.stringify(newSettings));
    
    if (onUpdateContactSettings) {
      onUpdateContactSettings(contactId, { hasCalendarAccess: hasAccess });
    }
  };

  const getContactSetting = (contactId) => {
    return contactSettings[contactId]?.hasCalendarAccess || false;
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="sm" 
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        bgcolor: '#635bff',
        color: 'white'
      }}>
        <SecurityIcon />
        Kontakt-inställningar
      </DialogTitle>
      
      <DialogContent sx={{ p: 3 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" sx={{ color: '#666', mb: 2 }}>
            Bestäm vilka kontakter som får direkt tillgång till din kalender. 
            När detta är aktiverat kan de boka möten med dig utan att skicka inbjudan först.
          </Typography>
          
          <Box sx={{ 
            p: 2, 
            bgcolor: '#e3f2fd', 
            borderRadius: 2, 
            border: '1px solid #bbdefb',
            mb: 3
          }}>
            <Typography variant="caption" sx={{ color: '#1565c0', fontWeight: 600 }}>
              💡 Tips: Aktivera detta för kollegor och nära samarbetspartners för smidigare bokning
            </Typography>
          </Box>
        </Box>

        {contacts.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <PersonIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
            <Typography sx={{ color: '#999' }}>
              Inga kontakter att konfigurera
            </Typography>
          </Box>
        ) : (
          <List sx={{ maxHeight: 400, overflow: 'auto' }}>
            {contacts.map((contact, index) => {
              const hasAccess = getContactSetting(contact.id);
              
              return (
                <React.Fragment key={contact.id}>
                  <ListItem 
                    sx={{ 
                      border: '1px solid #e0e3e7',
                      borderRadius: 2,
                      mb: 1,
                      bgcolor: hasAccess ? '#e8f5e8' : '#fff',
                      '&:hover': {
                        bgcolor: hasAccess ? '#d4edda' : '#f8f9fa'
                      }
                    }}
                  >
                    <Avatar sx={{ mr: 2, bgcolor: hasAccess ? '#4caf50' : '#635bff' }}>
                      {contact.name.charAt(0).toUpperCase()}
                    </Avatar>
                    
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontWeight: 600 }}>
                            {contact.name}
                          </Typography>
                          {hasAccess && (
                            <Chip 
                              label="Har tillgång" 
                              size="small" 
                              color="success"
                              sx={{ fontSize: 10 }}
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" sx={{ color: '#666' }}>
                            {contact.email}
                          </Typography>
                          <Typography variant="caption" sx={{ 
                            color: hasAccess ? '#2e7d32' : '#666',
                            fontWeight: hasAccess ? 600 : 400
                          }}>
                            {hasAccess 
                              ? 'Kan boka möten direkt i din kalender' 
                              : 'Måste skicka inbjudan först'
                            }
                          </Typography>
                        </Box>
                      }
                    />
                    
                    <ListItemSecondaryAction>
                      <Switch
                        checked={hasAccess}
                        onChange={(e) => handleToggleAccess(contact.id, e.target.checked)}
                        color="success"
                      />
                    </ListItemSecondaryAction>
                  </ListItem>
                  
                  {index < contacts.length - 1 && <Divider sx={{ my: 1 }} />}
                </React.Fragment>
              );
            })}
          </List>
        )}
        
        <Box sx={{ mt: 3, p: 2, bgcolor: '#fff3e0', borderRadius: 2, border: '1px solid #ffcc02' }}>
          <Typography variant="caption" sx={{ color: '#e65100', fontWeight: 600 }}>
            ⚠️ Obs: Kontakter med tillgång kan se dina lediga tider och boka möten utan din förhandsgodkännande
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button onClick={onClose} variant="contained">
          Stäng
        </Button>
      </DialogActions>
    </Dialog>
  );
}