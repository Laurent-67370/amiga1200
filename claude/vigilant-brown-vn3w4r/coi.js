/* Active le service worker (isolation + copie hors ligne) puis recharge la page une fois. */
(function () {
  if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
  const src = new URL("coi-sw.js", document.currentScript.src);
  if (window.crossOriginIsolated) {
    /* Déjà en place : on enregistre quand même (première visite isolée, ou mise à jour du service worker) */
    navigator.serviceWorker.register(src).then(reg => reg.update()).catch(() => {});
    return;
  }
  if (sessionStorage.getItem("coi-reload")) { sessionStorage.removeItem("coi-reload"); return; }
  navigator.serviceWorker.register(src).then(reg => {
    const go = () => { sessionStorage.setItem("coi-reload", "1"); location.reload(); };
    if (reg.active && !navigator.serviceWorker.controller) go();
    else if (!reg.active) (reg.installing || reg.waiting).addEventListener("statechange", e => { if (e.target.state === "activated") go(); });
  });
})();
