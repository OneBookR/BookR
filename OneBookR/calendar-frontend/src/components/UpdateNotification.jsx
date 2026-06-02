import React, { useEffect, useState } from 'react';
import { Snackbar, Alert, Button, Box } from '@mui/material';
import { versionCheck } from '../services/versionCheck';

/**
 * ✅ UPDATE NOTIFICATION COMPONENT
 * Visar notifikation när ny version är tillgänglig
 */
export const UpdateNotification = () => {
  const [open, setOpen] = useState(false);
  const [newVersion, setNewVersion] = useState(null);

  useEffect(() => {
    // Lyssna på newVersionAvailable event
    const handleNewVersion = (event) => {
      setNewVersion(event.detail.version);
      setOpen(true);
    };

    window.addEventListener('newVersionAvailable', handleNewVersion);
    return () => window.removeEventListener('newVersionAvailable', handleNewVersion);
  }, []);

  const handleUpdate = () => {
    versionCheck.forceUpdate();
  };

  const handleDismiss = () => {
    setOpen(false);
  };

  return (
    <Snackbar
      open={open}
      autoHideDuration={null}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert
        onClose={handleDismiss}
        severity="info"
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          '& .MuiAlert-message': { flex: 1 }
        }}
      >
        <Box>
          En ny version av BookR är tillgänglig. Uppdatera för att få de senaste funktionerna.
        </Box>
        <Button
          color="inherit"
          size="small"
          onClick={handleUpdate}
          sx={{ whiteSpace: 'nowrap', fontWeight: 'bold' }}
        >
          Uppdatera nu
        </Button>
      </Alert>
    </Snackbar>
  );
};
