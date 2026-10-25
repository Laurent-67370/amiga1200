/* Service worker de l'émulateur :
   1. ajoute les en-têtes d'isolation (COOP/COEP) que GitHub Pages ne sait pas envoyer ; ils sont exigés par les
      navigateurs pour les fils d'exécution WebAssembly (SharedArrayBuffer) ;
   2. garde une copie de tous les fichiers du site pour fonctionner hors ligne (application installée).
   La version est le résumé des fichiers publiés : à chaque publication le navigateur voit un service worker
   différent, télécharge la nouvelle copie, puis efface l'ancienne. */
const VERSION = "59ef00f52b1b";
const CACHE = "a1200-" + VERSION;
const FILES = ["./", "index.html", "puae.js", "puae.wasm", "amiberry.js", "amiberry.wasm", "ipf.js", "ipf.wasm", "whd/WHDLoad", "whd/boot-data.zip", "whd/WHDLoad_usr.lha", "whd/GenericKick.lha", "sons/drive_click.wav", "sons/drive_spin.wav", "sons/drive_spinnd.wav", "sons/drive_startup.wav", "sons/drive_snatch.wav", "puae-frontend.js", "lazydisk-worker.js", "adf.js", "hdf.js", "lha.js", "ffs.js", "coi.js",
  "aros-rom.bin.gz", "aros-ext.bin.gz", "manifest.webmanifest", "icon-192.png", "icon-512.png",
  "icon-maskable-512.png", "apple-touch-icon.png"];

/* Copie de chaque fichier (trois essais) : une coupure passagère ne fait plus perdre toute la copie hors ligne */
async function copy(c, f) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(new Request(f, { cache: "reload" })); if (r.ok) { await c.put(f, r); return true; } } catch (x) {}
  }
  return false;
}
self.addEventListener("install", e => e.waitUntil((async () => {
  const c = await caches.open(CACHE);
  const files = FILES.filter((f, i, a) => a.indexOf(f) === i);
  const ok = await Promise.all(files.map(f => copy(c, f)));
  let lost = files.filter((f, i) => !ok[i]);
  if (lost.length) {
    /* Copie incomplète, le plus souvent faute de place (gros disques durs dans la Bibliothèque) : l'ancienne copie
       est effacée pour faire de la place, puis nouvel essai. La nouvelle version s'installe dans tous les cas (sinon
       l'ancienne resterait en service indéfiniment) : les fichiers manquants viennent du réseau quand la page les
       demande. */
    for (const k of await caches.keys()) if (k.startsWith("a1200-") && k !== CACHE) await caches.delete(k);
    const again = await Promise.all(lost.map(f => copy(c, f)));
    lost = lost.filter((f, i) => !again[i]);
    if (lost.length) console.warn("copie hors ligne incomplète :", lost.join(", "));
  }
  await self.skipWaiting();
})()));
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
    try {
      const res = await fetch(r);
      /* Fichier du site absent de la copie (premier passage interrompu) : copié au passage */
      /* La copie ne doit jamais faire échouer la réponse : stockage du navigateur plein (gros disques durs dans la
         Bibliothèque), le fichier est servi quand même, simplement pas gardé pour le hors ligne */
      if (ours && res.ok && FILES.includes(url.pathname.slice(scope.pathname.length) || "./")) {
        const f = url.pathname.slice(scope.pathname.length) || "./", copy = res.clone();
        e.waitUntil(caches.open(CACHE).then(c => c.put(f, copy)).catch(x => console.warn("copie hors ligne impossible :", f, x)));
      }
      return isolate(res);
    }
    catch (err) {
      /* Hors ligne : une page inconnue retombe sur l'émulateur */
      if (ours && r.mode === "navigate") { const p = await caches.match("./", { cacheName: CACHE }); if (p) return isolate(p); }
      throw err;
    }
  })());
});
