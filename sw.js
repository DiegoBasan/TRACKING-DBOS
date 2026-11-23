// Service worker: caché de la app (offline) + notificaciones push de Firebase Cloud Messaging
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDfWuyJFV2vV8yQAdngrorTMZWn9p0DIqI',
  authDomain: 'diagram-diapp.firebaseapp.com',
  projectId: 'diagram-diapp',
  storageBucket: 'diagram-diapp.firebasestorage.app',
  messagingSenderId: '917124489683',
  appId: '1:917124489683:web:503c4df1fcf0577fc68f26'
});
// Los mensajes con "notification" los muestra el SDK automáticamente (y abre fcmOptions.link al tocarlos).
const messaging = firebase.messaging();
messaging.onBackgroundMessage(p => {
  // Solo para mensajes de datos sin "notification"
  if (p.notification || !p.data || !p.data.title) return;
  return self.registration.showNotification(p.data.title, {
    body: p.data.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: p.data.tag, data: { link: p.data.link }
  });
});
self.addEventListener('notificationclick', e => {
  const link = e.notification.data && e.notification.data.link;
  if (!link && e.notification.data && e.notification.data.FCM_MSG) return; // lo maneja Firebase
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if ('focus' in w) return w.focus();
    return clients.openWindow(link || './');
  }));
});

const CACHE = 'tracker-v9';
const SHELL = ['./', 'index.html', 'categorias.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Firebase y fuentes: directo a red
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
