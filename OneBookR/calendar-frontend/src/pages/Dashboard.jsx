import React, { useEffect, useState } from 'react';
import InviteFriend from './InviteFriend';
import CompareCalendar from './CompareCalendar';
import Task from './Task';
import ShortcutDashboard from './ShortcutDashboard';
import { Container, Typography, Box, Button, TextField } from '@mui/material';
import { useTheme } from '../hooks/useTheme';

export default function Dashboard({ user, onNavigateToMeeting }) {
  const [currentView, setCurrentView] = useState('shortcut');
  const { theme } = useTheme();
  const [groupTokens, setGroupTokens] = useState([]);
  const [showCompare, setShowCompare] = useState(false);
  const [groupStatus, setGroupStatus] = useState({
    allJoined: true,
    current: 1,
    expected: 1,
    invited: [],
  });
  const [joinedEmails, setJoinedEmails] = useState([]);
  const urlParams = new URLSearchParams(window.location.search);
  const groupId = urlParams.get('group');
  const inviteeId = urlParams.get('invitee');
  
  const handleNavigateToMeeting = onNavigateToMeeting || ((type) => {
    if (type === 'task') {
      setCurrentView('task');
    } else if (type === '1v1' || type === 'group') {
      setCurrentView('dashboard');
    }
  });
  
  // Set initial view based on URL params
  useEffect(() => {
    const meetingType = urlParams.get('meetingType');
    if (groupId || meetingType) {
      setCurrentView('dashboard');
    }
  }, [groupId]);
 
  useEffect(() => {
    if (groupId) {
      // Hämta e-post på säkert sätt
      let email = user.email;
      if (!email && user.emails && user.emails.length > 0) {
        email = user.emails[0].value || user.emails[0];
      }
      if (!email) {
        alert('Kunde inte hitta din e-postadress. Logga ut och logga in igen med ett Google-konto som har e-post.');
        return;
      }
      
      console.log('Joining group:', { groupId, email, inviteeId });
      
      // Kontrollera om gruppen existerar först
      fetch(`https://www.onebookr.se/api/group/${groupId}/status`)
        .then(res => {
          console.log('Group status response:', res.status);
          if (!res.ok) {
            console.error('Group not found');
            return;
          }
          return res.json();
        })
        .then(statusData => {
          if (!statusData) return;
          console.log('Group exists, joining...');
          
          // Gruppen finns, fortsätt med join
          return fetch('https://www.onebookr.se/api/group/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              groupId,
              token: user.accessToken,
              invitee: inviteeId,
              email: email,
            }),
          });
        })
        .then(joinRes => {
          if (joinRes) {
            console.log('Join response:', joinRes.status);
            return fetch(`https://www.onebookr.se/api/group/${groupId}/tokens`);
          }
        })
        .then(tokensRes => {
          if (tokensRes) {
            return tokensRes.json();
          }
        })
        .then(data => {
          if (data) {
            console.log('Group tokens:', data.tokens);
            setGroupTokens(data.tokens || []);
          }
        })
        .catch(error => {
          console.error('Error in group join flow:', error);
        });
    }
  }, [groupId, user.accessToken, inviteeId, user.email, user.emails]);

  useEffect(() => {
    if (groupId) {
      // Hämta status för gruppen
      const pollStatus = () => {
        fetch(`https://www.onebookr.se/api/group/${groupId}/status`)
          .then(res => res.json())
          .then(status => setGroupStatus(status))
          .catch(err => console.log('Status poll failed:', err));
        // Hämta anslutna e-postadresser (om backend stödjer det)
        fetch(`https://www.onebookr.se/api/group/${groupId}/joined`)
          .then(res => res.json())
          .then(data => setJoinedEmails(data.joined || []))
          .catch(() => setJoinedEmails([]));
      };
      pollStatus();
      const interval = setInterval(pollStatus, 15000);
      return () => clearInterval(interval);
    }
  }, [groupId, user.accessToken]);

  // Ta bort reload vid allJoined!
  // useEffect(() => {
  //   if (groupId && groupStatus.allJoined) {
  //     if (!window.location.hash.includes('#joined')) {
  //       window.location.hash = '#joined';
  //       window.location.reload();
  //     }
  //   }
  // }, [groupId, groupStatus.allJoined]);

  // NYTT: Navigera automatiskt till jämförelse när alla är inne (även för hosten)
  useEffect(() => {
    let refreshTimeout;
    if (groupId && groupStatus.allJoined && window.location.hash !== '#joined') {
      // Vänta 2 sekunder innan refresh för att undvika race conditions
      refreshTimeout = setTimeout(() => {
        window.location.hash = '#joined';
        window.location.reload();
      }, 2000);
    }
    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
    };
  }, [groupId, groupStatus.allJoined]);

  // Om ingen grupp, använd bara din egen token
  const tokens = groupId ? groupTokens : [user.accessToken];
  const invitedTokens = tokens.filter(token => token !== user.accessToken);

  // Grupp-länk
  const groupLink = groupId
    ? `${window.location.origin}${window.location.pathname}?group=${groupId}`
    : '';

  // NYTT: Visa väntrum om bara en token finns
  const waitingForOthers = groupId && tokens.length < 2;

  if (!user) {
    return (
      <Container maxWidth="md" sx={{ mt: 10 }}>
        <Typography variant="h5" gutterBottom sx={{ mt: 20 }}>
          Laddar...
        </Typography>
      </Container>
    );
  }
  
  // Render different views based on currentView
  if (currentView === 'shortcut') {
    return <ShortcutDashboard user={user} onNavigateToMeeting={handleNavigateToMeeting} />;
  }
  
  if (currentView === 'task') {
    return <Task user={user} />;
  }



  // Beräkna vilka som gått med och vilka man väntar på
  const joined = joinedEmails;
  const waiting = groupStatus.invited
    ? groupStatus.invited.filter(email => !joined.includes(email))
    : [];

  return (
    <Container maxWidth="md" sx={{ mt: 10 }}>
        <Typography variant="h5" gutterBottom sx={{ mt: 20 }}>
          Hej {(() => {
            try {
              return user.displayName ? decodeURIComponent(escape(user.displayName)) : user.email;
            } catch {
              return user.displayName || user.email;
            }
          })()}
        </Typography>
      {!groupId && (
        <Box sx={{ mb: 2, mt: 3 }}>
          <InviteFriend key={`theme-${theme?.isDark}`} fromUser={user} fromToken={user.accessToken} theme={theme} />
        </Box>
      )}
      
      {/* Visa "väntar på andra" om inte alla är inne */}
      {groupId && !groupStatus.allJoined && (
        <Box sx={{ my: 5, display: 'flex', justifyContent: 'center' }}>
          <Box sx={{
            maxWidth: 500,
            width: '100%',
            bgcolor: '#fff',
            borderRadius: 3,
            boxShadow: '0 2px 8px rgba(60,64,67,.06)',
            border: '1px solid #e0e3e7',
            p: 4,
            textAlign: 'center'
          }}>
            <Typography variant="h5" gutterBottom sx={{
              fontWeight: 600,
              color: '#0a2540',
              fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
              mb: 2
            }}>
              ⏳ Väntar på att alla ska ansluta
            </Typography>
            {groupStatus.groupName && (
              <Typography variant="h6" sx={{ color: '#1976d2', mb: 2 }}>
                {groupStatus.groupName}
              </Typography>
            )}
            <Typography variant="body1" sx={{
              color: '#425466',
              mb: 3,
              fontSize: 16
            }}>
              {groupStatus.current} av {groupStatus.expected} personer har anslutit
            </Typography>
            {/* Visa inbjudna e-postadresser med status */}
            {groupStatus.invited && groupStatus.invited.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle1" sx={{
                  color: '#1976d2',
                  fontWeight: 600,
                  mb: 2,
                  fontSize: 16
                }}>
                  Status för deltagare:
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {groupStatus.invited.map((email, idx) => {
                    const hasJoined = joined.includes(email);
                    return (
                      <Box key={idx} sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        p: 2,
                        borderRadius: 2,
                        bgcolor: hasJoined ? '#e8f5e8' : '#fff3e0',
                        border: hasJoined ? '1px solid #4caf50' : '1px solid #ffcc02'
                      }}>
                        <span style={{
                          fontSize: 20,
                          color: hasJoined ? '#2e7d32' : '#e65100'
                        }}>
                          {hasJoined ? '✅' : '⏳'}
                        </span>
                        <Typography sx={{
                          color: hasJoined ? '#2e7d32' : '#bf360c',
                          fontWeight: hasJoined ? 600 : 500,
                          fontSize: 15
                        }}>
                          {email}
                        </Typography>
                        <Typography variant="caption" sx={{
                          color: hasJoined ? '#2e7d32' : '#e65100',
                          fontWeight: 600,
                          fontSize: 12
                        }}>
                          {hasJoined ? 'Ansluten' : 'Väntar'}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      )}
      {waitingForOthers && (
        <Box sx={{ my: 5, display: 'flex', justifyContent: 'center' }}>
          <Box sx={{
            maxWidth: 500,
            width: '100%',
            bgcolor: '#fff',
            borderRadius: 3,
            boxShadow: '0 2px 8px rgba(60,64,67,.06)',
            border: '1px solid #e0e3e7',
            p: 4,
            textAlign: 'center'
          }}>
            <Typography variant="h5" gutterBottom sx={{
              fontWeight: 600,
              color: '#0a2540',
              fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
              mb: 2
            }}>
              👥 Väntar på fler deltagare
            </Typography>
            <Typography variant="body1" sx={{
              color: '#425466',
              fontSize: 16
            }}>
              Minst en person till behöver ansluta innan kalenderjämförelse kan börja
            </Typography>
          </Box>
        </Box>
      )}
      {/* Visa kalendern först när alla är inne */}
      {(!groupId || groupStatus.allJoined) && !waitingForOthers && (
        <CompareCalendar
          myToken={user.accessToken}
          invitedTokens={invitedTokens}
          user={user}
          groupId={groupId}
        />
      )}

    </Container>
  );
}