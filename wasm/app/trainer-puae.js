
/* =========================================================
   68k Trainer : programme envoyé par le Trainer (sous-dossier trainer/ du site, ou son application Android)
   - dans l'adresse : #nom=…&modele=a500|a1200&trainer=<disquette .adf amorçable, gzip, base64url> ;
   - ou par message, quand l'émulateur est placé dans la page du Trainer (?integre=1) :
     { type: "68kt-disquette", nom, modele, adf: Uint8Array } ; l'émulateur répond { type: "68kt-pret" } une fois prêt.
   La disquette rejoint la Bibliothèque (à la place de l'essai précédent du même nom), est insérée dans DF0:
   et l'Amiga démarre dessus (ou redémarre, s'il tourne déjà sur le même modèle) : sa Startup-Sequence lance le programme.
   ========================================================= */
let trainerModeleLance = null;
function trainerTake() {
  let h = location.hash.slice(1);
  if (/(^|&)trainer=/.test(h)) {
    /* Gardé pour la session : la page peut se recharger une fois (isolation, coi.js) avant d'être prête */
    try { sessionStorage.setItem("a1200.trainer", h); } catch (e) {}
    history.replaceState(null, "", location.pathname + location.search);
    return h;
  }
  try { return sessionStorage.getItem("a1200.trainer") || ""; } catch (e) { return ""; }
}
/** Range la disquette, l'insère dans DF0: et (re)démarre l'Amiga demandé. */
async function trainerCharger(u8, nom, modele) {
  if (!u8 || u8.length !== 901120) { toast("La disquette envoyée par le 68k Trainer est illisible.", true); return; }
  const model = modele === "a1200" ? "a1200" : "a500";
  const name = (String(nom || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 30) || "programme") + ".adf";
  /* Un essai remplace le précédent du même programme (la Bibliothèque ne se remplit pas d'essais) */
  let all = [];
  try { all = await DB.all(); } catch (e) {}
  for (const old of all.filter(r => r.trainer && r.name === name)) {
    if (mounted.df0 && mounted.df0.id === old.id) await ejectMedia("df0", true);
    await DB.del(old.id);
  }
  const rec = { id: newId(), kind: "adf", name, size: u8.length, blob: new Blob([u8]), crc: crc32u8(u8), added: Date.now(), used: Date.now(), trainer: true };
  await DB.put(rec);
  const machineNom = model === "a500" ? "Amiga 500" : "Amiga 1200";
  /* Déjà allumé sur ce modèle : nouvelle disquette, puis redémarrage (quelques secondes au lieu d'un démarrage complet) */
  if ((running || starting) && trainerModeleLance === model) {
    while (starting) await new Promise(r => setTimeout(r, 200));
    await mountMedia("df0", rec);
    $("#btnReset").click();
    toast("68k Trainer : " + name + " dans DF0:, l'" + machineNom + " redémarre.");
    return;
  }
  if (running || starting) { while (starting) await new Promise(r => setTimeout(r, 200)); await powerOff(); }
  S.model = model; saveSettings();
  if (typeof themeNow === "function") themeNow();
  trainerModeleLance = model;
  toast("68k Trainer : " + name + " est dans DF0:, l'" + machineNom + " démarre et lance le programme.");
  await launchWith(rec);
}
async function trainerHandoff() {
  const h = trainerTake();
  if (!h) return;
  /* Première visite : coi.js recharge la page dès que l'isolation est en place ; on attend ce rechargement */
  if (!filsPossibles() && window.isSecureContext && "serviceWorker" in navigator) await new Promise(r => setTimeout(r, 6000));
  try { sessionStorage.removeItem("a1200.trainer"); } catch (e) {}
  if (running || starting) return;
  const p = new URLSearchParams(h);
  let u8;
  try {
    const b64 = (p.get("trainer") || "").replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const gz = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) gz[i] = bin.charCodeAt(i);
    u8 = new Uint8Array(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
  } catch (e) { u8 = null; }
  await trainerCharger(u8, p.get("nom"), p.get("modele"));
}
/* Placé dans la page du Trainer (même origine) : disquettes reçues par message ; « prêt » annoncé à la fin du
   démarrage de la page (trainerPret, appelé par l'initialisation), y compris après un rechargement */
if (window.parent !== window) window.addEventListener("message", e => {
  if (e.origin !== location.origin || !e.data) return;
  /* « Kickstart… » du Trainer : l'Amiga s'éteint, la carte d'accueil montre le Kickstart et « Importer mon Kickstart… » */
  if (e.data.type === "68kt-eteindre") { if (running) powerOff(); return; }
  /* Modèle choisi dans le Trainer (Amiga 500 ou 1200) : pris en compte au prochain allumage */
  if (e.data.type === "68kt-modele") {
    if (!running && !starting && (e.data.modele === "a500" || e.data.modele === "a1200")) {
      S.model = e.data.modele; saveSettings();
      if (typeof themeNow === "function") themeNow();
      if (typeof simpleKick === "function") simpleKick();
    }
    return;
  }
  if (e.data.type !== "68kt-disquette") return;
  trainerCharger(e.data.adf instanceof Uint8Array ? e.data.adf : new Uint8Array(e.data.adf || []), e.data.nom, e.data.modele);
});
function trainerPret() {
  if (window.parent !== window) window.parent.postMessage({ type: "68kt-pret" }, location.origin);
}
