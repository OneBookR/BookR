import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import path from 'path';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

// CORS (credentials for your domain)
app.use(cors({
  origin: 'https://www.onebookr.se',
  credentials: true
}));

// Session (memory ok behind proxy)
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me',
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

/* ---------------- OAuth strategies ---------------- */
passport.use('google', new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: 'https://www.onebookr.se/auth/google/callback',
  accessType: 'offline',
  prompt: 'consent',
  includeGrantedScopes: true
}, (accessToken, refreshToken, profile, done) => {
  if (!profile.email && profile.emails?.length > 0) {
    profile.email = profile.emails[0].value || profile.emails[0];
  }
  if (!profile.primaryEmail && profile.emails?.length > 0) {
    profile.primaryEmail = profile.emails[0].value || profile.emails[0];
  }
  profile.accessToken = accessToken;
  profile.refreshToken = refreshToken;
  profile.provider = 'google';
  return done(null, profile);
}));

passport.use('microsoft', new MicrosoftStrategy({
  clientID: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  callbackURL: 'https://www.onebookr.se/auth/microsoft/callback',
  scope: ['user.read', 'calendars.read', 'calendars.readwrite'],
  tenant: 'common'
}, (accessToken, refreshToken, profile, done) => {
  const primaryEmail =
    profile?.mail ||
    profile?.userPrincipalName ||
    profile?.emails?.[0]?.value ||
    profile?.emails?.[0];
  if (primaryEmail) {
    profile.email = primaryEmail;
    if (!Array.isArray(profile.emails) || profile.emails.length === 0) {
      profile.emails = [{ value: primaryEmail }];
    }
  }
  profile.accessToken = accessToken;
  profile.refreshToken = refreshToken;
  profile.provider = 'microsoft';
  return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

/* ---------------- Static frontend ---------------- */
app.use(express.static('OneBookR/calendar-frontend/dist'));

/* ---------------- OAuth routes ---------------- */
app.get('/auth/google', (req, res, next) => {
  const state = req.query.state;
  if (state) req.session.oauthState = state;
  passport.authenticate('google', {
    scope: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events'
    ],
    state,
    prompt: 'consent',
    accessType: 'offline',
    includeGrantedScopes: true
  })(req, res, next);
});

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => completeLogin(req, res)
);

app.get('/auth/microsoft', (req, res, next) => {
  const state = req.query.state;
  if (state) req.session.oauthState = state;
  passport.authenticate('microsoft', {
    scope: ['user.read', 'calendars.read', 'calendars.readwrite'],
    state
  })(req, res, next);
});

app.get('/auth/microsoft/callback',
  passport.authenticate('microsoft', { failureRedirect: '/' }),
  (req, res) => completeLogin(req, res)
);

function completeLogin(req, res) {
  try { req.session.user = req.user; } catch {}
  const authToken = Buffer.from(JSON.stringify({ user: req.user, timestamp: Date.now() })).toString('base64');
  try {
    res.cookie?.('ob_auth', authToken, {
      httpOnly: true, secure: true, sameSite: 'none', maxAge: 7 * 24 * 60 * 60 * 1000
    });
  } catch {}
  const state = req.session.oauthState;
  delete req.session.oauthState;
  let redirectUrl = `/?auth=${authToken}`;
  try {
    if (state) {
      const parsed = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      if (parsed?.returnUrl) {
        redirectUrl = `${parsed.returnUrl}${parsed.returnUrl.includes('?') ? '&' : '?'}auth=${authToken}`;
      }
    }
  } catch {}
  const frontendUrl = 'https://www.onebookr.se';
  return req.session.save(() => res.redirect(`${frontendUrl}${redirectUrl}`));
}

app.get('/auth/logout', (req, res) => {
  try { req.logout(() => {}); } catch {}
  req.session.destroy(() => res.redirect('https://www.onebookr.se/'));
});

/* ---------------- Minimal in-memory store ---------------- */
// This unblocks the UI; persistence is out-of-scope here.
const groups = {};        // { [groupId]: { tokens:[], joinedEmails:[], creatorEmail, groupName } }
const suggestions = {};   // { [groupId]: [ { id, start, end, title, withMeet, location, votes:{email:status}, finalized, meetLink } ] }
const invitationsByEmail = {}; // { [email]: [ { id, groupId, inviteeId, fromEmail, groupName, createdAt } ] }

/* ---------------- Helpers ---------------- */
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
function looksLikeMicrosoftToken(token) {
  if (!token) return false;
  if (token.startsWith('Ew')) return true;
  try {
    if (token.split('.').length >= 2 && token.startsWith('eyJ')) {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
      const iss = String(payload.iss || '').toLowerCase();
      if (iss.includes('login.microsoftonline.com') || iss.includes('sts.windows.net')) return true;
      const aud = String(payload.aud || '').toLowerCase();
      if (aud.includes('graph.microsoft.com')) return true;
    }
  } catch {}
  return false;
}
function detectProvider(token) {
  if (looksLikeGoogleToken(token) && !looksLikeMicrosoftToken(token)) return 'google';
  if (looksLikeMicrosoftToken(token) && !looksLikeGoogleToken(token)) return 'microsoft';
  if (token?.startsWith('ya29.')) return 'google';
  if (token?.startsWith('Ew')) return 'microsoft';
  return 'google';
}

async function createGoogleCalendarEvent(accessToken, eventData, withMeet) {
  try {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=${withMeet ? 1 : 0}`;
    const body = {
      summary: eventData.summary || 'Möte',
      description: eventData.description || '',
      start: { dateTime: eventData.start.dateTime, timeZone: eventData.start.timeZone || 'Europe/Stockholm' },
      end: { dateTime: eventData.end.dateTime, timeZone: eventData.end.timeZone || 'Europe/Stockholm' },
      attendees: (eventData.attendees || []).map(e => ({ email: e })),
      ...(withMeet ? {
        conferenceData: {
          createRequest: {
            requestId: eventData.requestId || String(Date.now()),
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      } : {})
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('Google event error:', err);
      return null;
    }
    const data = await res.json();
    const meetLink =
      data?.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri ||
      data?.hangoutLink ||
      null;
    return { success: true, provider: 'google', eventId: data?.id, meetLink };
  } catch (e) {
    console.error('Google event exception:', e);
    return null;
  }
}

async function createMicrosoftCalendarEvent(accessToken, eventData, withTeams) {
  try {
    const msEvent = {
      subject: eventData.summary || 'Möte',
      body: { contentType: 'HTML', content: eventData.description || '' },
      start: { dateTime: eventData.start.dateTime, timeZone: eventData.start.timeZone || 'Europe/Stockholm' },
      end: { dateTime: eventData.end.dateTime, timeZone: eventData.end.timeZone || 'Europe/Stockholm' },
      attendees: (eventData.attendees || []).map(email => ({
        emailAddress: { address: email }, type: 'required'
      })),
      ...(withTeams ? { isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' } : {})
    };
    const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(msEvent)
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('MS event error:', err);
      return null;
    }
    const data = await res.json();
    const joinUrl = data?.onlineMeeting?.joinUrl || null;
    return { success: true, provider: 'microsoft', eventId: data?.id, meetLink: joinUrl };
  } catch (e) {
    console.error('MS event exception:', e);
    return null;
  }
}

/* ---------------- Minimal APIs to support UI ---------------- */

// Invitations list (return created invites)
app.get('/api/invitations/:email', (req, res) => {
  const email = decodeURIComponent(req.params.email || '');
  return res.json({ invitations: invitationsByEmail[email] || [] });
});

// Send invite: creates a group and invitations
app.post('/api/invite', (req, res) => {
  try {
    const { emails = [], fromUser, fromToken, groupName } = req.body || {};
    const creatorEmail = typeof fromUser === 'object'
      ? (fromUser.email || fromUser?.emails?.[0]?.value || fromUser?.emails?.[0])
      : fromUser;
    if (!creatorEmail || !fromToken) return res.status(400).json({ error: 'Saknar avsändare eller token' });

    const groupId = cryptoRandomId();
    groups[groupId] = {
      tokens: [fromToken],
      joinedEmails: [creatorEmail],
      creatorEmail,
      groupName: groupName || 'Kalendergrupp'
    };

    const inviteLinks = [];
    emails.forEach((email) => {
      const inviteeId = cryptoRandomId();
      const inv = {
        id: cryptoRandomId(),
        groupId,
        inviteeId,
        fromEmail: creatorEmail,
        groupName: groupName || 'Kalendergrupp',
        createdAt: new Date().toISOString()
      };
      invitationsByEmail[email] = invitationsByEmail[email] || [];
      invitationsByEmail[email].push(inv);
      inviteLinks.push(`https://www.onebookr.se/?group=${groupId}&invitee=${inviteeId}`);
    });

    return res.json({ message: 'Inbjudningar skickade!', groupId, inviteLinks });
  } catch (e) {
    console.error('invite error:', e);
    return res.status(500).json({ error: 'Kunde inte skicka inbjudan' });
  }
});

// Mark invite responded (accept/decline)
app.post('/api/invitation/:id/respond', (req, res) => {
  // For UI flow; we accept and no-op here.
  return res.json({ success: true });
});

// Join group: adds token/email and flags allJoined based on counts
app.post('/api/group/join', (req, res) => {
  const { groupId, token, email } = req.body || {};
  if (!groupId || !token || !email) return res.status(400).json({ error: 'groupId, token, email krävs' });

  if (!groups[groupId]) {
    groups[groupId] = { tokens: [], joinedEmails: [], creatorEmail: email, groupName: 'Kalendergrupp' };
  }
  const g = groups[groupId];
  if (!g.tokens.includes(token)) g.tokens.push(token);
  if (!g.joinedEmails.includes(email)) g.joinedEmails.push(email);
  g.allJoined = true; // in-memory: treat as ready once user joins
  return res.json({ success: true, directAccess: false });
});

app.get('/api/group/:groupId/status', (req, res) => {
  const g = groups[req.params.groupId];
  if (!g) return res.status(404).json({ error: 'Grupp finns inte' });
  const invited = g.joinedEmails || [];
  const current = invited.length;
  const expected = invited.length;
  return res.json({
    allJoined: true,
    current,
    expected,
    invited,
    joined: invited,
    declinedInvitations: [],
    pendingInvitations: [],
    groupName: g.groupName,
    creatorEmail: g.creatorEmail,
    directAccess: false
  });
});

app.get('/api/group/:groupId/joined', (req, res) => {
  const g = groups[req.params.groupId];
  if (!g) return res.status(404).json({ error: 'Grupp finns inte' });
  return res.json({ joined: g.joinedEmails || [] });
});

app.get('/api/group/:groupId/tokens', (req, res) => {
  const g = groups[req.params.groupId];
  if (!g) return res.status(404).json({ error: 'Grupp finns inte' });
  return res.json({ tokens: g.tokens || [] });
});

// Suggest a time
app.post('/api/group/:groupId/suggest', (req, res) => {
  const groupId = req.params.groupId;
  const g = groups[groupId];
  if (!g) return res.status(404).json({ error: 'Grupp finns inte' });

  const { start, end, email, title, withMeet, location, isMultiDay, multiDayStart, multiDayEnd, durationPerDay, dayStart, dayEnd } = req.body || {};
  if (!start || !end || !email) return res.status(400).json({ error: 'start, end, email krävs' });

  suggestions[groupId] = suggestions[groupId] || [];
  const id = cryptoRandomId();
  suggestions[groupId].push({
    id,
    start,
    end,
    title: title || '',
    withMeet: typeof withMeet === 'boolean' ? withMeet : true,
    location: location || '',
    votes: { [email]: 'accepted' },
    fromEmail: email,
    groupName: g.groupName || 'Kalendergrupp',
    isMultiDay: !!isMultiDay,
    multiDayStart: multiDayStart || null,
    multiDayEnd: multiDayEnd || null,
    durationPerDay: durationPerDay || null,
    dayStart: dayStart || null,
    dayEnd: dayEnd || null,
    finalized: false
  });
  return res.json({ success: true, id });
});

// List suggestions
app.get('/api/group/:groupId/suggestions', (req, res) => {
  const list = suggestions[req.params.groupId] || [];
  return res.json({ suggestions: list });
});

// Delete suggestion (only author)
app.delete('/api/group/:groupId/suggestion/:suggestionId', (req, res) => {
  const { groupId, suggestionId } = req.params;
  const { email } = req.body || {};
  const list = suggestions[groupId] || [];
  const ix = list.findIndex(s => s.id === suggestionId);
  if (ix === -1) return res.status(404).json({ error: 'Förslag finns inte' });
  if (list[ix].fromEmail !== email) return res.status(403).json({ error: 'Du kan bara ta bort dina egna förslag' });
  list.splice(ix, 1);
  return res.json({ success: true });
});

// Vote on suggestion: when all accepted → create calendar events for all and build unified Meet/Teams link
app.post('/api/group/:groupId/suggestion/:suggestionId/vote', async (req, res) => {
  const { groupId, suggestionId } = req.params;
  const { email, vote } = req.body || {};
  if (!email || !vote) return res.status(400).json({ error: 'email, vote krävs' });

  const g = groups[groupId];
  if (!g) return res.status(404).json({ error: 'Grupp finns inte' });
  const list = suggestions[groupId] || [];
  const s = list.find(x => x.id === suggestionId);
  if (!s) return res.status(404).json({ error: 'Förslag finns inte' });

  s.votes = { ...(s.votes || {}), [email]: vote };

  // Respond immediately
  res.json({ success: true, suggestion: s });

  // When all group members accepted → finalize and create events
  try {
    const allEmails = (g.joinedEmails || []).filter(Boolean);
    if (!allEmails.length) return;
    const allAccepted = allEmails.every(e => s.votes[e] === 'accepted');

    if (allAccepted && !s.finalized) {
      s.finalized = true;
      s.status = 'processing';

      const tokens = (g.tokens || []).filter(Boolean);
      const providers = tokens.map(detectProvider);
      const hasMicrosoftUser = providers.includes('microsoft');
      const meetingType = hasMicrosoftUser ? 'teams' : 'meet';

      const baseEvent = {
        summary: s.title || 'BookR-möte',
        description: `Möte bokat via BookR\n\nDeltagare: ${allEmails.join(', ')}`,
        start: { dateTime: s.start, timeZone: 'Europe/Stockholm' },
        end: { dateTime: s.end, timeZone: 'Europe/Stockholm' },
        attendees: allEmails,
        requestId: suggestionId.slice(0, 40)
      };

      let unifiedMeetLink = null;

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const provider = providers[i];
        let created = null;

        if (provider === 'microsoft') {
          // Teams when any MS user exists; Google users get no Meet if Teams chosen
          created = await createMicrosoftCalendarEvent(token, baseEvent, s.withMeet && meetingType === 'teams');
        } else {
          if (meetingType === 'teams') {
            created = await createGoogleCalendarEvent(token, baseEvent, false);
          } else {
            created = await createGoogleCalendarEvent(token, baseEvent, s.withMeet);
          }
        }

        if (created?.success && created.meetLink && !unifiedMeetLink) {
          unifiedMeetLink = created.meetLink;
        }
      }

      s.meetLink = unifiedMeetLink || null;
      s.meetingType = meetingType;
      s.status = 'completed';

      // Optional: notify via email if Resend is configured
      if (resend) {
        const platform = meetingType === 'teams' ? 'Microsoft Teams' : 'Google Meet';
        let text = `Alla har accepterat mötestiden!\n\n`;
        text += `Möte: ${s.title || 'Föreslaget möte'}\n`;
        text += `Datum: ${new Date(s.start).toLocaleString()} - ${new Date(s.end).toLocaleString()}\n\n`;
        if (s.withMeet && s.meetLink) text += `Länk (${platform}): ${s.meetLink}\n\n`;
        if (s.location) text += `Plats: ${s.location}\n\n`;
        text += `Deltagare:\n${allEmails.join('\n')}\n\n`;
        text += `Mötet finns i din kalender. Hälsningar,\nBookR`;

        for (const rcpt of allEmails) {
          try {
            await resend.emails.send({
              from: 'BookR <info@onebookr.se>',
              to: rcpt,
              subject: 'Möte bokat!',
              text
            });
          } catch (e) {
            console.warn('Email send failed:', rcpt, e?.message);
          }
        }
      }
    }
  } catch (e) {
    console.error('Finalize error:', e);
    s.status = 'error';
    s.error = e?.message || 'unknown';
  }
});

/* ---------------- Availability + Task stubs (non-blocking) ---------------- */
// Keep stubs so UI can render even without full calendar aggregation
app.post('/api/availability', async (req, res) => res.json([]));
app.post('/api/calendar/events', async (req, res) => res.json({ events: [] }));
app.post('/api/task/schedule', async (req, res) => res.json({ taskSlots: [] }));

app.get('/health', (_req, res) => res.status(200).send('OK'));

/* ---------------- Start ---------------- */
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server listening on ${PORT}`));

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  server.close(() => process.exit(0));
});

function cryptoRandomId() {
  // Lightweight ID generator without crypto import
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}