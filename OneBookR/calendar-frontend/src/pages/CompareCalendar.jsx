import React, { useState, useEffect } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/sv';
import 'react-big-calendar/lib/css/react-big-calendar.css';

// Konfigurera moment för svensk tid (GMT+1)
moment.locale('sv');
import '../styles/theme.css';
import { Card, CardContent, Typography, Button, TextField, Box, Dialog, DialogTitle, DialogActions, DialogContent, Paper, InputAdornment, MenuItem, Select, FormControl, InputLabel, CircularProgress, Snackbar, Alert, Fade, Tooltip, Badge, Skeleton, Slide, Zoom, Grow, IconButton, Divider } from '@mui/material';
import { TimeSlotSkeleton, SuggestionSkeleton } from '../components/LoadingSkeleton';
import { useTheme } from '../hooks/useTheme';
import { useNotifications } from '../hooks/useNotifications';
import { usePWA } from '../hooks/usePWA';
import { useContacts } from '../hooks/useContacts';
import ContactBook from '../components/ContactBook';
import ContactsIcon from '@mui/icons-material/Contacts';
import DeleteIcon from '@mui/icons-material/Delete';
import PlaceIcon from '@mui/icons-material/Place';
import NotificationsIcon from '@mui/icons-material/Notifications';
import EventIcon from '@mui/icons-material/Event';
import GroupIcon from '@mui/icons-material/Group';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { API_BASE_URL } from '../config';

// --- NYTT: Modernare typsnitt och färger, minimalistiskt ---
const calendarFontFamily = "'Inter', 'Segoe UI', 'Roboto', 'Arial', sans-serif";
const calendarBg = "#f7f9fb";
const calendarBorder = "#e0e3e7";
const calendarAccent = "#1976d2";
const calendarEventBg = "#e3f2fd";
const calendarEventText = "#1976d2";
const calendarHeaderBg = "#f1f3f6";
const calendarHeaderText = "#222";
const calendarTodayBg = "#fffde7";

const localizer = momentLocalizer(moment);

export default function CompareCalendar({ myToken, invitedTokens = [], user, directAccess, contactEmail, contactEmails, contactName, teamName }) {
  // Säkerställ att hooks som använder window.user fungerar
  React.useEffect(() => {
    try {
      if (user && !window.user) {
        window.user = user;
      }
    } catch (_) {}
  }, [user]);

  // Defensiv loggning av inkommande props
  React.useEffect(() => {
    try {
      console.log('[CompareCalendar] props', {
        hasMyToken: !!myToken,
        invitedTokensLen: Array.isArray(invitedTokens) ? invitedTokens.length : 'n/a',
        userEmail: user?.email || user?.emails?.[0]?.value || user?.emails?.[0],
        directAccess,
        contactEmail,
        contactEmails,
        contactName,
        teamName,
      });
    } catch (_) {}
  }, [myToken, invitedTokens, user, directAccess, contactEmail, contactEmails, contactName, teamName]);

  // Fallback för user och myToken
  if (!user || !myToken) {
    return (
      <div style={{ padding: 16, border: '1px solid #ff9800', background: '#fff8e1', borderRadius: 8, color: '#e65100' }}>
        Din session saknar användare eller åtkomsttoken. Logga ut och in igen.
      </div>
    );
  }

  // Fallback för user.provider
  const userProvider = user?.provider || 'google';

  // --- FIX: Always call hooks at the top level ---
  const themeApi = useTheme();
  const theme = themeApi?.theme || { isDark: false, colors: { surface: '#fff', border: '#e0e3e7', text: '#222', textSecondary: '#888', bg: '#f7f9fb', primary: '#1976d2', warning: '#ff9800', success: '#4caf50', error: '#d32f2f' } };

  const notifApi = useNotifications();
  const showNotification = notifApi?.showNotification || (() => {});

  const contactsApi = useContacts();

  const [availability, setAvailability] = useState([]);
  const [error, setError] = useState(null);
  const [timeMin, setTimeMin] = useState('');
  const [timeMax, setTimeMax] = useState('');
  const [meetingDuration, setMeetingDuration] = useState(60);
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [multiDayStart, setMultiDayStart] = useState('');
  const [multiDayEnd, setMultiDayEnd] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [dayStart, setDayStart] = useState('09:00');
  const [dayEnd, setDayEnd] = useState('18:00');
  const [suggestions, setSuggestions] = useState([]);
  const [suggestDialog, setSuggestDialog] = useState({ open: false, slot: null });
  const [meetingTitle, setMeetingTitle] = useState('');
  const [withMeet, setWithMeet] = useState(true);
  const [meetingLocation, setMeetingLocation] = useState('');
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [isSubmittingSuggestion, setIsSubmittingSuggestion] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [calendarEvents, setCalendarEvents] = useState([]);
  
  const urlParams = new URLSearchParams(window.location.search);
  const groupId = urlParams.get('group');

  // Hämta förslag
  useEffect(() => {
    if (groupId) {
      const fetchSuggestions = () => {
        fetch(`${API_BASE_URL}/api/group/${groupId}/suggestions`)
          .then(res => res.json())
          .then((data) => {
            setSuggestions(data.suggestions || []);
          })
          .catch(error => {
            console.error('Fel vid hämtning av tidsförslag:', error);
            setSuggestions([]);
          });
      };
      
      fetchSuggestions();
      const interval = setInterval(fetchSuggestions, 5000);
      return () => clearInterval(interval);
    }
  }, [groupId]);

  // Hämta lediga tider från backend
  const fetchAvailability = async () => {
    try {
      const tokens = [myToken, ...(Array.isArray(invitedTokens) ? invitedTokens : [])].filter(Boolean);
      if (!Array.isArray(tokens) || tokens.length === 0) {
        console.warn('[CompareCalendar] Hoppar över fetchAvailability: tom token-lista');
        return;
      }
      
      if (!isOnline) {
        setError('Ingen internetanslutning. Kontrollera din anslutning och försök igen.');
        return;
      }
      
      setIsLoadingAvailability(true);
      setHasSearched(true);
      setError(null);
      
      // Validering för flerdagars-möten
      if (isMultiDay) {
        if (!multiDayStart || !multiDayEnd) {
          setError('Ange startdatum och slutdatum för flerdagars-mötet.');
          setAvailability([]);
          setIsLoadingAvailability(false);
          return;
        }
        if (new Date(multiDayStart) >= new Date(multiDayEnd)) {
          setError('Slutdatum måste vara efter startdatum.');
          setAvailability([]);
          setIsLoadingAvailability(false);
          return;
        }
      } else if (!timeMin || !timeMax) {
        setError('Ange ett datumintervall.');
        setAvailability([]);
        setIsLoadingAvailability(false);
        return;
      }

      const providers = [userProvider];
      for (let i = 1; i < tokens.length; i++) {
        providers.push('google');
      }
      
      const requestBody = {
        tokens,
        providers,
        duration: meetingDuration,
        dayStart,
        dayEnd,
        isMultiDay,
      };
      
      if (isMultiDay) {
        requestBody.timeMin = new Date(multiDayStart + 'T00:00:00').toISOString();
        requestBody.timeMax = new Date(multiDayEnd + 'T23:59:59').toISOString();
        requestBody.multiDayStart = multiDayStart;
        requestBody.multiDayEnd = multiDayEnd;
      } else {
        requestBody.timeMin = new Date(timeMin).toISOString();
        requestBody.timeMax = new Date(timeMax).toISOString();
      }
      
      const res = await fetch(`${API_BASE_URL}/api/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      const data = await res.json();

      if (res.ok) {
        setAvailability(Array.isArray(data) ? data : []);
        setError(null);
        setToast({ open: true, message: `Hittade ${Array.isArray(data) ? data.length : 0} lediga tider`, severity: 'success' });
      } else {
        setAvailability([]);
        setError(data.error || 'Något gick fel vid hämtning av tillgänglighet.');
      }
    } catch (err) {
      setAvailability([]);
      setError('Kunde inte hämta tillgänglighet. Försök igen senare.');
    } finally {
      setIsLoadingAvailability(false);
    }
  };

  // Filtrera lediga tider
  const filteredAvailability = Array.isArray(availability)
    ? availability.filter(slot => slot && slot.start && slot.end && new Date(slot.start) < new Date(slot.end))
    : [];

  const now = new Date();
  const sortedFutureSlots = filteredAvailability
    .filter(slot => new Date(slot.start) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const visibleSlots = showAll ? sortedFutureSlots : sortedFutureSlots.slice(0, 4);

  // Föreslå tid
  const handleSuggest = async (slot) => {
    setMeetingTitle('');
    setWithMeet(true);
    setMeetingLocation('');
    setSuggestDialog({ open: true, slot });
  };
  
  const confirmSuggest = async () => {
    if (!isOnline) {
      setToast({ open: true, message: 'Ingen internetanslutning', severity: 'error' });
      return;
    }
    if (!groupId || !suggestDialog.slot) return;
    if (!withMeet && !meetingLocation.trim()) {
      setToast({ open: true, message: 'Ange plats för mötet.', severity: 'warning' });
      return;
    }
    
    setIsSubmittingSuggestion(true);
    const suggestionData = {
      start: suggestDialog.slot.start,
      end: suggestDialog.slot.end,
      email: user.email || user.emails?.[0]?.value || user.emails?.[0],
      title: meetingTitle,
      withMeet,
      location: withMeet ? '' : meetingLocation,
      isMultiDay: suggestDialog.slot.isMultiDay || false,
      multiDayStart: suggestDialog.slot.multiDayStart || null,
      multiDayEnd: suggestDialog.slot.multiDayEnd || null,
      durationPerDay: suggestDialog.slot.durationPerDay || null,
      dayStart: suggestDialog.slot.dayStart || null,
      dayEnd: suggestDialog.slot.dayEnd || null
    };
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/group/${groupId}/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(suggestionData),
      });
      
      if (response.ok) {
        setToast({ open: true, message: 'Tidsförslag skickat!', severity: 'success' });
        setSuggestDialog({ open: false, slot: null });
        
        showNotification('Tidsförslag skickat!', {
          body: `Förslag för ${new Date(suggestionData.start).toLocaleDateString()} skickat till gruppen`,
          tag: 'suggestion-sent'
        });
      } else {
        const errorData = await response.json();
        setToast({ open: true, message: errorData.error || 'Kunde inte skicka förslag.', severity: 'error' });
      }
    } catch (error) {
      setToast({ open: true, message: 'Något gick fel. Kontrollera din internetanslutning.', severity: 'error' });
    } finally {
      setIsSubmittingSuggestion(false);
    }
  };

  // Rösta på förslag
  const voteSuggestion = async (suggestionId, vote, targetGroupId = null) => {
    const targetGroup = targetGroupId || groupId;
    if (!targetGroup) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/group/${targetGroup}/suggestion/${suggestionId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email || user.emails?.[0]?.value || user.emails?.[0],
          vote,
        }),
      });
      if (response.ok) {
        const result = await response.json();
        const voteText = vote === 'accepted' ? 'accepterat' : 'nekat';
        setToast({ open: true, message: `Du har ${voteText} tidsförslaget!`, severity: 'success' });
        
        if (result.suggestion) {
          setSuggestions(prev => prev.map(s => 
            s.id === suggestionId ? result.suggestion : s
          ));
        }
        
        if (targetGroup === groupId) {
          setTimeout(() => {
            fetch(`${API_BASE_URL}/api/group/${groupId}/suggestions`)
              .then(res => res.json())
              .then(data => setSuggestions(data.suggestions || []));
          }, 1000);
        }
        
        if (result.suggestion && result.suggestion.finalized) {
          showNotification('Möte bokat!', {
            body: 'Alla har accepterat tiden. Kalenderinbjudan skickas ut via mejl.',
            tag: 'meeting-booked'
          });
          
          setToast({ 
            open: true, 
            message: '🎉 Möte bokat! Alla har accepterat tiden. Kalenderinbjudan och möteslänk skickas ut via mejl.', 
            severity: 'success' 
          });
        }
      }
    } catch (error) {
      setToast({ open: true, message: 'Kunde inte registrera röst. Försök igen.', severity: 'error' });
    }
  };

  // NYTT: Visa automatiskt alla lediga tider från idag och 30 dagar framåt vid första render
  useEffect(() => {
    if (!timeMin && !timeMax && myToken) {
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setDate(end.getDate() + 30);
      end.setHours(23, 59, 59, 999);
      setTimeMin(start.toISOString().slice(0, 16));
      setTimeMax(end.toISOString().slice(0, 16));
    }
  }, [myToken, timeMin, timeMax]);

  // Hämta kalenderhändelser för att visa i kalendervyn
  useEffect(() => {
    const fetchCalendarEvents = async () => {
      if (!myToken || !timeMin || !timeMax) return;
      
      try {
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
          `timeMin=${encodeURIComponent(new Date(timeMin).toISOString())}&` +
          `timeMax=${encodeURIComponent(new Date(timeMax).toISOString())}&` +
          `singleEvents=true&orderBy=startTime`,
          {
            headers: {
              'Authorization': `Bearer ${myToken}`
            }
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          const events = (data.items || []).map(event => ({
            title: event.summary || 'Ingen titel',
            start: new Date(event.start.dateTime || event.start.date),
            end: new Date(event.end.dateTime || event.end.date),
            allDay: !event.start.dateTime
          }));
          setCalendarEvents(events);
        }
      } catch (error) {
        console.error('Failed to fetch calendar events:', error);
      }
    };
    
    fetchCalendarEvents();
  }, [myToken, timeMin, timeMax]);

  return (
    <>
      <Slide direction="up" in={true} timeout={800}>
        <Box sx={{ bgcolor: theme.colors.surface, borderRadius: { xs: 2, sm: 3 }, boxShadow: theme.isDark ? '0 4px 20px rgba(0,0,0,0.3)' : '0 2px 8px rgba(60,64,67,.06)', border: `1px solid ${theme.colors.border}`, p: { xs: 2, sm: 3 }, mb: { xs: 8, sm: 15 }, maxWidth: { xs: '100%', sm: 800 }, mx: 0, transition: 'all 0.3s ease' }}>
          <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 0, maxWidth: 600 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
              <Box sx={{ flex: 1, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', gap: 1, width: '100%' }}>
                <TextField label="Från" type="date" InputLabelProps={{ shrink: true }} value={timeMin ? timeMin.slice(0, 10) : ''} onChange={e => { const date = e.target.value; const time = timeMin ? timeMin.slice(11, 16) : '00:00'; setTimeMin(date ? `${date}T${time}` : ''); }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 999, background: theme.colors.bg, color: theme.colors.text, '& fieldset': { borderColor: theme.colors.border } }, '& .MuiInputBase-root': { borderRadius: 999 }, '& .MuiInputLabel-root': { color: theme.colors.textSecondary } }} variant="outlined" />
                <TextField label="Tid" type="time" InputLabelProps={{ shrink: true }} value={timeMin ? timeMin.slice(11, 16) : ''} onChange={e => { if (timeMin) { setTimeMin(timeMin.slice(0, 10) + 'T' + e.target.value); } }} sx={{ minWidth: 120, maxWidth: 160, '& .MuiOutlinedInput-root': { borderRadius: 999, background: theme.colors.bg, color: theme.colors.text, '& fieldset': { borderColor: theme.colors.border } }, '& .MuiInputBase-root': { borderRadius: 999 }, '& .MuiInputLabel-root': { color: theme.colors.textSecondary } }} variant="outlined" />
              </Box>
              <Typography sx={{ mx: 1, fontWeight: 600, color: '#888', fontSize: 22, userSelect: 'none', display: { xs: 'none', sm: 'block' } }}>–</Typography>
              <Box sx={{ flex: 1, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', gap: 1, width: '100%' }}>
                <TextField label="Till" type="date" InputLabelProps={{ shrink: true }} value={timeMax ? timeMax.slice(0, 10) : ''} onChange={e => { const date = e.target.value; const time = timeMax ? timeMax.slice(11, 16) : '23:59'; setTimeMax(date ? `${date}T${time}` : ''); }} fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 999, background: theme.colors.bg, color: theme.colors.text, '& fieldset': { borderColor: theme.colors.border } }, '& .MuiInputBase-root': { borderRadius: 999 }, '& .MuiInputLabel-root': { color: theme.colors.textSecondary } }} variant="outlined" />
                <TextField label="Tid" type="time" InputLabelProps={{ shrink: true }} value={timeMax ? timeMax.slice(11, 16) : ''} onChange={e => { if (timeMax) { setTimeMax(timeMax.slice(0, 10) + 'T' + e.target.value); } }} sx={{ minWidth: 120, maxWidth: 160, '& .MuiOutlinedInput-root': { borderRadius: 999, background: theme.colors.bg, color: theme.colors.text, '& fieldset': { borderColor: theme.colors.border } }, '& .MuiInputBase-root': { borderRadius: 999 }, '& .MuiInputLabel-root': { color: theme.colors.textSecondary } }} variant="outlined" />
              </Box>
            </Box>
            <Typography variant="caption" sx={{ color: '#888', mb: 0.3, mt: 2, pl: 1.0 }}>
              Om du inte anger något datumintervall visas automatiskt alla lediga tider från idag och 30 dagar framåt.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, gap: 2, mt: 1 }}>
              <TextField label={isMultiDay ? "Timmar per dag" : "Mötestid (minuter)"} type="number" value={meetingDuration} onChange={(e) => setMeetingDuration(Number(e.target.value))} sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 999, background: theme.colors.bg, color: theme.colors.text, '& fieldset': { borderColor: theme.colors.border } }, '& .MuiInputBase-root': { borderRadius: 999 }, '& .MuiInputLabel-root': { color: theme.colors.textSecondary } }} variant="outlined" />
              <Button variant={isMultiDay ? "contained" : "outlined"} onClick={() => setIsMultiDay(!isMultiDay)} sx={{ borderRadius: 999, px: 3, fontWeight: 600, fontSize: 12 }}>Flera dagar</Button>
            </Box>
            {isMultiDay && (
              <Box sx={{ mt: 2, p: 2, bgcolor: '#e3f2fd', borderRadius: 2, border: '1px solid #1976d2' }}>
                <Typography variant="body2" sx={{ mb: 2, fontWeight: 600, color: '#1976d2' }}>Flerdagars-möte</Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <TextField label="Startdatum" type="date" value={multiDayStart} onChange={e => setMultiDayStart(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 999, background: '#fff' } }} />
                  <Typography sx={{ color: '#1976d2', fontWeight: 600 }}>–</Typography>
                  <TextField label="Slutdatum" type="date" value={multiDayEnd} onChange={e => setMultiDayEnd(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 999, background: '#fff' } }} />
                </Box>
                <Typography variant="caption" sx={{ color: '#666', mt: 1, display: 'block' }}>Ange hur många timmar per dag mötet ska vara och välj datumintervall</Typography>
              </Box>
            )}
            <TextField label="Från (dagens starttid)" type="time" value={dayStart} onChange={e => setDayStart(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 999, background: theme.colors.bg, color: theme.colors.text, '& fieldset': { borderColor: theme.colors.border } }, '& .MuiInputBase-root': { borderRadius: 999 }, '& .MuiInputLabel-root': { color: theme.colors.textSecondary } }} variant="outlined" />
            <TextField label="Till (dagens sluttid)" type="time" value={dayEnd} onChange={e => setDayEnd(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 999, background: theme.colors.bg, color: theme.colors.text, '& fieldset': { borderColor: theme.colors.border } }, '& .MuiInputBase-root': { borderRadius: 999 }, '& .MuiInputLabel-root': { color: theme.colors.textSecondary } }} variant="outlined" />
            <Button variant="contained" color="primary" onClick={fetchAvailability} disabled={isLoadingAvailability} sx={{ fontWeight: 600, fontSize: '1.08rem', letterSpacing: 0.5, borderRadius: 999, minWidth: 0, minHeight: 0, height: 48, width: '100%', background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)', color: '#fff', boxShadow: '0 2px 8px 0 rgba(99,91,255,0.13)', transition: 'background 0.2s, box-shadow 0.2s, transform 0.1s', '&:hover': { background: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)', boxShadow: '0 0 0 4px #e9e5ff, 0 8px 24px 0 rgba(99,91,255,0.18)', transform: 'scale(1.03)' }, '&:active': { background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)', boxShadow: '0 0 0 2px #bcb8ff, 0 2px 8px 0 rgba(99,91,255,0.13)', transform: 'scale(0.98)' }, '&:disabled': { background: '#ccc', transform: 'none', boxShadow: 'none' }, py: 1.2, mt: 1, mb: 3, textTransform: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
              {isLoadingAvailability && <CircularProgress size={20} sx={{ color: 'white' }} />}
              {isLoadingAvailability ? 'Jämför kalendrar...' : 'Jämför kalendrar'}
              {!isOnline && ' (Offline)'}
            </Button>
          </Box>
        </Box>
      </Slide>

      {!isOnline && <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>🚫 Ingen internetanslutning - vissa funktioner kan vara begränsade</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
      {hasSearched && !error && filteredAvailability.length === 0 && <Typography>Inga lediga tider hittades.</Typography>}

      {/* Lediga tider - lista */}
      {hasSearched && !isLoadingAvailability && sortedFutureSlots.length > 0 && (
        <Slide direction="up" in={true} timeout={1000}>
          <Box sx={{ mt: 4, mb: 6 }}>
            <Typography variant="h5" sx={{ mb: 3, fontWeight: 600, color: theme.colors.text }}>
              Lediga tider ({sortedFutureSlots.length})
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {visibleSlots.map((slot, index) => {
                const start = new Date(slot.start);
                const end = new Date(slot.end);
                const dayName = start.toLocaleDateString('sv-SE', { weekday: 'long' });
                const dateStr = start.toLocaleDateString('sv-SE');
                const timeStr = `${start.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`;
                
                return (
                  <Fade in={true} timeout={800 + index * 100} key={index}>
                    <Card sx={{
                      borderRadius: 3,
                      boxShadow: '0 2px 8px rgba(60,64,67,.06)',
                      border: `1px solid ${theme.colors.border}`,
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: '0 8px 24px rgba(99,91,255,0.15)'
                      }
                    }}>
                      <CardContent sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <CheckCircleIcon sx={{ color: '#4caf50', fontSize: 32 }} />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 600, color: theme.colors.text, mb: 0.5 }}>
                                {dayName.charAt(0).toUpperCase() + dayName.slice(1)} {dateStr}
                              </Typography>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <AccessTimeIcon sx={{ fontSize: 16, color: theme.colors.textSecondary }} />
                                <Typography variant="body2" sx={{ color: theme.colors.textSecondary }}>
                                  {timeStr}
                                </Typography>
                              </Box>
                            </Box>
                          </Box>
                          {groupId && (
                            <Button
                              variant="contained"
                              onClick={() => handleSuggest(slot)}
                              disabled={isSubmittingSuggestion}
                              sx={{
                                borderRadius: 999,
                                px: 3,
                                fontWeight: 600,
                                background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                                '&:hover': {
                                  background: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)',
                                }
                              }}
                            >
                              Föreslå tid
                            </Button>
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  </Fade>
                );
              })}
            </Box>
            {sortedFutureSlots.length > 4 && !showAll && (
              <Box sx={{ textAlign: 'center', mt: 3 }}>
                <Button
                  variant="outlined"
                  onClick={() => setShowAll(true)}
                  sx={{ borderRadius: 999, px: 4 }}
                >
                  Visa alla {sortedFutureSlots.length} tider
                </Button>
              </Box>
            )}
          </Box>
        </Slide>
      )}

      {/* Kalendervy */}
      {hasSearched && !isLoadingAvailability && (
        <Box sx={{ mt: 4, mb: 4 }}>
          <Typography variant="h5" sx={{ mb: 3, fontWeight: 600, color: theme.colors.text }}>
            Kalendervy
          </Typography>
          <Box sx={{ height: 600, bgcolor: '#fff', borderRadius: 2, overflow: 'hidden', border: `1px solid ${theme.colors.border}` }}>
            <Calendar
              localizer={localizer}
              events={calendarEvents}
              startAccessor="start"
              endAccessor="end"
              style={{ height: '100%', fontFamily: calendarFontFamily }}
              views={['month', 'week', 'day']}
              defaultView="week"
            />
          </Box>
        </Box>
      )}

      {/* Tidsförslag-sektion */}
      {groupId && suggestions.length > 0 && (
        <Box sx={{ mt: 4, mb: 4 }}>
          <Typography variant="h5" sx={{ mb: 3, fontWeight: 600, color: theme.colors.text }}>
            Tidsförslag
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {suggestions.map((suggestion) => (
              <Card key={suggestion.id} sx={{ borderRadius: 3, border: `1px solid ${theme.colors.border}` }}>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
                    {suggestion.title || 'Tidsförslag'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {moment(suggestion.start).format('LLLL')}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="contained"
                      onClick={() => voteSuggestion(suggestion.id, 'accepted')}
                      disabled={isSubmittingSuggestion}
                    >
                      Acceptera
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => voteSuggestion(suggestion.id, 'rejected')}
                      disabled={isSubmittingSuggestion}
                    >
                      Avböj
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Box>
      )}

      {/* Dialog för att föreslå tid */}
      <Dialog open={suggestDialog.open} onClose={() => setSuggestDialog({ open: false, slot: null })} maxWidth="sm" fullWidth>
        <DialogTitle>Föreslå denna tid för möte</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Mötesbeskrivning (valfritt)"
            value={meetingTitle}
            onChange={(e) => setMeetingTitle(e.target.value)}
            sx={{ mt: 2, mb: 2 }}
          />
          <FormControl component="fieldset">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Button
                variant={withMeet ? 'contained' : 'outlined'}
                onClick={() => setWithMeet(true)}
              >
                Google Meet
              </Button>
              <Button
                variant={!withMeet ? 'contained' : 'outlined'}
                onClick={() => setWithMeet(false)}
              >
                Fysiskt möte
              </Button>
            </Box>
          </FormControl>
          {!withMeet && (
            <TextField
              fullWidth
              label="Plats"
              value={meetingLocation}
              onChange={(e) => setMeetingLocation(e.target.value)}
              placeholder="T.ex. Konferensrum A, Café City..."
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuggestDialog({ open: false, slot: null })}>
            Avbryt
          </Button>
          <Button
            variant="contained"
            onClick={confirmSuggest}
            disabled={isSubmittingSuggestion}
          >
            {isSubmittingSuggestion ? <CircularProgress size={20} /> : 'Skicka förslag'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setToast({ ...toast, open: false })} severity={toast.severity} sx={{ width: '100%', borderRadius: 2 }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
}