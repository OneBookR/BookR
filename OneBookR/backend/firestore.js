// firestore.js
import admin from 'firebase-admin';

// ✅ ROBUST INITIALIZATION WITH ERROR HANDLING
let db = null;
let isInitialized = false;
let initPromise = null;

export async function initializeFirebase() {
  if (isInitialized && db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log('[Firebase] Initializing...');
      
      // ✅ ANVÄND MILJÖVARIABLER ISTÄLLET FÖR JSON-FIL
      const firebaseConfig = {
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID || 'bookr-7a313',
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || 'd2b65834c90651d547045b5368aec4609b57bf22',
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || 
          '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDd1D9He8sqSU+g\nwATJPVyrnPE5dlxL33kR67IVlVFKsf21+R5HSzvh29i2n0j1/Ak0SVLBrAd6I5pb\na7Jm5NbrxnCJQd/87HRAE02kN3tfAUnNu78lIvlhHc5b0GYDsAQx5IEPtWpqrr6T\nQPOXjRM3QkqR2ZB5dzQR1xYsvEV/Az5paGgmmTMXyO+nQKNaH9Ohci46O5ISpuuk\n7Wm7uwX+3gwYitWiN1dbGolXykgaOocPSJMACQ5jSB4SCOTW3+bs4tfMt9+2CsM0\nWlKYGbAQYp+r26nXxKzqJGBgd/tW3sKdAD0jq9i+ojZ2v8wyZ6SPz7wYs1vhnXHJ\nBd0UrgVZAgMBAAECggEAFiaQY7gfVet4eZH4XbX0ZSiTR+HN8+pD7H+vdTXx+6D2\nt4SW5ZdEIANeylbxJ1Wm/6MbZz52iAI6csrix3aDZYttB6+zHk49iiZt+CoYINOq\nmydrvgQWMys8RMZ0YVrira67xSX1kziRds0jZdc5pijG9HXCq6EKazD3RGP6a+UR\n7xh7Jm6aTG6qV1XY40Do2iDN88aHrrsw6TOSZAPpJjWDS8+Jxxqo40nbaZEz2EMz\nvfL7oVNI9VNVSo8CQo67QojZkXmQ6czirD8w+RDUSu3I4bKElr64UjDlncFj3Oa3\niDQQ5L5jtS2UkoDzFZBBLWgDxJAGGMfgsqo4VAtSBwKBgQDvxxrIKTnjNx8LwxcU\n7eC0yptlVbt6pCMGjNKzDMNIN1YnZYRDNq1/khGclk8qxwhxH7XJoMhZS0bCmS9Z\n1j77afz3ha/JQtnSZI5T6SDP1qami0wiMLjys2Du+vV8cfjFxzCkgIJIA+5hqTwA\ntl7lO6VbETnHfd5fZwIAlhsTCwKBgQDs1kagSVnH3dyNKIcyssXNaXTpsMk2dlZf\n5hkgLU2dHEuBuqdfdKsqelt71fYt4vtEW3/5UCtUtrftPvs35FbqEQnSfrSXzTEe\nJS3Q3YSsJ6Hcu/HKqnGOvk01FsNqTLrIlQUTCoDQsu7BAwxNktcYn8tTmGsSyJvT\nm8pOBRkHqwKBgDy/mQ11RHFImdkFCGgJDJFBc7Vszx73Ttht/UPXy/IT8wPwOF4/\nEB3uCABAJLaVzpG6kvgOgDP/WmIbJWABY9uWsryTZkH7aexgBZ9ExUdi/r3bNOLE\nrVbwE3L4qhFpXrndCXnkBR3xwQeFNOqJSemR/wbfil/8h8Zr9pnnbdyZAoGBAJdo\nMQR9gBkHG91eIHhn046LMYPIUgowQu3R4xQwAiNDmH3Z/vBGXLquOFgFo/kX17yO\nplSTTPA+U30nO2Ey5+GBfP8Fo5w8QH9eE1kolI2eVJsRx/ThW/F+dUtQPyNw5CQh\nKHpQx6MkEQBxW2coTbxfQ5Qwp5r9hqkUOpQALE07AoGAS6PI83daIqFE47KG/sEW\ndjk1mmZ57BHUcLye2YPpnde5IH+kIcXlMPXkC3lWMCXELNemku7sjv3ZYIJB+bzj\nQT+06dYRPFuyTvJiidwx9G81Mu3CKzWiWB4AF052c9saYBrvNcXarAUmTXByk5V+\nuY9Nib9cokJePblBa01nNjc=\n-----END PRIVATE KEY-----\n',
        client_email: process.env.FIREBASE_CLIENT_EMAIL || 'firebase-adminsdk-fbsvc@bookr-7a313.iam.gserviceaccount.com',
        client_id: process.env.FIREBASE_CLIENT_ID || '105542045034087254652',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL || 
          'https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40bookr-7a313.iam.gserviceaccount.com'
      };

      // ✅ KONTROLLERA ATT CREDENTIALS FINNS
      if (!firebaseConfig.private_key || !firebaseConfig.client_email) {
        console.warn('[Firebase] ⚠️ Using fallback credentials from code');
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
  logDataAccess
};
