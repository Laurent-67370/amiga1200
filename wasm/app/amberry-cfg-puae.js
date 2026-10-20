/* =========================================================
   Panneaux d'Amiberry : Chipset, mémoire Chip/Slow, commandes personnalisées, configurations nommées
   =========================================================
   - Chipset : OCS, ECS ou AGA, blitter immédiat ou attendu, niveau de collisions ; mémoire Chip et Slow. Avec WinUAE 6
     par des lignes de configuration, avec PUAE par ses options (sauf le chipset, que PUAE tire du modèle).
   - Commandes : touches du joystick au clavier et rôle de chaque bouton de la manette (bouton de joystick, direction
     ou touche du clavier), pour tous les jeux ou pour un seul (enregistré avec le disque, le jeu WHDLoad ou le CD).
   - Configurations : réglages enregistrés sous un nom, rechargés d'un clic ; import et export au format .uae de
     WinUAE et d'Amiberry. */

/* ---- Chipset et mémoire ---- */
const CHIP_DEFAULTS = { chipset: "auto", blitter: "auto", collision: "playfields", chipmem: "auto", slowmem: "auto" };
for (const k in CHIP_DEFAULTS) if (S[k] === undefined) S[k] = CHIP_DEFAULTS[k];
const CHIP_KEYS = Object.keys(CHIP_DEFAULTS);
/* Lignes WinUAE 6 (après le préréglage du modèle, qu'elles corrigent) */
function chipLines(e) {
  const l = [];
  if (e.chipset && e.chipset !== "auto") l.push("chipset=" + e.chipset);
  if (e.chipmem && e.chipmem !== "auto") l.push("chipmem_size=" + e.chipmem);
  if (e.slowmem && e.slowmem !== "auto") l.push("bogomem_size=" + e.slowmem);
  if (e.blitter === "immediate") l.push("immediate_blits=true");
  else if (e.blitter === "wait") l.push("waiting_blits=automatic");
  if (e.collision && e.collision !== "playfields") l.push("collision_level=" + e.collision);
  return l;
}
/* Options PUAE (mêmes valeurs que les lignes WinUAE pour la mémoire) */
function chipOpts(e) {
  const o = {};
  if (e.chipmem && e.chipmem !== "auto") o.puae_chipmem_size = e.chipmem;
  if (e.slowmem && e.slowmem !== "auto") o.puae_bogomem_size = e.slowmem;
  if (e.blitter === "immediate") o.puae_immediate_blits = "immediate";
  else if (e.blitter === "wait") o.puae_immediate_blits = "waiting";
  if (e.collision) o.puae_collision_level = e.collision;
  return o;
}
{ const body = $("#winSettings .body"), at = [...body.querySelectorAll("h3")].find(h => h.textContent.trim() === "Kickstart");
  const radios = (name, list) => `<div class="opt" data-chip="${name}">` + list.map(([v, t]) => `<label><input type="radio" name="${name}" value="${v}"> ${t}</label>`).join("") + "</div>";
  const html = `<h3>Chipset</h3>
      ${radios("chipset", [["auto", "Celui du modèle"], ["ocs", "OCS"], ["ecs_agnus", "ECS Agnus"], ["ecs", "ECS complet"], ["aga", "AGA"]])}
      <p class="hint">WinUAE 6 seulement (PUAE garde le chipset du modèle). OCS : A500 et A2000 d'origine ; ECS : A600 et A3000 ; AGA : A1200, A4000 et CD32. Les jeux AGA ne démarrent pas sans l'AGA.</p>
      <p class="hint">Blitter :</p>
      ${radios("blitter", [["auto", "Normal"], ["immediate", "Immédiat (plus rapide, moins fidèle)"], ["wait", "Attente du blitter (jeux mal écrits)"]])}
      <p class="hint">Collisions :</p>
      ${radios("collision", [["playfields", "Sprites et décors (recommandé)"], ["sprites", "Sprites seulement"], ["full", "Complètes"], ["none", "Aucune"]])}
      <h3>Mémoire Chip et Slow</h3>
      ${radios("chipmem", [["auto", "Celle du modèle"], ["1", "512 Ko"], ["2", "1 Mo"], ["4", "2 Mo"]])}
      <p class="hint">Mémoire Slow (« Ranger », sous la trappe de l'A500) :</p>
      ${radios("slowmem", [["auto", "Celle du modèle"], ["0", "Aucune"], ["2", "512 Ko"], ["4", "1 Mo"], ["6", "1,5 Mo"]])}
      <p class="hint">Plus d'1 Mo de Chip demande un chipset ECS ou AGA. Ces réglages ne s'appliquent ni aux jeux WHDLoad ni aux consoles CD. Prochain allumage.</p>`;
  at.insertAdjacentHTML("beforebegin", html);
  for (const k of CHIP_KEYS) $$(`#winSettings input[name="${k}"]`).forEach(i => i.addEventListener("change", () => { S[k] = i.value; saveSettings(); }));
}
function syncChipForm() { for (const k of CHIP_KEYS) $$(`#winSettings input[name="${k}"]`).forEach(i => i.checked = i.value === String(S[k] ?? CHIP_DEFAULTS[k])); }
{ const _s = syncSettingsForm; syncSettingsForm = () => { _s(); syncChipForm(); }; }
syncChipForm();

/* ---- Commandes personnalisées ---- */
const CTL_ACTS = [["up", "Haut", 4], ["down", "Bas", 5], ["left", "Gauche", 6], ["right", "Droite", 7], ["fire1", "Tir 1", 0], ["fire2", "Tir 2", 8]];
const CTL_BIT = Object.fromEntries(CTL_ACTS.map(a => [a[0], a[2]]));
const CTL_KEYS_DEF = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", fire1: "ControlRight", fire2: "ShiftRight" };
/* Boutons de la manette (disposition « standard » du navigateur) et leur rôle par défaut */
const CTL_PAD = [[0, "A (bas)", "Tir 1"], [1, "B (droite)", "Tir 2"], [2, "X (gauche)", "bouton CD32 bleu"], [3, "Y (haut)", "bouton CD32 jaune"],
  [4, "LB", "gâchette CD32 gauche"], [5, "RB", "gâchette CD32 droite"], [6, "LT", "rien"], [7, "RT", "rien"], [8, "Select / Back", "bouton CD32 vert"], [9, "Start", "Lecture CD32"]];
const KEY_NAMES = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", ControlLeft: "Ctrl gauche", ControlRight: "Ctrl droit",
  ShiftLeft: "Maj gauche", ShiftRight: "Maj droite", AltLeft: "Alt", AltRight: "Alt Gr", Space: "Espace", Enter: "Entrée", Escape: "Échap",
  Backspace: "Retour arrière", Tab: "Tab", MetaLeft: "Windows gauche", MetaRight: "Windows droite", Delete: "Suppr", Insert: "Inser",
  Home: "Origine", End: "Fin", PageUp: "Page préc.", PageDown: "Page suiv.", NumpadEnter: "Entrée (pavé)" };
function keyName(code, ctl) {
  if (ctl && ctl.labels && ctl.labels[code]) return ctl.labels[code];
  return KEY_NAMES[code] || code.replace(/^Key|^Digit/, "").replace(/^Numpad/, "Pavé ");
}
/* Joueur 2 au clavier : ZQSD sur un clavier AZERTY (WASD en QWERTY), tir sur Maj et Ctrl gauches */
const CTL_KEYS2_DEF = { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD", fire1: "ShiftLeft", fire2: "ControlLeft" };
const ctlDefault = () => ({ keys: Object.assign({}, CTL_KEYS_DEF), keys2: Object.assign({}, CTL_KEYS2_DEF), pad: {},
  labels: S.kbd === "azerty" ? { KeyW: "Z", KeyA: "Q" } : {}, players: "1", swap: false, p2kbd: false });
function ctlClean(c) {
  const d = ctlDefault(); if (!c) return d;
  c = JSON.parse(JSON.stringify(c));
  for (const k of ["keys", "keys2", "labels"]) c[k] = Object.assign(d[k], c[k] || {});
  return Object.assign(d, c);
}
/* Jeu en place : celui dont les commandes propres s'appliquent (jeu WHDLoad, CD, sinon disquette DF0: ou disque DH0:) */
async function ctlTargetRec() {
  for (const ref of [whdGame, cdGame, mounted.df0, mounted.dh0]) {
    if (!ref) continue;
    const r = await DB.get(ref.id); if (r) return r;
  }
  return null;
}
async function ctlEffective() { const r = await ctlTargetRec(); return ctlClean(r && r.ctl ? r.ctl : S.ctl); }
/* Joystick au clavier (JOY_KEYS, lu par la page) et manette (padMap, lu par le frontal) */
/* Joystick du joueur 2 au clavier (port souris) */
const JOY_KEYS2 = {};
let joyKeys2 = 0;
function joyKey2(e) {
  if (!running || !machine || !(e.code in JOY_KEYS2) || openWin) return;
  const bit = 1 << JOY_KEYS2[e.code];
  joyKeys2 = e.type === "keydown" ? joyKeys2 | bit : joyKeys2 & ~bit;
  machine.setJoy(1, joyKeys2);
}
window.addEventListener("keydown", joyKey2);
window.addEventListener("keyup", joyKey2);
/* Deux joueurs : WinUAE 6 branche un joystick sur le port souris (la souris est alors débranchée, comme sur l'Amiga) ;
   PUAE y envoie déjà la deuxième manette, avec la souris */
const RETRO_JOYPAD = 1, RETRO_MOUSE = 2;
function ctlPorts(c) {
  if (!machine || !running || E.core !== "winuae6" || E._cd) return;
  machine.M._retro_set_controller_port_device(0, c.players === "2" ? RETRO_JOYPAD : RETRO_MOUSE);
}
function ctlInstall(c) {
  for (const k of Object.keys(JOY_KEYS)) delete JOY_KEYS[k];
  for (const [act, code] of Object.entries(c.keys)) if (code) JOY_KEYS[code] = CTL_BIT[act];
  for (const k of Object.keys(JOY_KEYS2)) delete JOY_KEYS2[k];
  if (c.players === "2" && c.p2kbd) for (const [act, code] of Object.entries(c.keys2)) if (code) JOY_KEYS2[code] = CTL_BIT[act];
  joyKeys2 = 0;
  const pm = {};
  for (const [j, v] of Object.entries(c.pad)) {
    if (v === "none") pm[j] = -1;
    else if (v in CTL_BIT) pm[j] = CTL_BIT[v];
    else if (/^key:/.test(v)) pm[j] = v.slice(4);
  }
  if (machine) { machine.padMap = pm; machine.padSwap = !!c.swap; if (running) machine.setJoy(1, 0); }
  ctlPorts(c);
}
async function ctlApply() { try { ctlInstall(await ctlEffective()); } catch (e) { console.warn(e); } }
{ const _s = onStarted; onStarted = (...x) => { _s(...x); ctlApply(); }; }
ctlApply();

const ctlUi = { scope: "all", rec: null, c: null, capture: null, timer: 0 };
{ const box = document.createElement("div"); box.id = "abCtl"; box.className = "ab-ctl";
  box.innerHTML = `<h3>Commandes personnalisées</h3>
    <div class="opt"><label><input type="radio" name="ctlScope" value="all"> Pour tous les jeux</label>
      <label><input type="radio" name="ctlScope" value="game"> Pour ce jeu seulement<span class="ctl-game"></span></label></div>
    <h3>Joueurs</h3>
    <div class="opt"><label><input type="radio" name="ctlPlayers" value="1"> 1 joueur (la souris sur le port 1)</label>
      <label><input type="radio" name="ctlPlayers" value="2"> 2 joueurs (le joueur 2 sur le port 1, à la place de la souris)</label></div>
    <div class="opt"><label><input type="checkbox" class="ctl-swap"> Échanger les manettes (la première branchée joue en joueur 2)</label></div>
    <p class="hint ctl-pads"></p>
    <div class="opt ctl-p2"><label><input type="checkbox" class="ctl-p2kbd"> Joueur 2 au clavier :</label></div>
    <div class="ctl-grid ctl-keys2"></div>
    <p class="hint">Joueur 1 : première manette branchée, ou le clavier (réglage « Flèches + Ctrl droit ») ; il garde le port joystick (port 2). Joueur 2 : deuxième manette, ou le clavier. Avec WinUAE 6, la souris ne répond plus en mode 2 joueurs, comme sur un vrai Amiga quand le second joystick prend sa place ; avec PUAE, elle reste active sur le même port. Le réglage s'applique tout de suite, même pendant une partie.</p>
    <h3>Touches et boutons</h3>
    <p class="hint">Joystick au clavier (réglage « Flèches + Ctrl droit » ci-dessus) : touchez un bouton, puis la touche voulue.</p>
    <div class="ctl-grid ctl-keys"></div>
    <p class="hint">Manette USB ou Bluetooth : chaque bouton peut devenir un bouton du joystick, une direction ou une touche du clavier de l'Amiga (F1, Espace…). Le bouton pressé s'allume dans la liste.</p>
    <div class="ctl-grid ctl-pad"></div>
    <div class="opt"><button class="gad ctl-reset" type="button">Rétablir les commandes par défaut</button></div>`;
  const stash = document.createElement("div"); stash.hidden = true; stash.id = "abStash"; stash.appendChild(box); document.body.appendChild(stash);
  box.addEventListener("change", e => {
    if (e.target.name === "ctlScope") return ctlScope(e.target.value);
    if (e.target.name === "ctlPlayers") { ctlUi.c.players = e.target.value; return ctlSave(); }
    if (e.target.classList.contains("ctl-swap")) { ctlUi.c.swap = e.target.checked; return ctlSave(); }
    if (e.target.classList.contains("ctl-p2kbd")) { ctlUi.c.p2kbd = e.target.checked; return ctlSave(); }
    const j = e.target.dataset.pad; if (j === undefined) return;
    if (e.target.value === "key") return ctlCapture(k => { ctlUi.c.pad[j] = "key:" + k; }, e.target);
    if (e.target.value === "def") delete ctlUi.c.pad[j]; else ctlUi.c.pad[j] = e.target.value;
    ctlSave();
  });
  box.addEventListener("click", e => {
    const b = e.target.closest("[data-key]");
    if (b) return ctlCapture(k => { ctlUi.c.keys[b.dataset.key] = k; }, b);
    const b2 = e.target.closest("[data-key2]");
    if (b2) return ctlCapture(k => { ctlUi.c.keys2[b2.dataset.key2] = k; }, b2);
    if (e.target.closest(".ctl-reset")) { ctlUi.c = ctlDefault(); ctlSave(); }
  });
}
/* Prochaine touche : elle devient la commande (Échap annule) */
function ctlCapture(set, el) {
  if (ctlUi.capture) window.removeEventListener("keydown", ctlUi.capture, true);
  const was = el.tagName === "BUTTON" ? el.textContent : null;
  if (was !== null) el.textContent = "Appuyez sur une touche… (Échap : annuler)";
  else toast("Appuyez sur la touche du clavier que ce bouton enverra (Échap : annuler).");
  ctlUi.capture = e => {
    e.preventDefault(); e.stopImmediatePropagation();
    window.removeEventListener("keydown", ctlUi.capture, true); ctlUi.capture = null;
    if (e.code !== "Escape") {
      set(e.code);
      if (e.key && e.key.length === 1 && e.key !== " ") ctlUi.c.labels[e.code] = e.key.toUpperCase(); /* lettre de la disposition du clavier (AZERTY…) */
      ctlSave();
    } else ctlRender();
  };
  window.addEventListener("keydown", ctlUi.capture, true);
}
async function ctlSave() {
  if (ctlUi.scope === "game" && ctlUi.rec) { ctlUi.rec.ctl = ctlUi.c; await DB.put(ctlUi.rec); }
  else { S.ctl = ctlUi.c; saveSettings(); }
  ctlRender(); ctlApply();
}
async function ctlScope(v) {
  if (v === "game" && ctlUi.rec) { ctlUi.rec.ctl = ctlClean(ctlUi.rec.ctl || S.ctl); await DB.put(ctlUi.rec); ctlUi.scope = "game"; ctlUi.c = ctlUi.rec.ctl; }
  else {
    if (ctlUi.rec && ctlUi.rec.ctl) { delete ctlUi.rec.ctl; await DB.put(ctlUi.rec); toast(ctlUi.rec.name + " reprend les commandes communes à tous les jeux."); }
    ctlUi.scope = "all"; ctlUi.c = ctlClean(S.ctl);
  }
  ctlRender(); ctlApply();
}
async function renderCtl() {
  ctlUi.rec = await ctlTargetRec();
  ctlUi.scope = ctlUi.rec && ctlUi.rec.ctl ? "game" : "all";
  ctlUi.c = ctlClean(ctlUi.scope === "game" ? ctlUi.rec.ctl : S.ctl);
  ctlRender();
  clearInterval(ctlUi.timer); ctlUi.timer = setInterval(ctlLive, 100);
}
function ctlRender() {
  const box = $("#abCtl"), c = ctlUi.c;
  const game = box.querySelector('input[name="ctlScope"][value="game"]');
  game.disabled = !ctlUi.rec;
  box.querySelector(".ctl-game").textContent = ctlUi.rec ? " : " + ctlUi.rec.name : " (aucun jeu en place)";
  box.querySelectorAll('input[name="ctlScope"]').forEach(i => i.checked = i.value === ctlUi.scope);
  box.querySelector(".ctl-keys").innerHTML = CTL_ACTS.map(([a, t]) => `<span>${t}</span><button class="gad" type="button" data-key="${a}"></button>`).join("");
  for (const [a] of CTL_ACTS) box.querySelector(`[data-key="${a}"]`).textContent = c.keys[a] ? keyName(c.keys[a], c) : "—";
  box.querySelectorAll('input[name="ctlPlayers"]').forEach(i => i.checked = i.value === c.players);
  box.querySelector(".ctl-swap").checked = !!c.swap;
  box.querySelector(".ctl-p2kbd").checked = !!c.p2kbd;
  const two = c.players === "2";
  box.querySelector(".ctl-p2").hidden = !two;
  const k2 = box.querySelector(".ctl-keys2"); k2.hidden = !two || !c.p2kbd;
  k2.innerHTML = CTL_ACTS.map(([a, t]) => `<span>${t}</span><button class="gad" type="button" data-key2="${a}"></button>`).join("");
  for (const [a] of CTL_ACTS) k2.querySelector(`[data-key2="${a}"]`).textContent = c.keys2[a] ? keyName(c.keys2[a], c) : "—";
  const opts = [["up", "Haut"], ["down", "Bas"], ["left", "Gauche"], ["right", "Droite"], ["fire1", "Tir 1"], ["fire2", "Tir 2"], ["none", "Aucun effet"]];
  box.querySelector(".ctl-pad").innerHTML = CTL_PAD.map(([j, name, def]) => {
    const v = c.pad[j], key = v && /^key:/.test(v) ? v.slice(4) : null;
    return `<span data-padrow="${j}">${name}</span><select data-pad="${j}"><option value="def">Par défaut (${def})</option>`
      + opts.map(([o, t]) => `<option value="${o}"${v === o ? " selected" : ""}>${t}</option>`).join("")
      + (key ? `<option value="key:${key}" selected>Touche ${keyName(key, c)}</option>` : "")
      + `<option value="key">Touche du clavier…</option></select>`;
  }).join("");
}
/* Bouton de manette pressé : sa ligne s'allume (tant que le panneau est affiché) */
function ctlLive() {
  const box = $("#abCtl");
  if (!box.isConnected || box.closest("[hidden]") || !box.offsetParent) { clearInterval(ctlUi.timer); return; }
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(g => g && g.connected) : [];
  /* Manettes vues par le navigateur (une manette n'apparaît qu'après un premier appui sur un de ses boutons) */
  const sw = ctlUi.c && ctlUi.c.swap, who = [pads[sw ? 1 : 0], pads[sw ? 0 : 1]];
  const nm = g => g ? g.id.replace(/\s*\(.*$/, "").slice(0, 40) || "manette" : "—";
  const t = pads.length ? "Manettes : joueur 1 → " + nm(who[0]) + " ; joueur 2 → " + nm(who[1]) + "."
    : "Aucune manette détectée : branchez-la, puis appuyez sur un de ses boutons.";
  const el = box.querySelector(".ctl-pads"); if (el.textContent !== t) el.textContent = t;
  for (const el of box.querySelectorAll("[data-padrow]")) {
    const j = +el.dataset.padrow;
    el.classList.toggle("on", pads.some(g => g.buttons[j] && g.buttons[j].pressed));
  }
}

/* ---- Configurations nommées ---- */
const CFG_KEYS = ["model", "core", "fast", "cpu", "compat", "region", "accel", "rtg", "z3", "floppy", "floppySound", "res", "center", "autoskip",
  "crt", "sharp", "joy", "midi", ...CHIP_KEYS, "ctl", "romId", "romId500"];
let CFGS = [];
try { CFGS = JSON.parse(localStorage.getItem("a1200.configs") || "[]"); } catch (e) {}
const cfgStore = () => { try { localStorage.setItem("a1200.configs", JSON.stringify(CFGS)); } catch (e) { toast("Configuration non enregistrée : stockage du navigateur plein.", true); } };
function cfgSnapshot() { const s = {}; for (const k of CFG_KEYS) if (S[k] !== undefined) s[k] = JSON.parse(JSON.stringify(S[k])); return s; }
/* Disques de la configuration : disquettes et disques durs importés (par leur enregistrement de la Bibliothèque),
   et disposition des disques sur place (noms et tailles : leurs fichiers sont à rebrancher après chargement) */
function cfgDisks() {
  const d = { slots: {} };
  for (const t of [...FD_TAGS, ...HD_TAGS]) if (mounted[t] && !String(mounted[t].id).startsWith("lazy:")) d.slots[t] = { id: mounted[t].id, name: mounted[t].name };
  const p = lazyPlan(); if (Object.keys(p.slots).length || p.extra.length) d.lazy = p;
  return d;
}
async function cfgApplyDisks(d) {
  const all = await DB.all(), notes = [];
  const lazy = d.lazy || { slots: {}, extra: [] };
  for (const t of [...FD_TAGS, ...HD_TAGS]) {
    const x = d.slots[t];
    if (x) {
      const r = all.find(r => r.id === x.id) || all.find(r => r.name === x.name && (isHd(t) ? r.kind === "hdf" : r.kind === "adf"));
      if (r) setMounted(t, r); else { notes.push(x.name + " absent de la Bibliothèque"); setMounted(t, null); }
    } else if (lazy.slots[t]) {
      /* Même fichier déjà branché sur place : il reste */
      if (!(lazyFiles[t] && lazyFiles[t].name === lazy.slots[t].n && lazyFiles[t].size === lazy.slots[t].s)) setMounted(t, null);
    } else setMounted(t, null);
  }
  const keep = lazy.extra.map(x => lazyExtra.find(f => f.name === x.n && f.size === x.s)).filter(Boolean);
  lazyExtra.splice(0, lazyExtra.length, ...keep);
  lazyPlanSave({ slots: lazy.slots, extra: lazy.extra }); renderLazyExtra();
  const pend = lazyPending().length;
  if (pend) notes.push(pend + " disque(s) sur place à rebrancher (Disques durs/CD → « Rebrancher les disques sur place »)");
  return notes;
}
function cfgRefreshAll() {
  try {
    syncSettingsForm();
    if (typeof renderRomChoices === "function") renderRomChoices();
    if (typeof renderRom500 === "function") renderRom500();
    if (typeof renderModelRom === "function") renderModelRom();
    if (typeof renderMidiChoices === "function") renderMidiChoices();
    if (typeof themeNow === "function") themeNow();
    applyLook(); renderLauncherSoon(); ctlApply();
  } catch (e) { console.warn(e); }
}
async function cfgLoad(c) {
  const all = await DB.all();
  for (const k of CFG_KEYS) {
    if (!(k in c.s)) continue;
    if ((k === "romId" || k === "romId500") && c.s[k] !== "aros" && c.s[k] !== "auto" && !all.some(r => r.id === c.s[k])) continue; /* Kickstart retiré de la Bibliothèque */
    S[k] = JSON.parse(JSON.stringify(c.s[k]));
  }
  saveSettings(); cfgRefreshAll();
  let notes = [];
  if (c.d && $("#cfgWithDisks") && $("#cfgWithDisks").checked) {
    if (running || starting) notes.push("disques non changés : l'Amiga est allumé");
    else notes = await cfgApplyDisks(c.d);
  }
  toast("Configuration « " + c.name + " » chargée" + (running ? " : elle s'appliquera au prochain allumage (Recharger)" : "") + (notes.length ? " — " + notes.join(" ; ") : "") + ".", notes.length > 0);
}
/* Texte .uae (WinUAE, Amiberry) : les réglages de la page en lignes de configuration, et la configuration exacte en commentaire */
function cfgUae(name, desc, s, d) {
  const e = Object.assign({}, DEFAULTS, CHIP_DEFAULTS, s);
  const qs = { a500: "A500", a600: "A600", a1200: "A1200", a3000: "A3000", a4000: "A4000", cd32: "CD32", cdtv: "CDTV" }[e.model] || "A1200";
  const l = ["; Configuration exportée par l'émulateur Amiga du navigateur (WinUAE 6 / Amiberry)", "config_description=" + (desc || name)];
  l.push(...amberryLines(qs, null, e).filter(x => !/^(kickstart_|amiberry\.midi|floppy\dsound)/.test(x)), ...chipLines(e));
  /* Disques par leur nom de fichier : WinUAE les cherche à côté du .uae, l'import les retrouve dans la Bibliothèque */
  if (d) {
    for (const [t, x] of Object.entries(d.slots)) if (/^df/.test(t)) l.push(t.replace("df", "floppy") + "=" + x.name);
    const hds = [];
    HD_TAGS.forEach((t, i) => { const n = d.slots[t] ? d.slots[t].name : d.lazy && d.lazy.slots[t] ? d.lazy.slots[t].n : null; if (n) hds.push([t, n, i]); });
    if (d.lazy) d.lazy.extra.forEach((x, i) => hds.push(["dh" + (4 + i), x.n, 4 + i]));
    for (const [t, n, i] of hds) l.push(`hardfile2=rw,${t.toUpperCase()}:${n},0,0,0,512,0,,${i < 2 ? "ide" + i : "uae" + (i - 2)}`);
  }
  l.push("; amiga1200web=" + JSON.stringify(s));
  if (d) l.push("; amiga1200web-disks=" + JSON.stringify(d));
  return l.join("\r\n") + "\r\n";
}
/* Lecture d'un .uae : réglages reconnus, disques et Kickstart retrouvés dans la Bibliothèque par leur nom de fichier */
async function cfgParseUae(text, fname) {
  const kv = {}, hard = [];
  let exact = null, exactDisks = null;
  for (const raw of text.split(/\r?\n/)) {
    const m = /^;\s*amiga1200web=(\{.*\})\s*$/.exec(raw);
    if (m) { try { exact = JSON.parse(m[1]); } catch (e) {} continue; }
    const md = /^;\s*amiga1200web-disks=(\{.*\})\s*$/.exec(raw);
    if (md) { try { exactDisks = JSON.parse(md[1]); } catch (e) {} continue; }
    const line = raw.trim(); if (!line || line[0] === ";" || line[0] === "#") continue;
    const i = line.indexOf("="); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === "hardfile2" || k === "hardfile") hard.push(v); else kv[k] = v;
  }
  const s = {}, notes = [];
  if (exact) Object.assign(s, exact);
  else {
    const cpu = parseInt((kv.cpu_model || "").replace(/^680?/, ""), 10) || 0; /* 68020 → 20 */
    const cs = (kv.chipset || "").toLowerCase();
    const qs = (kv.quickstart || "").split(",")[0].toLowerCase();
    const QS = { a500: "a500", "a500+": "a500", a1000: "a500", a2000: "a500", a600: "a600", a1200: "a1200", a3000: "a3000", a4000: "a4000", a4000t: "a4000", cd32: "cd32", cdtv: "cdtv" };
    s.model = QS[qs] || (cs === "aga" ? (cpu >= 30 ? "a4000" : "a1200") : /^ecs/.test(cs) ? (cpu >= 30 ? "a3000" : "a600") : cs ? "a500" : "a1200");
    const NATIVE = { a500: ["ocs", "ecs_agnus"], a600: ["ecs"], a1200: ["aga"], a3000: ["ecs"], a4000: ["aga"], cd32: ["aga"], cdtv: ["ecs_agnus"] };
    s.chipset = cs && ["ocs", "ecs_agnus", "ecs", "aga"].includes(cs) && !NATIVE[s.model].includes(cs) ? cs : "auto";
    if (HAS_ACCEL.has(s.model)) s.accel = cpu >= 60 ? "060" : cpu >= 40 ? "040" : cpu >= 30 && s.model === "a1200" ? "030" : "none";
    const fastMb = (parseInt(kv.fastmem_size, 10) || 0) + (parseInt(kv.mbresmem_size, 10) || 0);
    const z3 = parseInt(kv.z3mem_size, 10) || 0;
    if (HAS_ACCEL.has(s.model)) s.z3 = String(z3 ? [16, 32, 64, 128, 256].find(v => v >= z3) || 256 : 0);
    const vals = $$('#winSettings input[name="fast"]').map(i => +i.value).sort((a, b) => a - b);
    s.fast = String(fastMb ? (vals.filter(v => v && v <= fastMb).pop() || vals.find(v => v) || 0) : 0);
    const chip = parseInt(kv.chipmem_size, 10);
    if (!isNaN(chip)) s.chipmem = chip <= 1 ? "1" : chip <= 2 ? "2" : "4";
    const slow = parseInt(kv.bogomem_size, 10);
    if (!isNaN(slow)) s.slowmem = slow <= 0 ? "0" : slow <= 2 ? "2" : slow <= 4 ? "4" : "6";
    s.blitter = /^(true|yes)$/i.test(kv.immediate_blits || "") ? "immediate" : kv.waiting_blits && kv.waiting_blits !== "disabled" ? "wait" : "auto";
    if (["none", "sprites", "playfields", "full"].includes(kv.collision_level)) s.collision = kv.collision_level;
    s.region = /^(true|yes)$/i.test(kv.ntsc || "") ? "ntsc" : "pal";
    s.cpu = kv.cpu_speed === "max" ? "max" : "orig";
    s.compat = /^(true|yes)$/i.test(kv.cycle_exact || kv.cpu_cycle_exact || "") ? "max" : "normal";
    s.floppy = kv.floppy_speed === "0" || kv.floppy_speed === "800" ? "turbo" : "orig";
    if (kv.gfx_resolution) s.res = kv.gfx_resolution === "lores" ? "lores" : kv.gfx_resolution === "superhires" ? "shires" : "hires";
    if ((parseInt(kv.gfxcard_size, 10) || 0) > 0) { s.rtg = "16"; s.core = "winuae6"; }
    if (WINUAE_ONLY.has(s.model) || s.chipset !== "auto") s.core = "winuae6";
  }
  /* Disques et Kickstart : retrouvés par leur nom dans la Bibliothèque */
  const all = await DB.all(), base = p => (p || "").split(/[\\/]/).pop().toLowerCase();
  const find = (p, kinds) => { const b = base(p); return b ? all.find(r => kinds.includes(r.kind) && r.name.toLowerCase() === b) : null; };
  const mounts = [];
  if (!exactDisks) for (const n of [0, 1, 2, 3]) {
    const p = kv["floppy" + n]; if (!p) continue;
    const r = find(p, ["adf"]);
    if (r) mounts.push(["df" + n, r]); else notes.push("disquette DF" + n + ": " + base(p) + " absente de la Bibliothèque");
  }
  if (!exactDisks) hard.forEach((h, i) => {
    const f = h.split(","), p = (f[1] || "").replace(/^[^:]*:/, ""), tag = HD_TAGS[i]; if (!tag) return;
    const r = find(p, ["hdf"]);
    if (r) mounts.push([tag, r]); else notes.push("disque dur " + base(p) + " absent de la Bibliothèque");
  });
  if (kv.kickstart_rom_file && !exact) {
    const r = find(kv.kickstart_rom_file, ["rom"]);
    if (r && s.model === "a1200") s.romId = r.id;
    else if (!r) notes.push("Kickstart " + base(kv.kickstart_rom_file) + " absent de la Bibliothèque (le meilleur disponible sera pris)");
  }
  const name = (kv.config_description || fname.replace(/\.uae$/i, "")).slice(0, 60);
  return { name, desc: kv.config_description || "", s, mounts, notes, d: exactDisks };
}
{ const box = document.createElement("div"); box.id = "abConfigs"; box.className = "ab-cfg";
  box.innerHTML = `<div class="cfg-wrap">
      <select class="cfg-list" size="9" aria-label="Configurations enregistrées"></select>
      <div class="cfg-form">
        <label>Nom<input class="cfg-name" maxlength="60" placeholder="ex. A1200 jeux"></label>
        <label>Description<input class="cfg-desc" maxlength="120" placeholder="facultatif"></label>
        <div class="cfg-btns"><button class="gad" data-cfg="load" type="button">Charger</button>
          <button class="gad" data-cfg="save" type="button">Enregistrer</button>
          <button class="gad" data-cfg="del" type="button">Supprimer</button></div>
        <label class="cfg-check"><input type="checkbox" id="cfgWithDisks" checked> Charger aussi ses disques</label>
        <div class="cfg-btns"><button class="gad" data-cfg="import" type="button">Importer…</button>
          <button class="gad" data-cfg="export" type="button">Exporter en .uae</button>
          <button class="gad" data-cfg="exportall" type="button">Exporter tout…</button></div>
        <input type="file" class="cfg-file" accept=".uae,.cfg,.json,text/plain,application/json" hidden>
      </div></div>
    <p class="hint">Enregistrer garde tous les réglages affichés (modèle, cœur, processeur, mémoire, chipset, affichage, commandes, Kickstart) et les disques branchés sous le nom choisi ; Charger les remet d'un coup (les disques lus sur place sont alors à rebrancher en un seul choix de fichiers). « Exporter tout » enregistre toutes les configurations dans un fichier .json, à réimporter ici ou sur un autre appareil avec « Importer ». Un double-clic sur la liste charge aussi. L'export .uae s'ouvre dans WinUAE ou Amiberry, et l'import lit leurs fichiers : réglages reconnus, disquettes, disques durs et Kickstart retrouvés dans la Bibliothèque par leur nom.</p>`;
  $("#abStash").appendChild(box);
  const list = box.querySelector(".cfg-list"), nameI = box.querySelector(".cfg-name"), descI = box.querySelector(".cfg-desc"), file = box.querySelector(".cfg-file");
  const sel = () => CFGS[list.selectedIndex] || null;
  list.onchange = () => { const c = sel(); if (c) { nameI.value = c.name; descI.value = c.desc || ""; } };
  list.ondblclick = () => { const c = sel(); if (c) cfgLoad(c); };
  box.querySelector(".cfg-form").addEventListener("click", async e => {
    const a = e.target.closest("[data-cfg]"); if (!a) return;
    const act = a.dataset.cfg, c = sel();
    if (act === "load") { if (c) cfgLoad(c); else toast("Choisissez une configuration dans la liste.", true); }
    else if (act === "save") {
      const name = nameI.value.trim(); if (!name) { toast("Donnez un nom à la configuration.", true); nameI.focus(); return; }
      const old = CFGS.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
      const rec = { name, desc: descI.value.trim(), s: cfgSnapshot(), d: cfgDisks(), t: Date.now() };
      if (old >= 0) CFGS[old] = rec; else CFGS.push(rec);
      CFGS.sort((x, y) => x.name.localeCompare(y.name, "fr")); cfgStore(); renderCfgs(name);
      toast("Configuration « " + name + " » " + (old >= 0 ? "mise à jour." : "enregistrée."));
    } else if (act === "del") {
      if (!c) return toast("Choisissez une configuration dans la liste.", true);
      if (!confirm("Supprimer la configuration « " + c.name + " » ?")) return;
      CFGS.splice(list.selectedIndex, 1); cfgStore(); renderCfgs(); nameI.value = descI.value = "";
    } else if (act === "export") {
      const name = nameI.value.trim() || (c && c.name) || "amiga";
      const same = c && c.name === name;
      download(new TextEncoder().encode(cfgUae(name, descI.value.trim(), same ? c.s : cfgSnapshot(), same ? c.d : cfgDisks())), safeName(name) + ".uae");
    } else if (act === "exportall") {
      if (!CFGS.length) return toast("Aucune configuration enregistrée à exporter.", true);
      download(new TextEncoder().encode(JSON.stringify({ format: "amiga1200-configs", v: 1, configs: CFGS }, null, 1)), "configurations-amiga.json");
      toast(CFGS.length + " configuration(s) exportée(s) dans configurations-amiga.json.");
    } else if (act === "import") file.click();
  });
  file.onchange = async () => {
    const f = file.files[0]; file.value = ""; if (!f) return;
    try {
      const text = await f.text();
      if (/\.json$/i.test(f.name) || /^\s*\{/.test(text)) await cfgImportAll(text); else await cfgImport(text, f.name);
    } catch (x) { console.error(x); toast("Lecture du fichier impossible : " + x.message, true); }
  };
}
/* Fichier de toutes les configurations (Exporter tout) : ajoutées à la liste, celles du même nom remplacées */
async function cfgImportAll(text) {
  const j = JSON.parse(text);
  if (!j || j.format !== "amiga1200-configs" || !Array.isArray(j.configs)) throw new Error("ce n'est pas un fichier de configurations de cet émulateur");
  let n = 0;
  for (const c of j.configs) {
    if (!c || typeof c.name !== "string" || !c.s || typeof c.s !== "object") continue;
    const old = CFGS.findIndex(x => x.name.toLowerCase() === c.name.toLowerCase());
    if (old >= 0) CFGS[old] = c; else CFGS.push(c);
    n++;
  }
  CFGS.sort((x, y) => x.name.localeCompare(y.name, "fr")); cfgStore(); renderCfgs();
  toast(n + " configuration(s) importée(s). Choisissez-en une dans la liste puis Charger.");
}
async function cfgImport(text, fname) {
  const p = await cfgParseUae(text, fname);
  const c = { name: p.name, desc: p.desc, s: Object.assign(cfgSnapshot(), p.s), t: Date.now(), ...(p.d ? { d: p.d } : {}) };
  const old = CFGS.findIndex(x => x.name.toLowerCase() === c.name.toLowerCase());
  if (old >= 0) CFGS[old] = c; else CFGS.push(c);
  CFGS.sort((x, y) => x.name.localeCompare(y.name, "fr")); cfgStore();
  await cfgLoad(c);
  if (p.d) { renderCfgs(c.name); return; } /* fichier exporté ici : cfgLoad a remis ses disques */
  if (p.mounts.length && !running && !starting) {
    /* Les lecteurs du fichier remplacent ceux en place (disquettes d'un côté, disques durs de l'autre) */
    const fl = p.mounts.some(m => /^df/.test(m[0])), hd = p.mounts.some(m => isHd(m[0]));
    for (const t of [...FD_TAGS, ...HD_TAGS]) if (mounted[t] && (isHd(t) ? hd : fl)) setMounted(t, null);
    for (const [t, r] of p.mounts) setMounted(t, r);
  } else if (p.mounts.length) p.notes.push("disques non insérés : l'Amiga est allumé");
  renderCfgs(c.name);
  const m = MODELS[c.s.model] ? MODELS[c.s.model].name : c.s.model === "cd32" ? "Amiga CD32" : "Amiga";
  toast("« " + c.name + " » importée : " + m + (p.mounts.length && !running ? ", " + p.mounts.map(x => x[0].toUpperCase() + ": " + x[1].name).join(", ") : "")
    + (p.notes.length ? " — " + p.notes.join(" ; ") : "") + ".", p.notes.length > 0);
}
function renderCfgs(selName) {
  const box = $("#abConfigs"), list = box.querySelector(".cfg-list");
  list.innerHTML = "";
  for (const c of CFGS) {
    const o = document.createElement("option");
    o.textContent = c.name + (c.desc ? " — " + c.desc : ""); list.appendChild(o);
    if (selName && c.name === selName) o.selected = true;
  }
  if (!CFGS.length) { const o = document.createElement("option"); o.disabled = true; o.textContent = "(aucune configuration enregistrée)"; list.appendChild(o); }
  list.onchange();
}
renderCfgs();
