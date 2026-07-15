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
  Chip,
  Container
} from '@mui/material';
import {
  AccountCircle,
  Logout,
  ExitToApp,
  Home,
  Task,
  Group,
  Shield
} from '@mui/icons-material';
import { LOGOUT_URL, HOME_URL } from '../config';
import GDPRNotice from './GDPRNotice';

export default function Header({ user, onNavigate, onLeaveGroup }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [gdprOpen, setGdprOpen] = useState(false);
  
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
    // Rensa bara inställningar som inte är känsliga — session rensas av servern
    localStorage.removeItem('bookr_contact_settings');
    localStorage.removeItem('bookr_contacts');
    localStorage.removeItem('leftMeetings');
    window.location.href = LOGOUT_URL;
  };

  const handleLeaveGroup = () => {
    if (onLeaveGroup) {
      onLeaveGroup();
    }
    window.location.href = HOME_URL;
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
    <>
    <AppBar 
      position="fixed" 
      sx={{ 
        top: 0,
        zIndex: 1100,
        background: 'rgba(247, 247, 243, 0.82)',
        color: 'var(--text)',
        boxShadow: 'none',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(22px)'
      }}
    >
      <Container maxWidth="lg">
        <Toolbar sx={{ justifyContent: 'space-between', minHeight: 72, px: '0 !important' }}>
          {/* ✅ LOGO OCH TITEL */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography 
              variant="h6" 
              sx={{ 
                fontWeight: 800,
                cursor: 'pointer',
                fontSize: 24,
                letterSpacing: '-0.06em'
              }}
              onClick={handleGoHome}
            >
              BookR
            </Typography>
            
            {isInGroup && (
              <Chip
                label="I grupp"
                size="small"
                sx={{
                  bgcolor: 'rgba(17,24,39,0.05)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  fontWeight: 700,
                  fontSize: 11
                }}
              />
            )}
          </Box>

          {/* ✅ MITT OMRÅDE - DESKTOP NAVIGATION + LÄMNA GRUPP KNAPP */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* ✅ LÄMNA GRUPP KNAPP - DESKTOP */}
            {isInGroup && (
              <Button
                color="inherit"
                onClick={handleLeaveGroup}
                startIcon={<ExitToApp />}
                sx={{ 
                  fontWeight: 700,
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                  bgcolor: 'rgba(255,255,255,0.62)',
                  '&:hover': {
                    bgcolor: 'rgba(17,24,39,0.04)'
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
                  sx={{
                    fontWeight: 700,
                    borderRadius: 999,
                    px: 1.75,
                    '&:hover': { bgcolor: 'rgba(17,24,39,0.04)' }
                  }}
                >
                  1v1 Möte
                </Button>
                <Button 
                  color="inherit" 
                  onClick={() => onNavigate?.('group')}
                  startIcon={<Group />}
                  sx={{
                    fontWeight: 700,
                    borderRadius: 999,
                    px: 1.75,
                    '&:hover': { bgcolor: 'rgba(17,24,39,0.04)' }
                  }}
                >
                  Gruppmöte
                </Button>
                <Button 
                  color="inherit" 
                  onClick={() => onNavigate?.('task')}
                  startIcon={<Task />}
                  sx={{
                    fontWeight: 700,
                    borderRadius: 999,
                    px: 1.75,
                    '&:hover': { bgcolor: 'rgba(17,24,39,0.04)' }
                  }}
                >
                  Uppgift
                </Button>
              </Box>
            )}
          </Box>

          {/* ✅ USER MENU */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Typography 
              variant="body2" 
              sx={{ 
                display: { xs: 'none', sm: 'block' },
                fontWeight: 700,
                color: 'var(--text-secondary)'
              }}
            >
              {getUserDisplayName()}
            </Typography>
            
            <IconButton
              onClick={handleMenuOpen}
              sx={{ 
                color: 'var(--text)',
                border: '1px solid var(--border)',
                bgcolor: 'rgba(255,255,255,0.56)',
                '&:hover': { bgcolor: 'rgba(17,24,39,0.04)' }
              }}
            >
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(17,24,39,0.08)', color: 'var(--text)' }}>
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
              <MenuItem disabled sx={{ opacity: 0.8 }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {getUserDisplayName()}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
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
              
              <MenuItem onClick={() => { setGdprOpen(true); handleMenuClose(); }}>
                <Shield sx={{ mr: 1 }} />
                Integritet &amp; data
              </MenuItem>

              <MenuItem onClick={handleLogout}>
                <Logout sx={{ mr: 1 }} />
                Logga ut
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </Container>
    </AppBar>

    <GDPRNotice user={user} open={gdprOpen} onClose={() => setGdprOpen(false)} />
  </>
  );
}