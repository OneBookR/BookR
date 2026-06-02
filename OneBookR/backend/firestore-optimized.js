// firestore-optimized.js - Optimerad version för att minska Firebase reads
import admin from 'firebase-admin';
import { initializeApp, cert } from 'firebase-admin/app';

let db = null;
let isInitialized = false;

// Cache för att minska upprepade queries
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minuter

function initializeFirebase() {
  if (isInitialized) return;
  
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  
  const serviceAccount = {
    type: process.env.FIREBASE_TYPE || 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: privateKey,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  };

  try {
    initializeApp({ credential: cert(serviceAccount) });
    db = admin.firestore();
    isInitialized = true;
    console.log('✅ Firebase optimized version initialized');
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
    throw error;
  }
}

function getDb() {
  if (!db) throw new Error('Firebase not initialized');
  return db;
}

// Cache helper
function getCached(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// OPTIMERADE FUNKTIONER

// Använd cache för waitlist count
async function getWaitlistCount() {
  const cacheKey = 'waitlist_count';
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;
  
  const snapshot = await getDb().collection('waitlist').get();
  const count = snapshot.size;
  setCache(cacheKey, count);
  return count;
}

// Begränsa queries med limit
async function getWaitlist(limit = 50) {
  try {
    const snapshot = await getDb().collection('waitlist')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('Error getting waitlist:', err);
    throw err;
  }
}

// Batch operations för att minska writes
async function batchCreateInvitations(invitations) {
  const batch = getDb().batch();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);
  
  const invitationIds = [];
  
  invitations.forEach(invitationData => {
    const docRef = getDb().collection('invitations').doc();
    batch.set(docRef, {
      ...invitationData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: expiresAt,
      responded: false,
      accepted: false
    });
    invitationIds.push(docRef.id);
  });
  
  await batch.commit();
  return invitationIds;
}

// Optimerad query för invitations med cache
async function getInvitationsByEmail(email) {
  const cacheKey = `invitations_${email}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;
  
  try {
    const snapshot = await getDb().collection('invitations')
      .where('email', '==', email)
      .where('responded', '==', false)
      .limit(20) // Begränsa antal
      .get();
    
    const invitations = snapshot.docs
      .map(doc => ({ 
        id: doc.id, 
        ...doc.data(), 
        createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt 
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    setCache(cacheKey, invitations);
    return invitations;
  } catch (error) {
    console.error('Error fetching invitations:', error);
    return [];
  }
}

// Använd exists() istället för get() när möjligt
async function checkEmailInWaitlist(email) {
  const cacheKey = `waitlist_exists_${email}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;
  
  const docRef = getDb().collection('waitlist').doc(email);
  const docSnap = await docRef.get();
  const exists = docSnap.exists;
  
  setCache(cacheKey, exists);
  return exists;
}

// Batch delete för cleanup
async function cleanupExpiredInvitations() {
  const now = new Date();
  const snapshot = await getDb().collection('invitations')
    .where('expiresAt', '<', now)
    .limit(100) // Process in batches
    .get();
  
  if (snapshot.empty) return 0;
  
  const batch = getDb().batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  
  await batch.commit();
  console.log(`🧹 Cleaned up ${snapshot.size} expired invitations`);
  return snapshot.size;
}

// Rensa cache periodiskt
function clearCache() {
  cache.clear();
  console.log('🧹 Cache cleared');
}

// Exportera optimerade funktioner
export {
  initializeFirebase,
  getWaitlistCount,
  getWaitlist,
  batchCreateInvitations,
  getInvitationsByEmail,
  checkEmailInWaitlist,
  cleanupExpiredInvitations,
  clearCache
};