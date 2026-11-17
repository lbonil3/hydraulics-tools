/* Offline shell for Culvert Studio. hy8shapes.js is cached on first fetch, not during install, so the first paint stays small. */
const CACHE='culvert-studio-v4';
const SHELL=['./','./index.html','./calc.js','./shapes.js','./app.js','./view3d.js','./graphics.js','./profile.js','./profile.css','./style.css','./mobile.css','./mobile.js','./report.js','./report.css','./reportpdf.js','./inletsketch.js','./flows.js','./compare.js','./outlet.js','./projects.js','./taper.js','./barrels.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./vendor/jspdf.umd.min.js','../home-btn.css'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const url=new URL(e.request.url);
 e.respondWith(caches.match(e.request).then(hit=>{
  if(hit)return hit;
  return fetch(e.request).then(res=>{
   if(res&&res.ok&&url.origin===location.origin){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}
   return res;
  }).catch(()=>caches.match('./index.html'));
 }));
});
