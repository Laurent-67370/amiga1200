/* Service worker : ajoute les en-têtes d'isolation (COOP/COEP) que GitHub Pages ne sait pas envoyer.
   Ils sont exigés par les navigateurs pour les fils d'exécution WebAssembly (SharedArrayBuffer). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.cache === "only-if-cached" && r.mode !== "same-origin") return;
  /* L'ancienne version (sae/) n'a pas besoin d'isolation, et ses polices Google y seraient refusées */
  if (new URL(r.url).pathname.includes("/sae/") || (r.referrer && new URL(r.referrer).pathname.includes("/sae/"))) return;
  e.respondWith(fetch(r).then(res => {
    if (res.status === 0) return res;
    const h = new Headers(res.headers);
    h.set("Cross-Origin-Opener-Policy", "same-origin");
    h.set("Cross-Origin-Embedder-Policy", "require-corp");
    h.set("Cross-Origin-Resource-Policy", "cross-origin");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  }).catch(err => { console.error(err); throw err; }));
});
