
/* =========================================================
   68k Trainer : programme envoyé par le Trainer (sous-dossier trainer/ du site, ou son application Android)
   Adresse : #nom=…&modele=a500|a1200&trainer=<disquette .adf amorçable, compressée gzip, en base64url>.
   La disquette rejoint la Bibliothèque (à la place de l'essai précédent du même nom), est insérée dans DF0:
   et l'Amiga choisi démarre dessus : sa Startup-Sequence lance le programme.
   ========================================================= */
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
  if (!u8 || u8.length !== 901120) { toast("La disquette envoyée par le 68k Trainer est illisible.", true); return; }
  const model = p.get("modele") === "a1200" ? "a1200" : "a500";
  const name = ((p.get("nom") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 30) || "programme") + ".adf";
  S.model = model; saveSettings();
  if (typeof themeNow === "function") themeNow();
  /* Un essai remplace le précédent du même programme (la Bibliothèque ne se remplit pas d'essais) */
  let all = [];
  try { all = await DB.all(); } catch (e) {}
  for (const old of all.filter(r => r.trainer && r.name === name)) {
    if (mounted.df0 && mounted.df0.id === old.id) await ejectMedia("df0", true);
    await DB.del(old.id);
  }
  const rec = { id: newId(), kind: "adf", name, size: u8.length, blob: new Blob([u8]), crc: crc32u8(u8), added: Date.now(), used: Date.now(), trainer: true };
  await DB.put(rec);
  toast("68k Trainer : " + name + " est dans DF0:, l'" + (model === "a500" ? "Amiga 500" : "Amiga 1200") + " démarre et lance le programme.");
  await launchWith(rec);
}
