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
 * @param {string} device   nom de la partition (DH0, DH1…)
 * @param {number} bootPri  priorité de démarrage (0 pour DH0:, négative pour les autres)
 * @returns {Uint8Array}    image .hdf complète
 */
export function makeHardDisk(sizeMB, label = "Travail", now = new Date(), device = "DH0", bootPri = 0) {
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
  img[p + 36] = device.length; putStr(img, p + 37, device, 31);
  /* DosEnvec à l'octet 128 */
  const env = [16, 128, 0, HEADS, 1, SECTORS, 2, 0, 0, 1, cyls - 1, 30, 0, 0x7fffffff, 0xfffffffe, bootPri >>> 0, 0x444f5301, 0, 0, 0, 0];
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

/* ---------- Images sans RDB (« partition hardfile » de WinUAE) ---------- */

const DOS_NAMES = { 0: "OFS", 1: "FFS", 2: "OFS international", 3: "FFS international", 4: "OFS cache", 5: "FFS cache", 6: "OFS noms longs", 7: "FFS noms longs" };

/**
 * Regarde le début d'une image .hdf.
 * @param {Uint8Array} head  au moins les 16 premiers blocs (8 Ko)
 * @returns {{rdb:boolean, dosType:number|null, fs:string|null}}
 */
export function inspectHdf(head) {
  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  for (let b = 0; b < 16 && (b + 1) * BS <= head.length; b++) if (get32(dv, b * BS) === 0x5244534b) return { rdb: true, dosType: null, fs: null }; /* RDSK */
  if (head.length < 4) return { rdb: false, dosType: null, fs: null };
  const t = get32(dv, 0), id = t >>> 8, v = t & 0xff;
  const tag = String.fromCharCode(t >>> 24, (t >>> 16) & 255, (t >>> 8) & 255);
  if (id === 0x444f53 && v <= 7) return { rdb: false, dosType: t, fs: DOS_NAMES[v] };          /* DOS\0 … DOS\7 */
  if (/^(PFS|PDS|SFS|AFS|FAT|BFF)$/.test(tag)) return { rdb: false, dosType: t, fs: tag + "\\" + v };
  return { rdb: false, dosType: null, fs: null };
}

/**
 * Bloc racine d'une partition FFS/OFS : où AmigaDOS le cherche selon le nombre de blocs réservés.
 * Lit la racine dans `rootBlock` (512 octets) et indique si elle est valide.
 */
export function rootCandidate(nBlocks, reserved) { return Math.floor((nBlocks - 1 + reserved) / 2); }
export function isRootBlock(blk) {
  if (!blk || blk.length < BS) return false;
  const dv = new DataView(blk.buffer, blk.byteOffset, BS);
  if (get32(dv, 0) !== 2 || get32(dv, 508) !== 1) return false;
  let sum = 0; for (let i = 0; i < BS; i += 4) sum = (sum + get32(dv, i)) >>> 0;
  return sum === 0;
}

/**
 * En-tête RDB à placer devant une image de partition pour en faire un disque complet,
 * démarrable sur le contrôleur IDE. La partition garde exactement son nombre de blocs.
 * @param {number} nBlocks   taille de la partition en blocs de 512 octets
 * @param {number} dosType   type lu dans son bloc d'amorce (ex. 0x444f5301)
 * @param {number} reserved  blocs réservés de la partition (2 en général)
 * @returns {Uint8Array} blocs à mettre devant l'image
 */
export function rdbHeaderFor(nBlocks, dosType, reserved = 2) {
  /* Cylindre = s blocs (1 tête) avec s diviseur de la taille : la partition tombe juste sur des cylindres */
  let s = 1;
  for (let c = 256; c >= 2; c--) if (nBlocks % c === 0) { s = c; break; }
  const rdbCyls = Math.max(1, Math.ceil(2 / s));
  const hdr = rdbCyls * s, cyls = rdbCyls + nBlocks / s;
  const img = new Uint8Array(hdr * BS), dv = new DataView(img.buffer);
  putStr(img, 0, "RDSK", 4);
  put32(dv, 4, 64); put32(dv, 12, 7); put32(dv, 16, BS); put32(dv, 20, 0);
  put32(dv, 24, 0xffffffff); put32(dv, 28, 1); put32(dv, 32, 0xffffffff); put32(dv, 36, 0xffffffff);
  for (let o = 40; o < 64; o += 4) put32(dv, o, 0xffffffff);
  put32(dv, 64, cyls); put32(dv, 68, s); put32(dv, 72, 1); put32(dv, 76, 1); put32(dv, 80, cyls);
  put32(dv, 96, cyls); put32(dv, 100, cyls); put32(dv, 104, 3);
  put32(dv, 128, 0); put32(dv, 132, hdr - 1); put32(dv, 136, rdbCyls); put32(dv, 140, cyls - 1);
  put32(dv, 144, s); put32(dv, 152, 1);
  putStr(img, 160, "AMIGA1200", 8); putStr(img, 168, "DISQUE DUR", 16); putStr(img, 184, "1.0", 4);
  rdbChecksum(dv, 0, 64);
  const p = BS;
  putStr(img, p, "PART", 4);
  put32(dv, p + 4, 64); put32(dv, p + 12, 7); put32(dv, p + 16, 0xffffffff); put32(dv, p + 20, 1);
  img[p + 36] = 3; putStr(img, p + 37, "DH0", 31);
  const env = [16, 128, 0, 1, 1, s, reserved, 0, 0, rdbCyls, cyls - 1, 30, 0, 0x7fffffff, 0xfffffffe, 0, dosType >>> 0, 0, 0, 0, 0];
  env.forEach((v, i) => put32(dv, p + 128 + i * 4, v));
  rdbChecksum(dv, p, 64);
  return img;
}

/**
 * Noms des partitions d'un disque RDB, rendus uniques : deux disques préparés chacun avec une partition DH0:
 * ne peuvent pas être montés ensemble. Une partition dont le nom est déjà pris reçoit le premier nom DHn libre
 * (somme de contrôle refaite). Modifie l'image en mémoire ; les noms retenus sont ajoutés à `used`.
 * @param {Uint8Array} img  image du disque (au moins son premier cylindre)
 * @param {Set<string>} used  noms déjà pris (en majuscules)
 * @returns {{from:string, to:string}[]} partitions renommées
 */
export function uniquePartitionNames(img, used) {
  const dv = new DataView(img.buffer, img.byteOffset, img.byteLength), renamed = [];
  let rdsk = -1;
  for (let b = 0; b < 16 && (b + 1) * BS <= img.length; b++) if (get32(dv, b * BS) === 0x5244534b) { rdsk = b; break; }
  if (rdsk < 0) return renamed;
  let blk = get32(dv, rdsk * BS + 28);
  for (let guard = 0; blk !== 0xffffffff && guard < 64 && (blk + 1) * BS <= img.length; guard++) {
    const p = blk * BS;
    if (get32(dv, p) !== 0x50415254) break; /* PART */
    const len = Math.min(img[p + 36], 31);
    const name = new TextDecoder("latin1").decode(img.subarray(p + 37, p + 37 + len));
    let key = name.toUpperCase();
    if (used.has(key)) {
      let n = 0; while (used.has("DH" + n)) n++;
      const to = "DH" + n;
      img.fill(0, p + 36, p + 68); img[p + 36] = to.length; putStr(img, p + 37, to, 31);
      rdbChecksum(dv, p, Math.min(get32(dv, p + 4), 128));
      renamed.push({ from: name, to }); key = to;
    }
    used.add(key);
    blk = get32(dv, p + 16);
  }
  return renamed;
}

/**
 * Fin (en octets) de la dernière partition déclarée par la table de partitions (RDB), ou 0 sans RDB.
 * Une image plus courte que sa table (recopiée d'une carte plus petite, ou coupée) empêche PFS3 et d'autres
 * systèmes de fichiers de démarrer : au montage, ils lisent le dernier bloc de leur partition.
 * @param {Uint8Array} img  image du disque (au moins les blocs de la table)
 */
export function rdbEnd(img) {
  const dv = new DataView(img.buffer, img.byteOffset, img.byteLength);
  let rdsk = -1;
  for (let b = 0; b < 16 && (b + 1) * BS <= img.length; b++) if (get32(dv, b * BS) === 0x5244534b) { rdsk = b; break; }
  if (rdsk < 0) return 0;
  let end = 0, blk = get32(dv, rdsk * BS + 28);
  for (let guard = 0; blk !== 0xffffffff && guard < 64 && (blk + 1) * BS <= img.length; guard++) {
    const p = blk * BS;
    if (get32(dv, p) !== 0x50415254) break; /* PART */
    const env = p + 128, size = get32(dv, env + 4) * 4 || BS, heads = get32(dv, env + 12), spt = get32(dv, env + 20), high = get32(dv, env + 40);
    if (heads && spt && high < 0x1000000) end = Math.max(end, (high + 1) * heads * spt * size);
    blk = get32(dv, p + 16);
  }
  return end;
}

/* Géométrie CHS que l'IDE d'UAE annonce par défaut (getchsgeometry de hardfile.c) */
function ideDefaultChs(bytes) {
  const total = Math.floor(bytes / BS);
  let spt = 63, head = 4, cyl = 0;
  for (const s of [63, 127, 255]) {
    const maxhead = s < 255 ? 16 : 255;
    spt = s;
    for (head = 4; head <= maxhead; head++) {
      cyl = Math.floor(total / (head * spt));
      if (bytes <= 512 * 1048576) { if (cyl <= 1023) break; }
      else if (cyl < 16383 || (cyl < 32767 && head >= 5) || cyl <= 65535) break;
      if (maxhead > 16) head = head * 2 - 1;
    }
    if (head <= 16) break;
  }
  if (head > 16) head--;
  return [cyl, head, spt];
}

/**
 * Géométrie à imposer au disque IDE quand celle d'UAE par défaut s'arrête avant la fin de l'image : le scsi.device du
 * Kickstart ne lit pas au-delà de cylindres × têtes × secteurs, et une partition qui va jusqu'au dernier bloc devient
 * illisible à sa fin (PFS3 : « Can't read block … »). Renvoie "cyl/têtes/secteurs" pour hardfile2, ou "" si inutile.
 */
export function ideGeometry(bytes) {
  const blocks = Math.floor(bytes / BS), [c, h, s] = ideDefaultChs(bytes);
  if (c * h * s >= blocks || blocks > 16383 * 16 * 63) return "";
  return Math.ceil(blocks / (16 * 63)) + "/16/63";
}

/* ---------- Systèmes de fichiers des tables de partitions (FSHD + LSEG) ---------- */
const ID_RDSK = 0x5244534b, ID_PART = 0x50415254, ID_FSHD = 0x46534844, ID_LSEG = 0x4c534547;
const ROM_DOSTYPES = v => (v >>> 8) === 0x444f53 && (v & 255) <= 7; /* DOS\0 … DOS\7 : dans le Kickstart */

function rdskOf(dv, len) {
  for (let b = 0; b < 16 && (b + 1) * BS <= len; b++) if (get32(dv, b * BS) === ID_RDSK) return b;
  return -1;
}

/**
 * Pilotes de systèmes de fichiers fournis par un disque dans sa table de partitions.
 * @param {Uint8Array} img  début du disque (sa zone RDB)
 * @returns {{dosType:number, blocks:Uint8Array[]}[]}  pour chacun : le bloc FSHD puis ses blocs LSEG (le code)
 */
export function rdbFileSystems(img) {
  const dv = new DataView(img.buffer, img.byteOffset, img.byteLength), out = [];
  const rdsk = rdskOf(dv, img.length); if (rdsk < 0) return out;
  const inImg = b => b !== 0xffffffff && (b + 1) * BS <= img.length;
  for (let f = get32(dv, rdsk * BS + 32), g = 0; inImg(f) && g < 16 && get32(dv, f * BS) === ID_FSHD; g++) {
    const blocks = [img.slice(f * BS, f * BS + BS)];
    let ok = true;
    for (let l = get32(dv, f * BS + 72), n = 0; l !== 0xffffffff; n++) {
      if (!inImg(l) || n > 4096 || get32(dv, l * BS) !== ID_LSEG) { ok = false; break; }
      blocks.push(img.slice(l * BS, l * BS + BS)); l = get32(dv, l * BS + 16);
    }
    if (ok && blocks.length > 1) out.push({ dosType: get32(dv, f * BS + 32), blocks });
    f = get32(dv, f * BS + 16);
  }
  return out;
}

/** Types de partitions du disque qui n'ont ni pilote dans sa table ni pilote dans le Kickstart */
export function rdbMissingFs(img) {
  const dv = new DataView(img.buffer, img.byteOffset, img.byteLength);
  const rdsk = rdskOf(dv, img.length); if (rdsk < 0) return [];
  const have = new Set(rdbFileSystems(img).map(f => f.dosType)), miss = new Set();
  for (let p = get32(dv, rdsk * BS + 28), g = 0; p !== 0xffffffff && (p + 1) * BS <= img.length && g < 64 && get32(dv, p * BS) === ID_PART; g++) {
    const t = get32(dv, p * BS + 128 + 64);
    if (!have.has(t) && !ROM_DOSTYPES(t)) miss.add(t);
    p = get32(dv, p * BS + 16);
  }
  return [...miss];
}

/**
 * Ajoute à la table de partitions un pilote pris sur un autre disque, enregistré pour le type `dosType` :
 * blocs libres de la zone RDB (avant la première partition), FSHD en tête de la liste des pilotes.
 * Modifie `img` ; renvoie les numéros des blocs changés, ou null s'il n'y a pas la place.
 */
export function rdbAddFileSystem(img, fs, dosType) {
  const dv = new DataView(img.buffer, img.byteOffset, img.byteLength);
  const rdsk = rdskOf(dv, img.length); if (rdsk < 0) return null;
  const R = rdsk * BS;
  /* Fin de la zone libre : dernier bloc RDB annoncé, sans entamer la première partition */
  let limit = Math.min(get32(dv, R + 132) + 1, Math.floor(img.length / BS));
  for (let p = get32(dv, R + 28), g = 0; p !== 0xffffffff && (p + 1) * BS <= img.length && g < 64 && get32(dv, p * BS) === ID_PART; g++) {
    const e = p * BS + 128, start = get32(dv, e + 36) * get32(dv, e + 12) * get32(dv, e + 20);
    if (start) limit = Math.min(limit, start);
    p = get32(dv, p * BS + 16);
  }
  const used = id => id === ID_RDSK || id === ID_PART || id === ID_FSHD || id === ID_LSEG || id === 0x42414442 || id === 0x44525649;
  const free = [];
  for (let b = rdsk + 1; b < limit && free.length < fs.blocks.length; b++) if (!used(get32(dv, b * BS))) free.push(b);
  if (free.length < fs.blocks.length) return null;
  const changed = [];
  fs.blocks.forEach((src, i) => {
    const b = free[i], o = b * BS;
    img.set(src, o);
    if (i === 0) {
      put32(dv, o + 16, get32(dv, R + 32));             /* suivant : l'ancienne tête de liste */
      put32(dv, o + 32, dosType);                        /* type de partition servi */
      put32(dv, o + 72, free[1]);                        /* premier bloc de code */
    } else put32(dv, o + 16, i + 1 < fs.blocks.length ? free[i + 1] : 0xffffffff);
    rdbChecksum(dv, o, Math.min(get32(dv, o + 4), 128));
    changed.push(b);
  });
  put32(dv, R + 32, free[0]);
  put32(dv, R + 152, Math.max(get32(dv, R + 152), free[free.length - 1]));
  rdbChecksum(dv, R, Math.min(get32(dv, R + 4), 128));
  changed.push(rdsk);
  return changed;
}
