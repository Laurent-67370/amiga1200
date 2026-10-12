#!/usr/bin/env node
// verify.mjs — round-trip check of adf2ipf.mjs through the official SPS decoder (WebAssembly build + ipf2scp).
//
//   node verify.mjs [in.adf]
//
// Without an argument a test ADF is generated (test.adf: formatted FFS disk, bootable boot block,
// every other block filled with pseudo-random bytes so that all 160 tracks carry distinct data).
// For three IPF variants (plain SPS, SPS --copylock --weak, CAPS-encoder --copylock --weak) it:
//   - converts with _ipf_to_scp, checks the result and the SCP header,
//   - decodes every revolution of every track from the SCP flux (25 ns ticks -> 2 us cells -> MFM),
//     finds the 11 AmigaDOS sectors (4489 4489 sync), checks MFM clocks, header/data checksums,
//     track/sector numbers, and compares the 512-byte payloads byte-for-byte with the ADF,
//   - measures the mean cell time per sector on the copylock track (density variation),
//   - checks ipf_flakey()=1, ipf_revs()=3 and that the weak track's revolutions differ only in its gap.
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { makeBlankAdf } from "../../wasm/web/adf.js";
import { adfToIpf } from "./adf2ipf.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const createIpf = require("../out/ipf.js");

let failures = 0;
const check = (cond, msg) => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) failures++; };

// ---------- test disk ----------
function makeTestAdf() {
  const adf = makeBlankAdf("IPFTEST", true, new Date(Date.UTC(2026, 0, 1)));
  // boot block: move.w $dff00a,d0 ; move.w d0,$dff180 ; bra.s loop (colour loop), as in amb/gen2.mjs
  adf.set([0x30, 0x39, 0x00, 0xdf, 0xf0, 0x0a, 0x33, 0xc0, 0x00, 0xdf, 0xf1, 0x80, 0x60, 0xf2], 12);
  let x = 0x12345678;
  for (let blk = 2; blk < 1760; blk++) {
    if (blk === 880 || blk === 881) continue;
    for (let i = 0; i < 512; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; adf[blk * 512 + i] = x & 255; }
  }
  const dv = new DataView(adf.buffer);
  dv.setUint32(4, 0);
  let s = 0;
  for (let i = 0; i < 1024; i += 4) { s += dv.getUint32(i); if (s > 0xffffffff) s = (s % 4294967296) + 1; }
  dv.setUint32(4, (~s) >>> 0);
  return adf;
}

// ---------- SCP parsing ----------
function parseScp(scp) {
  const dv = new DataView(scp.buffer, scp.byteOffset, scp.byteLength);
  const hdr = {
    sig: String.fromCharCode(scp[0], scp[1], scp[2]), ver: scp[3], disk: scp[4], revs: scp[5],
    start: scp[6], end: scp[7], flags: scp[8], width: scp[9], heads: scp[10], res: scp[11],
    sum: dv.getUint32(12, true),
  };
  let sum = 0; for (let i = 0x10; i < scp.length; i++) sum = (sum + scp[i]) >>> 0;
  hdr.sumOk = sum === hdr.sum;
  const tracks = [];
  for (let t = hdr.start; t <= hdr.end; t++) {
    const th = dv.getUint32(0x10 + t * 4, true);
    const ok = String.fromCharCode(scp[th], scp[th + 1], scp[th + 2]) === "TRK" && scp[th + 3] === t;
    const revs = [];
    for (let r = 0; r < hdr.revs; r++) {
      const e = th + 4 + r * 12;
      const index = dv.getUint32(e, true), count = dv.getUint32(e + 4, true), off = dv.getUint32(e + 8, true);
      const iv = [];
      let carry = 0;
      for (let i = 0; i < count; i++) {
        const w = dv.getUint16(th + off + i * 2, false);
        if (w === 0) { carry += 65536; continue; }
        iv.push(w + carry); carry = 0;
      }
      revs.push({ index, intervals: iv, raw: scp.subarray(th + off, th + off + count * 2) });
    }
    tracks.push({ ok, revs });
  }
  return { hdr, tracks };
}

// flux intervals (25 ns ticks) -> cell bits (1 = transition) + time (ticks) at the start of every cell
function fluxToCells(intervals) {
  const n = intervals.reduce((a, d) => a + Math.max(1, Math.round(d / 80)), 0);
  const bits = new Uint8Array(n), t0 = new Float64Array(n + 1);
  let c = 0, t = 0;
  for (const d of intervals) {
    const k = Math.max(1, Math.round(d / 80));
    for (let j = 0; j < k; j++) t0[c + j] = t + (d * j) / k;
    c += k; t += d; bits[c - 1] = 1;
  }
  t0[n] = t;
  return { bits, t0 };
}

const unOddEven = (enc) => {
  const n = enc.length, out = new Uint8Array(n);
  const bit = (p) => (enc[p >> 3] >> (7 - (p & 7))) & 1;
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let k = 0; k < 4; k++) v |= bit(i * 4 + k) << (7 - 2 * k);
    for (let k = 0; k < 4; k++) v |= bit(n * 4 + i * 4 + k) << (6 - 2 * k);
    out[i] = v;
  }
  return out;
};
const amigaSum = (f) => {
  let s = 0;
  for (let i = 0; i < f.length; i += 4) { const L = ((f[i] << 24) | (f[i + 1] << 16) | (f[i + 2] << 8) | f[i + 3]) >>> 0; s ^= ((L >>> 1) ^ L) & 0x55555555; }
  return s >>> 0;
};
const rd32 = (b) => ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;

// find & decode AmigaDOS sectors in a cell stream
function decodeTrack(bits) {
  const sectors = [];
  let w = 0;
  for (let p = 0; p < bits.length; p++) {
    w = ((w << 1) | bits[p]) >>> 0;
    if (w !== 0x44894489 || p + 1 + 540 * 16 > bits.length) continue;
    const start = p + 1, pay = new Uint8Array(540);
    let clockErr = 0, prev = 1;
    for (let k = 0; k < 540 * 8; k++) {
      const c = bits[start + 2 * k], d = bits[start + 2 * k + 1];
      if (c !== (prev || d ? 0 : 1)) clockErr++;
      if (d) pay[k >> 3] |= 0x80 >> (k & 7);
      prev = d;
    }
    const info = unOddEven(pay.subarray(0, 4)), label = unOddEven(pay.subarray(4, 20));
    const hsum = rd32(unOddEven(pay.subarray(20, 24))), dsum = rd32(unOddEven(pay.subarray(24, 28)));
    const data = unOddEven(pay.subarray(28, 540));
    sectors.push({
      syncAt: p - 31, end: start + 540 * 16, clockErr, fmt: info[0], track: info[1], sector: info[2], togap: info[3],
      hdrOk: hsum === (amigaSum(info) ^ amigaSum(label)), dataOk: dsum === amigaSum(data), data,
    });
    p = start + 540 * 16 - 1; w = 0;
  }
  return sectors;
}

// ---------- one IPF variant ----------
async function verifyVariant(Mod, adf, name, opts) {
  console.log(`\n== ${name} (${JSON.stringify(opts)})`);
  const ipf = adfToIpf(adf, { date: new Date(Date.UTC(2026, 0, 1)), ...opts });
  const file = path.join(HERE, name + ".ipf");
  fs.writeFileSync(file, ipf);
  console.log(`  wrote ${file} (${ipf.length} bytes)`);

  const ptr = Mod._malloc(ipf.length);
  Mod.HEAPU8.set(ipf, ptr);
  const res = Mod._ipf_to_scp(ptr, ipf.length);
  const err = Mod.UTF8ToString(Mod._ipf_error());
  check(res !== 0, `_ipf_to_scp succeeded${res ? "" : ": " + err}`);
  if (!res) { Mod._free(ptr); return; }
  const size = Mod._ipf_size();
  const scp = Mod.HEAPU8.slice(res, res + size);
  Mod._free(res); Mod._free(ptr);
  const revsN = Mod._ipf_revs(), flakey = Mod._ipf_flakey(), ntr = Mod._ipf_tracks();
  console.log(`  SCP ${size} bytes, ipf_tracks()=${ntr}, ipf_revs()=${revsN}, ipf_flakey()=${flakey}`);
  fs.writeFileSync(path.join(HERE, name + ".scp"), scp);

  const { hdr, tracks } = parseScp(scp);
  check(hdr.sig === "SCP" && hdr.start === 0 && hdr.end === 159 && hdr.sumOk && tracks.every((t) => t.ok),
    `SCP header/track headers/checksum valid (tracks ${hdr.start}-${hdr.end}, revs ${hdr.revs})`);
  check(ntr === 160, "160 tracks converted");
  const wantRevs = opts.weak ? 3 : 1;
  check(revsN === wantRevs && hdr.revs === wantRevs, `ipf_revs() = ${wantRevs}`);
  check(flakey === (opts.weak ? 1 : 0), `ipf_flakey() = ${opts.weak ? 1 : 0}`);

  // decode all tracks, all revolutions
  let badSectors = 0, goodSectors = 0, maxIndexUs = 0, minIndexUs = 1e9;
  const decoded = [];
  for (let t = 0; t < 160; t++) {
    decoded[t] = [];
    for (let r = 0; r < hdr.revs; r++) {
      const rev = tracks[t].revs[r];
      const iUs = (rev.index * 25) / 1000;
      maxIndexUs = Math.max(maxIndexUs, iUs); minIndexUs = Math.min(minIndexUs, iUs);
      const cells = fluxToCells(rev.intervals);
      const secs = decodeTrack(cells.bits);
      decoded[t][r] = { cells, secs };
      const seen = new Set();
      for (const s of secs) {
        const off = (t * 11 + s.sector) * 512;
        const same = s.sector < 11 && adf.subarray(off, off + 512).every((v, i) => v === s.data[i]);
        const ok = s.fmt === 0xff && s.track === t && s.togap === 11 - s.sector && s.hdrOk && s.dataOk && s.clockErr === 0 && same;
        if (ok && !seen.has(s.sector)) { seen.add(s.sector); goodSectors++; }
        else if (!ok) { badSectors++; if (badSectors < 10) console.log(`    bad sector t${t} r${r}:`, { ...s, data: undefined, same }); }
      }
      if (seen.size !== 11) { badSectors += 11 - seen.size; if (badSectors < 20) console.log(`    track ${t} rev ${r}: only ${seen.size}/11 sectors`); }
    }
  }
  check(badSectors === 0 && goodSectors === 160 * 11 * hdr.revs,
    `all ${160 * 11 * hdr.revs} sectors (160 tracks x 11 x ${hdr.revs} rev) decode with valid MFM + checksums and equal the ADF byte-for-byte`);
  console.log(`  revolution length ${minIndexUs.toFixed(1)}..${maxIndexUs.toFixed(1)} us`);

  // rebuild the full ADF from revolution 0 and compare
  const rebuilt = new Uint8Array(901120);
  for (let t = 0; t < 160; t++) for (const s of decoded[t][0].secs) if (s.sector < 11) rebuilt.set(s.data, (t * 11 + s.sector) * 512);
  check(rebuilt.every((v, i) => v === adf[i]), "ADF rebuilt from the SCP is identical to the input ADF (901120 bytes)");

  // density per sector
  const density = (t) => decoded[t][0].secs.map((s) => {
    const { t0 } = decoded[t][0].cells;
    return ((t0[s.end] - t0[s.syncAt]) * 25) / (s.end - s.syncAt); // ns per cell
  });
  const ref = density(10);
  check(ref.every((d) => Math.abs(d - 2000) < 1), `normal track 10: mean cell time per sector flat (${ref.map((d) => d.toFixed(0)).join(" ")} ns)`);
  if (opts.copylock) {
    const t = opts.copylockTrack ?? 158;
    const d = density(t);
    console.log(`  copylock track ${t}: mean cell time per sector = ${d.map((x) => x.toFixed(1)).join(" ")} ns`);
    check(d[4] < 1900 && d[5] > 1980 && d[5] < 2000 && d[6] > 2080 && [0, 1, 2, 3, 7, 8, 9, 10].every((i) => Math.abs(d[i] - 2000) < 1),
      "copylock track timebuf is non-flat: sector 4 ~-5.5%, sector 5 ~-0.5%, sector 6 ~+4.5%, others nominal");
  }
  if (opts.weak) {
    const t = opts.weakTrack ?? 159;
    const rv = tracks[t].revs.map((r) => r.raw);
    const differ = (a, b) => a.length !== b.length || a.some((v, i) => v !== b[i]);
    check(differ(rv[0], rv[1]) && differ(rv[1], rv[2]) && differ(rv[0], rv[2]), `weak track ${t}: the 3 revolutions' flux data all differ`);
    // where do they differ? compare cell streams
    // the flux is continuous across revolutions (the first interval of rev r+1 includes the tail of rev r),
    // so decode the 3 revolutions as one stream and cut it every 100000 cells (one index-to-index turn)
    // (the cells after the very last transition up to the final index carry no flux: pad them from the index times)
    const fx = fluxToCells(tracks[t].revs.flatMap((r) => r.intervals)).bits;
    const totalCells = Math.round(tracks[t].revs.reduce((a, r) => a + r.index, 0) / 80);
    const all = new Uint8Array(totalCells); all.set(fx.subarray(0, totalCells));
    check(totalCells === 300000 && fx.length >= totalCells - 2, `weak track ${t}: 3 revolutions = ${totalCells} cells (3 x 100000), ${fx.length} up to the last transition`);
    const c = [0, 1, 2].map((r) => all.subarray(r * 100000, (r + 1) * 100000));
    const n = 100000;
    let first = -1, last = -1;
    for (let i = 0; i < n; i++) if (c[0][i] !== c[1][i] || c[1][i] !== c[2][i]) { if (first < 0) first = i; last = i; }
    console.log(`  weak track ${t}: cell streams differ between cells ${first} and ${last} (sectors end at cell ${11 * 8704}; weak block = cells ${11 * 8704 + 64}..${11 * 8704 + 64 + 1023})`);
    check(first >= 11 * 8704 + 64 - 1 && last <= 11 * 8704 + 64 + 1024 + 1, "differences confined to the weak block in the track gap");
  }
}

const adfPath = process.argv[2];
let adf;
if (adfPath) adf = new Uint8Array(fs.readFileSync(adfPath));
else { adf = makeTestAdf(); fs.writeFileSync(path.join(HERE, "test.adf"), adf); console.log(`generated ${path.join(HERE, "test.adf")}`); }

const Mod = await createIpf();
await verifyVariant(Mod, adf, "test-plain", {});
await verifyVariant(Mod, adf, "test-protected", { copylock: true, weak: true });
await verifyVariant(Mod, adf, "test-caps-encoder", { caps: true, copylock: true, weak: true });
console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
