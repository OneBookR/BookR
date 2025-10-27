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
      return { events: [], timezone: 'Europe/Stockholm', status: 401 };
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
      return { events: [], timezone: userTimezone, status: response.status };
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

    return { events: convertedEvents, timezone: userTimezone, status: 200 };
  } catch (err) {
    console.error('Fel vid hämtning av Microsoft kalenderhändelser:', err);
    return { events: [], timezone: 'Europe/Stockholm', status: 500 };
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
      return { events: [], timezone: 'Europe/Stockholm', status: 401 };
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
      return { events: [], timezone: userTimezone, status: calendarListResponse.status };
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

    return { events: flatEvents, timezone: userTimezone, status: 200 };
  } catch (err) {
    console.error('Fel vid hämtning av kalenderhändelser:', err);
    return { events: [], timezone: 'Europe/Stockholm', status: 500 };
  }
};

app.post('/api/calendar/events', async (req, res) => {
  const { token, timeMin, timeMax } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Token krävs' });
  }
  const provider = detectProvider(token);
  try {
    const result = await fetchCalendarEvents(token, timeMin, timeMax, provider);
    if (result.status === 401) {
      return res.status(401).json({ error: 'Token ogiltig eller utgången', provider });
    }
    if (result.status && result.status >= 400) {
      return res.status(result.status).json({ error: 'Kunde inte hämta kalenderhändelser', provider });
    }
    const formattedEvents = (result.events || []).map(e => ({
      title: e.summary || e.subject || 'Upptagen',
      start: e.start?.dateTime || e.start?.date || e.start,
      end: e.end?.dateTime || e.end?.date || e.end
    }));
    res.json({ events: formattedEvents, provider });
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    res.status(500).json({ error: 'Kunde inte hämta kalenderhändelser' });
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
    
    // Returnera omedelbart med uppdaterat förslag
    const updatedSuggestion = await getSuggestion(suggestionId);
    res.json({ success: true, suggestion: updatedSuggestion });
    
    if (allAccepted && !suggestion.finalized) {
      console.log('All accepted! Creating unified meeting for all participants...');
      
      // Markera som finalized först
      await updateSuggestion(suggestionId, {
        finalized: true,
        status: 'processing'
      });
      console.log('Marked as finalized, now creating calendar events...');
      
      try {
        const meetEventId = suggestionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
        
        const tokens = (group.tokens || []).filter(Boolean);
        console.log('Available tokens:', tokens.length);
        
        if (!tokens.length) {
          console.error('No tokens available for group');
          throw new Error('Inga tokens för gruppen');
        }

        // VIKTIGT: Detektera om det finns någon Microsoft-användare
        let hasMicrosoftUser = false;
        const providers = [];
        for (const token of tokens) {
          const provider = detectProvider(token);
          providers.push(provider);
          if (provider === 'microsoft') {
            hasMicrosoftUser = true;
          }
        }
        
        // Välj videomötestyp baserat på deltagare
        const meetingType = hasMicrosoftUser ? 'teams' : 'meet';
        console.log(`🎥 Meeting type: ${meetingType} (hasMicrosoftUser: ${hasMicrosoftUser})`);
        console.log(`Providers in group: ${providers.join(', ')}`);

        // Skapa base event data
        const baseEventData = {
          summary: suggestion.title || 'BookR-möte',
          description: `Möte bokat via BookR\n\nDeltagare: ${allEmails.join(', ')}`,
          start: {
            dateTime: suggestion.start,
            timeZone: 'Europe/Stockholm'
          },
          end: {
            dateTime: suggestion.end,
            timeZone: 'Europe/Stockholm'
          },
          location: suggestion.location || undefined,
          attendees: allEmails
        };

        let unifiedMeetLink = null;

        // NYTT: Skapa FÖRSTA eventet för att få Meet-länken
        let firstGoogleTokenIndex = -1;
        for (let i = 0; i < tokens.length; i++) {
          if (providers[i] === 'google') {
            firstGoogleTokenIndex = i;
            break;
          }
        }

        // Skapa event för varje deltagare med SAMMA videomötestyp
        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i];
          const provider = providers[i];
          console.log(`Creating event ${i + 1}/${tokens.length} for provider: ${provider} with ${meetingType}`);
          
          let result = null;
          
          if (provider === 'microsoft') {
            // Microsoft Calendar med Teams (alltid om det finns MS-användare)
            const msEventData = {
              ...baseEventData,
              conferenceData: suggestion.withMeet ? { createRequest: { requestId: meetEventId } } : undefined
            };
            result = await createMicrosoftCalendarEvent(token, msEventData);
          } else {
            // Google Calendar
            if (meetingType === 'teams') {
              // Om vi ska ha Teams men användaren är Google → skapa utan videomöte, länken kommer från MS-användaren
              console.log('Creating Google event WITHOUT Meet (Teams will be used from MS user)');
              const googleEventData = {
                ...baseEventData,
                // Ingen conferenceData = inget Meet
              };
              result = await createGoogleCalendarEvent(token, googleEventData, null);
            } else {
              // NYTT: Endast Google-användare → skapa Meet ENDAST för första användaren, resten får samma länk
              if (i === firstGoogleTokenIndex && !unifiedMeetLink) {
                console.log('Creating FIRST Google event WITH NEW Meet link');
                const googleEventData = {
                  ...baseEventData,
                  conferenceData: suggestion.withMeet ? {
                    createRequest: {
                      requestId: meetEventId,
                      conferenceSolutionKey: { type: 'hangoutsMeet' }
                    }
                  } : undefined
                };
                result = await createGoogleCalendarEvent(token, googleEventData, null);
                
                // Spara Meet-länken från första eventet
                if (result?.meetLink) {
                  unifiedMeetLink = result.meetLink;
                  console.log(`📹 Master Meet link created: ${unifiedMeetLink}`);
                }
              } else {
                // Alla andra Google-användare får SAMMA Meet-länk
                console.log('Creating Google event WITH EXISTING Meet link:', unifiedMeetLink);
                const googleEventData = {
                  ...baseEventData,
                  // TA BORT conferenceData här - vi lägger till länken manuellt i funktionen
                };
                result = await createGoogleCalendarEvent(token, googleEventData, unifiedMeetLink);
              }
            }
          }
          
          if (result?.success) {
            console.log(`✅ Event created for participant ${i + 1} (${provider})`);
            // Spara första möteslänken vi får (Teams eller Meet)
            if (!unifiedMeetLink && result.meetLink) {
              unifiedMeetLink = result.meetLink;
              console.log(`📹 Unified meeting link set: ${unifiedMeetLink}`);
            }
          } else {
            console.error(`❌ Failed to create event for participant ${i + 1} (${provider})`);
          }
        }
        
        console.log('✅ All calendar events created!');
        console.log(`🎥 Final meeting type: ${meetingType}, link: ${unifiedMeetLink || 'N/A'}`);
        
        // Uppdatera suggestion med meet-länk
        await updateSuggestion(suggestionId, {
          meetLink: unifiedMeetLink,
          meetingType, // Spara vilken typ av möte det är
          finalized: true,
          status: 'completed'
        });

        // Bygg mejltext med rätt videomötestyp
        let mailText = `Alla har accepterat mötestiden!\n\n`;
        mailText += `Möte: ${suggestion.title || 'Föreslaget möte'}\n`;
        mailText += `Datum: ${new Date(suggestion.start).toLocaleString()} - ${new Date(suggestion.end).toLocaleString()}\n\n`;
        
        if (suggestion.withMeet && unifiedMeetLink) {
          const meetingPlatform = meetingType === 'teams' ? 'Microsoft Teams' : 'Google Meet';
          mailText += `🎥 ${meetingPlatform}-länk:\n${unifiedMeetLink}\n\n`;
          mailText += `(Alla deltagare använder samma ${meetingPlatform}-länk)\n\n`;
        }
        
        if (suggestion.location) {
          mailText += `📍 Plats: ${suggestion.location}\n\n`;
        }
        mailText += `Deltagare:\n${allEmails.join('\n')}\n\n`;
        mailText += `Du hittar även mötet i din kalender (Google Calendar eller Outlook).\n\nHälsningar,\nBookR-teamet`;

        // Skicka mejl med retry
        for (const recipientEmail of allEmails) {
          let attempts = 0;
          while (attempts < 3) {
            attempts++;
            try {
              await resend.emails.send({
                from: 'BookR <info@onebookr.se>',
                to: recipientEmail,
                subject: 'Möte bokat!',
                text: mailText,
              });
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

// Hjälpfunktion: Skapa Microsoft Calendar event med Teams
async function createMicrosoftCalendarEvent(token, eventData) {
  try {
    console.log('Creating Microsoft Calendar event with Teams...');
    
    const microsoftEvent = {
      subject: eventData.summary || 'Möte',
      body: {
        contentType: 'HTML',
        content: eventData.description || 'Bokat via BookR'
      },
      start: {
        dateTime: eventData.start.dateTime,
        timeZone: eventData.start.timeZone || 'Europe/Stockholm'
      },
      end: {
        dateTime: eventData.end.dateTime,
        timeZone: eventData.end.timeZone || 'Europe/Stockholm'
      },
      location: eventData.location ? {
        displayName: eventData.location
      } : undefined,
      attendees: eventData.attendees?.map(email => ({
        emailAddress: { address: email },
        type: 'required'
      })) || []
    };

    // Lägg till Teams meeting om conferenceData finns
    if (eventData.conferenceData) {
      microsoftEvent.isOnlineMeeting = true;
      microsoftEvent.onlineMeetingProvider = 'teamsForBusiness';
    }

    const response = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(microsoftEvent)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Microsoft Graph API error:', errorData);
      return null;
    }

    const createdEvent = await response.json();
    console.log('✅ Microsoft Calendar event created:', createdEvent.id);

    return {
      success: true,
      eventId: createdEvent.id,
      meetLink: createdEvent.onlineMeeting?.joinUrl || null,
      provider: 'microsoft'
    };
  } catch (error) {
    console.error('Error creating Microsoft Calendar event:', error);
    return null;
  }
}

// Hjälpfunktion: Skapa Google Calendar event (kan vara med eller utan Meet)
async function createGoogleCalendarEvent(token, eventData, existingMeetLink = null) {
  try {
    console.log('Creating Google Calendar event...', existingMeetLink ? 'with existing Meet link' : 'will generate new Meet link');
    
    const userOAuth2 = new google.auth.OAuth2(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET
    );
    userOAuth2.setCredentials({ access_token: token });
    
    const userCalendar = google.calendar({ version: 'v3', auth: userOAuth2 });

    let finalEventData = { ...eventData };
    
    if (existingMeetLink) {
      // Lägg till existerande Meet-länk i konferensdata (INTE createRequest)
      finalEventData = {
        ...eventData,
        conferenceData: {
          conferenceSolution: {
            key: { type: 'hangoutsMeet' }
          },
          entryPoints: [{
            entryPointType: 'video',
            uri: existingMeetLink
          }]
        }
      };
    }

    const response = await userCalendar.events.insert({
      calendarId: 'primary',
      resource: finalEventData,
      conferenceDataVersion: 1,
      sendUpdates: 'all'
    });

    console.log('✅ Google Calendar event created:', response.data.id);

    const meetLink = existingMeetLink || 
                     response.data.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri || 
                     response.data.hangoutLink || 
                     null;

    return {
      success: true,
      eventId: response.data.id,
      meetLink: meetLink,
      provider: 'google'
    };
  } catch (error) {
    console.error('Error creating Google Calendar event:', error);
    return null;
  }
}

// API: Vote on suggestion - SMART VIDEOMÖTE: Teams om Microsoft finns, annars Meet
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
      
      // Markera som finalized först
      await updateSuggestion(suggestionId, {
        finalized: true,
        status: 'processing'
      });
      console.log('Marked as finalized, now creating calendar events...');
      
      try {
        const meetEventId = suggestionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
        
        const tokens = (group.tokens || []).filter(Boolean);
        console.log('Available tokens:', tokens.length);
        
        if (!tokens.length) {
          console.error('No tokens available for group');
          throw new Error('Inga tokens för gruppen');
        }

        // VIKTIGT: Detektera om det finns någon Microsoft-användare
        let hasMicrosoftUser = false;
        const providers = [];
        for (const token of tokens) {
          const provider = detectProvider(token);
          providers.push(provider);
          if (provider === 'microsoft') {
            hasMicrosoftUser = true;
          }
        }
        
        // Välj videomötestyp baserat på deltagare
        const meetingType = hasMicrosoftUser ? 'teams' : 'meet';
        console.log(`🎥 Meeting type: ${meetingType} (hasMicrosoftUser: ${hasMicrosoftUser})`);
        console.log(`Providers in group: ${providers.join(', ')}`);

        // Skapa base event data
        const baseEventData = {
          summary: suggestion.title || 'BookR-möte',
          description: `Möte bokat via BookR\n\nDeltagare: ${allEmails.join(', ')}`,
          start: {
            dateTime: suggestion.start,
            timeZone: 'Europe/Stockholm'
          },
          end: {
            dateTime: suggestion.end,
            timeZone: 'Europe/Stockholm'
          },
          location: suggestion.location || undefined,
          attendees: allEmails
        };

        let unifiedMeetLink = null;

        // NYTT: Skapa FÖRSTA eventet för att få Meet-länken
        let firstGoogleTokenIndex = -1;
        for (let i = 0; i < tokens.length; i++) {
          if (providers[i] === 'google') {
            firstGoogleTokenIndex = i;
            break;
          }
        }

        // Skapa event för varje deltagare med SAMMA videomötestyp
        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i];
          const provider = providers[i];
          console.log(`Creating event ${i + 1}/${tokens.length} for provider: ${provider} with ${meetingType}`);
          
          let result = null;
          
          if (provider === 'microsoft') {
            // Microsoft Calendar med Teams (alltid om det finns MS-användare)
            const msEventData = {
              ...baseEventData,
              conferenceData: suggestion.withMeet ? { createRequest: { requestId: meetEventId } } : undefined
            };
            result = await createMicrosoftCalendarEvent(token, msEventData);
          } else {
            // Google Calendar
            if (meetingType === 'teams') {
              // Om vi ska ha Teams men användaren är Google → skapa utan videomöte, länken kommer från MS-användaren
              console.log('Creating Google event WITHOUT Meet (Teams will be used from MS user)');
              const googleEventData = {
                ...baseEventData,
                // Ingen conferenceData = inget Meet
              };
              result = await createGoogleCalendarEvent(token, googleEventData, null);
            } else {
              // NYTT: Endast Google-användare → skapa Meet ENDAST för första användaren, resten får samma länk
              if (i === firstGoogleTokenIndex && !unifiedMeetLink) {
                console.log('Creating FIRST Google event WITH NEW Meet link');
                const googleEventData = {
                  ...baseEventData,
                  conferenceData: suggestion.withMeet ? {
                    createRequest: {
                      requestId: meetEventId,
                      conferenceSolutionKey: { type: 'hangoutsMeet' }
                    }
                  } : undefined
                };
                result = await createGoogleCalendarEvent(token, googleEventData, null);
                
                // Spara Meet-länken från första eventet
                if (result?.meetLink) {
                  unifiedMeetLink = result.meetLink;
                  console.log(`📹 Master Meet link created: ${unifiedMeetLink}`);
                }
              } else {
                // Alla andra Google-användare får SAMMA Meet-länk
                console.log('Creating Google event WITH EXISTING Meet link:', unifiedMeetLink);
                const googleEventData = {
                  ...baseEventData,
                  // TA BORT conferenceData här - vi lägger till länken manuellt i funktionen
                };
                result = await createGoogleCalendarEvent(token, googleEventData, unifiedMeetLink);
              }
            }
          }
          
          if (result?.success) {
            console.log(`✅ Event created for participant ${i + 1} (${provider})`);
            // Spara första möteslänken vi får (Teams eller Meet)
            if (!unifiedMeetLink && result.meetLink) {
              unifiedMeetLink = result.meetLink;
              console.log(`📹 Unified meeting link set: ${unifiedMeetLink}`);
            }
          } else {
            console.error(`❌ Failed to create event for participant ${i + 1} (${provider})`);
          }
        }
        
        console.log('✅ All calendar events created!');
        console.log(`🎥 Final meeting type: ${meetingType}, link: ${unifiedMeetLink || 'N/A'}`);
        
        // Uppdatera suggestion med meet-länk
        await updateSuggestion(suggestionId, {
          meetLink: unifiedMeetLink,
          meetingType, // Spara vilken typ av möte det är
          finalized: true,
          status: 'completed'
        });

        // Bygg mejltext med rätt videomötestyp
        let mailText = `Alla har accepterat mötestiden!\n\n`;
        mailText += `Möte: ${suggestion.title || 'Föreslaget möte'}\n`;
        mailText += `Datum: ${new Date(suggestion.start).toLocaleString()} - ${new Date(suggestion.end).toLocaleString()}\n\n`;
        
        if (suggestion.withMeet && unifiedMeetLink) {
          const meetingPlatform = meetingType === 'teams' ? 'Microsoft Teams' : 'Google Meet';
          mailText += `🎥 ${meetingPlatform}-länk:\n${unifiedMeetLink}\n\n`;
          mailText += `(Alla deltagare använder samma ${meetingPlatform}-länk)\n\n`;
        }
        
        if (suggestion.location) {
          mailText += `📍 Plats: ${suggestion.location}\n\n`;
        }
        mailText += `Deltagare:\n${allEmails.join('\n')}\n\n`;
        mailText += `Du hittar även mötet i din kalender (Google Calendar eller Outlook).\n\nHälsningar,\nBookR-teamet`;

        // Skicka mejl med retry
        for (const recipientEmail of allEmails) {
          let attempts = 0;
          while (attempts < 3) {
            attempts++;
            try {
              await resend.emails.send({
                from: 'BookR <info@onebookr.se>',
                to: recipientEmail,
                subject: 'Möte bokat!',
                text: mailText,
              });
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

// --- Provider autodetection helpers ---
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
  } catch (_) {}
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
      if (iss.includes('login.microsoftonline.com') || iss.includes('sts.windows.net')) return true;
      const aud = String(payload.aud || '').toLowerCase();
      if (aud.includes('graph.microsoft.com')) return true;
    }
  } catch (_) {}
  return false;
}

function detectProvider(token) {
  if (looksLikeGoogleToken(token) && !looksLikeMicrosoftToken(token)) return 'google';
  if (looksLikeMicrosoftToken(token) && !looksLikeGoogleToken(token)) return 'microsoft';
  // Unknown: prefer trying Google first for ya29 or JWT with google iss, else Microsoft
  if (token && token.startsWith('ya29.')) return 'google';
  if (token && token.startsWith('Ew')) return 'microsoft';
  // Default to google (legacy), but we will fallback to ms if google fails
  return 'google';
}

// --- Remote fetchers (minimal, robust error handling) ---
async function fetchGoogleEvents(accessToken, timeMinISO, timeMaxISO) {
  try {
    const tzRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/settings/timezone', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const tzData = tzRes.ok ? await tzRes.json() : null;
    const tz = tzData?.value || 'UTC';

    // calendarView (Google): get events flattened and expanded instances
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMinISO)}&timeMax=${encodeURIComponent(timeMaxISO)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, events: [] };
    }
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
    // Microsoft Graph calendarView
    const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(timeMinISO)}&endDateTime=${encodeURIComponent(timeMaxISO)}&$top=1000&$orderby=start/dateTime`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: tzPref
      }
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, events: [] };
    }
    if (!res.ok) return { ok: false, status: res.status, events: [] };
    const data = await res.json();
    const items = Array.isArray(data.value) ? data.value : [];
    return { ok: true, status: 200, tz: 'UTC', events: items };
  } catch (e) {
    return { ok: false, status: 0, events: [] };
  }
}

// Normalize events -> busy blocks [{start, end}]
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
      busy.push({ start, end, title: ev.subject || 'busy', isAllDay: ev?.isAllDay || false });
    }
  }
  return busy;
}

// Try primary provider, then fallback to the other if needed
async function fetchCalendarBusyAuto(token, timeMinISO, timeMaxISO) {
  const detected = detectProvider(token);
  console.log('fetchCalendarEvents auto-detect:', detected);

  const tryOrder = detected === 'microsoft' ? ['microsoft', 'google'] : ['google', 'microsoft'];

  for (const prov of tryOrder) {
    const res = prov === 'google'
      ? await fetchGoogleEvents(token, timeMinISO, timeMaxISO)
      : await fetchMicrosoftEvents(token, timeMinISO, timeMaxISO);

    if (res.ok && res.events.length > 0) {
      const busy = prov === 'google'
        ? normalizeGoogleEventsToBusy(res.events)
        : normalizeMicrosoftEventsToBusy(res.events);
      return { provider: prov, busy };
    }

    // If unauthorized/forbidden, try the other provider before giving up
    if (res.status === 401 || res.status === 403) {
      continue;
    }
  }
  // Nothing worked → return empty busy list without breaking the whole flow
  return { provider: detected, busy: [] };
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});