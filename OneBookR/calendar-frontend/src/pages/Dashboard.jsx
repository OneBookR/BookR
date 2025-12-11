import React, { useState, useEffect, useCallback, useMemo } from 'react';
import InviteFriend from './InviteFriend';
import CompareCalendar from './CompareCalendar';
import { Box, CircularProgress, Typography } from '@mui/material';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

// ✅ ENKEL OCH STABIL DASHBOARD
export default function Dashboard({ user, onNavigateToMeeting }) {
  // ✅ MEMOIZED USER DATA
  const userData = useMemo(() => ({
    email: user?.email || user?.emails?.[0]?.value || user?.emails?.[0],
    accessToken: user?.accessToken,
    provider: user?.provider || (user?.mail ? 'microsoft' : 'google')
  }), [user]);

  // ✅ URL PARAMS
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const groupId = urlParams.get('group');
  const inviteeId = urlParams.get('invitee');
  const directAccess = urlParams.get('directAccess') === 'true';
  const contactEmail = urlParams.get('contactEmail');
  const contactName = urlParams.get('contactName');

  // ✅ MINIMAL STATE
  const [isReady, setIsReady] = useState(false);

  // ✅ TOKEN VALIDATION
  useEffect(() => {
    if (!user?.accessToken) {
      setIsReady(true);
      return;
    }

    const validateToken = async () => {
      try {
        const testUrl = user.provider === 'microsoft'
          ? 'https://graph.microsoft.com/v1.0/me'
          : 'https://www.googleapis.com/calendar/v3/users/me/settings/timezone';

        const res = await fetch(testUrl, {
          headers: { Authorization: `Bearer ${user.accessToken}` }
        });

        if (res.status === 401) {
          console.log('Token expired, redirecting to logout');
          localStorage.clear();
          
          // ✅ DYNAMIC LOGOUT URL
          const logoutUrl = process.env.NODE_ENV === 'development' 
            ? '/auth/logout'
            : 'https://www.onebookr.se/auth/logout';
          
          window.location.href = logoutUrl;
          return;
        }

        setIsReady(true);
      } catch (err) {
        console.error('Token validation error:', err);
        setIsReady(true);
      }
    };

    validateToken();
  }, [user?.accessToken, user?.provider]);

  // ✅ LOADING STATE
  if (!isReady) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Validerar inloggning...</Typography>
      </Box>
    );
  }

  // ✅ MAIN RENDER
  return (
    <ErrorBoundary componentName="Dashboard">
      <Box sx={{ maxWidth: 1200, mx: 'auto', p: 2 }}>
        <CompareCalendar
          myToken={user?.accessToken}
          invitedTokens={[]} // Backend hanterar group tokens
          user={user}
          groupId={groupId}
          directAccess={directAccess}
          contactEmail={contactEmail}
          contactName={contactName}
          autoCompare={Boolean(groupId)}
        />
        
        {!groupId && (
          <InviteFriend
            fromUser={user}
            fromToken={user?.accessToken}
          />
        )}
      </Box>
    </ErrorBoundary>
  );
}