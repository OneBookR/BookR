import { useState, useEffect } from 'react';

const getCurrentUserEmail = () => {
  if (window.user) {
    return window.user.email || window.user.emails?.[0]?.value || window.user.emails?.[0];
  }
  return null;
};

export const useContacts = () => {
  const [contacts, setContacts] = useState(() => {
    const regularContacts = JSON.parse(localStorage.getItem('bookr_contacts') || '[]');
    const userEmail = getCurrentUserEmail();
    const teamContacts = userEmail ? JSON.parse(localStorage.getItem(`bookr_team_contacts_${userEmail}`) || '[]') : [];
    
    // Kombinera och ta bort dubbletter
    const allContacts = [...regularContacts, ...teamContacts];
    const uniqueContacts = allContacts.filter((contact, index, self) => 
      index === self.findIndex(c => c.email.toLowerCase() === contact.email.toLowerCase())
    );
    
    return uniqueContacts;
  });

  useEffect(() => {
    // Uppdatera kontakter när team-kontakter ändras
    const handleStorageChange = () => {
      const regularContacts = JSON.parse(localStorage.getItem('bookr_contacts') || '[]');
      const userEmail = getCurrentUserEmail();
      const teamContacts = userEmail ? JSON.parse(localStorage.getItem(`bookr_team_contacts_${userEmail}`) || '[]') : [];
      
      const allContacts = [...regularContacts, ...teamContacts];
      const uniqueContacts = allContacts.filter((contact, index, self) => 
        index === self.findIndex(c => c.email.toLowerCase() === contact.email.toLowerCase())
      );
      
      setContacts(uniqueContacts);
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

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