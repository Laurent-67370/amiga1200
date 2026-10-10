async function mountMedia(tag, rec) {
  if (tag === "dh0") {
    setMounted("dh0", rec);
    if (running) toast("Disque dur prêt : il sera branché au prochain allumage.");
    else toast(rec.name + " branché sur DH0:");
    return;
  }
  if (running) {
    if (mounted[tag]) await ejectMedia(tag, true);
    const path = "/media/" + tag + "/" + safeName(rec.name);
    machine.writeFile(path, new Uint8Array(await rec.blob.arrayBuffer()));
    fsPath[tag] = path; seen[tag] = machine.fileMtime(path);
    machine.driveInsert(DRIVE_NUM[tag], path);
  }
  setMounted(tag, rec);
  toast(rec.name + " insérée dans " + tag.toUpperCase() + ":");
}

async function ejectMedia(tag, silent) {
  if (!mounted[tag]) return;
  if (tag === "dh0") {
    if (running) { toast("Éteignez l'Amiga avant de retirer le disque dur.", true); return; }
    setMounted("dh0", null); return;
  }
  if (running && fsPath[tag]) {
    if (S.autosave) await saveDisk(tag, true, true);
    machine.driveEject(DRIVE_NUM[tag]);
    const old = fsPath[tag]; fsPath[tag] = null;
    setTimeout(() => machine && machine.removeFile(old), 500); /* le cœur relâche le fichier à la trame suivante */
  }
  if (!silent) toast(mounted[tag].name + " éjectée");
  setMounted(tag, null);
}

/* ---- Écritures de l'Amiga : on surveille la date de modification des fichiers du cœur ---- */
const dirty = { df0: false, df1: false, dh0: false };
const dirtySince = { df0: 0, df1: 0, dh0: 0 };     /* première écriture non enregistrée */
const seen = { df0: 0, df1: 0, dh0: 0 };       /* date du fichier lors du dernier enregistrement */
const lastActivity = { df0: 0, df1: 0, dh0: 0 }; /* dernier allumage de la LED du lecteur */
const savedAt = { df0: null, df1: null, dh0: null };
const BASE_LABEL = { df0: "lecteur interne", df1: "lecteur externe", dh0: "IDE interne 2,5\"" };
function driveLabel(tag) {
  if (dirty[tag]) return "modifié, enregistrement…";
  if (savedAt[tag]) return "enregistré à " + savedAt[tag].toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return BASE_LABEL[tag];
}
function refreshDriveLabel(tag) { const el = $("#trk-" + tag); if (el) el.textContent = driveLabel(tag); }
function checkDirty() {
  if (!running) return;
  machine.flush(); /* les dernières écritures du cœur passent dans les fichiers */
  for (const t of ["df0", "df1", "dh0"]) {
    if (!fsPath[t]) continue;
    const m = machine.fileMtime(fsPath[t]);
    if (m && m !== seen[t] && !dirty[t]) { dirty[t] = true; dirtySince[t] = Date.now(); refreshDriveLabel(t); }
  }
}

/* Écrit le contenu courant du média dans la bibliothèque si l'Amiga l'a modifié */
let saving = false;
async function saveDisk(tag, quiet, force) {
  checkDirty();
  const m = mounted[tag]; if (!m || !running || !fsPath[tag] || (!dirty[tag] && !force)) return false;
  const mtime = machine.fileMtime(fsPath[tag]);
  if (mtime === seen[tag]) { dirty[tag] = false; refreshDriveLabel(tag); return false; }
  const rec = await DB.get(m.id); if (!rec) return false;
  if (!/\.(adf|hdf)$/i.test(rec.name)) { dirty[tag] = false; seen[tag] = mtime; return false; } /* DMS, ADF étendus : lecture seule */
  const data = machine.readFile(fsPath[tag]);
  rec.blob = new Blob([data]); rec.size = data.length; rec.crc = tag === "dh0" ? undefined : crc32u8(data); rec.updated = Date.now();
  await DB.put(rec);
  seen[tag] = mtime; dirty[tag] = false;
  savedAt[tag] = new Date(); refreshDriveLabel(tag);
  if (!quiet) toast(rec.name + " enregistrée");
  return true;
}
async function saveAllDisks(quiet) {
  if (saving) return; saving = true;
  let n = 0;
  try { for (const t of ["df0", "df1", "dh0"]) if (await saveDisk(t, true)) n++; }
  finally { saving = false; }
  if (n && quiet) toast(n === 1 ? "1 disque modifié enregistré" : n + " disques modifiés enregistrés");
}
/* Enregistrement automatique : dès que le lecteur est au repos depuis 3 secondes,
   ou au plus tard 20 secondes après la première écriture si le lecteur ne s'arrête pas */
setInterval(async () => {
  if (!running || !S.autosave || saving) return;
  checkDirty();
  const now = Date.now();
  const ready = ["df0", "df1", "dh0"].filter(t => dirty[t] && (now - lastActivity[t] > 3000 || now - dirtySince[t] > 20000));
  if (!ready.length) return;
  saving = true;
  try { for (const t of ready) await saveDisk(t, true); } finally { saving = false; }
}, 2000);
/* Onglet masqué ou fermé : on enregistre tout de suite ce qui est en attente */
function flushNow() { if (running && S.autosave) { checkDirty(); if (Object.values(dirty).some(Boolean)) saveAllDisks(false); } }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushNow(); });
window.addEventListener("pagehide", flushNow);

async function downloadMedia(tag) {
  const m = mounted[tag]; if (!m) return;
  let data = running && fsPath[tag] ? machine.readFile(fsPath[tag]) : null;
  if (!data) { const rec = await DB.get(m.id); data = new Uint8Array(await rec.blob.arrayBuffer()); }
  download(data, m.name);
}

/* Disquette vierge, formatée FFS comme par la commande Format du Workbench */
async function blankFloppy(tag) {
  const all = await DB.all();
  let i = 1; while (all.some(r => r.name === "Vierge " + i + ".adf")) i++;
  const u8 = makeBlankAdf("Vierge " + i, true);
  const rec = { id: newId(), kind: "adf", name: "Vierge " + i + ".adf", size: u8.length, blob: new Blob([u8]), crc: crc32u8(u8), added: Date.now() };
  await DB.put(rec);
  await mountMedia(tag, rec);
}

/* Disque dur vierge */
async function blankHd(mb) {
  const size = mb * 1048576;
  const all = await DB.all();
  let i = 1; while (all.some(r => r.name === "Disque " + mb + " Mo" + (i > 1 ? " " + i : "") + ".hdf")) i++;
  const name = "Disque " + mb + " Mo" + (i > 1 ? " " + i : "") + ".hdf";
  /* Partitionné (RDB) et formaté en FFS, prêt à recevoir le Workbench */
  const rec = { id: newId(), kind: "hdf", name, size, blob: new Blob([makeHardDisk(mb, "Travail")]), crc: undefined, added: Date.now() };
  await DB.put(rec);
  if (running) { toast(name + " créé : il sera branché au prochain allumage."); setMounted("dh0", rec); }
  else { setMounted("dh0", rec); toast(name + " créé et branché sur DH0:"); }
}

