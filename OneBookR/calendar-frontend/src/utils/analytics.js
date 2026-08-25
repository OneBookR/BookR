// ✅ Liten delad hjälpfunktion för GA4 custom events. Skickar bara vidare
// till window.gtag om den faktiskt finns (dvs. användaren gett samtycke
// till analytics-cookies i CookieBanner.jsx — den sätter upp window.gtag
// bara då). No-op annars, aldrig ett fel som stör UI:t.
//
// Används för att bygga upp lead-tratten i GA4 för "Boka demo"-flödet:
// formulär -> inloggning påbörjad -> inloggning klar -> kalender visad ->
// tid vald -> bokning klar. Skickar ALDRIG PII (namn, e-post, telefon) —
// bara icke-personlig metadata (provider, ja/nej-flaggor).
export function trackEvent(eventName, params = {}) {
  try {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', eventName, params);
    }
  } catch {
    // Analytics ska aldrig kunna störa den faktiska funktionaliteten.
  }
}
