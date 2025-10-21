import React, { useEffect, useMemo, useState } from 'react';
import InviteFriend from './InviteFriend';
import CompareCalendar from './CompareCalendar';
import Task from './Task';
import ShortcutDashboard from './ShortcutDashboard';
import TeamDashboard from './TeamDashboard';
import ContactManager from './ContactManager';
import TeamContacts from './TeamContacts';
import { Container, Typography, Box, Button, TextField } from '@mui/material';
import { useTheme } from '../hooks/useTheme';
import ErrorBoundary from '../components/ErrorBoundary';
import { API_BASE_URL } from '../config';

export default function Dashboard({ user, onNavigateToMeeting }) {
  const [currentView, setCurrentView] = useState('shortcut');
  const { theme } = useTheme();
  const [groupTokens, setGroupTokens] = useState([]);
  const [showCompare, setShowCompare] = useState(false);
  const [groupStatus, setGroupStatus] = useState({
    allJoined: false,
    current: 1,
    expected: 1,
    invited: [],
  });
  const [joinedEmails, setJoinedEmails] = useState([]);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [isValidatingToken, setIsValidatingToken] = useState(true);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [tokenValidated, setTokenValidated] = useState(false);
  const urlParams = new URLSearchParams(window.location.search);
  const groupId = urlParams.get('group');
  const inviteeId = urlParams.get('invitee');
  const directAccess = urlParams.get('directAccess');
  const contactEmails = urlParams.getAll('contactEmail'); // Changed to getAll
  const contactName = urlParams.get('contactName');
  const teamName = urlParams.get('teamName');
  const teamMembers = urlParams.get('members');
  
  const handleNavigateToMeeting = onNavigateToMeeting || ((type) => {
    if (type === 'task') {
      setCurrentView('task');
    } else if (type === '1v1') {
      // Navigera till InviteFriend för 1v1 möten
      setCurrentView('invite');
    } else if (type === 'group') {
      // Navigera till InviteFriend för gruppmöten
      setCurrentView('invite');
    } else if (type === 'team') {
      // Navigera till TeamContacts
      setCurrentView('team');
    }
  });
  
  // Set initial view based on URL params
  useEffect(() => {
    const meetingType = urlParams.get('meetingType');
    if (meetingType === 'team') {
      setCurrentView('team');
    } else if (groupId || meetingType || directAccess === 'true') { // Added directAccess check
      setCurrentView('dashboard');
    }
  }, [groupId, directAccess]);
  
  // Validera token innan någon kalenderjämförelse
  useEffect(() => {
    const validateToken = async () => {
      if (!user || !user.accessToken) {
        setIsValidatingToken(false);
        setTokenExpired(false);
        setTokenValidated(false);
        return;
      }

      try {
        // Testa token genom att göra ett enkelt API-anrop
        const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/settings/timezone', {
          headers: {
            Authorization: `Bearer ${user.accessToken}`,
          },
        });

        if (response.status === 401) {
          console.log('Token has expired in Dashboard, clearing and redirecting...');
          setTokenExpired(true);
          setTokenValidated(false);
          setIsValidatingToken(false);
          
          // Spara aktuell URL för att återvända efter inloggning
          const currentUrl = window.location.href;
          localStorage.setItem('bookr_return_url', currentUrl);
          
          // Rensa användardata
          localStorage.removeItem('bookr_user');
          sessionStorage.removeItem('hasTriedSession');
          
          // Omdirigera omedelbart till logout
          setTimeout(() => {
            window.location.href = 'https://www.onebookr.se/auth/logout';
          }, 2000); // Ge användaren tid att se meddelandet
        } else {
          console.log('Token is valid in Dashboard');
          setTokenExpired(false);
          setTokenValidated(true);
          setIsValidatingToken(false);
        }
      } catch (error) {
        console.error('Error validating token in Dashboard:', error);
        // Vid nätverksfel, fortsätt ändå men logga felet
        setTokenExpired(false);
        setTokenValidated(true);
        setIsValidatingToken(false);
      }
    };

    validateToken();
  }, [user?.accessToken]);
 
  useEffect(() => {
    // VIKTIGT: Hämta ALLTID den inloggade användarens e-post (INTE fromUser!)
    let email = user?.email;
    if (!email && user?.emails && user.emails.length > 0) {
      email = user.emails[0]?.value || user.emails[0];
    }
    
    // Om användaren inte har en giltig email ännu, vänta
    if (!email || !email.includes('@')) {
      console.log('⚠️ Waiting for valid user email...', { user, hasEmail: !!user?.email });
      return;
    }
    
    console.log('✅ Dashboard useEffect - Logged in user email:', email, 'GroupId:', groupId, 'InviteeId:', inviteeId);

    // Hantera direktåtkomst för team eller enskilda kontakter
    if (directAccess === 'true' && contactEmails.length > 0) {
      console.log('Handling direct access for contacts:', contactEmails);
      
      // För direktåtkomst använder vi bara användarens egen token
      // Direktåtkomst betyder att vi kan se andras kalendrar utan att de behöver logga in
      setGroupTokens([user.accessToken]);
      setGroupStatus({
        allJoined: true,
        current: 1 + contactEmails.length, // Simulera att alla är med
        expected: 1 + contactEmails.length,
        invited: contactEmails,
        groupName: teamName || `Möte med ${contactName || contactEmails[0]}`
      });
      setStatusLoaded(true);
      
      console.log('Direct access setup complete - using only user token');
      return; // Stop further execution in this effect
    }
    
    if (groupId) {
      // Hantera direktbokning (gammal logik, kan tas bort eller behållas för bakåtkompatibilitet)
      if (directAccess === 'true' && contactEmails.length === 1) {
        // Skapa en simulerad grupp för direktbokning
        setGroupTokens([user.accessToken]); // Bara din token för nu
        setGroupStatus({
          allJoined: true,
          current: 1,
          expected: 1,
          invited: contactEmails,
          groupName: `Möte med ${contactName || contactEmails[0]}`
        });
        setStatusLoaded(true);
        return;
      }
      
      // Kontrollera om inbjudaren har direkttillgång till min kalender
      if (groupId && !directAccess) {
        // Hämta alla mina kontakt-inställningar
        const myContactSettings = JSON.parse(localStorage.getItem('bookr_contact_settings') || '{}');
        
        // Hitta kontakt som matchar inbjudarens email
        const myContacts = JSON.parse(localStorage.getItem('bookr_contacts') || '[]');
        const inviterContact = myContacts.find(contact => contact.email === email);
        
        if (inviterContact && myContactSettings[inviterContact.id]?.hasCalendarAccess) {
          // Inbjudaren har direkttillgång - hoppa över väntrum
          setGroupTokens([user.accessToken]);
          setGroupStatus({
            allJoined: true,
            current: 1,
            expected: 1,
            invited: [email],
            groupName: `Möte med ${email}`
          });
          setStatusLoaded(true);
          return;
        }
      }
      
      // Kontrollera om inbjudaren har direktåtkomst via Team-kontakter
      fetch(`https://www.onebookr.se/api/group/${groupId}/status`)
        .then(res => res.json())
        .then(groupData => {
          if (groupData && groupData.creatorEmail) {
            const teamContactsKey = `bookr_team_contacts_${email}`;
            const teamContacts = JSON.parse(localStorage.getItem(teamContactsKey) || '[]');
            const inviterContact = teamContacts.find(c => c.email.toLowerCase() === groupData.creatorEmail.toLowerCase());

            if (inviterContact?.directAccess) {
              console.log(`Ansluter automatiskt eftersom ${groupData.creatorEmail} har direktåtkomst.`);
              
              // Anslut automatiskt och sätt upp direktåtkomst
              fetch('https://www.onebookr.se/api/group/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  groupId,
                  token: user.accessToken,
                  invitee: inviteeId,
                  email: email,
                }),
              })
              .then(joinRes => joinRes.json())
              .then(joinData => {
                if (joinData.success) {
                  // Sätt upp direktåtkomst-läge
                  setGroupTokens([user.accessToken]);
                  setGroupStatus({
                    allJoined: true,
                    current: 2, // Du och inbjudaren
                    expected: 2,
                    invited: [groupData.creatorEmail],
                    groupName: groupData.groupName || 'Direktåtkomst-möte'
                  });
                  setStatusLoaded(true);
                  console.log('Direktåtkomst aktiverat för grupp:', groupId);
                }
              })
              .catch(err => console.error('Error joining with direct access:', err));
              
              return; // Stoppa vanlig grupplogik
            }
          }
          // Fortsätt med vanlig grupplogik om ingen direktåtkomst
          continueNormalGroupJoin();
        })
        .catch(err => {
          console.error('Error checking group status for direct access:', err);
          continueNormalGroupJoin();
        });

      // Hoistad deklaration så att anrop ovan fungerar utan ReferenceError
      function continueNormalGroupJoin() {
        // Hantera team-möten
        if (teamName && teamMembers) {
          const memberEmails = teamMembers.split(',');
          setGroupStatus({
            allJoined: false,
            current: 1,
            expected: memberEmails.length + 1,
            invited: memberEmails,
            groupName: `${teamName} - Teammöte`
          });
          setStatusLoaded(true);
          // Fortsätt med vanlig grupplogik för team-möten
        }

        console.log('Joining group normally:', { groupId, email, inviteeId });
        
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
                email: email, // <-- DENNA email är från user-objektet (den inloggade användaren)
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
      } // End of continueNormalGroupJoin function
    }
  }, [groupId, user.accessToken, inviteeId, user.email, user.emails, directAccess, teamName]);

  useEffect(() => {
    if (groupId) {
      // Hämta status för gruppen
      const pollStatus = async () => {
        try {
          const [statusRes, joinedRes] = await Promise.all([
            fetch(`https://www.onebookr.se/api/group/${groupId}/status`),
            fetch(`https://www.onebookr.se/api/group/${groupId}/joined`)
          ]);

          if (statusRes.ok) {
            const status = await statusRes.json();
            console.log('Group status updated:', status);
            
            // Kontrollera explicit om alla har anslutit
            if (status.current >= status.expected) {
              status.allJoined = true;
            }
            
            setGroupStatus(status);
            setStatusLoaded(true);
          }

          if (joinedRes.ok) {
            const data = await joinedRes.json();
            setJoinedEmails(data.joined || []);
          }
        } catch (err) {
          console.error('Status poll failed:', err);
        }
      };

      pollStatus();
      const interval = setInterval(pollStatus, 3000); // Snabbare polling
      return () => clearInterval(interval);
    }
  }, [groupId]);

  // Navigera automatiskt till jämförelse när alla är inne
  useEffect(() => {
    if (groupId && groupStatus.allJoined) {
      console.log('All joined! Showing calendar comparison...');
      // Remove hash-based navigation and page reload
      setStatusLoaded(true);
      // Force re-render of calendar component
      setGroupTokens(prevTokens => [...prevTokens]);
    }
  }, [groupId, groupStatus.allJoined]);

  // Beräkna tokens och gör props stabila
	const tokensAll = (groupId || directAccess === 'true') ? groupTokens : [user.accessToken];
	const invitedTokensRaw = tokensAll.filter(token => token !== user.accessToken);

	// Nytt: memoiserad och städad invitedTokens
	const safeInvitedTokens = useMemo(
		() => (Array.isArray(invitedTokensRaw) ? invitedTokensRaw.filter(Boolean) : []),
		[invitedTokensRaw]
	);

	// Lås montering och frys props för CompareCalendar
	const [compareMounted, setCompareMounted] = useState(false);
	const canRenderCompare = useMemo(() => {
		const haveMyToken = typeof user?.accessToken === 'string' && user.accessToken.length > 0;
		if (!haveMyToken) return false;
		// NYTT: Vänta på att token-validering är klar OCH token är giltig
		if (isValidatingToken || !tokenValidated) return false;
		if (directAccess === 'true') return true;
		if (!groupId) return true;
		return statusLoaded && (groupStatus?.allJoined || (groupStatus?.expected ?? 1) <= 1);
	}, [user?.accessToken, isValidatingToken, tokenValidated, directAccess, groupId, statusLoaded, groupStatus?.allJoined, groupStatus?.expected]);

	// NYTT: frys props vid första "redo"-ögonblick
	const [frozen, setFrozen] = useState(null);
	useEffect(() => {
		if (canRenderCompare && !compareMounted && tokenValidated) {
			setFrozen({
				key: `cmp-${groupId || 'nogroup'}-${directAccess === 'true'}`,
				myToken: user.accessToken,
				invitedTokens: safeInvitedTokens,
				groupId,
				directAccess: directAccess === 'true',
				contactEmail: (contactEmails && contactEmails.length > 0) ? contactEmails[0] : undefined,
				contactEmails,
				contactName,
				teamName,
			});
			setCompareMounted(true);
		}
	}, [
		canRenderCompare,
		compareMounted,
		tokenValidated,
		user.accessToken,
		safeInvitedTokens,
		groupId,
		directAccess,
		contactEmails,
		contactName,
		teamName
	]);

  // Visa laddningsskärm under token-validering
  if (isValidatingToken) {
    return (
      <Container maxWidth="md" sx={{ mt: 10 }}>
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <Typography variant="h5" gutterBottom sx={{ color: '#0a2540', mb: 2 }}>
            Validerar din inloggning...
          </Typography>
          <Typography variant="body1" sx={{ color: '#666' }}>
            Detta tar bara några sekunder
          </Typography>
        </Box>
      </Container>
    );
  }

  // Visa meddelande om token har gått ut
  if (tokenExpired) {
    return (
      <Container maxWidth="md" sx={{ mt: 10 }}>
        <Box sx={{ 
          textAlign: 'center', 
          py: 10,
          bgcolor: '#fff3e0',
          borderRadius: 3,
          border: '2px solid #ff9800'
        }}>
          <Typography variant="h5" gutterBottom sx={{ color: '#bf360c', mb: 2 }}>
            ⚠️ Din session har gått ut
          </Typography>
          <Typography variant="body1" sx={{ color: '#666', mb: 3 }}>
            För säkerhets skull behöver du logga in igen för att fortsätta.
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={() => {
              localStorage.setItem('bookr_return_url', window.location.href);
              window.location.href = 'https://www.onebookr.se/auth/logout';
            }}
            sx={{
              py: 1.5,
              px: 4,
              borderRadius: 3,
              background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
              fontWeight: 600,
              fontSize: '1.1rem',
              boxShadow: '0 4px 20px rgba(99,91,255,0.4)',
              '&:hover': {
                background: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)',
                transform: 'translateY(-2px)',
                boxShadow: '0 8px 32px rgba(99,91,255,0.5)',
              }
            }}
          >
            Logga in igen
          </Button>
        </Box>
      </Container>
    );
  }

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
  

  
  if (currentView === 'invite') {
    return (
      <ErrorBoundary componentName="InviteFriend">
        <InviteFriend fromUser={user} fromToken={user.accessToken} onNavigateBack={() => setCurrentView('shortcut')} />
      </ErrorBoundary>
    );
  }
  
  if (currentView === 'team') {
    return <TeamContacts user={user} onNavigateBack={() => setCurrentView('shortcut')} />;
  }



  // Beräkna vilka som gått med och vilka man väntar på
  const joined = joinedEmails;
  const declined = groupStatus.declinedInvitations || [];
  const waiting = groupStatus.invited
    ? groupStatus.invited.filter(email => 
        !joined.includes(email) && 
        !declined.some(inv => inv.email === email)
      )
    : [];

  return (
    <>
      {((!groupId && directAccess !== 'true') || groupStatus.allJoined) && (
        <Container maxWidth="xl" sx={{ mt: { xs: 2, sm: 4 }, mb: 4, px: { xs: 1, sm: 2, md: 3 } }}>
          {/* Clean Banner */}
          <Box sx={{
            background: 'rgba(255,255,255,0.98)',
            borderRadius: { xs: 2, sm: 3 },
            p: { xs: 3, sm: 4 },
            mb: { xs: 4, sm: 6 },
            textAlign: 'center',
            boxShadow: '0 8px 40px 0 rgba(99,91,255,0.10), 0 1.5px 6px 0 rgba(60,64,67,.06)',
            border: '1.5px solid #e3e8ee'
          }}>
          <Box sx={{ position: 'relative', zIndex: 1 }}>
            <Typography variant="h3" sx={{ 
              fontWeight: 700,
              letterSpacing: -1.5,
              fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
              color: '#0a2540',
              mb: 1,
              fontSize: { xs: 24, sm: 28, md: 36 },
              lineHeight: 1.08
            }}>
              Kalenderjämförelse
            </Typography>
            <Typography variant="h6" sx={{ 
              color: '#425466',
              fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
              fontWeight: 400,
              fontSize: { xs: 14, sm: 16, md: 18 },
              lineHeight: 1.4,
              letterSpacing: -0.5
            }}>
              Jämför kalendrar och hitta gemensamma lediga tider för möten
            </Typography>
          </Box>
        </Box>
        </Container>
      )}
      
      <Container maxWidth="md" sx={{ mt: 2, px: { xs: 2, sm: 3 } }}>
          <Typography variant="h5" gutterBottom sx={{ mt: { xs: 2, sm: 4 }, fontSize: { xs: 20, sm: 24 } }}>
            Hej {(() => {
              try {
                return user.displayName ? decodeURIComponent(escape(user.displayName)) : user.email;
              } catch {
                return user.displayName || user.email;
              }
            })()}
          </Typography>
        {!groupId && directAccess !== 'true' && (
          <Box sx={{ mb: 2, mt: 3 }}>
            <InviteFriend key={`theme-${theme?.isDark}`} fromUser={user} fromToken={user.accessToken} theme={theme} />
          </Box>
        )}
      
      {/* VIKTIG FIX: Rendera CompareCalendar endast när den ska visas och med frysta props */}
      <Box sx={{ position: 'relative' }}>
        {groupId && !groupStatus.allJoined && statusLoaded && (
          <Box sx={{ 
            position: 'relative',
            zIndex: 10,
            my: 5, 
            display: 'flex', 
            justifyContent: 'center' 
          }}>
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
              {(groupStatus.groupName || teamName) && (
                <Typography variant="h6" sx={{ color: '#1976d2', mb: 2 }}>
                  {groupStatus.groupName || `${teamName} - Teammöte`}
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
                      const hasDeclined = groupStatus.declinedInvitations?.some(inv => inv.email === email);
                      const isPending = !hasJoined && !hasDeclined;
                      
                      let bgColor, borderColor, textColor, icon, statusText;
                      
                      if (hasJoined) {
                        bgColor = '#e8f5e8';
                        borderColor = '#4caf50';
                        textColor = '#2e7d32';
                        icon = '✅';
                        statusText = 'Ansluten';
                      } else if (hasDeclined) {
                        bgColor = '#ffebee';
                        borderColor = '#f44336';
                        textColor = '#d32f2f';
                        icon = '❌';
                        statusText = 'Nekad';
                      } else {
                        bgColor = '#fff3e0';
                        borderColor = '#ffcc02';
                        textColor = '#bf360c';
                        icon = '⏳';
                        statusText = 'Väntar';
                      }
                      
                      return (
                        <Box key={idx} sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 2,
                          p: 2,
                          borderRadius: 2,
                          bgcolor: bgColor,
                          border: `1px solid ${borderColor}`
                        }}>
                          <span style={{
                            fontSize: 20,
                            color: textColor
                          }}>
                            {icon}
                          </span>
                          <Typography sx={{
                            color: textColor,
                            fontWeight: hasJoined ? 600 : 500,
                            fontSize: 15
                          }}>
                            {email}
                          </Typography>
                          <Typography variant="caption" sx={{
                            color: textColor,
                            fontWeight: 600,
                            fontSize: 12
                          }}>
                            {statusText}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                  
                  {/* Visa varning om någon har nekat */}
                  {groupStatus.declinedInvitations && groupStatus.declinedInvitations.length > 0 && (
                    <Box sx={{
                      mt: 3,
                      p: 2,
                      borderRadius: 2,
                      bgcolor: '#ffebee',
                      border: '1px solid #f44336'
                    }}>
                      <Typography sx={{
                        color: '#d32f2f',
                        fontWeight: 600,
                        fontSize: 14,
                        mb: 1
                      }}>
                        ⚠️ Nekade inbjudningar:
                      </Typography>
                      <Typography sx={{
                        color: '#d32f2f',
                        fontSize: 13
                      }}>
                        {groupStatus.declinedInvitations.map(inv => inv.email).join(', ')} har nekat inbjudan. 
                        Kalenderjämförelsen kommer att fortsätta utan dem.
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          </Box>
        )}

        {compareMounted && frozen && (
          <Box>
            <ErrorBoundary componentName="CompareCalendar">
              <CompareCalendar
                // ...existing code...
                key={frozen.key}
                myToken={frozen.myToken}
                invitedTokens={frozen.invitedTokens}
                user={user}
                groupId={frozen.groupId}
                directAccess={frozen.directAccess}
                contactEmail={frozen.contactEmail}
                contactEmails={frozen.contactEmails}
                contactName={frozen.contactName}
                teamName={frozen.teamName}
              />
            </ErrorBoundary>
          </Box>
        )}
      </Box>

      </Container>
    </>
  );
}