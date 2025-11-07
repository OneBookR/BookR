import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import bodyParser from 'body-parser';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import fetch from 'node-fetch';
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);
import { randomUUID } from 'crypto';
import path from 'path';
import { createGroup, getGroup, updateGroup, createInvitation, getInvitationsByEmail, getInvitationsByGroup, updateInvitation, createSuggestion, getSuggestionsByGroup, updateSuggestion, getSuggestion, deleteUserData, createUser, getUser, updateUserLastLogin } from './firestore.js';

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(bodyParser.json());
const PORT = process.env.PORT || 3000;

// Miljöflagg
const isDevelopment = process.env.NODE_ENV !== 'production';

// Maintenance mode
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true';
console.log('Maintenance mode:', MAINTENANCE_MODE ? 'ON (redirecting to waitlist)' : 'OFF (full app available)');

// Servera frontend static files
app.use(express.static('OneBookR/calendar-frontend/dist'));

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'OneBookR/calendar-frontend/dist/index.html'));
});

// Policy routes
app.get('/privacy-policy', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(process.cwd(), 'policy.html'));
});
app.get('/terms-of-service', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(process.cwd(), 'policy.html'));
});

// CORS
const corsOrigins = isDevelopment
  ? ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000']
  : ['https://www.onebookr.se'];

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
console.log('[CORS] Allowed origins:', corsOrigins);

// Session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    sameSite: isDevelopment ? 'lax' : 'none',
    secure: !isDevelopment,
    httpOnly: true,
    // domain bara i prod
    ...(isDevelopment ? {} : { domain: '.onebookr.se' })
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// Maintenance mode middleware
app.use((req, res, next) => {
  if (MAINTENANCE_MODE) {
    // Tillåt API- och Auth-rutter alltid
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
      return next();
    }

    const allowedPaths = [
      '/waitlist',
      '/admin/waitlist', 
      '/api/waitlist',
      '/api/waitlist/count',
      '/api/waitlist/admin',
      '/api/waitlist/share',
      '/api/admin/login'
    ];

    // Tillåt statiska filer (innehåller punkt och är inte HTML)
    const isStaticFile = req.path.includes('.') && !req.path.endsWith('.html');

    // Tillåt endast waitlist-relaterade sökvägar
    if (isStaticFile || allowedPaths.some(path => req.path.startsWith(path))) {
      return next();
    }
    return res.redirect('/waitlist');
  }
  next();
});

// Callback URLs
const googleCallbackUrl =
  process.env.GOOGLE_CALLBACK_URL ||
  (isDevelopment
    ? 'http://localhost:3000/auth/google/callback'
    : 'https://www.onebookr.se/auth/google/callback');

const microsoftCallbackUrl =
  process.env.MICROSOFT_CALLBACK_URL ||
  (isDevelopment
    ? 'http://localhost:3000/auth/microsoft/callback'
    : 'https://www.onebookr.se/auth/microsoft/callback');

console.log('[OAuth] Using Google callback URL:', googleCallbackUrl);
console.log('[OAuth] Using Microsoft callback URL:', microsoftCallbackUrl);

// Google OAuth
passport.use('google', new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: googleCallbackUrl,
  accessType: 'offline',
  prompt: 'consent',
  includeGrantedScopes: true
}, (accessToken, refreshToken, profile, done) => {
  // Sätt alltid profile.email till första e-post om den finns
  if (!profile.email && profile.emails && profile.emails.length > 0) {
    profile.email = profile.emails[0].value || profile.emails[0];
  }
  // Spara även profile.emails[0] som .primaryEmail för säkerhets skull
  if (!profile.primaryEmail && profile.emails && profile.emails.length > 0) {
    profile.primaryEmail = profile.emails[0].value || profile.emails[0];
  }
  profile.accessToken = accessToken;
  profile.refreshToken = refreshToken;  // Store refresh token for incremental auth
  profile.provider = 'google'; // NYTT: säkerställ provider sätts korrekt
  console.log('Google OAuth - Access token:', accessToken ? 'Present' : 'Missing');
  console.log('Google OAuth - Refresh token:', refreshToken ? 'Present' : 'Missing');
  return done(null, profile);
}));

// Microsoft OAuth
passport.use('microsoft', new MicrosoftStrategy({
  clientID: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  callbackURL: microsoftCallbackUrl,
  // FIX: Utökat scope för stabil token & e-post
  scope: [
    'openid',
    'profile',
    'email',
    'offline_access',
    'User.Read',
    'Calendars.Read',
    'Calendars.ReadWrite'
  ],
  tenant: 'common'
}, (accessToken, refreshToken, profile, done) => {
  profile.accessToken = accessToken;
  profile.refreshToken = refreshToken;
  profile.provider = 'microsoft';
  // NYTT: Normalisera e-postfält så frontenden kan använda user.email konsekvent
  const normalizedEmail = profile.mail || profile.userPrincipalName || (Array.isArray(profile.emails) ? (profile.emails[0]?.value || profile.emails[0]) : undefined);
  if (normalizedEmail) {
    profile.email = normalizedEmail;
    profile.primaryEmail = normalizedEmail;
  }
  return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Auth routes
app.get('/auth/google', (req, res, next) => {
  // Spara state-parameter om den finns
  const state = req.query.state;
  if (state) {
    req.session.oauthState = state;
  }
  
  passport.authenticate('google', {
    scope: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events'
    ],
    state: state,
    prompt: 'consent',  // Force refresh token
    accessType: 'offline',
    includeGrantedScopes: true  // Enable incremental authorization
  })(req, res, next);
});

app.get('/auth/microsoft', (req, res, next) => {
  const state = req.query.state;
  if (state) {
    req.session.oauthState = state;
  }
  
  passport.authenticate('microsoft', {
    scope: [
      'openid',
      'profile',
      'email',
      'offline_access',
      'User.Read',
      'Calendars.Read',
      'Calendars.ReadWrite'
    ],
    state: state
  })(req, res, next);
});

app.get('/auth/microsoft/callback',
  passport.authenticate('microsoft', { failureRedirect: '/' }),
  async (req, res) => {
    console.log('Microsoft OAuth callback - user authenticated:', req.user ? 'Yes' : 'No');
    
    const userEmail = req.user?.mail || req.user?.userPrincipalName || req.user?.email;
    
    if (userEmail) {
      try {
        const existingUser = await getUser(userEmail);
        const isNewUser = !existingUser;
        
        if (isNewUser) {
          // Skapa ny användare i Firestore
          await createUser(userEmail, 'microsoft');
          
          setImmediate(async () => {
            try {
              await resend.emails.send({
                from: 'BookR <info@onebookr.se>',
                to: userEmail,
                subject: 'Välkommen till BookR! 🎉',
                text: `Hej och välkommen till BookR!\n\nTack för att du registrerade dig med ditt Microsoft-konto! Du är nu redo att börja använda BookR för att:\n\n✅ Jämföra kalendrar med vänner och kollegor\n✅ Hitta gemensamma lediga tider på sekunder\n✅ Boka möten med automatiska Microsoft Teams-länkar\n✅ Slippa mejlkaoset när ni ska planera möten\n\nKom igång direkt på: https://www.onebookr.se\n\nHar du frågor? Svara bara på det här mejlet så hjälper vi dig!\n\nVälkommen ombord! 🚀\n\nBookR-teamet\ninfo@onebookr.se`
              });
              console.log('Välkomstmejl skickat till ny Microsoft-användare:', userEmail);
            } catch (error) {
              console.error('Fel vid välkomstmejl:', error);
            }
          });
        } else {
          // Uppdatera senaste inloggning för befintlig användare
          await updateUserLastLogin(userEmail);
        }
      } catch (error) {
        console.error('Fel vid användarhantering:', error);
      }
    }
    
    const authToken = Buffer.from(JSON.stringify({
      user: req.user,
      timestamp: Date.now()
    })).toString('base64');
    
    const state = req.session.oauthState;
    delete req.session.oauthState;
    
    let redirectUrl = `/?auth=${authToken}`;
    
    if (state) {
      try {
        const parsed = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
        if (parsed.type === 'business-admin') {
          redirectUrl = `/business-admin?auth=${authToken}`;
        } else if (parsed.returnUrl) {
          redirectUrl = `${parsed.returnUrl}${parsed.returnUrl.includes('?') ? '&' : '?'}auth=${authToken}`;
        }
      } catch (e) {
        // Om state inte kan tolkas, använd standard redirect
      }
    }

    const frontendUrl = isDevelopment 
      ? 'http://localhost:5173' 
      : 'https://www.onebookr.se';
    res.redirect(`${frontendUrl}${redirectUrl}`);
  }
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  async (req, res) => {
    console.log('OAuth callback - user authenticated:', req.user ? 'Yes' : 'No');
    console.log('OAuth state received:', req.session.oauthState);
    
    // Kontrollera om detta är en ny användare genom Firestore
    const userEmail = req.user?.email || req.user?.emails?.[0]?.value || req.user?.emails?.[0];
    
    if (userEmail) {
      try {
        const existingUser = await getUser(userEmail);
        const isNewUser = !existingUser;
        
        if (isNewUser) {
          // Skapa ny användare i Firestore
          await createUser(userEmail, 'google');
          
          // Skicka välkomstmejl asynkront
          setImmediate(async () => {
            try {
              await resend.emails.send({
                from: 'BookR <info@onebookr.se>',
                to: userEmail,
                subject: 'Välkommen till BookR! 🎉',
                text: `Hej och välkommen till BookR!\n\nTack för att du registrerade dig! Du är nu redo att börja använda BookR för att:\n\n✅ Jämföra kalendrar med vänner och kollegor\n✅ Hitta gemensamma lediga tider på sekunder\n✅ Boka möten med automatiska Google Meet-länkar\n✅ Slippa mejlkaoset när ni ska planera möten\n\nKom igång direkt på: https://www.onebookr.se\n\nHar du frågor? Svara bara på det här mejlet så hjälper vi dig!\n\nVälkommen ombord! 🚀\n\nBookR-teamet\ninfo@onebookr.se`
              });
              console.log('Välkomstmejl skickat till ny användare:', userEmail);
            } catch (error) {
              console.error('Fel vid välkomstmejl:', error);
            }
          });
        } else {
          // Uppdatera senaste inloggning för befintlig användare
          await updateUserLastLogin(userEmail);
        }
      } catch (error) {
        console.error('Fel vid användarhantering:', error);
      }
    }
    
    // Skapa en enkel auth token och skicka som URL-parameter
    const authToken = Buffer.from(JSON.stringify({
      user: req.user,
      timestamp: Date.now()
    })).toString('base64');
    
    // Hämta state från session
    const state = req.session.oauthState;
    delete req.session.oauthState;
    
    let redirectUrl = `/?auth=${authToken}`;
    
    if (state) {
      try {
        const parsed = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
        if (parsed.type === 'business-admin') {
          redirectUrl = `/business-admin?auth=${authToken}`;
        } else if (parsed.returnUrl) {
          redirectUrl = `${parsed.returnUrl}${parsed.returnUrl.includes('?') ? '&' : '?'}auth=${authToken}`;
        }
      } catch (e) {
        // Om state inte kan tolkas, använd standard redirect
      }
    }

    const frontendUrl = isDevelopment 
      ? 'http://localhost:5173' 
      : 'https://www.onebookr.se';
    res.redirect(`${frontendUrl}${redirectUrl}`);
  }
);

// User
app.get('/api/user', (req, res) => {
  console.log('API /user called:', {
    isAuthenticated: req.isAuthenticated(),
    sessionID: req.sessionID,
    user: req.user ? 'User exists' : 'No user',
    sessionUser: req.session.user ? 'Session user exists' : 'No session user',
    cookies: req.headers.cookie ? 'Cookies present' : 'No cookies'
  });
  
  // Kolla både passport auth och session
  const user = req.user || req.session.user;
  
  if (user) {
    // NYTT: Normalisera email och provider i svaret
    if (!user.email) {
      user.email = user.mail || user.userPrincipalName || (Array.isArray(user.emails) ? (user.emails[0]?.value || user.emails[0]) : undefined);
    }
    if (!user.provider && user.accessToken) {
      try {
        // enkel heuristik
        const tk = String(user.accessToken || '');
        user.provider = tk.startsWith('Ew') ? 'microsoft' : 'google';
      } catch {}
    }
    res.json({ user: user, token: user.accessToken });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Logout
app.get('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    req.session.destroy(() => {
      const frontendUrl = isDevelopment 
        ? 'http://localhost:5173' 
        : 'https://www.onebookr.se';
      res.redirect(frontendUrl + '/');
    });
  });
});

// Microsoft – simple test + timezone + events
const fetchMicrosoftCalendarEvents = async (token, min, max) => {
  try {
    const testResponse = await fetch(
      'https://graph.microsoft.com/v1.0/me',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    
    if (testResponse.status === 401) {
      console.error('Microsoft OAuth token expired or invalid');
      return { events: [], timezone: 'Europe/Stockholm' };
    }
    
    // Hämta användarens tidszon
    let userTimezone = 'Europe/Stockholm'; // Default
    try {
      const settingsResponse = await fetch(
        'https://graph.microsoft.com/v1.0/me/mailboxSettings',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (settingsResponse.ok) {
        const settingsData = await settingsResponse.json();
        userTimezone = settingsData.timeZone || 'Europe/Stockholm';
      }
    } catch (err) {
      console.log('Could not fetch timezone, using default');
    }
    
    // Hämta kalenderhändelser
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/events?$filter=start/dateTime ge '${min}' and end/dateTime le '${max}'&$orderby=start/dateTime`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error('Microsoft API-fel vid hämtning av händelser:', data.error);
      return { events: [], timezone: userTimezone };
    }

    // Konvertera Microsoft events till Google Calendar format
    const convertedEvents = (data.value || []).map(event => ({
      summary: event.subject,
      start: {
        dateTime: event.start.dateTime,
        timeZone: event.start.timeZone
      },
      end: {
        dateTime: event.end.dateTime,
        timeZone: event.end.timeZone
      },
      isAllDay: event.isAllDay
    }));

    console.log('Fetched Microsoft events:', convertedEvents.length, 'timezone:', userTimezone);

    return { events: convertedEvents, timezone: userTimezone };
  } catch (err) {
    console.error('Fel vid hämtning av Microsoft kalenderhändelser:', err);
    return { events: [], timezone: 'Europe/Stockholm' };
  }
};

// Google fetch all calendars
const fetchCalendarEvents = async (token, min, max, provider = 'google') => {
  console.log(`fetchCalendarEvents called with provider: ${provider}`);
  if (provider === 'microsoft') {
    return fetchMicrosoftCalendarEvents(token, min, max);
  }
  try {
    // Test token validity first
    const testResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/settings/timezone',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    
    if (testResponse.status === 401) {
      console.error('Google OAuth token expired or invalid for token:', String(token).slice(0, 20) + '...');
      console.error('Token validation failed - user needs to re-authenticate');
      return { events: [], timezone: 'Europe/Stockholm' };
    }
    
    // Hämta användarens tidszon
    const settingsResponse = testResponse;
    
    let userTimezone = 'Europe/Stockholm'; // Default
    if (settingsResponse.ok) {
      const settingsData = await settingsResponse.json();
      userTimezone = settingsData.value || 'Europe/Stockholm';
    }
    
    // Hämta alla kalendrar
    const calendarListResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const calendarListData = await calendarListResponse.json();
    if (!calendarListResponse.ok) {
      console.error('API-fel vid hämtning av kalenderlista:', calendarListData.error);
      return { events: [], timezone: userTimezone };
    }

    // Filtrera bort publika/helgdagar/veckonummer-kalendrar
    const calendars = (calendarListData.items || []).filter(
      cal =>
        cal.primary === true ||
        (
          !cal.id.includes('holiday@') &&
          !cal.id.toLowerCase().includes('weeknum') &&
          !cal.summary.toLowerCase().includes('helgdag') &&
          !cal.summary.toLowerCase().includes('veckonummer')
        )
    );

    // Reduced logging to prevent rate limits
    if (calendars.length > 0) {
      console.log('Found', calendars.length, 'calendars for user');
    }

    // Hämta händelser från varje kalender
    const eventsPromises = calendars.map(async (calendar) => {
      try {
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            calendar.id
          )}/events?timeMin=${min}&timeMax=${max}&singleEvents=true&orderBy=startTime`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await response.json();
        if (!response.ok) {
          if (response.status === 401) {
            console.error(`Token expired for calendar ${calendar.id} - user needs to re-authenticate`);
            return [];
          }
          console.error(`API-fel för kalender ${calendar.id}:`, data.error);
          return [];
        }

        const events = data.items || [];
        console.log(`Calendar ${calendar.summary}: ${events.length} events`);
        return events;
      } catch (err) {
        console.error(`Fel vid hämtning av händelser för kalender ${calendar.id}:`, err);
        return [];
      }
    });

    // Vänta på alla händelser
    const allEvents = await Promise.all(eventsPromises);

    // Slå ihop alla händelser till en enda array
    const flatEvents = allEvents.flat();
    console.log('Google Calendar - Fetched events for', allEvents.length, 'calendars, total events:', flatEvents.length, 'timezone:', userTimezone);
    
    // Debug: logga första eventet om det finns
    if (flatEvents.length > 0) {
      console.log('First Google event:', JSON.stringify(flatEvents[0], null, 2));
    }

    return { events: flatEvents, timezone: userTimezone };
  } catch (err) {
    console.error('Fel vid hämtning av kalenderhändelser:', err);
    return { events: [], timezone: 'Europe/Stockholm' };
  }
};

// Merge busy times
const mergeBusyTimes = (busyTimes) => {
  if (!Array.isArray(busyTimes) || busyTimes.length === 0) return [];
  
  const filtered = busyTimes
    .filter(t => typeof t.start === 'number' && typeof t.end === 'number' && t.end > t.start)
    .sort((a, b) => a.start - b.start);

  if (filtered.length === 0) return [];

  const merged = [{ ...filtered[0] }];
  
  for (let i = 1; i < filtered.length; i++) {
    const current = filtered[i];
    const lastMerged = merged[merged.length - 1];
    
    // Endast slå ihop om events verkligen överlappar (inte bara är intill)
    // Detta bevarar korta events som 15-minuters möten
    if (current.start < lastMerged.end) {
      // Verkligt överlapp - slå ihop
      lastMerged.end = Math.max(lastMerged.end, current.end);
      console.log(`Merged overlapping events: ${lastMerged.title} + ${current.title}`);
    } else {
      // Inget överlapp - behåll som separata events
      merged.push({ ...current });
    }
  }
  
  console.log(`Merged ${filtered.length} events into ${merged.length} busy periods`);
  return merged;
};

// Calculate free times
const calculateFreeTimes = (mergedBusy, rangeStart, rangeEnd) => {
  if (typeof rangeStart !== 'number' || typeof rangeEnd !== 'number') return [];
  if (rangeEnd <= rangeStart) return [];
  
  const freeTimes = [];
  
  if (!Array.isArray(mergedBusy) || mergedBusy.length === 0) {
    freeTimes.push({ start: new Date(rangeStart), end: new Date(rangeEnd) });
    return freeTimes;
  }

  let cursor = rangeStart;

  for (const slot of mergedBusy) {
    if (!slot || typeof slot.start !== 'number' || typeof slot.end !== 'number') continue;
    if (slot.end <= slot.start) continue;
    
    if (slot.end <= rangeStart || slot.start >= rangeEnd) continue;
    
    // Använd exakta tider från kalendern - ingen rundning
    const slotStart = Math.max(slot.start, rangeStart);
    const slotEnd = Math.min(slot.end, rangeEnd);
    
    // Ledig tid före detta upptagna block (exakt tid)
    if (cursor < slotStart) {
      const freeSlot = { start: new Date(cursor), end: new Date(slotStart) };
      const freeDuration = Math.round((slotStart - cursor) / (1000 * 60));
      console.log(`Free slot: ${freeDuration} minutes`);
      freeTimes.push(freeSlot);
    }
    
    cursor = Math.max(cursor, slotEnd);
    
    const busyDuration = Math.round((slotEnd - slotStart) / (1000 * 60));
    console.log(`Busy slot: ${slot.title} - ${busyDuration} minutes`);
  }

  if (cursor < rangeEnd) {
    const finalFreeSlot = { start: new Date(cursor), end: new Date(rangeEnd) };
    const finalDuration = Math.round((rangeEnd - cursor) / (1000 * 60));
    console.log(`Final free slot: ${finalDuration} minutes`);
    freeTimes.push(finalFreeSlot);
  }

  return freeTimes.filter(ft => ft.end > ft.start);
};

// Common free times
const findCommonFreeTimes = (freeTimes1, freeTimes2) => {
  const commonFreeTimes = [];
  let i = 0, j = 0;

  while (i < freeTimes1.length && j < freeTimes2.length) {
    const start = Math.max(freeTimes1[i].start.getTime(), freeTimes2[j].start.getTime());
    const end = Math.min(freeTimes1[i].end.getTime(), freeTimes2[j].end.getTime());

    if (start < end) {
      commonFreeTimes.push({ start: new Date(start), end: new Date(end) });
    }

    if (freeTimes1[i].end.getTime() < freeTimes2[j].end.getTime()) {
      i++;
    } else {
      j++;
    }
  }

  return commonFreeTimes;
};

// Split free slots
function splitFreeSlots(freeSlots, durationMinutes) {
  if (!Array.isArray(freeSlots) || freeSlots.length === 0) return [];
  if (!durationMinutes || durationMinutes <= 0) return [];
  
  const result = [];
  const durationMs = durationMinutes * 60 * 1000;
  
  for (const slot of freeSlots) {
    if (!slot || !slot.start || !slot.end) continue;
    
    try {
      const startTime = slot.start.getTime();
      const endTime = slot.end.getTime();
      
      if (isNaN(startTime) || isNaN(endTime) || endTime <= startTime) continue;
      
      let current = startTime;
      while (current + durationMs <= endTime) {
        result.push({
          start: new Date(current),
          end: new Date(current + durationMs),
        });
        current += durationMs;
      }
    } catch (error) {
      console.warn('Error splitting free slot:', error);
      continue;
    }
  }
  
  return result;
}

// Filter by day time
function filterSlotsByDayTime(slots, dayStart, dayEnd) {
  if (!Array.isArray(slots) || slots.length === 0) return [];
  if (!dayStart || !dayEnd) return slots;
  
  try {
    const [startHour, startMinute] = dayStart.split(':').map(Number);
    const [endHour, endMinute] = dayEnd.split(':').map(Number);
    
    if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute)) {
      return slots;
    }

    return slots.filter(slot => {
      if (!slot || !slot.start || !slot.end) return false;
      
      try {
        const start = new Date(slot.start);
        const end = new Date(slot.end);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;

        // KORREKT: Använd exakt samma tidszon som kalendern (lokal tid)
        const startHour24 = start.getHours();
        const startMin = start.getMinutes();
        const endHour24 = end.getHours();
        const endMin = end.getMinutes();
        
        // Kontrollera att hela sloten är inom angivet tidsintervall
        const startTimeMinutes = startHour24 * 60 + startMin;
        const endTimeMinutes = endHour24 * 60 + endMin;
        const dayStartMinutes = startHour * 60 + startMinute;
        const dayEndMinutes = endHour * 60 + endMinute;
        
        // STRIKT: Sloten måste vara helt inom tidsramen
        return startTimeMinutes >= dayStartMinutes && endTimeMinutes <= dayEndMinutes;
      } catch (error) {
        console.warn('Error filtering slot by day time:', error);
        return false;
      }
    });
  } catch (error) {
    console.error('Error in filterSlotsByDayTime:', error);
    return slots;
  }
}

// Provider autodetection helpers
function looksLikeGoogleToken(token) {
  if (!token) return false;
  // Google short-lived access tokens often start with 'ya29.'
  if (token.startsWith('ya29.')) return true;
  // Try decode JWT payload to check issuer
  try {
    if (token.split('.').length >= 2 && token.startsWith('eyJ')) {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
      const iss = String(payload.iss || '').toLowerCase();
      if (iss.includes('accounts.google.com')) return true;
    }
  } catch {}
  return false;
}
function looksLikeMicrosoftToken(token) {
  if (!token) return false;
  // MS tokens can be JWT (eyJ...) or opaque 'Ew...'; treat both as possible MS
  if (token.startsWith('Ew')) return true;
  try {
    if (token.split('.').length >= 2 && token.startsWith('eyJ')) {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
      const iss = String(payload.iss || '').toLowerCase();
      const aud = String(payload.aud || '').toLowerCase();
      if (iss.includes('login.microsoftonline.com') || aud.includes('graph.microsoft.com')) return 'microsoft';
      if (iss.includes('accounts.google.com')) return 'google';
    }
  } catch {}
  return false;
}
function detectProvider(token) {
  if (looksLikeGoogleToken(token) && !looksLikeMicrosoftToken(token)) return 'google';
  if (looksLikeMicrosoftToken(token) && !looksLikeGoogleToken(token)) return 'microsoft';
  // Unknown: prefer trying Google first for ya29 or JWT with google iss, else Microsoft
  if (token && token.startsWith('ya29.')) return 'google';
  if (token && token.startsWith('Ew')) return 'microsoft';
  // Extra JWT heuristik
  try {
    if (token && token.split('.').length >= 2 && token.startsWith('eyJ')) {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
      const iss = String(payload.iss || '').toLowerCase();
      const aud = String(payload.aud || '').toLowerCase();
      if (iss.includes('login.microsoftonline.com') || aud.includes('graph.microsoft.com')) return 'microsoft';
      if (iss.includes('accounts.google.com')) return 'google';
    }
  } catch {}
  return 'google';
}

// Remote fetchers
async function fetchGoogleEvents(accessToken, timeMinISO, timeMaxISO) {
  try {
    const tzRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/settings/timezone', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const tzData = tzRes.ok ? await tzRes.json() : null;
    const tz = tzData?.value || 'UTC';

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMinISO)}&timeMax=${encodeURIComponent(timeMaxISO)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, events: [] };
    if (!res.ok) return { ok: false, status: res.status, events: [] };
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    return { ok: true, status: 200, tz, events: items };
  } catch (e) {
    return { ok: false, status: 0, events: [] };
  }
}
async function fetchMicrosoftEvents(accessToken, timeMinISO, timeMaxISO) {
  try {
    const tzPref = 'outlook.timezone="UTC"';
    const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(timeMinISO)}&endDateTime=${encodeURIComponent(timeMaxISO)}&$select=subject,start,end,isAllDay&$orderby=start/dateTime&$top=500`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Prefer: tzPref } });
    if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, events: [] };
    if (!res.ok) return { ok: false, status: res.status, events: [] };
    const data = await res.json();
    const items = Array.isArray(data.value) ? data.value : [];

    const normalized = items.map(ev => {
      const s = ev?.start?.dateTime;
      const e = ev?.end?.dateTime;
      let startDT = s;
      let endDT = e;
      const hasOffset = (v) => /[zZ]|[\+\-]\d{2}:\d{2}$/.test(v);
      if (s && !hasOffset(s)) startDT = s + 'Z';
      if (e && !hasOffset(e)) endDT = e + 'Z';
      return {
        subject: ev.subject,
        start: { dateTime: startDT, timeZone: ev?.start?.timeZone || 'UTC' },
        end: { dateTime: endDT, timeZone: ev?.end?.timeZone || 'UTC' },
        isAllDay: ev.isAllDay
      };
    });

    return { ok: true, status: 200, tz: 'UTC', events: normalized };
  } catch (e) {
    return { ok: false, status: 0, events: [] };
  }
}
// Fallback om calendarView returnerar 0 events
async function fetchMicrosoftEventsFallback(accessToken, timeMinISO, timeMaxISO) {
  try {
    const url = `https://graph.microsoft.com/v1.0/me/events?$filter=start/dateTime ge '${timeMinISO}' and end/dateTime le '${timeMaxISO}'&$select=subject,start,end,isAllDay&$orderby=start/dateTime&$top=200`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return { ok: false, status: res.status, events: [] };
    const data = await res.json();
    const items = Array.isArray(data.value) ? data.value : [];
    const norm = items.map(ev => {
      const s = ev?.start?.dateTime || '';
      const e = ev?.end?.dateTime || '';
      const hasOffset = (v) => /[zZ]|[\+\-]\d{2}:\d{2}$/.test(v);
      return {
        subject: ev.subject,
        start: { dateTime: s ? (hasOffset(s) ? s : s + 'Z') : null, timeZone: 'UTC' },
        end: { dateTime: e ? (hasOffset(e) ? e : e + 'Z') : null, timeZone: 'UTC' },
        isAllDay: ev.isAllDay
      };
    }).filter(x => x.start?.dateTime && x.end?.dateTime);
    return { ok: true, status: 200, tz: 'UTC', events: norm };
  } catch {
    return { ok: false, status: 0, events: [] };
  }
}

// Normalize events -> busy blocks
function normalizeGoogleEventsToBusy(items) {
  const busy = [];
  for (const ev of items) {
    const startISO = ev?.start?.dateTime || ev?.start?.date;
    const endISO = ev?.end?.dateTime || ev?.end?.date;
    if (!startISO || !endISO) continue;
    const start = new Date(startISO).getTime();
    const end = new Date(endISO).getTime();
    if (isFinite(start) && isFinite(end) && end > start) {
      busy.push({ start, end, title: ev.summary || 'busy', isAllDay: !!ev?.start?.date });
    }
  }
  return busy;
}
function normalizeMicrosoftEventsToBusy(items) {
  const busy = [];
  for (const ev of items) {
    const startISO = ev?.start?.dateTime;
    const endISO = ev?.end?.dateTime;
    if (!startISO || !endISO) continue;
    const start = new Date(startISO).getTime();
    const end = new Date(endISO).getTime();
    if (isFinite(start) && isFinite(end) && end > start) {
      busy.push({ start, end, title: ev.subject || 'busy', isAllDay: !!ev.isAllDay });
    }
  }
  return busy;
}

// Try primary provider, then fallback
async function fetchCalendarBusyAuto(token, timeMinISO, timeMaxISO) {
  const detected = detectProvider(token);
  console.log('[Availability] autodetect provider:', detected);
  const tryOrder = detected === 'microsoft' ? ['microsoft', 'google'] : ['google', 'microsoft'];

  for (const prov of tryOrder) {
    let res;
    if (prov === 'google') {
      res = await fetchGoogleEvents(token, timeMinISO, timeMaxISO);
    } else {
      res = await fetchMicrosoftEvents(token, timeMinISO, timeMaxISO);
      if (res.ok && res.events.length === 0) {
        const fb = await fetchMicrosoftEventsFallback(token, timeMinISO, timeMaxISO);
        if (fb.ok) res = fb;
      }
    }

    if (res.ok && res.events.length > 0) {
      const busy = prov === 'google'
        ? normalizeGoogleEventsToBusy(res.events)
        : normalizeMicrosoftEventsToBusy(res.events);
      console.log(`[Availability][${prov}] busy blocks: ${busy.length}`);
      return { provider: prov, busy };
    }
    if (res.status === 401 || res.status === 403) continue;
  }
  return { provider: detected, busy: [] };
}

// Availability
app.post('/api/availability', async (req, res) => {
  const { tokens, timeMin, timeMax, duration, dayStart, dayEnd } = req.body;

  console.log('=== AVAILABILITY API DEBUG ===');
  console.log('Tokens mottagna av backend:', Array.isArray(tokens) ? tokens.length : 0, 'tokens');
  console.log('[Availability] inkommande tokens (för providers):', tokens.map(t => detectProvider(t)));

  if (!Array.isArray(tokens) || tokens.length === 0) {
    return res.json([]);
  }

  const timeMinISO = timeMin || new Date().toISOString();
  const timeMaxISO = timeMax || new Date(Date.now() + 30 * 864e5).toISOString();

  // Per-token busy extraction with autodetect and fallback
  const allCalendarsBusy = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const detected = detectProvider(token);
    console.log(`Fetching calendar events for token ${i + 1}/${tokens.length}, detected provider: ${detected}`);
    const { provider, busy } = await fetchCalendarBusyAuto(token, timeMinISO, timeMaxISO);
    console.log(`Token ${i + 1} processed ${busy.length} events (provider used: ${provider})`);
    allCalendarsBusy.push(busy);
  }

  // Slå ihop alla upptagna tider för varje användare
  const mergedBusyTimes = allCalendarsBusy.map(events =>
    mergeBusyTimes(events)
  );

  // Beräkna lediga tider för varje användare
  const rangeStart = new Date(timeMin).getTime();
  const rangeEnd = new Date(timeMax).getTime();

  const allFreeTimes = mergedBusyTimes.map(busyTimes =>
    calculateFreeTimes(busyTimes, rangeStart, rangeEnd)
  );

  // Gemensamma lediga tider mellan ALLA användare
  let commonFreeTimes = allFreeTimes[0] || [];
  
  if (allFreeTimes.length === 1) {
    console.log('Single user mode - using only their free times');
  } else {
    console.log(`Finding common free times across ${allFreeTimes.length} calendars`);
    // Flera användare - hitta gemensamma tider genom att iterera genom alla
    for (let i = 1; i < allFreeTimes.length; i++) {
      commonFreeTimes = findCommonFreeTimes(commonFreeTimes, allFreeTimes[i]);
      console.log(`After comparing with calendar ${i + 1}: ${commonFreeTimes.length} common slots remaining`);
    }
    console.log(`Final result: ${commonFreeTimes.length} common free time slots found`);
  }

  // Dela upp långa luckor i mindre block
  let splitBlocks = splitFreeSlots(commonFreeTimes, duration);

  // Filtrera blocken på daglig tidsram om det är angivet
  if (dayStart && dayEnd) {
    splitBlocks = filterSlotsByDayTime(splitBlocks, dayStart, dayEnd);
  }

  // Kontroll: Ta bara med block som är i framtiden
  const now = Date.now();
  splitBlocks = splitBlocks.filter(slot => new Date(slot.end).getTime() > now);

  // Formatera blocken utan tidszonsjustering
  const formattedBlocks = splitBlocks.map(slot => ({
    ...slot,
    start: slot.start instanceof Date ? slot.start.toISOString() : slot.start,
    end: slot.end instanceof Date ? slot.end.toISOString() : slot.end
  }));

  console.log(`Sending ${formattedBlocks.length} formatted blocks to frontend`);
  if (formattedBlocks.length === 0) {
    console.log('No free time slots found - token issues or no overlap');
    console.log('Individual calendar free times:', allFreeTimes.map((ft, i) => `Calendar ${i + 1}: ${ft.length} slots`));
  }

  res.json(formattedBlocks);
});

// Invite
app.post('/api/invite', async (req, res) => {
  const { emails, fromUser, fromToken, groupName, isTeamMeeting, teamName, directAccess, hasDirectAccessTeam } = req.body;

  let creatorEmail = fromUser;
  if (typeof fromUser === 'object' && fromUser && (fromUser.email || (fromUser.emails && fromUser.emails.length > 0))) {
    creatorEmail = fromUser.email || (fromUser.emails && fromUser.emails[0].value) || (fromUser.emails && fromUser.emails[0]);
  }
  if (!creatorEmail || !creatorEmail.includes('@')) {
    return res.status(400).json({ error: 'fromUser måste vara en giltig e-postadress.' });
  }
  if (!emails || !creatorEmail || !fromToken) {
    return res.status(400).json({ error: 'Alla fält krävs (emails, fromUser, fromToken)' });
  }

  try {
    const creatorProvider = detectProvider(fromToken) || 'google';

    const groupId = await createGroup({
      creatorEmail,
      creatorToken: fromToken,
      creatorProvider,
      groupName: groupName || teamName || 'Namnlös grupp',
      tokens: [fromToken],
      joinedEmails: [creatorEmail],
      isTeamMeeting: isTeamMeeting || false,
      teamName: teamName || null,
      directAccess: directAccess || hasDirectAccessTeam || false
    });

    const invitees = [];
    for (const email of emails) {
      const inviteeId = randomUUID();
      await createInvitation({
        groupId,
        inviteeId,
        email,
        fromEmail: creatorEmail,
        groupName: groupName || teamName || 'Namnlös grupp',
        isTeamMeeting: isTeamMeeting || false,
        teamName: teamName || null
      });
      invitees.push({ id: inviteeId, email });
    }

    const frontendUrl = process.env.FRONTEND_URL || (isDevelopment ? 'http://localhost:5173' : 'https://www.onebookr.se');
    const inviteLinks = invitees.map(inv => `${frontendUrl}?group=${groupId}&invitee=${inv.id}`);
    console.log('Skickar inbjudningar:', invitees.map((inv, i) => `${inv.email}: ${inviteLinks[i]}`));

    res.json({
      message: 'Inbjudningar skickade!',
      groupId,
      inviteLinks,
      directAccess: directAccess || hasDirectAccessTeam || false
    });

    setImmediate(async () => {
      try {
        console.log('Försöker skicka mejl via Resend');
        const emailResults = [];
        for (let i = 0; i < invitees.length; i++) {
          const inv = invitees[i];
          // Skicka inte till samma adress som avsändaren
          if (inv.email && inv.email !== creatorEmail) {
            let emailSent = false;
            let attempts = 0;
            const maxAttempts = 3;
            
            while (!emailSent && attempts < maxAttempts) {
              attempts++;
              try {
                const emailSubject = isTeamMeeting ? `Inbjudan till teammöte: ${teamName}` : 'Inbjudan till Kalenderjämförelse';
                const emailText = isTeamMeeting 
                  ? `Hej!\n\n${creatorEmail} har bjudit in dig till ett teammöte för "${teamName}".\n\nKlicka på din unika länk nedan:\n${inviteLinks[i]}`
                  : `Hej!\n\n${creatorEmail} har bjudit in dig till gruppen "${groupName || 'Namnlös grupp'}".\n\nKlicka på din unika länk nedan:\n${inviteLinks[i]}`;
                
                const result = await resend.emails.send({
                  from: 'BookR <info@onebookr.se>',
                  to: inv.email,
                  subject: emailSubject,
                  text: emailText
                });
                
                console.log(`Inbjudningsmejl skickat till ${inv.email} (försök ${attempts}/${maxAttempts}), ID: ${result?.id}`);
                emailResults.push({ email: inv.email, success: true, attempts, id: result?.id });
                emailSent = true;
              } catch (sendErr) {
                console.error(`Fel vid utskick till ${inv.email} (försök ${attempts}/${maxAttempts}):`, sendErr.message);
                if (attempts === maxAttempts) {
                  emailResults.push({ email: inv.email, success: false, attempts, error: sendErr.message });
                } else {
                  // Vänta 1 sekund innan nästa försök
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              }
            }
          } else {
            console.log('Hoppar över att skicka inbjudan till skaparen:', inv.email);
          }
        }
        
        const successfulEmails = emailResults.filter(r => r.success);
        const failedEmails = emailResults.filter(r => !r.success);
        console.log(`Mejlutskick slutfört: ${successfulEmails.length} lyckades, ${failedEmails.length} misslyckades`);
        if (failedEmails.length > 0) {
          console.error('Misslyckade mejl:', failedEmails);
        }

        // Skicka bekräftelsemejl till skaparen
        try {
          const invitedList = invitees.map((inv, i) => {
            const result = emailResults.find(r => r.email === inv.email);
            const status = result ? (result.success ? '✅ Skickat' : '❌ Misslyckades') : '⏭️ Hoppades över';
            return `${inv.email}: ${inviteLinks[i]} (${status})`;
          }).join('\n');
          
          const creatorSubject = isTeamMeeting ? `Du har bjudit in personer till teammöte: ${teamName}` : 'Du har bjudit in personer till din kalendergrupp';
          const creatorText = `${invitedList}\n\n📊 Resultat: ${successfulEmails.length} mejl skickade, ${failedEmails.length} misslyckades`;
          
          await resend.emails.send({
            from: 'BookR <info@onebookr.se>',
            to: creatorEmail,
            subject: creatorSubject,
            text: creatorText
          });
          console.log('Bekräftelsemejl skickat till skaparen:', creatorEmail);
        } catch (creatorMailErr) {
          console.error('Fel vid bekräftelsemejl till skaparen:', creatorMailErr);
        }
      } catch (emailError) {
        console.error('Fel vid mejlutskick:', emailError);
        if (emailError && emailError.stack) {
          console.error('Stacktrace:', emailError.stack);
        }
      }
    });

  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Kunde inte skapa grupp' });
  }
});

// Join group
app.post('/api/group/join', async (req, res) => {
  try {
    const { groupId, token, invitee, email: frontendEmail } = req.body;
    if (!groupId || !token) return res.status(400).json({ error: 'groupId och token krävs' });
    
    const group = await getGroup(groupId);
    if (!group) return res.status(404).json({ error: 'Grupp finns inte' });

    // Använd frontendEmail direkt
    const email = frontendEmail;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Giltig e-postadress krävs' });
    }

    // Kontrollera om detta är direkttillgång
    if (group.directAccess) {
      // För direkttillgång, lägg till alla tokens korrekt
      const allTokens = Array.from(new Set([group.creatorToken, token].filter(Boolean)));
      const allEmails = Array.from(new Set([group.creatorEmail, email].filter(Boolean)));
      
      await updateGroup(groupId, {
        tokens: allTokens,
        joinedEmails: allEmails,
        allJoined: true
      });
      console.log('Direct access group joined:', { groupId, email, totalTokens: allTokens.length });
      return res.json({ success: true, directAccess: true });
    }

    // Uppdatera gruppen med ny medlem - se till att inga dubbletter finns
    const existingTokens = group.tokens || [];
    const existingEmails = group.joinedEmails || [];res.status(400).json({ error: 'groupId, start, end, email krävs' });
    
    const updatedTokens = Array.from(new Set([...existingTokens, token].filter(Boolean)));
    const updatedEmails = Array.from(new Set([...existingEmails, email].filter(Boolean)));    if (!group) return res.status(404).json({ error: 'Grupp finns inte' });

    // Kontrollera om alla har gått med genom att jämföra med inbjudningar
    const invitations = await getInvitationsByGroup(groupId);      groupId,
    const invitedEmails = invitations.map(inv => inv.email);
    const expected = 1 + invitedEmails.length; // Skapare + inbjudna
    const allJoined = updatedEmails.length >= expected; title || '',
Meet: typeof withMeet === 'boolean' ? withMeet : true,
    // Uppdatera gruppen i Firebase|| '',
    await updateGroup(groupId, {
      tokens: updatedTokens,
      joinedEmails: updatedEmails,Namnlös grupp',
      allJoinedtiDay || false,
    });

    console.log('User joined group:', { groupId, email, totalTokens: updatedTokens.length, totalEmails: updatedEmails.length, allJoined });,
    res.json({ success: true });
  } catch (error) {
    console.error('Error joining group:', error);
    res.status(500).json({ error: 'Kunde inte gå med i grupp' });
  }ggestionId });
});
sole.error('Error creating suggestion:', error);
// Group tokensres.status(500).json({ error: 'Kunde inte skapa förslag' });
app.get('/api/group/:groupId/tokens', async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await getGroup(groupId);
    if (!group) return res.status(404).json({ error: 'Grupp finns inte' });.get('/api/group/:groupId/suggestions', async (req, res) => {
    res.json({ tokens: group.tokens || [] });ry {
  } catch (error) {    const { groupId } = req.params;
    console.error('Error fetching group tokens:', error);uggestionsByGroup(groupId);
    res.status(500).json({ error: 'Kunde inte hämta tokens' });
  }ch (error) {
});uggestions:', error);
});
// Group status
app.get('/api/group/:groupId/status', async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await getGroup(groupId);.delete('/api/group/:groupId/suggestion/:suggestionId', (req, res) => {
    if (!group) return res.status(404).json({ error: 'Grupp finns inte' });onst { groupId, suggestionId } = req.params;
  const { email } = req.body;
    // Hämta inbjudningar för gruppen
    const invitations = await getInvitationsByGroup(groupId);
    const invitedEmails = invitations.map(inv => inv.email); finns inte' });
    
    // Separera accepterade och nekade inbjudningar
estions[groupId].findIndex(s => s.id === suggestionId);
    const declinedInvitations = invitations.filter(inv => inv.responded && !inv.accepted);
    const pendingInvitations = invitations.filter(inv => !inv.responded); return res.status(404).json({ error: 'Förslag finns inte' });
    }
    const expected = 1 + invitedEmails.length;
    const current = group.joinedEmails ? group.joinedEmails.length : 1;s[groupId][suggestionIndex];
    const declined = declinedInvitations.length;
    const allJoined = current >= (expected - declined) && pendingInvitations.length === 0; return res.status(403).json({ error: 'Du kan bara ta bort dina egna förslag' });
}
    // Uppdatera allJoined i gruppen om det har ändrats
    if (group.allJoined !== allJoined) {nIndex, 1);
      await updateGroup(groupId, { allJoined });
    }

    res.json({ + mejl när alla accepterat
      allJoined,suggestion/:suggestionId/vote', async (req, res) => {
      current,ry {
      expected,    const { groupId, suggestionId } = req.params;
      declined,
      invited: invitedEmails, error: 'groupId, suggestionId, email, vote krävs' });
      joined: group.joinedEmails || [],
      declinedInvitations: declinedInvitations.map(inv => ({tionId);
        email: inv.email,s(404).json({ error: 'Förslag finns inte' });
        respondedAt: inv.respondedAt
      })),    const group = await getGroup(groupId);
      pendingInvitations: pendingInvitations.map(inv => ({pp finns inte' });
        email: inv.email
      })),// Uppdatera röster
      groupName: group.groupName || 'Namnlös grupp',otes, [email]: vote };
      creatorEmail: group.creatorEmail,
      directAccess: group.directAccess || false
    });tadresser i gruppen
  } catch (error) {
    console.error('Error fetching group status:', error);=> inv.email)].filter(Boolean);
    res.status(500).json({ error: 'Kunde inte hämta gruppstatus' });
  }=> updatedVotes[e] === 'accepted');
});Accepted, finalized: suggestion.finalized });

// Joined list    // Returnera omedelbart med uppdaterat förslag
app.get('/api/group/:groupId/joined', async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await getGroup(groupId);
    if (!group) return res.status(404).json({ error: 'Grupp finns inte' });l participants...');
    res.json({ joined: group.joinedEmails || [] });
  } catch (error) {  // Markera som finalized först
    console.error('Error fetching joined members:', error);
    res.status(500).json({ error: 'Kunde inte hämta medlemmar' });
  }  status: 'processing'
});
creating calendar events...');
// Suggestions in Firestore
app.post('/api/group/:groupId/suggest', async (req, res) => {
  try {onst meetEventId = suggestionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
    const { groupId } = req.params;
    const { start, end, email, title, withMeet, location, isMultiDay, multiDayStart, multiDayEnd, durationPerDay, dayStart, dayEnd } = req.body;  const tokens = (group.tokens || []).filter(Boolean);
    // NYTT: ta emot mötesprovider ('meet' | 'teams')sole.log('Available tokens:', tokens.length);
    const meetingProvider = (req.body.meetingProvider === 'teams' ? 'teams' : (req.body.meetingProvider === 'meet' ? 'meet' : undefined));
    if (!groupId || !start || !end || !email) return res.status(400).json({ error: 'groupId, start, end, email krävs' });if (!tokens.length) {

    const group = await getGroup(groupId);
    if (!group) return res.status(404).json({ error: 'Grupp finns inte' });}

    const suggestionId = await createSuggestion({t-användare
      groupId,
      start,onst providers = [];
      end,        for (const token of tokens) {
      title: title || '',
      withMeet: typeof withMeet === 'boolean' ? withMeet : true,
      location: location || '',icrosoft') {
      votes: { [email]: 'accepted' },
      fromEmail: email,
      groupName: group.groupName || 'Namnlös grupp',
      isMultiDay: isMultiDay || false,
      multiDayStart,t på deltagare
      multiDayEnd,st meetingType = hasMicrosoftUser ? 'teams' : 'meet';
      durationPerDay,onsole.log(`🎥 Meeting type: ${meetingType} (hasMicrosoftUser: ${hasMicrosoftUser})`);
      dayStart,console.log(`Providers in group: ${providers.join(', ')}`);
      dayEnd,
      // NYTT: spara användarens val
      meetingProvider
    });',
              description: `Möte bokat via BookR\n\nDeltagare: ${allEmails.join(', ')}`,
    res.json({ success: true, id: suggestionId });
  } catch (error) {
    console.error('Error creating suggestion:', error);
    res.status(500).json({ error: 'Kunde inte skapa förslag' });
  }
});.end,
   timeZone: 'Europe/Stockholm'
app.get('/api/group/:groupId/suggestions', async (req, res) => {          },
  try {
    const { groupId } = req.params;          attendees: allEmails
    const suggestions = await getSuggestionsByGroup(groupId);
    res.json({ suggestions });
  } catch (error) {t-länken
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: 'Kunde inte hämta förslag' });
  }
});
kens.length; i++) {
// In-memory delete (legacy, UI uses Firestore)if (providers[i] === 'google') {
const suggestionsMem = {};            firstGoogleTokenIndex = i;
app.delete('/api/group/:groupId/suggestion/:suggestionId', (req, res) => {
  const { groupId, suggestionId } = req.params;
  const { email } = req.body;
  if (!suggestionsMem[groupId]) return res.status(404).json({ error: 'Grupp finns inte' });
en index:', firstGoogleTokenIndex);
  const suggestionIndex = suggestionsMem[groupId].findIndex(s => s.id === suggestionId);
  if (suggestionIndex === -1) return res.status(404).json({ error: 'Förslag finns inte' });deltagare med SAMMA videomötestyp
{
  const suggestion = suggestionsMem[groupId][suggestionIndex];
  if (suggestion.fromEmail !== email) return res.status(403).json({ error: 'Du kan bara ta bort dina egna förslag' });iders[i];
ns.length} for provider: ${provider} with ${meetingType}`);
  suggestionsMem[groupId].splice(suggestionIndex, 1);
  res.json({ success: true });
});
vider === 'microsoft') {
// Vote + create events + maillendar med Teams (alltid om det finns MS-användare)
app.post('/api/group/:groupId/suggestion/:suggestionId/vote', async (req, res) => {nst msEventData = {
  try {
    const { groupId, suggestionId } = req.params;quest: { requestId: meetEventId } } : undefined
    const { email, vote } = req.body;
    if (!groupId || !suggestionId || !email || !vote) return res.status(400).json({ error: 'groupId, suggestionId, email, vote krävs' });
lse {
    const suggestion = await getSuggestion(suggestionId); // Google Calendar
    if (!suggestion) return res.status(404).json({ error: 'Förslag finns inte' });meetingType === 'teams') {
    pa utan videomöte, länken kommer från MS-användaren
    const group = await getGroup(groupId);ng Google event WITHOUT Meet (Teams will be used from MS user)');
    if (!group) return res.status(404).json({ error: 'Grupp finns inte' });

    // Uppdatera rösterenceData = inget Meet
    const updatedVotes = { ...suggestion.votes, [email]: vote };
    await updateSuggestion(suggestionId, { votes: updatedVotes });
else {
    // Hämta alla e-postadresser i gruppen
    const invitations = await getInvitationsByGroup(groupId);ink) {
    const allEmails = [group.creatorEmail, ...invitations.map(inv => inv.email)].filter(Boolean);vent WITH NEW Meet link');

    const allAccepted = allEmails.every(e => updatedVotes[e] === 'accepted');     ...baseEventData,
    console.log('Vote check:', { allEmails, updatedVotes, allAccepted, finalized: suggestion.finalized });       conferenceData: suggestion.withMeet ? {
               createRequest: {
    // Returnera omedelbart med uppdaterat förslag                      requestId: suggestionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 50),
    const updatedSuggestion = await getSuggestion(suggestionId);
    res.json({ success: true, suggestion: updatedSuggestion });
    
    if (allAccepted && !suggestion.finalized) {
      console.log('All accepted! Creating unified meeting for all participants...');                result = await createGoogleCalendarEvent(token, googleEventData, null);
      
      // Markera som finalized förstänken från första eventet
      await updateSuggestion(suggestionId, {
        finalized: true,                  unifiedMeetLink = result.meetLink;
        status: 'processing'g(`📹 Master Meet link created: ${unifiedMeetLink}`);
      });                } else {
      console.log('Marked as finalized, now creating calendar events...');ink returned from first Google event');
      
      try {
        const meetEventId = suggestionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);e-användare får SAMMA Meet-länk
        ting Google event WITH EXISTING Meet link:', unifiedMeetLink);
        const tokens = (group.tokens || []).filter(Boolean);
        console.log('Available tokens:', tokens.length);  ...baseEventData,
        
        if (!tokens.length) {
          console.error('No tokens available for group');ntData, unifiedMeetLink);
          throw new Error('Inga tokens för gruppen');
        }

        // VIKTIGT: Detektera om det finns någon Microsoft-användare
        let hasMicrosoftUser = false;
        const providers = []; 1} (${provider})`);
        for (const token of tokens) {
          const provider = detectProvider(token);fiedMeetLink && result.meetLink) {
          providers.push(provider);
          if (provider === 'microsoft') {
            hasMicrosoftUser = true;
          } else {
        }            console.error(`❌ Failed to create event for participant ${i + 1} (${provider}):`, result?.error);
        
        // NYTT: Respektera val från förslaget, med fallback
        let meetingType = (suggestion.meetingProvider === 'teams' || suggestion.meetingProvider === 'meet')
          ? suggestion.meetingProvider
          : (hasMicrosoftUser ? 'teams' : 'meet');sole.log(`🎥 Final meeting type: ${meetingType}, link: ${unifiedMeetLink || 'N/A'}`);

        // Om val inte matchar tillgängliga tokens: fallback        // Uppdatera suggestion med meet-länk
        const hasGoogleUser = providers.includes('google');{
        if (meetingType === 'teams' && !hasMicrosoftUser && hasGoogleUser) {
          meetingType = 'meet';
        } else if (meetingType === 'meet' && !hasGoogleUser && hasMicrosoftUser) {rue,
          meetingType = 'teams';ed'
        }

        console.log(`🎥 Meeting type (final): ${meetingType} (requested: ${suggestion.meetingProvider || 'auto'})`);        // Bygg mejltext med rätt videomötestyp
estiden!\n\n`;
        // Skapa basdatamöte'}\n`;
        const baseEventData = {()} - ${new Date(suggestion.end).toLocaleString()}\n\n`;
          summary: suggestion.title || 'BookR-möte',
          description: `Möte bokat via BookR\n\nDeltagare: ${allEmails.join(', ')}`,if (suggestion.withMeet && unifiedMeetLink) {
          start: { dateTime: suggestion.start, timeZone: 'Europe/Stockholm' },ams' ? 'Microsoft Teams' : 'Google Meet';
          end: { dateTime: suggestion.end, timeZone: 'Europe/Stockholm' },
          location: suggestion.location || undefined,k)\n\n`;
          attendees: allEmails
        };
if (suggestion.location) {
        // Först: bestäm host och hämta länk{suggestion.location}\n\n`;
        let unifiedMeetLink = null;
        let hostIndex = -1;ailText += `Deltagare:\n${allEmails.join('\n')}\n\n`;
le Calendar eller Outlook).\n\nHälsningar,\nBookR-teamet`;
        if (meetingType === 'meet') {
          hostIndex = providers.findIndex(p => p === 'google');        // Skicka mejl med retry
          if (hostIndex !== -1) {l of allEmails) {
            const hostToken = tokens[hostIndex];
            const googleEventData = { 3) {
              ...baseEventData,
              conferenceData: suggestion.withMeet ? {
                createRequest: {it resend.emails.send({
                  requestId: suggestionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 50),okr.se>',
                  conferenceSolutionKey: { type: 'hangoutsMeet' }
                }t!',
              } : undefined
            };
            const hostResult = await createGoogleCalendarEvent(hostToken, googleEventData, null, null);sole.log(`Mötesmejl skickat till ${recipientEmail}`);
            if (hostResult?.success && hostResult?.meetLink) {
              unifiedMeetLink = hostResult.meetLink;(err) {
              console.log(`📹 Master Meet link created by Google host: ${unifiedMeetLink}`);=== 3) {
            }lyckades skicka mejl till ${recipientEmail}:`, err);
          }
        } else {new Promise(resolve => setTimeout(resolve, 1000));
          hostIndex = providers.findIndex(p => p === 'microsoft');
          if (hostIndex !== -1) {
            const hostToken = tokens[hostIndex];
            const msEventData = {
              ...baseEventData,
              // Endast Teams vid 'teams'      } catch (err) {
              conferenceData: suggestion.withMeet ? { createRequest: { requestId: meetEventId } } : undefined('Fel vid kalenderskapande:', err);
            };
            const hostResult = await createMicrosoftCalendarEvent(hostToken, msEventData, null, null);
            if (hostResult?.success && hostResult?.meetLink) {
              unifiedMeetLink = hostResult.meetLink;ge
              console.log(`📹 Master Teams link created by Microsoft host: ${unifiedMeetLink}`);
            }
          }
        }atch (error) {
Error voting on suggestion:', error);
        // Andra passet: skapa event för alla (inkl host om vi vill duplicera)örslag' });
        for (let i = 0; i < tokens.length; i++) {
          // Skapa inte host-event igen (skippar, då redan skapat ovan)
          if (i === hostIndex && unifiedMeetLink) continue;
// Hämta inbjudningar för en användare (SAKNAD ENDPOINT)
          const token = tokens[i];
          const provider = providers[i];
          console.log(`Creating event ${i + 1}/${tokens.length} for provider: ${provider} with ${meetingType}`);st { email } = req.params;
IComponent(email);
          let result = null;
const invitations = await getInvitationsByEmail(decodedEmail);
          if (provider === 'microsoft') {
            if (meetingType === 'teams') {ns: invitations || [],
              // Teams-länk skapas av host; för övriga MS skapar vi även Teams-möten (joinUrl är samma objekt eller unik – vi lägger alltid unifiedMeetLink i description också)
              const msEventData = {
                ...baseEventData,ch (error) {
                conferenceData: suggestion.withMeet ? { createRequest: { requestId: `${meetEventId}-${i}` } } : undefinedError fetching invitations:', error);
              };udningar' });
              result = await createMicrosoftCalendarEvent(token, msEventData, unifiedMeetLink, 'Microsoft Teams');
            } else {
              // Google Meet: inga Teams-möten, bara länken i description
              result = await createMicrosoftCalendarEvent(token, baseEventData, unifiedMeetLink, 'Google Meet');// NYTT: Version endpoint för att verifiera deployad kod
            }
          } else {
            // Google deltagare '1.0.1', // ← Ändra detta nummer vid varje deploy
            if (meetingType === 'teams') {
              // Ingen Meet, injicera Teams-länk i description
              result = await createGoogleCalendarEvent(token, baseEventData, null, unifiedMeetLink ? 'Microsoft Teams' : null, unifiedMeetLink || null);_ENV,
            } else {te commit-hash
              // Google Meet: övriga Google utan conferenceData, injicera unify-länken i description
              result = await createGoogleCalendarEvent(token, baseEventData, null, unifiedMeetLink ? 'Google Meet' : null, unifiedMeetLink || null);
            }
          }// --- Provider autodetection helpers ---

          if (result?.success) {
            console.log(`✅ Event created for participant ${i + 1} (${provider})`);ess tokens often start with 'ya29.'
          } else {
            console.error(`❌ Failed to create event for participant ${i + 1} (${provider}):`, result?.error);
          }
        }(token.split('.').length >= 2 && token.startsWith('eyJ')) {
'base64').toString('utf8'));
        // Uppdatera suggestion med meet-länk
        await updateSuggestion(suggestionId, {;
          meetLink: unifiedMeetLink,
          meetingType,atch (_) {}
          finalized: true,
          status: 'completed'
        });
function looksLikeMicrosoftToken(token) {
        // Bygg mejltext med rätt videomötestyp
        let mailText = `Alla har accepterat mötestiden!\n\n`;eyJ...) or opaque 'Ew...'; treat both as possible MS
        mailText += `Möte: ${suggestion.title || 'Föreslaget möte'}\n`;
        mailText += `Datum: ${new Date(suggestion.start).toLocaleString()} - ${new Date(suggestion.end).toLocaleString()}\n\n`;
        (token && token.split('.').length >= 2 && token.startsWith('eyJ')) {
        if (suggestion.withMeet && unifiedMeetLink) {.toString('utf8'));
          const meetingPlatform = meetingType === 'teams' ? 'Microsoft Teams' : 'Google Meet';
          mailText += `🎥 ${meetingPlatform}-länk:\n${unifiedMeetLink}\n\n`;
          mailText += `(Alla deltagare använder samma ${meetingPlatform}-länk)\n\n`;.includes('graph.microsoft.com')) return 'microsoft';
        }
        
        if (suggestion.location) {atch (_) {}
          mailText += `📍 Plats: ${suggestion.location}\n\n`;
        }
        mailText += `Deltagare:\n${allEmails.join('\n')}\n\n`;
        mailText += `Du hittar även mötet i din kalender (Google Calendar eller Outlook).\n\nHälsningar,\nBookR-teamet`;function detectProvider(token) {
) && !looksLikeMicrosoftToken(token)) return 'google';
        // Skicka mejl med retryt';
        for (const recipientEmail of allEmails) {
          let attempts = 0;
          while (attempts < 3) {
            attempts++;s if google fails
            try {
              await resend.emails.send({
                from: 'BookR <info@onebookr.se>',
                to: recipientEmail,// --- Remote fetchers (minimal, robust error handling) ---
                subject: 'Möte bokat!',imeMaxISO) {
                text: mailText,
              });st tzRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/settings/timezone', {
              console.log(`Mötesmejl skickat till ${recipientEmail}`);
              break;
            } catch (err) {
              if (attempts === 3) {
                console.error(`Misslyckades skicka mejl till ${recipientEmail}:`, err);
              } else {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          }
        }

      } catch (err) {
        console.error('Fel vid kalenderskapande:', err);
        await updateSuggestion(suggestionId, {
          finalized: true,
          status: 'error',
          error: err.message
        });
      }
    }
  } catch (error) {
    console.error('Error voting on suggestion:', error);
    res.status(500).json({ error: 'Kunde inte rösta på förslag' });
  }
});

// Hämta inbjudningar för en användare (SAKNAD ENDPOINT)
app.get('/api/invitations/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const decodedEmail = decodeURIComponent(email);
    
    const invitations = await getInvitationsByEmail(decodedEmail);
    res.json({ 
      invitations: invitations || [],
      email: decodedEmail 
    });
  } catch (error) {
    console.error('Error fetching invitations:', error);
    res.status(500).json({ error: 'Kunde inte hämta inbjudningar' });
  }
});

// NYTT: Version endpoint för att verifiera deployad kod
app.get('/api/version', (req, res) => {
  res.json({
    version: '1.0.2', // ← Ändra detta nummer vid varje deploy
    deployedAt: new Date().toISOString(),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV,
    lastCommit: process.env.LAST_COMMIT || 'local'
  });
});

// Start
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (${isDevelopment ? 'dev' : 'prod'})`);
});

// --- Google Calendar Event Creation ---
async function createGoogleCalendarEvent(token, eventData, existingMeetLink = null) {
  try {
    const event = {
      summary: eventData.summary,
      description: eventData.description,
      start: { dateTime: eventData.start.dateTime, timeZone: eventData.start.timeZone || 'Europe/Stockholm' },
      end: { dateTime: eventData.end.dateTime, timeZone: eventData.end.timeZone || 'Europe/Stockholm' },
      location: eventData.location,
      attendees: eventData.attendees?.map(email => ({ email })),
      // VIKTIGT: Lägg ALLTID till conferenceData för att skapa Meet-länk
    };

    if (!existingMeetLink && eventData.conferenceData) {
      event.conferenceData = eventData.conferenceData;
    } else if (existingMeetLink) {
      // Om vi redan har en Meet-länk, lägg till den direkt i description
      event.description = (event.description || '') + `\n\n🎥 Google Meet: ${existingMeetLink}`;
    }

    console.log('Creating Google Calendar event with:', JSON.stringify({ summary: event.summary, hasConferenceData: !!event.conferenceData, hasExistingLink: !!existingMeetLink }));

    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Google Calendar API error:', errorData);
      return { success: false, error: errorData };
    }

    const createdEvent = await response.json();
    console.log('Google Calendar event created:', createdEvent.id);
    console.log('Full created event:', JSON.stringify(createdEvent, null, 2));

    // VIKTIGT: Hämta Meet-länken från conferenceData
    let meetLink = null;
    
    if (createdEvent.conferenceData?.entryPoints) {
      // Hitta Google Meet-länken från entryPoints
      const meetEntryPoint = createdEvent.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video');
      meetLink = meetEntryPoint?.uri || null;
      console.log('Meet link from entryPoints:', meetLink);
    }
    
    // Om ingen Meet-länk från conferenceData, kolla om den finns i description
    if (!meetLink && existingMeetLink) {
      meetLink = existingMeetLink;
      console.log('Using existing meet link:', meetLink);
    }

    console.log('Final meet link:', meetLink);

    return {
      success: true,
      eventId: createdEvent.id,
      meetLink: meetLink || null,
      event: createdEvent
    };
  } catch (error) {
    console.error('Error creating Google Calendar event:', error);
    return { success: false, error: error.message };
  }
}

// --- Microsoft Calendar Event Creation ---
async function createMicrosoftCalendarEvent(token, eventData) {
  try {
    const event = {
      subject: eventData.summary,
      bodyPreview: eventData.description,
      body: {
        contentType: 'text',
        content: eventData.description
      },
      start: {
        dateTime: eventData.start.dateTime,
        timeZone: eventData.start.timeZone || 'Europe/Stockholm'
      },
      end: {
        dateTime: eventData.end.dateTime,
        timeZone: eventData.end.timeZone || 'Europe/Stockholm'
      },
      location: eventData.location ? { displayName: eventData.location } : undefined,
      attendees: eventData.attendees?.map(email => ({
        emailAddress: { address: email },
        type: 'required'
      })),
      isOnlineMeeting: !!eventData.conferenceData,
      onlineMeetingProvider: eventData.conferenceData ? 'teamsForBusiness' : undefined
    };

    const response = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Microsoft Graph API error:', errorData);
      return { success: false, error: errorData };
    }

    const createdEvent = await response.json();
    console.log('Microsoft Calendar event created:', createdEvent.id);

    // Microsoft Teams-länken finns i onlineMeeting
    const meetLink = createdEvent.onlineMeeting?.joinUrl || null;

    return {
      success: true,
      eventId: createdEvent.id,
      meetLink
    };
  } catch (error) {
    console.error('Error creating Microsoft Calendar event:', error);
    return { success: false, error: error.message };
  }
}