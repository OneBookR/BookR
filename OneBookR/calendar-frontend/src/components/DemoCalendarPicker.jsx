import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/sv';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Box, Paper, Typography, Button, CircularProgress, Dialog, useMediaQuery } from '@mui/material';
import { apiRequest } from '../utils/apiConfig.js';
import { trackEvent } from '../utils/analytics.js';
import CalendarPrivacyNote from './CalendarPrivacyNote.jsx';

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

// ✅ Mobil slot-väljare ("Riktning A" i designcanvasen, godkänd av
// användaren) — react-big-calendars 7-kolumners veckovy blir oläslig på
// mobilbredd (kolumner ~40px, "9:00 AM Ledig" radbryts kaotiskt). Under
// sm-brytpunkten ersätts kalendergridden av: horisontellt scrollbara
// dag-flikar + en enkel enkolumns tidslista för bara den valda dagen.
// Desktop (sm+) rör vi inte — samma react-big-calendar-veckovy som förut.
function MobileDayPicker({ slots, onSelectSlot }) {
  // Gruppera slots per kalenderdag (lokal Europe/Stockholm-dag, inte UTC).
  const dayGroups = useMemo(() => {
    const groups = new Map();
    slots.forEach((slot) => {
      const start = new Date(slot.start);
      const dayKey = start.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
      if (!groups.has(dayKey)) {
        groups.set(dayKey, { dayKey, date: start, slots: [] });
      }
      groups.get(dayKey).slots.push(slot);
    });
    return Array.from(groups.values()).sort((a, b) => a.date - b.date);
  }, [slots]);

  const [selectedDayKey, setSelectedDayKey] = useState(dayGroups[0]?.dayKey ?? null);

  // Om slots laddas om (t.ex. första hämtningen landar efter mount) och
  // ingen dag är vald än, eller den tidigare valda dagen inte längre finns
  // (inga lediga tider kvar den dagen) — hoppa till första tillgängliga dag.
  useEffect(() => {
    if (dayGroups.length === 0) return;
    if (!dayGroups.some((g) => g.dayKey === selectedDayKey)) {
      setSelectedDayKey(dayGroups[0].dayKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayGroups]);

  const activeGroup = dayGroups.find((g) => g.dayKey === selectedDayKey) ?? dayGroups[0];

  if (dayGroups.length === 0) return null;

  return (
    <Box>
      {/* Dag-flikar — horisontellt scrollbara, dölj scrollbaren men behåll funktionen */}
      <Box
        sx={{
          display: 'flex', gap: 1, overflowX: 'auto', pb: 1.75, mb: 1.75,
          borderBottom: '1px solid var(--border)',
          scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }
        }}
      >
        {dayGroups.map((group) => {
          const isActive = group.dayKey === activeGroup?.dayKey;
          return (
            <Box
              key={group.dayKey}
              onClick={() => setSelectedDayKey(group.dayKey)}
              sx={{
                flexShrink: 0, minWidth: 60, textAlign: 'center', cursor: 'pointer',
                borderRadius: 3.5, px: 2, py: 1.25,
                bgcolor: isActive ? 'var(--text)' : 'var(--background)',
                border: isActive ? 'none' : '1px solid var(--border)',
                color: isActive ? '#fff' : 'var(--text)',
                transition: 'background-color 120ms ease'
              }}
            >
              <Typography sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3, opacity: isActive ? 0.85 : 0.65 }}>
                {group.date.toLocaleDateString('sv-SE', { weekday: 'short', timeZone: 'Europe/Stockholm' })}
              </Typography>
              <Typography sx={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3 }}>
                {group.date.toLocaleDateString('sv-SE', { day: 'numeric', timeZone: 'Europe/Stockholm' })}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* Vald dags lediga tider — enkolumns lista, gott om plats för texten */}
      {activeGroup && (
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em', mb: 1.25 }}>
            {activeGroup.date.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' })}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {activeGroup.slots.map((slot, i) => (
              <Box
                key={i}
                onClick={() => onSelectSlot(slot)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.75,
                  borderRadius: 3.5, bgcolor: 'rgba(31,122,77,0.08)', border: '1.5px solid rgba(31,122,77,0.3)',
                  cursor: 'pointer', transition: 'background-color 120ms ease',
                  '&:active': { bgcolor: 'rgba(31,122,77,0.15)' }
                }}
              >
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'var(--success)', flexShrink: 0 }} />
                <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                  {new Date(slot.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })}
                  {' – '}
                  {new Date(slot.end).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })}
                </Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', ml: 'auto' }}>
                  Ledigt
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ✅ Kompakt kalenderjämförelse för demo-flödet — en riktig veckokalender,
// avskalad version av huvudappens "Kalendervy" (samma react-big-calendar-
// komponent och gröna "Ledig tid"-events som CompareCalendar.jsx), inte
// den generella multi-medlem-gruppvyn. Hämtar lediga tider mot BookRs
// admin-kalender, låter besökaren klicka ett event, visar en låst
// bekräftelseruta, och bokar automatiskt utan manuellt godkännande.
export default function DemoCalendarPicker({ leadId, companyName, onBooked, onError }) {
  // ✅ Under 600px (MUI:s "sm") används MobileDayPicker istället för
  // react-big-calendars veckogrid — se motivering vid MobileDayPicker ovan.
  const isMobile = useMediaQuery('(max-width:599.95px)');
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
          trackEvent('demo_calendar_viewed', { slot_count: data.slots.length });
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

  // ✅ Delad handler för både desktop (react-big-calendar onSelectEvent)
  // och mobil (MobileDayPicker) — sätter valet OCH spårar det på samma
  // ställe, så vi inte missar mobila slot-val i analytics.
  const handleSelectSlot = useCallback((slot) => {
    setSelectedSlot(slot);
    trackEvent('demo_slot_selected');
  }, []);

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
        trackEvent('demo_booking_confirmed');
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
      <Box sx={{ textAlign: 'center', display: 'grid', gap: 1.75, justifyItems: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.03em' }}>
          Nu är era gemensamma lediga tider hittade
        </Typography>
        <Typography sx={{ fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.65, maxWidth: 468 }}>
          Det här är din första kalenderjämförelse med BookR. Varje grön tid nedan
          är ledig hos <Box component="span" sx={{ color: 'var(--text)', fontWeight: 700 }}>både dig och oss</Box> — ingen
          mejltråd, inga förslag fram och tillbaka. Välj en tid, så bokas den direkt
          i båda kalendrarna.
        </Typography>
        <CalendarPrivacyNote phase="after" />
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

        {!isLoading && slots.length > 0 && isMobile && (
          <MobileDayPicker slots={slots} onSelectSlot={handleSelectSlot} />
        )}

        {!isLoading && slots.length > 0 && !isMobile && (
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
              onSelectEvent={(event) => handleSelectSlot(event.slot)}
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
