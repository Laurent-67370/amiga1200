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
/* Mémoire que demande le .slave (en-tête WHDLoad) : ws_BaseMemSize (Chip) et ws_ExpMem (Fast ; négatif = facultative) */
function whdSlaveMem(u8, slave) {
  try {
    const e = readLha(u8).find(x => !x.dir && x.path === slave), d = e && e.data;
    if (!d) return null;
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    for (let i = 4; i + 36 <= d.length && i < 4096; i += 2) {
      if (String.fromCharCode(...d.subarray(i, i + 8)) !== "WHDLOADS") continue;
      const s = i - 4; /* moveq #-1,d0 / rts, puis « WHDLOADS » */
      return { chip: v.getUint32(s + 16), exp: v.getUint16(s + 12) >= 5 ? v.getInt32(s + 32) : 0 };
    }
  } catch (e) {}
  return null;
}
/* Mémoire Fast Zorro III (Mo) à ajouter quand celle de la carte trappe ne suffit pas à ExpMem : WHDLoad s'arrêterait
   sur « Can't allocate ExpMem ». La marge laisse de la place à WHDLoad et au préchargement des fichiers du jeu. */
async function whdZ3For(rec, fastMb) {
  const mem = whdSlaveMem(new Uint8Array(await rec.blob.arrayBuffer()), rec.slave);
  const need = mem ? Math.ceil(Math.abs(mem.exp) / 1048576) : 0;
  if (!need || need + 1 <= fastMb) return 0;
  return [16, 32, 64, 128, 256].find(z => z >= need + 8) || 256;
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

/* ---- WHDLoad avec le cœur WinUAE 6 (Amiberry) ----
   Même principe, mais c'est la page qui monte les volumes : WHDBoot: (WHDLoad, la startup-sequence, les Kickstart),
   les commandes et bibliothèques de démarrage d'Amiberry (boot-data.zip, monté tel quel en DH3:), le jeu (l'archive
   .lha montée en lecture seule comme Games:) et WHDSaves:, le même dossier de sauvegardes qu'avec PUAE. */
const AMB_CD32PAD = 513; /* RETRO_DEVICE_SUBCLASS(RETRO_DEVICE_JOYPAD, 1) : manette CD32 d'Amiberry */
let whdAssets = null;
function whdAssetsAmb() {
  if (!whdAssets) whdAssets = Promise.all(["whd/WHDLoad", "whd/boot-data.zip"].map(async f => {
    const r = await fetch(f);
    if (!r.ok) throw new Error("fichier " + f + " introuvable (" + r.status + ")");
    return new Uint8Array(await r.arrayBuffer());
  })).catch(e => { whdAssets = null; throw e; });
  return whdAssets;
}
async function whdBootAmb(m, rec, kicks, lines) {
  const [whdload, bootData] = await whdAssetsAmb();
  const u8 = new Uint8Array(await rec.blob.arrayBuffer());
  const slave = rec.slave || whdSlaveIn(u8);
  if (!slave) throw new Error("aucun fichier .slave dans cette archive");
  const base = safeName(rec.name.replace(/\.(lha|lzh)$/i, "")).replace(/["]/g, "_") || "Jeu";
  const game = "/media/whd/" + base + ".lha";
  m.writeFile(game, u8);
  m.writeFile("/whd/boot/C/WHDLoad", whdload);
  m.writeFile("/whd/boot-data.zip", bootData);
  for (const k of kicks) m.writeFile("/whd/boot/Devs/Kickstarts/" + k.file, k.data);
  m.M.FS.mkdirTree("/save/WHDSaves"); m.M.FS.mkdirTree("/whd/boot/Devs/Kickstarts");
  const dir = slave.includes("/") ? slave.slice(0, slave.lastIndexOf("/")) : "";
  const script = [
    "FAILAT 999",
    "DH3:C/Assign LIBS: DH3:Libs ADD",
    "DH3:C/Assign C: DH3:C ADD",
    /* Tables de relocalisation des Kickstart (.RTB), que WHDLoad cherche à côté des ROM */
    "DH3:C/Copy DH3:Devs/Kickstarts/#?.RTB DEVS:Kickstarts/ QUIET",
    `CD "Games:${dir}"`,
    `WHDLoad SLAVE="Games:${slave}" PRELOAD NOREQ NOWRITECACHE SPLASHDELAY=0 CONFIGDELAY=0 SAVEPATH=WHDSaves:${rec.whdArgs ? " " + rec.whdArgs : ""}`
  ];
  m.writeFile("/whd/boot/S/Startup-Sequence", new TextEncoder().encode(script.join("\n") + "\n"));
  /* Ni disquettes ni disques IDE ; la ROM de démarrage d'UAE est nécessaire aux volumes de fichiers */
  lines.splice(0, lines.length, ...lines.filter(l => !/^(boot_rom_uae|uaeboard|nr_floppies|floppy1type|floppy\d|hardfile2)=/.test(l)),
    "filesystem2=rw,DH0:WHDBoot:/whd/boot,10",
    "filesystem2=ro,DH3:DH3:/whd/boot-data.zip,-10",
    `filesystem2=ro,DH1:Games:"${game}",0`,
    "filesystem2=rw,DH2:WHDSaves:/save/WHDSaves,0");
}
