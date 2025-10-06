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
      
      const response = await fetch('/api/calendar/events', {
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
      const response = await fetch('/api/task/schedule', {
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
      
      <Box sx={{ display: 'flex', height: 'calc(100vh - 112px)', mt: 0 }}>
        {/* Left sidebar for inputs */}
        <Box sx={{ 
          width: 380, 
          flexShrink: 0, 
          bgcolor: '#fafbfc', 
          borderRight: '1px solid #e8eaed',
          overflow: 'auto',
          boxShadow: '2px 0 8px rgba(60,64,67,.08)'
        }}>
          <Box sx={{ p: 3 }}>
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
                  mt: 2,
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
            '& .rbc-calendar': {
              backgroundColor: 'white',
              borderRadius: 3,
              overflow: 'hidden',
              border: '1px solid #e8eaed',
              boxShadow: '0 1px 3px rgba(60,64,67,.08)'
            },
            '& .rbc-header': {
              backgroundColor: '#f8f9fa',
              borderBottom: '1px solid #e8eaed',
              fontWeight: 500,
              padding: '12px 8px',
              color: '#5f6368'
            },
            '& .rbc-event': {
              borderRadius: 2,
              border: 'none',
              fontWeight: 500
            },
            '& .rbc-time-view': {
              border: 'none'
            },
            '& .rbc-time-header': {
              borderBottom: '1px solid #e8eaed'
            },
            '& .rbc-time-content': {
              borderTop: 'none'
            }
          }}>
            <Calendar
              localizer={localizer}
              events={allEvents}
              startAccessor="start"
              endAccessor="end"
              style={{ height: '100%' }}
              eventPropGetter={(event) => ({
                style: {
                  backgroundColor: event.resource === 'task' ? '#4caf50' : '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px'
                }
              })}
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