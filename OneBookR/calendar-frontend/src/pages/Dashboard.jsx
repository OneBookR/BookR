import React, { useMemo } from 'react';
import CompareCalendar from './CompareCalendar';
import { Box } from '@mui/material';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

export default function Dashboard({ user, onNavigateToMeeting }) {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const groupId = urlParams.get('group');
  const directAccess = urlParams.get('directAccess') === 'true';
  const contactEmail = urlParams.get('contactEmail');
  const contactName = urlParams.get('contactName');

  return (
    <ErrorBoundary componentName="Dashboard">
      <Box sx={{ maxWidth: 1200, mx: 'auto', p: 2 }}>
        <CompareCalendar
          myToken={null}
          invitedTokens={[]}
          user={user}
          groupId={groupId}
          directAccess={directAccess}
          contactEmail={contactEmail}
          contactName={contactName}
          autoCompare={Boolean(groupId)}
        />
      </Box>
    </ErrorBoundary>
  );
}