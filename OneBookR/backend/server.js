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
import { google } from 'googleapis';
import path from 'path';
import { createGroup, getGroup, updateGroup, createInvitation, getInvitationsByEmail, getInvitationsByGroup, updateInvitation, createSuggestion, getSuggestionsByGroup, updateSuggestion, getSuggestion, deleteUserData, createUser, getUser, updateUserLastLogin } from './firestore.js';

const app = express();
app.set('trust proxy', 1); // NYTT: Behövs för secure cookies bakom proxy (Railway/Heroku/Render)
app.use(express.json());
app.use(bodyParser.json());
const PORT = process.env.PORT || 3000;

// Maintenance mode
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true';
console.log('Maintenance mode:', MAINTENANCE_MODE ? 'ON (redirecting to waitlist)' : 'OFF (full app available)');

// Servera frontend static files
app.use(express.static('OneBookR/calendar-frontend/dist'));

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'OneBookR/calendar-frontend/dist/index.html'));
});

// Privacy policy route
app.get('/privacy-policy', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(process.cwd(), 'policy.html'));
});

// Terms of service route
app.get('/terms-of-service', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(process.cwd(), 'policy.html'));
});

// Middleware
app.use(cors({
  origin: 'https://www.onebookr.se',
  credentials: true
}));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    sameSite: 'none',
    secure: true,
    httpOnly: true
    // Ta bort maxAge för att göra cookien till en session-cookie (försvinner när webbläsaren stängs)
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// Maintenance mode middleware
app.use((req, res, next) => {
  if (MAINTENANCE_MODE) {
    // Admin bypass via session
    if (req.session.adminAccess) {
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
    
    // Omdirigera alla andra sökvägar till waitlist
    return res.redirect('/waitlist');
  }
  
  next();
});

// Google OAuth-strategi
passport.use('google', new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: 'https://www.onebookr.se/auth/google/callback',
  accessType: 'offline',
  prompt: 'consent',  // Force refresh token
  includeGrantedScopes: true  // Enable incremental authorization
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

// Microsoft OAuth-strategi
passport.use('microsoft', new MicrosoftStrategy({
  clientID: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  callbackURL: 'https://www.onebookr.se/auth/microsoft/callback',
  scope: ['user.read', 'calendars.read', 'calendars.readwrite'],
  tenant: 'common' // Tillåter både personliga och arbets-/skolkonton
}, (accessToken, refreshToken, profile, done) => {
  profile.accessToken = accessToken;
  profile.refreshToken = refreshToken;
  profile.provider = 'microsoft';
  return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Routes
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

// Microsoft OAuth routes
app.get('/auth/microsoft', (req, res, next) => {
  const state = req.query.state;
  if (state) {
    req.session.oauthState = state;
  }
  
  passport.authenticate('microsoft', {
    scope: ['user.read', 'calendars.read', 'calendars.readwrite'],
    state: state
  })(req, res, next);
});

app.get('/auth/microsoft/callback',
  passport.authenticate('microsoft', { failureRedirect: '/' }),
  async (req, res) => {
    console.log('Microsoft OAuth callback - user authenticated:', req.user ? 'Yes' : 'No');
    try { req.session.user = req.user; } catch (_) {}
    
    const userEmail = req.user?.mail || req.user?.userPrincipalName;
    
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

    // Persist an auth cookie to survive MemoryStore resets
    try {
      res.cookie('ob_auth', authToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
    } catch (_) {}

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

    const frontendUrl = 'https://www.onebookr.se';
    // Ensure session is saved before redirect
    return req.session.save(() => res.redirect(`${frontendUrl}${redirectUrl}`));
  }
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  async (req, res) => {
    console.log('OAuth callback - user authenticated:', req.user ? 'Yes' : 'No');
    console.log('OAuth state received:', req.session.oauthState);
    try { req.session.user = req.user; } catch (_) {}
    
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
    
    // Persist an auth cookie to survive MemoryStore resets
    try {
      res.cookie('ob_auth', authToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
    } catch (_) {}

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

    const frontendUrl = 'https://www.onebookr.se';
    // Ensure session is saved before redirect
    return req.session.save(() => res.redirect(`${frontendUrl}${redirectUrl}`));
  }
);

app.get('/api/user', (req, res) => {
  console.log('API /user called:', {
    isAuthenticated: req.isAuthenticated(),
    sessionID: req.sessionID,
    user: req.user ? 'User exists' : 'No user',
    sessionUser: req.session.user ? 'Session user exists' : 'No session user',
    cookies: req.headers.cookie ? 'Cookies present' : 'No cookies'
  });

  // Rehydrate session if needed (supports ?auth, header x-auth, or ob_auth cookie)
  const ensureSession = () => {
    if (req.session?.user) return req.session.user;
    const authB64 =
      (req.query?.auth && String(req.query.auth)) ||
      (req.headers['x-auth'] && String(req.headers['x-auth'])) ||
      getCookie(req, 'ob_auth');

    if (!authB64) return null;
    try {
      const parsed = JSON.parse(Buffer.from(authB64, 'base64').toString('utf8'));
      if (parsed && parsed.user) {
        req.session.user = parsed.user;
        return parsed.user;
      }
    } catch (e) {
      console.warn('Failed to parse auth token in /api/user:', e?.message);
    }
    return null;
  };

  const user = req.user || req.session.user || ensureSession();

  if (user) {
    return res.json({ user, token: user.accessToken });
  }
  return res.status(401).json({ error: 'Not authenticated' });
});

// NYTT: Initiera session från auth-token (base64) efter redirect
app.post('/api/auth/session', (req, res) => {
  try {
    const { auth } = req.body || {};
    if (!auth || typeof auth !== 'string') {
      return res.status(400).json({ error: 'auth token saknas' });
    }
    const parsed = JSON.parse(Buffer.from(auth, 'base64').toString('utf8'));
    if (!parsed || !parsed.user) {
      return res.status(400).json({ error: 'Ogiltigt auth-paket' });
    }
    req.session.user = parsed.user;
    return req.session.save(() => res.json({ success: true }));
  } catch (e) {
    console.error('Failed to init session from auth:', e);
    return res.status(400).json({ error: 'Kunde inte initiera session' });
  }
});

app.get('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    req.session.destroy(() => {
      res.redirect('https://www.onebookr.se/');
    });
  });
});

const fetchMicrosoftCalendarEvents = async (token, min, max) => {
  try {
    // Test token validity first
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
      console.error('Google OAuth token expired or invalid for token:', token.substring(0, 20) + '...');
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

// Exakt sammanslagning av upptagna tider - bevara korta events
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

// Exakt beräkning av lediga tider - respektera korta upptagna perioder
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

// Justera findCommonFreeTimes för att korrekt hitta överlapp mellan lediga block
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

// Säker uppdelning av lediga tider
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

// Generera lediga slots för hall baserat på öppettider minus upptagna tider
function generateVenueFreeSlots(busyEvents, startDate, endDate) {
  const freeSlots = [];
  const openHour = 9; // Öppnar 09:00
  const closeHour = 21; // Stänger 21:00
  const slotDuration = 2 * 60 * 60 * 1000; // 2 timmar per slot
  
  // Konvertera busy events till millisekunder
  const busyTimes = busyEvents.map(e => ({
    start: new Date(e.start.dateTime || e.start.date).getTime(),
    end: new Date(e.end.dateTime || e.end.date).getTime()
  })).sort((a, b) => a.start - b.start);
  
  // Gå igenom varje dag
  const currentDate = new Date(startDate);
  while (currentDate < endDate) {
    // Skapa öppettider för dagen
    const dayStart = new Date(currentDate);
    dayStart.setHours(openHour, 0, 0, 0);
    const dayEnd = new Date(currentDate);
    dayEnd.setHours(closeHour, 0, 0, 0);
    
    // Hitta lediga slots under dagen
    let slotStart = dayStart.getTime();
    
    while (slotStart + slotDuration <= dayEnd.getTime()) {
      const slotEnd = slotStart + slotDuration;
      
      // Kolla om denna slot överlappar med något upptaget event
      const isOccupied = busyTimes.some(busy => 
        (slotStart < busy.end && slotEnd > busy.start)
      );
      
      if (!isOccupied) {
        freeSlots.push({
          start: new Date(slotStart).toISOString(),
          end: new Date(slotEnd).toISOString(),
          title: 'Ledig bana',
          type: 'venue'
        });
      }
      
      slotStart += slotDuration;
    }
    
    // Nästa dag
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return freeSlots;
}

// Säker filtrering av tider inom daglig tidsram - KORREKT TIDSHANTERING
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

// --- Provider autodetection + busy fetch helpers (needed by /api/availability) ---
function looksLikeGoogleToken(token) {
  if (!token) return false;
  if (token.startsWith('ya29.')) return true;
  try {
    if (token.split('.').length >= 2 && token.startsWith('eyJ')) {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
      const iss = String(payload.iss || '').toLowerCase();
      if (iss.includes('accounts.google.com')) return true;
    }
  } catch {}
  return false;
}

// NYTT: Hjälpfunktion – är token troligen en JWT?
function isProbablyJWT(token) {
  return typeof token === 'string' && token.includes('.') && token.split('.').length >= 3;
}

// Uppdaterad Microsoft-token-detektering: endast riktiga JWT access tokens med Graph-audience
function looksLikeMicrosoftToken(token) {
  if (!token) return false;
  try {
    if (isProbablyJWT(token) && token.startsWith('eyJ')) {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
      const iss = String(payload.iss || '').toLowerCase();
      const aud = String(payload.aud || '').toLowerCase();
      if (iss.includes('login.microsoftonline.com') || iss.includes('sts.windows.net')) return true;
      if (aud.includes('graph.microsoft.com')) return true;
    }
  } catch {}
  return false;
}

function detectProvider(token) {
  if (looksLikeGoogleToken(token) && !looksLikeMicrosoftToken(token)) return 'google';
  if (looksLikeMicrosoftToken(token) && !looksLikeGoogleToken(token)) return 'microsoft';
  if (token && token.startsWith('ya29.')) return 'google';
  // Viktigt: ta bort 'Ew' heuristiken – det är oftast refresh tokens, inte giltiga Bearer
  return 'google';
}

// NYTT: heuristik på e-postdomän för Microsoft/Outlook
function emailSuggestsMicrosoft(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return false;
  const domain = email.split('@')[1].toLowerCase();
  // Vanliga Microsoft-domäner (konsument + vissa O365)
  const msDomains = [
    'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    'office365.com'
  ];
  if (msDomains.includes(domain)) return true;
  // Mönster: .onmicrosoft.com (O365 tenants)
  if (domain.endsWith('.onmicrosoft.com')) return true;
  // Enkla mönster för subdomäner
  if (domain.startsWith('outlook.') || domain.startsWith('hotmail.') || domain.startsWith('live.') || domain.startsWith('msn.')) return true;
  return false;
}

// NYTT: bestäm mötesplattform baserat på tokens + e-postlistan
function determineMeetingType(allEmails = [], tokens = []) {
  // 1) Har vi någon Microsoft access token? → Teams
  const hasMsAccess = (tokens || []).some(t => looksLikeMicrosoftToken(t));
  if (hasMsAccess) return 'teams';
  // 2) Annars: har vi någon e-post som antyder Microsoft/Outlook? → Teams
  const msByEmail = (allEmails || []).some(emailSuggestsMicrosoft);
  if (msByEmail) return 'teams';
  // 3) Annars: Google Meet
  return 'meet';
}

// Rösta på ett förslag och skapa Google/Teams-länk när alla accepterat
app.post('/api/group/:groupId/suggestion/:suggestionId/vote', async (req, res) => {
  try {
    const { groupId, suggestionId } = req.params;
    const { email, vote } = req.body;
    if (!groupId || !suggestionId || !email || !vote) return res.status(400).json({ error: 'groupId, suggestionId, email, vote krävs' });

    const suggestion = await getSuggestion(suggestionId);
    if (!suggestion) return res.status(404).json({ error: 'Förslag finns inte' });
    
    const group = await getGroup(groupId);
    if (!group) return res.status(404).json({ error: 'Grupp finns inte' });

    // Uppdatera röster
    const updatedVotes = { ...suggestion.votes, [email]: vote };
    await updateSuggestion(suggestionId, { votes: updatedVotes });

    // Hämta alla e-postadresser i gruppen
    const invitations = await getInvitationsByGroup(groupId);
    const allEmails = [group.creatorEmail, ...invitations.map(inv => inv.email)].filter(Boolean);

    const allAccepted = allEmails.every(e => updatedVotes[e] === 'accepted');
    console.log('Vote check:', { allEmails, updatedVotes, allAccepted, finalized: suggestion.finalized });
    
    // Returnera omedelbart med uppdaterat förslag
    const updatedSuggestion = await getSuggestion(suggestionId);
    res.json({ success: true, suggestion: updatedSuggestion });
    
    if (allAccepted && !suggestion.finalized) {
      console.log('All accepted! Creating unified meeting for all participants...');
      await updateSuggestion(suggestionId, { finalized: true, status: 'processing' });
      console.log('Marked as finalized, now creating calendar events...');

      try {
        const meetEventId = suggestionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
        const tokens = (group.tokens || []).filter(Boolean);
        console.log('Available tokens:', tokens.length);
        if (!tokens.length) {
          console.error('No tokens available for group');
          throw new Error('Inga tokens för gruppen');
        }

        // Bestäm mötesplattform från tokens + e-postlistan
        let meetingType = determineMeetingType(allEmails, tokens);
        console.log('Önskad mötesplattform:', meetingType);

        // Välj värd-token
        const providers = tokens.map(t => detectProvider(t));
        const msIndex = tokens.findIndex(t => looksLikeMicrosoftToken(t));
        const gIndex = tokens.findIndex((t, i) => providers[i] === 'google');

        // Host-logik: om Teams → kräver Microsoft JWT, annars Google
        let hostIndex = -1;
        if (meetingType === 'teams' && msIndex !== -1) {
          hostIndex = msIndex;
        } else if (gIndex !== -1) {
          hostIndex = gIndex;
        } else {
          hostIndex = 0; // fallback
        }

        const hostToken = tokens[hostIndex];
        const hostProvider = detectProvider(hostToken);
        console.log(`🎥 Host provider selected: ${hostProvider}`);

        // Bygg bas-event
        const attendeesEmails = Array.from(new Set(allEmails.filter(Boolean)));
        const baseEventData = {
          summary: suggestion.title || 'BookR-möte',
          description: `Möte bokat via BookR\n\nDeltagare: ${attendeesEmails.join(', ')}`,
          start: { dateTime: suggestion.start, timeZone: 'Europe/Stockholm' },
          end: { dateTime: suggestion.end, timeZone: 'Europe/Stockholm' },
          location: suggestion.location || undefined,
          attendees: attendeesEmails
        };

        let created = null;
        let unifiedMeetLink = null;

        if (meetingType === 'teams') {
          if (hostProvider === 'microsoft') {
            // Skapa Teams-event via Microsoft
            created = await createMicrosoftCalendarEvent(hostToken, { ...baseEventData }, { forceTeams: true });
            if (!created?.success) {
              console.warn('Microsoft värd misslyckades. Faller tillbaka till Google Meet om tillgängligt...');
              if (gIndex !== -1) {
                meetingType = 'meet';
                const googleEventData = {
                  ...baseEventData,
                  conferenceData: {
                    createRequest: {
                      requestId: meetEventId,
                      conferenceSolutionKey: { type: 'hangoutsMeet' }
                    }
                  }
                };
                created = await createGoogleCalendarEvent(tokens[gIndex], googleEventData);
              }
            }
          } else {
            // Teams önskas men saknar MS-token → fallback till Meet
            console.warn('Teams önskades, men ingen Microsoft JWT-token hittades. Faller tillbaka till Google Meet.');
            meetingType = 'meet';
            if (gIndex !== -1) {
              const googleEventData = {
                ...baseEventData,
                conferenceData: {
                  createRequest: {
                    requestId: meetEventId,
                    conferenceSolutionKey: { type: 'hangoutsMeet' }
                  }
                }
              };
              created = await createGoogleCalendarEvent(tokens[gIndex], googleEventData);
            }
          }
        } else {
          // Google Meet
          const googleEventData = {
            ...baseEventData,
            conferenceData: {
              createRequest: {
                requestId: meetEventId,
                conferenceSolutionKey: { type: 'hangoutsMeet' }
              }
            }
          };
          created = await createGoogleCalendarEvent(hostToken, googleEventData);
        }

        if (!created?.success) {
          throw new Error('Misslyckades skapa kalenderhändelse på vald/fallback-plattform');
        }

        unifiedMeetLink = created.meetLink || null;
        console.log(`✅ Host event created. Type: ${meetingType}, link: ${unifiedMeetLink || 'N/A'}`);

        await updateSuggestion(suggestionId, {
          meetLink: unifiedMeetLink,
          meetingType,
          finalized: true,
          status: 'completed'
        });

        // Build and send email
        let mailText = `Alla har accepterat mötestiden!\n\n`;
        mailText += `Möte: ${suggestion.title || 'Föreslaget möte'}\n`;
        mailText += `Datum: ${new Date(suggestion.start).toLocaleString()} - ${new Date(suggestion.end).toLocaleString()}\n\n`;
        if (unifiedMeetLink) {
          const meetingPlatform = meetingType === 'teams' ? 'Microsoft Teams' : 'Google Meet';
          mailText += `🎥 ${meetingPlatform}-länk:\n${unifiedMeetLink}\n\n(Alla deltagare använder samma ${meetingPlatform}-länk)\n\n`;
        }
        if (suggestion.location) {
          mailText += `📍 Plats: ${suggestion.location}\n\n`;
        }
        mailText += `Deltagare:\n${allEmails.join('\n')}\n\n`;
        mailText += `Du hittar mötet i din kalender.\n\nHälsningar,\nBookR-teamet`;

        for (const recipientEmail of allEmails) {
          let attempts = 0;
          while (attempts < 3) {
            attempts++;
            try {
              await resend.emails.send({
                from: 'BookR <info@onebookr.se>',
                to: recipientEmail,
                subject: 'Möte bokat!',
                text: mailText
              });
              console.log(`Mötesmejl skickat till ${recipientEmail}`);
              break;
            } catch (err) {
              if (attempts === 3) {
                console.error(`Misslyckades skicka mejl till ${recipientEmail}:`, err);
              } else {
                await new Promise(r => setTimeout(r, 1000));
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

// Hjälpfunktion: Skapa Microsoft Calendar event med Teams
async function createMicrosoftCalendarEvent(token, eventData, opts = {}) {
  try {
    console.log('Creating Microsoft Calendar event...');
    // Guard: only use proper JWT access tokens with Graph
    if (!isProbablyJWT(token)) {
      console.error('Provided Microsoft token is not a JWT access token. Skipping Graph call.');
      return null;
    }

    const microsoftEvent = {
      subject: eventData.summary || 'Möte',
      body: { contentType: 'HTML', content: eventData.description || 'Bokat via BookR' },
      start: {
        dateTime: eventData.start.dateTime,
        timeZone: eventData.start.timeZone || 'Europe/Stockholm'
      },
      end: {
        dateTime: eventData.end.dateTime,
        timeZone: eventData.end.timeZone || 'Europe/Stockholm'
      },
      location: eventData.location ? { displayName: eventData.location } : undefined,
      attendees: (eventData.attendees || []).map(email => ({
        emailAddress: { address: email },
        type: 'required'
      })),
      isOnlineMeeting: opts.forceTeams === true ? true : undefined,
      responseRequested: true,
      allowNewTimeProposals: true
    };

    Object.keys(microsoftEvent).forEach(k => microsoftEvent[k] === undefined && delete microsoftEvent[k]);

    const url = 'https://graph.microsoft.com/v1.0/me/events?sendUpdates=all';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'outlook.timezone="Europe/Stockholm"'
      },
      body: JSON.stringify(microsoftEvent)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Microsoft Graph API error:', errorData);
      return null;
    }

    const createdEvent = await response.json();
    console.log('✅ Microsoft Calendar event created:', createdEvent.id);

    return {
      success: true,
      eventId: createdEvent.id,
      meetLink: createdEvent?.onlineMeeting?.joinUrl || createdEvent?.onlineMeetingUrl || null,
      provider: 'microsoft'
    };
  } catch (error) {
    console.error('Error creating Microsoft Calendar event:', error);
    return null;
  }
}

// Hjälpfunktion: Skapa Google Calendar event (kan vara med eller utan Meet)
async function createGoogleCalendarEvent(token, eventData) {
  try {
    console.log('Creating Google Calendar event...');
    const userOAuth2 = new google.auth.OAuth2(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET
    );
    userOAuth2.setCredentials({ access_token: token });
    
    const userCalendar = google.calendar({ version: 'v3', auth: userOAuth2 });

    // Viktigt: formatera attendees korrekt för Google
    const resource = {
      ...eventData,
      attendees: (eventData.attendees || []).map(a => (typeof a === 'string' ? { email: a } : a))
    };

    const response = await userCalendar.events.insert({
      calendarId: 'primary',
      resource,
      conferenceDataVersion: resource.conferenceData ? 1 : 0,
      sendUpdates: 'all'
    });

    console.log('✅ Google Calendar event created:', response.data.id);

    return {
      success: true,
      eventId: response.data.id,
      meetLink: response.data.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri || response.data.hangoutLink || null,
      provider: 'google'
    };
  } catch (error) {
    console.error('Error creating Google Calendar event:', error);
    return null;
  }
}

// Health check for Railway
app.get('/health', (_req, res) => res.status(200).send('OK'));

// SPA fallback: serve index.html for non-API/auth routes
// REMOVE/REPLACE any old "app.get('*', ...)" definitions
app.get(/^(?!\/(api|auth))(.*)$/, (req, res, next) => {
  try {
    res.sendFile(path.join(process.cwd(), 'OneBookR/calendar-frontend/dist/index.html'));
  } catch (e) {
    next(e);
  }
});

// Small helper: read cookie value without cookie-parser
function getCookie(req, name) {
  try {
    const raw = req.headers?.cookie || '';
    if (!raw) return null;
    for (const part of raw.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (k === name) return decodeURIComponent(rest.join('='));
    }
  } catch {}
  return null;
}

// Start server (ensure the process binds to PORT)
const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => process.exit(0));
});