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
function pickLazyHd(tag) {
  if (running || starting) { toast("Éteignez l'Amiga pour brancher un disque dur.", true); return; }
  const inp = $("#filePick"); inp.value = ""; inp.multiple = false; inp.accept = ".hdf";
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    for (const t of HD_TAGS) if (t !== tag && lazyFiles[t] && lazyFiles[t].name === f.name && lazyFiles[t].size === f.size) setMounted(t, null);
    lazyFiles[tag] = f;
    setMounted(tag, { id: "lazy:" + tag, name: f.name + " (sur place)" });
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
  if (clr) clr.disabled = !lazyExtra.length;
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
    renderLazyExtra();
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
      + '<button class="gad small" type="button" data-act="lazyclear" disabled>Tout retirer</button></div>';
    dh3.after(card);
    card.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      if (b.dataset.act === "lazyadd") return pickLazyExtra();
      if (running || starting) { toast("Éteignez l'Amiga pour retirer un disque dur.", true); return; }
      if (b.dataset.act === "lazyclear") lazyExtra.length = 0;
      else if (b.dataset.lazyx != null) lazyExtra.splice(+b.dataset.lazyx, 1);
      renderLazyExtra();
    });
  } }
/* Un autre disque mis à la place, ou retiré : le fichier sur place est oublié */
{ const _sm = setMounted;
  setMounted = (t, r) => {
    if (isHd(t) && !(r && String(r.id).startsWith("lazy:"))) delete lazyFiles[t];
    _sm(t, r);
    if (isHd(t) && r && String(r.id).startsWith("lazy:")) {
      const card = $("#drive-" + t);
      for (const a of ["download", "profile", "files"]) { const x = card && card.querySelector('[data-act="' + a + '"]'); if (x) x.disabled = true; }
    }
  }; }
/* Rechargement de la page : l'accès au fichier est perdu, l'unité redevient vide */
for (const t of HD_TAGS) if (mounted[t] && String(mounted[t].id).startsWith("lazy:") && !lazyFiles[t]) setMounted(t, null);
