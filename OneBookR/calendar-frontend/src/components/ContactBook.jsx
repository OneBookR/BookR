import React, { useState } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, TextField, List, ListItem, ListItemText, 
  ListItemSecondaryAction, IconButton, Box, Typography,
  Chip, Avatar, Divider
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SendIcon from '@mui/icons-material/Send';

export default function ContactBook({ 
  open, 
  onClose, 
  contacts, 
  onAddContact, 
  onRemoveContact, 
  onUpdateContact,
  onInviteContacts,
  theme 
}) {
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [selectedContacts, setSelectedContacts] = useState([]);

  const handleAddContact = () => {
    if (onAddContact(newEmail, newName)) {
      setNewEmail('');
      setNewName('');
    }
  };

  const handleEditSave = (id) => {
    onUpdateContact(id, { name: editName });
    setEditingId(null);
    setEditName('');
  };

  const toggleContactSelection = (contact) => {
    setSelectedContacts(prev => 
      prev.find(c => c.id === contact.id)
        ? prev.filter(c => c.id !== contact.id)
        : [...prev, contact]
    );
  };

  const handleInviteSelected = () => {
    if (selectedContacts.length > 0) {
      onInviteContacts(selectedContacts);
      setSelectedContacts([]);
      onClose();
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="sm" 
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: theme.colors.bg,
          color: theme.colors.text,
          borderRadius: 3
        }
      }}
    >
      <DialogTitle sx={{ 
        bgcolor: theme.colors.primary, 
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        gap: 1
      }}>
        <PersonAddIcon />
        Kontaktbok ({contacts.length})
      </DialogTitle>
      
      <DialogContent sx={{ p: 3 }}>
        {/* Lägg till kontakt */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, color: theme.colors.text }}>
            Lägg till kontakt
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              label="E-post"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              size="small"
              sx={{ flex: 2 }}
            />
            <TextField
              label="Namn (valfritt)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              size="small"
              sx={{ flex: 1 }}
            />
            <Button 
              variant="contained" 
              onClick={handleAddContact}
              disabled={!newEmail.includes('@')}
            >
              Lägg till
            </Button>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Kontaktlista */}
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ color: theme.colors.text }}>
            Mina kontakter
          </Typography>
          {selectedContacts.length > 0 && (
            <Button
              variant="contained"
              startIcon={<SendIcon />}
              onClick={handleInviteSelected}
              size="small"
            >
              Bjud in ({selectedContacts.length})
            </Button>
          )}
        </Box>

        {contacts.length === 0 ? (
          <Typography sx={{ textAlign: 'center', color: theme.colors.textSecondary, py: 4 }}>
            Inga kontakter ännu. Lägg till några för snabbare inbjudningar!
          </Typography>
        ) : (
          <List sx={{ maxHeight: 300, overflow: 'auto' }}>
            {contacts.map(contact => (
              <ListItem 
                key={contact.id}
                sx={{ 
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: 2,
                  mb: 1,
                  bgcolor: selectedContacts.find(c => c.id === contact.id) 
                    ? theme.colors.primary + '20' 
                    : theme.colors.surface,
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: theme.colors.primary + '10'
                  }
                }}
                onClick={() => toggleContactSelection(contact)}
              >
                <Avatar sx={{ mr: 2, bgcolor: theme.colors.primary }}>
                  {contact.name.charAt(0).toUpperCase()}
                </Avatar>
                <ListItemText
                  primary={
                    editingId === contact.id ? (
                      <TextField
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        size="small"
                        onKeyPress={e => e.key === 'Enter' && handleEditSave(contact.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontWeight: 600 }}>
                          {contact.name}
                        </Typography>
                        {contact.inviteCount > 0 && (
                          <Chip 
                            label={`${contact.inviteCount} inbjudningar`} 
                            size="small" 
                            color="primary"
                          />
                        )}
                      </Box>
                    )
                  }
                  secondary={contact.email}
                />
                <ListItemSecondaryAction>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (editingId === contact.id) {
                        handleEditSave(contact.id);
                      } else {
                        setEditingId(contact.id);
                        setEditName(contact.name);
                      }
                    }}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveContact(contact.id);
                    }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button onClick={onClose}>
          Stäng
        </Button>
      </DialogActions>
    </Dialog>
  );
}