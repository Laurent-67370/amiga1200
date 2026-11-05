/* Disquette Amiga vierge, formatée comme le ferait la commande Format du Workbench.
 * 880 Ko (DD), système de fichiers FFS (DOS\1) ou OFS (DOS\0), non amorçable.
 * Structure : bloc d'amorce (0-1), bloc racine (880), carte des blocs libres (881). */

const BLOCKS = 1760, BSIZE = 512, ROOT = 880, BITMAP = 881;

function put32(dv, off, v) { dv.setUint32(off, v >>> 0, false); }
/* Somme de contrôle AmigaDOS : la somme des mots longs du bloc doit valoir 0. */
function checksum(dv, base, at) {
  let sum = 0;
  for (let i = 0; i < BSIZE; i += 4) if (i !== at) sum = (sum + dv.getUint32(base + i, false)) >>> 0;
  put32(dv, base + at, -sum);
}
/* Date AmigaDOS : jours depuis le 1er janvier 1978, minutes, ticks (1/50 s). */
function amigaDate(d) {
  /* L'Amiga compte en heure locale */
  const ms = d.getTime() - d.getTimezoneOffset() * 60000 - Date.UTC(1978, 0, 1);
  const days = Math.floor(ms / 86400000), rest = ms - days * 86400000;
  return [days, Math.floor(rest / 60000), Math.floor((rest % 60000) / 20)];
}

export function makeBlankAdf(label = "Vierge", ffs = true, now = new Date()) {
  const buf = new Uint8Array(BLOCKS * BSIZE), dv = new DataView(buf.buffer);
  /* Amorce : "DOS" + type ; une disquette non amorçable n'a pas besoin de somme de contrôle valide. */
  buf.set([0x44, 0x4f, 0x53, ffs ? 1 : 0], 0);
  put32(dv, 8, ROOT);

  /* Bloc racine */
  const r = ROOT * BSIZE;
  put32(dv, r + 0, 2);            /* T_HEADER */
  put32(dv, r + 12, 72);          /* taille de la table de hachage */
  put32(dv, r + 312, 0xffffffff); /* carte des blocs valide */
  put32(dv, r + 316, BITMAP);     /* première page de la carte */
  const [days, mins, ticks] = amigaDate(now);
  for (const o of [420, 472, 484]) { put32(dv, r + o, days); put32(dv, r + o + 4, mins); put32(dv, r + o + 8, ticks); }
  const name = new TextEncoder().encode(label.replace(/[:\/]/g, "").slice(0, 30));
  buf[r + 432] = name.length; buf.set(name, r + 433);
  put32(dv, r + 508, 1);          /* ST_ROOT */
  checksum(dv, r, 20);

  /* Carte des blocs libres : un bit par bloc à partir du bloc 2, 1 = libre */
  const b = BITMAP * BSIZE;
  for (let blk = 2; blk < BLOCKS; blk++) {
    if (blk === ROOT || blk === BITMAP) continue;
    const n = blk - 2, word = n >> 5, bit = n & 31, off = b + 4 + word * 4;
    put32(dv, off, dv.getUint32(off, false) | (1 << bit));
  }
  checksum(dv, b, 0);
  return buf;
}
