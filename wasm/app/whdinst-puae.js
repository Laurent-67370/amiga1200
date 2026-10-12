/* =========================================================
   Exécutables Amiga et installations WHDLoad
   =========================================================
   1. Un programme Amiga seul (fichier exécutable, comme une intro ou une démo) est mis sur une disquette de
      démarrage, qui le lance : le programme et une S:Startup-Sequence qui l'appelle.
   2. Un paquet d'installation WHDLoad (le .slave et le script Install, sans les données du jeu) se complète avec
      les disquettes originales : la page lit le script Install, comme le ferait l'Installer d'AmigaOS, et en tire
      ce qu'il faut — disques entiers (DIC : Disk.1, Disk.2…), fichiers copiés depuis la disquette (Files), ou un
      fichier unique (SingleFile). Elle les ajoute à l'archive, qui devient un jeu prêt à lancer. Les
      installations RawDIC et Patcher (formats de pistes particuliers) se font dans l'Amiga émulé : la page démarre
      sur un petit volume Inst: avec les outils du paquet utilisateur de WHDLoad (whd/WHDLoad_usr.lha, distribué
      tel quel) et lance la commande que le script Install aurait lancée, puis récupère les fichiers produits. */

/* ---- Lecture des fichiers d'une disquette (OFS/FFS, sans écriture) ---- */
function adfFiles(u8) {
  const BS = 512, nb = Math.floor(u8.length / BS);
  if (nb < 1760 || u8[0] !== 0x44 || u8[1] !== 0x4f || u8[2] !== 0x53) return null; /* « DOS » */
  const ffs = (u8[3] & 1) === 1;
  const b32 = (blk, o) => { const p = blk * BS + o; return ((u8[p] << 24) | (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3]) >>> 0; };
  const s32 = (blk, o) => b32(blk, o) | 0;
  const name = blk => { const p = blk * BS + 432, n = Math.min(u8[p], 30); let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(u8[p + 1 + i]); return s; };
  const root = nb / 2;
  if (b32(root, 0) !== 2 || s32(root, BS - 4) !== 1) return null;
  const out = [], seen = new Set();
  const readFile = hdr => {
    const size = b32(hdr, BS - 188), data = new Uint8Array(size);
    let pos = 0, blk = hdr, guard = 0;
    while (blk && pos < size && guard++ < 4000) {
      const n = b32(blk, 8); /* blocs de données de ce bloc d'en-tête, rangés de la fin vers le début */
      for (let i = 0; i < n && pos < size; i++) {
        const d = b32(blk, BS - 204 - i * 4); if (!d || d >= nb) { pos = size; break; }
        if (ffs) { const len = Math.min(BS, size - pos); data.set(u8.subarray(d * BS, d * BS + len), pos); pos += len; }
        else { const len = Math.min(b32(d, 12), BS - 24, size - pos); data.set(u8.subarray(d * BS + 24, d * BS + 24 + len), pos); pos += len; }
      }
      blk = b32(blk, BS - 8); /* bloc d'extension */
    }
    return data;
  };
  const walk = (dir, prefix) => {
    for (let i = 0; i < 72; i++) {
      let k = b32(dir, 24 + i * 4), guard = 0;
      while (k && k < nb && !seen.has(k) && guard++ < 1000) {
        seen.add(k);
        const sec = s32(k, BS - 4), path = prefix + name(k);
        if (sec === 2) { out.push({ path, dir: true }); walk(k, path + "/"); }
        else if (sec === -3) out.push({ path, data: readFile(k) });
        k = b32(k, BS - 16); /* suivant dans la même case de la table de hachage */
      }
    }
  };
  walk(root, "");
  return { volume: name(root), files: out };
}

/* ---- Disquette de démarrage avec des fichiers (et une Startup-Sequence) ---- */
function adfWith(label, files) {
  const adf = makeBlankAdf(label, true);
  const io = { block: n => adf.subarray(n * 512, n * 512 + 512), touch() {} };
  const part = listPartitions(io, 1760)[0];
  if (!part || !part.ok) throw new Error("disquette vierge illisible");
  const vol = new AmigaVolume(io, part);
  let need = 0; for (const f of files) need += vol.blocksFor(f.data.length) + 1;
  if (need > vol.freeCount()) throw new Error("trop gros pour une disquette (880 Ko)");
  for (const f of files) {
    const segs = f.path.split("/"), d = vol.dir(segs.slice(0, -1).join("/"));
    vol.writeFile(d, segs[segs.length - 1], f.data, new Date());
  }
  vol.finish();
  /* Amorce standard d'AmigaDOS : trouve dos.library et lui passe la main (lea dos(pc),a1 ; FindResident…) */
  adf.set([0x43, 0xfa, 0x00, 0x18, 0x4e, 0xae, 0xff, 0xa0, 0x4a, 0x80, 0x67, 0x0a, 0x20, 0x40, 0x20, 0x68, 0x00, 0x16, 0x70, 0x00,
    0x4e, 0x75, 0x70, 0xff, 0x4e, 0x75, ...new TextEncoder().encode("dos.library"), 0], 12);
  const dv = new DataView(adf.buffer); dv.setUint32(4, 0);
  let sum = 0; for (let i = 0; i < 1024; i += 4) { sum += dv.getUint32(i); if (sum > 0xffffffff) sum = (sum % 4294967296) + 1; }
  dv.setUint32(4, (~sum) >>> 0);
  return adf;
}
const isHunkExe = u8 => u8.length > 32 && u8[0] === 0 && u8[1] === 0 && u8[2] === 3 && u8[3] === 0xf3;

/* ---- Archive LhA sans compression (-lh0-, en-têtes de niveau 0), lisible par les deux cœurs ---- */
function crc16lha(u8) {
  let c = 0;
  for (let i = 0; i < u8.length; i++) { c ^= u8[i]; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xa001 : c >>> 1; }
  return c;
}
function lhaWrite(entries) {
  const parts = [], enc = s => Uint8Array.from(s, c => { const x = c.charCodeAt(0); return x < 256 ? x : 0x3f; });
  for (const e of entries) {
    if (e.dir || !e.data) continue;
    const name = enc(e.path).subarray(0, 230), d = e.date instanceof Date ? e.date : new Date();
    const t = ((Math.max(1980, d.getFullYear()) - 1980) << 25) | ((d.getMonth() + 1) << 21) | (d.getDate() << 16) | (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const h = new Uint8Array(24 + name.length), dv = new DataView(h.buffer);
    h[0] = 22 + name.length; h.set(enc("-lh0-"), 2);
    dv.setUint32(7, e.data.length, true); dv.setUint32(11, e.data.length, true); dv.setUint32(15, t >>> 0, true);
    h[19] = 0x20; h[20] = 0; h[21] = name.length; h.set(name, 22);
    dv.setUint16(22 + name.length, crc16lha(e.data), true);
    let s = 0; for (let i = 2; i < h.length; i++) s = (s + h[i]) & 255; h[1] = s;
    parts.push(h, e.data);
  }
  parts.push(new Uint8Array([0]));
  const total = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(total);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/* ---- Script Install (langage de l'Installer d'AmigaOS) : ce dont l'installation a besoin ---- */
function instParse(src) {
  const toks = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ";") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "(" || c === ")") { toks.push(c); i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') {
      let s = ""; i++;
      while (i < src.length && src[i] !== '"') { if (src[i] === "\\" && i + 1 < src.length) { const n = src[++i]; s += n === "n" ? "\n" : n === "t" ? "\t" : n; } else s += src[i]; i++; }
      i++; toks.push({ str: s }); continue;
    }
    let a = ""; while (i < src.length && !/[\s()";]/.test(src[i])) a += src[i++];
    toks.push(a);
  }
  let p = 0;
  const read = () => {
    const t = toks[p++];
    if (t === "(") { const l = []; while (p < toks.length && toks[p] !== ")") l.push(read()); p++; return l; }
    return t;
  };
  const prog = []; while (p < toks.length) prog.push(read());
  return prog;
}
const PICKED = "\u0001fichier choisi";
function instPlan(src, appName) {
  const prog = instParse(src), V = { "@app-name": appName, "#dest": "" };
  const val = x => {
    if (x && typeof x === "object" && "str" in x) return x.str;
    if (typeof x === "string") return x in V ? V[x] : /^-?\d+$/.test(x) ? +x : x;
    if (Array.isArray(x)) {
      if (x.length && x[0] && typeof x[0] === "object" && "str" in x[0]) { /* ("%s" args…) : mise en forme */
        let k = 1; return x[0].str.replace(/%(l?d|s)/g, () => String(val(x[k++])));
      }
      if (x[0] === "tackon") { const a = String(val(x[1])), b = String(val(x[2])); return a ? (/[:/]$/.test(a) ? a + b : a + "/" + b) : b; }
      if (x[0] === "cat") return x.slice(1).map(val).join("");
    }
    return "";
  };
  for (const s of prog) if (Array.isArray(s) && s[0] === "set") V[s[1]] = val(s[2]);
  V["#dest"] = ""; /* la destination du script (choisie par l'utilisateur sur l'Amiga) est ici le dossier du jeu */
  const proc = prog.find(s => Array.isArray(s) && s[0] === "procedure" && s[1] === "P_MakeImages");
  if (!proc) return null;
  const sel = proc.slice(2).find(s => Array.isArray(s) && s[0] === "select");
  const version = +V["#version"] || 0;
  const branch = sel ? sel[2 + version] : null;
  const plan = { version, subdir: V["#sub-dir"] || "", multi: !!V["#multiple-versions"], ops: [] };
  const run = list => {
    for (const s of list || []) {
      if (!Array.isArray(s)) continue;
      const op = s[0];
      if (op === "set") V[s[1]] = val(s[2]);
      else if (op === "P_CreateImage") plan.ops.push({ type: "dic", num: +V["#CI_disknum"] || 1, len: +V["#CI_disklen"] || 901120, skip: String(V["#CI_skiptrk"] || "") });
      else if (op === "P_AskDisk") plan.ops.push({ type: "disk", volume: String(V["#AD_disk"] || "") });
      else if (op === "P_SelectFile") {
        plan.ops.push({ type: "pick", name: String(V["#SF_default_filename"] || ""), newname: String(V["#SF_new_filename"] || V["#SF_default_filename"] || "") });
        V["#SF_filename"] = PICKED; /* le fichier choisi : la copie qui suit est celle du fichier lui-même */
      }
      else if (op === "copyfiles") {
        const o = { type: "copy", source: "", dest: "", pattern: null, newname: null, all: false, choices: null };
        for (const a of s.slice(1)) {
          if (!Array.isArray(a)) continue;
          if (a[0] === "source") o.source = String(val(a[1]));
          else if (a[0] === "dest") o.dest = String(val(a[1]));
          else if (a[0] === "pattern") o.pattern = String(val(a[1]));
          else if (a[0] === "newname") o.newname = String(val(a[1]));
          else if (a[0] === "all") o.all = true;
          else if (a[0] === "choices") o.choices = a.slice(1).map(val).map(String);
        }
        const pk = [...plan.ops].reverse().find(x => x.type === "pick");
        if (o.source === PICKED) { if (pk && o.newname) pk.newname = o.newname; }
        /* les fichiers du paquet lui-même (slave d'imagerie, icônes…) ne viennent pas de la disquette */
        else if (o.source && !/\.(islave|imager)$/i.test(o.source)) plan.ops.push(o);
      } else if (op === "if" || op === "while") { /* conditions : on suit la branche « vraie » des copies, sans évaluer */
        for (const b of s.slice(2)) if (Array.isArray(b)) run(Array.isArray(b[0]) ? b : [b]);
      } else if (Array.isArray(op)) run(s);
    }
  };
  if (branch) run(Array.isArray(branch[0]) || branch.length === 0 ? branch : [branch]);
  plan.lastFile = String(V["#last-file"] || "");
  return plan;
}
/* Motif AmigaDOS → expression régulière (#? = *, ? = un caractère, (a|b), [a-z], ~ = sauf) */
function amigaPattern(p) {
  let r = "", i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === "#") { i++; const n = p[i]; if (n === "(") { let d = 0, j = i; for (; j < p.length; j++) { if (p[j] === "(") d++; else if (p[j] === ")" && --d === 0) break; } r += "(?:" + amigaPattern(p.slice(i + 1, j)) + ")*"; i = j + 1; } else { r += (n === "?" ? "." : n.replace(/[.*+^${}()|[\]\\]/g, "\\$&")) + "*"; i++; } continue; }
    if (c === "?") r += ".";
    else if (c === "(") r += "(?:";
    else if (c === ")" || c === "|") r += c;
    else if (c === "[") { const j = p.indexOf("]", i); r += j > i ? p.slice(i, j + 1) : "\\["; i = j > i ? j : i; }
    else if (c === "~") { let j = i + 1, d = 0; if (p[j] === "(") { for (; j < p.length; j++) { if (p[j] === "(") d++; else if (p[j] === ")" && --d === 0) break; } r += "(?!(?:" + amigaPattern(p.slice(i + 2, j)) + ")$).*"; i = j; } else r += "~"; }
    else if (c === "'") { i++; r += (p[i] || "").replace(/[.*+^${}()|[\]\\]/g, "\\$&"); }
    else r += c.replace(/[.*+^${}()|[\]\\]/g, "\\$&");
    i++;
  }
  return r;
}
const amigaMatch = (pat, name) => { try { return new RegExp("^(?:" + amigaPattern(pat) + ")$", "i").test(name); } catch (e) { return false; } };

/* Paquet d'installation : script Install présent et données du jeu absentes */
function whdInstallInfo(u8, appName) {
  let ents; try { ents = readLha(u8); } catch (e) { return null; }
  const slave = ents.find(e => !e.dir && /\.slave$/i.test(e.path)); if (!slave) return null;
  const inst = ents.find(e => !e.dir && /(^|\/)Install$/i.test(e.path) && e.data && /\(set\s+#version/.test(new TextDecoder("latin1").decode(e.data)));
  if (!inst) return null;
  const plan = instPlan(new TextDecoder("latin1").decode(inst.data), appName); if (!plan) return null;
  const sdir = slave.path.includes("/") ? slave.path.slice(0, slave.path.lastIndexOf("/") + 1) : "";
  const ddir = sdir + (plan.subdir ? plan.subdir.replace(/\/?$/, "/") : "");
  const has = n => ents.some(e => !e.dir && e.path.toLowerCase() === (ddir + n).toLowerCase());
  /* déjà installé ? (Disk.1, le fichier unique, ou des fichiers en plus de ceux d'un paquet) */
  let needed;
  if (plan.version === 2) needed = !has("Disk.1");
  else if (plan.version === 5) { const pk = plan.ops.find(o => o.type === "pick"); needed = pk ? !has(pk.newname) : false; }
  else if (plan.version === 3 || plan.version === 4) {
    const pkg = /\.(slave|info|newicon|colicon|magicwb|romicon|inf|islave|imager|s|asm|i|txt|guide|readme)$|(^|\/)(install|readme|manual|source|history|hints?|solution)$/i;
    needed = !ents.some(e => !e.dir && e.path.startsWith(sdir) && !pkg.test(e.path) && !/\/source\//i.test(e.path));
  } else needed = true;
  return needed ? { plan, ddir, ents, slave: slave.path } : null;
}

/* Les fichiers de la ou des disquettes originales → les fichiers du jeu installé */
function whdInstallFiles(info, disks, loose) {
  const { plan, ddir } = info, add = [], miss = [];
  const vols = disks.map(d => d.fs).filter(Boolean);
  const findVol = name => vols.find(v => v.volume.toLowerCase() === String(name).toLowerCase()) || (vols.length === 1 ? vols[0] : null);
  const join = (a, b) => (a ? a.replace(/\/?$/, "/") : "") + b;
  let curVol = null;
  if (plan.version === 2) {
    const imgs = plan.ops.filter(o => o.type === "dic");
    if (!imgs.length) imgs.push({ num: 1, len: 901120, skip: "" });
    for (const im of imgs) {
      const d = disks[im.num - 1];
      if (!d) { miss.push("disquette " + im.num); continue; }
      const data = new Uint8Array(im.len); data.set(d.u8.subarray(0, Math.min(im.len, d.u8.length)));
      add.push({ path: ddir + "Disk." + im.num, data });
    }
    return { add, miss };
  }
  for (const o of plan.ops) {
    if (o.type === "disk") { curVol = findVol(o.volume); if (!curVol) miss.push("disquette « " + o.volume + " »"); continue; }
    if (o.type === "pick") {
      let f = null;
      for (const v of vols) { f = v.files.find(x => !x.dir && x.path.split("/").pop().toLowerCase() === o.name.toLowerCase()); if (f) break; }
      if (!f && loose.length === 1) f = { data: loose[0].u8 };
      if (!f && loose.length) f = loose.map(l => ({ data: l.u8, name: l.name })).find(l => l.name.toLowerCase() === o.name.toLowerCase());
      if (f) add.push({ path: ddir + o.newname, data: f.data }); else miss.push("le fichier « " + o.name + " »");
      continue;
    }
    if (o.type !== "copy") continue;
    const m = /^([^:]*):(.*)$/.exec(o.source);
    const v = m ? (m[1] ? findVol(m[1]) : curVol) || curVol : curVol || (vols.length === 1 ? vols[0] : null);
    if (!v) { miss.push("disquette « " + (m ? m[1] : o.source) + " »"); continue; }
    const base = (m ? m[2] : o.source).replace(/^\/+|\/+$/g, "");
    const inBase = v.files.filter(x => base ? x.path.toLowerCase().startsWith(base.toLowerCase() + "/") : true);
    const rel = x => base ? x.path.slice(base.length + 1) : x.path;
    const single = v.files.find(x => !x.dir && x.path.toLowerCase() === base.toLowerCase());
    let picked;
    if (single && !o.pattern && !o.all && !o.choices) picked = [{ src: single, to: o.newname || base.split("/").pop() }];
    else {
      const top = inBase.filter(x => !rel(x).includes("/"));
      const want = top.filter(x => o.all || (o.choices ? o.choices.some(c => c.toLowerCase() === rel(x).toLowerCase()) : o.pattern ? amigaMatch(o.pattern, rel(x)) : true));
      picked = [];
      for (const w of want) {
        if (w.dir) for (const x of inBase) { if (!x.dir && rel(x).toLowerCase().startsWith(rel(w).toLowerCase() + "/")) picked.push({ src: x, to: rel(x) }); }
        else picked.push({ src: w, to: rel(w) });
      }
    }
    if (!picked.length) { miss.push("fichiers « " + (o.pattern || o.source) + " »"); continue; }
    for (const p of picked) add.push({ path: ddir + join(o.dest, p.to), data: p.src.data });
  }
  return { add, miss };
}

const WHD_KINDS = ["RawDIC", "Patcher", "DIC (images de disquettes)", "fichiers", "CD", "fichier unique", "Arcadia"];
async function whdInstall(rec) {
  const u8 = new Uint8Array(await rec.blob.arrayBuffer());
  const app = rec.slave ? rec.slave.split("/").pop().replace(/\.slave$/i, "") : rec.name.replace(/\.(lha|lzh)$/i, "").replace(/_?install$/i, "");
  const info = whdInstallInfo(u8, app);
  if (!info) { rec.inst = { done: true }; await DB.put(rec); return launchWhd(rec); }
  const v = info.plan.version, kind = WHD_KINDS[v] || "inconnue";
  if (v === 4 || v === 6) {
    toast(rec.name + " est un paquet d'installation WHDLoad de type " + kind + " : il faut l'installer sur un Amiga (ou WinUAE), puis importer le jeu installé.", true);
    return;
  }
  if (v === 0 || v === 1) return instAsk(rec, info, v === 0 ? "RawDIC" : "Patcher");
  const n = v === 2 ? Math.max(1, ...info.plan.ops.filter(o => o.type === "dic").map(o => o.num)) : 0;
  toast("Installation de " + app + " (type " + kind + ") : choisissez " + (v === 5 ? "la disquette originale (.adf) ou le fichier du jeu" : n > 1 ? "les " + n + " disquettes originales (.adf), dans l'ordre" : "la disquette originale (.adf)") + ".");
  pickFiles("", async files => { /* tous les fichiers : le programme d'un jeu n'a pas toujours d'extension */
    const disks = [], loose = [];
    for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }))) {
      let items;
      try { items = await expandFile(f.name, new Uint8Array(await f.arrayBuffer())); } catch (e) { toast(e.message || String(e), true); return; }
      for (const it of items) {
        const fs = it.data.length >= 901120 ? adfFiles(it.data) : null;
        if (it.data.length === 901120 || it.data.length === 1802240 || fs) disks.push({ name: it.name, u8: it.data, fs });
        else loose.push({ name: it.name.split("/").pop(), u8: it.data });
      }
    }
    const { add, miss } = whdInstallFiles(info, disks, loose);
    if (miss.length || !add.length) { toast("Installation incomplète de " + app + " : il manque " + (miss.join(", ") || "les données du jeu") + ".", true); return; }
    const out = lhaWrite([...info.ents.filter(e => !e.dir && e.data), ...add.map(a => ({ ...a, date: new Date() }))]);
    Object.assign(rec, { blob: new Blob([out]), size: out.length, crc: crc32u8(out), inst: { done: true, version: v, files: add.map(a => a.path.split("/").pop()) } });
    rec.name = rec.name.replace(/_?install(?=\.(lha|lzh)$)/i, "");
    await DB.put(rec);
    toast(app + " est installé (" + add.map(a => a.path.split("/").pop()).join(", ") + ") : touchez sa vignette pour jouer.");
    renderLauncherSoon();
  });
}
{ const _l = launchWhd;
  launchWhd = async rec => {
    if (rec && !(rec.inst && rec.inst.done)) {
      const info = whdInstallInfo(new Uint8Array(await rec.blob.arrayBuffer()), rec.name.replace(/\.(lha|lzh)$/i, ""));
      if (info) return whdInstall(rec);
      rec.inst = { done: true }; await DB.put(rec);
    }
    return _l(rec);
  }; }
/* À l'import : prévenir tout de suite qu'il s'agit d'un paquet d'installation */
{ const _iw = importWhd;
  importWhd = async (name, u8) => {
    const rec = await _iw(name, u8);
    const info = rec && whdInstallInfo(u8, name.replace(/\.(lha|lzh)$/i, ""));
    if (info) toast(name + " est un paquet d'installation WHDLoad (sans les données du jeu) : touchez sa vignette pour l'installer avec la disquette originale.");
    return rec;
  }; }

/* ---- Exécutable seul : disquette de démarrage qui le lance ---- */
{ const _g = guessKind; guessKind = (name, u8) => { const k = _g(name, u8); return k || (isHunkExe(u8) ? "adf" : null); }; }
{ const _ib = importBytes;
  importBytes = async (name, u8, target, mount, quiet) => {
    if (isHunkExe(u8) && !/\.(adf|adz|dms|hdf|rom|bin|ipf|scp|lha|lzh)$/i.test(name)) {
      const prog = amigaName(name.split("/").pop()).replace(/\s+/g, "_") || "Programme";
      try {
        const adf = adfWith(prog.slice(0, 30), [{ path: prog, data: u8 }, { path: "S/Startup-Sequence", data: new TextEncoder().encode(prog + "\n") }]);
        const rec = await _ib(prog + ".adf", adf, target === undefined || target === null ? "df0" : target, mount === undefined ? true : mount, true);
        if (rec && !quiet) toast(name + " : programme Amiga mis sur une disquette de démarrage (" + prog + ".adf) qui le lance.");
        return rec;
      } catch (e) { toast(name + " : " + (e.message || e), true); return null; }
    }
    return _ib(name, u8, target, mount, quiet);
  }; }


/* ---- Installations RawDIC et Patcher : dans l'Amiga émulé ----
   Les disquettes originales vont dans la Bibliothèque (la première dans DF0:) ; l'Amiga démarre sur Inst:
   (C:RawDIC, C:Patcher, C:DIC et le slave d'imagerie du paquet), qui lance l'outil puis écrit Inst:fini. */
let instJob = null, instTimer = 0, whdTools = null;
function whdToolsGet() {
  if (!whdTools) whdTools = (async () => {
    const r = await fetch("whd/WHDLoad_usr.lha"); if (!r.ok) throw new Error("paquet WHDLoad introuvable (" + r.status + ")");
    const t = {}; for (const e of readLha(new Uint8Array(await r.arrayBuffer()))) if (!e.dir && /^WHDLoad\/C\//.test(e.path)) t[e.path.slice(10)] = e.data;
    return t;
  })().catch(e => { whdTools = null; throw e; });
  return whdTools;
}
function instMake(rec, info, tool) {
  const pkgFile = ext => info.ents.find(e => !e.dir && e.path.toLowerCase().endsWith(ext));
  const helper = tool === "RawDIC" ? pkgFile(".islave") : tool === "Patcher" ? pkgFile(".imager") : null;
  return { recId: rec.id, rec, info, tool, helper: helper ? helper.path.split("/").pop() : "", last: info.plan.lastFile };
}
function instAsk(rec, info, tool) {
  const job = instMake(rec, info, tool);
  if (!job.helper) { toast(rec.name + " : le fichier d'imagerie (." + (tool === "RawDIC" ? "islave" : "imager") + ") manque dans le paquet.", true); return; }
  toast("Installation de " + rec.name.replace(/\.(lha|lzh)$/i, "") + " avec " + tool + " : choisissez la ou les disquettes originales (.adf), dans l'ordre. L'Amiga démarrera pour les lire.");
  pickFiles("", async files => {
    const list = [...files].sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
    let first = true;
    for (const f of list) { const r = await importFile(f, first ? "df0" : null); if (r || first) first = false; }
    if (!mounted.df0) { toast("Aucune disquette dans DF0: : l'installation ne peut pas commencer.", true); return; }
    instStart(job);
  });
}
function instStart(job) {
  if (running || starting) { toast("Éteignez d'abord l'Amiga.", true); return; }
  instJob = job; whdGame = null; cdGame = null;
  if (S.romId === "aros") toast("Installation avec AROS : si la lecture échoue, importez votre Kickstart 3.1 et recommencez.", true);
  toast("L'Amiga va lancer " + job.tool + " : répondez à ses questions (Entrée pour continuer) ; s'il demande la disquette suivante, insérez-la dans DF0: (F12 → Lecteurs de disquettes). La page récupère les fichiers à la fin.");
  powerOn();
}
async function instRestore() {
  const id = sessionStorage.getItem("a1200.inst"); if (!id) return;
  sessionStorage.removeItem("a1200.inst");
  const rec = await DB.get(id); if (!rec) return;
  const u8 = new Uint8Array(await rec.blob.arrayBuffer());
  const info = whdInstallInfo(u8, rec.slave ? rec.slave.split("/").pop().replace(/\.slave$/i, "") : rec.name);
  if (info) instJob = instMake(rec, info, info.plan.version === 0 ? "RawDIC" : info.plan.version === 1 ? "Patcher" : "DIC");
}
async function instBootAmb(m, lines) {
  const job = instJob, tools = await whdToolsGet(), FS = m.M.FS;
  for (const d of ["/whd/inst/C", "/whd/inst/Work"]) FS.mkdirTree(d);
  for (const [n, d] of Object.entries(tools)) if (/^(DIC|RawDIC|Patcher)$/.test(n)) m.writeFile("/whd/inst/C/" + n, d);
  for (const e of job.info.ents) if (!e.dir && /\.(islave|imager)$/i.test(e.path)) m.writeFile("/whd/inst/Work/" + e.path.split("/").pop(), e.data);
  try { FS.unlink("/whd/inst/fini"); } catch (x) {}
  const app = job.helper.replace(/\.(islave|imager)$/i, "");
  const cmd = job.tool === "RawDIC" ? `Inst:C/RawDIC SLAVE=${job.helper} SOURCE=DF0:`
    : job.tool === "Patcher" ? `Inst:C/Patcher -p${app}.imager -sDF0:`
    : `Inst:C/DIC DF0: FD=1 LD=1 SIZE=${(job.info.plan.ops.find(o => o.type === "dic") || {}).len || 901120} PEDANTIC`;
  const script = ["FAILAT 999", "CD Inst:Work", cmd, "CD Inst:", "Echo >Inst:fini fini"];
  m.writeFile("/whd/inst/S/Startup-Sequence", new TextEncoder().encode(script.join("\n") + "\n"));
  /* le volume Inst: démarre avant la disquette (priorité 10 contre 5) ; il lui faut la ROM de démarrage d'UAE */
  lines.splice(0, lines.length, ...lines.filter(l => !/^(boot_rom_uae|uaeboard)=/.test(l)), "filesystem2=rw,DH0:Inst:/whd/inst,10");
}
async function instFinish() {
  const job = instJob, FS = machine.M.FS;
  instJob = null; clearInterval(instTimer);
  const made = [];
  const walk = (dir, rel) => {
    for (const n of FS.readdir(dir)) {
      if (n === "." || n === "..") continue;
      const p = dir + "/" + n, st = FS.stat(p), r = rel ? rel + "/" + n : n;
      if (FS.isDir(st.mode)) walk(p, r); else if (!/\.(islave|imager)$/i.test(n)) made.push({ path: r, data: FS.readFile(p) });
    }
  };
  walk("/whd/inst/Work", "");
  const want = job.last || (job.tool === "DIC" ? "Disk.1" : "");
  const ok = made.length && (!want || made.some(f => f.path.toLowerCase() === want.toLowerCase()));
  if (!ok) { toast(job.tool + " n'a pas créé tous les fichiers" + (want ? " (" + want + " manque)" : "") + " : regardez le message à l'écran de l'Amiga, puis éteignez-le.", true); return; }
  const rec = await DB.get(job.recId) || job.rec;
  const out = lhaWrite([...job.info.ents.filter(e => !e.dir && e.data), ...made.map(f => ({ path: job.info.ddir + f.path, data: f.data, date: new Date() }))]);
  Object.assign(rec, { blob: new Blob([out]), size: out.length, crc: crc32u8(out), inst: { done: true, version: job.info.plan.version, files: made.map(f => f.path) } });
  rec.name = rec.name.replace(/_?install(?=\.(lha|lzh)$)/i, "");
  await DB.put(rec);
  await powerOff();
  toast(rec.name.replace(/\.(lha|lzh)$/i, "") + " est installé (" + made.length + " fichier" + (made.length > 1 ? "s" : "") + " créé" + (made.length > 1 ? "s" : "") + " par " + job.tool + ") : touchez sa vignette pour jouer.");
  renderLauncherSoon();
}
{ const _s = onStarted; onStarted = (...x) => {
    _s(...x);
    if (!instJob) return;
    clearInterval(instTimer);
    instTimer = setInterval(() => {
      if (!running || !instJob) { clearInterval(instTimer); return; }
      try { machine.flush(); if (machine.M.FS.analyzePath("/whd/inst/fini").exists) instFinish(); } catch (e) { console.warn(e); }
    }, 1000);
  }; }
/* Diagnostic depuis la console : la même installation, mais avec C:DIC dans l'Amiga émulé (paquet de type DIC) */
window.__a1200.instDIC = async id => {
  const rec = await DB.get(id), info = rec && whdInstallInfo(new Uint8Array(await rec.blob.arrayBuffer()), "test");
  if (info) instStart(instMake(rec, info, "DIC"));
};
