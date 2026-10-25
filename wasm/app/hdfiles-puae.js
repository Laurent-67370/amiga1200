
/* =========================================================
   Copier des fichiers sur le disque dur (Amiga éteint) :
   jeux WHDLoad en .lha, archives .zip, dossiers, Kickstart pour WHDLoad
   ========================================================= */
let filesRec = null;      /* disque visé */
let filesPart = 0;        /* indice de la partition choisie */
let filesDest = "Jeux";   /* dernier dossier de destination */

/* Noms attendus par WHDLoad dans Devs:Kickstarts, d'après l'empreinte du Kickstart */
const WHD_KICKS = {
  0xc4f0f55f: ["kick34005.A500", "Kickstart 1.3 (34.005) A500"],
  0xc3bdb240: ["kick37175.A500", "Kickstart 2.04 (37.175) A500+"],
  0x6c9b07d2: ["kick39106.A1200", "Kickstart 3.0 (39.106) A1200"],
  0x1483a091: ["kick40068.A1200", "Kickstart 3.1 (40.068) A1200"]
};
/* ROM Amiga Forever : déchiffrée avec rom.key (OU exclusif répété) */
async function plainRom(rec) {
  const u8 = new Uint8Array(await rec.blob.arrayBuffer());
  if (u8.length < 11 || u8ToStr(u8.subarray(0, 11)) !== "AMIROMTYPE1") return u8;
  const k = S.keyId ? await DB.get(S.keyId) : null; if (!k) return null;
  const key = new Uint8Array(await k.blob.arrayBuffer()), out = u8.slice(11);
  for (let i = 0; i < out.length; i++) out[i] ^= key[i % key.length];
  return out;
}
/* ROM de 256 Ko enregistrée deux fois de suite (fichier de 512 Ko, courant pour le Kickstart 1.3) : la première moitié */
function undoubleRom(u8) {
  if (!u8 || u8.length !== 524288) return u8;
  for (let i = 0; i < 262144; i++) if (u8[i] !== u8[i + 262144]) return u8;
  return u8.subarray(0, 262144);
}
async function whdKickstarts() {
  const list = [];
  for (const r of (await DB.all()).filter(x => x.kind === "rom")) {
    const u8 = undoubleRom(await plainRom(r)); if (!u8) continue;
    const w = WHD_KICKS[crc32u8(u8)]; if (w && !list.some(x => x.file === w[0])) list.push({ file: w[0], label: w[1], data: u8 });
  }
  return list;
}

/* Disque entier en mémoire, et les morceaux de 8 Mo modifiés */
async function openHd(rec) {
  if (!rec.chunks) { await storeChunks(rec, rec.blob); await DB.put(rec); }
  const img = await recBytes(rec), dirtyChunks = new Set();
  const io = { block: n => img.subarray(n * 512, n * 512 + 512), touch: n => dirtyChunks.add(Math.floor(n * 512 / CHUNK)) };
  return { img, io, dirtyChunks, parts: listPartitions(io, Math.floor(img.length / 512)) };
}
/* Lecture seule sans charger tout le disque : les morceaux manquants sont lus à la demande, puis on recommence */
async function readHd(rec, fn) {
  const cache = new Map();
  const io = { block: n => { const i = Math.floor(n * 512 / CHUNK), c = cache.get(i); if (!c) throw { need: i }; const o = n * 512 - i * CHUNK; return c.subarray(o, o + 512); }, touch() {} };
  for (let guard = 0; guard < 400; guard++) {
    try { return fn(io); }
    catch (e) {
      if (!e || e.need === undefined) throw e;
      const c = await DB.get(chunkId(rec, e.need)); if (!c) throw new Error("morceau " + e.need + " manquant");
      cache.set(e.need, new Uint8Array(await c.blob.arrayBuffer()));
    }
  }
  throw new Error("disque trop fragmenté pour être lu");
}
async function saveHd(rec, hd) {
  for (const i of hd.dirtyChunks) await DB.put({ id: chunkId(rec, i), kind: "chunk", owner: rec.id, blob: new Blob([hd.img.slice(i * CHUNK, (i + 1) * CHUNK)]) });
  rec.updated = Date.now(); await DB.put(rec);
}

/* Contenu d'une disquette AmigaDOS (.adf, OFS ou FFS) : ses dossiers et fichiers, avec dates et commentaires ;
   null si ce n'est pas une disquette AmigaDOS (jeu à chargeur spécial) */
function readAdf(u8) {
  const BS = 512, n = Math.floor(u8.length / BS);
  if (n < 4 || u8[0] !== 0x44 || u8[1] !== 0x4f || u8[2] !== 0x53) return null;
  const ffs = (u8[3] & 1) === 1;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const L = (b, o) => dv.getUint32(b * BS + o), I = (b, o) => dv.getInt32(b * BS + o);
  const str = (o, max) => u8ToStr(u8.subarray(o + 1, o + 1 + Math.min(u8[o], max)));
  const name = b => str(b * BS + BS - 80, 30), comment = b => str(b * BS + BS - 184, 79);
  const date = b => new Date(Date.UTC(1978, 0, 1) + (L(b, BS - 92) * 1440 + L(b, BS - 88)) * 60000 + L(b, BS - 84) * 20);
  const ok = b => b > 1 && b < n;
  const root = Math.floor(n / 2);
  if (I(root, 0) !== 2 || I(root, BS - 4) !== 1) return null;
  /* Blocs de données : table de l'en-tête puis des blocs d'extension, du dernier au premier rang */
  const readFile = h => {
    const size = L(h, BS - 188), data = new Uint8Array(size);
    let pos = 0, blk = h, guard = 0;
    while (ok(blk) && pos < size && guard++ < 4000) {
      const cnt = Math.min(L(blk, 8), BS / 4 - 56);
      for (let i = 0; i < cnt && pos < size; i++) {
        const d = L(blk, BS - 204 - i * 4);
        if (!ok(d)) throw new Error("bloc de données hors de la disquette");
        const len = ffs ? Math.min(BS, size - pos) : Math.min(L(d, 12), BS - 24, size - pos);
        data.set(u8.subarray(d * BS + (ffs ? 0 : 24), d * BS + (ffs ? 0 : 24) + len), pos); pos += len;
      }
      blk = L(blk, BS - 8);
    }
    if (pos < size) throw new Error("fichier incomplet (disquette abîmée ?)");
    return data;
  };
  const items = [], seen = new Set();
  const walk = (dir, path, depth) => {
    if (depth > 20) return;
    for (let i = 0; i < BS / 4 - 56; i++) {
      let b = L(dir, 24 + i * 4);
      while (ok(b) && !seen.has(b) && I(b, 0) === 2) {
        seen.add(b);
        const st = I(b, BS - 4), p = (path ? path + "/" : "") + name(b);
        if (st === 2) { items.push({ path: p, dir: true, date: date(b) }); walk(b, p, depth + 1); }
        else if (st === -3) {
          try { items.push({ path: p, data: readFile(b), date: date(b), comment: comment(b) }); }
          catch (e) { items.push({ path: p, error: e.message || String(e) }); }
        }
        b = L(b, BS - 16);
      }
    }
  };
  walk(root, "", 0);
  return { volume: name(root), items };
}

/* Préparer un disque pour WHDLoad : WHDLoad dans C:, ses fichiers .RTB et les Kickstart de la Bibliothèque dans
   Devs:Kickstarts (noms attendus par WHDLoad) */
async function whdPrepItems() {
  const [whdload, bootData] = await whdAssetsAmb();
  const items = [{ path: "C/WHDLoad", data: whdload }];
  for (const e of await unzip(bootData)) if (/^Devs\/Kickstarts\/[^/]+\.RTB$/i.test(e.path || e.name)) items.push({ path: e.path || e.name, data: e.data });
  const ks = await whdKickstarts();
  for (const k of ks) items.push({ path: "Devs/Kickstarts/" + k.file, data: k.data });
  return { items, kicks: ks };
}

function cleanPath(p) {
  return p.replace(/\\/g, "/").split("/").filter(s => s && s !== "." && s !== "..").map(amigaName);
}
/* Fichiers choisis → éléments { path, data, date, comment } (archives décompressées si demandé) */
async function collectItems(files, unpack) {
  const items = [], problems = [];
  for (const f of files) {
    const rel = f.webkitRelativePath || f.name;
    const u8 = new Uint8Array(await f.arrayBuffer());
    const date = new Date(f.lastModified || Date.now());
    try {
      if (unpack && /\.(lha|lzh)$/i.test(f.name)) {
        for (const e of readLha(u8)) {
          if (e.error) { problems.push(e.path + " : " + e.error); continue; }
          items.push({ path: e.path, dir: e.dir, data: e.data, date: e.date, comment: e.comment });
        }
      } else if (unpack && /\.(adf|adz)$|\.adf\.gz$/i.test(f.name)) {
        /* Disquette : son contenu, dans un dossier à son nom (avec l'icône de la disquette, en tiroir) */
        const data = /\.adf$/i.test(f.name) ? u8 : ((await expandFile(f.name, u8))[0] || {}).data;
        const r = data && readAdf(data);
        if (!r) { problems.push(f.name + " : pas de fichiers AmigaDOS sur cette disquette (jeu à chargeur spécial) ; utilisez-la directement dans un lecteur"); continue; }
        const folder = amigaName(f.name.replace(/\.(adf\.gz|adf|adz)$/i, ""));
        items.push({ path: folder, dir: true, date });
        let icon = null;
        for (const e of r.items) {
          if (e.error) problems.push(f.name + " / " + e.path + " : " + e.error);
          else if (/^disk\.info$/i.test(e.path)) icon = e.data;
          else items.push({ ...e, path: folder + "/" + e.path });
        }
        if (icon && icon.length > 48) { const ic = icon.slice(); ic[48] = 2; /* do_Type : WBDISK → WBDRAWER */ items.push({ path: folder + ".info", data: ic, date }); }
      } else if (unpack && /\.dms$/i.test(f.name)) {
        problems.push(f.name + " : les disquettes .dms ne s'ouvrent pas ici ; convertissez-la en .adf (ou utilisez-la dans un lecteur)");
      } else if (unpack && /\.zip$/i.test(f.name)) {
        for (const e of await unzip(u8)) items.push({ path: e.path || e.name, data: e.data, date });
      } else items.push({ path: rel, data: u8, date });
    } catch (e) { problems.push(f.name + " : " + (e.message || e)); }
  }
  return { items, problems };
}

async function copyToHd(items, dest, problems = []) {
  if (running || starting) { toast("Éteignez d'abord l'Amiga : le disque ne doit pas servir pendant la copie.", true); return; }
  const rec = await DB.get(filesRec.id); if (!rec) return;
  const log = $("#filesLog"); log.textContent = "Ouverture du disque…";
  try {
    const hd = await openHd(rec), part = hd.parts[filesPart];
    if (!part || !part.ok) throw new Error("partition non modifiable" + (part && part.reason ? " : " + part.reason : ""));
    const vol = new AmigaVolume(hd.io, part);
    const base = cleanPath(dest);
    /* Place nécessaire : chaque fichier, plus un bloc par dossier */
    const dirs = new Set();
    let need = 0;
    for (const it of items) {
      const segs = cleanPath(it.path); if (!segs.length) continue;
      for (let i = 1; i <= (it.dir ? segs.length : segs.length - 1); i++) dirs.add(segs.slice(0, i).join("/"));
      if (!it.dir) need += vol.blocksFor(it.data.length);
    }
    need += dirs.size + base.length;
    const free = vol.freeCount();
    if (need > free) throw new Error("pas assez de place : " + fmtSize(need * 512) + " nécessaires, " + fmtSize(free * 512) + " libres");
    let n = 0, bytes = 0;
    for (const it of items) {
      const segs = cleanPath(it.path); if (!segs.length) continue;
      if (it.dir) { vol.dir([...base, ...segs].join("/")); continue; }
      const d = vol.dir([...base, ...segs.slice(0, -1)].join("/"));
      vol.writeFile(d, segs[segs.length - 1], it.data, it.date || new Date(), it.comment || "");
      n++; bytes += it.data.length;
    }
    vol.finish();
    log.textContent = "Enregistrement…";
    await saveHd(rec, hd);
    const where = part.name + ":" + base.join("/");
    log.textContent = n + " fichier" + (n > 1 ? "s" : "") + " copié" + (n > 1 ? "s" : "") + " dans " + where + " (" + fmtSize(bytes) + ")." + (problems.length ? "\nIgnorés :\n" + problems.join("\n") : "");
    toast(n + " fichier" + (n > 1 ? "s" : "") + " copié" + (n > 1 ? "s" : "") + " dans " + where);
    renderFiles(true);
  } catch (e) {
    log.textContent = "Copie impossible : " + (e.message || e) + ". Le disque n'a pas été modifié.";
    toast("Copie impossible : " + (e.message || e), true);
  }
}

async function renderFiles(keepLog) {
  const body = $("#filesBody"), rec = filesRec && await DB.get(filesRec.id);
  const oldLog = keepLog && $("#filesLog") ? $("#filesLog").textContent : "";
  body.innerHTML = "";
  if (!rec) { body.textContent = "Branchez ou choisissez d'abord un disque dur."; return; }
  const intro = document.createElement("p");
  intro.innerHTML = "Disque <b></b>. Les fichiers sont copiés directement sur le disque, comme depuis le Workbench.";
  intro.querySelector("b").textContent = rec.name; body.appendChild(intro);
  if (running || starting) {
    const w = document.createElement("p"); w.className = "files-warn";
    w.textContent = "L'Amiga est allumé : éteignez-le d'abord, le disque ne doit pas servir pendant la copie.";
    body.appendChild(w);
  }
  let hd;
  try {
    if (!rec.chunks) { await storeChunks(rec, rec.blob); await DB.put(rec); }
    hd = await readHd(rec, io => {
      const parts = listPartitions(io, Math.floor(rec.size / 512));
      for (const p of parts) if (p.ok) p.free = new AmigaVolume(io, p).freeCount();
      return { parts };
    });
  } catch (e) { body.appendChild(Object.assign(document.createElement("p"), { textContent: "Disque illisible : " + (e.message || e) })); return; }
  const h = (t) => { const x = document.createElement("h3"); x.textContent = t; body.appendChild(x); };
  h("Partition");
  const list = document.createElement("div"); list.className = "lib-list"; body.appendChild(list);
  if (!hd.parts[filesPart] || !hd.parts[filesPart].ok) filesPart = Math.max(0, hd.parts.findIndex(p => p.ok));
  hd.parts.forEach((p, i) => {
    const row = document.createElement("label"); row.className = "lib-row";
    row.innerHTML = '<input type="radio" name="fpart"><span class="n"></span><span class="s"></span>';
    const inp = row.querySelector("input"); inp.checked = i === filesPart; inp.disabled = !p.ok; inp.onchange = () => { filesPart = i; };
    row.querySelector(".n").textContent = p.name + ":" + (p.volume ? " « " + p.volume + " »" : "") + " — " + p.fs + (p.ok ? "" : " : " + p.reason);
    row.querySelector(".s").textContent = p.ok ? fmtSize(p.free * 512) + " libres" : "";
    list.appendChild(row);
  });
  hd = null;
  h("Copier");
  const dest = document.createElement("div"); dest.className = "opt";
  dest.innerHTML = '<label>Dans le dossier <input type="text" id="filesDest" size="18" spellcheck="false" style="font:inherit;padding:3px 6px"></label><label><input type="checkbox" id="filesUnpack" checked> Décompresser les archives .lha et .zip, ouvrir les disquettes .adf</label>';
  body.appendChild(dest);
  $("#filesDest").value = filesDest; $("#filesDest").oninput = e => { filesDest = e.target.value; };
  const acts = document.createElement("div"); acts.className = "opt";
  const b = (t, fn) => { const x = document.createElement("button"); x.className = "gad"; x.textContent = t; x.onclick = fn; x.disabled = running || starting; acts.appendChild(x); };
  b("Fichiers ou archives…", () => $("#filesPick").click());
  b("Un dossier…", () => $("#dirPick").click());
  body.appendChild(acts);
  const hint = document.createElement("p"); hint.className = "hint";
  hint.textContent = "Un jeu WHDLoad (.lha) arrive dans son propre dossier, avec son icône. Une disquette .adf est ouverte : ses fichiers vont dans un dossier à son nom. Laissez le champ vide pour copier à la racine du disque. Un fichier du même nom est remplacé.";
  body.appendChild(hint);
  h("Préparer pour WHDLoad");
  const ks = await whdKickstarts();
  const kp = document.createElement("p");
  kp.textContent = "Copie WHDLoad dans C: et, dans Devs:Kickstarts, ses fichiers .RTB et vos Kickstart de la Bibliothèque"
    + (ks.length ? " (" + ks.map(k => k.label).join(", ") + ")." : ". Aucun Kickstart reconnu dans la Bibliothèque pour l'instant (1.3 A500, 2.04, 3.0 ou 3.1 A1200) : ajoutez-le d'abord.")
    + " Ensuite, un jeu WHDLoad copié sur ce disque se lance d'un double-clic sur son icône, depuis le Workbench.";
  body.appendChild(kp);
  const ka = document.createElement("div"); ka.className = "opt"; body.appendChild(ka);
  const kb = document.createElement("button"); kb.className = "gad"; kb.textContent = "Préparer le disque pour WHDLoad"; kb.disabled = running || starting;
  kb.onclick = async () => {
    try { const w = await whdPrepItems(); await copyToHd(w.items, ""); }
    catch (e) { $("#filesLog").textContent = "Préparation impossible : " + (e.message || e); }
  };
  ka.appendChild(kb);
  const log = document.createElement("pre"); log.id = "filesLog"; log.className = "files-log"; log.textContent = oldLog; body.appendChild(log);
}
async function openFiles(rec) {
  if (!rec) { toast("Branchez d'abord un disque dur sur DH0:, ou créez-en un avec « Nouveau ».", true); return; }
  filesRec = rec; filesPart = 0;
  showWin("winFiles"); $("#filesBody").textContent = "Lecture du disque…";
  await renderFiles();
}
for (const id of ["#filesPick", "#dirPick"]) {
  $(id).onchange = async e => {
    const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
    $("#filesLog").textContent = "Lecture de " + files.length + " fichier" + (files.length > 1 ? "s" : "") + "…";
    const { items, problems } = await collectItems(files, $("#filesUnpack").checked);
    if (!items.length) { $("#filesLog").textContent = "Rien à copier." + (problems.length ? "\n" + problems.join("\n") : ""); return; }
    await copyToHd(items, $("#filesDest").value, problems);
  };
}
for (const t of HD_TAGS) $('#drive-' + t + ' [data-act="files"]').onclick = async () => openFiles(mounted[t] && await DB.get(mounted[t].id));
{ const _sm = setMounted; setMounted = (t, r) => { _sm(t, r); if (isHd(t)) $('#drive-' + t + ' [data-act="files"]').disabled = !r; }; }
