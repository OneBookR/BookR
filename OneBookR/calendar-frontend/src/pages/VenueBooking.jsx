import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, Button, Paper, Grid, Alert } from '@mui/material';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';

const localizer = momentLocalizer(moment);

const VenueBooking = () => {
  const { venueId } = useParams();
  const [venueInfo, setVenueInfo] = useState(null);
  const [venueSlots, setVenueSlots] = useState([]);
  const [userEvents, setUserEvents] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [friends, setFriends] = useState([]);

  useEffect(() => {
    loadVenueData();
  }, [venueId]);

  const loadVenueData = async () => {
    try {
      const response = await fetch(`/api/venues/${venueId}`);
      const data = await response.json();
      
      if (response.ok) {
        setVenueInfo(data.venue);
        setVenueSlots(data.availableSlots);
        findAvailableSlots(data.availableSlots, userEvents);
      }
    } catch (error) {
      console.error('Fel vid laddning av halldata:', error);
    }
  };

  const findAvailableSlots = (slots, events) => {
    const available = slots.filter(slot => {
      const slotTime = new Date(slot.start);
      return !events.some(event => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        return slotTime >= eventStart && slotTime < eventEnd;
      });
    });
    setAvailableSlots(available);
  };

  const connectCalendar = async () => {
    // Implementera Google Calendar-anslutning
    window.location.href = '/auth/google';
  };

  const inviteFriend = () => {
    const shareUrl = `${window.location.origin}/venue/${venueId}`;
    navigator.clipboard.writeText(shareUrl);
    alert('Länk kopierad! Dela med dina vänner.');
  };

  if (!venueInfo) {
    return <Typography>Laddar...</Typography>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        {venueInfo.name}
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Lediga tider vs ditt schema
            </Typography>
            
            <Calendar
              localizer={localizer}
              events={[...venueSlots, ...userEvents]}
              startAccessor="start"
              endAccessor="end"
              style={{ height: 500 }}
              eventPropGetter={(event) => ({
                style: {
                  backgroundColor: event.type === 'venue' ? '#4caf50' : '#f44336'
                }
              })}
            />
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Anslut ditt schema
            </Typography>
            <Button 
              variant="contained" 
              fullWidth 
              onClick={connectCalendar}
              sx={{ mb: 2 }}
            >
              Anslut Google Calendar
            </Button>
          </Paper>

          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Bjud in vänner
            </Typography>
            <Button 
              variant="outlined" 
              fullWidth 
              onClick={inviteFriend}
            >
              Dela länk med vänner
            </Button>
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Lediga tider ({availableSlots.length})
            </Typography>
            {availableSlots.slice(0, 5).map((slot, index) => (
              <Box key={index} sx={{ mb: 1, p: 1, bgcolor: 'success.light', borderRadius: 1 }}>
                <Typography variant="body2">
                  {moment(slot.start).format('DD/MM HH:mm')} - {moment(slot.end).format('HH:mm')}
                </Typography>
              </Box>
            ))}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default VenueBooking;