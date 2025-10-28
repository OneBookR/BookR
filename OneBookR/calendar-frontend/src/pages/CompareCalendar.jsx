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

export default function CompareCalendar({
  myToken,
  invitedTokens = [],
  user,
  groupId: propGroupId, // Använd prop istället
  directAccess,
  contactEmail,
  contactName,
  teamName
}) {
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

  const userProvider = user?.provider || 'google';

  // --- FIX: Always call hooks at the top level ---
  const themeApi = useTheme();
  const theme = themeApi?.theme || { isDark: false, colors: { surface: '#fff', border: '#e0e3e7', text: '#222', textSecondary: '#888', bg: '#f7f9fb', primary: '#1976d2', warning: '#ff9800', success: '#4caf50', error: '#d32f2f' } };
  const toggleTheme = themeApi?.toggleTheme || (() => {});

  const notifApi = useNotifications();
  const permission = notifApi?.permission ?? 'default';
  const requestPermission = notifApi?.requestPermission || (async () => {});
  const showNotification = notifApi?.showNotification || (() => {});
  const scheduleReminder = notifApi?.scheduleReminder || (() => {});

  const pwaApi = usePWA();
  const isInstallable = pwaApi?.isInstallable ?? false;
  const installApp = pwaApi?.installApp || (() => {});

  const contactsApi = useContacts();
  const contacts = contactsApi?.contacts || [];
  const addContact = contactsApi?.addContact || (() => {});
  const removeContact = contactsApi?.removeContact || (() => {});
  const updateContact = contactsApi?.updateContact || (() => {});
  const incrementInviteCount = contactsApi?.incrementInviteCount || (() => {});

  const [availability, setAvailability] = useState([]);
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [selectedContacts, setSelectedContacts] = useState([]);
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
  const [tutorialStep, setTutorialStep] = useState(-1);
  const [showTutorial, setShowTutorial] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('invitations');
  const [sidebarMode, setSidebarMode] = useState('notifications'); // 'notifications' eller 'contacts'
  const [invitations, setInvitations] = useState([]);
  const [timeProposals, setTimeProposals] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [undoAction, setUndoAction] = useState(null);
  const [successAnimation, setSuccessAnimation] = useState(null);
  const [isCalendarFullscreen, setIsCalendarFullscreen] = useState(false);
  
  // Ta bort denna rad - groupId kommer från props
  // const urlParams = new URLSearchParams(window.location.search);
  // const groupId = urlParams.get('group');
  
  // Använd propGroupId istället
  const groupId = propGroupId;
  
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
    if (!myToken) {
      setError('Du måste vara inloggad för att jämföra kalendrar');
      return;
    }

    setIsLoadingAvailability(true);
    setError(null);
    setHasSearched(true);

    try {
      const tokensAll = [myToken, ...invitedTokens].filter(Boolean);
      
      console.log('Comparing calendars - sending tokens to backend:', tokensAll.length);

      const response = await fetch('https://www.onebookr.se/api/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: tokensAll,
          timeMin: timeMin || undefined,
          timeMax: timeMax || undefined,
          duration: parseInt(meetingDuration, 10),
          dayStart,
          dayEnd,
          isMultiDay,
          multiDayStart: isMultiDay ? multiDayStart : undefined,
          multiDayEnd: isMultiDay ? multiDayEnd : undefined
        })
      });

      // NYTT: Hantera TOKEN_EXPIRED från backend
      if (response.status === 401) {
        const errorData = await response.json().catch(() => ({}));
        
        if (errorData.error === 'TOKEN_EXPIRED' || errorData.error === 'TOKEN_VALIDATION_FAILED') {
          console.log('⚠️ Token har gått ut - omdirigerar till login');
          
          // Spara nuvarande URL för återkomst
          localStorage.setItem('bookr_return_url', window.location.href);
          localStorage.removeItem('bookr_user');
          sessionStorage.removeItem('hasTriedSession');
          
          // Visa meddelande
          setToast({
            open: true,
            message: '⚠️ Din session har gått ut. Loggar ut...',
            severity: 'warning'
          });
          
          // Vänta 2 sekunder och redirecta
          setTimeout(() => {
            window.location.href = 'https://www.onebookr.se/auth/logout';
          }, 2000);
          
          return;
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend error: ${errorText}`);
      }

      const data = await response.json();
      console.log('Availability response:', data);

      if (Array.isArray(data) && data.length > 0) {
        setAvailability(data);
        setToast({
          open: true,
          message: `✅ Hittade ${data.length} gemensamma lediga tider!`,
          severity: 'success'
        });
      } else {
        setAvailability([]);
        setToast({
          open: true,
          message: 'Inga gemensamma lediga tider hittades',
          severity: 'info'
        });
      }
    } catch (err) {
      console.error('Error fetching availability:', err);
      setError('Fel vid hämtning av lediga tider: ' + err.message);
      setToast({
        open: true,
        message: 'Fel vid hämtning av lediga tider',
        severity: 'error'
      });
    } finally {
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
    if (!myToken) return;

    try {
      const tokensAll = [myToken, ...invitedTokens].filter(Boolean);

      const response = await fetch('https://www.onebookr.se/api/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: tokensAll,
          timeMin: start,
          timeMax: end,
          duration: parseInt(meetingDuration, 10),
          dayStart,
          dayEnd
        })
      });

      // NYTT: Samma token-expiry hantering här
      if (response.status === 401) {
        const errorData = await response.json().catch(() => ({}));
        
        if (errorData.error === 'TOKEN_EXPIRED' || errorData.error === 'TOKEN_VALIDATION_FAILED') {
          console.log('⚠️ Token har gått ut vid auto-load - omdirigerar till login');
          localStorage.setItem('bookr_return_url', window.location.href);
          localStorage.removeItem('bookr_user');
          sessionStorage.removeItem('hasTriedSession');
          
          setTimeout(() => {
            window.location.href = 'https://www.onebookr.se/auth/logout';
          }, 1000);
          
          return;
        }
      }

      if (!response.ok) {
        console.warn('Auto-load failed:', response.status);
        return;
      }

      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        setAvailability(data);
      }
    } catch (err) {
      console.error('Error in auto-load:', err);
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

  // Lägg till saknade event handlers innan return
  const handleCalendarSelectSlot = (slotInfo) => {
    if (!groupId) return;
    setSuggestDialog({
      open: true,
      slot: {
        start: slotInfo.start,
        end: slotInfo.end
      }
    });
  };

  const handleCalendarSelectEvent = (event) => {
    if (!groupId) return;
    setSuggestDialog({
      open: true,
      slot: {
        start: event.start,
        end: event.end
      }
    });
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
                    borderRadius: 999
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
                    borderRadius: 999
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
          {suggestions.map((suggestion, index) => {
            const start = new Date(suggestion.start);
            const end = new Date(suggestion.end);
            const durationMinutes = Math.round((end - start) / 60000);
            const isFinalized = suggestion.finalized;
            const meetLink = suggestion.meetLink || suggestion.link;
            
            return (
              <Grow 
                in={true} 
                timeout={300 + index * 100}
                key={suggestion.id}
              >
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    bgcolor: isFinalized ? '#e8f5e9' : theme.colors.surface,
                    border: `1px solid ${isFinalized ? '#4caf50' : theme.colors.border}`,
                    borderRadius: 2,
                    p: { xs: 2, sm: 2.5 },
                    minHeight: 'auto',
                    width: '100%',
                    cursor: groupId ? 'pointer' : 'default',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': groupId ? { 
                      bgcolor: theme.isDark ? '#2a2a2a' : '#e0f2f1',
                      transform: { xs: 'none', sm: 'translateY(-2px)' },
                      boxShadow: theme.isDark ? '0 4px 15px rgba(0,0,0,0.4)' : '0 4px 15px rgba(0,0,0,0.15)'
                    } : {},
                    gap: 1
                  }}
                  onClick={groupId ? () => voteSuggestion(suggestion.id, isFinalized ? 'rejected' : 'accepted') : undefined}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <Typography sx={{ fontWeight: 700, color: isFinalized ? '#4caf50' : '#1976d2', fontSize: 16, mb: 1 }}>
                      {isFinalized ? 'Möte bokat!' : 'Tidsförslag'}
                    </Typography>
                    {isFinalized && meetLink && (
                      <Button
                        variant="outlined"
                        color="primary"
                        size="small"
                        sx={{ 
                          borderRadius: 999,
                          height: 36,
                          minWidth: 0,
                          px: 2,
                          fontWeight: 600,
                          fontSize: 12,
                          ml: 1
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          window.open(meetLink, '_blank');
                        }}
                      >
                        Gå till mötet
                      </Button>
                    )}
                  </Box>
                  <Typography sx={{ fontWeight: 600, fontSize: 18, mb: 1 }}>
                    {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Typography>
                  <Typography sx={{ color: '#666', fontSize: 14 }}>
                    {durationMinutes} minuter • {start.toLocaleDateString('sv-SE', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Typography>
                  {isFinalized && (
                    <Typography sx={{ color: '#4caf50', fontWeight: 600, fontSize: 14, mt: 1 }}>
                      Bokad av: {suggestion.email}
                    </Typography>
                  )}
                  {!isFinalized && (
                    <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                      <Button
                        variant="contained"
                        color="primary"
                        size="small"
                        sx={{ 
                          borderRadius: 999,
                          height: 36,
                          minWidth: 0,
                          px: 2,
                          fontWeight: 600,
                          fontSize: 12,
                          flex: 1
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          voteSuggestion(suggestion.id, 'accepted');
                        }}
                      >
                        Acceptera
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        sx={{ 
                          borderRadius: 999,
                          height: 36,
                          minWidth: 0,
                          px: 2,
                          fontWeight: 600,
                          fontSize: 12,
                          flex: 1
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          voteSuggestion(suggestion.id, 'rejected');
                        }}
                      >
                        Avböj
                      </Button>
                    </Box>
                  )}
                </Box>
              </Grow>
            );
          })}
        </Box>
      )}

      {/* Kalender */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 2, 
        width: '100%', 
        maxWidth: 1200, 
        margin: '0 auto',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 2,
        border: `1px solid ${theme.colors.border}`,
        boxShadow: theme.isDark ? '0 4px 20px rgba(0,0,0,0.3)' : '0 2px 8px rgba(60,64,67,.06)',
        bgcolor: theme.colors.surface,
        p: 2,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0
      }}>
        {/* Mobil meny för kalendervy */}
        {isMobile && (
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            width: '100%', 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: 0, 
            zIndex: 10,
            px: 2,
            py: 1,
            bgcolor: theme.colors.surface,
            borderBottom: `1px solid ${theme.colors.border}`,
            borderTopLeftRadius: 2,
            borderTopRightRadius: 2
          }}>
            <Button
              variant={calendarView === 'month' ? 'contained' : 'outlined'}
              onClick={() => setCalendarView('month')}
              size="small"
              sx={{
                borderRadius: 999,
                px: 3,
                py: 1,
                fontWeight: 600,
                fontSize: 12,
                flex: 1,
                mr: 1,
                transition: 'all 0.2s ease',
                ...(calendarView === 'month' ? {
                  bgcolor: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                  color: '#fff',
                  boxShadow: '0 2px 8px rgba(99,91,255,0.13)',
                  '&:hover': {
                    bgcolor: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)',
                    boxShadow: '0 0 0 4px #e9e5ff, 0 8px 24px 0 rgba(99,91,255,0.18)',
                    transform: 'scale(1.03)',
                  },
                  '&:active': {
                    bgcolor: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                    boxShadow: '0 0 0 2px #bcb8ff, 0 2px 8px 0 rgba(99,91,255,0.13)',
                    transform: 'scale(0.98)',
                  },
                } : {}),
              }}
            >
              <EventIcon sx={{ fontSize: 18, mr: 1 }} />
              Kalendervy
            </Button>
            <Button
              variant={calendarView === 'agenda' ? 'contained' : 'outlined'}
              onClick={() => setCalendarView('agenda')}
              size="small"
              sx={{
                borderRadius: 999,
                px: 3,
                py: 1,
                fontWeight: 600,
                fontSize: 12,
                flex: 1,
                ml: 1,
                transition: 'all 0.2s ease',
                ...(calendarView === 'agenda' ? {
                  bgcolor: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                  color: '#fff',
                  boxShadow: '0 2px 8px rgba(99,91,255,0.13)',
                  '&:hover': {
                    bgcolor: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)',
                    boxShadow: '0 0 0 4px #e9e5ff, 0 8px 24px 0 rgba(99,91,255,0.18)',
                    transform: 'scale(1.03)',
                  },
                  '&:active': {
                    bgcolor: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                    boxShadow: '0 0 0 2px #bcb8ff, 0 2px 8px 0 rgba(99,91,255,0.13)',
                    transform: 'scale(0.98)',
                  },
                } : {}),
              }}
            >
              <GroupIcon sx={{ fontSize: 18, mr: 1 }} />
              Listvy
            </Button>
          </Box>
        )}

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            width: '100%',
            position: 'relative',
            zIndex: 1,
            overflow: 'hidden',
            borderRadius: 2,
            border: `1px solid ${theme.colors.border}`,
            boxShadow: theme.isDark ? '0 4px 20px rgba(0,0,0,0.3)' : '0 2px 8px rgba(60,64,67,.06)',
            bgcolor: theme.colors.surface,
            p: 2,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0
          }}
        >
          {/* Kalender komponent */}
          <Calendar
            localizer={localizer}
            events={[]}
            startAccessor="start"
            endAccessor="end"
            style={{ 
              height: isMobile ? 'auto' : 700, 
              padding: isMobile ? '0 8px' : '0',
              overflow: 'hidden',
              borderRadius: 2,
              border: `1px solid ${theme.colors.border}`,
              boxShadow: theme.isDark ? '0 4px 20px rgba(0,0,0,0.3)' : '0 2px 8px rgba(60,64,67,.06)',
              background: theme.colors.surface
            }}
            views={{
              month: true,
              week: true,
              day: true,
              agenda: true
            }}
            view={calendarView}
            onViewChange={setCalendarView}
            date={calendarDate}
            onNavigate={(date) => setCalendarDate(date)}
            components={{
              toolbar: (props) => (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <Button
                    onClick={() => {
                      const newDate = new Date(calendarDate);
                      newDate.setMonth(newDate.getMonth() - 1);
                      setCalendarDate(newDate);
                    }}
                    sx={{ 
                      borderRadius: 999,
                      px: 3,
                      py: 1,
                      fontWeight: 600,
                      fontSize: 12,
                      minWidth: 0,
                      color: theme.colors.text,
                      border: `1px solid ${theme.colors.border}`,
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        bgcolor: theme.colors.primary,
                        color: '#fff',
                        transform: 'translateY(-1px)',
                        boxShadow: '0 2px 8px rgba(25, 118, 210, 0.2)',
                      },
                      '&:active': {
                        transform: 'translateY(0)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      },
                    }}
                  >
                    <ChevronLeftIcon />
                    Föregående
                  </Button>
                  <Typography variant="h6" sx={{ flex: 1, textAlign: 'center', fontWeight: 600, fontSize: 16 }}>
                    {calendarView === 'month' && calendarDate.toLocaleString('sv-SE', { month: 'long', year: 'numeric' })}
                    {calendarView === 'week' && `Vecka ${moment(calendarDate).isoWeek()} - ${calendarDate.getFullYear()}`}
                    {calendarView === 'day' && calendarDate.toLocaleString('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    {calendarView === 'agenda' && 'Kommande händelser'}
                  </Typography>
                  <Button
                    onClick={() => {
                      const newDate = new Date(calendarDate);
                      newDate.setMonth(newDate.getMonth() + 1);
                      setCalendarDate(newDate);
                    }}
                    sx={{ 
                      borderRadius: 999,
                      px: 3,
                      py: 1,
                      fontWeight: 600,
                      fontSize: 12,
                      minWidth: 0,
                      color: theme.colors.text,
                      border: `1px solid ${theme.colors.border}`,
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        bgcolor: theme.colors.primary,
                        color: '#fff',
                        transform: 'translateY(-1px)',
                        boxShadow: '0 2px 8px rgba(25, 118, 210, 0.2)',
                      },
                      '&:active': {
                        transform: 'translateY(0)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      },
                    }}
                  >
                    Nästa
                    <ChevronLeftIcon sx={{ transform: 'rotate(180deg)' }} />
                  </Button>
                </div>
              ),
              event: (eventProps) => {
                const { event } = eventProps;
                return (
                  <Tooltip
                    title={
                      <Box sx={{ p: 1, bgcolor: 'background.paper', borderRadius: 1, boxShadow: 2 }}>
                        <Typography sx={{ fontWeight: 600, color: '#1976d2' }}>
                          {event.title}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#666' }}>
                          {new Date(event.start).toLocaleString('sv-SE', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {' - '}
                          {new Date(event.end).toLocaleString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                        {event.location && (
                          <Typography variant="body2" sx={{ color: '#666' }}>
                            Plats: {event.location}
                          </Typography>
                        )}
                        {event.meetLink && (
                          <Typography variant="body2" sx={{ color: '#1976d2', fontWeight: 500, mt: 0.5 }}>
                            <a href={event.meetLink} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                              Gå till mötet
                            </a>
                          </Typography>
                        )}
                      </Box>
                    }
                    arrow
                    placement="top"
                    sx={{ zIndex: 1300 }}
                  >
                    <div {...eventProps} />
                  </Tooltip>
                );
              },
              agenda: {
                event: (eventProps) => {
                  const { event } = eventProps;
                  return (
                    <Tooltip
                      title={
                        <Box sx={{ p: 1, bgcolor: 'background.paper', borderRadius: 1, boxShadow: 2 }}>
                          <Typography sx={{ fontWeight: 600, color: '#1976d2' }}>
                            {event.title}
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#666' }}>
                            {new Date(event.start).toLocaleString('sv-SE', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            {' - '}
                            {new Date(event.end).toLocaleString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                          {event.location && (
                            <Typography variant="body2" sx={{ color: '#666' }}>
                              Plats: {event.location}
                            </Typography>
                          )}
                          {event.meetLink && (
                            <Typography variant="body2" sx={{ color: '#1976d2', fontWeight: 500, mt: 0.5 }}>
                              <a href={event.meetLink} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                                Gå till mötet
                              </a>
                            </Typography>
                          )}
                        </Box>
                      }
                      arrow
                      placement="top"
                      sx={{ zIndex: 1300 }}
                    >
                      <div {...eventProps} />
                    </Tooltip>
                  );
                }
              }
            }}
            popup
            onSelectSlot={handleCalendarSelectSlot}
            onSelectEvent={handleCalendarSelectEvent}
            style={{ borderRadius: '10px', overflow: 'hidden' }}
          />

          {/* Fullscreen knapp */}
          <IconButton
            onClick={() => setIsCalendarFullscreen(!isCalendarFullscreen)}
            sx={{
              position: 'absolute',
              top: 16,
              right: 16,
              zIndex: 1200,
              bgcolor: theme.colors.surface,
              color: theme.colors.text,
              borderRadius: 999,
              width: 40,
              height: 40,
              boxShadow: theme.isDark ? '0 4px 15px rgba(0,0,0,0.4)' : '0 2px 8px rgba(60,64,67,.06)',
              transition: 'all 0.3s ease',
              '&:hover': {
                bgcolor: theme.colors.primary,
                color: '#fff',
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 15px rgba(25, 118, 210, 0.2)',
              },
              '&:active': {
                transform: 'translateY(0)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              },
            }}
          >
            {isCalendarFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </IconButton>
        </Box>

        {/* Sidomeny (desktop) */}
        {!isMobile && (
          <Grow in={sidebarOpen} timeout={300}>
            <Paper
              sx={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: 400,
                height: '100%',
                bgcolor: theme.colors.surface,
                borderLeft: `1px solid ${theme.colors.border}`,
                borderTopRightRadius: 2,
                borderBottomRightRadius: 2,
                boxShadow: theme.isDark ? '0 4px 20px rgba(0,0,0,0.3)' : '0 2px 8px rgba(60,64,67,.06)',
                overflowY: 'auto',
                p: 2,
                zIndex: 1100
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: theme.colors.text }}>
                    Inbjudningar
                  </Typography>
                  <IconButton
                    onClick={() => setSidebarOpen(false)}
                    sx={{
                      color: theme.colors.text,
                      '&:hover': {
                        bgcolor: theme.colors.primary,
                        color: '#fff',
                      },
                    }}
                  >
                    <ChevronLeftIcon />
                  </IconButton>
                </Box>
                
                {/* Flikmeny */}
                <Box sx={{ display: 'flex', borderBottom: `1px solid ${theme.colors.border}`, mb: 1 }}>
                  <Button
                    onClick={() => setSidebarTab('invitations')}
                    sx={{
                      flex: 1,
                      borderRadius: 999,
                      py: 1.2,
                      fontWeight: 600,
                      fontSize: 14,
                      color: sidebarTab === 'invitations' ? '#1976d2' : theme.colors.text,
                      bgcolor: sidebarTab === 'invitations' ? 'transparent' : 'none',
                      border: sidebarTab === 'invitations' ? `1px solid ${theme.colors.primary}` : 'none',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        bgcolor: sidebarTab === 'invitations' ? 'transparent' : theme.colors.primary,
                        color: '#fff',
                      },
                    }}
                  >
                    Inbjudningar
                  </Button>
                  <Button
                    onClick={() => setSidebarTab('contacts')}
                    sx={{
                      flex: 1,
                      borderRadius: 999,
                      py: 1.2,
                      fontWeight: 600,
                      fontSize: 14,
                      color: sidebarTab === 'contacts' ? '#1976d2' : theme.colors.text,
                      bgcolor: sidebarTab === 'contacts' ? 'transparent' : 'none',
                      border: sidebarTab === 'contacts' ? `1px solid ${theme.colors.primary}` : 'none',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        bgcolor: sidebarTab === 'contacts' ? 'transparent' : theme.colors.primary,
                        color: '#fff',
                      },
                    }}
                  >
                    Kontakter
                  </Button>
                </Box>

                {/* Innehåll för flikarna */}
                {sidebarTab === 'invitations' && (
                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {invitations.length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        Inga nya inbjudningar.
                      </Typography>
                    )}
                    {invitations.map((invitation) => (
                      <Paper
                        key={invitation.id}
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          border: `1px solid ${theme.colors.border}`,
                          bgcolor: theme.colors.surface,
                          boxShadow: theme.isDark ? '0 4px 15px rgba(0,0,0,0.2)' : 'none',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                          '&:hover': {
                            transform: 'translateY(-2px)',
                            boxShadow: theme.isDark ? '0 6px 20px rgba(0,0,0,0.3)' : '0 4px 15px rgba(60,64,67,.15)',
                          },
                        }}
                      >
                        <Typography sx={{ fontWeight: 600, color: theme.colors.text }}>
                          Du har fått en ny inbjudan
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#666', mb: 1 }}>
                          Från: {invitation.from}
                        </Typography>
                        <Button
                          variant="contained"
                          color="primary"
                          size="small"
                          onClick={() => handleInvitationResponse(invitation.id, 'accept')}
                          sx={{
                            borderRadius: 999,
                            px: 3,
                            py: 1,
                            fontWeight: 600,
                            fontSize: 12,
                            minWidth: 0,
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              bgcolor: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)',
                              boxShadow: '0 0 0 4px #e9e5ff, 0 8px 24px 0 rgba(99,91,255,0.18)',
                              transform: 'scale(1.03)',
                            },
                            '&:active': {
                              bgcolor: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                              boxShadow: '0 0 0 2px #bcb8ff, 0 2px 8px 0 rgba(99,91,255,0.13)',
                              transform: 'scale(0.98)',
                            },
                          }}
                        >
                          Acceptera
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() => handleInvitationResponse(invitation.id, 'reject')}
                          sx={{
                            borderRadius: 999,
                            px: 3,
                            py: 1,
                            fontWeight: 600,
                            fontSize: 12,
                            minWidth: 0,
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              bgcolor: 'rgba(211, 47, 47, 0.1)',
                              color: '#d32f2f',
                            },
                            '&:active': {
                              bgcolor: 'rgba(211, 47, 47, 0.2)',
                            },
                          }}
                        >
                          Avböj
                        </Button>
                      </Paper>
                    ))}
                  </Box>
                )}
                {sidebarTab === 'contacts' && (
                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <ContactBook 
                      contacts={contacts} 
                      onAddContact={addContact} 
                      onRemoveContact={removeContact} 
                      onUpdateContact={updateContact} 
                      myEmail={user.email || user.emails?.[0]?.value || user.emails?.[0]}
                      groupId={groupId}
                      directAccess={directAccess}
                      isMobile={isMobile}
                    />
                  </Box>
                )}
              </Box>
            </Paper>
          </Grow>
        )}
      </Box>  {/* ← DETTA ska stänga kalendersektionens Box */}
    </div>  {/* ← DETTA stänger yttersta div från rad ~1570 */}

    {/* Toast-meddelanden */}
    <Snackbar
      open={toast.open}
      autoHideDuration={6000}
      onClose={() => setToast({ ...toast, open: false })}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert 
        onClose={() => setToast({ ...toast, open: false })} 
        severity={toast.severity} 
        sx={{ 
          width: '100%', 
          maxWidth: 600, 
          borderRadius: 2,
          ...(toast.severity === 'success' && {
            bgcolor: '#e8f5e9',
            color: '#2e7d32',
            border: '1px solid #4caf50',
          }),
          ...(toast.severity === 'error' && {
            bgcolor: '#ffebee',
            color: '#c62828',
            border: '1px solid #f44336',
          }),
          ...(toast.severity === 'warning' && {
            bgcolor: '#fff3e0',
            color: '#e65100',
            border: '1px solid #ff9800',
          }),
          ...(toast.severity === 'info' && {
            bgcolor: '#e3f2fd',
            color: '#0d47a1',
            border: '1px solid #1976d2',
          }),
        }}
      >
        {toast.message}
      </Alert>
    </Snackbar>

    {/* Tutorial overlay */}
    {showTutorial && (
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1400,
          p: 2,
        }}
      >
        <Paper
          sx={{
            bgcolor: theme.colors.surface,
            borderRadius: 2,
            p: 3,
            maxWidth: 400,
            width: '100%',
            boxShadow: theme.isDark ? '0 4px 20px rgba(0,0,0,0.3)' : '0 2px 8px rgba(60,64,67,.06)',
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600, color: theme.colors.text, mb: 2 }}>
            {tutorialSteps[tutorialStep].title}
          </Typography>
          <Typography variant="body2" sx={{ color: theme.colors.text, mb: 2 }}>
            {tutorialSteps[tutorialStep].content}
          </Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={nextTutorialStep}
            sx={{ 
              borderRadius: 999,
              px: 3,
              py: 1.5,
              fontWeight: 600,
              fontSize: 14,
              width: '100%',
              transition: 'all 0.3s ease',
              '&:hover': {
                bgcolor: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)',
                boxShadow: '0 0 0 4px #e9e5ff, 0 8px 24px 0 rgba(99,91,255,0.18)',
                transform: 'scale(1.03)',
              },
              '&:active': {
                bgcolor: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                boxShadow: '0 0 0 2px #bcb8ff, 0 2px 8px 0 rgba(99,91,255,0.13)',
                transform: 'scale(0.98)',
              },
            }}
          >
            {tutorialStep === tutorialSteps.length - 1 ? 'Avsluta' : 'Nästa steg'}
          </Button>
          <Button
            onClick={closeTutorial}
            sx={{ 
              color: theme.colors.textSecondary,
              mt: 1,
              textTransform: 'none',
              '&:hover': {
                bgcolor: 'transparent',
                color: theme.colors.primary,
              },
            }}
          >
            Hoppa över tutorial
          </Button>
        </Paper>
      </Box>
    )}
    </>
  );
}