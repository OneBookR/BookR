// emergency-brake.js - Nödstopp för Firebase
let dailyReads = 0;
const MAX_DAILY_READS = 45000; // Säkerhetsmarginal

export function checkFirebaseQuota() {
  dailyReads++;
  
  if (dailyReads > MAX_DAILY_READS) {
    console.error(`🚨 FIREBASE QUOTA EXCEEDED: ${dailyReads} reads today`);
    process.env.MAINTENANCE_MODE = 'true';
    throw new Error('Daily Firebase quota exceeded - app in maintenance mode');
  }
  
  if (dailyReads % 1000 === 0) {
    console.warn(`⚠️ Firebase reads: ${dailyReads}/${MAX_DAILY_READS}`);
  }
}

// Reset vid midnatt
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    dailyReads = 0;
    console.log('🔄 Firebase quota reset');
  }
}, 60000);