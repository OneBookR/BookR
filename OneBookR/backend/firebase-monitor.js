// firebase-monitor.js - Monitoring och rate limiting
let requestCount = 0;
let lastReset = Date.now();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minut
const MAX_REQUESTS_PER_MINUTE = 100;

// Rate limiting middleware
export function rateLimitFirebase(req, res, next) {
  const now = Date.now();
  
  // Reset counter varje minut
  if (now - lastReset > RATE_LIMIT_WINDOW) {
    requestCount = 0;
    lastReset = now;
  }
  
  requestCount++;
  
  if (requestCount > MAX_REQUESTS_PER_MINUTE) {
    console.warn(`🚨 Firebase rate limit exceeded: ${requestCount} requests/min`);
    return res.status(429).json({ 
      error: 'Too many requests', 
      retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - lastReset)) / 1000)
    });
  }
  
  // Logga varning vid högt antal requests
  if (requestCount > MAX_REQUESTS_PER_MINUTE * 0.8) {
    console.warn(`⚠️ Firebase usage warning: ${requestCount}/${MAX_REQUESTS_PER_MINUTE} requests`);
  }
  
  next();
}

// Monitoring funktion
export function logFirebaseUsage(operation, reads = 0, writes = 0) {
  console.log(`📊 Firebase ${operation}: ${reads} reads, ${writes} writes`);
  
  // Skicka till monitoring service om ni har ett
  if (process.env.NODE_ENV === 'production') {
    // Exempel: skicka till CloudWatch, DataDog, etc.
  }
}

// Daglig cleanup job
export async function dailyCleanup() {
  try {
    const { cleanupExpiredInvitations } = await import('./firestore-optimized.js');
    const cleaned = await cleanupExpiredInvitations();
    console.log(`🧹 Daily cleanup: ${cleaned} expired invitations removed`);
  } catch (error) {
    console.error('❌ Daily cleanup failed:', error);
  }
}