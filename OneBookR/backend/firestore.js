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

    return snapshot.docs.map(doc => {
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
// GDPR – radera användardata
// -----------------------------

export async function deleteUserData(email) {
  const batch = [];

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

  await Promise.all(batch);
}
