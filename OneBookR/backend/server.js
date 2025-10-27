import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import bodyParser from 'body-parser';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import path from 'path';

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(bodyParser.json());

// CORS with credentials for your domain
app.use(
  cors({
    origin: 'https://www.onebookr.se',
    credentials: true
  })
);

// Session (MemoryStore ok for now; ob_auth cookie makes auth survive restarts)
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: true,
    cookie: {
      sameSite: 'none',
      secure: true,
      httpOnly: true
    }
  })
);

app.use(passport.initialize());
app.use(passport.session());

// --- Small helper: read cookie value without cookie-parser ---
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

// --- OAuth strategies ---
passport.use(
  'google',
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: 'https://www.onebookr.se/auth/google/callback',
      accessType: 'offline',
      prompt: 'consent',
      includeGrantedScopes: true
    },
    (accessToken, refreshToken, profile, done) => {
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
    }
  )
);

passport.use(
  'microsoft',
  new MicrosoftStrategy(
    {
      clientID: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      callbackURL: 'https://www.onebookr.se/auth/microsoft/callback',
      scope: ['user.read', 'calendars.read', 'calendars.readwrite'],
      tenant: 'common'
    },
    (accessToken, refreshToken, profile, done) => {
      // Normalize email for frontend
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
    }
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// --- Static frontend ---
app.use(express.static('OneBookR/calendar-frontend/dist'));

// --- OAuth routes ---
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

app.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  async (req, res) => {
    try {
      req.session.user = req.user;
    } catch {}
    const authToken = Buffer.from(
      JSON.stringify({ user: req.user, timestamp: Date.now() })
    ).toString('base64');
    try {
      res.cookie('ob_auth', authToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
    } catch {}
    const state = req.session.oauthState;
    delete req.session.oauthState;
    let redirectUrl = `/?auth=${authToken}`;
    try {
      if (state) {
        const parsed = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
        if (parsed?.returnUrl) {
          redirectUrl = `${parsed.returnUrl}${
            parsed.returnUrl.includes('?') ? '&' : '?'
          }auth=${authToken}`;
        }
      }
    } catch {}
    const frontendUrl = 'https://www.onebookr.se';
    return req.session.save(() => res.redirect(`${frontendUrl}${redirectUrl}`));
  }
);

app.get('/auth/microsoft', (req, res, next) => {
  const state = req.query.state;
  if (state) req.session.oauthState = state;
  passport.authenticate('microsoft', {
    scope: ['user.read', 'calendars.read', 'calendars.readwrite'],
    state
  })(req, res, next);
});

app.get(
  '/auth/microsoft/callback',
  passport.authenticate('microsoft', { failureRedirect: '/' }),
  async (req, res) => {
    try {
      req.session.user = req.user;
    } catch {}
    const authToken = Buffer.from(
      JSON.stringify({ user: req.user, timestamp: Date.now() })
    ).toString('base64');
    try {
      res.cookie('ob_auth', authToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
    } catch {}
    const state = req.session.oauthState;
    delete req.session.oauthState;
    let redirectUrl = `/?auth=${authToken}`;
    try {
      if (state) {
        const parsed = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
        if (parsed?.returnUrl) {
          redirectUrl = `${parsed.returnUrl}${
            parsed.returnUrl.includes('?') ? '&' : '?'
          }auth=${authToken}`;
        }
      }
    } catch {}
    const frontendUrl = 'https://www.onebookr.se';
    return req.session.save(() => res.redirect(`${frontendUrl}${redirectUrl}`));
  }
);

app.get('/auth/logout', (req, res) => {
  try {
    req.logout(() => {});
  } catch {}
  req.session.destroy(() => {
    res.redirect('https://www.onebookr.se/');
  });
});

// --- API: user (rehydrate from auth token if session empty) ---
app.get('/api/user', (req, res) => {
  const logCtx = {
    isAuthenticated: req.isAuthenticated?.() || false,
    sessionID: req.sessionID,
    user: req.user ? 'User exists' : 'No user',
    sessionUser: req.session?.user ? 'Session user exists' : 'No session user',
    cookies: req.headers.cookie ? 'Cookies present' : 'No cookies'
  };
  console.log('API /user called:', logCtx);

  const ensureSession = () => {
    if (req.session?.user) return req.session.user;
    const authB64 =
      (req.query?.auth && String(req.query.auth)) ||
      (req.headers['x-auth'] && String(req.headers['x-auth'])) ||
      getCookie(req, 'ob_auth');
    if (!authB64) return null;
    try {
      const parsed = JSON.parse(Buffer.from(authB64, 'base64').toString('utf8'));
      if (parsed?.user) {
        // Normalize MS email if needed
        const u = parsed.user;
        if (!u.email) {
          u.email =
            u.mail ||
            u.userPrincipalName ||
            (Array.isArray(u.emails) ? u.emails[0]?.value || u.emails[0] : undefined);
          if (!Array.isArray(u.emails) && u.email) u.emails = [{ value: u.email }];
        }
        req.session.user = u;
        return u;
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

// --- Minimal endpoints to prevent 404s and unblock UI ---

// Invitations list (return empty list if none)
app.get('/api/invitations/:email', async (req, res) => {
  try {
    // ...hook into storage here later...
    return res.json({ invitations: [] });
  } catch (e) {
    return res.json({ invitations: [] });
  }
});

// Send invite (stub success)
app.post('/api/invite', async (req, res) => {
  try {
    // ...create group + invitations in storage here later...
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Kunde inte skicka inbjudan' });
  }
});

// Availability (stub empty list so UI can render without errors)
app.post('/api/availability', async (req, res) => {
  try {
    // Expected body: { tokens, timeMin, timeMax, duration, dayStart, dayEnd, ... }
    return res.json([]);
  } catch (e) {
    return res.json([]);
  }
});

// Contact request (stub success)
app.post('/api/contact-request', async (req, res) => {
  try {
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Kunde inte skicka förfrågan' });
  }
});

// Calendar events (Task page) - stub
app.post('/api/calendar/events', async (req, res) => {
  try {
    return res.json({ events: [] });
  } catch (e) {
    return res.json({ events: [] });
  }
});

// Task schedule (stub no slots)
app.post('/api/task/schedule', async (req, res) => {
  try {
    return res.json({ taskSlots: [] });
  } catch (e) {
    return res.json({ taskSlots: [] });
  }
});

// Health check
app.get('/health', (_req, res) => res.status(200).send('OK'));

// SPA fallback
app.get(/^(?!\/(api|auth))(.*)$/, (req, res, next) => {
  try {
    res.sendFile(path.join(process.cwd(), 'OneBookR/calendar-frontend/dist/index.html'));
  } catch (e) {
    next(e);
  }
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => process.exit(0));
});