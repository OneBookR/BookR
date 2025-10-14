import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Button, Card, CardContent, 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  TextField, Select, MenuItem, FormControl, InputLabel,
  List, ListItem, ListItemText, ListItemSecondaryAction,
  Checkbox, IconButton, Chip, Grid, Paper, Snackbar, Alert
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import GroupIcon from '@mui/icons-material/Group';
import DeleteIcon from '@mui/icons-material/Delete';
import EventIcon from '@mui/icons-material/Event';
import { getStoredContacts } from './ShortcutDashboard.jsx';

export default function TeamDashboard({ user, onNavigateBack }) {
  const [teams, setTeams] = useState([]);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [newTeam, setNewTeam] = useState({
    name: '',
    area: '',
    members: []
  });
  const [contacts, setContacts] = useState([]);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  const areas = [
    'CRM',
    'Marknadsföring', 
    'Finans',
    'IT',
    'HR',
    'Försäljning',
    'Utveckling',
    'Design',
    'Annat'
  ];

  useEffect(() => {
    // Hämta sparade teams från localStorage
    const savedTeams = JSON.parse(localStorage.getItem('bookr_teams') || '[]');
    setTeams(savedTeams);
    
    // Hämta kontakter
    const savedContacts = getStoredContacts();
    setContacts(savedContacts);
  }, []);

  const handleCreateTeam = () => {
    if (!newTeam.name.trim()) {
      setToast({ open: true, message: 'Teamnamn krävs', severity: 'error' });
      return;
    }
    
    if (newTeam.members.length === 0) {
      setToast({ open: true, message: 'Lägg till minst en medlem', severity: 'error' });
      return;
    }

    const team = {
      id: Date.now(),
      name: newTeam.name,
      area: newTeam.area,
      members: newTeam.members,
      createdAt: new Date().toISOString(),
      createdBy: user.email || user.emails?.[0]?.value || user.emails?.[0]
    };

    const updatedTeams = [...teams, team];
    setTeams(updatedTeams);
    localStorage.setItem('bookr_teams', JSON.stringify(updatedTeams));
    
    setNewTeam({ name: '', area: '', members: [] });
    setCreateTeamOpen(false);
    setToast({ open: true, message: 'Team skapat!', severity: 'success' });
  };

  const handleDeleteTeam = (teamId) => {
    const updatedTeams = teams.filter(t => t.id !== teamId);
    setTeams(updatedTeams);
    localStorage.setItem('bookr_teams', JSON.stringify(updatedTeams));
    setToast({ open: true, message: 'Team borttaget', severity: 'info' });
  };

  const handleMemberToggle = (contact) => {
    setNewTeam(prev => ({
      ...prev,
      members: prev.members.find(m => m.id === contact.id)
        ? prev.members.filter(m => m.id !== contact.id)
        : [...prev.members, contact]
    }));
  };

  const handleBookTeamMeeting = (team) => {
    // Skapa en grupp-inbjudan med alla teammedlemmar
    const groupId = `team_${team.id}_${Date.now()}`;
    const memberEmails = team.members.map(m => m.email);
    
    // Navigera till kalenderjämföraren med team-medlemmarna
    const params = new URLSearchParams({
      group: groupId,
      teamName: team.name,
      members: memberEmails.join(',')
    });
    
    window.location.href = `/?${params.toString()}`;
  };

  return (
    <>
      <Container maxWidth="xl" sx={{ mt: 12, mb: 4, px: { xs: 2, sm: 3 } }}>
        {/* Header */}
        <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton 
            onClick={onNavigateBack}
            sx={{ 
              bgcolor: '#f5f5f5',
              '&:hover': { bgcolor: '#e0e0e0' }
            }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h3" sx={{ 
            fontWeight: 700,
            color: '#0a2540',
            fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif"
          }}>
            Team Dashboard
          </Typography>
        </Box>

        {/* Skapa team knapp */}
        <Box sx={{ mb: 4, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateTeamOpen(true)}
            sx={{
              bgcolor: '#635bff',
              '&:hover': { bgcolor: '#7a5af8' },
              borderRadius: 3,
              px: 3,
              py: 1.5
            }}
          >
            Skapa ett team
          </Button>
        </Box>

        {/* Teams lista */}
        {teams.length === 0 ? (
          <Box sx={{
            textAlign: 'center',
            py: 8,
            bgcolor: '#f8f9fa',
            borderRadius: 3,
            border: '1px solid #e0e3e7'
          }}>
            <GroupIcon sx={{ fontSize: 64, color: '#ccc', mb: 2 }} />
            <Typography variant="h5" sx={{ color: '#666', mb: 1 }}>
              Inga team än
            </Typography>
            <Typography variant="body1" sx={{ color: '#999', mb: 3 }}>
              Skapa ditt första team för att enkelt boka teammöten
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateTeamOpen(true)}
            >
              Skapa ett team
            </Button>
          </Box>
        ) : (
          <Grid container spacing={3}>
            {teams.map((team) => (
              <Grid item xs={12} sm={6} md={4} key={team.id}>
                <Card sx={{
                  height: '100%',
                  borderRadius: 3,
                  border: '1px solid #e0e3e7',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
                  },
                  transition: 'all 0.3s ease'
                }}>
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: '#0a2540' }}>
                        {team.name}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteTeam(team.id)}
                        sx={{ color: '#d32f2f' }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                    
                    <Chip 
                      label={team.area || 'Inget område'} 
                      size="small" 
                      sx={{ mb: 2, bgcolor: '#e3f2fd' }}
                    />
                    
                    <Typography variant="body2" sx={{ color: '#666', mb: 2 }}>
                      {team.members.length} medlem{team.members.length !== 1 ? 'mar' : ''}
                    </Typography>
                    
                    <Box sx={{ mb: 3 }}>
                      {team.members.slice(0, 3).map((member, idx) => (
                        <Typography key={idx} variant="caption" sx={{ 
                          display: 'block', 
                          color: '#999',
                          fontSize: 11
                        }}>
                          • {member.name || member.email}
                        </Typography>
                      ))}
                      {team.members.length > 3 && (
                        <Typography variant="caption" sx={{ color: '#999', fontSize: 11 }}>
                          ... och {team.members.length - 3} till
                        </Typography>
                      )}
                    </Box>
                    
                    <Button
                      fullWidth
                      variant="contained"
                      startIcon={<EventIcon />}
                      onClick={() => handleBookTeamMeeting(team)}
                      sx={{
                        bgcolor: '#635bff',
                        '&:hover': { bgcolor: '#7a5af8' }
                      }}
                    >
                      Boka teammöte
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>

      {/* Skapa team dialog */}
      <Dialog 
        open={createTeamOpen} 
        onClose={() => setCreateTeamOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 600, color: '#0a2540' }}>
          Skapa nytt team
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 3 }}>
            <TextField
              fullWidth
              label="Teamnamn"
              value={newTeam.name}
              onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
              sx={{ mb: 2 }}
            />
            
            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel>Område</InputLabel>
              <Select
                value={newTeam.area}
                onChange={(e) => setNewTeam({ ...newTeam, area: e.target.value })}
                label="Område"
              >
                {areas.map((area) => (
                  <MenuItem key={area} value={area}>{area}</MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
              Välj medlemmar ({newTeam.members.length} valda)
            </Typography>
            
            {contacts.length === 0 ? (
              <Paper sx={{ p: 3, textAlign: 'center', bgcolor: '#f8f9fa' }}>
                <Typography sx={{ color: '#666' }}>
                  Inga kontakter sparade. Lägg till kontakter först för att skapa team.
                </Typography>
              </Paper>
            ) : (
              <Paper sx={{ maxHeight: 300, overflow: 'auto', border: '1px solid #e0e3e7' }}>
                <List>
                  {contacts.map((contact) => {
                    const contactSettings = JSON.parse(localStorage.getItem('bookr_contact_settings') || '{}');
                    const hasDirectAccess = contactSettings[contact.id]?.hasCalendarAccess;
                    
                    return (
                      <ListItem 
                        key={contact.id} 
                        button 
                        onClick={() => handleMemberToggle(contact)}
                        sx={{
                          bgcolor: hasDirectAccess ? '#e8f5e8' : 'transparent',
                          '&:hover': {
                            bgcolor: hasDirectAccess ? '#d4edda' : '#f5f5f5'
                          }
                        }}
                      >
                        <Checkbox
                          checked={newTeam.members.find(m => m.id === contact.id) !== undefined}
                          onChange={() => handleMemberToggle(contact)}
                        />
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <span>{contact.name}</span>
                              {hasDirectAccess && (
                                <Chip 
                                  label="Direkttillgång" 
                                  size="small" 
                                  color="success"
                                  sx={{ fontSize: 10, height: 18 }}
                                />
                              )}
                            </Box>
                          }
                          secondary={contact.email}
                        />
                      </ListItem>
                    );
                  })}
                </List>
              </Paper>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateTeamOpen(false)}>
            Avbryt
          </Button>
          <Button 
            variant="contained" 
            onClick={handleCreateTeam}
            disabled={!newTeam.name.trim() || newTeam.members.length === 0}
          >
            Skapa team
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToast({ ...toast, open: false })}
          severity={toast.severity}
          sx={{ width: '100%', borderRadius: 2 }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
}