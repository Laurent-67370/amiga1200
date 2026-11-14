
/* =========================================================
   Mode simple (?simple=1) : l'émulateur tel que l'ouvre le 68k Trainer, sans réglages à faire.
   Éteint : une carte (Amiga 500 ou 1200, Kickstart, Allumer). En marche : l'écran de l'Amiga en grand et une barre
   de quelques gros boutons (Trainer, Relancer, Pause, Clavier, Joystick, Plein écran, Éteindre). Le reste
   (configuration, Bibliothèque, lecteurs) reste à portée par « Réglages avancés », sans rien changer à l'émulateur.
   ========================================================= */
const SIMPLE = new URLSearchParams(location.search).has("simple") || new URLSearchParams(location.search).has("integre");
/* Placé dans la page du Trainer (?integre=1) : le Trainer choisit le modèle et reste affiché autour */
const INTEGRE = new URLSearchParams(location.search).has("integre");
let simpleAvance = false;
function simpleRetour() {
  if (window.AndroidEmulateur && AndroidEmulateur.retour) return AndroidEmulateur.retour();
  if (history.length > 1) return history.back();
  location.href = "trainer/";
}
async function simpleKick() {
  const el = $("#simpleKick"); if (!el) return;
  let all = [];
  try { all = await DB.all(); } catch (e) {}
  const m = S.model === "a500" ? "a500" : "a1200";
  const id = m === "a500" ? await romFor500(all) : S.romId;
  const rec = id && id !== "aros" ? all.find(r => r.id === id) : null;
  el.textContent = rec ? (rec.label || rec.name) : "AROS, le Kickstart libre (fourni)";
  el.classList.toggle("libre", !rec);
  $("#simpleKickNote").textContent = rec ? "" : (m === "a500" ? "Pour un vrai Amiga 500 : ton Kickstart 1.3." : "Pour un vrai Amiga 1200 : ton Kickstart 3.1.");
  $$("#simpleCarte [data-modele]").forEach(b => b.setAttribute("aria-pressed", b.dataset.modele === m ? "true" : "false"));
}
function simpleMaj(st) {
  if (!SIMPLE) return;
  document.body.classList.toggle("simple-marche", st === "on" || st === "starting");
  const p = $("#simpleBarre [data-s=pause]");
  if (p) p.textContent = paused ? "▶ Reprendre" : "⏸ Pause";
  if (st === "off") simpleKick();
}
if (SIMPLE) {
  document.body.classList.add("mode-simple");
  if (INTEGRE) document.body.classList.add("mode-integre");
  /* La fenêtre de configuration ne s'ouvre plus d'elle-même (accueil, extinction) : seulement par « Réglages avancés » */
  {
    const ouvrir = abOpen, fermer = abClose;
    abOpen = p => { if (simpleAvance) ouvrir(p); };
    abClose = () => { fermer(); simpleAvance = false; };
    fermer();
  }
  const carte = document.createElement("div");
  carte.id = "simpleCarte"; carte.className = "simple-carte";
  carte.innerHTML =
    '<h2>Amiga</h2>' +
    '<div class="simple-modeles" role="group" aria-label="Modèle">' +
    '<button type="button" data-modele="a500">Amiga 500</button><button type="button" data-modele="a1200">Amiga 1200</button></div>' +
    '<p class="simple-kick">Kickstart : <b id="simpleKick"></b></p>' +
    '<p class="simple-note" id="simpleKickNote"></p>' +
    '<button type="button" class="simple-btn" data-s="kick">Importer mon Kickstart…</button>' +
    '<button type="button" class="simple-btn simple-allumer" data-s="allumer">▶ Allumer</button>' +
    '<div class="simple-bas"><button type="button" data-s="retour">◀ Trainer</button>' +
    '<button type="button" data-s="avance">Réglages avancés</button></div>';
  $("#tube").appendChild(carte);
  const barre = document.createElement("nav");
  barre.id = "simpleBarre"; barre.className = "simple-barre"; barre.setAttribute("aria-label", "Commandes");
  for (const [k, t] of [["simulateur", "◀ Simulateur"], ["retour", "◀ Trainer"], ["reset", "↻ Relancer"], ["pause", "⏸ Pause"], ["clavier", "⌨ Clavier"],
    ["joy", "🕹 Joystick"], ["plein", "⛶ Plein écran"], ["eteindre", "⏹ Éteindre"]]) {
    const b = document.createElement("button"); b.type = "button"; b.dataset.s = k; b.textContent = t; barre.appendChild(b);
  }
  $(".monitor").after(barre);
  const agir = k => {
    if (k === "retour") return simpleRetour();
    /* Dans la page du Trainer : retour à l'Amiga simulé (le sélecteur du Trainer peut être hors de vue) */
    if (k === "simulateur") return window.parent.postMessage({ type: "68kt-simulateur" }, location.origin);
    if (k === "avance") { simpleAvance = true; return abOpen("play"); }
    if (k === "allumer") return powerOn();
    if (k === "kick") return pickFiles(".rom,.bin,.key", files => { (async () => { for (const f of files) await importFile(f); simpleKick(); })(); });
    if (k === "reset") return $("#btnReset").click();
    if (k === "pause") { $("#btnPause").click(); return setTimeout(() => simpleMaj(running ? "on" : "off"), 50); }
    if (k === "clavier") return $("#kbdToggle").click();
    if (k === "joy") return document.body.classList.toggle("simple-joy");
    if (k === "plein") return $("#btnFull").click();
    if (k === "eteindre") return powerOff();
  };
  for (const el of [carte, barre]) el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.modele) { S.model = b.dataset.modele; saveSettings(); if (typeof themeNow === "function") themeNow(); simpleKick(); return; }
    if (b.dataset.s) agir(b.dataset.s);
  });
  { const avant = setPowerUi; setPowerUi = st => { avant(st); simpleMaj(st); }; }
  /* Dans la page du Trainer : la hauteur utile (écran, boutons, clavier ouvert) est donnée au Trainer, qui ajuste la
     place de l'émulateur (sinon le clavier s'ouvrirait hors de vue) */
  if (INTEGRE && window.parent !== window && window.ResizeObserver) {
    let derniere = 0;
    const mesurer = () => {
      const bas = Math.max(...["#tube", ".monitor", "#simpleBarre", "#vkbd", ".vjoy"].map(s => $(s))
        .filter(e => e && e.offsetParent !== null).map(e => e.getBoundingClientRect().bottom + scrollY));
      const h = Math.ceil(bas + 6);
      if (h > 50 && Math.abs(h - derniere) > 2) { derniere = h; window.parent.postMessage({ type: "68kt-taille", hauteur: h }, location.origin); }
    };
    new ResizeObserver(mesurer).observe(document.body);
    for (const s of [".rig", "#vkbd", "#simpleBarre"]) if ($(s)) new ResizeObserver(mesurer).observe($(s));
    new MutationObserver(mesurer).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["hidden", "class"] });
  }
  simpleMaj(running ? "on" : "off");
}
