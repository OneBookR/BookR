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
      question: "Vad är BookR och varför behöver jag det?",
      answer: "BookR löser det mest irriterande problemet i arbetslivet: att boka möten. Istället för 10+ mejl fram och tillbaka loggar alla bara in, ser direkt när ni alla är lediga, klickar på en tid och får Google Meet-länk automatiskt. Sparar timmar varje vecka."
    },
    {
      question: "Hur mycket tid sparar jag egentligen?",
      answer: "Genomsnittspersonen spenderar 2-3 timmar per vecka på att koordinera möten via mejl. Med BookR tar det 30 sekunder. Det är 2,5 timmar tillbaka i veckan – över 100 timmar per år som du kan använda till viktigare saker."
    },
    {
      question: "Kan andra se vad jag gör i min kalender?",
      answer: "NEJ! BookR läser bara om du är 'ledig' eller 'upptagen' – aldrig vad du gör, var du är eller med vem. Det är som att fråga 'Kan du på tisdag 14:00?' och få svaret 'Ja' eller 'Nej' – inget mer."
    },
    {
      question: "Vad händer när alla accepterat en tid?",
      answer: "Magi! 🪄 BookR skapar automatiskt en Google Calendar-händelse, skickar ut inbjudningar till alla, och genererar en Google Meet-länk. Alla får mejl med mötesdetaljer. Du behöver inte göra något mer."
    },
    {
      question: "Kostar det något?",
      answer: "Grundfunktionerna är alltid 100% gratis för privatpersoner och små grupper. Vi planerar premiumfunktioner för stora företag senare, men du kommer alltid kunna använda BookR gratis för dina vardagsmöten."
    },
    {
      question: "När kan jag börja använda BookR?",
      answer: "Vi lanserar inom nägra veckor! Genom att gå med på väntelistan får du tidig access innan alla andra. Du får ett mejl så fort vi är redo – inga spam, bara en notis när du kan börja spara tid."
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
                Sluta slösa tid på att boka möten
              </Typography>
              <Typography variant="h2" sx={{
                fontSize: { xs: '1.25rem', md: '1.5rem' },
                color: '#425466',
                mb: 3,
                fontWeight: 400,
                lineHeight: 1.4
              }}>
                BookR jämför automatiskt alla era Google-kalendrar och visar exakt när ni alla är lediga. 
                Klicka, välj tid, klart – Google Meet-länk skapas automatiskt.
              </Typography>
              
              {/* Problem/Solution */}
              <Box sx={{ 
                bgcolor: '#fff3e0', 
                border: '1px solid #ffcc02', 
                borderRadius: 2, 
                p: 2.5, 
                mb: 3 
              }}>
                <Typography variant="body1" sx={{ 
                  color: '#e65100', 
                  fontWeight: 600, 
                  mb: 1,
                  fontSize: '1.1rem'
                }}>
                  🤯 Känner du igen dig?
                </Typography>
                <Typography variant="body2" sx={{ color: '#bf360c', mb: 2 }}>
                  "När passar det dig?" → "Hmm, inte måndag..." → "Tisdag då?" → "Nej, har möte..." 
                  → 15 mejl senare → "Okej, torsdag 14:00?" → "Glömde bort, har tandläkare..."
                </Typography>
                <Typography variant="body1" sx={{ 
                  color: '#2e7d32', 
                  fontWeight: 600,
                  fontSize: '1.05rem'
                }}>
                  ✅ Med BookR: Alla loggar in → Ser lediga tider → Klickar på en → Möte bokat med Meet-länk!
                </Typography>
              </Box>
              
              {/* Benefits */}
              <Grid container spacing={2} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ 
                      bgcolor: '#e8f5e8', 
                      borderRadius: '50%', 
                      p: 1, 
                      display: 'flex' 
                    }}>
                      <AccessTimeIcon sx={{ color: '#2e7d32', fontSize: 20 }} />
                    </Box>
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: 600, color: '#0a2540' }}>
                        Sparar 90% av tiden
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#666' }}>
                        Från timmar till sekunder
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ 
                      bgcolor: '#e3f2fd', 
                      borderRadius: '50%', 
                      p: 1, 
                      display: 'flex' 
                    }}>
                      <SecurityIcon sx={{ color: '#1976d2', fontSize: 20 }} />
                    </Box>
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: 600, color: '#0a2540' }}>
                        100% säkert & gratis
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#666' }}>
                        Läser bara ledig/upptagen
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ 
                      bgcolor: '#f3e5f5', 
                      borderRadius: '50%', 
                      p: 1, 
                      display: 'flex' 
                    }}>
                      <NotificationsIcon sx={{ color: '#7b1fa2', fontSize: 20 }} />
                    </Box>
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: 600, color: '#0a2540' }}>
                        Automatisk bokning
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#666' }}>
                        Meet-länk + kalenderinbjudan
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ 
                      bgcolor: '#fff3e0', 
                      borderRadius: '50%', 
                      p: 1, 
                      display: 'flex' 
                    }}>
                      <GroupIcon sx={{ color: '#f57c00', fontSize: 20 }} />
                    </Box>
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: 600, color: '#0a2540' }}>
                        {waitlistCount}+ väntar redan
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#666' }}>
                        Gå med nu för tidig access
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </Grid>

              <Paper component="form" onSubmit={handleSubmit} sx={{
                p: 3,
                borderRadius: 3,
                boxShadow: '0 8px 32px rgba(99,91,255,0.12)',
                border: '2px solid #635bff',
                bgcolor: 'linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%)'
              }}>
                <Box sx={{ textAlign: 'center', mb: 2 }}>
                  <Typography variant="h6" sx={{ color: '#0a2540', fontWeight: 700, mb: 0.5 }}>
                    🚀 Få tidig access – helt gratis!
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#635bff', fontWeight: 600 }}>
                    Lanseras inom kort • Inga kreditkort • Inga dolda avgifter
                  </Typography>
                </Box>
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
                    className="animate-pulse"
                    sx={{
                      py: 2,
                      borderRadius: 3,
                      background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                      fontWeight: 700,
                      fontSize: '1.2rem',
                      boxShadow: '0 4px 20px rgba(99,91,255,0.4)',
                      '&:hover': {
                        background: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)',
                        transform: 'translateY(-2px)',
                        boxShadow: '0 8px 32px rgba(99,91,255,0.5)',
                      }
                    }}
                  >
                    {isSubmitting ? '⏳ Registrerar...' : '🎯 Ja, jag vill slippa kalenderkaoset!'}
                  </Button>
                </Box>
                <Typography variant="caption" sx={{ 
                  display: 'block', 
                  textAlign: 'center', 
                  color: '#666', 
                  mt: 2,
                  fontStyle: 'italic'
                }}>
                  💡 Du får ett mejl när vi lanserar + tidig access till alla funktioner
                </Typography>
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
      <Box sx={{ 
        background: 'linear-gradient(135deg, #635bff 0%, #6c47ff 100%)', 
        py: 8,
        position: 'relative',
        overflow: 'hidden'
      }}>
        <Container maxWidth="md" sx={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <Typography variant="h3" sx={{
            color: '#fff',
            mb: 2,
            fontSize: { xs: '2rem', md: '2.5rem' },
            fontWeight: 700
          }}>
            Sluta slösa 2+ timmar i veckan på att boka möten
          </Typography>
          <Typography variant="h6" sx={{ 
            color: 'rgba(255,255,255,0.95)', 
            mb: 1,
            fontSize: '1.3rem',
            fontWeight: 500
          }}>
            Över 100 sparade timmar per år = mer tid för det som verkligen räknas
          </Typography>
          <Typography variant="body1" sx={{ 
            color: 'rgba(255,255,255,0.8)', 
            mb: 4,
            fontSize: '1.1rem'
          }}>
            Gå med på väntelistan nu och få tidig access när vi lanserar • Helt gratis • Inga kreditkort
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={() => document.querySelector('form').scrollIntoView({ behavior: 'smooth' })}
            sx={{
              py: 2.5,
              px: 5,
              borderRadius: 4,
              bgcolor: '#fff',
              color: '#635bff',
              fontWeight: 700,
              fontSize: '1.2rem',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              '&:hover': {
                bgcolor: '#f8f9ff',
                transform: 'translateY(-3px)',
                boxShadow: '0 12px 48px rgba(0,0,0,0.4)'
              }
            }}
          >
            🚀 Ja, jag vill spara 100+ timmar per år!
          </Button>
          <Typography variant="caption" sx={{ 
            display: 'block',
            color: 'rgba(255,255,255,0.7)', 
            mt: 2,
            fontSize: '0.9rem'
          }}>
            ✨ {waitlistCount}+ personer väntar redan • Lanseras inom nägra veckor
          </Typography>
        </Container>
        
        {/* Background decoration */}
        <Box sx={{
          position: 'absolute',
          top: -50,
          right: -50,
          width: 200,
          height: 200,
          borderRadius: '50%',
          bgcolor: 'rgba(255,255,255,0.1)',
          zIndex: 0
        }} />
        <Box sx={{
          position: 'absolute',
          bottom: -30,
          left: -30,
          width: 150,
          height: 150,
          borderRadius: '50%',
          bgcolor: 'rgba(255,255,255,0.05)',
          zIndex: 0
        }} />
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