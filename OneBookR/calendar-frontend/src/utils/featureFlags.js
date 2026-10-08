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

// true/false för en flagga. false tills svaret kommit tillbaka — dölj
// alltid hellre än att blinka till en otestad funktion för en kund.
// Pollar var 15:e sekund så en flippad flagga syns utan omladdning.
export function useFeatureFlag(key) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    const check = () => fetchFlags().then(flags => {
      if (active) setEnabled(Boolean(flags[key]));
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
