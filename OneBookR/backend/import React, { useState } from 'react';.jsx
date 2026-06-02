import React, { useState } from 'react';
import { 
  Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, 
  Typography, List, ListItem, ListItemText, Alert, Chip 
} from '@mui/material';
import { API_BASE_URL } from '../config';

export default function GDPRNotice({ user }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleExportData = async () => {
    setExportLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/gdpr/export`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { 
          type: 'application/json' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bookr-gdpr-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert('Export misslyckades');
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Export misslyckades');
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteData = async () => {
    if (!confirm('⚠️ Detta raderar ALL din data och loggar ut dig. Fortsätt?')) {
      return;
    }
    
    setDeleteLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/gdpr/delete`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (response.ok) {
        alert('✅ All data raderad. Du loggas nu ut.');
        window.location.href = '/';
      } else {
        alert('Radering misslyckades');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Radering misslyckades');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="text"
        size="small"
        onClick={() => setDialogOpen(true)}
        sx={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.75rem' }}
      >
        🔒 Integritet
      </Button>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>🔒 GDPR & Datasäkerhet</DialogTitle>
        
        <DialogContent>
          <Alert severity="success" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              🇪🇺 BookR är GDPR-kompatibel
            </Typography>
            Vi följer dataminimeringsprincipen och skyddar din integritet.
          </Alert>

          <Typography variant="h6" sx={{ mb: 2 }}>
            🛡️ Datasäkerhet:
          </Typography>
          <List dense>
            <ListItem>
              <ListItemText 
                primary="Krypterad datalagring"
                secondary="Email-adresser krypteras i systemet"
              />
              <Chip label="🔐 Säkert" color="success" size="small" />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="Anonymiserade loggar"
                secondary="All serverloggning anonymiserar personlig data"
              />
              <Chip label="🎭 Privat" color="primary" size="small" />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="Automatisk rensning"
                secondary="All data raderas automatiskt efter 24 timmar"
              />
              <Chip label="⏰ 24h" color="warning" size="small" />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="Minimal datalagring"
                secondary="Endast nödvändig tidsinfo från kalendrar sparas"
              />
              <Chip label="📉 Minimal" color="info" size="small" />
            </ListItem>
          </List>

          <Typography variant="h6" sx={{ mb: 2, mt: 3 }}>
            📋 Dina GDPR-rättigheter:
          </Typography>
          <List dense>
            <ListItem>
              <ListItemText 
                primary="Rätt till tillgång"
                secondary="Exportera all data vi har om dig"
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="Rätt till radering"
                secondary="Radera all din data från våra system"
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="Rätt till dataportabilitet"
                secondary="Få din data i maskinläsbart format"
              />
            </ListItem>
          </List>

          <Alert severity="info" sx={{ mt: 3 }}>
            <Typography variant="body2">
              📞 <strong>Kontakt:</strong> För frågor om databehandling, kontakta oss på support@onebookr.se
            </Typography>
          </Alert>
        </DialogContent>
        
        <DialogActions sx={{ p: 3, flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>
            Stäng
          </Button>
          
          <Button
            variant="outlined"
            onClick={handleExportData}
            disabled={exportLoading}
            sx={{ flex: { sm: 1 } }}
          >
            {exportLoading ? 'Exporterar...' : '📥 Exportera min data'}
          </Button>
          
          <Button
            variant="outlined"
            color="error"
            onClick={handleDeleteData}
            disabled={deleteLoading}
            sx={{ flex: { sm: 1 } }}
          >
            {deleteLoading ? 'Raderar...' : '🗑️ Radera all data'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
