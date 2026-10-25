/* =========================================================
   Interface façon Amiberry 8
   =========================================================
   Comme au lancement d'Amiberry : une fenêtre Workbench grise, une barre latérale de panneaux rangés par groupes
   (Général, Matériel, Stockage, Extensions, Sortie, Entrées, Utilitaires), une case « Réglages experts » et une recherche,
   et en bas Éteindre, Réinitialiser, Quitter, Recharger, Démarrer/Reprendre, Aide. Les panneaux ne refont rien : ils
   accueillent les éléments déjà en place dans la page (réglages, Bibliothèque, lecteurs, sauvegardes, accueil, aide),
   déplacés le temps que l'interface est ouverte, avec leurs boutons et leurs réglages. F12 ouvre et ferme l'interface. */
const AB_ICON = {
  play: "M7 4v16l13-8z",
  rocket: "M12 2c3 2 5 6 5 10l-2 3H9l-2-3c0-4 2-8 5-10zm0 6a2 2 0 100 4 2 2 0 000-4zM7 17l-3 4h4l1-2zm10 0l3 4h-4l-1-2z",
  file: "M6 2h8l5 5v15H6zm8 1v5h5M8 12h9v1.6H8zm0 4h9v1.6H8z",
  download: "M11 3h2v9l3-3 1.4 1.4L12 15.8 6.6 10.4 8 9l3 3zM4 18h16v3H4z",
  info: "M12 2a10 10 0 110 20 10 10 0 010-20zm-1 8v8h2v-8zm0-4v2h2V6z",
  chip: "M8 3h2v2h4V3h2v2h3v3h2v2h-2v4h2v2h-2v3h-3v2h-2v-2h-4v2H8v-2H5v-3H3v-2h2v-4H3V8h2V5h3zm0 5v8h8V8z",
  sim: "M6 2h9l4 4v16H6zm3 9v8h7v-8zm2 2h3v4h-3z",
  memory: "M2 7h20v9h-2v2h-2v-2h-3v2h-2v-2H9v2H7v-2H4v2H2zm3 3v3h3v-3zm5 0v3h4v-3zm6 0v3h3v-3z",
  floppy: "M4 3h13l3 3v15H4zm3 0v6h9V3zm6 1h2v4h-2zM7 13v8h10v-8z",
  hdd: "M3 13l3-9h12l3 9v7H3zm2 2v3h14v-3zm11 1h2v1h-2z",
  tv: "M3 5h18v12H3zm2 2v8h14V7zM8 19h8v2H8z",
  desktop: "M2 4h20v13h-8v2h3v2H7v-2h3v-2H2zm2 2v9h16V6z",
  volume: "M3 9h4l5-5v16l-5-5H3zm12-1a5 5 0 010 8l-1.2-1.6a3 3 0 000-4.8zm2.5-3a9 9 0 010 14l-1.2-1.6a7 7 0 000-10.8z",
  gamepad: "M7 7h10a5 5 0 015 5v3a3 3 0 01-5.4 1.8L15 15H9l-1.6 1.8A3 3 0 012 15v-3a5 5 0 015-5zm0 3v2H5v2h2v2h2v-2h2v-2H9v-2zm9 1a1 1 0 100 2 1 1 0 000-2zm2 2a1 1 0 100 2 1 1 0 000-2z",
  wrench: "M21 7a5 5 0 01-7 4.6L6 19.6 4.4 18l8-8A5 5 0 0118.4 3l-3 3 .8 1.8L18 8.6z",
  bookmark: "M6 2h12v20l-6-4-6 4z",
  power: "M11 2h2v10h-2zm-4.2 3.4l1.4 1.4A6 6 0 1015.8 6.8l1.4-1.4A8 8 0 116.8 5.4z",
  reset: "M12 4a8 8 0 017.7 6h-2.1A6 6 0 106 12H3l4-4 4 4H8a4 4 0 104-4z",
  quit: "M4 3h10v4h-2V5H6v14h6v-2h2v4H4zm12 5l5 4-5 4v-3h-6v-2h6z",
  reload: "M12 4V1l4 4-4 4V6a6 6 0 106 6h2a8 8 0 11-8-8z",
  help: "M12 2a10 10 0 110 20 10 10 0 010-20zm-1 14v2h2v-2zm1-10a4 4 0 00-4 4h2a2 2 0 114 0c0 2-3 2-3 5h2c0-2 3-2.5 3-5a4 4 0 00-4-4z",
  folder: "M2 5h7l2 2h11v13H2zm2 4v9h16V9z",
  board: "M3 3h18v18H3zm2 2v14h14V5zm2 2h4v4H7zm6 0h4v2h-4zm0 4h4v2h-4zm-6 2h4v4H7zm6 2h4v2h-4z",
  search: "M10 3a7 7 0 015.6 11.2l5.2 5.2-1.4 1.4-5.2-5.2A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10z"
};
const abSvg = n => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${AB_ICON[n]}"/></svg>`;
/* Panneaux : groupe, icône, « simple » (visible sans les réglages experts), hôte(s) et sections des réglages */
const AB_PANELS = [
  { id: "play", label: "Jouer", group: "Général", icon: "play", simple: true, hosts: ["idle"] },
  { id: "quick", label: "Démarrage rapide", group: "Général", icon: "rocket", hosts: ["settings"], secs: ["Modèle"] },
  { id: "configs", label: "Configurations", group: "Général", icon: "file", simple: true, hosts: ["configs"] },
  { id: "library", label: "Bibliothèque", group: "Général", icon: "folder", simple: true, hosts: ["lib"] },
  { id: "whdload", label: "WHDLoad", group: "Général", icon: "download", hosts: ["settings"], secs: ["Jeux WHDLoad"] },
  { id: "about", label: "À propos", group: "Général", icon: "info", simple: true, hosts: ["about", "help"] },
  { id: "cpu", label: "Processeur et FPU", group: "Matériel", icon: "chip", hosts: ["settings"], secs: ["Cœur d'émulation", "Processeur", "Carte accélératrice", "Compatibilité"] },
  { id: "rom", label: "ROM", group: "Matériel", icon: "sim", hosts: ["settings"], secs: ["Kickstart"] },
  { id: "chipset", label: "Chipset", group: "Matériel", icon: "board", hosts: ["settings"], secs: ["Chipset"] },
  { id: "ram", label: "Mémoire", group: "Matériel", icon: "memory", hosts: ["settings"], secs: ["Mémoire"] },
  { id: "floppy", label: "Lecteurs de disquettes", group: "Stockage", icon: "floppy", hosts: ["drives", "settings"], secs: ["Lecteurs de disquettes"] },
  { id: "hd", label: "Disques durs/CD", group: "Stockage", icon: "hdd", hosts: ["drives"] },
  { id: "rtg", label: "Carte RTG", group: "Extensions", icon: "tv", hosts: ["settings"], secs: ["Carte graphique RTG"] },
  { id: "display", label: "Affichage", group: "Sortie", icon: "desktop", simple: true, hosts: ["settings"], secs: ["Affichage"] },
  { id: "sound", label: "Son", group: "Sortie", icon: "volume", hosts: ["sound"] },
  { id: "input", label: "Entrées", group: "Entrées / ports", icon: "gamepad", simple: true, hosts: ["settings", "ctl"], secs: ["Joystick", "Clavier à l'écran"] },
  { id: "misc", label: "Divers", group: "Utilitaires", icon: "wrench", hosts: ["settings"], secs: ["MIDI"] },
  { id: "states", label: "Sauvegardes d'état", group: "Utilitaires", icon: "bookmark", hosts: ["states"] }
];
const AB_HOST_SEL = { idle: "#idle", settings: "#winSettings", lib: "#winLib", states: "#winStates", help: "#winHelp", drives: ".drives" };
const AB_OWN = { about: "#abAbout", sound: "#abSound", configs: "#abConfigs", ctl: "#abCtl" }; /* éléments propres à l'interface */
const AB_WIN_PANEL = { winSettings: "quick", winLib: "library", winStates: "states", winHelp: "about" };

const ab = { el: null, panel: null, homes: new Map(), pausedByGui: false, open: false };

/* Réglages : chaque titre (h3) et ce qui le suit forment une section, que les panneaux montrent ou cachent */
function abWrapSettings() {
  const body = $("#winSettings .body"); if (!body || body.dataset.abWrapped) return;
  let sec = null;
  for (const n of [...body.childNodes]) {
    if (n.nodeType === 1 && n.tagName === "H3") { sec = document.createElement("div"); sec.className = "ab-sec"; sec.dataset.title = n.textContent.trim(); body.insertBefore(sec, n); }
    if (sec) sec.appendChild(n);
  }
  body.dataset.abWrapped = "1";
}

function abBuild() {
  const g = document.createElement("div"); g.id = "ambGui"; g.hidden = true;
  g.innerHTML = `<div class="ab-win" role="dialog" aria-label="Configuration de l'émulateur">
    <div class="ab-title"><span class="ab-tname">Émulateur Amiga — Configuration</span><span class="ab-tstate"></span></div>
    <div class="ab-main">
      <aside class="ab-side ab-sunk">
        <input class="ab-search" type="search" placeholder="Rechercher…" aria-label="Rechercher un panneau">
        <label class="ab-check"><input type="checkbox" class="ab-expert"> Réglages experts</label>
        <nav class="ab-nav"></nav>
      </aside>
      <section class="ab-pane ab-sunk"><div class="ab-box"><span class="ab-legend"></span><div class="ab-content"></div></div></section>
    </div>
    <div class="ab-bar">
      <button class="ab-btn" data-ab="shutdown">${abSvg("power")} Éteindre</button>
      <button class="ab-btn" data-ab="reset">${abSvg("reset")} Réinitialiser</button>
      <button class="ab-btn" data-ab="quit" title="Quitter l'interface pour la présentation classique de la page">${abSvg("quit")} Quitter</button>
      <button class="ab-btn" data-ab="reload" title="Rallumer l'Amiga avec les réglages affichés">${abSvg("reload")} Recharger</button>
      <span class="ab-sp"></span>
      <button class="ab-btn" data-ab="install" hidden title="Installer l'émulateur comme une application, utilisable hors ligne">${abSvg("download")} Installer</button>
      <button class="ab-btn ab-primary" data-ab="start">${abSvg("play")} <span>Démarrer</span></button>
      <button class="ab-btn" data-ab="help">${abSvg("help")} Aide</button>
    </div>
  </div>
  <div class="ab-park" hidden></div>`;
  document.body.appendChild(g);
  ab.el = g;
  /* Panneaux propres à l'interface */
  const about = document.createElement("div"); about.className = "ab-about"; about.id = "abAbout";
  about.innerHTML = `<dl>
    <dt>Cœur par défaut</dt><dd>WinUAE 6, par le cœur libretro d'Amiberry 8.3 (GPL v3), compilé en WebAssembly</dd>
    <dt>Autre cœur</dt><dd>PUAE (base WinUAE 5, libretro)</dd>
    <dt>Kickstart libre</dt><dd>AROS (AROS Public License)</dd>
    <dt>Disquettes IPF</dt><dd>SPS Decoder Library 5.1 (© 2001-2014 István Fábián, KryoFlux Products &amp; Services Ltd), usage non commercial, module séparé</dd>
    <dt>Hors ligne</dt><dd id="abOffline"></dd>
    <dt>Applications</dt><dd>Android et Mac (avec JIT), Windows et Linux : <a href="#" data-apps>liens de téléchargement</a></dd>
    <dt>Interface</dt><dd>inspirée de celle d'Amiberry ; police Amiga Topaz de Patrick Lauke (CC BY 3.0)</dd>
  </dl>`;
  const sound = document.createElement("div"); sound.id = "abSound";
  sound.innerHTML = `<div class="opt"><label class="ab-check"><input type="checkbox" id="abMute"> Couper le son</label></div>
    <p class="hint">Le bruit des lecteurs de disquettes se règle dans Lecteurs de disquettes ; le MIDI, dans Divers.</p>`;
  g.querySelector(".ab-park").append(about, sound);
  sound.querySelector("#abMute").onchange = e => { if (!!S.muted !== e.target.checked) $("#btnMute").click(); };
  /* Barre latérale */
  const expert = g.querySelector(".ab-expert");
  expert.checked = S.abExpert !== false;
  expert.onchange = () => { S.abExpert = expert.checked; saveSettings(); abNav(); if (!abVisible(AB_PANELS.find(p => p.id === ab.panel))) abShow("play"); };
  g.querySelector(".ab-search").oninput = () => abNav();
  g.querySelector(".ab-bar").onclick = e => { const b = e.target.closest("[data-ab]"); if (b) abAction(b.dataset.ab); };
  abNav();
  pwaRefresh();
}
function abVisible(p) {
  if (!p) return false;
  const q = ab.el.querySelector(".ab-search").value.trim().toLowerCase();
  if (q) return (p.label + " " + (p.secs || []).join(" ") + " " + p.group).toLowerCase().includes(q);
  return S.abExpert !== false || p.simple;
}
function abNav() {
  const nav = ab.el.querySelector(".ab-nav"); nav.innerHTML = "";
  const shut = new Set(S.abShut || []), q = ab.el.querySelector(".ab-search").value.trim();
  let group = null;
  for (const p of AB_PANELS) {
    if (!abVisible(p)) continue;
    if (p.group !== group) {
      group = p.group;
      const h = document.createElement("div"); h.className = "ab-group" + (shut.has(group) && !q ? " shut" : ""); h.textContent = group.toUpperCase();
      const gname = group;
      h.onclick = () => { const s = new Set(S.abShut || []); s.has(gname) ? s.delete(gname) : s.add(gname); S.abShut = [...s]; saveSettings(); abNav(); };
      nav.appendChild(h);
    }
    if (shut.has(group) && !q && p.id !== ab.panel) continue;
    const b = document.createElement("button"); b.className = "ab-item"; b.type = "button";
    b.innerHTML = abSvg(p.icon) + "<span></span>"; b.lastChild.textContent = p.label;
    if (p.id === ab.panel) b.setAttribute("aria-current", "true");
    b.onclick = () => abShow(p.id);
    nav.appendChild(b);
  }
}

/* Les éléments de la page entrent dans l'interface à son ouverture, et retrouvent leur place à sa fermeture */
function abHost(name) {
  return $(AB_OWN[name] || AB_HOST_SEL[name]);
}
function abAdopt() {
  const park = ab.el.querySelector(".ab-park");
  for (const name of Object.keys(AB_HOST_SEL)) {
    const el = abHost(name); if (!el || ab.homes.has(el)) continue;
    ab.homes.set(el, [el.parentNode, el.nextSibling]);
    park.appendChild(el);
  }
}
function abRelease() {
  for (const [el, [parent, next]] of ab.homes) {
    if (next && next.parentNode === parent) parent.insertBefore(el, next); else parent.appendChild(el);
  }
  ab.homes.clear();
}
function abRefresh(name) {
  try {
    if (name === "settings") {
      if (typeof syncSettingsForm === "function") syncSettingsForm();
      if (typeof renderRomChoices === "function") renderRomChoices();
      if (typeof renderRom500 === "function") renderRom500();
      if (typeof renderModelRom === "function") renderModelRom();
      if (typeof renderMidiChoices === "function") renderMidiChoices();
    } else if (name === "lib" && typeof renderLib === "function") renderLib();
    else if (name === "states" && typeof renderStates === "function") renderStates();
    else if (name === "idle" && typeof renderLauncher === "function") renderLauncher();
    else if (name === "sound") $("#abMute").checked = !!S.muted;
    else if (name === "ctl") renderCtl();
    else if (name === "configs") renderCfgs();
  } catch (e) { console.warn(e); }
}
function abShow(id) {
  const p = AB_PANELS.find(x => x.id === id) || AB_PANELS[0];
  ab.panel = p.id; ab.el.dataset.panel = p.id;
  const content = ab.el.querySelector(".ab-content"), park = ab.el.querySelector(".ab-park");
  for (const el of [...content.children]) park.appendChild(el);
  for (const name of p.hosts) {
    const el = abHost(name); if (!el) continue;
    content.appendChild(el); abRefresh(name);
    if (name === "settings") for (const s of el.querySelectorAll(".ab-sec")) s.hidden = !(p.secs || []).some(t => s.dataset.title.startsWith(t));
  }
  ab.el.querySelector(".ab-legend").textContent = p.label;
  ab.el.querySelector(".ab-pane").scrollTop = 0;
  abNav();
}
function abState() {
  const st = ab.el.querySelector(".ab-tstate");
  ab.el.toggleAttribute("data-running", running);
  st.textContent = running ? (paused ? "en pause" : "en marche") : starting ? "démarrage…" : "éteint";
  ab.el.querySelector('[data-ab="shutdown"]').hidden = !running;
  ab.el.querySelector('[data-ab="reset"]').hidden = !running;
  ab.el.querySelector('[data-ab="start"] span').textContent = running ? "Reprendre" : "Démarrer";
}
function abOpen(panel) {
  if (!ab.el) abBuild();
  if (!ab.open) {
    abAdopt(); ab.open = true; ab.el.hidden = false;
    if (running && !paused) { ab.pausedByGui = true; $("#btnPause").click(); }
    document.body.style.overflow = "hidden";
  }
  abShow(panel || ab.panel || "play");
  abState();
}
function abClose() {
  if (!ab.open) return;
  const content = ab.el.querySelector(".ab-content"), park = ab.el.querySelector(".ab-park");
  for (const el of [...content.children]) park.appendChild(el);
  abRelease(); ab.open = false; ab.el.hidden = true;
  document.body.style.overflow = "";
  if (ab.pausedByGui && running && paused) $("#btnPause").click();
  ab.pausedByGui = false;
  if (typeof renderLauncherSoon === "function") renderLauncherSoon();
}
async function abAction(a) {
  if (a === "help") return abShow("about");
  if (a === "install") return pwaInstall();
  if (a === "quit") return abClose();
  if (a === "start") { if (running) return abClose(); return powerOn(); }
  if (a === "reset") { if (running) { $("#btnReset").click(); abClose(); } return; }
  if (a === "shutdown") { if (running) await powerOff(); return; }
  if (a === "reload") { if (running) { if (S.autosave) await saveAllDisks(true); sessionStorage.setItem("a1200.autostart", "1"); location.reload(); } else powerOn(); }
}

/* Raccordements : boutons de la page, fenêtres, allumage et extinction, F12 */
{ const _sw = showWin; showWin = id => { if (AB_WIN_PANEL[id]) return abOpen(AB_WIN_PANEL[id]); return _sw(id); }; }
/* Le bouton Réglages de la barre devient celui de l'interface (elle s'ouvre sur le dernier panneau affiché) */
{ const b = $("#btnSettings"); b.onclick = () => abOpen(); b.title = "Interface de l'émulateur (F12)";
  const t = [...b.childNodes].reverse().find(n => n.nodeType === 3 && n.textContent.trim()); if (t) t.textContent = " Interface"; }
$("#btnLib").onclick = () => abOpen("library");
$("#btnStates").onclick = () => abOpen("states");
$("#btnHelp").onclick = () => abOpen("about");
{ const _s = onStarted; onStarted = (...x) => { _s(...x); abClose(); }; }
{ const _s = onStopped; onStopped = (...x) => { _s(...x); abOpen("play"); }; }
{ const _p = setPowerUi; setPowerUi = st => { _p(st); if (ab.el && ab.open) abState(); }; }
window.addEventListener("keydown", e => {
  if (e.code !== "F12" || e.repeat) return;
  e.preventDefault(); e.stopPropagation();
  ab.open ? abClose() : abOpen();
}, true);
abWrapSettings();
/* Au chargement : l'interface, sauf si l'Amiga se rallume tout seul (rallumage, reprise d'une sauvegarde) */
if (!sessionStorage.getItem("a1200.autostart")) abOpen("play");
