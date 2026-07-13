import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Paper, Alert, Container, Chip } from '@mui/material';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import { apiRequest } from '../utils/apiConfig.js';

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
    if (user?.email) {
      loadCalendarEvents();
    }
  }, [user?.email]);

  const loadCalendarEvents = async () => {
    try {
      const now = new Date();
      const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      const response = await apiRequest(
        `/api/calendar/events?start=${encodeURIComponent(now.toISOString())}&end=${encodeURIComponent(twoWeeksFromNow.toISOString())}`
      );

      const data = await response.json();
      if (response.ok) {
        const events = (data.events || []).map(event => ({
          title: 'Upptagen',
          start: new Date(event.start?.dateTime || event.start),
          end: new Date(event.end?.dateTime || event.end),
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
      const response = await apiRequest('/api/task/schedule', {
        method: 'POST',
        body: JSON.stringify({
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
        const slots = (data.taskSlots || []).map(slot => ({
          title: `${taskData.name} (${slot.duration}h)`,
          start: new Date(slot.start),
          end: new Date(slot.end),
          resource: 'task',
          duration: slot.duration
        }));
        const scheduledHours = slots.reduce((total, slot) => total + (Number(slot.duration) || 0), 0);
        
        setTaskSlots(slots);

        if (slots.length === 0) {
          setMessage('Inga lediga arbetspass hittades i det valda intervallet. Justera arbetstider eller sessionslängd.');
        } else if (data.scheduled === false && data.remainingHours > 0) {
          setMessage(`BookR planerade ${scheduledHours.toFixed(2)} av ${Number(taskData.estimatedHours).toFixed(2)} timmar. ${data.remainingHours.toFixed(2)} timmar återstår att placera.`);
        } else {
          setMessage(`Uppgiften kan slutföras ${moment(slots[slots.length - 1].end).format('DD/MM YYYY HH:mm')}`);
        }
      } else {
        setTaskSlots([]);
        setMessage('Fel: ' + data.error);
      }
    } catch (error) {
      setTaskSlots([]);
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
        await apiRequest('/api/calendar/events', {
          method: 'POST',
          body: JSON.stringify({
            title: slot.title,
            description: taskData.description || `Arbete med uppgift: ${taskData.name}`,
            start: slot.start.toISOString(),
            end: slot.end.toISOString()
          })
        });
      }

      setMessage(`${taskSlots.length} händelser har lagts till i din kalender!`);
      loadCalendarEvents();
    } catch (error) {
      setMessage('Fel vid tillägg i kalender: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const allEvents = [...calendarEvents, ...taskSlots];

  const glassCardSx = {
    borderRadius: 4,
    border: '1px solid var(--border)',
    bgcolor: 'rgba(255,255,255,0.78)',
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)',
    backdropFilter: 'blur(18px)'
  };

  const sectionCardSx = {
    p: { xs: 3, md: 4 },
    ...glassCardSx
  };

  const fieldSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 3,
      bgcolor: 'rgba(255,255,255,0.72)',
      '& fieldset': {
        borderColor: 'rgba(17,24,39,0.08)'
      },
      '&:hover fieldset': {
        borderColor: 'rgba(17,24,39,0.16)'
      },
      '&.Mui-focused fieldset': {
        borderColor: 'var(--text)'
      }
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: 'var(--text)'
    }
  };

  const primaryButtonSx = {
    py: 1.5,
    borderRadius: 3,
    bgcolor: 'var(--text)',
    color: 'var(--surface-strong)',
    fontWeight: 700,
    boxShadow: 'none',
    textTransform: 'none',
    '&:hover': {
      bgcolor: '#000000',
      boxShadow: 'none'
    }
  };

  const secondaryButtonSx = {
    py: 1.5,
    borderRadius: 3,
    borderColor: 'rgba(17,24,39,0.08)',
    color: 'var(--text)',
    fontWeight: 700,
    textTransform: 'none',
    '&:hover': {
      borderColor: 'rgba(17,24,39,0.16)',
      bgcolor: 'rgba(17,24,39,0.03)'
    }
  };

  return (
    <Container maxWidth="xl" sx={{ mt: { xs: 11, md: 13 }, mb: 6, px: { xs: 2, sm: 3, lg: 4 } }}>
      <Paper elevation={0} sx={{ ...sectionCardSx, position: 'relative', overflow: 'hidden', mb: 4 }}>
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at top left, rgba(17,24,39,0.08), transparent 34%), radial-gradient(circle at bottom right, rgba(17,24,39,0.06), transparent 26%)',
            pointerEvents: 'none'
          }}
        />
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Chip
            label="Task Flow"
            sx={{
              mb: 2,
              bgcolor: 'rgba(17,24,39,0.04)',
              border: '1px solid rgba(17,24,39,0.06)',
              color: 'var(--text)',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase'
            }}
          />
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '2.2rem', md: '3.8rem' },
              lineHeight: 0.98,
              letterSpacing: '-0.06em',
              fontWeight: 800,
              color: 'var(--text)',
              maxWidth: 760
            }}
          >
            Planera uppgifter runt kalendern utan att lämna BookR-flödet.
          </Typography>
          <Typography
            variant="h6"
            sx={{
              mt: 3,
              maxWidth: 720,
              color: 'var(--text-secondary)',
              fontWeight: 500,
              lineHeight: 1.6,
              fontSize: { xs: '1rem', md: '1.15rem' }
            }}
          >
            Ange omfattning, arbetstider och sessionslängd så lägger BookR fram realistiska arbetsblock direkt ovanpå din befintliga kalender.
          </Typography>
        </Box>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '380px minmax(0, 1fr)' }, gap: 3, alignItems: 'start' }}>
        <Paper elevation={0} sx={{ ...sectionCardSx, position: { xl: 'sticky' }, top: { xl: 112 } }}>
          <Typography variant="h5" sx={{ mb: 1, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)' }}>
            Skapa uppgift
          </Typography>
          <Typography sx={{ mb: 3, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Fyll i ramen för uppgiften så räknar BookR ut fokuserade arbetspass som går att genomföra i din verkliga vecka.
          </Typography>

            <TextField
              fullWidth
              label="Uppgiftens namn"
              value={taskData.name}
              onChange={(e) => setTaskData({...taskData, name: e.target.value})}
              required
              sx={{ mb: 2, ...fieldSx }}
            />
            
            <TextField
              fullWidth
              label="Beskrivning"
              value={taskData.description}
              onChange={(e) => setTaskData({...taskData, description: e.target.value})}
              multiline
              rows={2}
              sx={{ mb: 2, ...fieldSx }}
            />
            
            <TextField
              fullWidth
              label="Estimerad tid (timmar)"
              type="number"
              value={taskData.estimatedHours}
              onChange={(e) => setTaskData({...taskData, estimatedHours: e.target.value})}
              required
              inputProps={{ min: 0.5, step: 0.5 }}
              sx={{ mb: 2, ...fieldSx }}
            />
            
            <Box sx={{ p: 2, mb: 2, borderRadius: 3, bgcolor: 'rgba(17,24,39,0.03)', border: '1px solid rgba(17,24,39,0.05)' }}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'var(--text)', fontWeight: 800 }}>
              Arbetstider
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                label="Från"
                type="number"
                value={taskData.workStartHour}
                onChange={(e) => setTaskData({...taskData, workStartHour: e.target.value})}
                inputProps={{ min: 0, max: 23 }}
                sx={{ flex: 1, ...fieldSx }}
              />
              <TextField
                label="Till"
                type="number"
                value={taskData.workEndHour}
                onChange={(e) => setTaskData({...taskData, workEndHour: e.target.value})}
                inputProps={{ min: 0, max: 23 }}
                sx={{ flex: 1, ...fieldSx }}
              />
            </Box>
            
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'var(--text)', fontWeight: 800 }}>
              Sessionslängd
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                label="Min (h)"
                type="number"
                value={taskData.minSessionHours}
                onChange={(e) => setTaskData({...taskData, minSessionHours: e.target.value})}
                inputProps={{ min: 0.5, step: 0.5 }}
                sx={{ flex: 1, ...fieldSx }}
              />
              <TextField
                label="Max (h)"
                type="number"
                value={taskData.maxSessionHours}
                onChange={(e) => setTaskData({...taskData, maxSessionHours: e.target.value})}
                inputProps={{ min: 0.5, step: 0.5 }}
                sx={{ flex: 1, ...fieldSx }}
              />
            </Box>
            </Box>
            
            <TextField
              fullWidth
              label="Rast mellan pass (minuter)"
              type="number"
              value={taskData.breakMinutes}
              onChange={(e) => setTaskData({...taskData, breakMinutes: e.target.value})}
              inputProps={{ min: 0, step: 5 }}
              helperText="Minuter vila mellan arbetspassen"
              sx={{ mb: 3, ...fieldSx }}
            />
            
            <Button
              variant="contained"
              fullWidth
              onClick={findTaskTime}
              disabled={loading}
              sx={{ ...primaryButtonSx, mb: taskSlots.length > 0 ? 2 : 0 }}
            >
              {loading ? 'Söker tid...' : 'Hitta tid'}
            </Button>
            
            {taskSlots.length > 0 && (
              <Button
                variant="outlined"
                fullWidth
                onClick={addToGoogleCalendar}
                disabled={loading}
                sx={{ ...secondaryButtonSx, mb: 2 }}
              >
                Lägg till i kalender
              </Button>
            )}
            
            {message && (
              <Alert 
                severity={message.includes('Fel') ? 'error' : 'success'} 
                sx={{ borderRadius: 3 }}
              >
                {message}
              </Alert>
            )}

          {taskSlots.length > 0 && (
            <Box sx={{ mt: 3, p: 2, borderRadius: 3, bgcolor: 'rgba(17,24,39,0.03)', border: '1px solid rgba(17,24,39,0.05)' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'var(--text)', mb: 0.75 }}>
                Snabbstatus
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {taskSlots.length} arbetspass föreslagna för {taskData.name || 'uppgiften'}.
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                Sista blocket avslutas {taskSlots.length > 0 ? moment(taskSlots[taskSlots.length - 1].end).format('DD/MM YYYY HH:mm') : '-'}.
              </Typography>
            </Box>
          )}
        </Paper>

        <Paper elevation={0} sx={{ ...sectionCardSx, minHeight: { xs: 520, lg: 760 }, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ mb: 3 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em', mb: 1 }}>
              Din kalender med föreslagna tider
            </Typography>
            <Typography sx={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Röda block visar upptagna tider. Gröna block visar var uppgiften kan genomföras utan att krocka med övriga åtaganden.
            </Typography>
          </Box>
          
          <Box sx={{ 
            flex: 1,
            '& .rbc-calendar, .rbc-time-view, .rbc-agenda-view, .rbc-month-view': {
              fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif !important",
              background: 'rgba(255,255,255,0.82)',
              borderRadius: '18px',
              border: '1px solid var(--border)',
              boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)',
              color: 'var(--text)'
            },
            '& .rbc-toolbar': {
              fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif !important",
              background: 'rgba(17,24,39,0.03)',
              borderBottom: '1px solid rgba(17,24,39,0.06)',
              borderRadius: '18px 18px 0 0',
              padding: '10px 16px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              alignItems: 'center',
              color: 'var(--text)'
            },
            '& .rbc-toolbar .rbc-toolbar-label': {
              marginRight: '16px',
              fontSize: '1.05rem',
              fontWeight: 700,
              color: 'var(--text)',
              letterSpacing: '-0.5px',
              padding: '0 8px'
            },
            '& .rbc-btn-group button': {
              fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif !important",
              fontSize: '1.01rem',
              borderRadius: '999px !important',
              border: '1px solid rgba(17,24,39,0.08) !important',
              background: 'rgba(255,255,255,0.86) !important',
              color: 'var(--text) !important',
              marginRight: '8px !important',
              marginBottom: '2px !important',
              padding: '7px 18px !important',
              fontWeight: '700 !important',
              boxShadow: 'none !important',
              transition: 'background 0.2s, box-shadow 0.2s, transform 0.1s !important',
              outline: 'none !important',
              borderWidth: '1px !important'
            },
            '& .rbc-btn-group button:hover': {
              background: 'rgba(17,24,39,0.05) !important',
              color: 'var(--text) !important',
              boxShadow: 'none !important',
              transform: 'scale(1.01) !important'
            },
            '& .rbc-btn-group button.rbc-active': {
              background: 'var(--text) !important',
              color: 'var(--surface-strong) !important',
              borderColor: 'var(--text) !important'
            },
            '& .rbc-header': {
              background: 'rgba(17,24,39,0.03)',
              color: 'var(--text)',
              fontWeight: 700,
              fontSize: '0.98rem',
              borderBottom: '1px solid rgba(17,24,39,0.06)',
              padding: '7px 0'
            },
            '& .rbc-today': {
              background: 'rgba(17,24,39,0.025) !important',
              borderBottom: '2px solid rgba(17,24,39,0.14)'
            },
            '& .rbc-event': {
              backgroundColor: 'rgba(180,35,24,0.12) !important',
              color: '#8f2018 !important',
              border: '1px solid rgba(180,35,24,0.18) !important',
              borderRadius: '4px !important',
              fontSize: '12px !important',
              fontWeight: '600 !important',
              padding: '2px 4px !important'
            },
            '& .rbc-event:hover': {
              backgroundColor: 'rgba(180,35,24,0.18) !important'
            },
            '& .task-event': {
              backgroundColor: 'rgba(31,122,77,0.14) !important',
              color: '#1f7a4d !important',
              border: '2px solid rgba(31,122,77,0.28) !important',
              fontWeight: '600 !important'
            },
            '& .task-event:hover': {
              backgroundColor: 'rgba(31,122,77,0.2) !important'
            },
            '& .rbc-time-content': {
              background: 'rgba(255,255,255,0.82)',
              borderRadius: '0 0 18px 18px'
            },
            '& .rbc-time-header-content': {
              background: 'rgba(17,24,39,0.03)'
            },
            '& .rbc-time-slot': {
              minHeight: '28px',
              position: 'relative',
              borderColor: 'rgba(17,24,39,0.06)'
            },
            '& .rbc-time-gutter, .rbc-time-header-gutter': {
              background: 'rgba(17,24,39,0.03)',
              color: 'var(--text)'
            },
            '& .rbc-timeslot-group': {
              borderBottom: '1px solid rgba(17,24,39,0.06)'
            },
            '& .rbc-day-slot .rbc-time-slot': {
              borderTop: '1px solid rgba(17,24,39,0.06)'
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
                      backgroundColor: 'rgba(31,122,77,0.14) !important',
                      color: '#1f7a4d !important',
                      border: '2px solid rgba(31,122,77,0.28) !important',
                      borderRadius: '4px !important',
                      fontWeight: '600 !important',
                      fontSize: '12px !important',
                      padding: '2px 4px !important'
                    }
                  };
                }
                return {
                  style: {
                    backgroundColor: 'rgba(180,35,24,0.12) !important',
                    color: '#8f2018 !important',
                    border: '1px solid rgba(180,35,24,0.18) !important',
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
        </Paper>
      </Box>
    </Container>
  );
};

export default Task;