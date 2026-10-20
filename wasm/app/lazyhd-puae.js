/* =========================================================
   Disques durs lus sur place (WinUAE 6)
   =========================================================
   « Sur place… » sur un disque dur : le fichier .hdf choisi n'est pas importé ; le cœur en lit les blocs au fur
   et à mesure, directement dans le fichier de l'appareil. Pas de limite de taille (au-delà de 2 Go, jusqu'à
   ce que le Kickstart sait lire), rien ne s'ajoute au stockage du navigateur. Les écritures de l'Amiga restent
   en mémoire pendant la séance : le fichier d'origine n'est jamais modifié. Le choix vaut pour la séance (le
   navigateur ne redonne pas l'accès au fichier après un rechargement). */
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
      + " Les modifications faites par l'Amiga ne sont pas gardées à l'extinction."));
  };
  inp.click();
}
for (const t of HD_TAGS) {
  const card = $("#drive-" + t), ins = card && card.querySelector('[data-act="insert"]'); if (!ins) continue;
  const b = document.createElement("button");
  b.className = "gad small"; b.type = "button"; b.dataset.act = "lazy";
  b.textContent = "Sur place…";
  b.title = "Brancher un gros disque .hdf sans l'importer : il est lu directement dans le fichier de l'appareil (WinUAE 6, pour cette séance ; les modifications ne sont pas gardées)";
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
      + '<label class="lazyx-shared"><input type="checkbox" id="optShared"> Volume SHARED: intégré (sauvegardes des jeux d\'AGS, gardées d\'une séance à l\'autre)</label>';
    dh3.after(card);
    const opt = card.querySelector("#optShared");
    opt.checked = S.shared !== "off";
    opt.addEventListener("change", () => { S.shared = opt.checked ? "on" : "off"; saveSettings(); });
    card.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      if (b.dataset.act === "lazyadd") return pickLazyExtra();
      if (b.classList.contains("lazy-again")) return relinkLazy();
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
