/* Static application shell only. No grammar or translation API responses are cached. */
const CACHE = 'fieldnotes-english-v1.0.2';
const APP_SHELL = ['./','./index.html','./styles.css','./database.js','./providers.js','./app.js','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('fieldnotes-english-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put('./index.html',copy)));
      }
      return response;
    }).catch(async () => (await caches.match('./index.html')) || Response.error()));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
