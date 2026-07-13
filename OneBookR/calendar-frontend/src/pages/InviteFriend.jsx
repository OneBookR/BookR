import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { TextField, IconButton, Typography, Box, Chip, Stack, Paper, List, ListItem, ListItemText, Avatar } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { API_BASE_URL } from '../config';

const InviteFriend = ({ fromUser, theme, embedded = false }) => {
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
  const contacts = [];
  const currentTheme = theme || { colors: { surface: '#fff', border: '#e0e3e7', text: '#222', primary: '#1976d2' } };

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
        groupName: groupName.trim() || 'Namnlös grupp',
        directAccessEmails,
      };
      
      const res = await fetch(`${API_BASE_URL}/api/invite`, {
        method: 'POST',
        credentials: 'include',
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
        borderRadius: 3,
        border: '1px solid var(--border)',
        bgcolor: 'rgba(255,255,255,0.96)',
        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.12)',
        backdropFilter: 'blur(18px)'
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
                  '&:hover': { bgcolor: 'rgba(17,24,39,0.04)' },
                  bgcolor: hasDirectAccess ? 'rgba(31,122,77,0.08)' : 'transparent'
                }}
              >
                <Avatar sx={{ width: 32, height: 32, mr: 2, bgcolor: 'rgba(17,24,39,0.08)', color: 'var(--text)', fontSize: 14 }}>
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
                          sx={{ fontSize: 10, height: 20, bgcolor: 'rgba(31,122,77,0.12)', color: 'var(--success)', border: '1px solid rgba(31,122,77,0.14)' }}
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

  const inviteForm = (
    <>
      <Chip
        label="Invite Flow"
        sx={{
          mb: 2,
          bgcolor: 'rgba(17,24,39,0.04)',
          border: '1px solid rgba(17,24,39,0.06)',
          color: 'var(--text)',
          fontWeight: 800,
          letterSpacing: '0.04em',
          textTransform: 'uppercase'
        }}
      />

      <Box
        sx={{
          width: '100%',
          maxWidth: {
            xs: '100%',
            sm: 460
          }
        }}
      >
        <TextField
          label="Gruppnamn"
          value={groupName}
          onChange={e => setGroupName(e.target.value)}
          placeholder="Ex: Projektgruppen, Lunchgänget..."
          sx={{ mb: 2.5 }}
          fullWidth
          variant="outlined"
        />
      </Box>

      {emails.length > 0 && (
        <Box sx={{ mb: 2.5 }}>
          <Typography variant="caption" sx={{ display: 'block', mb: 1, color: 'var(--text-secondary)', fontWeight: 700 }}>
            Deltagare som kommer få inbjudan
          </Typography>
          {renderEmailChips}
        </Box>
      )}

      <Box
        sx={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 1.5,
          mb: 1,
          position: 'relative',
          width: '100%',
          maxWidth: {
            xs: '100%',
            sm: 460
          }
        }}
      >
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
            alignSelf: 'stretch',
            minWidth: 56,
            borderRadius: 3,
            backgroundColor: 'var(--text)',
            color: 'var(--surface-strong)',
            '&:hover': {
              backgroundColor: '#000000'
            },
            '&.Mui-disabled': {
              backgroundColor: 'rgba(17,24,39,0.12)',
              color: 'rgba(255,255,255,0.8)'
            }
          }}
        >
          <SendIcon />
        </IconButton>
      </Box>

      <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
        Tips: tryck Enter, kommatecken eller välj en kontakt från listan för att lägga till flera deltagare.
      </Typography>

      {message && (
        <Box sx={{ mt: 2, p: 2, borderRadius: 3, bgcolor: message.toLowerCase().includes('fel') || message.toLowerCase().includes('kunde') ? 'rgba(180,35,24,0.08)' : 'rgba(31,122,77,0.08)', border: `1px solid ${message.toLowerCase().includes('fel') || message.toLowerCase().includes('kunde') ? 'rgba(180,35,24,0.14)' : 'rgba(31,122,77,0.14)'}` }}>
          <Typography sx={{ color: message.toLowerCase().includes('fel') || message.toLowerCase().includes('kunde') ? 'var(--error)' : 'var(--success)', fontWeight: 700 }}>
            {message}
          </Typography>
        </Box>
      )}

      {groupLink && (
        <Box sx={{ mt: 2, p: 2, borderRadius: 3, bgcolor: 'rgba(17,24,39,0.03)', border: '1px solid rgba(17,24,39,0.05)' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'var(--text)', mb: 1 }}>
            Skapade länkar
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            {groupLink.split('\n').map((link, i) => (
              <Box key={i}>
                <a href={link} target="_blank" rel="noopener noreferrer">{link}</a>
              </Box>
            ))}
          </Typography>
        </Box>
      )}
    </>
  );

  if (embedded) {
    return <Box sx={{ mb: 3 }}>{inviteForm}</Box>;
  }

  return (
    <Paper
      elevation={0}
      sx={{ 
        p: { xs: 3, md: 4 }, 
        bgcolor: 'rgba(255,255,255,0.78)', 
        borderRadius: 4,
        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.05)',
        border: '1px solid var(--border)',
        color: currentTheme.colors.text,
        backdropFilter: 'blur(18px)'
      }}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.1fr 0.9fr' }, gap: 3, alignItems: 'start' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.05em', color: 'var(--text)', mb: 1.25 }}>
            Bjud in vänner utan att det känns som ett formulärblock.
          </Typography>
          <Typography sx={{ color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 620, mb: 3 }}>
            Skapa en grupp, lägg till deltagare och skicka iväg en ren inbjudan direkt. Kontakter med direktåtkomst kan bokas snabbare härifrån.
          </Typography>

          {inviteForm}
        </Box>

        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(17,24,39,0.03)', border: '1px solid rgba(17,24,39,0.05)' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'var(--text)', mb: 0.75 }}>
              Så fungerar det
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              1. Namnge gruppen. 2. Lägg till deltagare. 3. Skicka inbjudan och gå vidare till jämförelsen direkt när gruppen skapats.
            </Typography>
          </Box>

          <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(17,24,39,0.03)', border: '1px solid rgba(17,24,39,0.05)' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'var(--text)', mb: 0.75 }}>
              Snabbstatus
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              {emails.length > 0 ? `${emails.length} deltagare redo att bjudas in.` : 'Inga deltagare tillagda ännu.'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              {groupName.trim() ? `Gruppnamn: ${groupName.trim()}` : 'Du kan ange gruppnamn eller låta BookR skapa en namnlös grupp.'}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
};

export default InviteFriend;
