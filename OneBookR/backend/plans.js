// plans.js — enda källan för plan-gränser (sessioner/månad, deltagare/session).
// Måste hållas i synk med prissidan (Pricing.jsx) om gränserna ändras där.
//
// En "session" = en kalenderjämförelse (en skapad grupp, eller en direkt
// jämförelse utan grupp). Flera bokningar/tidsförslag ur SAMMA session
// kostar inget extra — bara att STARTA en ny jämförelse räknas.
export const PLAN_LIMITS = {
  free:       { sessionsPerMonth: 3,    maxParticipants: 5 },
  pro:        { sessionsPerMonth: null, maxParticipants: 10 }, // null = obegränsat
  business:   { sessionsPerMonth: null, maxParticipants: 20 },
  enterprise: { sessionsPerMonth: null, maxParticipants: 20 },
};

export function limitsForPlan(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

// 'YYYY-MM' i UTC — samma nyckel oavsett var servern körs, byts vid
// månadsskiftet (inte rullande 30 dagar från köp).
export function currentPeriodKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
