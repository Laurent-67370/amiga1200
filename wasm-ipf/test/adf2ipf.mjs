#!/usr/bin/env node
// adf2ipf.mjs — build an IPF (SPS/CAPS) image from a standard 880 KB AmigaDOS ADF.
//
//   node adf2ipf.mjs in.adf out.ipf [--copylock] [--weak] [--copylock-track N] [--weak-track N] [--caps]
//
// File layout (all integers big-endian, as CCapsLoader expects):
//   "CAPS" chunk (12 bytes), "INFO" chunk (12+84), 160 x "IMGE" (12+68), 160 x "DATA" (12+16 + data area)
// Every chunk header carries hcrc = CRC32 of the chunk header (hcrc field = 0). Each DATA area carries dcrc = CRC32.
// DATA area = CapsBlock[blkcnt] (32 bytes each) followed by one data stream per block.
//
// Track encoding (one block per sector, 2 us cells, 100000 cells per track = 200 ms at 300 rpm):
//   block k (k = 0..10): cpdatData 00 00 (-> MFM AAAA AAAA), cpdatMark 44 89 44 89 (raw sync),
//                        cpdatData 540 bytes (info/label/hdrsum/datasum/data, odd bits then even bits,
//                        stored as the *decoded* data bits; the decoder adds the MFM clock bits), cpdatEnd.
//                        blockbits = 8704 cells, gapbits = 0
//   last block gets the track gap (generated gap stream from gapvalue 0x00 -> MFM AAAA...).
// --copylock: the chosen track gets dentype cpdenCLAmiga: the decoder's GenerateCLA() varies cell timing
//             over blocks 4 (-5.5%), 5 (-0.5%) and 6 (+4.5%); sector data is unchanged.
// --weak:     the chosen track gets a 12th block inside the track gap holding cpdatFData (64 weak bytes = 1024
//             cells), and the IMGE flag CAPS_IF_FLAKEY; the 11 sectors stay intact.
import fs from "fs";
import { fileURLToPath } from "url";

// ---- CRC32 (Core/CRC.cpp: reflected poly 0xEDB88320, init ~0, final ~) ----
const CRCTAB = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let b = 0; b < 8; b++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
  return t;
})();
export function crc32(buf, start = 0, end = buf.length) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRCTAB[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- constants from Codec/CapsDefinitions.h ----
const CAPS_ENCODER = 1, SPS_ENCODER = 2;
const cpimtFDD = 1, cppidAmiga = 1;
const cpdenAuto = 2, cpdenCLAmiga = 3;
const cpsig2us = 1, cpbct2us = 1, cpencMFM = 1;
const cpdatEnd = 0, cpdatMark = 1, cpdatData = 2, cpdatFData = 5;
const CAPS_IF_FLAKEY = 1;
const CAPS_SIZE_S = 5;

export const TRACK_CELLS = 100000;          // 200 ms of 2 us cells
export const SECTOR_CELLS = (2 + 4 / 2 + 540) * 16; // 8704: preamble(2 data bytes) + sync(4 raw bytes) + 540 data bytes
const WEAK_BYTES = 64;                      // decoded bytes of weak data (x16 cells)

// ---- small helpers ----
class Bytes {
  constructor() { this.a = []; }
  u8(v) { this.a.push(v & 255); return this; }
  u32(v) { this.a.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); return this; }
  bytes(b) { for (const x of b) this.a.push(x & 255); return this; }
  get length() { return this.a.length; }
  out() { return Uint8Array.from(this.a); }
}

// one data-stream element: code | (sizeof(count) << 5), count (big-endian), then the sample
function element(s, type, count, sample) {
  const vc = count === 0 ? 0 : count < 0x100 ? 1 : count < 0x10000 ? 2 : count < 0x1000000 ? 3 : 4;
  s.u8(type | (vc << CAPS_SIZE_S));
  for (let i = vc - 1; i >= 0; i--) s.u8(count >>> (i * 8));
  if (sample) s.bytes(sample);
}

// AmigaDOS odd/even split of a field, as the *data bits* of its MFM encoding
// (odd longwords: bits 7,5,3,1 of each byte; then even longwords: bits 6,4,2,0)
function oddEven(field) {
  const n = field.length, out = new Uint8Array(n);
  let bitpos = 0;
  const put = (bit) => { if (bit) out[bitpos >> 3] |= 0x80 >> (bitpos & 7); bitpos++; };
  for (let i = 0; i < n; i++) for (let b = 7; b >= 1; b -= 2) put((field[i] >> b) & 1);
  for (let i = 0; i < n; i++) for (let b = 6; b >= 0; b -= 2) put((field[i] >> b) & 1);
  return out;
}

// AmigaDOS checksum: XOR of all MFM longwords masked with 0x55555555 = XOR over L of ((L>>1) ^ L) & 0x55555555
function amigaSum(field) {
  let s = 0;
  for (let i = 0; i < field.length; i += 4) {
    const L = ((field[i] << 24) | (field[i + 1] << 16) | (field[i + 2] << 8) | field[i + 3]) >>> 0;
    s ^= ((L >>> 1) ^ L) & 0x55555555;
  }
  return s >>> 0;
}
const be32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];

// 540 decoded bytes following the 4489 4489 sync
export function sectorPayload(track, sector, data512) {
  const info = Uint8Array.from([0xff, track, sector, 11 - sector]);
  const label = new Uint8Array(16);
  const hsum = amigaSum(info) ^ amigaSum(label);
  const dsum = amigaSum(data512);
  return Uint8Array.from([
    ...oddEven(info), ...oddEven(label), ...oddEven(Uint8Array.from(be32(hsum))),
    ...oddEven(Uint8Array.from(be32(dsum))), ...oddEven(data512),
  ]);
}

// returns { blocks: [{blockbits,gapbits,stream:Uint8Array}], dentype, flag }
function buildTrack(adf, track, opts) {
  const blocks = [];
  for (let s = 0; s < 11; s++) {
    const off = (track * 11 + s) * 512;
    const st = new Bytes();
    element(st, cpdatData, 2, [0, 0]);
    element(st, cpdatMark, 4, [0x44, 0x89, 0x44, 0x89]);
    element(st, cpdatData, 540, sectorPayload(track, s, adf.subarray(off, off + 512)));
    element(st, cpdatEnd, 0);
    blocks.push({ blockbits: SECTOR_CELLS, gapbits: 0, stream: st.out() });
  }
  let flag = 0;
  if (opts.weak) {
    const st = new Bytes();
    element(st, cpdatData, 4, [0, 0, 0, 0]);
    element(st, cpdatFData, WEAK_BYTES);       // weak bits: no sample bytes follow
    element(st, cpdatData, 4, [0, 0, 0, 0]);
    element(st, cpdatEnd, 0);
    blocks.push({ blockbits: (4 + WEAK_BYTES + 4) * 16, gapbits: 0, stream: st.out() });
    flag |= CAPS_IF_FLAKEY;
  }
  const used = blocks.reduce((a, b) => a + b.blockbits, 0);
  blocks[blocks.length - 1].gapbits = TRACK_CELLS - used;
  return { blocks, dentype: opts.copylock ? cpdenCLAmiga : cpdenAuto, flag };
}

function chunk(name, mod) {
  const size = 12 + mod.length;
  const c = new Uint8Array(size);
  c.set([...name].map((ch) => ch.charCodeAt(0)), 0);
  c.set(be32(size), 4);
  c.set(mod, 12);
  c.set(be32(crc32(c)), 8);          // hcrc computed with hcrc = 0
  return c;
}

export function adfToIpf(adf, options = {}) {
  if (adf.length !== 901120) throw new Error(`expected an 880 KB DD ADF (901120 bytes), got ${adf.length}`);
  const encoder = options.caps ? CAPS_ENCODER : SPS_ENCODER;
  const clTrack = options.copylock ? (options.copylockTrack ?? 158) : -1;
  const wkTrack = options.weak ? (options.weakTrack ?? 159) : -1;
  const now = options.date ?? new Date();
  const parts = [];

  parts.push(chunk("CAPS", new Uint8Array(0)));

  const date = now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  const time = now.getUTCHours() * 10000000 + now.getUTCMinutes() * 100000 + now.getUTCSeconds() * 1000 + now.getUTCMilliseconds();
  const info = new Bytes()
    .u32(cpimtFDD).u32(encoder).u32(1)       // type, encoder, encrev
    .u32(options.release ?? 9999).u32(1)      // release, revision
    .u32(crc32(adf))                          // origin: source reference (CRC32 of the ADF)
    .u32(0).u32(79).u32(0).u32(1)             // min/max cylinder, min/max head
    .u32(date).u32(time)
    .u32(cppidAmiga).u32(0).u32(0).u32(0)     // platforms
    .u32(1).u32(0)                            // disknum, userid
    .u32(0).u32(0).u32(0);
  parts.push(chunk("INFO", info.out()));

  const tracks = [];
  for (let t = 0; t < 160; t++) tracks.push(buildTrack(adf, t, { copylock: t === clTrack, weak: t === wkTrack }));

  tracks.forEach((tr, t) => {
    const databits = tr.blocks.reduce((a, b) => a + b.blockbits, 0);
    const gapbits = tr.blocks.reduce((a, b) => a + b.gapbits, 0);
    const imge = new Bytes()
      .u32(t >> 1).u32(t & 1).u32(tr.dentype).u32(cpsig2us)
      .u32(Math.ceil((databits + gapbits) / 8))   // trksize (bytes, rounded)
      .u32(0).u32(0)                              // startpos, startbit
      .u32(databits).u32(gapbits).u32(databits + gapbits)
      .u32(tr.blocks.length).u32(0).u32(tr.flag)  // blkcnt, process, flag
      .u32(t + 1)                                 // did (must be non-zero)
      .u32(0).u32(0).u32(0);
    parts.push(chunk("IMGE", imge.out()));
  });

  tracks.forEach((tr, t) => {
    const area = new Bytes();
    let ofs = tr.blocks.length * 32;
    for (const b of tr.blocks) {
      area.u32(b.blockbits).u32(b.gapbits);
      if (encoder === SPS_ENCODER) area.u32(0).u32(cpbct2us);          // gapoffset, celltype
      else area.u32(Math.ceil(b.blockbits / 8)).u32(Math.ceil(b.gapbits / 8)); // CAPS: blocksize, gapsize
      area.u32(cpencMFM).u32(0).u32(0).u32(ofs);                      // enctype, flag, gapvalue, dataoffset
      ofs += b.stream.length;
    }
    for (const b of tr.blocks) area.bytes(b.stream);
    const a = area.out();
    const mod = new Bytes().u32(a.length).u32(a.length * 8).u32(crc32(a)).u32(t + 1).out();
    parts.push(chunk("DATA", mod), a);
  });

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

// ---- CLI ----
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const args = process.argv.slice(2);
  const files = [], opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--copylock") opts.copylock = true;
    else if (a === "--weak") opts.weak = true;
    else if (a === "--caps") opts.caps = true;
    else if (a === "--copylock-track") { opts.copylock = true; opts.copylockTrack = +args[++i]; }
    else if (a === "--weak-track") { opts.weak = true; opts.weakTrack = +args[++i]; }
    else files.push(a);
  }
  if (files.length !== 2) {
    console.error("usage: node adf2ipf.mjs in.adf out.ipf [--copylock] [--weak] [--copylock-track N] [--weak-track N] [--caps]");
    process.exit(2);
  }
  const ipf = adfToIpf(new Uint8Array(fs.readFileSync(files[0])), opts);
  fs.writeFileSync(files[1], ipf);
  console.log(`${files[1]}: ${ipf.length} bytes` +
    (opts.copylock ? `, copylock (cpdenCLAmiga) on track ${opts.copylockTrack ?? 158}` : "") +
    (opts.weak ? `, weak bits (cpdatFData) on track ${opts.weakTrack ?? 159}` : ""));
}
