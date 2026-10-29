// Offline helper. Always tries the internet first, so new versions you upload show up right away;
// falls back to the last saved copy when there's no connection. Your data is never touched here.
const CACHE='big-juicy-v1';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  // Sync traffic (Firebase sign-in and database, on googleapis.com) goes straight to the network, never the cache
  const r=e.request,h=new URL(r.url).hostname;if(r.method!=='GET'||(h.endsWith('googleapis.com')&&h!=='fonts.googleapis.com'))return;
  e.respondWith(fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(CACHE).then(k=>k.put(r,c))}return res})
    .catch(()=>caches.match(r).then(m=>m||(r.mode==='navigate'?caches.match('./'):undefined))));
});
