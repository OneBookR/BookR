import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Badge, Drawer, IconButton, List, ListItem, ListItemText, Divider } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import CloseIcon from '@mui/icons-material/Close';

export default function InvitationSidebar({ user }) {
  const [open, setOpen] = useState(false);
  const [invitations, setInvitations] = useState([]);

  useEffect(() => {
    if (!user?.email) return;
    
    const fetchInvitations = async () => {
      try {
        const response = await fetch(`https://www.onebookr.se/api/invitations/${encodeURIComponent(user.email)}`);
        if (response.ok) {
          const data = await response.json();
          setInvitations(data.invitations || []);
        }
      } catch (error) {
        console.error('Fel vid hämtning av inbjudningar:', error);
      }
    };

    fetchInvitations();
    const interval = setInterval(fetchInvitations, 5000);
    return () => clearInterval(interval);
  }, [user?.email]);

  const handleAcceptInvitation = (groupId, inviteeId) => {
    window.location.href = `/?group=${groupId}&invitee=${inviteeId}`;
  };

  const pendingInvitations = invitations.filter(inv => !inv.responded);

  return (
    <>
      <IconButton
        onClick={() => setOpen(true)}
        sx={{
          position: 'fixed',
          top: 80,
          right: 20,
          zIndex: 1000,
          bgcolor: 'white',
          boxShadow: 2,
          '&:hover': { bgcolor: '#f5f5f5' }
        }}
      >
        <Badge badgeContent={pendingInvitations.length} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>

      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{
          sx: { width: 350, p: 2 }
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Inbjudningar</Typography>
          <IconButton onClick={() => setOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Box>
        
        <Divider sx={{ mb: 2 }} />
        
        {pendingInvitations.length === 0 ? (
          <Typography color="text.secondary">Inga nya inbjudningar</Typography>
        ) : (
          <List>
            {pendingInvitations.map((invitation, index) => (
              <ListItem key={index} sx={{ flexDirection: 'column', alignItems: 'stretch', mb: 2, border: '1px solid #e0e0e0', borderRadius: 2 }}>
                <ListItemText
                  primary={`Inbjudan från ${invitation.fromEmail}`}
                  secondary={`Kalenderjämförelse • ${new Date(invitation.createdAt).toLocaleDateString()}`}
                />
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => handleAcceptInvitation(invitation.groupId, invitation.inviteeId)}
                  sx={{ mt: 1 }}
                >
                  Acceptera
                </Button>
              </ListItem>
            ))}
          </List>
        )}
      </Drawer>
    </>
  );
}