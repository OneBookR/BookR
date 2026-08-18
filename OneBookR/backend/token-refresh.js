// ===== TOKEN REFRESH — HÅLLER BOOKRS ADMIN-KALENDER LEVANDE =====
// Tidigare fanns ingen mekanism i kodbasen för att förnya en OAuth
// access-token via refresh-token (verifierat: inga träffar på
// refresh_token/grant_type i server.js). Utan detta skulle en "fast"
// BookR-kalender för demo-flödet sluta fungera så fort dess access-token
// gick ut (~1h för Google). Denna modul är den enda källan för "vad är
// BookRs kalender-token just nu".
import { getAdminCalendarToken as fetchStoredAdminCalendarToken, saveAdminCalendarToken } from './firestore.js';
import { decryptToken, encryptToken } from './gdpr-utils.js';

// ✅ In-memory cache — undviker att förnya token på varje enskilt anrop.
// Ligger i processminnet (inte Firestore) eftersom access-tokens är
// kortlivade och inte behöver överleva en omstart; refreshToken (den
// långlivade hemligheten) är det som faktiskt är persisterat.
let cachedAccessToken = null;
let cachedExpiresAt = 0;
let cachedProvider = null;

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
    return { accessToken: cachedAccessToken, provider: cachedProvider };
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

  return { accessToken: cachedAccessToken, provider: cachedProvider };
}
