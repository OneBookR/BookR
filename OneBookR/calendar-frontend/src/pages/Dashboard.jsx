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
  
  const urlParams = new URLSearchParams(window.location.search);
  const groupId = urlParams.get('group');
  const inviteeId = urlParams.get('invitee');
  const directAccess = urlParams.get('directAccess');
  const contactEmails = urlParams.getAll('contactEmail');
  const contactName = urlParams.get('contactName');
  const teamName = urlParams.get('teamName');
  const teamMembers = urlParams.get('members');
  
  const handleNavigateToMeeting = onNavigateToMeeting || ((type) => {
    window.location.href = `/?meetingType=${type}`;
  });
  
  // Set initial view based on URL params
  useEffect(() => {
    if (groupId) {
      setCurrentView('compare');
    } else if (teamName) {
      setCurrentView('team');
    } else {
      setCurrentView('shortcut');
    }
  }, [groupId, teamName]);
  
  // Härleder provider (fallback om props saknar provider)
  const derivedProvider = React.useMemo(() => {
    if (user?.provider) return user.provider;
    if (user?.email?.includes('@')) return 'google';
    if (user?.emails?.[0]) return 'google';
    return 'google';
  }, [user?.provider, user?.email, user?.emails]);

  // Validera token innan någon kalenderjämförelse
  useEffect(() => {
    if (!user?.accessToken) {
      setIsValidatingToken(false);
      return;
    }
    
    const validateToken = async () => {
      try {
        const endpoint = derivedProvider === 'microsoft' 
          ? 'https://graph.microsoft.com/v1.0/me'
          : 'https://www.googleapis.com/calendar/v3/users/me/settings/timezone';
        
        const response = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${user.accessToken}` }
        });
        
        if (response.status === 401) {
          setTokenExpired(true);
          console.log('Token expired, redirecting to login');
          setTimeout(() => {
            window.location.href = '/auth/logout';
          }, 1500);
        } else {
          setTokenExpired(false);
        }
      } catch (error) {
        console.error('Token validation error:', error);
      } finally {
        setIsValidatingToken(false);
      }
    };
    
    validateToken();
  }, [user?.accessToken, derivedProvider]);
 
  // Hämta grupp status och tokens
  useEffect(() => {
    if (!groupId || !user?.accessToken) return;
    
    const fetchGroupStatus = async () => {
      try {
        const response = await fetch(`https://www.onebookr.se/api/group/${groupId}/status`);
        if (response.ok) {
          const data = await response.json();
          setGroupStatus(data);
          setJoinedEmails(data.joined || []);
        }
      } catch (error) {
        console.error('Failed to fetch group status:', error);
      }
    };
    
    const fetchTokens = async () => {
      try {
        const response = await fetch(`https://www.onebookr.se/api/group/${groupId}/tokens`);
        if (response.ok) {
          const data = await response.json();
          setGroupTokens(data.tokens || []);
        }
      } catch (error) {
        console.error('Failed to fetch tokens:', error);
      }
    };
    
    fetchGroupStatus();
    fetchTokens();
    setStatusLoaded(true);
  }, [groupId, user?.accessToken]);

  // Navigera automatiskt till jämförelse när alla är inne
  useEffect(() => {
    if (groupId && groupStatus.allJoined && statusLoaded) {
      setShowCompare(true);
    }
  }, [groupId, groupStatus.allJoined, statusLoaded]);

  // Beräkna tokens och gör props stabila
	const tokensAll = (groupId || directAccess === 'true') ? groupTokens : [user?.accessToken];
	const invitedTokensRaw = tokensAll.filter(token => token !== user?.accessToken);

	// Nytt: memoiserad och städad invitedTokens
	const safeInvitedTokens = React.useMemo(
		() => (Array.isArray(invitedTokensRaw) ? invitedTokensRaw.filter(Boolean) : []),
		[invitedTokensRaw]
	);

	// Lås montering och frys props för CompareCalendar
	const [compareMounted, setCompareMounted] = useState(false);

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
            {/* Ta ej med ErrorBoundary här */}
            <CompareCalendar
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
          </Box>
        )}
      </Box>

      </Container>
    </>
  );
}