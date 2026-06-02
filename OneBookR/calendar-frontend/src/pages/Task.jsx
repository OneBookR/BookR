import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Paper, Grid, Alert, Container } from '@mui/material';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';

import LogoutIcon from '@mui/icons-material/Logout';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const localizer = momentLocalizer(moment);

const Task = ({ user, onBack }) => {
  const [taskData, setTaskData] = useState({
    name: '',
    description: '',
    estimatedHours: '',
    workStartHour: '9',
    workEndHour: '18',
    minSessionHours: '1',
    maxSessionHours: '4',
    breakMinutes: '15'
  });
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [taskSlots, setTaskSlots] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenValidated, setTokenValidated] = useState(false);
  const [isValidatingToken, setIsValidatingToken] = useState(true);

  // Validera token vid start
  useEffect(() => {
    // NYTT: Provider-medveten tokenvalidering (Google/Microsoft)
    setIsValidatingToken(true);
    const token = user?.accessToken;
    if (!token) {
      setTokenValidated(false);
      setIsValidatingToken(false);
      return;
    }
    const provider = user?.provider || ((user?.mail || user?.userPrincipalName) ? 'microsoft' : 'google');
    const testUrl = provider === 'microsoft'
      ? 'https://graph.microsoft.com/v1.0/me'
      : 'https://www.googleapis.com/calendar/v3/users/me/settings/timezone';

    fetch(testUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setTokenValidated(res.ok))
      .catch(() => setTokenValidated(false))
      .finally(() => setIsValidatingToken(false));
  }, [user?.accessToken]);

  useEffect(() => {
    if (user && user.accessToken && tokenValidated) {
      loadCalendarEvents();
    }
  }, [user, tokenValidated]);

  const loadCalendarEvents = async () => {
    try {
      const now = new Date();
      const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      
      const response = await fetch('https://www.onebookr.se/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: user.accessToken,
          timeMin: now.toISOString(),
          timeMax: twoWeeksFromNow.toISOString()
        })
      });
      
      const data = await response.json();
      if (response.ok) {
        const events = data.events.map(event => ({
          title: event.title || 'Upptagen',
          start: new Date(event.start),
          end: new Date(event.end),
          resource: 'busy'
        }));
        setCalendarEvents(events);
      }
    } catch (error) {
      console.error('Error loading calendar:', error);
    }
  };

  const findTaskTime = async () => {
    if (!taskData.name || !taskData.estimatedHours) {
      setMessage('Fyll i uppgiftens namn och estimerad tid');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('https://www.onebookr.se/api/task/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: user.accessToken,
          taskName: taskData.name,
          estimatedHours: parseFloat(taskData.estimatedHours),
          workStartHour: parseInt(taskData.workStartHour),
          workEndHour: parseInt(taskData.workEndHour),
          minSessionHours: parseFloat(taskData.minSessionHours),
          maxSessionHours: parseFloat(taskData.maxSessionHours),
          breakMinutes: parseInt(taskData.breakMinutes)
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        const slots = data.taskSlots.map(slot => ({
          title: `${taskData.name} (${slot.duration}h)`,
          start: new Date(slot.start),
          end: new Date(slot.end),
          resource: 'task'
        }));
        
        setTaskSlots(slots);
        setMessage(`Uppgiften kan slutföras ${moment(slots[slots.length - 1].end).format('DD/MM YYYY HH:mm')}`);
      } else {
        setMessage('Fel: ' + data.error);
      }
    } catch (error) {
      setMessage('Fel vid schemaläggning');
    } finally {
      setLoading(false);
    }
  };

  const addToGoogleCalendar = async () => {
    if (taskSlots.length === 0) return;
    
    setLoading(true);
    try {
      for (const slot of taskSlots) {
        const event = {
          summary: slot.title,
          description: taskData.description || `Arbete med uppgift: ${taskData.name}`,
          start: {
            dateTime: slot.start.toISOString(),
            timeZone: 'Europe/Stockholm'
          },
          end: {
            dateTime: slot.end.toISOString(),
            timeZone: 'Europe/Stockholm'
          }
        };

        await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${user.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(event)
        });
      }
      
      setMessage(`${taskSlots.length} händelser har lagts till i din Google Kalender!`);
      loadCalendarEvents(); // Uppdatera kalendern
    } catch (error) {
      setMessage('Fel vid tillägg i kalender: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const allEvents = [...calendarEvents, ...taskSlots];

  // Visa laddningsskärm under token-validering
  if (isValidatingToken) {
    return (
      <>
        <Box sx={{
          background: 'rgba(255,255,255,0.98)',
          borderRadius: { xs: 2, sm: 3 },
          p: { xs: 3, sm: 4 },
          mb: { xs: 4, sm: 6 },
          mt: { xs: 8, sm: 12 },
          mx: 'auto',
          width: { xs: '100%', sm: '95vw', md: 1500 },
          maxWidth: '95vw',
          textAlign: 'center',
          boxShadow: '0 8px 40px 0 rgba(99,91,255,0.10), 0 1.5px 6px 0 rgba(60,64,67,.06)',
          border: '1.5px solid #e3e8ee'
        }}>
          <Typography variant="h5" gutterBottom sx={{ color: '#0a2540', mb: 2 }}>
            Validerar din inloggning...
          </Typography>
          <Typography variant="body1" sx={{ color: '#666' }}>
            Detta tar bara några sekunder
          </Typography>
        </Box>
      </>
    );
  }

  // Visa meddelande om token är ogiltig
  if (!tokenValidated) {
    return (
      <>
        <Box sx={{ 
          background: 'rgba(255,255,255,0.98)',
          borderRadius: { xs: 2, sm: 3 },
          p: { xs: 3, sm: 4 },
          mb: { xs: 4, sm: 6 },
          mt: { xs: 8, sm: 12 },
          mx: 'auto',
          width: { xs: '100%', sm: '95vw', md: 1500 },
          maxWidth: '95vw',
          textAlign: 'center',
          bgcolor: '#fff3e0',
          border: '2px solid #ff9800'
        }}>
          <Typography variant="h5" gutterBottom sx={{ color: '#bf360c', mb: 2 }}>
            ⚠️ Din session har gått ut
          </Typography>
          <Typography variant="body1" sx={{ color: '#666', mb: 3 }}>
            För att använda Task Scheduler behöver du logga in igen.
            Du omdirigeras automatiskt...
          </Typography>
          <Typography variant="caption" sx={{ color: '#999' }}>
            {/* ✅ DYNAMIC LOGOUT LINK */}
            Om inget händer inom några sekunder, klicka <a 
              href={process.env.NODE_ENV === 'development' ? '/auth/logout' : 'https://www.onebookr.se/auth/logout'} 
              style={{ color: '#1976d2' }}
            >här</a>
          </Typography>
        </Box>
      </>
    );
  }

  return (
    <>
      {/* Clean Banner */}
      <Box sx={{
        background: 'rgba(255,255,255,0.98)',
        borderRadius: { xs: 2, sm: 3 },
        p: { xs: 3, sm: 4 },
        mb: { xs: 4, sm: 6 },
        mt: { xs: 8, sm: 12 },
        mx: 'auto',
        width: { xs: '100%', sm: '95vw', md: 1500 },
        maxWidth: '95vw',
        textAlign: 'center',
        boxShadow: '0 8px 40px 0 rgba(99,91,255,0.10), 0 1.5px 6px 0 rgba(60,64,67,.06)',
        border: '1.5px solid #e3e8ee'
      }}>
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Typography variant="h3" sx={{ 
            fontWeight: 700,
            letterSpacing: -1.5,
            fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
            color: '#0a2540',
            mb: 1,
            fontSize: { xs: 24, sm: 28, md: 36 },
            lineHeight: 1.08
          }}>
            Task Scheduler
          </Typography>
          <Typography variant="h6" sx={{ 
            color: '#425466',
            fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
            fontWeight: 400,
            fontSize: { xs: 14, sm: 16, md: 18 },
            lineHeight: 1.4,
            letterSpacing: -0.5
          }}>
            Schemalägg uppgifter automatiskt baserat på din kalender
          </Typography>
        </Box>
      </Box>
      
      <Box sx={{ display: { xs: 'block', md: 'flex' }, height: { xs: 'auto', md: 'calc(100vh - 200px)' }, mt: 0 }}>
        {/* Left sidebar for inputs */}
        <Box sx={{ 
          width: { xs: '100%', md: 380 }, 
          flexShrink: 0, 
          bgcolor: '#fafbfc', 
          borderRight: { xs: 'none', md: '1px solid #e8eaed' },
          borderBottom: { xs: '1px solid #e8eaed', md: 'none' },
          overflow: 'auto',
          boxShadow: { xs: '0 2px 8px rgba(60,64,67,.08)', md: '2px 0 8px rgba(60,64,67,.08)' }
        }}>
          <Box sx={{ p: { xs: 2, sm: 3 }, overflow: 'auto' }}>
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600, color: '#1a73e8', fontSize: { xs: 18, sm: 20 } }}>
              📅 Skapa uppgift
            </Typography>

            <TextField
              fullWidth
              label="Uppgiftens namn"
              value={taskData.name}
              onChange={(e) => setTaskData({...taskData, name: e.target.value})}
              required
              sx={{
                mb: 2,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  bgcolor: 'white',
                  '&:hover fieldset': { borderColor: '#635bff' },
                  '&.Mui-focused fieldset': { borderColor: '#635bff' }
                }
              }}
            />
            
            <TextField
              fullWidth
              label="Beskrivning"
              value={taskData.description}
              onChange={(e) => setTaskData({...taskData, description: e.target.value})}
              multiline
              rows={2}
              sx={{
                mb: 2,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  bgcolor: 'white',
                  '&:hover fieldset': { borderColor: '#635bff' },
                  '&.Mui-focused fieldset': { borderColor: '#635bff' }
                }
              }}
            />
            
            <TextField
              fullWidth
              label="Estimerad tid (timmar)"
              type="number"
              value={taskData.estimatedHours}
              onChange={(e) => setTaskData({...taskData, estimatedHours: e.target.value})}
              required
              inputProps={{ min: 0.5, step: 0.5 }}
              sx={{
                mb: 2,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  bgcolor: 'white',
                  '&:hover fieldset': { borderColor: '#635bff' },
                  '&.Mui-focused fieldset': { borderColor: '#635bff' }
                }
              }}
            />
            
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
              Arbetstider
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                label="Från"
                type="number"
                value={taskData.workStartHour}
                onChange={(e) => setTaskData({...taskData, workStartHour: e.target.value})}
                inputProps={{ min: 0, max: 23 }}
                sx={{ 
                  flex: 1,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    bgcolor: 'white',
                    '&:hover fieldset': { borderColor: '#635bff' },
                    '&.Mui-focused fieldset': { borderColor: '#635bff' }
                  }
                }}
              />
              <TextField
                label="Till"
                type="number"
                value={taskData.workEndHour}
                onChange={(e) => setTaskData({...taskData, workEndHour: e.target.value})}
                inputProps={{ min: 0, max: 23 }}
                sx={{ 
                  flex: 1,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    bgcolor: 'white',
                    '&:hover fieldset': { borderColor: '#635bff' },
                    '&.Mui-focused fieldset': { borderColor: '#635bff' }
                  }
                }}
              />
            </Box>
            
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
              Sessionslängd
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                label="Min (h)"
                type="number"
                value={taskData.minSessionHours}
                onChange={(e) => setTaskData({...taskData, minSessionHours: e.target.value})}
                inputProps={{ min: 0.5, step: 0.5 }}
                sx={{ 
                  flex: 1,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    bgcolor: 'white',
                    '&:hover fieldset': { borderColor: '#635bff' },
                    '&.Mui-focused fieldset': { borderColor: '#635bff' }
                  }
                }}
              />
              <TextField
                label="Max (h)"
                type="number"
                value={taskData.maxSessionHours}
                onChange={(e) => setTaskData({...taskData, maxSessionHours: e.target.value})}
                inputProps={{ min: 0.5, step: 0.5 }}
                sx={{ 
                  flex: 1,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    bgcolor: 'white',
                    '&:hover fieldset': { borderColor: '#635bff' },
                    '&.Mui-focused fieldset': { borderColor: '#635bff' }
                  }
                }}
              />
            </Box>
            
            <TextField
              fullWidth
              label="Rast mellan pass (minuter)"
              type="number"
              value={taskData.breakMinutes}
              onChange={(e) => setTaskData({...taskData, breakMinutes: e.target.value})}
              inputProps={{ min: 0, step: 5 }}
              helperText="Minuter vila mellan arbetspassen"
              sx={{
                mb: 3,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  bgcolor: 'white',
                  '&:hover fieldset': { borderColor: '#635bff' },
                  '&.Mui-focused fieldset': { borderColor: '#635bff' }
                }
              }}
            />
            
            <Button
              variant="contained"
              fullWidth
              onClick={findTaskTime}
              disabled={loading}
              sx={{ 
                py: 1.5,
                borderRadius: 2,
                background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                fontWeight: 600,
                mb: taskSlots.length > 0 ? 2 : 0,
                '&:hover': {
                  background: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)',
                }
              }}
            >
              {loading ? 'Söker tid...' : 'Hitta tid'}
            </Button>
            
            {taskSlots.length > 0 && (
              <Button
                variant="outlined"
                fullWidth
                onClick={addToGoogleCalendar}
                disabled={loading}
                sx={{ 
                  py: 1.5,
                  borderRadius: 2,
                  borderColor: '#4caf50',
                  color: '#4caf50',
                  fontWeight: 600,
                  mb: 2,
                  '&:hover': {
                    borderColor: '#45a049',
                    color: '#45a049',
                    bgcolor: 'rgba(76, 175, 80, 0.05)'
                  }
                }}
              >
                📅 Lägg till i Kalender
              </Button>
            )}
            
            {message && (
              <Alert 
                severity={message.includes('Fel') ? 'error' : 'success'} 
                sx={{ 
                  borderRadius: 2
                }}
              >
                {message}
              </Alert>
            )}
            

            
          </Box>
        </Box>
        
        {/* Full-width calendar */}
        <Box sx={{ flex: 1, bgcolor: '#f8f9fa', display: 'flex', flexDirection: 'column', minHeight: { xs: '400px', md: 'auto' } }}>
          <Box sx={{ p: { xs: 2, sm: 3 }, bgcolor: 'white', borderBottom: '1px solid #e8eaed' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#202124', fontSize: { xs: 16, sm: 18 } }}>
              📅 Din kalender med föreslagna tider
            </Typography>
          </Box>
          
          <Box sx={{ 
            flex: 1,
            p: { xs: 2, sm: 3 },
            '& .rbc-calendar, .rbc-time-view, .rbc-agenda-view, .rbc-month-view': {
              fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif !important",
              background: '#f7f9fb',
              borderRadius: '10px',
              border: '1px solid #e0e3e7',
              boxShadow: '0 2px 8px 0 rgba(60,64,67,.06)',
              color: '#000'
            },
            '& .rbc-toolbar': {
              fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif !important",
              background: '#f1f3f6',
              borderBottom: '1px solid #e0e3e7',
              borderRadius: '10px 10px 0 0',
              padding: '10px 16px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              alignItems: 'center',
              color: '#000'
            },
            '& .rbc-toolbar .rbc-toolbar-label': {
              marginRight: '16px',
              fontSize: '1.05rem',
              fontWeight: 400,
              color: '#1976d2',
              letterSpacing: '-0.5px',
              padding: '0 8px'
            },
            '& .rbc-btn-group button': {
              fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif !important",
              fontSize: '1.01rem',
              borderRadius: '999px !important',
              border: 'none !important',
              background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%) !important',
              color: '#fff !important',
              marginRight: '8px !important',
              marginBottom: '2px !important',
              padding: '7px 18px !important',
              fontWeight: '600 !important',
              boxShadow: '0 2px 8px 0 rgba(99,91,255,0.13) !important',
              transition: 'background 0.2s, box-shadow 0.2s, transform 0.1s !important',
              outline: 'none !important',
              borderWidth: '0 !important'
            },
            '& .rbc-btn-group button:hover': {
              background: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%) !important',
              color: '#fff !important',
              boxShadow: '0 0 0 4px #e9e5ff, 0 8px 24px 0 rgba(99,91,255,0.18) !important',
              transform: 'scale(1.03) !important'
            },
            '& .rbc-header': {
              background: '#f1f3f6',
              color: '#000',
              fontWeight: 400,
              fontSize: '0.98rem',
              borderBottom: '1px solid #e0e3e7',
              padding: '7px 0'
            },
            '& .rbc-today': {
              background: '#fffde7 !important',
              borderBottom: '2px solid #1976d2'
            },
            '& .rbc-event': {
              backgroundColor: '#e3f2fd !important',
              color: '#1976d2 !important',
              border: '1px solid #1976d2 !important',
              borderRadius: '4px !important',
              fontSize: '12px !important',
              fontWeight: '500 !important',
              padding: '2px 4px !important'
            },
            '& .rbc-event:hover': {
              backgroundColor: '#bbdefb !important'
            },
            '& .task-event': {
              backgroundColor: '#c8e6c9 !important',
              color: '#2e7d32 !important',
              border: '2px solid #4caf50 !important',
              fontWeight: '600 !important'
            },
            '& .task-event:hover': {
              backgroundColor: '#a5d6a7 !important'
            },
            '& .rbc-time-content': {
              background: '#f7f9fb',
              borderRadius: '0 0 10px 10px'
            },
            '& .rbc-time-header-content': {
              background: '#f1f3f6'
            },
            '& .rbc-time-slot': {
              minHeight: '28px',
              position: 'relative',
              borderColor: '#e0e3e7'
            },
            '& .rbc-time-gutter, .rbc-time-header-gutter': {
              background: '#f1f3f6',
              color: '#000'
            },
            '& .rbc-timeslot-group': {
              borderBottom: '1px solid #e0e3e7'
            },
            '& .rbc-day-slot .rbc-time-slot': {
              borderTop: '1px solid #e0e3e7'
            }
          }}>
            <Calendar
              localizer={localizer}
              events={allEvents}
              startAccessor="start"
              endAccessor="end"
              style={{ height: '100%' }}
              eventPropGetter={(event) => {
                if (event.resource === 'task') {
                  return {
                    className: 'task-event',
                    style: {
                      backgroundColor: '#c8e6c9 !important',
                      color: '#2e7d32 !important',
                      border: '2px solid #4caf50 !important',
                      borderRadius: '4px !important',
                      fontWeight: '600 !important',
                      fontSize: '12px !important',
                      padding: '2px 4px !important'
                    }
                  };
                }
                return {
                  style: {
                    backgroundColor: '#ffcdd2 !important',
                    color: '#d32f2f !important',
                    border: '1px solid #f44336 !important',
                    borderRadius: '4px !important',
                    fontWeight: '500 !important',
                    fontSize: '12px !important',
                    padding: '2px 4px !important'
                  }
                };
              }}
              views={['month', 'week', 'day', 'agenda']}
              defaultView="week"
            />
          </Box>
        </Box>
      </Box>
    </>
  );
};

export default Task;