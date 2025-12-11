import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { TextField, IconButton, Typography, Box, Chip, Stack, Paper, List, ListItem, ListItemText, Avatar } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useContacts } from '../hooks/useContacts';
import { useTheme } from '../hooks/useTheme';
import { API_BASE_URL } from '../config';

const InviteFriend = ({ fromUser, fromToken, theme }) => {
  // ✅ STABLE USER DATA EXTRACTION
  const userData = useMemo(() => {
    let email = fromUser;
    if (typeof fromUser === 'object' && fromUser) {
      email = fromUser.email || fromUser.emails?.[0]?.value || fromUser.emails?.[0];
    }
    
    // Clean mailto: prefix
    if (email?.startsWith('mailto:')) {
      email = email.replace('mailto:', '');
    }
    
    return {
      email,
      isValid: Boolean(email?.includes('@'))
    };
  }, [fromUser]);

  // ✅ CONTROLLED STATE
  const [emails, setEmails] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [groupName, setGroupName] = useState('');
  const [message, setMessage] = useState('');
  const [groupLink, setGroupLink] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [teamContacts, setTeamContacts] = useState([]);
  const [lastContactsUpdate, setLastContactsUpdate] = useState(0);

  const inputRef = useRef();
  const { contacts } = useContacts();
  const currentTheme = theme || useTheme().theme;

  // ✅ SET WINDOW.USER ONCE
  useEffect(() => {
    if (fromUser && !window.user) {
      window.user = fromUser;
    }
  }, [fromUser]);

  // ✅ OPTIMIZED TEAM CONTACTS LOADING
  const loadTeamContacts = useCallback(() => {
    if (!userData.email) return;
    
    try {
      const savedContacts = JSON.parse(
        localStorage.getItem(`bookr_team_contacts_${userData.email}`) || '[]'
      );
      setTeamContacts(savedContacts);
      setLastContactsUpdate(Date.now());
    } catch (error) {
      console.error('Failed to load team contacts:', error);
      setTeamContacts([]);
    }
  }, [userData.email]);

  // Load team contacts on mount and when user changes
  useEffect(() => {
    loadTeamContacts();
  }, [loadTeamContacts]);

  // ✅ OPTIMIZED CONTACT FILTERING
  const updateFilteredContacts = useCallback(() => {
    if (inputValue.length === 0) {
      setShowSuggestions(false);
      setFilteredContacts([]);
      return;
    }

    const allContacts = [...contacts, ...teamContacts];
    
    // Deduplicate by email
    const uniqueContacts = allContacts.filter((contact, index, self) => 
      index === self.findIndex(c => c.email === contact.email)
    );

    const filtered = uniqueContacts
      .filter(contact => 
        contact.email.toLowerCase().includes(inputValue.toLowerCase()) ||
        (contact.name && contact.name.toLowerCase().includes(inputValue.toLowerCase()))
      )
      .filter(contact => !emails.includes(contact.email))
      .slice(0, 5); // Limit results
    
    setFilteredContacts(filtered);
    setShowSuggestions(filtered.length > 0);
  }, [inputValue, contacts, teamContacts, emails]);

  // Update filtered contacts when dependencies change
  useEffect(() => {
    updateFilteredContacts();
  }, [updateFilteredContacts]);

  // ✅ OPTIMIZED EMAIL VALIDATION
  const isValidEmail = useCallback((email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }, []);

  const addEmail = useCallback((email) => {
    const trimmed = email.trim().replace(/,$/, '');
    if (trimmed && isValidEmail(trimmed) && !emails.includes(trimmed)) {
      setEmails(prev => [...prev, trimmed]);
      return true;
    }
    return false;
  }, [emails, isValidEmail]);

  // ✅ CONTROLLED INPUT HANDLERS
  const handleInputChange = useCallback((e) => {
    setInputValue(e.target.value);
  }, []);

  const handleInputKeyDown = useCallback((e) => {
    if (showSuggestions && e.key === 'ArrowDown') {
      e.preventDefault();
      return;
    }
    
    if (['Enter', ',', ' ', 'Tab'].includes(e.key)) {
      e.preventDefault();
      
      if (showSuggestions && filteredContacts.length > 0) {
        selectContact(filteredContacts[0]);
      } else if (inputValue.trim()) {
        if (addEmail(inputValue)) {
          setInputValue('');
        }
      }
    }
    
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }, [showSuggestions, filteredContacts, inputValue, addEmail]);

  const selectContact = useCallback((contact) => {
    const contactSettings = JSON.parse(localStorage.getItem('bookr_contact_settings') || '{}');
    const hasDirectAccess = contactSettings[contact.id]?.hasCalendarAccess || contact.directAccess;
    
    if (hasDirectAccess) {
      // Direct booking
      const groupId = `direct_${Date.now()}`;
      const params = new URLSearchParams({
        group: groupId,
        directAccess: 'true',
        contactEmail: contact.email,
        contactName: contact.name
      });
      window.location.href = `/?${params.toString()}`;
    } else {
      // Add to invite list
      if (addEmail(contact.email)) {
        setInputValue('');
        setShowSuggestions(false);
      }
    }
  }, [addEmail]);

  const handleDelete = useCallback((emailToDelete) => {
    setEmails(prev => prev.filter(email => email !== emailToDelete));
  }, []);

  // ✅ OPTIMIZED SEND INVITES WITH PROPER ERROR HANDLING
  const sendInvites = useCallback(async () => {
    if (isLoading || emails.length === 0) {
      if (emails.length === 0) {
        setMessage('Ange minst en e-postadress.');
      }
      return;
    }

    if (!userData.isValid) {
      setMessage('Kunde inte hitta din e-postadress. Logga ut och logga in igen.');
      return;
    }
    
    setIsLoading(true);
    setMessage('Skickar inbjudningar...');

    try {
      // Check for direct access emails
      const directAccessEmails = [];
      if (userData.email && teamContacts.length > 0) {
        emails.forEach(invitedEmail => {
          const contact = teamContacts.find(c => 
            c.email.toLowerCase() === invitedEmail.toLowerCase() && c.directAccess
          );
          if (contact) {
            directAccessEmails.push(contact.email);
          }
        });
      }

      // Clean emails (remove mailto: prefix)
      const cleanEmails = emails.map(email => 
        email.startsWith('mailto:') ? email.replace('mailto:', '') : email
      );

      const requestBody = {
        emails: cleanEmails,
        fromUser: userData.email,
        fromToken,
        groupName: groupName.trim() || 'Namnlös grupp',
        directAccessEmails,
      };
      
      const res = await fetch(`${API_BASE_URL}/api/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      // Handle rate limiting
      if (res.status === 429) {
        setMessage('För många förfrågningar. Vänta en minut och försök igen.');
        return;
      }

      // Parse response safely
      let data = null;
      const contentType = res.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch (jsonError) {
          console.error('JSON parsing failed:', jsonError);
          setMessage('Kunde inte läsa svar från servern.');
          return;
        }
      } else {
        const text = await res.text();
        console.error('Non-JSON response:', text);
        setMessage('Oväntat svar från servern. Försök igen.');
        return;
      }

      if (res.ok && data) {
        // Success - reset form
        setEmails([]);
        setInputValue('');
        setGroupName('');
        setMessage('Inbjudningar skickade!');
        
        if (data.inviteLinks && Array.isArray(data.inviteLinks)) {
          setGroupLink(data.inviteLinks.join('\n'));
        }
        
        // Navigate to group if created
        if (data.groupId) {
          console.log('✅ Redirecting to group:', data.groupId);
          setTimeout(() => {
            window.location.replace(`/?group=${data.groupId}`);
          }, 500);
        }
      } else {
        setMessage(data?.error || 'Något gick fel.');
      }
      
    } catch (err) {
      console.error('Send invites error:', err);
      
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setMessage('Nätverksfel. Kontrollera din internetanslutning.');
      } else {
        setMessage('Tekniskt fel. Försök igen om en stund.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    isLoading, 
    emails, 
    userData.isValid, 
    userData.email, 
    fromToken, 
    groupName, 
    teamContacts
  ]);

  // ✅ MEMOIZED RENDER COMPONENTS
  const renderEmailChips = useMemo(() => (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mb: 1 }}>
      {emails.map(email => (
        <Chip
          key={email}
          label={email}
          onDelete={() => handleDelete(email)}
          sx={{ 
            mb: 1,
            bgcolor: currentTheme.colors.primary,
            color: '#fff',
            '& .MuiChip-deleteIcon': { color: '#fff' }
          }}
        />
      ))}
    </Stack>
  ), [emails, handleDelete, currentTheme.colors.primary]);

  const renderSuggestions = useMemo(() => {
    if (!showSuggestions || filteredContacts.length === 0) return null;

    return (
      <Paper sx={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        zIndex: 1000,
        maxHeight: 200,
        overflow: 'auto',
        mt: 1,
        borderRadius: 2,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
      }}>
        <List sx={{ py: 0 }}>
          {filteredContacts.map((contact) => {
            const contactSettings = JSON.parse(localStorage.getItem('bookr_contact_settings') || '{}');
            const hasDirectAccess = contactSettings[contact.id]?.hasCalendarAccess || contact.directAccess;
            
            return (
              <ListItem
                key={contact.id}
                button
                onClick={() => selectContact(contact)}
                sx={{
                  py: 1.5,
                  '&:hover': { bgcolor: '#f5f5f5' },
                  bgcolor: hasDirectAccess ? '#e8f5e8' : 'transparent'
                }}
              >
                <Avatar sx={{ width: 32, height: 32, mr: 2, bgcolor: '#1976d2', fontSize: 14 }}>
                  {contact.name.charAt(0).toUpperCase()}
                </Avatar>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>{contact.name}</span>
                      {hasDirectAccess && (
                        <Chip 
                          label="Direktåtkomst" 
                          size="small" 
                          color="success"
                          sx={{ fontSize: 10, height: 20 }}
                        />
                      )}
                    </Box>
                  }
                  secondary={hasDirectAccess 
                    ? `${contact.email} • Klicka för att boka direkt`
                    : contact.email
                  }
                />
              </ListItem>
            );
          })}
        </List>
      </Paper>
    );
  }, [showSuggestions, filteredContacts, selectContact]);

  return (
    <Box sx={{ 
      p: 2, 
      bgcolor: currentTheme.colors.surface, 
      borderRadius: 2, 
      boxShadow: 1,
      border: `1px solid ${currentTheme.colors.border}`,
      color: currentTheme.colors.text
    }}>
      <Typography variant="h6" gutterBottom>Bjud in vänner</Typography>
      
      <TextField
        label="Gruppnamn"
        value={groupName}
        onChange={e => setGroupName(e.target.value)}
        fullWidth
        placeholder="Ex: Projektgruppen, Lunchgänget..."
        sx={{ mb: 2 }}
        variant="outlined"
      />
      
      {renderEmailChips}
      
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, position: 'relative' }}>
        <Box sx={{ position: 'relative', flex: 1 }}>
          <TextField
            label="E-postadress"
            value={inputValue}
            inputRef={inputRef}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onFocus={() => {
              if (inputValue && filteredContacts.length > 0) {
                setShowSuggestions(true);
              }
            }}
            onBlur={() => {
              setTimeout(() => {
                if (inputValue && !showSuggestions) {
                  addEmail(inputValue);
                  setInputValue('');
                }
                setShowSuggestions(false);
              }, 150);
            }}
            fullWidth
            placeholder="Skriv e-post och tryck Enter eller ,"
            variant="outlined"
          />
          
          {renderSuggestions}
        </Box>
        
        <IconButton
          onClick={sendInvites}
          disabled={emails.length === 0 || isLoading}
          sx={{
            ml: 2,
            background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
            color: '#fff',
            width: 44,
            height: 44,
            '&:hover': {
              background: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)'
            }
          }}
        >
          <SendIcon />
        </IconButton>
      </Box>
      
      {message && (
        <Typography sx={{ mt: 2 }} color={message.includes('fel') ? 'error.main' : 'success.main'}>
          {message}
        </Typography>
      )}
      
      {groupLink && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="body2">
            {groupLink.split('\n').map((link, i) => (
              <div key={i}>
                <a href={link} target="_blank" rel="noopener noreferrer">{link}</a>
              </div>
            ))}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default InviteFriend;
