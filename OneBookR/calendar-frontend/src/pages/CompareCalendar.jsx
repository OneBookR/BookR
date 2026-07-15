import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/sv';
import 'react-big-calendar/lib/css/react-big-calendar.css';

// ✅ CLEAN IMPORTS - Ta bort onödiga imports
import '../styles/theme.css';
import {
  Card, CardContent, Typography, Button, TextField, Box, Dialog, DialogTitle,
  DialogActions, Paper, CircularProgress, Snackbar, Alert, IconButton, Chip
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { apiRequest, createApiUrl } from '../utils/apiConfig.js';
import { TokenValidator } from '../utils/tokenValidator.js';
import InviteFriend from './InviteFriend';
import { useNotifications } from '../hooks/useNotifications.js';

moment.locale('sv');
const localizer = momentLocalizer(moment);

export default function CompareCalendar({
  myToken,
  invitedTokens = [],
  user,
  groupId: propGroupId,
  directAccess,
  contactEmail,
  contactName,
  autoCompare = false
}) {
  const theme = { 
    colors: { surface: '#fff', border: '#e0e3e7', text: '#222', bg: '#f7f9fb' } 
  };
  
  // ✅ INLINE STYLES - NO HOOKS
  const styles = {
    calendar: {
      fontFamily: "'Inter', 'Segoe UI', 'Roboto', 'Arial', sans-serif",
      background: theme.colors.surface,
      borderRadius: '8px',
      border: `1px solid ${theme.colors.border}`,
      height: '500px'
    },
    eventProps: (event) => ({
      style: {
        backgroundColor: '#e3f2fd',
        color: '#1976d2',
        border: '1px solid #1976d2',
        borderRadius: '4px'
      }
    })
  };

  // ✅ LÄGG TILL SAKNAD userData DEFINITION
  const userData = useMemo(() => ({
    email: user?.email || user?.emails?.[0]?.value || user?.emails?.[0],
    provider: user?.provider || (user?.mail ? 'microsoft' : 'google'),
    isLoggedIn: Boolean(user?.email)
  }), [user]);

  // ✅ FÖRENKLA STATE - Ta bort onödig state
  const [availability, setAvailability] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
  // ✅ ENDAST NÖDVÄNDIGA FORM STATES
  const [timeMin, setTimeMin] = useState('');
  const [timeMax, setTimeMax] = useState('');
  const [meetingDuration, setMeetingDuration] = useState(60);
  const [dayStart, setDayStart] = useState('09:00');
  const [dayEnd, setDayEnd] = useState('17:00');
  
  // ✅ FÖRENKLA DIALOG STATE
  const [suggestDialog, setSuggestDialog] = useState({ open: false, slot: null });
  const [meetingTitle, setMeetingTitle] = useState('');
  const [withMeet, setWithMeet] = useState(true);
  const [meetingLocation, setMeetingLocation] = useState('');
  
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  // ✅ ROBUST RATE LIMITING
  const [requestState, setRequestState] = useState({
    lastFetch: 0,
    inProgress: false
  });

  // ✅ TRACK PREVIOUS SUGGESTIONS FOR DETECTING NEW PROPOSALS
  const previousSuggestionsRef = useRef([]);
  const { showNotification } = useNotifications();
  const [waitingRoom, setWaitingRoom] = useState({
    show: false,
    members: [],
    isCreator: false
  });

  // ✅ GROUP MANAGEMENT STATE (BEHÅLL BARA EN GÅNG)
  const [groupInfo, setGroupInfo] = useState(null);
  const [hasJoinedGroup, setHasJoinedGroup] = useState(false);

  // ✅ LÄGG TILL INCLUDE ALL OPTION
  const [includeAllEvents, setIncludeAllEvents] = useState(false);
  const [showDebugEvents, setShowDebugEvents] = useState(false);
  
  // ✅ MOBILE DETECTION
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ✅ URL PARAMS PROCESSING
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const inviteeEmail = urlParams.get('invitee');
  const isInvitee = Boolean(inviteeEmail);

  // ✅ CLEAN RENDER - SÄKER ANVÄNDNING AV futureSlots (FLYTTA FÖRE ANVÄNDNING)
  const filteredAvailability = useMemo(() => 
    Array.isArray(availability) 
      ? availability.filter(slot => slot?.start && slot?.end && new Date(slot.start) < new Date(slot.end))
      : []
  , [availability]);

  const futureSlots = useMemo(() => {
    const now = new Date();
    
    return filteredAvailability
      .filter(slot => {
        try {
          // ✅ ROBUST FILTERING - ENDAST FRAMTIDA SLOTS
          const slotStart = new Date(slot.start);
          const slotEnd = new Date(slot.end);
          
          // Validera tiderna
          if (isNaN(slotStart.getTime()) || isNaN(slotEnd.getTime())) {
            return false;
          }
          
          // ✅ KRITIK: Slot måste SLUTA i framtiden (för att inte visa gamla slots)
          // Exempel: Om nu är 12:47:
          // - Slot 09:00-10:00 = FALSE (slutar innan nu)
          // - Slot 10:00-11:00 = FALSE (slutar innan nu)
          // - Slot 11:00-12:00 = FALSE (slutar innan nu)
          // - Slot 12:00-13:00 = TRUE (slutar efter nu, även om det började innan nu)
          // - Slot 13:00-14:00 = TRUE (helt i framtiden)
          
          // Slot är framtida om den slutar EFTER nu (med 1 min marginal för UI)
          const oneMinuteFromNow = new Date(now.getTime() + 60000);
          return slotEnd > oneMinuteFromNow;
        } catch {
          return false;
        }
      })
      .sort((a, b) => {
        try {
          return new Date(a.start) - new Date(b.start);
        } catch {
          return 0;
        }
      });
  }, [filteredAvailability]);



  // ✅ FETCH GROUP AVAILABILITY (ERSÄTT GAMLA FUNKTIONER)
  // ✅ REMOVED OLD fetchState - SIMPLIFIED REFRESHING LOGIC

  // ✅ ROBUST TOKEN VALIDATION USING EXISTING VALIDATOR (FLYTTA FÖRE ANVÄNDNING)
  const validateToken = useCallback(async () => {
    if (!myToken) {
      return Boolean(propGroupId && userData.isLoggedIn);
    }
    
    try {
      const isValid = await TokenValidator.validateToken(myToken);
      
      if (!isValid) {
        setError('Din session har gått ut. Loggar ut...');
        TokenValidator.handleTokenExpiration();
      }
      
      return isValid;
    } catch (error) {
      console.error('❌ Token validation error:', error);
      return false;
    }
  }, [myToken, propGroupId, userData.isLoggedIn]);

  // ✅ JOIN GROUP AUTOMATICALLY - FIXA API URL (FLYTTA FÖRE fetchGroupAvailability)
  const joinGroup = useCallback(async () => {
    if (!propGroupId || !user) return false;
    
    // ✅ VALIDERA TOKEN FÖRST
    const isTokenValid = await validateToken();
    if (!isTokenValid) {
      console.log('❌ Cannot join group - invalid token');
      return false;
    }
    
    try {
      const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0];
      
      console.log(`👥 Joining group ${propGroupId} as ${userEmail}`);
      
      const response = await apiRequest(`/api/group/${propGroupId}/join`, {
        method: 'POST',
        body: JSON.stringify({
          email: userEmail,
          token: myToken
        })
      });
      
      if (response.status === 401) {
        console.log('❌ 401 Unauthorized when joining group');
        setError('Din session har gått ut. Omdirigerar till inloggning...');
        TokenValidator.handleTokenExpiration();
        return false;
      }
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Joined group successfully:', data);
        setHasJoinedGroup(true);
        return true;
      } else {
        console.error('❌ Failed to join group:', response.status);
        return false;
      }
    } catch (error) {
      console.error('❌ Join group error:', error);
      return false;
    }
  }, [propGroupId, user, myToken, validateToken]);

  // ✅ REMOVED OLD fetchGroupAvailability - REPLACED WITH UNIFIED fetchAvailability

  // ✅ FETCH GROUP STATUS - FIXA API URL
  const fetchGroupStatus = useCallback(async () => {
    if (!propGroupId) return;
    
    try {
      const response = await apiRequest(`/api/group/${propGroupId}/status`);
      
      if (response.ok) {
        const data = await response.json();
        setGroupInfo(data);
        console.log('✅ Group status:', data);
      }
    } catch (error) {
      console.error('❌ Failed to fetch group status:', error);
    }
  }, [propGroupId]);

  // ✅ SETUP: Join group och initial status
  useEffect(() => {
    if (propGroupId && !hasJoinedGroup) {
      joinGroup().then(success => {
        if (success) fetchGroupStatus();
      });
    }
  }, [propGroupId, hasJoinedGroup]);

  // ✅ AUTO-REFRESH: Endast för skapare när alla anslutit
  useEffect(() => {
    if (!propGroupId || !groupInfo || !user) return;
    
    const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0];
    const isCreator = groupInfo.members?.some(m => m.email === userEmail && m.isCreator);
    
    if (!isCreator) return;
    
    const reloadKey = `bookr_refreshed_${propGroupId}`;
    if (sessionStorage.getItem(reloadKey) === 'true') return;
    
    const pendingCount = groupInfo.pendingMembers?.length || 0;
    const memberCount = groupInfo.memberCount || 0;
    
    if (pendingCount === 0 && memberCount >= 2) {
      console.log('🎉 AUTO-REFRESH: Alla anslutna!');
      sessionStorage.setItem(reloadKey, 'true');
      window.location.reload();
    }
  }, [propGroupId, groupInfo, user]);
  
  // ✅ POLLING: Enkel 3-sekunders polling
  useEffect(() => {
    if (!propGroupId || !hasJoinedGroup) return;
    
    const timer = setInterval(() => {
      fetchGroupStatus();
      fetchSuggestions(); // ✅ Uppdatera även förslag
    }, 3000);
    
    return () => clearInterval(timer);
  }, [propGroupId, hasJoinedGroup]);



  // ✅ UPPDATERA AVAILABILITY FETCH FUNCTION - VISA LEDIGA TIDER FRÅN IDAG
  const fetchAvailability = useCallback(async () => {
    // Förhindra samtidiga anrop
    if (isLoading) {
      console.log('⏳ Already fetching, skipping...');
      return;
    }
    
    // ✅ VALIDERA TOKEN FÖRST
    const isTokenValid = await validateToken();
    if (!isTokenValid) {
      setError('Token ogiltig - omdirigerar till inloggning...');
      return;
    }
    
    setIsLoading(true);
    setHasSearched(true);
    setError(null);

    try {
      let endpoint;
      let requestOptions;
      
      // ✅ FÖRBÄTTRAD TIDSINTERVALL BERÄKNING - FRÅN IDAG
      const now = new Date();
      
      // Om vi har specificerat start/end, använd dem
      let startTime, endTime;
      
      if (timeMin && timeMax) {
        // Användaren har valt specifika datum
        startTime = new Date(timeMin).toISOString();
        endTime = new Date(timeMax).toISOString();
      } else {
        // Default: från idag (från nu) till 2 veckor senare
        // Sätt start tid till början av idag
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        
        const twoWeeksLater = new Date(today);
        twoWeeksLater.setDate(twoWeeksLater.getDate() + 14); // 14 dagar = 2 veckor från idag
        twoWeeksLater.setHours(23, 59, 59, 999); // Sätt till slutet av dagen
        
        startTime = today.toISOString();
        endTime = twoWeeksLater.toISOString();
      }
      
      if (propGroupId) {
        // ✅ GROUP ENDPOINT MED KORREKT API URL
        console.log(`🔍 Fetching group availability for ${propGroupId}`);
        
        const params = new URLSearchParams({
          timeMin: startTime,
          timeMax: endTime,
          duration: String(meetingDuration),
          dayStart,
          dayEnd,
          includeAll: String(includeAllEvents)
        });
        
        endpoint = createApiUrl(`/api/group/${propGroupId}/availability?${params}`);
        requestOptions = {
          method: 'GET',
          credentials: 'include'
        };
      } else {
        // ✅ DIRECT COMPARISON MED KORREKT API URL
        console.log(`🔍 Direct calendar comparison`);
        
        const validTokens = [myToken, ...invitedTokens].filter(Boolean);
        
        if (validTokens.length < 2) {
          setError('Behöver minst två kalendrar för jämförelse');
          return;
        }
        
        endpoint = createApiUrl('/api/availability');
        requestOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            tokens: validTokens,
            timeMin: startTime,
            timeMax: endTime,
            duration: meetingDuration,
            dayStart,
            dayEnd,
            includeAll: includeAllEvents
          })
        };
      }
      
      console.log('📤 Making request to:', endpoint);
      console.log('📅 Date range:', { startTime: new Date(startTime).toLocaleString('sv-SE'), endTime: new Date(endTime).toLocaleString('sv-SE') });
      
      const response = await fetch(endpoint, requestOptions);
      
      if (response.status === 401) {
        console.log('❌ 401 Unauthorized - token expired');
        setError('Din session har gått ut. Omdirigerar till inloggning...');
        TokenValidator.handleTokenExpiration();
        return;
      }
      
      if (response.status === 429) {
        setError('För många förfrågningar. Vänta en minut och försök igen.');
        return;
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.requiresReauth || errorData.code === 'TOKEN_EXPIRED') {
          setError('Din session har gått ut. Omdirigerar till inloggning...');
          TokenValidator.handleTokenExpiration();
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // ✅ VALIDERA OCH RENSA DATA
      const validSlots = Array.isArray(data) ? data.filter(slot => 
        slot?.start && 
        slot?.end && 
        !isNaN(new Date(slot.start).getTime()) &&
        !isNaN(new Date(slot.end).getTime()) &&
        new Date(slot.start) < new Date(slot.end)
      ) : [];
      
      console.log(`✅ Received ${validSlots.length} valid availability slots`);
      
      setAvailability(validSlots);
      
      // ✅ ANVÄNDARFEEDBACK
      if (validSlots.length === 0) {
        setToast({ 
          open: true, 
          message: includeAllEvents 
            ? 'Inga gemensamma lediga tider hittades även med alla events inkluderade. Alla har upptagna kalendrar under denna period.' 
            : 'Inga gemensamma lediga tider hittades under denna period. Prova att aktivera "Inkludera alla events" eller justera datum/arbetstider.', 
          severity: 'warning' 
        });
      } else {
        const memberCount = propGroupId ? groupInfo?.memberCount || 2 : 2;
        setToast({ 
          open: true, 
          message: `Hittade ${validSlots.length} gemensamma lediga tider där alla ${memberCount} deltagare är lediga!${includeAllEvents ? ' (Alla events inkluderade)' : ''}`, 
          severity: 'success' 
        });
      }
      
    } catch (err) {
      console.error('❌ Fetch availability error:', err);
      setError(`Kunde inte hämta kalenderjämförelse: ${err.message}`);
      setAvailability([]);
    } finally {
      setIsLoading(false);
    }
  }, [
    isLoading,
    propGroupId,
    myToken,
    invitedTokens,
    timeMin,
    timeMax,
    meetingDuration,
    dayStart,
    dayEnd,
    groupInfo?.memberCount,
    includeAllEvents,
    validateToken
  ]);

  // ✅ AUTO-FETCH ENDAST EFTER REFRESH - INTE INNAN
  useEffect(() => {
    if (!propGroupId || !hasJoinedGroup || !groupInfo) return;
    
    const reloadKey = `bookr_refreshed_${propGroupId}`;
    const hasRefreshed = sessionStorage.getItem(reloadKey) === 'true';
    
    // Endast auto-fetch EFTER att vi har refreshat och alla är anslutna
    if (hasRefreshed && groupInfo.memberCount >= 2 && !hasSearched && !isLoading) {
      console.log('✅ Efter refresh - startar automatisk kalenderjämförelse');
      const timer = setTimeout(() => {
        fetchAvailability();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [propGroupId, hasJoinedGroup, groupInfo?.memberCount, hasSearched, isLoading, fetchAvailability]);

  // ✅ FÖRBÄTTRAD KALENDER RENDERING - VISA ENDAST LEDIGA TIDER
  const calendarEvents = useMemo(() => {
    // ✅ ANVÄND futureSlots ISTÄLLET FÖR filteredAvailability
    return futureSlots.map((slot, index) => ({
      id: `free-slot-${index}`,
      title: `Ledig tid (${slot.duration || meetingDuration} min)`,
      start: new Date(slot.start),
      end: new Date(slot.end),
      resource: 'free_time',
      allDay: false
    }));
  }, [futureSlots, meetingDuration]);

  // ✅ KALENDER EVENT STYLING
  const eventPropGetter = useCallback((event) => {
    if (event.resource === 'free_time') {
      return {
        style: {
          backgroundColor: '#4caf50',
          color: '#ffffff',
          border: '2px solid #388e3c',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '600',
          padding: '2px 6px'
        }
      };
    }
    
    return {
      style: {
        backgroundColor: '#e3f2fd',
        color: '#1976d2',
        border: '1px solid #1976d2',
        borderRadius: '4px'
      }
    };
  }, []);

  // ✅ FETCH SUGGESTIONS FUNCTION - FIXA API URL
  const fetchSuggestions = useCallback(async () => {
    if (!propGroupId) return;

    try {
      const response = await apiRequest(`/api/group/${propGroupId}/suggestions`);

      if (response.ok) {
        const data = await response.json();
        const newSuggestions = data.suggestions || [];

        // ✅ DETECT NEW PROPOSALS
        const previousIds = previousSuggestionsRef.current.map(s => s.id);
        const newProposals = newSuggestions.filter(s => !previousIds.includes(s.id));

        if (newProposals.length > 0) {
          newProposals.forEach(proposal => {
            const startTime = new Date(proposal.start).toLocaleTimeString('sv-SE', {
              hour: '2-digit',
              minute: '2-digit'
            });

            showNotification('📋 Nytt tidsförslag!', {
              body: `${proposal.title} - ${startTime}`,
              requireInteraction: true
            });
          });
        }

        // ✅ UPDATE TRACKING
        previousSuggestionsRef.current = newSuggestions;
        setSuggestions(newSuggestions);
      }
    } catch (error) {
      console.error('❌ Failed to fetch suggestions:', error);
    }
  }, [propGroupId, showNotification]);

  // ✅ HANDLE SUGGEST FUNCTION
  const handleSuggest = useCallback((slot) => {
    if (!slot) return;
    setSuggestDialog({ open: true, slot });
  }, []);

  // ✅ CONFIRM SUGGEST FUNCTION - FÖRBÄTTRAD MED ERROR HANDLING
  const confirmSuggest = useCallback(async () => {
    if (!suggestDialog.slot || !propGroupId) return;
    
    // ✅ VALIDERA INPUT
    if (!meetingTitle.trim()) {
      setToast({ open: true, message: 'Mötestitel krävs', severity: 'error' });
      return;
    }

    if (meetingTitle.length > 200) {
      setToast({ open: true, message: 'Mötestitel kan inte vara längre än 200 tecken', severity: 'error' });
      return;
    }

    try {
      const response = await apiRequest(`/api/group/${propGroupId}/suggest`, {
        method: 'POST',
        body: JSON.stringify({
          start: suggestDialog.slot.start,
          end: suggestDialog.slot.end,
          email: user?.email || user?.emails?.[0]?.value || user?.emails?.[0],
          title: meetingTitle.trim(),
          withMeet,
          location: meetingLocation.trim()
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Kunde inte skicka förslag');
      }

      const data = await response.json();
      
      setToast({ 
        open: true, 
        message: `✅ Mötesförslag skickat! Väntar på svar från ${Object.keys(data.suggestion.votes).length} deltagare.`, 
        severity: 'success' 
      });
      
      setSuggestDialog({ open: false, slot: null });
      setMeetingTitle('');
      setMeetingLocation('');
      
      // ✅ UPPDATERA SUGGESTIONS LISTAN
      fetchSuggestions();
      
    } catch (error) {
      console.error('❌ Suggest error:', error);
      setToast({ 
        open: true, 
        message: `Fel: ${error.message}`, 
        severity: 'error' 
      });
    }
  }, [suggestDialog.slot, propGroupId, user, meetingTitle, meetingLocation, withMeet, fetchSuggestions]);

  // ✅ VOTE SUGGESTION FUNCTION - FÖRBÄTTRAD
  const voteSuggestion = useCallback(async (suggestionId, vote) => {
    if (!propGroupId) return;
    
    try {
      const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0];
      
      const response = await apiRequest(`/api/group/${propGroupId}/suggestion/${suggestionId}/vote`, {
        method: 'POST',
        body: JSON.stringify({
          email: userEmail,
          vote
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Kunde inte registrera röst');
      }

      const data = await response.json();
      
      // ✅ VISA FEEDBACK BASERAT PÅ RESULTAT
      if (vote === 'accepted') {
        setToast({ 
          open: true, 
          message: data.suggestion.status === 'accepted' 
            ? '🎉 Du accepterade! Möte skapas för alla.' 
            : '✅ Du accepterade förslaget!', 
          severity: 'success' 
        });
      } else {
        setToast({ 
          open: true, 
          message: '❌ Du nekade förslaget.', 
          severity: 'info' 
        });
      }

      // ✅ UPPDATERA SUGGESTIONS LISTAN
      fetchSuggestions();
      
    } catch (error) {
      console.error('❌ Vote error:', error);
      setToast({ 
        open: true, 
        message: `Röstningsfel: ${error.message}`, 
        severity: 'error' 
      });
    }
  }, [propGroupId, user, fetchSuggestions]);

  // ✅ INITIAL SUGGESTIONS FETCH
  useEffect(() => {
    if (!propGroupId) return;
    fetchSuggestions();
  }, [propGroupId]);

  // ✅ LÄGG TILL SAKNAD DEBUG-FUNKTION (FLYTTA FÖRE ANVÄNDNING)
  const fetchDebugEvents = useCallback(async () => {
    if (!propGroupId) return;
    
    try {
      const now = new Date();
      const defaultStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const defaultEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      
      const startTime = timeMin ? new Date(timeMin).toISOString() : defaultStart.toISOString();
      const endTime = timeMax ? new Date(timeMax).toISOString() : defaultEnd.toISOString();
      
      const params = new URLSearchParams({
        timeMin: startTime,
        timeMax: endTime
      });
      
      const response = await apiRequest(`/api/group/${propGroupId}/debug-events?${params}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('🔍 Debug Events Data:', data);
        
        // Visa i en alert eller modal
        const summary = data.debugData.map(member => 
          `${member.email}: ${member.totalEvents || 0} events total, ${member.processedEvents || 0} processed`
        ).join('\n');
        
        alert(`Debug Events Summary:\n\n${summary}\n\nSe konsolen för fullständiga detaljer.`);
      }
    } catch (error) {
      console.error('Debug events error:', error);
    }
  }, [propGroupId, timeMin, timeMax]);

  // ✅ ROBUST RENDERING FUNCTIONS - FLYTTA FÖRE MAIN RETURN
  const renderComparisonForm = useCallback(() => (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 3, md: 4 },
        mb: 3,
        borderRadius: 4,
        border: '1px solid var(--border)',
        bgcolor: 'rgba(255,255,255,0.76)',
        backdropFilter: 'blur(18px)',
        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)'
      }}
    >
      <Chip
        label="Compare Calendar"
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
      <Typography variant="h3" sx={{ mb: 1.25, fontWeight: 800, letterSpacing: '-0.05em', color: 'var(--text)', fontSize: { xs: '2rem', md: '3rem' }, lineHeight: 0.98 }}>
        Hitta en gemensam tid utan att lämna flödet.
        {propGroupId && (
          <Chip 
            label={`Grupp: ${groupInfo?.name || 'Laddar...'}`} 
            size="small"
            sx={{ ml: 2, bgcolor: 'rgba(17,24,39,0.05)', color: 'var(--text)', fontWeight: 700, border: '1px solid rgba(17,24,39,0.06)' }}
          />
        )}
      </Typography>
      <Typography sx={{ color: 'var(--text-secondary)', maxWidth: 760, mb: 3, lineHeight: 1.7 }}>
        Jämför tillgänglighet, se vilka som redan är inne och skicka ett mötesförslag i samma lugna gränssnitt som resten av BookR.
      </Typography>

      {!propGroupId && (
        <InviteFriend fromUser={user} embedded />
      )}
      
      {/* ✅ AUTO-REFRESH STATUS */}
      {propGroupId && groupInfo && groupInfo.pendingMembers?.length === 0 && groupInfo.memberCount >= 2 && (
        <Box sx={{ mb: 3, p: 2, bgcolor: 'rgba(31,122,77,0.08)', borderRadius: 3, border: '1px solid rgba(31,122,77,0.16)' }}>
          <Typography variant="subtitle2" sx={{ mb: 1, color: 'var(--success)', fontWeight: 700 }}>
            Alla medlemmar är anslutna
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
            Nu kan du jämföra alla kalendrar för att hitta gemensamma lediga tider.
          </Typography>
        </Box>
      )}
      
      {/* ✅ GRUPPINFORMATION */}
      {groupInfo && (
        <Box sx={{ mb: 3, p: 2.25, bgcolor: 'rgba(17,24,39,0.03)', borderRadius: 3, border: '1px solid rgba(17,24,39,0.05)' }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, color: 'var(--text)', fontWeight: 700 }}>
            Gruppinformation
          </Typography>
          <Typography variant="body2" sx={{ mb: 1, color: 'var(--text-secondary)' }}>
            <strong>Namn:</strong> {groupInfo.name}
          </Typography>
          <Typography variant="body2" sx={{ mb: 1.5, color: 'var(--text-secondary)' }}>
            <strong>Anslutna medlemmar:</strong> {groupInfo.memberCount}
          </Typography>
          
          {/* ✅ VISA ANSLUTNA MEDLEMMAR MED EMAILS */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ color: 'var(--text-secondary)', fontWeight: 700, display: 'block', mb: 1 }}>
              Anslutna ({groupInfo.members?.length || 0})
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {groupInfo.members?.map((member, index) => (
                <Chip
                  key={index}
                  label={`${member.isCreator ? 'Skapare • ' : ''}${member.email}`}
                  size="small"
                  sx={{ fontSize: '0.75rem', bgcolor: member.isCreator ? 'rgba(17,24,39,0.08)' : 'rgba(17,24,39,0.04)', color: 'var(--text)', border: '1px solid rgba(17,24,39,0.06)' }}
                />
              ))}
            </Box>
          </Box>

          {/* ✅ VISA VÄNTANDE MEDLEMMAR MED EMAILS */}
          {groupInfo.pendingMembers && groupInfo.pendingMembers.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ color: 'var(--text-secondary)', fontWeight: 700, display: 'block', mb: 1 }}>
                Väntar på ({groupInfo.pendingMembers.length})
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {groupInfo.pendingMembers.map((email, index) => (
                  <Chip
                    key={index}
                    label={email}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.75rem', borderColor: 'rgba(17,24,39,0.08)', color: 'var(--text-secondary)' }}
                  />
                ))}
              </Box>
              <Typography variant="caption" sx={{ color: 'var(--text-secondary)', display: 'block', mt: 1, fontStyle: 'italic' }}>
                Dessa personer har fått inbjudningar men har inte anslutit än.
              </Typography>
            </Box>
          )}
          
          {groupInfo.memberCount < 2 && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              <Typography variant="caption">
                ⚠️ Väntar på att fler medlemmar ska ansluta för att kunna jämföra kalendrar...
              </Typography>
            </Alert>
          )}
        </Box>
      )}
      
      {/* ✅ VISA STATUS FÖR KALENDRAR - ANVÄND userData KORREKT */}
      <Box sx={{ mb: 3, p: 2.25, bgcolor: 'rgba(17,24,39,0.025)', borderRadius: 3, border: '1px solid rgba(17,24,39,0.05)' }}>
        <Typography variant="subtitle2" sx={{ mb: 1, color: 'var(--text)', fontWeight: 700 }}>
          Kalendrar som jämförs
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {myToken && (
            <Chip 
              label={`Din kalender (${userData.email || 'okänd'})`} 
              size="small" 
              sx={{ bgcolor: 'rgba(17,24,39,0.08)', color: 'var(--text)', border: '1px solid rgba(17,24,39,0.06)' }}
            />
          )}
          {propGroupId && groupInfo?.members && groupInfo.members
            .filter(member => member.email !== userData.email)
            .map((member, index) => (
              <Chip 
                key={index}
                label={`${member.email} ${member.isCreator ? '(skapare)' : ''}`}
                size="small" 
                sx={{ bgcolor: 'rgba(17,24,39,0.04)', color: 'var(--text)', border: '1px solid rgba(17,24,39,0.06)' }}
              />
            ))}
          {contactEmail && (
            <Chip 
              label={contactEmail} 
              size="small" 
              sx={{ bgcolor: 'rgba(17,24,39,0.04)', color: 'var(--text)', border: '1px solid rgba(17,24,39,0.06)' }}
            />
          )}
        </Box>
        
        {/* ✅ FÖRBÄTTRADE STATUSMEDDELANDEN */}
        {!propGroupId && [myToken, ...invitedTokens].filter(Boolean).length < 2 && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            ⚠️ Behöver minst 2 kalendrar för jämförelse
          </Alert>
        )}
        
        {propGroupId && (!groupInfo || groupInfo.memberCount < 2) && (
          <Alert severity="info" sx={{ mt: 1 }}>
            <Typography variant="body2">
              ⏳ Väntar på att fler medlemmar ska ansluta gruppen
            </Typography>
            {groupInfo?.pendingMembers && groupInfo.pendingMembers.length > 0 && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                Inbjudningar skickade till: {groupInfo.pendingMembers.join(', ')}
              </Typography>
            )}
          </Alert>
        )}
      </Box>
      
      {/* ✅ NYA AVANCERADE ALTERNATIV */}
      <Box sx={{ mb: 3, p: 2.25, bgcolor: 'rgba(17,24,39,0.025)', borderRadius: 3, border: '1px solid rgba(17,24,39,0.05)' }}>
        <Typography variant="subtitle2" sx={{ mb: 2, color: 'var(--text)', fontWeight: 700 }}>
          Avancerade alternativ
        </Typography>
        
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <input 
              type="checkbox" 
              id="includeAllEvents"
              checked={includeAllEvents}
              onChange={(e) => setIncludeAllEvents(e.target.checked)}
            />
            <label htmlFor="includeAllEvents" style={{ cursor: 'pointer' }}>
              <Typography variant="body2">
                <strong>Inkludera alla events</strong> - Även tentativa, transparenta och heldagsevent
              </Typography>
            </label>
          </Box>
          
          {process.env.NODE_ENV === 'development' && propGroupId && (
            <Button
              variant="outlined"
              size="small"
              onClick={fetchDebugEvents}
              sx={{ alignSelf: 'flex-start', borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              Debug Events
            </Button>
          )}
        </Box>
        
        <Typography variant="caption" sx={{ display: 'block', color: 'var(--text-secondary)', mt: 1 }}>
          Om du inte ser alla kalenderevent kan du aktivera "Inkludera alla events".
        </Typography>
      </Box>
      
      {/* ✅ FÖRENKLAD FORM */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Från datum"
            type="date"
            value={timeMin ? timeMin.split('T')[0] : ''}
            onChange={e => setTimeMin(e.target.value ? `${e.target.value}T00:00` : '')}
            InputLabelProps={{ shrink: true }}
            sx={{ flex: 1, minWidth: 200 }}
            helperText="Lämna tom för imorgon"
          />
          <TextField
            label="Till datum"
            type="date"
            value={timeMax ? timeMax.split('T')[0] : ''}
            onChange={e => setTimeMax(e.target.value ? `${e.target.value}T23:59` : '')}
            InputLabelProps={{ shrink: true }}
            sx={{ flex: 1, minWidth: 200 }}
            helperText="Lämna tom för +2 veckor"
          />
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Möteslängd (minuter)"
            type="number"
            value={meetingDuration}
            onChange={e => setMeetingDuration(Number(e.target.value))}
            inputProps={{ min: 15, max: 480, step: 15 }}
            sx={{ width: 180 }}
          />
          <TextField
            label="Arbetsdag start"
            type="time"
            value={dayStart}
            onChange={e => setDayStart(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 140 }}
          />
          <TextField
            label="Arbetsdag slut"
            type="time"
            value={dayEnd}
            onChange={e => setDayEnd(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 140 }}
          />
        </Box>
      </Box>
      
      <Button 
        onClick={fetchAvailability}
        variant="contained"
        disabled={
          isLoading || 
          (propGroupId ? (!groupInfo || groupInfo.memberCount < 2) : [myToken, ...invitedTokens].filter(Boolean).length < 2)
        }
        sx={{ px: 4, py: 1.35, fontWeight: 700, borderRadius: 3, bgcolor: 'var(--text)', '&:hover': { bgcolor: '#000' } }}
        size="large"
      >
        {isLoading ? (
          <>
            <CircularProgress size={20} sx={{ mr: 1 }} />
            {propGroupId ? 'Jämför gruppkalendrar...' : 'Jämför kalendrar...'}
          </>
        ) : (
          <>
            {propGroupId ? 'Jämför gruppkalendrar' : 'Jämför kalendrar'}
            {includeAllEvents && ' (Alla events)'}
          </>
        )}
      </Button>
      
      {includeAllEvents && (
        <Typography variant="caption" sx={{ display: 'block', color: 'var(--text-secondary)', mt: 1 }}>
          "Inkludera alla events" är aktivt. Även tentativa och transparenta events räknas som upptagna.
        </Typography>
      )}
    </Paper>
  ), [
    theme,
    propGroupId, 
    groupInfo, 
    user,
    userData,
    myToken, 
    invitedTokens, 
    contactEmail, 
    includeAllEvents, 
    fetchDebugEvents, 
    timeMin, 
    timeMax, 
    meetingDuration, 
    dayStart, 
    dayEnd, 
    fetchAvailability, 
    isLoading
  ]);

  const renderAvailableSlots = useMemo(() => {
    if (!hasSearched) return null;
    
    if (isLoading) {
      return (
        <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 4, textAlign: 'center', border: '1px solid var(--border)', bgcolor: 'rgba(255,255,255,0.76)', boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)' }}>
          <CircularProgress sx={{ mb: 2 }} />
          <Typography>Jämför kalendrar...</Typography>
          <Typography variant="caption" color="text.secondary">
            Detta kan ta några sekunder
          </Typography>
        </Paper>
      );
    }
    
    // ✅ SÄKER CHECK AV futureSlots
    const safeFutureSlots = Array.isArray(futureSlots) ? futureSlots : [];
    
    if (safeFutureSlots.length === 0) {
      return (
        <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 4, textAlign: 'center', bgcolor: 'rgba(17,24,39,0.03)', border: '1px solid rgba(17,24,39,0.06)', boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)' }}>
          <Typography variant="h6" sx={{ mb: 2, color: 'var(--text)' }}>
            Inga gemensamma lediga tider
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Vi hittade inga tider där alla deltagare är lediga samtidigt.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Försök utöka tidsintervallet eller justera arbetstider.
          </Typography>
        </Paper>
      );
    }
    
    // ✅ GRUPPERA SLOTS PER DAG FÖR BÄTTRE ÖVERBLICK
    const slotsByDay = safeFutureSlots.reduce((acc, slot) => {
      if (!slot?.start || !slot?.end) return acc;
      
      try {
        const date = new Date(slot.start).toDateString();
        if (!acc[date]) acc[date] = [];
        acc[date].push(slot);
        return acc;
      } catch {
        return acc;
      }
    }, {});
    
    return (
      <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 4, border: '1px solid var(--border)', bgcolor: 'rgba(255,255,255,0.76)', boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)' }}>
        <Typography variant="h5" sx={{ mb: 1.5, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em' }}>
          Gemensamma lediga tider ({safeFutureSlots.length})
        </Typography>
        
        <Typography variant="body2" sx={{ mb: 3, color: 'var(--text-secondary)' }}>
          Dessa tider passar alla deltagare ({meetingDuration} min möten):
        </Typography>
        
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {Object.entries(slotsByDay).slice(0, 7).map(([dateString, daySlots]) => {
            const date = new Date(dateString);
            const isToday = date.toDateString() === new Date().toDateString();
            const isTomorrow = date.toDateString() === new Date(Date.now() + 24*60*60*1000).toDateString();
            
            return (
              <Box key={dateString}>
                <Typography variant="subtitle1" sx={{ 
                  fontWeight: 700, 
                  color: 'var(--text)', 
                  mb: 2,
                  borderBottom: '1px solid var(--border)',
                  pb: 1
                }}>
                  {isToday ? 'Idag' : isTomorrow ? 'Imorgon' : date.toLocaleDateString('sv-SE', { 
                    weekday: 'long', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </Typography>
                
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  {daySlots.map((slot, slotIndex) => {
                    try {
                      const start = new Date(slot.start);
                      const end = new Date(slot.end);
                      
                      if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
                      
                      const duration = Math.round((end - start) / 60000);
                      
                      return (
                        <Card 
                          key={`${dateString}-${slotIndex}`}
                          sx={{ 
                            p: 2, 
                            minWidth: 200,
                            cursor: propGroupId ? 'pointer' : 'default',
                            '&:hover': propGroupId ? { 
                              bgcolor: 'rgba(17,24,39,0.04)', 
                              transform: 'translateY(-2px)',
                              boxShadow: '0 16px 32px rgba(15,23,42,0.08)'
                            } : {},
                            border: '1px solid rgba(17,24,39,0.06)',
                            borderLeft: '3px solid rgba(17,24,39,0.18)',
                            transition: 'all 0.3s ease',
                            bgcolor: 'rgba(17,24,39,0.025)',
                            boxShadow: 'none',
                            borderRadius: 3
                          }}
                          onClick={propGroupId ? () => handleSuggest(slot) : undefined}
                        >
                          <Typography variant="body1" sx={{ fontWeight: 800, color: 'var(--text)', mb: 1 }}>
                            {start.toLocaleTimeString('sv-SE', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })} - {end.toLocaleTimeString('sv-SE', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            {duration} minuter
                          </Typography>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--text-secondary)' }}>
                            Alla lediga
                          </Typography>
                          
                          {propGroupId && (
                            <Typography variant="caption" sx={{ 
                              display: 'block',
                              color: 'var(--text-secondary)', 
                              fontWeight: 600,
                              mt: 1,
                              opacity: 0.8
                            }}>
                              Klicka för att föreslå
                            </Typography>
                          )}
                        </Card>
                      );
                    } catch (slotError) {
                      console.error('Error rendering slot:', slotError);
                      return null;
                    }
                  })}
                </Box>
              </Box>
            );
          })}
        </Box>
        
        {Object.keys(slotsByDay).length > 7 && (
          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: '#666', mt: 3 }}>
            Visar första 7 dagarna. Totalt {safeFutureSlots.length} lediga tider hittades.
          </Typography>
        )}
      </Paper>
    );
  }, [hasSearched, isLoading, futureSlots, propGroupId, handleSuggest, meetingDuration]);



  // ✅ LÄGG TILL SAKNAD SUGGESTIONS RENDERING
  const renderSuggestions = useCallback(() => {
    if (!propGroupId || !Array.isArray(suggestions) || suggestions.length === 0) {
      return null;
    }

    return (
      <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 4, border: '1px solid var(--border)', bgcolor: 'rgba(255,255,255,0.76)', boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)' }}>
        <Typography variant="h5" sx={{ mb: 2, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em' }}>
          Mötesförslag ({suggestions.length})
        </Typography>
        
        {suggestions.map(suggestion => {
          const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0];
          const userVote = suggestion.votes?.[userEmail];
          const voteCount = suggestion.voteCount || {
            accepted: Object.values(suggestion.votes || {}).filter(v => v === 'accepted').length,
            rejected: Object.values(suggestion.votes || {}).filter(v => v === 'rejected').length,
            pending: Object.values(suggestion.votes || {}).filter(v => v === 'pending').length
          };

          return (
            <Card key={suggestion.id} sx={{ p: 3, mb: 2, border: '1px solid rgba(17,24,39,0.06)', borderRadius: 3, bgcolor: 'rgba(17,24,39,0.025)', boxShadow: 'none' }}>
              {/* ✅ TITEL OCH FÖRSLAGS INFO */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, color: 'var(--text)', mb: 0.5 }}>
                  {suggestion.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Föreslagen av <strong>{suggestion.suggestedBy}</strong> • {new Date(suggestion.createdAt).toLocaleString('sv-SE')}
                </Typography>
              </Box>

              {/* ✅ TID OCH PLATS */}
              <Box sx={{ mb: 2, p: 2, bgcolor: 'rgba(255,255,255,0.56)', borderRadius: 2, border: '1px solid rgba(17,24,39,0.05)' }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  <strong>Tid:</strong> {new Date(suggestion.start).toLocaleString('sv-SE', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })} - {new Date(suggestion.end).toLocaleTimeString('sv-SE', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </Typography>
                {suggestion.withMeet ? (
                  <Typography variant="body2">
                    <strong>Möte:</strong> Google Meet kommer att skapas
                  </Typography>
                ) : suggestion.location && (
                  <Typography variant="body2">
                    <strong>Plats:</strong> {suggestion.location}
                  </Typography>
                )}
              </Box>

              {/* ✅ RÖSTRESULTAT */}
              <Box sx={{ mb: 2, p: 2, bgcolor: 'rgba(255,255,255,0.56)', borderRadius: 2, border: '1px solid rgba(17,24,39,0.05)' }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700, color: 'var(--text)' }}>
                  Röstningsresultat:
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Chip
                    label={`✅ ${voteCount.accepted} accepterat`}
                    color={voteCount.accepted > 0 ? 'success' : 'default'}
                    size="small"
                  />
                  <Chip
                    label={`❌ ${voteCount.rejected} nekat`}
                    color={voteCount.rejected > 0 ? 'error' : 'default'}
                    size="small"
                  />
                  <Chip
                    label={`⏳ ${voteCount.pending} väntar`}
                    color={voteCount.pending > 0 ? 'warning' : 'default'}
                    size="small"
                  />
                </Box>
              </Box>

              {/* ✅ RÖSTNINGSSEKTION */}
              {userVote === 'pending' && (
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button
                    variant="contained"
                    onClick={() => voteSuggestion(suggestion.id, 'accepted')}
                    sx={{ flex: 1, bgcolor: 'var(--text)', '&:hover': { bgcolor: '#000' } }}
                  >
                    Acceptera
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => voteSuggestion(suggestion.id, 'rejected')}
                    sx={{ flex: 1, borderColor: 'var(--border)', color: 'var(--text)' }}
                  >
                    Neka
                  </Button>
                </Box>
              )}

              {/* ✅ VISAR DIN RÖST */}
              {userVote !== 'pending' && (
                <Alert severity={userVote === 'accepted' ? 'success' : 'error'} sx={{ mb: 0 }}>
                  {userVote === 'accepted' 
                    ? '✅ Du accepterade detta förslag' 
                    : '❌ Du nekade detta förslag'}
                </Alert>
              )}

              {/* ✅ SUCCESMEDDELANDE */}
              {suggestion.status === 'accepted' && (
                <Alert severity="success">
                  🎉 Alla accepterade! Kalendereventen har skapats för alla deltagare.
                </Alert>
              )}

              {/* ✅ REJECTED MEDDELANDE */}
              {suggestion.status === 'rejected' && (
                <Alert severity="warning">
                  Förslaget avvisades av en eller flera deltagare.
                </Alert>
              )}
            </Card>
          );
        })}
      </Paper>
    );
  }, [suggestions, propGroupId, user, voteSuggestion]);

  // ✅ MOBILE RENDER FUNCTIONS (SIMPLIFIED VERSIONS)
  const renderMobileComparisonForm = useCallback(() => renderComparisonForm(), [renderComparisonForm]);
  const renderMobileAvailableSlots = renderAvailableSlots;

  // ✅ MAIN RETURN STATEMENT
  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto', p: { xs: 2, sm: 3, lg: 4 } }}>
      {/* ✅ RENDER MOBILE OR DESKTOP VERSION */}
      {isMobile ? renderMobileComparisonForm() : renderComparisonForm()}

      {/* ✅ ERROR HANDLING */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Fel vid kalenderjämförelse
          </Typography>
          {error}
        </Alert>
      )}

      {/* ✅ RENDER MOBILE OR DESKTOP SLOTS */}
      {isMobile ? renderMobileAvailableSlots : renderAvailableSlots}

      {/* ✅ SUGGESTIONS - MOBILE OPTIMIZED */}
      {renderSuggestions()}

      {/* ✅ CALENDAR VIEW - HIDDEN ON MOBILE */}
      {hasSearched && futureSlots.length > 0 && !isMobile && (
        <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 4, border: '1px solid var(--border)', bgcolor: 'rgba(255,255,255,0.76)', boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)' }}>
          <Typography variant="h5" sx={{ mb: 2, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em' }}>
            Kalendervy
          </Typography>
          <Box sx={styles.calendar}>
            <Calendar
              localizer={localizer}
              events={calendarEvents}
              startAccessor="start"
              endAccessor="end"
              style={{ height: 500 }}
              eventPropGetter={eventPropGetter}
              views={['month', 'week', 'day']}
              defaultView="week"
              messages={{
                next: 'Nästa',
                previous: 'Föregående',
                today: 'Idag',
                month: 'Månad',
                week: 'Vecka',
                day: 'Dag'
              }}
            />
          </Box>
        </Paper>
      )}

      {/* ✅ MOBILE-OPTIMIZED SUGGEST DIALOG */}
      <Dialog
        open={suggestDialog.open}
        onClose={() => setSuggestDialog({ open: false, slot: null })}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile} // Fullscreen on mobile
        PaperProps={{
          sx: {
            borderRadius: isMobile ? 0 : 4,
            border: '1px solid var(--border)',
            boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18)',
            backdropFilter: 'blur(18px)',
            background: 'rgba(255,255,255,0.94)'
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)' }}>
          Föreslå mötestid
          {isMobile && (
            <IconButton
              edge="end"
              color="inherit"
              onClick={() => setSuggestDialog({ open: false, slot: null })}
              sx={{ position: 'absolute', right: 8, top: 8 }}
            >
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>
        
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          {suggestDialog.slot && (
            <Typography variant="body2" sx={{ mb: 2, p: 2, bgcolor: 'rgba(17,24,39,0.03)', borderRadius: 2, border: '1px solid rgba(17,24,39,0.05)' }}>
              <strong>Vald tid:</strong><br/>
              {new Date(suggestDialog.slot.start).toLocaleString('sv-SE')} - {new Date(suggestDialog.slot.end).toLocaleString('sv-SE')}
            </Typography>
          )}
          
          <TextField
            label="Mötestitel"
            placeholder="T.ex. Projektmöte, Demoöversyn, etc."
            value={meetingTitle}
            onChange={(e) => setMeetingTitle(e.target.value)}
            fullWidth
            inputProps={{ maxLength: 200 }}
            helperText={`${meetingTitle.length}/200`}
            sx={{ mb: 2 }}
          />
          
          <Box sx={{ mb: 2 }}>
            <Button
              variant={withMeet ? 'contained' : 'outlined'}
              onClick={() => setWithMeet(!withMeet)}
              fullWidth
              sx={withMeet ? { bgcolor: 'var(--text)', '&:hover': { bgcolor: '#000' } } : { borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              {withMeet ? 'Google Meet' : 'Plats'}
            </Button>
          </Box>
          
          {!withMeet && (
            <TextField
              label="Plats (valfritt)"
              placeholder="T.ex. Konferensrum A, Zoom-länk, etc."
              value={meetingLocation}
              onChange={(e) => setMeetingLocation(e.target.value)}
              fullWidth
              inputProps={{ maxLength: 200 }}
              sx={{ mb: 2 }}
            />
          )}
        </Box>
        
        {!isMobile && (
          <DialogActions>
            <Button onClick={() => setSuggestDialog({ open: false, slot: null })}>
              Avbryt
            </Button>
            <Button onClick={confirmSuggest} variant="contained" sx={{ bgcolor: 'var(--text)', '&:hover': { bgcolor: '#000' } }}>
              Skicka förslag
            </Button>
          </DialogActions>
        )}
        
        {isMobile && (
          <Box sx={{ p: 2, pt: 0 }}>
            <Button 
              onClick={confirmSuggest} 
              variant="contained" 
              fullWidth
              sx={{ mb: 1, bgcolor: 'var(--text)', '&:hover': { bgcolor: '#000' } }}
            >
              Skicka förslag
            </Button>
            <Button 
              onClick={() => setSuggestDialog({ open: false, slot: null })}
              fullWidth
              variant="text"
            >
              Avbryt
            </Button>
          </Box>
        )}
      </Dialog>

      {/* ✅ TOAST NOTIFICATIONS */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToast({ ...toast, open: false })}
          severity={toast.severity}
          sx={{ width: '100%' }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}