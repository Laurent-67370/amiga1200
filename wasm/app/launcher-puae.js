
/* =========================================================
   Écran d'accueil (Amiga éteint) : Kickstart, derniers disques, Allumer
   ========================================================= */
const LAUNCH_MAX = 6;
const ICON_FLOPPY = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 4h31l5 5v35H6z" fill="#3b4a63"/><rect x="13" y="4" width="20" height="13" fill="#c9ccd1"/><rect x="26" y="6" width="5" height="9" fill="#3b4a63"/><rect x="11" y="24" width="26" height="20" fill="#eef0f2"/><path d="M14 30h20M14 35h20M14 40h14" stroke="#9aa3ad" stroke-width="1.6"/></svg>';
const ICON_HD = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="10" width="38" height="28" rx="2" fill="#5a6270"/><circle cx="21" cy="24" r="10" fill="#8d96a3"/><circle cx="21" cy="24" r="2.5" fill="#3a404a"/><path d="M21 24l14 9" stroke="#d8d2c2" stroke-width="2.2"/><rect x="34" y="14" width="5" height="2.5" fill="#4dff6a"/></svg>';

function whenUsed(t) {
  if (!t) return "";
  const d = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86400000);
  return d <= 0 ? "aujourd'hui" : d === 1 ? "hier" : d < 30 ? "il y a " + d + " jours" : new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
function lEl(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

/* Marque les disques en place comme « utilisés » pour les remonter en tête de l'accueil */
async function markUsed() {
  for (const t of ["df0", "dh0"]) {
    if (!mounted[t]) continue;
    const r = await DB.get(mounted[t].id);
    if (r) { r.used = Date.now(); await DB.put(r); }
  }
}
async function launchWith(rec) {
  if (running || starting) return;
  if (rec.kind === "whd") return launchWhd(rec);
  whdGame = null;
  if (rec.kind === "hdf") {
    /* Démarrer sur le disque dur : on libère DF0: (une disquette amorçable passerait devant) */
    if (mounted.df0) await ejectMedia("df0", true);
    if (!mounted.dh0 || mounted.dh0.id !== rec.id) await mountMedia("dh0", rec); /* quitte son autre unité s'il y était */
  } else if (!mounted.df0 || mounted.df0.id !== rec.id) await mountMedia("df0", rec);
  await markUsed(); powerOn();
}

let _lTimer = 0;
function renderLauncherSoon() { clearTimeout(_lTimer); _lTimer = setTimeout(renderLauncher, 60); }
async function renderLauncher() {
  const box = $("#lMain"); if (!box) return;
  let all = [];
  try { all = await DB.all(); } catch (e) {}
  /* Kickstart */
  const kick = $("#lKick"); kick.innerHTML = "";
  const is500 = S.model === "a500";
  /* Bascule Amiga 1200 / Amiga 500 */
  const seg = lEl("span", "l-model");
  for (const [m, t] of [["a1200", "A1200"], ["a500", "A500"]]) {
    const b = lEl("button", "l-seg"); b.textContent = t; b.setAttribute("aria-pressed", (S.model || "a1200") === m ? "true" : "false");
    b.title = m === "a500" ? "Amiga 500 : 68000, OCS, pour les jeux A500 récalcitrants" : "Amiga 1200 : 68EC020, AGA";
    b.onclick = () => { S.model = m; saveSettings(); renderLauncher(); };
    seg.appendChild(b);
  }
  $("#lTitle").textContent = is500 ? "Amiga 500" : "Amiga 1200";
  const romId = is500 ? await romFor500(all) : S.romId;
  let romRec = romId !== "aros" ? all.find(r => r.id === romId) : null;
  const kTxt = lEl("span", "l-kick-name");
  kTxt.textContent = romRec ? (romRec.label || romRec.name) : "AROS (Kickstart libre)";
  kick.append(seg, lEl("span", "l-kick-lbl", "Kickstart"), kTxt);
  const kBtn = lEl("button", "gad small"); kBtn.textContent = romRec ? "Changer" : is500 ? "Importer le 1.3…" : "Importer le mien…";
  kBtn.onclick = romRec ? () => $("#btnSettings").click() : () => pickFile(".rom,.bin,.key", f => importFile(f));
  kick.appendChild(kBtn);

  /* Disques : les plus récemment utilisés d'abord */
  const disks = all.filter(r => r.kind === "adf" || r.kind === "hdf" || r.kind === "whd" || r.kind === "cd").sort((a, b) => (b.used || b.added) - (a.used || a.added));
  const thumbs = {};
  for (const s of all.filter(r => r.kind === "state").sort((a, b) => a.updated - b.updated)) thumbs[s.game] = s;
  box.innerHTML = "";
  if (!disks.length) {
    /* Première visite : trois étapes */
    const steps = lEl("ol", "l-steps");
    const s1 = lEl("li", null, "<b>Kickstart</b><span></span>");
    s1.querySelector("span").textContent = romRec ? "Le vôtre est prêt : " + (romRec.label || romRec.name) + "."
      : is500 ? "Le mode Amiga 500 demande le Kickstart 1.3 : importez-le (bouton ci-dessus)."
      : "AROS, un Kickstart libre, est fourni. Pour l'A1200 d'origine, importez votre ROM Kickstart 3.1 (bouton ci-dessus).";
    const s2 = lEl("li", null, "<b>Une disquette ou un jeu WHDLoad</b><span>Un jeu, une démo ou le Workbench au format .adf, une archive .zip, ou un jeu WHDLoad en .lha qui se lance directement, sans rien installer. Ils seront rangés dans la Bibliothèque pour les prochaines fois.</span>");
    const acts = lEl("div", "l-acts");
    const o = lEl("button", "gad"); o.textContent = "Ouvrir un fichier…"; o.onclick = () => $("#lOpen").click();
    const h = lEl("button", "gad"); h.textContent = "Créer un disque dur"; h.onclick = () => $('#drive-dh0 [data-act="blank"]').click();
    acts.append(o, h); s2.appendChild(acts);
    const s3 = lEl("li", null, "<b>Allumer</b><span>L'Amiga démarre sur la disquette. " + (isTouch ? "Ensuite, l'écran sert de pavé tactile : un doigt pour la souris, deux doigts pour les menus." : "Cliquez dans l'écran pour prendre la souris, Échap pour la rendre.") + "</span>");
    steps.append(s1, s2, s3); box.appendChild(steps);
  } else {
    box.appendChild(lEl("div", "l-title", "Reprendre là où vous en étiez"));
    const grid = lEl("div", "l-grid");
    for (const r of disks.slice(0, LAUNCH_MAX)) {
      const tile = lEl("div", "l-tile k-" + r.kind); /* liseré coloré selon le type : disquette, disque dur, jeu WHDLoad */
      const inDrive = ["df0", ...HD_TAGS].some(t => mounted[t] && mounted[t].id === r.id);
      if (inDrive) tile.classList.add("in");
      const pick = lEl("button", "l-pick");
      pick.title = (r.kind === "whd" || r.kind === "cd" ? "Jouer : " : "Insérer et allumer : ") + r.name;
      const img = lEl("span", "l-img");
      const st = thumbs[r.id];
      if (st && st.thumb) { const i = new Image(); i.src = st.thumb; i.alt = ""; img.appendChild(i); }
      else img.innerHTML = r.kind === "cd" ? ICON_CD : r.kind === "whd" ? ICON_WHD : r.kind === "hdf" ? ICON_HD : ICON_FLOPPY;
      const nm = lEl("span", "l-name"); nm.textContent = r.name.replace(/\.(adf|adz|dms|hdf|lha|lzh|cue|iso)$/i, "");
      const sub = lEl("span", "l-sub"); sub.textContent = (r.kind === "cd" ? "CD32" : r.kind === "whd" ? "jeu WHDLoad" + (whdTags(r) ? " · " + whdTags(r) : "") : inDrive ? (r.kind === "hdf" ? "branché" : "dans le lecteur") : r.kind === "hdf" ? "disque dur" : "disquette") + (r.used ? " · " + whenUsed(r.used) : "");
      pick.append(img, nm, sub);
      pick.onclick = () => launchWith(r);
      tile.appendChild(pick);
      if (st) {
        const rs = lEl("button", "l-resume"); rs.textContent = "▶ Reprendre la sauvegarde"; rs.title = "Reprendre la dernière sauvegarde d'état";
        rs.onclick = () => resumeState(st.id); tile.appendChild(rs);
      }
      grid.appendChild(tile);
    }
    box.appendChild(grid);
    if (disks.length > LAUNCH_MAX) {
      const more = lEl("button", "l-more"); more.textContent = "Toute la bibliothèque (" + disks.length + " disques)";
      more.onclick = () => $("#btnLib").click(); box.appendChild(more);
    }
  }
  /* Ce qui démarrera avec le bouton Allumer */
  const what = [];
  if (mounted.df0) what.push(mounted.df0.name.replace(/\.(adf|adz|dms)$/i, ""));
  const hds = HD_TAGS.filter(t => mounted[t]).map(t => mounted[t].name.replace(/\.hdf$/i, ""));
  if (hds.length) what.push((mounted.df0 ? "+ " : "") + (hds.length > 1 ? "disques durs " : "disque dur ") + hds.join(", "));
  $("#lWhat").textContent = what.length ? "avec " + what.join(" ") : "sans disque";
}

/* Le bouton « Ouvrir un fichier » : disquette, archive, disque dur ou Kickstart */
$("#lOpen").onclick = () => pickFile(".adf,.adz,.dms,.zip,.gz,.lha,.lzh,.hdf,.rom,.bin,.key,.tar", f => importFile(f));
/* Allumer depuis l'accueil ou la barre d'outils : les disques en place remontent en tête */
$("#idlePower").onclick = async () => { await markUsed(); powerOn(); };
{ const b = $("#btnPower"), prev = b.onclick; b.onclick = async e => { if (!running) await markUsed(); prev(e); }; }

/* Tout changement de disque ou de la bibliothèque rafraîchit l'accueil */
{ const _sm = setMounted; setMounted = (t, r) => { _sm(t, r); renderLauncherSoon(); }; }
{ const _put = DB.put.bind(DB), _del = DB.del; DB.put = async r => { const x = await _put(r); renderLauncherSoon(); return x; };
  DB.del = async id => { const x = await _del(id); renderLauncherSoon(); return x; }; }
refreshIdleRom = async () => renderLauncherSoon();
