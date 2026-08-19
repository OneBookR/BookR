import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/sv';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Box, Paper, Typography, Button, CircularProgress, Dialog } from '@mui/material';
import { apiRequest } from '../utils/apiConfig.js';

// ✅ Inline SVG-ikoner (aldrig emoji) — matchar BookRs formspråk.
function CalendarCheckIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 9.5H21" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 3V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 3V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8.5 14.2L11 16.5L15.5 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7V12L15.5 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

moment.locale('sv');
const localizer = momentLocalizer(moment);

// ✅ Kompakt kalenderjämförelse för demo-flödet — en riktig veckokalender,
// avskalad version av huvudappens "Kalendervy" (samma react-big-calendar-
// komponent och gröna "Ledig tid"-events som CompareCalendar.jsx), inte
// den generella multi-medlem-gruppvyn. Hämtar lediga tider mot BookRs
// admin-kalender, låter besökaren klicka ett event, visar en låst
// bekräftelseruta, och bokar automatiskt utan manuellt godkännande.
export default function DemoCalendarPicker({ leadId, companyName, onBooked, onError }) {
  const [slots, setSlots] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [isBooking, setIsBooking] = useState(false);
  // ✅ Fel som INTE ska trigga om hämtningen automatiskt — bara visas.
  const [loadError, setLoadError] = useState(null);

  // OBS: onError skickas in som en inline-funktion från BokaDemo.jsx och
  // byter referens vid varje render (den beror på `toast`-state där). Om
  // den stod i dependency-arrayen nedan skulle varje anrop av onError()
  // trigga en re-render → ny onError-referens → effekten kör igen → onError
  // anropas igen → oändlig loop (det här var exakt "snabb polling"-buggen:
  // fetchAvailability kördes om och om igen tills demoLimiter slog till).
  // onError anropas fortfarande, bara inte som ett skäl att köra om hämtningen.
  useEffect(() => {
    let cancelled = false;

    async function fetchAvailability() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const res = await apiRequest(`/api/book-demo/availability?leadId=${encodeURIComponent(leadId)}`);
        const data = await res.json().catch(() => ({}));

        if (cancelled) return;

        if (res.ok && Array.isArray(data.slots)) {
          setSlots(data.slots);
        } else {
          const message = data.error || 'Kunde inte hämta lediga tider.';
          setLoadError(message);
          onError(message);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError('Nätverksfel vid hämtning av lediga tider.');
          onError('Nätverksfel vid hämtning av lediga tider.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    if (leadId) fetchAvailability();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  // ✅ Samma event-format som CompareCalendar.jsx: en ledig slot = ett
  // klickbart, grönt kalenderevent.
  const calendarEvents = useMemo(() => slots.map((slot, index) => {
    const start = new Date(slot.start);
    const end = new Date(slot.end);
    const duration = Math.round((end - start) / 60000);
    return {
      id: `demo-slot-${index}`,
      title: `Ledig tid (${duration} min)`,
      start,
      end,
      slot
    };
  }), [slots]);

  const eventPropGetter = useCallback(() => ({
    style: {
      backgroundColor: '#4caf50',
      color: '#ffffff',
      border: '2px solid #388e3c',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: '600',
      padding: '2px 6px',
      cursor: 'pointer'
    }
  }), []);

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

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.03em', mb: 1 }}>
          Välj den tid som passar dig bäst
        </Typography>
        <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Alla tider du ser här fungerar både för oss och dig!
        </Typography>
      </Box>

      <Paper
        elevation={0}
        sx={{
          borderRadius: 6, border: '1px solid var(--border)', bgcolor: 'var(--surface-strong)',
          boxShadow: 'var(--shadow-soft)', p: { xs: 2, md: 3 }, overflow: 'hidden'
        }}
      >
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} />
          </Box>
        )}

        {!isLoading && loadError && (
          <Typography sx={{ fontSize: 14, color: 'var(--error)', textAlign: 'center', py: 6 }}>
            Kunde inte hämta lediga tider just nu. Hör av dig till info@onebookr.se så bokar vi en tid manuellt.
          </Typography>
        )}

        {!isLoading && !loadError && slots.length === 0 && (
          <Typography sx={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', py: 6 }}>
            Inga gemensamma lediga tider hittades den närmaste tiden. Hör av dig till info@onebookr.se så hittar vi en tid.
          </Typography>
        )}

        {!isLoading && slots.length > 0 && (
          <Box
            sx={{
              height: 500,
              fontFamily: "'Manrope', 'Segoe UI', sans-serif",
              '& .rbc-calendar': { fontFamily: 'inherit' },
              '& .rbc-toolbar button': { fontFamily: 'inherit', fontWeight: 600, color: 'var(--text)' },
              '& .rbc-toolbar button.rbc-active': { bgcolor: 'var(--text)', color: '#fff', boxShadow: 'none' },
              '& .rbc-header': { fontWeight: 700, color: 'var(--text)', padding: '8px 4px' },
              '& .rbc-today': { bgcolor: 'rgba(17,24,39,0.03)' }
            }}
          >
            <Calendar
              localizer={localizer}
              events={calendarEvents}
              startAccessor="start"
              endAccessor="end"
              style={{ height: '100%' }}
              eventPropGetter={eventPropGetter}
              views={['week', 'day']}
              defaultView="week"
              onSelectEvent={(event) => setSelectedSlot(event.slot)}
              messages={{
                next: 'Nästa', previous: 'Föregående', today: 'Idag',
                month: 'Månad', week: 'Vecka', day: 'Dag'
              }}
            />
          </Box>
        )}
      </Paper>

      {/* ✅ Förifylld, icke-redigerbar bekräftelse som en fokuserad modal —
          titeln byggs alltid server-side från leadets sparade
          företagsnamn, aldrig redigerbar här. */}
      <Dialog
        open={Boolean(selectedSlot)}
        onClose={() => !isBooking && setSelectedSlot(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 6, border: '1px solid var(--border)', boxShadow: 'var(--shadow-soft)' }
        }}
      >
        {selectedSlot && (
          <Box sx={{ p: { xs: 3, md: 4 } }}>
            <Box
              sx={{
                width: 52, height: 52, borderRadius: '50%', bgcolor: 'rgba(17,24,39,0.06)',
                color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2.5
              }}
            >
              <CalendarCheckIcon size={24} />
            </Box>

            <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 0.75 }}>
              Bekräfta ditt möte
            </Typography>
            <Typography sx={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', mb: 2.5, lineHeight: 1.3 }}>
              {companyName} x BookR – Demo
            </Typography>

            <Box
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, p: 2, mb: 3,
                borderRadius: 3, bgcolor: 'rgba(17,24,39,0.03)', border: '1px solid rgba(17,24,39,0.05)'
              }}
            >
              <Box sx={{ color: 'var(--text-secondary)', display: 'flex', flexShrink: 0 }}>
                <ClockIcon />
              </Box>
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 700, textTransform: 'capitalize' }}>
                  {new Date(selectedSlot.start).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' })}
                </Typography>
                <Typography sx={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {new Date(selectedSlot.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })}
                  {' – '}
                  {new Date(selectedSlot.end).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })}
                </Typography>
              </Box>
            </Box>

            <Typography sx={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, mb: 3 }}>
              Mötet bokas direkt i både din och BookRs kalender — ingen ytterligare bekräftelse behövs.
            </Typography>

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
      </Dialog>
    </Box>
  );
}
