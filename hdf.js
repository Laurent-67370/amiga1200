/* Disque dur Amiga prêt à l'emploi : table de partitions RDB (comme HDToolBox) et une partition
 * DH0: amorçable formatée en FFS (DOS\1), comme après « Format » sous Workbench.
 *
 * Géométrie : 32 secteurs × 1 tête par cylindre (16 Ko). Le cylindre 0 porte le RDB,
 * la partition occupe les cylindres 1 à la fin. Le système de fichiers est celui de la ROM
 * (FastFileSystem du Kickstart 3.1, ou celui d'AROS) : aucun pilote dans le RDB. */

const BS = 512, SECTORS = 32, HEADS = 1, CYL_BLOCKS = SECTORS * HEADS;

const put32 = (dv, off, v) => dv.setUint32(off, v >>> 0, false);
const get32 = (dv, off) => dv.getUint32(off, false);
function putStr(u8, off, s, len) { const b = new TextEncoder().encode(s).slice(0, len); u8.set(b, off); }

/* Somme de contrôle des blocs RDB : sur `summed` mots longs, le mot 2 rend la somme nulle. */
function rdbChecksum(dv, base, summed) {
  put32(dv, base + 8, 0);
  let sum = 0;
  for (let i = 0; i < summed; i++) sum = (sum + get32(dv, base + i * 4)) >>> 0;
  put32(dv, base + 8, -sum);
}
/* Somme de contrôle AmigaDOS (blocs racine, carte) : sur 128 mots longs, le mot `at` rend la somme nulle. */
function dosChecksum(dv, base, at) {
  put32(dv, base + at, 0);
  let sum = 0;
  for (let i = 0; i < BS; i += 4) sum = (sum + get32(dv, base + i)) >>> 0;
  put32(dv, base + at, -sum);
}
function amigaDate(d) {
  /* L'Amiga compte en heure locale */
  const ms = d.getTime() - d.getTimezoneOffset() * 60000 - Date.UTC(1978, 0, 1);
  const days = Math.floor(ms / 86400000), rest = ms - days * 86400000;
  return [days, Math.floor(rest / 60000), Math.floor((rest % 60000) / 20)];
}

/**
 * @param {number} sizeMB   taille totale (Mo)
 * @param {string} label    nom du volume
 * @returns {Uint8Array}    image .hdf complète
 */
export function makeHardDisk(sizeMB, label = "Travail", now = new Date()) {
  const cyls = Math.floor(sizeMB * 1048576 / BS / CYL_BLOCKS);
  const total = cyls * CYL_BLOCKS;
  const img = new Uint8Array(total * BS), dv = new DataView(img.buffer);

  /* ---------- RDSK (bloc 0) ---------- */
  putStr(img, 0, "RDSK", 4);
  put32(dv, 4, 64);            /* SummedLongs */
  put32(dv, 12, 7);            /* HostID */
  put32(dv, 16, BS);           /* BlockBytes */
  put32(dv, 20, 0);            /* Flags */
  put32(dv, 24, 0xffffffff);   /* BadBlockList */
  put32(dv, 28, 1);            /* PartitionList → bloc 1 */
  put32(dv, 32, 0xffffffff);   /* FileSysHeaderList : FFS de la ROM */
  put32(dv, 36, 0xffffffff);   /* DriveInit */
  for (let o = 40; o < 64; o += 4) put32(dv, o, 0xffffffff);
  put32(dv, 64, cyls);         /* Cylinders */
  put32(dv, 68, SECTORS);      /* Sectors */
  put32(dv, 72, HEADS);        /* Heads */
  put32(dv, 76, 1);            /* Interleave */
  put32(dv, 80, cyls);         /* Park */
  put32(dv, 96, cyls);         /* WritePreComp */
  put32(dv, 100, cyls);        /* ReducedWrite */
  put32(dv, 104, 3);           /* StepRate */
  put32(dv, 128, 0);           /* RDBBlocksLo */
  put32(dv, 132, CYL_BLOCKS - 1); /* RDBBlocksHi */
  put32(dv, 136, 1);           /* LoCylinder */
  put32(dv, 140, cyls - 1);    /* HiCylinder */
  put32(dv, 144, CYL_BLOCKS);  /* CylBlocks */
  put32(dv, 152, 1);           /* HighRDSKBlock */
  putStr(img, 160, "AMIGA1200", 8);
  putStr(img, 168, "DISQUE DUR", 16);
  putStr(img, 184, "1.0", 4);
  rdbChecksum(dv, 0, 64);

  /* ---------- PART (bloc 1) : DH0:, amorçable ---------- */
  const p = BS;
  putStr(img, p, "PART", 4);
  put32(dv, p + 4, 64);
  put32(dv, p + 12, 7);
  put32(dv, p + 16, 0xffffffff); /* Next */
  put32(dv, p + 20, 1);          /* Flags : PBFF_BOOTABLE */
  put32(dv, p + 32, 0);          /* DevFlags */
  img[p + 36] = 3; putStr(img, p + 37, "DH0", 31);
  /* DosEnvec à l'octet 128 */
  const env = [16, 128, 0, HEADS, 1, SECTORS, 2, 0, 0, 1, cyls - 1, 30, 0, 0x7fffffff, 0xfffffffe, 0, 0x444f5301, 0, 0, 0, 0];
  /* TableSize, SizeBlock(longs), SecOrg, Surfaces, SectorPerBlock, BlocksPerTrack, Reserved, PreAlloc, Interleave,
     LowCyl, HighCyl, NumBuffers, BufMemType, MaxTransfer, Mask, BootPri, DosType, Baud, Control, BootBlocks */
  env.forEach((v, i) => put32(dv, p + 128 + i * 4, v));
  rdbChecksum(dv, p, 64);

  /* ---------- Partition formatée FFS ---------- */
  const start = CYL_BLOCKS;                 /* premier bloc de la partition */
  const n = total - start;                  /* nombre de blocs de la partition */
  const B = blk => (start + blk) * BS;      /* adresse d'un bloc de la partition */
  img.set([0x44, 0x4f, 0x53, 0x01], B(0));  /* bloc d'amorce : DOS\1 */
  const root = Math.floor((n - 1 + 2) / 2); /* bloc racine au milieu, comme AmigaDOS */

  /* Carte des blocs libres : 127 mots longs de bits par bloc de carte, à partir du bloc 2 */
  const bitsPerMap = 127 * 32;
  const mapCount = Math.ceil((n - 2) / bitsPerMap);
  const extCount = mapCount > 25 ? Math.ceil((mapCount - 25) / 127) : 0;
  /* Blocs de carte (et d'extension) juste après la racine */
  const mapBlocks = [], extBlocks = [];
  let next = root + 1;
  for (let i = 0; i < mapCount; i++) mapBlocks.push(next++);
  for (let i = 0; i < extCount; i++) extBlocks.push(next++);
  const used = new Set([root, ...mapBlocks, ...extBlocks]);
  for (let m = 0; m < mapCount; m++) {
    const base = B(mapBlocks[m]);
    for (let w = 0; w < 127; w++) {
      let word = 0;
      for (let bit = 0; bit < 32; bit++) {
        const blk = 2 + m * bitsPerMap + w * 32 + bit;
        if (blk < n && !used.has(blk)) word |= 1 << bit; /* 1 = libre */
      }
      put32(dv, base + 4 + w * 4, word);
    }
    dosChecksum(dv, base, 0);
  }
  /* Blocs d'extension : 127 pointeurs vers les cartes au-delà des 25 de la racine, puis le suivant */
  for (let e = 0; e < extCount; e++) {
    const base = B(extBlocks[e]);
    for (let i = 0; i < 127; i++) { const k = 25 + e * 127 + i; if (k < mapCount) put32(dv, base + i * 4, mapBlocks[k]); }
    put32(dv, base + 508, e + 1 < extCount ? extBlocks[e + 1] : 0);
  }

  /* Bloc racine */
  const r = B(root);
  put32(dv, r + 0, 2);          /* T_HEADER */
  put32(dv, r + 12, 72);        /* HT_SIZE */
  put32(dv, r + 312, 0xffffffff); /* carte valide */
  for (let i = 0; i < Math.min(25, mapCount); i++) put32(dv, r + 316 + i * 4, mapBlocks[i]);
  put32(dv, r + 416, extCount ? extBlocks[0] : 0);
  const [days, mins, ticks] = amigaDate(now);
  for (const o of [420, 472, 484]) { put32(dv, o + r, days); put32(dv, o + r + 4, mins); put32(dv, o + r + 8, ticks); }
  const name = new TextEncoder().encode(label.replace(/[:\/]/g, "").slice(0, 30));
  img[r + 432] = name.length; img.set(name, r + 433);
  put32(dv, r + 508, 1);        /* ST_ROOT */
  dosChecksum(dv, r, 20);
  return img;
}
