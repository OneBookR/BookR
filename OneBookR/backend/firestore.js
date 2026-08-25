// firestore.js
import admin from 'firebase-admin';

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
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
    
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
  
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt }))
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
async function createUser(email, provider = 'google') {
  try {
    await getDb().collection('users').doc(email).set({
      email,
      provider,
      firstLogin: admin.firestore.FieldValue.serverTimestamp(),
      lastLogin: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Error creating user:', err);
    throw err;
  }
}

async function getUser(email) {
  try {
    const docRef = getDb().collection('users').doc(email);
    const docSnap = await docRef.get();
    return docSnap.exists ? { id: docSnap.id, ...docSnap.data() } : null;
  } catch (err) {
    console.error('Error getting user:', err);
    throw err;
  }
}

async function updateUserLastLogin(email) {
  try {
    const docRef = getDb().collection('users').doc(email);
    await docRef.update({
      lastLogin: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Error updating user login:', err);
    throw err;
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
  const sanitizedData = {
    companyName: data.companyName.trim().substring(0, 200),
    contactName: data.contactName.trim().substring(0, 200),
    email: data.email.toLowerCase().trim(),
    phone: data.phone?.trim().substring(0, 50) || null,
    address: data.address?.trim().substring(0, 300) || null,
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

  // Demo Bookings
  createDemoBooking,
  getDemoBooking,
  updateDemoBooking,
  markDemoLoginStarted,
  markDemoLoginCompleted,
  markDemoCalendarViewed
};
