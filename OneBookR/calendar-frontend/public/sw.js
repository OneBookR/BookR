// Simple service worker for BookR PWA
const CACHE_NAME = 'bookr-v1.0.0';
const STATIC_CACHE = 'bookr-static-v1';
const DYNAMIC_CACHE = 'bookr-dynamic-v1';

// ✅ RESURSER ATT CACHE:A
const STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// ✅ INSTALL SERVICE WORKER
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Caching static files');
      return cache.addAll(STATIC_FILES);
    }).then(() => {
      console.log('[SW] Service worker installed');
      return self.skipWaiting();
    }).catch((error) => {
      console.error('[SW] Install failed:', error);
    })
  );
});

// ✅ ACTIVATE SERVICE WORKER
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Service worker activated');
      return self.clients.claim();
    })
  );
});

// ✅ FETCH REQUESTS - CACHE FIRST STRATEGY
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip external requests
  if (!event.request.url.startsWith(self.location.origin)) return;
  
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        console.log('[SW] Serving from cache:', event.request.url);
        return response;
      }
      
      // Fetch from network and cache dynamic content
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        
        const responseToCache = networkResponse.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        
        return networkResponse;
      }).catch(() => {
        // Offline fallback
        if (event.request.destination === 'document') {
          return caches.match('/');
        }
        return new Response('Offline - BookR kräver internetanslutning för att fungera', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      });
    })
  );
});

// ✅ BACKGROUND SYNC (för framtida offline-funktioner)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'bookr-sync') {
    event.waitUntil(
      // Sync offline actions when back online
      Promise.resolve()
    );
  }
});

// ✅ PUSH NOTIFICATIONS (för framtida notifikationer)
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  const options = {
    body: event.data?.text() || 'BookR notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      {
        action: 'explore',
        title: 'Öppna BookR',
        icon: '/icon-192.png'
      },
      {
        action: 'close',
        title: 'Stäng'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('BookR', options)
  );
});
