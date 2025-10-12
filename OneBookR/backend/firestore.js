// firestore.js
import { db } from './firebase.js';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  where
} from 'firebase/firestore';

// -----------------------------
// Väntelista
// -----------------------------

export async function addToWaitlist(email, name, referredBy = null) {
  try {
    console.log("Försöker lägga till:", { email, name, referredBy });
    await setDoc(doc(db, 'waitlist', email), {
      email,
      name,
      referredBy,
      timestamp: new Date()
    });
    console.log("Lyckades lägga till väntelista:", email);
  } catch (err) {
    console.error('Fel vid addToWaitlist:', err);
    throw err;
  }
}


// Hämta hela väntelistan, inklusive vem som värvat
export async function getWaitlist() {
  try {
    const q = query(collection(db, 'waitlist'), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        email: data.email,
        name: data.name,
        referredBy: data.referredBy || null,
        // Konvertera timestamp till ISO-sträng
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : 
                  data.timestamp instanceof Date ? data.timestamp.toISOString() : data.timestamp
      };
    });
    
    // Extra sortering på klientsidan för att säkerställa korrekt ordning
    return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (err) {
    console.error('Fel vid getWaitlist:', err);
    throw err;
  }
}


export async function checkEmailInWaitlist(email) {
  const docSnap = await getDoc(doc(db, 'waitlist', email));
  return docSnap.exists();
}

export async function getWaitlistCount() {
  const snapshot = await getDocs(collection(db, 'waitlist'));
  return snapshot.size;
}

// -----------------------------
// Grupper
// -----------------------------

export async function createGroup(groupData) {
  const docRef = await addDoc(collection(db, 'groups'), {
    ...groupData,
    createdAt: serverTimestamp()
  });
  return docRef.id;
}

export async function getGroup(groupId) {
  const docRef = doc(db, 'groups', groupId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate?.() || data.createdAt
    };
  }
  return null;
}

export async function updateGroup(groupId, updateData) {
  const docRef = doc(db, 'groups', groupId);
  await updateDoc(docRef, updateData);
}

// -----------------------------
// Inbjudningar
// -----------------------------

export async function createInvitation(invitationData) {
  const docRef = await addDoc(collection(db, 'invitations'), {
    ...invitationData,
    createdAt: serverTimestamp(),
    responded: false
  });
  return docRef.id;
}

export async function getInvitationsByEmail(email) {
  const q = query(
    collection(db, 'invitations'),
    where('email', '==', email),
    where('responded', '==', false)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getInvitationsByGroup(groupId) {
  const q = query(collection(db, 'invitations'), where('groupId', '==', groupId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function updateInvitation(invitationId, updateData) {
  const docRef = doc(db, 'invitations', invitationId);
  await updateDoc(docRef, updateData);
}

// -----------------------------
// Förslag
// -----------------------------

export async function createSuggestion(suggestionData) {
  const docRef = await addDoc(collection(db, 'suggestions'), {
    ...suggestionData,
    createdAt: serverTimestamp(),
    finalized: false,
    votes: suggestionData.votes || {}
  });
  return docRef.id;
}

export async function getSuggestionsByGroup(groupId) {
  const q = query(collection(db, 'suggestions'), where('groupId', '==', groupId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function updateSuggestion(suggestionId, updateData) {
  const docRef = doc(db, 'suggestions', suggestionId);
  await updateDoc(docRef, updateData);
}

export async function getSuggestion(suggestionId) {
  const docRef = doc(db, 'suggestions', suggestionId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
}

// -----------------------------
// Företag (Business)
// -----------------------------

export async function createBusiness(businessData) {
  const docRef = await addDoc(collection(db, 'businesses'), {
    ...businessData,
    createdAt: serverTimestamp()
  });
  return docRef.id;
}

export async function getBusinessByCode(bookingCode) {
  const q = query(collection(db, 'businesses'), where('bookingCode', '==', bookingCode));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

export async function getBusinessByEmail(googleEmail) {
  const q = query(collection(db, 'businesses'), where('googleEmail', '==', googleEmail));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

export async function updateBusiness(businessId, updateData) {
  const docRef = doc(db, 'businesses', businessId);
  await updateDoc(docRef, updateData);
}

// -----------------------------
// Bokningssessioner
// -----------------------------

export async function createBookingSession(sessionData) {
  const docRef = await addDoc(collection(db, 'booking_sessions'), {
    ...sessionData,
    createdAt: serverTimestamp(),
    status: 'active'
  });
  return docRef.id;
}

export async function getBookingSession(sessionId) {
  const docRef = doc(db, 'booking_sessions', sessionId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
}

export async function updateBookingSession(sessionId, updateData) {
  const docRef = doc(db, 'booking_sessions', sessionId);
  await updateDoc(docRef, updateData);
}

// -----------------------------
// Användare
// -----------------------------

export async function createUser(email, provider = 'google') {
  try {
    await setDoc(doc(db, 'users', email), {
      email,
      provider,
      firstLogin: serverTimestamp(),
      lastLogin: serverTimestamp()
    });
  } catch (err) {
    console.error('Fel vid createUser:', err);
    throw err;
  }
}

export async function getUser(email) {
  try {
    const docRef = doc(db, 'users', email);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
  } catch (err) {
    console.error('Fel vid getUser:', err);
    throw err;
  }
}

export async function updateUserLastLogin(email) {
  try {
    const docRef = doc(db, 'users', email);
    await updateDoc(docRef, {
      lastLogin: serverTimestamp()
    });
  } catch (err) {
    console.error('Fel vid updateUserLastLogin:', err);
    throw err;
  }
}

// -----------------------------
// GDPR – radera användardata
// -----------------------------

export async function deleteUserData(email) {
  const batch = [];

  // Användare
  const userDoc = doc(db, 'users', email);
  batch.push(deleteDoc(userDoc));

  // Grupper där användaren är skapare
  const groupsQuery = query(collection(db, 'groups'), where('creatorEmail', '==', email));
  const groupsSnapshot = await getDocs(groupsQuery);
  groupsSnapshot.docs.forEach(doc => batch.push(deleteDoc(doc.ref)));

  // Inbjudningar
  const invitationsQuery = query(collection(db, 'invitations'), where('email', '==', email));
  const invitationsSnapshot = await getDocs(invitationsQuery);
  invitationsSnapshot.docs.forEach(doc => batch.push(deleteDoc(doc.ref)));

  // Förslag
  const suggestionsQuery = query(collection(db, 'suggestions'), where('fromEmail', '==', email));
  const suggestionsSnapshot = await getDocs(suggestionsQuery);
  suggestionsSnapshot.docs.forEach(doc => batch.push(deleteDoc(doc.ref)));

  // Företag
  const businessQuery = query(collection(db, 'businesses'), where('googleEmail', '==', email));
  const businessSnapshot = await getDocs(businessQuery);
  businessSnapshot.docs.forEach(doc => batch.push(deleteDoc(doc.ref)));

  await Promise.all(batch);
}
