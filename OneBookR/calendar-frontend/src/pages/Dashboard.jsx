import React, { useEffect, useState } from 'react';
import InviteFriend from './InviteFriend';
import CompareCalendar from './CompareCalendar';
import Task from './Task';
import ShortcutDashboard from './ShortcutDashboard';
import TeamDashboard from './TeamDashboard';
import ContactManager from './ContactManager';
import TeamContacts from './TeamContacts';
import { Container, Typography, Box, Button, TextField } from '@mui/material';
import { useTheme } from '../hooks/useTheme';

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
 
  useEffect(() => {
    // Hämta e-post på säkert sätt
    let email = user.email;
    if (!email && user.emails && user.emails.length > 0) {
      email = user.emails[0].value || user.emails[0];
    }
    if (!email) {
      alert('Kunde inte hitta din e-postadress. Logga ut och logga in igen med ett Google-konto som har e-post.');
      return;
    }

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
      
      const continueNormalGroupJoin = () => {


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
      }; // End of continueNormalGroupJoin function
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
      // Force re-render of calendar component by fetching tokens again
      fetch(`https://www.onebookr.se/api/group/${groupId}/tokens`)
        .then(res => res.json())
        .then(data => {
          if (data && data.tokens) {
            setGroupTokens(data.tokens);
          }
        });
    }
  }, [groupId, groupStatus.allJoined]);

  // Om ingen grupp, använd bara din egen token
  const tokens = (groupId || directAccess === 'true') ? groupTokens : [user.accessToken];
  const invitedTokens = tokens.filter(token => token !== user.accessToken);
  
  console.log('Dashboard tokens setup:', {
    totalTokens: tokens.length,
    myToken: user.accessToken ? 'Present' : 'Missing',
    invitedTokens: invitedTokens.length,
    directAccess: directAccess === 'true',
    groupId: groupId
  });

  // Grupp-länk
  const groupLink = groupId
    ? `${window.location.origin}${window.location.pathname}?group=${groupId}`
    : '';

  // NYTT: Visa väntrum endast om vi aktivt väntar på andra att ansluta
  const waitingForOthers = groupId && !groupStatus.allJoined && statusLoaded && !directAccess && groupStatus.expected > 1;

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
    return <InviteFriend user={user} onNavigateBack={() => setCurrentView('shortcut')} />;
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
      
      {/* Visa "väntar på andra" om inte alla är inne OCH status har laddats */}
      {groupId && !groupStatus.allJoined && statusLoaded && (
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

      {/* Visa kalendern när det inte är en grupp, eller när alla har anslutit */}
      {tokens.length > 0 && (!groupId || directAccess === 'true' || groupStatus.allJoined) && (
        <CompareCalendar
          myToken={user.accessToken}
          invitedTokens={invitedTokens}
          user={user}
          groupId={groupId}
          directAccess={directAccess === 'true'}
          contactEmails={contactEmails}
          contactName={contactName}
          teamName={teamName}
        />
      )}

      </Container>
    </>
  );
}