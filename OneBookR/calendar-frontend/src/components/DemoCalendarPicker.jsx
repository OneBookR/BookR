import React, { useState, useEffect, useCallback } from 'react';
import { Box, Paper, Typography, Button, CircularProgress } from '@mui/material';
import { apiRequest } from '../utils/apiConfig.js';

// ✅ Kompakt kalenderjämförelse för demo-flödet — INTE hela
// CompareCalendar.jsx (den är byggd för det generella multi-medlem-
// gruppflödet). Hämtar lediga tider mot BookRs admin-kalender, låter
// besökaren välja en, visar en låst bekräftelseruta, och bokar
// automatiskt utan manuellt godkännande.
export default function DemoCalendarPicker({ leadId, companyName, onBooked, onError }) {
  const [slots, setSlots] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [isBooking, setIsBooking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchAvailability() {
      setIsLoading(true);
      try {
        const res = await apiRequest(`/api/book-demo/availability?leadId=${encodeURIComponent(leadId)}`);
        const data = await res.json().catch(() => ({}));

        if (cancelled) return;

        if (res.ok && Array.isArray(data.slots)) {
          setSlots(data.slots);
        } else {
          onError(data.error || 'Kunde inte hämta lediga tider.');
        }
      } catch (err) {
        if (!cancelled) onError('Nätverksfel vid hämtning av lediga tider.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    if (leadId) fetchAvailability();
    return () => { cancelled = true; };
  }, [leadId, onError]);

  const confirmBooking = useCallback(async () => {
    if (!selectedSlot || isBooking) return;
    setIsBooking(true);
    try {
      const res = await apiRequest('/api/book-demo/confirm', {
        method: 'POST',
        body: JSON.stringify({ leadId, start: selectedSlot.start, end: selectedSlot.end })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        onBooked({ start: selectedSlot.start, end: selectedSlot.end, meetLink: data.meetLink });
      } else {
        onError(data.error || 'Kunde inte boka mötet. Försök igen.');
        setIsBooking(false);
      }
    } catch (err) {
      onError('Nätverksfel vid bokning. Försök igen.');
      setIsBooking(false);
    }
  }, [selectedSlot, leadId, isBooking, onBooked, onError]);

  // ✅ Gruppera slots per dag för en läsbar vy.
  const slotsByDay = slots.reduce((acc, slot) => {
    const day = new Date(slot.start).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' });
    if (!acc[day]) acc[day] = [];
    acc[day].push(slot);
    return acc;
  }, {});

  return (
    <Paper elevation={0} sx={{ borderRadius: 6, border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)', boxShadow: 'var(--shadow-soft)', p: { xs: 3, md: 5 } }}>
      <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.03em', mb: 1 }}>
        Välj en tid
      </Typography>
      <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, mb: 3.5 }}>
        Det här är riktiga lediga tider — jämförda direkt mellan din kalender och BookRs.
      </Typography>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      )}

      {!isLoading && slots.length === 0 && (
        <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', py: 4 }}>
          Inga gemensamma lediga tider hittades den närmaste tiden. Hör av dig till info@onebookr.se så hittar vi en tid.
        </Typography>
      )}

      {!isLoading && slots.length > 0 && !selectedSlot && (
        <Box sx={{ display: 'grid', gap: 2.5 }}>
          {Object.entries(slotsByDay).map(([day, daySlots]) => (
            <Box key={day}>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', mb: 1, textTransform: 'capitalize' }}>
                {day}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {daySlots.map((slot, i) => (
                  <Button
                    key={i}
                    variant="outlined"
                    onClick={() => setSelectedSlot(slot)}
                    sx={{ borderRadius: 2.5, borderColor: 'var(--border)', color: 'var(--text)', fontWeight: 700, px: 2, '&:hover': { borderColor: 'rgba(17,24,39,0.22)', bgcolor: 'rgba(17,24,39,0.02)' } }}
                  >
                    {new Date(slot.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })}
                  </Button>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {selectedSlot && (
        <Box>
          {/* ✅ Förifylld, icke-redigerbar bekräftelseruta — titeln byggs
              alltid server-side från leadets sparade företagsnamn. */}
          <Box sx={{ p: 3, borderRadius: 4, border: '1px solid var(--border)', bgcolor: 'rgba(17,24,39,0.025)', mb: 3 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1 }}>
              Möte
            </Typography>
            <Typography sx={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', mb: 1.5 }}>
              {companyName} x BookR – Demo
            </Typography>
            <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              {new Date(selectedSlot.start).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' })}
              {', '}
              {new Date(selectedSlot.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })}
              {' – '}
              {new Date(selectedSlot.end).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              variant="outlined"
              onClick={() => setSelectedSlot(null)}
              disabled={isBooking}
              sx={{ borderRadius: 3, borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              Välj annan tid
            </Button>
            <Button
              variant="contained"
              onClick={confirmBooking}
              disabled={isBooking}
              fullWidth
              sx={{ py: 1.6, borderRadius: 3, bgcolor: 'var(--text)', color: 'var(--surface-strong)', fontWeight: 700, boxShadow: 'none', '&:hover': { bgcolor: '#000', boxShadow: 'none' } }}
            >
              {isBooking ? 'Bokar...' : 'Bekräfta bokning'}
            </Button>
          </Box>
        </Box>
      )}
    </Paper>
  );
}
