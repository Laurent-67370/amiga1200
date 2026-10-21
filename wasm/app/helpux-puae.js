/* =========================================================
   Aide plus facile à parcourir
   =========================================================
   Les rubriques de l'aide (titres h3 posés par la page et par chaque module) sont rangées par thème, dans des
   sections dépliables, avec une recherche, des boutons de thème et des raccourcis vers les questions les plus
   courantes. Le texte lui-même ne change pas : il reste écrit à côté de chaque fonction. */
const HELP_GROUPS = [
  { id: "debut", icon: "🚀", title: "Bien démarrer", items: ["Démarrer comme un vrai A1200", "Où trouver quoi", "Installer l'application", "Installer sur disque dur", "Formats acceptés"] },
  { id: "jouer", icon: "🎮", title: "Jouer", items: ["Jeux WHDLoad en un geste", "Réglages par jeu WHDLoad", "Programmes seuls et paquets d'installation WHDLoad", "Quatre lecteurs de disquettes", "Disquettes protégées (IPF, SCP)", "Sauvegardes d'état", "CD32", "Amiga 500"] },
  { id: "disques", icon: "💾", title: "Disques durs et fichiers", items: ["Plusieurs disques durs", "Gros disques lus sur place (AGS…)", "Copier des fichiers sur le disque dur", "Enregistrement des disques", "Changer d'appareil"] },
  { id: "commandes", icon: "🕹️", title: "Clavier, souris et tactile", items: ["Clavier et souris", "Raccourcis clavier", "Jouer sur écran tactile", "Écran tactile"] },
  { id: "machine", icon: "⚙️", title: "Machine et réglages", items: ["Deux cœurs d'émulation", "Compatibilité et vitesse", "Configurations, chipset et commandes", "Workbench en haute résolution (RTG)", "A600, A3000, A4000 et CDTV", "MIDI"] }
];
/* Questions courantes : un bouton ouvre la bonne rubrique */
const HELP_TASKS = [
  ["Lancer un jeu WHDLoad (.lha)", "Jeux WHDLoad en un geste"],
  ["Installer le Workbench", "Installer sur disque dur"],
  ["AGS et gros disques .hdf", "Gros disques lus sur place (AGS…)"],
  ["Jouer au doigt sur téléphone", "Jouer sur écran tactile"],
  ["Sauvegarder ma partie", "Sauvegardes d'état"],
  ["Passer sur un autre appareil", "Changer d'appareil"]
];
const helpNorm = t => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function helpBuild() {
  const body = $("#winHelp .body"); if (!body || body.querySelector(".help-ui")) return;
  /* Rubriques existantes : un titre et ce qui le suit jusqu'au titre suivant */
  const secs = new Map();
  for (const h of [...body.querySelectorAll("h3")]) {
    const parts = []; let n = h.nextElementSibling;
    while (n && n.tagName !== "H3") { parts.push(n); n = n.nextElementSibling; }
    secs.set(h.textContent.trim(), { h, parts });
  }
  if (!secs.size) return;
  const version = body.querySelector("#siteVersion");
  const ui = document.createElement("div"); ui.className = "help-ui";
  ui.innerHTML = '<input type="search" class="help-search" placeholder="🔍 Rechercher dans l\'aide (ex. joystick, AGS, sauvegarde)…" aria-label="Rechercher dans l\'aide">'
    + '<div class="help-tasks"><span class="help-label">Je veux…</span></div>'
    + '<div class="help-chips"></div><div class="help-groups"></div><p class="help-none" hidden>Aucune rubrique ne correspond. Essayez un autre mot.</p>';
  const tasks = ui.querySelector(".help-tasks"), chips = ui.querySelector(".help-chips"), groups = ui.querySelector(".help-groups");
  const details = new Map();
  const used = new Set();
  const makeSec = (title, sec) => {
    const d = document.createElement("details"); d.className = "help-sec";
    const s = document.createElement("summary"); s.textContent = title; d.appendChild(s);
    const c = document.createElement("div"); c.className = "help-txt";
    for (const p of sec.parts) c.appendChild(p);
    d.appendChild(c); sec.h.remove();
    details.set(title, d); used.add(title);
    return d;
  };
  const all = [...HELP_GROUPS, { id: "autres", icon: "📌", title: "Autres sujets", items: [] }];
  for (const g of all) {
    const titles = g.id === "autres" ? [...secs.keys()].filter(t => !used.has(t) && !HELP_GROUPS.some(x => x.items.includes(t))) : g.items.filter(t => secs.has(t));
    if (!titles.length) continue;
    const box = document.createElement("section"); box.className = "help-group"; box.id = "help-" + g.id;
    const h = document.createElement("h2"); h.textContent = g.icon + " " + g.title; box.appendChild(h);
    for (const t of titles) box.appendChild(makeSec(t, secs.get(t)));
    groups.appendChild(box);
    const chip = document.createElement("button"); chip.type = "button"; chip.className = "help-chip"; chip.textContent = g.icon + " " + g.title;
    chip.onclick = () => { search.value = ""; filter(); box.scrollIntoView({ behavior: "smooth", block: "start" }); };
    chips.appendChild(chip);
  }
  const openSec = title => {
    const d = details.get(title); if (!d) return;
    search.value = ""; filter();
    d.open = true; d.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  for (const [label, title] of HELP_TASKS) {
    if (!details.has(title)) continue;
    const b = document.createElement("button"); b.type = "button"; b.className = "help-task"; b.textContent = label;
    b.onclick = () => openSec(title); tasks.appendChild(b);
  }
  /* Recherche : rubriques dont le titre ou le texte contient tous les mots tapés, dépliées */
  const search = ui.querySelector(".help-search"), none = ui.querySelector(".help-none");
  const filter = () => {
    const words = helpNorm(search.value).split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const box of groups.children) {
      let any = false;
      for (const d of box.querySelectorAll(".help-sec")) {
        const ok = !words.length || words.every(w => helpNorm(d.textContent).includes(w));
        d.hidden = !ok; if (ok) { any = true; shown++; }
        if (words.length) d.open = ok;
      }
      box.hidden = !any;
    }
    tasks.hidden = chips.hidden = words.length > 0;
    none.hidden = shown > 0;
  };
  search.addEventListener("input", filter);
  /* Ce qui reste hors rubriques (version du site…) garde sa place, en tête */
  const leftovers = [...body.children].filter(n => n !== version && !n.matches(".ux-keys"));
  const ux = body.querySelector(".ux-keys"); if (ux && !ux.children.length) ux.remove(); else if (ux) leftovers.push(ux);
  body.textContent = "";
  if (version) body.appendChild(version);
  body.appendChild(ui);
  for (const n of leftovers) if (n.textContent.trim()) groups.appendChild(n);
}
helpBuild();
/* Panneau « Aide et à propos » de la Configuration : l'aide d'abord, les crédits ensuite */
{ const p = typeof AB_PANELS !== "undefined" && AB_PANELS.find(x => x.id === "about"); if (p && p.hosts[0] === "about") p.hosts = ["help", "about"]; }
