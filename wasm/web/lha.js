/* Lecture des archives LhA (.lha, .lzh), le format des jeux WHDLoad et de la plupart des logiciels Amiga.
 *
 * En-têtes de niveau 0, 1 et 2 ; méthodes -lh0- (stocké), -lh4-, -lh5-, -lh6-, -lh7- (LZSS + Huffman statique)
 * et -lhd- (dossier). L'ancienne méthode -lh1- (Huffman adaptatif, LhArc) n'est pas gérée.
 * Le décodeur suit l'algorithme de LHa pour UNIX (Okumura, Yoshizaki). */

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/* CRC-16 de LhA (polynôme 0xA001) */
const CRC_T = (() => { const t = new Uint16Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xa001 : c >>> 1; t[i] = c; } return t; })();
function crc16(u8) { let c = 0; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return c; }

const latin1 = new TextDecoder("latin1");

/* ---------- Décodeur -lh4- à -lh7- ---------- */
function decodeLzh(src, outSize, dicbit) {
  const NC = 510, NT = 19, TBIT = 5, CBIT = 9;
  const NP = dicbit + 1, PBIT = dicbit <= 13 ? 4 : 5;
  const out = new Uint8Array(outSize);
  let pos = 0, bitbuf = 0, subbitbuf = 0, bitcount = 0;
  const fillbuf = n => {
    while (n > bitcount) {
      n -= bitcount;
      bitbuf = ((bitbuf << bitcount) + (subbitbuf >>> (8 - bitcount))) & 0xffff;
      subbitbuf = pos < src.length ? src[pos++] : 0;
      bitcount = 8;
    }
    bitcount -= n;
    bitbuf = ((bitbuf << n) + (subbitbuf >>> (8 - n))) & 0xffff;
    subbitbuf = (subbitbuf << n) & 0xff;
  };
  const getbits = n => { const x = bitbuf >>> (16 - n); fillbuf(n); return x; };
  fillbuf(16);

  const left = new Uint16Array(2 * NC - 1), right = new Uint16Array(2 * NC - 1);
  const cLen = new Uint8Array(NC), cTable = new Uint16Array(4096);
  const ptLen = new Uint8Array(Math.max(NT, NP)), ptTable = new Uint16Array(256);

  function makeTable(nchar, bitlen, tablebits, table) {
    const count = new Uint16Array(17), weight = new Uint32Array(17), start = new Uint32Array(18);
    for (let i = 0; i < nchar; i++) count[bitlen[i]]++;
    start[1] = 0;
    for (let i = 1; i <= 16; i++) start[i + 1] = start[i] + (count[i] << (16 - i));
    if (start[17] !== 0x10000) throw new Error("archive LhA endommagée (table de Huffman)");
    const jut = 16 - tablebits;
    for (let i = 1; i <= tablebits; i++) { start[i] >>>= jut; weight[i] = 1 << (tablebits - i); }
    for (let i = tablebits + 1; i <= 16; i++) weight[i] = 1 << (16 - i);
    let i = start[tablebits + 1] >>> jut;
    if (i !== 0x10000 >>> jut) { const k = 1 << tablebits; while (i !== k) table[i++] = 0; }
    let avail = nchar;
    const mask = 1 << (15 - tablebits);
    for (let ch = 0; ch < nchar; ch++) {
      const len = bitlen[ch]; if (len === 0) continue;
      let k = start[len];
      const next = k + weight[len];
      if (len <= tablebits) { for (let j = k; j < next; j++) table[j] = ch; }
      else {
        /* « pointeur » vers une case : [tableau, indice] */
        let arr = table, idx = k >>> jut;
        for (let n = len - tablebits; n > 0; n--) {
          if (arr[idx] === 0) { right[avail] = left[avail] = 0; arr[idx] = avail++; }
          const node = arr[idx];
          if (k & mask) { arr = right; idx = node; } else { arr = left; idx = node; }
          k <<= 1;
        }
        arr[idx] = ch;
      }
      start[len] = next;
    }
  }
  function readPtLen(nn, nbit, special) {
    const n = getbits(nbit);
    if (n === 0) { const c = getbits(nbit); ptLen.fill(0, 0, nn); ptTable.fill(c); return; }
    let i = 0;
    while (i < n) {
      let c = bitbuf >>> 13;
      if (c === 7) { let m = 1 << 12; while (m & bitbuf) { m >>>= 1; c++; } }
      fillbuf(c < 7 ? 3 : c - 3);
      ptLen[i++] = c;
      if (i === special) { let z = getbits(2); while (--z >= 0) ptLen[i++] = 0; }
    }
    while (i < nn) ptLen[i++] = 0;
    makeTable(nn, ptLen, 8, ptTable);
  }
  function readCLen() {
    const n = getbits(CBIT);
    if (n === 0) { const c = getbits(CBIT); cLen.fill(0); cTable.fill(c); return; }
    let i = 0;
    while (i < n) {
      let c = ptTable[bitbuf >>> 8];
      if (c >= NT) { let m = 1 << 7; do { c = bitbuf & m ? right[c] : left[c]; m >>>= 1; } while (c >= NT); }
      fillbuf(ptLen[c]);
      if (c <= 2) {
        if (c === 0) c = 1; else if (c === 1) c = getbits(4) + 3; else c = getbits(CBIT) + 20;
        while (--c >= 0) cLen[i++] = 0;
      } else cLen[i++] = c - 2;
    }
    while (i < NC) cLen[i++] = 0;
    makeTable(NC, cLen, 12, cTable);
  }
  let blocksize = 0, o = 0;
  while (o < outSize) {
    if (blocksize === 0) {
      blocksize = getbits(16);
      readPtLen(NT, TBIT, 3); readCLen(); readPtLen(NP, PBIT, -1);
    }
    blocksize--;
    let c = cTable[bitbuf >>> 4];
    if (c >= NC) { let m = 1 << 3; do { c = bitbuf & m ? right[c] : left[c]; m >>>= 1; } while (c >= NC); }
    fillbuf(cLen[c]);
    if (c < 256) { out[o++] = c; continue; }
    const len = c - 253;
    let p = ptTable[bitbuf >>> 8];
    if (p >= NP) { let m = 1 << 7; do { p = bitbuf & m ? right[p] : left[p]; m >>>= 1; } while (p >= NP); }
    fillbuf(ptLen[p]);
    if (p !== 0) p = (1 << (p - 1)) + getbits(p - 1);
    let from = o - p - 1;
    for (let k = 0; k < len && o < outSize; k++) out[o++] = from + k >= 0 ? out[from + k] : 0x20;
  }
  return out;
}

const DICBITS = { "-lh4-": 12, "-lh5-": 13, "-lh6-": 15, "-lh7-": 16 };

function dosDate(t) {
  const time = t & 0xffff, date = t >>> 16;
  return new Date(1980 + (date >>> 9), ((date >>> 5) & 15) - 1, date & 31, time >>> 11, (time >>> 5) & 63, (time & 31) * 2);
}

/**
 * Liste et décompresse le contenu d'une archive LhA.
 * @param {Uint8Array} u8
 * @returns {{path:string, dir:boolean, data:Uint8Array|null, date:Date, comment:string, error?:string}[]}
 */
export function readLha(u8) {
  const out = [];
  let p = 0;
  /* Archive auto-extractible : on cherche le premier en-tête */
  const isHead = q => q + 22 <= u8.length && u8[q + 2] === 0x2d && u8[q + 3] === 0x6c && u8[q + 6] === 0x2d && u8[q + 20] <= 3;
  if (!isHead(0)) { let q = 0; while (q < Math.min(u8.length, 65536) && !isHead(q)) q++; if (!isHead(q)) throw new Error("ce n'est pas une archive LhA"); p = q; }
  while (p < u8.length && u8[p] !== 0) {
    if (!isHead(p)) break;
    const level = u8[p + 20];
    const method = latin1.decode(u8.subarray(p + 2, p + 7));
    let comp = u32(u8, p + 7);
    const orig = u32(u8, p + 11), stamp = u32(u8, p + 15);
    let name = "", dir = "", comment = "", crc = null, date, dataAt;
    const parseExt = (q, end) => {
      let size = u16(u8, q), total = 0; q += 2;
      while (size && q + size <= end + 0x10000 && q + size <= u8.length) {
        const type = u8[q], body = u8.subarray(q + 1, q + size - 2);
        /* 0x00 : somme de contrôle de l'en-tête lui-même, pas celle du fichier */
        if (type === 0x01) name = latin1.decode(body);
        else if (type === 0x02) dir = latin1.decode(body).split("\xff").filter(Boolean).join("/");
        else if (type === 0x3f || type === 0x71) comment = latin1.decode(body);
        else if (type === 0x54) date = new Date(u32(body, 0) * 1000);
        total += size;
        const next = u16(u8, q + size - 2); q += size; size = next;
      }
      return total;
    };
    if (level === 0 || level === 1) {
      const H = u8[p], nlen = u8[p + 21];
      const raw = latin1.decode(u8.subarray(p + 22, p + 22 + nlen));
      const z = raw.indexOf("\0");
      name = z >= 0 ? raw.slice(0, z) : raw; if (z >= 0) comment = raw.slice(z + 1);
      date = dosDate(stamp);
      if (level === 0) {
        if (p + 22 + nlen + 2 <= p + H + 2) crc = u16(u8, p + 22 + nlen);
        dataAt = p + H + 2;
      } else {
        crc = u16(u8, p + 22 + nlen);
        /* octet de système puis taille de la première extension, à la fin de l'en-tête de base */
        const ext = parseExt(p + H, p + H + 2);
        dataAt = p + H + 2 + ext; comp -= ext;
      }
    } else if (level === 2) {
      const total = u16(u8, p);
      crc = u16(u8, p + 21); date = new Date(stamp * 1000);
      parseExt(p + 24, p + total);
      dataAt = p + total;
    } else throw new Error("en-tête LhA de niveau " + level + " non géré");
    const path = (dir ? dir + "/" : "") + name.replace(/\\/g, "/");
    const entry = { path: path.replace(/^\/+|\/+$/g, ""), dir: method === "-lhd-", data: null, date: date || new Date(), comment };
    if (!entry.dir) {
      const src = u8.subarray(dataAt, dataAt + comp);
      try {
        if (method === "-lh0-" || method === "-lz4-") entry.data = src.slice(0, orig);
        else if (DICBITS[method]) entry.data = decodeLzh(src, orig, DICBITS[method]);
        else entry.error = "méthode " + method + " non gérée";
        if (entry.data && crc !== null && crc16(entry.data) !== crc) entry.error = "contenu endommagé (CRC)";
      } catch (e) { entry.error = e.message; }
    }
    if (entry.path) out.push(entry);
    p = dataAt + comp;
  }
  return out;
}
