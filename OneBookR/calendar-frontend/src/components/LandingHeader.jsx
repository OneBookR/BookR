import React, { useState } from 'react';
import { Box, Button, Menu, MenuItem } from '@mui/material';
import { Logo } from '../assets/Logo.jsx';
import GoogleLogo from '../assets/GoogleLogo.jsx';
import MicrosoftLogo from '../assets/MicrosoftLogo.jsx';
import { createApiUrl } from '../utils/apiConfig.js';

// ✅ Publik header för landningssidan + boka-demo (dvs. utloggat läge).
// Två åtgärder: "Logga in" (diskret — under privat beta är den egentligen
// bara för teamet) och "Boka demo" (den primära CTA:n för besökare).
// "Logga in" öppnar en liten meny med Google/Microsoft istället för ett
// stort login-kort, så ingen missförstår det som vägen in i produkten.
export default function LandingHeader({ showLogin = true, showDemo = true, returnTo = '/' }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const encodedReturn = encodeURIComponent(returnTo);

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 1100,
        bgcolor: 'rgba(247, 247, 243, 0.82)',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(22px)',
        WebkitBackdropFilter: 'blur(22px)',
      }}
    >
      <Box
        sx={{
          maxWidth: 1280,
          mx: 'auto',
          px: { xs: 2.5, md: 8 },
          height: { xs: 60, md: 68 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Logo
          iconSize={24}
          fontSize={20}
          onClick={() => { window.location.href = '/'; }}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 1.5 } }}>
          {showLogin && (
            <>
              <Button
                onClick={(e) => setAnchorEl(e.currentTarget)}
                disableElevation
                sx={{
                  color: 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: { xs: 13, md: 14 },
                  textTransform: 'none',
                  borderRadius: 999,
                  px: { xs: 1.25, md: 1.75 },
                  '&:hover': { bgcolor: 'rgba(17,24,39,0.04)', color: 'var(--text)' },
                }}
              >
                Logga in
              </Button>
              <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                sx={{ mt: 1, '& .MuiPaper-root': { borderRadius: 3, border: '1px solid var(--border)', boxShadow: 'var(--shadow-soft)', minWidth: 236 } }}
              >
                <MenuItem
                  component="a"
                  href={createApiUrl(`/auth/google?returnTo=${encodedReturn}`)}
                  sx={{ gap: 1.5, py: 1.25, fontWeight: 700, fontSize: 14 }}
                >
                  <GoogleLogo size={18} />
                  Fortsätt med Google
                </MenuItem>
                <MenuItem
                  component="a"
                  href={createApiUrl(`/auth/microsoft?returnTo=${encodedReturn}`)}
                  sx={{ gap: 1.5, py: 1.25, fontWeight: 700, fontSize: 14 }}
                >
                  <MicrosoftLogo size={18} />
                  Fortsätt med Microsoft
                </MenuItem>
              </Menu>
            </>
          )}

          {showDemo && (
            <Button
              href="/boka-demo"
              variant="contained"
              disableElevation
              sx={{
                bgcolor: 'var(--text)',
                color: 'var(--surface-strong)',
                fontWeight: 700,
                fontSize: { xs: 13, md: 14 },
                textTransform: 'none',
                borderRadius: 999,
                px: { xs: 2, md: 2.75 },
                py: { xs: 0.75, md: 1 },
                boxShadow: 'none',
                '&:hover': { bgcolor: '#000000', boxShadow: 'none' },
              }}
            >
              Boka demo
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
}
