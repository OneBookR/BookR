import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Resend } from 'resend';
import { initializeFirebase } from './firestore.js';
import 'dotenv/config';

// ===== APPLICATION SETUP =====
const app = express();
const PORT = process.env.PORT || 3000;

// ===== EXTERNAL SERVICES =====
const resend = new Resend(process.env.RESEND_API_KEY);
let db;

// Initialize Firebase
try {
  db = await initializeFirebase();
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
  console.warn('⚠️ Continuing without Firebase...');
}

// ===== IN-MEMORY STORAGE =====
const activeGroups = new Map();

// ===== UTILITY FUNCTIONS =====

// Email template functions
const createInviteEmailHtml = (fromName, fromEmail, groupName, inviteLink) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BookR Kalenderjämförelse</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f7fa;">
    <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 300;">📅 BookR</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Kalenderjämförelse</p>
        </div>
        <div style="padding: 40px 30px;">
            <h2 style="color: #2c3e50; margin: 0 0 20px 0; font-size: 24px; font-weight: 400;">
                Du har blivit inbjuden!
            </h2>
            <p style="color: #34495e; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
                <strong>${fromName}</strong> (${fromEmail}) vill jämföra kalendrar med dig för att hitta en lämplig mötestid.
            </p>
            ${groupName !== 'Namnlös grupp' ? `
            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #3498db; margin: 20px 0;">
                <p style="margin: 0; color: #2c3e50; font-weight: 500;">Grupp: ${groupName}</p>
            </div>
            ` : ''}
            <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteLink}" 
                   style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                          color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; 
                          font-weight: 500; font-size: 16px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
                    🗓️ Gå med i kalenderjämförelsen
                </a>
            </div>
            <div style="background: #e8f4f8; padding: 20px; border-radius: 8px; margin: 25px 0;">
                <h3 style="color: #2980b9; margin: 0 0 10px 0; font-size: 18px;">Så här fungerar det:</h3>
                <ol style="color: #34495e; margin: 0; padding-left: 20px; line-height: 1.6;">
                    <li>Klicka på länken ovan</li>
                    <li>Logga in med din Google- eller Microsoft-kalender</li>
                    <li>BookR jämför era kalendrar och föreslår lediga tider</li>
                    <li>Välj en tid som passar alla!</li>
                </ol>
            </div>
            <p style="color: #7f8c8d; font-size: 14px; line-height: 1.5; margin: 25px 0 0 0;">
                Om du inte vill delta kan du bara ignorera det här meddelandet. Din kalenderinformation delas aldrig utan ditt samtycke.
            </p>
        </div>
        <div style="background: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #ecf0f1;">
            <p style="color: #95a5a6; font-size: 12px; margin: 0;">
                Det här mejlet skickades via BookR - Kalenderjämförelse<br>
                <a href="${process.env.FRONTEND_URL || 'https://www.onebookr.se'}" style="color: #3498db; text-decoration: none;">www.onebookr.se</a>
            </p>
        </div>
    </div>
</body>
</html>
`;

const createInviteEmailText = (fromName, fromEmail, groupName, inviteLink) => `
BookR - Kalenderjämförelse

Hej!

${fromName} (${fromEmail}) vill jämföra kalendrar med dig för att hitta en lämplig mötestid.

${groupName !== 'Namnlös grupp' ? `Grupp: ${groupName}` : ''}

Gå med i kalenderjämförelsen: ${inviteLink}

Så här fungerar det:
1. Klicka på länken
2. Logga in med din Google- eller Microsoft-kalender  
3. BookR jämför era kalendrar och föreslår lediga tider
4. Välj en tid som passar alla!

Din kalenderinformation delas aldrig utan ditt samtycke.

Mvh,
BookR Team
${process.env.FRONTEND_URL || 'https://www.onebookr.se'}
`;

// Email sending function
async function sendInviteEmail(toEmail, fromName, fromEmail, groupName, inviteLink) {
  try {
    console.log(`📧 Sending invite email to: ${toEmail}`);
    
    const emailData = {
      from: process.env.RESEND_FROM || 'BookR <noreply@onebookr.se>',
      to: [toEmail],
      subject: `📅 ${fromName} vill jämföra kalendrar med dig - BookR`,
      html: createInviteEmailHtml(fromName, fromEmail, groupName, inviteLink),
      text: createInviteEmailText(fromName, fromEmail, groupName, inviteLink),
      headers: {
        'X-Entity-Ref-ID': `invite-${Date.now()}`,
      },
    };

    const result = await resend.emails.send(emailData);
    console.log(`✅ Email sent successfully to ${toEmail}:`, result.id);
    return { success: true, id: result.id };
    
  } catch (error) {
    console.error(`❌ Failed to send email to ${toEmail}:`, error);
    return { success: false, error: error.message };
  }
}

// ===== CALENDAR HELPER FUNCTIONS =====

async function fetchCalendarById(token, calendarId, timeMin, timeMax) {
  const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
    `timeMin=${encodeURIComponent(timeMin)}&` +
    `timeMax=${encodeURIComponent(timeMax)}&` +
    `singleEvents=true&` +
    `orderBy=startTime&` +
    `maxResults=2500&` +
    `showDeleted=false&` +
    `showHiddenInvitations=false`;
  
  const response = await fetch(calendarUrl, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Calendar API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.items || [];
}

async function fetchUserCalendars(token) {
  try {
    const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.warn('Could not fetch calendar list, using primary only');
      return [];
    }
    
    const data = await response.json();
    return (data.items || []).filter(cal => 
      cal.accessRole && 
      ['owner', 'reader', 'writer'].includes(cal.accessRole)
    );
    
  } catch (error) {
    console.warn('Error fetching calendar list:', error.message);
    return [];
  }
}

async function fetchInvitedEvents(token, userEmail, timeMin, timeMax) {
  try {
    const searchUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(timeMin)}&` +
      `timeMax=${encodeURIComponent(timeMax)}&` +
      `q=${encodeURIComponent(userEmail)}&` +
      `singleEvents=true&` +
      `maxResults=1000`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return (data.items || []).map(event => ({ 
      ...event, 
      calendarId: 'invited',
      isInvited: true 
    }));
    
  } catch (error) {
    console.warn('Could not fetch invited events:', error.message);
    return [];
  }
}

async function fetchAllCalendarEvents(token, timeMin, timeMax, userEmail) {
  const allEvents = [];
  
  try {
    // 1. Hämta från primary calendar
    const primaryEvents = await fetchCalendarById(token, 'primary', timeMin, timeMax);
    allEvents.push(...primaryEvents.map(event => ({ ...event, calendarId: 'primary' })));
    
    // 2. Hämta från alla tillgängliga kalendrar
    const calendarList = await fetchUserCalendars(token);
    
    for (const calendar of calendarList) {
      if (calendar.id !== 'primary' && calendar.accessRole !== 'freeBusyReader') {
        try {
          const calendarEvents = await fetchCalendarById(token, calendar.id, timeMin, timeMax);
          allEvents.push(...calendarEvents.map(event => ({ 
            ...event, 
            calendarId: calendar.id
          })));
          
          console.log(`📋 Fetched ${calendarEvents.length} events from secondary calendar`);
        } catch (calError) {
          console.warn(`⚠️ Failed to fetch from secondary calendar:`, calError.message);
        }
      }
    }
    
    // 3. Hämta events som användaren är inbjuden till
    const invitedEvents = await fetchInvitedEvents(token, userEmail, timeMin, timeMax);
    allEvents.push(...invitedEvents);
    
    console.log(`📊 Total events fetched for ${userEmail}: ${allEvents.length}`);
    return allEvents;
    
  } catch (error) {
    console.error(`❌ Error fetching all calendar events for ${userEmail}:`, error);
    // Fallback: försök bara med primary calendar
    try {
      return await fetchCalendarById(token, 'primary', timeMin, timeMax);
    } catch (fallbackError) {
      console.error('❌ Fallback failed too:', fallbackError);
      return [];
    }
  }
}

function processCalendarEvents(events, userEmail, includeAll = false) {
  const busyTimes = [];
  let filteredOut = { declined: 0, transparent: 0, allDay: 0, invalid: 0, tentative: 0 };
  
  for (const event of events) {
    if (!event.start || !event.end) {
      filteredOut.invalid++;
      continue;
    }
    
    const startTime = event.start.dateTime || event.start.date;
    const endTime = event.end.dateTime || event.end.date;
    
    if (!startTime || !endTime) {
      filteredOut.invalid++;
      continue;
    }
    
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) {
      filteredOut.invalid++;
      continue;
    }
    
    const isAllDay = Boolean(event.start.date);
    const isTransparent = event.transparency === 'transparent';
    const isTentative = event.status === 'tentative';
    
    let attendeeStatus = null;
    let isDeclined = false;
    
    if (event.attendees && Array.isArray(event.attendees)) {
      const userAttendee = event.attendees.find(att => 
        att.email && att.email.toLowerCase() === userEmail.toLowerCase()
      );
      
      if (userAttendee) {
        attendeeStatus = userAttendee.responseStatus;
        isDeclined = attendeeStatus === 'declined';
      }
    }
    
    let shouldInclude = true;
    
    if (!includeAll) {
      if (isDeclined) {
        shouldInclude = false;
        filteredOut.declined++;
      } else if (isTransparent) {
        shouldInclude = false;
        filteredOut.transparent++;
      } else if (isAllDay) {
        const dayStart = new Date(startDate);
        dayStart.setHours(9, 0, 0, 0);
        const dayEnd = new Date(startDate);
        dayEnd.setHours(17, 0, 0, 0);
        
        busyTimes.push({
          start: dayStart,
          end: dayEnd,
          summary: 'Upptagen tid',
          email: userEmail,
          eventType: 'allday'
        });
        
        continue;
      }
    } else {
      if (isDeclined) {
        shouldInclude = false;
        filteredOut.declined++;
      }
    }
    
    if (shouldInclude) {
      if (isAllDay) {
        const dayStart = new Date(startDate);
        dayStart.setHours(9, 0, 0, 0);
        const dayEnd = new Date(startDate);
        dayEnd.setHours(17, 0, 0, 0);
        
        busyTimes.push({
          start: dayStart,
          end: dayEnd,
          summary: 'Upptagen tid',
          email: userEmail,
          eventType: 'allday'
        });
      } else {
        busyTimes.push({
          start: startDate,
          end: endDate,
          summary: 'Upptagen tid',
          email: userEmail,
          eventType: isTransparent ? 'transparent' : isTentative ? 'tentative' : 'confirmed'
        });
      }
    }
  }
  
  console.log(`📊 Event processing stats for ${userEmail}:`, {
    total: events.length,
    included: busyTimes.length,
    filtered: filteredOut
  });
  
  return busyTimes;
}

function findFreeTimeSlots(startDate, endDate, busyTimes, duration, dayStart = '09:00', dayEnd = '17:00') {
  const freeSlots = [];
  
  const [startHour, startMinute] = dayStart.split(':').map(Number);
  const [endHour, endMinute] = dayEnd.split(':').map(Number);
  
  // ✅ KORREKT SORTERING OCH VALIDERING AV BUSY TIMES
  const validBusyTimes = busyTimes
    .filter(busy => busy && busy.start && busy.end)
    .map(busy => {
      const start = new Date(busy.start);
      const end = new Date(busy.end);
      
      // Validera att tiderna är rimliga
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
        return null;
      }
      
      return { start, end, email: busy.email };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
  
  console.log(`📊 Processing ${validBusyTimes.length} valid busy periods for free slot detection`);
  
  // ✅ GÅNG IGENOM VARJE DAG
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    // Skippa helger
    if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }
    
    const workStart = new Date(currentDate);
    workStart.setHours(startHour, startMinute, 0, 0);
    
    const workEnd = new Date(currentDate);
    workEnd.setHours(endHour, endMinute, 0, 0);
    
    // ✅ HITTA BUSY TIMES FÖR DENNA DAG
    const dayBusyTimes = validBusyTimes.filter(busy => {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);
      
      // Event överlappar med arbetsdagen
      return busyStart < workEnd && busyEnd > workStart;
    }).map(busy => ({
      // Begränsa till arbetsdagen
      start: new Date(Math.max(busy.start, workStart)),
      end: new Date(Math.min(busy.end, workEnd))
    })).sort((a, b) => a.start - b.start);
    
    // ✅ MERGE ÖVERLAPPANDE BUSY TIMES
    const mergedBusyTimes = [];
    for (const busy of dayBusyTimes) {
      if (mergedBusyTimes.length === 0) {
        mergedBusyTimes.push(busy);
      } else {
        const last = mergedBusyTimes[mergedBusyTimes.length - 1];
        if (busy.start <= last.end) {
          // Merge overlapping periods
          last.end = new Date(Math.max(last.end, busy.end));
        } else {
          mergedBusyTimes.push(busy);
        }
      }
    }
    
    // ✅ HITTA LEDIGA SLOTS MELLAN BUSY PERIODS
    let currentTime = new Date(workStart);
    
    for (const busy of mergedBusyTimes) {
      // Kolla om det finns ledig tid innan denna busy period
      if (currentTime < busy.start) {
        const gapDuration = (busy.start - currentTime) / (1000 * 60); // minuter
        
        if (gapDuration >= duration) {
          // Skapa slots i denna gap med 30min intervall
          let slotStart = new Date(currentTime);
          
          while (slotStart.getTime() + (duration * 60 * 1000) <= busy.start.getTime()) {
            const slotEnd = new Date(slotStart.getTime() + (duration * 60 * 1000));
            
            freeSlots.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
              duration: duration,
              date: currentDate.toDateString()
            });
            
            // Nästa slot startar 30min senare
            slotStart = new Date(slotStart.getTime() + (30 * 60 * 1000));
          }
        }
      }
      
      // Flytta currentTime till slutet av busy period
      currentTime = new Date(Math.max(currentTime, busy.end));
    }
    
    // ✅ KOLLA LEDIG TID EFTER SISTA BUSY PERIOD
    if (currentTime < workEnd) {
      const gapDuration = (workEnd - currentTime) / (1000 * 60);
      
      if (gapDuration >= duration) {
        let slotStart = new Date(currentTime);
        
        while (slotStart.getTime() + (duration * 60 * 1000) <= workEnd.getTime()) {
          const slotEnd = new Date(slotStart.getTime() + (duration * 60 * 1000));
          
          freeSlots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            duration: duration,
            date: currentDate.toDateString()
          });
          
          slotStart = new Date(slotStart.getTime() + (30 * 60 * 1000));
        }
      }
    }
    
    // Nästa dag
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  console.log(`✅ Found ${freeSlots.length} free time slots where all participants are available`);
  
  return freeSlots;
}

// ===== MIDDLEWARE SETUP =====
if (process.env.NODE_ENV === 'production') {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: [
          "'self'",
          "https://accounts.google.com",
          "https://www.googleapis.com", 
          "https://login.microsoftonline.com",
          "https://graph.microsoft.com",
          "ws://localhost:*",
          "http://localhost:*"
        ],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://accounts.google.com",
          "https://apis.google.com"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com"
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com"
        ],
        imgSrc: [
          "'self'",
          "data:",
          "https:",
          "http:"
        ],
        frameSrc: [
          "'self'",
          "https://accounts.google.com",
          "https://login.microsoftonline.com"
        ]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
  }));
} else {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
}

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'https://www.onebookr.se',
  'https://onebookr.se'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`❌ CORS blocked: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-key',
  resave: false,
  saveUninitialized: false,
  name: 'bookr_session',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests' }
});
app.use(limiter);

// ===== PASSPORT CONFIGURATION =====
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const user = {
      id: profile.id,
      email: profile.emails?.[0]?.value,
      name: profile.displayName,
      provider: 'google',
      accessToken,
      refreshToken
    };
    
    console.log('✅ Google OAuth success:', user.email);
    return done(null, user);
  } catch (error) {
    console.error('❌ Google OAuth error:', error);
    return done(error, null);
  }
}));

passport.use(new MicrosoftStrategy({
  clientID: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  callbackURL: process.env.MICROSOFT_CALLBACK_URL || '/auth/microsoft/callback',
  scope: ['user.read', 'calendars.read']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const user = {
      id: profile.id,
      email: profile.emails?.[0]?.value || profile.mail,
      name: profile.displayName,
      provider: 'microsoft',
      accessToken,
      refreshToken
    };
    
    console.log('✅ Microsoft OAuth success:', user.email);
    return done(null, user);
  } catch (error) {
    console.error('❌ Microsoft OAuth error:', error);
    return done(error, null);
  }
}));

// ===== API ROUTES =====
app.get('/api/user', (req, res) => {
  if (req.user) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Google OAuth routes
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email', 'https://www.googleapis.com/auth/calendar'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=google_auth_failed' }),
  (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(frontendUrl);
  }
);

// Microsoft OAuth routes
app.get('/auth/microsoft',
  passport.authenticate('microsoft', { scope: ['user.read', 'calendars.read'] })
);

app.get('/auth/microsoft/callback',
  passport.authenticate('microsoft', { failureRedirect: '/login?error=microsoft_auth_failed' }),
  (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(frontendUrl);
  }
);

// Logout
app.get('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) console.error('Logout error:', err);
    req.session.destroy(() => {
      res.clearCookie('bookr_session');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(frontendUrl);
    });
  });
});

// Invite endpoint
app.post('/api/invite', async (req, res) => {
  try {
    console.log('📧 Invite request received:', req.body);
    
    const { emails, fromUser, fromToken, groupName, directAccessEmails } = req.body;
    
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Emails required' });
    }
    
    if (!fromUser) {
      return res.status(400).json({ error: 'From user required' });
    }

    // Validate email formats
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter(email => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      return res.status(400).json({ error: `Invalid email addresses: ${invalidEmails.join(', ')}` });
    }

    // Create group ID
    const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    // Determine sender name
    const senderName = typeof fromUser === 'string' ? fromUser.split('@')[0] : (fromUser.name || fromUser.displayName || fromUser.email || fromUser);
    const senderEmail = typeof fromUser === 'string' ? fromUser : fromUser.email;
    
    const groupNameToUse = groupName?.trim() || 'Kalenderjämförelse';
    
    // Create group in memory
    activeGroups.set(groupId, {
      id: groupId,
      name: groupNameToUse,
      creator: senderEmail,
      createdAt: new Date().toISOString(),
      members: [
        {
          email: senderEmail,
          token: fromToken,
          joinedAt: new Date().toISOString(),
          isCreator: true
        }
      ],
      invitedEmails: emails,
      status: 'active'
    });
    
    // Send emails to each recipient
    const emailResults = [];
    const inviteLinks = [];
    
    for (const email of emails) {
      const inviteLink = `${frontendUrl}/?group=${groupId}&invitee=${encodeURIComponent(email)}`;
      inviteLinks.push(inviteLink);
      
      // Send email
      const emailResult = await sendInviteEmail(
        email,
        senderName,
        senderEmail,
        groupNameToUse,
        inviteLink
      );
      
      emailResults.push({
        email,
        sent: emailResult.success,
        error: emailResult.error,
        emailId: emailResult.id
      });
    }
    
    const successfulEmails = emailResults.filter(r => r.sent);
    const failedEmails = emailResults.filter(r => !r.sent);
    
    console.log(`✅ Invites created for group: ${groupId}`);
    console.log(`📧 Emails sent: ${successfulEmails.length}/${emails.length}`);
    
    if (failedEmails.length > 0) {
      console.warn(`⚠️ Failed to send emails to: ${failedEmails.map(f => f.email).join(', ')}`);
    }

    // Store in Firebase if available
    if (db) {
      try {
        const invitationData = {
          groupId,
          fromEmail: senderEmail,
          fromName: senderName,
          groupName: groupNameToUse,
          invitedEmails: emails,
          emailResults,
          createdAt: new Date().toISOString(),
          directAccessEmails: directAccessEmails || []
        };
        
        console.log('💾 Would save to Firestore:', invitationData);
      } catch (firestoreError) {
        console.warn('⚠️ Firestore save failed:', firestoreError.message);
      }
    }
    
    res.json({
      success: true,
      groupId,
      inviteLinks,
      emailResults,
      message: successfulEmails.length === emails.length 
        ? `Alla ${emails.length} inbjudningar skickade!`
        : `${successfulEmails.length} av ${emails.length} inbjudningar skickade. ${failedEmails.length} misslyckades.`
    });
    
  } catch (error) {
    console.error('❌ Invite error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Join group endpoint
app.post('/api/group/:groupId/join', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { email, token } = req.body;
    
    console.log(`👥 Join request for group ${groupId} from ${email}`);
    
    if (!email || !token) {
      return res.status(400).json({ error: 'Email and token required' });
    }
    
    const group = activeGroups.get(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Check if user is already a member
    const existingMember = group.members.find(m => m.email.toLowerCase() === email.toLowerCase());
    if (existingMember) {
      // Update token if changed
      existingMember.token = token;
      existingMember.lastSeen = new Date().toISOString();
    } else {
      // Add as new member
      group.members.push({
        email: email.toLowerCase(),
        token,
        joinedAt: new Date().toISOString(),
        isCreator: false
      });
    }
    
    // Update group
    activeGroups.set(groupId, group);
    
    console.log(`✅ ${email} joined group ${groupId}. Total members: ${group.members.length}`);
    
    res.json({
      success: true,
      group: {
        id: group.id,
        name: group.name,
        memberCount: group.members.length,
        members: group.members.map(m => ({ 
          email: m.email, 
          joinedAt: m.joinedAt,
          isCreator: m.isCreator 
        }))
      }
    });
    
  } catch (error) {
    console.error('❌ Join group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Group status endpoint
app.get('/api/group/:groupId/status', (req, res) => {
  try {
    const { groupId } = req.params;
    const group = activeGroups.get(groupId);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json({
      id: group.id,
      name: group.name,
      creator: group.creator,
      memberCount: group.members.length,
      members: group.members.map(m => ({
        email: m.email,
        joinedAt: m.joinedAt,
        isCreator: m.isCreator
      })),
      createdAt: group.createdAt,
      status: group.status
    });
    
  } catch (error) {
    console.error('❌ Group status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Calendar comparison endpoint
app.post('/api/availability', async (req, res) => {
  try {
    const { tokens, timeMin, timeMax, duration = 60, dayStart = '09:00', dayEnd = '17:00' } = req.body;
    
    console.log('📅 Calendar comparison request:', {
      tokenCount: tokens?.length || 0,
      timeMin,
      timeMax,
      duration,
      dayStart,
      dayEnd
    });
    
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return res.status(400).json({ error: 'Tokens required' });
    }
    
    // Fetch busy times for all users
    const allBusyTimes = [];
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token) continue;
      
      try {
        console.log(`📋 Fetching calendar ${i + 1}/${tokens.length}`);
        
        const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=250`;
        
        const response = await fetch(calendarUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          const events = data.items || [];
          
          // Extract busy times
          const busyTimes = events
            .filter(event => event.start && event.end)
            .map(event => ({
              start: event.start.dateTime || event.start.date,
              end: event.end.dateTime || event.end.date,
              summary: event.summary || 'Upptagen'
            }))
            .filter(event => {
              // Filter out all-day events and invalid times
              const start = new Date(event.start);
              const end = new Date(event.end);
              return start < end && event.start.includes('T'); // Only timed events
            });
            
          allBusyTimes.push(...busyTimes);
          console.log(`✅ User ${i + 1}: Found ${busyTimes.length} busy periods`);
        } else {
          console.warn(`⚠️ Failed to fetch calendar ${i + 1}: ${response.status}`);
        }
      } catch (error) {
        console.error(`❌ Error fetching calendar ${i + 1}:`, error.message);
      }
    }
    
    console.log(`📊 Total busy periods: ${allBusyTimes.length}`);
    
    // Find free time slots
    const freeSlots = findFreeTimeSlots(
      new Date(timeMin),
      new Date(timeMax),
      allBusyTimes,
      parseInt(duration),
      dayStart,
      dayEnd
    );
    
    console.log(`✅ Found ${freeSlots.length} common free slots`);
    
    res.json(freeSlots);
    
  } catch (error) {
    console.error('❌ Availability error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Group availability endpoint
app.get('/api/group/:groupId/availability', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { timeMin, timeMax, duration = 60, dayStart = '09:00', dayEnd = '17:00', includeAll = 'false' } = req.query;
    
    console.log(`📅 Group availability request for: ${groupId}`);
    
    const group = activeGroups.get(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    const memberTokens = group.members
      .filter(member => member.token)
      .map(member => ({ email: member.email, token: member.token }));
    
    console.log(`📋 Found ${memberTokens.length} member tokens in group ${groupId}`);
    
    if (memberTokens.length < 2) {
      console.warn(`⚠️ Group ${groupId} only has ${memberTokens.length} members with tokens`);
      return res.json([]);
    }
    
    const allMemberBusyTimes = [];
    
    for (let i = 0; i < memberTokens.length; i++) {
      const { email, token } = memberTokens[i];
      
      try {
        console.log(`📋 Fetching comprehensive calendar data ${i + 1}/${memberTokens.length} for ${email}`);
        
        const calendarEvents = await fetchAllCalendarEvents(token, timeMin, timeMax, email);
        console.log(`📊 Member ${email}: Total events found: ${calendarEvents.length}`);
        
        const busyTimes = processCalendarEvents(calendarEvents, email, includeAll === 'true');
        console.log(`✅ Member ${email}: ${busyTimes.length} busy periods after processing`);
        
        if (busyTimes.length > 0) {
          console.log(`📝 Example busy time for ${email}:`, {
            start: busyTimes[0].start.toISOString(),
            end: busyTimes[0].end.toISOString(),
            type: busyTimes[0].eventType || 'standard'
          });
        }
        
        allMemberBusyTimes.push(...busyTimes);
      } catch (error) {
        console.error(`❌ Error fetching calendar for ${email}:`, error.message);
      }
    }
    
    console.log(`📊 Total busy periods across all members: ${allMemberBusyTimes.length}`);
    
    const freeSlots = findFreeTimeSlots(
      new Date(timeMin),
      new Date(timeMax),
      allMemberBusyTimes,
      parseInt(duration),
      dayStart,
      dayEnd
    );
    
    console.log(`✅ Generated ${freeSlots.length} free slots for group ${groupId}`);
    
    res.json(freeSlots);
    
  } catch (error) {
    console.error('❌ Group availability error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Debug endpoint for development
app.get('/api/group/:groupId/debug-events', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { timeMin, timeMax } = req.query;
    
    const group = activeGroups.get(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    const memberTokens = group.members
      .filter(member => member.token)
      .map(member => ({ email: member.email, token: member.token }));
    
    const debugData = [];
    
    for (const { email, token } of memberTokens) {
      try {
        const allEvents = await fetchAllCalendarEvents(token, timeMin, timeMax, email);
        const processedEvents = processCalendarEvents(allEvents, email, true);
        
        debugData.push({
          email,
          totalEvents: allEvents.length,
          processedEvents: processedEvents.length,
          eventTimes: allEvents.map(event => ({
            start: event.start,
            end: event.end,
            status: event.status,
            transparency: event.transparency,
            isAllDay: Boolean(event.start.date)
          }))
        });
      } catch (error) {
        debugData.push({
          email,
          error: error.message
        });
      }
    }
    
    res.json({ debugData });
    
  } catch (error) {
    console.error('❌ Debug events error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ SUGGESTIONS ENDPOINTS
app.get('/api/group/:groupId/suggestions', async (req, res) => {
  try {
    const { groupId } = req.params;
    
    // För nu, returnera tom array - kan implementeras senare med Firestore
    res.json({ suggestions: [] });
    
  } catch (error) {
    console.error('❌ Get suggestions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/group/:groupId/suggest', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { start, end, email, title, withMeet, location } = req.body;
    
    console.log(`📝 New meeting suggestion for group ${groupId}:`, { start, end, title, email });
    
    // För nu, bara returnera success - kan implementeras senare med Firestore
    res.json({ 
      success: true, 
      message: 'Suggestion received',
      suggestionId: `suggestion_${Date.now()}`
    });
    
  } catch (error) {
    console.error('❌ Create suggestion error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/group/:groupId/suggestion/:suggestionId/vote', async (req, res) => {
  try {
    const { groupId, suggestionId } = req.params;
    const { email, vote } = req.body;
    
    console.log(`🗳️ Vote on suggestion ${suggestionId}:`, { email, vote });
    
    // För nu, bara returnera success
    res.json({ success: true, message: 'Vote recorded' });
    
  } catch (error) {
    console.error('❌ Vote suggestion error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// ===== START SERVER =====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BookR server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`🔑 Google OAuth: ${process.env.CLIENT_ID ? 'configured' : 'missing'}`);
  console.log(`🔑 Microsoft OAuth: ${process.env.MICROSOFT_CLIENT_ID ? 'configured' : 'missing'}`);
  console.log(`📧 Email (Resend): ${process.env.RESEND_API_KEY ? 'configured' : 'missing'}`);
});
