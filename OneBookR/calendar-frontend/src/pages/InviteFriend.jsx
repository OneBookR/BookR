import React, { useState, useRef, useEffect } from 'react';
import { TextField, IconButton, Typography, Box, Chip, Stack, Paper, List, ListItem, ListItemText, Avatar } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useContacts } from '../hooks/useContacts';
import { useTheme } from '../hooks/useTheme';

const InviteFriend = ({ fromUser, fromToken, theme }) => {
  // Sätt window.user för useContacts
  useEffect(() => {
    if (fromUser && !window.user) {
      window.user = fromUser;
    }
  }, [fromUser]);
  
  const { contacts } = useContacts();
  const [teamContacts, setTeamContacts] = useState([]);
  const currentTheme = theme || useTheme().theme;
  const [emails, setEmails] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [message, setMessage] = useState('');
  const [groupLink, setGroupLink] = useState('');
  const [groupName, setGroupName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef();

  // Hämta team-kontakter
  useEffect(() => {
    const userEmail = fromUser?.email || fromUser?.emails?.[0]?.value || fromUser?.emails?.[0];
    if (userEmail) {
      const savedContacts = JSON.parse(localStorage.getItem(`bookr_team_contacts_${userEmail}`) || '[]');
      setTeamContacts(savedContacts);
    }
  }, [fromUser]);

  // Lyssna på förifyllda kontakter från kontaktboken eller team-sidan
  useEffect(() => {
    const handlePrefilledContacts = (event) => {
      const { emails: prefilledEmails, groupName: prefilledGroupName } = event.detail;
      setEmails(prev => {
        const newEmails = prefilledEmails.filter(email => !prev.includes(email));
        return [...prev, ...newEmails];
      });
      if (prefilledGroupName) {
        setGroupName(prefilledGroupName);
      }
    };

    window.addEventListener('prefilledContacts', handlePrefilledContacts);
    return () => window.removeEventListener('prefilledContacts', handlePrefilledContacts);
  }, []);

  // Filtrera kontakter baserat på input
  useEffect(() => {
    if (inputValue.length > 0) {
      const allContacts = [...contacts, ...teamContacts].filter((contact, index, self) => 
        index === self.findIndex(c => c.email === contact.email)
      );

      const filtered = allContacts.filter(contact => 
        contact.email.toLowerCase().includes(inputValue.toLowerCase()) ||
        (contact.name && contact.name.toLowerCase().includes(inputValue.toLowerCase()))
      ).filter(contact => !emails.includes(contact.email));
      
      setFilteredContacts(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
      setFilteredContacts([]);
    }
  }, [inputValue, contacts, teamContacts, emails]);

  // Lägg till e-post om användaren trycker på , eller Enter eller Space
  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  const addEmail = (email) => {
    const trimmed = email.trim().replace(/,$/, '');
    if (
      trimmed &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) &&
      !emails.includes(trimmed)
    ) {
      setEmails([...emails, trimmed]);
    }
  };

  const selectContact = (contact) => {
    // Kontrollera om kontakten har direkttillgång till kalendern
    const contactSettings = JSON.parse(localStorage.getItem('bookr_contact_settings') || '{}');
    const hasDirectAccess = contactSettings[contact.id]?.hasCalendarAccess || contact.directAccess;
    
    if (hasDirectAccess) {
      // Gå direkt till kalenderjämföraren utan inbjudan
      const groupId = `direct_${Date.now()}`;
      const params = new URLSearchParams({
        group: groupId,
        directAccess: 'true',
        contactEmail: contact.email,
        contactName: contact.name
      });
      window.location.href = `/?${params.toString()}`;
    } else {
      // Lägg till i vanlig inbjudningslista
      addEmail(contact.email);
      setInputValue('');
      setShowSuggestions(false);
    }
  };

  const handleInputKeyDown = (e) => {
    if (showSuggestions && e.key === 'ArrowDown') {
      e.preventDefault();
      // Focus på första förslaget
      return;
    }
    
    if (
      e.key === 'Enter' ||
      e.key === ',' ||
      e.key === ' ' ||
      e.key === 'Tab'
    ) {
      e.preventDefault();
      if (showSuggestions && filteredContacts.length > 0) {
        selectContact(filteredContacts[0]);
      } else {
        addEmail(inputValue);
        setInputValue('');
      }
    }
    
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleBlur = () => {
    // Fördröj blur för att tillåta klick på förslag
    setTimeout(() => {
      if (inputValue && !showSuggestions) {
        addEmail(inputValue);
        setInputValue('');
      }
      setShowSuggestions(false);
    }, 150);
  };

  const handleDelete = (emailToDelete) => {
    setEmails(emails.filter(email => email !== emailToDelete));
  };

  const sendInvites = async () => {
    console.log('sendInvites called with emails:', emails);
    if (isLoading) {
      console.log('Already loading, ignoring click');
      return;
    }
    if (emails.length === 0) {
      setMessage('Ange minst en e-postadress.');
      return;
    }
    setIsLoading(true);
    setMessage('Skickar inbjudningar...');

    // NYTT: Kontrollera om någon av de inbjudna har gett direktåtkomst
    const userEmail = fromUser?.email || fromUser?.emails?.[0]?.value || fromUser?.emails?.[0];
    const directAccessEmails = [];
    if (userEmail) {
      const savedTeamContacts = JSON.parse(localStorage.getItem(`bookr_team_contacts_${userEmail}`) || '[]');
      emails.forEach(invitedEmail => {
        const contact = savedTeamContacts.find(c => c.email.toLowerCase() === invitedEmail.toLowerCase() && c.directAccess);
        if (contact) {
          directAccessEmails.push(contact.email);
        }
      });
    }

    // SÄKER: Hämta e-post från alla möjliga ställen
    let emailToSend = fromUser;
    console.log('fromUser:', fromUser);
    if (
      typeof fromUser === 'object' &&
      fromUser &&
      (fromUser.email || (fromUser.emails && fromUser.emails.length > 0))
    ) {
      emailToSend =
        fromUser.email ||
        (fromUser.emails && fromUser.emails[0].value) ||
        (fromUser.emails && fromUser.emails[0]);
    }
    console.log('emailToSend after fromUser check:', emailToSend);
    if (
      (!emailToSend || !emailToSend.includes('@')) &&
      window.user &&
      (window.user.email || (window.user.emails && window.user.emails.length > 0))
    ) {
      emailToSend =
        window.user.email ||
        (window.user.emails && window.user.emails[0].value) ||
        (window.user.emails && window.user.emails[0]);
    }
    // NYTT: Om fortfarande ingen giltig e-post, fråga användaren
    if (!emailToSend || !emailToSend.includes('@')) {
      setMessage(
        'Kunde inte hitta din e-postadress. Logga ut och logga in igen med ett Google-konto som har e-postadress. Om du är inloggad, kontrollera att du gett kalendern tillgång till din e-post.'
      );
      setIsLoading(false);
      return;
    }

    // NYTT: Skicka med provider och refreshToken om de finns på fromUser
    const fromProvider = fromUser?.provider || (fromUser?.id && String(fromUser.id).includes('microsoft') ? 'microsoft' : 'google');
    const fromRefreshToken = fromUser?.refreshToken || window.user?.refreshToken || null;

    try {
      const res = await fetch('https://www.onebookr.se/api/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emails,
          fromUser: emailToSend,
          fromToken,
          groupName: groupName.trim() || 'Namnlös grupp',
          directAccessEmails, // Skicka med e-postadresser som har gett direktåtkomst
          fromProvider,
          fromRefreshToken,
        }),
      });

      console.log('API response status:', res.status);
      const data = await res.json();
      console.log('API response data:', data);

      if (res.ok) {
        setEmails([]);
        setInputValue('');
        
        setMessage('Inbjudningar skickade!');
        if (data.inviteLinks && Array.isArray(data.inviteLinks)) {
          setGroupLink(data.inviteLinks.join('\n'));
        }
        
        // Om det finns ett groupId, omdirigera direkt till kalenderjämföraren
        if (data.groupId) {
          // Kontrollera om alla inbjudna har direktåtkomst
          const allHaveDirectAccess = emails.every(email => {
            const contact = teamContacts.find(c => c.email.toLowerCase() === email.toLowerCase());
            return contact && contact.directAccess;
          });

          if (allHaveDirectAccess) {
            const params = new URLSearchParams({
              group: data.groupId,
              directAccess: 'true',
              teamName: groupName.trim() || 'Namnlös grupp'
            });
            emails.forEach(email => params.append('contactEmail', email));
            window.location.href = `/?${params.toString()}`;
          } else {
            window.location.href = `/?group=${data.groupId}`;
          }
        }
      } else {
        setMessage(data.error || 'Något gick fel.');
      }
    } catch (err) {
      console.error('Fel vid utskick:', err);
      setMessage('Kunde inte skicka inbjudningar. Försök igen.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (groupLink) {
      navigator.clipboard.writeText(groupLink);
      setMessage('Länken är kopierad!');
    }
  };

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
        sx={{
          mb: 2,
          '& .MuiOutlinedInput-root': {
            borderRadius: 999,
            background: currentTheme.colors.bg,
            color: currentTheme.colors.text,
            '& fieldset': {
              borderColor: currentTheme.colors.border
            }
          },
          '& .MuiInputLabel-root': {
            color: currentTheme.colors.textSecondary
          }
        }}
        variant="outlined"
      />
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
              '& .MuiChip-deleteIcon': {
                color: '#fff'
              }
            }}
          />
        ))}
      </Stack>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, position: 'relative' }}>
        <Box sx={{ position: 'relative', flex: 1 }}>
          <TextField
            label="E-postadress"
            value={inputValue}
            inputRef={inputRef}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onBlur={handleBlur}
            onFocus={() => {
              if (inputValue && filteredContacts.length > 0) {
                setShowSuggestions(true);
              }
            }}
            fullWidth
            placeholder="Skriv e-post och tryck Enter eller ,"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 999,
                background: currentTheme.colors.bg,
                color: currentTheme.colors.text,
                '& fieldset': {
                  borderColor: currentTheme.colors.border
                }
              },
              '& .MuiInputBase-root': {
                borderRadius: 999,
              },
              '& .MuiInputLabel-root': {
                color: currentTheme.colors.textSecondary
              }
            }}
            variant="outlined"
          />
          
          {/* Autocomplete dropdown */}
          {showSuggestions && filteredContacts.length > 0 && (
            <Paper
              sx={{
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
              }}
            >
              <List sx={{ py: 0 }}>
                {filteredContacts.slice(0, 5).map((contact) => (
                  <ListItem
                    key={contact.id}
                    button
                    onClick={() => selectContact(contact)}
                    sx={{
                      py: 1.5,
                      '&:hover': {
                        bgcolor: '#f5f5f5'
                      },
                      bgcolor: (() => {
                        const contactSettings = JSON.parse(localStorage.getItem('bookr_contact_settings') || '{}');
                        const hasDirectAccess = contactSettings[contact.id]?.hasCalendarAccess;
                        return hasDirectAccess ? '#e8f5e8' : 'transparent';
                      })()
                    }}
                  >
                    <Avatar
                      sx={{
                        width: 32,
                        height: 32,
                        mr: 2,
                        bgcolor: '#1976d2',
                        fontSize: 14
                      }}
                    >
                      {contact.name.charAt(0).toUpperCase()}
                    </Avatar>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <span>{contact.name}</span>
                          {(() => {
                            const contactSettings = JSON.parse(localStorage.getItem('bookr_contact_settings') || '{}');
                            const hasDirectAccess = contactSettings[contact.id]?.hasCalendarAccess || contact.directAccess;
                            return hasDirectAccess ? (
                              <Chip 
                                label="Direktåtkomst" 
                                size="small" 
                                color="success"
                                sx={{ fontSize: 10, height: 20 }}
                              />
                            ) : null;
                          })()}
                        </Box>
                      }
                      secondary={(() => {
                        const contactSettings = JSON.parse(localStorage.getItem('bookr_contact_settings') || '{}');
                        const hasDirectAccess = contactSettings[contact.id]?.hasCalendarAccess || contact.directAccess;
                        return hasDirectAccess 
                          ? `${contact.email} • Klicka för att boka direkt`
                          : contact.email;
                      })()}
                      primaryTypographyProps={{
                        fontWeight: 600,
                        fontSize: 14
                      }}
                      secondaryTypographyProps={{
                        fontSize: 13,
                        color: '#666'
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}
        </Box>
        <IconButton
          aria-label="skicka inbjudningar"
          onClick={sendInvites}
          disabled={emails.length === 0 || isLoading}
          sx={{
            ml: 2,
            background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
            color: '#fff',
            borderRadius: '50%',
            width: 44,
            height: 44,
            boxShadow: '0 2px 8px 0 rgba(99,91,255,0.13)',
            transition: 'background 0.2s, box-shadow 0.2s',
            '&:hover': {
              background: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)',
              boxShadow: '0 0 0 4px #e9e5ff, 0 8px 24px 0 rgba(99,91,255,0.18)',
            },
          }}
        >
          <SendIcon sx={{ color: '#fff' }} />
        </IconButton>
      </Box>
      {message && <Typography sx={{ mt: 2 }} color="success.main">{message}</Typography>}
      {groupLink && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
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
