/* Toojibee service worker — reminders only (js/core/notify.js).
   It shows the app's notifications and, when one is tapped, brings the app
   up on that day. No caching and no fetch handler: the app loads from the
   network exactly as it would without it. (Step 2, Web Push, will add a
   'push' handler here.) */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

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
