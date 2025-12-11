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
import { 
  addToWaitlist, createGroup, createInvitation, createUser, updateUserLastLogin,
  logDataAccess, createBookingSession, updateBookingSession
} from './firestore.js';
import { gdprLog, anonymizeEmail, sanitizeCalendarEvent, cleanupExpiredGroups, containsSensitiveInfo, encryptEmail, decryptEmail, createGDPRExport, handleFirebaseError } from './gdpr-utils.js';
import 'dotenv/config';

// ===== APPLICATION SETUP =====
const app = express();
const PORT = process.env.PORT || 3000;

// ===== EXTERNAL SERVICES =====
const resend = new Resend(process.env.RESEND_API_KEY);
let db;

try {
  db = await initializeFirebase();
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization failed:', error.message);
  console.warn('⚠️ Continuing without Firebase...');
}

// ===== IN-MEMORY STORAGE =====
const activeGroups = new Map();

// ===== ENVIRONMENT-SPECIFIC CONFIGURATION =====
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_LOCALHOST = !IS_PRODUCTION;

const CONFIG = {
  session: {
    secret: process.env.SESSION_SECRET || 'dev-secret-key-change-in-production',
    name: 'bookr_session',
    maxAge: 24 * 60 * 60 * 1000,
  },
  cors: {
    allowedOrigins: IS_LOCALHOST ? [
      'http://localhost:5173',
      'http://localhost:3000', 
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000'
    ] : [
      'https://www.onebookr.se',
      'https://onebookr.se',
      'https://api.onebookr.se'
    ]
  },
  urls: {
    frontend: IS_LOCALHOST ? 'http://localhost:5173' : 'https://www.onebookr.se',
    backend: IS_LOCALHOST ? 'http://localhost:3000' : 'https://www.onebookr.se'
  },
  calendar: {
    maxEvents: 2500,
    defaultWorkStart: '09:00',
    defaultWorkEnd: '17:00',
    slotInterval: 30,
    maxDaysRange: 30
  },
  email: {
    from: process.env.RESEND_FROM || 'BookR <noreply@onebookr.se>',
    maxRecipients: 50
  }
};

console.log(`🔧 Environment: ${IS_PRODUCTION ? 'PRODUCTION' : 'LOCALHOST'}`);
console.log(`🌐 Frontend URL: ${CONFIG.urls.frontend}`);
console.log(`🔗 Backend URL: ${CONFIG.urls.backend}`);

// ===== ERROR HANDLING =====
class BookRError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date().toISOString();
  }
}

// ===== VALIDATION HELPERS =====
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// ✅ VALIDERA ANVÄNDARTOKEN
async function validateUserToken(user) {
  if (!user || !user.accessToken) {
    return false;
  }

  try {
    // ✅ TESTA TOKEN MOT RÄTT API BASERAT PÅ PROVIDER
    if (user.provider === 'microsoft') {
      const response = await fetchWithRetry('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${user.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      return response.ok;
    } else {
      // Google (default)
      const response = await fetchWithRetry('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${user.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      return response.ok;
    }
  } catch (error) {
    console.warn(`⚠️ Token validation failed for ${anonymizeEmail(user.email)}:`, error.message);
    return false;
  }
}

const validateDateRange = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const maxRange = CONFIG.calendar.maxDaysRange * 24 * 60 * 60 * 1000;

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new BookRError('Invalid date format', 400, 'INVALID_DATE');
  }

  if (start >= end) {
    throw new BookRError('Start date must be before end date', 400, 'INVALID_DATE_RANGE');
  }

  if (end - start > maxRange) {
    throw new BookRError(`Date range cannot exceed ${CONFIG.calendar.maxDaysRange} days`, 400, 'DATE_RANGE_TOO_LARGE');
  }

  return { start, end };
};

// ===== EMAIL TEMPLATES - UPPDATERA LÄNKAR =====
const createInviteEmailHtml = (fromName, fromEmail, groupName, inviteLink) => {
  const safeName = String(fromName || 'Unknown').replace(/[<>]/g, '');
  const safeEmail = String(fromEmail || 'unknown@email.com').replace(/[<>]/g, '');
  const safeGroupName = String(groupName || 'Namnlös grupp').replace(/[<>]/g, '');

  return `<!DOCTYPE html>
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
            <h2 style="color: #2c3e50; margin: 0 0 20px 0; font-size: 24px; font-weight: 400;">Du har blivit inbjuden!</h2>
            <p style="color: #34495e; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
                <strong>${safeName}</strong> (${safeEmail}) vill jämföra kalendrar med dig för att hitta en lämplig mötestid.
            </p>
            ${safeGroupName !== 'Namnlös grupp' ? `<div style="background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #3498db; margin: 20px 0;"><p style="margin: 0; color: #2c3e50; font-weight: 500;">Grupp: ${safeGroupName}</p></div>` : ''}
            <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: 500; font-size: 16px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">🗓️ Gå med i kalenderjämförelsen</a>
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
                <a href="https://www.onebookr.se" style="color: #3498db; text-decoration: none;">www.onebookr.se</a>
            </p>
        </div>
    </div>
</body>
</html>`;
};

const createInviteEmailText = (fromName, fromEmail, groupName, inviteLink) => {
  const safeName = String(fromName || 'Unknown');
  const safeEmail = String(fromEmail || 'unknown@email.com');
  const safeGroupName = String(groupName || 'Namnlös grupp');

  return `BookR - Kalenderjämförelse

Hej!

${safeName} (${safeEmail}) vill jämföra kalendrar med dig för att hitta en lämplig mötestid.

${safeGroupName !== 'Namnlös grupp' ? `Grupp: ${safeGroupName}` : ''}

Gå med i kalenderjämförelsen: ${inviteLink}

Så här fungerar det:
1. Klicka på länken
2. Logga in med din Google- eller Microsoft-kalender  
3. BookR jämför era kalendrar och föreslår lediga tider
4. Välj en tid som passar alla!

Din kalenderinformation delas aldrig utan ditt samtycke.

Mvh,
BookR Team
https://www.onebookr.se`;
};

// ===== EMAIL SERVICE =====
async function sendInviteEmail(toEmail, fromName, fromEmail, groupName, inviteLink) {
  try {
    if (!validateEmail(toEmail)) {
      throw new BookRError('Invalid recipient email address', 400, 'INVALID_EMAIL');
    }

    // ✅ VALIDERA RESEND API KEY
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY is missing from environment variables');
      return { success: false, error: 'Email service not configured' };
    }

    console.log(`📧 Sending invite email to: ${toEmail}`);
    console.log(`🔧 Using Resend API Key: ${process.env.RESEND_API_KEY.substring(0, 8)}...`);

    const emailData = {
      from: CONFIG.email.from,
      to: [toEmail],
      subject: `📅 ${fromName} vill jämföra kalendrar med dig - BookR`,
      html: createInviteEmailHtml(fromName, fromEmail, groupName, inviteLink),
      text: createInviteEmailText(fromName, fromEmail, groupName, inviteLink),
      headers: {
        'X-Entity-Ref-ID': `invite-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      },
    };

    console.log('📤 Email payload:', {
      from: emailData.from,
      to: emailData.to,
      subject: emailData.subject,
      hasHtml: Boolean(emailData.html),
      hasText: Boolean(emailData.text)
    });

    const result = await resend.emails.send(emailData);
    
    console.log('📧 Resend API Response:', result);

    // ✅ FÖRBÄTTRAD ERROR HANDLING
    if (!result) {
      throw new Error('No response from Resend API');
    }

    if (result.error) {
      throw new Error(`Resend API error: ${result.error.message || JSON.stringify(result.error)}`);
    }

    if (!result.data && !result.id) {
      throw new Error('Invalid response format from Resend API');
    }

    const emailId = result.data?.id || result.id;
    console.log(`✅ Email sent successfully to ${toEmail}:`, emailId);
    return { success: true, id: emailId };

  } catch (error) {
    console.error(`❌ Failed to send email to ${toEmail}:`, error);
    console.error('❌ Full error details:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data || 'No response data'
    });
    return { success: false, error: error.message };
  }
}

// ===== CALENDAR API HELPERS =====
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      if (response.status === 429) {
        const waitTime = Math.pow(2, i) * 1000;
        console.warn(`⚠️ Rate limited, waiting ${waitTime}ms before retry ${i + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      throw new BookRError(`HTTP ${response.status}: ${response.statusText}`, response.status, 'API_ERROR');
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.warn(`⚠️ Fetch attempt ${i + 1} failed:`, error.message);
    }
  }
}

async function fetchCalendarById(token, calendarId, timeMin, timeMax) {
  const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
    `timeMin=${encodeURIComponent(timeMin)}&` +
    `timeMax=${encodeURIComponent(timeMax)}&` +
    `singleEvents=true&orderBy=startTime&maxResults=${CONFIG.calendar.maxEvents}&` +
    `showDeleted=false&showHiddenInvitations=false&` +
    // ✅ GDPR-SÄKER: Hämta alla events men endast basic info
    `fields=items(start,end,status,transparency,attendees/email,attendees/responseStatus)`;

  const response = await fetchWithRetry(calendarUrl, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();
  return data.items || [];
}

async function fetchUserCalendars(token) {
  try {
    // ✅ HÄMTA ALLA KALENDRAR INKLUSIVE KATEGORIER
    const response = await fetchWithRetry('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&minAccessRole=reader', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    // ✅ GDPR-SÄKER: Filtrera ut alla kalendrar men ta bort känslig info
    return (data.items || [])
      .filter(cal => cal.accessRole && ['owner', 'reader', 'writer'].includes(cal.accessRole))
      .map(cal => ({
        id: cal.id,
        accessRole: cal.accessRole,
        // ✅ TA BORT summary (namn) och andra identifierande egenskaper för GDPR
        selected: cal.selected !== false // Default true om inte explicit false
      }));
  } catch (error) {
    console.warn('⚠️ Could not fetch calendar list:', error.message);
    return [];
  }
}

async function fetchAllCalendarEvents(token, timeMin, timeMax, userEmail, provider = 'google') {
  const allEvents = [];

  try {
    if (!token || !userEmail) {
      throw new BookRError('Missing token or email', 400, 'MISSING_PARAMETERS');
    }

    console.log(`📅 Fetching ALL calendar categories for ${userEmail} (${provider})`);

    if (provider === 'microsoft') {
      return await fetchMicrosoftCalendarEvents(token, timeMin, timeMax, userEmail);
    }

    // ✅ GOOGLE CALENDAR LOGIC
    // ✅ HÄMTA FRÅN PRIMARY KALENDER FÖRST
    const primaryEvents = await fetchCalendarById(token, 'primary', timeMin, timeMax);
    allEvents.push(...primaryEvents.map(event => ({ ...event, calendarId: 'primary' })));
    console.log(`   📋 Primary calendar: ${primaryEvents.length} events`);

    // ✅ HÄMTA ALLA ANDRA KALENDRAR (KATEGORIER, WORK, PERSONAL, ETC.)
    const calendarList = await fetchUserCalendars(token);
    console.log(`   📂 Found ${calendarList.length} additional calendars/categories`);

    const calendarPromises = calendarList
      .filter(calendar => calendar.id !== 'primary' && calendar.accessRole !== 'freeBusyReader')
      .map(async (calendar, index) => {
        try {
          console.log(`   📋 Fetching calendar ${index + 1}/${calendarList.length} (${calendar.accessRole})`);
          const calendarEvents = await fetchCalendarById(token, calendar.id, timeMin, timeMax);
          
          // ✅ GDPR-SÄKER: Anonymisera kalender-ID
          return calendarEvents.map(event => ({ 
            ...event, 
            calendarId: `calendar_${index + 1}` // Anonymt ID
          }));
        } catch (error) {
          console.warn(`⚠️ Failed to fetch from calendar ${index + 1}:`, error.message);
          return [];
        }
      });

    const secondaryResults = await Promise.allSettled(calendarPromises);
    let secondaryEventCount = 0;
    
    secondaryResults.forEach(result => {
      if (result.status === 'fulfilled') {
        allEvents.push(...result.value);
        secondaryEventCount += result.value.length;
      }
    });

    console.log(`   📋 Secondary calendars: ${secondaryEventCount} events`);

    // ✅ HÄMTA INBJUDNA EVENTS (från andra användare)
    const invitedEvents = await fetchInvitedEvents(token, userEmail, timeMin, timeMax);
    allEvents.push(...invitedEvents);
    console.log(`   📋 Invited events: ${invitedEvents.length} events`);

    console.log(`📊 TOTAL events fetched for ${userEmail}: ${allEvents.length} events from ALL categories`);
    return allEvents;
  } catch (error) {
    console.error(`❌ Error fetching calendar events for ${userEmail}:`, error.message);
    throw new BookRError(`Failed to fetch calendar events: ${error.message}`, 500, 'CALENDAR_FETCH_ERROR');
  }
}

// ===== CALENDAR EVENT PROCESSING - GDPR-SÄKER =====
function processCalendarEvents(events, userEmail, includeAll = false) {
  const busyTimes = [];
  let filteredOut = { declined: 0, transparent: 0, allDay: 0, invalid: 0, tentative: 0 };

  if (!Array.isArray(events)) {
    gdprLog('Events validation failed', { type: typeof events });
    return busyTimes;
  }

  gdprLog('Processing calendar events', { 
    eventCount: events.length, 
    userEmail: anonymizeEmail(userEmail),
    includeAll 
  });

  for (const event of events) {
    // ✅ ANVÄND GDPR-SÄKER SANITISERING
    const sanitizedEvent = sanitizeCalendarEvent(event, userEmail);
    if (!sanitizedEvent) {
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

    // ✅ KOLLA ALLA EVENT-EGENSKAPER UTAN ATT EXPONERA KÄNSLIG INFO
    const isAllDay = Boolean(event.start.date);
    const isTransparent = event.transparency === 'transparent';
    const isTentative = event.status === 'tentative';
    const isCancelled = event.status === 'cancelled';

    // ✅ KOLLA OM ANVÄNDAREN HAR DECLINED
    let isDeclined = false;
    if (event.attendees && Array.isArray(event.attendees)) {
      const userAttendee = event.attendees.find(att =>
        att.email && att.email.toLowerCase() === userEmail.toLowerCase()
      );
      if (userAttendee && userAttendee.responseStatus === 'declined') {
        isDeclined = true;
      }
    }

    // ✅ BESTÄM OM EVENT SKA INKLUDERAS
    let shouldInclude = true;

    // ✅ SKIPPA CANCELLED EVENTS ALLTID
    if (isCancelled) {
      shouldInclude = false;
      filteredOut.invalid++;
    }
    // ✅ FÖLJ includeAll LOGIK
    else if (!includeAll) {
      if (isDeclined) {
        shouldInclude = false;
        filteredOut.declined++;
      } else if (isTransparent) {
        shouldInclude = false;
        filteredOut.transparent++;
      } else if (isTentative) {
        // ✅ TENTATIVE EVENTS KAN VARA VIKTIGA - INKLUDERA SOM DEFAULT
        shouldInclude = true;
        filteredOut.tentative++;
      }
    } else {
      // includeAll = true, men skippa declined ändå
      if (isDeclined) {
        shouldInclude = false;
        filteredOut.declined++;
      }
    }

    if (shouldInclude) {
      if (isAllDay) {
        // ✅ HELDAGSEVENT = UPPTAGEN HELA ARBETSDAGEN
        const dayStart = new Date(startDate);
        dayStart.setHours(9, 0, 0, 0);
        const dayEnd = new Date(startDate);
        dayEnd.setHours(17, 0, 0, 0);

        busyTimes.push({
          start: dayStart,
          end: dayEnd,
          // ✅ GDPR-SÄKER: Ingen känslig info
          summary: 'Upptagen tid',
          email: anonymizeEmail(userEmail), // Anonymiserad email
          eventType: 'allday'
        });
        filteredOut.allDay++;
      } else {
        // ✅ VANLIGT TIMED EVENT
        busyTimes.push({
          start: startDate,
          end: endDate,
          // ✅ GDPR-SÄKER: Ingen titel eller beskrivning
          summary: 'Upptagen tid',
          email: anonymizeEmail(userEmail), // Anonymiserad email
          eventType: isTransparent ? 'transparent' : isTentative ? 'tentative' : 'confirmed'
        });
      }
    }
  }

  gdprLog('Event processing completed', {
    userEmail: anonymizeEmail(userEmail),
    totalEvents: events.length,
    includedEvents: busyTimes.length,
    filtered: filteredOut
  });

  return busyTimes;
}

// ✅ MICROSOFT CALENDAR EVENTS FETCHER
async function fetchMicrosoftCalendarEvents(token, timeMin, timeMax, userEmail) {
  try {
    const startTime = new Date(timeMin).toISOString();
    const endTime = new Date(timeMax).toISOString();
    
    const eventsUrl = `https://graph.microsoft.com/v1.0/me/events?` +
      `$filter=start/dateTime ge '${startTime}' and end/dateTime le '${endTime}'&` +
      `$select=subject,start,end,showAs,responseStatus,isAllDay,isCancelled,attendees&` +
      `$orderby=start/dateTime&$top=2500`;

    const response = await fetchWithRetry(eventsUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Microsoft Graph API error: ${response.status}`);
    }

    const data = await response.json();
    const events = data.value || [];
    
    // ✅ KONVERTERA MICROSOFT FORMAT TILL GOOGLE FORMAT
    const convertedEvents = events.map(event => ({
      start: {
        dateTime: event.isAllDay ? null : event.start.dateTime,
        date: event.isAllDay ? event.start.dateTime.split('T')[0] : null,
        timeZone: event.start.timeZone
      },
      end: {
        dateTime: event.isAllDay ? null : event.end.dateTime,
        date: event.isAllDay ? event.end.dateTime.split('T')[0] : null,
        timeZone: event.end.timeZone
      },
      status: event.isCancelled ? 'cancelled' : 'confirmed',
      transparency: event.showAs === 'free' ? 'transparent' : 'opaque',
      attendees: event.attendees ? event.attendees.map(att => ({
        email: att.emailAddress?.address,
        responseStatus: att.status?.response === 'accepted' ? 'accepted' : 
                       att.status?.response === 'declined' ? 'declined' : 'needsAction'
      })) : [],
      calendarId: 'microsoft_primary',
      provider: 'microsoft'
    }));

    console.log(`📊 TOTAL Microsoft events fetched for ${userEmail}: ${convertedEvents.length} events`);
    return convertedEvents;
  } catch (error) {
    console.error(`❌ Error fetching Microsoft calendar events for ${userEmail}:`, error.message);
    return [];
  }
}

// ===== FETCH INVITED EVENTS - HÄMTA INBJUDNA EVENTS FRÅN PRIMÄRA KALENDERN =====
async function fetchInvitedEvents(token, userEmail, timeMin, timeMax) {
  try {
    const searchUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&` +
      `singleEvents=true&maxResults=1000`;

    const response = await fetchWithRetry(searchUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    return (data.items || []).map(event => ({ ...event, calendarId: 'invited', isInvited: true }));
  } catch (error) {
    console.warn('⚠️ Could not fetch invited events:', error.message);
    return [];
  }
}

// ===== FREE SLOT DETECTION - KORREKT KONTROLL AV ALLA DELTAGARE =====
function findFreeTimeSlots(startDate, endDate, busyTimes, duration, dayStart = '09:00', dayEnd = '17:00') {
  const freeSlots = [];
  
  try {
    const [startHour, startMinute] = dayStart.split(':').map(Number);
    const [endHour, endMinute] = dayEnd.split(':').map(Number);

    if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute)) {
      throw new BookRError('Invalid work hours format', 400, 'INVALID_WORK_HOURS');
    }

    // ✅ GRUPPERA BUSY TIMES PER PERSON
    const busyTimesByPerson = {};
    const personEmails = new Set();
    
    busyTimes.forEach(busy => {
      if (busy && busy.email && busy.start && busy.end) {
        if (!busyTimesByPerson[busy.email]) {
          busyTimesByPerson[busy.email] = [];
        }
        busyTimesByPerson[busy.email].push({
          start: new Date(busy.start),
          end: new Date(busy.end)
        });
        personEmails.add(busy.email);
      }
    });

    const participants = Array.from(personEmails);
    console.log(`🔍 Analyzing free times for participants: ${participants.join(', ')}`);
    console.log(`📊 Busy periods per person:`, participants.map(email => 
      `${email}: ${busyTimesByPerson[email]?.length || 0} periods`
    ).join(', '));

    // ✅ SORTERA OCH MERGE BUSY TIMES FÖR VARJE PERSON SEPARAT
    Object.keys(busyTimesByPerson).forEach(email => {
      busyTimesByPerson[email].sort((a, b) => a.start - b.start);
      
      const merged = [];
      for (const busy of busyTimesByPerson[email]) {
        if (merged.length === 0 || busy.start > merged[merged.length - 1].end) {
          merged.push(busy);
        } else {
          merged[merged.length - 1].end = new Date(Math.max(merged[merged.length - 1].end, busy.end));
        }
      }
      busyTimesByPerson[email] = merged;
      
      console.log(`   📋 ${email}: ${merged.length} merged busy periods`);
    });

    const durationMs = duration * 60 * 1000;
    const currentDate = new Date(startDate);

    // ✅ GÅ IGENOM VARJE DAG
    while (currentDate <= endDate) {
      if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      const workStart = new Date(currentDate);
      workStart.setHours(startHour, startMinute, 0, 0);
      
      const workEnd = new Date(currentDate);
      workEnd.setHours(endHour, endMinute, 0, 0);

      console.log(`\n📅 Analyzing ${currentDate.toLocaleDateString('sv-SE')}`);

      // ✅ HITTA ALLA MÖJLIGA SLOTS FÖR DAGEN
      const allPossibleSlots = [];
      let slotTime = new Date(workStart);
      
      while (slotTime.getTime() + durationMs <= workEnd.getTime()) {
        allPossibleSlots.push({
          start: new Date(slotTime),
          end: new Date(slotTime.getTime() + durationMs)
        });
        
        // Nästa slot börjar när denna slutar (konsekutiva slots)
        slotTime = new Date(slotTime.getTime() + durationMs);
      }

      console.log(`   🕐 Generated ${allPossibleSlots.length} potential ${duration}-minute slots`);

      // ✅ KONTROLLERA VARJE SLOT MOT ALLA DELTAGARE
      for (const slot of allPossibleSlots) {
        let isSlotFreeForAll = true;
        const conflicts = [];

        // Kontrollera mot VARJE persons busy times
        for (const email of participants) {
          const personBusyTimes = busyTimesByPerson[email] || [];
          
          // Kolla om denna slot överlappar med någon av denna persons busy times
          const hasConflict = personBusyTimes.some(busy => {
            // Kontrollera om slot överlappar med busy time
            const slotStart = slot.start.getTime();
            const slotEnd = slot.end.getTime();
            const busyStart = busy.start.getTime();
            const busyEnd = busy.end.getTime();
            
            // Kollision om slot startar innan busy slutar OCH slot slutar efter busy startar
            const overlaps = slotStart < busyEnd && slotEnd > busyStart;
            
            if (overlaps) {
              conflicts.push(`${email}: ${busy.start.toLocaleTimeString('sv-SE')} - ${busy.end.toLocaleTimeString('sv-SE')}`);
            }
            
            return overlaps;
          });

          if (hasConflict) {
            isSlotFreeForAll = false;
            break; // Ingen anledning att kontrollera fler om en redan har konflikt
          }
        }

        // ✅ OM SLOT ÄR LEDIG FÖR ALLA - LÄGG TILL
        if (isSlotFreeForAll) {
          freeSlots.push({
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
            duration: duration,
            date: currentDate.toDateString()
          });
          
          console.log(`   ✅ Free slot: ${slot.start.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} - ${slot.end.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} (ALL ${participants.length} participants available)`);
        } else if (conflicts.length > 0) {
          console.log(`   ❌ Blocked slot: ${slot.start.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} - ${slot.end.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} - Conflicts: ${conflicts.slice(0, 2).join(', ')}${conflicts.length > 2 ? '...' : ''}`);
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // ✅ SORTERA EFTER TID
    freeSlots.sort((a, b) => new Date(a.start) - new Date(b.start));

    console.log(`\n✅ FINAL RESULT: Found ${freeSlots.length} consecutive free slots where ALL ${participants.length} participants are available`);
    console.log(`📈 Summary:`);
    console.log(`   Participants: ${participants.join(', ')}`);
    console.log(`   Duration: ${duration} minutes per slot`);
    console.log(`   Date range: ${new Date(startDate).toLocaleDateString('sv-SE')} - ${new Date(endDate).toLocaleDateString('sv-SE')}`);
    console.log(`   Work hours: ${dayStart} - ${dayEnd}`);
    console.log(`   Total busy periods: ${busyTimes.length}`);
    console.log(`   Free slots found: ${freeSlots.length}`);
    
    return freeSlots;
    
  } catch (error) {
    console.error('❌ Error finding free time slots:', error.message);
    throw new BookRError(`Failed to find free slots: ${error.message}`, 500, 'SLOT_CALCULATION_ERROR');
  }
}

// ===== MIDDLEWARE SETUP =====
if (process.env.NODE_ENV === 'production') {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "https://accounts.google.com", "https://www.googleapis.com", "https://login.microsoftonline.com", "https://graph.microsoft.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://accounts.google.com", "https://apis.google.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "http:"],
        frameSrc: ["'self'", "https://accounts.google.com", "https://login.microsoftonline.com"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
  }));
} else {
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (CONFIG.cors.allowedOrigins.includes(origin)) {
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

// ✅ TRUST PROXY FOR RAILWAY
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: CONFIG.session.secret,
  resave: false,
  saveUninitialized: false,
  name: CONFIG.session.name,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: CONFIG.session.maxAge,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// ===== PASSPORT CONFIGURATION - UPPDATERA CALLBACK URLs =====
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// ✅ ENDAST EN GOOGLE STRATEGY
passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || (
    process.env.NODE_ENV === 'production' 
      ? 'https://www.onebookr.se/auth/google/callback'
      : '/auth/google/callback'
  )
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

    // ✅ FIREBASE: LOGGA ANVÄNDARE
    if (db && user.email) {
      try {
        await createUser(user.email, 'google');
        await updateUserLastLogin(user.email);
        
        gdprLog('Firebase: User logged in', { 
          email: anonymizeEmail(user.email),
          provider: 'google'
        });
      } catch (firebaseError) {
        const handled = handleFirebaseError(firebaseError);
        if (handled.shouldContinue) {
          console.warn('⚠️ Firebase user logging failed but continuing:', handled.message);
        } else {
          console.error('❌ Firebase user logging failed:', firebaseError);
        }
      }
    }

    gdprLog('Google OAuth success', { email: anonymizeEmail(user.email) });
    return done(null, user);
  } catch (error) {
    console.error('❌ Google OAuth error:', error);
    return done(error, null);
  }
}));

// ✅ ENDAST EN MICROSOFT STRATEGY
passport.use(new MicrosoftStrategy({
  clientID: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  callbackURL: process.env.MICROSOFT_CALLBACK_URL || (
    process.env.NODE_ENV === 'production'
      ? 'https://www.onebookr.se/auth/microsoft/callback'
      : '/auth/microsoft/callback'
  ),
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

    // ✅ FIREBASE: LOGGA ANVÄNDARE
    if (db && user.email) {
      try {
        await createUser(user.email, 'microsoft');
        await updateUserLastLogin(user.email);
        
        gdprLog('Firebase: User logged in', { 
          email: anonymizeEmail(user.email),
          provider: 'microsoft'
        });
      } catch (firebaseError) {
        const handled = handleFirebaseError(firebaseError);
        if (handled.shouldContinue) {
          console.warn('⚠️ Firebase user logging failed but continuing:', handled.message);
        } else {
          console.error('❌ Firebase user logging failed:', firebaseError);
        }
      }
    }

    gdprLog('Microsoft OAuth success', { email: anonymizeEmail(user.email) });
    return done(null, user);
  } catch (error) {
    console.error('❌ Microsoft OAuth error:', error);
    return done(error, null);
  }
}));

// ===== ROUTE MIDDLEWARE =====
const validateGroup = (req, res, next) => {
  const { groupId } = req.params;
  if (!groupId || !activeGroups.has(groupId)) {
    return res.status(404).json({ error: 'Group not found', code: 'GROUP_NOT_FOUND' });
  }
  req.group = activeGroups.get(groupId);
  next();
};

const validateAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }
  next();
};

// ===== API ROUTES =====

app.get('/api/user', async (req, res) => {
  if (req.user) {
    // ✅ VALIDERA TOKEN INNAN VI RETURNERAR USER
    const isValidToken = await validateUserToken(req.user);
    
    if (!isValidToken) {
      console.log(`❌ Invalid token for user ${anonymizeEmail(req.user.email)}, forcing re-authentication`);
      
      // ✅ RENSA SESSION OCH TVINGA OMAUTENTISERING
      req.logout((err) => {
        if (err) console.error('❌ Logout error:', err);
        req.session.destroy(() => {
          res.clearCookie(CONFIG.session.name);
          res.status(401).json({ 
            error: 'Token expired', 
            code: 'TOKEN_EXPIRED',
            requiresReauth: true 
          });
        });
      });
      return;
    }
    
    res.json({ user: req.user });
  } else {
    res.status(401).json({ error: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
  }
});

app.get('/auth/google', (req, res, next) => {
  try {
    passport.authenticate('google', { scope: ['profile', 'email', 'https://www.googleapis.com/auth/calendar'] })(req, res, next);
  } catch (error) {
    console.error('❌ Google auth init error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'https://www.onebookr.se'}?error=auth_init_failed`);
  }
});

app.get('/auth/google/callback',
  passport.authenticate('google', { 
    failureRedirect: `${process.env.FRONTEND_URL || 'https://www.onebookr.se'}?error=google_auth_failed` 
  }),
  (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || 'https://www.onebookr.se';
    res.redirect(frontendUrl);
  }
);

app.get('/auth/microsoft', (req, res, next) => {
  try {
    passport.authenticate('microsoft', { scope: ['user.read', 'calendars.read'] })(req, res, next);
  } catch (error) {
    console.error('❌ Microsoft auth init error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'https://www.onebookr.se'}?error=auth_init_failed`);
  }
});

app.get('/auth/microsoft/callback',
  passport.authenticate('microsoft', { 
    failureRedirect: `${process.env.FRONTEND_URL || 'https://www.onebookr.se'}?error=microsoft_auth_failed` 
  }),
  (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || 'https://www.onebookr.se';
    res.redirect(frontendUrl);
  }
);

app.get('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) console.error('❌ Logout error:', err);
    req.session.destroy(() => {
      res.clearCookie(CONFIG.session.name);
      const frontendUrl = process.env.FRONTEND_URL || 'https://www.onebookr.se';
      res.redirect(frontendUrl);
    });
  });
});

// ===== FIREBASE LOGGING MIDDLEWARE =====
app.use(async (req, res, next) => {
  // ✅ LOGGA ALLA API-ANROP TILL FIREBASE
  if (db && req.path.startsWith('/api/')) {
    try {
      await logDataAccess(
        'api_request',
        req.user?.email || 'anonymous',
        null,
        req.path
      );
    } catch (error) {
      console.warn('⚠️ Firebase logging failed:', error.message);
    }
  }
  next();
});

// ✅ UPPDATERA GOOGLE OAUTH MED FIREBASE LOGGING
passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || (
    process.env.NODE_ENV === 'production' 
      ? 'https://www.onebookr.se/auth/google/callback'
      : '/auth/google/callback'
  )
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

    // ✅ FIREBASE: LOGGA ANVÄNDARE
    if (db && user.email) {
      try {
        // Skapa/uppdatera användare i Firestore
        await createUser(user.email, 'google');
        await updateUserLastLogin(user.email);
        
        gdprLog('Firebase: User logged in', { 
          email: anonymizeEmail(user.email),
          provider: 'google'
        });
      } catch (firebaseError) {
        const handled = handleFirebaseError(firebaseError);
        if (handled.shouldContinue) {
          console.warn('⚠️ Firebase user logging failed but continuing:', handled.message);
        } else {
          console.error('❌ Firebase user logging failed:', firebaseError);
        }
      }
    }

    console.log('✅ Google OAuth success:', anonymizeEmail(user.email));
    return done(null, user);
  } catch (error) {
    console.error('❌ Google OAuth error:', error);
    return done(error, null);
  }
}));

// ✅ UPPDATERA MICROSOFT OAUTH MED FIREBASE LOGGING
passport.use(new MicrosoftStrategy({
  clientID: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  callbackURL: process.env.MICROSOFT_CALLBACK_URL || (
    process.env.NODE_ENV === 'production'
      ? 'https://www.onebookr.se/auth/microsoft/callback'
      : '/auth/microsoft/callback'
  ),
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

    // ✅ FIREBASE: LOGGA ANVÄNDARE
    if (db && user.email) {
      try {
        await createUser(user.email, 'microsoft');
        await updateUserLastLogin(user.email);
        
        gdprLog('Firebase: User logged in', { 
          email: anonymizeEmail(user.email),
          provider: 'microsoft'
        });
      } catch (firebaseError) {
        const handled = handleFirebaseError(firebaseError);
        if (handled.shouldContinue) {
          console.warn('⚠️ Firebase user logging failed but continuing:', handled.message);
        } else {
          console.error('❌ Firebase user logging failed:', firebaseError);
        }
      }
    }

    console.log('✅ Microsoft OAuth success:', anonymizeEmail(user.email));
    return done(null, user);
  } catch (error) {
    console.error('❌ Microsoft OAuth error:', error);
    return done(error, null);
  }
}));

// ===== GDPR-SÄKER GRUPPLAGRING MED SYNLIG EMAIL FÖR DELTAGARE =====
function createSecureGroup(groupData) {
  return {
    ...groupData,
    // ✅ BEHÅLL EMAILS SYNLIGA FÖR DELTAGARE I AKTIVA SESSIONER
    members: groupData.members.map(member => ({
      ...member,
      email: member.email, // Behåll klartext för session-deltagare
      emailHash: anonymizeEmail(member.email) // För server-logging endast
    }))
  };
}

function getGroupMembersDecrypted(group) {
  // ✅ RETURNERA DIREKT EFTERSOM EMAILS ÄR REDAN SYNLIGA FÖR DELTAGARE
  return {
    ...group,
    members: group.members.map(member => ({
      ...member,
      email: member.email // Redan i klartext för aktiva sessioner
    }))
  };
}

// ===== API ROUTES =====

app.post('/api/invite', async (req, res) => {
  try {
    // ✅ SINGLE DESTRUCTURING WITH PROPER VARIABLE NAMES
    const { emails: inviteEmails, fromUser: senderInfo, fromToken, groupName: rawGroupName, directAccessEmails } = req.body;
    
    // ✅ GDPR LOGGING WITH CORRECT EMAIL COUNT
    gdprLog('Invite request received', { 
      emailCount: Array.isArray(inviteEmails) ? inviteEmails.length : 0,
      fromUser: anonymizeEmail(
        typeof senderInfo === 'string' ? senderInfo : (senderInfo?.email || senderInfo?.emails?.[0]?.value || 'unknown')
      )
    });

    // ✅ VALIDATION: EMAILS ARRAY
    if (!Array.isArray(inviteEmails) || inviteEmails.length === 0) {
      throw new BookRError('Emails array is required and must not be empty', 400, 'MISSING_EMAILS');
    }

    if (inviteEmails.length > CONFIG.email.maxRecipients) {
      throw new BookRError(`Maximum ${CONFIG.email.maxRecipients} recipients allowed`, 400, 'TOO_MANY_RECIPIENTS');
    }

    // ✅ VALIDATION: SENDER INFO
    if (!senderInfo) {
      throw new BookRError('From user is required', 400, 'MISSING_FROM_USER');
    }

    // ✅ EXTRACT SENDER EMAIL AND NAME
    const senderEmail = typeof senderInfo === 'string' ? senderInfo : senderInfo.email;
    const senderName = typeof senderInfo === 'string' 
      ? senderInfo.split('@')[0] 
      : (senderInfo.name || senderInfo.displayName || senderEmail?.split('@')[0] || 'Unknown');

    // ✅ VALIDATION: SENDER EMAIL
    if (!validateEmail(senderEmail)) {
      throw new BookRError('Invalid sender email address', 400, 'INVALID_SENDER_EMAIL');
    }

    // ✅ VALIDATION: INVITE EMAILS
    const invalidEmails = inviteEmails.filter(email => !validateEmail(email));
    if (invalidEmails.length > 0) {
      throw new BookRError(`Invalid email addresses: ${invalidEmails.join(', ')}`, 400, 'INVALID_EMAILS');
    }

    // ✅ GROUP SETUP
    const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const frontendUrl = process.env.FRONTEND_URL || CONFIG.urls.frontend;
    const groupName = rawGroupName?.trim() || 'Kalenderjämförelse';

    // ✅ DETEKTERA CREATOR PROVIDER
    let creatorProvider = 'google';
    if (fromToken) {
      try {
        const testGoogle = await fetchWithRetry('https://www.googleapis.com/oauth2/v2/userinfo?fields=email', {
          headers: { 'Authorization': `Bearer ${fromToken}` }
        });
        creatorProvider = testGoogle.ok ? 'google' : 'microsoft';
      } catch {
        creatorProvider = 'microsoft';
      }
    }

    // ✅ SKAPA GRUPP MED SYNLIGA EMAILS FÖR DELTAGARE
    const group = {
      id: groupId,
      name: groupName,
      creator: senderEmail, // Synlig för deltagare
      createdAt: new Date().toISOString(),
      members: [{
        email: senderEmail, // Synlig för deltagare
        token: fromToken,
        provider: creatorProvider,
        joinedAt: new Date().toISOString(),
        isCreator: true
      }],
      invitedEmails: inviteEmails, // Synliga för att visa vem som bjudits in
      status: 'active'
    };

    activeGroups.set(groupId, group);

    // ✅ FÖRBÄTTRAD EMAIL DEBUGGING
    const emailResults = [];
    const inviteLinks = [];

    for (const email of inviteEmails) {
      const inviteLink = `${frontendUrl}/?group=${groupId}&invitee=${encodeURIComponent(email)}`;
      inviteLinks.push(inviteLink);

      console.log(`\n🔄 Processing email ${inviteEmails.indexOf(email) + 1}/${inviteEmails.length}:`);
      console.log(`   📧 To: ${email}`);
      console.log(`   👤 From: ${senderName} <${senderEmail}>`);
      console.log(`   📅 Group: ${groupName}`);
      console.log(`   🔗 Link: ${inviteLink}`);

      const emailResult = await sendInviteEmail(email, senderName, senderEmail, groupName, inviteLink);

      console.log(`   📊 Result: ${emailResult.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      if (!emailResult.success) {
        console.log(`   ❌ Error: ${emailResult.error}`);
      }

      emailResults.push({
        email,
        sent: emailResult.success,
        error: emailResult.error,
        emailId: emailResult.id
      });
    }

    const successfulEmails = emailResults.filter(r => r.sent);
    const failedEmails = emailResults.filter(r => !r.sent);

    console.log(`✅ Group ${groupId} created with ${successfulEmails.length}/${inviteEmails.length} emails sent`);

    if (failedEmails.length > 0) {
      console.warn(`⚠️ Failed emails: ${failedEmails.map(f => f.email).join(', ')}`);
    }

    // ✅ FIREBASE: SPARA GRUPP
    if (db) {
      try {
        const firebaseGroupId = await createGroup({
          name: groupName,
          creator: senderEmail,
          memberCount: inviteEmails.length + 1 // +1 för skaparen
        });
        
        gdprLog('Firebase: Group created', { 
          firebaseId: firebaseGroupId,
          memoryId: groupId.substring(0, 12) + '...',
          memberCount: inviteEmails.length + 1
        });
      } catch (firebaseError) {
        console.warn('⚠️ Firebase group creation failed:', firebaseError.message);
      }
    }

    // ✅ FIREBASE: SPARA INBJUDNINGAR
    if (db) {
      for (const email of inviteEmails) {
        try {
          const invitationId = await createInvitation({
            email,
            groupId,
            fromEmail: senderEmail,
            groupName: groupName,
            directAccess: false
          });
          
          gdprLog('Firebase: Invitation created', { 
            invitationId,
            toEmail: anonymizeEmail(email),
            fromEmail: anonymizeEmail(senderEmail)
          });
        } catch (firebaseError) {
          console.warn('⚠️ Firebase invitation creation failed:', firebaseError.message);
        }
      }
    }

    gdprLog('Group created with visible emails for participants', {
      groupId: groupId.substring(0, 12) + '...',
      memberCount: inviteEmails.length + 1,
      creator: anonymizeEmail(senderEmail) // Endast anonymisera i server-loggar
    });

    res.json({
      success: true,
      groupId,
      inviteLinks,
      emailResults,
      message: successfulEmails.length === inviteEmails.length
        ? `Alla ${inviteEmails.length} inbjudningar skickade!`
        : `${successfulEmails.length} av ${inviteEmails.length} inbjudningar skickade. ${failedEmails.length} misslyckades.`
    });
  } catch (error) {
    console.error('❌ Invite error:', error);

    if (error instanceof BookRError) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        timestamp: error.timestamp
      });
    }

    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', timestamp: new Date().toISOString() });
  }
});

app.post('/api/group/:groupId/join', validateGroup, async (req, res) => {
  try {
    const { email, token } = req.body;

    console.log(`👥 Join request for group ${req.params.groupId} from ${anonymizeEmail(email)}`);

    if (!email || !token) {
      throw new BookRError('Email and token are required', 400, 'MISSING_PARAMETERS');
    }

    if (!validateEmail(email)) {
      throw new BookRError('Invalid email format', 400, 'INVALID_EMAIL');
    }

    // ✅ DETEKTERA PROVIDER FRÅN TOKEN
    let provider = 'google';
    try {
      const testGoogle = await fetchWithRetry('https://www.googleapis.com/oauth2/v2/userinfo?fields=email', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      provider = testGoogle.ok ? 'google' : 'microsoft';
    } catch {
      provider = 'microsoft';
    }

    const existingMember = req.group.members.find(m => m.email.toLowerCase() === email.toLowerCase());
    if (existingMember) {
      existingMember.token = token;
      existingMember.provider = provider;
      existingMember.lastSeen = new Date().toISOString();
    } else {
      req.group.members.push({
        email: email.toLowerCase(), // Synlig för deltagare i gruppen
        token,
        provider,
        joinedAt: new Date().toISOString(),
        isCreator: false
      });
    }

    activeGroups.set(req.params.groupId, req.group);

    console.log(`✅ User joined group ${req.params.groupId}. Total members: ${req.group.members.length}`);

    // ✅ FIREBASE LOGGING MED ANONYMISERING (ENDAST FÖR SERVER-LOGGAR)
    if (db) {
      try {
        await logDataAccess(
          'group_join',
          anonymizeEmail(email), // Anonymisera endast i server-logger
          null,
          `group_${req.params.groupId.substring(0, 8)}...`
        );
        
        gdprLog('Firebase: User joined group', {
          userEmail: anonymizeEmail(email), // Anonymisera i loggar
          groupId: req.params.groupId.substring(0, 12) + '...',
          memberCount: req.group.members.length
        });
      } catch (firebaseError) {
        console.warn('⚠️ Firebase join logging failed:', firebaseError.message);
      }
    }

    // ✅ RETURNERA SYNLIGA EMAILS FÖR GRUPPDELTAGARE
    res.json({
      success: true,
      group: {
        id: req.group.id,
        name: req.group.name,
        memberCount: req.group.members.length,
        members: req.group.members.map(m => ({ 
          email: m.email, // Synlig för andra gruppdeltagare
          joinedAt: m.joinedAt,
          isCreator: m.isCreator 
        }))
      }
    });
  } catch (error) {
    console.error('❌ Join group error:', error);

    if (error instanceof BookRError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }

    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ✅ UPPDATERAD GROUP STATUS - VISA EMAILS FÖR DELTAGARE
app.get('/api/group/:groupId/status', validateGroup, (req, res) => {
  res.json({
    id: req.group.id,
    name: req.group.name,
    creator: req.group.creator, // Synlig för deltagare
    memberCount: req.group.members.length,
    members: req.group.members.map(m => ({
      email: m.email, // Synlig för andra gruppdeltagare
      joinedAt: m.joinedAt,
      isCreator: m.isCreator
    })),
    createdAt: req.group.createdAt,
    status: req.group.status,
    // ✅ LÄGG TILL INFO OM INBJUDNA SOM INTE ANSLUTIT ÄN
    invitedEmails: req.group.invitedEmails || [],
    pendingMembers: (req.group.invitedEmails || []).filter(invitedEmail => 
      !req.group.members.some(member => 
        member.email.toLowerCase() === invitedEmail.toLowerCase()
      )
    )
  });
});

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

    // ✅ VALIDERA ALLA TOKENS FÖRST
    const validTokens = [];
    const invalidTokens = [];
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token) {
        invalidTokens.push(i);
        continue;
      }
      
      try {
        // ✅ TESTA TOKEN
        const testResponse = await fetchWithRetry('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (testResponse.ok) {
          validTokens.push(token);
        } else {
          // ✅ FÖRSÖK MICROSOFT OM GOOGLE MISSLYCKAS
          const msTestResponse = await fetchWithRetry('https://graph.microsoft.com/v1.0/me', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (msTestResponse.ok) {
            validTokens.push(token);
          } else {
            invalidTokens.push(i);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Token ${i + 1} validation failed:`, error.message);
        invalidTokens.push(i);
      }
    }
    
    if (invalidTokens.length > 0) {
      console.warn(`⚠️ Found ${invalidTokens.length} invalid tokens out of ${tokens.length}`);
      
      if (validTokens.length === 0) {
        return res.status(401).json({
          error: 'All tokens are invalid or expired',
          code: 'ALL_TOKENS_EXPIRED',
          requiresReauth: true,
          invalidTokens
        });
      }
    }

    if (!Array.isArray(tokens) || tokens.length === 0) {
      throw new BookRError('Tokens array is required and must not be empty', 400, 'MISSING_TOKENS');
    }
    
    // ✅ ANVÄND ENDAST GILTIGA TOKENS
    const tokensToUse = validTokens.length > 0 ? validTokens : tokens;

    if (!timeMin || !timeMax) {
      throw new BookRError('timeMin and timeMax are required', 400, 'MISSING_TIME_RANGE');
    }

    const { start, end } = validateDateRange(timeMin, timeMax);

    if (parseInt(duration) < 15 || parseInt(duration) > 480) {
      throw new BookRError('Duration must be between 15 and 480 minutes', 400, 'INVALID_DURATION');
    }

    const allBusyTimes = [];

    // ✅ FÖRBÄTTRAD TOKEN PROCESSING MED GDPR-SÄKER EMAIL-HÄMTNING
    for (let i = 0; i < tokensToUse.length; i++) {
      const token = tokensToUse[i];
      if (!token) continue;

      try {
        console.log(`📋 Fetching ALL categories for participant ${i + 1}/${tokens.length}`);

        // ✅ GDPR-SÄKER EMAIL-HÄMTNING OCH PROVIDER DETECTION
        let userEmail = `participant_${i + 1}@privacy.local`;
        let provider = 'google';
        
        try {
          // ✅ FÖRSÖK GOOGLE FÖRST
          const googleProfileResponse = await fetchWithRetry('https://www.googleapis.com/oauth2/v2/userinfo?fields=email', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (googleProfileResponse.ok) {
            const profileData = await googleProfileResponse.json();
            userEmail = profileData.email || userEmail;
            provider = 'google';
            console.log(`📧 Participant ${i + 1} identified as Google user`);
          } else {
            // ✅ FÖRSÖK MICROSOFT
            const msProfileResponse = await fetchWithRetry('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (msProfileResponse.ok) {
              const msProfileData = await msProfileResponse.json();
              userEmail = msProfileData.mail || msProfileData.userPrincipalName || userEmail;
              provider = 'microsoft';
              console.log(`📧 Participant ${i + 1} identified as Microsoft user`);
            }
          }
        } catch (profileError) {
          console.warn(`⚠️ Could not fetch user profile for participant ${i + 1}:`, profileError.message);
        }

        // ✅ HÄMTA FRÅN ALLA KALENDRAR/KATEGORIER MED RÄTT PROVIDER
        const allEvents = await fetchAllCalendarEvents(token, timeMin, timeMax, userEmail, provider);
        console.log(`📊 Participant ${i + 1}: Total events from ALL categories: ${allEvents.length}`);

        // ✅ PROCESSA EVENTS GDPR-SÄKERT
        const busyTimes = processCalendarEvents(allEvents, userEmail, false);
        console.log(`✅ Participant ${i + 1}: ${busyTimes.length} busy periods after processing`);

        allBusyTimes.push(...busyTimes);
        
      } catch (error) {
        console.error(`❌ Error fetching calendar ${i + 1}:`, error.message);
      }
    }

    console.log(`📊 Total busy periods from ALL participants: ${allBusyTimes.length}`);
    
    // ✅ GDPR-SÄKER DEBUG INFO
    const busyByPerson = {};
    allBusyTimes.forEach(busy => {
      if (!busyByPerson[busy.email]) busyByPerson[busy.email] = [];
      busyByPerson[busy.email].push(busy);
    });
    
    console.log('📊 Busy times breakdown (GDPR-safe):');
    Object.entries(busyByPerson).forEach(([email, times]) => {
      console.log(`   Participant: ${times.length} busy periods (from ALL calendar categories)`);
    });

    const freeSlots = findFreeTimeSlots(start, end, allBusyTimes, parseInt(duration), dayStart, dayEnd);

    console.log(`✅ Found ${freeSlots.length} common free slots`);

    // ✅ FIREBASE: LOGGA KALENDERJÄMFÖRELSE
    if (db) {
      try {
        await logDataAccess(
          'calendar_comparison',
          'direct_comparison',
          null,
          `tokens_${tokens?.length || 0}_slots_${freeSlots.length}`
        );
        
        gdprLog('Firebase: Calendar comparison completed', {
          tokenCount: tokens?.length || 0,
          freeSlots: freeSlots.length,
          dateRange: `${timeMin?.split('T')[0]} - ${timeMax?.split('T')[0]}`
        });
      } catch (firebaseError) {
        console.warn('⚠️ Firebase comparison logging failed:', firebaseError.message);
      }
    }

    res.json(freeSlots);
  } catch (error) {
    console.error('❌ Availability error:', error);

    if (error instanceof BookRError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }

    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

app.get('/api/group/:groupId/availability', validateGroup, async (req, res) => {
  try {
    const { timeMin, timeMax, duration = 60, dayStart = '09:00', dayEnd = '17:00', includeAll = 'false' } = req.query;

    console.log(`📅 Group availability request for: ${req.params.groupId}`);

    if (!timeMin || !timeMax) {
      throw new BookRError('timeMin and timeMax are required', 400, 'MISSING_TIME_RANGE');
    }

    const { start, end } = validateDateRange(timeMin, timeMax);

    const memberTokens = req.group.members
      .filter(member => member.token)
      .map(member => ({ email: member.email, token: member.token }));

    console.log(`📋 Found ${memberTokens.length} member tokens in group ${req.params.groupId}`);

    if (memberTokens.length < 2) {
      console.warn(`⚠️ Group ${req.params.groupId} only has ${memberTokens.length} members with tokens`);
      return res.json([]);
    }

    const allMemberBusyTimes = [];

    const memberPromises = memberTokens.map(async ({ email, token }) => {
      try {
        console.log(`📋 Fetching comprehensive calendar data for ${email}`);

        // ✅ DETEKTERA PROVIDER BASERAT PÅ GRUPPMEDLEM
        const member = req.group.members.find(m => m.email === email);
        let provider = 'google';
        
        if (member && member.provider) {
          provider = member.provider;
        } else {
          // ✅ FÖRSÖK DETEKTERA PROVIDER
          try {
            const testGoogle = await fetchWithRetry('https://www.googleapis.com/oauth2/v2/userinfo?fields=email', {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            provider = testGoogle.ok ? 'google' : 'microsoft';
          } catch {
            provider = 'microsoft';
          }
        }

        const calendarEvents = await fetchAllCalendarEvents(token, timeMin, timeMax, email, provider);
        console.log(`📊 Member ${email}: Total events found: ${calendarEvents.length}`);

        const busyTimes = processCalendarEvents(calendarEvents, email, includeAll === 'true');
        console.log(`✅ Member ${email}: ${busyTimes.length} busy periods after processing`);

        return busyTimes;
      } catch (error) {
        console.error(`❌ Error fetching calendar for ${email}:`, error.message);
        return [];
      }
    });

    const memberResults = await Promise.allSettled(memberPromises);
    memberResults.forEach(result => {
      if (result.status === 'fulfilled') {
        allMemberBusyTimes.push(...result.value);
      }
    });

    console.log(`📊 Total busy periods across all members: ${allMemberBusyTimes.length}`);

    const freeSlots = findFreeTimeSlots(start, end, allMemberBusyTimes, parseInt(duration), dayStart, dayEnd);

    console.log(`✅ Generated ${freeSlots.length} free slots for group ${req.params.groupId}`);

    // ✅ FIREBASE: LOGGA GRUPPKÄNDERJÄMFÖRELSE
    if (db) {
      try {
        await logDataAccess(
          'group_calendar_comparison',
          `group_${req.params.groupId.substring(0, 8)}...`,
          null,
          `members_${memberTokens.length}_slots_${freeSlots.length}`
        );
        
        gdprLog('Firebase: Group calendar comparison completed', {
          groupId: req.params.groupId.substring(0, 12) + '...',
          memberCount: memberTokens.length,
          freeSlots: freeSlots.length,
          includeAll: includeAll === 'true'
        });
      } catch (firebaseError) {
        console.warn('⚠️ Firebase group comparison logging failed:', firebaseError.message);
      }
    }

    res.json(freeSlots);
  } catch (error) {
    console.error('❌ Group availability error:', error);

    if (error instanceof BookRError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }

    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

app.get('/api/group/:groupId/debug-events', validateGroup, async (req, res) => {
  try {
    const { timeMin, timeMax } = req.query;

    if (!timeMin || !timeMax) {
      throw new BookRError('timeMin and timeMax are required', 400, 'MISSING_TIME_RANGE');
    }

    const memberTokens = req.group.members
      .filter(member => member.token)
      .map(member => ({ email: member.email, token: member.token }));

    const debugData = [];

    for (const { email, token } of memberTokens) {
      try {
        // ✅ DETEKTERA PROVIDER
        const member = req.group.members.find(m => m.email === email);
        let provider = member?.provider || 'google';
        
        if (!member?.provider) {
          try {
            const testGoogle = await fetchWithRetry('https://www.googleapis.com/oauth2/v2/userinfo?fields=email', {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            provider = testGoogle.ok ? 'google' : 'microsoft';
          } catch {
            provider = 'microsoft';
          }
        }

        const allEvents = await fetchAllCalendarEvents(token, timeMin, timeMax, email, provider);
        const processedEvents = processCalendarEvents(allEvents, email, true);

        debugData.push({
          email,
          provider,
          totalEvents: allEvents.length,
          processedEvents: processedEvents.length,
          eventTimes: allEvents.slice(0, 5).map(event => ({
            start: event.start,
            end: event.end,
            status: event.status,
            transparency: event.transparency,
            isAllDay: Boolean(event.start?.date)
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

// ===== MEETING SUGGESTIONS - ROBUST SOLUTION =====
const meetingSuggestions = new Map();
const suggestionVotes = new Map();

// ✅ CREATE MEETING SUGGESTION
app.post('/api/group/:groupId/suggest', validateGroup, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { start, end, email, title, withMeet, location } = req.body;

    // ✅ VALIDERA INPUT
    if (!start || !end || !email || !title) {
      throw new BookRError('Missing required fields', 400, 'MISSING_FIELDS');
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BookRError('Invalid date format', 400, 'INVALID_DATE');
    }

    if (startDate >= endDate) {
      throw new BookRError('Start time must be before end time', 400, 'INVALID_TIME_RANGE');
    }

    const group = req.group;
    
    // ✅ VALIDERA ATT ANVÄNDAREN ÄR I GRUPPEN
    const userMember = group.members.find(m => m.email.toLowerCase() === email.toLowerCase());
    if (!userMember) {
      throw new BookRError('User not in group', 403, 'NOT_IN_GROUP');
    }

    // ✅ SKAPA FÖRSLAG MED UNIK ID
    const suggestionId = `suggest_${groupId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const suggestion = {
      id: suggestionId,
      groupId,
      suggestedBy: email,
      title: String(title).substring(0, 200), // Max 200 chars för säkerhet
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      withMeet: Boolean(withMeet),
      location: location ? String(location).substring(0, 200) : '',
      createdAt: new Date().toISOString(),
      status: 'pending', // pending, accepted, rejected, expired
      votes: {},
      eventIds: {} // För att spåra skapade events
    };

    // ✅ INITIERA RÖSTER FÖR ALLA MEDLEMMAR (UTOM FÖRSLAGET)
    group.members.forEach(member => {
      if (member.email.toLowerCase() !== email.toLowerCase()) {
        suggestion.votes[member.email] = 'pending'; // pending, accepted, rejected
      }
    });

    // ✅ LAGRA FÖRSLAG
    meetingSuggestions.set(suggestionId, suggestion);

    console.log(`📝 Meeting suggestion created: ${suggestionId}`);
    console.log(`   Title: ${suggestion.title}`);
    console.log(`   Time: ${suggestion.start} - ${suggestion.end}`);
    console.log(`   Pending votes: ${Object.keys(suggestion.votes).length}`);

    res.json({
      success: true,
      suggestion: {
        id: suggestionId,
        title: suggestion.title,
        start: suggestion.start,
        end: suggestion.end,
        withMeet: suggestion.withMeet,
        location: suggestion.location,
        status: suggestion.status,
        suggestedBy: suggestion.suggestedBy,
        votes: suggestion.votes
      }
    });

  } catch (error) {
    console.error('❌ Suggest meeting error:', error);

    if (error instanceof BookRError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }

    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ✅ GET SUGGESTIONS FOR GROUP
app.get('/api/group/:groupId/suggestions', validateGroup, async (req, res) => {
  try {
    const { groupId } = req.params;

    // ✅ HÄMTA ALLA FÖRSLAG FÖR DENNA GRUPP
    const suggestions = Array.from(meetingSuggestions.values())
      .filter(s => s.groupId === groupId && s.status === 'pending')
      .map(s => ({
        id: s.id,
        title: s.title,
        start: s.start,
        end: s.end,
        withMeet: s.withMeet,
        location: s.location,
        status: s.status,
        suggestedBy: s.suggestedBy,
        createdAt: s.createdAt,
        votes: s.votes,
        voteCount: {
          accepted: Object.values(s.votes).filter(v => v === 'accepted').length,
          rejected: Object.values(s.votes).filter(v => v === 'rejected').length,
          pending: Object.values(s.votes).filter(v => v === 'pending').length
        }
      }));

    console.log(`📋 Retrieved ${suggestions.length} pending suggestions for group ${groupId}`);

    res.json({ suggestions });

  } catch (error) {
    console.error('❌ Get suggestions error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ✅ VOTE ON SUGGESTION
app.post('/api/group/:groupId/suggestion/:suggestionId/vote', validateGroup, async (req, res) => {
  try {
    const { groupId, suggestionId } = req.params;
    const { email, vote } = req.body;

    // ✅ VALIDERA INPUT
    if (!email || !vote) {
      throw new BookRError('Missing email or vote', 400, 'MISSING_FIELDS');
    }

    if (!['accepted', 'rejected'].includes(vote)) {
      throw new BookRError('Vote must be "accepted" or "rejected"', 400, 'INVALID_VOTE');
    }

    // ✅ HÄMTA FÖRSLAG
    const suggestion = meetingSuggestions.get(suggestionId);
    if (!suggestion) {
      throw new BookRError('Suggestion not found', 404, 'NOT_FOUND');
    }

    if (suggestion.groupId !== groupId) {
      throw new BookRError('Suggestion does not belong to this group', 400, 'INVALID_GROUP');
    }

    if (suggestion.status !== 'pending') {
      throw new BookRError(`Cannot vote on ${suggestion.status} suggestion`, 400, 'INVALID_STATUS');
    }

    // ✅ REGISTRERA RÖST
    if (!suggestion.votes.hasOwnProperty(email.toLowerCase())) {
      throw new BookRError('User did not have pending vote on this suggestion', 400, 'NO_PENDING_VOTE');
    }

    const previousVote = suggestion.votes[email.toLowerCase()];
    suggestion.votes[email.toLowerCase()] = vote;

    console.log(`🗳️ Vote recorded: ${email} voted "${vote}" on suggestion ${suggestionId}`);
    console.log(`   Previous: ${previousVote} → New: ${vote}`);

    // ✅ KONTROLLERA OM ALLA HAR RÖSTAT OCH ACCEPTERAT
    const voteValues = Object.values(suggestion.votes);
    const allAccepted = voteValues.every(v => v === 'accepted');
    const anyRejected = voteValues.some(v => v === 'rejected');
    const allVoted = !voteValues.includes('pending');

    console.log(`📊 Vote status:`, {
      allAccepted,
      anyRejected,
      allVoted,
      voteCount: {
        accepted: voteValues.filter(v => v === 'accepted').length,
        rejected: voteValues.filter(v => v === 'rejected').length,
        pending: voteValues.filter(v => v === 'pending').length
      }
    });

    // ✅ OM NÅGON NEKAR ELLER INTE SVARAR - AVSLUTA FÖRSLAG
    if (anyRejected) {
      suggestion.status = 'rejected';
      console.log(`❌ Suggestion rejected by ${email}`);
      
      return res.json({
        success: true,
        vote: vote,
        suggestion: {
          id: suggestion.id,
          status: suggestion.status,
          message: 'Suggestion was rejected'
        }
      });
    }

    // ✅ OM ALLA ACCEPTERAT - SKAPA EVENTS
    if (allVoted && allAccepted) {
      suggestion.status = 'accepted';
      console.log(`✅ All participants accepted! Creating events...`);

      const eventCreationResult = await createMeetingEvents(suggestion, req.group);
      
      if (eventCreationResult.success) {
        suggestion.eventIds = eventCreationResult.eventIds;
        suggestion.meetLink = eventCreationResult.meetLink;
        console.log(`📅 Created ${Object.keys(eventCreationResult.eventIds).length} calendar events`);
        if (eventCreationResult.meetLink) {
          console.log(`📹 Shared Meet link: ${eventCreationResult.meetLink}`);
        }
      } else {
        console.warn(`⚠️ Event creation partially failed:`, eventCreationResult.errors);
      }

      return res.json({
        success: true,
        vote: vote,
        suggestion: {
          id: suggestion.id,
          status: suggestion.status,
          message: 'All participants accepted! Events created.',
          eventCreationResult
        }
      });
    }

    res.json({
      success: true,
      vote: vote,
      suggestion: {
        id: suggestion.id,
        status: suggestion.status,
        votes: suggestion.votes,
        voteCount: {
          accepted: voteValues.filter(v => v === 'accepted').length,
          rejected: voteValues.filter(v => v === 'rejected').length,
          pending: voteValues.filter(v => v === 'pending').length
        }
      }
    });

  } catch (error) {
    console.error('❌ Vote error:', error);
    
    if (error instanceof BookRError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }

    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ✅ CREATE CALENDAR EVENTS - SHARED MEET LINK
async function createMeetingEvents(suggestion, group) {
  const eventIds = {};
  const errors = [];
  let sharedMeetLink = null;

  try {
    // ✅ SKAPA MEET-LÄNK FÖRST (OM BEHÖVS) - ANVÄND GOOGLE-ANVIÄNDARE
    if (suggestion.withMeet) {
      const googleMember = group.members.find(m => m.token && m.provider === 'google');
      if (googleMember) {
        try {
          const meetEventData = {
            summary: suggestion.title,
            start: {
              dateTime: suggestion.start,
              timeZone: 'Europe/Stockholm'
            },
            end: {
              dateTime: suggestion.end,
              timeZone: 'Europe/Stockholm'
            },
            conferenceData: {
              createRequest: {
                requestId: `shared_meet_${suggestion.id}`,
                conferenceSolutionKey: {
                  type: 'hangoutsMeet'
                }
              }
            }
          };

          const meetResponse = await fetchWithRetry(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${googleMember.token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(meetEventData)
            }
          );

          if (meetResponse.ok) {
            const meetEvent = await meetResponse.json();
            sharedMeetLink = meetEvent.conferenceData?.entryPoints?.[0]?.uri;
            
            // Ta bort det temporära eventet
            await fetchWithRetry(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events/${meetEvent.id}`,
              {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${googleMember.token}`
                }
              }
            );
            
            console.log(`📹 Shared Google Meet created: ${sharedMeetLink}`);
          }
        } catch (error) {
          console.warn('⚠️ Could not create shared Meet link:', error.message);
        }
      }
    }

    // ✅ SKAPA EVENT FÖR VARJE GRUPPMEDLEM MED RÄTT API
    for (const member of group.members) {
      try {
        if (!member.token) {
          console.warn(`⚠️ No token for ${member.email}, skipping event creation`);
          errors.push(`${member.email}: No valid token`);
          continue;
        }

        const provider = member.provider || 'google';
        console.log(`📅 Creating ${provider} event for ${member.email}`);

        if (provider === 'microsoft') {
          // ✅ MICROSOFT GRAPH API EVENT
          const msEventData = {
            subject: suggestion.title,
            body: {
              contentType: 'text',
              content: `Möte föreslagen av ${suggestion.suggestedBy}\n\nSkapad via BookR - Kalenderjämförelse${sharedMeetLink ? `\n\nGoogle Meet: ${sharedMeetLink}` : ''}`
            },
            start: {
              dateTime: suggestion.start,
              timeZone: 'Europe/Stockholm'
            },
            end: {
              dateTime: suggestion.end,
              timeZone: 'Europe/Stockholm'
            },
            attendees: group.members.map(m => ({
              emailAddress: { address: m.email, name: m.email.split('@')[0] }
            })),
            location: sharedMeetLink ? { displayName: sharedMeetLink } : 
                     suggestion.location ? { displayName: suggestion.location } : undefined
          };

          const response = await fetchWithRetry(
            'https://graph.microsoft.com/v1.0/me/events',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${member.token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(msEventData)
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          const event = await response.json();
          eventIds[member.email] = event.id;
          console.log(`✅ Created Microsoft event for ${member.email}: ${event.id}`);
        } else {
          // ✅ GOOGLE CALENDAR API EVENT
          const eventData = {
            summary: suggestion.title,
            description: `Möte föreslagen av ${suggestion.suggestedBy}\n\nSkapad via BookR - Kalenderjämförelse`,
            start: {
              dateTime: suggestion.start,
              timeZone: 'Europe/Stockholm'
            },
            end: {
              dateTime: suggestion.end,
              timeZone: 'Europe/Stockholm'
            },
            attendees: group.members.map(m => ({ email: m.email })),
            reminders: { useDefault: true },
            visibility: 'default',
            status: 'confirmed'
          };

          // ✅ ANVÄND DELAD MEET-LÄNK ELLER PLATS
          if (sharedMeetLink) {
            eventData.description += `\n\nGoogle Meet: ${sharedMeetLink}`;
            eventData.location = sharedMeetLink;
          } else if (suggestion.location) {
            eventData.location = suggestion.location;
          }

          const response = await fetchWithRetry(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${member.token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(eventData)
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          const event = await response.json();
          eventIds[member.email] = event.id;
          console.log(`✅ Created Google event for ${member.email}: ${event.id}`);
        }

      } catch (error) {
        console.error(`❌ Failed to create event for ${member.email}:`, error.message);
        errors.push(`${member.email}: ${error.message}`);
      }
    }

    return {
      success: errors.length === 0,
      eventIds,
      meetLink: sharedMeetLink,
      errors: errors.length > 0 ? errors : undefined,
      message: errors.length === 0 
        ? `Successfully created events for all ${Object.keys(eventIds).length} members`
        : `Partially created: ${Object.keys(eventIds).length}/${group.members.length} members`
    };

  } catch (error) {
    console.error('❌ Event creation error:', error);
    return {
      success: false,
      eventIds,
      errors: [error.message],
      message: 'Failed to create calendar events'
    };
  }
}

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime(), version: process.env.npm_package_version || '1.0.0', environment: process.env.NODE_ENV || 'development' });
});

app.get('/api', (req, res) => {
  res.json({
    name: 'BookR API',
    version: '1.0.0',
    status: 'active',
    endpoints: {
      auth: ['GET /auth/google', 'GET /auth/microsoft', 'GET /auth/logout'],
      user: ['GET /api/user'],
      groups: ['POST /api/invite', 'POST /api/group/:id/join', 'GET /api/group/:id/status'],
      availability: ['POST /api/availability', 'GET /api/group/:id/availability'],
      suggestions: ['GET /api/group/:id/suggestions', 'POST /api/group/:id/suggest'],
      health: ['GET /health']
    }
  });
});

// ✅ SERVE FRONTEND STATIC FILES
app.use(express.static('OneBookR/calendar-frontend/dist'));

// ✅ SPA FALLBACK - ALLA ROUTES TILL INDEX.HTML
app.get('*', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/') || req.path.startsWith('/health')) {
    return res.status(404).json({ error: 'Endpoint not found', code: 'NOT_FOUND', path: req.path, method: req.method });
  }
  
  // Serve frontend for all other routes
  res.sendFile('index.html', { root: 'OneBookR/calendar-frontend/dist' });
});

app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', timestamp: new Date().toISOString(), ...(isDev && { details: error.message, stack: error.stack }) });
});

// ✅ LÄGG TILL DEBUG ENDPOINT FÖR ATT VISA ALLA ROUTES
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug/routes', (req, res) => {
    const routes = [];
    
    app._router.stack.forEach(middleware => {
      if (middleware.route) {
        // Direct route
        routes.push({
          path: middleware.route.path,
          methods: Object.keys(middleware.route.methods)
        });
      } else if (middleware.name === 'router') {
        // Router middleware
        middleware.handle.stack.forEach(handler => {
          if (handler.route) {
            routes.push({
              path: handler.route.path,
              methods: Object.keys(handler.route.methods)
            });
          }
        });
      }
    });
    
    res.json({
      totalRoutes: routes.length,
      routes: routes.sort((a, b) => a.path.localeCompare(b.path))
    });
  });
}

// ✅ START SERVER - MED ROUTE LOGGING
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BookR server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`🔑 Google OAuth: ${process.env.CLIENT_ID ? '✅ configured' : '❌ missing'}`);
  console.log(`🔑 Microsoft OAuth: ${process.env.MICROSOFT_CLIENT_ID ? '✅ configured' : '❌ missing'}`);
  console.log(`📧 Email (Resend): ${process.env.RESEND_API_KEY ? '✅ configured' : '❌ missing'}`);
  console.log(`🔥 Firebase: ${db ? '✅ connected' : '❌ not available'}`);
  
  // ✅ DEBUG: VISA VIKTIGA ENDPOINTS
  if (process.env.NODE_ENV !== 'production') {
    console.log('\n📋 Key API Endpoints:');
    console.log('   POST /api/availability');
    console.log('   GET  /api/group/:groupId/availability');
    console.log('   POST /api/group/:groupId/join');
    console.log('   GET  /api/group/:groupId/status');
    console.log('   GET  /api/debug/routes (development only)');
    console.log('\n🔧 Test group availability endpoint:');
    console.log(`   curl http://localhost:${PORT}/api/debug/routes`);
  }
});

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export default app;
