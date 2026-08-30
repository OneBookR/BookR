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
import { trackEvent, trackEventOnce, EVENTS, bucket, daysBetween } from '../utils/analytics.js';
import { TokenValidator } from '../utils/tokenValidator.js';
import InviteFriend from './InviteFriend';
import { useNotifications } from '../hooks/useNotifications.js';

moment.locale('sv');
const localizer = momentLocalizer(moment);

// ✅ REDESIGN: hjälpkomponent + delad inline-stil för formulärets
// labeled-input-fält (datum, möteslängd, arbetstid) — på modulnivå så de
// inte återskapas som nya referenser vid varje render av CompareCalendar.
const FieldBox = ({ label, children }) => (
  <Box sx={{ flex: 1, minWidth: 140 }}>
    <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', mb: 0.75 }}>
      {label}
    </Typography>
    {children}
  </Box>
);

const fieldInputSx = {
  width: '100%', padding: '11px 12px', borderRadius: '10px',
  border: '1px solid rgba(17,24,39,0.14)', background: '#fff',
  fontSize: 13, fontWeight: 700, color: '#111827',
  fontFamily: "'Manrope', 'Segoe UI', sans-serif", boxSizing: 'border-box'
};

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
  // ✅ BUGFIX: bar med gamla varumärkesvärden (#1976d2-blått, Inter) som
  // aldrig migrerades när resten av appen bytte till dagens tokens
  // (Manrope, --text, --border, --success). Bytt till samma system som
  // landningssidan/demo-flödet redan använder.
  const styles = {
    calendar: {
      fontFamily: "'Manrope', 'Segoe UI', sans-serif",
      background: 'var(--surface-strong)',
      borderRadius: '16px',
      border: '1px solid var(--border)',
      height: '500px'
    },
    eventProps: (event) => ({
      style: {
        backgroundColor: 'rgba(31,122,77,0.12)',
        color: 'var(--success)',
        border: '1px solid rgba(31,122,77,0.35)',
        borderRadius: '8px',
        fontFamily: "'Manrope', 'Segoe UI', sans-serif",
        fontWeight: 700
      }
    })
  };

  // ✅ REDESIGN: vy-toggle mellan "Panelvy" (nuvarande formulär + slots +
  // inbäddad kalender, allt alltid synligt) och "Kortvy" (lediga tider som
  // stora, tappbara kort i fokus — riktning vald ur designcanvasen
  // https://claude.ai/code/artifact/28a4696a-6797-4c4c-b79f-68b3091477b5,
  // "Compare Toggle"). Ingen fetch-/state-logik ändras — bara vilken
  // sektion som visas som huvudinnehåll.
  const [viewMode, setViewMode] = useState('panel');
  // I Kortvy är kalendern en togglingsbar sekundär vy, avstängd som default.
  const [showCalendarInCardsView, setShowCalendarInCardsView] = useState(false);

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

  // ✅ PROPOSAL POPUP NOTIFICATION — visas i nedre högra hörnet direkt när
  // ett nytt tidsförslag kommer in, så mottagaren inte behöver scrolla ner
  // och leta för att upptäcka det.
  const [proposalNotification, setProposalNotification] = useState({
    open: false,
    proposal: null
  });
  const previousSuggestionsRef = useRef([]);
  const { showNotification } = useNotifications();

  // ✅ ROBUST RATE LIMITING
  const [requestState, setRequestState] = useState({
    lastFetch: 0,
    inProgress: false
  });

  // ✅ LÄGG TILL VÄNTRUM STATE
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
    if (!myToken) return false;
    
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
  }, [myToken]);

  // ✅ JOIN GROUP AUTOMATICALLY - FIXA API URL (FLYTTA FÖRE fetchGroupAvailability)
  // OBS: kräver INTE myToken. Backend hämtar identitet och kalender-token
  // uteslutande från den autentiserade sessionen (req.user), aldrig från
  // request body (se /api/group/:id/join i server.js) — det är en
  // medveten säkerhetsspärr mot att låtsas vara någon annan. Men
  // Dashboard.jsx skickar alltid myToken={null} till den här komponenten
  // (tokens hanteras server-side sedan en tidigare omskrivning), så ett
  // krav här på ett icke-null myToken gjorde att joinGroup() alltid
  // avbröt sig självt tyst — ingen inbjuden kunde någonsin gå med i en
  // grupp, vilket fastnade dem i väntrummet permanent.
  const joinGroup = useCallback(async () => {
    if (!propGroupId || !user) return;

    // OBS: ingen klientsidig myToken-validering här längre — validateToken()
    // kräver myToken, som (se ovan) alltid är null från den här sidan.
    // Backend är redan den auktoritativa källan för sessionsstatus och
    // svarar 401 nedan om sessionen faktiskt är ogiltig.

    try {
      const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0];

      console.log(`👥 Joining group ${propGroupId} as ${userEmail}`);

      const response = await apiRequest(`/api/group/${propGroupId}/join`, {
        method: 'POST',
        body: JSON.stringify({
          email: userEmail
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

        // ✅ GA4: botten av inbjudnings-tratten. Räkna bara faktiska
        // inbjudna (URL bär ?invitee=), inte skaparen som återvänder till
        // sin egen grupp. En gång per grupp.
        try {
          const isInvitee = new URLSearchParams(window.location.search).get('invitee');
          const onceKey = `bookr_accepted_${propGroupId}`;
          if (isInvitee && !localStorage.getItem(onceKey)) {
            localStorage.setItem(onceKey, String(Date.now()));
            trackEvent(EVENTS.INVITATION_ACCEPTED, {});
          }
        } catch { /* ignore */ }

        return true;
      } else {
        console.error('❌ Failed to join group:', response.status);
        return false;
      }
    } catch (error) {
      console.error('❌ Join group error:', error);
      return false;
    }
  }, [propGroupId, user]);

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

  // ✅ AUTO-REFRESH: För ALLA medlemmar (inte bara skaparen) när alla anslutit.
  // Tidigare gällde detta bara skaparen, vilket gjorde att den som blivit
  // inbjuden och satt i väntrummet aldrig automatiskt togs vidare in i
  // jämförelsen även fast groupInfo (via polling) visade att alla anslutit —
  // de fick sitta kvar tills de manuellt laddade om sidan.
  useEffect(() => {
    if (!propGroupId || !groupInfo || !user) return;

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
  
  // ✅ POLLING: Snabb 1-sekunders polling för proposals — så att popup-
  // notisen för ett nytt tidsförslag dyker upp nästan omedelbart istället
  // för att mottagaren måste vänta flera sekunder eller uppleva att den
  // inte kommer alls.
  useEffect(() => {
    if (!propGroupId || !hasJoinedGroup) return;

    const timer = setInterval(() => {
      fetchGroupStatus();
      fetchSuggestions(); // ✅ Snabbare uppdateringar av förslag
    }, 1000);

    return () => clearInterval(timer);
  }, [propGroupId, hasJoinedGroup]);



  // ✅ UPPDATERA AVAILABILITY FETCH FUNCTION - VISA LEDIGA TIDER FRÅN IDAG
  const fetchAvailability = useCallback(async () => {
    // Förhindra samtidiga anrop
    if (isLoading) {
      console.log('⏳ Already fetching, skipping...');
      return;
    }

    // OBS: validateToken() kräver myToken, som denna sida alltid får som
    // null (tokens hanteras server-side via sessionen, se joinGroup ovan).
    // Ett krav på den här klientsidiga valideringen gjorde att
    // kalenderjämförelsen aldrig gick att starta för gruppflödet — samma
    // rotorsak som gjorde att man aldrig kunde gå med i en grupp.
    // Endpointen nedan är själv skyddad server-side och svarar 401 om
    // sessionen faktiskt är ogiltig; det hanteras i felgrenen längre ner.

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

      // ✅ GA4: aktiverings-milstolpe. En lyckad kalenderjämförelse är
      // kärnvärdet i BookR — vi vill se hur ofta den faktiskt ger resultat.
      const compGroupSize = propGroupId ? (groupInfo?.memberCount || 2) : 2;
      trackEvent(EVENTS.COMPARISON_RUN, {
        mode: propGroupId ? 'group' : 'direct',
        group_size: compGroupSize,
        slots_found_bucket: bucket(validSlots.length),
        range_days: daysBetween(startTime, endTime),
        duration_min: meetingDuration,
        include_all: Boolean(includeAllEvents),
        had_results: validSlots.length > 0,
      });
      if (validSlots.length > 0) {
        trackEventOnce('bookr_first_comparison', EVENTS.FIRST_COMPARISON_COMPLETED, {
          mode: propGroupId ? 'group' : 'direct',
        });
      }
      
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
      trackEvent(EVENTS.ERROR_SHOWN, {
        context: 'calendar_comparison',
        message: String(err?.message || '').slice(0, 120),
      });
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
    includeAllEvents
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
        const userEmail = userData.email;

        // ✅ DETECT NEW PROPOSALS - jämför mot förra pollningen för att
        // upptäcka precis de förslag som är nya sedan sist.
        const previousIds = previousSuggestionsRef.current.map(s => s.id);
        const newProposals = newSuggestions.filter(s => !previousIds.includes(s.id));

        if (newProposals.length > 0) {
          newProposals.forEach(proposal => {
            // ✅ Visa aldrig popupen för personen som själv skapade förslaget
            const isMyProposal = proposal.suggestedBy?.toLowerCase() === userEmail?.toLowerCase();
            if (isMyProposal) return;

            const startTime = new Date(proposal.start).toLocaleTimeString('sv-SE', {
              hour: '2-digit',
              minute: '2-digit'
            });

            // ✅ Webbläsarnotis (om tillåtet)
            showNotification('📋 Nytt tidsförslag!', {
              body: `${proposal.title} - ${startTime}`,
              requireInteraction: true
            });

            // ✅ Popup direkt i appen, nedre högra hörnet
            setProposalNotification({
              open: true,
              proposal
            });
          });
        }

        previousSuggestionsRef.current = newSuggestions;
        setSuggestions(newSuggestions);
      }
    } catch (error) {
      console.error('❌ Failed to fetch suggestions:', error);
    }
  }, [propGroupId, userData.email, showNotification]);

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

      // ✅ GA4: aktivering — någon drev flödet vidare till ett mötesförslag.
      trackEvent(EVENTS.SUGGESTION_CREATED, {
        with_meet: Boolean(withMeet),
        has_location: Boolean(meetingLocation.trim()),
        participant_count: Object.keys(data.suggestion?.votes || {}).length || null,
      });

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

      // ✅ GA4: förslags-omröstning. Bara "accepted"-röster räknas som
      // suggestion_accepted; status === 'accepted' av alla = bokat möte.
      if (vote === 'accepted') {
        trackEvent(EVENTS.SUGGESTION_ACCEPTED, {
          outcome: data.suggestion?.status || 'pending',
        });
      }
      if (data.suggestion?.status === 'accepted') {
        trackEvent(EVENTS.BOOKING_CONFIRMED, { via: 'group_suggestion' });
      }

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
  // ✅ REDESIGN: hela formulär-sektionen skrevs om från MUI-standard-
  // komponenter (TextField/Chip/Alert med sitt fabriksutseende) till egna
  // BookR-stilade element — matchar nu resten av appen istället för att
  // sticka ut som en annan produkt. Ingen logik ändrad, bara markup/style.
  const renderComparisonForm = useCallback(() => (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 3, md: 4 },
        mb: 3,
        borderRadius: 5.5,
        border: '1px solid var(--border)',
        bgcolor: 'var(--surface-strong)',
        boxShadow: '0 24px 80px rgba(15,23,42,0.08)'
      }}
    >
      <Box
        sx={{
          display: 'inline-flex', mb: 2, px: 1.75, py: 0.75, borderRadius: 999,
          bgcolor: 'rgba(17,24,39,0.05)', border: '1px solid rgba(17,24,39,0.08)'
        }}
      >
        <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          Kalenderjämförelse
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 1.25 }}>
        <Typography sx={{ fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)', fontSize: { xs: 26, md: 34 }, lineHeight: 1.05 }}>
          Hitta en gemensam tid utan att lämna flödet.
        </Typography>
        {propGroupId && (
          <Box sx={{ px: 1.5, py: 0.6, borderRadius: 999, bgcolor: 'rgba(17,24,39,0.05)', border: '1px solid rgba(17,24,39,0.08)' }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
              Grupp: {groupInfo?.name || 'Laddar...'}
            </Typography>
          </Box>
        )}
      </Box>
      <Typography sx={{ color: 'var(--text-secondary)', maxWidth: 760, mb: 3, lineHeight: 1.7, fontSize: 14 }}>
        Jämför tillgänglighet, se vilka som redan är inne och skicka ett mötesförslag i samma lugna gränssnitt som resten av BookR.
      </Typography>

      {/* ✅ BJUD IN-FORMULÄR: visas bara innan man är i en grupp. */}
      {!propGroupId && (
        <InviteFriend fromUser={user} embedded />
      )}

      {/* ✅ AUTO-REFRESH STATUS */}
      {propGroupId && groupInfo && groupInfo.pendingMembers?.length === 0 && groupInfo.memberCount >= 2 && (
        <Box sx={{ mb: 3, p: 2.25, bgcolor: 'rgba(31,122,77,0.08)', borderRadius: 3.5, border: '1px solid rgba(31,122,77,0.2)' }}>
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: 'var(--success)', mb: 0.5 }}>
            Alla medlemmar är anslutna
          </Typography>
          <Typography sx={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Nu kan du jämföra alla kalendrar för att hitta gemensamma lediga tider.
          </Typography>
        </Box>
      )}

      {/* ✅ GRUPPINFORMATION */}
      {groupInfo && (
        <Box sx={{ mb: 3, p: 2.5, bgcolor: 'rgba(17,24,39,0.03)', borderRadius: 3.5, border: '1px solid rgba(17,24,39,0.06)' }}>
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', mb: 1.25 }}>
            Gruppinformation
          </Typography>
          <Typography sx={{ fontSize: 13, color: 'var(--text-secondary)', mb: 0.5 }}>
            <strong style={{ color: 'var(--text)' }}>Namn:</strong> {groupInfo.name}
          </Typography>
          <Typography sx={{ fontSize: 13, color: 'var(--text-secondary)', mb: 1.5 }}>
            <strong style={{ color: 'var(--text)' }}>Anslutna medlemmar:</strong> {groupInfo.memberCount}
          </Typography>

          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em', mb: 1 }}>
              Anslutna ({groupInfo.members?.length || 0})
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {groupInfo.members?.map((member, index) => (
                <Box
                  key={index}
                  sx={{
                    px: 1.5, py: 0.6, borderRadius: 999, fontSize: 12, fontWeight: 700, color: 'var(--text)',
                    bgcolor: member.isCreator ? 'rgba(17,24,39,0.08)' : 'rgba(17,24,39,0.04)',
                    border: '1px solid rgba(17,24,39,0.08)'
                  }}
                >
                  {member.isCreator ? 'Skapare • ' : ''}{member.email}
                </Box>
              ))}
            </Box>
          </Box>

          {groupInfo.pendingMembers && groupInfo.pendingMembers.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em', mb: 1 }}>
                Väntar på ({groupInfo.pendingMembers.length})
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                {groupInfo.pendingMembers.map((email, index) => (
                  <Box
                    key={index}
                    sx={{ px: 1.5, py: 0.6, borderRadius: 999, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', border: '1px solid rgba(17,24,39,0.12)' }}
                  >
                    {email}
                  </Box>
                ))}
              </Box>
              <Typography sx={{ fontSize: 12, color: 'var(--text-secondary)', mt: 1, fontStyle: 'italic' }}>
                Dessa personer har fått inbjudningar men har inte anslutit än.
              </Typography>
            </Box>
          )}

          {groupInfo.memberCount < 2 && (
            <Box sx={{ mt: 1.5, p: 1.75, borderRadius: 3, bgcolor: 'rgba(181,71,8,0.08)', border: '1px solid rgba(181,71,8,0.18)' }}>
              <Typography sx={{ fontSize: 12, color: 'var(--warning)', fontWeight: 700 }}>
                Väntar på att fler medlemmar ska ansluta för att kunna jämföra kalendrar...
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* ✅ VISA STATUS FÖR KALENDRAR */}
      <Box sx={{ mb: 3, p: 2.5, bgcolor: 'rgba(17,24,39,0.025)', borderRadius: 3.5, border: '1px solid rgba(17,24,39,0.06)' }}>
        <Typography sx={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', mb: 1.25 }}>
          Kalendrar som jämförs
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {myToken && (
            <Box sx={{ px: 1.5, py: 0.6, borderRadius: 999, fontSize: 12, fontWeight: 700, color: 'var(--text)', bgcolor: 'rgba(17,24,39,0.08)', border: '1px solid rgba(17,24,39,0.08)' }}>
              Din kalender ({userData.email || 'okänd'})
            </Box>
          )}
          {propGroupId && groupInfo?.members && groupInfo.members
            .filter(member => member.email !== userData.email)
            .map((member, index) => (
              <Box key={index} sx={{ px: 1.5, py: 0.6, borderRadius: 999, fontSize: 12, fontWeight: 700, color: 'var(--text)', bgcolor: 'rgba(17,24,39,0.04)', border: '1px solid rgba(17,24,39,0.08)' }}>
                {member.email} {member.isCreator ? '(skapare)' : ''}
              </Box>
            ))}
          {contactEmail && (
            <Box sx={{ px: 1.5, py: 0.6, borderRadius: 999, fontSize: 12, fontWeight: 700, color: 'var(--text)', bgcolor: 'rgba(17,24,39,0.04)', border: '1px solid rgba(17,24,39,0.08)' }}>
              {contactEmail}
            </Box>
          )}
        </Box>

        {!propGroupId && [myToken, ...invitedTokens].filter(Boolean).length < 2 && (
          <Box sx={{ mt: 1.5, p: 1.75, borderRadius: 3, bgcolor: 'rgba(181,71,8,0.08)', border: '1px solid rgba(181,71,8,0.18)' }}>
            <Typography sx={{ fontSize: 12, color: 'var(--warning)', fontWeight: 700 }}>
              Behöver minst 2 kalendrar för jämförelse
            </Typography>
          </Box>
        )}

        {propGroupId && (!groupInfo || groupInfo.memberCount < 2) && (
          <Box sx={{ mt: 1.5, p: 1.75, borderRadius: 3, bgcolor: 'rgba(17,24,39,0.05)', border: '1px solid rgba(17,24,39,0.09)' }}>
            <Typography sx={{ fontSize: 12, color: 'var(--text)', fontWeight: 700 }}>
              Väntar på att fler medlemmar ska ansluta gruppen
            </Typography>
            {groupInfo?.pendingMembers && groupInfo.pendingMembers.length > 0 && (
              <Typography sx={{ fontSize: 12, color: 'var(--text-secondary)', mt: 0.5 }}>
                Inbjudningar skickade till: {groupInfo.pendingMembers.join(', ')}
              </Typography>
            )}
          </Box>
        )}
      </Box>

      {/* ✅ AVANCERADE ALTERNATIV */}
      <Box sx={{ mb: 3, p: 2.5, bgcolor: 'rgba(17,24,39,0.025)', borderRadius: 3.5, border: '1px solid rgba(17,24,39,0.06)' }}>
        <Typography sx={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', mb: 1.75 }}>
          Avancerade alternativ
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <input
              type="checkbox"
              id="includeAllEvents"
              checked={includeAllEvents}
              onChange={(e) => setIncludeAllEvents(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#111827' }}
            />
            <label htmlFor="includeAllEvents" style={{ cursor: 'pointer' }}>
              <Typography sx={{ fontSize: 13, color: 'var(--text)' }}>
                <strong>Inkludera alla events</strong> — Även tentativa, transparenta och heldagsevent
              </Typography>
            </label>
          </Box>

          {process.env.NODE_ENV === 'development' && propGroupId && (
            <Box
              onClick={fetchDebugEvents}
              sx={{ alignSelf: 'flex-start', px: 1.75, py: 0.75, borderRadius: 2.5, border: '1px solid rgba(17,24,39,0.14)', fontSize: 12, fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}
            >
              Debug Events
            </Box>
          )}
        </Box>

        <Typography sx={{ fontSize: 12, color: 'var(--text-secondary)', mt: 1.25 }}>
          Om du inte ser alla kalenderevent kan du aktivera "Inkludera alla events".
        </Typography>
      </Box>

      {/* ✅ FÖRENKLAD FORM */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <FieldBox label="Från datum">
            <input
              type="date"
              value={timeMin ? timeMin.split('T')[0] : ''}
              onChange={e => setTimeMin(e.target.value ? `${e.target.value}T00:00` : '')}
              style={fieldInputSx}
            />
            <Typography sx={{ fontSize: 11, color: 'var(--text-secondary)', mt: 0.5 }}>Lämna tom för imorgon</Typography>
          </FieldBox>
          <FieldBox label="Till datum">
            <input
              type="date"
              value={timeMax ? timeMax.split('T')[0] : ''}
              onChange={e => setTimeMax(e.target.value ? `${e.target.value}T23:59` : '')}
              style={fieldInputSx}
            />
            <Typography sx={{ fontSize: 11, color: 'var(--text-secondary)', mt: 0.5 }}>Lämna tom för +2 veckor</Typography>
          </FieldBox>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <FieldBox label="Möteslängd (minuter)">
            <input
              type="number"
              value={meetingDuration}
              onChange={e => setMeetingDuration(Number(e.target.value))}
              min={15} max={480} step={15}
              style={fieldInputSx}
            />
          </FieldBox>
          <FieldBox label="Arbetsdag start">
            <input type="time" value={dayStart} onChange={e => setDayStart(e.target.value)} style={fieldInputSx} />
          </FieldBox>
          <FieldBox label="Arbetsdag slut">
            <input type="time" value={dayEnd} onChange={e => setDayEnd(e.target.value)} style={fieldInputSx} />
          </FieldBox>
        </Box>
      </Box>

      <Box
        onClick={
          isLoading || (propGroupId ? (!groupInfo || groupInfo.memberCount < 2) : [myToken, ...invitedTokens].filter(Boolean).length < 2)
            ? undefined
            : fetchAvailability
        }
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: 1.25, px: 3.5, py: 1.6, borderRadius: 3,
          bgcolor: 'var(--text)', color: '#fff', fontWeight: 700, fontSize: 14,
          cursor: (isLoading || (propGroupId ? (!groupInfo || groupInfo.memberCount < 2) : [myToken, ...invitedTokens].filter(Boolean).length < 2)) ? 'not-allowed' : 'pointer',
          opacity: (isLoading || (propGroupId ? (!groupInfo || groupInfo.memberCount < 2) : [myToken, ...invitedTokens].filter(Boolean).length < 2)) ? 0.5 : 1,
          transition: 'background-color 150ms ease',
          '&:hover': { bgcolor: '#000' }
        }}
      >
        {isLoading && <CircularProgress size={16} sx={{ color: '#fff' }} />}
        {isLoading
          ? (propGroupId ? 'Jämför gruppkalendrar...' : 'Jämför kalendrar...')
          : `${propGroupId ? 'Jämför gruppkalendrar' : 'Jämför kalendrar'}${includeAllEvents ? ' (Alla events)' : ''}`}
      </Box>

      {includeAllEvents && (
        <Typography sx={{ fontSize: 12, color: 'var(--text-secondary)', mt: 1.25 }}>
          "Inkludera alla events" är aktivt. Även tentativa och transparenta events räknas som upptagna.
        </Typography>
      )}
    </Paper>
  ), [
    theme,
    propGroupId,
    groupInfo,
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

  // ✅ KORTVY: samma futureSlots/slotsByDay-logik som ovan, men stora,
  // tydligt gröna kort i grid — riktning C ur designcanvasen. Bara en
  // sektion visas åt gången beroende på viewMode, ingen dubblad fetch.
  const renderSlotCards = useMemo(() => {
    if (!hasSearched) return null;

    if (isLoading) {
      return (
        <Paper elevation={0} sx={{ p: 4, borderRadius: 5.5, textAlign: 'center', border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)', boxShadow: '0 24px 80px rgba(15,23,42,0.08)' }}>
          <CircularProgress sx={{ mb: 2 }} />
          <Typography>Jämför kalendrar...</Typography>
        </Paper>
      );
    }

    const safeFutureSlots = Array.isArray(futureSlots) ? futureSlots : [];

    if (safeFutureSlots.length === 0) {
      return (
        <Paper elevation={0} sx={{ p: 4, borderRadius: 5.5, textAlign: 'center', bgcolor: 'rgba(17,24,39,0.03)', border: '1px solid rgba(17,24,39,0.06)' }}>
          <Typography variant="h6" sx={{ mb: 1, color: 'var(--text)' }}>Inga gemensamma lediga tider</Typography>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>Försök utöka tidsintervallet eller justera arbetstider.</Typography>
        </Paper>
      );
    }

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
      <Box>
        {Object.entries(slotsByDay).slice(0, 7).map(([dateString, daySlots]) => {
          const date = new Date(dateString);
          const isToday = date.toDateString() === new Date().toDateString();
          const isTomorrow = date.toDateString() === new Date(Date.now() + 24 * 60 * 60 * 1000).toDateString();

          return (
            <Box key={dateString} sx={{ mb: 4 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1.75 }}>
                {isToday ? 'Idag' : isTomorrow ? 'Imorgon' : date.toLocaleDateString('sv-SE', { weekday: 'long', month: 'long', day: 'numeric' })}
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
                {daySlots.map((slot, slotIndex) => {
                  try {
                    const start = new Date(slot.start);
                    const end = new Date(slot.end);
                    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

                    return (
                      <Box
                        key={`${dateString}-${slotIndex}`}
                        onClick={propGroupId ? () => handleSuggest(slot) : undefined}
                        sx={{
                          p: 2.25, borderRadius: 4.5, textAlign: 'center',
                          bgcolor: 'rgba(31,122,77,0.08)', border: '1.5px solid rgba(31,122,77,0.3)',
                          cursor: propGroupId ? 'pointer' : 'default',
                          transition: 'transform 150ms ease, box-shadow 150ms ease',
                          '&:hover': propGroupId ? { transform: 'translateY(-2px)', boxShadow: '0 14px 34px rgba(31,122,77,0.16)' } : {}
                        }}
                      >
                        <Typography sx={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
                          {start.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', mt: 0.5 }}>
                          Ledigt
                        </Typography>
                      </Box>
                    );
                  } catch {
                    return null;
                  }
                })}
              </Box>
            </Box>
          );
        })}
      </Box>
    );
  }, [hasSearched, isLoading, futureSlots, propGroupId, handleSuggest]);



  // ✅ LÄGG TILL SAKNAD SUGGESTIONS RENDERING
  const renderSuggestions = useCallback(() => {
    if (!propGroupId || !Array.isArray(suggestions) || suggestions.length === 0) {
      return null;
    }

    return (
      <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 5.5, border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)', boxShadow: '0 24px 80px rgba(15,23,42,0.08)' }}>
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
            <Card key={suggestion.id} sx={{ p: 3, mb: 2, border: '1px solid rgba(17,24,39,0.06)', borderRadius: 4, bgcolor: 'rgba(17,24,39,0.025)', boxShadow: 'none' }}>
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
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Box sx={{ px: 1.5, py: 0.6, borderRadius: 999, fontSize: 12, fontWeight: 700, color: voteCount.accepted > 0 ? 'var(--success)' : 'var(--text-secondary)', bgcolor: voteCount.accepted > 0 ? 'rgba(31,122,77,0.1)' : 'rgba(17,24,39,0.04)', border: `1px solid ${voteCount.accepted > 0 ? 'rgba(31,122,77,0.25)' : 'rgba(17,24,39,0.08)'}` }}>
                    {voteCount.accepted} accepterat
                  </Box>
                  <Box sx={{ px: 1.5, py: 0.6, borderRadius: 999, fontSize: 12, fontWeight: 700, color: voteCount.rejected > 0 ? 'var(--error)' : 'var(--text-secondary)', bgcolor: voteCount.rejected > 0 ? 'rgba(180,35,24,0.08)' : 'rgba(17,24,39,0.04)', border: `1px solid ${voteCount.rejected > 0 ? 'rgba(180,35,24,0.22)' : 'rgba(17,24,39,0.08)'}` }}>
                    {voteCount.rejected} nekat
                  </Box>
                  <Box sx={{ px: 1.5, py: 0.6, borderRadius: 999, fontSize: 12, fontWeight: 700, color: voteCount.pending > 0 ? 'var(--warning)' : 'var(--text-secondary)', bgcolor: voteCount.pending > 0 ? 'rgba(181,71,8,0.08)' : 'rgba(17,24,39,0.04)', border: `1px solid ${voteCount.pending > 0 ? 'rgba(181,71,8,0.22)' : 'rgba(17,24,39,0.08)'}` }}>
                    {voteCount.pending} väntar
                  </Box>
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
                <Box
                  sx={{
                    p: 1.75, borderRadius: 3, fontSize: 13, fontWeight: 700,
                    color: userVote === 'accepted' ? 'var(--success)' : 'var(--error)',
                    bgcolor: userVote === 'accepted' ? 'rgba(31,122,77,0.08)' : 'rgba(180,35,24,0.06)',
                    border: `1px solid ${userVote === 'accepted' ? 'rgba(31,122,77,0.2)' : 'rgba(180,35,24,0.18)'}`
                  }}
                >
                  {userVote === 'accepted' ? 'Du accepterade detta förslag' : 'Du nekade detta förslag'}
                </Box>
              )}

              {/* ✅ SUCCESMEDDELANDE */}
              {suggestion.status === 'accepted' && (
                <Box sx={{ p: 1.75, borderRadius: 3, fontSize: 13, fontWeight: 700, color: 'var(--success)', bgcolor: 'rgba(31,122,77,0.08)', border: '1px solid rgba(31,122,77,0.2)' }}>
                  Alla accepterade! Kalendereventen har skapats för alla deltagare.
                </Box>
              )}

              {/* ✅ REJECTED MEDDELANDE */}
              {suggestion.status === 'rejected' && (
                <Box sx={{ p: 1.75, borderRadius: 3, fontSize: 13, fontWeight: 700, color: 'var(--warning)', bgcolor: 'rgba(181,71,8,0.08)', border: '1px solid rgba(181,71,8,0.2)' }}>
                  Förslaget avvisades av en eller flera deltagare.
                </Box>
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
  // ✅ REDESIGN v2 (efter feedback med skärmdump): Gruppinformation ska
  // vara komprimerad men ALLTID synlig, oavsett Kortvy/Panelvy och
  // oavsett om man sökt än. Båda vyerna delar nu samma vänsterspalt
  // (inställningar: möteslängd/arbetstid/datum + sök-knapp) — tidigare
  // fanns spalten bara i Panelvy, Kortvy saknade den helt.
  const showDesktopLayout = !isMobile && hasSearched;

  // Kompakt, alltid synlig gruppinfo-rad — ersätter den gamla stora
  // gruppinfo-boxen som satt inbäddad i renderComparisonForm och
  // försvann helt så fort man lämnade "innan sökning"-läget.
  const renderCompactGroupInfo = () => {
    if (!propGroupId || !groupInfo) return null;
    return (
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
          p: 2, mb: 2.5, borderRadius: 4, border: '1px solid var(--border)',
          bgcolor: 'var(--surface-strong)', boxShadow: '0 18px 40px rgba(15,23,42,0.05)'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexShrink: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
            {groupInfo.name || 'Namnlös grupp'}
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            · {groupInfo.memberCount} anslutna
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {groupInfo.members?.map((member, index) => (
            <Box
              key={index}
              sx={{
                px: 1.25, py: 0.5, borderRadius: 999, fontSize: 11, fontWeight: 700, color: 'var(--text)',
                bgcolor: member.isCreator ? 'rgba(17,24,39,0.08)' : 'rgba(17,24,39,0.04)',
                border: '1px solid rgba(17,24,39,0.08)'
              }}
            >
              {member.isCreator ? 'Skapare • ' : ''}{member.email}
            </Box>
          ))}
        </Box>
        {groupInfo.pendingMembers?.length > 0 && (
          <Typography sx={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', ml: 'auto' }}>
            Väntar på {groupInfo.pendingMembers.length} till
          </Typography>
        )}
      </Box>
    );
  };

  // Delad inställningsspalt — samma innehåll för både Kortvy och Panelvy,
  // så Kortvy inte längre saknar möjligheten att ändra möteslängd/
  // arbetstid/datum efter att man sökt.
  const renderSettingsSidebar = () => (
    <Box
      sx={{
        width: 280, flexShrink: 0, p: 3, borderRadius: 5.5,
        border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)',
        boxShadow: '0 24px 80px rgba(15,23,42,0.08)', display: 'flex', flexDirection: 'column', gap: 2.5,
        alignSelf: 'flex-start'
      }}
    >
      <Box>
        <Typography sx={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)' }}>
          {propGroupId ? (groupInfo?.name || 'Grupp') : 'Jämförelse'}
        </Typography>
        {myToken && (
          <Typography sx={{ fontSize: 12, color: 'var(--text-secondary)', mt: 0.5 }}>
            Din kalender ({userData.email || 'okänd'})
          </Typography>
        )}
      </Box>

      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', mb: 0.75 }}>Möteslängd (minuter)</Typography>
        <input
          type="number"
          value={meetingDuration}
          onChange={e => setMeetingDuration(Number(e.target.value))}
          min={15} max={480} step={15}
          style={fieldInputSx}
        />
      </Box>
      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', mb: 0.75 }}>Arbetstid</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <input type="time" value={dayStart} onChange={e => setDayStart(e.target.value)} style={{ ...fieldInputSx, width: 0, flex: 1 }} />
          <input type="time" value={dayEnd} onChange={e => setDayEnd(e.target.value)} style={{ ...fieldInputSx, width: 0, flex: 1 }} />
        </Box>
      </Box>
      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', mb: 0.75 }}>Från datum</Typography>
        <input
          type="date"
          value={timeMin ? timeMin.split('T')[0] : ''}
          onChange={e => setTimeMin(e.target.value ? `${e.target.value}T00:00` : '')}
          style={fieldInputSx}
        />
      </Box>
      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', mb: 0.75 }}>Till datum</Typography>
        <input
          type="date"
          value={timeMax ? timeMax.split('T')[0] : ''}
          onChange={e => setTimeMax(e.target.value ? `${e.target.value}T23:59` : '')}
          style={fieldInputSx}
        />
      </Box>

      <Box
        onClick={isLoading ? undefined : fetchAvailability}
        sx={{
          textAlign: 'center', px: 2, py: 1.4, borderRadius: 2.5, bgcolor: 'var(--text)', color: '#fff',
          fontWeight: 700, fontSize: 13, cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.6 : 1,
          '&:hover': { bgcolor: '#000' }
        }}
      >
        {isLoading ? 'Uppdaterar...' : 'Uppdatera'}
      </Box>

      {hasSearched && (
        <Box sx={{ pt: 2, borderTop: '1px solid var(--border)' }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', mb: 1 }}>
            Lediga tider ({futureSlots.length})
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, maxHeight: 260, overflowY: 'auto' }}>
            {futureSlots.slice(0, 12).map((slot, i) => {
              const start = new Date(slot.start);
              const end = new Date(slot.end);
              return (
                <Box
                  key={i}
                  onClick={propGroupId ? () => handleSuggest(slot) : undefined}
                  sx={{
                    px: 1.5, py: 1, borderRadius: 2.25, fontSize: 12, fontWeight: 700, color: 'var(--text)',
                    bgcolor: 'rgba(31,122,77,0.08)', border: '1px solid rgba(31,122,77,0.25)',
                    cursor: propGroupId ? 'pointer' : 'default'
                  }}
                >
                  {start.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} – {end.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto', p: { xs: 2, sm: 3, lg: 4 } }}>
      {/* ✅ Kompakt gruppinfo-rad — ALLTID synlig efter sökning (Kortvy och
          Panelvy), oavsett vald vy. Innan man sökt visas den INTE här,
          eftersom renderComparisonForm redan har en fullständig
          gruppinfo-box (med väntande medlemmar + <2 medlemmar-varning,
          som den kompakta raden inte täcker) — att visa båda samtidigt
          hade varit en dubblering. */}
      {showDesktopLayout && renderCompactGroupInfo()}

      {/* ✅ På mobil, och på desktop innan man sökt: den befintliga stora
          renderComparisonForm (InviteFriend, gruppinfo, avancerade
          alternativ, formulär). */}
      {(isMobile || !showDesktopLayout) && (isMobile ? renderMobileComparisonForm() : renderComparisonForm())}

      {/* ✅ ERROR HANDLING */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Fel vid kalenderjämförelse
          </Typography>
          {error}
        </Alert>
      )}

      {/* ✅ VY-TOGGLE: Panelvy (dockad sidopanel + kalender) vs Kortvy
          (dockad sidopanel + stora tidskort). Bara på desktop, bara
          efter sökning. */}
      {showDesktopLayout && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Box sx={{ display: 'inline-flex', p: 0.5, borderRadius: 3, bgcolor: 'rgba(17,24,39,0.05)', border: '1px solid rgba(17,24,39,0.08)' }}>
            <Box
              onClick={() => setViewMode('cards')}
              sx={{
                px: 2.25, py: 1.1, borderRadius: 2.25, cursor: 'pointer',
                fontSize: 13, fontWeight: 700,
                bgcolor: viewMode === 'cards' ? 'var(--text)' : 'transparent',
                color: viewMode === 'cards' ? '#fff' : 'var(--text-secondary)'
              }}
            >
              Kortvy
            </Box>
            <Box
              onClick={() => setViewMode('panel')}
              sx={{
                px: 2.25, py: 1.1, borderRadius: 2.25, cursor: 'pointer',
                fontSize: 13, fontWeight: 700,
                bgcolor: viewMode === 'panel' ? 'var(--text)' : 'transparent',
                color: viewMode === 'panel' ? '#fff' : 'var(--text-secondary)'
              }}
            >
              Panelvy
            </Box>
          </Box>
        </Box>
      )}

      {/* ✅ DESKTOP, EFTER SÖKNING: delad vänsterspalt (samma i båda
          vyerna) + huvudinnehåll som växlar mellan kalender (Panelvy)
          och kortgrid (Kortvy). */}
      {showDesktopLayout ? (
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
          {renderSettingsSidebar()}

          <Box sx={{ flex: 1, minWidth: 0 }}>
            {viewMode === 'panel' ? (
              <Box sx={{ p: 3, borderRadius: 5.5, border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)', boxShadow: '0 24px 80px rgba(15,23,42,0.08)' }}>
                <Typography sx={{ fontSize: 21, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em', mb: 2 }}>
                  Kalendervy
                </Typography>
                <Box sx={styles.calendar}>
                  <Calendar
                    localizer={localizer}
                    events={calendarEvents}
                    startAccessor="start"
                    endAccessor="end"
                    style={{ height: 560 }}
                    eventPropGetter={eventPropGetter}
                    views={['month', 'week', 'day']}
                    defaultView="week"
                    messages={{
                      next: 'Nästa', previous: 'Föregående', today: 'Idag',
                      month: 'Månad', week: 'Vecka', day: 'Dag'
                    }}
                  />
                </Box>
              </Box>
            ) : (
              <>
                {renderSlotCards}
                {showCalendarInCardsView ? (
                  <Paper elevation={0} sx={{ p: 3, mt: 3, borderRadius: 5.5, border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)', boxShadow: '0 24px 80px rgba(15,23,42,0.08)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                      <Typography variant="h5" sx={{ fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em' }}>
                        Kalendervy
                      </Typography>
                      <Box
                        onClick={() => setShowCalendarInCardsView(false)}
                        sx={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Dölj kalender
                      </Box>
                    </Box>
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
                          next: 'Nästa', previous: 'Föregående', today: 'Idag',
                          month: 'Månad', week: 'Vecka', day: 'Dag'
                        }}
                      />
                    </Box>
                  </Paper>
                ) : (
                  futureSlots.length > 0 && (
                    <Box
                      onClick={() => setShowCalendarInCardsView(true)}
                      sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, py: 2, mt: 3,
                        borderRadius: 4, border: '1px dashed rgba(17,24,39,0.14)', cursor: 'pointer',
                        color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700
                      }}
                    >
                      Visa kalendervy
                    </Box>
                  )
                )}
              </>
            )}
          </Box>
        </Box>
      ) : (
        /* ✅ MOBIL: oförändrad, alltid kort-baserad layout. */
        isMobile && renderMobileAvailableSlots
      )}

      {/* ✅ SUGGESTIONS - alltid synligt oavsett layout */}
      {renderSuggestions()}

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

      {/* ✅ PROPOSAL POPUP - Bottom Right Corner. Visas direkt när ett nytt
          tidsförslag kommer in, så mottagaren inte behöver scrolla ner och
          leta efter det. */}
      <Snackbar
        open={proposalNotification.open}
        onClose={() => setProposalNotification({ ...proposalNotification, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        sx={{
          '& .MuiPaper-root': {
            backgroundColor: 'rgba(255,255,255,0.95)',
            boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            backdropFilter: 'blur(18px)',
            minWidth: 320
          }
        }}
      >
        <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2 }}>
          {proposalNotification.proposal && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 1, color: 'var(--text)' }}>
                📋 {proposalNotification.proposal.title}
              </Typography>

              <Typography variant="body2" sx={{ mb: 0.5, color: 'var(--text-secondary)' }}>
                <strong>Tid:</strong> {new Date(proposalNotification.proposal.start).toLocaleString('sv-SE')}
              </Typography>

              <Typography variant="body2" sx={{ mb: 2, color: 'var(--text-secondary)' }}>
                <strong>Med:</strong> {proposalNotification.proposal.suggestedBy}
              </Typography>

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  sx={{
                    bgcolor: '#4caf50',
                    '&:hover': { bgcolor: '#45a049' },
                    flex: 1
                  }}
                  onClick={() => {
                    voteSuggestion(proposalNotification.proposal.id, 'accepted');
                    setProposalNotification({ ...proposalNotification, open: false });
                  }}
                >
                  ✓ Acceptera
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  sx={{
                    borderColor: '#f44336',
                    color: '#f44336',
                    '&:hover': { borderColor: '#d32f2f', color: '#d32f2f' },
                    flex: 1
                  }}
                  onClick={() => {
                    voteSuggestion(proposalNotification.proposal.id, 'rejected');
                    setProposalNotification({ ...proposalNotification, open: false });
                  }}
                >
                  ✗ Neka
                </Button>
              </Box>
            </Box>
          )}
        </Paper>
      </Snackbar>
    </Box>
  );
}