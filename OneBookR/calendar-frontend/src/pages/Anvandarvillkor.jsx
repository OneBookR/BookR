import React from 'react';
import { Container, Typography, Box, Paper, Button, Divider } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

// ✅ Användarvillkor — matchar Integritetspolicy.jsx:s struktur/stil
// (samma Section/P-mönster, samma färgpalett) så de två sidorna hör ihop
// visuellt. Krävs bl.a. som länk i Googles OAuth consent screen för att
// kunna skicka in appen för verifiering (se Integritetspolicy.jsx för
// motsvarande GDPR-sida).

const Section = ({ title, children }) => (
  <Box sx={{ mb: 4 }}>
    <Typography variant="h6" sx={{ fontWeight: 700, color: '#0a2540', mb: 1.5 }}>
      {title}
    </Typography>
    {children}
  </Box>
);

const P = ({ children }) => (
  <Typography variant="body1" sx={{ color: '#425466', lineHeight: 1.8, mb: 1.5 }}>
    {children}
  </Typography>
);

const Anvandarvillkor = () => {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => window.history.back()}
        sx={{ mb: 3, color: '#635bff' }}
      >
        Tillbaka
      </Button>

      <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color: '#0a2540', mb: 1 }}>
          Användarvillkor
        </Typography>
        <Typography variant="body2" sx={{ color: '#6b7c93', mb: 1 }}>
          Senast uppdaterad: 21 augusti 2026
        </Typography>
        <Typography variant="body2" sx={{ color: '#6b7c93', mb: 4 }}>
          Tjänsteleverantör: OneBookR · info@onebookr.se
        </Typography>

        <Divider sx={{ mb: 4 }} />

        <Section title="1. Om tjänsten">
          <P>
            BookR (onebookr.se) är en tjänst som hjälper dig och de du bjuder in att hitta gemensamma
            lediga tider genom att jämföra kalendrar, och att boka möten baserat på den jämförelsen.
            Genom att använda BookR godkänner du dessa villkor. Om du inte godkänner villkoren ber vi
            dig att inte använda tjänsten.
          </P>
        </Section>

        <Section title="2. Vem får använda tjänsten">
          <P>
            Du måste vara minst 18 år, eller ha vårdnadshavares godkännande, för att använda BookR. Du
            ansvarar för att uppgifterna du lämnar (t.ex. vid demo-bokning eller inbjudan av andra) är
            korrekta.
          </P>
        </Section>

        <Section title="3. Inloggning och kalenderanslutning">
          <P>
            BookR använder OAuth för att logga in dig med ditt Google- eller Microsoft-konto. Vid
            inloggning begär vi åtkomst till din kalender för att kunna:
          </P>
          <Box component="ul" sx={{ pl: 3, color: '#425466', lineHeight: 2 }}>
            <li>Läsa din ledig/upptagen-status för att hitta tider som passar alla inblandade.</li>
            <li>Skapa ett kalenderevent i din kalender när du eller någon annan bokar ett möte via BookR.</li>
          </Box>
          <P>
            Vi begär aldrig mer åtkomst än vad som krävs för dessa funktioner, och du kan när som helst
            återkalla åtkomsten via ditt Google- eller Microsoft-konto, eller radera ditt BookR-konto (se
            vår <a href="/integritetspolicy" style={{ color: '#635bff' }}>integritetspolicy</a> för
            detaljer om vilka uppgifter vi behandlar).
          </P>
        </Section>

        <Section title="4. Bokning av möten">
          <P>
            När du eller en person du bjudit in väljer en föreslagen tid skapar BookR ett kalenderevent
            i de inblandade parternas kalendrar. Du ansvarar själv för att kontrollera mötesdetaljerna
            (tid, deltagare, plats) innan du bekräftar en bokning — särskilt i vårt demo-bokningsflöde,
            där mötet skapas automatiskt utan ytterligare manuellt godkännande från BookRs sida.
          </P>
        </Section>

        <Section title="5. Tillåten användning">
          <P>Du åtar dig att inte:</P>
          <Box component="ul" sx={{ pl: 3, color: '#425466', lineHeight: 2 }}>
            <li>Använda tjänsten för olagliga ändamål eller för att skicka skräppost/massinbjudningar utan mottagarens samtycke.</li>
            <li>Försöka kringgå tjänstens säkerhetsfunktioner eller åtkomstbegränsningar.</li>
            <li>Belasta tjänsten på ett sätt som stör andra användares möjlighet att använda den.</li>
          </Box>
        </Section>

        <Section title="6. Tjänstens tillgänglighet">
          <P>
            Vi strävar efter att BookR ska fungera pålitligt, men kan inte garantera att tjänsten alltid
            är tillgänglig eller felfri. Vi förbehåller oss rätten att ändra, pausa eller avveckla delar
            av tjänsten, med rimligt varsel där det är möjligt.
          </P>
        </Section>

        <Section title="7. Ansvarsbegränsning">
          <P>
            BookR tillhandahålls i befintligt skick. Vi ansvarar inte för indirekta skador eller förluster
            som uppstår genom din användning av tjänsten, inklusive men inte begränsat till missade möten
            till följd av felaktig kalenderdata från tredje part (Google eller Microsoft).
          </P>
        </Section>

        <Section title="8. Ändringar av villkoren">
          <P>
            Vi kan uppdatera dessa villkor från tid till annan. Väsentliga ändringar meddelas via tjänsten
            eller till din registrerade e-postadress. Fortsatt användning av BookR efter en ändring innebär
            att du godkänner de uppdaterade villkoren.
          </P>
        </Section>

        <Section title="9. Kontakt">
          <P>
            OneBookR<br />
            E-post: <a href="mailto:info@onebookr.se" style={{ color: '#635bff' }}>info@onebookr.se</a>
          </P>
        </Section>

        <Divider sx={{ my: 3 }} />
        <Typography variant="body2" sx={{ color: '#6b7c93', textAlign: 'center' }}>
          © 2026 BookR · onebookr.se
        </Typography>
      </Paper>
    </Container>
  );
};

export default Anvandarvillkor;
