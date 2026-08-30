// ✅ Delad GA4-hjälpmodul. Allt här är no-op om window.gtag saknas — dvs.
// om användaren inte gett samtycke till analytics-cookies i CookieBanner.jsx
// (den enda platsen som laddar in gtag). Skickar ALDRIG PII (namn, e-post,
// telefon) — bara icke-personlig metadata och en oåterkallelig hash-id
// (analyticsId) som backend räknar fram för retention/kohorter i GA4.
//
// Katalog över alla event-namn på ett ställe så vi slipper stavfel och
// får en överblick över vad som mäts. Grupperat efter de tre frågorna
// vi vill att statistiken ska svara på.
export const EVENTS = {
  // Identitet
  LOGIN: 'login',
  SIGNUP: 'signup', // första inloggningen någonsin (localStorage-vaktad)

  // A. Inbjudnings-tratt / viralitet
  GROUP_CREATED: 'group_created',
  INVITATION_SENT: 'invitation_sent',
  INVITATION_LINK_OPENED: 'invitation_link_opened',
  INVITATION_ACCEPTED: 'invitation_accepted',

  // B. Aktivering & retention
  CALENDAR_CONNECTED: 'calendar_connected',
  COMPARISON_RUN: 'comparison_run',
  FIRST_COMPARISON_COMPLETED: 'first_comparison_completed', // aktiverings-milstolpe
  SUGGESTION_CREATED: 'suggestion_created',
  SUGGESTION_ACCEPTED: 'suggestion_accepted',
  BOOKING_CONFIRMED: 'booking_confirmed',

  // C. Funktionsanvändning & fel
  FEATURE_USED: 'feature_used',
  API_ERROR: 'api_error',
  ERROR_SHOWN: 'error_shown',
};

function gtagReady() {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

// Många events (login, invitation_link_opened) inträffar vid app-start —
// innan CookieBanner hunnit ladda gtag, eller innan användaren gett
// samtycke. Vi köar då upp till FLUSH_MAX events och tömmer kön när gtag
// dyker upp (dvs. när/om samtycke ges). Ges aldrig samtycke töms kön
// aldrig och inget lämnar webbläsaren — helt GDPR-säkert.
const MAX_QUEUE = 50;
let queue = [];
let flushTimer = null;
let pendingUser = null; // { analyticsId, userProperties } satt före gtag redo

function applyUser() {
  if (!pendingUser || !gtagReady()) return;
  try {
    window.gtag('set', { user_id: pendingUser.analyticsId });
    if (Object.keys(pendingUser.userProperties || {}).length > 0) {
      window.gtag('set', 'user_properties', pendingUser.userProperties);
    }
  } catch { /* ignore */ }
}

function startFlushWatcher() {
  if (flushTimer || typeof window === 'undefined') return;
  let ticks = 0;
  flushTimer = setInterval(() => {
    ticks++;
    if (gtagReady()) {
      applyUser(); // user_id/properties innan events skickas
      const pending = queue;
      queue = [];
      clearInterval(flushTimer);
      flushTimer = null;
      pending.forEach(({ name, params }) => {
        try { window.gtag('event', name, params); } catch { /* ignore */ }
      });
    } else if (ticks > 600) {
      // ~10 min utan gtag → sluta vänta, släng kön.
      clearInterval(flushTimer);
      flushTimer = null;
      queue = [];
    }
  }, 1000);
}

// Skickar ett custom event till GA4. Params måste vara icke-personliga.
// Köas om gtag inte är redo än.
export function trackEvent(eventName, params = {}) {
  try {
    if (gtagReady()) {
      window.gtag('event', eventName, params);
      return;
    }
    if (queue.length < MAX_QUEUE) queue.push({ name: eventName, params });
    startFlushWatcher();
  } catch {
    // Analytics ska aldrig kunna störa den faktiska funktionaliteten.
  }
}

// Kör ett event högst en gång per webbläsare (via localStorage-nyckel).
// Används för milstolpar som "signup" och "first_comparison_completed".
export function trackEventOnce(storageKey, eventName, params = {}) {
  try {
    if (localStorage.getItem(storageKey)) return;
    localStorage.setItem(storageKey, String(Date.now()));
    trackEvent(eventName, params);
  } catch {
    // localStorage kan kasta i privat läge — hoppa då bara över once-logiken.
    trackEvent(eventName, params);
  }
}

// Kopplar den inloggade användaren till GA4:s User-rapporter (retention,
// kohorter). analyticsId är en oåterkallelig hash från backend — ingen PII.
export function setAnalyticsUser(analyticsId, userProperties = {}) {
  try {
    if (!analyticsId) return;
    pendingUser = { analyticsId, userProperties };
    if (gtagReady()) {
      applyUser();
    } else {
      startFlushWatcher();
    }
  } catch {
    // ignore
  }
}

// Manuell page_view för SPA-navigering (GA4 skickar bara automatiskt vid
// full sidladdning). Anropas av initPageViewTracking nedan.
export function trackPageView(path) {
  try {
    if (!gtagReady()) return;
    const page_path = path || (window.location.pathname + window.location.search);
    window.gtag('event', 'page_view', {
      page_path,
      page_location: window.location.origin + page_path,
      page_title: document.title,
    });
  } catch {
    // ignore
  }
}

// Monkey-patchar history.pushState/replaceState + lyssnar på popstate så
// att ALLA klient-navigeringar ger en page_view, oavsett hur appens egna
// (manuella) routing byter sida. Körs en gång från main.jsx.
let pageViewTrackingStarted = false;
export function initPageViewTracking() {
  if (pageViewTrackingStarted || typeof window === 'undefined') return;
  pageViewTrackingStarted = true;

  let lastPath = window.location.pathname + window.location.search;
  const fire = () => {
    const now = window.location.pathname + window.location.search;
    if (now === lastPath) return;
    lastPath = now;
    trackPageView(now);
  };

  const wrap = (fnName) => {
    const original = window.history[fnName];
    if (typeof original !== 'function') return;
    window.history[fnName] = function (...args) {
      const result = original.apply(this, args);
      // Låt appens state uppdatera klart först.
      setTimeout(fire, 0);
      return result;
    };
  };
  wrap('pushState');
  wrap('replaceState');
  window.addEventListener('popstate', () => setTimeout(fire, 0));
}

// Lägger klass-lösa tal i hinkar så GA4-dimensionerna blir hanterbara.
export function bucket(n, edges = [0, 1, 3, 5, 10, 25, 50]) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 'unknown';
  let label = `${edges[edges.length - 1]}+`;
  for (let i = 0; i < edges.length; i++) {
    if (n <= edges[i]) {
      label = i === 0 ? String(edges[0]) : `${edges[i - 1] + 1}-${edges[i]}`;
      break;
    }
  }
  return label;
}

// Antal hela dygn mellan två ISO-datum (för comparison_run range_days).
export function daysBetween(startIso, endIso) {
  try {
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    return Math.max(0, Math.round(ms / 86400000));
  } catch {
    return null;
  }
}
