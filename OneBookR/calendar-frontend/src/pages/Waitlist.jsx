import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Button, TextField, Paper, Grid, 
  Card, CardContent, Accordion, AccordionSummary, AccordionDetails,
  Alert, Snackbar, Fade, Grow
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import GroupIcon from '@mui/icons-material/Group';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SecurityIcon from '@mui/icons-material/Security';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EmailIcon from '@mui/icons-material/Email';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { API_BASE_URL } from '../config';

const Waitlist = () => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [waitlistCount, setWaitlistCount] = useState(0);

  // Hämta antal personer på väntelistan
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/waitlist/count`)
      .then(res => res.json())
      .then(data => setWaitlistCount(data.count || 0))
      .catch(() => setWaitlistCount(0));
  }, []);

  // Animationer
  useEffect(() => {
    if (!document.getElementById('waitlist-animations')) {
      const style = document.createElement('style');
      style.id = 'waitlist-animations';
      style.innerHTML = `
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatCalendar {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-10px) rotate(2deg); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-50px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(50px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-float { animation: floatCalendar 6s ease-in-out infinite; }
        .animate-pulse { animation: pulse 2s ease-in-out infinite; }
        .animate-fade-in { animation: fadeInUp 0.8s ease-out; }
        .animate-slide-left { animation: slideInLeft 0.8s ease-out; }
        .animate-slide-right { animation: slideInRight 0.8s ease-out; }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !name) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name })
      });

      if (res.ok) {
        setToast({ open: true, message: 'Tack! Du är nu med på väntelistan 🎉', severity: 'success' });
        setEmail('');
        setName('');
        setWaitlistCount(prev => prev + 1);
      } else {
        const data = await res.json();
        setToast({ open: true, message: data.error || 'Något gick fel', severity: 'error' });
      }
    } catch (err) {
      setToast({ open: true, message: 'Något gick fel. Försök igen.', severity: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const faqData = [
    {
      question: "Hur fungerar BookR?",
      answer: "BookR kopplar ihop dina Google-kalendrar och visar automatiskt när alla är lediga samtidigt. Du bjuder in vänner eller kollegor, alla loggar in med Google, och systemet jämför era kalendrar för att hitta gemensamma lediga tider."
    },
    {
      question: "Är mina kalenderdata säkra?",
      answer: "Ja! Vi använder Googles säkra OAuth-system och läser endast om du är ledig eller upptagen - aldrig vad du gör eller med vem. Dina kalenderdata lagras aldrig permanent hos oss."
    },
    {
      question: "Kostar BookR något?",
      answer: "BookR kommer att vara gratis för grundfunktioner. Vi planerar premiumfunktioner för större team och företag, men privatpersoner och små grupper kan alltid använda tjänsten kostnadsfritt."
    },
    {
      question: "Vilka kalendrar stöds?",
      answer: "Just nu stöder vi Google Calendar, som är den mest använda kalendertjänsten. Vi planerar att lägga till stöd för Outlook/Microsoft 365 och Apple Calendar i framtiden."
    },
    {
      question: "Kan jag använda BookR för jobbet?",
      answer: "Absolut! BookR är perfekt för att koordinera möten med kollegor, kunder och partners. Vi arbetar på företagsfunktioner som integration med Slack och Teams."
    },
    {
      question: "När lanseras BookR?",
      answer: "Vi är i slutfasen av utvecklingen och planerar en beta-lansering inom kort. Genom att gå med på väntelistan får du förtur och tidig access till alla nya funktioner."
    }
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>
      {/* Hero Section */}
      <Container maxWidth="lg" sx={{ pt: 8, pb: 6 }}>
        <Grid container spacing={6} alignItems="center">
          <Grid item xs={12} md={6}>
            <Box className="animate-slide-left">
              <Typography variant="h1" sx={{
                fontSize: { xs: '2.5rem', md: '3.5rem' },
                fontWeight: 700,
                color: '#0a2540',
                mb: 2,
                lineHeight: 1.1,
                fontFamily: "'Inter', 'Segoe UI', 'Roboto', sans-serif"
              }}>
                Slipp kalenderkaoset
              </Typography>
              <Typography variant="h2" sx={{
                fontSize: { xs: '1.25rem', md: '1.5rem' },
                color: '#425466',
                mb: 4,
                fontWeight: 400,
                lineHeight: 1.4
              }}>
                BookR hittar automatiskt när alla är lediga och bokar möten åt dig. 
                Ingen mer mejlkarusell eller dubbelbokningar.
              </Typography>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <GroupIcon sx={{ color: '#635bff', fontSize: 20 }} />
                  <Typography variant="body2" sx={{ color: '#666' }}>
                    {waitlistCount}+ personer väntar redan
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircleIcon sx={{ color: '#4caf50', fontSize: 20 }} />
                  <Typography variant="body2" sx={{ color: '#666' }}>
                    100% gratis
                  </Typography>
                </Box>
              </Box>

              <Paper component="form" onSubmit={handleSubmit} sx={{
                p: 3,
                borderRadius: 3,
                boxShadow: '0 8px 32px rgba(99,91,255,0.12)',
                border: '1px solid #e3e8ff'
              }}>
                <Typography variant="h6" sx={{ mb: 2, color: '#0a2540', fontWeight: 600 }}>
                  🚀 Få tidig access
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField
                    label="Ditt namn"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    fullWidth
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                  <TextField
                    label="E-postadress"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    fullWidth
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={isSubmitting}
                    sx={{
                      py: 1.5,
                      borderRadius: 2,
                      background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                      fontWeight: 600,
                      fontSize: '1.1rem',
                      '&:hover': {
                        background: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)',
                      }
                    }}
                  >
                    {isSubmitting ? 'Registrerar...' : 'Gå med på väntelistan'}
                  </Button>
                </Box>
              </Paper>
            </Box>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Box className="animate-slide-right" sx={{ textAlign: 'center' }}>
              <Box className="animate-float" sx={{ display: 'inline-block' }}>
                <CalendarMonthIcon sx={{ 
                  fontSize: { xs: 120, md: 180 }, 
                  color: '#635bff',
                  filter: 'drop-shadow(0 8px 32px rgba(99,91,255,0.3))'
                }} />
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Container>

      {/* How it works */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="h3" sx={{
          textAlign: 'center',
          mb: 6,
          fontSize: { xs: '2rem', md: '2.5rem' },
          fontWeight: 700,
          color: '#0a2540'
        }}>
          Så här fungerar det
        </Typography>
        
        <Grid container spacing={4}>
          {[
            {
              step: '1',
              title: 'Logga in med Google',
              description: 'Säker inloggning med ditt Google-konto. Vi läser endast om du är ledig eller upptagen.',
              icon: <SecurityIcon sx={{ fontSize: 40, color: '#635bff' }} />
            },
            {
              step: '2', 
              title: 'Bjud in andra',
              description: 'Skicka inbjudningar via e-post till vänner, kollegor eller familj som du vill träffa.',
              icon: <EmailIcon sx={{ fontSize: 40, color: '#635bff' }} />
            },
            {
              step: '3',
              title: 'Se gemensamma tider',
              description: 'BookR jämför alla kalendrar automatiskt och visar när ni alla är lediga samtidigt.',
              icon: <AccessTimeIcon sx={{ fontSize: 40, color: '#635bff' }} />
            },
            {
              step: '4',
              title: 'Boka direkt',
              description: 'Föreslå en tid, alla accepterar, och Google Meet-länk + kalenderinbjudan skickas ut automatiskt.',
              icon: <NotificationsIcon sx={{ fontSize: 40, color: '#635bff' }} />
            }
          ].map((item, index) => (
            <Grid item xs={12} md={6} key={index}>
              <Grow in timeout={800 + index * 200}>
                <Card sx={{
                  height: '100%',
                  borderRadius: 3,
                  border: '1px solid #e3e8ff',
                  boxShadow: '0 4px 20px rgba(99,91,255,0.08)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: '0 8px 40px rgba(99,91,255,0.15)'
                  }
                }}>
                  <CardContent sx={{ p: 4 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <Box sx={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        bgcolor: '#e3e8ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mr: 2,
                        fontWeight: 700,
                        color: '#635bff',
                        fontSize: '1.2rem'
                      }}>
                        {item.step}
                      </Box>
                      {item.icon}
                    </Box>
                    <Typography variant="h6" sx={{ mb: 1, fontWeight: 600, color: '#0a2540' }}>
                      {item.title}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#666', lineHeight: 1.6 }}>
                      {item.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grow>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Features */}
      <Box sx={{ bgcolor: '#fff', py: 8 }}>
        <Container maxWidth="lg">
          <Typography variant="h3" sx={{
            textAlign: 'center',
            mb: 6,
            fontSize: { xs: '2rem', md: '2.5rem' },
            fontWeight: 700,
            color: '#0a2540'
          }}>
            Varför välja BookR?
          </Typography>
          
          <Grid container spacing={4}>
            {[
              {
                title: 'Sparar tid',
                description: 'Slipp det eviga fram och tillbaka i mejl. Hitta lediga tider på sekunder istället för dagar.',
                icon: '⚡'
              },
              {
                title: 'Helt säkert',
                description: 'Vi läser aldrig vad du gör eller med vem. Endast om du är ledig eller upptagen.',
                icon: '🔒'
              },
              {
                title: 'Automatisk bokning',
                description: 'När alla accepterat skapas Google Meet-länk och kalenderinbjudan automatiskt.',
                icon: '🤖'
              },
              {
                title: 'Fungerar överallt',
                description: 'Responsiv design som fungerar lika bra på mobil, surfplatta och dator.',
                icon: '📱'
              },
              {
                title: 'Perfekt för team',
                description: 'Koordinera möten med kollegor, kunder och partners utan krångel.',
                icon: '👥'
              },
              {
                title: 'Alltid gratis',
                description: 'Grundfunktionerna är alltid gratis för privatpersoner och små grupper.',
                icon: '💝'
              }
            ].map((feature, index) => (
              <Grid item xs={12} md={4} key={index}>
                <Fade in timeout={1000 + index * 100}>
                  <Box sx={{ textAlign: 'center', p: 3 }}>
                    <Typography sx={{ fontSize: '3rem', mb: 2 }}>
                      {feature.icon}
                    </Typography>
                    <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#0a2540' }}>
                      {feature.title}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#666', lineHeight: 1.6 }}>
                      {feature.description}
                    </Typography>
                  </Box>
                </Fade>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* FAQ */}
      <Container maxWidth="md" sx={{ py: 8 }}>
        <Typography variant="h3" sx={{
          textAlign: 'center',
          mb: 6,
          fontSize: { xs: '2rem', md: '2.5rem' },
          fontWeight: 700,
          color: '#0a2540'
        }}>
          Vanliga frågor
        </Typography>
        
        {faqData.map((faq, index) => (
          <Accordion key={index} sx={{
            mb: 2,
            borderRadius: 2,
            border: '1px solid #e3e8ff',
            boxShadow: 'none',
            '&:before': { display: 'none' },
            '&.Mui-expanded': {
              boxShadow: '0 4px 20px rgba(99,91,255,0.1)'
            }
          }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ py: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#0a2540' }}>
                {faq.question}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography sx={{ color: '#666', lineHeight: 1.6 }}>
                {faq.answer}
              </Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Container>

      {/* CTA */}
      <Box sx={{ bgcolor: 'linear-gradient(135deg, #635bff 0%, #6c47ff 100%)', py: 8 }}>
        <Container maxWidth="md" sx={{ textAlign: 'center' }}>
          <Typography variant="h3" sx={{
            color: '#fff',
            mb: 3,
            fontSize: { xs: '2rem', md: '2.5rem' },
            fontWeight: 700
          }}>
            Redo att slippa kalenderkaoset?
          </Typography>
          <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.9)', mb: 4 }}>
            Gå med på väntelistan och få tidig access till BookR
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={() => document.querySelector('form').scrollIntoView({ behavior: 'smooth' })}
            sx={{
              py: 2,
              px: 4,
              borderRadius: 3,
              bgcolor: '#fff',
              color: '#635bff',
              fontWeight: 600,
              fontSize: '1.1rem',
              '&:hover': {
                bgcolor: '#f8f9ff',
                transform: 'translateY(-2px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
              }
            }}
          >
            Gå med på väntelistan
          </Button>
        </Container>
      </Box>

      <Snackbar
        open={toast.open}
        autoHideDuration={6000}
        onClose={() => setToast({ ...toast, open: false })}
      >
        <Alert severity={toast.severity} onClose={() => setToast({ ...toast, open: false })}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Waitlist;