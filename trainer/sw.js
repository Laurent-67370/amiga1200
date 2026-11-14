/* Copie hors ligne du 68k Trainer (sous-dossier trainer/ du site de l'émulateur). Sa portée est plus précise que
   celle du service worker de l'émulateur : c'est lui qui sert les pages du Trainer. La liste des fichiers et la
   version sont écrites à la construction (vite.config.ts). */
const VERSION = "mwgdqyof";
const CACHE = "68kt-" + VERSION;
const FILES = ["./","assets/amiga-topaz-cNM6_rqp.ttf","assets/icone-presentation-CfbyWGji.png","assets/monaco-CP2cXDiA.css","assets/index-z0GUDG6A.css","assets/monaco-DcOKjXPt.js","assets/index-BSdHMHB_.js","assets/editor.worker-7tlZL6ZP.js","index.html"];

self.addEventListener("install", e => e.waitUntil((async () => {
  const c = await caches.open(CACHE);
  await Promise.all(FILES.map(async f => {
    for (let i = 0; i < 3; i++) {
      try { const r = await fetch(new Request(f, { cache: "reload" })); if (r.ok) { await c.put(f, r); return; } } catch (x) {}
    }
  }));
  await self.skipWaiting();
})()));

self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("68kt-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const url = new URL(r.url), scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  e.respondWith((async () => {
    const key = r.mode === "navigate" ? "./" : r;
    const hit = await caches.match(key, { cacheName: CACHE, ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(r); }
    catch (err) {
      if (r.mode === "navigate") { const p = await caches.match("./", { cacheName: CACHE }); if (p) return p; }
      throw err;
    }
  })());
});
