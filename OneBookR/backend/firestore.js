// firestore.js
import admin from 'firebase-admin';
import { currentPeriodKey } from './plans.js';

// ✅ ROBUST INITIALIZATION WITH ERROR HANDLING
let db = null;
let isInitialized = false;
let initPromise = null;

function getFirebaseConfigFromEnv() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    return {
      ...serviceAccount,
      private_key: serviceAccount.private_key?.replace(/\\n/g, '\n')
    };
  }

  return {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
    token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
  };
}

export async function initializeFirebase() {
  if (isInitialized && db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log('[Firebase] Initializing...');
      const firebaseConfig = getFirebaseConfigFromEnv();

      if (!firebaseConfig.project_id || !firebaseConfig.private_key || !firebaseConfig.client_email) {
        throw new Error('Firebase service account is missing required environment variables');
      }

      // ✅ INITIERA ADMIN SDK EN GÅNG
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(firebaseConfig),
          projectId: firebaseConfig.project_id
        });
      }

      db = admin.firestore();
      
      // ✅ SÄTT FIRESTORE INSTÄLLNINGAR FÖR BÄTTRE PRESTANDA
      db.settings({
        ignoreUndefinedProperties: true,
        timestampsInSnapshots: true
      });

      isInitialized = true;
      console.log('[Firebase] ✅ Initialized successfully');
      return db;
      
    } catch (error) {
      console.error('[Firebase] ❌ Initialization failed:', error.message);
      isInitialized = false;
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

// ✅ SÄKER DB ACCESS
function getDb() {
  if (!db || !isInitialized) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return db;
}

// ✅ CACHE-OPTIMERAD WAITLIST
const waitlistCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getWaitlist() {
  const cacheKey = 'waitlist_all';
  const cached = waitlistCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }
  
  try {
    const snapshot = await getDb()
      .collection('waitlist')
      .orderBy('createdAt', 'desc')
      .limit(1000)
      .get();
      
    const data = snapshot.docs.map(doc => ({ 
      id: doc.id, 
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || null
    }));
    
    waitlistCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (err) {
    console.error('[Firestore] Waitlist fetch error:', err);
    throw err;
  }
}

async function addToWaitlist(email, name, referredBy = null) {
  try {
    await getDb().collection('waitlist').doc(email).set({
      email,
      name,
      referredBy,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Error adding to waitlist:', err);
    throw err;
  }
}

async function checkEmailInWaitlist(email) {
  const docSnap = await getDb().collection('waitlist').doc(email).get();
  return docSnap.exists;
}

async function getWaitlistCount() {
  const snapshot = await getDb().collection('waitlist').get();
  return snapshot.size;
}

// ✅ SÄKER GROUP OPERATIONS MED VALIDATION
async function createGroup(groupData) {
  // ✅ INPUT VALIDATION
  if (!groupData.name || typeof groupData.name !== 'string') {
    throw new Error('Group name is required and must be a string');
  }
  
  if (!groupData.creator || typeof groupData.creator !== 'string') {
    throw new Error('Group creator is required');
  }
  
  if (groupData.name.length > 100) {
    throw new Error('Group name too long (max 100 characters)');
  }

  try {
    const docRef = getDb().collection('groups').doc();
    const sanitizedData = {
      name: groupData.name.trim(),
      creator: groupData.creator.toLowerCase().trim(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      memberCount: groupData.memberCount || 1,
      status: 'active'
    };
    
    await docRef.set(sanitizedData);
    console.log(`[Firestore] ✅ Group created: ${docRef.id}`);
    return docRef.id;
  } catch (err) {
    console.error('[Firestore] Group creation failed:', err);
    throw err;
  }
}

async function getGroup(groupId) {
  const docRef = getDb().collection('groups').doc(groupId);
  const docSnap = await docRef.get();
  if (docSnap.exists) {
    return { id: docSnap.id, ...docSnap.data() };
  }
  return null;
}

async function updateGroup(groupId, updateData) {
  const docRef = getDb().collection('groups').doc(groupId);
  await docRef.update(updateData);
}

// ✅ SÄKER INVITATION MED AUTO-CLEANUP
async function createInvitation(invitationData) {
  // ✅ VALIDATION
  if (!invitationData.email || !invitationData.email.includes('@')) {
    throw new Error('Valid email is required');
  }
  
  if (!invitationData.groupId || typeof invitationData.groupId !== 'string') {
    throw new Error('Group ID is required');
  }

  try {
    const docRef = getDb().collection('invitations').doc();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dagar
    
    const sanitizedData = {
      email: invitationData.email.toLowerCase().trim(),
      groupId: invitationData.groupId,
      fromEmail: invitationData.fromEmail?.toLowerCase().trim(),
      groupName: invitationData.groupName?.substring(0, 100) || 'Unnamed Group',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: expiresAt,
      responded: false,
      accepted: false,
      directAccess: Boolean(invitationData.directAccess)
    };
    
    await docRef.set(sanitizedData);
    
    console.log(`[Firestore] ✅ Invitation created: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error('Error creating invitation:', error);
    throw error;
  }
}

async function getInvitationsByEmail(email) {
  const snapshot = await getDb().collection('invitations')
    .where('email', '==', email)
    .where('responded', '==', false)
    .get();

  const now = new Date();
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt }))
    // ✅ Gamla/utgångna inbjudningar (expiresAt passerat) filtreras bort här
    // istället för att raderas — de ligger kvar i Firestore om man skulle
    // behöva slå upp dem, men skräpar inte längre ner "Väntar på dig".
    // Inbjudningar utan expiresAt (borde inte förekomma, men failsafe) visas.
    .filter(inv => {
      if (!inv.expiresAt) return true;
      const expiry = inv.expiresAt.toDate?.() || new Date(inv.expiresAt);
      return expiry > now;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getInvitationsByGroup(groupId) {
  const snapshot = await getDb().collection('invitations').where('groupId', '==', groupId).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function updateInvitation(invitationId, updateData) {
  const docRef = getDb().collection('invitations').doc(invitationId);
  await docRef.update(updateData);
}

// ✅ Markerar en inbjudan som besvarad (accept/decline) — så den slutar
// dyka upp i mottagarens "Väntar på dig"-lista. Gör INTE själva
// gruppmedlemskapet (det sker separat, via /api/group/:groupId/join).
async function respondToInvitation(invitationId, response) {
  const docRef = getDb().collection('invitations').doc(invitationId);
  await docRef.update({
    responded: true,
    accepted: response === 'accept',
    respondedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function validateAndAcceptInvitation(invitationId) {
  try {
    const docRef = getDb().collection('invitations').doc(invitationId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return { valid: false, error: 'Invitation not found' };
    }
    
    const invitationData = docSnap.data();
    
    // Kontrollera expiry
    if (invitationData.expiresAt) {
      const expiryTime = invitationData.expiresAt.toDate?.() || new Date(invitationData.expiresAt);
      if (new Date() > expiryTime) {
        console.warn('[Invitations] Expired invitation attempt:', invitationId);
        return { valid: false, error: 'Invitation has expired. Ask for a new invite.' };
      }
    }
    
    // Markera som accepterad
    await docRef.update({
      responded: true,
      accepted: true,
      respondedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { valid: true, invitation: invitationData };
  } catch (error) {
    console.error('Error validating invitation:', error);
    return { valid: false, error: 'Validation failed' };
  }
}

async function getInvitation(invitationId) {
  try {
    const docRef = getDb().collection('invitations').doc(invitationId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return null;
    }
    
    return { id: docSnap.id, ...docSnap.data() };
  } catch (error) {
    console.error('Error getting invitation:', error);
    return null;
  }
}

// ✅ SUGGESTIONS OPERATIONS
async function createSuggestion(suggestionData) {
  const docRef = getDb().collection('suggestions').doc();
  await docRef.set({
    ...suggestionData,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    finalized: false,
    votes: suggestionData.votes || {}
  });
  return docRef.id;
}

async function getSuggestionsByGroup(groupId) {
  const snapshot = await getDb().collection('suggestions').where('groupId', '==', groupId).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function updateSuggestion(suggestionId, updateData) {
  const docRef = getDb().collection('suggestions').doc(suggestionId);
  await docRef.update(updateData);
}

async function getSuggestion(suggestionId) {
  const docRef = getDb().collection('suggestions').doc(suggestionId);
  const docSnap = await docRef.get();
  return docSnap.exists ? { id: docSnap.id, ...docSnap.data() } : null;
}

// ✅ BUSINESS OPERATIONS
async function createBusiness(businessData) {
  const docRef = getDb().collection('businesses').doc();
  await docRef.set({
    ...businessData,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return docRef.id;
}

async function getBusinessByCode(bookingCode) {
  const snapshot = await getDb().collection('businesses').where('bookingCode', '==', bookingCode).get();
  if (snapshot.empty) return null;
  
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function getBusinessByEmail(googleEmail) {
  const snapshot = await getDb().collection('businesses').where('googleEmail', '==', googleEmail).get();
  if (snapshot.empty) return null;
  
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function updateBusiness(businessId, updateData) {
  const docRef = getDb().collection('businesses').doc(businessId);
  await docRef.update(updateData);
}

// ✅ USER OPERATIONS
// 🐛 KRITISK BUGFIX: körde tidigare .set() UTAN merge:true — dvs en total
// dokumentöverskrivning. Eftersom detta anropas vid VARJE inloggning
// (Google/Microsoft OAuth-callbacken, oavsett om användaren redan fanns)
// raderade det tyst plan, billingStatus, appAccess, calendarDetailsConsent,
// leadProfileStatus och directAccessRefreshToken/-Provider för ALLA
// användare varje gång de loggade in igen — upptäckt när gustav@onebookr.se
// och av.goransson@gmail.com (manuellt satta till Enterprise för test)
// föll tillbaka till Free direkt efter nästa inloggning. Motsvarande hade
// tystat riktiga betalande kunders plan/appAccess i produktion. Nu: läs
// först, skriv bara firstLogin en gång, merge:true på allt annat så
// befintliga fält aldrig rörs. Docid lowercased för att garanterat matcha
// samma nyckel som getUserBilling/setUserBilling m.fl. använder.
async function createUser(email, provider = 'google') {
  try {
    const key = email.toLowerCase().trim();
    const docRef = getDb().collection('users').doc(key);
    const docSnap = await docRef.get();
    await docRef.set({
      email: key,
      provider,
      lastLogin: admin.firestore.FieldValue.serverTimestamp(),
      ...(docSnap.exists ? {} : { firstLogin: admin.firestore.FieldValue.serverTimestamp() })
    }, { merge: true });
  } catch (err) {
    console.error('Error creating user:', err);
    throw err;
  }
}

async function getUser(email) {
  try {
    const docRef = getDb().collection('users').doc(email.toLowerCase().trim());
    const docSnap = await docRef.get();
    return docSnap.exists ? { id: docSnap.id, ...docSnap.data() } : null;
  } catch (err) {
    console.error('Error getting user:', err);
    throw err;
  }
}

async function updateUserLastLogin(email) {
  try {
    // set+merge (inte update) och samma lowercased docid som createUser —
    // annars kastar update() "No document to update" för alla vars raw
    // e-post skiljer sig i skiftläge från den lowercasade nyckeln createUser
    // skriver under.
    const docRef = getDb().collection('users').doc(email.toLowerCase().trim());
    await docRef.set({
      lastLogin: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error('Error updating user login:', err);
    throw err;
  }
}

// ✅ BILLING — Stripe-synkad plan-status på user-doc:et. Skrivs bara av
// Stripe-webhooken (server.js), aldrig av frontend. merge:true så doc:et
// skapas om webhooken skulle hinna före första inloggningen.
async function setUserBilling(email, data) {
  try {
    await getDb().collection('users').doc(email.toLowerCase().trim()).set({
      ...data,
      billingUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error('Error setting user billing:', err);
    throw err;
  }
}

async function getUserBilling(email) {
  try {
    const docSnap = await getDb().collection('users').doc(email.toLowerCase().trim()).get();
    if (!docSnap.exists) return { plan: 'free', billingStatus: null, appAccess: false, leadProfileStatus: null, calendarDetailsConsent: false };
    const d = docSnap.data();
    return {
      plan: d.plan || 'free',
      billingStatus: d.billingStatus || null,
      stripeCustomerId: d.stripeCustomerId || null,
      stripeSubscriptionId: d.stripeSubscriptionId || null,
      billingPeriodEnd: d.billingPeriodEnd || null,
      seats: d.seats || null,
      // ✅ Permanent flagga: kontot har en gång beviljats åtkomst (Free-
      // signup fullföljd, eller betald plan) — skiljer det från en
      // user-doc som bara skapades av att någon FÖRSÖKTE logga in.
      appAccess: Boolean(d.appAccess),
      // ✅ 'completed' | 'skipped' | null — om lead-profil-popupen redan
      // besvarats/avfärdats, så vi aldrig frågar samma person igen.
      leadProfileStatus: d.leadProfileStatus || null,
      // ✅ Explicit, återkalleligt samtycke till att BookR läser TITEL och
      // tid på kalenderhändelser för "Kommande möten"-kortet på
      // dashboarden — helt separat från kärnfunktionen (kalenderjämförelse),
      // som aldrig läser mer än ledigt/upptaget. Se /api/calendar/upcoming.
      calendarDetailsConsent: Boolean(d.calendarDetailsConsent)
    };
  } catch (err) {
    console.error('Error getting user billing:', err);
    return { plan: 'free', billingStatus: null, appAccess: false, leadProfileStatus: null, calendarDetailsConsent: false };
  }
}

// ✅ LEAD-PROFIL — viktig marknadsföringskanal: när en INBJUDEN person (inte
// skaparen) kommer in i BookR via en delad länk, fångar vi en snabb
// företagsprofil (bransch, antal anställda, företagsnamn) + vem som bjöd
// in dem (invitedBy — viral-loop-attribution: vilka kunder som faktiskt
// drar in nya). Egen collection, ett dokument per besvarad popup.
async function saveLeadProfile(data) {
  try {
    const docRef = getDb().collection('lead_profiles').doc();
    await docRef.set({
      email: data.email.toLowerCase().trim(),
      name: data.name || null,
      provider: data.provider || null,
      groupId: data.groupId || null,
      invitedBy: data.invitedBy ? data.invitedBy.toLowerCase().trim() : null,
      bransch: data.bransch,
      employees: data.employees,
      companyName: data.companyName,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
  } catch (err) {
    console.error('Error saving lead profile:', err);
    throw err;
  }
}

async function setLeadProfileStatus(email, status) {
  try {
    await getDb().collection('users').doc(email.toLowerCase().trim()).set({
      leadProfileStatus: status // 'completed' | 'skipped'
    }, { merge: true });
  } catch (err) {
    console.error('Error setting lead profile status:', err);
  }
}

// ✅ Sätter/återkallar samtycket till att läsa mötestitlar för
// "Kommande möten"-kortet. En egen, granulär flagga — skild från kontots
// grundläggande åtkomst — eftersom det är ett explicit undantag från
// integritetspolicyns löfte om att aldrig läsa kalenderinnehåll.
async function setCalendarDetailsConsent(email, consent) {
  try {
    await getDb().collection('users').doc(email.toLowerCase().trim()).set({
      calendarDetailsConsent: Boolean(consent),
      calendarDetailsConsentAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error('Error setting calendar details consent:', err);
    throw err;
  }
}

// ✅ ANVÄNDNING — sessioner/månad per plan (se plans.js). En doc per
// användare+månad ('usage_monthly/{email}_{YYYY-MM}'), atomisk increment
// via transaktion så två samtidiga requests inte båda kan slinka under
// gränsen. sessionsPerMonth=null (obegränsat) konsumerar aldrig — vi
// räknar ändå för statistikens skull, men nekar aldrig.
async function checkAndConsumeSession(email, sessionsPerMonth) {
  const normalizedEmail = email.toLowerCase().trim();
  const periodKey = currentPeriodKey();
  const docRef = getDb().collection('usage_monthly').doc(`${normalizedEmail}_${periodKey}`);

  return getDb().runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const used = snap.exists ? (snap.data().sessionsUsed || 0) : 0;

    if (sessionsPerMonth !== null && used >= sessionsPerMonth) {
      return { allowed: false, used, limit: sessionsPerMonth };
    }

    tx.set(docRef, {
      email: normalizedEmail,
      periodKey,
      sessionsUsed: used + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { allowed: true, used: used + 1, limit: sessionsPerMonth };
  });
}

async function getMonthlyUsage(email) {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const periodKey = currentPeriodKey();
    const docSnap = await getDb().collection('usage_monthly').doc(`${normalizedEmail}_${periodKey}`).get();
    return { periodKey, sessionsUsed: docSnap.exists ? (docSnap.data().sessionsUsed || 0) : 0 };
  } catch (err) {
    console.error('Error getting monthly usage:', err);
    return { periodKey: currentPeriodKey(), sessionsUsed: 0 };
  }
}

// ✅ BOOKING SESSIONS
async function createBookingSession(sessionData) {
  const docRef = getDb().collection('booking_sessions').doc();
  await docRef.set({
    ...sessionData,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    status: 'active'
  });
  return docRef.id;
}

async function getBookingSession(sessionId) {
  const docRef = getDb().collection('booking_sessions').doc(sessionId);
  const docSnap = await docRef.get();
  return docSnap.exists ? { id: docSnap.id, ...docSnap.data() } : null;
}

async function updateBookingSession(sessionId, updateData) {
  const docRef = getDb().collection('booking_sessions').doc(sessionId);
  await docRef.update(updateData);
}

// ✅ DATA DELETION (GDPR)
async function deleteUserData(email) {
  const batch = getDb().batch();

  const userDoc = getDb().collection('users').doc(email);
  batch.delete(userDoc);

  const groupsQuery = getDb().collection('groups').where('creator', '==', email);
  const groupsSnapshot = await groupsQuery.get();
  groupsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

  const invitationsQuery = getDb().collection('invitations').where('email', '==', email);
  const invitationsSnapshot = await invitationsQuery.get();
  invitationsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

  const suggestionsQuery = getDb().collection('suggestions').where('fromEmail', '==', email);
  const suggestionsSnapshot = await suggestionsQuery.get();
  suggestionsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

  const businessQuery = getDb().collection('businesses').where('googleEmail', '==', email);
  const businessSnapshot = await businessQuery.get();
  businessSnapshot.docs.forEach(doc => batch.delete(doc.ref));

  await batch.commit();
}

// ✅ AUDIT LOGGING
async function logDataAccess(action, userEmail, targetEmail, dataType) {
  try {
    const docRef = getDb().collection('audit_logs').doc();
    await docRef.set({
      action,
      userEmail,
      targetEmail,
      dataType,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ip: null
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// ✅ ACTIVE GROUPS PERSISTENCE (For group state across restarts)
async function saveActiveGroup(groupId, groupData) {
  const docRef = getDb().collection('active_groups').doc(groupId);
  await docRef.set(groupData, { merge: true });
}

async function deleteActiveGroup(groupId) {
  const docRef = getDb().collection('active_groups').doc(groupId);
  await docRef.delete();
}

async function loadAllActiveGroups() {
  const snapshot = await getDb().collection('active_groups').get();
  const groups = new Map();
  snapshot.docs.forEach(doc => {
    groups.set(doc.id, doc.data());
  });
  return groups;
}

async function getActiveGroupsByEmail(email) {
  const snapshot = await getDb().collection('active_groups')
    .where('members', 'array-contains', { email })
    .get();
  const groups = new Map();
  snapshot.docs.forEach(doc => {
    groups.set(doc.id, doc.data());
  });
  return groups;
}

// ✅ ADMIN CALENDAR TOKEN (BookRs egen kalender för demo-flödet)
// Enda dokumentet i collectionen — doc-id 'primary'. refreshToken lagras
// redan krypterad av anroparen (server.js), denna modulen är bara ett
// tunt Firestore-lager utan egen kryptologik.
async function saveAdminCalendarToken(data) {
  if (!data.refreshToken) {
    throw new Error('refreshToken is required');
  }
  if (!data.provider || !['google', 'microsoft'].includes(data.provider)) {
    throw new Error('provider must be "google" or "microsoft"');
  }
  const docRef = getDb().collection('admin_calendar').doc('primary');
  await docRef.set({
    provider: data.provider,
    email: data.email || null,
    refreshToken: data.refreshToken,
    connectedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function getAdminCalendarToken() {
  const docRef = getDb().collection('admin_calendar').doc('primary');
  const docSnap = await docRef.get();
  if (!docSnap.exists) return null;
  return docSnap.data();
}

// ===== DIREKTÅTKOMST — engångskoppling av en ANVÄNDARES egen kalender =====
// Samma idé som admin_calendar ovan (offline refresh-token så BookR kan
// hämta färsk data utan att personen är inloggad just då), men per
// kontaktperson och helt frivilligt — sätts bara efter att personen själv
// skickat eller accepterat en direktåtkomst-förfrågan. refreshToken kommer
// redan krypterad från anroparen (server.js), precis som admin-varianten.
async function saveDirectAccessToken(email, { provider, refreshToken }) {
  if (!refreshToken) throw new Error('refreshToken is required');
  if (!provider || !['google', 'microsoft'].includes(provider)) {
    throw new Error('provider must be "google" or "microsoft"');
  }
  await getDb().collection('users').doc(email.toLowerCase().trim()).set({
    directAccessProvider: provider,
    directAccessRefreshToken: refreshToken,
    directAccessConnectedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function getStoredDirectAccessToken(email) {
  const docSnap = await getDb().collection('users').doc(email.toLowerCase().trim()).get();
  if (!docSnap.exists) return null;
  const d = docSnap.data();
  if (!d.directAccessRefreshToken) return null;
  return { provider: d.directAccessProvider || 'google', refreshToken: d.directAccessRefreshToken };
}

// ✅ Förfrågningar om direktåtkomst — samma form/mönster som `invitations`
// (createInvitation ovan), egen collection eftersom det är en annan sorts
// relation (varaktig, ömsesidig kalenderkoppling — inte en engångs
// gruppinbjudan).
async function createDirectAccessRequest(fromEmail, toEmail) {
  const docRef = getDb().collection('direct_access_requests').doc();
  await docRef.set({
    fromEmail: fromEmail.toLowerCase().trim(),
    toEmail: toEmail.toLowerCase().trim(),
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    respondedAt: null
  });
  return docRef.id;
}

// Obesvarade förfrågningar — både mottagna och skickade, så Team-sidan kan
// visa båda ("väntar på svar" respektive "väntar på dig").
async function getDirectAccessRequestsFor(email) {
  const e = email.toLowerCase().trim();
  const [received, sent] = await Promise.all([
    getDb().collection('direct_access_requests').where('toEmail', '==', e).where('status', '==', 'pending').get(),
    getDb().collection('direct_access_requests').where('fromEmail', '==', e).where('status', '==', 'pending').get()
  ]);
  const toDoc = (doc) => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt });
  return {
    received: received.docs.map(toDoc),
    sent: sent.docs.map(toDoc)
  };
}

async function getDirectAccessRequest(requestId) {
  const docSnap = await getDb().collection('direct_access_requests').doc(requestId).get();
  if (!docSnap.exists) return null;
  return { id: docSnap.id, ...docSnap.data() };
}

async function respondToDirectAccessRequest(requestId, response) {
  await getDb().collection('direct_access_requests').doc(requestId).update({
    status: response === 'accept' ? 'accepted' : 'declined',
    respondedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

// sortedPairKey: deterministisk nyckel oavsett vem som frågar — gör "har A
// och B aktiv direktåtkomst?" till en enda dokument-läsning, ingen query.
function directAccessPairKey(emailA, emailB) {
  return [emailA.toLowerCase().trim(), emailB.toLowerCase().trim()].sort().join('__');
}

async function createDirectAccessLink(emailA, emailB) {
  const key = directAccessPairKey(emailA, emailB);
  await getDb().collection('direct_access_links').doc(key).set({
    emails: [emailA.toLowerCase().trim(), emailB.toLowerCase().trim()],
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return key;
}

async function getDirectAccessLink(emailA, emailB) {
  const docSnap = await getDb().collection('direct_access_links').doc(directAccessPairKey(emailA, emailB)).get();
  return docSnap.exists ? docSnap.data() : null;
}

async function listDirectAccessLinksFor(email) {
  const e = email.toLowerCase().trim();
  const snapshot = await getDb().collection('direct_access_links').where('emails', 'array-contains', e).get();
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return { pairKey: doc.id, withEmail: data.emails.find(x => x !== e), createdAt: data.createdAt?.toDate?.() || data.createdAt };
  });
}

async function revokeDirectAccessLink(emailA, emailB) {
  await getDb().collection('direct_access_links').doc(directAccessPairKey(emailA, emailB)).delete();
}

// ✅ DEMO BOOKINGS (leads från "Boka demo"-formuläret + bokningsstatus)
async function createDemoBooking(data) {
  if (!data.email || !data.email.includes('@')) {
    throw new Error('Valid email is required');
  }
  if (!data.companyName || typeof data.companyName !== 'string' || !data.companyName.trim()) {
    throw new Error('companyName is required');
  }
  if (!data.contactName || typeof data.contactName !== 'string' || !data.contactName.trim()) {
    throw new Error('contactName is required');
  }

  const docRef = getDb().collection('demo_bookings').doc();
  // leadType: 'demo' (standard) eller 'enterprise' (bokat via /enterprise —
  // då bär data även employees + seats för säljteamet).
  const leadType = data.leadType === 'enterprise' ? 'enterprise' : 'demo';
  const toPosInt = (v) => {
    const n = parseInt(String(v ?? '').replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 1000000) : null;
  };
  const sanitizedData = {
    companyName: data.companyName.trim().substring(0, 200),
    contactName: data.contactName.trim().substring(0, 200),
    email: data.email.toLowerCase().trim(),
    phone: data.phone?.trim().substring(0, 50) || null,
    address: data.address?.trim().substring(0, 300) || null,
    leadType,
    employees: leadType === 'enterprise' ? toPosInt(data.employees) : null,
    seats: leadType === 'enterprise' ? toPosInt(data.seats) : null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    booked: false,
    bookedAt: null,
    meetingStart: null,
    meetingEnd: null,
    // ✅ LEAD-TRATT: spårar var i flödet varje lead befinner sig, så man
    // kan se avhoppspunkter (t.ex. "många fyller i formuläret men avbryter
    // vid inloggning" vs. "loggar in men gillar inte det de ser i
    // kalenderjämförelsen") istället för bara ett binärt bokad/ej bokad.
    // loginProvider sätts av markDemoLoginStarted, resten av respektive
    // markDemo*-funktion nedan.
    loginProvider: null,
    loginStartedAt: null,
    loginCompletedAt: null,
    calendarViewedAt: null
  };
  await docRef.set(sanitizedData);
  return docRef.id;
}

// ✅ LEAD-TRATT: uppdaterar ett steg i tratten. Best-effort — fel här ska
// aldrig stoppa det faktiska bokningsflödet, bara ge sämre analytics.
async function markDemoLoginStarted(leadId, provider) {
  try {
    const docRef = getDb().collection('demo_bookings').doc(leadId);
    await docRef.update({
      loginProvider: provider,
      loginStartedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.warn('⚠️ markDemoLoginStarted failed:', err.message);
  }
}

async function markDemoLoginCompleted(leadId) {
  try {
    const docRef = getDb().collection('demo_bookings').doc(leadId);
    await docRef.update({
      loginCompletedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.warn('⚠️ markDemoLoginCompleted failed:', err.message);
  }
}

async function markDemoCalendarViewed(leadId) {
  try {
    const docRef = getDb().collection('demo_bookings').doc(leadId);
    await docRef.update({
      calendarViewedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.warn('⚠️ markDemoCalendarViewed failed:', err.message);
  }
}

async function getDemoBooking(leadId) {
  if (!leadId || typeof leadId !== 'string') {
    throw new Error('leadId is required');
  }
  const docRef = getDb().collection('demo_bookings').doc(leadId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) return null;
  return { id: docSnap.id, ...docSnap.data() };
}

async function updateDemoBooking(leadId, updateData) {
  const docRef = getDb().collection('demo_bookings').doc(leadId);
  await docRef.update(updateData);
}

// ✅ EXPORT ALL FUNCTIONS - ENDAST EN GÅNG!
export {
  // Waitlist
  addToWaitlist,
  getWaitlist,
  checkEmailInWaitlist,
  getWaitlistCount,
  
  // Groups
  createGroup,
  getGroup,
  updateGroup,
  
  // Invitations
  createInvitation,
  getInvitationsByEmail,
  getInvitationsByGroup,
  updateInvitation,
  respondToInvitation,
  validateAndAcceptInvitation,
  getInvitation,
  
  // Suggestions
  createSuggestion,
  getSuggestionsByGroup,
  updateSuggestion,
  getSuggestion,
  
  // Business
  createBusiness,
  getBusinessByCode,
  getBusinessByEmail,
  updateBusiness,
  
  // Booking Sessions
  createBookingSession,
  getBookingSession,
  updateBookingSession,
  
  // Users
  createUser,
  getUser,
  updateUserLastLogin,

  // Billing (Stripe)
  setUserBilling,
  getUserBilling,

  // Usage (plan-gränser)
  checkAndConsumeSession,
  getMonthlyUsage,

  // Lead-profil (inbjudna via länk)
  saveLeadProfile,
  setLeadProfileStatus,

  // Kommande möten — samtycke till att läsa mötestitlar
  setCalendarDetailsConsent,

  // GDPR & Audit
  deleteUserData,
  logDataAccess,

  // Active Groups Persistence
  saveActiveGroup,
  deleteActiveGroup,
  loadAllActiveGroups,
  getActiveGroupsByEmail,

  // Admin Calendar Token (demo flow)
  saveAdminCalendarToken,
  getAdminCalendarToken,

  // Direktåtkomst
  saveDirectAccessToken,
  getStoredDirectAccessToken,
  createDirectAccessRequest,
  getDirectAccessRequestsFor,
  getDirectAccessRequest,
  respondToDirectAccessRequest,
  createDirectAccessLink,
  getDirectAccessLink,
  listDirectAccessLinksFor,
  revokeDirectAccessLink,

  // Demo Bookings
  createDemoBooking,
  getDemoBooking,
  updateDemoBooking,
  markDemoLoginStarted,
  markDemoLoginCompleted,
  markDemoCalendarViewed
};
