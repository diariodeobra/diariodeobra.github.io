// Guarda o app no celular para funcionar sem internet em campo
const CACHE="ferramentas-v2";
const ARQUIVOS=["./","index.html","style.css","style.css?v=1","app.js","app.js?v=1","config.js","config.js?v=2","supervisor.html","supervisor.js","lib/jsQR.js","lib/qrcode.js","icon-192.png","icon-512.png","manifest.webmanifest","../logo.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ARQUIVOS)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("ferramentas-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const u=new URL(e.request.url);
  if(u.hostname.endsWith("script.google.com")||u.hostname.endsWith("googleusercontent.com"))return;
  e.respondWith(
    fetch(e.request,u.origin===location.origin?{cache:"no-cache"}:{}).then(r=>{
      if(r.ok&&(u.origin===location.origin||u.hostname.includes("fonts.g"))){const c=r.clone();caches.open(CACHE).then(k=>k.put(e.request,c));}
      return r;
    }).catch(()=>caches.match(e.request,{ignoreSearch:true}))
  );
});
