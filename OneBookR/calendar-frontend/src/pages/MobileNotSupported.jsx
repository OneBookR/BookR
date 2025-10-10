import React from 'react';
import { Box, Typography, Button, Container, Paper } from '@mui/material';
import ComputerIcon from '@mui/icons-material/Computer';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';

const MobileNotSupported = ({ user, onLogout }) => {
  return (
    <Container maxWidth="sm" sx={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      px: 2
    }}>
      <Paper elevation={3} sx={{ 
        p: 4, 
        textAlign: 'center', 
        borderRadius: 3,
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
      }}>
        <Box sx={{ mb: 3 }}>
          <PhoneIphoneIcon sx={{ fontSize: 60, color: '#ff6b6b', mb: 2 }} />
          <ComputerIcon sx={{ fontSize: 80, color: '#4ecdc4', ml: 2 }} />
        </Box>
        
        <Typography variant="h4" sx={{ 
          fontWeight: 700, 
          color: '#2c3e50', 
          mb: 2,
          fontSize: { xs: '1.5rem', sm: '2rem' }
        }}>
          BookR är inte tillgängligt på mobil än
        </Typography>
        
        <Typography variant="body1" sx={{ 
          color: '#7f8c8d', 
          mb: 3,
          lineHeight: 1.6
        }}>
          Tack för att du loggade in! BookR fungerar för närvarande bara på datorer och surfplattor. 
          Vi arbetar på en mobilversion som kommer snart.
        </Typography>
        
        <Box sx={{ 
          bgcolor: '#fff3cd', 
          border: '1px solid #ffeaa7', 
          borderRadius: 2, 
          p: 2, 
          mb: 3 
        }}>
          <Typography variant="body2" sx={{ color: '#856404', fontWeight: 500 }}>
            💡 För bästa upplevelse, använd BookR på en dator eller surfplatta
          </Typography>
        </Box>
        
        {user && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" sx={{ color: '#6c757d', mb: 2 }}>
              Inloggad som: {user.email || user.displayName}
            </Typography>
            <Button 
              variant="outlined" 
              onClick={onLogout}
              sx={{ 
                borderColor: '#6c757d',
                color: '#6c757d',
                '&:hover': {
                  borderColor: '#495057',
                  color: '#495057'
                }
              }}
            >
              Logga ut
            </Button>
          </Box>
        )}
        
        <Typography variant="caption" sx={{ 
          color: '#adb5bd', 
          display: 'block',
          mt: 2
        }}>
          Mobilversion kommer snart! 📱✨
        </Typography>
      </Paper>
    </Container>
  );
};

export default MobileNotSupported;