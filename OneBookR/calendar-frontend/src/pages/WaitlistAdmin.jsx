import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Paper, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, TextField, Button, Alert
} from '@mui/material';
import { API_BASE_URL } from '../config';

const WaitlistAdmin = () => {
  const [waitlist, setWaitlist] = useState([]);
  const [adminKey, setAdminKey] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/waitlist/admin`, {
        headers: { 'x-admin-key': adminKey }
      });
      
      if (res.ok) {
        const data = await res.json();
        setWaitlist(data.waitlist);
        setIsAuthenticated(true);
        setError('');
      } else {
        setError('Fel admin-nyckel');
      }
    } catch (err) {
      setError('Kunde inte ansluta till servern');
    }
  };

  const exportCSV = () => {
    const csv = [
      'Namn,E-post,Registrerad',
      ...waitlist.map(entry => 
        `"${entry.name}","${entry.email}","${new Date(entry.timestamp).toLocaleString('sv-SE')}"`
      )
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookr-waitlist-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (!isAuthenticated) {
    return (
      <Container maxWidth="sm" sx={{ mt: 10 }}>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h5" sx={{ mb: 3 }}>
            BookR Admin - Väntelista
          </Typography>
          <TextField
            label="Admin-nyckel"
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
          />
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Button variant="contained" onClick={handleLogin} fullWidth>
            Logga in
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
          BookR Väntelista ({waitlist.length} personer)
        </Typography>
        <Button variant="contained" onClick={exportCSV}>
          Exportera CSV
        </Button>
      </Box>
      
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell><strong>Namn</strong></TableCell>
              <TableCell><strong>E-post</strong></TableCell>
              <TableCell><strong>Registrerad</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {waitlist.map((entry, index) => (
              <TableRow key={index}>
                <TableCell>{entry.name}</TableCell>
                <TableCell>{entry.email}</TableCell>
                <TableCell>{new Date(entry.timestamp).toLocaleString('sv-SE')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
};

export default WaitlistAdmin;