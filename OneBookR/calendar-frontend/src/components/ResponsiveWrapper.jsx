import React from 'react';
import { Box, useMediaQuery, useTheme } from '@mui/material';

const ResponsiveWrapper = ({ children, mobileProps = {}, desktopProps = {} }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const baseProps = {
    sx: {
      width: '100%',
      ...(isMobile ? mobileProps.sx : desktopProps.sx)
    },
    ...(isMobile ? mobileProps : desktopProps)
  };

  return (
    <Box {...baseProps}>
      {children}
    </Box>
  );
};

export default ResponsiveWrapper;