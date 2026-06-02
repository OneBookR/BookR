// debug-reads.js - Spåra var reads kommer ifrån
const readSources = new Map();

export function logRead(source, operation) {
  const key = `${source}:${operation}`;
  const count = readSources.get(key) || 0;
  readSources.set(key, count + 1);
  
  // Logga var 100:e read från samma källa
  if (count % 100 === 0) {
    console.log(`📊 ${key}: ${count + 1} reads`);
  }
}

export function getTopReaders() {
  return Array.from(readSources.entries())
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10);
}

// Logga top readers var 5:e minut
setInterval(() => {
  const top = getTopReaders();
  if (top.length > 0) {
    console.log('🔥 Top Firebase readers:');
    top.forEach(([source, count]) => {
      console.log(`  ${source}: ${count} reads`);
    });
  }
}, 5 * 60 * 1000);