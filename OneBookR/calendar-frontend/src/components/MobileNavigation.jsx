import React, { useState } from 'react';
import { 
  BottomNavigation, 
  BottomNavigationAction, 
  Paper, 
  useMediaQuery, 
  useTheme,
  Fab,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import TaskIcon from '@mui/icons-material/Task';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AddIcon from '@mui/icons-material/Add';

const MobileNavigation = ({ currentPath, user }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [speedDialOpen, setSpeedDialOpen] = useState(false);

  if (!isMobile || !user) return null;

  const getCurrentValue = () => {
    if (currentPath === '/') return 0;
    if (currentPath.includes('meetingType=1v1')) return 1;
    if (currentPath.includes('meetingType=group')) return 2;
    if (currentPath.includes('view=task')) return 3;
    if (currentPath.includes('group=')) return 4;
    return 0;
  };

  const handleNavigationChange = (event, newValue) => {
    switch (newValue) {
      case 0:
        window.location.href = '/';
        break;
      case 1:
        window.location.href = '/?meetingType=1v1';
        break;
      case 2:
        window.location.href = '/?meetingType=group';
        break;
      case 3:
        window.location.href = '/?view=task';
        break;
      case 4:
        // Stay on current calendar comparison page
        break;
      default:
        break;
    }
  };

  const speedDialActions = [
    {
      icon: <PersonIcon />,
      name: '1v1 Meeting',
      action: () => window.location.href = '/?meetingType=1v1'
    },
    {
      icon: <GroupIcon />,
      name: 'Group Meeting', 
      action: () => window.location.href = '/?meetingType=group'
    },
    {
      icon: <TaskIcon />,
      name: 'Task Scheduler',
      action: () => window.location.href = '/?view=task'
    }
  ];

  return (
    <>
      {/* Bottom Navigation */}
      <Paper 
        sx={{ 
          position: 'fixed', 
          bottom: 0, 
          left: 0, 
          right: 0, 
          zIndex: 1000,
          borderTop: '1px solid #e0e3e7'
        }} 
        elevation={3}
      >
        <BottomNavigation
          value={getCurrentValue()}
          onChange={handleNavigationChange}
          sx={{
            height: 64,
            '& .MuiBottomNavigationAction-root': {
              minWidth: 'auto',
              padding: '6px 12px 8px',
              '&.Mui-selected': {
                color: '#1976d2'
              }
            },
            '& .MuiBottomNavigationAction-label': {
              fontSize: '0.75rem',
              '&.Mui-selected': {
                fontSize: '0.75rem'
              }
            }
          }}
        >
          <BottomNavigationAction 
            label="Dashboard" 
            icon={<DashboardIcon />} 
          />
          <BottomNavigationAction 
            label="1v1" 
            icon={<PersonIcon />} 
          />
          <BottomNavigationAction 
            label="Grupp" 
            icon={<GroupIcon />} 
          />
          <BottomNavigationAction 
            label="Task" 
            icon={<TaskIcon />} 
          />
          <BottomNavigationAction 
            label="Kalender" 
            icon={<CalendarTodayIcon />} 
          />
        </BottomNavigation>
      </Paper>

      {/* Floating Action Button with Speed Dial */}
      <SpeedDial
        ariaLabel="Snabba åtgärder"
        sx={{ 
          position: 'fixed', 
          bottom: 80, 
          right: 16,
          '& .MuiFab-primary': {
            backgroundColor: '#1976d2',
            '&:hover': {
              backgroundColor: '#1565c0'
            }
          }
        }}
        icon={<SpeedDialIcon />}
        open={speedDialOpen}
        onClose={() => setSpeedDialOpen(false)}
        onOpen={() => setSpeedDialOpen(true)}
      >
        {speedDialActions.map((action) => (
          <SpeedDialAction
            key={action.name}
            icon={action.icon}
            tooltipTitle={action.name}
            onClick={() => {
              setSpeedDialOpen(false);
              action.action();
            }}
            sx={{
              '& .MuiSpeedDialAction-fab': {
                backgroundColor: '#f5f5f5',
                '&:hover': {
                  backgroundColor: '#e0e0e0'
                }
              }
            }}
          />
        ))}
      </SpeedDial>
    </>
  );
};

export default MobileNavigation;