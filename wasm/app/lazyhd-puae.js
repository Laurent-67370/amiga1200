/* =========================================================
   Disques durs lus sur place (WinUAE 6)
   =========================================================
   « Sur place… » sur un disque dur : le fichier .hdf choisi n'est pas importé ; le cœur en lit les blocs au fur
   et à mesure, directement dans le fichier de l'appareil. Pas de limite de taille (au-delà de 2 Go, jusqu'à
   ce que le Kickstart sait lire), rien ne s'ajoute au stockage du navigateur, sauf ce que l'Amiga y écrit : le
   fichier d'origine n'est jamais modifié, ses blocs modifiés sont gardés dans le navigateur et réappliqués au
   prochain allumage. L'accès au fichier vaut pour la séance (le navigateur ne le redonne pas après un
   rechargement) : un seul choix de fichiers suffit à tout rebrancher. */
/* Ce que contient le disque, lu dans sa table de partitions (RDB) : pour comprendre d'un coup d'œil un disque qui ne monte pas */
async function lazyDescribe(f) {
  try {
    const u8 = new Uint8Array(await f.slice(0, 2097152).arrayBuffer()), dv = new DataView(u8.buffer);
    const g32 = o => dv.getUint32(o, false), tag4 = v => String.fromCharCode(v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255) + "\\" + (v & 255);
    let rdsk = -1;
    for (let b = 0; b < 16; b++) if (g32(b * 512) === 0x5244534b) { rdsk = b; break; }
    if (rdsk < 0) { const t = g32(0); return /^(DOS|PFS|SFS|PDS)/.test(tag4(t)) ? "Partition seule (" + tag4(t) + "), sans table de partitions : elle ne sera pas montée, il faut une image de disque complet (RDB)." : "Ni table de partitions (RDB) ni partition reconnue au début du fichier."; }
    const parts = [];
    for (let blk = g32(rdsk * 512 + 28), guard = 0; blk !== 0xffffffff && guard < 32 && (blk + 1) * 512 <= u8.length; guard++) {
      const p = blk * 512; if (g32(p) !== 0x50415254) break;
      const name = new TextDecoder("latin1").decode(u8.subarray(p + 37, p + 37 + Math.min(u8[p + 36], 31)));
      parts.push(name + ": " + tag4(g32(p + 128 + 64)) + (g32(p + 20) & 2 ? " (sans montage auto)" : ""));
      blk = g32(p + 16);
    }
    const fs = rdbFileSystems(u8).map(x => tag4(x.dosType) + " v" + (u8.length && x.blocks[0] ? (x.blocks[0][36] << 8 | x.blocks[0][37]) + "." + (x.blocks[0][38] << 8 | x.blocks[0][39]) : "?"));
    return "Partitions : " + (parts.join(", ") || "aucune") + " ; pilotes sur le disque : " + (fs.join(", ") || "aucun") + ".";
  } catch (e) { return ""; }
}
/* Disposition des disques sur place, gardée dans les réglages : le navigateur ne redonne pas l'accès aux fichiers
   après un rechargement (et rallumer recharge la page), mais un seul choix de fichiers suffit à tout rebrancher,
   chaque fichier retrouvant son unité d'après son nom et sa taille */
function lazyPlan() { const p = S.lazyPlan || {}; return { slots: p.slots || {}, extra: p.extra || [] }; }
function lazyPlanSave(p) { S.lazyPlan = p; saveSettings(); renderLazyPending(); }
function lazyPlanSlot(tag, f) { const p = lazyPlan(); if (f) p.slots[tag] = { n: f.name, s: f.size }; else delete p.slots[tag]; lazyPlanSave(p); }
function lazyPlanExtra() { const p = lazyPlan(); p.extra = lazyExtra.map(f => ({ n: f.name, s: f.size })); lazyPlanSave(p); }
/* Disques prévus mais pas encore rebranchés dans cette page */
function lazyPending() {
  const p = lazyPlan(), out = [];
  for (const t of HD_TAGS) if (p.slots[t] && !lazyFiles[t]) out.push({ tag: t, ...p.slots[t] });
  p.extra.forEach((x, i) => { if (!lazyExtra.some(f => f.name === x.n && f.size === x.s)) out.push({ extra: i, ...x }); });
  return out;
}
function renderLazyPending() {
  const p = lazyPlan(), pend = lazyPending();
  for (const t of HD_TAGS) {
    const n = $("#name-" + t); if (!n || mounted[t]) continue;
    const ej = $("#drive-" + t + ' [data-act="eject"]');
    if (p.slots[t]) { n.textContent = p.slots[t].n + " (sur place) : à rebrancher"; n.classList.remove("empty"); n.classList.add("lazy-pending"); if (ej) ej.disabled = false; /* pour l'oublier */ }
    else if (n.classList.contains("lazy-pending")) { n.classList.remove("lazy-pending"); n.classList.add("empty"); n.textContent = "Aucun disque dur"; if (ej) ej.disabled = true; }
  }
  for (const b of document.querySelectorAll(".lazy-again")) { b.hidden = !pend.length; b.textContent = "Rebrancher les disques sur place (" + pend.length + ")…"; }
}
function relinkLazy() {
  if (running || starting) { toast("Éteignez l'Amiga pour brancher un disque dur.", true); return; }
  const inp = $("#filePick"); inp.value = ""; inp.multiple = true; inp.accept = ".hdf";
  inp.onchange = () => {
    const files = [...inp.files]; inp.multiple = false; if (!files.length) return;
    const p = lazyPlan(), used = new Set(), done = [];
    const take = (x) => { const f = files.find(f => !used.has(f) && f.name === x.n && f.size === x.s) || files.find(f => !used.has(f) && f.name === x.n); if (f) used.add(f); return f; };
    for (const t of HD_TAGS) if (p.slots[t] && !lazyFiles[t]) {
      const f = take(p.slots[t]); if (!f) continue;
      lazyFiles[t] = f; setMounted(t, { id: "lazy:" + t, name: f.name + " (sur place)" }); done.push(t.toUpperCase() + ": " + f.name);
    }
    const extra = p.extra.map(x => lazyExtra.find(f => f.name === x.n && f.size === x.s) || take(x)).filter(Boolean);
    for (const f of extra) if (!lazyExtra.includes(f)) done.push(f.name);
    lazyExtra.splice(0, lazyExtra.length, ...extra, ...lazyExtra.filter(f => !extra.includes(f)));
    renderLazyExtra(); renderLazyPending();
    const left = lazyPending().map(x => x.n);
    toast((done.length ? done.length + " disque(s) rebranché(s)." : "Aucun fichier ne correspond aux disques prévus.")
      + (left.length ? " Manquent encore : " + left.join(", ") + "." : " Tout est prêt : Démarrer."), !!left.length);
  };
  inp.click();
}
function pickLazyHd(tag) {
  if (running || starting) { toast("Éteignez l'Amiga pour brancher un disque dur.", true); return; }
  const inp = $("#filePick"); inp.value = ""; inp.multiple = false; inp.accept = ".hdf";
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    for (const t of HD_TAGS) if (t !== tag && lazyFiles[t] && lazyFiles[t].name === f.name && lazyFiles[t].size === f.size) setMounted(t, null);
    lazyFiles[tag] = f;
    setMounted(tag, { id: "lazy:" + tag, name: f.name + " (sur place)" });
    lazyPlanSlot(tag, f);
    lazyDescribe(f).then(d => toast(f.name + " sur " + tag.toUpperCase() + ": — " + d + " (" + fmtSize(f.size) + ", lu directement dans le fichier, sans copie.)"
      + ((S.core || "winuae6") !== "winuae6" ? " Il faut le cœur WinUAE 6 (Configuration → Processeur et FPU)." : "")
      + (S.lazyKeep !== "off" ? " Ce que l'Amiga y écrit est gardé dans le navigateur (le fichier n'est pas modifié)." : " Ce que l'Amiga y écrit est oublié à l'extinction.")));
  };
  inp.click();
}
for (const t of HD_TAGS) {
  const card = $("#drive-" + t), ins = card && card.querySelector('[data-act="insert"]'); if (!ins) continue;
  const b = document.createElement("button");
  b.className = "gad small"; b.type = "button"; b.dataset.act = "lazy";
  b.textContent = "Sur place…";
  b.title = "Brancher un gros disque .hdf sans l'importer : il est lu directement dans le fichier de l'appareil (WinUAE 6 ; le fichier n'est jamais modifié, ce que l'Amiga écrit est gardé dans le navigateur)";
  ins.after(b);
  b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); pickLazyHd(t); });
}
/* Autres disques sur place, au-delà des quatre unités : DH4: et suivants, branchés comme disques UAE (AGS en a 12) */
function renderLazyExtra() {
  const box = $("#name-lazyx"), clr = $('#drive-lazyx [data-act="lazyclear"]'); if (!box) return;
  box.textContent = ""; box.classList.toggle("empty", !lazyExtra.length);
  if (!lazyExtra.length) box.textContent = "Aucun autre disque";
  for (const [i, f] of lazyExtra.entries()) {
    const row = document.createElement("div"); row.className = "lazyx-row";
    const name = document.createElement("span"); name.textContent = "DH" + (4 + i) + ": " + f.name + " (sur place)";
    const del = document.createElement("button"); del.className = "gad small"; del.type = "button"; del.textContent = "Retirer"; del.dataset.lazyx = i;
    row.append(name, del); box.appendChild(row);
  }
  if (clr) clr.disabled = !lazyExtra.length && !lazyPlan().extra.length;
  const add = $('#drive-lazyx [data-act="lazyadd"]'); if (add) add.disabled = lazyExtra.length >= LAZY_EXTRA_MAX;
}
function pickLazyExtra() {
  if (running || starting) { toast("Éteignez l'Amiga pour brancher un disque dur.", true); return; }
  const inp = $("#filePick"); inp.value = ""; inp.multiple = true; inp.accept = ".hdf";
  inp.onchange = async () => {
    const files = [...inp.files]; inp.multiple = false; if (!files.length) return;
    for (const f of files) {
      if (lazyExtra.length >= LAZY_EXTRA_MAX) { toast("Au plus " + LAZY_EXTRA_MAX + " autres disques sur place (DH4: à DH" + (3 + LAZY_EXTRA_MAX) + ":).", true); break; }
      if (lazyExtra.some(x => x.name === f.name && x.size === f.size) || HD_TAGS.some(t => lazyFiles[t] && lazyFiles[t].name === f.name && lazyFiles[t].size === f.size)) continue;
      lazyExtra.push(f);
      const d = await lazyDescribe(f);
      toast(f.name + " sur DH" + (3 + lazyExtra.length) + ": (disque UAE) — " + d + " (" + fmtSize(f.size) + ", lu directement dans le fichier.)");
    }
    renderLazyExtra(); lazyPlanExtra();
  };
  inp.click();
}
{ const dh3 = $("#drive-dh3");
  if (dh3) {
    const card = document.createElement("div");
    card.className = "drive wb hd-extra"; card.id = "drive-lazyx";
    card.innerHTML = '<div class="drive-head"><b>DH4: et suivants</b><small>disques UAE, sur place</small></div>'
      + '<div class="media empty" id="name-lazyx">Aucun autre disque</div>'
      + '<div class="acts"><button class="gad small" type="button" data-act="lazyadd" title="Brancher d\'autres gros disques .hdf sans les importer (WinUAE 6, pour cette séance)">Sur place…</button>'
      + '<button class="gad small" type="button" data-act="lazyclear" disabled>Tout retirer</button>'
      + '<button class="gad small lazy-again" type="button" hidden></button></div>'
      + '<label class="lazyx-shared"><input type="checkbox" id="optShared"> Volume SHARED: intégré (sauvegardes des jeux d\'AGS, gardées d\'une séance à l\'autre)</label>'
      + '<label class="lazyx-shared"><input type="checkbox" id="optLazyKeep"> Garder ce que l\'Amiga écrit sur les disques sur place (favoris, réglages, fichiers ; les fichiers .hdf ne sont jamais modifiés)</label>'
      + '<div class="lazyx-ov"><span id="lazyOvInfo">Aucune modification gardée</span> <button class="gad small" type="button" data-act="ovclear" disabled>Effacer…</button></div>';
    dh3.after(card);
    const keep = card.querySelector("#optLazyKeep");
    keep.checked = S.lazyKeep !== "off";
    keep.addEventListener("change", () => { S.lazyKeep = keep.checked ? "on" : "off"; saveSettings(); });
    const opt = card.querySelector("#optShared");
    opt.checked = S.shared !== "off";
    opt.addEventListener("change", () => { S.shared = opt.checked ? "on" : "off"; saveSettings(); });
    card.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      if (b.dataset.act === "lazyadd") return pickLazyExtra();
      if (b.classList.contains("lazy-again")) return relinkLazy();
      if (b.dataset.act === "ovclear") return clearLazyOv();
      if (running || starting) { toast("Éteignez l'Amiga pour retirer un disque dur.", true); return; }
      if (b.dataset.act === "lazyclear") lazyExtra.length = 0;
      else if (b.dataset.lazyx != null) lazyExtra.splice(+b.dataset.lazyx, 1);
      renderLazyExtra(); lazyPlanExtra();
    });
  } }
/* Volume SHARED: intégré, pour AGS : ses disques y rangent les sauvegardes des jeux (SHARED:SaveGames), dans un
   dossier du PC sous WinUAE. Ici, un dossier du cœur gardé dans la Bibliothèque d'une séance à l'autre, monté avec
   les disques sur place. */
const SHARED_ID = "shared";
let sharedOn = false, sharedSig = "";
async function sharedPrepare(m) {
  const rec = await DB.get(SHARED_ID);
  m.M.FS.mkdirTree("/save/SHARED/SaveGames");
  for (const d of (rec && rec.dirs) || []) m.M.FS.mkdirTree("/save/SHARED/" + d);
  for (const f of (rec && rec.files) || []) m.writeFile("/save/SHARED/" + f.path, new Uint8Array(await f.blob.arrayBuffer()));
  sharedSig = rec ? rec.sig : ""; sharedOn = true;
}
async function saveShared() {
  if (!machine || !sharedOn) return;
  machine.flush();
  const FS = machine.M.FS, files = [], dirs = [];
  const walk = (dir, rel) => {
    let names = []; try { names = FS.readdir(dir); } catch (e) { return; }
    for (const n of names) {
      if (n === "." || n === "..") continue;
      const p = dir + "/" + n, st = FS.stat(p), r = rel ? rel + "/" + n : n;
      if (FS.isDir(st.mode)) { dirs.push(r); walk(p, r); } else files.push({ path: r, full: p, size: st.size, mtime: +st.mtime });
    }
  };
  walk("/save/SHARED", "");
  const sig = [...dirs, ...files.map(f => f.path + ":" + f.size + ":" + f.mtime)].sort().join("|");
  if (sig === sharedSig) return;
  const saved = files.map(f => ({ path: f.path, blob: new Blob([FS.readFile(f.full)]) }));
  await DB.put({ id: SHARED_ID, kind: "shared", name: "SHARED", dirs, files: saved, sig, size: saved.reduce((a, f) => a + f.blob.size, 0), added: Date.now() });
  sharedSig = sig;
}
setInterval(() => { if (running && sharedOn) saveShared(); }, 5000);
window.addEventListener("pagehide", () => { if (running && sharedOn) saveShared(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && running && sharedOn) saveShared(); });
{ const _off = powerOff; powerOff = async () => { if (running && sharedOn) await saveShared().catch(e => console.warn("SHARED non enregistré", e)); await _off(); sharedOn = false; }; }

/* Ce que l'Amiga écrit sur les disques sur place, gardé d'une séance à l'autre. Le cœur garde ces écritures par
   pages de 4 Ko et en tient le relevé (lazy_disk.cpp) ; la page vide ce relevé toutes les 10 s, à l'extinction et
   quand elle passe en arrière-plan, et range les pages par segments de 1 Mo dans la Bibliothèque (enregistrements
   cachés), sous le nom et la taille du fichier. À l'allumage, elles sont remises avant que l'Amiga ne lise le
   disque. La date du fichier est notée : un fichier modifié ailleurs (WinUAE…) ne reçoit pas d'anciennes pages. */
const OV_PAGE = 4096, OV_SEG = 256;
let lazyOvDisks = [], lazyOvBusy = false;
const ovKey = f => f.name + "|" + f.size;
const ovSegId = (f, seg) => "lazyov:" + ovKey(f) + ":" + seg;
async function lazyOvRestore(m, files) {
  lazyOvDisks = files.map((f, disk) => ({ f, disk }));
  if (S.lazyKeep === "off") { lazyOvDisks = []; return; }
  const found = [];
  for (const d of lazyOvDisks) {
    const head = await DB.get("lazyovh:" + ovKey(d.f)); if (!head) continue;
    if (head.lm && d.f.lastModified && head.lm !== d.f.lastModified) {
      d.skip = true;
      toast(d.f.name + " a changé depuis ses dernières modifications gardées (il a été modifié ailleurs, par WinUAE par exemple) : elles ne sont pas réappliquées, et rien n'est gardé cette fois. « Effacer… » (Disques durs/CD) pour repartir de ce fichier.", true);
      continue;
    }
    const p = m.M._malloc(OV_PAGE); let n = 0;
    for (const seg of head.segs || []) {
      const r = await DB.get(ovSegId(d.f, seg)); if (!r || !r.blob) continue;
      const u8 = new Uint8Array(await r.blob.arrayBuffer());
      r.pages.forEach((pg, i) => { m.M.HEAPU8.set(u8.subarray(i * OV_PAGE, (i + 1) * OV_PAGE), p); if (!m.M._amb_lazy_restore(d.disk, pg, p)) n++; });
    }
    m.M._free(p);
    if (n) found.push(d.f.name + " (" + fmtSize(n * OV_PAGE) + ")");
  }
  if (found.length) toast("Modifications gardées réappliquées : " + found.join(", ") + ".");
}
async function ovWrite(f, got) {
  const segs = new Map();
  for (const [pg, data] of got) { const s = Math.floor(pg / OV_SEG); if (!segs.has(s)) segs.set(s, new Map()); segs.get(s).set(pg, data); }
  const head = (await DB.get("lazyovh:" + ovKey(f))) || { id: "lazyovh:" + ovKey(f), kind: "lazyovh", name: f.name, size: f.size, segs: [], pages: 0 };
  for (const [s, pages] of segs) {
    const id = ovSegId(f, s), old = await DB.get(id), all = new Map();
    if (old && old.blob) { const u8 = new Uint8Array(await old.blob.arrayBuffer()); old.pages.forEach((pg, i) => all.set(pg, u8.subarray(i * OV_PAGE, (i + 1) * OV_PAGE))); }
    const before = all.size;
    for (const [pg, data] of pages) all.set(pg, data);
    const keys = [...all.keys()].sort((a, b) => a - b);
    await DB.put({ id, kind: "lazyov", owner: head.id, pages: keys, blob: new Blob(keys.map(k => all.get(k))) });
    head.pages += all.size - before;
    if (!head.segs.includes(s)) head.segs.push(s);
  }
  Object.assign(head, { lm: f.lastModified || 0, updated: Date.now() });
  await DB.put(head);
}
async function saveLazyOv() {
  if (lazyOvBusy || !machine || !machine.M || !machine.M._amb_lazy_take || !lazyOvDisks.length || S.lazyKeep === "off") return;
  lazyOvBusy = true;
  const M = machine.M, max = 256, rec = 4 + OV_PAGE;
  let buf = 0;
  try {
    buf = M._malloc(max * rec);
    for (const d of lazyOvDisks) {
      if (d.skip) continue;
      const got = new Map();
      for (let guard = 0; guard < 4096; guard++) {
        const n = M._amb_lazy_take(d.disk, buf, max); if (n <= 0) break;
        const h = M.HEAPU8;
        for (let i = 0; i < n; i++) { const o = buf + i * rec; got.set((h[o] | h[o + 1] << 8 | h[o + 2] << 16 | h[o + 3] << 24) >>> 0, h.slice(o + 4, o + rec)); }
        if (n < max) break;
      }
      if (got.size) await ovWrite(d.f, got);
    }
  } catch (e) { console.warn("modifications des disques sur place non enregistrées", e); toast("Les modifications des disques sur place n'ont pas pu être enregistrées (stockage du navigateur plein ?).", true); }
  finally { if (buf) M._free(buf); lazyOvBusy = false; renderLazyOv(); }
}
async function renderLazyOv() {
  const info = $("#lazyOvInfo"), btn = $('#drive-lazyx [data-act="ovclear"]'); if (!info) return;
  const heads = (await DB.all().catch(() => [])).filter(r => r.kind === "lazyovh");
  const bytes = heads.reduce((a, h) => a + (h.pages || 0) * OV_PAGE, 0);
  info.textContent = heads.length ? "Modifications gardées : " + heads.map(h => h.name).join(", ") + " (" + fmtSize(bytes) + ")" : "Aucune modification gardée";
  if (btn) btn.disabled = !heads.length;
}
async function clearLazyOv() {
  if (running || starting) { toast("Éteignez l'Amiga pour effacer les modifications gardées.", true); return; }
  const all = await DB.all(), heads = all.filter(r => r.kind === "lazyovh");
  if (!heads.length) return;
  if (!confirm("Effacer ce que l'Amiga a écrit sur " + heads.map(h => h.name).join(", ") + " ? Ces disques repartiront de leur fichier d'origine.")) return;
  for (const r of all) if (r.kind === "lazyov" || r.kind === "lazyovh") await DB.del(r.id);
  renderLazyOv(); toast("Modifications gardées effacées.");
}
setInterval(() => { if (running && lazyOvDisks.length) saveLazyOv(); }, 10000);
window.addEventListener("pagehide", () => { if (running && lazyOvDisks.length) saveLazyOv(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && running && lazyOvDisks.length) saveLazyOv(); });
{ const _off = powerOff; powerOff = async () => { if (running && lazyOvDisks.length) await saveLazyOv(); await _off(); lazyOvDisks = []; }; }
setTimeout(renderLazyOv, 1000);

/* Un autre disque mis à la place, ou retiré : le fichier sur place est oublié */
{ const _sm = setMounted;
  setMounted = (t, r) => {
    if (isHd(t) && !(r && String(r.id).startsWith("lazy:"))) delete lazyFiles[t];
    /* Un disque importé mis à la place d'un disque sur place prévu : la disposition l'oublie */
    if (isHd(t) && r && !String(r.id).startsWith("lazy:") && lazyPlan().slots[t]) lazyPlanSlot(t, null);
    _sm(t, r);
    if (isHd(t)) renderLazyPending();
    if (isHd(t) && r && String(r.id).startsWith("lazy:")) {
      const card = $("#drive-" + t);
      for (const a of ["download", "profile", "files"]) { const x = card && card.querySelector('[data-act="' + a + '"]'); if (x) x.disabled = true; }
    }
  }; }
/* Débrancher : le disque sur place prévu pour cette unité est oublié (pas quand la page le vide elle-même) */
for (const t of HD_TAGS) { const ej = $("#drive-" + t + ' [data-act="eject"]');
  if (ej) ej.addEventListener("click", () => { if (!running && !starting && lazyPlan().slots[t]) lazyPlanSlot(t, null); }, true); }
/* Bouton « Rebrancher… » aussi en tête des disques durs, visible tant qu'il reste des disques prévus */
{ const dh0 = $("#drive-dh0");
  if (dh0) { const b = document.createElement("button"); b.className = "gad lazy-again lazy-again-top"; b.type = "button"; b.hidden = true;
    b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); relinkLazy(); }); dh0.before(b); } }
setTimeout(renderLazyPending, 0); setTimeout(renderLazyPending, 1500);
/* Rechargement de la page : l'accès au fichier est perdu, l'unité redevient vide */
for (const t of HD_TAGS) if (mounted[t] && String(mounted[t].id).startsWith("lazy:") && !lazyFiles[t]) setMounted(t, null);
{ const again = sessionStorage.getItem("a1200.lazyagain");
  if (again) {
    sessionStorage.removeItem("a1200.lazyagain");
    setTimeout(() => toast("Pour rallumer, la page s'est rechargée, et le navigateur ne redonne pas l'accès aux fichiers lus sur place. Touchez « Rebrancher les disques sur place » (Configuration → Disques durs/CD) et choisissez-les tous d'un coup (" + again + "), puis Démarrer. Pour redémarrer sans les perdre, utilisez plutôt Réinitialiser.", true), 800);
  } }
