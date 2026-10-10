/* Écriture de fichiers sur un disque dur Amiga (OFS / FFS), sans passer par l'Amiga.
 *
 * Sert à copier des jeux WHDLoad, des archives décompressées ou des Kickstart sur un .hdf
 * quand l'émulateur est éteint. Gère les tables de partitions RDB, les systèmes DOS\0 à DOS\3
 * (OFS, FFS, et leurs variantes « internationales »). Les variantes à cache de dossiers (DOS\4, DOS\5),
 * à noms longs (DOS\6, DOS\7), PFS et SFS ne sont pas modifiables ici.
 *
 * Accès aux blocs : io.block(n) renvoie une vue modifiable de 512 octets du bloc absolu n,
 * io.touch(n) le marque comme modifié. Rien n'est écrit tant que l'appelant ne valide pas. */

const BS = 512;
const T_HEADER = 2, T_LIST = 16, T_DATA = 8, ST_ROOT = 1, ST_USERDIR = 2, ST_FILE = -3 >>> 0;
const HT = 72;

const g32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const p32 = (b, o, v) => { v >>>= 0; b[o] = v >>> 24; b[o + 1] = (v >>> 16) & 255; b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255; };
function checksum(b, at) {
  p32(b, at, 0);
  let s = 0; for (let i = 0; i < BS; i += 4) s = (s + g32(b, i)) >>> 0;
  p32(b, at, -s);
}
function blockSumOk(b) { let s = 0; for (let i = 0; i < BS; i += 4) s = (s + g32(b, i)) >>> 0; return s === 0; }
function amigaDate(d) {
  const ms = d.getTime() - d.getTimezoneOffset() * 60000 - Date.UTC(1978, 0, 1);
  const days = Math.max(0, Math.floor(ms / 86400000)), rest = Math.max(0, ms - days * 86400000);
  return [days, Math.floor(rest / 60000), Math.floor((rest % 60000) / 20)];
}
const latin1 = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); u[i] = c < 256 ? c : 0x3f; } return u; };
const bcpl = (b, o) => { let s = ""; for (let i = 0; i < b[o]; i++) s += String.fromCharCode(b[o + 1 + i]); return s; };
function putBcpl(b, o, s, max) { const u = latin1(s.slice(0, max)); b[o] = u.length; b.set(u, o + 1); }

const FS_NAMES = ["OFS", "FFS", "OFS international", "FFS international", "OFS + cache", "FFS + cache", "OFS noms longs", "FFS noms longs"];
function fsName(t) {
  if ((t >>> 8) === 0x444f53 && (t & 255) < 8) return FS_NAMES[t & 255];
  const s = String.fromCharCode(t >>> 24, (t >>> 16) & 255, (t >>> 8) & 255);
  return /^[\x20-\x7e]{3}$/.test(s) ? s + "\\" + (t & 255) : "inconnu";
}

/**
 * Partitions d'un disque (avec RDB), ou la partition unique d'une image sans RDB.
 * @returns {{name, start, blocks, reserved, dosType, fs, volume, bootable, ok, reason}[]}
 */
export function listPartitions(io, totalBlocks) {
  const parts = [];
  let rdsk = -1;
  for (let b = 0; b < 16 && b < totalBlocks; b++) if (g32(io.block(b), 0) === 0x5244534b) { rdsk = b; break; }
  if (rdsk < 0) {
    parts.push(describe({ name: "DH0", start: 0, blocks: totalBlocks, reserved: 2, bootable: true }, io));
    return parts;
  }
  const seen = new Set();
  for (let pb = g32(io.block(rdsk), 28); pb !== 0xffffffff && pb < totalBlocks && !seen.has(pb); ) {
    seen.add(pb);
    const p = io.block(pb);
    if (g32(p, 0) !== 0x50415254) break; /* PART */
    const env = i => g32(p, 128 + i * 4);
    const surf = env(3), bpt = env(5), low = env(9), high = env(10), cyl = surf * bpt;
    const part = { name: bcpl(p, 36), start: low * cyl, blocks: (high - low + 1) * cyl, reserved: env(6), bootable: !!(g32(p, 20) & 1), dosType: env(16) };
    if (env(1) !== 128 || (env(4) || 1) !== 1) { part.ok = false; part.fs = fsName(part.dosType); part.reason = "taille de bloc différente de 512 octets"; parts.push(part); }
    else parts.push(describe(part, io));
    pb = g32(p, 16);
  }
  return parts;
}
function describe(part, io) {
  const boot = io.block(part.start);
  const t = g32(boot, 0);
  part.dosType = t; part.fs = fsName(t); part.ok = false;
  if ((t >>> 8) !== 0x444f53) { part.reason = t === 0 || t === 0x42414400 ? "non formatée" : "système " + part.fs + " (seuls OFS et FFS sont modifiables)"; return part; }
  const v = t & 255;
  if (v > 3) { part.reason = "FFS " + (v < 6 ? "avec cache de dossiers" : "à noms longs") + " (non géré)"; return part; }
  part.root = Math.floor((part.blocks - 1 + part.reserved) / 2);
  const r = io.block(part.start + part.root);
  if (g32(r, 0) !== T_HEADER || g32(r, 508) !== ST_ROOT || !blockSumOk(r)) { part.reason = "bloc racine introuvable"; return part; }
  part.volume = bcpl(r, 432);
  if (g32(r, 312) !== 0xffffffff) { part.reason = "disque à valider : démarrez une fois l'Amiga avec ce disque"; return part; }
  part.ok = true;
  return part;
}

export class AmigaVolume {
  constructor(io, part) {
    this.io = io; this.p = part;
    this.ofs = !(part.dosType & 1); this.intl = (part.dosType & 255) >= 2;
    this.root = part.root;
    /* Blocs de la carte des blocs libres */
    const r = this.blk(this.root);
    this.maps = [];
    for (let i = 0; i < 25; i++) { const m = g32(r, 316 + i * 4); if (m) this.maps.push(m); }
    for (let e = g32(r, 416), guard = 0; e && guard < 100000; guard++) {
      const b = this.blk(e);
      for (let i = 0; i < 127; i++) { const m = g32(b, i * 4); if (m) this.maps.push(m); }
      e = g32(b, 508);
    }
    this.cursor = this.root;
    this.touchedMaps = new Set(); this.touched = new Set();
  }
  blk(n) { return this.io.block(this.p.start + n); }
  /* Blocs d'en-tête modifiés (leur somme de contrôle est refaite à la fin) */
  mark(n) { this.touched.add(n); this.io.touch(this.p.start + n); }
  markData(n) { this.io.touch(this.p.start + n); }

  /* ---- carte des blocs libres (bit à 1 = libre) ---- */
  _bit(n) {
    const idx = n - this.p.reserved, m = Math.floor(idx / 4064), r = idx % 4064;
    return { mb: this.maps[m], off: 4 + (r >>> 5) * 4, bit: r & 31 };
  }
  isFree(n) { const { mb, off, bit } = this._bit(n); return !!((g32(this.blk(mb), off) >>> bit) & 1); }
  _set(n, free) {
    const { mb, off, bit } = this._bit(n), b = this.blk(mb);
    let w = g32(b, off); w = free ? (w | (1 << bit)) : (w & ~(1 << bit)); p32(b, off, w);
    this.touchedMaps.add(mb); this.io.touch(this.p.start + mb);
  }
  freeCount() {
    let n = 0;
    const total = this.p.blocks - this.p.reserved;
    for (let m = 0; m < this.maps.length; m++) {
      const b = this.blk(this.maps[m]);
      for (let w = 0; w < 127; w++) {
        const first = m * 4064 + w * 32; if (first >= total) break;
        let v = g32(b, 4 + w * 4);
        if (first + 32 > total) v &= (2 ** (total - first) - 1) >>> 0;
        while (v) { v &= v - 1; n++; }
      }
    }
    return n;
  }
  alloc() {
    const lo = this.p.reserved, hi = this.p.blocks;
    for (let pass = 0; pass < 2; pass++) {
      for (let n = pass ? lo : this.cursor; n < hi; n++) {
        /* Saut rapide des mots pleins */
        const { mb, off, bit } = this._bit(n);
        if (bit === 0 && g32(this.blk(mb), off) === 0) { n += 31; continue; }
        if (this.isFree(n)) { this._set(n, false); this.cursor = n + 1; return n; }
      }
    }
    throw new Error("disque plein");
  }
  release(n) { this._set(n, true); }

  /* ---- noms ---- */
  up(c) { return (c >= 97 && c <= 122) || (this.intl && c >= 224 && c <= 254 && c !== 247) ? c - 32 : c; }
  hash(name) { const u = latin1(name); let h = u.length; for (const c of u) h = (h * 13 + this.up(c)) & 0x7ff; return h % HT; }
  same(a, b) { if (a.length !== b.length) return false; const x = latin1(a), y = latin1(b); for (let i = 0; i < x.length; i++) if (this.up(x[i]) !== this.up(y[i])) return false; return true; }
  find(dir, name) {
    for (let k = g32(this.blk(dir), 24 + this.hash(name) * 4), guard = 0; k && guard < 100000; guard++) {
      const b = this.blk(k);
      if (this.same(bcpl(b, 432), name)) return k;
      k = g32(b, 496);
    }
    return 0;
  }
  link(dir, k, name) {
    /* Chaîne de hachage triée par numéro de bloc, comme AmigaDOS */
    const d = this.blk(dir), slot = 24 + this.hash(name) * 4;
    let prev = 0, cur = g32(d, slot);
    while (cur && cur < k) { prev = cur; cur = g32(this.blk(cur), 496); }
    p32(this.blk(k), 496, cur);
    if (prev) { p32(this.blk(prev), 496, k); this.mark(prev); } else { p32(d, slot, k); this.mark(dir); }
  }
  unlink(dir, k) {
    const d = this.blk(dir), name = bcpl(this.blk(k), 432), slot = 24 + this.hash(name) * 4, next = g32(this.blk(k), 496);
    if (g32(d, slot) === k) { p32(d, slot, next); this.mark(dir); return; }
    for (let c = g32(d, slot); c; ) { const b = this.blk(c), n = g32(b, 496); if (n === k) { p32(b, 496, next); this.mark(c); return; } c = n; }
  }
  stamp(k, date) { const [d, m, t] = amigaDate(date); const b = this.blk(k); p32(b, 420, d); p32(b, 424, m); p32(b, 428, t); this.mark(k); }

  /* ---- dossiers ---- */
  mkdir(parent, name, date = new Date()) {
    const k = this.alloc(), b = this.blk(k);
    b.fill(0);
    p32(b, 0, T_HEADER); p32(b, 4, k);
    putBcpl(b, 432, name, 30);
    p32(b, 500, parent); p32(b, 508, ST_USERDIR);
    this.mark(k); this.stamp(k, date);
    this.link(parent, k, name); this.stamp(parent, new Date());
    return k;
  }
  /** Dossier (créé au besoin) pour un chemin « a/b/c » ; renvoie son bloc */
  dir(path) {
    let cur = this.root;
    for (const part of path.split("/").filter(Boolean)) {
      const k = this.find(cur, part);
      if (k) {
        if (g32(this.blk(k), 508) !== ST_USERDIR) throw new Error("« " + part + " » existe déjà et n'est pas un dossier");
        cur = k;
      } else cur = this.mkdir(cur, part);
    }
    return cur;
  }

  /* ---- fichiers ---- */
  blocksFor(size) {
    const data = Math.ceil(size / (this.ofs ? 488 : BS));
    return 1 + data + Math.max(0, Math.ceil(data / HT) - 1);
  }
  remove(dir, k) {
    const h = this.blk(k);
    if (g32(h, 508) !== ST_FILE) throw new Error("« " + bcpl(h, 432) + " » est un dossier");
    this.unlink(dir, k);
    const free = [];
    for (let blk = k, guard = 0; blk && guard < 1000000; guard++) {
      const b = this.blk(blk), n = g32(b, 8);
      for (let i = 0; i < n && i < HT; i++) { const d = g32(b, 308 - i * 4); if (d) free.push(d); }
      free.push(blk);
      blk = g32(b, 504);
    }
    for (const f of free) this.release(f);
  }
  /**
   * Écrit un fichier (remplace un fichier du même nom).
   * @param {number} dir   bloc du dossier
   */
  writeFile(dir, name, data, date = new Date(), comment = "") {
    const old = this.find(dir, name);
    if (old) this.remove(dir, old);
    const per = this.ofs ? 488 : BS;
    const count = Math.ceil(data.length / per);
    const hdr = this.alloc();
    const blocks = []; for (let i = 0; i < count; i++) blocks.push(this.alloc());
    /* Données */
    for (let i = 0; i < count; i++) {
      const b = this.blk(blocks[i]); b.fill(0);
      const part = data.subarray(i * per, Math.min(data.length, (i + 1) * per));
      if (this.ofs) {
        p32(b, 0, T_DATA); p32(b, 4, hdr); p32(b, 8, i + 1); p32(b, 12, part.length);
        p32(b, 16, i + 1 < count ? blocks[i + 1] : 0);
        b.set(part, 24); checksum(b, 20);
      } else b.set(part, 0);
      this.markData(blocks[i]);
    }
    /* En-tête puis blocs d'extension : 72 pointeurs chacun, rangés à l'envers depuis la fin de la table */
    const chain = [hdr];
    for (let i = HT; i < count; i += HT) chain.push(this.alloc());
    chain.forEach((k, c) => {
      const b = this.blk(k); b.fill(0);
      const slice = blocks.slice(c * HT, (c + 1) * HT);
      p32(b, 0, c ? T_LIST : T_HEADER); p32(b, 4, k); p32(b, 8, slice.length);
      slice.forEach((d, i) => p32(b, 308 - i * 4, d));
      p32(b, 500, c ? hdr : dir); p32(b, 504, chain[c + 1] || 0); p32(b, 508, ST_FILE);
      if (!c) {
        p32(b, 16, blocks[0] || 0); p32(b, 324, data.length);
        if (comment) putBcpl(b, 328, comment, 79);
        putBcpl(b, 432, name, 30);
        const [d, m, t] = amigaDate(date); p32(b, 420, d); p32(b, 424, m); p32(b, 428, t);
      }
      this.mark(k);
    });
    this.link(dir, hdr, name);
    this.stamp(dir, new Date());
    return hdr;
  }
  /** Sommes de contrôle et date de modification du volume : à appeler avant d'enregistrer */
  finish() {
    for (const m of this.touchedMaps) checksum(this.blk(m), 0);
    const r = this.blk(this.root), [d, m, t] = amigaDate(new Date());
    p32(r, 472, d); p32(r, 476, m); p32(r, 480, t); this.mark(this.root);
    for (const k of this.touched) {
      if (!this.touchedMaps.has(k)) checksum(this.blk(k), 20);
    }
  }
}

/* Noms de fichiers Amiga : 30 caractères au plus, sans « : » ni « / » */
export function amigaName(s) { return s.replace(/[:\/]/g, "_").slice(0, 30); }
