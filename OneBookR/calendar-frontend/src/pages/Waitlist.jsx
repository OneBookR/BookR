import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Button, TextField, Paper, Grid, 
  Accordion, AccordionSummary, AccordionDetails,
  Alert, Snackbar
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { API_BASE_URL } from '../config';


const Waitlist = () => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [waitlistCount, setWaitlistCount] = useState(0);
  const [successOverlay, setSuccessOverlay] = useState(false);
  const [shareLinks, setShareLinks] = useState(null);

  // 👇 Hämta referrer från URL
const urlParams = new URLSearchParams(window.location.search);
const [referrer, setReferrer] = useState(urlParams.get('referrer') || null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/waitlist/count`)
      .then(res => res.json())
      .then(data => setWaitlistCount(data.count || 0))
      .catch(() => setWaitlistCount(0));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !name) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, referrer }) // 🔑 skickar värvaren
      });

      if (res.ok) {
        // Show success overlay instead of toast
        setSuccessOverlay(true);
        setEmail('');
        setName('');
        setWaitlistCount(prev => prev + 1);
        // 👇 Skapa användarens unika referral-länk
        const referralLink = `${window.location.origin}/waitlist?referrer=${encodeURIComponent(email)}`;
        setShareLinks({ copy: referralLink });

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

  const handleShare = (platform) => {
    if (!shareLinks) {
      setToast({ open: true, message: 'Registrera dig först för att få en unik länk!', severity: 'error' });
      return;
    }

    if (platform === 'copy') {
      navigator.clipboard.writeText(shareLinks.copy);
      setToast({ open: true, message: 'Din unika länk kopierad! 📋', severity: 'success' });
    } else if (platform === 'email') {
      window.open(`mailto:?subject=Kolla in BookR&body=Registrera dig här: ${encodeURIComponent(shareLinks.copy)}`);
    } else if (platform === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent("Kolla in BookR: " + shareLinks.copy)}`);
    }
  };

  const handleShareWaitlist = async (platform) => {
    if (!shareLinks) {
      setToast({ open: true, message: 'Registrera dig först för att få en unik länk!', severity: 'error' });
      return;
    }

    if (platform === 'copy' || platform === 'email' || platform === 'whatsapp') {
      if (shareLinks[platform]) {
    }

      try {
        const res = await fetch(`${API_BASE_URL}/api/waitlist/share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        setShareLinks(data.shareLinks);
        
        if (platform === 'copy') {
          navigator.clipboard.writeText(data.waitlistUrl);
          setToast({ open: true, message: 'Länk kopierad! 📋', severity: 'success' });
        } else {
          window.open(data.shareLinks[platform], '_blank');
        }
      } catch (err) {
        setToast({ open: true, message: 'Något gick fel', severity: 'error' });
      }
    } else {
      if (platform === 'copy') {
        navigator.clipboard.writeText('https://www.onebookr.se/waitlist');
        setToast({ open: true, message: 'Länk kopierad! 📋', severity: 'success' });
      } else {
        window.open(shareLinks[platform], '_blank');
      }
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
      answer: "Vi lanserar inom några veckor! Genom att gå med på väntelistan får du tidig access innan alla andra. Du får ett mejl så fort vi är redo – inga spam, bara en notis när du kan börja spara tid."
    }
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>
      {/* Hero Section */}
      <Container maxWidth="lg" sx={{ pt: 8, pb: 8 }}>
        {/* BookR Logo */}
        <Box sx={{
          textAlign: 'center',
          mb: 4
        }}>
          <Typography sx={{
            fontWeight: 800,
            fontSize: { xs: 24, sm: 28, md: 32 },
            color: '#635bff',
            letterSpacing: 0.5,
            fontFamily: "'Inter','Segoe UI','Roboto','Arial',sans-serif",
            textShadow: '0 2px 4px rgba(99,91,255,0.2)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            '&:hover': {
              transform: 'scale(1.05)',
              textShadow: '0 4px 8px rgba(99,91,255,0.3)'
            }
          }}
          onClick={() => window.location.href = '/'}>
            BookR
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'center', mb: 8 }}>
          <Typography variant="h1" sx={{
            fontSize: { xs: '2.8rem', md: '4rem' },
            fontWeight: 700,
            color: '#0a2540',
            mb: 3,
            lineHeight: 1.1,
            fontFamily: "'Inter', 'Segoe UI', 'Roboto', sans-serif"
          }}>
            Planera smartare. Hitta gemensamma tider – på sekunder.
          </Typography>
          <Typography variant="h2" sx={{
            fontSize: { xs: '1.3rem', md: '1.6rem' },
            color: '#425466',
            mb: 6,
            fontWeight: 400,
            lineHeight: 1.4,
            maxWidth: 600,
            mx: 'auto'
          }}>
            Anslut din Google-kalender och se direkt när du och dina vänner är lediga. 
            Slipp mejlkaoset – boka möten på 30 sekunder.
          </Typography>

          {/* Signup Form */}
          <Paper component="form" onSubmit={handleSubmit} sx={{
            p: 4,
            borderRadius: 4,
            boxShadow: '0 12px 48px rgba(99,91,255,0.15)',
            border: '1px solid #e3e8ff',
            maxWidth: 500,
            mx: 'auto',
            mb: 4
          }}>
            <Typography variant="h6" sx={{ 
              color: '#0a2540', 
              fontWeight: 600, 
              mb: 3,
              fontSize: '1.2rem'
            }}>
              🚀 Gå med på väntelistan
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <TextField
                label="Ditt namn"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
              />
              <TextField
                label="E-postadress"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
              />
              <Button
                type="submit"
                variant="contained"
                disabled={isSubmitting}
                sx={{
                  py: 2.5,
                  borderRadius: 3,
                  background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  boxShadow: '0 4px 20px rgba(99,91,255,0.4)',
                  '&:hover': {
                    background: 'linear-gradient(90deg, #7a5af8 0%, #635bff 100%)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 32px rgba(99,91,255,0.5)',
                  }
                }}
              >
                {isSubmitting ? 'Registrerar...' : 'Gå med på väntelistan'}
              </Button>
            </Box>
          </Paper>

          {/* Social Proof */}
          <Typography variant="body1" sx={{ 
            color: '#666', 
            fontSize: '1.1rem',
            mb: 1
          }}>
            🎉 <strong>{waitlistCount}+ personer</strong> väntar redan
          </Typography>
          <Typography variant="body2" sx={{ color: '#888', mb: 6 }}>
            100% gratis • Inga kreditkort • Lanseras inom kort
          </Typography>
          
          {/* Share Section */}
          <Paper sx={{
            p: 4,
            borderRadius: 4,
            border: '1px solid #e3e8ff',
            maxWidth: 500,
            mx: 'auto',
            bgcolor: '#f8f9ff'
          }}>
            <Typography variant="h6" sx={{ 
              color: '#0a2540', 
              fontWeight: 600, 
              mb: 2,
              textAlign: 'center'
            }}>
              💌 Dela med vänner
            </Typography>
            <Typography variant="body2" sx={{ 
              color: '#666', 
              mb: 3,
              textAlign: 'center'
            }}>
              Känner du någon som också slösar tid på att boka möten? Dela BookR!
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => handleShare('email')}
                  sx={{
                    borderRadius: 2,
                    fontWeight: 600,
                    borderColor: '#635bff',
                    color: '#635bff',
                    '&:hover': {
                      borderColor: '#635bff',
                      bgcolor: 'rgba(99,91,255,0.1)'
                    }
                  }}
                >
                  📧 E-post
                </Button>
              </Grid>
              <Grid item xs={6}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => handleShare('whatsapp')}
                  sx={{
                    borderRadius: 2,
                    fontWeight: 600,
                    borderColor: '#25D366',
                    color: '#25D366',
                    '&:hover': {
                      borderColor: '#25D366',
                      bgcolor: 'rgba(37,211,102,0.1)'
                    }
                  }}
                >
                  📱 WhatsApp
                </Button>
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  fullWidth
                  onClick={() => handleShare('copy')}
                  sx={{
                    borderRadius: 2,
                    fontWeight: 600,
                    bgcolor: '#635bff',
                    '&:hover': {
                      bgcolor: '#7a5af8'
                    }
                  }}
                >
                  🔗 Kopiera länk
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Box>
      </Container>

      {/* How it works */}
      <Box sx={{ bgcolor: '#fff', py: 10 }}>
        <Container maxWidth="lg">
          <Typography variant="h3" sx={{
            textAlign: 'center',
            mb: 8,
            fontSize: { xs: '2.2rem', md: '2.8rem' },
            fontWeight: 700,
            color: '#0a2540'
          }}>
            Så enkelt fungerar det
          </Typography>
          
          <Grid container spacing={6} justifyContent="center">
            {[
              {
                step: '1',
                title: 'Anslut kalender',
                description: 'Logga in säkert med Google. Vi läser bara ledig/upptagen – aldrig vad du gör.',
                icon: '🔗',
                color: '#e8f5e8'
              },
              {
                step: '2', 
                title: 'Bjud in vänner',
                description: 'Skicka en länk till kollegor, vänner eller familj. De loggar in på samma sätt.',
                icon: '📩',
                color: '#e3f2fd'
              },
              {
                step: '3',
                title: 'Se lediga tider',
                description: 'BookR jämför automatiskt alla kalendrar och visar när ni alla är fria.',
                icon: '⚡',
                color: '#fff3e0'
              },
              {
                step: '4',
                title: 'Boka med ett klick',
                description: 'Välj tid, alla accepterar, Google Meet-länk skapas. Klart på 30 sekunder!',
                icon: '🎉',
                color: '#f3e5f5'
              }
            ].map((item, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Box sx={{ textAlign: 'center', px: 2 }}>
                  <Box sx={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    bgcolor: item.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    mb: 3,
                    fontSize: '2rem',
                    position: 'relative'
                  }}>
                    {item.icon}
                    <Box sx={{
                      position: 'absolute',
                      top: -8,
                      right: -8,
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      bgcolor: '#635bff',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '1rem'
                    }}>
                      {item.step}
                    </Box>
                  </Box>
                  <Typography variant="h6" sx={{ 
                    mb: 2, 
                    fontWeight: 600, 
                    color: '#0a2540',
                    fontSize: '1.3rem'
                  }}>
                    {item.title}
                  </Typography>
                  <Typography variant="body2" sx={{ 
                    color: '#666', 
                    lineHeight: 1.6,
                    fontSize: '1rem'
                  }}>
                    {item.description}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
          
          {/* Process Flow */}
          <Box sx={{ textAlign: 'center', mt: 8, py: 4 }}>
            <Typography variant="body1" sx={{ 
              color: '#635bff', 
              fontWeight: 600,
              fontSize: '1.2rem',
              mb: 2
            }}>
              Från 15+ mejl och timmar av planering...
            </Typography>
            <Typography variant="h4" sx={{ 
              color: '#2e7d32', 
              fontWeight: 700,
              fontSize: '1.8rem',
              mb: 6
            }}>
              ...till 30 sekunder och klart! ✨
            </Typography>
            
            {/* Detailed explanation */}
            <Container maxWidth="md">
              <Typography variant="body1" sx={{
                color: '#425466',
                fontSize: '1.2rem',
                lineHeight: 1.7,
                textAlign: 'left',
                mb: 4
              }}>
                <strong>Sluta slösa tid på det mest irriterande i arbetslivet.</strong> Varje vecka spenderar du timmar på att 
                koordinera möten via mejl. "När passar det?" "Inte måndag..." "Tisdag då?" "Nej, har tandläkare..." 
                Och så fortsätter det. BookR gör slut på detta kaos för alltid.
              </Typography>
              
              <Typography variant="body1" sx={{
                color: '#425466',
                fontSize: '1.2rem',
                lineHeight: 1.7,
                textAlign: 'left',
                mb: 4
              }}>
                <strong>Istället för 15+ mejl och flera dagars väntan</strong> ser ni direkt när alla är lediga. BookR 
                analyserar allas kalendrar samtidigt och visar endast de <strong>perfekta tiderna</strong> när ni alla kan. 
                Inga gissningar, inga missförstånd, inga dubbelbokningar.
              </Typography>
              
              <Typography variant="body1" sx={{
                color: '#425466',
                fontSize: '1.2rem',
                lineHeight: 1.7,
                textAlign: 'left'
              }}>
                <strong>Det bästa av allt?</strong> När ni väl hittat en tid tar BookR hand om resten. Google Meet-länk, 
                kalenderinbjudningar, påminnelser – allt skapas automatiskt. Ni går från "Vi behöver träffas" 
                till ett fullständigt bokat möte på <strong>30 sekunder</strong>. Det är så här mötesplanering ska fungera.
              </Typography>
            </Container>
          </Box>
        </Container>
      </Box>

      {/* Dold admin-knapp */}
      <Box sx={{
        position: 'fixed',
        bottom: 10,
        right: 10,
        width: 20,
        height: 20,
        cursor: 'pointer',
        opacity: 0.1,
        '&:hover': { opacity: 0.3 }
      }} onClick={() => {
        const password = prompt('Admin lösenord:');
        if (password) {
          fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
          }).then(res => res.json()).then(data => {
            if (data.success) {
              window.location.href = '/dashboard';
            } else {
              alert('Fel lösenord');
            }
          });
        }
      }}>
        ⚙️
      </Box>

      {/* Timeline Section */}
      <Box sx={{ bgcolor: '#f8fafc', py: 10 }}>
        <Container maxWidth="lg">
          <Typography variant="h3" sx={{
            textAlign: 'center',
            mb: 8,
            fontSize: { xs: '2.2rem', md: '2.8rem' },
            fontWeight: 700,
            color: '#0a2540'
          }}>
            Vår utvecklingsplan
          </Typography>
          
          <Box sx={{ position: 'relative', maxWidth: 800, mx: 'auto' }}>
            {/* Timeline Line */}
            <Box sx={{
              position: 'absolute',
              left: '50%',
              top: 0,
              bottom: 0,
              width: 2,
              bgcolor: '#e3e8ee',
              transform: 'translateX(-50%)'
            }} />
            
            {/* Timeline Items */}
            {[
              {
                date: '15/10',
                title: 'Grupp events',
                description: 'Dela arbetsuppgifter i grupp som interagerar med kalendern',
                status: 'soon'
              },
              {
                date: '1/10', 
                title: 'Task',
                description: 'Automatisk tidsplanering och event placering i kalendern',
                status: 'completed'
              },
              {
                date: '21/8',
                title: 'Kalenderjämförare',
                description: 'Kalenderjämförelse med hur många kalendrar som helst samtidigt',
                status: 'completed'
              },
              {
                date: '11/8',
                title: 'Google Meet Integration',
                description: 'Google Meet-länk skapas automatiskt när möten bokas i kalendern',
                status: 'completed'
              },
              {
                date: '10/8',
                title: 'Kalenderjämförare',
                description: 'Jämföra kalendrar med varandra samtidigt och hitta lediga tider tillsammans 1v1',
                status: 'completed'
              }
            ].map((item, index) => (
              <Box key={index} sx={{
                display: 'flex',
                alignItems: 'center',
                mb: 6,
                position: 'relative'
              }}>
                {/* Timeline Dot */}
                <Box sx={{
                  position: 'absolute',
                  left: '50%',
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  bgcolor: item.status === 'completed' ? '#4caf50' : '#ff9800',
                  transform: 'translateX(-50%)',
                  zIndex: 2,
                  border: '3px solid #fff',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }} />
                
                {/* Content */}
                <Box sx={{
                  width: '45%',
                  ml: index % 2 === 0 ? 0 : 'auto',
                  mr: index % 2 === 0 ? 'auto' : 0,
                  textAlign: index % 2 === 0 ? 'right' : 'left',
                  pr: index % 2 === 0 ? 4 : 0,
                  pl: index % 2 === 0 ? 0 : 4
                }}>
                  <Typography variant="caption" sx={{
                    color: '#666',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    display: 'block',
                    mb: 1
                  }}>
                    {item.date}
                  </Typography>
                  
                  <Paper sx={{
                    p: 3,
                    borderRadius: 3,
                    bgcolor: '#fff',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                    border: '1px solid #e3e8ee',
                    position: 'relative'
                  }}>
                    {item.status === 'soon' && (
                      <Box sx={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        bgcolor: '#ff9800',
                        color: '#fff',
                        px: 2,
                        py: 0.5,
                        borderRadius: 2,
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}>
                        SOON
                      </Box>
                    )}
                    
                    <Typography variant="h6" sx={{
                      fontWeight: 600,
                      color: '#0a2540',
                      mb: 1,
                      fontSize: '1.1rem'
                    }}>
                      {item.title}
                    </Typography>
                    
                    <Typography variant="body2" sx={{
                      color: '#666',
                      lineHeight: 1.5
                    }}>
                      {item.description}
                    </Typography>
                  </Paper>
                </Box>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Key Benefits */}
      <Container maxWidth="md" sx={{ py: 10 }}>
        <Typography variant="h3" sx={{
          textAlign: 'center',
          mb: 8,
          fontSize: { xs: '2.2rem', md: '2.8rem' },
          fontWeight: 700,
          color: '#0a2540'
        }}>
          Varför BookR?
        </Typography>
        
        <Grid container spacing={6}>
          {[
            {
              title: 'Sparar 90% av tiden',
              description: 'Från timmar av mejlande till 30 sekunder. Över 100 timmar per år tillbaka i ditt liv.',
              icon: '⏱️'
            },
            {
              title: '100% säkert & privat',
              description: 'Vi läser bara ledig/upptagen – aldrig vad du gör, var eller med vem. Googles säkerhet.',
              icon: '🔒'
            },
            {
              title: 'Helt automatiskt',
              description: 'Meet-länk, kalenderinbjudningar och påminnelser skapas automatiskt. Noll extra jobb.',
              icon: '✨'
            }
          ].map((feature, index) => (
            <Grid item xs={12} md={4} key={index}>
              <Box sx={{ textAlign: 'center', p: 3 }}>
                <Typography sx={{ fontSize: '3.5rem', mb: 3 }}>
                  {feature.icon}
                </Typography>
                <Typography variant="h6" sx={{ 
                  mb: 2, 
                  fontWeight: 700, 
                  color: '#0a2540',
                  fontSize: '1.4rem'
                }}>
                  {feature.title}
                </Typography>
                <Typography variant="body1" sx={{ 
                  color: '#666', 
                  lineHeight: 1.6,
                  fontSize: '1.1rem'
                }}>
                  {feature.description}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Container>

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
            ✨ {waitlistCount}+ personer väntar redan • Lanseras inom några veckor
          </Typography>
        </Container>
      </Box>

      {/* Success Overlay */}
      {successOverlay && (
        <Box sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          bgcolor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <Paper sx={{
            p: 6,
            borderRadius: 4,
            textAlign: 'center',
            maxWidth: 500,
            mx: 2,
            background: 'linear-gradient(135deg, #f8fff8 0%, #e8f5e8 100%)',
            border: '2px solid #4caf50'
          }}>
            <Typography sx={{ fontSize: '4rem', mb: 2 }}>🎉</Typography>
            <Typography variant="h4" sx={{
              color: '#2e7d32',
              fontWeight: 700,
              mb: 2
            }}>
              Välkommen till väntelistan!
            </Typography>
            <Typography variant="body1" sx={{
              color: '#1b5e20',
              fontSize: '1.2rem',
              mb: 3,
              lineHeight: 1.6
            }}>
              Tack för att du skrev upp dig! Du kommer att få ett mejl så snart BookR lanseras 
              med tidig access till alla funktioner.
            </Typography>
            <Typography variant="body2" sx={{
              color: '#2e7d32',
              mb: 4,
              fontWeight: 600
            }}>
              Du är nu person #{waitlistCount} på väntelistan
            </Typography>
            <Button
              variant="contained"
              onClick={() => setSuccessOverlay(false)}
              sx={{
                bgcolor: '#4caf50',
                color: '#fff',
                fontWeight: 600,
                py: 1.5,
                px: 4,
                borderRadius: 3,
                '&:hover': {
                  bgcolor: '#45a049'
                }
              }}
            >
              Stäng
            </Button>
          </Paper>
        </Box>
      )}

      {/* Footer */}
      <Box
        component="footer"
        sx={{
          width: '100%',
          bgcolor: 'transparent',
          textAlign: 'center',
          py: 3,
          color: 'text.secondary',
          fontSize: 15,
          letterSpacing: 0.2,
          borderTop: '1px solid #e0e3e7',
        }}
      >
        © {new Date().getFullYear()} BookR – Hitta lediga tider tillsammans nu| <a href="mailto:info@onebookr.se" style={{ color: '#1976d2', textDecoration: 'none' }}>info@onebookr.se</a>
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