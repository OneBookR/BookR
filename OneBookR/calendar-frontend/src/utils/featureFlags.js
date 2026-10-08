// Feature flags — matchar backendens /api/feature-flags. Hämtas en gång per
// sidladdning och cachas i minnet; samma flaggor gäller hela sessionen.
import { useEffect, useState } from 'react';
import { apiRequest } from './apiConfig.js';

let cachedFlags = null;
let fetchPromise = null;

async function fetchFlags() {
  if (cachedFlags) return cachedFlags;
  if (!fetchPromise) {
    fetchPromise = apiRequest('/api/feature-flags')
      .then(res => (res.ok ? res.json() : { flags: {} }))
      .then(data => {
        cachedFlags = data.flags || {};
        return cachedFlags;
      })
      .catch(() => ({}));
  }
  return fetchPromise;
}

// true/false för en flagga. false tills svaret kommit tillbaka — dölj
// alltid hellre än att blinka till en otestad funktion för en kund.
export function useFeatureFlag(key) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    fetchFlags().then(flags => {
      if (active) setEnabled(Boolean(flags[key]));
    });
    return () => { active = false; };
  }, [key]);
  return enabled;
}
