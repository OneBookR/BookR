// quota-timer.js - Visa när Firebase kvoten återställs
function getQuotaResetTime() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  
  const hoursLeft = Math.ceil((tomorrow - now) / (1000 * 60 * 60));
  const minutesLeft = Math.ceil((tomorrow - now) / (1000 * 60));
  
  console.log(`🕐 Firebase kvot återställs om: ${hoursLeft}h (${minutesLeft} minuter)`);
  console.log(`📅 Nästa reset: ${tomorrow.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}`);
  
  return tomorrow;
}

// Kör direkt
getQuotaResetTime();

// Uppdatera varje timme
setInterval(getQuotaResetTime, 60 * 60 * 1000);

export { getQuotaResetTime };