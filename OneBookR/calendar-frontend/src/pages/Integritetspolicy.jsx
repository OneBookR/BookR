import React from 'react';
import { Container, Typography, Box, Paper, Button, Divider } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

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

const Integritetspolicy = () => {
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
          Integritetspolicy
        </Typography>
        <Typography variant="body2" sx={{ color: '#6b7c93', mb: 1 }}>
          Senast uppdaterad: 14 juli 2026
        </Typography>
        <Typography variant="body2" sx={{ color: '#6b7c93', mb: 4 }}>
          Personuppgiftsansvarig: OneBookR · info@onebookr.se
        </Typography>

        <Divider sx={{ mb: 4 }} />

        <Section title="1. Vem vi är">
          <P>
            BookR (onebookr.se) är en kalenderplaneringstjänst som hjälper dig att jämföra lediga tider med
            andra och boka möten. Tjänsten drivs av OneBookR och vi är personuppgiftsansvariga för den
            behandling som beskrivs nedan.
          </P>
        </Section>

        <Section title="2. Vilka uppgifter vi behandlar">
          <P>Vi behandlar följande kategorier av personuppgifter:</P>
          <Box component="ul" sx={{ pl: 3, color: '#425466', lineHeight: 2 }}>
            <li><strong>Kontouppgifter</strong> — namn och e-postadress från ditt Google- eller Microsoft-konto, hämtade via OAuth.</li>
            <li><strong>Kalenderdata</strong> — ledig/upptagen-status för den tidsperiod du väljer att jämföra. Vi läser inte titel, plats eller deltagare på dina kalenderhändelser.</li>
            <li><strong>Sessionsdata</strong> — en krypterad sessions-cookie som håller dig inloggad under besöket.</li>
            <li><strong>OAuth-token</strong> — ett åtkomsttoken från Google eller Microsoft, krypterat med AES-256-GCM och lagrat i sessionen, används enbart för att hämta kalenderdata.</li>
          </Box>
          <P>Vi samlar inte in personnummer, betalningsinformation, platsdata eller känsliga personuppgifter.</P>
        </Section>

        <Section title="3. Varför vi behandlar dina uppgifter (rättslig grund)">
          <Box component="ul" sx={{ pl: 3, color: '#425466', lineHeight: 2 }}>
            <li><strong>Avtal (Art. 6.1b GDPR)</strong> — för att tillhandahålla tjänsten du begärt (jämföra kalendrar, skicka inbjudningar).</li>
            <li><strong>Berättigat intresse (Art. 6.1f GDPR)</strong> — för att logga säkerhetshändelser och förebygga missbruk.</li>
            <li><strong>Samtycke (Art. 6.1a GDPR)</strong> — för analys- och marknadsföringscookies, om du valt att acceptera dessa i cookiebannern.</li>
          </Box>
        </Section>

        <Section title="4. Hur länge vi sparar uppgifter">
          <Box component="ul" sx={{ pl: 3, color: '#425466', lineHeight: 2 }}>
            <li><strong>Gruppsessioner</strong> — raderas automatiskt 24 timmar efter att de skapades.</li>
            <li><strong>Sessions-cookie</strong> — upphör när du loggar ut eller efter 24 timmar.</li>
            <li><strong>Kalenderdata</strong> — behandlas i minnet under sessionen och sparas aldrig permanent.</li>
            <li><strong>Inloggningsloggar i Firebase</strong> — e-postadress i anonymiserad form, raderas efter 30 dagar.</li>
          </Box>
        </Section>

        <Section title="5. Tredje parter vi delar data med (underleverantörer)">
          <P>Vi anlitar följande underleverantörer som kan behandla personuppgifter för vår räkning:</P>
          <Box component="ul" sx={{ pl: 3, color: '#425466', lineHeight: 2 }}>
            <li><strong>Google LLC</strong> — OAuth-inloggning och Google Calendar API. Standardavtalsklausuler (SCC) används för överföring till USA.</li>
            <li><strong>Microsoft Corporation</strong> — OAuth-inloggning och Microsoft Graph / Outlook Calendar. SCC används för överföring till USA.</li>
            <li><strong>Resend Inc.</strong> — leverans av e-postinbjudningar. SCC används för överföring till USA.</li>
            <li><strong>Railway Corp.</strong> — hosting av backend-server i eu-west-1 (Europa). Behandlingsavtal tecknat.</li>
            <li><strong>Google Firebase / Firestore</strong> — lagring av anonymiserade inloggningsloggar. SCC används för överföring till USA.</li>
          </Box>
          <P>Vi säljer aldrig personuppgifter till tredje part.</P>
        </Section>

        <Section title="6. Dina rättigheter">
          <P>Du har enligt GDPR rätt att:</P>
          <Box component="ul" sx={{ pl: 3, color: '#425466', lineHeight: 2 }}>
            <li><strong>Tillgång (Art. 15)</strong> — begära ett utdrag av alla uppgifter vi har om dig. Använd knappen "Exportera mina data" i appen.</li>
            <li><strong>Radering (Art. 17)</strong> — begära att dina uppgifter raderas. Använd knappen "Radera mitt konto" i appen eller kontakta oss.</li>
            <li><strong>Rättelse (Art. 16)</strong> — begära att felaktiga uppgifter korrigeras.</li>
            <li><strong>Dataportabilitet (Art. 20)</strong> — begära dina uppgifter i maskinläsbart format.</li>
            <li><strong>Invändning (Art. 21)</strong> — invända mot behandling som grundas på berättigat intresse.</li>
            <li><strong>Återkalla samtycke</strong> — när som helst återkalla ett lämnat samtycke, utan att det påverkar lagligheten av tidigare behandling.</li>
          </Box>
          <P>
            Kontakta oss på <strong>info@onebookr.se</strong> för att utöva dina rättigheter. Vi svarar inom 30 dagar.
          </P>
        </Section>

        <Section title="7. Klagomål">
          <P>
            Om du anser att vi behandlar dina personuppgifter på ett felaktigt sätt har du rätt att lämna in
            ett klagomål till <strong>Integritetsskyddsmyndigheten (IMY)</strong> på{' '}
            <a href="https://www.imy.se" target="_blank" rel="noopener noreferrer" style={{ color: '#635bff' }}>
              imy.se
            </a>.
          </P>
        </Section>

        <Section title="8. Cookies">
          <P>
            Vi använder en nödvändig sessions-cookie (<code>bookr_session</code>) för att hålla dig inloggad.
            Med ditt samtycke använder vi även Google Analytics för att förstå hur tjänsten används.
            Du kan hantera dina val i cookiebannern eller i din webbläsares inställningar.
          </P>
          <P>
            Läs vår fullständiga{' '}
            <a href="https://www.iubenda.com/privacy-policy/71871656/cookie-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#635bff' }}>
              cookiepolicy
            </a>{' '}
            för mer information.
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

export default Integritetspolicy;
