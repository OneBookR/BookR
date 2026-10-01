import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, TextField, Button, Paper, Alert, Container, Chip,
  Drawer, IconButton, CircularProgress
} from '@mui/material';
import { Add, DeleteOutline, CheckCircle, ArrowForward, Event, Close, OpenWith, ArrowUpward, ArrowDownward, Visibility } from '@mui/icons-material';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import moment from 'moment';
import { apiRequest } from '../utils/apiConfig.js';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';

const localizer = momentLocalizer(moment);
const DnDCalendar = withDragAndDrop(Calendar);

// ✅ Samma hue-familj som resten av appen (--success/--warning i theme.css)
// plus två ytterligare toner — aldrig rött, det är reserverat för
// "Upptagen"-block så en uppgift aldrig kan förväxlas med en kalenderkrock.
const TASK_COLORS = ['#1f7a4d', '#b54708', '#3455a4', '#6d4aa0', '#0f766e'];

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

const DEFAULT_FORM = {
  name: '',
  description: '',
  estimatedHours: '',
  workStartHour: '9',
  workEndHour: '18',
  minSessionHours: '1',
  maxSessionHours: '4',
  breakMinutes: '15'
};

const Task = ({ user }) => {
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [busyEvents, setBusyEvents] = useState([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTask, setDrawerTask] = useState(null); // null = skapa ny uppgift
  const [form, setForm] = useState(DEFAULT_FORM);

  const [proposedSlots, setProposedSlots] = useState(null);
  const [proposedRemainingHours, setProposedRemainingHours] = useState(null);
  const [scheduling, setScheduling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [drawerError, setDrawerError] = useState('');
  // ✅ eventId:n från de pass som senast bekräftades — ger dem en egen
  // markering på kalendern tills man bekräftar en ny omgång eller laddar
  // om sidan, så man ser direkt vilka block som precis lagts till.
  const [recentlyAddedEventIds, setRecentlyAddedEventIds] = useState(() => new Set());

  const loadTasks = useCallback(async () => {
    try {
      const response = await apiRequest('/api/tasks');
      const data = await response.json();
      if (response.ok) setTasks(data.tasks || []);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  const loadBusyEvents = useCallback(async () => {
    try {
      const now = new Date();
      const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      const response = await apiRequest(
        `/api/calendar/events?start=${encodeURIComponent(now.toISOString())}&end=${encodeURIComponent(horizon.toISOString())}`
      );
      const data = await response.json();
      if (response.ok) setBusyEvents(data.events || []);
    } catch (error) {
      console.error('Error loading calendar:', error);
    }
  }, []);

  useEffect(() => {
    if (user?.email) {
      loadTasks();
      loadBusyEvents();
    }
  }, [user?.email, loadTasks, loadBusyEvents]);

  const taskColor = (taskId) => {
    const index = tasks.findIndex(t => t.id === taskId);
    return TASK_COLORS[(index < 0 ? 0 : index) % TASK_COLORS.length];
  };

  // ✅ Vad ett förslags-block INTE får krocka med — andra uppgifters redan
  // bekräftade pass + befintliga mötesbokningar. Beräknas separat från
  // calendarEvents (ren Date-form) så överlappskollen nedan slipper bry
  // sig om kalenderns render-format.
  const occupiedIntervals = useMemo(() => ([
    ...busyEvents.map(e => ({ start: new Date(e.start), end: new Date(e.end) })),
    ...tasks.flatMap(t => (t.scheduledSlots || []).map(s => ({ start: new Date(s.start), end: new Date(s.end) })))
  ]), [busyEvents, tasks]);

  const draftColor = drawerTask ? taskColor(drawerTask.id) : '#3455a4';

  const calendarEvents = useMemo(() => {
    const busy = busyEvents.map(e => ({
      title: 'Upptagen',
      start: new Date(e.start),
      end: new Date(e.end),
      resource: 'busy'
    }));
    const taskBlocks = tasks.flatMap(t =>
      (t.scheduledSlots || []).map(slot => {
        const isNew = slot.eventId && recentlyAddedEventIds.has(slot.eventId);
        return {
          title: isNew ? `Nytt: ${t.name}` : t.name,
          start: new Date(slot.start),
          end: new Date(slot.end),
          resource: 'task',
          color: taskColor(t.id),
          isNew
        };
      })
    );
    // ✅ Ej bekräftade förslag — ritas ovanpå, egen stil, dragbara/resizebara
    // (se draggableAccessor/resizableAccessor på kalendern). Flaggas som
    // "overlaps" om de krockar med en bokning ELLER ett annat förslag i
    // samma utkast, så man ser direkt om en flytt/ändring skapar en krock.
    const proposed = (proposedSlots || []).map((slot, i) => {
      const start = new Date(slot.start);
      const end = new Date(slot.end);
      const others = (proposedSlots || []).filter((_, j) => j !== i).map(s => ({ start: new Date(s.start), end: new Date(s.end) }));
      const overlaps = [...occupiedIntervals, ...others].some(iv => intervalsOverlap(start, end, iv.start, iv.end));
      return {
        id: slot.id,
        title: `Förslag: ${drawerTask?.name || 'Ny uppgift'}`,
        start, end,
        resource: 'proposed',
        color: draftColor,
        overlaps
      };
    });
    return [...busy, ...taskBlocks, ...proposed];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busyEvents, tasks, proposedSlots, occupiedIntervals, draftColor, recentlyAddedEventIds]);

  const proposedTotalHours = useMemo(
    () => Math.round((proposedSlots || []).reduce((sum, s) => sum + (Number(s.duration) || 0), 0) * 100) / 100,
    [proposedSlots]
  );
  const targetHours = drawerTask?.remainingHours ?? 0;
  const diffHours = Math.round((proposedTotalHours - targetHours) * 100) / 100;
  const hasOverlap = useMemo(() => calendarEvents.some(e => e.resource === 'proposed' && e.overlaps), [calendarEvents]);

  const handleProposedEventChange = useCallback(({ event, start, end }) => {
    if (event.resource !== 'proposed') return;
    setProposedSlots(prev => (prev || []).map(s => (s.id === event.id ? {
      ...s,
      start: start.toISOString(),
      end: end.toISOString(),
      duration: Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 100) / 100
    } : s)));
  }, []);

  // ✅ "Nästa pass" (nästa ändå-kommande arbetspass) är bara meningsfullt
  // medan det finns MER kvar att göra. När uppgiften är helt klar (0 h kvar)
  // visar vi istället "Sista pass" — det SENASTE inbokade passet — annars
  // läste "0 h kvar" + "Nästa pass" som en motsägelse (som om det fanns
  // mer schemalagt att vänta på, fast allt redan är klart).
  const slotSummaryLabel = (task) => {
    const slots = task.scheduledSlots || [];
    if (slots.length === 0) return null;
    const sorted = [...slots].sort((a, b) => new Date(a.start) - new Date(b.start));
    if (task.status === 'done') {
      const last = sorted[sorted.length - 1];
      return { kind: 'Sista pass', text: moment(last.start).format('ddd D/M HH:mm') + '–' + moment(last.end).format('HH:mm') };
    }
    const upcoming = sorted.filter(s => new Date(s.end) > new Date());
    if (upcoming.length === 0) return null;
    return { kind: 'Nästa pass', text: moment(upcoming[0].start).format('ddd D/M HH:mm') + '–' + moment(upcoming[0].end).format('HH:mm') };
  };

  const openCreateDrawer = () => {
    setDrawerTask(null);
    setForm(DEFAULT_FORM);
    setProposedSlots(null);
    setProposedRemainingHours(null);
    setDrawerError('');
    setDrawerOpen(true);
  };

  const openScheduleDrawer = (task) => {
    setDrawerTask(task);
    setProposedSlots(null);
    setProposedRemainingHours(null);
    setDrawerError('');
    setDrawerOpen(true);
  };

  // ✅ Stänger BARA panelen — behåller förslaget. Man ska kunna gå ut,
  // titta på hela kalendern i lugn och ro, dra/ändra storlek på blocken
  // (fungerar oavsett om panelen är öppen), och komma tillbaka senare.
  // Se den flytande förslagsraden nedan för hur man når tillbaka till
  // panelen eller bekräftar direkt utan att öppna den igen.
  const closeDrawer = () => {
    setDrawerOpen(false);
  };

  // ✅ Explicit "ångra" — det enda som faktiskt slänger förslaget.
  const discardDraft = () => {
    setDrawerOpen(false);
    setDrawerTask(null);
    setProposedSlots(null);
    setProposedRemainingHours(null);
    setDrawerError('');
  };

  const handleFindTime = async () => {
    setDrawerError('');

    let activeTask = drawerTask;

    if (!activeTask) {
      // Skapa-läge: validera formuläret och skapa uppgiften först — schemaläggning
      // körs alltid mot en redan sparad uppgift (se POST /api/tasks/:id/schedule).
      if (!form.name.trim() || !form.estimatedHours) {
        setDrawerError('Fyll i uppgiftens namn och estimerad tid');
        return;
      }
      setScheduling(true);
      try {
        const createRes = await apiRequest('/api/tasks', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name,
            description: form.description,
            estimatedHours: parseFloat(form.estimatedHours),
            workStartHour: parseInt(form.workStartHour, 10),
            workEndHour: parseInt(form.workEndHour, 10),
            minSessionHours: parseFloat(form.minSessionHours),
            maxSessionHours: parseFloat(form.maxSessionHours),
            breakMinutes: parseInt(form.breakMinutes, 10)
          })
        });
        const createData = await createRes.json();
        if (!createRes.ok) {
          setDrawerError('Fel: ' + (createData.error || 'Kunde inte skapa uppgiften'));
          setScheduling(false);
          return;
        }
        activeTask = createData.task;
        setDrawerTask(activeTask);
        setTasks(prev => [...prev, activeTask]);
      } catch (error) {
        setDrawerError('Fel vid skapande av uppgift');
        setScheduling(false);
        return;
      }
    } else {
      setScheduling(true);
    }

    try {
      const response = await apiRequest(`/api/tasks/${activeTask.id}/schedule`, { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        // ✅ Lokalt id så drag/resize på kalendern kan matcha tillbaka till
        // rätt post i proposedSlots (backend känner inte till id:n förrän
        // de bekräftas och blir riktiga kalenderhändelser).
        setProposedSlots((data.taskSlots || []).map((s, i) => ({ ...s, id: `proposed-${i}` })));
        setProposedRemainingHours(data.remainingHours);
        if ((data.taskSlots || []).length === 0) {
          setDrawerError('Inga lediga arbetspass hittades i det valda intervallet. Justera arbetstider eller sessionslängd.');
        }
      } else {
        setDrawerError('Fel: ' + (data.error || 'Kunde inte schemalägga uppgiften'));
      }
    } catch (error) {
      setDrawerError('Fel vid schemaläggning');
    } finally {
      setScheduling(false);
    }
  };

  const handleConfirmSlots = async () => {
    if (!drawerTask || !proposedSlots || proposedSlots.length === 0) return;
    setConfirming(true);
    setDrawerError('');
    try {
      const response = await apiRequest(`/api/tasks/${drawerTask.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ slots: proposedSlots })
      });
      const data = await response.json();
      if (response.ok) {
        // ✅ De NYA passen är alltid sist i den uppdaterade listan —
        // appendTaskSlots lägger till i slutet, aldrig om ordning.
        const addedCount = proposedSlots.length;
        const newIds = (data.task.scheduledSlots || []).slice(-addedCount).map(s => s.eventId).filter(Boolean);
        setRecentlyAddedEventIds(new Set(newIds));
        setTasks(prev => prev.map(t => (t.id === data.task.id ? data.task : t)));
        discardDraft();
        loadBusyEvents();
      } else {
        setDrawerError('Fel: ' + (data.error || 'Kunde inte lägga till i kalendern'));
      }
    } catch (error) {
      setDrawerError('Fel vid tillägg i kalender');
    } finally {
      setConfirming(false);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Ta bort uppgiften? Redan inbokade pass i kalendern påverkas inte.')) return;
    try {
      const response = await apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (response.ok) setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const glassCardSx = {
    borderRadius: 4,
    border: '1px solid var(--border)',
    bgcolor: 'rgba(255,255,255,0.78)',
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)',
    backdropFilter: 'blur(18px)'
  };

  const fieldSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 3,
      bgcolor: 'rgba(255,255,255,0.72)',
      '& fieldset': { borderColor: 'rgba(17,24,39,0.08)' },
      '&:hover fieldset': { borderColor: 'rgba(17,24,39,0.16)' },
      '&.Mui-focused fieldset': { borderColor: 'var(--text)' }
    },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--text)' }
  };

  const primaryButtonSx = {
    py: 1.5,
    borderRadius: 3,
    bgcolor: 'var(--text)',
    color: 'var(--surface-strong)',
    fontWeight: 700,
    boxShadow: 'none',
    textTransform: 'none',
    '&:hover': { bgcolor: '#000000', boxShadow: 'none' }
  };

  return (
    <Container maxWidth="xl" sx={{ mt: { xs: 11, md: 13 }, mb: 6, px: { xs: 2, sm: 3, lg: 4 } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h3" sx={{ fontSize: { xs: '2rem', md: '2.6rem' }, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)' }}>
            Uppgifter
          </Typography>
          <Typography sx={{ mt: 1, color: 'var(--text-secondary)', fontWeight: 500, maxWidth: 560 }}>
            Planera arbetspass direkt i kalendern och se när varje uppgift snabbast kan vara klar.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={openCreateDrawer} sx={{ ...primaryButtonSx, borderRadius: 999, px: 3 }}>
          Ny uppgift
        </Button>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '380px minmax(0, 1fr)' }, gap: 3, alignItems: 'start' }}>

        {/* Uppgiftslista */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', px: 0.5 }}>
            {tasks.length} aktiva uppgifter
          </Typography>

          {loadingTasks && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={22} sx={{ color: 'var(--text-secondary)' }} />
            </Box>
          )}

          {!loadingTasks && tasks.length === 0 && (
            <Paper elevation={0} sx={{ ...glassCardSx, p: 3, textAlign: 'center', color: 'var(--text-secondary)' }}>
              Inga uppgifter än. Skapa din första och låt BookR hitta tid i din kalender.
            </Paper>
          )}

          {tasks.map(task => {
            const color = taskColor(task.id);
            const pct = task.estimatedHours > 0 ? Math.min(100, Math.round((task.scheduledHours / task.estimatedHours) * 100)) : 0;
            const slotSummary = slotSummaryLabel(task);
            return (
              <Paper key={task.id} elevation={0} sx={{ ...glassCardSx, p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
                  <Typography sx={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{task.name}</Typography>
                  {task.status === 'done' ? (
                    <Chip icon={<CheckCircle sx={{ fontSize: '14px !important' }} />} label="Klar" size="small"
                      sx={{ bgcolor: 'rgba(31,122,77,0.1)', color: '#1f7a4d', fontWeight: 700, fontSize: 11 }} />
                  ) : task.status === 'in_progress' ? (
                    <Chip label="Pågår" size="small" sx={{ bgcolor: 'rgba(31,122,77,0.1)', color: '#1f7a4d', fontWeight: 700, fontSize: 11 }} />
                  ) : (
                    <Chip label="Väntar" size="small" sx={{ bgcolor: 'rgba(17,24,39,0.06)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 11 }} />
                  )}
                  <IconButton size="small" aria-label="Ta bort uppgift" onClick={() => handleDeleteTask(task.id)} sx={{ color: 'var(--text-secondary)' }}>
                    <DeleteOutline sx={{ fontSize: 17 }} />
                  </IconButton>
                </Box>

                <Box sx={{ height: 7, borderRadius: 999, bgcolor: 'rgba(17,24,39,0.06)', overflow: 'hidden' }}>
                  <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: color, borderRadius: 999 }} />
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  <span>{task.scheduledHours} av {task.estimatedHours} h schemalagt</span>
                  <span>{task.remainingHours} h kvar</span>
                </Box>

                {slotSummary ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12.5, fontWeight: 600, color: 'var(--text)', borderTop: '1px solid rgba(17,24,39,0.06)', pt: 1.25 }}>
                    <Event sx={{ fontSize: 15, color: 'var(--text-secondary)' }} />
                    {slotSummary.kind}: {slotSummary.text}
                  </Box>
                ) : task.status !== 'done' ? (
                  <Button
                    onClick={() => openScheduleDrawer(task)}
                    endIcon={<ArrowForward sx={{ fontSize: 15 }} />}
                    sx={{ justifyContent: 'center', fontWeight: 700, fontSize: 12.5, color: 'var(--text)', textTransform: 'none', borderTop: '1px solid rgba(17,24,39,0.06)', borderRadius: 0, pt: 1.25, mt: -0.25 }}
                  >
                    Hitta tid
                  </Button>
                ) : null}
              </Paper>
            );
          })}

          <Button
            onClick={openCreateDrawer}
            startIcon={<Add sx={{ fontSize: 16 }} />}
            sx={{
              justifyContent: 'center', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 13.5,
              textTransform: 'none', border: '1.5px dashed rgba(17,24,39,0.18)', borderRadius: 4, py: 1.75
            }}
          >
            Lägg till uppgift
          </Button>
        </Box>

        {/* Kalender */}
        <Paper elevation={0} sx={{ ...glassCardSx, minHeight: { xs: 520, lg: 760 }, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: { xs: 2.5, md: 3 }, pb: 1.5 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em', mb: 1 }}>
              Kalender — kommande 14 dagar
            </Typography>
            <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <LegendDot color="#b42318" label="Upptaget" />
              {tasks.map(t => <LegendDot key={t.id} color={taskColor(t.id)} label={t.name} />)}
              {proposedSlots?.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, fontWeight: 700, color: draftColor }}>
                  <OpenWith sx={{ fontSize: 14 }} />
                  Förslag — dra eller ändra storlek för att justera
                </Box>
              )}
            </Box>
          </Box>

          <Box sx={{
            flex: 1, px: { xs: 1, md: 2 }, pb: 2, overflowX: 'auto',
            // ✅ Dagskolumnerna fick aldrig krympa under läsbar bredd oavsett
            // hur smal kalendern är (t.ex. med panelen öppen bredvid) —
            // en för smal kalender klämde ihop flera block i veckovyn till
            // oläslig, överlappande text istället för att bara skrolla sidled.
            '& .rbc-calendar, & .rbc-time-view, & .rbc-month-view': { minWidth: 760 },
            '& .rbc-calendar, .rbc-time-view, .rbc-agenda-view, .rbc-month-view': {
              fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif !important",
              background: 'rgba(255,255,255,0.82)', borderRadius: '18px', border: '1px solid var(--border)',
              boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)', color: 'var(--text)'
            },
            '& .rbc-toolbar': {
              fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif !important", background: 'rgba(17,24,39,0.03)',
              borderBottom: '1px solid rgba(17,24,39,0.06)', borderRadius: '18px 18px 0 0', padding: '10px 16px',
              display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', color: 'var(--text)'
            },
            '& .rbc-toolbar .rbc-toolbar-label': { marginRight: '16px', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.5px', padding: '0 8px' },
            '& .rbc-btn-group button': {
              fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif !important", fontSize: '1.01rem', borderRadius: '999px !important',
              border: '1px solid rgba(17,24,39,0.08) !important', background: 'rgba(255,255,255,0.86) !important', color: 'var(--text) !important',
              marginRight: '8px !important', marginBottom: '2px !important', padding: '7px 18px !important', fontWeight: '700 !important',
              boxShadow: 'none !important', outline: 'none !important', borderWidth: '1px !important'
            },
            '& .rbc-btn-group button.rbc-active': { background: 'var(--text) !important', color: 'var(--surface-strong) !important', borderColor: 'var(--text) !important' },
            '& .rbc-header': { background: 'rgba(17,24,39,0.03)', color: 'var(--text)', fontWeight: 700, fontSize: '0.98rem', borderBottom: '1px solid rgba(17,24,39,0.06)', padding: '7px 0' },
            '& .rbc-today': { background: 'rgba(17,24,39,0.025) !important', borderBottom: '2px solid rgba(17,24,39,0.14)' },
            '& .rbc-time-content': { background: 'rgba(255,255,255,0.82)', borderRadius: '0 0 18px 18px' },
            '& .rbc-time-header-content': { background: 'rgba(17,24,39,0.03)' },
            '& .rbc-time-slot': { minHeight: '28px', position: 'relative', borderColor: 'rgba(17,24,39,0.06)' },
            '& .rbc-time-gutter, .rbc-time-header-gutter': { background: 'rgba(17,24,39,0.03)', color: 'var(--text)' },
            '& .rbc-timeslot-group': { borderBottom: '1px solid rgba(17,24,39,0.06)' },
            '& .rbc-day-slot .rbc-time-slot': { borderTop: '1px solid rgba(17,24,39,0.06)' }
          }}>
            <DnDCalendar
              localizer={localizer}
              events={calendarEvents}
              startAccessor="start"
              endAccessor="end"
              style={{ height: '100%' }}
              resizable
              draggableAccessor={event => event.resource === 'proposed'}
              resizableAccessor={event => event.resource === 'proposed'}
              onEventDrop={handleProposedEventChange}
              onEventResize={handleProposedEventChange}
              eventPropGetter={(event) => {
                if (event.resource === 'proposed') {
                  // ✅ Tidigare en svagt rand-randig, nästan osynlig ton
                  // (~15 % opacitet ovanpå vit bakgrund) — syntes knappt.
                  // Nu en MÄTTAD randig fyllning (två nästan fulltäta
                  // nyanser av samma färg, inte urblekta mot vitt) + vit
                  // text, så ett oskickat förslag är omöjligt att missa.
                  const stripeColor = event.overlaps ? '#b42318' : event.color;
                  return {
                    style: {
                      backgroundColor: stripeColor,
                      backgroundImage: `repeating-linear-gradient(135deg, ${stripeColor} 0px, ${stripeColor} 9px, ${stripeColor}B3 9px, ${stripeColor}B3 18px)`,
                      color: '#ffffff',
                      border: '2px solid #ffffff',
                      boxShadow: `0 0 0 2px ${stripeColor}, 0 4px 10px ${stripeColor}55`,
                      borderRadius: '6px', fontWeight: 800, fontSize: '12px', padding: '2px 4px', cursor: 'move'
                    }
                  };
                }
                if (event.resource === 'task') {
                  // ✅ Tidigare bara en svag ~13 % tint + kantlinje — läste som
                  // "bara en ram", ingen riktig färg i själva blocket. Nu en
                  // solid fyllning i uppgiftens färg + vit text, för alla
                  // bekräftade pass. Nyss tillagda pass sticker ut genom en
                  // extra vit glödring runt blocket (inte längre genom att
                  // vara "mer färgade" än de andra — alla är lika mättade nu).
                  return {
                    style: {
                      backgroundColor: event.color, color: '#ffffff',
                      border: event.isNew ? '1.5px solid #ffffff' : `1.5px solid ${event.color}`,
                      boxShadow: event.isNew ? `0 0 0 2px ${event.color}, 0 2px 8px rgba(0,0,0,0.25)` : 'none',
                      borderRadius: '6px', fontWeight: event.isNew ? 800 : 700, fontSize: '12px', padding: '2px 4px'
                    }
                  };
                }
                // ✅ Samma sak för "Upptagen" — solid röd fyllning istället
                // för en svag tint, så den syns lika tydligt som uppgifterna.
                return {
                  style: {
                    backgroundColor: '#b42318', color: '#ffffff', border: '1px solid #b42318',
                    borderRadius: '4px', fontWeight: 600, fontSize: '12px', padding: '2px 4px'
                  }
                };
              }}
              views={['week', 'day', 'agenda']}
              defaultView="week"
            />
          </Box>
        </Paper>
      </Box>

      {/* Ny uppgift / schemalägg-panel — persistent (ingen mörkläggande backdrop):
          stängs bara undan, släcker aldrig förslaget. Se den flytande raden
          nedan för hur man kommer tillbaka när panelen är stängd. */}
      <Drawer variant="persistent" anchor="right" open={drawerOpen} onClose={closeDrawer} PaperProps={{ sx: { width: { xs: '100%', sm: 440 }, bgcolor: 'var(--surface-strong)', display: 'flex', flexDirection: 'column', height: '100vh' } }}>
        {/* Fast överdel — header, formulär/mål, Hitta tid, och (när ett
            förslag finns) sammanfattning + "visa kalendern"-knapp. Ligger
            kvar synlig även när listan med pass nedan är lång och scrollar. */}
        <Box sx={{ p: 3.5, pb: proposedSlots?.length ? 2.5 : 3.5, flexShrink: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
            <Typography sx={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)' }}>
              {drawerTask ? drawerTask.name : 'Ny uppgift'}
            </Typography>
            <IconButton onClick={closeDrawer} size="small" aria-label="Dölj panelen" sx={{ border: '1px solid rgba(17,24,39,0.1)' }}>
              <Close sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>

          {!drawerTask && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2.5 }}>
              <TextField fullWidth label="Uppgiftens namn" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required sx={fieldSx} />
              <TextField fullWidth label="Beskrivning" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} multiline rows={2} sx={fieldSx} />
              <TextField fullWidth label="Estimerad tid (timmar)" type="number" value={form.estimatedHours}
                onChange={e => setForm({ ...form, estimatedHours: e.target.value })} required inputProps={{ min: 0.5, step: 0.5 }} sx={fieldSx} />

              <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(17,24,39,0.03)', border: '1px solid rgba(17,24,39,0.05)' }}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'var(--text)', fontWeight: 800 }}>Arbetstider</Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <TextField label="Från" type="number" value={form.workStartHour} onChange={e => setForm({ ...form, workStartHour: e.target.value })} inputProps={{ min: 0, max: 23 }} sx={{ flex: 1, ...fieldSx }} />
                  <TextField label="Till" type="number" value={form.workEndHour} onChange={e => setForm({ ...form, workEndHour: e.target.value })} inputProps={{ min: 0, max: 23 }} sx={{ flex: 1, ...fieldSx }} />
                </Box>
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'var(--text)', fontWeight: 800 }}>Sessionslängd</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField label="Min (h)" type="number" value={form.minSessionHours} onChange={e => setForm({ ...form, minSessionHours: e.target.value })} inputProps={{ min: 0.5, step: 0.5 }} sx={{ flex: 1, ...fieldSx }} />
                  <TextField label="Max (h)" type="number" value={form.maxSessionHours} onChange={e => setForm({ ...form, maxSessionHours: e.target.value })} inputProps={{ min: 0.5, step: 0.5 }} sx={{ flex: 1, ...fieldSx }} />
                </Box>
              </Box>

              <TextField fullWidth label="Rast mellan pass (minuter)" type="number" value={form.breakMinutes}
                onChange={e => setForm({ ...form, breakMinutes: e.target.value })} inputProps={{ min: 0, step: 5 }} sx={fieldSx} />
            </Box>
          )}

          {drawerTask && !proposedSlots?.length && (
            <Box sx={{ mb: 2.5, fontSize: 13.5, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {drawerTask.remainingHours} av {drawerTask.estimatedHours} h kvar att schemalägga.
            </Box>
          )}

          <Button
            variant={proposedSlots?.length ? 'outlined' : 'contained'}
            fullWidth onClick={handleFindTime} disabled={scheduling}
            sx={proposedSlots?.length
              ? { borderRadius: 999, fontWeight: 700, textTransform: 'none', borderColor: 'rgba(17,24,39,0.15)', color: 'var(--text)' }
              : { ...primaryButtonSx, borderRadius: 999 }}
          >
            {scheduling ? 'Söker tid...' : proposedSlots?.length ? 'Hitta tid igen' : 'Hitta tid'}
          </Button>

          {drawerError && <Alert severity="error" sx={{ borderRadius: 3, mt: 2 }}>{drawerError}</Alert>}

          {proposedSlots && proposedSlots.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  {proposedTotalHours} av {targetHours} h placerade
                </Typography>
                <DiffBadge diffHours={diffHours} />
              </Box>

              {/* ✅ Tidigare en diskret textknapp längst ner, under hela
                  pass-listan — omöjlig att hitta med många förslag. Nu en
                  tydlig, färgad knapp direkt under sammanfattningen, alltid
                  synlig utan att scrolla. */}
              <Button
                fullWidth onClick={closeDrawer} startIcon={<Visibility sx={{ fontSize: 17 }} />}
                sx={{
                  justifyContent: 'center', fontWeight: 700, fontSize: 13, textTransform: 'none',
                  color: draftColor, bgcolor: `${draftColor}14`, border: `1.5px solid ${draftColor}40`,
                  borderRadius: 999, py: 1, '&:hover': { bgcolor: `${draftColor}22` }
                }}
              >
                Visa & justera i kalendern
              </Button>

              {hasOverlap && (
                <Alert severity="warning" sx={{ borderRadius: 3 }}>Ett eller flera pass krockar med en bokning eller ett annat förslag — dra dem till en ledig lucka i kalendern.</Alert>
              )}
              {proposedRemainingHours > 0 && (
                <Typography sx={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {proposedRemainingHours} h fick inte plats inom 14 dagar — klicka Hitta tid igen senare.
                </Typography>
              )}
            </Box>
          )}
        </Box>

        {/* Scrollbar mittdel — själva pass-listan, kan bli lång. */}
        {proposedSlots && proposedSlots.length > 0 && (
          <Box sx={{ flex: 1, overflowY: 'auto', px: 3.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Föreslagna arbetspass
            </Typography>
            {proposedSlots.map((slot) => {
              const overlaps = calendarEvents.find(e => e.resource === 'proposed' && e.id === slot.id)?.overlaps;
              return (
                <Box key={slot.id} sx={{
                  display: 'flex', alignItems: 'center', gap: 1.25, borderRadius: 3, px: 1.5, py: 1,
                  bgcolor: overlaps ? 'rgba(180,35,24,0.07)' : `${draftColor}10`,
                  border: `1px solid ${overlaps ? 'rgba(180,35,24,0.3)' : `${draftColor}30`}`
                }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: overlaps ? '#b42318' : draftColor, flexShrink: 0 }} />
                  <Typography sx={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{moment(slot.start).format('ddd D MMM')}</Typography>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: overlaps ? '#8f2018' : 'var(--text-secondary)' }}>
                    {moment(slot.start).format('HH:mm')}–{moment(slot.end).format('HH:mm')} · {slot.duration}h
                  </Typography>
                </Box>
              );
            })}
            <Box sx={{ height: 8 }} />
          </Box>
        )}

        {/* Fast nederdel — bekräfta/ångra, alltid nåbar utan att scrolla klart listan. */}
        {proposedSlots && proposedSlots.length > 0 && (
          <Box sx={{ p: 3.5, pt: 2, flexShrink: 0, borderTop: '1px solid rgba(17,24,39,0.08)', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Button variant="contained" fullWidth onClick={handleConfirmSlots} disabled={confirming} sx={{ ...primaryButtonSx, borderRadius: 999 }}>
              {confirming ? 'Lägger till...' : 'Lägg till i kalender'}
            </Button>
            <Button fullWidth onClick={discardDraft} sx={{ fontWeight: 700, fontSize: 12.5, color: 'var(--text-secondary)', textTransform: 'none' }}>
              Ångra förslaget
            </Button>
          </Box>
        )}
      </Drawer>

      {/* Flytande rad — syns när panelen är dold men ett förslag väntar,
          så man alltid kan komma tillbaka och bekräfta/justera/ångra utan
          att behöva öppna panelen igen. */}
      {!drawerOpen && proposedSlots?.length > 0 && (
        <Paper elevation={0} sx={{
          position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 1300,
          display: 'flex', alignItems: 'center', gap: 2, px: 2.5, py: 1.5, borderRadius: 999,
          bgcolor: 'var(--surface-strong)', border: '1px solid rgba(17,24,39,0.1)', boxShadow: '0 18px 40px rgba(15,23,42,0.18)'
        }}>
          <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: draftColor, flexShrink: 0 }} />
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
            {drawerTask?.name}
          </Typography>
          <DiffBadge diffHours={diffHours} large />
          {hasOverlap && (
            <Chip size="small" label="Krock" sx={{ bgcolor: 'rgba(180,35,24,0.12)', color: '#b42318', fontWeight: 800, fontSize: 11 }} />
          )}
          <Button onClick={() => setDrawerOpen(true)} sx={{ fontWeight: 700, fontSize: 12.5, color: 'var(--text)', textTransform: 'none' }}>
            Granska
          </Button>
          <Button variant="contained" onClick={handleConfirmSlots} disabled={confirming} sx={{ ...primaryButtonSx, borderRadius: 999, px: 2.5, py: 0.75 }}>
            {confirming ? 'Lägger till...' : 'Lägg till i kalender'}
          </Button>
          <IconButton size="small" aria-label="Ångra förslaget" onClick={discardDraft} sx={{ color: 'var(--text-secondary)' }}>
            <Close sx={{ fontSize: 16 }} />
          </IconButton>
        </Paper>
      )}
    </Container>
  );
};

function LegendDot({ color, label }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      {label}
    </Box>
  );
}

// ✅ Delad av den flytande raden (stor) och panelens översta, alltid synliga
// sammanfattning (medel) — samma färgkodning och text på båda ställena så
// man känner igen sig oavsett var man ser den.
function DiffBadge({ diffHours, large = false }) {
  const isExact = diffHours === 0;
  const isOver = diffHours > 0;
  const bg = isExact ? 'rgba(31,122,77,0.12)' : isOver ? 'rgba(181,71,8,0.14)' : 'rgba(17,24,39,0.07)';
  const fg = isExact ? '#1f7a4d' : isOver ? '#b54708' : 'var(--text-secondary)';
  const label = isExact ? 'Exakt matchning' : isOver ? `+${diffHours} h över` : `${Math.abs(diffHours)} h kvar`;
  return (
    <Box sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0,
      bgcolor: bg, color: fg, fontWeight: 800, borderRadius: 999, whiteSpace: 'nowrap',
      fontSize: large ? 14 : 12, px: large ? 1.75 : 1.25, py: large ? 0.75 : 0.5,
      border: `1.5px solid ${fg}40`
    }}>
      {!isExact && (isOver
        ? <ArrowUpward sx={{ fontSize: large ? 16 : 13 }} />
        : <ArrowDownward sx={{ fontSize: large ? 16 : 13 }} />)}
      {label}
    </Box>
  );
}

export default Task;
