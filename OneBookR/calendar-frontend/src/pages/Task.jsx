import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Paper, Grid, Alert, Container } from '@mui/material';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import InvitationSidebar from './InvitationSidebar.jsx';
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

  useEffect(() => {
    if (user && user.accessToken) {
      loadCalendarEvents();
    }
  }, [user]);

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

  return (
    <>
      <InvitationSidebar user={user} />
      
      {/* Clean Banner */}
      <Box sx={{
        background: 'rgba(255,255,255,0.98)',
        borderRadius: 3,
        p: 4,
        mb: 6,
        mt: 12,
        mx: 'auto',
        width: 1500,
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
            fontSize: { xs: 28, md: 36 },
            lineHeight: 1.08
          }}>
            Task Scheduler
          </Typography>
          <Typography variant="h6" sx={{ 
            color: '#425466',
            fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
            fontWeight: 400,
            fontSize: { xs: 16, md: 18 },
            lineHeight: 1.4,
            letterSpacing: -0.5
          }}>
            Schemalägg uppgifter automatiskt baserat på din kalender
          </Typography>
        </Box>
      </Box>
      
      <Box sx={{ display: 'flex', height: 'calc(100vh - 200px)', mt: 0 }}>
        {/* Left sidebar for inputs */}
        <Box sx={{ 
          width: 380, 
          flexShrink: 0, 
          bgcolor: '#fafbfc', 
          borderRight: '1px solid #e8eaed',
          overflow: 'auto',
          boxShadow: '2px 0 8px rgba(60,64,67,.08)'
        }}>
          <Box sx={{ p: 3, overflow: 'auto' }}>
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600, color: '#1a73e8' }}>
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
        <Box sx={{ flex: 1, bgcolor: '#f8f9fa', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 3, bgcolor: 'white', borderBottom: '1px solid #e8eaed' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#202124' }}>
              📅 Din kalender med föreslagna tider
            </Typography>
          </Box>
          
          <Box sx={{ 
            flex: 1,
            p: 3,
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
              views={['month', 'week', 'day']}
              defaultView="week"
            />
          </Box>
        </Box>
      </Box>
    </>
  );
};

export default Task;