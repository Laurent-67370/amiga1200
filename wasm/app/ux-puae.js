/* =========================================================
   Navigation : commandes rangées par usage, mêmes mots partout, raccourcis
   =========================================================
   Barre de commandes en quatre groupes (Machine, Jeux, Écran et son, Émulateur), libellés et infobulles qui
   donnent les raccourcis ; lecteurs aux verbes cohérents (disquette : Insérer, Éjecter ; disque dur : Brancher,
   Débrancher), lecteurs DF2:, DF3: et disques DH1: à DH3: repliés tant qu'ils sont vides ; sur téléphone, barre en grille d'icônes et
   sections de l'interface dans une liste déroulante. */
(function uxToolbar() {
  const bar = $(".toolbar"); if (!bar) return;
  const label = (id, txt, title) => {
    const b = $("#" + id); if (!b) return;
    if (txt) {
      const sp = b.querySelector("span");
      const t = [...b.childNodes].reverse().find(n => n.nodeType === 3 && n.textContent.trim());
      if (id === "btnHelp") b.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="6.5"/><path d="M6 6.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.8"/><circle cx="8" cy="11.8" r=".4" fill="currentColor"/></svg>Aide';
      else if (t) t.textContent = " " + txt; else if (sp) sp.textContent = txt;
    }
    if (title) b.title = title;
  };
  label("btnSettings", "Configuration", "Configuration de l'émulateur : modèle, mémoire, affichage, commandes… (F12)");
  label("btnHelp", "Aide", "Aide et informations (F12, puis Aide)");
  label("btnLib", null, "Bibliothèque : vos disquettes, disques durs, jeux WHDLoad, CD et Kickstart");
  label("btnStates", null, "Sauvegardes d'état : enregistrer ou reprendre une partie (Ctrl+Maj+S / Ctrl+Maj+R)");
  label("btnFull", null, "Plein écran (Échap pour sortir)");
  label("btnShot", null, "Capture de l'écran de l'Amiga en image PNG");
  label("btnMute", null, "Couper ou remettre le son");
  label("btnPause", null, "Mettre l'émulation en pause");
  /* Écran et son : icônes seules sur grand écran (le nom reste lu par les lecteurs d'écran et en infobulle) */
  for (const id of ["btnFull", "btnShot", "btnMute"]) {
    const b = $("#" + id); if (!b) continue;
    let sp = b.querySelector("span");
    if (!sp) { const t = [...b.childNodes].reverse().find(n => n.nodeType === 3 && n.textContent.trim()); if (!t) continue; sp = document.createElement("span"); sp.textContent = t.textContent.trim(); t.replaceWith(sp); }
    sp.classList.add("tb-lbl"); b.classList.add("tb-icon");
  }
  const groups = [["Machine", ["btnPower", "btnReset", "btnPause"]], ["Jeux et fichiers", ["btnLib", "btnStates"]],
    ["Écran et son", ["btnFull", "btnShot", "btnMute"]], ["Émulateur", ["btnSettings", "btnInstall", "btnHelp"]]];
  const placed = new Set();
  for (const [name, ids] of groups) {
    const g = document.createElement("div");
    g.className = "tb-group"; g.setAttribute("role", "group"); g.setAttribute("aria-label", name);
    for (const id of ids) { const b = $("#" + id); if (b) { g.appendChild(b); placed.add(b); } }
    bar.appendChild(g);
  }
  for (const b of [...bar.querySelectorAll(":scope > button")]) if (!placed.has(b)) bar.lastElementChild.appendChild(b);
  bar.querySelectorAll(":scope > .sep").forEach(s => s.remove());
  /* Groupe sans bouton visible (Amiga éteint : Machine) masqué, séparateurs seulement entre groupes affichés */
  const tidy = () => {
    let first = true;
    for (const g of bar.querySelectorAll(".tb-group")) {
      const vis = [...g.children].some(b => !b.hidden && getComputedStyle(b).display !== "none");
      if (g.hidden === vis) g.hidden = !vis; /* sans changement, pas d'écriture : l'observateur ne se relance pas */
      if (g.classList.contains("tb-first") !== (vis && first)) g.classList.toggle("tb-first", vis && first);
      if (vis) first = false;
    }
  };
  const mo = new MutationObserver(tidy);
  mo.observe(bar, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
  mo.observe(document.body, { attributes: true, attributeFilter: ["class"] }); /* Amiga éteint ou allumé */
  tidy();
})();

/* ---- Lecteurs : verbes cohérents, disques supplémentaires repliés ---- */
let uxDrivesRefresh = () => {};
(function uxDrives() {
  for (const t of HD_TAGS) {
    const c = $("#drive-" + t); if (!c) continue;
    const set = (act, txt, title) => { const b = c.querySelector('[data-act="' + act + '"]'); if (b) { if (txt) b.textContent = txt; b.title = title; } };
    set("insert", "Brancher…", "Brancher un disque dur de la Bibliothèque ou de l'ordinateur sur " + t.toUpperCase() + ":");
    set("eject", "Débrancher", "Débrancher ce disque dur (il reste dans la Bibliothèque)");
    set("blank", "Nouveau…", "Créer un disque dur vierge");
    set("download", null, "Enregistrer une copie de ce disque dur sur l'ordinateur");
    set("files", null, "Copier des fichiers de l'ordinateur sur ce disque dur, ou les récupérer");
    set("profile", null, "Réglages propres à ce disque : modèle, processeur, mémoire…");
  }
  for (const t of FD_TAGS) {
    const c = $("#drive-" + t); if (!c) continue;
    const set = (act, title) => { const b = c.querySelector('[data-act="' + act + '"]'); if (b) b.title = title; };
    set("insert", "Insérer une disquette de la Bibliothèque ou de l'ordinateur dans " + t.toUpperCase() + ":");
    set("eject", "Éjecter la disquette (elle reste dans la Bibliothèque)");
    set("blank", "Insérer une disquette vierge formatée");
    set("download", "Enregistrer une copie de cette disquette sur l'ordinateur");
    set("profile", "Réglages propres à cette disquette : modèle, processeur, mémoire…");
  }
  /* Lecteurs supplémentaires repliés tant qu'ils sont vides : DF2: et DF3:, DH1: à DH3: */
  const box = $(".drives"); if (!box) return;
  const bar = document.createElement("div"); bar.className = "drives-more-bar"; box.appendChild(bar);
  const sets = [
    { key: "floppiesMore", cards: ["df2", "df3"], more: "Lecteurs de disquettes DF2: et DF3:…", less: "Masquer DF2: et DF3:" },
    { key: "drivesMore", cards: HD_TAGS.slice(1), more: "Autres disques durs (DH1: à DH3:)…", less: "Masquer les disques DH1: à DH3:" }
  ].map(x => {
    x.els = x.cards.map(t => $("#drive-" + t)).filter(Boolean);
    x.tog = document.createElement("button"); x.tog.className = "gad small drives-more"; x.tog.type = "button";
    x.tog.onclick = () => { S[x.key] = !S[x.key]; saveSettings(); uxDrivesRefresh(); };
    bar.appendChild(x.tog);
    return x;
  }).filter(x => x.els.length);
  uxDrivesRefresh = () => {
    for (const x of sets) {
      const used = x.els.filter(c => mounted[c.dataset.unit]).length, open = !!S[x.key] || used > 0;
      x.els.forEach(c => c.hidden = !open);
      x.tog.hidden = used > 0;
      x.tog.setAttribute("aria-expanded", open ? "true" : "false");
      x.tog.textContent = open ? x.less : x.more;
    }
  };
  uxDrivesRefresh();
})();
{ const _sm = setMounted; setMounted = (tag, rec) => { _sm(tag, rec); uxDrivesRefresh(); }; }

/* ---- Écran d'accueil : un seul « Ouvrir un fichier… » quand les trois étapes sont affichées ---- */
{ const _r = typeof renderLauncher === "function" ? renderLauncher : null;
  if (_r) renderLauncher = async (...a) => { const x = await _r(...a); const o = $("#lOpen"); if (o) o.hidden = !!$("#lMain .l-steps"); return x; }; }

/* ---- Interface (téléphone) : sections dans une liste déroulante, au lieu d'un bandeau qui déborde ---- */
{ let sel = null;
  const fill = () => {
    if (!sel || !ab.el) return;
    sel.innerHTML = "";
    let grp = null, og = null;
    for (const p of AB_PANELS) {
      if (!abVisible(p)) continue;
      if (p.group !== grp) { grp = p.group; og = document.createElement("optgroup"); og.label = grp; sel.appendChild(og); }
      const o = document.createElement("option"); o.value = p.id; o.textContent = p.label; o.selected = p.id === ab.panel; og.appendChild(o);
    }
  };
  const make = () => {
    if (sel || !ab.el) return;
    sel = document.createElement("select");
    sel.className = "ab-select"; sel.setAttribute("aria-label", "Section de la configuration");
    sel.onchange = () => abShow(sel.value);
    const side = ab.el.querySelector(".ab-side"); side.parentNode.insertBefore(sel, side);
  };
  const _show = abShow;
  abShow = id => { _show(id); make(); fill(); };
  if (ab.el) { make(); fill(); } /* l'interface est déjà ouverte au chargement */ }

/* ---- Toucher : rappel court (le détail est dans l'Aide) ---- */
{ const tip = $(".touch-tip"); if (tip) tip.textContent = "Écran tactile : un doigt déplace la souris, une touche clique, deux doigts ouvrent les menus. Le bouton Joystick affiche les commandes de jeu."; }

/* ---- Aide : même nom partout, raccourcis réunis en tête ---- */
{ const p = AB_PANELS.find(x => x.id === "about"); if (p) { p.label = "Aide et à propos"; if (ab.el) abNav(); }
  const body = $("#winHelp .body");
  if (body && !body.querySelector(".ux-keys")) {
    const k = s => '<span class="kbd">' + s + "</span>";
    const sec = document.createElement("div"); sec.className = "ux-keys";
    sec.innerHTML = '<p class="hint" id="siteVersion">Version du site : __BUILD__ (heure de Paris). Après une mise à jour, rechargez la page : ce numéro doit changer.</p>' + "<h3>Où trouver quoi</h3><p><b>Machine</b> : allumer, réinitialiser, pause, <b>Turbo</b> (chargements accélérés, sans le son). <b>Jeux et fichiers</b> : la Bibliothèque (disquettes, disques durs, jeux WHDLoad, CD, Kickstart) et les Sauvegardes d'état. <b>Écran et son</b> : plein écran, capture, son. <b>Configuration</b> : tous les réglages de l'émulateur, rangés comme dans Amiberry ; un réglage se retrouve avec la recherche en haut à gauche. Sous la barre, les lecteurs : <b>Insérer</b> et <b>Éjecter</b> une disquette, <b>Brancher</b> et <b>Débrancher</b> un disque dur.</p>"
      + "<h3>Quatre lecteurs de disquettes</h3><p>DF0: (interne) et trois lecteurs externes, DF1: à DF3: (DF2: et DF3: se déplient sous les lecteurs). Pour un jeu sur plusieurs disquettes, choisissez-les ou glissez-les <b>ensemble</b> (Insérer…, Ouvrir un fichier…, ou une archive .zip) : Disk 1 va dans DF0:, Disk 2 dans DF1:, etc., dans l'ordre des noms. DF2: et DF3: existent dès qu'une disquette y est placée à l'allumage ; sinon l'Amiga n'a que deux lecteurs, ce que certains jeux préfèrent. Les jeux qui savent lire plusieurs lecteurs ne demandent alors plus de changer de disquette. Les disquettes d'un même jeu (« Disk 1 », « Disk 2 »…) n'ont qu'une vignette à l'accueil, qui démarre sur la première ; pendant la partie, le bouton <b>Disquette suivante</b> (sous l'écran, et dans la barre du plein écran) met la suivante dans DF0:.</p>"
      + "<h3>Raccourcis clavier</h3><p>" + k("F12") + " ouvre ou ferme la Configuration (l'Amiga se met en pause). "
      + k("Ctrl") + "+" + k("Maj") + "+" + k("S") + " sauvegarde la partie dans l'emplacement 1, " + k("Ctrl") + "+" + k("Maj") + "+" + k("R") + " la reprend. " + k("Ctrl") + "+" + k("Maj") + "+" + k("→") + " active ou arrête le Turbo. "
      + k("Échap") + " rend la souris, ferme une fenêtre ou quitte le plein écran. Les infobulles des boutons rappellent ces raccourcis.</p>";
    body.insertBefore(sec, body.firstChild);
  } }

/* ---- Plusieurs disquettes d'un coup : choisies ou glissées ensemble, une par lecteur (DF0: à DF3:) ---- */
const isFloppyFile = f => /\.(adf|adz|dms|ipf|scp)(\.gz)?$/i.test(f.name);
async function insertFloppySet(files, start) {
  const fl = files.filter(isFloppyFile).sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
  const order = FD_TAGS.slice(Math.max(0, FD_TAGS.indexOf(start || "df0")));
  const used = [];
  for (const [i, f] of fl.entries()) { const t = order[i] || null; await importFile(f, t); if (t) used.push(t); }
  for (const f of files.filter(f => !isFloppyFile(f))) await importFile(f);
  setTimeout(() => toast(used.length + " disquettes insérées : " + fl.slice(0, used.length).map((f, i) => used[i].toUpperCase() + ": " + f.name.replace(/\.(adf|adz|dms|ipf|scp)(\.gz)?$/i, "")).join(", ")
    + (fl.length > used.length ? " ; les autres sont dans la Bibliothèque." : ".")
    + (running && used.some(t => DRIVE_NUM[t] >= (E._floppies || 2)) ? " DF2: et DF3: seront branchés au prochain allumage." : "")), 300);
}
function pickFloppies(start) {
  const inp = $("#filePick"); inp.value = ""; inp.multiple = true; inp.accept = ".adf,.dms,.adz,.zip,.gz,.ipf,.scp";
  inp.onchange = () => { const fs = [...inp.files]; if (fs.filter(isFloppyFile).length > 1) insertFloppySet(fs, start); else if (fs[0]) importFile(fs[0], start); };
  inp.click();
}
/* Insérer… d'un lecteur : plusieurs fichiers possibles, à partir de ce lecteur */
document.addEventListener("click", e => {
  const b = e.target.closest('.drive [data-act="insert"]'); if (!b) return;
  const tag = b.closest(".drive").dataset.unit; if (!/^df/.test(tag)) return;
  e.preventDefault(); e.stopPropagation(); pickFloppies(tag);
}, true);
/* Ouvrir un fichier… : plusieurs disquettes vont dans les lecteurs, le reste dans la Bibliothèque */
{ const o = $("#lOpen");
  if (o) o.onclick = () => {
    const inp = $("#filePick"); inp.value = ""; inp.multiple = true; inp.accept = ".adf,.adz,.dms,.zip,.gz,.lha,.lzh,.hdf,.rom,.bin,.key,.tar,.ipf,.scp,.iso,.cue";
    inp.onchange = async () => { const fs = [...inp.files]; if (fs.filter(isFloppyFile).length > 1) insertFloppySet(fs, "df0"); else for (const f of fs) await importFile(f); };
    inp.click();
  }; }
/* Glisser plusieurs disquettes sur la page ou sur un lecteur */
window.addEventListener("drop", e => {
  const files = [...((e.dataTransfer && e.dataTransfer.files) || [])];
  if (files.filter(isFloppyFile).length < 2) return;
  const tgt = typeof dropTarget === "string" && /^df/.test(dropTarget) ? dropTarget : "df0";
  e.preventDefault(); e.stopPropagation();
  dragDepth = 0; $("#dropzone").classList.remove("on"); $$(".drive, #slot").forEach(x => x.classList.remove("drop"));
  insertFloppySet(files, tgt);
}, true);
