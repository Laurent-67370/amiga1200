/* =========================================================
   Export et import de la Bibliothèque : tout passer d'un appareil à l'autre
   =========================================================
   Un seul fichier .tar (format standard, lisible par 7-Zip ou tar) : bibliotheque.json décrit chaque élément
   (disquettes, disques durs, Kickstart, jeux WHDLoad, sauvegardes d'état et de jeux) et chaque contenu suit
   comme un fichier ordinaire, un disque dur en une seule image .hdf. Rien n'est chargé en entier en mémoire :
   l'export assemble des Blob, l'import lit le fichier par tranches. */
const LIB_FORMAT = "amiga1200-bibliotheque";
const TAR_BLOCK = 512;

function tarHeader(name, size, mtime) {
  const h = new Uint8Array(TAR_BLOCK), enc = new TextEncoder();
  const put = (off, len, s) => h.set(enc.encode(s).subarray(0, len), off);
  const oct = (off, len, v) => put(off, len, v.toString(8).padStart(len - 1, "0") + "\0");
  put(0, 100, name);
  oct(100, 8, 0o644); oct(108, 8, 0); oct(116, 8, 0);
  oct(124, 12, size); oct(136, 12, Math.floor(mtime / 1000));
  put(148, 8, "        "); h[156] = 0x30; /* fichier ordinaire */
  put(257, 6, "ustar\0"); put(263, 2, "00");
  let sum = 0; for (const b of h) sum += b;
  put(148, 8, sum.toString(8).padStart(6, "0") + "\0 ");
  return h;
}
/* Nom de fichier sûr dans l'archive (ASCII, moins de 100 octets) */
function tarName(i, name) {
  const slug = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 70);
  return "fichiers/" + String(i).padStart(4, "0") + "-" + slug;
}

async function exportLibrary() {
  if (running && S.autosave) await saveAllDisks(true); /* les disques en cours sont à jour dans l'export */
  const all = (await DB.all()).filter(r => r.kind !== "chunk" && r.kind !== "whddb"); /* la base WHDLoad se retélécharge */
  if (!all.length) { toast("La Bibliothèque est vide : rien à exporter.", true); return; }
  toast("Préparation de l'export…");
  const parts = [], records = [];
  let n = 0, total = 0;
  const addFile = (name, blob, mtime) => {
    parts.push(tarHeader(name, blob.size, mtime || Date.now()), blob);
    const pad = (TAR_BLOCK - blob.size % TAR_BLOCK) % TAR_BLOCK;
    if (pad) parts.push(new Uint8Array(pad));
    total += blob.size;
  };
  for (const r of all) {
    const m = Object.assign({}, r), when = r.updated || r.added;
    if (r.kind === "hdf" && r.chunks) {
      const path = tarName(n++, r.name); addFile(path, await recBlob(r), when);
      delete m.chunks; m.$hd = path;
    } else if (r.blob) {
      const path = tarName(n++, r.name || r.id); addFile(path, r.blob, when);
      m.blob = { $file: path };
    }
    if (Array.isArray(r.files)) m.files = r.files.map(f => {
      if (!f.blob) return f;
      const path = tarName(n++, f.path || "fichier"); addFile(path, f.blob, when);
      return Object.assign({}, f, { blob: { $file: path } });
    });
    records.push(m);
  }
  const manifest = new TextEncoder().encode(JSON.stringify({
    format: LIB_FORMAT, version: 1, exported: new Date().toISOString(),
    settings: { romId: S.romId, romId500: S.romId500, keyId: S.keyId }, records
  }, null, 1));
  const head = [tarHeader("bibliotheque.json", manifest.length, Date.now()), manifest, new Uint8Array((TAR_BLOCK - manifest.length % TAR_BLOCK) % TAR_BLOCK)];
  const tar = new Blob([...head, ...parts, new Uint8Array(TAR_BLOCK * 2)], { type: "application/x-tar" });
  const d = new Date(), day = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  download(tar, "Bibliotheque Amiga " + day + ".tar");
  toast("Export : " + records.length + " éléments, " + fmtSize(tar.size) + ". Ouvrez ce fichier sur l'autre appareil (Bibliothèque → Importer).");
}

/* Sommaire d'une archive tar : nom → position et taille du contenu */
async function readTarIndex(file) {
  const idx = new Map(), dec = new TextDecoder();
  const str = (u8, off, len) => { const s = u8.subarray(off, off + len), z = s.indexOf(0); return dec.decode(z >= 0 ? s.subarray(0, z) : s); };
  for (let off = 0; off + TAR_BLOCK <= file.size;) {
    const h = new Uint8Array(await file.slice(off, off + TAR_BLOCK).arrayBuffer());
    if (h.every(b => b === 0)) break;
    const prefix = str(h, 345, 155), name = (prefix ? prefix + "/" : "") + str(h, 0, 100);
    const size = parseInt(str(h, 124, 12).trim() || "0", 8);
    if (!Number.isFinite(size)) throw new Error("archive tar endommagée");
    if (h[156] === 0x30 || h[156] === 0) idx.set(name, { off: off + TAR_BLOCK, size });
    off += TAR_BLOCK + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
  }
  return idx;
}
async function isLibraryTar(file) {
  if (!/\.tar$/i.test(file.name)) return false;
  try { const h = new Uint8Array(await file.slice(0, 100).arrayBuffer()); return new TextDecoder().decode(h).startsWith("bibliotheque.json"); }
  catch (e) { return false; }
}

async function importLibrary(file) {
  if (running || starting) { toast("Éteignez d'abord l'Amiga pour importer une Bibliothèque.", true); return; }
  let idx, man;
  try {
    idx = await readTarIndex(file);
    const mf = idx.get("bibliotheque.json");
    if (!mf) throw new Error("bibliotheque.json absent");
    man = JSON.parse(await file.slice(mf.off, mf.off + mf.size).text());
    if (man.format !== LIB_FORMAT) throw new Error("ce n'est pas un export de la Bibliothèque");
  } catch (e) { toast(file.name + " : " + (e.message || e), true); return; }
  const slice = ref => { const e = ref && idx.get(ref.$file || ref); if (!e) throw new Error("contenu manquant dans l'archive"); return file.slice(e.off, e.off + e.size); };
  const recs = man.records || [];
  if (!confirm("Importer " + recs.length + " éléments (" + fmtSize(file.size) + ") exportés le "
    + new Date(man.exported).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    + " ?\nCe qui est déjà ici et plus récent est gardé ; le reste est ajouté ou remplacé.")) return;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  let added = 0, replaced = 0, kept = 0, done = 0;
  const t0 = Date.now();
  try {
    for (const m of recs) {
      done++;
      if (Date.now() - t0 > 1500) toast("Import : " + done + " / " + recs.length + "…");
      const old = await DB.get(m.id);
      if (old && (old.updated || old.added || 0) > (m.updated || m.added || 0)) { kept++; continue; }
      const r = Object.assign({}, m);
      if (r.blob && r.blob.$file) r.blob = slice(r.blob);
      if (Array.isArray(r.files)) r.files = r.files.map(f => f.blob && f.blob.$file ? Object.assign({}, f, { blob: slice(f.blob) }) : f);
      if (r.$hd) { const blob = slice(r.$hd); delete r.$hd; await storeChunks(r, blob); }
      /* Morceaux de l'ancien disque qui dépassent le nouveau */
      if (old && old.chunks) for (let i = r.chunks || 0; i < old.chunks; i++) await DB.del(chunkId(old, i));
      await DB.put(r);
      old ? replaced++ : added++;
    }
  } catch (e) {
    toast("Import interrompu après " + (added + replaced) + " éléments : " + (e && e.name === "QuotaExceededError" ? "plus de place pour ce site dans le navigateur" : e.message || e), true);
    return;
  }
  /* Kickstart choisis sur l'autre appareil, s'il n'y en a pas encore ici */
  const st = man.settings || {};
  if (S.romId === "aros" && st.romId && st.romId !== "aros" && await DB.get(st.romId)) S.romId = st.romId;
  if ((!S.romId500 || S.romId500 === "auto") && st.romId500 && st.romId500 !== "auto" && (st.romId500 === "aros" || await DB.get(st.romId500))) S.romId500 = st.romId500;
  if (!S.keyId && st.keyId && await DB.get(st.keyId)) S.keyId = st.keyId;
  saveSettings(); refreshIdleRom(); renderRomChoices();
  toast("Bibliothèque importée : " + added + " ajoutés, " + replaced + " remplacés" + (kept ? ", " + kept + " gardés (plus récents ici)" : "") + ".");
  if ($("#winLib").classList.contains("open")) renderLib();
}

/* Un export déposé ou ouvert comme n'importe quel fichier est reconnu */
{ const _imp = importFile;
  importFile = async (file, target) => (await isLibraryTar(file)) ? importLibrary(file) : _imp(file, target); }
$("#libExport").onclick = () => exportLibrary();
$("#libRestore").onclick = () => pickFile(".tar", f => importLibrary(f));
