import express from 'express';
import cors from 'cors';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import session from 'express-session';
import { Resend } from 'resend';
import fetch from 'node-fetch';

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

// Middleware
app.use(cors({
  origin: ['https://www.onebookr.se', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json());
app.use(express.static('OneBookR/calendar-frontend/dist'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'bookr-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());
app.use(passport.session());

// In-memory storage
const groups = {};
const userInvitations = {};
const suggestions = {};

// Passport serialization
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'https://www.onebookr.se/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
  const user = {
    provider: 'google',
    id: profile.id,
    displayName: profile.displayName,
    emails: profile.emails,
    accessToken
  };
  return done(null, user);
}));

// Microsoft OAuth Strategy
passport.use(new MicrosoftStrategy({
  clientID: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  callbackURL: 'https://www.onebookr.se/auth/microsoft/callback',
  scope: ['user.read', 'calendars.read', 'calendars.readwrite']
}, (accessToken, refreshToken, profile, done) => {
  const user = {
    provider: 'microsoft',
    id: profile.id,
    displayName: profile.displayName,
    emails: profile.emails,
    accessToken
  };
  return done(null, user);
}));

// Helper function: Detect provider from token (ONLY ONE DECLARATION)
function detectProviderFromToken(token) {
  if (!token) return 'google';
  if (token.startsWith('Ew')) return 'microsoft';
  if (token.startsWith('ya29.')) return 'google';
  
  try {
    if (token.includes('.')) {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload.iss) {
          if (payload.iss.includes('microsoft') || payload.iss.includes('login.microsoftonline')) {
            return 'microsoft';
          }
          if (payload.iss.includes('google') || payload.iss.includes('accounts.google')) {
            return 'google';
          }
        }
      }
    }
  } catch (e) {
    console.log('Token parse error:', e.message);
  }
  
  return 'google';
}

// Fetch Microsoft Calendar Events
async function fetchMicrosoftCalendarEvents(token, min, max) {
  try {
    console.log('Fetching Microsoft Calendar events...');
    
    const testResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (testResponse.status === 401) {
      console.error('Microsoft OAuth token expired or invalid');
      return { events: [], timezone: 'Europe/Stockholm' };
    }
    
    let userTimezone = 'Europe/Stockholm';
    try {
      const settingsResponse = await fetch('https://graph.microsoft.com/v1.0/me/mailboxSettings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (settingsResponse.ok) {
        const settingsData = await settingsResponse.json();
        userTimezone = settingsData.timeZone || 'Europe/Stockholm';
      }
    } catch (err) {
      console.log('Could not fetch timezone, using default');
    }
    
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(min)}&endDateTime=${encodeURIComponent(max)}&$orderby=start/dateTime`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Prefer: 'outlook.timezone="Europe/Stockholm"'
        }
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error('Microsoft API error:', data.error);
      return { events: [], timezone: userTimezone };
    }

    const convertedEvents = (data.value || []).map(event => {
      const startDateTime = event.start.dateTime || event.start.date;
      const endDateTime = event.end.dateTime || event.end.date;
      
      return {
        summary: event.subject || 'Upptagen',
        start: {
          dateTime: startDateTime,
          timeZone: event.start.timeZone || userTimezone
        },
        end: {
          dateTime: endDateTime,
          timeZone: event.end.timeZone || userTimezone
        },
        isAllDay: event.isAllDay || false,
        originalProvider: 'microsoft'
      };
    });

    console.log(`Fetched ${convertedEvents.length} Microsoft events`);
    return { events: convertedEvents, timezone: userTimezone };
    
  } catch (err) {
    console.error('Error fetching Microsoft calendar events:', err);
    return { events: [], timezone: 'Europe/Stockholm' };
  }
}

// Fetch Google Calendar Events
async function fetchGoogleCalendarEvents(token, min, max) {
  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(min)}&timeMax=${encodeURIComponent(max)}&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      console.error('Google Calendar API error:', response.status);
      return { events: [], timezone: 'Europe/Stockholm' };
    }

    const data = await response.json();
    const events = (data.items || []).map(event => ({
      summary: event.summary || 'Upptagen',
      start: event.start,
      end: event.end,
      originalProvider: 'google'
    }));

    return { events, timezone: data.timeZone || 'Europe/Stockholm' };
  } catch (err) {
    console.error('Error fetching Google calendar events:', err);
    return { events: [], timezone: 'Europe/Stockholm' };
  }
}

// Auth routes
app.get('/auth/google', passport.authenticate('google', { 
  scope: ['profile', 'email', 'https://www.googleapis.com/auth/calendar'] 
}));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/');
  }
);

app.get('/auth/microsoft', passport.authenticate('microsoft'));

app.get('/auth/microsoft/callback',
  passport.authenticate('microsoft', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/');
  }
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

app.get('/auth/user', (req, res) => {
  res.json(req.user || null);
});

// API: Availability
app.post('/api/availability', async (req, res) => {
  const { tokens, timeMin, timeMax, duration, dayStart, dayEnd, providers } = req.body;

  console.log('=== AVAILABILITY API DEBUG ===');
  console.log('Tokens received:', Array.isArray(tokens) ? tokens.length : 0);
  console.log('Providers:', providers);

  if (!Array.isArray(tokens) || tokens.length === 0) {
    return res.json([]);
  }

  const timeMinISO = timeMin || new Date().toISOString();
  const timeMaxISO = timeMax || new Date(Date.now() + 30 * 864e5).toISOString();

  const allCalendarsBusy = [];
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const provider = (providers && providers[i]) || detectProviderFromToken(token);
    console.log(`Fetching events for token ${i + 1}/${tokens.length}, provider: ${provider}`);
    
    try {
      let eventsData;
      if (provider === 'microsoft') {
        eventsData = await fetchMicrosoftCalendarEvents(token, timeMinISO, timeMaxISO);
      } else {
        eventsData = await fetchGoogleCalendarEvents(token, timeMinISO, timeMaxISO);
      }
      
      const { events } = eventsData;
      console.log(`Token ${i + 1} returned ${events.length} events from ${provider}`);
      
      const busyTimes = events.map(event => {
        const start = new Date(event.start.dateTime || event.start.date).getTime();
        const end = new Date(event.end.dateTime || event.end.date).getTime();
        return {
          start,
          end,
          title: event.summary || 'Upptagen',
          provider: event.originalProvider || provider
        };
      }).filter(busy => busy.end > busy.start);
      
      allCalendarsBusy.push(busyTimes);
    } catch (error) {
      console.error(`Error fetching events for token ${i + 1}:`, error);
      allCalendarsBusy.push([]);
    }
  }

  // Merge busy times and calculate free slots (simplified logic)
  const rangeStart = new Date(timeMinISO).getTime();
  const rangeEnd = new Date(timeMaxISO).getTime();
  
  // For demo: return some free slots
  const freeSlots = [];
  let currentTime = rangeStart;
  
  while (currentTime < rangeEnd) {
    const slotStart = new Date(currentTime);
    const slotEnd = new Date(currentTime + (duration || 60) * 60 * 1000);
    
    if (slotEnd.getTime() <= rangeEnd) {
      freeSlots.push({
        start: slotStart.toISOString(),
        end: slotEnd.toISOString()
      });
    }
    
    currentTime += 24 * 60 * 60 * 1000; // Next day
  }

  console.log(`Sending ${freeSlots.length} free time blocks to frontend`);
  res.json(freeSlots.slice(0, 10)); // Return max 10 for demo
});

// API: Group routes
app.post('/api/group/join', (req, res) => {
  const { groupId, token, email } = req.body;
  
  if (!groups[groupId]) {
    groups[groupId] = { tokens: [], joined: [] };
  }
  
  if (!groups[groupId].tokens.includes(token)) {
    groups[groupId].tokens.push(token);
  }
  
  if (!groups[groupId].joined.includes(email)) {
    groups[groupId].joined.push(email);
  }
  
  res.json({ success: true });
});

app.get('/api/group/:groupId/tokens', (req, res) => {
  const { groupId } = req.params;
  const tokens = groups[groupId]?.tokens || [];
  res.json({ tokens });
});

app.get('/api/group/:groupId/status', (req, res) => {
  const { groupId } = req.params;
  const group = groups[groupId] || { tokens: [], joined: [] };
  res.json({
    current: group.joined.length,
    expected: group.joined.length,
    allJoined: true,
    invited: group.joined
  });
});

// Catch-all: Serve frontend
app.get('*', (req, res) => {
  res.sendFile('index.html', { root: 'OneBookR/calendar-frontend/dist' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ BookR server running on port ${PORT}`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
});