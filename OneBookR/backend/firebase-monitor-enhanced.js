// firebase-monitor-enhanced.js - Förbättrad monitoring
let dailyReads = 0;
let dailyWrites = 0;
let lastReset = new Date().toDateString();

export function trackFirebaseRead(operation = 'unknown') {
  const today = new Date().toDateString();
  if (today !== lastReset) {
    dailyReads = 0;
    dailyWrites = 0;
    lastReset = today;
  }
  
  dailyReads++;
  
  // Varna vid 80% av daglig kvot
  if (dailyReads > 40000) {
    console.warn(`🚨 Firebase reads: ${dailyReads}/50000 (${operation})`);
  }
  
  // Logga var 1000:e read
  if (dailyReads % 1000 === 0) {
    console.log(`📊 Firebase reads today: ${dailyReads}/50000`);
  }
}

export function trackFirebaseWrite(operation = 'unknown') {
  dailyWrites++;
  if (dailyWrites % 100 === 0) {
    console.log(`📝 Firebase writes today: ${dailyWrites}/20000`);
  }
}

export function getUsageStats() {
  return {
    reads: dailyReads,
    writes: dailyWrites,
    readsPercent: Math.round((dailyReads / 50000) * 100),
    writesPercent: Math.round((dailyWrites / 20000) * 100)
  };
}