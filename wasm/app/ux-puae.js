/* =========================================================
   Navigation : commandes rangées par usage, mêmes mots partout, raccourcis
   =========================================================
   Barre de commandes en quatre groupes (Machine, Jeux, Écran et son, Émulateur), libellés et infobulles qui
   donnent les raccourcis ; lecteurs aux verbes cohérents (disquette : Insérer, Éjecter ; disque dur : Brancher,
   Débrancher), disques DH1: à DH3: repliés tant qu'ils sont vides ; sur téléphone, barre en grille d'icônes et
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
  for (const t of ["df0", "df1"]) {
    const c = $("#drive-" + t); if (!c) continue;
    const set = (act, title) => { const b = c.querySelector('[data-act="' + act + '"]'); if (b) b.title = title; };
    set("insert", "Insérer une disquette de la Bibliothèque ou de l'ordinateur dans " + t.toUpperCase() + ":");
    set("eject", "Éjecter la disquette (elle reste dans la Bibliothèque)");
    set("blank", "Insérer une disquette vierge formatée");
    set("download", "Enregistrer une copie de cette disquette sur l'ordinateur");
    set("profile", "Réglages propres à cette disquette : modèle, processeur, mémoire…");
  }
  const extra = HD_TAGS.slice(1).map(t => $("#drive-" + t)).filter(Boolean);
  const box = $(".drives"); if (!box || !extra.length) return;
  const tog = document.createElement("button");
  tog.className = "gad small drives-more"; tog.type = "button";
  tog.setAttribute("aria-expanded", "false");
  box.appendChild(tog);
  uxDrivesRefresh = () => {
    const used = extra.filter(c => mounted[c.dataset.unit]).length;
    const open = !!S.drivesMore || used > 0;
    extra.forEach(c => c.hidden = !open);
    tog.hidden = used > 0;
    tog.setAttribute("aria-expanded", open ? "true" : "false");
    tog.textContent = open ? "Masquer les disques DH1: à DH3:" : "Autres disques durs (DH1: à DH3:)…";
  };
  tog.onclick = () => { S.drivesMore = !S.drivesMore; saveSettings(); uxDrivesRefresh(); };
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
    sec.innerHTML = "<h3>Où trouver quoi</h3><p><b>Machine</b> : allumer, réinitialiser, pause. <b>Jeux et fichiers</b> : la Bibliothèque (disquettes, disques durs, jeux WHDLoad, CD, Kickstart) et les Sauvegardes d'état. <b>Écran et son</b> : plein écran, capture, son. <b>Configuration</b> : tous les réglages de l'émulateur, rangés comme dans Amiberry ; un réglage se retrouve avec la recherche en haut à gauche. Sous la barre, les lecteurs : <b>Insérer</b> et <b>Éjecter</b> une disquette, <b>Brancher</b> et <b>Débrancher</b> un disque dur.</p>"
      + "<h3>Raccourcis clavier</h3><p>" + k("F12") + " ouvre ou ferme la Configuration (l'Amiga se met en pause). "
      + k("Ctrl") + "+" + k("Maj") + "+" + k("S") + " sauvegarde la partie dans l'emplacement 1, " + k("Ctrl") + "+" + k("Maj") + "+" + k("R") + " la reprend. "
      + k("Échap") + " rend la souris, ferme une fenêtre ou quitte le plein écran. Les infobulles des boutons rappellent ces raccourcis.</p>";
    body.insertBefore(sec, body.firstChild);
  } }
