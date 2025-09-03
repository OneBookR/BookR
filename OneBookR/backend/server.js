import dotenv from 'dotenv';
dotenv.config();

// DEBUG: Kolla att servern verkligen ser nyckeln
console.log("ADMIN_KEY från .env:", process.env.ADMIN_KEY);

import express from 'express';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import bodyParser from 'body-parser';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import fetch from 'node-fetch';
import { Resend } from "resend";
import { randomUUID } from 'crypto';
import { google } from 'googleapis';
import path from 'path';
import {
  createGroup, getGroup, updateGroup,
  createInvitation, getInvitationsByEmail, getInvitationsByGroup, updateInvitation,
  createSuggestion, getSuggestionsByGroup, updateSuggestion, getSuggestion,
  deleteUserData
} from './firestore.js';

// ✅ Skapa express app direkt
const app = express();
app.set('trust proxy', 1); // Behövs för secure cookies bakom Railway/Heroku
app.use(express.json());
app.use(bodyParser.json());

// Kontrollera att API-nyckeln finns vid start
if (!process.env.RESEND_API_KEY) {
  console.error('FEL: RESEND_API_KEY saknas. Sätt den i Railway / .env som RESEND_API_KEY.');
  // Omdirigera ej automatiskt i produktion — men logga tydligt. Du kan välja process.exit(1) om du vill stoppa servern.
}

const resend = new Resend(process.env.RESEND_API_KEY);
console.log("Resend API key exists?", !!process.env.RESEND_API_KEY);


// --- ROUTES --- //

app.post('/invite', async (req, res) => {
  try {
    const { invitedUserEmail, invitedUserName, groupId, inviterName } = req.body;

    if (!invitedUserEmail || !invitedUserName || !groupId || !inviterName) {
      return res.status(400).json({ error: 'Alla fält krävs: invitedUserEmail, invitedUserName, groupId, inviterName' });
    }

    // Använd en verifierad from-adress (sätt RESEND_FROM i Railway -> t.ex. noreply@bookr.se)
    const fromEmail = process.env.RESEND_FROM || 'noreply@your-verified-domain.com';
    const groupLink = `https://bookr-production.up.railway.app/${groupId}`;

    console.log("Försöker skicka mejl till:", invitedUserEmail);

    const response = await resend.emails.send({
      from: `BookR <${process.env.RESEND_FROM}>`,
      to: invitedUserEmail,
      subject: "Inbjudan till BookR",
      text: `Hej ${invitedUserName},\n\n${inviterName} vill jämföra sina kalendrar med dig.\nKlicka på länken för att gå med: ${groupLink}`,
      html: `<p>Hej ${invitedUserName},</p>
             <p>${inviterName} vill jämföra sina kalendrar med dig.</p>
             <p><a href="${groupLink}">Klicka för att gå med i gruppen</a></p>`
    });

    // Skriv ut hela svaret för debugging
    console.log("Resend send success:", JSON.stringify(response, null, 2));

    // Resend kan returnera ett objekt med id; skicka tillbaka relevant info
    return res.status(200).json({ success: true, id: response?.id || null, response });
  } catch (err) {
    // Mer utförlig fel-logging om Resend returnerar extra info
    if (err?.response) {
      console.error('Resend error response:', JSON.stringify(err.response, null, 2));
    }
    console.error('Fel vid utskick av mejl:', err);
    return res.status(500).json({ error: err?.message || 'Kunde inte skicka mejl' });
  }
});

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

// Middleware för auth
app.use(cors({
  origin: 'https://bookr-production.up.railway.app',
  credentials: true
}));
app.use(session({
  secret: process.env.SESSION_SECRET || "supersecret",
  resave: false,
  saveUninitialized: true,
  cookie: {
    sameSite: 'none',
    secure: true,
    httpOnly: true
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// ✅ Starta servern sist
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


// Google OAuth-strategi
passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: 'https://bookr-production.up.railway.app/auth/google/callback',
  accessType: 'offline',
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
    prompt: 'select_account',
    accessType: 'offline',
    includeGrantedScopes: true  // Enable incremental authorization
  })(req, res, next);
});

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    console.log('OAuth callback - user authenticated:', req.user ? 'Yes' : 'No');
    
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
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
        
        if (decoded.groupId) {
          redirectUrl = `/?auth=${authToken}&group=${decoded.groupId}`;
          if (decoded.inviteeId) {
            redirectUrl += `&invitee=${decoded.inviteeId}`;
          }
          if (decoded.hash) {
            redirectUrl += decoded.hash;
          }
        }
      } catch (e) {
        console.error('Fel vid dekodning av state:', e);
      }
    }
    
    const frontendUrl = 'https://bookr-production.up.railway.app';
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
      res.redirect('https://bookr-production.up.railway.app/');
    });
  });
});

const fetchCalendarEvents = async (token, min, max) => {
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
      console.error('OAuth token expired or invalid');
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
          console.error(`API-fel för kalender ${calendar.id}:`, data.error);
          return [];
        }

        return data.items || [];
      } catch (err) {
        console.error(`Fel vid hämtning av händelser för kalender ${calendar.id}:`, err);
        return [];
      }
    });

    // Vänta på alla händelser
    const allEvents = await Promise.all(eventsPromises);

    // Reduced logging
    console.log('Fetched events for', allEvents.length, 'calendars, timezone:', userTimezone);

    // Slå ihop alla händelser till en enda array och returnera med tidszon
    return { events: allEvents.flat(), timezone: userTimezone };
  } catch (err) {
    console.error('Fel vid hämtning av kalenderhändelser:', err);
    return { events: [], timezone: 'Europe/Stockholm' };
  }
};

// Justera mergeBusyTimes så att den hanterar överlapp korrekt och att tiderna är i millisekunder
const mergeBusyTimes = (busyTimes) => {
  // Filtrera bort block utan giltiga tider
  const filtered = busyTimes
    .filter(t => typeof t.start === 'number' && typeof t.end === 'number' && t.end > t.start)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const time of filtered) {
    if (!merged.length || time.start > merged[merged.length - 1].end) {
      merged.push({ ...time });
    } else {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, time.end);
      // Behåll titel och andra egenskaper från det längsta eventet
      if (time.end > merged[merged.length - 1].end) {
        merged[merged.length - 1].title = time.title;
        merged[merged.length - 1].isAllDay = time.isAllDay;
      }
    }
  }
  return merged;
};

// Justera calculateFreeTimes så att den alltid returnerar lediga block som INTE överlappar med upptagna tider
const calculateFreeTimes = (mergedBusy, rangeStart, rangeEnd) => {
  const freeTimes = [];
  let cursor = rangeStart;

  // Om inga upptagna tider, hela intervallet är ledigt
  if (!mergedBusy.length) {
    freeTimes.push({ start: new Date(rangeStart), end: new Date(rangeEnd) });
    return freeTimes;
  }

  for (const slot of mergedBusy) {
    // Ledig tid före första upptagna blocket
    if (cursor < slot.start) {
      freeTimes.push({ start: new Date(cursor), end: new Date(slot.start) });
    }
    cursor = Math.max(cursor, slot.end);
  }

  // Ledig tid efter sista upptagna blocket
  if (cursor < rangeEnd) {
    freeTimes.push({ start: new Date(cursor), end: new Date(rangeEnd) });
  }

  return freeTimes;
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

// Dela upp långa lediga luckor i mindre block (t.ex. 30 min)
function splitFreeSlots(freeSlots, durationMinutes) {
  const result = [];
  const durationMs = durationMinutes * 60 * 1000;
  for (const slot of freeSlots) {
    let start = slot.start.getTime();
    const end = slot.end.getTime();
    while (start + durationMs <= end) {
      result.push({
        start: new Date(start),
        end: new Date(start + durationMs),
      });
      start += durationMs;
    }
  }
  return result;
}

// Hjälpfunktion för att filtrera block inom daglig tidsram
function filterSlotsByDayTime(slots, dayStart, dayEnd) {
  if (!dayStart || !dayEnd) return slots;
  const [startHour, startMinute] = dayStart.split(':').map(Number);
  const [endHour, endMinute] = dayEnd.split(':').map(Number);

  return slots.filter(slot => {
    const start = new Date(slot.start);
    const end = new Date(slot.end);

    // Skapa dagliga gränser för slot-dagen
    const slotDayStart = new Date(start);
    slotDayStart.setHours(startHour, startMinute, 0, 0);

    const slotDayEnd = new Date(start);
    slotDayEnd.setHours(endHour, endMinute, 0, 0);

    // Om sluttiden är tidigare än starttiden, lägg till en dag
    if (endHour < startHour || (endHour === startHour && endMinute < startMinute)) {
      slotDayEnd.setDate(slotDayEnd.getDate() + 1);
    }

    // Blocket måste börja och sluta inom dagens tidsram
    return start >= slotDayStart && end <= slotDayEnd;
  });
}

app.post('/api/availability', async (req, res) => {
  const { tokens, timeMin, timeMax, duration, dayStart, dayEnd, isMultiDay, multiDayStart, multiDayEnd } = req.body;

  console.log('Tokens mottagna av backend:', tokens);

  if (!tokens || tokens.length < 2) {
    return res.status(400).json({ error: 'Minst två tokens krävs för att jämföra.' });
  }

  if (!timeMin || !timeMax) {
    return res.status(400).json({ error: 'timeMin och timeMax krävs.' });
  }

  try {
    // Hämta upptagna tider för varje token med tidszoner
    const allBusyTimesWithTimezones = await Promise.all(
      tokens.map(async token => {
        const { events, timezone } = await fetchCalendarEvents(token, timeMin, timeMax);
        // Hantera heldagsevent och vanliga event
        const processedEvents = events.map(e => {
          // Om det är ett heldagsevent (date, ej dateTime)
          if (e.start.date && !e.start.dateTime) {
            // Heldagsevent - lägg till explicit tid för konsistens
            const startDate = new Date(e.start.date + 'T00:00:00');
            const endDate = new Date(e.end.date + 'T00:00:00');
            return {
              start: startDate.getTime(),
              end: endDate.getTime(),
              title: e.summary || 'Upptagen',
              isAllDay: true
            };
          } else {
            // Vanligt event med dateTime
            return {
              start: new Date(e.start.dateTime).getTime(),
              end: new Date(e.end.dateTime).getTime(),
              title: e.summary || 'Upptagen',
              isAllDay: false
            };
          }
        });
        return { events: processedEvents, timezone };
      })
    );
    
    // Extrahera bara events för bakåtkompatibilitet
    const allBusyTimes = allBusyTimesWithTimezones.map(item => item.events);
    const userTimezones = allBusyTimesWithTimezones.map(item => item.timezone);

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
    for (let i = 1; i < allFreeTimes.length; i++) {
      commonFreeTimes = findCommonFreeTimes(commonFreeTimes, allFreeTimes[i]);
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

    // Ta bort CET/UTC+1 justering – skicka tider som de är
    const formattedBlocks = splitBlocks.map(slot => ({
      ...slot,
      start: new Date(slot.start).toISOString(),
      end: new Date(slot.end).toISOString()
    }));

    console.log('Sending formatted blocks to frontend:', formattedBlocks.slice(0, 2)); // Logga bara första 2 för debug

    res.json(formattedBlocks);
  } catch (err) {
    console.error('Error fetching availability:', err.message, err.stack);
    res.status(500).json({ error: 'Kunde inte hämta tillgänglighet.' });
  }
});

// Firebase Firestore används för datalagring

// Skapa grupp och skicka inbjudan
app.post('/api/invite', async (req, res) => {
  const { emails, fromUser, fromToken, groupName } = req.body;
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
    // Skapa grupp i Firebase
    const groupId = await createGroup({
      creatorEmail,
      creatorToken: fromToken,
      groupName: groupName || 'Namnlös grupp',
      tokens: [fromToken],
      joinedEmails: [creatorEmail]
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
        groupName: groupName || 'Namnlös grupp'
      });
      invitees.push({ id: inviteeId, email });
    }

    // Skicka ut unika länkar
    const frontendUrl = 'https://bookr-production.up.railway.app';
    const inviteLinks = invitees.map(inv =>
      `${frontendUrl}?group=${groupId}&invitee=${inv.id}`
    );
    console.log('Skickar inbjudningar:', invitees.map((inv, i) => `${inv.email}: ${inviteLinks[i]}`));

    // Returnera svar omedelbart
    res.json({ message: 'Inbjudningar skickade!', groupId, inviteLinks });
    
// Skicka mejl asynkront med Resend
setImmediate(async () => {
  try {
    // Extra loggning för felsökning
    console.log('Försöker skicka mejl med Resend');

    // Skicka mejl till alla inbjudna (en och en, så att to: är korrekt)
    for (let i = 0; i < invitees.length; i++) {
      const inv = invitees[i];
      // Skicka inte till samma adress som avsändaren
      if (inv.email && inv.email !== creatorEmail) {
        try {
          await resend.emails.send({
            from: "BookR <info@onebookr.se>",
            to: inv.email,
            subject: 'Inbjudan till Kalenderjämförelse',
            text: `Hej!\n\n${creatorEmail} har bjudit in dig till gruppen "${groupName || 'Namnlös grupp'}" för att jämföra kalendrar och hitta en gemensam tid.\n\nKlicka på din unika länk nedan för att acceptera inbjudan:\n${inviteLinks[i]}\n\nHälsningar,\nBookR-teamet`
          });
          console.log('Inbjudningsmejl skickat till:', inv.email);
        } catch (sendErr) {
          console.error('Fel vid utskick till', inv.email, sendErr);
        }
      } else {
        console.log('Hoppar över att skicka inbjudan till skaparen:', inv.email);
      }
    }

    // Skicka mejl till skaparen (creatorEmail) om att inbjudan har skickats
    try {
      const invitedList = invitees.map((inv, i) => `${inv.email}: ${inviteLinks[i]}`).join('\n');
      await resend.emails.send({
        from: "BookR <info@onebookr.se>",
        to: creatorEmail,
        subject: 'Du har bjudit in personer till din kalendergrupp',
        text: `Hej ${creatorEmail},\n\nDu har bjudit in följande personer till gruppen "${groupName || 'Namnlös grupp'}":\n\n${invitedList}\n\nDe har fått varsin unik länk för att gå med.\n\nHälsningar,\nBookR-teamet`
      });
      console.log('Mejl skickat till skaparen:', creatorEmail);
    } catch (creatorMailErr) {
      console.error('Fel vid mejlutskick till skaparen:', creatorMailErr);
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
    console.error('Fel vid skapande av grupp:', error);
    res.status(500).json({ error: 'Fel vid skapande av grupp' });
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

    // Uppdatera gruppen med ny medlem
    const updatedTokens = group.tokens || [];
    const updatedEmails = group.joinedEmails || [];
    
    if (!updatedTokens.includes(token)) {
      updatedTokens.push(token);
    }
    if (!updatedEmails.includes(email)) {
      updatedEmails.push(email);
    }

    // Uppdatera gruppen i Firebase
    await updateGroup(groupId, {
      tokens: updatedTokens,
      joinedEmails: updatedEmails
    });

    console.log('User joined group:', { groupId, email });
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
    
    const expected = 1 + invitedEmails.length;
    const current = group.joinedEmails ? group.joinedEmails.length : 1;
    const allJoined = current >= expected;

    res.json({
      allJoined,
      current,
      expected,
      invited: invitedEmails,
      joined: group.joinedEmails || [],
      groupName: group.groupName || 'Namnlös grupp'
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

        // Skapa Google Calendar-event ALLTID när alla accepterat
        // Om withMeet: true, skapa Google Meet-länk, annars bara kalenderhändelse med plats
        const tokens = (group.tokens || []).filter(Boolean);
        console.log('Available tokens:', tokens.length);
        if (!tokens.length) {
          console.error('No tokens available for group');
          return res.status(500).json({ error: 'Inga tokens för gruppen.' });
        }
        const token = tokens[0];
        console.log('Using token for calendar creation');
        
        // Skapa OAuth2-klient med refresh-funktionalitet
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
        
        console.log('Meet link created:', meetLink);
        
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

        // Skicka mejl till ALLA (en och en, så att alla får ett eget mejl)
        for (const email of allEmails) {
          await resend.emails.send({
            from: "BookR <info@onebookr.se>",
            to: email,
            subject: 'Möte bokat!',
            text: mailText,
          });
        }

        console.log('Verifieringsmejl skickat till:', allEmails);

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

// Kontaktformulär: Skicka mail till info@onebookr.se
app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Alla fält krävs.' });
  }
  try {
    await resend.emails.send({
      from: "BookR <info@onebookr.se>",
      to: "info@onebookr.se",   // ✅ admin får detta
      subject: "Bokningsförfrågan via BookR",
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

app.post('/api/waitlist', async (req, res) => {
  const { email, name, referrer } = req.body;

  if (!email || !name) return res.status(400).json({ error: 'Namn och e-post krävs.' });

  try {
    const existing = await checkEmailInWaitlist(email);
    if (existing) return res.status(400).json({ error: 'Du är redan registrerad på väntelistan!' });

    await addToWaitlist(email, name, referrer || null);
    const totalCount = await getWaitlistCount();

    res.json({ success: true, count: totalCount });
  } catch (err) {
    console.error('Fel vid registrering på väntelista:', err);
    res.status(500).json({ error: 'Kunde inte registrera på väntelistan.' });
  }
});

// Lägg till på väntelista - PERMANENT LAGRING
app.post('/api/waitlist', async (req, res) => {
  const { email, name, referrer } = req.body;
  
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
    
    // Skicka endast admin-notifiering för att spara kostnader
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
 
        
        // Endast admin-notifiering
        await resend.emails.send({
          from: "BookR <info@onebookr.se>",
          to: 'info@onebookr.se',
          subject: 'Ny registrering på BookR väntelista',
          text: `Ny person har gått med på väntelistan:\n\nNamn: ${name}\nE-post: ${email}\nTid: ${new Date().toISOString()}\n\nTotalt antal: ${totalCount}`,
        });
      } catch (err) {
        console.error('Fel vid mejlutskick:', err);
      }
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


// Admin-route
app.get("/api/waitlist/admin", async (req, res) => {
  const incomingKey = req.headers["x-admin-key"];
  if (incomingKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Fel nyckel" });
  }

  try {
    const waitlist = await getWaitlist(); // hämtar alla fält, inklusive referredBy
    res.json({ waitlist });
  } catch (err) {
    console.error("Fel vid hämtning av väntelista:", err);
    res.status(500).json({ error: "Serverfel" });
  }
});


// Generera delningslänk för väntelistan
app.post('/api/waitlist/share', (req, res) => {
  const waitlistUrl = 'https://bookr-production.up.railway.app/waitlist';
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

app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'OneBookR/calendar-frontend/dist/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
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
      accepted: response === 'accept'
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error responding to invitation:', error);
    res.status(500).json({ error: 'Kunde inte svara på inbjudan' });
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