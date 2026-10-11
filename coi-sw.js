/* Service worker de l'émulateur :
   1. ajoute les en-têtes d'isolation (COOP/COEP) que GitHub Pages ne sait pas envoyer ; ils sont exigés par les
      navigateurs pour les fils d'exécution WebAssembly (SharedArrayBuffer) ;
   2. garde une copie de tous les fichiers du site pour fonctionner hors ligne (application installée).
   La version est le résumé des fichiers publiés : à chaque publication le navigateur voit un service worker
   différent, télécharge la nouvelle copie, puis efface l'ancienne. */
const VERSION = "ea96ddb37bf0";
const CACHE = "a1200-" + VERSION;
const FILES = ["./", "index.html", "puae.js", "puae.wasm", "amiberry.js", "amiberry.wasm", "whd/WHDLoad", "whd/boot-data.zip", "sons/drive_click.wav", "sons/drive_spin.wav", "sons/drive_spinnd.wav", "sons/drive_startup.wav", "sons/drive_snatch.wav", "puae-frontend.js", "adf.js", "hdf.js", "lha.js", "ffs.js", "coi.js",
  "aros-rom.bin.gz", "aros-ext.bin.gz", "manifest.webmanifest", "icon-192.png", "icon-512.png",
  "icon-maskable-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))
    .catch(err => console.warn("copie hors ligne incomplète", err)) /* le site reste utilisable en ligne */
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("a1200-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

function isolate(res) {
  if (!res || res.status === 0) return res;
  const h = new Headers(res.headers);
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Embedder-Policy", "require-corp");
  h.set("Cross-Origin-Resource-Policy", "cross-origin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.cache === "only-if-cached" && r.mode !== "same-origin") return;
  const url = new URL(r.url);
  /* L'ancienne version (sae/) n'a pas besoin d'isolation, et ses polices Google y seraient refusées */
  if (url.pathname.includes("/sae/") || (r.referrer && new URL(r.referrer).pathname.includes("/sae/"))) return;
  const scope = new URL(self.registration.scope);
  const ours = r.method === "GET" && url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
  e.respondWith((async () => {
    if (ours) {
      /* Fichiers du site : la copie locale d'abord (immédiat, et marche sans réseau) */
      const key = r.mode === "navigate" && url.pathname === scope.pathname ? "./" : r;
      const hit = await caches.match(key, { cacheName: CACHE, ignoreSearch: true });
      if (hit) return isolate(hit);
    }
    try { return isolate(await fetch(r)); }
    catch (err) {
      /* Hors ligne : une page inconnue retombe sur l'émulateur */
      if (ours && r.mode === "navigate") { const p = await caches.match("./", { cacheName: CACHE }); if (p) return isolate(p); }
      throw err;
    }
  })());
});
