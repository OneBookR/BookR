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

  const allEvents = [...calendarEvents, ...taskSlots];

  return (
    <>
      <InvitationSidebar user={user} />
      
      {/* Header with back button and logout */}
      <Box sx={{ position: 'fixed', top: 80, left: 20, right: 20, zIndex: 1000, display: 'flex', justifyContent: 'space-between' }}>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => window.location.reload()}
          sx={{ bgcolor: 'white' }}
        >
          Tillbaka
        </Button>
        <Button
          variant="outlined"
          startIcon={<LogoutIcon />}
          onClick={() => window.location.href = 'https://www.onebookr.se/auth/logout'}
          sx={{ bgcolor: 'white' }}
        >
          Logga ut
        </Button>
      </Box>

      <Container maxWidth="lg" sx={{ mt: 16, mb: 4 }}>
        <Typography variant="h4" sx={{ mb: 4, textAlign: 'center', fontWeight: 600 }}>
          Skapa uppgift
        </Typography>
        
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ 
              p: 3, 
              borderRadius: 3,
              boxShadow: '0 2px 8px rgba(60,64,67,.06)',
              border: '1px solid #e0e3e7'
            }}>
              <TextField
                fullWidth
                label="Uppgiftens namn"
                value={taskData.name}
                onChange={(e) => setTaskData({...taskData, name: e.target.value})}
                margin="normal"
                required
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
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
                margin="normal"
                multiline
                rows={3}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
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
                margin="normal"
                required
                inputProps={{ min: 0.5, step: 0.5 }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    '&:hover fieldset': { borderColor: '#635bff' },
                    '&.Mui-focused fieldset': { borderColor: '#635bff' }
                  }
                }}
              />
              
              <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <TextField
                  label="Arbetstid från"
                  type="number"
                  value={taskData.workStartHour}
                  onChange={(e) => setTaskData({...taskData, workStartHour: e.target.value})}
                  inputProps={{ min: 0, max: 23 }}
                  sx={{ 
                    flex: 1,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      '&:hover fieldset': { borderColor: '#635bff' },
                      '&.Mui-focused fieldset': { borderColor: '#635bff' }
                    }
                  }}
                />
                <TextField
                  label="Arbetstid till"
                  type="number"
                  value={taskData.workEndHour}
                  onChange={(e) => setTaskData({...taskData, workEndHour: e.target.value})}
                  inputProps={{ min: 0, max: 23 }}
                  sx={{ 
                    flex: 1,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      '&:hover fieldset': { borderColor: '#635bff' },
                      '&.Mui-focused fieldset': { borderColor: '#635bff' }
                    }
                  }}
                />
              </Box>
              
              <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <TextField
                  label="Min session (timmar)"
                  type="number"
                  value={taskData.minSessionHours}
                  onChange={(e) => setTaskData({...taskData, minSessionHours: e.target.value})}
                  inputProps={{ min: 0.5, step: 0.5 }}
                  sx={{ 
                    flex: 1,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      '&:hover fieldset': { borderColor: '#635bff' },
                      '&.Mui-focused fieldset': { borderColor: '#635bff' }
                    }
                  }}
                />
                <TextField
                  label="Max session (timmar)"
                  type="number"
                  value={taskData.maxSessionHours}
                  onChange={(e) => setTaskData({...taskData, maxSessionHours: e.target.value})}
                  inputProps={{ min: 0.5, step: 0.5 }}
                  sx={{ 
                    flex: 1,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
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
                margin="normal"
                inputProps={{ min: 0, step: 5 }}
                helperText="Minuter vila mellan arbetspassen"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
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
                  mt: 3,
                  py: 1.5,
                  borderRadius: 2,
                  background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                  fontWeight: 600,
                  '&:hover': {
                    background: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)',
                  }
                }}
              >
                {loading ? 'Söker tid...' : 'Hitta tid'}
              </Button>
              
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
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={8}>
            <Paper sx={{ 
              p: 3,
              borderRadius: 3,
              boxShadow: '0 2px 8px rgba(60,64,67,.06)',
              border: '1px solid #e0e3e7'
            }}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
                Din kalender med föreslagna tider
              </Typography>
              
              <Box sx={{ 
                '& .rbc-calendar': {
                  borderRadius: 2,
                  overflow: 'hidden',
                  border: '1px solid #e0e3e7'
                },
                '& .rbc-header': {
                  backgroundColor: '#f8f9fa',
                  borderBottom: '1px solid #e0e3e7',
                  fontWeight: 600
                },
                '& .rbc-event': {
                  borderRadius: 1,
                  border: 'none'
                }
              }}>
                <Calendar
                  localizer={localizer}
                  events={allEvents}
                  startAccessor="start"
                  endAccessor="end"
                  style={{ height: 600 }}
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
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </>
  );
};

export default Task;