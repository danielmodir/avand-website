/* Toojibee service worker — reminders only (js/core/notify.js).
   It shows the app's notifications and, when one is tapped, brings the app
   up on that day. No caching of the app and no fetch handler: the app
   loads from the network exactly as it would without it.
   'push': a reminder sent by our server (Web Push, backend-php/lib/push.php)
   while the app is closed. If the app is on screen it shows the reminder
   itself instead; otherwise it's shown here, and noted in Cache Storage so
   the app doesn't show it again when it opens. */
const SHOWN_CACHE = 'tj-shown-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = {}; }
  e.waitUntil((async () => {
    const scope = new URL(self.registration.scope);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const onScreen = windows.find(c => c.visibilityState === 'visible' && new URL(c.url).pathname.startsWith(scope.pathname));
    if (onScreen) { onScreen.postMessage({ type: 'push-reminder' }); return; }
    const tag = m.tag || 'toojibee';
    const fa = /[؀-ۿ]/.test((m.title || '') + (m.body || ''));
    await self.registration.showNotification(m.title || 'Toojibee', {
      body: m.body || '', tag, lang: fa ? 'fa' : 'en', dir: fa ? 'rtl' : 'ltr',
      icon: new URL('../assets/icons/icon-192.png?v=tj2', scope).href,
      badge: new URL('../assets/icons/favicon-48.png?v=tj2', scope).href,
      data: m.data || {},
    });
    try {
      const cache = await caches.open(SHOWN_CACHE);
      await cache.put(new URL('__shown/' + encodeURIComponent(tag), scope).href, new Response(String(Date.now())));
    } catch (err) { /* the app may show it once more; harmless */ }
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  e.waitUntil((async () => {
    const scope = new URL(self.registration.scope);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = windows.find(c => new URL(c.url).pathname.startsWith(scope.pathname));
    if (app) {
      await app.focus();
      app.postMessage({ type: 'open-reminder', kind: d.kind || '', id: d.id || '', date: d.date || '' });
      return;
    }
    await self.clients.openWindow(scope.href + '#reminder=' + encodeURIComponent([d.kind || '', d.id || '', d.date || ''].join('|')));
  })());
});
