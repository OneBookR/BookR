# BookR Säkerhetsguide

## 🎯 Säkerhetsstatus

**Sist uppdaterad:** 2024
**Status:** ⚠️ Flera kritiska risker identifierade - se åtgärdsplan nedan

---

## 🔴 KRITISKA RISKER (denna vecka)

### 1. ❌ E-postadresser exponerade i mejl
- **Påverkan:** Spammers, phishing-attackers
- **Status:** Ej åtgärdad
- **Åtgärd:** Dölj mottagarlistan (BCC) i mejl när flera personer bjuds in
- **Prioritet:** HÖGSTA
- **Tidsuppskattning:** 1 timme

```javascript
// server.js - Förbättra mejlutskick
// INNAN: to: inv.email (skapar To-header med alla adresser)
// EFTER: to: inv.email, bcc: [administratör@domain] eller använd lista

// Exempel:
await resend.emails.send({
  from: 'BookR <info@onebookr.se>',
  to: inv.email,  // Individuell mejl per mottagare
  subject: emailSubject,
  text: emailText
});
// Gör detta i loop - inte alla i "to"-fältet!
```

### 2. ❌ Kalenderdata lagras utan kryptering i Firebase
- **Påverkan:** Kan läsas av Firebase-personal eller hackare
- **Status:** Ej åtgärdad
- **Åtgärd:** Implementera end-to-end encryption för känsliga data före lagring
- **Prioritet:** HÖGSTA
- **Tidsuppskattning:** 4-6 timmar
- **Planering:** Nästa sprint

### 3. ❌ Inbjudningslänkar är gissningsbara
- **Påverkan:** Attacker kan gissa sig till andra gruppers data
- **Status:** Delvis adresserad (UUID används)
- **Åtgärd:** 
  - Använd längre slumpmässiga tokens (64+ tecken)
  - Sätt token-expiry (7-14 dagar)
  - Lägg till rate limiting på accept-endpoint
- **Prioritet:** HÖGSTA
- **Tidsuppskattning:** 2 timmar

```javascript
// firestore.js - Implementera token-expiry
export async function createInvitation(invitationData) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14); // 14 dagar
  
  const docRef = await addDoc(collection(db, 'invitations'), {
    ...invitationData,
    createdAt: serverTimestamp(),
    expiresAt: expiresAt,
    responded: false,
    token: generateSecureToken(64) // 64-tecken secure random
  });
  return docRef.id;
}
```

### 4. ❌ Tokens sparas i localStorage (XSS-risk)
- **Påverkan:** XSS kan stjäla tokens
- **Status:** Ej åtgärdad
- **Åtgärd:** Flytta tokens från localStorage → httpOnly cookies
- **Prioritet:** HÖGSTA
- **Tidsuppskattning:** 3 timmar
- **Planering:** Nästa sprint

### 5. ❌ Directional access grant utan verifiering
- **Påverkan:** Falsk direktåtkomst kan skapas
- **Status:** Ej åtgärdad
- **Åtgärd:** Kräv bekräftelse via mejl innan direktåtkomst ges
- **Prioritet:** HÖGSTA
- **Tidsuppskattning:** 2 timmar

---

## 🟠 HÖGA RISKER (nästa 2 veckor)

### 6. ❌ Ingen rate limiting på invitation accept
- **Påverkan:** Brute force på group join
- **Status:** Ej åtgärdad
- **Åtgärd:** Lägg till rate limiting (5 försök/IP per 15 min)
- **Prioritet:** HÖG
- **Tidsuppskattning:** 1 timme

```javascript
// server.js - Lägg till rate limiting på group/join
const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.ip || req.connection.remoteAddress,
  skip: (req) => !req.body.groupId // Bara för group-join
});

app.post('/api/group/join', joinLimiter, async (req, res) => {
  // ...existing code...
});
```

### 7. ❌ Mejl skickas utan säkerhet (tidigare exponerad Resend-nyckel)
- **Påverkan:** Phishing, spam
- **Status:** Delvis åtgärdad (nyckel roterad)
- **Åtgärd:** 
  - ✅ Nyckel redan roterad
  - Verifiera avsändare (SPF/DKIM)
  - Lägg till mejl-autentisering
- **Prioritet:** HÖG
- **Tidsuppskattning:** 2 timmar (DNS-config)

### 8. ❌ Ingen audit trail för kalender-åtkomst
- **Påverkan:** Kan inte se vem som läste din kalender (GDPR-krav)
- **Status:** Ej åtgärdad
- **Åtgärd:** Lägg till access logs
- **Prioritet:** HÖG (GDPR)
- **Tidsuppskattning:** 3 timmar

```javascript
// firestore.js - Lägg till audit logging
export async function logDataAccess(action, userEmail, targetEmail, dataType) {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      action: 'calendar_accessed',
      userEmail,
      targetEmail,
      dataType,
      timestamp: serverTimestamp(),
      ipAddress: null, // Hämta från request context
      userAgent: null
    });
  } catch (err) {
    console.error('Failed to log access:', err);
  }
}
```

### 9. ❌ Direktåtkomst sparas lokalt (kan manipuleras via XSS)
- **Påverkan:** Falsk direktåtkomst
- **Status:** Ej åtgärdad
- **Åtgärd:** Verifiera direktåtkomst-status vid varje request
- **Prioritet:** HÖG
- **Tidsuppskattning:** 2 timmar

### 10. ❌ Ingen end-to-end encryption
- **Påverkan:** Cloud-provider kan läsa all data
- **Status:** Ej åtgärdad (komplex, låg prioritet)
- **Åtgärd:** Implementera E2E-kryptering för känslig data
- **Prioritet:** MEDEL
- **Tidsuppskattning:** 8-12 timmar

### 11. ❌ Tokens i query params (loggning)
- **Påverkan:** Kan loggas i browser history/server logs
- **Status:** Ej åtgärdad
- **Åtgärd:** Använd POST + session cookies istället för query params
- **Prioritet:** HÖG
- **Tidsuppskattning:** 2 timmar

```javascript
// App.jsx - Förbättra auth-token hantering
// INNAN: ?auth=base64token i URL
// EFTER: POST /api/auth/session med token i body

const handleAuthCallback = async (authToken) => {
  const res = await fetch(`${API_BASE_URL}/api/auth/session`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authToken })
  });
  
  if (res.ok) {
    // Session är nu satt i httpOnly cookie
    window.location.href = '/';
  }
};
```

---

## 🟡 MEDEL RISKER (nästa månad)

### 12. ❌ Inget CSRF-skydd
- **Påverkan:** Attacker kan boka möten för användare
- **Status:** ❌ GENOMFÖRT! csurf-middleware installerad
- **Åtgärd:** ✅ Redan implementerat
- **Prioritet:** (ÅTGÄRDAT)

### 13. ❌ Ingen input validation
- **Påverkan:** Injection attacks
- **Status:** Delvis adresserad
- **Åtgärd:** 
  - Validera all input (email, mötes-titel, plats)
  - Sanitisera innan lagring
  - Använd joi/zod för schema-validering
- **Prioritet:** MEDEL
- **Tidsuppskattning:** 3 timmar

```javascript
// server.js - Lägg till input validation
import Joi from 'joi';

const inviteSchema = Joi.object({
  emails: Joi.array().items(Joi.string().email()).required(),
  groupName: Joi.string().max(100).required(),
  fromUser: Joi.string().email().required(),
  fromToken: Joi.string().required()
});

app.post('/api/invite', async (req, res) => {
  const { error, value } = inviteSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  // ...rest of handler...
});
```

### 14. ❌ API endpoints kräver inte autentisering
- **Påverkan:** Anonym data-åtkomst
- **Status:** Delvis adresserad
- **Åtgärd:** Lägg till `ensureAuthenticated` middleware på alla sensitive endpoints
- **Prioritet:** MEDEL
- **Tidsuppskattning:** 2 timmar

```javascript
// server.js - Lägg till auth middleware
function ensureAuthenticated(req, res, next) {
  if (!req.isAuthenticated() && !req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Använd på alla sensitive endpoints:
app.get('/api/group/:groupId/suggestions', ensureAuthenticated, async (req, res) => {
  // ...existing code...
});
```

### 15. ❌ Inget möjligt att återkalla åtkomst
- **Påverkan:** Gamla links fungerar för evigt
- **Status:** Ej åtgärdad
- **Åtgärd:** Implementera token-revocation och expiry
- **Prioritet:** MEDEL
- **Tidsuppskattning:** 3 timmar

### 16. ❌ Inga lösenord = single point of failure
- **Påverkan:** Om Google/Microsoft hackas, all data läcker
- **Status:** Ej åtgärdad
- **Åtgärd:** Implementera TOTP/passkey som backup-auth
- **Prioritet:** LÅGT (komplext, låg risk)
- **Tidsuppskattning:** 8 timmar

### 17. ❌ Ingen rate limiting på availability search
- **Påverkan:** DoS-attackers kan söka miljontals slots
- **Status:** Ej åtgärdad
- **Åtgärd:** Rate limit per user/IP (100 requests/timme)
- **Prioritet:** MEDEL
- **Tidsuppskattning:** 1 timme

```javascript
// server.js - Lägg till rate limiting på /api/availability
const availabilityLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 timme
  max: 100,
  keyGenerator: (req) => req.user?.email || req.ip
});

app.post('/api/availability', availabilityLimiter, async (req, res) => {
  // ...existing code...
});
```

---

## 🟢 LÅGA RISKER (senare)

### 18. ⚠️ Möten kan skapas automatiskt utan bekräftelse
- **Påverkan:** Användare kanske inte är medvetna
- **Prioritet:** LÅG
- **Åtgärd:** Lägg till extra bekräftelse-steg

### 19. ⚠️ Mejl-adresser inte validerade (bara syntax)
- **Påverkan:** Invalid emails kan lagras
- **Prioritet:** LÅG
- **Åtgärd:** Implementera email-verifikation

### 20. ⚠️ Inget möjligt att kontrollera vem som kan se mötet
- **Påverkan:** Privacybekymmer
- **Prioritet:** LÅG
- **Åtgärd:** Lägg till meeting visibility-inställningar

---

## 📋 ÅTGÄRDSPLAN - DENNA VECKA

### ✅ Redan gjort:
- [x] Token-kryptering implementerat (AES)
- [x] Åtkomstkontroll på grupper
- [x] Säker loggning (safeLog)
- [x] GDPR-efterlevnad (radering, export)
- [x] Rate limiting (allmänt)
- [x] CSRF-skydd (csurf)
- [x] Hårdkodade credentials borttagna
- [x] Förbättrad felhantering

### 🔴 DETTA VECKA - KRITISKT (4-5 timmar):
- [ ] **#1:** Dölj e-postadresser i mejl (BCC)
- [ ] **#3:** Implementera token-expiry + längre random tokens
- [ ] **#3:** Rate limiting på group/join endpoint
- [ ] **#5:** Mejl-verifiering för direktåtkomst
- [ ] **#11:** Flytta auth-tokens från query params → POST

### 🟠 NÄSTA VECKA - HÖG PRIORITET (6-8 timmar):
- [ ] **#4:** Tokens från localStorage → httpOnly cookies
- [ ] **#2:** Implementera E2E-kryptering för känslig data
- [ ] **#8:** Audit logging för data-åtkomst
- [ ] **#13:** Input validation med joi/zod
- [ ] **#14:** ensureAuthenticated middleware på alla endpoints
- [ ] **#17:** Rate limiting på availability-sökning

### 🟡 NÄSTA MÅNAD - MEDEL PRIORITET:
- [ ] **#9:** Validera direktåtkomst vid varje request
- [ ] **#15:** Token-revocation-system
- [ ] **#18-20:** Mindre risker

---

## 🔧 Implementeringshjälp

### Installation av validation-bibliotek:
```bash
cd OneBookR/backend
npm install joi
```

### Installation av rate-limiting (redan gjort):
```bash
# Redan installerad via express-rate-limit
npm list express-rate-limit
```

---

## 📞 Säkerhetsincidenter

Vid säkerhetsincident:
1. Aktivera maintenance mode: `MAINTENANCE_MODE=true`
2. Rotera alla nycklar omedelbar
3. Kontakta berörda användare
4. Dokumentera incident i detta dokument
5. Genomför säkerhetsåtgärder innan production

---

## 🔐 Produktionschecklist

- [ ] Alla hemligheter i miljövariabler (INTE i kod)
- [ ] HTTPS aktiverat
- [ ] HSTS-headers satt
- [ ] CSP-headers (helmet.js redan aktiverat)
- [ ] Rate limiting aktiverat
- [ ] Audit logging aktiverat
- [ ] Database-backups konfigurerat
- [ ] Säkerhetskopior testad
- [ ] Incidentplan dokumenterad
- [ ] Säkerhetsteam informerat