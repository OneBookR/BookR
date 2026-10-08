// Feature flags — matchar backendens /api/feature-flags. Cachas kort (så
// flera komponenter inte hamrar API:et samtidigt) och hämtas om i
// bakgrunden med jämna mellanrum så en flippad flagga slår igenom i redan
// öppna flikar utan att användaren behöver ladda om sidan.
import { useEffect, useState } from 'react';
import { apiRequest } from './apiConfig.js';

const CACHE_TTL_MS = 15_000;
let cachedFlags = null;
let cachedAt = 0;
let fetchPromise = null;

async function fetchFlags() {
  const isFresh = cachedFlags && Date.now() - cachedAt < CACHE_TTL_MS;
  if (isFresh) return cachedFlags;
  if (!fetchPromise) {
    fetchPromise = apiRequest('/api/feature-flags')
      .then(res => (res.ok ? res.json() : { flags: {} }))
      .then(data => {
        cachedFlags = data.flags || {};
        cachedAt = Date.now();
        return cachedFlags;
      })
      .catch(() => cachedFlags || {})
      .finally(() => {
        fetchPromise = null;
      });
  }
  return fetchPromise;
}

// ✅ PERSONLIG FÖRHANDSGRANSKNING: en early-access-mejl (t.ex. admin) ser
// alltid en flagga som är på för dem, oavsett global switch — det är
// poängen med early access. Men för att kunna förhandsgranska BÅDA lägena
// utan att pyssla med mejl-listan varje gång, kan man tvinga ett lokalt
// läge som bara gäller den här webbläsaren (localStorage), aldrig andra.
function getOverride(key) {
  try {
    return localStorage.getItem(`bookr_ff_override_${key}`);
  } catch {
    return null;
  }
}

export function setFeatureFlagOverride(key, value) {
  try {
    if (value === null) localStorage.removeItem(`bookr_ff_override_${key}`);
    else localStorage.setItem(`bookr_ff_override_${key}`, value);
  } catch { /* privat läge etc — strunta i det */ }
}

export function getFeatureFlagOverride(key) {
  return getOverride(key);
}

// true/false för en flagga. false tills svaret kommit tillbaka — dölj
// alltid hellre än att blinka till en otestad funktion för en kund.
// Pollar var 15:e sekund så en flippad flagga (eller en lokal override)
// syns utan omladdning.
export function useFeatureFlag(key) {
  const [enabled, setEnabled] = useState(() => {
    const override = getOverride(key);
    return override ? override === 'on' : false;
  });
  useEffect(() => {
    let active = true;
    const check = () => fetchFlags().then(flags => {
      if (!active) return;
      const override = getOverride(key);
      setEnabled(override ? override === 'on' : Boolean(flags[key]));
    });
    check();
    const interval = setInterval(check, CACHE_TTL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [key]);
  return enabled;
}
