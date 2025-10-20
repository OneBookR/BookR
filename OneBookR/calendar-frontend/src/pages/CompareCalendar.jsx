import React, { useState, useEffect } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/sv';
import 'react-big-calendar/lib/css/react-big-calendar.css';

// Konfigurera moment för svensk tid (GMT+1)
moment.locale('sv');
import '../styles/theme.css';
import { Card, CardContent, Typography, Button, TextField, Box, Dialog, DialogTitle, DialogActions, Paper, InputAdornment, MenuItem, Select, FormControl, InputLabel, CircularProgress, Snackbar, Alert, Fade, Tooltip, Badge, Skeleton, Slide, Zoom, Grow, IconButton } from '@mui/material';
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

export default function CompareCalendar({ myToken, invitedTokens = [], user, directAccess, contactEmail, contactName, teamName }) {
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
        contactName,
        teamName,
      });
    } catch (_) {}
  }, [myToken, invitedTokens, user, directAccess, contactEmail, contactName, teamName]);

  // Validera token innan allt annat
  useEffect(() => {
    const validateToken = async () => {
      if (!myToken) {
        setIsValidatingToken(false);
        setTokenValidated(false);
        return;
      }

      try {
        // Testa token genom att göra ett enkelt API-anrop
        const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/settings/timezone', {
          headers: {
            Authorization: `Bearer ${myToken}`,
          },
        });

        if (response.status === 401) {
          console.log('Token has expired in CompareCalendar, redirecting to login...');
          
          // Spara aktuell URL för att återvända efter inloggning
          const currentUrl = window.location.href;
          localStorage.setItem('bookr_return_url', currentUrl);
          
          // Rensa användardata
          localStorage.removeItem('bookr_user');
          sessionStorage.removeItem('hasTriedSession');
          
          // Omdirigera till logout som rensar allt och sedan tillbaka till login
          setTimeout(() => {
            window.location.href = 'https://www.onebookr.se/auth/logout';
          }, 1500);
          
          setTokenValidated(false);
          setIsValidatingToken(false);
        } else {
          console.log('Token is valid in CompareCalendar');
          setTokenValidated(true);
          setIsValidatingToken(false);
        }
      } catch (error) {
        console.error('Error validating token in CompareCalendar:', error);
        setTokenValidated(false);
        setIsValidatingToken(false);
      }
    };

    validateToken();
  }, [myToken]);

  // Hämta förslag
  useEffect(() => {
    if (groupId) {
      const fetchSuggestions = () => {
        fetch(`${API_BASE_URL}/api/group/${groupId}/suggestions`)
          .then(res => res.json())
          .then((data) => {
            setSuggestions(data.suggestions || []);
            // Kontrollera om något förslag blev finalized
            const finalizedSuggestions = (data.suggestions || []).filter(s => s.finalized);
            finalizedSuggestions.forEach(s => {
              if (s.finalized && s.meetLink) {
                console.log('Möte bokat:', s.title, s.meetLink);
              }
            });
          })
          .catch(error => {
            console.error('Fel vid hämtning av tidsförslag:', error);
            setSuggestions([]);
          });
      };
      
      fetchSuggestions();
      // Poll för realtidsuppdatering (oftare för att fånga finalized status)
      const interval = setInterval(fetchSuggestions, 5000);
      return () => clearInterval(interval);
    } else {
      setSuggestions([]);
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
      
      // Kontrollera token innan hämtning
      if (!tokenValidated) {
        setToast({ 
          open: true, 
          message: 'Din session har gått ut. Logga in igen för att fortsätta.', 
          severity: 'error' 
        });
        setTimeout(() => {
          window.location.href = 'https://www.onebookr.se/auth/logout';
        }, 2000);
        return;
      }
      
      if (!isOnline) {
        setError('Ingen internetanslutning. Kontrollera din anslutning och försök igen.');
        return;
      }
      
      setIsLoadingAvailability(true);
      setHasSearched(true);
      setError(null);
      
      // För team-möten eller grupper, hämta alla tokens från gruppen
      if (groupId) {
        try {
          const groupTokensRes = await fetch(`${API_BASE_URL}/api/group/${groupId}/tokens`);
          if (groupTokensRes.ok) {
            const groupTokensData = await groupTokensRes.json();
            tokens = Array.from(new Set([...tokens, ...groupTokensData.tokens]));
          }
        } catch (err) {
          console.log('Could not fetch group tokens, using provided tokens:', err);
        }
      }
      
      tokens = Array.from(new Set(tokens.filter(Boolean)));
      
      if (tokens.length < 1) {
        setError('Minst en token krävs för att visa kalendrar.');
        setAvailability([]);
        setIsLoadingAvailability(false);
        return;
      }
      
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

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        // Anpassa API-anrop för flerdagars-möten
        // Skapa provider-array - första token är alltid den inloggade användaren
        const providers = [user.provider || 'google'];
        // För resten, anta Google som standard
        for (let i = 1; i < tokens.length; i++) {
          providers.push('google');
        }
        
        const requestBody = {
          tokens,
          providers,
          duration: meetingDuration, // Alltid i rätt enhet från input
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
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const data = await res.json();

        if (res.ok) {
          console.log('Received availability from backend:', data);
          // Säkerställ att vi endast använder de gemensamma lediga tiderna från backend
          setAvailability(Array.isArray(data) ? data : []);
          setError(null);
          setToast({ open: true, message: `Hittade ${Array.isArray(data) ? data.length : 0} lediga tider`, severity: 'success' });
        } else {
          setAvailability([]);
          setError(data.error || 'Något gick fel vid hämtning av tillgänglighet.');
        }
      } catch (err) {
        setAvailability([]);
        if (err.name === 'AbortError') {
          setError('Förfrågan tog för lång tid. Försök igen.');
        } else {
          setError(isOnline ? 'Tekniskt fel vid hämtning av tillgänglighet.' : 'Ingen internetanslutning.');
        }
      } finally {
        setIsLoadingAvailability(false);
      }
    } catch (err) {
      setAvailability([]);
      setError('Kunde inte hämta tillgänglighet. Försök igen senare.');
      setIsLoadingAvailability(false);
    }
  };

  // Filtrera så att endast tider där start < end och både start och end finns, och där slot inte överlappar med någon upptagen tid för någon deltagare
  const filteredAvailability = Array.isArray(availability)
    ? availability.filter(slot => slot && slot.start && slot.end && new Date(slot.start) < new Date(slot.end))
    : [];

  // Sortera lediga tider på starttid och filtrera framtida tider
  const now = new Date();
  const sortedFutureSlots = filteredAvailability
    .filter(slot => new Date(slot.start) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  // Visa bara 4 närmaste tider först, eller alla om showAll är true
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
        const result = await response.json();
        setSuccessAnimation('suggestion');
        setTimeout(() => setSuccessAnimation(null), 2000);
        setToast({ open: true, message: 'Tidsförslag skickat!', severity: 'success' });
        setSuggestDialog({ open: false, slot: null });
        
        // Visa notifikation
        showNotification('Tidsförslag skickat!', {
          body: `Förslag för ${new Date(suggestionData.start).toLocaleDateString()} skickat till gruppen`,
          tag: 'suggestion-sent'
        });
        
        // Undo-funktionalitet
        setUndoAction({
          type: 'suggestion',
          id: result.id,
          data: suggestionData,
          timestamp: Date.now()
        });
        
        // Ta bort undo efter 10 sekunder
        setTimeout(() => setUndoAction(null), 10000);
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
        
        // Uppdatera förslag direkt med det returnerade förslaget
        if (result.suggestion) {
          console.log('Updated suggestion received:', result.suggestion);
          setSuggestions(prev => prev.map(s => 
            s.id === suggestionId ? result.suggestion : s
          ));
        }
        
        // Hämta alla förslag igen för att säkerställa synkronisering
        if (targetGroup === groupId) {
          setTimeout(() => {
            fetch(`${API_BASE_URL}/api/group/${groupId}/suggestions`)
              .then(res => res.json())
              .then(data => setSuggestions(data.suggestions || []));
          }, 1000);
        }
        
        // Visa notifikation om mötet är bokat
        if (result.suggestion && result.suggestion.finalized) {
          showNotification('Möte bokat!', {
            body: 'Alla har accepterat tiden. Kalenderinbjudan skickas ut via mejl.',
            tag: 'meeting-booked'
          });
          
          // Visa success toast med mer information
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

  if (!user) {
    return (
      <Box sx={{ textAlign: 'center', mt: 10, px: 2 }}>
        <Typography variant="h5" gutterBottom>
          Laddar...
        </Typography>
      </Box>
    );
  }

  // Visa laddningsskärm under token-validering
  if (isValidatingToken) {
    return (
      <Box sx={{ textAlign: 'center', mt: 10, px: 2 }}>
        <Typography variant="h5" gutterBottom sx={{ color: '#0a2540', mb: 2 }}>
          Validerar din inloggning...
        </Typography>
        <Typography variant="body1" sx={{ color: '#666' }}>
          Detta tar bara några sekunder
        </Typography>
      </Box>
    );
  }

  // Visa meddelande om token är ogiltig
  if (!tokenValidated) {
    return (
      <Box sx={{ 
        textAlign: 'center', 
        mt: 10,
        px: 2,
        py: 8,
        bgcolor: '#fff3e0',
        borderRadius: 3,
        border: '2px solid #ff9800',
        maxWidth: 600,
        mx: 'auto'
      }}>
        <Typography variant="h5" gutterBottom sx={{ color: '#bf360c', mb: 2 }}>
          ⚠️ Din session har gått ut
        </Typography>
        <Typography variant="body1" sx={{ color: '#666', mb: 3 }}>
          För att kunna jämföra kalendrar behöver du logga in igen.
          Du omdirigeras automatiskt...
        </Typography>
        <Typography variant="caption" sx={{ color: '#999' }}>
          Om inget händer inom några sekunder, klicka <a href="https://www.onebookr.se/auth/logout" style={{ color: '#1976d2' }}>här</a>
        </Typography>
      </Box>
    );
  }

  // Visa enkel fallback om token saknas (efter hooks) för att undvika hook-ordningsfel
  if (!myToken) {
    return (
      <Box sx={{ textAlign: 'center', mt: 10, px: 2 }}>
        <Typography variant="h6" gutterBottom sx={{ color: '#bf360c', mb: 2 }}>
          Din session saknar åtkomsttoken
        </Typography>
        <Typography variant="body1" sx={{ color: '#666' }}>
          Logga ut och in igen.
        </Typography>
      </Box>
    );
  }

  // NYTT: Hantera klick i kalendern
  const handleCalendarSelectSlot = (slotInfo) => {
    console.log('handleCalendarSelectSlot called:', slotInfo, 'groupId:', groupId);
    if (groupId) {
      setSuggestDialog({
        open: true,
        slot: {
          start: slotInfo.start,
          end: slotInfo.end,
        }
      });
    } else {
      console.log('No groupId, cannot suggest time');
    }
  };

  // Hantera klick i kalendern (tillåt även klick på upptagna tider)
  const handleCalendarSelectEvent = (event) => {
    console.log('handleCalendarSelectEvent called:', event, 'groupId:', groupId);
    if (groupId) {
      setSuggestDialog({
        open: true,
        slot: {
          start: event.start,
          end: event.end,
        }
      });
    } else {
      console.log('No groupId, cannot suggest time');
    }
  };

  // Spara vy och datum i state för att kunna byta vy och navigera
  const [calendarView, setCalendarView] = useState('week');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [isMobile, setIsMobile] = useState(false);



  // Anpassa react-big-calendar: ta bort vy-knappar, ersätt med Select
  // --- NYTT: Anpassa kalenderns komponenter med CSS-in-JS ---
  useEffect(() => {
    const styleId = "modern-calendar-style";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    const isDark = theme.isDark;
    const calendarBgColor = isDark ? theme.colors.surface : calendarBg;
    const calendarBorderColor = isDark ? theme.colors.border : calendarBorder;
    const calendarTextColor = isDark ? theme.colors.text : '#000';
    const calendarHeaderBgColor = isDark ? theme.colors.bg : calendarHeaderBg;
    
    style.innerHTML = `
      .rbc-calendar, .rbc-time-view, .rbc-agenda-view, .rbc-month-view {
        font-family: ${calendarFontFamily} !important;
        background: ${calendarBgColor};
        border-radius: 10px;
        border: 1px solid ${calendarBorderColor};
        box-shadow: 0 2px 8px 0 rgba(60,64,67,.06);
        color: ${calendarTextColor};
      }
      .rbc-toolbar {
        font-family: ${calendarFontFamily} !important;
        background: ${calendarHeaderBgColor};
        border-bottom: 1px solid ${calendarBorderColor};
        border-radius: 10px 10px 0 0;
        padding: 10px 16px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        color: ${calendarTextColor};
      }
      /* Dölj vy-knapparna */
      .rbc-toolbar .rbc-btn-group:last-of-type {
        display: none !important;
      }
      /* Justera label så att den får plats bredvid selecten */
      .rbc-toolbar .rbc-toolbar-label {
        margin-right: 16px;
        font-size: 1.05rem;
        font-weight: 400;
        color: ${calendarAccent};
        letter-spacing: -0.5px;
        padding: 0 8px;
      }
      /* NYTT: Gör så att knapparna i grupperna inte har egen border */
      .rbc-btn-group button {
        font-family: ${calendarFontFamily} !important;
        font-size: 1.01rem;
        border-radius: 999px !important;
        border: none !important;
        background: linear-gradient(90deg, #635bff 0%, #6c47ff 100%) !important;
        color: #fff !important;
        margin-right: 8px !important;
        margin-bottom: 2px !important;
        padding: 7px 18px !important;
        font-weight: 600 !important;
        box-shadow: 0 2px 8px 0 rgba(99,91,255,0.13) !important;
        transition: background 0.2s, box-shadow 0.2s, transform 0.1s !important;
        outline: none !important;
        border-width: 0 !important;
      }
      .rbc-btn-group button:last-child {
        margin-right: 0 !important;
      }
      .rbc-btn-group button.rbc-active, .rbc-btn-group button:active {
        background: linear-gradient(90deg, #7a5af8 0%, #635bff 100%) !important;
        color: #fff !important;
        box-shadow: 0 0 0 4px #e9e5ff, 0 8px 24px 0 rgba(99,91,255,0.18) !important;
        transform: scale(1.03) !important;
      }
      .rbc-btn-group button:hover {
        background: linear-gradient(90deg, #7a5af8 0%, #635bff 100%) !important;
        color: #fff !important;
        box-shadow: 0 0 0 4px #e9e5ff, 0 8px 24px 0 rgba(99,91,255,0.18) !important;
        transform: scale(1.03) !important;
      }
      .rbc-header {
        background: ${calendarHeaderBgColor};
        color: ${calendarTextColor};
        font-weight: 400;
        font-size: 0.98rem;
        border-bottom: 1px solid ${calendarBorderColor};
        padding: 7px 0;
      }
      .rbc-today {
        background: ${calendarTodayBg} !important;
        border-bottom: 2px solid ${calendarAccent};
      }
      .rbc-event {
        background-color: #e3f2fd !important;
        color: #1976d2 !important;
        border: 1px solid #1976d2 !important;
        border-radius: 4px !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        padding: 2px 4px !important;
      }
      .rbc-event:hover {
        background-color: #bbdefb !important;
      }
      /* Speciella stilar för upptagna tider */
      .rbc-event[data-busy="true"] {
        background-color: #ffebee !important;
        border: 2px solid #f44336 !important;
        color: #d32f2f !important;
        z-index: 1000 !important;
        cursor: default !important;
      }
      .rbc-event[data-busy="true"]:hover {
        transform: none !important;
        box-shadow: 0 2px 8px 0 rgba(244, 67, 54, 0.3) !important;
      }
      /* Flerdagars events */
      .rbc-event[data-multiday="true"] {
        border-radius: 8px !important;
        font-weight: 600 !important;
        min-height: 24px !important;
      }
      .rbc-agenda-view table {
        font-family: ${calendarFontFamily} !important;
        font-size: 0.98rem;
      }
      .rbc-agenda-date-cell, .rbc-agenda-time-cell, .rbc-agenda-event-cell {
        padding: 7px 10px;
      }
      .rbc-row-segment {
        padding: 2px 0;
      }
      .rbc-time-header-content, .rbc-time-content {
        border-radius: 0 0 10px 10px;
      }
      .rbc-time-slot {
        min-height: 28px;
        position: relative;
        border-color: ${calendarBorderColor};
      }
      .rbc-time-gutter, .rbc-time-header-gutter {
        background: ${calendarHeaderBgColor};
        color: ${calendarTextColor};
      }
      .rbc-timeslot-group {
        border-bottom: 1px solid ${calendarBorderColor};
      }
      .rbc-day-slot .rbc-time-slot {
        border-top: 1px solid ${calendarBorderColor};
      }
      .rbc-time-content {
        background: ${calendarBgColor};
      }
      .rbc-time-header-content {
        background: ${calendarHeaderBgColor};
      }
      .rbc-allday-cell {
        background: ${calendarHeaderBgColor};
      }
      .rbc-day-bg {
        background: ${calendarBgColor};
      }
      .rbc-month-row {
        background: ${calendarBgColor};
      }
      .rbc-date-cell {
        color: ${calendarTextColor};
      }
      .rbc-button-link {
        color: ${calendarTextColor};
      }
      /* Förbättra visning av överlappande events */
      .rbc-event-overlaps {
        margin-left: 2px !important;
        margin-right: 2px !important;
      }
      .rbc-off-range-bg {
        background: #f4f6f8;
      }
      .rbc-show-more {
        color: ${calendarAccent};
        font-weight: 400;
      }
      /* Navigeringspilar och Today-knapp */
      .rbc-btn-group button {
        background: #f7f9fc !important;
        color: #495057 !important;
        border: 1px solid rgba(0, 0, 0, 0.23) !important;
        border-radius: 4px !important;
        font-weight: 500 !important;
        padding: 8px 16px !important;
        margin: 0 4px !important;
        transition: all 0.2s ease !important;
      }
      .rbc-btn-group button:hover {
        background: linear-gradient(90deg, #635bff 0%, #6c47ff 100%) !important;
        color: #fff !important;
        border-color: #635bff !important;
        transform: translateY(-1px) !important;
        box-shadow: 0 2px 8px rgba(99,91,255,0.2) !important;
      }
      .rbc-btn-group button:active {
        transform: translateY(0) !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (document.getElementById(styleId)) {
        document.getElementById(styleId).remove();
      }
    };
  }, [theme.isDark]);

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
      // Kör fetchAvailability automatiskt
      setTimeout(() => {
        fetchAvailabilityAuto(start, end);
      }, 0);
    }
    // eslint-disable-next-line
  }, [myToken]);

  // Separat fetch-funktion för auto-laddning (utan validering)
  const fetchAvailabilityAuto = async (start, end) => {
    let tokens = [myToken, ...invitedTokens];
    
    // För team-möten eller grupper, hämta alla tokens från gruppen
    if (groupId) {
      try {
        const groupTokensRes = await fetch(`${API_BASE_URL}/api/group/${groupId}/tokens`);
        if (groupTokensRes.ok) {
          const groupTokensData = await groupTokensRes.json();
          tokens = Array.from(new Set([...tokens, ...groupTokensData.tokens]));
        }
      } catch (err) {
        console.log('Could not fetch group tokens for auto-load:', err);
      }
    }
    
    tokens = Array.from(new Set(tokens.filter(Boolean)));
    if (tokens.length < 1) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/availability`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokens,
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          duration: meetingDuration,
          dayStart,
          dayEnd,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAvailability(data);
        setError(null);
        setHasSearched(true);
      } else {
        setAvailability([]);
        setError(data.error || 'Något gick fel vid hämtning av tillgänglighet.');
        setHasSearched(true);
      }
    } catch (err) {
      setAvailability([]);
      setError('Tekniskt fel vid hämtning av tillgänglighet.');
      setHasSearched(true);
    }
  };

  // Logga ut-funktion
  const handleLogout = () => {
    window.location.href = `${API_BASE_URL}/auth/logout`;
  };

  // Logga in-funktion
  const handleLogin = () => {
    window.location.href = `${API_BASE_URL}/auth/google?redirect=` + encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
  };

  // Tutorial-steg
  const tutorialSteps = [
    {
      target: '[data-tutorial="date-inputs"]',
      title: 'Välj datumintervall',
      content: 'Ange från vilket datum till vilket datum du vill hitta lediga tider. Om du lämnar tomt visas automatiskt de närmaste 30 dagarna.'
    },
    {
      target: '[data-tutorial="duration"]',
      title: 'Mötestid',
      content: 'Ange hur lång tid mötet ska vara i minuter. Standard är 60 minuter.'
    },
    {
      target: '[data-tutorial="day-hours"]',
      title: 'Arbetstider',
      content: 'Ställ in vilka tider på dagen som ska räknas som arbetstid. Endast lediga tider inom detta intervall visas.'
    },
    {
      target: '[data-tutorial="compare-button"]',
      title: 'Jämför kalendrar',
      content: 'Klicka här för att jämföra alla inbjudna personers kalendrar och hitta gemensamma lediga tider.'
    },
    {
      target: '[data-tutorial="time-slots"]',
      title: 'Lediga tider',
      content: 'Här visas alla gemensamma lediga tider. Klicka på en tid för att föreslå den som mötestid till gruppen.'
    },
    {
      target: '[data-tutorial="calendar"]',
      title: 'Kalendervy',
      content: 'Se alla lediga tider i kalenderformat. Klicka på en ledig tid för att föreslå den som mötestid.'
    }
  ];

  const nextTutorialStep = () => {
    if (tutorialStep < tutorialSteps.length - 1) {
      setTutorialStep(tutorialStep + 1);
      // Scrolla till nästa element efter en kort fördröjning
      setTimeout(() => {
        const nextStep = tutorialSteps[tutorialStep + 1];
        const targetElement = document.querySelector(nextStep.target);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } else {
      closeTutorial();
    }
  };

  const closeTutorial = () => {
    setShowTutorial(false);
    setTutorialStep(-1);
  };

  // Scrolla till första elementet när tutorial startar
  React.useEffect(() => {
    if (showTutorial && tutorialStep === 0) {
      const targetElement = document.querySelector(tutorialSteps[0].target);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [showTutorial, tutorialStep]);

  // Mobildetektering och offline/online hantering
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setCalendarView('agenda');
        setSidebarOpen(false);
      } else {
        setCalendarView('week');
        setSidebarOpen(false);
      }
    };
    
    checkMobile();
    
    const handleResize = () => checkMobile();
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSuggestDialog({ open: false, slot: null });
        setSidebarOpen(false);
      }
      if (e.key === 'Enter' && e.ctrlKey && suggestDialog.open) {
        confirmSuggest();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [suggestDialog.open]);

  // Hämta inbjudningar och tidsförslag
  useEffect(() => {
    if (user) {
      fetchInvitations();
      fetchTimeProposals();
      
      // Poll för uppdateringar var 30:e sekund
      const interval = setInterval(() => {
        if (isOnline) {
          const prevInvitations = invitations.length;
          const prevProposals = timeProposals.length;
          
          fetchInvitations().then(() => {
            if (invitations.length > prevInvitations) {
              showNotification('Ny inbjudan!', {
                body: 'Du har fått en ny kalenderjämförelse-inbjudan',
                tag: 'new-invitation'
              });
            }
          });
          
          fetchTimeProposals().then(() => {
            if (timeProposals.length > prevProposals) {
              showNotification('Nytt tidsförslag!', {
                body: 'Du har fått ett nytt tidsförslag att rösta på',
                tag: 'new-proposal'
              });
            }
          });
        }
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [user, isOnline, invitations.length, timeProposals.length, showNotification]);

  const fetchInvitations = async () => {
    try {
      const userEmail = user.email || user.emails?.[0]?.value || user.emails?.[0];
      if (!userEmail) return;
      
      const response = await fetch(`${API_BASE_URL}/api/invitations/${encodeURIComponent(userEmail)}`);
      if (response.ok) {
        const data = await response.json();
        setInvitations(data.invitations.filter(inv => !inv.responded));
      }
    } catch (error) {
      console.error('Fel vid hämtning av inbjudningar:', error);
    }
  };

  const fetchTimeProposals = async () => {
    try {
      const userEmail = user.email || user.emails?.[0]?.value || user.emails?.[0];
      if (!userEmail) return;
      
      const invitationsResponse = await fetch(`${API_BASE_URL}/api/invitations/${encodeURIComponent(userEmail)}`);
      if (invitationsResponse.ok) {
        const invitationsData = await invitationsResponse.json();
        const allProposals = [];
        
        for (const invitation of invitationsData.invitations) {
          if (invitation.accepted || invitation.responded) {
            const suggestionsResponse = await fetch(`${API_BASE_URL}/api/group/${invitation.groupId}/suggestions`);
            if (suggestionsResponse.ok) {
              const suggestionsData = await suggestionsResponse.json();
              const userSuggestions = suggestionsData.suggestions.filter(s => 
                !s.votes[userEmail] && !s.finalized
              );
              allProposals.push(...userSuggestions.map(s => ({...s, groupId: invitation.groupId})));
            }
          }
        }
        
        setTimeProposals(allProposals);
      }
    } catch (error) {
      console.error('Fel vid hämtning av tidsförslag:', error);
    }
  };

  const handleInvitationResponse = async (invitationId, response) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/invitation/${invitationId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response })
      });
      if (res.ok) {
        if (response === 'accept') {
          const invitation = invitations.find(inv => inv.id === invitationId);
          if (invitation) {
            window.location.href = `/compare?group=${invitation.groupId}`;
          }
        } else {
          fetchInvitations(); // Uppdatera listan
          setToast({ open: true, message: 'Inbjudan nekad', severity: 'info' });
        }
      }
    } catch (error) {
      setToast({ open: true, message: 'Kunde inte svara på inbjudan', severity: 'error' });
    }
  };

  const handleProposalResponse = async (proposalId, response) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/proposal/${proposalId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          response,
          email: user.email || user.emails?.[0]?.value || user.emails?.[0]
        })
      });
      if (res.ok) {
        fetchTimeProposals(); // Uppdatera listan
        const responseText = response === 'accept' ? 'accepterat' : 'nekat';
        setToast({ open: true, message: `Tidsförslag ${responseText}`, severity: 'success' });
      }
    } catch (error) {
      setToast({ open: true, message: 'Kunde inte svara på tidsförslag', severity: 'error' });
    }
  };



  return (
    <>
      <div style={{ 
        marginRight: isMobile ? 0 : (sidebarOpen ? 400 : 60), 
        transition: 'margin-right 0.3s ease',
        minHeight: '100vh',
        padding: isMobile ? '8px' : '0'
      }}>


        <Slide direction="up" in={true} timeout={800}>
          <Box
            sx={{
              bgcolor: theme.colors.surface,
              borderRadius: { xs: 2, sm: 3 },
              boxShadow: theme.isDark ? '0 4px 20px rgba(0,0,0,0.3)' : '0 2px 8px rgba(60,64,67,.06)',
              border: `1px solid ${theme.colors.border}`,
              p: { xs: 2, sm: 3 },
              mb: { xs: 8, sm: 15 },
              maxWidth: { xs: '100%', sm: 800 },
              mx: 0,
              transition: 'all 0.3s ease'
            }}
          >
          <Box
            component="form"
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              mb: 0,
              maxWidth: 600,
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }} data-tutorial="date-inputs">
              <Box sx={{ flex: 1, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', gap: 1, width: '100%' }}>
                <TextField
                  label="Från"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  value={timeMin ? timeMin.slice(0, 10) : ''}
                  onChange={e => {
                    const date = e.target.value;
                    const time = timeMin ? timeMin.slice(11, 16) : '00:00';
                    setTimeMin(date ? `${date}T${time}` : '');
                  }}
                  fullWidth
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 999,
                      background: theme.colors.bg,
                      color: theme.colors.text,
                      '& fieldset': {
                        borderColor: theme.colors.border
                      }
                    },
                    '& .MuiInputBase-root': {
                      borderRadius: 999,
                    },
                    '& .MuiInputLabel-root': {
                      color: theme.colors.textSecondary
                    }
                  }}
                  variant="outlined"
                />
                <TextField
                  label="Tid"
                  type="time"
                  InputLabelProps={{ shrink: true }}
                  value={timeMin ? timeMin.slice(11, 16) : ''}
                  onChange={e => {
                    if (timeMin) {
                      setTimeMin(timeMin.slice(0, 10) + 'T' + e.target.value);
                    }
                  }}
                  sx={{
                    minWidth: 120,
                    maxWidth: 160,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 999,
                      background: theme.colors.bg,
                      color: theme.colors.text,
                      '& fieldset': {
                        borderColor: theme.colors.border
                      }
                    },
                    '& .MuiInputBase-root': {
                      borderRadius: 999,
                    },
                    '& .MuiInputLabel-root': {
                      color: theme.colors.textSecondary
                    }
                  }}
                  variant="outlined"
                />
              </Box>
              <Typography sx={{ mx: 1, fontWeight: 600, color: '#888', fontSize: 22, userSelect: 'none', display: { xs: 'none', sm: 'block' } }}>–</Typography>
              <Box sx={{ flex: 1, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', gap: 1, width: '100%' }}>
                <TextField
                  label="Till"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  value={timeMax ? timeMax.slice(0, 10) : ''}
                  onChange={e => {
                    const date = e.target.value;
                    const time = timeMax ? timeMax.slice(11, 16) : '23:59';
                    setTimeMax(date ? `${date}T${time}` : '');
                  }}
                  fullWidth
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 999,
                      background: theme.colors.bg,
                      color: theme.colors.text,
                      '& fieldset': {
                        borderColor: theme.colors.border
                      }
                    },
                    '& .MuiInputBase-root': {
                      borderRadius: 999,
                    },
                    '& .MuiInputLabel-root': {
                      color: theme.colors.textSecondary
                    }
                  }}
                  variant="outlined"
                />
                <TextField
                  label="Tid"
                  type="time"
                  InputLabelProps={{ shrink: true }}
                  value={timeMax ? timeMax.slice(11, 16) : ''}
                  onChange={e => {
                    if (timeMax) {
                      setTimeMax(timeMax.slice(0, 10) + 'T' + e.target.value);
                    }
                  }}
                  sx={{
                    minWidth: 120,
                    maxWidth: 160,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 999,
                      background: theme.colors.bg,
                      color: theme.colors.text,
                      '& fieldset': {
                        borderColor: theme.colors.border
                      }
                    },
                    '& .MuiInputBase-root': {
                      borderRadius: 999,
                    },
                    '& .MuiInputLabel-root': {
                      color: theme.colors.textSecondary
                    }
                  }}
                  variant="outlined"
                />
              </Box>
            </Box>
            <Typography
              variant="caption"
              sx={{
                color: '#888',
                mb: 0.3,
                mt: 2,
                pl: 1.0 // Flytta texten lite till höger
              }}
            >
              Om du inte anger något datumintervall visas automatiskt alla lediga tider från idag och 30 dagar framåt.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, gap: 2, mt: 1 }}>
              <TextField
                label={isMultiDay ? "Timmar per dag" : "Mötestid (minuter)"}
                type="number"
                value={meetingDuration}
                onChange={(e) => setMeetingDuration(Number(e.target.value))}
                data-tutorial="duration"
                sx={{
                  flex: 1,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 999,
                    background: theme.colors.bg,
                    color: theme.colors.text,
                    '& fieldset': {
                      borderColor: theme.colors.border
                    }
                  },
                  '& .MuiInputBase-root': {
                    borderRadius: 999,
                  },
                  '& .MuiInputLabel-root': {
                    color: theme.colors.textSecondary
                  }
                }}
                variant="outlined"
              />
              <Button
                variant={isMultiDay ? "contained" : "outlined"}
                onClick={() => setIsMultiDay(!isMultiDay)}
                sx={{
                  borderRadius: 999,
                  px: 3,
                  fontWeight: 600,
                  fontSize: 12
                }}
              >
                Flera dagar
              </Button>
            </Box>
            
            {isMultiDay && (
              <Box sx={{ mt: 2, p: 2, bgcolor: '#e3f2fd', borderRadius: 2, border: '1px solid #1976d2' }}>
                <Typography variant="body2" sx={{ mb: 2, fontWeight: 600, color: '#1976d2' }}>
                  Flerdagars-möte
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <TextField
                    label="Startdatum"
                    type="date"
                    value={multiDayStart}
                    onChange={e => setMultiDayStart(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{
                      flex: 1,
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 999,
                        background: '#fff',
                      },
                    }}
                  />
                  <Typography sx={{ color: '#1976d2', fontWeight: 600 }}>–</Typography>
                  <TextField
                    label="Slutdatum"
                    type="date"
                    value={multiDayEnd}
                    onChange={e => setMultiDayEnd(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{
                      flex: 1,
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 999,
                        background: '#fff',
                      },
                    }}
                  />
                </Box>
                <Typography variant="caption" sx={{ color: '#666', mt: 1, display: 'block' }}>
                  Ange hur många timmar per dag mötet ska vara och välj datumintervall
                </Typography>
              </Box>
            )}
            <TextField
              label="Från (dagens starttid)"
              type="time"
              value={dayStart}
              onChange={e => setDayStart(e.target.value)}
              InputLabelProps={{ shrink: true }}
              data-tutorial="day-hours"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 999,
                  background: theme.colors.bg,
                  color: theme.colors.text,
                  '& fieldset': {
                    borderColor: theme.colors.border
                  }
                },
                '& .MuiInputBase-root': {
                  borderRadius: 999,
                },
                '& .MuiInputLabel-root': {
                  color: theme.colors.textSecondary
                }
              }}
              variant="outlined"
            />
            <TextField
              label="Till (dagens sluttid)"
              type="time"
              value={dayEnd}
              onChange={e => setDayEnd(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 999,
                  background: theme.colors.bg,
                  color: theme.colors.text,
                  '& fieldset': {
                    borderColor: theme.colors.border
                  }
                },
                '& .MuiInputBase-root': {
                  borderRadius: 999,
                },
                '& .MuiInputLabel-root': {
                  color: theme.colors.textSecondary
                }
              }}
              variant="outlined"
            />
            <Button
              variant="contained"
              color="primary"
              onClick={fetchAvailability}
              disabled={isLoadingAvailability}
              data-tutorial="compare-button"
              sx={{
                fontWeight: 600,
                fontSize: '1.08rem',
                letterSpacing: 0.5,
                borderRadius: 999,
                minWidth: 0,
                minHeight: 0,
                height: 48,
                width: '100%',
                background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                color: '#fff',
                boxShadow: '0 2px 8px 0 rgba(99,91,255,0.13)',
                transition: 'background 0.2s, box-shadow 0.2s, transform 0.1s',
                '&:hover': {
                  background: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)',
                  boxShadow: '0 0 0 4px #e9e5ff, 0 8px 24px 0 rgba(99,91,255,0.18)',
                  transform: 'scale(1.03)',
                },
                '&:active': {
                  background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                  boxShadow: '0 0 0 2px #bcb8ff, 0 2px 8px 0 rgba(99,91,255,0.13)',
                  transform: 'scale(0.98)',
                },
                '&:disabled': {
                  background: '#ccc',
                  transform: 'none',
                  boxShadow: 'none'
                },
                py: 1.2,
                mt: 1,
                mb: 3,
                textTransform: 'none',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 1
              }}
            >
              {isLoadingAvailability && <CircularProgress size={20} sx={{ color: 'white' }} />}
              {isLoadingAvailability ? 'Jämför kalendrar...' : 'Jämför kalendrar'}
              {!isOnline && ' (Offline)'}
            </Button>
          </Box>
          </Box>
        </Slide>

        {/* Offline indikator */}
        {!isOnline && (
          <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
            🚫 Ingen internetanslutning - vissa funktioner kan vara begränsade
          </Alert>
        )}
        
        {/* Undo-knapp */}
        {undoAction && (
          <Alert 
            severity="info" 
            sx={{ mb: 2, borderRadius: 2 }}
            action={
              <Button 
                color="inherit" 
                size="small" 
                onClick={() => {
                  // Implementera undo-logik här
                  setUndoAction(null);
                  setToast({ open: true, message: 'Tidsförslag ångrat', severity: 'info' });
                }}
              >
                ÅNGRA
              </Button>
            }
          >
            Tidsförslag skickat - du kan ångra inom 10 sekunder
          </Alert>
        )}
        
        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
            {error}
          </Alert>
        )}
        {hasSearched && !error && filteredAvailability.length === 0 && (
          <Typography>Inga lediga tider hittades.</Typography>
        )}

        {/* Närmaste lediga tider */}
        {isLoadingAvailability && hasSearched && <TimeSlotSkeleton />}
        {sortedFutureSlots.length > 0 && !isLoadingAvailability && (
          <Box sx={{ mb: 4, maxWidth: { xs: '100%', md: 1200 }, margin: '0 auto', width: { xs: '100%', md: '105%' }, mt: 4 }} data-tutorial="time-slots">
            <Typography variant="h6" sx={{ mb: 2 }}>
              Närmaste lediga tider
          </Typography>
          <Box sx={{
            display: { xs: 'none', lg: 'flex' },
            flexDirection: 'row',
            alignItems: 'center',
            fontWeight: 600,
            color: '#555',
            mb: 1,
            pl: 2,
          }}>
            <Typography sx={{ minWidth: 90, mr: 2 }}>
              Tid till mötet
            </Typography>
            <Typography sx={{ minWidth: 140 }}>
              Datum
            </Typography>
            <Typography sx={{ minWidth: 160 }}>
              Tid
            </Typography>
            <Typography sx={{ minWidth: 110 }}>
              Längd
            </Typography>
            <Typography sx={{ minWidth: 120 }}>
              Dag
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              width: '100%',
              ...(showAll
                ? {
                    maxHeight: 8 * 64,
                    overflowY: 'auto',
                    borderRadius: 0,
                    border: 'none',
                    boxShadow: 'none',
                    bgcolor: 'transparent',
                    overflowX: 'hidden',
                    py: 1,
                  }
                : {}),
            }}
          >
            {(showAll ? sortedFutureSlots : visibleSlots).map((slot, index) => {
              const start = new Date(slot.start);
              const end = new Date(slot.end);
              const durationMinutes = Math.round((end - start) / 60000);
              const weekday = start.toLocaleDateString('sv-SE', { weekday: 'long' });
              
              // Specialhantering för flerdagars-möten
              const isMultiDaySlot = slot.isMultiDay || (end.getDate() !== start.getDate());
              const dayCount = isMultiDaySlot ? Math.ceil((new Date(slot.multiDayEnd || end) - new Date(slot.multiDayStart || start)) / (1000 * 60 * 60 * 24)) : 1;
              
              // Beräkna arbetstimmar per dag baserat på dayStart och dayEnd
              let actualDurationPerDay = slot.durationPerDay || Math.round(durationMinutes/60);
              if (isMultiDaySlot && slot.dayStart && slot.dayEnd) {
                const [startHour, startMin] = slot.dayStart.split(':').map(Number);
                const [endHour, endMin] = slot.dayEnd.split(':').map(Number);
                const startMinutes = startHour * 60 + startMin;
                const endMinutes = endHour * 60 + endMin;
                actualDurationPerDay = (endMinutes - startMinutes) / 60;
              }

              // Beräkna tid till start och färgkodning
              const nowTime = new Date();
              const diffMs = start - nowTime;
              let timeToStart = '';
              let urgencyColor = '#1976d2';
              let bgColor = '#f5f5f5';
              
              if (diffMs < 0) {
                timeToStart = 'Nu';
                urgencyColor = '#d32f2f';
                bgColor = '#ffebee';
              } else {
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                
                if (diffMs < 1000 * 60 * 60 * 24) { // Inom 24h
                  urgencyColor = '#ff9800';
                  bgColor = '#fff3e0';
                } else if (diffMs < 1000 * 60 * 60 * 24 * 3) { // Inom 3 dagar
                  urgencyColor = '#4caf50';
                  bgColor = '#f1f8e9';
                }
                
                if (diffMs < 1000 * 60 * 60 * 48) {
                  const hours = Math.floor(diffMs / (1000 * 60 * 60));
                  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                  if (hours > 0) {
                    timeToStart = `${hours} h${minutes > 0 ? ` ${minutes} min` : ''}`;
                  } else {
                    timeToStart = `${minutes} min`;
                  }
                } else {
                  timeToStart = `${diffDays} dagar`;
                }
              }

              return (
                <Grow 
                  in={true} 
                  timeout={300 + index * 100}
                  key={index}
                >
                  <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    bgcolor: theme.colors.surface,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: 2,
                    p: { xs: 2, sm: 2.5 },
                    minHeight: 'auto',
                    width: showAll ? 'calc(100% - 16px)' : '100%',
                    marginLeft: showAll ? '8px' : 0,
                    marginRight: showAll ? '8px' : 0,
                    cursor: groupId ? 'pointer' : 'default',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': groupId ? { 
                      bgcolor: theme.isDark ? '#2a2a2a' : '#e0f2f1',
                      transform: { xs: 'none', sm: 'translateY(-2px)' },
                      boxShadow: theme.isDark ? '0 4px 15px rgba(0,0,0,0.4)' : '0 4px 15px rgba(0,0,0,0.15)'
                    } : {},
                    gap: 1
                  }}
                  onClick={groupId ? () => handleSuggest(slot) : undefined}
                >
                  {/* Mobil layout */}
                  <Box sx={{ display: 'block' }}>
                    <Typography sx={{ fontWeight: 700, color: '#1976d2', fontSize: 16, mb: 1 }}>
                      {isMultiDaySlot ? 
                        `${new Date(slot.multiDayStart || start).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' })} - ${new Date(slot.multiDayEnd || end).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' })}` :
                        start.toLocaleDateString('sv-SE', { weekday: 'short', month: 'short', day: 'numeric' })
                      }
                    </Typography>
                    <Typography sx={{ fontWeight: 600, fontSize: 18, mb: 1 }}>
                      {isMultiDaySlot ? 
                        `${dayCount} dagar (${Math.round(actualDurationPerDay)} h/dag, ${Math.round(dayCount * actualDurationPerDay)} h totalt)` :
                        `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      }
                    </Typography>
                    {isMultiDaySlot && slot.dayStart && slot.dayEnd && (
                      <Typography sx={{ color: '#1976d2', fontSize: 14, mb: 1, fontWeight: 500 }}>
                        Arbetstid: {slot.dayStart} - {slot.dayEnd} varje dag
                      </Typography>
                    )}
                    {isMultiDaySlot && slot.multiDayStart && slot.multiDayEnd && (
                      <Typography sx={{ color: '#666', fontSize: 14, mb: 1 }}>
                        {new Date(slot.multiDayStart).toLocaleDateString('sv-SE')} - {new Date(slot.multiDayEnd).toLocaleDateString('sv-SE')}
                      </Typography>
                    )}
                    <Typography sx={{ color: '#666', fontSize: 14 }}>
                      {timeToStart} • {isMultiDaySlot ? `${Math.round(actualDurationPerDay)} h/dag, ${Math.round(dayCount * actualDurationPerDay)} h totalt` : `${durationMinutes} min`}
                      {slot.busyTimes && slot.busyTimes.length > 0 && (
                        <span style={{ color: '#d32f2f', fontWeight: 600 }}>
                          {' '}• {slot.busyTimes.length} upptagna tider
                        </span>
                      )}
                    </Typography>
                  </Box>

                  {groupId && (
                    <Button
                      variant="outlined"
                      color="primary"
                      size="small"
                      fullWidth
                      sx={{ 
                        mt: 2,
                        transition: 'all 0.2s ease',
                        animation: index === 0 && diffMs < 1000 * 60 * 60 * 24 ? 'pulse 2s infinite' : 'none',
                        '@keyframes pulse': {
                          '0%': { boxShadow: '0 0 0 0 rgba(25, 118, 210, 0.4)' },
                          '70%': { boxShadow: '0 0 0 10px rgba(25, 118, 210, 0)' },
                          '100%': { boxShadow: '0 0 0 0 rgba(25, 118, 210, 0)' }
                        },
                        '&:hover': {
                          transform: { xs: 'none', sm: 'scale(1.02)' },
                          boxShadow: '0 2px 8px rgba(25, 118, 210, 0.3)'
                        }
                      }}
                      onClick={e => {
                        e.stopPropagation();
                        handleSuggest(slot);
                      }}
                    >
                      Föreslå denna tiden
                    </Button>
                  )}
                  </Box>
                </Grow>
              );
            })}
          </Box>
          {!showAll && sortedFutureSlots.length > 4 && (
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Button variant="outlined" onClick={() => setShowAll(true)}>
                Visa alla tider ({sortedFutureSlots.length})
              </Button>
            </Box>
          )}
          {showAll && sortedFutureSlots.length > 4 && (
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Button variant="outlined" onClick={() => setShowAll(false)}>
                Visa bara de 4 närmaste tiderna
              </Button>
            </Box>
          )}
        </Box>
      )}

      {/* Föreslagna tider */}
      {groupId && (
        <Box sx={{
          mb: 3,
          maxWidth: 900,
          margin: '0 auto',
          width: '100%',
          px: 0,
          pt: 2,
          pb: 3,
        }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Föreslagna tider
          </Typography>
          {suggestions.length === 0 && !isLoadingAvailability && (
            <Typography variant="body2" color="text.secondary">Inga tider föreslagna ännu.</Typography>
          )}
          {isLoadingAvailability && <SuggestionSkeleton />}
          {suggestions.map(s => {
            // Hämta alla e-postadresser i gruppen (invited + creator)
            const allEmails =
              (s.votes
                ? Object.keys(s.votes)
                : []
              )
                .concat(
                  (window.groupStatus && window.groupStatus.invited) ? window.groupStatus.invited : []
                )
                .concat(user.email ? [user.email] : [])
                .filter((v, i, arr) => arr.indexOf(v) === i);

            // Om groupStatus finns, använd den för invited-listan
            let groupInvited = [];
            if (window.groupStatus && window.groupStatus.invited) {
              groupInvited = window.groupStatus.invited;
            }

            // Lista på alla som är med i gruppen (invited + creator)
            let groupAll = [];
            if (window.groupStatus && window.groupStatus.invited) {
              groupAll = [window.groupStatus.invited, window.groupStatus.joined].flat();
            }

            // Försök att använda groupStatus från Dashboard om tillgänglig
            let emailsInGroup = [];
            if (window.groupStatus && window.groupStatus.invited) {
              emailsInGroup = [window.groupStatus.creator, ...window.groupStatus.invited].filter(Boolean);
            } else if (groupInvited.length > 0) {
              emailsInGroup = groupInvited;
            } else if (allEmails.length > 0) {
              emailsInGroup = allEmails;
            }

            // Lista på de som inte har svarat
            const notAnswered = emailsInGroup.filter(
              email => !(s.votes && s.votes[email])
            );

            return (
              <Fade in={true} timeout={800}>
                <Card
                  key={s.id}
                  sx={{
                    mb: 3,
                    borderRadius: 3,
                    border: s.finalized ? '2px solid #4caf50' : '1px solid #e0e3e7',
                    boxShadow: s.finalized ? '0 4px 20px rgba(76, 175, 80, 0.15)' : '0 2px 8px rgba(60,64,67,.06)',
                    background: s.finalized ? 'linear-gradient(135deg, #f8fff8 0%, #e8f5e8 100%)' : '#fff',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: s.finalized ? '0 8px 32px rgba(76, 175, 80, 0.25)' : '0 8px 24px rgba(0,0,0,0.15)'
                    }
                  }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom sx={{
                    fontWeight: 600,
                    color: s.finalized ? '#2e7d32' : '#0a2540',
                    fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
                    fontSize: 18
                  }}>
                    {s.title || 'Föreslaget möte'}
                  </Typography>
                  {s.isMultiDay ? (
                    <>
                      <Typography variant="body1" sx={{
                        color: '#425466',
                        mb: 2,
                        fontWeight: 500,
                        fontSize: 15
                      }}>
                        Flerdagars möte: {new Date(s.multiDayStart).toLocaleDateString('sv-SE')} - {new Date(s.multiDayEnd).toLocaleDateString('sv-SE')}
                      </Typography>
                      <Typography variant="body1" sx={{
                        color: '#1976d2',
                        fontWeight: 600,
                        fontSize: 16,
                        mb: 1
                      }}>
                        {s.dayStart && s.dayEnd && s.multiDayStart && s.multiDayEnd ? (() => {
                          const [startHour, startMin] = s.dayStart.split(':').map(Number);
                          const [endHour, endMin] = s.dayEnd.split(':').map(Number);
                          const hoursPerDay = (endHour * 60 + endMin - startHour * 60 - startMin) / 60;
                          const days = Math.ceil((new Date(s.multiDayEnd) - new Date(s.multiDayStart)) / (1000 * 60 * 60 * 24));
                          return `${days * hoursPerDay} timmar totalt`;
                        })() : `${Math.ceil((new Date(s.multiDayEnd) - new Date(s.multiDayStart)) / (1000 * 60 * 60 * 24)) * (s.durationPerDay ||  0)} timmar totalt`}
                      </Typography>
                      <Typography variant="body2" sx={{
                        color: '#666',
                        fontWeight: 500,
                        fontSize: 14,
                        mb: 2
                      }}>
                        Arbetstid: {s.dayStart} - {s.dayEnd} varje dag
                      </Typography>
                    </>
                  ) : (
                    <>
                      <Typography variant="body1" sx={{
                        color: '#425466',
                        mb: 2,
                        fontWeight: 500,
                        fontSize: 15
                      }}>
                        {new Date(s.start).toLocaleDateString('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </Typography>
                      <Typography variant="body1" sx={{
                        color: '#1976d2',
                        fontWeight: 600,
                        fontSize: 16,
                        mb: 2
                      }}>
                        {new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(s.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Typography>
                    </>
                  )}
                  {s.finalized ? (
                    <Box sx={{
                      bgcolor: 'rgba(76, 175, 80,  0.08)',
                      border: '1px solid rgba(76, 175, 80, 0.3)',
                      borderRadius: 3,
                      p: 3,
                      mt: 2,
                    }}>
                      <Typography sx={{
                        color: '#2e7d32',
                        fontWeight: 700,
                        mb: 2,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        fontSize: 16
                      }}>
                        <span style={{
                          fontSize: 24,
                          marginRight: 8,
                        }}>🎉</span>
                        Mötet är bokat!
                      </Typography>
                      <Typography sx={{ color: '#1b5e20', fontWeight: 500, mb: 2, fontSize: 14 }}>
                        Alla har accepterat tiden. Kalenderinbjudan och möteslänk skickas ut via mejl.
                      </Typography>
                      {s.withMeet && s.meetLink && (
                        <Box sx={{
                          bgcolor: '#fff',
                          border: '1px solid #e0e3e7',
                          borderRadius: 2,
                          p: 2,
                          mt: 2
                        }}>
                          <Typography sx={{ color: '#1976d2', fontWeight: 600, mb: 1, fontSize: 14 }}>
                            Google Meet-länk:
                          </Typography>
                          <Typography sx={{
                            wordBreak: 'break-all',
                            fontSize: 13,
                            fontFamily: 'monospace',
                            bgcolor: '#f5f5f5',
                            p: 1,
                            borderRadius: 1
                          }}>
                            <a
                              href={s.meetLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#1976d2', textDecoration: 'none' }}
                            >
                              {s.meetLink}
                            </a>
                          </Typography>
                        </Box>
                      )}
                      {!s.withMeet && s.location && (
                        <Typography sx={{ color: '#666', fontWeight: 500, mt: 2, fontSize: 14 }}>
                          📍 Plats: {s.location}
                        </Typography>
                      )}
                    </Box>
                  ) : (
                    <>
                      {!s.withMeet && s.location && (
                        <Typography sx={{ color: '#666', fontWeight: 500, mb: 2, fontSize: 14 }}>
                          📍 Plats: {s.location}
                        </Typography>
                      )}
                      <Box sx={{ mt: 2 }}>
                        {Object.entries(s.votes || {}).map(([email, vote]) => (
                          <Typography key={email} variant="body2" sx={{
                            mb: 0.5,
                            color: vote === 'accepted' ? '#2e7d32' : vote === 'declined' ? '#d32f2f' : '#666',
                            fontWeight: 500
                          }}>
                            {vote === 'accepted' ? '✅' : vote === 'declined' ? '❌' : '⏳'} {email}
                          </Typography>
                        ))}
                        {notAnswered.length > 0 && (
                          <Box sx={{ mt: 2, p: 2, bgcolor: theme.isDark ? '#2d2d00' : '#fff3e0', borderRadius: 2, border: `1px solid ${theme.colors.warning}` }}>
                            <Typography variant="body2" sx={{ color: theme.colors.warning, fontWeight: 600, mb: 1 }}>
                              ⏳ Väntar på svar från:
                            </Typography>
                            {notAnswered.map(email => (
                              <Typography key={email} variant="body2" sx={{ color: theme.isDark ? '#ffab40' : '#bf360c', ml: 1 }}>
                                • {email}
                              </Typography>
                            ))}
                          </Box>
                        )}
                        {!s.votes?.[user.email] && (
                          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                            <Zoom in={true} timeout={300}>
                              <Button
                                size="medium"
                                variant="contained"
                                className={successAnimation === 'vote' ? 'success-animation' : ''}
                                sx={{
                                  bgcolor: theme.colors.success,
                                  '&:hover': { 
                                    bgcolor: theme.isDark ? '#66bb6a' : '#45a049',
                                    transform: 'scale(1.08) translateY(-2px)',
                                    boxShadow: '0 6px 20px rgba(76, 175, 80, 0.3)'
                                  },
                                  fontWeight: 600,
                                  px: 3,
                                  borderRadius: 2,
                                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                }}
                                onClick={() => {
                                  setSuccessAnimation('vote');
                                  setTimeout(() => setSuccessAnimation(null), 600);
                                  voteSuggestion(s.id, 'accepted');
                                }}
                              >
                                ✅ Acceptera
                              </Button>
                            </Zoom>
                            <Button
                              size="medium"
                              variant="outlined"
                              sx={{
                                borderColor: theme.colors.error,
                                color: theme.colors.error,
                                '&:hover': { 
                                  bgcolor: theme.isDark ? '#2d1b1b' : '#ffebee', 
                                  borderColor: theme.isDark ? '#f48fb1' : '#d32f2f',
                                  transform: 'scale(1.08) translateY(-2px)',
                                  boxShadow: '0 6px 20px rgba(244, 67, 54, 0.3)'
                                },
                                fontWeight: 600,
                                px: 3,
                                borderRadius: 2,
                                transition: 'all 0.2s ease'
                              }}
                              onClick={() => voteSuggestion(s.id, 'declined')}
                            >
                              ❌ Neka
                            </Button>
                          </Box>
                        )}
                        {s.fromEmail === (user.email || user.emails?.[0]?.value || user.emails?.[0]) && (
                          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                            <Button
                              size="small"
                              variant="text"
                              color="error"
                              onClick={async () => {
                                if (window.confirm('Är du säker på att du vill ta bort detta tidsförslag?')) {
                                  try {
                                    const response = await fetch(`${API_BASE_URL}/api/group/${groupId}/suggestion/${s.id}`, {
                                      method: 'DELETE',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ email: user.email || user.emails?.[0]?.value || user.emails?.[0] })
                                    });
                                    if (response.ok) {
                                      setSuggestions(prev => prev.filter(suggestion => suggestion.id !== s.id));
                                      setToast({ open: true, message: 'Tidsförslag borttaget', severity: 'success' });
                                    } else {
                                      const errorData = await response.json();
                                      setToast({ open: true, message: errorData.error || 'Kunde inte ta bort förslag', severity: 'error' });
                                    }
                                  } catch (error) {
                                    setToast({ open: true, message: 'Kunde inte ta bort förslag', severity: 'error' });
                                  }
                                }
                              }}
                              sx={{ fontSize: 12 }}
                            >
                              🗑️ Ta bort förslag
                            </Button>
                          </Box>
                        )}
                      </Box>
                    </>
                  )}
                </CardContent>
                </Card>
              </Fade>
            );
          })}
        </Box>
      )}

      <Dialog 
        open={suggestDialog.open} 
        onClose={() => setSuggestDialog({ open: false, slot: null })}
        maxWidth="sm"
        fullWidth
        fullScreen={window.innerWidth < 600}
        PaperProps={{
          sx: {
            borderRadius: { xs: 0, sm: 3 },
            boxShadow: theme.isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.12)',
            background: theme.isDark ? 'linear-gradient(135deg, #1e1e1e 0%, #2a2a2a 100%)' : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
            m: { xs: 0, sm: 2 }
          }
        }}
      >
        <DialogTitle sx={{
          background: 'linear-gradient(135deg, #1976d2 0%, #635bff 100%)',
          color: 'white',
          fontWeight: 700,
          fontSize: 20,
          textAlign: 'center',
          py: 3
        }}>
          Föreslå mötestid
        </DialogTitle>
        <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
          {suggestDialog.slot && (
            <>
              {/* Tidsvisning med modern design */}
              <Box sx={{
                background: theme.isDark ? 'linear-gradient(135deg, #1a237e 0%, #4a148c 100%)' : 'linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%)',
                borderRadius: 3,
                p: 3,
                border: `2px solid ${theme.colors.primary}`,
                textAlign: 'center'
              }}>
                <Typography sx={{ 
                  fontSize: 14, 
                  color: theme.colors.textSecondary, 
                  fontWeight: 600, 
                  mb: 1,
                  textTransform: 'uppercase',
                  letterSpacing: 1
                }}>
                  Vald tid
                </Typography>
                {suggestDialog.slot.isMultiDay ? (
                  <>
                    <Typography sx={{
                      fontWeight: 600,
                      fontSize: 18,
                      color: theme.colors.text,
                      mb: 0.5
                    }}>
                      Flerdagars möte
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', justifyContent: 'center' }}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: 12, color: theme.colors.textSecondary, fontWeight: 600, mb: 0.5 }}>DATUM</Typography>
                        <Typography sx={{ fontSize: 16, color: theme.colors.text, fontWeight: 700 }}>
                          {suggestDialog.slot.multiDayStart && suggestDialog.slot.multiDayEnd ? 
                            `${new Date(suggestDialog.slot.multiDayStart).toLocaleDateString('sv-SE')} - ${new Date(suggestDialog.slot.multiDayEnd).toLocaleDateString('sv-SE')}` :
                            'Ej angivet'
                          }
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: 12, color: theme.colors.textSecondary, fontWeight: 600, mb: 0.5 }}>ARBETSTID</Typography>
                        <Typography sx={{ fontSize: 16, color: theme.colors.text, fontWeight: 700 }}>
                          {suggestDialog.slot.dayStart && suggestDialog.slot.dayEnd ? 
                            `${suggestDialog.slot.dayStart} - ${suggestDialog.slot.dayEnd}` :
                            'Ej angivet'
                          }
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: 12, color: theme.colors.textSecondary, fontWeight: 600, mb: 0.5 }}>TOTAL TID</Typography>
                        <Typography sx={{ fontSize: 16, color: theme.colors.text, fontWeight: 700 }}>
                          {suggestDialog.slot.dayStart && suggestDialog.slot.dayEnd && suggestDialog.slot.multiDayStart && suggestDialog.slot.multiDayEnd ? (() => {
                            const [startHour, startMin] = suggestDialog.slot.dayStart.split(':').map(Number);
                            const [endHour, endMin] = suggestDialog.slot.dayEnd.split(':').map(Number);
                            const hoursPerDay = (endHour * 60 + endMin - startHour * 60 - startMin) / 60;
                            const days = Math.ceil((new Date(suggestDialog.slot.multiDayEnd) - new Date(suggestDialog.slot.multiDayStart)) / (1000 * 60 * 60 * 24));
                            return `${days * hoursPerDay} h totalt`;
                          })() : 'Ej angivet'}
                        </Typography>
                      </Box>
                    </Box>
                  </>
                ) : (
                  <>
                    <Typography sx={{
                      fontWeight: 600,
                      fontSize: 18,
                      color: theme.colors.text,
                      mb: 0.5
                    }}>
                      {new Date(suggestDialog.slot.start).toLocaleDateString('sv-SE', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </Typography>
                    <Typography sx={{
                      fontSize: 16,
                      color: theme.colors.text,
                      fontWeight: 700
                    }}>
                      {new Date(suggestDialog.slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(suggestDialog.slot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </>
                )}
              </Box>

              {/* Mötesnamn med förbättrad design */}
              <TextField
                label="Mötesnamn"
                value={meetingTitle}
                onChange={e => setMeetingTitle(e.target.value)}
                fullWidth
                placeholder="Ex: Projektmöte, Lunch, Planering..."
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    background: theme.colors.surface,
                    border: `1px solid ${theme.colors.border}`,
                    color: theme.colors.text,
                    '&:hover': {
                      background: theme.isDark ? '#2a2a2a' : '#f1f3f4',
                      borderColor: theme.colors.primary
                    },
                    '&.Mui-focused': {
                      background: theme.colors.bg,
                      boxShadow: `0 0 0 3px ${theme.colors.primary}20`
                    }
                  },
                  '& .MuiInputLabel-root': {
                    fontWeight: 600,
                    color: theme.colors.textSecondary
                  }
                }}
              />

              {/* Checkbox med förbättrad design */}
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                p: 2.5,
                background: theme.colors.surface,
                borderRadius: 2,
                border: `1px solid ${theme.colors.border}`,
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                  background: theme.isDark ? '#2a2a2a' : '#e9ecef',
                  borderColor: theme.colors.primary
                }
              }}
              onClick={() => setWithMeet(!withMeet)}>
                <Box sx={{
                  width: 20,
                  height: 20,
                  borderRadius: 1,
                  border: withMeet ? `2px solid ${theme.colors.primary}` : `2px solid ${theme.colors.border}`,
                  background: withMeet ? theme.colors.primary : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mr: 2,
                  transition: 'all 0.2s'
                }}>
                  {withMeet && (
                    <Typography sx={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>✓</Typography>
                  )}
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 600, color: theme.colors.text, fontSize: 15 }}>
                    Skicka ut Google Meet-länk
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: theme.colors.textSecondary, mt: 0.5 }}>
                    Automatiskt videomöte skapas och skickas till alla deltagare
                  </Typography>
                </Box>
              </Box>

              {/* Plats-fält med förbättrad design */}
              {!withMeet && (
                <TextField
                  label="Plats för mötet"
                  value={meetingLocation}
                  onChange={e => setMeetingLocation(e.target.value)}
                  fullWidth
                  placeholder="Ex: Kontoret, Café, Rum 101..."
                  required
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      background: '#fff3e0',
                      border: '2px solid #ffcc02',
                      '&:hover': {
                        background: '#fff8e1',
                        borderColor: '#ffa000'
                      },
                      '&.Mui-focused': {
                        background: '#fff',
                        borderColor: '#ff9800',
                        boxShadow: '0 0 0 3px rgba(255, 152, 0, 0.1)'
                      }
                    },
                    '& .MuiInputLabel-root': {
                      fontWeight: 600,
                      color: '#e65100'
                    }
                  }}

                />
              )}
            </>
          )}
        </Box>
        <DialogActions sx={{ 
          p: 3, 
          pt: 0, 
          gap: 2,
          justifyContent: 'center'
        }}>
          <Button 
            onClick={() => setSuggestDialog({ open: false, slot: null })}
            sx={{
              borderRadius: 2,
              px: 4,
              py: 1.5,
              fontWeight: 600,
              color: '#666',
              border: '2px solid #e0e0e0',
              '&:hover': {
                background: '#f5f5f5',
                borderColor: '#bdbdbd'
              }
            }}
            variant="outlined"
          >
            Avbryt
          </Button>
          <Button 
            onClick={confirmSuggest} 
            variant="contained"
            disabled={isSubmittingSuggestion}
            sx={{
              borderRadius: 2,
              px: 4,
              py: 1.5,
              fontWeight: 700,
              fontSize: 15,
              background: 'linear-gradient(135deg, #1976d2 0%, #635bff 100%)',
              boxShadow: '0 4px 16px rgba(25, 118, 210, 0.3)',
              '&:hover': {
                background: 'linear-gradient(135deg, #1565c0 0%, #5e35b1 100%)',
                boxShadow: '0 6px 20px rgba(25, 118, 210, 0.4)',
                transform: 'translateY(-1px)'
              },
              '&:disabled': {
                background: '#ccc',
                transform: 'none',
                boxShadow: 'none'
              },
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            {isSubmittingSuggestion && <CircularProgress size={16} sx={{ color: 'white' }} />}
            {isSubmittingSuggestion ? 'Skickar...' : 'Föreslå denna tiden'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Kalender */}
      {/* Visa information om direktbokning eller team-möte */}
      {directAccess && contactEmail && (
        <Box sx={{
          mb: 4,
          p: 3,
          bgcolor: '#e8f5e8',
          borderRadius: 3,
          border: '2px solid #4caf50'
        }}>
          <Typography variant="h6" sx={{ color: '#2e7d32', fontWeight: 600, mb: 1 }}>
            🤝 Direktbokning med {contactName || contactEmail}
          </Typography>
          <Typography variant="body2" sx={{ color: '#1b5e20' }}>
            Du kan boka möten direkt utan att skicka inbjudan först eftersom {contactName || contactEmail} har gett dig tillgång till sin kalender.
          </Typography>
        </Box>
      )}
      
      {teamName && (
        <Box sx={{
          mb: 4,
          p: 3,
          bgcolor: '#e3f2fd',
          borderRadius: 3,
          border: '2px solid #1976d2'
        }}>
          <Typography variant="h6" sx={{ color: '#1976d2', fontWeight: 600, mb: 1 }}>
            👥 {teamName} - Teammöte
          </Typography>
          <Typography variant="body2" sx={{ color: '#1565c0' }}>
            Hitta en tid som passar alla i teamet.
          </Typography>
        </Box>
      )}
      
      <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
        Kalender
      </Typography>

      {/* Vy-väljare */}
      <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: { xs: 'center', sm: 'flex-start' } }}>
        {(isMobile ? [
          { key: 'agenda', label: 'Lista' },
          { key: 'day', label: 'Dag' }
        ] : [
          { key: 'month', label: 'Månad' },
          { key: 'work_week', label: 'Arbetsvecka' },
          { key: 'week', label: 'Vecka' },
          { key: 'day', label: 'Dag' },
          { key: 'agenda', label: 'Agenda' }
        ]).map(view => (
          <Button
            key={view.key}
            variant={calendarView === view.key ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setCalendarView(view.key)}
            sx={{
              fontWeight: 600,
              borderRadius: 2,
              px: { xs: 1.5, sm: 2 },
              py: 1,
              fontSize: { xs: 12, sm: 14 }
            }}
          >
            {view.label}
          </Button>
        ))}
      </Box>

      <div style={{ height: isMobile ? '400px' : '500px', marginTop: '20px', marginBottom: 100, width: '100%', overflowX: 'auto', position: 'relative' }} data-tutorial="calendar">
        <Paper elevation={1} sx={{
          borderRadius: 2,
          overflow: 'hidden',
          border: `1px solid ${calendarBorder}`,
          background: calendarBg,
          minWidth: { xs: '320px', md: 'auto' },
          position: 'relative'
        }}>
          <IconButton
            onClick={() => setIsCalendarFullscreen(!isCalendarFullscreen)}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 1000,
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(4px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 1)',
                transform: 'scale(1.1)'
              },
              transition: 'all 0.2s ease'
            }}
          >
            <FullscreenIcon />
          </IconButton>
          <Calendar
            localizer={localizer}
            events={availability.map((slot, index) => ({
              id: `slot-${index}`,
              title: 'Ledig tid',
              start: new Date(slot.start),
              end: new Date(slot.end),
              resource: {
                color: '#e3f2fd',
                textColor: '#1976d2'
              }
            }))}
            startAccessor="start"
            endAccessor="end"
            style={{ height: 500, background: 'transparent', border: 'none' }}
            selectable={!!groupId}
            scrollToTime={(() => {
              const scrollTime = new Date();
              scrollTime.setHours(8, 0, 0, 0);
              return scrollTime;
            })()}
            onSelectSlot={groupId ? handleCalendarSelectSlot : undefined}
            onSelectEvent={groupId ? handleCalendarSelectEvent : undefined}
            eventPropGetter={(event) => ({
              style: {
                backgroundColor: event.resource?.color || '#e3f2fd',
                color: event.resource?.textColor || '#1976d2'
              }
            })}
            popup={false}
            longPressThreshold={1}
            selectAllow={() => true}
            views={['month', 'week', 'work_week', 'day', 'agenda']}
            view={calendarView}
            onView={setCalendarView}
            date={calendarDate}
            onNavigate={setCalendarDate}

          />
        </Paper>
      </div>

      {isCalendarFullscreen && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#fff',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            p: 2
          }}
        >
          <Box sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2,
            pb: 2,
            borderBottom: '1px solid #e0e3e7'
          }}>
            <Typography variant="h5" sx={{ fontWeight: 600, color: '#1976d2' }}>
              Kalender - Fullskärm
            </Typography>
            <IconButton
              onClick={() => setIsCalendarFullscreen(false)}
              sx={{
                backgroundColor: 'rgba(244, 67, 54, 0.1)',
                color: '#d32f2f',
                '&:hover': {
                  backgroundColor: 'rgba(244, 67, 54, 0.2)',
                  transform: 'scale(1.1)'
                }
              }}
            >
              <FullscreenExitIcon />
            </IconButton>
          </Box>
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <Paper elevation={1} sx={{
              height: '100%',
              borderRadius: 2,
              overflow: 'hidden',
              border: `1px solid ${calendarBorder}`,
              background: calendarBg
            }}>
              <Calendar
                localizer={localizer}
                events={availability.map((slot, index) => ({
                  id: `slot-${index}`,
                  title: 'Ledig tid',
                  start: new Date(slot.start),
                  end: new Date(slot.end),
                  resource: {
                    color: '#e3f2fd',
                    textColor: '#1976d2'
                  }
                }))}
                startAccessor="start"
                endAccessor="end"
                style={{ height: '100%', background: 'transparent', border: 'none' }}
                selectable={!!groupId}
                scrollToTime={(() => {
                  const scrollTime = new Date();
                  scrollTime.setHours(8, 0, 0, 0);
                  return scrollTime;
                })()}
                onSelectSlot={groupId ? handleCalendarSelectSlot : undefined}
                onSelectEvent={groupId ? handleCalendarSelectEvent : undefined}
                eventPropGetter={(event) => ({
                  style: {
                    backgroundColor: event.resource?.color || '#e3f2fd',
                    color: event.resource?.textColor || '#1976d2'
                  }
                })}
                popup={false}
                longPressThreshold={1}
                selectAllow={() => true}
                views={['month', 'week', 'work_week', 'day', 'agenda']}
                view={calendarView}
                onView={setCalendarView}
                date={calendarDate}
                onNavigate={setCalendarDate}
              />
            </Paper>
          </Box>
        </Box>
      )}
      {/* Floating Notification Icon */}
      <IconButton
        onClick={() => setSidebarOpen(!sidebarOpen)}
        sx={{
          position: 'fixed',
          top: '50%',
          right: 20,
          transform: 'translateY(-50%)',
          width: 60,
          height: 60,
          backgroundColor: '#635bff',
          color: 'white',
          boxShadow: '0 4px 20px rgba(99, 91, 255, 0.3)',
          zIndex: 1200,
          '&:hover': {
            backgroundColor: '#7a5af8',
            boxShadow: '0 6px 25px rgba(99, 91, 255, 0.4)',
            transform: 'translateY(-50%) scale(1.1)'
          },
          transition: 'all 0.3s ease'
        }}
      >
        <Badge 
          badgeContent={invitations.length + timeProposals.length} 
          color="error"
          sx={{
            '& .MuiBadge-badge': {
              fontSize: '10px',
              minWidth: '18px',
              height: '18px',
              top: -8,
              right: -8
            }
          }}
        >
          <NotificationsIcon sx={{ fontSize: 28 }} />
        </Badge>
      </IconButton>

      {/* Sidebar Modal */}
      {sidebarOpen && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => setSidebarOpen(false)}
        >
          <Box
            sx={{
              width: 400,
              maxHeight: '80vh',
              backgroundColor: '#fff',
              borderRadius: 3,
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <Box sx={{ p: 3, borderBottom: '1px solid #e0e3e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#1976d2' }}>
                Notifikationer
              </Typography>
              <IconButton onClick={() => setSidebarOpen(false)} size="small">
                <ChevronLeftIcon />
              </IconButton>
            </Box>

            {/* Tabs */}
            <Box sx={{ display: 'flex', borderBottom: '1px solid #e0e3e7' }}>
              <Button
                onClick={() => setSidebarTab('invitations')}
                sx={{
                  flex: 1,
                  py: 2,
                  borderRadius: 0,
                  borderBottom: sidebarTab === 'invitations' ? '2px solid #1976d2' : 'none',
                  color: sidebarTab === 'invitations' ? '#1976d2' : '#666',
                  fontWeight: sidebarTab === 'invitations' ? 600 : 400,
                  fontSize: 12
                }}
                startIcon={<GroupIcon />}
              >
                Inbjudningar
              </Button>
              <Button
                onClick={() => setSidebarTab('proposals')}
                sx={{
                  flex: 1,
                  py: 2,
                  borderRadius: 0,
                  borderBottom: sidebarTab === 'proposals' ? '2px solid #1976d2' : 'none',
                  color: sidebarTab === 'proposals' ? '#1976d2' : '#666',
                  fontWeight: sidebarTab === 'proposals' ? 600 : 400,
                  fontSize: 12
                }}
                startIcon={<EventIcon />}
              >
                Tidsförslag
              </Button>
            </Box>

            {/* Content */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
              {sidebarTab === 'invitations' ? (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 2, color: '#666' }}>
                    Inbjudningar till kalenderjämförelse
                  </Typography>
                  {invitations.length === 0 ? (
                    <Typography variant="body2" sx={{ color: '#999', textAlign: 'center', mt: 4 }}>
                      Inga inbjudningar just nu
                    </Typography>
                  ) : (
                    invitations.map((invitation) => (
                      <Paper
                        key={invitation.id}
                        sx={{
                          p: 2,
                          mb: 2,
                          borderRadius: 2,
                          border: '1px solid #e0e3e7',
                          '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                          {invitation.fromEmail}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#1976d2', display: 'block', fontWeight: 600 }}>
                          {invitation.groupName}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#666', display: 'block', mb: 1 }}>
                          Vill jämföra kalendrar med dig
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#999', fontSize: 11 }}>
                          {new Date(invitation.createdAt).toLocaleDateString()}
                        </Typography>
                        <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                          <Button 
                            size="small" 
                            variant="contained" 
                            sx={{ fontSize: 12 }}
                            onClick={() => window.location.href = `/?group=${invitation.groupId}&invitee=${invitation.inviteeId}`}
                          >
                            Gå med
                          </Button>
                          <Button 
                            size="small" 
                            variant="outlined" 
                            sx={{ fontSize: 12 }}
                            onClick={async () => {
                              try {
                                const res = await fetch(`${API_BASE_URL}/api/invitation/${invitation.id}/respond`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ response: 'decline' })
                                });
                                if (res.ok) {
                                  fetchInvitations();
                                  setToast({ open: true, message: 'Inbjudan nekad', severity: 'info' });
                                }
                              } catch (error) {
                                setToast({ open: true, message: 'Kunde inte neka inbjudan', severity: 'error' });
                              }
                            }}
                          >
                            Neka
                          </Button>
                        </Box>
                      </Paper>
                    ))
                  )}
                </Box>
              ) : (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 2, color: '#666' }}>
                    Tidsförslag du har fått
                  </Typography>
                  {timeProposals.length === 0 ? (
                    <Typography variant="body2" sx={{ color: '#999', textAlign: 'center', mt: 4 }}>
                      Inga tidsförslag just nu
                    </Typography>
                  ) : (
                    timeProposals.map((proposal) => (
                      <Paper
                        key={proposal.id}
                        sx={{
                          p: 2,
                          mb: 2,
                          borderRadius: 2,
                          border: '1px solid #e0e3e7',
                          '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                          {proposal.title || 'Mötesförslag'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#666', display: 'block' }}>
                          Från: {proposal.fromEmail}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#1976d2', display: 'block' }}>
                          {new Date(proposal.start).toLocaleDateString()} {new Date(proposal.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                        <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                          <Button 
                            size="small" 
                            variant="contained" 
                            sx={{ fontSize: 12 }}
                            onClick={async () => {
                              await voteSuggestion(proposal.id, 'accepted', proposal.groupId);
                              fetchTimeProposals();
                            }}
                          >
                            Acceptera
                          </Button>
                          <Button 
                            size="small" 
                            variant="outlined" 
                            sx={{ fontSize: 12 }}
                            onClick={async () => {
                              await voteSuggestion(proposal.id, 'declined', proposal.groupId);
                              fetchTimeProposals();
                            }}
                          >
                            Neka
                          </Button>
                        </Box>
                      </Paper>
                    ))
                  )}
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* Footer */}
      <Box sx={{
        mt: 8,
        py: 4,
        borderTop: `1px solid ${theme.colors.border}`,
        textAlign: 'center',
        bgcolor: theme.colors.surface
      }}>
        <Typography variant="body2" sx={{ color: theme.colors.textSecondary, mb: 2 }}>
          © 2025 BookR - Kalenderjämförelse
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, flexWrap: 'wrap' }}>
          <Button
            component="a"
            href="/privacy-policy"
            target="_blank"
            size="small"
            sx={{ color: theme.colors.textSecondary, textDecoration: 'underline' }}
          >
            Integritetspolicy
          </Button>
          <Button
            component="a"
            href="/terms-of-service"
            target="_blank"
            size="small"
            sx={{ color: theme.colors.textSecondary, textDecoration: 'underline' }}
          >
            Användarvillkor
          </Button>
        </Box>
      </Box>

      {/* Extra marginal i botten */}
      <Box sx={{ height: 40 }} />
      
      {/* Toast-meddelanden */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToast({ ...toast, open: false })}
          severity={toast.severity}
          sx={{ width: '100%', borderRadius: 2 }}
        >
          {toast.message}
        </Alert>
      </Snackbar>

      {/* Tutorial overlay */}
      {showTutorial && tutorialStep >= 0 && (
        <>
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 9999,
              pointerEvents: 'none'
            }}
          />
          {(() => {
            const currentStep = tutorialSteps[tutorialStep];
            const targetElement = document.querySelector(currentStep.target);
            if (!targetElement) return null;
            
            const rect = targetElement.getBoundingClientRect();
            const isBottom = rect.top > window.innerHeight / 2;
            const popupLeft = Math.max(20, Math.min(rect.left, window.innerWidth - 320));
            
            return (
              <Paper
                sx={{
                  position: 'absolute',
                  top: isBottom ? rect.top + window.scrollY - 200 : rect.bottom + window.scrollY + 20,
                  left: popupLeft,
                  width: 300,
                  p: 3,
                  zIndex: 10000,
                  borderRadius: 3,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    [isBottom ? 'bottom' : 'top']: -10,
                    left: Math.max(10, rect.left + rect.width/2 - popupLeft),
                    width: 0,
                    height: 0,
                    borderLeft: '10px solid transparent',
                    borderRight: '10px solid transparent',
                    [isBottom ? 'borderTop' : 'borderBottom']: '10px solid white'
                  }
                }}
              >
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, color: '#1976d2' }}>
                  {currentStep.title}
                </Typography>
                <Typography variant="body2" sx={{ mb: 3, color: '#666', lineHeight: 1.5 }}>
                  {currentStep.content}
                </Typography>
               <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ color: '#999' }}>
                    {tutorialStep + 1} av {tutorialSteps.length}
                  </Typography>
                </Box>
              </Paper>
            );
          })()}
        </>
      )}
    </div>
    </>
  );
}