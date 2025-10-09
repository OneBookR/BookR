import { useState, useEffect } from 'react';

export const useContacts = () => {
  const [contacts, setContacts] = useState(() => {
    const saved = localStorage.getItem('bookr_contacts');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('bookr_contacts', JSON.stringify(contacts));
  }, [contacts]);

  const addContact = (email, name = '') => {
    if (!email || contacts.find(c => c.email === email)) return false;
    
    const newContact = {
      id: Date.now(),
      email: email.toLowerCase().trim(),
      name: name.trim() || email.split('@')[0],
      addedAt: new Date().toISOString(),
      inviteCount: 0
    };
    
    setContacts(prev => [...prev, newContact]);
    return true;
  };

  const removeContact = (id) => {
    setContacts(prev => prev.filter(c => c.id !== id));
  };

  const updateContact = (id, updates) => {
    setContacts(prev => prev.map(c => 
      c.id === id ? { ...c, ...updates } : c
    ));
  };

  const incrementInviteCount = (email) => {
    setContacts(prev => prev.map(c => 
      c.email === email ? { ...c, inviteCount: c.inviteCount + 1 } : c
    ));
  };

  return {
    contacts,
    addContact,
    removeContact,
    updateContact,
    incrementInviteCount
  };
};