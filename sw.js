// Guarda o app no celular para funcionar sem internet no canteiro
const CACHE="diario-obra-v7";
const ARQUIVOS=["./","index.html","style.css","app.js","style.css?v=7","app.js?v=7","logo.png","icon-192.png","icon-512.png","manifest.webmanifest","lib/jspdf.umd.min.js","lib/xlsx.full.min.js","lib/docx.umd.js"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ARQUIVOS)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  e.respondWith(
    fetch(e.request,new URL(e.request.url).origin===location.origin?{cache:"no-cache"}:{}).then(r=>{
      if(r.ok&&(new URL(e.request.url).origin===location.origin||e.request.url.includes("fonts.g"))){const c=r.clone();caches.open(CACHE).then(k=>k.put(e.request,c));}
      return r;
    }).catch(()=>caches.match(e.request,{ignoreSearch:true}))
  );
});
