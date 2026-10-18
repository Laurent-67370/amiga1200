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
