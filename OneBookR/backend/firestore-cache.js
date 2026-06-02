// firestore-cache.js - Aggressiv caching för att minska reads
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minuter cache

export function getCachedOrFetch(key, fetchFn) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return Promise.resolve(cached.data);
  }
  
  return fetchFn().then(data => {
    cache.set(key, { data, timestamp: Date.now() });
    return data;
  });
}

export function invalidateCache(pattern) {
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
}

export function clearCache() {
  cache.clear();
}