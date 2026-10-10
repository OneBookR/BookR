import React from 'react';
import { Container, Typography, Box, Paper, Button, Divider } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const Section = ({ title, children, id }) => (
  <Box id={id} sx={{ mb: 4, scrollMarginTop: 24 }}>
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
          Senast uppdaterad: 10 oktober 2026
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
            <li><strong>Kalenderdata</strong> — som grundregel bara ledig/upptagen-status för den tidsperiod du väljer att jämföra; vi läser inte titel, plats eller deltagare på dina kalenderhändelser. Två frivilliga tilläggsfunktioner läser mer, men bara efter ett eget, aktivt samtycke du när som helst kan återkalla — se punkt 4.</li>
            <li><strong>Sessionsdata</strong> — en krypterad sessions-cookie som håller dig inloggad under besöket.</li>
            <li><strong>OAuth-token</strong> — ett åtkomsttoken från Google eller Microsoft, krypterat med AES-256-GCM och lagrat i sessionen, används enbart för att hämta kalenderdata.</li>
          </Box>
          <P>Vi samlar inte in personnummer, betalningsinformation, platsdata eller känsliga personuppgifter.</P>
        </Section>

        <Section title="3. Direktåtkomst — en separat, frivillig funktion">
          <P>
            Om du väljer att aktivera <strong>Direktåtkomst</strong> med en kontakt (under Team) ber vi om ett
            extra, tydligt separat samtycke: en varaktig (s.k. "offline") koppling till din kalender, så att BookR
            kan hämta ledig/upptagen-status åt dig utan att du behöver logga in varje gång. Det här är ett
            uttryckligt undantag från vad vi annars gör (punkt 2 ovan) och kräver ett eget, aktivt godkännande —
            det aktiveras aldrig automatiskt.
          </P>
          <Box component="ul" sx={{ pl: 3, color: '#425466', lineHeight: 2 }}>
            <li>Gäller bara personer du själv väljer att koppla ihop dig med, och bara efter att båda parter godkänt.</li>
            <li>Vi läser fortfarande bara ledigt/upptaget för att hitta gemensamma tider — aldrig titel, plats eller deltagare.</li>
            <li>Kan stängas av när som helst, av endera parten, under Team i appen.</li>
          </Box>
        </Section>

        <Section title="4. Kommande möten och Uppgifter — frivillig, utökad kalenderåtkomst">
          <P>
            Två funktioner läser (och i ett fall skriver) mer än grundlöftet i punkt 2 — men bara om du
            aktivt slår på dem, och de går att stänga av när som helst med omedelbar verkan.
          </P>
          <Box component="ul" sx={{ pl: 3, color: '#425466', lineHeight: 2 }}>
            <li>
              <strong>Kommande möten</strong> (på dashboarden) — slår du på det här läser vi mötestitlar och
              tider för dina kommande videomöten (Google Meet, Teams m.fl.) de närmaste två veckorna, för att
              visa dem i en lista. Vi läser bara möten med en videomöteslänk, aldrig hela kalendern.
            </li>
            <li>
              <strong>Uppgifter</strong> (Task Manager) — slår du på det här kan BookR (inklusive BookR:s
              AI-agent i Kommandon) visa riktiga titlar, beskrivningar och platser för händelser i din
              <strong> primära kalender</strong>, och du kan därifrån ändra, flytta, radera och skapa händelser.
              Det gäller aldrig delade eller sekundära kalendrar. Återkommande händelser visas men går inte
              att ändra från BookR. Möten med andra deltagare varnar vi om innan en ändring sparas, eftersom
              Google/Microsoft normalt mejlar övriga deltagare automatiskt vid en sådan ändring.
            </li>
          </Box>
          <P>
            Båda är helt frivilliga, separata från varandra och från Direktåtkomst (punkt 3), och syns som
            egna på/av-reglage i respektive vy. Ditt val sparas tills du själv ändrar det.
          </P>
        </Section>

        <Section title="5. Kommandon — röst- och textassistenten">
          <P>
            I "Kommandon" kan du be BookR utföra saker åt dig med tal eller text (t.ex. avboka, boka om,
            skicka ett meddelande, eller fråga om dina möten). Det här innebär två ytterligare, specifika
            databehandlingar utöver kalenderåtkomsten i punkterna ovan:
          </P>
          <Box component="ul" sx={{ pl: 3, color: '#425466', lineHeight: 2 }}>
            <li>
              Texten i ditt kommando (vad du skrivit eller sagt, omvandlat till text av din webbläsare) skickas
              till <strong>Anthropic PBC</strong> för att tolkas till en konkret åtgärd.
            </li>
            <li>
              Om du använder röstsvar skickas BookRs textsvar till <strong>ElevenLabs Inc.</strong> för att
              omvandlas till tal.
            </li>
          </Box>
          <P>
            Ett kommando kan innehålla namn, mejladresser eller mötestitlar du själv nämner (t.ex. "boka om
            mötet med Anna") — den informationen når då dessa två underleverantörer som en del av att tolka
            och besvara kommandot. En historik över dina kommandon sparas i ditt konto tills du raderar det
            (se punkt 7), så du kan se vad BookR gjort tidigare.
          </P>
        </Section>

        <Section title="6. Varför vi behandlar dina uppgifter (rättslig grund)">
          <Box component="ul" sx={{ pl: 3, color: '#425466', lineHeight: 2 }}>
            <li><strong>Avtal (Art. 6.1b GDPR)</strong> — för att tillhandahålla tjänsten du begärt (jämföra kalendrar, skicka inbjudningar, utföra kommandon du ber om).</li>
            <li><strong>Berättigat intresse (Art. 6.1f GDPR)</strong> — för att logga säkerhetshändelser och förebygga missbruk.</li>
            <li><strong>Samtycke (Art. 6.1a GDPR)</strong> — för Kommande möten, Uppgifter, Direktåtkomst och analys-/marknadsföringscookies — alla kräver ett eget, aktivt godkännande du kan återkalla när som helst.</li>
          </Box>
        </Section>

        <Section title="7. Hur länge vi sparar uppgifter">
          <Box component="ul" sx={{ pl: 3, color: '#425466', lineHeight: 2 }}>
            <li><strong>Gruppsessioner</strong> — raderas automatiskt 24 timmar efter att de skapades.</li>
            <li><strong>Sessions-cookie</strong> — upphör när du loggar ut eller efter 24 timmar.</li>
            <li><strong>Kalenderdata</strong> (grundfunktionen) — behandlas i minnet under sessionen och sparas aldrig permanent.</li>
            <li><strong>Uppgifter, Regler och mallar</strong> — sparas i ditt konto tills du själv tar bort dem.</li>
            <li><strong>Direktåtkomst-kopplingar</strong> — sparas tills du eller motparten stänger av dem.</li>
            <li><strong>Kommandohistorik</strong> (Kommandon) — sparas i ditt konto tills du raderar kontot.</li>
            <li><strong>Inloggningsloggar i Firebase</strong> — e-postadress i anonymiserad form, raderas efter 30 dagar.</li>
          </Box>
        </Section>

        <Section title="8. Tredje parter vi delar data med (underleverantörer)">
          <P>Vi anlitar följande underleverantörer som kan behandla personuppgifter för vår räkning:</P>
          <Box component="ul" sx={{ pl: 3, color: '#425466', lineHeight: 2 }}>
            <li><strong>Google LLC</strong> — OAuth-inloggning och Google Calendar API. Standardavtalsklausuler (SCC) används för överföring till USA.</li>
            <li><strong>Microsoft Corporation</strong> — OAuth-inloggning och Microsoft Graph / Outlook Calendar. SCC används för överföring till USA.</li>
            <li><strong>Resend Inc.</strong> — leverans av e-postinbjudningar. SCC används för överföring till USA.</li>
            <li><strong>Railway Corp.</strong> — hosting av backend-server i eu-west-1 (Europa). Behandlingsavtal tecknat.</li>
            <li><strong>Google Firebase / Firestore</strong> — lagring av anonymiserade inloggningsloggar. SCC används för överföring till USA.</li>
            <li><strong>Anthropic PBC</strong> — tolkning av dina röst-/textkommandon i Kommandon-funktionen (se punkt 5). SCC används för överföring till USA.</li>
            <li><strong>ElevenLabs Inc.</strong> — talsyntes för BookRs muntliga svar i Kommandon-funktionen (se punkt 5). SCC används för överföring till USA.</li>
          </Box>
          <P>Vi säljer aldrig personuppgifter till tredje part.</P>
        </Section>

        <Section title="9. Dina rättigheter">
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

        <Section title="10. Klagomål">
          <P>
            Om du anser att vi behandlar dina personuppgifter på ett felaktigt sätt har du rätt att lämna in
            ett klagomål till <strong>Integritetsskyddsmyndigheten (IMY)</strong> på{' '}
            <a href="https://www.imy.se" target="_blank" rel="noopener noreferrer" style={{ color: '#635bff' }}>
              imy.se
            </a>.
          </P>
        </Section>

        <Section title="11. Cookies" id="cookies">
          <P>
            Vi använder en nödvändig sessions-cookie (<code>bookr_session</code>) för att hålla dig inloggad.
            Med ditt samtycke använder vi även Google Analytics för att förstå hur tjänsten används.
            Du kan hantera dina val i cookiebannern eller i din webbläsares inställningar.
          </P>
        </Section>

        <Section title="12. Kontakt">
          <P>
            OneBookR<br />
            E-post: <a href="mailto:info@onebookr.se" style={{ color: '#635bff' }}>info@onebookr.se</a>
          </P>
          <P>
            Se även våra <a href="/anvandarvillkor" style={{ color: '#635bff' }}>användarvillkor</a>.
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
