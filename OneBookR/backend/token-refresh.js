// ===== TOKEN REFRESH — HÅLLER BOOKRS ADMIN-KALENDER LEVANDE =====
// Tidigare fanns ingen mekanism i kodbasen för att förnya en OAuth
// access-token via refresh-token (verifierat: inga träffar på
// refresh_token/grant_type i server.js). Utan detta skulle en "fast"
// BookR-kalender för demo-flödet sluta fungera så fort dess access-token
// gick ut (~1h för Google). Denna modul är den enda källan för "vad är
// BookRs kalender-token just nu".
import { getAdminCalendarToken as fetchStoredAdminCalendarToken, saveAdminCalendarToken, getStoredDirectAccessToken, saveDirectAccessToken, clearStoredDirectAccessToken } from './firestore.js';
import { decryptToken, encryptToken } from './gdpr-utils.js';

// ✅ Skiljer på "token permanent död" (personen återkallade åtkomsten,
// bytte lösenord, eller Google rensade en gammal token) från andra fel
// (nätverksblip, Googles/Microsofts API nere) — bara den förra ska tolkas
// som "ingen koppling finns längre", inte kastas vidare som ett vanligt
// fel. invalid_grant är samma felkod för både Google och Microsoft.
function isPermanentGrantFailure(error) {
  return typeof error?.message === 'string' && error.message.includes('invalid_grant');
}

// ✅ In-memory cache — undviker att förnya token på varje enskilt anrop.
// Ligger i processminnet (inte Firestore) eftersom access-tokens är
// kortlivade och inte behöver överleva en omstart; refreshToken (den
// långlivade hemligheten) är det som faktiskt är persisterat.
let cachedAccessToken = null;
let cachedExpiresAt = 0;
let cachedProvider = null;
let cachedEmail = null;

export async function refreshGoogleAccessToken(refreshToken) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google token refresh failed: HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  // Google svarar INTE med en ny refresh_token vid vanlig förnyelse —
  // den ursprungliga refresh_token förblir giltig och återanvänds.
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000)
  };
}

export async function refreshMicrosoftAccessToken(refreshToken) {
  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'user.read calendars.read'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Microsoft token refresh failed: HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    // Microsoft roterar ibland refresh_token vid förnyelse — om en ny
    // skickas med måste den ersätta den gamla i Firestore, annars slutar
    // förnyelsen fungera nästa gång.
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + (data.expires_in * 1000)
  };
}

// ✅ Hämtar en giltig access-token för BookRs egen (admin) kalender.
// Returnerar null om ingen kalender är kopplad än (se /admin/connect-calendar).
export async function getAdminCalendarToken() {
  // Cache-hit: token finns kvar med minst 2 minuters marginal.
  if (cachedAccessToken && Date.now() < cachedExpiresAt - 120_000) {
    return { accessToken: cachedAccessToken, provider: cachedProvider, email: cachedEmail };
  }

  const stored = await fetchStoredAdminCalendarToken();
  if (!stored || !stored.refreshToken) {
    return null;
  }

  const refreshToken = decryptToken(stored.refreshToken);
  if (!refreshToken) {
    throw new Error('Admin calendar refreshToken could not be decrypted — reconnect via /admin/connect-calendar');
  }

  const refreshed = stored.provider === 'microsoft'
    ? await refreshMicrosoftAccessToken(refreshToken)
    : await refreshGoogleAccessToken(refreshToken);

  cachedAccessToken = refreshed.accessToken;
  cachedExpiresAt = refreshed.expiresAt;
  cachedProvider = stored.provider;
  // ✅ BUGFIX: email saknades tidigare i returvärdet helt, trots att den
  // finns i Firestore-dokumentet. Konsekvensen: koden som bygger
  // kalenderevent för demo-bokningar föll tillbaka på strängen
  // 'bookr-admin' som attendee-email — en ogiltig adress utan @ — vilket
  // Google Calendar API avvisade med 400 Bad Request vid varje bokning.
  cachedEmail = stored.email || null;

  // Om Microsoft roterade refresh_token, spara den nya krypterad så nästa
  // förnyelse inte misslyckas med en föråldrad token. Görs fire-and-forget
  // för att inte fördröja svaret till anroparen.
  if (stored.provider === 'microsoft' && refreshed.refreshToken !== refreshToken) {
    saveAdminCalendarToken({
      provider: 'microsoft',
      email: stored.email,
      refreshToken: encryptToken(refreshed.refreshToken)
    }).catch(err => console.warn('⚠️ Kunde inte spara roterad Microsoft refresh-token:', err.message));
  }

  return { accessToken: cachedAccessToken, provider: cachedProvider, email: cachedEmail };
}

// ✅ Samma mönster som getAdminCalendarToken ovan, men generaliserat till
// GODTYCKLIG e-post — grunden för Direktåtkomst: hämtar en giltig
// access-token för en kontaktperson som gett BookR en engångs offline-
// koppling (se /auth/google|microsoft/direct-access i server.js), utan att
// personen behöver vara inloggad just då. In-memory cache per e-post,
// samma anledning som ovan (access-tokens korta, refresh-token det enda
// som faktiskt är persisterat).
const directAccessCache = new Map(); // email -> { accessToken, expiresAt, provider }

export async function getDirectAccessToken(email) {
  const key = email.toLowerCase().trim();
  const cached = directAccessCache.get(key);
  if (cached && Date.now() < cached.expiresAt - 120_000) {
    return cached;
  }

  const stored = await getStoredDirectAccessToken(key);
  if (!stored || !stored.refreshToken) {
    return null;
  }

  const refreshToken = decryptToken(stored.refreshToken);
  if (!refreshToken) {
    throw new Error(`Direktåtkomst-refreshToken för ${key} kunde inte dekrypteras`);
  }

  let refreshed;
  try {
    refreshed = stored.provider === 'microsoft'
      ? await refreshMicrosoftAccessToken(refreshToken)
      : await refreshGoogleAccessToken(refreshToken);
  } catch (err) {
    // 🐛 BUGFIX: en död refresh-token (t.ex. personen själv återkallade
    // BookRs åtkomst via myaccount.google.com/connections) kastades tidigare
    // rätt igenom till anroparen som ett generiskt fel — /api/direct-access/
    // start-session (och bokningssidorna) fick då ett odiagnostiserbart
    // 500 istället för den redan byggda 'X behöver koppla om sin kalender'-
    // hanteringen (som bara triggas när denna funktion returnerar null).
    // Nollställ den döda tokenen i Firestore samtidigt, annars fortsätter
    // systemet tro att kopplingen finns och samma fel upprepas i evighet
    // vid varje nytt försök.
    if (isPermanentGrantFailure(err)) {
      console.warn(`⚠️ Direktåtkomst-token för ${key} är återkallad/utgången — nollställer`, err.message);
      directAccessCache.delete(key);
      clearStoredDirectAccessToken(key).catch(clearErr =>
        console.warn(`⚠️ Kunde inte nollställa direktåtkomst-token för ${key}:`, clearErr.message)
      );
      return null;
    }
    throw err;
  }

  const result = { accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt, provider: stored.provider };
  directAccessCache.set(key, result);

  // Microsoft roterar ibland refresh_token vid förnyelse — spara den nya
  // krypterad, fire-and-forget, annars slutar nästa förnyelse fungera.
  if (stored.provider === 'microsoft' && refreshed.refreshToken !== refreshToken) {
    saveDirectAccessToken(key, { provider: 'microsoft', refreshToken: encryptToken(refreshed.refreshToken) })
      .catch(err => console.warn(`⚠️ Kunde inte spara roterad direktåtkomst-refreshToken för ${key}:`, err.message));
  }

  return result;
}
