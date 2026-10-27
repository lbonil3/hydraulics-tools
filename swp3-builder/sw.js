/* Offline cache for SWP3 Builder (static files only). Bump CACHE when files change. */
var CACHE = 'swp3-builder-v7';
var FILES = ['./', './index.html', './style.css', './data.js', './model.js', './app.js', './design-ui.js', './guide.js', './vendor/pdf-lib.min.js', './summary-layout.js', './summary.js', './summary-pdf.js', './summary-ui.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', '../home-btn.css'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE && k.indexOf('swp3-builder-') === 0; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(function (r) {
    var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {}); return r;
  }).catch(function () { return caches.match(e.request).then(function (m) { return m || caches.match('./index.html'); }); }));
});
