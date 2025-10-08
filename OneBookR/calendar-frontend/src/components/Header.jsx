import React from 'react';
import { AppBar, Toolbar, Box, Typography, Button, IconButton } from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import GetAppIcon from '@mui/icons-material/GetApp';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import LogoutIcon from '@mui/icons-material/Logout';
import LoginIcon from '@mui/icons-material/Login';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import DashboardIcon from '@mui/icons-material/Dashboard';
import TaskIcon from '@mui/icons-material/Task';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { useNotifications } from '../hooks/useNotifications';
import { usePWA } from '../hooks/usePWA';

const Header = ({ user, onNavigate }) => {
  const { permission, requestPermission } = useNotifications();
  const { isInstallable, installApp } = usePWA();

  const handleLogout = () => {
    window.location.href = 'https://www.onebookr.se/auth/logout';
  };

  const handleLogin = () => {
    window.location.href = 'https://www.onebookr.se/auth/google';
  };

  return (
    <AppBar
      position="fixed"
      color="default"
      elevation={0}
      sx={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderBottom: 'none',
        zIndex: 1201,
        top: '48px',
        transition: 'all 0.3s ease',
        boxShadow: '0 4px 20px rgba(102, 126, 234, 0.3)'
      }}
    >
      <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', minHeight: { xs: 48, sm: 56, md: 64 }, px: { xs: 1, sm: 2, md: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1.5, md: 3 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{
              fontWeight: 800,
              fontSize: { xs: 16, sm: 20, md: 24 },
              color: 'white',
              letterSpacing: { xs: 0.5, sm: 1 },
              fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
              mr: { xs: 0.5, sm: 1, md: 2 },
              userSelect: 'none',
              cursor: 'pointer',
              textShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}
            onClick={() => window.location.href = '/'}>
              BookR
            </Box>

          </Box>
          
          {/* Navigation Menu */}
          {user && (
            <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: { xs: 0.5, sm: 0.8, md: 1 } }}>
              <Button
                startIcon={<DashboardIcon />}
                onClick={() => window.location.href = '/'}
                sx={{ 
                  color: 'rgba(255,255,255,0.9)', 
                  fontWeight: 500,
                  fontSize: { xs: 10, sm: 12, md: 14 },
                  px: { xs: 1, sm: 1.5, md: 2 },
                  '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.1)' }
                }}
              >
                Dashboard
              </Button>
              <Button
                startIcon={<PersonIcon />}
                onClick={() => window.location.href = '/?meetingType=1v1'}
                sx={{ 
                  color: 'rgba(255,255,255,0.9)', 
                  fontWeight: 500,
                  fontSize: { xs: 10, sm: 12, md: 14 },
                  px: { xs: 1, sm: 1.5, md: 2 },
                  '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.1)' }
                }}
              >
                1v1 Meeting
              </Button>
              <Button
                startIcon={<GroupIcon />}
                onClick={() => window.location.href = '/?meetingType=group'}
                sx={{ 
                  color: 'rgba(255,255,255,0.9)', 
                  fontWeight: 500,
                  fontSize: { xs: 10, sm: 12, md: 14 },
                  px: { xs: 1, sm: 1.5, md: 2 },
                  '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.1)' }
                }}
              >
                Group Meeting
              </Button>
              <Button
                startIcon={<TaskIcon />}
                onClick={() => window.location.href = '/?view=task'}
                sx={{ 
                  color: 'rgba(255,255,255,0.9)', 
                  fontWeight: 500,
                  fontSize: { xs: 10, sm: 12, md: 14 },
                  px: { xs: 1, sm: 1.5, md: 2 },
                  '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.1)' }
                }}
              >
                Task
              </Button>

            </Box>
          )}
          
          {/* Separator */}
          <Box sx={{ 
            display: { xs: 'none', md: 'block' },
            width: '1px',
            height: '24px',
            bgcolor: 'rgba(255,255,255,0.3)',
            mx: 2
          }} />
          
          <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: { xs: 1, md: 2 } }}>
            <Button
              color="inherit"
              sx={{ fontWeight: 500, fontSize: { xs: 12, sm: 14 }, color: 'rgba(255,255,255,0.9)', '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}
              onClick={() => window.location.href = '/om-oss'}
            >
              Om oss
            </Button>
            <Button
              color="inherit"
              sx={{ fontWeight: 500, fontSize: { xs: 12, sm: 14 }, color: 'rgba(255,255,255,0.9)', '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}
              onClick={() => window.location.href = '/kontakt'}
            >
              Kontakta oss
            </Button>
          </Box>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 0.8, md: 1 } }}>
          {permission !== 'granted' && (
            <Button
              size="small"
              startIcon={<NotificationsActiveIcon />}
              onClick={requestPermission}
              sx={{ 
                fontWeight: 500, 
                color: 'white',
                borderRadius: 2,
                fontSize: 12,
                bgcolor: 'rgba(255,255,255,0.2)',
                '&:hover': {
                  bgcolor: 'rgba(255,255,255,0.3)'
                }
              }}
            >
              Aktivera notiser
            </Button>
          )}
          
          <Button
            size="small"
            startIcon={<GetAppIcon />}
            onClick={() => {
              if (isInstallable) {
                installApp();
              }
            }}
            sx={{ 
              fontWeight: 500, 
              color: 'white',
              borderRadius: 2,
              fontSize: 12,
              bgcolor: 'rgba(255,255,255,0.2)',
              opacity: isInstallable ? 1 : 0.6,
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.3)'
              }
            }}
          >
            {isInstallable ? 'Installera app' : 'App (ej tillgänglig)'}
          </Button>

          <Button
            color="inherit"
            startIcon={<HelpOutlineIcon />}
            sx={{ 
              fontWeight: 500, 
              color: 'rgba(255,255,255,0.9)', 
              borderRadius: 2,
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.1)'
              }
            }}
          >
            Hjälp
          </Button>
          
          {user ? (
            <>
              <Button
                variant="outlined"
                startIcon={<ChevronLeftIcon />}
                onClick={async () => {
                  // Hämta aktuell gruppinformation från URL eller session
                  const urlParams = new URLSearchParams(window.location.search);
                  const groupId = urlParams.get('group');
                  
                  if (groupId) {
                    try {
                      // Hämta gruppinformation från backend
                      const groupResponse = await fetch(`https://www.onebookr.se/api/group/${groupId}/status`);
                      const groupData = await groupResponse.json();
                      
                      const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0] || 'Du';
                      
                      const leftMeeting = {
                        id: groupId,
                        groupName: groupData.groupName || sessionStorage.getItem('currentGroupName') || 'Kalenderjämförelse',
                        members: groupData.joined || JSON.parse(sessionStorage.getItem('currentGroupMembers') || '[]'),
                        leftAt: new Date().toISOString()
                      };
                      
                      // Uppdatera localStorage med det nya öppna mötet
                      const existingMeetings = JSON.parse(localStorage.getItem('leftMeetings') || '[]');
                      const updatedMeetings = existingMeetings.filter(m => m.id !== groupId);
                      updatedMeetings.push(leftMeeting);
                      localStorage.setItem('leftMeetings', JSON.stringify(updatedMeetings));
                    } catch (err) {
                      console.log('Failed to fetch group info, using fallback:', err);
                      // Fallback om API-anrop misslyckas
                      const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0] || 'Du';
                      const leftMeeting = {
                        id: groupId,
                        groupName: sessionStorage.getItem('currentGroupName') || 'Kalenderjämförelse',
                        members: JSON.parse(sessionStorage.getItem('currentGroupMembers') || '[]'),
                        leftAt: new Date().toISOString()
                      };
                      const existingMeetings = JSON.parse(localStorage.getItem('leftMeetings') || '[]');
                      const updatedMeetings = existingMeetings.filter(m => m.id !== groupId);
                      updatedMeetings.push(leftMeeting);
                      localStorage.setItem('leftMeetings', JSON.stringify(updatedMeetings));
                    }
                  }
                  
                  window.location.href = '/';
                }}
                sx={{ 
                  fontWeight: 600, 
                  borderRadius: 2,
                  borderColor: 'rgba(255,255,255,0.3)',
                  color: 'white',
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.1)',
                    borderColor: 'rgba(255,255,255,0.5)'
                  }
                }}
              >
                Lämna grupp
              </Button>
              <Button
                variant="contained"
                startIcon={<LogoutIcon />}
                onClick={handleLogout}
                sx={{ 
                  fontWeight: 600, 
                  borderRadius: 2,
                  bgcolor: 'rgba(255,255,255,0.2)',
                  color: 'white',
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.3)'
                  }
                }}
              >
                Logga ut
              </Button>
            </>
          ) : (
            <Button
              variant="contained"
              startIcon={<LoginIcon />}
              onClick={handleLogin}
              sx={{ 
                fontWeight: 600, 
                borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.2)',
                color: 'white',
                '&:hover': {
                  bgcolor: 'rgba(255,255,255,0.3)'
                }
              }}
            >
              Logga in
            </Button>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;