const CACHE_NAME = 'snabchat-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  'https://cdn.tailwindcss.com',
  './audio/slide1.mp3',
  './audio/slide2.mp3',
  './audio/slide3.mp3',
  './audio/slide4.mp3',
  './audio/slide5.mp3',
  './audio/slide6.mp3',
  './audio/slide7.mp3',
  './audio/slide8.mp3',
  './audio/slide9.mp3',
  './audio/slide10.mp3',
  './audio/slide11.mp3',
  './audio/slide12.mp3',
  './audio/slide13.mp3',
  './audio/slide14.mp3',
  './audio/slide15.mp3',
  './audio/slide16.mp3',
  './audio/slide17.mp3'
];

// Install: cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        console.log('Cache addAll partial error (CDN may fail):', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for own assets, network-first for CDN
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always network for CDN resources
  if (url.hostname === 'cdn.tailwindcss.com') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
