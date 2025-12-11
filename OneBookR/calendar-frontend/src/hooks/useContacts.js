import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'bookr_contacts';

export const useContacts = (userEmail) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ LOAD CONTACTS ON MOUNT
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setContacts(Array.isArray(parsed) ? parsed : []);
      }
    } catch (error) {
      console.error('[useContacts] Failed to load contacts:', error);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ✅ SAVE TO STORAGE
  const saveContacts = useCallback((newContacts) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newContacts));
      setContacts(newContacts);
    } catch (error) {
      console.error('[useContacts] Failed to save contacts:', error);
    }
  }, []);

  // ✅ ADD CONTACT
  const addContact = useCallback((contact) => {
    const newContact = {
      id: Date.now(),
      ...contact,
      createdAt: new Date().toISOString()
    };
    
    const newContacts = [...contacts, newContact];
    saveContacts(newContacts);
    return newContact;
  }, [contacts, saveContacts]);

  return {
    contacts,
    loading,
    addContact
  };
};