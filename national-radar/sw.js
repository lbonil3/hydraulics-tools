/* Offline cache for National Radar. Static files are cached on install; the data snapshot is network-first so a refreshed snapshot shows up when online. Bump CACHE when files change. */
var CACHE = 'national-radar-v3';
var FILES = ['./', './index.html', './style.css', './proj.js', './us-geo.js', './model.js', './cost.js', './roadway.js', './pse.js', './sources.js', './app.js', './data/national.json', './data/roadway.json', './data/pse.json', './data/cost-prices.json', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', '../home-btn.css'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE && k.indexOf('national-radar-') === 0; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  var url = new URL(req.url); if (url.origin !== location.origin) return; // live API calls go straight to the network
  e.respondWith(fetch(req).then(function (r) {
    if (r && r.ok) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {}); }
    return r;
  }).catch(function () { return caches.match(req).then(function (m) { return m || caches.match('./index.html'); }); }));
});
