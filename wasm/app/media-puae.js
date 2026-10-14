/* ---- Disques durs rangés par morceaux de 8 Mo : un disque de 2 Go ne passe jamais en entier par la mémoire
        pour être enregistré, seuls les morceaux que l'Amiga a modifiés sont réécrits ---- */
const CHUNK = 8 * 1048576;
/* Limite de taille : 2 Go sur ordinateur (au-delà, les positions dans le fichier dépassent ce que le cœur 32 bits gère),
   512 Mo sur téléphone et tablette (mémoire) */
const HD_MAX = matchMedia("(pointer: coarse)").matches ? 512 * 1048576 : 2048 * 1048576;
const chunkId = (rec, i) => rec.id + "#" + i;
async function storeChunks(rec, blob, only, progress) {
  const n = Math.ceil(blob.size / CHUNK);
  for (let i = 0; i < n; i++) {
    if (only && !only.has(i)) continue;
    if (progress && i % 4 === 0) progress(i / n);
    await DB.put({ id: chunkId(rec, i), kind: "chunk", owner: rec.id, blob: blob.slice(i * CHUNK, Math.min(blob.size, (i + 1) * CHUNK)) });
  }
  rec.chunks = n; rec.size = blob.size; delete rec.blob;
}
/** Contenu d'un disque sous forme de Blob (sans le charger en mémoire) */
async function recBlob(rec) {
  if (!rec.chunks) return rec.blob;
  const parts = [];
  for (let i = 0; i < rec.chunks; i++) { const c = await DB.get(chunkId(rec, i)); if (!c) throw new Error("morceau " + i + " de " + rec.name + " manquant"); parts.push(c.blob); }
  return new Blob(parts);
}
/** Contenu d'un disque en mémoire (pour le cœur) */
async function recBytes(rec) {
  if (!rec.chunks) return new Uint8Array(await rec.blob.arrayBuffer());
  const out = new Uint8Array(rec.size);
  for (let i = 0; i < rec.chunks; i++) {
    const c = await DB.get(chunkId(rec, i)); if (!c) throw new Error("morceau " + i + " de " + rec.name + " manquant");
    out.set(new Uint8Array(await c.blob.arrayBuffer()), i * CHUNK);
  }
  return out;
}
/* Supprimer un disque emporte ses morceaux */
{ const _del = DB.del.bind(DB); /* la méthode d'origine a besoin de son « this » */
  DB.del = async id => {
    const rec = await DB.get(id);
    if (rec && rec.chunks) for (let i = 0; i < rec.chunks; i++) await _del(chunkId(rec, i));
    return _del(id);
  }; }
/* Morceaux du disque dur touchés par l'Amiga depuis le dernier enregistrement */
const hdDirty = Object.fromEntries(HD_TAGS.map(t => [t, new Set()]));
function hdWrite(tag, pos, len) { if (len > 0) for (let i = Math.floor(pos / CHUNK), e = Math.floor((pos + len - 1) / CHUNK); i <= e; i++) hdDirty[tag].add(i); }

/* ---- Import d'un disque dur : lu directement depuis le fichier, sans tout charger ;
        une image de partition seule (sans RDB) reçoit une table de partitions pour démarrer comme un vrai disque ---- */
async function importHdf(name, blob, mount) {
  const head = new Uint8Array(await blob.slice(0, 16 * 512).arrayBuffer());
  const info = inspectHdf(head);
  let note = "";
  if (!info.rdb) {
    if (info.dosType == null) { toast(name + " : ni table de partitions (RDB) ni partition AmigaDOS reconnue au début du disque.", true); return; }
    if (!info.fs || !/^(OFS|FFS)/.test(info.fs)) {
      toast(name + " : partition " + info.fs + " sans table de partitions. Seules les partitions FFS/OFS peuvent être complétées ; créez l'image comme « disque dur » (RDB) dans WinUAE.", true); return;
    }
    if (blob.size % 512) { toast(name + " : taille qui n'est pas un multiple de 512 octets.", true); return; }
    const n = blob.size / 512;
    /* Blocs réservés : ceux pour lesquels on trouve le bloc racine à sa place (2 presque toujours) */
    let reserved = 2;
    for (const rsv of [2, 1, 3, 4, 0]) {
      const at = rootCandidate(n, rsv) * 512;
      if (isRootBlock(new Uint8Array(await blob.slice(at, at + 512).arrayBuffer()))) { reserved = rsv; break; }
    }
    blob = new Blob([rdbHeaderFor(n, info.dosType, reserved), blob]);
    note = " (partition " + info.fs + " complétée d'une table de partitions)";
    if (!name.toLowerCase().endsWith(".hdf")) name += ".hdf";
  }
  if (blob.size > HD_MAX) { toast(name + " : disque trop gros (" + fmtSize(blob.size) + ", " + fmtSize(HD_MAX) + " au maximum ici).", true); return; }
  toast("Import de " + name + " (" + fmtSize(blob.size) + ")…");
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  const rec = { id: newId(), kind: "hdf", name, added: Date.now() };
  const t0 = Date.now();
  try { await storeChunks(rec, blob, null, f => { if (Date.now() - t0 > 1500) toast("Import de " + name + " : " + Math.round(f * 100) + " %"); }); await DB.put(rec); }
  catch (e) {
    for (let i = 0; i < Math.ceil(blob.size / CHUNK); i++) try { await DB.del(chunkId(rec, i)); } catch (x) {}
    toast(name + " : enregistrement impossible (" + (e && e.name === "QuotaExceededError" ? "plus de place pour ce site dans le navigateur" : e.message || e) + ").", true); return;
  }
  if (mount) await mountMedia(isHd(mount) ? mount : "dh0", rec);
  toast(name + " ajouté à la Bibliothèque" + note + ".");
  return rec;
}

async function mountMedia(tag, rec) {
  if (isHd(tag)) {
    /* Un même disque ne se branche qu'à un endroit : il quitte son ancienne unité */
    for (const t of HD_TAGS) if (t !== tag && mounted[t] && mounted[t].id === rec.id) setMounted(t, null);
    setMounted(tag, rec);
    if (running) toast("Disque dur prêt : il sera branché au prochain allumage.");
    else toast(rec.name + " branché sur " + tag.toUpperCase() + ":");
    return;
  }
  /* DF2:, DF3: : le lecteur n'existe que si l'Amiga a été allumé avec (quatre lecteurs) */
  if (running && DRIVE_NUM[tag] >= (E._floppies || 2)) {
    setMounted(tag, rec);
    toast(rec.name + " placée dans " + tag.toUpperCase() + ": ; ce lecteur sera branché au prochain allumage.");
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
  if (isHd(tag)) {
    if (running) { toast("Éteignez l'Amiga avant de retirer le disque dur.", true); return; }
    setMounted(tag, null); return;
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
const DRIVE_TAGS = [...FD_TAGS, ...HD_TAGS];
const perDrive = v => Object.fromEntries(DRIVE_TAGS.map(t => [t, v]));
const dirty = perDrive(false);
const dirtySince = perDrive(0);     /* première écriture non enregistrée */
const seen = perDrive(0);           /* date du fichier lors du dernier enregistrement */
const lastActivity = perDrive(0);   /* dernier allumage de la LED du lecteur */
const savedAt = perDrive(null);
const BASE_LABEL = { df0: "lecteur interne", df1: "lecteur externe", df2: "lecteur externe", df3: "lecteur externe", dh0: "IDE interne 2,5\"", dh1: "IDE, esclave", dh2: "disque UAE", dh3: "disque UAE" };
function driveLabel(tag) {
  if (dirty[tag]) return "modifié, enregistrement…";
  if (savedAt[tag]) return "enregistré à " + savedAt[tag].toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return BASE_LABEL[tag];
}
function refreshDriveLabel(tag) { const el = $("#trk-" + tag); if (el) el.textContent = driveLabel(tag); }
function checkDirty() {
  if (!running) return;
  machine.flush(); /* les dernières écritures du cœur passent dans les fichiers */
  for (const t of DRIVE_TAGS) {
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
  if (isHd(tag)) {
    /* Seuls les morceaux modifiés sont copiés (tous d'un coup, pour un disque cohérent), puis réécrits */
    machine.flush();
    const all = !rec.chunks, n = Math.ceil(rec.size / CHUNK);
    const list = all ? [...Array(n).keys()] : [...hdDirty[tag]]; hdDirty[tag].clear();
    const parts = new Map(list.map(i => [i, machine.readRange(fsPath[tag], i * CHUNK, CHUNK)]));
    if (all) await storeChunks(rec, new Blob(list.map(i => parts.get(i))));
    else for (const [i, d] of parts) await DB.put({ id: chunkId(rec, i), kind: "chunk", owner: rec.id, blob: new Blob([d]) });
    rec.crc = undefined; rec.updated = Date.now();
    await DB.put(rec);
  } else {
    const data = machine.readFile(fsPath[tag]);
    rec.blob = new Blob([data]); rec.size = data.length; rec.crc = crc32u8(data); rec.updated = Date.now();
    await DB.put(rec);
  }
  seen[tag] = mtime; dirty[tag] = false;
  savedAt[tag] = new Date(); refreshDriveLabel(tag);
  if (!quiet) toast(rec.name + " enregistrée");
  return true;
}
async function saveAllDisks(quiet) {
  if (saving) return; saving = true;
  let n = 0;
  try { for (const t of DRIVE_TAGS) if (await saveDisk(t, true)) n++; }
  finally { saving = false; }
  if (n && quiet) toast(n === 1 ? "1 disque modifié enregistré" : n + " disques modifiés enregistrés");
}
/* Enregistrement automatique : dès que le lecteur est au repos depuis 3 secondes,
   ou au plus tard 20 secondes après la première écriture si le lecteur ne s'arrête pas */
setInterval(async () => {
  if (!running || !S.autosave || saving) return;
  checkDirty();
  const now = Date.now();
  const ready = DRIVE_TAGS.filter(t => dirty[t] && (now - lastActivity[t] > 3000 || now - dirtySince[t] > 20000));
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
  if (isHd(tag)) {
    /* Disque dur : on enregistre ce qui est en attente puis on télécharge la copie de la Bibliothèque */
    if (running && fsPath[tag]) await saveDisk(tag, true, true);
    const rec = await DB.get(m.id); download(await recBlob(rec), m.name); return;
  }
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

/* Disque dur vierge, pour l'unité choisie (sa partition porte le même nom : DH1: sur DH1…) */
let hdTarget = "dh0";
async function blankHd(mb, tag = hdTarget) {
  const size = mb * 1048576;
  const all = await DB.all();
  let i = 1; while (all.some(r => r.name === "Disque " + mb + " Mo" + (i > 1 ? " " + i : "") + ".hdf")) i++;
  const name = "Disque " + mb + " Mo" + (i > 1 ? " " + i : "") + ".hdf";
  /* Partitionné (RDB) et formaté en FFS, prêt à recevoir le Workbench */
  const rec = { id: newId(), kind: "hdf", name, crc: undefined, added: Date.now() };
  const unit = HD_TAGS.indexOf(tag);
  await storeChunks(rec, new Blob([makeHardDisk(mb, unit > 0 ? "Travail " + unit : "Travail", new Date(), tag.toUpperCase(), -unit)]));
  await DB.put(rec);
  setMounted(tag, rec);
  toast(name + (running ? " créé : il sera branché au prochain allumage." : " créé et branché sur " + tag.toUpperCase() + ":"));
}

