import React, { useState } from 'react';
import { AppBar, Toolbar, Box, Typography, Button, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Stepper, Step, StepLabel, StepContent, Paper } from '@mui/material';
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
import ContactsIcon from '@mui/icons-material/Contacts';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { useNotifications } from '../hooks/useNotifications';
import { usePWA } from '../hooks/usePWA';

const Header = ({ user, onNavigate }) => {
  const { permission, requestPermission } = useNotifications();
  const { isInstallable, installApp } = usePWA();
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);


  const helpSteps = [
    {
      label: 'Dashboard - Översikt',
      icon: <DashboardIcon />,
      content: (
        <Box>
          <Typography variant="body1" sx={{ mb: 2 }}>
            <strong>Dashboard</strong> är din startpunkt i BookR. Här ser du:
          </Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• <strong>Inbjudningar</strong> - Kalenderjämförelser du blivit inbjuden till</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• <strong>Tidsförslag</strong> - Förslag på mötestider du kan rösta på</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• <strong>Kommande möten</strong> - Dina nästa möten med Google Meet-länkar</Typography>
          <Typography variant="body2" sx={{ mb: 2, ml: 2 }}>• <strong>Öppna möten</strong> - Kalenderjämförelser du kan gå tillbaka till</Typography>
          <Typography variant="body2" sx={{ color: '#666' }}>
            Klicka på korten för att snabbt starta 1v1 möten, gruppmöten, skapa uppgifter eller lägga till kontakter.
          </Typography>
        </Box>
      )
    },
    {
      label: 'Lägg till kontakter',
      icon: <ContactsIcon />,
      content: (
        <Box>
          <Typography variant="body1" sx={{ mb: 2 }}>
            <strong>Kontakter</strong> gör det enkelt att bjuda in samma personer igen:
          </Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• Klicka på "Lägg till kontakter" på Dashboard</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• Skriv in namn och e-postadress</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• När du skriver e-post i inbjudningar får du förslag automatiskt</Typography>
          <Typography variant="body2" sx={{ mb: 2, ml: 2 }}>• Kontakterna sparas lokalt i din webbläsare</Typography>
          <Typography variant="body2" sx={{ color: '#666' }}>
            Tips: Lägg till kollegor och vänner du ofta har möten med för snabbare inbjudningar!
          </Typography>
        </Box>
      )
    },
    {
      label: '1v1 Meeting',
      icon: <PersonIcon />,
      content: (
        <Box>
          <Typography variant="body1" sx={{ mb: 2 }}>
            <strong>1v1 Meeting</strong> för möten mellan två personer:
          </Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• Skriv in personens e-postadress</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• Ge gruppen ett namn (valfritt)</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• Personen får en inbjudan via e-post</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• När båda är inne jämförs era kalendrar automatiskt</Typography>
          <Typography variant="body2" sx={{ mb: 2, ml: 2 }}>• Ni ser gemensamma lediga tider och kan föreslå möten</Typography>
          <Typography variant="body2" sx={{ color: '#666' }}>
            Perfekt för snabba möten med kollegor, vänner eller familj.
          </Typography>
        </Box>
      )
    },
    {
      label: 'Group Meeting',
      icon: <GroupIcon />,
      content: (
        <Box>
          <Typography variant="body1" sx={{ mb: 2 }}>
            <strong>Group Meeting</strong> för möten med flera personer:
          </Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• Skriv in flera e-postadresser (separera med komma eller Enter)</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• Ge gruppen ett beskrivande namn</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• Alla får inbjudningar via e-post med unika länkar</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• När alla anslutit jämförs alla kalendrar samtidigt</Typography>
          <Typography variant="body2" sx={{ mb: 2, ml: 2 }}>• Ni ser när ALLA är lediga och kan boka möten direkt</Typography>
          <Typography variant="body2" sx={{ color: '#666' }}>
            Idealiskt för teammöten, projektgrupper eller större sammankomster.
          </Typography>
        </Box>
      )
    },
    {
      label: 'Kalenderjämförelse',
      icon: <CalendarTodayIcon />,
      content: (
        <Box>
          <Typography variant="body1" sx={{ mb: 2 }}>
            <strong>Kalenderjämförelse</strong> - hjärtat i BookR:
          </Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• Se allas kalendrar samtidigt i en vy</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• Upptagna tider visas i rött, lediga tider i grönt</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• Klicka på en ledig tid för att föreslå ett möte</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• Alla får rösta på förslaget (acceptera/neka)</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• När alla accepterat skapas Google Meet-länk automatiskt</Typography>
          <Typography variant="body2" sx={{ mb: 2, ml: 2 }}>• Mötet läggs till i allas Google Kalendrar</Typography>
          <Typography variant="body2" sx={{ color: '#666' }}>
            Inga fler mejlkedjor - se direkt när alla kan och boka på sekunder!
          </Typography>
        </Box>
      )
    },
    {
      label: 'Task Scheduler',
      icon: <TaskIcon />,
      content: (
        <Box>
          <Typography variant="body1" sx={{ mb: 2 }}>
            <strong>Task Scheduler</strong> hjälper dig planera arbetsuppgifter:
          </Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• Skriv in uppgiftens namn och estimerad tid</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• Ställ in arbetstider och sessionslängder</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• BookR analyserar din kalender och hittar lediga tider</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• Uppgiften delas upp i lagom stora arbetspass</Typography>
          <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>• Raster läggs in automatiskt mellan långa sessioner</Typography>
          <Typography variant="body2" sx={{ mb: 2, ml: 2 }}>• Lägg till i Google Kalender med ett klick</Typography>
          <Typography variant="body2" sx={{ color: '#666' }}>
            Perfekt för projekt, studier eller större arbetsuppgifter som behöver planeras.
          </Typography>
        </Box>
      )
    }
  ];

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleReset = () => {
    setActiveStep(0);
  };

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
      <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', minHeight: { xs: 56, sm: 64 }, px: { xs: 2, sm: 3 } }}>
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
          
          {/* Desktop Navigation Menu */}
          {user && !isMobile && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                startIcon={<DashboardIcon />}
                onClick={() => window.location.href = '/'}
                sx={{ 
                  color: 'rgba(255,255,255,0.9)', 
                  fontWeight: 500,
                  fontSize: 14,
                  px: 2,
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
                  fontSize: 14,
                  px: 2,
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
                  fontSize: 14,
                  px: 2,
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
                  fontSize: 14,
                  px: 2,
                  '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.1)' }
                }}
              >
                Task
              </Button>
            </Box>
          )}
          
          {/* Mobile Menu Button */}
          {user && isMobile && (
            <IconButton
              onClick={() => setMobileMenuOpen(true)}
              sx={{ 
                color: 'white',
                ml: 1
              }}
            >
              <MenuIcon />
            </IconButton>
          )}
          
          {/* Separator */}
          <Box sx={{ 
            display: { xs: 'none', md: 'block' },
            width: '1px',
            height: '24px',
            bgcolor: 'rgba(255,255,255,0.3)',
            mx: 2
          }} />
          
          {!isMobile && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                color="inherit"
                sx={{ fontWeight: 500, fontSize: 14, color: 'rgba(255,255,255,0.9)', '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}
                onClick={() => window.location.href = '/om-oss'}
              >
                Om oss
              </Button>
              <Button
                color="inherit"
                sx={{ fontWeight: 500, fontSize: 14, color: 'rgba(255,255,255,0.9)', '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}
                onClick={() => window.location.href = '/kontakt'}
              >
                Kontakta oss
              </Button>
            </Box>
          )}
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 } }}>

          {!isMobile && (
            <Button
              color="inherit"
              startIcon={<HelpOutlineIcon />}
              onClick={() => setHelpModalOpen(true)}
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
          )}
          
          {user ? (
            <>
              {!isMobile && (
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
                    fontSize: { xs: 12, sm: 14 },
                    px: { xs: 1, sm: 2 },
                    '&:hover': {
                      bgcolor: 'rgba(255,255,255,0.1)',
                      borderColor: 'rgba(255,255,255,0.5)'
                    }
                  }}
                >
                  {isMobile ? 'Lämna' : 'Lämna grupp'}
                </Button>
              )}
              <Button
                variant="contained"
                startIcon={!isMobile ? <LogoutIcon /> : null}
                onClick={handleLogout}
                sx={{ 
                  fontWeight: 600, 
                  borderRadius: 2,
                  bgcolor: 'rgba(255,255,255,0.2)',
                  color: 'white',
                  fontSize: { xs: 12, sm: 14 },
                  px: { xs: 2, sm: 3 },
                  minWidth: { xs: 'auto', sm: 'auto' },
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.3)'
                  }
                }}
              >
                {isMobile ? 'Ut' : 'Logga ut'}
              </Button>
            </>
          ) : (
            <Button
              variant="contained"
              startIcon={!isMobile ? <LoginIcon /> : null}
              onClick={handleLogin}
              sx={{ 
                fontWeight: 600, 
                borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.2)',
                color: 'white',
                fontSize: { xs: 12, sm: 14 },
                px: { xs: 2, sm: 3 },
                '&:hover': {
                  bgcolor: 'rgba(255,255,255,0.3)'
                }
              }}
            >
              {isMobile ? 'In' : 'Logga in'}
            </Button>
          )}
        </Box>
      </Toolbar>
      
      {/* Hjälp Modal */}
      <Dialog 
        open={helpModalOpen} 
        onClose={() => setHelpModalOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ fontWeight: 600, color: '#0a2540', textAlign: 'center' }}>
          📚 Så här använder du BookR
        </DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          <Stepper activeStep={activeStep} orientation="vertical">
            {helpSteps.map((step, index) => (
              <Step key={step.label}>
                <StepLabel
                  icon={step.icon}
                  sx={{
                    '& .MuiStepLabel-label': {
                      fontWeight: 600,
                      fontSize: 16
                    }
                  }}
                >
                  {step.label}
                </StepLabel>
                <StepContent>
                  <Box sx={{ mb: 2 }}>
                    {step.content}
                  </Box>
                  <Box sx={{ mb: 2 }}>
                    <Button
                      variant="contained"
                      onClick={handleNext}
                      sx={{ mt: 1, mr: 1 }}
                      disabled={index === helpSteps.length - 1}
                    >
                      {index === helpSteps.length - 1 ? 'Klar' : 'Nästa'}
                    </Button>
                    <Button
                      disabled={index === 0}
                      onClick={handleBack}
                      sx={{ mt: 1, mr: 1 }}
                    >
                      Tillbaka
                    </Button>
                  </Box>
                </StepContent>
              </Step>
            ))}
          </Stepper>
          {activeStep === helpSteps.length && (
            <Paper square elevation={0} sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="h6" sx={{ mb: 2, color: '#4caf50' }}>
                🎉 Nu vet du allt om BookR!
              </Typography>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Du är redo att börja använda alla funktioner. Lycka till med dina möten!
              </Typography>
              <Button onClick={handleReset} sx={{ mt: 1, mr: 1 }}>
                Börja om
              </Button>
            </Paper>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHelpModalOpen(false)}>
            Stäng
          </Button>
        </DialogActions>
      </Dialog>

    </AppBar>
  );
};

export default Header;