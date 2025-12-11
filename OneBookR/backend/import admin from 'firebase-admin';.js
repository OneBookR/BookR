import admin from 'firebase-admin';

// ✅ SÄKER SINGLETON INITIALISERING
let db = null;
let isInitialized = false;
let initPromise = null;

export async function initializeFirebase() {
  if (isInitialized && db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log('[Firebase] Initializing...');
      
      // ✅ ANVÄND RAILWAY SECRETS ISTÄLLET FÖR ENV
      const serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        // ✅ SÄKER PRIVATE KEY HANTERING
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
      };

      // ✅ KONTROLLERA ATT CREDENTIALS FINNS
      if (!serviceAccount.private_key || !serviceAccount.client_email) {
        throw new Error('Missing Firebase credentials in environment variables');
      }

      // ✅ INITIERA ADMIN SDK EN GÅNG
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID
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
      console.error('[Firebase] ❌ Initialization failed:', error);
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

// ✅ OPTIMERAD BATCH OPERATIONS
async function batchOperation(operations, batchSize = 500) {
  const batches = [];
  for (let i = 0; i < operations.length; i += batchSize) {
    const batch = getDb().batch();
    const chunk = operations.slice(i, i + batchSize);
    
    chunk.forEach(op => {
      switch (op.type) {
        case 'set':
          batch.set(op.ref, op.data, op.options || {});
          break;
        case 'update':
          batch.update(op.ref, op.data);
          break;
        case 'delete':
          batch.delete(op.ref);
          break;
      }
    });
    
    batches.push(batch.commit());
  }
  
  return Promise.all(batches);
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
      .limit(1000) // ✅ BEGRÄNSA ANTAL
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
      expiresAt,
      responded: false,
      accepted: false,
      directAccess: Boolean(invitationData.directAccess)
    };
    
    await docRef.set(sanitizedData);
    
    // ✅ SCHEDULE AUTO-CLEANUP
    setTimeout(async () => {
      try {
        const doc = await docRef.get();
        if (doc.exists && !doc.data().responded) {
          await docRef.delete();
          console.log(`[Cleanup] Expired invitation deleted: ${docRef.id}`);
        }
      } catch (err) {
        console.error('[Cleanup] Failed to delete expired invitation:', err);
      }
    }, 14 * 24 * 60 * 60 * 1000);
    
    return docRef.id;
  } catch (err) {
    console.error('[Firestore] Invitation creation failed:', err);
    throw err;
  }
}

// ✅ EXPORT ALL FUNCTIONS
export {
  batchOperation,
  getWaitlist,
  createGroup,
  createInvitation,
  // ...existing exports...
};
