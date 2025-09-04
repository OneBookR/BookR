import React, { useState, useRef, useEffect } from 'react';
import { TextField, IconButton, Typography, Box, Chip, Stack, Paper, List, ListItem, ListItemText, Avatar } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useContacts } from '../hooks/useContacts';

const InviteFriend = ({ fromUser, fromToken }) => {
  const { contacts } = useContacts();
  const [emails, setEmails] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [message, setMessage] = useState('');
  const [groupLink, setGroupLink] = useState('');
  const [groupName, setGroupName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef();

  // Lyssna på förifyllda kontakter från kontaktboken
  useEffect(() => {
    const handlePrefilledContacts = (event) => {
      const { emails: prefilledEmails } = event.detail;
      setEmails(prev => {
        const newEmails = prefilledEmails.filter(email => !prev.includes(email));
        return [...prev, ...newEmails];
      });
    };

    window.addEventListener('prefilledContacts', handlePrefilledContacts);
    return () => window.removeEventListener('prefilledContacts', handlePrefilledContacts);
  }, []);

  // Filtrera kontakter baserat på input
  useEffect(() => {
    if (inputValue.length > 0) {
      const filtered = contacts.filter(contact => 
        contact.email.toLowerCase().includes(inputValue.toLowerCase()) ||
        contact.name.toLowerCase().includes(inputValue.toLowerCase())
      ).filter(contact => !emails.includes(contact.email));
      
      setFilteredContacts(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
      setFilteredContacts([]);
    }
  }, [inputValue, contacts, emails]);

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
    addEmail(contact.email);
    setInputValue('');
    setShowSuggestions(false);
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
      return;
    }

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
        if (data.groupId) {
          window.location.href = `${window.location.origin}${window.location.pathname}?group=${data.groupId}`;
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
    <Box sx={{ p: 2, bgcolor: 'white', borderRadius: 2, boxShadow: 1 }}>
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
            background: '#f7f9fc',
          },
        }}
        variant="outlined"
      />
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mb: 1 }}>
        {emails.map(email => (
          <Chip
            key={email}
            label={email}
            onDelete={() => handleDelete(email)}
            sx={{ mb: 1 }}
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
                background: '#f7f9fc',
              },
              '& .MuiInputBase-root': {
                borderRadius: 999,
              },
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
                      }
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
                      primary={contact.name}
                      secondary={contact.email}
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
