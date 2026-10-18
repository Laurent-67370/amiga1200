/* =========================================================
   Disques durs lus sur place (WinUAE 6)
   =========================================================
   « Sur place… » sur un disque dur : le fichier .hdf choisi n'est pas importé ; le cœur en lit les blocs au fur
   et à mesure, directement dans le fichier de l'appareil. Pas de limite de taille (au-delà de 2 Go, jusqu'à
   ce que le Kickstart sait lire), rien ne s'ajoute au stockage du navigateur. Les écritures de l'Amiga restent
   en mémoire pendant la séance : le fichier d'origine n'est jamais modifié. Le choix vaut pour la séance (le
   navigateur ne redonne pas l'accès au fichier après un rechargement). */
function pickLazyHd(tag) {
  if (running || starting) { toast("Éteignez l'Amiga pour brancher un disque dur.", true); return; }
  const inp = $("#filePick"); inp.value = ""; inp.multiple = false; inp.accept = ".hdf";
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    for (const t of HD_TAGS) if (t !== tag && lazyFiles[t] && lazyFiles[t].name === f.name && lazyFiles[t].size === f.size) setMounted(t, null);
    lazyFiles[tag] = f;
    setMounted(tag, { id: "lazy:" + tag, name: f.name + " (sur place)" });
    toast(f.name + " (" + fmtSize(f.size) + ") branché sur " + tag.toUpperCase() + ": et lu directement dans le fichier, sans copie."
      + ((S.core || "winuae6") !== "winuae6" ? " Il faut le cœur WinUAE 6 (Configuration → Processeur et FPU)." : "")
      + " Les modifications faites par l'Amiga ne sont pas gardées à l'extinction.");
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
