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
}

const resend = new Resend(process.env.RESEND_API_KEY);
console.log("Resend API key exists?", !!process.env.RESEND_API_KEY);

// Maintenance mode - omdirigera till väntelistan
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true';
console.log('Maintenance mode:', MAINTENANCE_MODE ? 'ON (redirecting to waitlist)' : 'OFF (full app available)');

// Middleware för maintenance mode
app.use((req, res, next) => {
  if (MAINTENANCE_MODE) {
    // Tillåt dessa sidor även i maintenance mode
    const allowedPaths = [
      '/waitlist',
      '/admin/waitlist', 
      '/api/waitlist',
      '/api/waitlist/count',
      '/api/waitlist/admin',
      '/api/waitlist/share',
      '/api/waitlist/referrer',
      '/api/user',
      '/api/user/optional'
    ];
    
    // Tillåt statiska filer (CSS, JS, bilder)
    if (req.path.includes('.') || allowedPaths.some(path => req.path.startsWith(path))) {
      return next();
    }
    
    // Omdirigera alla andra requests till väntelistan
    return res.redirect('/waitlist');
  }
  
  next();
});

// Servera frontend static files
app.use(express.static('OneBookR/calendar-frontend/dist'));

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

// Middleware för auth - UPPDATERAD FÖR ONEBOOKR.SE
app.use(cors({
  origin: ['https://onebookr.se', 'https://www.onebookr.se'],
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

// Google OAuth-strategi - UPPDATERAD FÖR ONEBOOKR.SE
passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: 'https://onebookr.se/auth/google/callback',
  accessType: 'offline',
  includeGrantedScopes: true
}, (accessToken, refreshToken, profile, done) => {
  if (!profile.email && profile.emails && profile.emails.length > 0) {
    profile.email = profile.emails[0].value || profile.emails[0];
  }
  if (!profile.primaryEmail && profile.emails && profile.emails.length > 0) {
    profile.primaryEmail = profile.emails[0].value || profile.emails[0];
  }
  profile.accessToken = accessToken;
  profile.refreshToken = refreshToken;
  return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Routes
app.get('/auth/google', (req, res, next) => {
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
    includeGrantedScopes: true
  })(req, res, next);
});

// OAuth callback - UPPDATERAD FÖR ONEBOOKR.SE
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    console.log('OAuth callback - user authenticated:', req.user ? 'Yes' : 'No');
    
    const authToken = Buffer.from(JSON.stringify({
      user: req.user,
      timestamp: Date.now()
    })).toString('base64');
    
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
    
    const frontendUrl = 'https://onebookr.se';
    res.redirect(`${frontendUrl}${redirectUrl}`);
  }
);

app.get('/api/user', (req, res) => {
  const user = req.user || req.session.user;
  
  if (user) {
    res.json({ user: user, token: user.accessToken });
  } else {
    const referer = req.headers.referer || '';
    if (referer.includes('/waitlist') || referer.includes('/admin/waitlist')) {
      res.json({ user: null, token: null, authenticated: false });
    } else {
      res.status(401).json({ error: 'Not authenticated' });
    }
  }
});

app.get('/api/user/optional', (req, res) => {
  const user = req.user || req.session.user;
  if (user) {
    res.json({ user: user, token: user.accessToken, authenticated: true });
  } else {
    res.json({ user: null, token: null, authenticated: false });
  }
});

// Logout - UPPDATERAD FÖR ONEBOOKR.SE
app.get('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    req.session.destroy(() => {
      res.redirect('https://onebookr.se/');
    });
  });
});

// Väntelista - PERMANENT LAGRING I FIRESTORE
import { addToWaitlist, getWaitlist, getWaitlistCount, checkEmailInWaitlist } from './firestore.js';

// Lägg till på väntelista
app.post("/api/waitlist", async (req, res) => {
  const { email, name, referrer } = req.body;
  console.log('Waitlist registration attempt:', { email, name, referrer });

  if (!email || !name) {
    console.log('Missing email or name');
    return res.status(400).json({ error: "Namn och e-post krävs." });
  }

  try {
    console.log('Checking if email already exists...');
    const existing = await checkEmailInWaitlist(email);
    if (existing) {
      console.log('Email already exists in waitlist');
      return res.status(400).json({ error: "Du är redan registrerad på väntelistan!" });
    }

    console.log('Adding to waitlist with referrer:', referrer || 'none');
    await addToWaitlist(email, name, referrer || null);
    console.log('Successfully added to waitlist');
    const totalCount = await getWaitlistCount();
    console.log('Total waitlist count:', totalCount);

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        await resend.emails.send({
          from: "BookR <info@onebookr.se>",
          to: "info@onebookr.se",
          subject: "Ny registrering på BookR väntelista",
          text: `Ny person har gått med på väntelistan:\n\nNamn: ${name}\nE-post: ${email}\nReferrer: ${
            referrer || "Ingen"
          }\nTid: ${new Date().toISOString()}\n\nTotalt antal: ${totalCount}`,
        });
      } catch (err) {
        console.error("Fel vid mejlutskick:", err);
      }
    }

    console.log('Sending success response with count:', totalCount);
    res.json({ success: true, count: totalCount });
  } catch (error) {
    console.error("Fel vid registrering på väntelista:", error);
    res.status(500).json({ error: "Kunde inte registrera på väntelistan." });
  }
});

// Hämta antal på väntelista
app.get("/api/waitlist/count", async (req, res) => {
  try {
    const count = await getWaitlistCount();
    res.json({ count });
  } catch (error) {
    console.error("Fel vid hämtning av väntelista-antal:", error);
    res.status(500).json({ error: "Kunde inte hämta antal." });
  }
});

// Admin-route
app.get("/api/waitlist/admin", async (req, res) => {
  const incomingKey = req.headers["x-admin-key"];
  if (incomingKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Fel nyckel" });
  }

  try {
    const waitlist = await getWaitlist();
    res.json({ waitlist });
  } catch (err) {
    console.error("Fel vid hämtning av väntelista:", err);
    res.status(500).json({ error: "Serverfel" });
  }
});

// Generera delningslänkar - UPPDATERAD FÖR ONEBOOKR.SE
app.post("/api/waitlist/share", (req, res) => {
  const { referrerEmail } = req.body;
  
  let waitlistUrl = "https://onebookr.se/waitlist";
  if (referrerEmail) {
    const encodedEmail = encodeURIComponent(referrerEmail);
    waitlistUrl += `?ref=${encodedEmail}`;
  }
  
  const message = encodeURIComponent("Kolla in BookR - slipp mejlkaoset när ni ska boka möten! 🚀");

  const shareLinks = {
    email: `mailto:?subject=${encodeURIComponent(
      "Du borde kolla in BookR!"
    )}&body=${encodeURIComponent(
      `Hej!\n\nJag hittade BookR - en app som gör slut på mejlkaoset när man ska boka möten.\n\nIstället för 15+ mejl och timmar av planering tar det 30 sekunder att hitta en tid som passar alla och få Google Meet-länk automatiskt.\n\nGå med på väntelistan här: ${waitlistUrl}\n\n100% gratis, inga kreditkort, lanseras inom kort!`
    )}`,
    whatsapp: `https://wa.me/?text=${message}%20${encodeURIComponent(waitlistUrl)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(waitlistUrl)}`,
    twitter: `https://twitter.com/intent/tweet?text=${message}&url=${encodeURIComponent(waitlistUrl)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(waitlistUrl)}`,
    copy: waitlistUrl,
  };

  res.json({ shareLinks, waitlistUrl });
});

// Hämta referrer från URL-parameter
app.get("/api/waitlist/referrer", (req, res) => {
  const { ref } = req.query;
  if (ref) {
    const decodedEmail = decodeURIComponent(ref);
    res.json({ referrer: decodedEmail });
  } else {
    res.json({ referrer: null });
  }
});

// React SPA routes
app.get("/waitlist", (req, res) => {
  res.sendFile(path.join(process.cwd(), "OneBookR/calendar-frontend/dist/index.html"));
});

app.get("/admin/waitlist", (req, res) => {
  res.sendFile(path.join(process.cwd(), "OneBookR/calendar-frontend/dist/index.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "OneBookR/calendar-frontend/dist/index.html"));
});

// Starta servern
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});