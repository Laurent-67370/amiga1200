/* =========================================================
   Jeux WHDLoad en un geste : une archive .lha, et on joue
   =========================================================
   Le cœur PUAE sait lancer une archive WHDLoad sans Workbench : il monte l'archive en lecture seule
   comme DH0:, démarre sur un petit volume WHDLoad: (WHDLoad, quelques commandes, une startup-sequence
   qui trouve le .slave et le lance) et range les sauvegardes du jeu dans WHDSaves:. La page fournit
   l'archive, les Kickstart de la Bibliothèque sous les noms attendus par WHDLoad, et garde WHDSaves:
   d'une partie à l'autre. */
const ICON_WHD = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="34" width="36" height="8" rx="2" fill="#3b4a63"/><path d="M21 34l1.5-20h3L27 34z" fill="#2a2f38"/><circle cx="24" cy="12" r="6.5" fill="#d23c3c"/><circle cx="22" cy="10" r="2" fill="#f08080"/><circle cx="35" cy="34" r="3.2" fill="#d23c3c"/></svg>';
const WHD_SAVES_ID = "whdsaves";
let whdGame = null;      /* jeu WHDLoad de la session en cours (enregistrement de la Bibliothèque) */
let whdSavesSig = "";    /* état de WHDSaves: lors du dernier enregistrement */

/* Une archive LhA est un jeu WHDLoad si elle contient un .slave */
function whdSlaveIn(u8) {
  try { const e = readLha(u8, true).find(x => !x.dir && /\.slave$/i.test(x.path)); return e ? e.path : null; }
  catch (e) { return null; }
}
async function importWhd(name, u8) {
  const all = await DB.all(), crc = crc32u8(u8);
  const same = all.find(r => r.kind === "whd" && r.crc === crc && r.size === u8.length);
  if (same) { toast(same.name + " est déjà dans la Bibliothèque."); return same; }
  const rec = { id: newId(), kind: "whd", name, size: u8.length, blob: new Blob([u8]), crc, slave: whdSlaveIn(u8), added: Date.now() };
  await DB.put(rec);
  toast(name.replace(/\.(lha|lzh)$/i, "") + " ajouté aux jeux WHDLoad : une touche sur sa vignette pour jouer.");
  if ($("#winLib").classList.contains("open")) renderLib();
  return rec;
}
/* Les archives .lha qui contiennent un jeu WHDLoad deviennent des jeux ; les autres gardent leur traitement (disquettes) */
{ const _imp = importFile;
  importFile = async (file, target) => {
    if (/\.(lha|lzh)$/i.test(file.name) && file.size < 256 * 1048576) {
      const u8 = new Uint8Array(await file.arrayBuffer());
      if (whdSlaveIn(u8)) return importWhd(file.name, u8);
    }
    return _imp(file, target);
  }; }

/* Lancer un jeu : les disquettes sortent du lecteur (une disquette amorçable passerait devant), on allume */
async function launchWhd(rec) {
  if (running || starting) return;
  /* WHDLoad s'appuie sur l'affichage du vrai Kickstart : avec AROS il s'arrête (« Couldn't find VCL instruction ») */
  if (S.romId === "aros" || !(await DB.get(S.romId))) {
    toast("WHDLoad a besoin d'un vrai Kickstart : AROS ne lui suffit pas. Importez votre ROM Kickstart 3.1 de l'A1200 (bouton « Importer le mien… » de l'accueil), puis touchez à nouveau le jeu.", true);
    return;
  }
  for (const t of ["df0", "df1"]) if (mounted[t]) await ejectMedia(t, true);
  whdGame = rec;
  rec.used = Date.now(); await DB.put(rec);
  powerOn();
}

/* Kickstart pour WHDLoad : celui de l'A1200, plus tous ceux de la Bibliothèque que WHDLoad sait utiliser
   (les jeux A500 demandent kick34005.A500, les jeux AGA kick40068.A1200) */
async function whdPrepare(m) {
  const kicks = await whdKickstarts();
  for (const k of kicks) m.writeFile("/save/WHDLoad/Devs/Kickstarts/" + k.file, k.data);
  /* Sauvegardes des jeux, d'une partie à l'autre */
  const rec = await DB.get(WHD_SAVES_ID);
  for (const f of (rec && rec.files) || []) m.writeFile("/save/WHDSaves/" + f.path, new Uint8Array(await f.blob.arrayBuffer()));
  whdSavesSig = rec ? rec.sig : "";
  return kicks;
}
/* Fichiers de WHDSaves: dans le système de fichiers du cœur */
function whdSavesList() {
  const FS = machine.M.FS, out = [];
  const walk = (dir, rel) => {
    let names = []; try { names = FS.readdir(dir); } catch (e) { return; }
    for (const n of names) {
      if (n === "." || n === "..") continue;
      const p = dir + "/" + n, st = FS.stat(p), r = rel ? rel + "/" + n : n;
      if (FS.isDir(st.mode)) walk(p, r); else out.push({ path: r, full: p, size: st.size, mtime: +st.mtime });
    }
  };
  walk("/save/WHDSaves", "");
  return out;
}
async function saveWhdSaves() {
  if (!machine || !whdGame) return;
  machine.flush();
  const list = whdSavesList();
  const sig = list.map(f => f.path + ":" + f.size + ":" + f.mtime).sort().join("|");
  if (sig === whdSavesSig) return;
  const files = list.map(f => ({ path: f.path, blob: new Blob([machine.M.FS.readFile(f.full)]) }));
  await DB.put({ id: WHD_SAVES_ID, kind: "whdsaves", name: "WHDSaves", files, sig, size: files.reduce((a, f) => a + f.blob.size, 0), added: Date.now() });
  whdSavesSig = sig;
}
setInterval(() => { if (running && whdGame) saveWhdSaves(); }, 5000);
window.addEventListener("pagehide", () => { if (running && whdGame) saveWhdSaves(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && running && whdGame) saveWhdSaves(); });
/* À l'extinction : sauvegardes enregistrées, et le prochain allumage repart sans le jeu */
{ const _off = powerOff; powerOff = async () => { if (running && whdGame) await saveWhdSaves(); await _off(); whdGame = null; }; }
