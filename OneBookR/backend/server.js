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

    const frontendUrl = 'https://www.onebookr.se';
    res.redirect(`${frontendUrl}${redirectUrl}`);
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
  
  // Kolla både passport auth och session
  const user = req.user || req.session.user;
  
  if (user) {
    res.json({ user: user, token: user.accessToken });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
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

app.post('/api/availability', async (req, res) => {
  const { tokens, timeMin, timeMax, duration, dayStart, dayEnd, isMultiDay, multiDayStart, multiDayEnd, providers } = req.body;

  console.log('=== AVAILABILITY API DEBUG ===');
  console.log('Tokens mottagna av backend:', tokens.length, 'tokens');
  console.log('First token preview:', tokens[0] ? tokens[0].substring(0, 20) + '...' : 'None');
  console.log('Providers:', providers);
  console.log('Request body providers:', req.body.providers);
  console.log('TimeMin:', timeMin);
  console.log('TimeMax:', timeMax);

  if (!tokens || tokens.length < 1) {
    return res.status(400).json({ error: 'Minst en token krävs.' });
  }
  
  console.log(`Processing ${tokens.length} calendar(s) for availability comparison`);

  if (!timeMin || !timeMax) {
    return res.status(400).json({ error: 'timeMin och timeMax krävs.' });
  }

  try {
    // Hämta upptagna tider för varje token med tidszoner (parallellt för bättre prestanda)
    const allBusyTimesWithTimezones = await Promise.all(
      tokens.map(async (token, index) => {
        const provider = providers && providers[index] ? providers[index] : 'google';
        console.log(`Fetching calendar events for token ${index + 1}/${tokens.length}, provider: ${provider}`);
        
        try {
          const { events, timezone } = await fetchCalendarEvents(token, timeMin, timeMax, provider);
          console.log(`Token ${index + 1} returned ${events.length} events`);
          
          // Säker hantering av kalenderhändelser
          const processedEvents = events
            .filter(e => e && (e.start || {}) && (e.end || {})) // Filtrera ogiltiga events
            .map(e => {
              try {
                let startTime, endTime;
                
                // Hantera heldagsevent
                if (e.start.date && !e.start.dateTime) {
                  startTime = new Date(e.start.date + 'T00:00:00').getTime();
                  endTime = new Date(e.end.date + 'T00:00:00').getTime();
                  
                  // Säkerhetskontroll för heldagsevent
                  if (isNaN(startTime) || isNaN(endTime) || endTime <= startTime) {
                    return null;
                  }
                  
                  return {
                    start: startTime,
                    end: endTime,
                    title: e.summary || 'Upptagen',
                    isAllDay: true
                  };
                } else if (e.start.dateTime && e.end.dateTime) {
                  // Vanligt event med dateTime
                  startTime = new Date(e.start.dateTime).getTime();
                  endTime = new Date(e.end.dateTime).getTime();
                  
                  // Säkerhetskontroll
                  if (isNaN(startTime) || isNaN(endTime) || endTime <= startTime) {
                    return null;
                  }
                  
                  return {
                    start: startTime,
                    end: endTime,
                    title: e.summary || 'Upptagen',
                    isAllDay: false
                  };
                }
                
                return null; // Ogiltigt event
              } catch (error) {
                console.warn('Error processing calendar event:', error);
                return null;
              }
            })
            .filter(Boolean); // Ta bort null-värden
          console.log(`Token ${index + 1} processed ${processedEvents.length} events`);
          return { events: processedEvents, timezone };
        } catch (error) {
          console.error(`Error fetching calendar for token ${index + 1}:`, error.message);
          // Returnera tom kalender för tokens som misslyckas
          return { events: [], timezone: 'Europe/Stockholm' };
        }
      })
    );
    
    // Extrahera bara events för bakåtkompatibilitet
    const allBusyTimes = allBusyTimesWithTimezones.map(item => item.events);
    const userTimezones = allBusyTimesWithTimezones.map(item => item.timezone);
    
    // Kontrollera om alla tokens returnerade tomma resultat (kan betyda ogiltiga tokens)
    const totalEvents = allBusyTimes.reduce((sum, events) => sum + events.length, 0);
    console.log('Total events fetched from all calendars:', totalEvents);
    
    if (totalEvents === 0 && tokens.length > 1) {
      console.warn('No events found for any calendar - tokens might be expired');
    }

    // Debug: Logga varje användares upptagna tider
    allBusyTimes.forEach((userEvents, index) => {
      console.log(`User ${index + 1} has ${userEvents.length} busy events`);
      if (userEvents.length > 0) {
        console.log('Sample events:', userEvents.slice(0, 3));
      }
    });

    // För flerdagars möten, hantera annorlunda
    if (isMultiDay && multiDayStart && multiDayEnd) {
      const startDate = new Date(multiDayStart);
      const endDate = new Date(multiDayEnd);
      const durationHours = duration; // För flerdagars möten är duration i timmar per dag
      
      // Parse dayStart och dayEnd
      const [startHour, startMinute] = (dayStart || '09:00').split(':').map(Number);
      const [endHour, endMinute] = (dayEnd || '18:00').split(':').map(Number);
      
      // Skapa start- och sluttider för varje dag
      const dailyStartTime = new Date(startDate);
      dailyStartTime.setHours(startHour, startMinute, 0, 0);
      
      const dailyEndTime = new Date(endDate);
      dailyEndTime.setHours(endHour, endMinute, 0, 0);
      
      // Skapa en flerdagars slot med upptagna tider inuti
      const multiDaySlot = {
        start: dailyStartTime.toISOString(),
        end: dailyEndTime.toISOString(),
        isMultiDay: true,
        durationPerDay: durationHours,
        dayStart: `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`,
        dayEnd: `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`,
        multiDayStart,
        multiDayEnd,
        busyTimes: [] // Upptagna tider inom perioden
      };
      
      // Samla alla upptagna tider från alla användare inom perioden (bara inom arbetstid)
      const allBusyInPeriod = [];
      allBusyTimes.forEach(userBusyTimes => {
        userBusyTimes.forEach(busyTime => {
          const busyStart = new Date(busyTime.start);
          const busyEnd = new Date(busyTime.end);
          
          // Kontrollera om upptagen tid är inom datumintervallet
          if (busyStart >= startDate && busyEnd <= new Date(endDate.getTime() + 24 * 60 * 60 * 1000)) {
            // Kontrollera om upptagen tid överlappar med arbetstid
            const busyDayStart = new Date(busyStart);
            busyDayStart.setHours(startHour, startMinute, 0, 0);
            const busyDayEnd = new Date(busyStart);
            busyDayEnd.setHours(endHour, endMinute, 0, 0);
            
            // Om upptagen tid överlappar med arbetstid, lägg till den
            if (busyEnd > busyDayStart && busyStart < busyDayEnd) {
              allBusyInPeriod.push({
                start: new Date(Math.max(busyTime.start, busyDayStart.getTime())).toISOString(),
                end: new Date(Math.min(busyTime.end, busyDayEnd.getTime())).toISOString(),
                title: busyTime.title || 'Upptagen',
                isAllDay: busyTime.isAllDay
              });
            }
          }
        });
      });
      
      multiDaySlot.busyTimes = allBusyInPeriod;
      
      return res.json([multiDaySlot]);
    }

    // Slå ihop alla upptagna tider för varje användare
    const mergedBusyTimes = allBusyTimes.map(events =>
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
      console.log('No free time slots found - this might indicate token issues, very busy calendars, or no overlapping free time');
      console.log('Individual calendar free times:', allFreeTimes.map((ft, i) => `Calendar ${i + 1}: ${ft.length} slots`));
    }

    res.json(formattedBlocks);
  } catch (err) {
    console.error('Error fetching availability:', err.message, err.stack);
    res.status(500).json({ error: 'Kunde inte hämta tillgänglighet.' });
  }
});

// Firebase Firestore används för datalagring

// Skapa grupp och skicka inbjudan
app.post('/api/invite', async (req, res) => {
  const { emails, fromUser, fromToken, groupName, isTeamMeeting, teamName, directAccess, hasDirectAccessTeam } = req.body;
  // SÄKER: Hämta alltid e-post från fromUser-objekt om det är ett objekt
  let creatorEmail = fromUser;
  if (
    typeof fromUser === 'object' &&
    fromUser &&
    (fromUser.email || (fromUser.emails && fromUser.emails.length > 0))
  ) {
    creatorEmail =
      fromUser.email ||
      (fromUser.emails && fromUser.emails[0].value) ||
      (fromUser.emails && fromUser.emails[0]);
  }
  if (!creatorEmail || !creatorEmail.includes('@')) {
    return res.status(400).json({ error: 'fromUser måste vara en giltig e-postadress.' });
  }
  if (!emails || !creatorEmail || !fromToken) {
    return res.status(400).json({ error: 'Alla fält krävs (emails, fromUser, fromToken)' });
  }

  try {
    // Bestäm provider baserat på användarens inloggningsmetod (kan utvidgas senare)
    const creatorProvider = 'google'; // Standard, kan uppdateras när vi har mer info
    
    // Skapa grupp i Firebase
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

    // Skapa inbjudningar i Firebase
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

    // Skicka ut unika länkar
    const frontendUrl = 'https://www.onebookr.se';
    const inviteLinks = invitees.map(inv =>
      `${frontendUrl}?group=${groupId}&invitee=${inv.id}`
    );
    console.log('Skickar inbjudningar:', invitees.map((inv, i) => `${inv.email}: ${inviteLinks[i]}`));

    // Returnera svar omedelbart
    res.json({ 
      message: 'Inbjudningar skickade!', 
      groupId, 
      inviteLinks,
      directAccess: directAccess || hasDirectAccessTeam || false
    });
    
    // Skicka mejl asynkront med Gmail
    setImmediate(async () => {
      try {
        // Extra loggning för felsökning
        console.log('Försöker skicka mejl från:', process.env.EMAIL_USER);

        // Skicka mejl till alla inbjudna med retry-logik
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
                  ? `Hej!\n\n${creatorEmail} har bjudit in dig till ett teammöte för "${teamName}".\n\nKlicka på din unika länk nedan för att acceptera inbjudan:\n${inviteLinks[i]}\n\nHälsningar,\nBookR-teamet`
                  : `Hej!\n\n${creatorEmail} har bjudit in dig till gruppen "${groupName || 'Namnlös grupp'}" för att jämföra kalendrar och hitta en gemensam tid.\n\nKlicka på din unika länk nedan för att acceptera inbjudan:\n${inviteLinks[i]}\n\nHälsningar,\nBookR-teamet`;
                
                const result = await resend.emails.send({
                  from: 'BookR <info@onebookr.se>',
                  to: inv.email,
                  subject: emailSubject,
                  text: emailText
                });
                
                console.log(`Inbjudningsmejl skickat till ${inv.email} (försök ${attempts}/${maxAttempts}), ID: ${result.id}`);
                emailResults.push({ email: inv.email, success: true, attempts, id: result.id });
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
        
        // Logga resultat
        const successfulEmails = emailResults.filter(r => r.success);
        const failedEmails = emailResults.filter(r => !r.success);
        console.log(`Mejlutskick slutfört: ${successfulEmails.length} lyckades, ${failedEmails.length} misslyckades`);
        if (failedEmails.length > 0) {
          console.error('Misslyckade mejl:', failedEmails);
        }

        // Skicka bekräftelsemejl till skaparen
        try {
          const successfulEmails = emailResults.filter(r => r.success);
          const failedEmails = emailResults.filter(r => !r.success);
          
          const invitedList = invitees.map((inv, i) => {
            const result = emailResults.find(r => r.email === inv.email);
            const status = result ? (result.success ? '✅ Skickat' : '❌ Misslyckades') : '⏭️ Hoppades över';
            return `${inv.email}: ${inviteLinks[i]} (${status})`;
          }).join('\n');
          
          const creatorSubject = isTeamMeeting ? `Du har bjudit in personer till teammöte: ${teamName}` : 'Du har bjudit in personer till din kalendergrupp';
          const creatorText = isTeamMeeting
            ? `Hej ${creatorEmail},\n\nDu har bjudit in följande personer till teammötet "${teamName}":\n\n${invitedList}\n\n📊 Resultat: ${successfulEmails.length} mejl skickade, ${failedEmails.length} misslyckades\n\nHälsningar,\nBookR-teamet`
            : `Hej ${creatorEmail},\n\nDu har bjudit in följande personer till gruppen "${groupName || 'Namnlös grupp'}":\n\n${invitedList}\n\n📊 Resultat: ${successfulEmails.length} mejl skickade, ${failedEmails.length} misslyckades\n\nHälsningar,\nBookR-teamet`;
          
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

        console.log('Mejl skickade till:', invitees.map(inv => inv.email));
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

// När någon öppnar länken och loggar in
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
    const existingEmails = group.joinedEmails || [];
    
    const updatedTokens = Array.from(new Set([...existingTokens, token].filter(Boolean)));
    const updatedEmails = Array.from(new Set([...existingEmails, email].filter(Boolean)));

    // Kontrollera om alla har gått med genom att jämföra med inbjudningar
    const invitations = await getInvitationsByGroup(groupId);
    const invitedEmails = invitations.map(inv => inv.email);
    const expected = 1 + invitedEmails.length; // Skapare + inbjudna
    const allJoined = updatedEmails.length >= expected;

    // Uppdatera gruppen i Firebase
    await updateGroup(groupId, {
      tokens: updatedTokens,
      joinedEmails: updatedEmails,
      allJoined
    });

    console.log('User joined group:', { groupId, email, totalTokens: updatedTokens.length, totalEmails: updatedEmails.length, allJoined });
    res.json({ success: true });
  } catch (error) {
    console.error('Error joining group:', error);
    res.status(500).json({ error: 'Kunde inte gå med i grupp' });
  }
});

// Hämta alla tokens för en grupp
app.get('/api/group/:groupId/tokens', async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await getGroup(groupId);
    if (!group) return res.status(404).json({ error: 'Grupp finns inte' });
    res.json({ tokens: group.tokens || [] });
  } catch (error) {
    console.error('Error fetching group tokens:', error);
    res.status(500).json({ error: 'Kunde inte hämta tokens' });
  }
});

// Hämta status för grupp (om alla är inne)
app.get('/api/group/:groupId/status', async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await getGroup(groupId);
    if (!group) return res.status(404).json({ error: 'Grupp finns inte' });

    // Hämta inbjudningar för gruppen
    const invitations = await getInvitationsByGroup(groupId);
    const invitedEmails = invitations.map(inv => inv.email);
    
    // Separera accepterade och nekade inbjudningar

    const declinedInvitations = invitations.filter(inv => inv.responded && !inv.accepted);
    const pendingInvitations = invitations.filter(inv => !inv.responded);
    
    const expected = 1 + invitedEmails.length;
    const current = group.joinedEmails ? group.joinedEmails.length : 1;
    const declined = declinedInvitations.length;
    const allJoined = current >= (expected - declined) && pendingInvitations.length === 0;

    // Uppdatera allJoined i gruppen om det har ändrats
    if (group.allJoined !== allJoined) {
      await updateGroup(groupId, { allJoined });
    }

    res.json({
      allJoined,
      current,
      expected,
      declined,
      invited: invitedEmails,
      joined: group.joinedEmails || [],
      declinedInvitations: declinedInvitations.map(inv => ({
        email: inv.email,
        respondedAt: inv.respondedAt
      })),
      pendingInvitations: pendingInvitations.map(inv => ({
        email: inv.email
      })),
      groupName: group.groupName || 'Namnlös grupp',
      creatorEmail: group.creatorEmail,
      directAccess: group.directAccess || false
    });
  } catch (error) {
    console.error('Error fetching group status:', error);
    res.status(500).json({ error: 'Kunde inte hämta gruppstatus' });
  }
});

// Hämta e-postadresser som gått med i gruppen
app.get('/api/group/:groupId/joined', async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await getGroup(groupId);
    if (!group) return res.status(404).json({ error: 'Grupp finns inte' });
    res.json({ joined: group.joinedEmails || [] });
  } catch (error) {
    console.error('Error fetching joined members:', error);
    res.status(500).json({ error: 'Kunde inte hämta medlemmar' });
  }
});

// Minneslagring för förslag per grupp
const suggestions = {}; // { [groupId]: [{ id, start, end, title, withMeet, location, votes: { email: 'accepted'|'declined' } }] }

// Föreslå en tid
app.post('/api/group/:groupId/suggest', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { start, end, email, title, withMeet, location, isMultiDay, multiDayStart, multiDayEnd, durationPerDay, dayStart, dayEnd } = req.body;
    if (!groupId || !start || !end || !email) return res.status(400).json({ error: 'groupId, start, end, email krävs' });

    const group = await getGroup(groupId);
    if (!group) return res.status(404).json({ error: 'Grupp finns inte' });

    const suggestionId = await createSuggestion({
      groupId,
      start,
      end,
      title: title || '',
      withMeet: typeof withMeet === 'boolean' ? withMeet : true,
      location: location || '',
      votes: { [email]: 'accepted' },
      fromEmail: email,
      groupName: group.groupName || 'Namnlös grupp',
      isMultiDay: isMultiDay || false,
      multiDayStart,
      multiDayEnd,
      durationPerDay,
      dayStart,
      dayEnd
    });
    
    res.json({ success: true, id: suggestionId });
  } catch (error) {
    console.error('Error creating suggestion:', error);
    res.status(500).json({ error: 'Kunde inte skapa förslag' });
  }
});

// Hämta alla förslag för en grupp
app.get('/api/group/:groupId/suggestions', async (req, res) => {
  try {
    const { groupId } = req.params;
    const suggestions = await getSuggestionsByGroup(groupId);
    res.json({ suggestions });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: 'Kunde inte hämta förslag' });
  }
});

// Ta bort ett förslag
app.delete('/api/group/:groupId/suggestion/:suggestionId', (req, res) => {
  const { groupId, suggestionId } = req.params;
  const { email } = req.body;
  
  if (!suggestions[groupId]) {
    return res.status(404).json({ error: 'Grupp finns inte' });
  }
  
  const suggestionIndex = suggestions[groupId].findIndex(s => s.id === suggestionId);
  if (suggestionIndex === -1) {
    return res.status(404).json({ error: 'Förslag finns inte' });
  }
  
  const suggestion = suggestions[groupId][suggestionIndex];
  if (suggestion.fromEmail !== email) {
    return res.status(403).json({ error: 'Du kan bara ta bort dina egna förslag' });
  }
  
  suggestions[groupId].splice(suggestionIndex, 1);
  res.json({ success: true });
});

// Rösta på ett förslag och skapa Google Meet-länk + mejl när alla accepterat
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
    
    // Returnera omedelbart med uppdaterat förslag, även om calendar-bokning misslyckas
    const updatedSuggestion = await getSuggestion(suggestionId);
    res.json({ success: true, suggestion: updatedSuggestion });
    
    if (allAccepted && !suggestion.finalized) {
      console.log('All accepted! Creating calendar event and sending emails...');
      
      // Markera som finalized först så att UI:t uppdateras omedelbart
      const tempMeetLink = suggestion.withMeet ? `https://meet.google.com/${Math.random().toString(36).substring(2, 15)}` : '';
      await updateSuggestion(suggestionId, {
        finalized: true,
        meetLink: tempMeetLink,
        status: 'processing'
      });
      console.log('Marked as finalized with temp meet link, now attempting calendar creation...');
      
      try {
        let meetLink = null;
        let meetEventId = suggestion.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
        console.log('Generated meetEventId:', meetEventId);

        // Skapa kalenderhändelse ALLTID när alla accepterat
        // Stöd för både Google Calendar och Microsoft Graph API
        const tokens = (group.tokens || []).filter(Boolean);
        console.log('Available tokens:', tokens.length);
        if (!tokens.length) {
          console.error('No tokens available for group');
          return res.status(500).json({ error: 'Inga tokens för gruppen.' });
        }
        const token = tokens[0];
        
        // Bestäm provider baserat på användarens inloggningsmetod
        const provider = group.creatorProvider || 'google';
        console.log('Using token for calendar creation, provider:', provider);
        
        if (provider === 'microsoft') {
          // Microsoft Graph API
          try {
            const testResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (testResponse.status === 401) {
              throw new Error('Microsoft token expired or invalid');
            }
          } catch (tokenError) {
            console.error('Microsoft token validation failed:', tokenError.message);
            throw new Error('Microsoft OAuth token is invalid or expired. User needs to re-authenticate.');
          }
          
          const eventResource = {
            subject: suggestion.title || 'Föreslaget möte',
            body: {
              contentType: 'HTML',
              content: 'Bokat via BookR Kalenderjämförelse'
            },
            start: {
              dateTime: new Date(suggestion.start).toISOString(),
              timeZone: 'Europe/Stockholm'
            },
            end: {
              dateTime: new Date(suggestion.end).toISOString(),
              timeZone: 'Europe/Stockholm'
            },
            attendees: allEmails.map(email => ({ emailAddress: { address: email } }))
          };

          if (suggestion.withMeet) {
            eventResource.isOnlineMeeting = true;
            eventResource.onlineMeetingProvider = 'teamsForBusiness';
          } else if (suggestion.location) {
            eventResource.location = {
              displayName: suggestion.location
            };
          }

          console.log('Creating Microsoft calendar event with resource:', JSON.stringify(eventResource, null, 2));
          const response = await fetch('https://graph.microsoft.com/v1.0/me/events', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventResource)
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Microsoft Graph API error: ${errorData.error?.message || 'Unknown error'}`);
          }
          
          const responseData = await response.json();
          console.log('Microsoft calendar event created successfully:', responseData.id);

          if (suggestion.withMeet && responseData.onlineMeeting?.joinUrl) {
            meetLink = responseData.onlineMeeting.joinUrl;
            console.log('Teams meeting link extracted:', meetLink);
          } else {
            console.log('No Teams meeting link - withMeet:', suggestion.withMeet, 'onlineMeeting:', !!responseData.onlineMeeting);
          }
        } else {
          // Google Calendar API (existing code)
          const userOAuth2 = new google.auth.OAuth2(
            process.env.CLIENT_ID,
            process.env.CLIENT_SECRET
          );
          userOAuth2.setCredentials({ access_token: token });
          
          // Testa token-validitet först
          try {
            const testResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/settings/timezone', {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (testResponse.status === 401) {
              throw new Error('Token expired or invalid');
            }
          } catch (tokenError) {
            console.error('Token validation failed:', tokenError.message);
            throw new Error('OAuth token is invalid or expired. User needs to re-authenticate.');
          }
          
          const userCalendar = google.calendar({ version: 'v3', auth: userOAuth2 });
          console.log('Google Calendar client created');

      const eventResource = {
        summary: suggestion.title || 'Föreslaget möte',
        description: 'Bokat via Kalenderjämförelse',
        start: { dateTime: new Date(suggestion.start).toISOString() },
        end: { dateTime: new Date(suggestion.end).toISOString() },
        attendees: allEmails.map(email => ({ email })),
      };

      if (suggestion.withMeet) {
        eventResource.conferenceData = {
          createRequest: {
            requestId: meetEventId,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        };
      } else if (suggestion.location) {
        eventResource.location = suggestion.location;
      }

      console.log('Creating calendar event with resource:', JSON.stringify(eventResource, null, 2));
      const response = await userCalendar.events.insert({
        calendarId: 'primary',
        resource: eventResource,
        conferenceDataVersion: suggestion.withMeet ? 1 : 0,
        sendUpdates: 'all'
      });
      console.log('Calendar event created successfully:', response.data.id);

        console.log('Conference data:', JSON.stringify(response.data.conferenceData, null, 2));
        if (suggestion.withMeet && response.data.conferenceData?.entryPoints) {
          meetLink = response.data.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video')?.uri;
          console.log('Meet link extracted:', meetLink);
        } else {
          console.log('No meet link - withMeet:', suggestion.withMeet, 'conferenceData:', !!response.data.conferenceData);
        }
        
        }
        
        console.log('Meeting link created:', meetLink);
        
        // Uppdatera suggestion i Firebase med meet-länk
        console.log('Updating suggestion in Firebase with meet link');
        await updateSuggestion(suggestionId, {
          meetLink: meetLink || '',
          finalized: true,
          status: 'completed'
        });
        console.log('Suggestion updated in Firebase with meet link');

        // Bygg mejltext med alla detaljer
        let mailText = `Alla har accepterat mötestiden!\n\n`;
        mailText += `Möte: ${suggestion.title ? suggestion.title : 'Föreslaget möte'}\n`;
        mailText += `Datum: ${new Date(suggestion.start).toLocaleString()} - ${new Date(suggestion.end).toLocaleString()}\n`;
        if (suggestion.withMeet && meetLink) {
          mailText += `Google Meet-länk: ${meetLink}\n`;
        }
        if (suggestion.location) {
          mailText += `Plats: ${suggestion.location}\n`;
        }
        mailText += `\nDeltagare:\n${allEmails.join('\n')}\n`;
        mailText += `\nDu hittar även mötet i din Google Kalender.\n\nHälsningar,\nBookR-teamet`;

        // Skicka mejl till ALLA med retry-logik
        const meetingEmailResults = [];
        for (const email of allEmails) {
          let emailSent = false;
          let attempts = 0;
          const maxAttempts = 3;
          
          while (!emailSent && attempts < maxAttempts) {
            attempts++;
            try {
              const result = await resend.emails.send({
                from: 'BookR <info@onebookr.se>',
                to: email,
                subject: 'Möte bokat!',
                text: mailText,
              });
              
              console.log(`Mötesmejl skickat till ${email} (försök ${attempts}/${maxAttempts}), ID: ${result.id}`);
              meetingEmailResults.push({ email, success: true, attempts, id: result.id });
              emailSent = true;
            } catch (emailErr) {
              console.error(`Fel vid mötesmejl till ${email} (försök ${attempts}/${maxAttempts}):`, emailErr.message);
              if (attempts === maxAttempts) {
                meetingEmailResults.push({ email, success: false, attempts, error: emailErr.message });
              } else {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          }
        }
        
        const successfulMeetingEmails = meetingEmailResults.filter(r => r.success);
        const failedMeetingEmails = meetingEmailResults.filter(r => !r.success);
        console.log(`Mötesmejl slutfört: ${successfulMeetingEmails.length} lyckades, ${failedMeetingEmails.length} misslyckades`);
        if (failedMeetingEmails.length > 0) {
          console.error('Misslyckade mötesmejl:', failedMeetingEmails);
        }

    } catch (err) {
      console.error('Fel vid Google Calendar-bokning eller mejl:', err, err?.response?.data);
      // Behåll finalized=true men uppdatera med felmeddelande och mock meet-länk
      try {
        const mockMeetLink = suggestion.withMeet ? 'https://meet.google.com/lookup/placeholder' : '';
        await updateSuggestion(suggestionId, {
          finalized: true,
          meetLink: mockMeetLink,
          status: 'error',
          error: 'Calendar booking failed: ' + err.message
        });
        console.log('Updated suggestion with error status but kept finalized=true, added mock meet link');
      } catch (fallbackErr) {
        console.error('Failed to update error status:', fallbackErr);
      }
    }
    }
  } catch (error) {
    console.error('Error voting on suggestion:', error);
    res.status(500).json({ error: 'Kunde inte rösta på förslag' });
  }
});

// Sätt gruppnamn
app.post('/api/group/:groupId/setname', (req, res) => {
  const { groupId } = req.params;
  const { groupName, email } = req.body;
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: 'Grupp finns inte' });
  if (group.creator.email !== email) return res.status(403).json({ error: 'Endast skaparen kan sätta gruppnamn' });
  
  group.groupName = groupName;
  group.nameSet = true;
  groupNames[groupId] = groupName;
  
  // Uppdatera alla inbjudningar med det nya namnet
  Object.keys(userInvitations).forEach(userEmail => {
    userInvitations[userEmail].forEach(inv => {
      if (inv.groupId === groupId) {
        inv.groupName = groupName;
      }
    });
  });
  
  res.json({ success: true });
});

// Hämta inbjudningar för en användare
app.get('/api/invitations/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const decodedEmail = decodeURIComponent(email);
    const invitations = await getInvitationsByEmail(decodedEmail);
    res.json({ invitations });
  } catch (error) {
    console.error('Error fetching invitations:', error);
    res.status(500).json({ error: 'Kunde inte hämta inbjudningar' });
  }
});

// Admin login endpoint
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_KEY) {
    req.session.adminAccess = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Fel lösenord' });
  }
});

// Kontaktformulär: Skicka mail till onebookr@gmail.com
app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Alla fält krävs.' });
  }
  try {
    await resend.emails.send({
      from: 'BookR <info@onebookr.se>',
      to: 'info@onebookr.se',
      subject: 'Bokningsförfrågan via BookR',
      text: `Namn: ${name}\nE-post: ${email}\n\nMeddelande:\n${message}`,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Fel vid kontaktmail:', err);
    res.status(500).json({ error: 'Kunde inte skicka meddelandet.' });
  }
});

// Väntelista - PERMANENT LAGRING I FIRESTORE (INGEN DATA FÖRSVINNER ALDRIG)
import { addToWaitlist, getWaitlist, getWaitlistCount, checkEmailInWaitlist } from './firestore.js';

// Lägg till på väntelista - PERMANENT LAGRING
app.post('/api/waitlist', async (req, res) => {
  const { email, name } = req.body;
  if (!email || !name) {
    return res.status(400).json({ error: 'Namn och e-post krävs.' });
  }
  
  try {
    // Kolla om redan registrerad i Firestore
    const existing = await checkEmailInWaitlist(email);
    if (existing) {
      return res.status(400).json({ error: 'Du är redan registrerad på väntelistan!' });
    }
    
    // Lägg till i Firestore - PERMANENT LAGRING
    await addToWaitlist(email, name);
    const totalCount = await getWaitlistCount();
    
    // Skicka välkomstmejl till användaren
    try {
      await resend.emails.send({
        from: 'BookR <info@onebookr.se>',
        to: email,
        subject: 'Välkommen till BookR väntelistan! 🚀',
        text: `Hej ${name}!\n\nTack för att du gått med på BookR väntelistan! 🎉\n\nDu är nu en av de första som får tillgång till BookR när vi lanserar. Vi bygger något riktigt coolt som kommer att revolutionera hur vi bokar möten!\n\n💫 Vad du kan förvänta dig:\n• Slut på mejlkaoset när ni ska hitta en tid\n• Jämför kalendrar på sekunder\n• Automatiska Google Meet-länkar\n• 100% gratis att använda\n\n📈 Du är nummer ${totalCount} på väntelistan!\n\nVi skickar uppdateringar om lanseringen och exklusiva förhandsvisningar. Håll utkik i din inkorg!\n\nHa en fantastisk dag! ✨\n\nBookR-teamet\ninfo@onebookr.se\n\nP.S. Dela gärna med dina vänner och kollegor - ju fler vi är, desto bättre blir BookR!`,
      });
      
      // Skicka admin-notifiering
      await resend.emails.send({
        from: 'BookR <info@onebookr.se>',
        to: 'info@onebookr.se',
        subject: 'Ny registrering på BookR väntelista',
        text: `Ny person har gått med på väntelistan:\n\nNamn: ${name}\nE-post: ${email}\nTid: ${new Date().toISOString()}\n\nTotalt antal: ${totalCount}`,
      });
    } catch (err) {
      console.error('Fel vid mejlutskick:', err);
    }
    
    res.json({ success: true, count: totalCount });
  } catch (error) {
    console.error('Fel vid registrering på väntelista:', error);
    res.status(500).json({ error: 'Kunde inte registrera på väntelistan.' });
  }
});

// Hämta antal på väntelista - FRÅN FIRESTORE
app.get('/api/waitlist/count', async (req, res) => {
  try {
    const count = await getWaitlistCount();
    res.json({ count });
  } catch (error) {
    console.error('Fel vid hämtning av väntelista-antal:', error);
    res.status(500).json({ error: 'Kunde inte hämta antal.' });
  }
});

// Admin: Hämta hela väntelistan (skyddad) - FRÅN FIRESTORE
app.get('/api/waitlist/admin', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== 'bookr-admin-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const waitlist = await getWaitlist();
    res.json({ waitlist, count: waitlist.length });
  } catch (error) {
    console.error('Fel vid hämtning av väntelista för admin:', error);
    res.status(500).json({ error: 'Kunde inte hämta väntelista.' });
  }
});

// Generera delningslänk för väntelistan
app.post('/api/waitlist/share', (req, res) => {
  const waitlistUrl = 'https://www.onebookr.se/waitlist';
  const message = encodeURIComponent('Kolla in BookR - slipp mejlkaoset när ni ska boka möten! 🚀');
  
  const shareLinks = {
    email: `mailto:?subject=${encodeURIComponent('Du borde kolla in BookR!')}&body=${encodeURIComponent(`Hej!\n\nJag hittade BookR - en app som gör slut på mejlkaoset när man ska boka möten.\n\nIstället för 15+ mejl och timmar av planering tar det 30 sekunder att hitta en tid som passar alla och få Google Meet-länk automatiskt.\n\nGå med på väntelistan här: ${waitlistUrl}\n\n100% gratis, inga kreditkort, lanseras inom kort!`)}`,
    whatsapp: `https://wa.me/?text=${message}%20${encodeURIComponent(waitlistUrl)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(waitlistUrl)}`,
    twitter: `https://twitter.com/intent/tweet?text=${message}&url=${encodeURIComponent(waitlistUrl)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(waitlistUrl)}`,
    copy: waitlistUrl
  };
  
  res.json({ shareLinks, waitlistUrl });
});

// Specifika routes för React SPA
app.get('/waitlist', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'OneBookR/calendar-frontend/dist/index.html'));
});

app.get('/admin/waitlist', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'OneBookR/calendar-frontend/dist/index.html'));
});

app.get('/about', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'OneBookR/calendar-frontend/dist/index.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'OneBookR/calendar-frontend/dist/index.html'));
});

app.get('/business-signup', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'OneBookR/calendar-frontend/dist/index.html'));
});

app.get('/business-admin', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'OneBookR/calendar-frontend/dist/index.html'));
});

app.get('/venue-admin', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'OneBookR/calendar-frontend/dist/index.html'));
});

app.get('/venue/:venueId', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'OneBookR/calendar-frontend/dist/index.html'));
});

// In-memory storage för företag och hallar (i produktion skulle detta vara databas)
const businesses = new Map();
const venues = new Map();
const venueSchedules = new Map();

// Business API endpoints
app.post('/api/business/register', async (req, res) => {
  const { companyName, businessType, contactPerson, googleEmail, googleId, googleToken } = req.body;
  
  if (!companyName || !businessType || !contactPerson || !googleEmail) {
    return res.status(400).json({ error: 'Alla obligatoriska fält krävs' });
  }
  
  try {
    const bookingCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    
    // Spara företaget
    businesses.set(googleEmail, {
      companyName,
      businessType,
      contactPerson,
      googleEmail,
      googleId,
      bookingCode,
      createdAt: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      bookingCode,
      message: 'Företag registrerat framgångsrikt'
    });
  } catch (error) {
    console.error('Error registering business:', error);
    res.status(500).json({ error: 'Kunde inte registrera företag' });
  }
});

app.get('/api/business/by-email/:email', async (req, res) => {
  const { email } = req.params;
  
  const business = businesses.get(email);
  
  if (business) {
    res.json({ business });
  } else {
    res.status(404).json({ error: 'Företag inte hittat' });
  }
});

app.get('/api/business/:bookingCode/meetings', async (req, res) => {
  const { bookingCode } = req.params;
  
  // Mock meetings data
  const mockMeetings = [
    {
      id: '1',
      title: 'Möte med Anna Andersson',
      start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      end: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
      clientEmail: 'anna@example.com',
      location: 'Kontoret'
    },
    {
      id: '2', 
      title: 'Konsultation med Erik Svensson',
      start: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      end: new Date(Date.now() + 48 * 60 * 60 * 1000 + 90 * 60 * 1000).toISOString(),
      clientEmail: 'erik@example.com',
      location: 'Online'
    }
  ];
  
  res.json({ meetings: mockMeetings });
});

// Venue API endpoints
app.post('/api/venues/register', async (req, res) => {
  const { name, website, contactEmail, googleEmail, googleToken } = req.body;
  
  if (!name || !contactEmail || !googleEmail || !googleToken) {
    return res.status(400).json({ error: 'Namn, kontakt-email och Google-inloggning krävs' });
  }
  
  try {
    const venueId = Math.random().toString(36).substring(2, 10).toLowerCase();
    const uniqueLink = `https://www.onebookr.se/venue/${venueId}`;
    
    venues.set(venueId, {
      id: venueId,
      name,
      website,
      contactEmail,
      googleEmail,
      googleToken,
      createdAt: new Date().toISOString()
    });
    
    // Hämta riktiga lediga tider från Google Calendar
    try {
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const { events } = await fetchCalendarEvents(
        googleToken, 
        now.toISOString(), 
        weekFromNow.toISOString()
      );
      
      // Skapa lediga slots baserat på öppettider minus upptagna tider
      const freeSlots = generateVenueFreeSlots(events, now, weekFromNow);
      venueSchedules.set(venueId, freeSlots);
    } catch (error) {
      console.error('Error fetching venue calendar:', error);
      // Fallback till mock-data
      const mockSlots = [];
      const now = new Date();
      for (let i = 1; i <= 7; i++) {
        const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
        for (let hour = 9; hour <= 20; hour += 2) {
          const start = new Date(date);
          start.setHours(hour, 0, 0, 0);
          const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
          
          mockSlots.push({
            start: start.toISOString(),
            end: end.toISOString(),
            title: 'Ledig bana',
            type: 'venue'
          });
        }
      }
      venueSchedules.set(venueId, mockSlots);
    }
    
    res.json({ 
      success: true, 
      uniqueLink,
      venueId,
      message: 'Hall registrerad framgångsrikt'
    });
  } catch (error) {
    console.error('Error registering venue:', error);
    res.status(500).json({ error: 'Kunde inte registrera hall' });
  }
});

app.get('/api/venues/:venueId', async (req, res) => {
  const { venueId } = req.params;
  
  const venue = venues.get(venueId);
  const availableSlots = venueSchedules.get(venueId) || [];
  
  if (venue) {
    res.json({ venue, availableSlots });
  } else {
    res.status(404).json({ error: 'Hall inte hittad' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'OneBookR/calendar-frontend/dist/index.html'));
});

// Svara på inbjudan (acceptera eller neka)
app.post('/api/invitation/:invitationId/respond', async (req, res) => {
  try {
    const { invitationId } = req.params;
    const { response } = req.body; // 'accept' eller 'decline'
    
    if (!response || !['accept', 'decline'].includes(response)) {
      return res.status(400).json({ error: 'Response måste vara accept eller decline' });
    }
    
    await updateInvitation(invitationId, {
      responded: true,
      accepted: response === 'accept',
      respondedAt: new Date().toISOString()
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error responding to invitation:', error);
    res.status(500).json({ error: 'Kunde inte svara på inbjudan' });
  }
});

// Hämta invites för användare (för ShortcutDashboard)
app.get('/api/invites', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header krävs' });
  }
  
  // För nu returnerar vi mock-data
  const mockInvites = [];
  res.json({ invites: mockInvites });
});

// Svara på invite (för ShortcutDashboard)
app.post('/api/invites/:inviteId/respond', async (req, res) => {
  const { inviteId } = req.params;
  const { response } = req.body;
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header krävs' });
  }
  
  if (!response || !['accept', 'decline'].includes(response)) {
    return res.status(400).json({ error: 'Response måste vara accept eller decline' });
  }
  
  // För nu returnerar vi bara success
  res.json({ success: true });
});

// Skicka kontaktförfrågan
app.post('/api/contact-request', async (req, res) => {
  const { fromEmail, toEmail, fromName } = req.body;
  
  if (!fromEmail || !toEmail) {
    return res.status(400).json({ error: 'Från- och till-email krävs' });
  }
  
  try {
    // Skicka notifikation till mottagaren (i produktion skulle detta vara databas)
    // För nu använder vi localStorage på frontend
    res.json({ success: true, message: 'Kontaktförfrågan skickad' });
  } catch (error) {
    console.error('Error sending contact request:', error);
    res.status(500).json({ error: 'Kunde inte skicka kontaktförfrågan' });
  }
});

// Skicka team-inbjudningar
app.post('/api/send-team-invitation', async (req, res) => {
  const { toEmail, fromEmail, fromName, teamName, groupId, hasDirectAccess } = req.body;
  
  if (!toEmail || !fromEmail || !teamName || !groupId) {
    return res.status(400).json({ error: 'Alla fält krävs för team-inbjudan' });
  }
  
  try {
    const inviteLink = `https://www.onebookr.se/?group=${groupId}&team=${encodeURIComponent(teamName)}`;
    const accessType = hasDirectAccess ? 'direktåtkomst' : 'vanlig inbjudan';
    
    const emailSubject = `Inbjudan till teammöte: ${teamName}`;
    const emailText = `Hej!

${fromName || fromEmail} har startat en kalenderjämförelse för teamet "${teamName}" och bjudit in dig.

${hasDirectAccess ? 
      'Du har direktåtkomst vilket betyder att du kan delta direkt utan att behöva logga in separat.' : 
      'Klicka på länken nedan för att gå med i kalenderjämförelsen.'}

Länk till kalenderjämförelsen:
${inviteLink}

I kalenderjämförelsen kan ni:
✅ Se varandras lediga tider
✅ Föreslå mötestider
✅ Rösta på förslag
✅ Få automatiska Google Meet-länkar

Hälsningar,
BookR-teamet`;
    
    await resend.emails.send({
      from: 'BookR <info@onebookr.se>',
      to: toEmail,
      subject: emailSubject,
      text: emailText
    });
    
    console.log(`Team invitation sent to ${toEmail} for team ${teamName}`);
    res.json({ success: true, message: 'Team-inbjudan skickad' });
  } catch (error) {
    console.error('Error sending team invitation:', error);
    res.status(500).json({ error: 'Kunde inte skicka team-inbjudan' });
  }
});

// Direktbokning endpoint
app.post('/api/direct-booking', async (req, res) => {
  const { contactEmail, contactName, userEmail, userToken } = req.body;
  
  if (!contactEmail || !userEmail || !userToken) {
    return res.status(400).json({ error: 'Kontakt-email, användar-email och token krävs' });
  }
  
  try {
    // Skapa en direktbokningsgrupp
    const groupId = `direct_${Date.now()}`;
    
    const group = await createGroup({
      creatorEmail: userEmail,
      creatorToken: userToken,
      creatorProvider: 'google',
      groupName: `Möte med ${contactName || contactEmail}`,
      tokens: [userToken],
      joinedEmails: [userEmail],
      directAccess: true,
      contactEmail,
      contactName
    });
    
    res.json({ success: true, groupId, redirectUrl: `/?group=${groupId}&directAccess=true&contactEmail=${encodeURIComponent(contactEmail)}&contactName=${encodeURIComponent(contactName || '')}` });
  } catch (error) {
    console.error('Error creating direct booking:', error);
    res.status(500).json({ error: 'Kunde inte skapa direktbokning' });
  }
});

// Hämta direktåtkomst-tokens för team/kontakter
app.post('/api/group/direct-access-tokens', async (req, res) => {
  const { ownerEmail, targetEmails } = req.body;
  
  if (!ownerEmail || !targetEmails || !Array.isArray(targetEmails)) {
    return res.status(400).json({ error: 'ownerEmail och targetEmails (array) krävs' });
  }
  
  try {
    // För direktåtkomst använder vi bara ägarens token
    // Direktåtkomst betyder att vi kan se andras kalendrar utan att de behöver logga in
    console.log('Direct access tokens requested for:', { ownerEmail, targetEmails });
    console.log('Returning owner token only for direct access');
    
    res.json({ 
      success: true, 
      tokens: [], // Inga extra tokens behövs för direktåtkomst
      message: 'Direktåtkomst aktiverat - använder endast ägarens token' 
    });
  } catch (error) {
    console.error('Error fetching direct access tokens:', error);
    res.status(500).json({ error: 'Kunde inte hämta direktåtkomst-tokens' });
  }
});

// GDPR-endpoint för att radera användardata
app.delete('/api/user/delete-data', async (req, res) => {
  const { email } = req.body;
  
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Giltig e-postadress krävs' });
  }
  
  try {
    await deleteUserData(email);
    res.json({ success: true, message: 'All användardata har raderats från Firebase' });
  } catch (error) {
    console.error('Error deleting user data:', error);
    res.status(500).json({ error: 'Kunde inte radera användardata' });
  }
});

// Task scheduling endpoints
app.post('/api/calendar/events', async (req, res) => {
  const { token, timeMin, timeMax } = req.body;
  
  try {
    // Validera token först
    const oauth2Client = new google.auth.OAuth2(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      'https://www.onebookr.se/auth/google/callback'
    );

    oauth2Client.setCredentials({
      access_token: token,
      refresh_token: req.body.refreshToken // Vi behöver skicka med refresh token från frontend
    });

    try {
      // Försök validera token
      await oauth2Client.getTokenInfo(token);
    } catch (error) {
      // Token är ogiltig, försök refresh om vi har refresh token
      if (req.body.refreshToken) {
        try {
          const { tokens } = await oauth2Client.refreshToken(req.body.refreshToken);
          // Skicka tillbaka ny token till frontend
          return res.status(401).json({ 
            error: 'Token expired',
            newToken: tokens.access_token,
            requiresReauth: false
          });
        } catch (refreshError) {
          // Refresh misslyckades, användaren måste logga in igen
          return res.status(401).json({ 
            error: 'Token refresh failed',
            requiresReauth: true
          });
        }
      } else {
        // Ingen refresh token, användaren måste logga in igen
        return res.status(401).json({ 
          error: 'Token invalid and no refresh token',
          requiresReauth: true
        });
      }
    }

    // Fortsätt med kalenderhämtning som vanligt...
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true
    });

    res.json({ events: response.data.items });
  } catch (error) {
    console.error('Error fetching calendar:', error);
    res.status(500).json({ error: 'Failed to fetch calendar data' });
  }
});