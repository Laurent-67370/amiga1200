/* =========================================================
   Scanner un dossier
   =========================================================
   Un dossier choisi (Amiga Forever, clé USB, dossier « Amiga »…) est parcouru avec ses sous-dossiers ; chaque fichier
   est reconnu par son contenu : Kickstart (par empreinte, ROM chiffrées d'Amiga Forever comprises), rom.key,
   disquettes, jeux WHDLoad, disques durs, CD (.iso, .cue et ses pistes), configurations .uae, archives de disquettes.
   Un bilan permet de choisir ce qui rejoint la Bibliothèque ; ce qui y est déjà est ignoré. L'import passe par les
   fonctions habituelles (importBytes, importWhd, importHdf, importCd), sans rien insérer dans les lecteurs. */
const SCAN_SKIP_DIR = /^(\.|__MACOSX$|node_modules$|\$RECYCLE\.BIN$|System Volume Information$)/i;
const SCAN_MAX = 20000;
const SCAN_CATS = [
  ["rom", "Kickstart et ROM"], ["key", "Clé rom.key (Amiga Forever)"], ["adf", "Disquettes"], ["whd", "Jeux WHDLoad"],
  ["zip", "Archives de disquettes (.zip, .lha)"], ["hdf", "Disques durs"], ["cd", "CD (CD32, CDTV)"], ["uae", "Configurations .uae"]
];
const SCAN_ORDER = ["key", "rom", "adf", "zip", "whd", "uae", "hdf", "cd"];
const scan = { busy: false, stop: false, dir: "", total: 0, items: [], key: null, errors: [], done: null };

/* Pendant l'import, les messages de chaque fichier se taisent : la fenêtre montre l'avancée, les erreurs sont gardées */
{ const _t = toast; toast = (msg, err) => { if (scan.busy) { if (err) scan.errors.push(String(msg)); return; } return _t(msg, err); }; }

const scanReadU8 = async f => new Uint8Array(await f.arrayBuffer());
/* ROM en clair : clé de la Bibliothèque, sinon un rom.key trouvé dans le dossier */
async function scanPlain(u8) {
  if (u8.length < 11 || u8ToStr(u8.subarray(0, 11)) !== "AMIROMTYPE1") return u8;
  const p = await plainRomBytes(u8); if (p) return p;
  if (!scan.key) return null;
  const out = u8.slice(11);
  for (let i = 0; i < out.length; i++) out[i] ^= scan.key[i % scan.key.length];
  return out;
}
/* Ce qu'est une ROM : libellé et usages (a1200, a500, cd32main, cd32ext, cd32, cdtvext) ; null si ce n'en est pas une */
async function scanRomInfo(name, u8) {
  const p = await scanPlain(u8);
  if (!p) return { label: name + " (chiffrée : il faut le fichier rom.key d'Amiga Forever)", tags: [] };
  /* AROS : déjà intégré à l'émulateur, il ressemble à un Kickstart 3.1.4 mais n'en est pas un */
  if (u8ToStr(p.subarray(0, 256)).includes("AROS")) return { label: "AROS, déjà intégré à l'émulateur", tags: [], aros: true };
  const role = await cd32Role(name, p);
  if (role) return { label: CD32_LABEL[role], tags: [role === "combined" ? "cd32" : "cd32" + role] };
  const q = undoubleRom(p), e = q && KICK_DB[crc32u8(q)], v = kickVersion(p);
  if (e) {
    if (e[2] === "cdtvext") return { label: e[0], tags: ["cdtvext"] };
    const m = e[1].split(" "), tags = [];
    if (m.includes("A1200")) tags.push("a1200");
    if (/v1\.3/.test(e[0])) tags.push("a500");
    return { label: e[0], tags };
  }
  if (v) return { label: "Kickstart " + (KICK_NAMES[v[0]] || v[0]) + " (" + v[0] + "." + v[1] + ")", tags: v[0] === 34 ? ["a500"] : v[0] >= 39 ? ["a1200"] : [] };
  return null;
}

/* ---- Fenêtre ---- */
function scanWin() {
  let w = $("#winScan"); if (w) return w;
  w = document.createElement("div"); w.className = "veil"; w.id = "winScan";
  w.setAttribute("role", "dialog"); w.setAttribute("aria-modal", "true"); w.setAttribute("aria-labelledby", "tScan");
  w.innerHTML = `<div class="win wb scan-win">
    <div class="titlebar"><button class="closebox" data-close aria-label="Fermer"></button><span class="t" id="tScan">Scanner un dossier</span><span class="stripes"></span></div>
    <div class="body" id="scanBody"></div>
    <div class="actions" id="scanActs"></div>
  </div>`;
  document.body.appendChild(w);
  w.addEventListener("click", e => { if (e.target === w || e.target.closest("[data-close]")) { scan.stop = true; closeWin(); } });
  return w;
}
const scanBody = () => $("#scanBody");
function scanActs(...btns) {
  const a = $("#scanActs"); a.innerHTML = "";
  const left = document.createElement("span"); left.className = "scan-left"; a.appendChild(left);
  for (const [txt, fn, primary] of btns) {
    const b = document.createElement("button"); b.type = "button"; b.className = "gad" + (primary ? " primary" : ""); b.textContent = txt;
    b.onclick = fn; a.appendChild(b);
  }
}
const scanEl = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
function scanProgress(title, line) {
  const b = scanBody(); let p = b.querySelector(".scan-prog");
  if (!p) { b.innerHTML = ""; p = scanEl("div", "scan-prog"); p.append(scanEl("b"), scanEl("span")); b.appendChild(p); scanActs(["Arrêter", () => { scan.stop = true; }]); }
  p.firstChild.textContent = title; p.lastChild.textContent = line || "";
}

/* Premier écran : ce que fait le scan, et le bouton qui choisit le dossier (geste de l'utilisateur exigé par le navigateur) */
function scanFolder() {
  if (scan.busy) { showWin("winScan"); return; }
  scanWin();
  const b = scanBody(); b.innerHTML = "";
  b.append(scanEl("p", null, "Choisissez un dossier (celui d'Amiga Forever, une clé USB, votre dossier « Amiga »…) : il est parcouru avec ses sous-dossiers, et chaque fichier est reconnu par son contenu."),
    scanEl("p", "hint", "Kickstart (ROM chiffrées d'Amiga Forever comprises, avec leur rom.key), disquettes (.adf, .adz, .dms, .ipf, .scp), jeux WHDLoad (.lha), disques durs (.hdf), CD (.iso, .cue et leurs pistes), configurations .uae et archives .zip. Un bilan s'affiche avant tout ajout ; rien n'est envoyé nulle part."));
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (ios) b.appendChild(scanEl("p", "hint", "Sur iPhone et iPad, Safari ne sait pas ouvrir un dossier : choisissez plutôt tous les fichiers à la fois."));
  scanActs(["Fermer", closeWin], [ios ? "Choisir des fichiers…" : "Choisir un dossier…", () => scanStart(ios), true]);
  showWin("winScan");
}

async function scanPick(ios) {
  if (!ios && window.showDirectoryPicker) {
    let dir;
    try { dir = await window.showDirectoryPicker({ id: "amiga-scan", mode: "read" }); }
    catch (e) { if (e && e.name !== "AbortError") toast("Dossier inaccessible : " + (e.message || e), true); return null; }
    const files = [];
    scan.busy = true; scan.stop = false;
    try { await scanWalk(dir, "", files, 0); } finally { scan.busy = false; }
    return { name: dir.name, files };
  }
  return new Promise(res => {
    const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true;
    if (!ios) inp.webkitdirectory = true;
    inp.onchange = () => {
      const all = [...inp.files].map(f => ({ file: f, path: f.webkitRelativePath || f.name }))
        .filter(x => !x.path.split("/").slice(0, -1).some(d => SCAN_SKIP_DIR.test(d)) && x.file.name[0] !== ".");
      res({ name: all.length && all[0].path.includes("/") ? all[0].path.split("/")[0] : "fichiers choisis", files: all.slice(0, SCAN_MAX) });
    };
    inp.addEventListener("cancel", () => res(null));
    inp.click();
  });
}
async function scanWalk(dir, path, out, depth) {
  if (depth > 12) return;
  for await (const [name, h] of dir.entries()) {
    if (scan.stop || out.length >= SCAN_MAX) return;
    if (h.kind === "directory") { if (!SCAN_SKIP_DIR.test(name)) await scanWalk(h, path + name + "/", out, depth + 1); }
    else if (name[0] !== ".") {
      try { out.push({ file: await h.getFile(), path: path + name }); } catch (e) {}
      if (out.length % 50 === 0) scanProgress("Recherche des fichiers…", out.length + " fichiers trouvés");
    }
  }
}

async function scanStart(ios) {
  if (ios === undefined) ios = scan.ios; else scan.ios = ios;
  const picked = await scanPick(ios);
  if (!picked) return;
  if (!picked.files.length) { toast("Aucun fichier dans ce dossier.", true); return; }
  showWin("winScan");
  scan.dir = picked.name; scan.total = picked.files.length; scan.stop = false; scan.key = null;
  scanProgress("Analyse de « " + scan.dir + " »…", "0 / " + scan.total);
  scan.busy = true;
  try { scan.items = await scanClassify(picked.files); }
  catch (e) { console.error(e); scan.items = []; toast("Analyse interrompue : " + (e.message || e), true); }
  finally { scan.busy = false; }
  await scanSummary();
}

/* ---- Reconnaissance ---- */
async function scanClassify(list) {
  const all = await DB.all();
  const crcs = new Set(all.filter(r => r.crc != null).map(r => r.crc));
  const names = new Set(all.filter(r => r.kind === "hdf" || r.kind === "cd").map(r => r.kind + "|" + r.name.toLowerCase()));
  const seen = new Set(), items = [];
  /* Pistes de CD : cherchées dans le dossier du .cue */
  const dirOf = p => p.slice(0, p.lastIndexOf("/") + 1);
  const byDir = new Map();
  for (const it of list) { const d = dirOf(it.path); if (!byDir.has(d)) byDir.set(d, []); byDir.get(d).push(it); }
  const tracks = new Set();
  /* rom.key d'abord : il déchiffre les ROM d'Amiga Forever du même dossier */
  const keyIt = list.find(it => /\.key$/i.test(it.file.name) && it.file.size < 65536);
  if (keyIt) try { scan.key = await scanReadU8(keyIt.file); } catch (e) {}
  for (const [i, it] of list.entries()) {
    if (scan.stop) break;
    if (i % 10 === 0) scanProgress("Analyse de « " + scan.dir + " »…", (i + 1) + " / " + list.length + " : " + it.path);
    const f = it.file, n = f.name.toLowerCase(), sz = f.size;
    const item = { kind: null, file: f, path: it.path, label: "", note: "", crc: null, dup: "", on: true };
    let u8 = null;
    try {
      if (n.endsWith(".key")) { if (sz < 65536) item.kind = "key"; }
      else if (/\.(adf|adz|dms|ipf|scp)$/.test(n) || /\.(adf|scp)\.gz$/.test(n)) { if (sz < 64 * 1048576) item.kind = "adf"; }
      else if (/\.(hdf|hdz)$/.test(n)) {
        item.kind = "hdf";
        if (sz > HD_MAX) { item.on = false; item.note = "trop gros pour être copié (" + fmtSize(sz) + ") : branchez-le avec « Sur place… » sous un disque dur"; }
        else if (names.has("hdf|" + n)) item.dup = "déjà dans la Bibliothèque";
      }
      else if (n.endsWith(".iso")) {
        item.kind = "cd"; item.parts = [f];
        if (sz > CD_MAX) { item.on = false; item.note = "image trop grosse (" + fmtSize(sz) + ")"; }
        else if (names.has("cd|" + n)) item.dup = "déjà dans la Bibliothèque";
      }
      else if (n.endsWith(".cue") && sz < 65536) {
        const text = await f.text(), wanted = cueFiles(text), pool = byDir.get(dirOf(it.path)) || [];
        const parts = wanted.map(w => (pool.find(x => x.file.name.toLowerCase() === w.toLowerCase()) || {}).file);
        if (wanted.length) {
          item.kind = "cd"; item.cue = text; item.parts = parts;
          parts.forEach(p => p && tracks.add(p));
          const miss = wanted.filter((w, k) => !parts[k]);
          if (miss.length) { item.on = false; item.note = "pistes absentes du dossier : " + miss.join(", "); }
          else if (parts.reduce((a, p) => a + p.size, 0) > CD_MAX) { item.on = false; item.note = "image trop grosse"; }
          else if (names.has("cd|" + n)) item.dup = "déjà dans la Bibliothèque";
        }
      }
      else if (n.endsWith(".uae") && sz < 1048576) {
        item.kind = "uae";
        const m = /^\s*config_description\s*=\s*(.+?)\s*$/im.exec(await f.text()), cname = (m ? m[1] : f.name.replace(/\.uae$/i, "")).slice(0, 60);
        item.label = cname;
        if (CFGS.some(c => c.name.toLowerCase() === cname.toLowerCase())) item.dup = "déjà dans les configurations";
      }
      else if (/\.(lha|lzh)$/.test(n) && sz < 256 * 1048576) {
        u8 = await scanReadU8(f);
        if (whdSlaveIn(u8)) item.kind = "whd";
        else {
          const inner = readLha(u8).filter(e => !e.dir && e.data && /\.(adf|adz|dms|hdf|hdz|zip|gz|rom|key)$/i.test(e.path));
          if (inner.length) { item.kind = "zip"; item.label = inner.length + " fichier" + (inner.length > 1 ? "s" : "") + " Amiga"; item.inner = inner.map(e => crc32u8(e.data)); }
        }
      }
      else if (/\.(zip|gz)$/.test(n) && sz < 128 * 1048576) {
        u8 = await scanReadU8(f);
        const inner = (await expandFile(f.name, u8)).filter(x => guessKind(x.name, x.data) || /\.(ipf|scp)$/i.test(x.name));
        if (inner.length) { item.kind = "zip"; item.label = inner.map(x => x.name).slice(0, 4).join(", ") + (inner.length > 4 ? "…" : ""); item.inner = inner.map(x => crc32u8(x.data)); }
      }
      else if ((/\.(rom|bin)$/.test(n) && sz <= 2 * 1048576 + 11) || [262144, 524288, 1048576, 262155, 524299, 1048587].includes(sz)) {
        u8 = await scanReadU8(f);
        const info = await scanRomInfo(f.name, u8);
        if (info) { item.kind = "rom"; item.label = info.label; item.tags = info.tags; if (info.aros) item.dup = "inutile"; }
        else if (/\.rom$/.test(n)) { item.kind = "rom"; item.label = "ROM non répertoriée"; item.tags = []; }
      }
    } catch (e) { item.kind = null; }
    if (!item.kind) { items.push(item); continue; }
    /* Doublons : même contenu (empreinte) dans la Bibliothèque ou plus haut dans le dossier */
    if (["rom", "key", "adf", "whd"].includes(item.kind) && sz < 64 * 1048576) {
      if (!u8) u8 = await scanReadU8(f);
      item.crc = crc32u8(u8);
      if (crcs.has(item.crc)) item.dup = "déjà dans la Bibliothèque";
      else if (seen.has(item.crc)) item.dup = "en double dans le dossier";
      seen.add(item.crc);
    }
    /* Archive : déjà là si tout ce qu'elle contient y est */
    if (item.inner) {
      if (item.inner.every(c => crcs.has(c))) item.dup = "contenu déjà dans la Bibliothèque";
      else if (item.inner.every(c => seen.has(c))) item.dup = "contenu en double dans le dossier";
      item.inner.forEach(c => seen.add(c));
    }
    if (item.dup) item.on = false;
    items.push(item);
  }
  /* Les pistes .bin d'un .cue ne comptent pas à part */
  return items.filter(x => !(x.kind === null && tracks.has(x.file)));
}

/* Usages couverts par les Kickstart de la Bibliothèque */
async function scanLibTags() {
  const tags = new Set();
  for (const r of (await DB.all()).filter(x => x.kind === "rom")) {
    try { const info = await scanRomInfo(r.name, new Uint8Array(await r.blob.arrayBuffer())); if (info) info.tags.forEach(t => tags.add(t)); } catch (e) {}
  }
  return tags;
}
function scanKickLine(tags) {
  const cd32 = tags.has("cd32") || (tags.has("cd32main") && tags.has("cd32ext"));
  const parts = [["Amiga 1200 (3.x)", tags.has("a1200")], ["Amiga 500 (1.3)", tags.has("a500")], ["CD32", cd32], ["CDTV (extension)", tags.has("cdtvext")]];
  return parts.map(([t, ok]) => (ok ? "✓ " : "✗ ") + t).join(" · ");
}

/* ---- Bilan ---- */
async function scanSummary() {
  const b = scanBody(); b.innerHTML = "";
  const found = scan.items.filter(x => x.kind), ignored = scan.items.length - found.length;
  b.appendChild(scanEl("p", "scan-head", "« " + scan.dir + " » : " + scan.total + " fichier" + (scan.total > 1 ? "s" : "") + ", " + found.length + " reconnu" + (found.length > 1 ? "s" : "")
    + (ignored ? " (" + ignored + " autre" + (ignored > 1 ? "s" : "") + " ignoré" + (ignored > 1 ? "s" : "") + ")" : "") + (scan.stop ? ". Analyse arrêtée avant la fin." : ".")));
  if (!found.length) {
    b.appendChild(scanEl("p", "hint", "Aucun fichier Amiga reconnu ici. Essayez un autre dossier, ou le dossier parent."));
    scanActs(["Fermer", closeWin], ["Choisir un autre dossier…", () => scanStart(), true]);
    return;
  }
  /* Kickstart : ce que la Bibliothèque aura après l'ajout */
  const tags = await scanLibTags();
  found.filter(x => x.kind === "rom" && x.on).forEach(x => (x.tags || []).forEach(t => tags.add(t)));
  const kl = scanEl("p", "scan-kicks"); kl.append(scanEl("b", null, "Kickstart après l'ajout : "), document.createTextNode(scanKickLine(tags)));
  b.appendChild(kl);
  if (found.some(x => x.kind === "whd" && x.on) && !tags.has("a1200"))
    b.appendChild(scanEl("p", "hint scan-warn", "Les jeux WHDLoad demandent votre Kickstart 3.1 de l'A1200 (AROS ne leur suffit pas) ; certains jeux A500 veulent aussi le 1.3."));
  for (const [kind, title] of SCAN_CATS) {
    const list = found.filter(x => x.kind === kind); if (!list.length) continue;
    const box = scanEl("details", "scan-cat"); box.open = kind === "rom" || list.length <= 6;
    const sum = scanEl("summary");
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.id = "scanCat-" + kind;
    const fresh = list.filter(x => !x.dup && !x.note);
    cb.checked = list.some(x => x.on); cb.disabled = !fresh.length;
    const dup = list.length - fresh.length;
    const lab = scanEl("label", null, title + " : " + fresh.length + (dup ? " (+" + dup + " déjà là ou non importable" + (dup > 1 ? "s" : "") + ")" : "")); lab.htmlFor = cb.id;
    sum.append(cb, lab); box.appendChild(sum);
    const ul = scanEl("ul", "scan-list");
    const rows = [];
    for (const x of list.slice(0, 300)) {
      const li = scanEl("li", x.dup || x.note ? "off" : "");
      const c = document.createElement("input"); c.type = "checkbox"; c.checked = x.on; c.disabled = !!(x.dup || x.note);
      c.onchange = () => { x.on = c.checked; cb.checked = list.some(y => y.on); scanCount(); };
      rows.push([c, x]);
      const t = scanEl("span", "scan-n", x.path); const d = scanEl("span", "scan-d", [x.label, x.dup, x.note].filter(Boolean).join(" · "));
      const l = document.createElement("label"); l.append(c, t, d); li.appendChild(l); ul.appendChild(li);
    }
    if (list.length > 300) ul.appendChild(scanEl("li", "off", "… et " + (list.length - 300) + " autres"));
    cb.onchange = () => { for (const [c, x] of rows) if (!c.disabled) { c.checked = cb.checked; x.on = cb.checked; } for (const x of list.slice(300)) if (!x.dup && !x.note) x.on = cb.checked; scanCount(); };
    box.appendChild(ul); b.appendChild(box);
  }
  b.appendChild(scanEl("p", "hint", "Les disques durs et les CD sont copiés dans le navigateur, ce qui peut prendre de la place ; décochez-les si besoin. Rien n'est inséré dans les lecteurs."));
  scanActs(["Autre dossier…", () => scanStart()], ["Fermer", closeWin], ["Ajouter", scanImport, true]);
  scanCount();
}
function scanCount() {
  const n = scan.items.filter(x => x.kind && x.on).length;
  const btn = [...$("#scanActs").querySelectorAll("button")].pop();
  if (btn && btn.classList.contains("primary")) { btn.textContent = n ? "Ajouter à la Bibliothèque (" + n + ")" : "Rien à ajouter"; btn.disabled = !n; }
}

/* ---- Import ---- */
async function scanImportOne(x) {
  const f = x.file;
  if (x.kind === "cd") return importCd(f.name, x.parts, x.cue || null);
  if (x.kind === "hdf") {
    if (/\.hdz$/i.test(f.name)) { const it = (await expandFile(f.name, await scanReadU8(f)))[0]; return it && importHdf(it.name, new Blob([it.data]), false); }
    return importHdf(f.name, f, false);
  }
  if (x.kind === "uae") {
    const p = await cfgParseUae(await f.text(), f.name);
    const c = { name: p.name, desc: p.desc, s: Object.assign(cfgSnapshot(), p.s), t: Date.now(), ...(p.d ? { d: p.d } : {}) };
    const old = CFGS.findIndex(y => y.name.toLowerCase() === c.name.toLowerCase());
    if (old >= 0) CFGS[old] = c; else CFGS.push(c);
    CFGS.sort((a, b) => a.name.localeCompare(b.name, "fr")); cfgStore();
    return c;
  }
  const u8 = await scanReadU8(f);
  if (x.kind === "whd") return importWhd(f.name, u8);
  if (x.kind === "key" || x.kind === "rom") return importBytes(f.name, u8, null, false, true);
  /* Disquettes et archives : décompressées, chaque fichier rangé sans être inséré */
  const inner = /\.(ipf|scp)$/i.test(f.name) ? [{ name: f.name, data: u8 }] : await expandFile(f.name, u8);
  for (const it of inner) if (guessKind(it.name, it.data) || /\.(ipf|scp)$/i.test(it.name)) await importBytes(it.name, it.data, null, false, true);
  return true;
}
async function scanImport() {
  const todo = scan.items.filter(x => x.kind && x.on).sort((a, b) => SCAN_ORDER.indexOf(a.kind) - SCAN_ORDER.indexOf(b.kind));
  if (!todo.length) return;
  scan.busy = true; scan.stop = false; scan.errors = [];
  const added = {};
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  for (const [i, x] of todo.entries()) {
    if (scan.stop) break;
    scanProgress("Ajout à la Bibliothèque…", (i + 1) + " / " + todo.length + " : " + x.path);
    try { const r = await scanImportOne(x); if (r) added[x.kind] = (added[x.kind] || 0) + 1; else if (r === undefined && x.kind !== "hdf" && x.kind !== "cd") added[x.kind] = (added[x.kind] || 0) + 1; }
    catch (e) { scan.errors.push(x.path + " : " + (e && e.message ? e.message : e)); }
  }
  scan.busy = false;
  /* Kickstart de l'A1200 : le meilleur trouvé, si l'émulateur était encore sur AROS */
  if (S.romId === "aros" || !(await DB.get(S.romId))) {
    let best = null, bestScore = -1;
    for (const r of (await DB.all()).filter(y => y.kind === "rom" && !y.cd32)) {
      const info = await scanRomInfo(r.name, new Uint8Array(await r.blob.arrayBuffer())); if (!info || !info.tags.includes("a1200")) continue;
      const score = /v3\.1 \(A1200\)/.test(info.label) ? 3 : /A1200/.test(info.label) ? 2 : 1;
      if (score > bestScore) { best = r; bestScore = score; }
    }
    if (best) { S.romId = best.id; saveSettings(); added.kick = best.label || best.name; }
  }
  if (typeof renderRomChoices === "function") renderRomChoices();
  if (typeof refreshIdleRom === "function") refreshIdleRom();
  if (typeof renderCfgs === "function") try { renderCfgs(); } catch (e) {}
  renderLauncherSoon();
  renderLib(); /* aussi quand la Bibliothèque est un panneau de la Configuration */
  scanDone(added, todo.length);
}
function scanDone(added, asked) {
  const b = scanBody(); b.innerHTML = "";
  const names = { rom: ["Kickstart ou ROM", "Kickstart ou ROM"], key: ["rom.key", "rom.key"], adf: ["disquette", "disquettes"], whd: ["jeu WHDLoad", "jeux WHDLoad"],
    zip: ["archive", "archives"], hdf: ["disque dur", "disques durs"], cd: ["CD", "CD"], uae: ["configuration", "configurations"] };
  const parts = SCAN_ORDER.filter(k => added[k]).map(k => added[k] + " " + names[k][added[k] > 1 ? 1 : 0]);
  b.appendChild(scanEl("p", "scan-head", parts.length ? "Ajouté à la Bibliothèque : " + parts.join(", ") + "." : "Rien n'a été ajouté."));
  if (added.kick) b.appendChild(scanEl("p", null, "Kickstart de l'Amiga 1200 choisi : " + added.kick + "."));
  if (scan.stop) b.appendChild(scanEl("p", "hint", "Ajout arrêté avant la fin."));
  if (scan.errors.length) {
    const d = scanEl("details", "scan-cat"); d.open = true;
    d.appendChild(scanEl("summary", null, scan.errors.length + " fichier" + (scan.errors.length > 1 ? "s" : "") + " non ajouté" + (scan.errors.length > 1 ? "s" : "")));
    const ul = scanEl("ul", "scan-list"); scan.errors.slice(0, 100).forEach(m => ul.appendChild(scanEl("li", null, m))); d.appendChild(ul); b.appendChild(d);
  }
  scanActs(["Autre dossier…", () => scanStart()], ["Bibliothèque", () => { closeWin(); $("#btnLib").click(); }], ["Fermer", closeWin, true]);
  toast(parts.length ? "Scan terminé : " + parts.join(", ") + "." : "Scan terminé : rien d'ajouté.");
}

/* ---- Accès : Bibliothèque, accueil ---- */
/* En tête de la Bibliothèque (fenêtre classique comme panneau de la Configuration, qui n'en montre pas les boutons du bas) */
{ const _rl = renderLib;
  renderLib = async (...a) => {
    const r = await _rl(...a), body = $("#libBody");
    if (body && !body.querySelector(".scan-bar")) {
      const bar = scanEl("div", "scan-bar"), btn = scanEl("button", "gad", "Scanner un dossier…");
      btn.type = "button"; btn.id = "libScan"; btn.onclick = scanFolder;
      bar.append(btn, scanEl("span", "hint", "Kickstart, disquettes, jeux WHDLoad, disques et CD d'un dossier, reconnus et ajoutés d'un coup."));
      body.prepend(bar);
    }
    return r;
  }; }
{ const body = $("#winHelp .body");
  if (body) body.insertAdjacentHTML("beforeend", `<h3>Scanner un dossier</h3>
      <p>Bibliothèque → <b>Scanner un dossier…</b> (ou le bouton de l'accueil) : choisissez un dossier, celui d'Amiga Forever, une clé USB ou votre dossier « Amiga ». Il est parcouru avec ses sous-dossiers et chaque fichier est reconnu par son contenu : Kickstart identifiés par leur empreinte (ROM chiffrées d'Amiga Forever comprises, avec le rom.key du dossier), disquettes, jeux WHDLoad, disques durs, CD (.iso, ou .cue avec ses pistes), configurations .uae et archives .zip. Un bilan montre ce qui a été trouvé, ce qui est déjà dans la Bibliothèque, et quels Kickstart manquent (A1200, A500, CD32, CDTV) ; vous cochez ce qui doit être ajouté. Si l'émulateur était sur AROS, le meilleur Kickstart 3.1 trouvé devient celui de l'A1200. Sur iPhone et iPad, Safari ne sait pas ouvrir un dossier : choisissez tous les fichiers d'un coup.</p>`); }
