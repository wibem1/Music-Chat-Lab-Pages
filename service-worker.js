// Music Chat Lab v1.2.4 emergency service-worker shutdown.
// Purpose: stop stale service workers from controlling or reloading the app.
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(names
        .filter(name => name.startsWith('music-chat-lab-'))
        .map(name => caches.delete(name)));
    } catch (_) {}
    try {
      await self.registration.unregister();
    } catch (_) {}
  })());
});

// Intentionally no fetch handler and no clients.claim().
// Existing controlled pages keep working until closed; new navigations go to the network.
