import React, { useState } from 'react';
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  Button, 
  Box, 
  IconButton, 
  Menu, 
  MenuItem, 
  Avatar,
  Chip
} from '@mui/material';
import { 
  AccountCircle, 
  Logout, 
  ExitToApp, 
  Home, 
  Task, 
  Group 
} from '@mui/icons-material';
import { LOGOUT_URL, HOME_URL } from '../config';
import GDPRNotice from './GDPRNotice';

export default function Header({ user, onNavigate, onLeaveGroup }) {
  const [anchorEl, setAnchorEl] = useState(null);
  
  // ✅ URL PARAMS
  const urlParams = new URLSearchParams(window.location.search);
  const groupId = urlParams.get('group');
  const isInGroup = Boolean(groupId);
  
  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = LOGOUT_URL;
  };

  const handleLeaveGroup = () => {
    // Ta bort group-parametrar från URL
    const url = new URL(window.location);
    url.searchParams.delete('group');
    url.searchParams.delete('invitee');
    url.searchParams.delete('directAccess');
    url.searchParams.delete('contactEmail');
    url.searchParams.delete('contactName');
    
    window.history.replaceState({}, '', url);
    
    if (onLeaveGroup) {
      onLeaveGroup();
    } else {
      // Fallback: reload sidan
      window.location.reload();
    }
    
    handleMenuClose();
  };

  const handleGoHome = () => {
    window.location.href = HOME_URL;
    handleMenuClose();
  };

  const getUserDisplayName = () => {
    if (!user) return 'Okänd användare';
    
    if (user.displayName) return user.displayName;
    if (user.name) return user.name;
    
    const email = user.email || user.emails?.[0]?.value || user.emails?.[0];
    if (email) {
      return email.split('@')[0];
    }
    
    return 'Användare';
  };

  const getUserEmail = () => {
    return user?.email || user?.emails?.[0]?.value || user?.emails?.[0] || '';
  };

  if (!user) return null;

  return (
    <AppBar 
      position="fixed" 
      sx={{ 
        top: 0,
        zIndex: 1100,
        background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
        boxShadow: '0 2px 12px rgba(99, 91, 255, 0.15)'
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between', minHeight: 64 }}>
        {/* ✅ LOGO OCH TITEL */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography 
            variant="h6" 
            sx={{ 
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 24,
              letterSpacing: -0.5
            }}
            onClick={handleGoHome}
          >
            📅 BookR
          </Typography>
          
          {isInGroup && (
            <Chip
              label="I grupp"
              size="small"
              sx={{
                bgcolor: 'rgba(255,255,255,0.2)',
                color: 'white',
                fontWeight: 600,
                fontSize: 11
              }}
            />
          )}
        </Box>

        {/* ✅ MITT OMRÅDE - DESKTOP NAVIGATION + LÄMNA GRUPP KNAPP */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* ✅ LÄMNA GRUPP KNAPP - DESKTOP */}
          {isInGroup && (
            <Button
              color="inherit"
              onClick={handleLeaveGroup}
              startIcon={<ExitToApp />}
              sx={{ 
                fontWeight: 500,
                bgcolor: 'rgba(255,255,255,0.1)',
                '&:hover': {
                  bgcolor: 'rgba(255,255,255,0.2)'
                },
                display: { xs: 'none', md: 'flex' }
              }}
            >
              Lämna grupp
            </Button>
          )}

          {/* ✅ NAVIGATION KNAPPAR (DESKTOP) - ENDAST OM INTE I GRUPP */}
          {!isInGroup && (
            <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 1 }}>
              <Button 
                color="inherit" 
                onClick={() => onNavigate?.('1v1')}
                startIcon={<Group />}
                sx={{ fontWeight: 500 }}
              >
                1v1 Möte
              </Button>
              <Button 
                color="inherit" 
                onClick={() => onNavigate?.('group')}
                startIcon={<Group />}
                sx={{ fontWeight: 500 }}
              >
                Gruppmöte
              </Button>
              <Button 
                color="inherit" 
                onClick={() => onNavigate?.('task')}
                startIcon={<Task />}
                sx={{ fontWeight: 500 }}
              >
                Uppgift
              </Button>
            </Box>
          )}
        </Box>

        {/* ✅ USER MENU */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography 
            variant="body2" 
            sx={{ 
              display: { xs: 'none', sm: 'block' },
              fontWeight: 500,
              opacity: 0.9
            }}
          >
            {getUserDisplayName()}
          </Typography>
          
          <IconButton
            onClick={handleMenuOpen}
            sx={{ 
              color: 'white',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
            }}
          >
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(255,255,255,0.2)' }}>
              <AccountCircle />
            </Avatar>
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            sx={{ mt: 1 }}
          >
            <MenuItem disabled sx={{ opacity: 0.7 }}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {getUserDisplayName()}
                </Typography>
                <Typography variant="caption" sx={{ color: '#666' }}>
                  {getUserEmail()}
                </Typography>
              </Box>
            </MenuItem>
            
            {!isInGroup && (
              <MenuItem onClick={handleGoHome}>
                <Home sx={{ mr: 1 }} />
                Hem
              </MenuItem>
            )}
            
            {/* ✅ LÄMNA GRUPP I MOBIL MENU */}
            {isInGroup && (
              <MenuItem onClick={handleLeaveGroup}>
                <ExitToApp sx={{ mr: 1 }} />
                Lämna grupp
              </MenuItem>
            )}
            
            <MenuItem onClick={handleLogout}>
              <Logout sx={{ mr: 1 }} />
              Logga ut
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
}