/* Active le service worker d'isolation puis recharge la page une fois. */
(function () {
  if (window.crossOriginIsolated || !window.isSecureContext || !("serviceWorker" in navigator)) return;
  if (sessionStorage.getItem("coi-reload")) { sessionStorage.removeItem("coi-reload"); return; }
  navigator.serviceWorker.register(new URL("coi-sw.js", document.currentScript.src)).then(reg => {
    const go = () => { sessionStorage.setItem("coi-reload", "1"); location.reload(); };
    if (reg.active && !navigator.serviceWorker.controller) go();
    else if (!reg.active) (reg.installing || reg.waiting).addEventListener("statechange", e => { if (e.target.state === "activated") go(); });
  });
})();
