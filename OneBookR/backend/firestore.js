import { db } from './firebase.js';
import { 
  collection, 
  doc, 
  addDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  serverTimestamp 
} from 'firebase/firestore';

// Grupper
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
  return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
}

export async function updateGroup(groupId, updateData) {
  const docRef = doc(db, 'groups', groupId);
  await updateDoc(docRef, updateData);
}

// Inbjudningar
export async function createInvitation(invitationData) {
  const docRef = await addDoc(collection(db, 'invitations'), {
    ...invitationData,
    createdAt: serverTimestamp(),
    responded: false
  });
  return docRef.id;
}

export async function getInvitationsByEmail(email) {
  const q = query(collection(db, 'invitations'), where('email', '==', email));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.() || data.createdAt
    };
  });
}

export async function getInvitationsByGroup(groupId) {
  const q = query(collection(db, 'invitations'), where('groupId', '==', groupId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Förslag
export async function createSuggestion(suggestionData) {
  const docRef = await addDoc(collection(db, 'suggestions'), {
    ...suggestionData,
    createdAt: serverTimestamp(),
    finalized: false,
    votes: {}
  });
  return docRef.id;
}

export async function getSuggestionsByGroup(groupId) {
  const q = query(collection(db, 'suggestions'), where('groupId', '==', groupId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

// GDPR - Radera användardata
export async function deleteUserData(email) {
  const batch = [];
  
  // Radera grupper där användaren är skapare
  const groupsQuery = query(collection(db, 'groups'), where('creatorEmail', '==', email));
  const groupsSnapshot = await getDocs(groupsQuery);
  groupsSnapshot.docs.forEach(doc => batch.push(deleteDoc(doc.ref)));
  
  // Radera inbjudningar
  const invitationsQuery = query(collection(db, 'invitations'), where('email', '==', email));
  const invitationsSnapshot = await getDocs(invitationsQuery);
  invitationsSnapshot.docs.forEach(doc => batch.push(deleteDoc(doc.ref)));
  
  // Radera förslag
  const suggestionsQuery = query(collection(db, 'suggestions'), where('fromEmail', '==', email));
  const suggestionsSnapshot = await getDocs(suggestionsQuery);
  suggestionsSnapshot.docs.forEach(doc => batch.push(deleteDoc(doc.ref)));
  
  // Utför alla raderingar
  await Promise.all(batch);
}