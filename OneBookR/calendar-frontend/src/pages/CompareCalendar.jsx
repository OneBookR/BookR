import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { 
  Container, Box, Typography, TextField, Button, CircularProgress, 
  Alert, Card, CardContent, Chip, IconButton, Select, MenuItem, FormControl, 
  InputLabel, Checkbox, FormControlLabel, Dialog, DialogTitle, DialogContent, 
  DialogActions, List, ListItem, ListItemText, ListItemButton, Tooltip, 
  Badge, Snackbar, Switch, Paper
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ShareIcon from '@mui/icons-material/Share';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import EventIcon from '@mui/icons-material/Event';
import GroupIcon from '@mui/icons-material/Group';
import PersonIcon from '@mui/icons-material/Person';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import LogoutIcon from '@mui/icons-material/Logout';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import TodayIcon from '@mui/icons-material/Today';
import ViewWeekIcon from '@mui/icons-material/ViewWeek';
import ViewDayIcon from '@mui/icons-material/ViewDay';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ListIcon from '@mui/icons-material/List';

const API_BASE_URL = 'https://www.onebookr.se';
const localizer = momentLocalizer(moment);

export default function CompareCalendar({ user, onNavigateToDashboard }) {
  // State declarations
  const [myToken, setMyToken] = useState(user?.accessToken || '');
  const [invitedEmails, setInvitedEmails] = useState(['']);
  const [invitedTokens, setInvitedTokens] = useState([]);
  const [freeSlots, setFreeSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [groupId, setGroupId] = useState(null);
  const [inviteeId, setInviteeId] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [allJoined, setAllJoined] = useState(false);
  const [invitedList, setInvitedList] = useState([]);
  const [joinedList, setJoinedList] = useState([]);
  const [declinedList, setDeclinedList] = useState([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [creatorEmail, setCreatorEmail] = useState('');
  const [meetingMinutes, setMeetingMinutes] = useState(60);
  const [customMinutes, setCustomMinutes] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dayStart, setDayStart] = useState('09:00');
  const [dayEnd, setDayEnd] = useState('18:00');
  const [calendarView, setCalendarView] = useState('week');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [isMobile, setIsMobile] = useState(false);

  const userEmail = user?.email || user?.emails?.[0]?.value || user?.emails?.[0];

  // useEffect hooks
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (user?.accessToken) {
      setMyToken(user.accessToken);
    }
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gid = params.get('group');
    const iid = params.get('invitee');
    if (gid) setGroupId(gid);
    if (iid) setInviteeId(iid);
  }, []);

  useEffect(() => {
    if (groupId && myToken && userEmail) {
      joinGroup();
    }
  }, [groupId, myToken, userEmail]);

  useEffect(() => {
    if (groupId && allJoined) {
      fetchGroupTokens();
    }
  }, [groupId, allJoined]);

  useEffect(() => {
    if (groupId) {
      checkGroupStatus();
      const interval = setInterval(checkGroupStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [groupId]);

  useEffect(() => {
    if (groupId) {
      fetchSuggestions();
      const interval = setInterval(fetchSuggestions, 3000);
      return () => clearInterval(interval);
    }
  }, [groupId]);

  // Functions
  const joinGroup = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/group/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          token: myToken,
          invitee: inviteeId,
          email: userEmail
        })
      });
      if (res.ok) {
        console.log('Joined group successfully');
      }
    } catch (err) {
      console.error('Failed to join group:', err);
    }
  };

  const checkGroupStatus = async () => {
    if (!groupId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/group/${groupId}/status`);
      const data = await res.json();
      setAllJoined(data.allJoined);
      setInvitedList(data.invited || []);
      setJoinedList(data.joined || []);
      setDeclinedList(data.declinedInvitations || []);
      setGroupName(data.groupName || 'Namnlös grupp');
      setCreatorEmail(data.creatorEmail || '');
      
      if (data.allJoined) {
        setStatusMessage('Alla har gått med! Ni kan nu börja jämföra kalendrar.');
      } else {
        const pending = data.expected - data.current - data.declined;
        setStatusMessage(`Väntar på ${pending} personer...`);
      }
    } catch (err) {
      console.error('Failed to check group status:', err);
    }
  };

  const fetchGroupTokens = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/group/${groupId}/tokens`);
      const data = await res.json();
      const tokens = data.tokens || [];
      const otherTokens = tokens.filter(t => t !== myToken);
      setInvitedTokens(otherTokens);
    } catch (err) {
      console.error('Failed to fetch group tokens:', err);
    }
  };

  const fetchSuggestions = async () => {
    if (!groupId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/group/${groupId}/suggestions`);
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
    }
  };

  const voteSuggestion = async (suggestionId, vote, targetGroupId = null) => {
    const targetGroup = targetGroupId || groupId;
    if (!targetGroup) return;
    try {
      await fetch(`${API_BASE_URL}/api/group/${targetGroup}/suggestion/${suggestionId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, vote })
      });
      fetchSuggestions();
    } catch (err) {
      console.error('Failed to vote on suggestion:', err);
    }
  };

  const fetchAvailability = async () => {
    if (!dateFrom || !dateTo) {
      setError('Välj både startdatum och slutdatum');
      return;
    }
    setLoading(true);
    setError('');
    setFreeSlots([]);
    
    const tokens = [myToken, ...invitedTokens].filter(Boolean);
    if (tokens.length === 0) {
      setError('Inga kalendrar att jämföra');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens,
          timeMin: new Date(dateFrom).toISOString(),
          timeMax: new Date(dateTo).toISOString(),
          duration: meetingMinutes,
          dayStart,
          dayEnd
        })
      });
      const slots = await res.json();
      setFreeSlots(slots || []);
    } catch (err) {
      setError('Kunde inte hämta lediga tider');
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestTime = async (slot) => {
    if (!groupId) return;
    try {
      await fetch(`${API_BASE_URL}/api/group/${groupId}/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: slot.start,
          end: slot.end,
          email: userEmail,
          title: `Möte - ${groupName}`,
          withMeet: true
        })
      });
      fetchSuggestions();
    } catch (err) {
      console.error('Failed to suggest time:', err);
    }
  };

  const handleLogout = () => {
    window.location.href = `${API_BASE_URL}/auth/logout`;
  };

  // Calendar events
  const calendarEvents = [
    ...freeSlots.map(slot => ({
      title: 'Ledig tid',
      start: new Date(slot.start),
      end: new Date(slot.end),
      resource: { type: 'free' }
    })),
    ...suggestions.map(sug => ({
      title: `${sug.title || 'Förslag'} (${Object.values(sug.votes).filter(v => v === 'accepted').length}/${joinedList.length})`,
      start: new Date(sug.start),
      end: new Date(sug.end),
      resource: { type: 'suggestion', id: sug.id }
    }))
  ];

  return (
    <Container maxWidth={false} sx={{ py: 4, px: { xs: 2, sm: 3 } }}>
      {/* Header */}
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="h3" sx={{ fontWeight: 700, mb: 2 }}>
          {groupName || 'Kalenderjämförelse'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          {onNavigateToDashboard && (
            <Button
              variant="outlined"
              startIcon={<ArrowBackIcon />}
              onClick={onNavigateToDashboard}
            >
              Tillbaka till Dashboard
            </Button>
          )}
          <Button
            variant="outlined"
            color="error"
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
          >
            Logga ut
          </Button>
        </Box>
      </Box>

      {/* Status */}
      {statusMessage && (
        <Alert severity={allJoined ? 'success' : 'info'} sx={{ mb: 3 }}>
          {statusMessage}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Date inputs */}
      <Box sx={{ mb: 4, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          type="date"
          label="Från"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          InputLabelProps={{ shrink: true }}
          fullWidth
        />
        <TextField
          type="date"
          label="Till"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          InputLabelProps={{ shrink: true }}
          fullWidth
        />
        <TextField
          type="time"
          label="Dag börjar"
          value={dayStart}
          onChange={(e) => setDayStart(e.target.value)}
          InputLabelProps={{ shrink: true }}
          fullWidth
        />
        <TextField
          type="time"
          label="Dag slutar"
          value={dayEnd}
          onChange={(e) => setDayEnd(e.target.value)}
          InputLabelProps={{ shrink: true }}
          fullWidth
        />
        <TextField
          type="number"
          label="Mötesstund (min)"
          value={meetingMinutes}
          onChange={(e) => setMeetingMinutes(Number(e.target.value))}
          fullWidth
        />
        <Button
          variant="contained"
          onClick={fetchAvailability}
          disabled={loading || !allJoined}
          fullWidth
        >
          {loading ? <CircularProgress size={24} /> : 'Hitta lediga tider'}
        </Button>
      </Box>

      {/* Calendar */}
      <Box sx={{ height: 600, mb: 4 }}>
        <Calendar
          localizer={localizer}
          events={calendarEvents}
          startAccessor="start"
          endAccessor="end"
          views={['month', 'week', 'day', 'agenda']}
          view={calendarView}
          date={calendarDate}
          onView={setCalendarView}
          onNavigate={setCalendarDate}
          eventPropGetter={(event) => {
            if (event.resource?.type === 'free') {
              return { style: { backgroundColor: '#4caf50' } };
            }
            return { style: { backgroundColor: '#2196f3' } };
          }}
          onSelectEvent={(event) => {
            if (event.resource?.type === 'free') {
              handleSuggestTime({ start: event.start, end: event.end });
            }
          }}
        />
      </Box>

      {/* Suggestions list */}
      {suggestions.length > 0 && (
        <Box>
          <Typography variant="h5" sx={{ mb: 2 }}>
            Tidsförslag
          </Typography>
          <List>
            {suggestions.map(sug => (
              <ListItem key={sug.id}>
                <ListItemText
                  primary={sug.title || 'Förslag'}
                  secondary={`${new Date(sug.start).toLocaleString()} - ${new Date(sug.end).toLocaleString()}`}
                />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    color="success"
                    onClick={() => voteSuggestion(sug.id, 'accepted')}
                    disabled={sug.votes[userEmail] === 'accepted'}
                  >
                    Acceptera
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={() => voteSuggestion(sug.id, 'declined')}
                    disabled={sug.votes[userEmail] === 'declined'}
                  >
                    Neka
                  </Button>
                </Box>
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Container>
  );
}