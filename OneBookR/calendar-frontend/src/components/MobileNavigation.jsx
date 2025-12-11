import React, { useState, useMemo } from 'react';
import { 
  BottomNavigation, 
  BottomNavigationAction, 
  Paper, 
  Badge,
  Fab,
  Box,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon
} from '@mui/material';
import {
  Home as HomeIcon,
  CalendarToday as CalendarIcon,
  Group as GroupIcon,
  Person as PersonIcon,
  Add as AddIcon,
  VideoCall as VideoCallIcon,
  Event as EventIcon,
  Schedule as ScheduleIcon,
  Notifications as NotificationsIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import usePWA from '../hooks/usePWA';

const MobileNavigation = ({ currentPath, user, onNavigate, notifications = [] }) => {
  const [value, setValue] = useState(0);
  const [speedDialOpen, setSpeedDialOpen] = useState(false);
  const theme = useTheme();
  const { isInstallable, installPWA } = usePWA();

  // ✅ DETERMINE CURRENT TAB BASED ON PATH
  const currentTab = useMemo(() => {
    if (currentPath.includes('group=')) return 1; // Gruppmöte
    if (currentPath.includes('meetingType=1v1')) return 2; // 1v1 möte  
    if (currentPath.includes('view=task')) return 3; // Uppgifter
    return 0; // Hem
  }, [currentPath]);

  // ✅ QUICK ACTIONS FOR SPEED DIAL
  const quickActions = [
    {
      icon: <VideoCallIcon />,
      name: '1v1 Möte',
      action: () => onNavigate?.('1v1'),
      color: '#4caf50'
    },
    {
      icon: <GroupIcon />,
      name: 'Gruppmöte',
      action: () => onNavigate?.('group'),
      color: '#2196f3'
    },
    {
      icon: <EventIcon />,
      name: 'Uppgift',
      action: () => onNavigate?.('task'),
      color: '#ff9800'
    }
  ];

  // ✅ NAVIGATION ITEMS
  const navItems = [
    {
      label: 'Hem',
      icon: <HomeIcon />,
      action: () => window.location.href = '/'
    },
    {
      label: 'Grupp',
      icon: <GroupIcon />,
      badge: currentPath.includes('group=') ? 1 : 0,
      action: () => onNavigate?.('group')
    },
    {
      label: '1v1',
      icon: <CalendarIcon />,
      action: () => onNavigate?.('1v1')
    },
    {
      label: 'Profil',
      icon: <PersonIcon />,
      badge: notifications.length,
      action: () => {
        // Öppna profilmeny eller notifikationer
        console.log('Open profile/notifications');
      }
    }
  ];

  if (!user) return null;

  return (
    <>
      {/* ✅ BOTTOM NAVIGATION */}
      <Paper 
        sx={{ 
          position: 'fixed', 
          bottom: 0, 
          left: 0, 
          right: 0, 
          zIndex: 1000,
          borderTop: '1px solid',
          borderColor: 'divider',
          display: { xs: 'block', md: 'none' }
        }} 
        elevation={8}
      >
        <BottomNavigation
          value={currentTab}
          onChange={(event, newValue) => setValue(newValue)}
          sx={{
            height: 70,
            '& .MuiBottomNavigationAction-root': {
              minWidth: 'auto',
              paddingTop: '8px',
              paddingBottom: '8px'
            }
          }}
        >
          {navItems.map((item, index) => (
            <BottomNavigationAction
              key={index}
              label={item.label}
              icon={
                item.badge > 0 ? (
                  <Badge 
                    badgeContent={item.badge} 
                    color="error"
                    max={9}
                  >
                    {item.icon}
                  </Badge>
                ) : item.icon
              }
              onClick={item.action}
              sx={{
                color: currentTab === index ? 'primary.main' : 'text.secondary',
                '&.Mui-selected': {
                  color: 'primary.main'
                }
              }}
            />
          ))}
        </BottomNavigation>
      </Paper>

      {/* ✅ FLOATING ACTION BUTTON - SPEED DIAL */}
      <SpeedDial
        ariaLabel="Quick Actions"
        sx={{
          position: 'fixed',
          bottom: 90,
          right: 16,
          display: { xs: 'flex', md: 'none' },
          '& .MuiFab-primary': {
            background: 'linear-gradient(45deg, #635bff 30%, #667eea 90%)',
            width: 56,
            height: 56
          }
        }}
        icon={<SpeedDialIcon />}
        open={speedDialOpen}
        onClose={() => setSpeedDialOpen(false)}
        onOpen={() => setSpeedDialOpen(true)}
        direction="up"
      >
        {quickActions.map((action) => (
          <SpeedDialAction
            key={action.name}
            icon={action.icon}
            tooltipTitle={action.name}
            onClick={() => {
              action.action();
              setSpeedDialOpen(false);
            }}
            sx={{
              '& .MuiFab-primary': {
                backgroundColor: action.color,
                '&:hover': {
                  backgroundColor: action.color,
                  filter: 'brightness(1.1)'
                }
              }
            }}
          />
        ))}
        
        {/* ✅ PWA INSTALL ACTION */}
        {isInstallable && (
          <SpeedDialAction
            icon={<AddIcon />}
            tooltipTitle="Installera BookR"
            onClick={() => {
              installPWA();
              setSpeedDialOpen(false);
            }}
            sx={{
              '& .MuiFab-primary': {
                backgroundColor: '#9c27b0',
                '&:hover': {
                  backgroundColor: '#9c27b0',
                  filter: 'brightness(1.1)'
                }
              }
            }}
          />
        )}
      </SpeedDial>

      {/* ✅ OFFLINE INDICATOR */}
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bgcolor: 'warning.main',
          color: 'warning.contrastText',
          py: 0.5,
          textAlign: 'center',
          fontSize: '0.875rem',
          zIndex: 9999,
          display: navigator.onLine ? 'none' : 'block'
        }}
      >
        📶 Offline - Begränsad funktionalitet
      </Box>
    </>
  );
};

export default MobileNavigation;