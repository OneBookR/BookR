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
import RedisStore from 'connect-redis'; // NYTT: Lägg till Redis store
import { createClient } from 'redis'; // NYTT

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

// NYTT: Initiera session store FÖRE passport
let sessionStore;
if (process.env.REDIS_URL) {
  const redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.connect();
  const RedisStore = (await import('connect-redis')).default;
  sessionStore = new RedisStore({ client: redisClient, prefix: 'bookr_session:' });
  console.log('Using Redis session store');
} else {
  // Fallback: In-memory för development
  const session_store = {};
  sessionStore = {
    get: (sid, cb) => cb(null, session_store[sid]),
    set: (sid, sess, cb) => { session_store[sid] = sess; cb(); },
    destroy: (sid, cb) => { delete session_store[sid]; cb(); }
  };
  console.log('⚠️ Using in-memory session store - NOT FOR PRODUCTION');
}

app.set('trust proxy', 1);
app.use(express.json());
app.use(bodyParser.json());

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

app.use(cors({
  origin: 'https://www.onebookr.se',
  credentials: true
}));

// Session middleware FÖRE passport
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  name: 'bookr.sid',
  cookie: {
    sameSite: 'lax',  // ÄNDRAT: från 'none' till 'lax' för att fungera utan https test
    secure: process.env.NODE_ENV === 'production',  // Endast https i prod
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    domain: process.env.NODE_ENV === 'production' ? '.onebookr.se' : undefined
  },
  rolling: true
}));
app.use(passport.initialize());
app.use(passport.session());

// NYTT: Enkel och robust serialisering
passport.serializeUser((user, done) => {
  console.log('[serializeUser] Serializing user:', user?.email || user?.userPrincipalName || user?.mail);
  done(null, {
    id: user.id,
    email: user.email || user.userPrincipalName || user.mail,
    displayName: user.displayName || user.name,
    accessToken: user.accessToken,
    refreshToken: user.refreshToken,
    provider: user.provider
  });
});

passport.deserializeUser((obj, done) => {
  console.log('[deserializeUser] Deserializing user:', obj?.email);
  done(null, obj);
});

// Google OAuth-strategi
passport.use('google', new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: 'https://www.onebookr.se/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
  if (!profile.email && profile.emails?.length > 0) {
    profile.email = profile.emails[0].value;
  }
  profile.accessToken = accessToken;
  profile.refreshToken = refreshToken;
  profile.provider = 'google';
  console.log('Google OAuth - token present:', !!accessToken);
  return done(null, profile);
}));

passport.use('microsoft', new MicrosoftStrategy({
  clientID: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  callbackURL: 'https://www.onebookr.se/auth/microsoft/callback',
  tenant: 'common'
}, (accessToken, refreshToken, profile, done) => {
  profile.accessToken = accessToken;
  profile.refreshToken = refreshToken;
  profile.provider = 'microsoft';
  console.log('Microsoft OAuth - token present:', !!accessToken);
  return done(null, profile);
}));

// Routes
app.get('/auth/google', (req, res, next) => {
  const state = req.query.state;
  if (state) {
    req.session.oauthState = state;
    // NYTT: Spara session innan OAuth redirect
    req.session.save((err) => {
      if (err) console.error('Session save error:', err);
    });
  }
  
  passport.authenticate('google', {
    scope: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events'
    ],
    state,
    accessType: 'offline',
    prompt: 'consent'
  })(req, res, next);
});

app.get('/auth/microsoft', (req, res, next) => {
  const state = req.query.state;
  if (state) {
    req.session.oauthState = state;
    req.session.save((err) => {
      if (err) console.error('Session save error:', err);
    });
  }
  
  passport.authenticate('microsoft', {
    scope: ['user.read', 'calendars.read', 'calendars.readwrite'],
    state
  })(req, res, next);
});

// NYTT: Förenklad Google callback - låt passport hantera session
app.get('/auth/google/callback',
  passport.authenticate('google', { 
    failureRedirect: '/auth/login?error=google_failed',
    keepSessionInfo: true 
  }),
  async (req, res) => {
    console.log('[Google callback] Authenticated, user:', req.user?.email);
    
    // Hantera database-saker asynkront
    if (req.user?.email) {
      setImmediate(async () => {
        try {
          const existingUser = await getUser(req.user.email);
          if (!existingUser) {
            await createUser(req.user.email, 'google');
            // Skicka welcome email
            await resend.emails.send({
              from: 'BookR <info@onebookr.se>',
              to: req.user.email,
              subject: 'Välkommen till BookR! 🎉',
              text: 'Hej och välkommen...' // Din befintliga text
            });
          } else {
            await updateUserLastLogin(req.user.email);
          }
        } catch (error) {
          console.error('Error handling user:', error);
        }
      });
    }

    // NYTT: Spara user i session direkt - INTE base64
    req.session.user = {
      id: req.user.id,
      email: req.user.email,
      provider: req.user.provider,
      accessToken: req.user.accessToken,
      refreshToken: req.user.refreshToken,
      displayName: req.user.displayName
    };
    
    req.session.save((err) => {
      if (err) {
        console.error('Session save failed:', err);
        return res.redirect('/?error=session_failed');
      }
      
      // FIXA: Redirect till dashboard, INTE med auth token i URL
      res.redirect('/dashboard');
    });
  }
);

// NYTT: Förenklad Microsoft callback
app.get('/auth/microsoft/callback',
  passport.authenticate('microsoft', { 
    failureRedirect: '/auth/login?error=microsoft_failed',
    keepSessionInfo: true 
  }),
  async (req, res) => {
    console.log('[Microsoft callback] Authenticated, user:', req.user?.mail || req.user?.userPrincipalName);
    
    // Hantera database-saker asynkront
    if (req.user?.mail || req.user?.userPrincipalName) {
      const userEmail = req.user.mail || req.user.userPrincipalName;
      setImmediate(async () => {
        try {
          const existingUser = await getUser(userEmail);
          if (!existingUser) {
            await createUser(userEmail, 'microsoft');
            await resend.emails.send({
              from: 'BookR <info@onebookr.se>',
              to: userEmail,
              subject: 'Välkommen till BookR! 🎉',
              text: 'Hej och välkommen...' // Din befintliga text
            });
          } else {
            await updateUserLastLogin(userEmail);
          }
        } catch (error) {
          console.error('Error handling user:', error);
        }
      });
    }

    req.session.user = {
      id: req.user.id,
      email: req.user.mail || req.user.userPrincipalName,
      provider: req.user.provider,
      accessToken: req.user.accessToken,
      refreshToken: req.user.refreshToken,
      displayName: req.user.displayName
    };
    
    req.session.save((err) => {
      if (err) {
        console.error('Session save failed:', err);
        return res.redirect('/?error=session_failed');
      }
      
      res.redirect('/dashboard');
    });
  }
);

// NYTT: Middleware för att kräva auth
const requireAuth = (req, res, next) => {
  if (!req.isAuthenticated() || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

// NYTT: Protected endpoint för att hämta user
app.get('/api/user', (req, res) => {
  if (!req.isAuthenticated() || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  res.json({ 
    user: req.session.user,
    token: req.session.user.accessToken 
  });
});

// NYTT: Input validation helper
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

function validateGroupName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 255;
}

// NYTT: Rate limiting (enkel version - använd redis-rate-limit i production)
const rateLimitMap = new Map();
function checkRateLimit(identifier, maxRequests = 60, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  if (!rateLimitMap.has(identifier)) {
    rateLimitMap.set(identifier, []);
  }
  
  let requests = rateLimitMap.get(identifier);
  requests = requests.filter(time => time > windowStart);
  
  if (requests.length >= maxRequests) {
    return false;
  }
  
  requests.push(now);
  rateLimitMap.set(identifier, requests);
  
  // Cleanup gamla entries
  if (rateLimitMap.size > 10000) {
    const oldestKey = rateLimitMap.keys().next().value;
    rateLimitMap.delete(oldestKey);
  }
  
  return true;
}

// FIXA: Lägg till rate limiting på invite endpoint
app.post('/api/invite', requireAuth, async (req, res) => {
  // Rate limit: max 10 invites per minute per user
  if (!checkRateLimit(req.session.user.email, 10, 60000)) {
    return res.status(429).json({ error: 'Too many invitations. Please wait a moment.' });
  }

  try {
    const { emails, groupName, isTeamMeeting, teamName, directAccess } = req.body;
    
    // NYTT: Input validation
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Email list is required' });
    }
    
    if (emails.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 invitations per request' });
    }
    
    // Validera varje email
    for (const email of emails) {
      if (!validateEmail(email)) {
        return res.status(400).json({ error: `Invalid email: ${email}` });
      }
    }
    
    if (!validateGroupName(groupName || teamName)) {
      return res.status(400).json({ error: 'Group name is required and must be less than 255 characters' });
    }
    
    const creatorEmail = req.session.user.email;
    const creatorToken = req.session.user.accessToken;
    
    if (!creatorEmail || !creatorToken) {
      return res.status(401).json({ error: 'User session invalid' });
    }

    // Bestäm provider baserat på användarens inloggningsmetod (kan utvidgas senare)
    const creatorProvider = 'google'; // Standard, kan uppdateras när vi har mer info
    
    // Skapa grupp i Firebase
    const groupId = await createGroup({
      creatorEmail,
      creatorToken,
      creatorProvider,
      groupName: groupName || teamName || 'Namnlös grupp',
      tokens: [creatorToken],
      joinedEmails: [creatorEmail],
      isTeamMeeting: isTeamMeeting || false,
      teamName: teamName || null,
      directAccess: directAccess || false
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
      directAccess: directAccess || false
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
    // NYTT: Dölja intern info från klient
    res.status(500).json({ error: 'Failed to create invitation. Please try again.' });
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

// ===== VOTE ENDPOINT - ENDAST EN VERSION =====
app.post('/api/group/:groupId/suggestion/:suggestionId/vote', async (req, res) => {
  try {
    const { groupId, suggestionId } = req.params;
    const { email, vote } = req.body;
    
    // Input validation
    if (!groupId || !suggestionId || !email || !vote) {
      return res.status(400).json({ error: 'Saknade fält' });
    }
    
    if (!['accepted', 'declined'].includes(vote)) {
      return res.status(400).json({ error: 'Ogiltig röst' });
    }

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
    
    // Returnera omedelbart
    const updatedSuggestion = await getSuggestion(suggestionId);
    res.json({ success: true, suggestion: updatedSuggestion });
    
    // Asynkron kalenderskapande - Blockera INTE response
    if (allAccepted && !suggestion.finalized) {
      handleAllAccepted(groupId, suggestionId, group, allEmails).catch(err => {
        console.error('Error in handleAllAccepted:', err);
      });
    }
  } catch (error) {
    console.error('Error voting on suggestion:', error);
    res.status(500).json({ error: 'Kunde inte rösta på förslag' });
  }
});

// NYTT: Separerad funktion för kalenderskapande (non-blocking)
async function handleAllAccepted(groupId, suggestionId, group, allEmails) {
  try {
    const suggestion = await getSuggestion(suggestionId);
    if (suggestion.finalized) return; // Redan behandlad

    await updateSuggestion(suggestionId, {
      finalized: true,
      status: 'processing'
    });

    const meetEventId = suggestionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
    const tokens = (group.tokens || []).filter(Boolean);
    
    if (!tokens.length) {
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

    // Skapa FÖRSTA eventet för att få Meet-länken
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
        const msEventData = {
          ...baseEventData,
          conferenceData: suggestion.withMeet ? { createRequest: { requestId: meetEventId } } : undefined
        };
        result = await createMicrosoftCalendarEvent(token, msEventData);
      } else {
        if (meetingType === 'teams') {
          console.log('Creating Google event WITHOUT Meet (Teams will be used from MS user)');
          const googleEventData = { ...baseEventData };
          result = await createGoogleCalendarEvent(token, googleEventData, null);
        } else {
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
            
            if (result?.meetLink) {
              unifiedMeetLink = result.meetLink;
              console.log(`📹 Master Meet link created: ${unifiedMeetLink}`);
            }
          } else {
            console.log('Creating Google event WITH EXISTING Meet link:', unifiedMeetLink);
            const googleEventData = { ...baseEventData };
            result = await createGoogleCalendarEvent(token, googleEventData, unifiedMeetLink);
          }
        }
      }
      
      if (result?.success) {
        console.log(`✅ Event created for participant ${i + 1} (${provider})`);
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
      meetingType,
      finalized: true,
      status: 'completed'
    });

    // Bygg mejltext
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
    console.error('handleAllAccepted error:', err);
    await updateSuggestion(suggestionId, {
      finalized: true,
      status: 'error',
      error: err.message
    });
  }
}

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
    try {
      const res = prov === 'google'
        ? await fetchGoogleEvents(token, timeMinISO, timeMaxISO)
        : await fetchMicrosoftEvents(token, timeMinISO, timeMaxISO);

      if (res.ok && res.events.length > 0) {
        const busy = prov === 'google'
          ? normalizeGoogleEventsToBusy(res.events)
          : normalizeMicrosoftEventsToBusy(res.events);
        return { provider: prov, busy };
      }

      // FIXA: Hantera token expiry
      if (res.status === 401 || res.status === 403) {
        console.log(`⚠️ Token expired for ${prov}`);
        continue; // Försök nästa provider
      }
    } catch (err) {
      console.error(`Error fetching ${prov} events:`, err.message);
      continue; // Försök nästa
    }
  }
  
  return { provider: detected, busy: [] };
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});