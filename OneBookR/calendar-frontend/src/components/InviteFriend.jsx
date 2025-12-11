import React, { useState } from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  TextField, 
  Button, 
  Typography, 
  Box 
} from '@mui/material';

export default function InviteFriend({ open, onClose, onInvite }) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) return;
    
    setIsSubmitting(true);
    try {
      await onInvite(email.trim());
      setEmail('');
      onClose();
    } catch (error) {
      console.error('Invite error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Bjud in vän till kalenderjämförelse</DialogTitle>
      
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Ange e-postadressen till personen du vill jämföra kalendrar med.
        </Typography>
        
        <TextField
          autoFocus
          margin="dense"
          label="E-postadress"
          type="email"
          fullWidth
          variant="outlined"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="exempel@email.com"
        />
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Avbryt</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          disabled={!email.trim() || isSubmitting}
        >
          {isSubmitting ? 'Skickar...' : 'Skicka inbjudan'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
