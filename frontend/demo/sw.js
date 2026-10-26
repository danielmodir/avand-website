/* Toojibee service worker — reminders only (js/core/notify.js).
   It shows the app's notifications and, when one is tapped, brings the app
   up on that day. Offline shell (Phase 3.10, the installable web app): the
   app's own files are fetched from the network as always and a copy is kept,
   used only when the network fails, so the installed app opens offline.
   Never the API (/api/: sign-in, data), never other sites, never inside the
   Android app (it has its own offline files).
   'push': a reminder sent by our server (Web Push, backend-php/lib/push.php)
   while the app is closed. If the app is on screen it shows the reminder
   itself instead; otherwise it's shown here, and noted in Cache Storage so
   the app doesn't show it again when it opens. */
const SHOWN_CACHE = 'tj-shown-v1';

const SHELL_CACHE = 'tj-shell-v1';
const IN_ANDROID_APP = /ToojibeeAndroid/.test(self.navigator.userAgent);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('tj-shell-') && k !== SHELL_CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (IN_ANDROID_APP || req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/') || url.pathname.includes('__shown/')) return;
  const page = req.mode === 'navigate';
  if (!page && !/^\/(demo|assets)\//.test(url.pathname)) return;
  // Network first; the copy only when offline. Pages fall back to the app's start page.
  const index = new URL('./', self.registration.scope).href;
  e.respondWith(fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(SHELL_CACHE).then(c => c.put(page ? index : req, copy)).catch(() => {}); }
    return res;
  }).catch(async () => (await caches.match(page ? index : req)) || (page ? caches.match(index) : Response.error())));
});

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
      icon: new URL('../assets/icons/icon-192.png?v=tj5', scope).href,
      badge: new URL('../assets/icons/favicon-48.png?v=tj5', scope).href,
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
