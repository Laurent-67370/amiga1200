/* =========================================================
   CD32 : la console CD de Commodore (AGA, puce Akiko, CD audio, manette à 7 boutons)
   =========================================================
   Le cœur PUAE l'émule entièrement (préréglage « CD32 »). Il lui faut les ROM de la console : le Kickstart
   CD32 40.060 et sa ROM d'extension, ou les deux réunies en une ROM d'1 Mo. Les CD sont des images .iso ou
   .cue avec leurs pistes .bin (CD audio compris), rangées par morceaux de 8 Mo comme les disques durs. */
const ICON_CD = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="19" fill="#c9ced6"/><circle cx="24" cy="24" r="19" fill="url(#cdShine)"/><defs><linearGradient id="cdShine" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9ad5" stop-opacity=".55"/><stop offset=".35" stop-color="#9ad7ff" stop-opacity=".5"/><stop offset=".65" stop-color="#b8ff9a" stop-opacity=".45"/><stop offset="1" stop-color="#ffe49a" stop-opacity=".5"/></linearGradient></defs><circle cx="24" cy="24" r="6.5" fill="#3a404a"/><circle cx="24" cy="24" r="2.6" fill="#0b0e12"/></svg>';
const CD_MAX = 1024 * 1048576;
let cdGame = null; /* CD de la session en cours (enregistrement de la Bibliothèque) */

/* ---- ROM de la CD32 ---- */
const CD32_CRC = { 0x1e62d4a5: "main", 0x87746be2: "ext" };
async function plainRomBytes(u8) {
  if (u8.length < 11 || u8ToStr(u8.subarray(0, 11)) !== "AMIROMTYPE1") return u8;
  const k = S.keyId ? await DB.get(S.keyId) : null; if (!k) return null;
  const key = new Uint8Array(await k.blob.arrayBuffer()), out = u8.slice(11);
  for (let i = 0; i < out.length; i++) out[i] ^= key[i % key.length];
  return out;
}
/* "main" (Kickstart CD32), "ext" (extension), "combined" (les deux en 1 Mo) ou null */
async function cd32Role(name, u8) {
  const p = await plainRomBytes(u8); if (!p) return /cd32/i.test(name) ? (/ext/i.test(name) ? "ext" : "main") : null;
  const known = CD32_CRC[crc32u8(p)]; if (known) return known;
  const v = kickVersion(p), cd32ver = v && v[0] === 40 && v[1] === 60;
  if (p.length === 1048576 && (cd32ver || /cd32/i.test(name))) return "combined";
  if (p.length === 524288 && /cd32/i.test(name)) return /ext/i.test(name) ? "ext" : "main";
  if (p.length === 524288 && cd32ver) return "main";
  return null;
}
const CD32_LABEL = { main: "Kickstart CD32 (40.060)", ext: "Extension CD32 (40.060)", combined: "ROM CD32 complète (40.060)" };
/* Une ROM de CD32 importée ne devient pas le Kickstart de l'A1200 */
{ const _ib = importBytes;
  importBytes = async (name, u8, target, mount, quiet) => {
    if (guessKind(name, u8) === "rom") {
      const role = await cd32Role(name, u8);
      if (role) {
        /* Les ROM CD32 déjà rangées (fichier identique) ne sont pas dupliquées */
        if ((await DB.all()).some(r => r.kind === "rom" && r.crc === crc32u8(u8))) { if (!quiet) toast(name + " est déjà dans la Bibliothèque."); return null; }
        const rec = { id: newId(), kind: "rom", name, size: u8.length, blob: new Blob([u8]), crc: crc32u8(u8), added: Date.now(), label: CD32_LABEL[role], cd32: role };
        await DB.put(rec);
        if (!quiet) toast(CD32_LABEL[role] + " ajoutée : elle servira aux CD de CD32.");
        if (typeof renderRomChoices === "function") renderRomChoices();
        return rec;
      }
    }
    return _ib(name, u8, target, mount, quiet);
  }; }
/* ROM pour la CD32 : { main, ext } (octets en clair), ext absent si la ROM est complète ; null s'il en manque */
async function cd32Roms() {
  const roms = (await DB.all()).filter(r => r.kind === "rom");
  const by = {};
  for (const r of roms) {
    if (r.cd32 === undefined) { r.cd32 = await cd32Role(r.name, new Uint8Array(await r.blob.arrayBuffer())) || false; await DB.put(r); }
    if (r.cd32 && !by[r.cd32]) by[r.cd32] = r;
  }
  const bytes = async r => plainRomBytes(new Uint8Array(await r.blob.arrayBuffer()));
  if (by.combined) return { id: by.combined.id, main: await bytes(by.combined), ext: null };
  if (by.main && by.ext) return { id: by.main.id, main: await bytes(by.main), ext: await bytes(by.ext) };
  return null;
}

/* État des ROM pour l'accueil : { ok, label } */
async function cd32RomStatus(all) {
  const roms = (all || await DB.all()).filter(r => r.kind === "rom" && r.cd32);
  const has = k => roms.some(r => r.cd32 === k);
  if (has("combined")) return { ok: true, label: CD32_LABEL.combined };
  if (has("main") && has("ext")) return { ok: true, label: "Kickstart CD32 + extension (40.060)" };
  if (has("main")) return { ok: false, label: "Kickstart CD32 seul (il manque l'extension)" };
  if (has("ext")) return { ok: false, label: "extension seule (il manque le Kickstart CD32)" };
  return { ok: false, label: "" };
}
function pickFiles(accept, cb) {
  const inp = $("#filePick"); inp.value = ""; inp.multiple = true; inp.accept = accept;
  inp.onchange = () => { if (inp.files.length) cb([...inp.files]); };
  inp.click();
}
/* Les ROM importées à l'accueil le rafraîchissent */
{ const _ib = importBytes; importBytes = async (...a) => { const r = await _ib(...a); renderLauncherSoon(); return r; }; }

/* ---- Images de CD : .iso, ou .cue avec ses pistes .bin ---- */
let importBatch = [];
/* Les fichiers choisis ou déposés ensemble : un .cue y trouve ses pistes */
document.addEventListener("change", e => { if (e.target && e.target.type === "file" && e.target.files) importBatch = [...e.target.files]; }, true);
window.addEventListener("drop", e => { importBatch = [...((e.dataTransfer && e.dataTransfer.files) || [])]; }, true);
const cueFiles = text => [...text.matchAll(/^\s*FILE\s+(?:"([^"]+)"|(\S+))/gim)].map(m => (m[1] || m[2]).split(/[\\/]/).pop());
const cdFileRec = (rec, k) => ({ id: rec.id + "/" + k, chunks: rec.files[k].chunks, size: rec.files[k].size });
async function importCd(name, parts, cue) {
  const total = parts.reduce((a, p) => a + p.size, 0);
  if (total > CD_MAX) { toast(name + " : image trop grosse (" + fmtSize(total) + ").", true); return null; }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  const rec = { id: newId(), kind: "cd", name, size: total, cue: cue || null, files: [], added: Date.now() };
  toast("Import de " + name + " (" + fmtSize(total) + ")…");
  try {
    for (const [k, p] of parts.entries()) {
      const fr = { id: rec.id + "/" + k };
      await storeChunks(fr, p, null, f => toast("Import de " + name + " : " + Math.round((k + f) / parts.length * 100) + " %"));
      rec.files.push({ name: p.name, size: fr.size, chunks: fr.chunks });
    }
    await DB.put(rec);
  } catch (e) {
    for (const [k] of rec.files.entries()) { const fr = cdFileRec(rec, k); for (let i = 0; i < fr.chunks; i++) try { await DB.del(chunkId(fr, i)); } catch (x) {} }
    toast(name + " : enregistrement impossible (" + (e && e.name === "QuotaExceededError" ? "plus de place pour ce site dans le navigateur" : e.message || e) + ").", true);
    return null;
  }
  toast(name.replace(/\.(cue|iso)$/i, "") + " ajouté : une touche sur sa vignette pour le lancer sur la CD32.");
  if ($("#winLib").classList.contains("open")) renderLib();
  return rec;
}
{ const _imp = importFile;
  importFile = async (file, target) => {
    const n = file.name.toLowerCase();
    if (n.endsWith(".iso")) return importCd(file.name, [file], null);
    if (n.endsWith(".cue")) {
      const text = await file.text(), wanted = cueFiles(text);
      const pool = importBatch.filter(f => f !== file);
      const parts = wanted.map(w => pool.find(f => f.name.toLowerCase() === w.toLowerCase()));
      const missing = wanted.filter((w, i) => !parts[i]);
      if (!wanted.length) { toast(file.name + " : aucune piste dans ce fichier .cue.", true); return; }
      if (missing.length) { toast(file.name + " : choisissez aussi " + missing.join(", ") + " en même temps que le .cue (sélection multiple, ou glissez-les ensemble).", true); return; }
      return importCd(file.name, parts, text);
    }
    if (n.endsWith(".bin") && file.size > 2 * 1048576) {
      /* Piste d'un CD : prise en charge par son .cue quand il est dans le même lot */
      if (importBatch.some(f => /\.cue$/i.test(f.name))) return;
      toast(file.name + " : piste de CD, ouvrez plutôt le fichier .cue en même temps que ses pistes .bin.", true); return;
    }
    return _imp(file, target);
  }; }
/* « Ouvrir un fichier… » accepte plusieurs fichiers à la fois (un .cue et ses pistes) */
$("#lOpen").onclick = () => {
  const inp = $("#filePick"); inp.value = ""; inp.multiple = true;
  inp.accept = ".adf,.adz,.dms,.zip,.gz,.lha,.lzh,.hdf,.rom,.bin,.key,.tar,.iso,.cue";
  inp.onchange = async () => { for (const f of [...inp.files]) await importFile(f); };
  inp.click();
};
/* Supprimer un CD emporte ses morceaux */
{ const _del = DB.del;
  DB.del = async id => {
    const rec = await DB.get(id);
    if (rec && rec.kind === "cd") for (const [k] of (rec.files || []).entries()) { const fr = cdFileRec(rec, k); for (let i = 0; i < (fr.chunks || 0); i++) await _del(chunkId(fr, i)); }
    return _del(id);
  }; }

/* ---- Lancer un CD ---- */
async function launchCd(rec) {
  if (running || starting) return;
  if (!(await cd32Roms())) {
    toast("La CD32 a besoin de ses ROM : le Kickstart CD32 40.060 et sa ROM d'extension (ou la ROM CD32 complète d'1 Mo, Amiga Forever compris). Importez-les dans Configuration → Kickstart, puis touchez à nouveau le CD.", true);
    return;
  }
  for (const t of FD_TAGS) if (mounted[t]) await ejectMedia(t, true);
  whdGame = null; cdGame = rec;
  rec.used = Date.now(); await DB.put(rec);
  powerOn();
}
/* Fichiers du CD écrits dans le système de fichiers du cœur ; renvoie le chemin à monter */
async function writeCd(m, rec) {
  for (const [k, f] of rec.files.entries()) m.writeFile("/media/cd/" + f.name, await recBytes(cdFileRec(rec, k)));
  if (rec.cue) { const p = "/media/cd/" + safeName(rec.name); m.writeFile(p, new TextEncoder().encode(rec.cue)); return p; }
  return "/media/cd/" + rec.files[0].name;
}
{ const _l = launchWith; launchWith = async rec => { if (rec.kind === "cd") return launchCd(rec); cdGame = null; return _l(rec); }; }
{ const _w = launchWhd; launchWhd = async rec => { cdGame = null; return _w(rec); }; }
{ const _off = powerOff; powerOff = async () => { await _off(); cdGame = null; delete document.documentElement.dataset.cd32; }; }
