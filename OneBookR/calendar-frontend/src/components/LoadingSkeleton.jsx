import React from 'react';
import { Box, Skeleton } from '@mui/material';

export const TimeSlotSkeleton = () => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
    {[...Array(4)].map((_, i) => (
      <Box key={i} sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        bgcolor: '#f5f5f5', 
        borderRadius: 2, 
        p: 2,
        gap: 2
      }}>
        <Skeleton variant="text" width={80} />
        <Skeleton variant="text" width={100} />
        <Skeleton variant="text" width={120} />
        <Skeleton variant="text" width={80} />
        <Box sx={{ flex: 1 }} />
        <Skeleton variant="rectangular" width={160} height={36} sx={{ borderRadius: 1 }} />
      </Box>
    ))}
  </Box>
);

export const SuggestionSkeleton = () => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    {[...Array(2)].map((_, i) => (
      <Box key={i} sx={{ 
        border: '1px solid #e0e3e7', 
        borderRadius: 3, 
        p: 3 
      }}>
        <Skeleton variant="text" width={200} height={24} sx={{ mb: 1 }} />
        <Skeleton variant="text" width={300} height={20} sx={{ mb: 1 }} />
        <Skeleton variant="text" width={150} height={20} sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Skeleton variant="rectangular" width={100} height={36} sx={{ borderRadius: 1 }} />
          <Skeleton variant="rectangular" width={80} height={36} sx={{ borderRadius: 1 }} />
        </Box>
      </Box>
    ))}
  </Box>
);