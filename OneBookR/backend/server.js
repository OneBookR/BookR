import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import bodyParser from 'body-parser';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import fetch from 'node-fetch';
import nodemailer from 'nodemailer';
import { randomUUID } from 'crypto';
import { google } from 'googleapis';
import path from 'path';

const app = express();
app.use(express.json());
app.use(bodyParser.json());
const PORT = process.env.PORT || 3000;

// Servera frontend static files
app.use(express.static('OneBookR/calendar-frontend/dist'));

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'OneBookR/calendar-frontend/dist/index.html'));
});

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://bookr-production.up.railway.app',
  ],
  credentials: true,
}));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// Google OAuth-strategi
passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
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
    prompt: 'select_account'
  })(req, res, next);
});

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // Hämta state från session
    const state = req.session.oauthState;
    delete req.session.oauthState;
    
    let redirectUrl = '/';
    
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
        
        // Kolla om det är en returnUrl från frontend
        if (decoded.returnUrl) {
          redirectUrl = decoded.returnUrl;
        }
        // Eller om det är gruppdata
        else if (decoded.groupId) {
          redirectUrl = `/?group=${decoded.groupId}`;
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
    
    // Använd samma origin som requesten kom från
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const frontendUrl = `${protocol}://${host}`;
    
    res.redirect(`${frontendUrl}${redirectUrl}`);
  }
);

app.get('/api/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user, token: req.user.accessToken });
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
      const frontendUrl = process.env.NODE_ENV === 'production' 
        ? 'https://bookr-production.up.railway.app' 
        : 'http://localhost:5173';
      res.redirect(frontendUrl);
    });
  });
});

const fetchCalendarEvents = async (token, min, max) => {
  try {
    // Hämta användarens tidszon först
    const settingsResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/settings/timezone',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    
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

    console.log('Användarens kalendrar som används:', calendars.map(c => ({
      id: c.id,
      summary: c.summary,
      primary: c.primary
    })));

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

    console.log('Hämtade händelser (efter filtrering):', allEvents);
    console.log('Användarens tidszon:', userTimezone);

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

// Enkel minneslagring (byt till databas i produktion)
const groups = {};
const userInvitations = {}; // { email: [{ groupId, inviteeId, fromEmail, createdAt, responded }] }
const groupNames = {}; // { groupId: groupName }

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

  const groupId = randomUUID();
  const invitees = emails.map(email => ({ id: randomUUID(), email }));

  groups[groupId] = {
    creator: { token: fromToken, email: creatorEmail },
    tokens: [fromToken],
    invitees,
    joinedEmails: [creatorEmail],
    groupName: groupName || 'Namnlös grupp'
  };

  groupNames[groupId] = groupName || 'Namnlös grupp';

  // Spara inbjudningar för varje användare
  invitees.forEach(inv => {
    if (!userInvitations[inv.email]) userInvitations[inv.email] = [];
    userInvitations[inv.email].push({
      groupId,
      inviteeId: inv.id,
      fromEmail: creatorEmail,
      groupName: groupName || 'Namnlös grupp',
      createdAt: new Date().toISOString(),
      responded: false
    });
  });

  // Skicka ut unika länkar
  const frontendUrl = process.env.NODE_ENV === 'production' 
    ? 'https://bookr-production.up.railway.app' 
    : 'http://localhost:5173';
  const inviteLinks = invitees.map(inv =>
    `${frontendUrl}?group=${groupId}&invitee=${inv.id}`
  );
  console.log('Skickar inbjudningar:', invitees.map((inv, i) => `${inv.email}: ${inviteLinks[i]}`));

  // Skicka mejl till varje e-postadress
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const emailPromises = invitees.map((inv, i) => {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: inv.email,
      subject: 'Inbjudan till Kalenderjämförelse',
      text: `Hej ${inv.email},\n\n${creatorEmail} vill jämföra sin kalender med dig i grupp "${groupName || 'Namnlös grupp'}".\n\nKlicka på din unika länk nedan för att acceptera inbjudan:\n\n${inviteLinks[i]}\n\nHälsningar,\nBookR-teamet`,
    };
    return transporter.sendMail(mailOptions);
  });

  await Promise.all(emailPromises);

  // Returnera även länkarna i svaret!
  res.json({ message: 'Inbjudningar skickade!', groupId, inviteLinks });
});

// När någon öppnar länken och loggar in
app.post('/api/group/join', (req, res) => {
  const { groupId, token, invitee, email: frontendEmail } = req.body;
  if (!groupId || !token) return res.status(400).json({ error: 'groupId och token krävs' });
  if (!groups[groupId]) return res.status(404).json({ error: 'Grupp finns inte' });

  // Koppla invitee-id till e-post
  let email = null;
  if (invitee) {
    const found = groups[groupId].invitees.find(inv => inv.id === invitee);
    if (found) email = found.email;
  }
  if (!email) {
    email = frontendEmail || groups[groupId].creator.email;
  }
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Kunde inte hitta en giltig e-postadress för användaren.' });
  }

  // Lägg alltid till token och email om de inte redan finns
  if (!groups[groupId].tokens.includes(token)) {
    groups[groupId].tokens.push(token);
  }
  if (email) {
    if (!groups[groupId].joinedEmails) groups[groupId].joinedEmails = [];
    if (!groups[groupId].joinedEmails.includes(email)) {
      groups[groupId].joinedEmails.push(email);
    }
  }

  // Markera inbjudan som besvarad
  if (email && userInvitations[email]) {
    const invitation = userInvitations[email].find(inv => inv.groupId === groupId);
    if (invitation) {
      invitation.responded = true;
      invitation.accepted = true;
    }
  }

  // Extra loggning för felsökning
  console.log('Grupp-join:', {
    groupId,
    tokens: groups[groupId].tokens,
    joinedEmails: groups[groupId].joinedEmails,
    invitees: groups[groupId].invitees,
    creator: groups[groupId].creator,
  });

  res.json({ success: true });
});

// Hämta alla tokens för en grupp
app.get('/api/group/:groupId/tokens', (req, res) => {
  const { groupId } = req.params;
  if (!groups[groupId]) return res.status(404).json({ error: 'Grupp finns inte' });
  res.json({ tokens: groups[groupId].tokens });
});

// Hämta status för grupp (om alla är inne)
app.get('/api/group/:groupId/status', (req, res) => {
  const { groupId } = req.params;
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: 'Grupp finns inte' });

  const expected = 1 + (group.invitees ? group.invitees.length : 0);
  const uniqueTokens = Array.from(new Set(group.tokens));
  const current = uniqueTokens.length;

  // Lista på alla e-postadresser (skapare + invitees)
  const allEmails = [
    group.creator?.email,
    ...(group.invitees?.map(inv => inv.email) || [])
  ].filter(Boolean);

  // NYTT: Räkna allJoined baserat på joinedEmails istället för tokens
  const joined = group.joinedEmails || [];
  const allJoined = allEmails.every(email => joined.includes(email));

  res.json({
    allJoined,
    current,
    expected,
    invited: allEmails,
    joined,
    groupName: group.groupName
  });
});

// Hämta e-postadresser som gått med i gruppen
app.get('/api/group/:groupId/joined', (req, res) => {
  const { groupId } = req.params;
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: 'Grupp finns inte' });
  res.json({ joined: group.joinedEmails || [] });
});

// Minneslagring för förslag per grupp
const suggestions = {}; // { [groupId]: [{ id, start, end, title, withMeet, location, votes: { email: 'accepted'|'declined' } }] }

// Föreslå en tid
app.post('/api/group/:groupId/suggest', (req, res) => {
  const { groupId } = req.params;
  const { start, end, email, title, withMeet, location, isMultiDay, multiDayStart, multiDayEnd, durationPerDay, dayStart, dayEnd } = req.body;
  if (!groupId || !start || !end || !email) return res.status(400).json({ error: 'groupId, start, end, email krävs' });

  if (!suggestions[groupId]) suggestions[groupId] = [];
  const id = randomUUID();
  const group = groups[groupId];
  suggestions[groupId].push({
    id,
    start,
    end,
    title: title || '',
    withMeet: typeof withMeet === 'boolean' ? withMeet : true,
    location: location || '',
    votes: { [email]: 'accepted' },
    fromEmail: email,
    groupName: group?.groupName || 'Namnlös grupp',
    isMultiDay: isMultiDay || false,
    multiDayStart,
    multiDayEnd,
    durationPerDay,
    dayStart,
    dayEnd
  });
  res.json({ success: true, id });
});

// Hämta alla förslag för en grupp
app.get('/api/group/:groupId/suggestions', (req, res) => {
  const { groupId } = req.params;
  res.json({ suggestions: suggestions[groupId] || [] });
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
  const { groupId, suggestionId } = req.params;
  const { email, vote } = req.body;
  if (!groupId || !suggestionId || !email || !vote) return res.status(400).json({ error: 'groupId, suggestionId, email, vote krävs' });

  const groupSuggestions = suggestions[groupId] || [];
  const suggestion = groupSuggestions.find(s => s.id === suggestionId);
  if (!suggestion) return res.status(404).json({ error: 'Förslag finns inte' });

  suggestion.votes[email] = vote;

  // Markera tidsförslag som besvarat för användaren
  if (userInvitations[email]) {
    userInvitations[email].forEach(inv => {
      if (inv.groupId === groupId) {
        inv.hasVotedOnSuggestion = true;
      }
    });
  }

  const group = groups[groupId];
  let allEmails = [];

  if (group?.creator?.email && group.creator.email.includes('@')) {
    allEmails.push(group.creator.email);
  }
  if (Array.isArray(group?.invitees)) {
    allEmails = allEmails.concat(
      group.invitees
        .map(inv => inv.email)
        .filter(email => email && email.includes('@'))
    );
  }

  const allAccepted = allEmails.every(e => suggestion.votes[e] === 'accepted');
  if (allAccepted && !suggestion.finalized) {
    try {
      let meetLink = null;
      let meetEventId = suggestion.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);

      // Skapa Google Calendar-event ALLTID när alla accepterat
      // Om withMeet: true, skapa Google Meet-länk, annars bara kalenderhändelse med plats
      const tokens = (group.tokens || []).filter(Boolean);
      if (!tokens.length) {
        return res.status(500).json({ error: 'Inga tokens för gruppen.' });
      }
      const token = tokens[0];
      const userOAuth2 = new google.auth.OAuth2();
      userOAuth2.setCredentials({ access_token: token });
      const userCalendar = google.calendar({ version: 'v3', auth: userOAuth2 });

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

      const response = await userCalendar.events.insert({
        calendarId: 'primary',
        resource: eventResource,
        conferenceDataVersion: suggestion.withMeet ? 1 : 0,
        sendUpdates: 'all'
      });

      if (suggestion.withMeet && response.data.conferenceData?.entryPoints) {
        meetLink = response.data.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video')?.uri;
      }
      suggestion.meetLink = meetLink || '';

      suggestion.finalized = true;

      // Skicka ut mejl till ALLA parter
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      // Bygg mejltext med eller utan meet-länk/plats
      let mailText = `Alla har accepterat mötestiden!\n\n`;
      mailText += `Möte: ${suggestion.title ? suggestion.title : 'Föreslaget möte'}\n`;
      mailText += `Datum: ${new Date(suggestion.start).toLocaleString()} - ${new Date(suggestion.end).toLocaleString()}\n`;
      if (suggestion.withMeet && suggestion.meetLink) {
        mailText += `Google Meet-länk: ${suggestion.meetLink}\n\nDu hittar även mötet i din Google Kalender.`;
      } else if (suggestion.location) {
        mailText += `Plats: ${suggestion.location}\n\nDu hittar även mötet i din Google Kalender.`;
      } else {
        mailText += `Du hittar mötet i din Google Kalender.`;
      }

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: allEmails.join(','),
        subject: 'Möte bokat!',
        text: mailText,
      });

      console.log('Mejl skickat till:', allEmails, 'med länk:', suggestion.meetLink);

      suggestion.confirmationMessage = suggestion.withMeet
        ? `Alla har accepterat mötestiden! Händelsen är nu bokad i kalendern och Google Meet-länk är skapad.`
        : `Alla har accepterat mötestiden! Händelsen är nu bokad i kalendern.`;

    } catch (err) {
      console.error('Fel vid Google Calendar-bokning eller mejl:', err, err?.response?.data);
      return res.status(500).json({ error: 'Kunde inte boka kalenderhändelse eller skicka mejl.', details: err?.message });
    }
  }

  res.json({ success: true, suggestion });
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
app.get('/api/invitations/:email', (req, res) => {
  const { email } = req.params;
  const invitations = userInvitations[decodeURIComponent(email)] || [];
  res.json({ invitations });
});

// Kontaktformulär: Skicka mail till onebookr@gmail.com
app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Alla fält krävs.' });
  }
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: 'onebookr@gmail.com',
      subject: 'Bokningsförfrågan via BookR',
      text: `Namn: ${name}\nE-post: ${email}\n\nMeddelande:\n${message}`,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Fel vid kontaktmail:', err);
    res.status(500).json({ error: 'Kunde inte skicka meddelandet.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});