#!/usr/bin/env python3
"""Fabrique la page « Amiga 1200 · cœur PUAE » à partir de l'interface actuelle (src/template.html).

L'interface (écran, boîtier, lecteurs, Bibliothèque, profils, clavier, souris tactile) reste celle de
la version SAE : seules les parties qui parlent au cœur d'émulation sont remplacées. Chaque remplacement
vérifie que le passage d'origine existe une seule fois, pour qu'une évolution de l'interface ne passe
pas inaperçue.

Usage : python3 wasm/app/make-page.py <sortie.html>
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
APP = ROOT / "wasm" / "app"
page = (ROOT / "src" / "template.html").read_text(encoding="utf-8")


def between(start, end, new, keep_end=True):
    """Remplace le texte depuis `start` jusqu'à `end` (exclu si keep_end)."""
    global page
    i = page.find(start)
    assert i >= 0 and page.count(start) == 1, f"repère introuvable ou multiple : {start[:50]!r}"
    j = page.find(end, i + len(start))
    assert j >= 0, f"fin introuvable : {end[:50]!r}"
    if not keep_end:
        j += len(end)
    page = page[:i] + new + page[j:]


def rep(old, new):
    global page
    assert page.count(old) == 1, f"passage introuvable ou multiple : {old[:60]!r}"
    page = page.replace(old, new)


# 1. Chargement : isolation (fils d'exécution), module PUAE, script en module ES
rep('<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<script src="coi.js"></script>\n<link rel="preconnect" href="https://fonts.googleapis.com">')
# Les polices Google sont refusées sous isolation stricte (COEP) : on garde la pile de secours.
page = re.sub(r'<link rel="preconnect"[^>]*>\n|<link href="https://fonts\.googleapis\.com[^>]*>\n', "", page)
rep('<title>Amiga 1200</title>', '<title>Amiga 1200 · PUAE</title>')
between('<script>\n/*__SAE_CORE__*/\n</script>\n<script>\n"use strict";',
        'const AROS_EXT_GZ = "__AROS_EXT__";\n',
        '<script src="puae.js"></script>\n<script type="module">\n'
        'import { PuaeMachine } from "./puae-frontend.js";\nimport { makeBlankAdf } from "./adf.js";\nimport { makeHardDisk } from "./hdf.js";\n',
        keep_end=False)

# 2. Moteur : configuration, allumage, extinction, statistiques, LED
between("/* =========================================================\n   Émulateur",
        "/* =========================================================\n   Médias : insertion",
        (APP / "engine-puae.js").read_text(encoding="utf-8"))

# 3. Médias : insertion à chaud, écritures, disquette et disque dur vierges
between("async function mountMedia(tag, rec) {",
        "/* =========================================================\n   Import de fichiers",
        (APP / "media-puae.js").read_text(encoding="utf-8"))

# 4. Identification des Kickstart : par empreinte, sans le cœur
between("function describeRom(name, u8) {", "function pickFile(accept, cb) {", '''function describeRom(name, u8) {
  if (u8.length >= 11 && u8ToStr(u8.subarray(0, 11)) === "AMIROMTYPE1")
    return { label: name + " (Amiga Forever, rom.key nécessaire)", warn: !S.keyId };
  const known = KNOWN_ROMS[crc32u8(u8)];
  if (known) return { label: known, warn: false };
  const v = kickVersion(u8);
  if (v) return { label: "Kickstart " + (KICK_NAMES[v[0]] || "") + " (" + v[0] + "." + String(v[1]).padStart(3, "0") + ")", warn: false };
  if (u8.length !== 262144 && u8.length !== 524288) return { label: name + " (taille inhabituelle)", warn: true };
  return { label: name + " (version non répertoriée)", warn: false };
}
async function loadKeyForExamine() {}

''')

# 5. Clavier virtuel et touches réelles
rep('''function sendKey(code, down) {
  if (!running) return;
  sae.keyPress({ code, keyCode: 0, repeat: false, defaultPrevented: false, location: 0, preventDefault() {} }, down);
}''', '''function sendKey(code, down) {
  if (!running || !machine) return;
  machine.key(code, down);
}
/* Joystick au clavier : flèches + Ctrl droit (tir), Maj droite (2e bouton) */
const JOY_KEYS = { ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7, ControlRight: 0, ShiftRight: 8 };
let joyKeys = 0;
function joyKey(e) {
  if (!running || E.joy !== "keys" || !(e.code in JOY_KEYS) || openWin) return;
  const bit = 1 << JOY_KEYS[e.code];
  joyKeys = e.type === "keydown" ? joyKeys | bit : joyKeys & ~bit;
  machine.setJoy(0, joyKeys);
}
window.addEventListener("keydown", joyKey);
window.addEventListener("keyup", joyKey);''')

# 6. Souris tactile
rep("const btn = (b, d) => { if (running && SAER && SAER.input) SAER.input.registerEvent(0, SAEC_Input_Event_Press, b, d); };",
    "const btn = (b, d) => { if (running && machine) machine.mouseButton(b, d); };")
rep("if ((x || y) && running) SAER.input.registerEvent(0, SAEC_Input_Event_MouseMove, x, y);",
    "if ((x || y) && running && machine) machine.mouseMove(x, y);")
# Boutons au format des événements souris du navigateur : 0 gauche, 2 droit
page = page.replace("SAEC_Input_Button_1", "0").replace("SAEC_Input_Button_2", "2")

# 7. Boutons
rep('$("#btnReset").onclick = () => { if (running) { releaseMods(); sae.reset(false, true); } };',
    '$("#btnReset").onclick = () => { if (running) { releaseMods(); machine.reset(); } };')
rep('$("#kCAA").onclick = () => { if (running) { releaseMods(); sae.reset(false, true); } };',
    '/* Ctrl + Amiga + Amiga : la réinitialisation au clavier de la vraie machine */\n'
    '$("#kCAA").onclick = () => { if (running) { releaseMods(); tap(["ControlLeft", "MetaLeft", "MetaRight"]); } };')
rep('$("#btnPause").onclick = () => { if (running) sae.pause(!paused); };',
    '$("#btnPause").onclick = () => { if (running) { machine.pause(!paused); setPaused(!paused); if (paused) { $("#statFps").textContent = "en pause"; $("#statCpu").textContent = ""; } } };')
rep('<title>Amiga 1200 · PUAE</title>', '<title>Amiga 1200 · PUAE</title>\n<link rel="icon" href="data:,">')
rep("  if (running) sae.mute(S.muted);", "  if (running) machine.setMuted(S.muted);")

# Les fenêtres ouvertes bloquent le clavier de l'Amiga
rep("function closeWin() { if (openWin) { openWin.classList.remove(\"open\"); openWin = null; } }",
    "function closeWin() { if (openWin) { openWin.classList.remove(\"open\"); openWin = null; } if (machine) machine.inputBlocked = false; }")
rep('  const w = $("#" + id); w.classList.add("open"); openWin = w;',
    '  const w = $("#" + id); w.classList.add("open"); openWin = w; if (machine) machine.inputBlocked = true;')

# 8. Démarrage de la page
rep('''  sae = new ScriptedAmigaEmulator();
  inf = sae.getInfo(); cfg = sae.getConfig();
''', "")
rep('''  if (!inf.video.webGL && !inf.video.canvas) toast("Ce navigateur ne peut pas afficher l'émulateur.", true);''',
    '''  if (sessionStorage.getItem("a1200.autostart")) { sessionStorage.removeItem("a1200.autostart"); powerOn(); }''')

# 9. Textes
rep("Cœur d'émulation : <a href=\"https://github.com/naTmeg/ScriptedAmigaEmulator\" rel=\"noopener\">SAE</a> (Scripted Amiga Emulator, R. Hausberger, licence GPL v2) dérivé de WinUAE.\n    Kickstart de secours : AROS (AROS Public License).",
    "Cœur d'émulation : <a href=\"https://github.com/libretro/libretro-uae\" rel=\"noopener\">PUAE</a> (libretro-uae, licence GPL v2), le moteur de WinUAE compilé en WebAssembly.\n    Kickstart de secours : AROS, version d'août 2026 (AROS Public License).")
rep('<label><input type="radio" name="cpu" value="max"> Aussi vite que possible</label>',
    '<label><input type="radio" name="cpu" value="max"> Accéléré (×5)</label>')
rep('<label><input type="radio" name="compat" value="max"> Maximale</label>',
    '<label><input type="radio" name="compat" value="max"> Cycle exact</label>')
rep("Maximale : prélecture et caches du 68020, blitter au cycle près. Plus fidèle pour les démos et jeux capricieux, mais plus gourmand.",
    "Cycle exact : processeur et puces émulés au cycle près, comme WinUAE. Le plus fidèle pour les démos et jeux capricieux, mais plus gourmand.")

# Sauvegardes d'état : bouton, fenêtre, styles, module
rep('''      Capture</button>
    <span class="sep"></span>''', '''      Capture</button>
    <button class="gad" id="btnStates" title="Sauvegarder ou reprendre une partie (Ctrl+Maj+S / Ctrl+Maj+R)">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 1.5v8M4.8 6.5 8 9.7l3.2-3.2"/><path d="M2 11v3.5h12V11"/></svg>
      Sauvegardes</button>
    <span class="sep"></span>''')
rep("<!-- Fenêtre : Aide -->", '''<!-- Fenêtre : Sauvegardes d'état -->
<div class="veil" id="winStates" role="dialog" aria-modal="true" aria-labelledby="tStates">
  <div class="win wb">
    <div class="titlebar"><button class="closebox" data-close aria-label="Fermer"></button><span class="t" id="tStates">Sauvegardes</span><span class="stripes"></span></div>
    <div class="body" id="statesBody"></div>
    <div class="actions"><span class="hint">Ctrl+Maj+S sauvegarde dans l'emplacement 1, Ctrl+Maj+R le reprend</span><button class="gad primary" data-close>Fermer</button></div>
  </div>
</div>

<!-- Fenêtre : Aide -->''')
rep(".footnote{margin-top:18px", '''.slots{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0 12px}
.slot-card{background:#bbb;border:1px solid;border-color:#fff #000 #000 #fff;padding:8px;display:flex;flex-direction:column;gap:6px;min-width:0}
.slot-img{width:100%;aspect-ratio:4/3;object-fit:cover;background:#222;color:#999;display:flex;align-items:center;justify-content:center;font-size:13px;
  border:1px solid;border-color:#000 #fff #fff #000}
.slot-meta{display:flex;flex-direction:column;gap:1px;font-size:13px}
.slot-meta span{color:#222;font-variant-numeric:tabular-nums}
.slot-acts{display:flex;flex-wrap:wrap;gap:5px}
@media (max-width:640px){.slots{grid-template-columns:repeat(2,1fr)}}
.is-touch #winStates .actions .hint{display:none}
.footnote{margin-top:18px''')
rep("/* Profil par disque */", (APP / "states-puae.js").read_text(encoding="utf-8") + "\n/* Profil par disque */")
rep('''  if (sessionStorage.getItem("a1200.autostart")) { sessionStorage.removeItem("a1200.autostart"); powerOn(); }''',
    '''  const resumeId = sessionStorage.getItem("a1200.resume");
  if (resumeId) { sessionStorage.removeItem("a1200.resume"); pendingResume = await DB.get(resumeId) || null; }
  if (sessionStorage.getItem("a1200.autostart")) { sessionStorage.removeItem("a1200.autostart"); powerOn(); }''')
rep('''      <h3>Compatibilité et vitesse</h3>''', '''      <h3>Sauvegardes d'état</h3>
      <p>Le bouton <b>Sauvegardes</b> fige la machine entière dans l'un des 4 emplacements du jeu en cours (la disquette de DF0:, ou le disque dur). <b>Reprendre</b> la remet exactement dans cet état, avec les mêmes disques et réglages ; si besoin l'Amiga se rallume tout seul. Raccourcis : <span class="kbd">Ctrl</span>+<span class="kbd">Maj</span>+<span class="kbd">S</span> sauvegarde dans l'emplacement 1, <span class="kbd">Ctrl</span>+<span class="kbd">Maj</span>+<span class="kbd">R</span> le reprend.</p>
      <h3>Compatibilité et vitesse</h3>''')

# Disque dur : désormais livré partitionné et formaté
rep("<p>Un disque vierge, comme sorti de sa boîte. Partitionnez-le ensuite avec HDToolBox (disquette Install) puis formatez-le depuis le Workbench.</p>",
    "<p>Un disque prêt à l'emploi : partitionné comme avec HDToolBox (une partition DH0: amorçable) et formaté en FFS, nommé « Travail ». Vous pouvez y installer le Workbench directement.</p>")
rep("<li>Démarrez sur la disquette Install 3.1, lancez HDToolBox, partitionnez, puis formatez DH0: depuis le Workbench.</li>",
    "<li>Le disque arrive déjà partitionné et formaté : démarrez sur la disquette Install 3.1.</li>")

# Lien vers l'ancienne version, conservée sous sae/
note = "Vos fichiers restent dans ce navigateur (stockage local) et ne sont envoyés nulle part."
rep(note, note + '\n    <br><a href="sae/">Ancienne version (cœur SAE)</a>, conservée pour comparer : elle partage la même Bibliothèque.')

# Carte accélératrice, horloge et bruit des lecteurs (version PUAE)
rep('compat: "normal", autoskip: true,', 'compat: "normal", accel: "none", model: "a1200", romId500: "auto", floppySound: false, autoskip: true,')
rep("""      <h3>Affichage</h3>
      <div class="opt" data-setting="region">""", """      <h3>Carte accélératrice</h3>
      <div class="opt" data-setting="accel">
        <label><input type="radio" name="accel" value="none"> Aucune (68EC020 d'origine)</label>
        <label><input type="radio" name="accel" value="030"> 68030 + FPU 68882, 28 MHz</label>
        <label><input type="radio" name="accel" value="040"> 68040, 28 MHz</label>
        <label><input type="radio" name="accel" value="060"> 68060, 42 MHz</label>
      </div>
      <p class="hint">Comme une Blizzard dans la trappe. 68040 et 68060 demandent beaucoup plus de calcul à l'ordinateur et certains jeux anciens ne les supportent pas. Avec la mémoire Fast, l'Amiga a aussi une horloge sauvegardée.</p>

      <h3>Affichage</h3>
      <div class="opt" data-setting="region">""")
rep("""        <label><input type="checkbox" id="optAutosave"> Enregistrer les disques modifiés à l'extinction</label>""",
    """        <label><input type="checkbox" id="optAutosave"> Enregistrer les disques modifiés à l'extinction</label>
        <label><input type="checkbox" id="optFloppySound"> Bruit des lecteurs (clics de la tête)</label>""")
rep("""        <h3>Mémoire</h3>
        <div class="opt"><label><input type="radio" name="p_fast\"""", """        <h3>Carte accélératrice</h3>
        <div class="opt"><label><input type="radio" name="p_accel" value="none"> Aucune</label><label><input type="radio" name="p_accel" value="030"> 68030</label><label><input type="radio" name="p_accel" value="040"> 68040</label><label><input type="radio" name="p_accel" value="060"> 68060</label></div>
        <h3>Mémoire</h3>
        <div class="opt"><label><input type="radio" name="p_fast\"""")
lst = '["fast", "cpu", "region", "res", "joy", "floppy", "kbd", "compat"]'
assert page.count(lst) == 2
page = page.replace(lst, '["fast", "cpu", "region", "res", "joy", "floppy", "kbd", "compat", "accel"]')
rep('$("#optAutosave").checked = S.autosave;', '$("#optAutosave").checked = S.autosave; $("#optFloppySound").checked = !!S.floppySound;')
rep('$("#optAutosave").onchange = e => { S.autosave = e.target.checked; saveSettings(); };',
    '$("#optAutosave").onchange = e => { S.autosave = e.target.checked; saveSettings(); };\n'
    '$("#optFloppySound").onchange = e => { S.floppySound = e.target.checked; saveSettings(); if (!running) return; '
    'if (E.core === "winuae6") ambFloppySounds(machine).then(() => machine.M._amb_set_floppy_sound(S.floppySound ? 1 : 0)).catch(() => {}); '
    'else machine.setOption("puae_floppy_sound", S.floppySound ? "75" : "100"); };')

# Souris : rappel des deux boutons dans l'aide
rep("Cliquez dans l'écran pour capturer la souris, <span class=\"kbd\">Échap</span> pour la libérer.</p>",
    "Cliquez dans l'écran pour capturer la souris, <span class=\"kbd\">Échap</span> pour la libérer. Une fois capturée, le bouton gauche sélectionne et le bouton droit (gardé enfoncé) ouvre la barre de menus, comme sur l'Amiga ; sur un pavé tactile, cliquez à deux doigts. Sans souris : <span class=\"kbd\">Page préc.</span> (Amiga gauche) + <span class=\"kbd\">Alt</span> gauche = bouton gauche, + <span class=\"kbd\">Alt Gr</span> = bouton droit.</p>")

# Application installable (PWA) et hors ligne
rep('<link rel="icon" href="data:,">', '''<link rel="icon" href="icon-192.png" type="image/png">
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#2b303b">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Amiga 1200">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">''')
rep('''    <button class="gad" id="btnHelp" aria-label="Aide">?</button>''',
    '''    <button class="gad" id="btnInstall" hidden title="Installer l'émulateur comme une application, utilisable hors ligne">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="1.5" width="8" height="13" rx="1.2"/><path d="M8 4.5v5M5.8 7.5 8 9.7l2.2-2.2"/></svg>
      Installer</button>
    <button class="gad" id="btnHelp" aria-label="Aide">?</button>''')
rep('''      <h3>Sauvegardes d'état</h3>''', '''      <h3>Installer l'application</h3>
      <p>L'émulateur s'installe comme une application et fonctionne ensuite <b>sans connexion</b>, avec votre Bibliothèque et vos réglages.
      <b>Android, ordinateur (Chrome, Edge)</b> : bouton <b>Installer</b> de la barre d'outils, ou menu du navigateur → « Installer l'application ».
      <b>iPhone, iPad</b> : dans Safari, bouton Partager → « Sur l'écran d'accueil ». Les mises à jour arrivent seules, au lancement suivant une connexion.</p>
      <h3>Sauvegardes d'état</h3>''')
rep("/* Profil par disque */", '''/* Application installable : bouton Installer (Chrome, Edge, Android) et état de la copie hors ligne */
(function pwa() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let deferred = null; const b = $("#btnInstall");
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; if (!standalone) b.hidden = false; });
  window.addEventListener("appinstalled", () => { b.hidden = true; deferred = null; toast("Amiga 1200 est installé : il fonctionne aussi hors ligne."); });
  b.onclick = async () => { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch (x) {} deferred = null; b.hidden = true; };
  if (!("serviceWorker" in navigator) || !window.caches) return;
  /* Premier passage : prévenir quand tout est copié pour le hors ligne */
  navigator.serviceWorker.ready.then(async () => {
    let said = false; try { said = localStorage.getItem("a1200.offline") === "1"; } catch (x) {}
    if (said) return;
    for (let i = 0; i < 60; i++) {
      for (const k of await caches.keys()) {
        if (k.startsWith("a1200-") && await (await caches.open(k)).match("puae.wasm")) {
          try { localStorage.setItem("a1200.offline", "1"); } catch (x) {}
          if (!running) toast("L'émulateur est prêt à fonctionner hors ligne.");
          return;
        }
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  });
  /* Nouvelle version publiée : elle prend effet au prochain lancement */
  let had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (had) toast("Une nouvelle version de l'émulateur est prête : elle sera utilisée au prochain lancement.");
    had = true;
  });
})();

/* Profil par disque */''')

rep("button{font:inherit}", "button{font:inherit}\n[hidden]{display:none!important}")

# Écran d'accueil : Kickstart, derniers disques, Allumer
between('        <div class="idle" id="idle">', '        <div class="glare"></div>', '''        <div class="idle launch" id="idle">
          <div class="l-head">
            <h1 id="lTitle">Amiga 1200</h1>
            <div class="l-kick" id="lKick"></div>
          </div>
          <div class="l-main" id="lMain"></div>
          <div class="l-foot">
            <button class="gad primary l-power" id="idlePower"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 1v6M4.2 3.5a6 6 0 1 0 7.6 0"/></svg><span>Allumer</span></button>
            <span class="l-what" id="lWhat"></span>
            <span class="l-sp"></span>
            <button class="gad" id="lOpen"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1.5 3.5h5l1.5 1.5h6.5v8.5h-13z"/></svg>Ouvrir un fichier…</button>
          </div>
        </div>
''')
rep(".idle .rom-line{font-size:13px;color:#7c8792}", """.idle .rom-line{font-size:13px;color:#7c8792}
/* Accueil */
.launch{justify-content:flex-start;align-items:stretch;text-align:left;gap:14px;padding:clamp(14px,3.5%,30px);overflow:auto;
  background:radial-gradient(ellipse at 50% 0%,#1d2633,#0d1014 75%);color:#c3cbd4}
.l-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px}
.launch h1{font-size:clamp(22px,3.4vw,32px);text-align:left}
.l-kick{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;background:rgba(255,255,255,.05);padding:5px 6px 5px 10px;border:1px solid rgba(255,255,255,.08)}
.l-model{display:inline-flex;border:1px solid rgba(255,255,255,.25);margin-right:6px}
.l-seg{appearance:none;font:inherit;font-size:12.5px;background:none;border:0;color:#aeb7c1;padding:3px 9px;cursor:pointer}
.l-seg[aria-pressed="true"]{background:var(--wb-blue);color:#fff}
.l-model{border:0}
.l-model-sel{font:inherit;font-size:13px;background:rgba(255,255,255,.08);color:inherit;border:1px solid rgba(255,255,255,.25);padding:3px 6px;border-radius:3px}
.l-model-sel option{color:#000}
.l-kick-lbl{color:#7c8792;text-transform:uppercase;letter-spacing:.08em;font-size:11px}
.l-kick-name{color:#e3e7eb}
.l-main{flex:1 0 auto;display:flex;flex-direction:column;gap:10px;min-height:0}
.l-title{font-size:13px;color:#8e99a4;text-transform:uppercase;letter-spacing:.08em}
.l-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.l-tile{display:flex;flex-direction:column;background:#161b22;border:1px solid #2a323d;min-width:0}
.l-tile.in{border-color:var(--wb-blue);box-shadow:0 0 0 1px var(--wb-blue)}
.l-pick{appearance:none;background:none;border:0;color:inherit;font:inherit;text-align:left;padding:0;cursor:pointer;display:flex;flex-direction:column;min-width:0}
.l-pick:hover .l-img,.l-pick:focus-visible .l-img{filter:brightness(1.15)}
.l-pick:focus-visible{outline:2px dashed var(--wb-blue);outline-offset:2px}
.l-img{aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;background:#0b0e12;overflow:hidden}
.l-img img{width:100%;height:100%;object-fit:cover;display:block}
.l-img svg{width:44%;height:auto}
.l-name{padding:7px 9px 0;font-weight:600;color:#e8ecef;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.l-sub{padding:1px 9px 8px;font-size:12px;color:#7f8a95}
.l-resume{appearance:none;font:inherit;font-size:12.5px;border:0;border-top:1px solid #2a323d;background:#1d2530;color:#b9c8dc;padding:6px 9px;text-align:left;cursor:pointer}
.l-resume:hover{background:#26303d}
.l-more{appearance:none;font:inherit;font-size:13px;background:none;border:0;color:#b9c8dc;text-decoration:underline;cursor:pointer;align-self:flex-start;padding:2px 0}
.l-steps{margin:0;padding:0;list-style:none;counter-reset:st;display:flex;flex-direction:column;gap:10px;max-width:640px}
.l-steps li{counter-increment:st;display:grid;grid-template-columns:34px 1fr;column-gap:12px;row-gap:3px;align-items:start}
.l-steps li::before{content:counter(st);grid-row:span 3;width:30px;height:30px;border-radius:50%;background:var(--wb-blue);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700}
.l-steps b{color:#e8ecef}
.l-steps span{font-size:13.5px;color:#9aa3ad}
.l-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.l-foot{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px}
.l-power{font-size:16px;padding:9px 18px}
.l-power svg{width:18px;height:18px}
.l-what{font-size:13px;color:#9aa3ad;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:46ch}
.l-sp{flex:1}
.tube.off{touch-action:auto}
.tube.off .glare,.tube.off.crt::after{display:none}
/* Amiga éteint : on n'affiche que ce qui sert */
body.is-off #btnPower,body.is-off #btnReset,body.is-off #btnPause,body.is-off #btnShot,body.is-off #kCAA,body.is-off .keys,body.is-off .vkbd,body.is-off .touch-tip{display:none!important}""")
rep(".idle p,.idle .rom-line{display:none}.idle h1{font-size:22px}}", """.idle p,.idle .rom-line{display:none}.idle h1{font-size:22px}
  .tube.off{aspect-ratio:auto;min-height:min(520px,calc(100vh - 160px))}
  .tube.off .launch{position:relative;min-height:inherit}
  .l-grid{grid-template-columns:repeat(2,1fr);gap:8px}
  .l-power{flex:1;justify-content:center}
  .l-what{order:3;flex-basis:100%;max-width:none}
  .l-sp{display:none}
  #lOpen{flex:1;justify-content:center}}""")
rep("/* Profil par disque */", (APP / "launcher-puae.js").read_text(encoding="utf-8") + "\n/* Profil par disque */")

# Disques durs : images sans RDB complétées, jusqu'à 2 Go, rangés par morceaux
rep('import { makeHardDisk } from "./hdf.js";', 'import { makeHardDisk, inspectHdf, rdbHeaderFor, rootCandidate, isRootBlock, uniquePartitionNames } from "./hdf.js";')
rep('''async function importFile(file, target) {
  let items;''', '''async function importFile(file, target) {
  /* Disque dur : lu directement depuis le fichier, sans le charger entier en mémoire */
  if (/\\.hdf$/i.test(file.name) || (file.size > 64 * 1048576 && !/\\.(zip|gz|adz|hdz|lha|lzh|lzx|rar|7z|rom|bin|adf|dms)$/i.test(file.name)))
    return importHdf(file.name, file, isHd(target || "") ? target : true);
  let items;''')
rep('''  if (kind === "hdf" && u8.length > 512 * 1048576) { toast("Disque dur trop gros (512 Mo maximum).", true); return; }''',
    '''  if (kind === "hdf") return importHdf(name, new Blob([u8]), mount && isHd(target || "") ? target : mount);''')
rep('btn("Télécharger", async () => download(new Uint8Array(await r.blob.arrayBuffer()), r.name));',
    'btn("Télécharger", async () => download(r.kind === "hdf" ? await recBlob(r) : new Uint8Array(await r.blob.arrayBuffer()), r.name));')

rep("Disques durs .hdf ou .hdz (jusqu'à 512 Mo).", "Disques durs .hdf ou .hdz jusqu'à 2 Go (512 Mo sur téléphone et tablette), avec table de partitions (RDB) ou image d'une seule partition FFS/OFS, que l'émulateur complète d'une table de partitions pour qu'elle démarre. Seules les parties modifiées par l'Amiga sont réenregistrées. Pour les jeux WHDLoad, activez 8 Mo de Fast et copiez les Kickstart demandés dans Devs:Kickstarts du disque.")

# Plein écran : bouton pour en sortir, visible au mouvement de la souris ou au toucher
rep('''        <div class="glare"></div>''', '''        <div class="glare"></div>
        <button class="fs-exit" id="fsExit" type="button"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5.5 1.5v4h-4M10.5 1.5v4h4M14.5 10.5h-4v4M1.5 10.5h4v4"/></svg>Quitter le plein écran</button>''')
rep(".tube:fullscreen canvas{object-fit:contain}", """.tube:fullscreen canvas{object-fit:contain}
.fs-exit{display:none;position:absolute;top:12px;right:12px;z-index:5;align-items:center;gap:8px;padding:9px 14px;font:inherit;font-size:14px;
  color:#fff;background:rgba(20,24,30,.78);border:1px solid rgba(255,255,255,.25);border-radius:6px;cursor:pointer;transition:opacity .3s}
.fs-exit svg{width:16px;height:16px}
.tube:fullscreen .fs-exit,.tube:-webkit-full-screen .fs-exit{display:flex}
.fs-exit.hide{opacity:0;pointer-events:none}""")
rep('''$("#btnShot").onclick = () => {''', '''(function fullscreenExit() {
  const t = $("#tube"), b = $("#fsExit"); let timer = 0;
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  /* iPhone : pas de plein écran pour une page (seulement pour les vidéos) ; l'application installée l'est déjà */
  if (!t.requestFullscreen && !t.webkitRequestFullscreen) $("#btnFull").hidden = true;
  const exit = () => { if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); };
  const show = () => { if (!isFs()) return; b.classList.remove("hide"); clearTimeout(timer); timer = setTimeout(() => b.classList.add("hide"), 3000); };
  const onChange = () => {
    if (!isFs()) { b.classList.add("hide"); return; }
    show();
    toast(isTouch ? "Pour quitter le plein écran : touchez l'écran puis le bouton en haut à droite, ou faites le geste retour."
                  : "Pour quitter le plein écran : Échap (deux fois si la souris est capturée), ou le bouton en haut à droite.");
  };
  document.addEventListener("fullscreenchange", onChange); document.addEventListener("webkitfullscreenchange", onChange);
  /* Le bouton réapparaît quand on bouge la souris (non capturée) ou qu'on touche l'écran */
  t.addEventListener("mousemove", () => { if (!document.pointerLockElement) show(); });
  t.addEventListener("touchstart", show, { passive: true, capture: true });
  /* Le toucher ne doit pas partir vers la souris de l'Amiga */
  b.addEventListener("touchstart", e => { e.stopPropagation(); }, { passive: true });
  b.addEventListener("touchend", e => { e.stopPropagation(); e.preventDefault(); exit(); });
  b.addEventListener("mousedown", e => e.stopPropagation());
  b.onclick = e => { e.stopPropagation(); exit(); };
})();
$("#btnShot").onclick = () => {''')

# Copier des fichiers sur le disque dur (jeux WHDLoad .lha, dossiers, Kickstart)
rep('import { makeBlankAdf } from "./adf.js";', 'import { makeBlankAdf } from "./adf.js";\nimport { readLha } from "./lha.js";\nimport { listPartitions, AmigaVolume, amigaName } from "./ffs.js";')
rep('''        <button class="gad small" data-act="blank">Nouveau</button>''', '''        <button class="gad small" data-act="blank">Nouveau</button>
        <button class="gad small" data-act="files" disabled title="Copier des fichiers, un dossier ou un jeu WHDLoad (.lha) sur ce disque">Fichiers…</button>''')
rep('''  if (/\\.(lha|lzh|lzx|rar|7z)$/.test(n)) throw new Error(name + " : format d'archive non géré, extrayez-la d'abord (.zip, .adz et .gz sont acceptés)");''',
    '''  if (/\\.(lha|lzh)$/.test(n)) {
    /* Archive LhA : les disquettes et disques qu'elle contient */
    const items = [];
    for (const e of readLha(u8)) if (!e.dir && e.data && /\\.(adf|adz|dms|hdf|hdz|zip|gz|rom|key)$/i.test(e.path)) items.push(...await expandFile(e.path.split("/").pop(), e.data));
    if (!items.length) throw new Error(name + " ne contient ni disquette ni disque dur : pour un jeu WHDLoad, utilisez le bouton « Fichiers… » du disque dur");
    return items;
  }
  if (/\\.(lzx|rar|7z)$/.test(n)) throw new Error(name + " : format d'archive non géré, extrayez-la d'abord (.zip, .lha, .adz et .gz sont acceptés)");''')
rep('''        btn("DH0:", async () => { if (running) { toast("Éteignez l'Amiga pour changer de disque dur.", true); return; } await mountMedia("dh0", r); renderLib(); }, inUse);''',
    '''        btn("DH0:", async () => { if (running) { toast("Éteignez l'Amiga pour changer de disque dur.", true); return; } await mountMedia("dh0", r); renderLib(); }, inUse);
        btn("Fichiers…", () => openFiles(r));''')
rep("<!-- Fenêtre : Aide -->", '''<!-- Fenêtre : copier des fichiers sur le disque dur -->
<div class="veil" id="winFiles" role="dialog" aria-modal="true" aria-labelledby="tFiles">
  <div class="win wb">
    <div class="titlebar"><button class="closebox" data-close aria-label="Fermer"></button><span class="t" id="tFiles">Copier sur le disque dur</span><span class="stripes"></span></div>
    <div class="body" id="filesBody"></div>
    <div class="actions"><span></span><button class="gad primary" data-close>Fermer</button></div>
  </div>
</div>
<input type="file" id="filesPick" multiple hidden>
<input type="file" id="dirPick" webkitdirectory multiple hidden>

<!-- Fenêtre : Aide -->''')
rep(".footnote{margin-top:18px", '''.files-log{white-space:pre-wrap;font:12.5px/1.4 ui-monospace,Menlo,Consolas,monospace;background:#ddd;border:1px solid;border-color:#000 #fff #fff #000;padding:6px 8px;margin:10px 0 0;min-height:1.4em;max-height:180px;overflow:auto}
.files-log:empty{display:none}
.files-warn{background:#e9b7a6;padding:6px 8px;border:1px solid #000}
.footnote{margin-top:18px''')
rep("/* Profil par disque */", (APP / "hdfiles-puae.js").read_text(encoding="utf-8") + "\n/* Profil par disque */")
rep('''      <h3>Sauvegardes d'état</h3>''', '''      <h3>Copier des fichiers sur le disque dur</h3>
      <p>Amiga éteint, le bouton <b>Fichiers…</b> du disque dur (ou de la Bibliothèque) copie des fichiers, un dossier entier ou des archives .lha et .zip, décompressées au passage, dans le dossier de votre choix. C'est la façon d'installer des jeux <b>WHDLoad</b> : copiez WHDLoad dans C:, vos jeux .lha dans Jeux, et vos Kickstart dans Devs:Kickstarts avec le bouton prévu (1.3 pour l'A500, 3.1 pour l'A1200). Disques OFS et FFS ; PFS, SFS et FFS à cache de dossiers ne sont pas modifiables ici.</p>
      <h3>Sauvegardes d'état</h3>''')

# Mode Amiga 500
rep('''      <h3>Kickstart</h3>
      <div id="romChoices" class="lib-list"></div>''', '''      <h3>Modèle</h3>
      <div class="opt" data-setting="model">
        <label><input type="radio" name="model" value="a1200"> Amiga 1200 (68EC020, AGA, 2 Mo)</label>
        <label><input type="radio" name="model" value="a500"> Amiga 500 (68000, OCS, 1 Mo)</label>
        <label><input type="radio" name="model" value="cd32"> Amiga CD32 (console CD)</label>
        <label><input type="radio" name="model" value="a600"> Amiga 600 (68000, ECS, 1 Mo, IDE)</label>
        <label><input type="radio" name="model" value="a3000"> Amiga 3000 (68030, ECS, 32 bits)</label>
        <label><input type="radio" name="model" value="a4000"> Amiga 4000 (68030, AGA, 32 bits)</label>
        <label><input type="radio" name="model" value="cdtv"> Amiga CDTV (console CD de 1991)</label>
      </div>
      <p class="hint" id="modelRom" hidden></p>
      <p class="hint">L'Amiga 500 sert aux jeux A500 qui refusent de tourner sur l'A1200, lancés depuis leurs disquettes ; il demande le Kickstart 1.3. Ni disque dur ni carte accélératrice dans ce mode. Le choix peut aussi se faire pour une seule disquette, dans son Profil. A600, A3000, A4000 et CDTV passent par le cœur WinUAE 6, avec leur Kickstart pris dans la Bibliothèque (le leur, sinon celui de l'A1200, sinon AROS).</p>

      <h3>Kickstart</h3>
      <p class="hint">Pour l'Amiga 1200 :</p>
      <div id="romChoices" class="lib-list"></div>
      <p class="hint">Pour l'Amiga 500 :</p>
      <div id="rom500Choices" class="lib-list"></div>''')
lst = '["fast", "cpu", "region", "res", "joy", "floppy", "kbd", "compat", "accel"]'
assert page.count(lst) == 2
page = page.replace(lst, '["fast", "cpu", "region", "res", "joy", "floppy", "kbd", "compat", "accel", "model"]')
rep('''        <h3>Carte accélératrice</h3>
        <div class="opt"><label><input type="radio" name="p_accel"''', '''        <h3>Modèle</h3>
        <div class="opt"><label><input type="radio" name="p_model" value="a1200"> Amiga 1200</label><label><input type="radio" name="p_model" value="a500"> Amiga 500</label></div>
        <h3>Carte accélératrice</h3>
        <div class="opt"><label><input type="radio" name="p_accel"''')
rep("/* Profil par disque */", '''/* Kickstart de l'Amiga 500 : automatique (un 1.x de la Bibliothèque), AROS, ou une ROM précise */
async function renderRom500() {
  const box = $("#rom500Choices"); if (!box) return;
  const all = await DB.all(), roms = all.filter(r => r.kind === "rom").sort((a, b) => a.added - b.added);
  const eff = await romFor500(all), effRec = roms.find(r => r.id === eff);
  box.innerHTML = "";
  const row = (id, label) => {
    const r = document.createElement("label"); r.className = "lib-row";
    r.innerHTML = '<input type="radio" name="rom500"><span class="n"></span>';
    const inp = r.querySelector("input"); inp.checked = (S.romId500 || "auto") === id;
    inp.onchange = () => { S.romId500 = id; saveSettings(); renderRom500(); renderLauncherSoon(); };
    r.querySelector(".n").textContent = label; box.appendChild(r);
  };
  row("auto", "Automatique : " + (effRec ? (effRec.label || effRec.name) : "AROS, aucun Kickstart 1.x dans la Bibliothèque"));
  row("aros", "AROS (libre, intégré)");
  roms.forEach(r => row(r.id, r.label || r.name));
}
{ const _r = renderRomChoices; renderRomChoices = async () => { await _r(); await renderRom500(); }; }
$$('#winSettings input[name="model"]').forEach(i => i.addEventListener("change", () => renderLauncherSoon()));

/* Profil par disque */''')
rep('''      <h3>Copier des fichiers sur le disque dur</h3>''', '''      <h3>Amiga 500</h3>
      <p>Certains jeux A500 ne fonctionnent pas sur l'A1200. Choisissez <b>Amiga 500</b> sur l'écran d'accueil ou dans Réglages (68000, chipset OCS, 512 Ko de Chip + 512 Ko de Slow), ou seulement pour une disquette dans son <b>Profil</b>. Importez le Kickstart 1.3 dans Réglages : il est choisi automatiquement pour l'A500. Les jeux A500 installés sur disque dur se lancent, eux, avec WHDLoad sur l'A1200.</p>
      <h3>Copier des fichiers sur le disque dur</h3>''')

rep('''    rec.label = info.label;
    await DB.put(rec);
    S.romId = rec.id; saveSettings();
    toast("Kickstart sélectionné : " + info.label + (running ? ". Éteignez puis rallumez pour l'utiliser." : ""), info.warn);''', '''    rec.label = info.label; rec.kickVer = kickVersion(u8);
    await DB.put(rec);
    if (rec.kickVer && rec.kickVer[0] <= 37) {
      /* Kickstart 1.x / 2.0x : pour le mode Amiga 500, l'A1200 garde le sien */
      toast(info.label + " ajouté : il servira au mode Amiga 500.");
    } else {
      S.romId = rec.id; saveSettings();
      toast("Kickstart sélectionné : " + info.label + (running ? ". Éteignez puis rallumez pour l'utiliser." : ""), info.warn);
    }''')

# Réglages et profils cohérents avec le modèle choisi (A500 : 7 MHz, 512 Ko + 512 Ko, pas de carte accélératrice)
rep("/* Profil par disque */", '''function modelUi(win, prefix, model) {
  const a500 = model === "a500" || model === "a600";
  const lab = (name, value, text) => { const i = $(win + ' input[name="' + prefix + name + '"][value="' + value + '"]'); if (i) i.parentElement.lastChild.textContent = " " + text; };
  const big = model === "a3000" || model === "a4000";
  lab("fast", "0", model === "a600" ? "1 Mo Chip (d'origine)" : a500 ? "512 Ko Chip + 512 Ko Slow (d'origine)" : big ? "Mémoire d'origine (2 Mo Chip + 8 Mo sur la carte mère)" : prefix ? "2 Mo Chip" : "2 Mo Chip (d'origine)");
  lab("cpu", "orig", a500 ? (prefix ? "7 MHz" : "7 MHz (d'origine, 68000)") : big ? "25 MHz (d'origine, 68030)" : (prefix ? "14 MHz" : "14 MHz (d'origine)"));
  /* La carte accélératrice ne concerne que l'A1200 : son titre, ses choix et son explication disparaissent */
  const acc = $(win + ' input[name="' + prefix + 'accel"]');
  if (acc) {
    const box = acc.closest(".opt"), h = box.previousElementSibling, hint = box.nextElementSibling;
    for (const el of [box, h, hint && hint.classList.contains("hint") && !hint.querySelector("input") ? hint : null]) if (el) el.hidden = !HAS_ACCEL.has(model || "a1200");
  }
}
function settingsModelUi() {
  modelUi("#winSettings", "", S.model);
  $("#tSettings").textContent = "Réglages de l'" + (S.model === "cd32" ? "Amiga CD32" : (MODELS[S.model] || MODELS.a1200).name);
}
function profileModelUi() {
  const c = $('#winProfile input[name="p_model"]:checked');
  modelUi("#winProfile", "p_", c ? c.value : S.model);
}
{ const _s = syncSettingsForm; syncSettingsForm = () => { _s(); settingsModelUi(); }; }
$$('#winSettings input[name="model"]').forEach(i => i.addEventListener("change", settingsModelUi));
$$('#winProfile input[name="p_model"]').forEach(i => i.addEventListener("change", profileModelUi));
{ const _o = openProfile; openProfile = async t => { await _o(t); profileModelUi(); }; }

/* Profil par disque */''')

# Commandes tactiles : joystick virtuel, barre de touches et clavier en plein écran
rep('''  machine.setJoy(0, joyKeys);
}''', '''  sendJoy(); /* avec le joystick virtuel */
}''')
rep('''<button class="fs-exit" id="fsExit" type="button">''', '''<div class="fs-bar" id="fsBar">
          <button class="fsb" id="fsKbd" type="button" aria-pressed="false">Clavier</button>
          <button class="fsb" data-vjoy type="button" aria-pressed="false">Joystick</button>
          <button class="fsb" data-tap="Space" type="button">Espace</button>
          <button class="fsb" data-tap="Enter" type="button">Entrée</button>
          <button class="fsb" data-tap="Escape" type="button">Échap</button>
          <button class="fsb" data-tap="F1" type="button">F1</button>
          <button class="fsb" data-tap="F2" type="button">F2</button>
        </div>
        <div class="vjoy" id="vjoy" hidden>
          <div class="vjoy-stick" id="vjoyStick" aria-label="Manche du joystick"><div class="vjoy-knob" id="vjoyKnob"></div></div>
          <div class="vjoy-fire"><button type="button" data-fire="8" class="vf2" aria-label="Deuxième bouton">2</button><button type="button" data-fire="0" class="vf1">FEU</button></div>
        </div>
        <button class="fs-exit" id="fsExit" type="button">''')
rep('''      Clavier</button>
    <button class="gad small" data-latch="MetaLeft"''', '''      Clavier</button>
    <button class="gad small" data-vjoy aria-pressed="false" title="Joystick tactile sur l'écran (port 2)">Joystick</button>
    <button class="gad small" data-latch="MetaLeft"''')
rep(".fs-exit svg{width:16px;height:16px}", """.fs-exit svg{width:16px;height:16px}
.fs-bar{display:none;position:absolute;top:12px;left:12px;z-index:5;gap:6px;flex-wrap:wrap;max-width:calc(100% - 250px)}
.tube:fullscreen .fs-bar,.tube:-webkit-full-screen .fs-bar{display:flex}
.fsb{font:inherit;font-size:13px;color:#fff;background:rgba(20,24,30,.65);border:1px solid rgba(255,255,255,.25);border-radius:6px;padding:8px 11px;cursor:pointer}
.fsb[aria-pressed="true"]{background:var(--wb-blue)}
body:not(.is-touch) [data-vjoy]{display:none}
.vjoy{position:absolute;left:0;right:0;bottom:0;z-index:5;display:flex;justify-content:space-between;align-items:flex-end;padding:14px 16px;pointer-events:none}
.vjoy[hidden],body.is-off .vjoy,body.is-off .fs-bar{display:none}
.vjoy-stick{pointer-events:auto;position:relative;width:min(34vmin,150px);aspect-ratio:1;border-radius:50%;background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.35);touch-action:none}
.vjoy-knob{position:absolute;left:29%;top:29%;width:42%;height:42%;border-radius:50%;background:rgba(255,255,255,.45);pointer-events:none}
.vjoy-fire{pointer-events:auto;display:flex;gap:12px;align-items:flex-end}
.vjoy-fire button{width:min(21vmin,88px);aspect-ratio:1;border-radius:50%;border:2px solid rgba(255,255,255,.4);background:rgba(220,60,60,.45);color:#fff;font:inherit;font-weight:700;touch-action:none;padding:0}
.vjoy-fire .vf2{width:min(15vmin,62px);background:rgba(80,120,200,.45)}
.vjoy-fire button.down{filter:brightness(1.7)}
.tube > #vkbd{position:absolute;left:0;right:0;bottom:0;z-index:7;margin:0;opacity:.94}""")
rep("/* Profil par disque */", (APP / "touchctl-puae.js").read_text(encoding="utf-8") + "\n/* Profil par disque */")
rep('''      <h3>Écran tactile</h3>''', '''      <h3>Jouer sur écran tactile</h3>
      <p>Le bouton <b>Joystick</b> (sous l'écran, ou dans la barre du plein écran) pose un joystick sur l'écran : le manche à gauche, <b>FEU</b> et un deuxième bouton à droite ; il commande le port joystick de l'Amiga, même en plein écran. En plein écran, une barre en haut à gauche donne aussi le <b>Clavier</b> complet, Espace, Entrée, Échap, F1 et F2, souvent demandés pour lancer un jeu.</p>
      <h3>Écran tactile</h3>''')

# Joystick tactile : zone morte réglable, disposition gaucher, transparence, vibration
rep('''      <p class="hint">Avec « Flèches », les flèches pilotent aussi le joystick : choisissez « Aucun » pour un usage bureautique.</p>''',
    '''      <p class="hint">Avec « Flèches », les flèches pilotent aussi le joystick : choisissez « Aucun » pour un usage bureautique.</p>

      <div class="vj-opts">
        <h3>Joystick tactile</h3>
        <div class="opt vj-range"><label for="vjDead">Zone morte</label><input type="range" id="vjDead" min="10" max="60" step="5"><output id="vjDeadV"></output></div>
        <p class="hint">Distance du centre à partir de laquelle le manche compte une direction : plus grande, moins de mouvements involontaires ; plus petite, plus de réactivité. Le cercle au centre du manche la montre.</p>
        <div class="opt vj-range"><label for="vjAlpha">Opacité</label><input type="range" id="vjAlpha" min="20" max="100" step="5"><output id="vjAlphaV"></output></div>
        <div class="opt">
          <label><input type="checkbox" id="vjLeft"> Gaucher : manche à droite, boutons de tir à gauche</label>
          <label><input type="checkbox" id="vjVibe"> Vibration au tir et aux changements de direction</label>
        </div>
        <p class="hint" id="vjVibeNote" hidden>Ce navigateur ne sait pas faire vibrer l'appareil (c'est le cas sur iPhone et iPad).</p>
      </div>''')
rep(".tube > #vkbd{position:absolute;", """.vjoy.left{flex-direction:row-reverse}
.vjoy.left .vjoy-fire{flex-direction:row-reverse}
.vjoy-stick::before{content:"";position:absolute;left:50%;top:50%;width:var(--vj-dead,30%);height:var(--vj-dead,30%);transform:translate(-50%,-50%);
  border-radius:50%;border:1px dashed rgba(255,255,255,.35);pointer-events:none}
body:not(.is-touch) .vj-opts{display:none}
.vj-range{display:flex;align-items:center;gap:10px}
.vj-range label{min-width:7em}
.vj-range input{flex:1;max-width:260px}
.vj-range output{min-width:3.5em;font-variant-numeric:tabular-nums}
.tube > #vkbd{position:absolute;""")
rep('''      <h3>Écran tactile</h3>''', '''      <p>Dans <b>Réglages</b>, le joystick tactile se règle à votre main : <b>zone morte</b> du manche, disposition <b>gaucher</b> (manche à droite), <b>opacité</b> pour voir le jeu au travers, et <b>vibration</b> au tir et aux changements de direction (pas sur iPhone).</p>
      <h3>Écran tactile</h3>''')

# Quatre disques durs : DH0: et DH1: (IDE maître et esclave), DH2: et DH3: (pilote de disque d'UAE)
rep('df0: null, df1: null, dh0: null, muted: false', 'df0: null, df1: null, dh0: null, dh1: null, dh2: null, dh3: null, muted: false')
rep('n.textContent = rec ? rec.name : (tag === "dh0" ? "Aucun disque dur" : "Aucune disquette");',
    'n.textContent = rec ? rec.name : (/^dh/.test(tag) ? "Aucun disque dur" : "Aucune disquette");')
rep('if (act === "insert") pickFile(tag === "dh0" ? ".hdf,.hdz,.zip,.gz"', 'if (act === "insert") pickFile(/^dh/.test(tag) ? ".hdf,.hdz,.zip,.gz"')
rep('if (tag === "dh0") { if (running) { toast("Éteignez l\'Amiga pour brancher un nouveau disque dur.", true); return; } showWin("winHd"); }',
    'if (/^dh/.test(tag)) { if (running) { toast("Éteignez l\'Amiga pour brancher un nouveau disque dur.", true); return; } hdTarget = tag; showWin("winHd"); }')
rep('''    for (const t of ["df0", "df1", "dh0"]) {
      if (S[t])''', '''    for (const t of ["df0", "df1", ...HD_TAGS]) {
      if (S[t])''')
rep('''        btn("DH0:", async () => { if (running) { toast("Éteignez l'Amiga pour changer de disque dur.", true); return; } await mountMedia("dh0", r); renderLib(); }, inUse);''',
    '''        for (const t of HD_TAGS) btn(t.toUpperCase() + ":", async () => { if (running) { toast("Éteignez l'Amiga pour changer de disque dur.", true); return; } await mountMedia(t, r); renderLib(); }, inUse === t);''')
# Panneaux DH1: à DH3:, sur le modèle de DH0:
_i = page.find('    <div class="drive wb" id="drive-dh0" data-unit="dh0">')
_j = page.find('\n    </div>\n', _i) + len('\n    </div>\n')
assert _i >= 0 and _j > _i
_panel = page[_i:_j]
_extra = ""
for _n, _lbl in [(1, "IDE, esclave"), (2, "disque UAE"), (3, "disque UAE")]:
    _extra += (_panel.replace('class="drive wb"', 'class="drive wb hd-extra"').replace("dh0", "dh%d" % _n)
               .replace("DH0:", "DH%d:" % _n).replace('IDE interne 2,5"', _lbl))
page = page[:_j] + _extra + page[_j:]
rep(".tube > #vkbd{position:absolute;", """.hd-extra [data-act="profile"]{display:none}
/* Sur téléphone, un disque dur supplémentaire libre se réduit à son titre et à ses deux boutons utiles */
@media (max-width:760px){.hd-extra:has(.media.empty) .media,.hd-extra:has(.media.empty) button:disabled{display:none}.hd-extra:has(.media.empty){gap:6px;padding:8px 12px}}
.tube > #vkbd{position:absolute;""")

# Export et import de la Bibliothèque : un seul fichier pour passer d'un appareil à l'autre
rep('<button class="gad" id="libImport">Ajouter des fichiers…</button>', '''<button class="gad" id="libImport">Ajouter des fichiers…</button>
      <button class="gad" id="libExport" title="Tout enregistrer dans un seul fichier, pour un autre appareil ou une sauvegarde">Exporter tout…</button>
      <button class="gad" id="libRestore" title="Reprendre une Bibliothèque exportée (fichier .tar)">Importer…</button>''')
rep("/* Profil par disque */", (APP / "library-io-puae.js").read_text(encoding="utf-8") + "\n/* Profil par disque */")
rep("<li>Sous DH0:, cliquez sur <b>Nouveau</b> et choisissez une taille.</li>", "<li>Sous DH0:, cliquez sur <b>Nouveau</b> et choisissez une taille. DH1: à DH3: accueillent d'autres disques, pour vos jeux ou vos données.</li>")
rep('''      <h3>Copier des fichiers sur le disque dur</h3>''', '''      <h3>Plusieurs disques durs</h3>
      <p>Jusqu'à quatre disques : <b>DH0:</b> et <b>DH1:</b> sur le contrôleur IDE de l'A1200 (maître et esclave), <b>DH2:</b> et <b>DH3:</b> par le pilote de disque d'UAE (uaehf.device), reconnu par tous les Kickstart. Chaque unité a son panneau sous l'écran, à côté des lecteurs de disquettes : <b>Nouveau</b> y crée un disque (sa partition prend le nom de l'unité), <b>Choisir…</b> en importe un. Dans la Bibliothèque, les boutons <b>DH0:</b> à <b>DH3:</b> branchent un disque déjà rangé ; un disque ne peut être branché qu'à un endroit. Les disques se branchent Amiga éteint. L'Amiga démarre sur DH0:. Si deux disques ont une partition du même nom (souvent DH0), celle du second est renommée au démarrage.</p>
      <h3>Changer d'appareil</h3>
      <p>Dans la Bibliothèque, <b>Exporter tout…</b> enregistre tout dans un seul fichier .tar : disquettes, disques durs, Kickstart, jeux WHDLoad, sauvegardes d'état et de jeux. Sur l'autre appareil, <b>Importer…</b> (ou glissez le fichier sur la page) les ajoute ; ce qui y est déjà et plus récent est gardé. Le fichier reste lisible par 7-Zip ou tar.</p>
      <h3>Copier des fichiers sur le disque dur</h3>''')

# Habillage selon le modèle : Workbench 3.1 (A1200), Workbench 1.3 (A500), arc-en-ciel Amiga, Boing Ball
rep("</style>", (APP / "theme-puae.css").read_text(encoding="utf-8") + "</style>")
rep("/* Profil par disque */", (APP / "theme-puae.js").read_text(encoding="utf-8") + "\n/* Profil par disque */")

# Jeux WHDLoad en un geste : une archive .lha, et on joue (sans Workbench ni disque dur)
rep("/* Profil par disque */", (APP / "whdload-puae.js").read_text(encoding="utf-8") + "\n/* Profil par disque */")
rep('''  if (sessionStorage.getItem("a1200.autostart")) { sessionStorage.removeItem("a1200.autostart"); powerOn(); }''',
    '''  const whdId = sessionStorage.getItem("a1200.whd");
  if (whdId) { sessionStorage.removeItem("a1200.whd"); whdGame = await DB.get(whdId) || null; }
  if (sessionStorage.getItem("a1200.autostart")) { sessionStorage.removeItem("a1200.autostart"); powerOn(); }''')
rep('const groups = [["adf", "Disquettes"], ["hdf", "Disques durs"],', 'const groups = [["whd", "Jeux WHDLoad"], ["adf", "Disquettes"], ["hdf", "Disques durs"],')
rep('''      } else if (kind === "rom") {
        btn(S.romId === r.id''', '''      } else if (kind === "whd") {
        btn("Jouer", () => { if (running) { toast("Éteignez d'abord l'Amiga.", true); return; } closeWin(); launchWhd(r); });
      } else if (kind === "rom") {
        btn(S.romId === r.id''')
rep('inp.accept = ".adf,.dms,.adz,.zip,.gz,.hdf,.hdz,.rom,.bin,.key";', 'inp.accept = ".adf,.dms,.adz,.zip,.gz,.lha,.lzh,.hdf,.hdz,.rom,.bin,.key,.tar";')
rep("Les archives .lha et .lzx doivent être extraites avant.", "Une archive .lha qui contient un jeu WHDLoad (un fichier .slave) devient un jeu prêt à lancer ; une autre .lha donne les disquettes qu'elle contient. Les archives .lzx doivent être extraites avant.")
rep('Déposez le fichier : disquette, disque dur ou Kickstart', 'Déposez le fichier : disquette, jeu WHDLoad (.lha), disque dur ou Kickstart')
rep('''      <h3>Copier des fichiers sur le disque dur</h3>''', '''      <h3>Jeux WHDLoad en un geste</h3>
      <p>Ouvrez une archive <b>.lha</b> de jeu WHDLoad (bouton <b>Ouvrir un fichier…</b> de l'accueil, ou glissez-la sur la page) : elle rejoint la Bibliothèque et sa vignette lance le jeu directement, sans Workbench ni disque dur à préparer. WHDLoad est fourni ; l'Amiga 1200 démarre avec 8 Mo de Fast. Importez vos Kickstart 3.1 (A1200) et 1.3 (A500) : WHDLoad les trouve tout seul, beaucoup de jeux en ont besoin. Les sauvegardes des jeux (WHDSaves) sont gardées d'une partie à l'autre. <span class="kbd">F10</span> quitte le jeu (touche habituelle des installations WHDLoad).</p>
      <h3>Copier des fichiers sur le disque dur</h3>''')

# Réglages par jeu WHDLoad : base d'Amiberry téléchargée par le navigateur
rep("/* Profil par disque */", (APP / "whddb-puae.js").read_text(encoding="utf-8") + "\n/* Profil par disque */")
rep('''        btn("Jouer", () => {''', '''        if (whdTags(r)) row.querySelector(".n").textContent += " — " + whdTags(r);
        btn("Jouer", () => {''')
rep('''      <h3>Lecteurs de disquettes</h3>
      <div class="opt" data-setting="floppy">''', '''      <h3>Jeux WHDLoad</h3>
      <div class="opt"><span>Base de réglages par jeu : <span id="whdDbStatus"></span></span><button class="gad small" id="whdDbUpdate" type="button">Mettre à jour</button></div>
      <p class="hint">Pour chaque jeu, la base de l'émulateur Amiberry (projet Amiberry-XML-Builder) indique ce qu'il demande : NTSC, processeur plus rapide, cycle exact, souris ou manette CD32. Elle est téléchargée depuis GitHub, gardée dans ce navigateur et appliquée au lancement du jeu.</p>

      <h3>Lecteurs de disquettes</h3>
      <div class="opt" data-setting="floppy">''')
rep('''      <h3>Copier des fichiers sur le disque dur</h3>''', '''      <h3>Réglages par jeu WHDLoad</h3>
      <p>Au lancement d'un jeu WHDLoad, l'émulateur consulte la base de réglages de l'émulateur Amiberry (plus de 11 000 jeux des collections WHDLoad, projet Amiberry-XML-Builder) : NTSC, processeur plus rapide, cycle exact, blitter immédiat, souris ou manette CD32 sont appliqués tout seuls. Le jeu est reconnu par le nom de son archive (gardez le nom d'origine), sinon par son empreinte. Ce que la base indique s'affiche sous la vignette du jeu. La base est téléchargée depuis GitHub au premier jeu, puis rafraîchie tous les 30 jours ou depuis les Réglages.</p>
      <h3>Copier des fichiers sur le disque dur</h3>''')

# CD32 : ROM de la console, images .iso / .cue + .bin, manette CD32
rep("/* Profil par disque */", (APP / "cd32-puae.js").read_text(encoding="utf-8") + "\n/* Profil par disque */")
rep('''  const whdId = sessionStorage.getItem("a1200.whd");''', '''  const cdId = sessionStorage.getItem("a1200.cd");
  if (cdId) { sessionStorage.removeItem("a1200.cd"); cdGame = await DB.get(cdId) || null; }
  const whdId = sessionStorage.getItem("a1200.whd");''')
rep('const groups = [["whd", "Jeux WHDLoad"],', 'const groups = [["whd", "Jeux WHDLoad"], ["cd", "CD (CD32)"],')
rep('''      } else if (kind === "whd") {''', '''      } else if (kind === "cd") {
        btn("Jouer", () => { if (running) { toast("Éteignez d'abord l'Amiga.", true); return; } closeWin(); launchCd(r); });
      } else if (kind === "whd") {''')
rep('btn("Télécharger", async () => download(r.kind === "hdf" ? await recBlob(r) :', '''if (kind === "cd") { if (r.cue) btn("Télécharger", async () => { download(new TextEncoder().encode(r.cue), r.name); for (const [k, f] of r.files.entries()) download(await recBlob(cdFileRec(r, k)), f.name); }); }
      else btn("Télécharger", async () => download(r.kind === "hdf" ? await recBlob(r) :''')
rep('''<button type="button" data-fire="8" class="vf2" aria-label="Deuxième bouton">2</button>''', '''<button type="button" data-fire="3" class="vf3" aria-label="Play (manette CD32)">▶</button><button type="button" data-fire="8" class="vf2" aria-label="Deuxième bouton">2</button>''')
rep(".tube > #vkbd{position:absolute;", """.vjoy-fire .vf3{display:none;width:min(12vmin,50px);background:rgba(90,90,90,.5);font-size:18px}
[data-cd32] .vjoy-fire .vf3{display:block}
.tube > #vkbd{position:absolute;""")
rep('''      <h3>Copier des fichiers sur le disque dur</h3>''', '''      <h3>CD32</h3>
      <p>Ouvrez l'image d'un CD de CD32 : un fichier <b>.iso</b>, ou un <b>.cue</b> choisi ou glissé <i>en même temps que ses pistes .bin</i> (CD audio compris). Le CD rejoint la Bibliothèque et sa vignette lance la console : 68EC020, AGA, 2 Mo, lecteur CD et manette CD32 à 7 boutons (une manette USB y correspond, avec ses gâchettes ; sur écran tactile, le bouton ▶ est Play). Importez d'abord les ROM de la console dans Réglages → Kickstart : le Kickstart CD32 40.060 et sa ROM d'extension, ou la ROM CD32 complète d'1 Mo ; elles ne remplacent pas le Kickstart de l'A1200.</p>
      <h3>Copier des fichiers sur le disque dur</h3>''')
rep("Les archives .lzx doivent être extraites avant.", "Images de CD de CD32 : .iso, ou .cue avec ses pistes .bin. Les archives .lzx doivent être extraites avant.")

# Cœur d'émulation : PUAE (WinUAE 5) ou WinUAE 6 (Amiberry)
rep('kbdOpen: false, compat: "normal",', 'kbdOpen: false, core: "winuae6", rtg: "0", midi: "off", midiOut: "", midiIn: "", compat: "normal",')
# WinUAE 6 devient le cœur par défaut : les réglages déjà enregistrés gardaient l'ancienne valeur par défaut (PUAE),
# on les bascule une fois ; un choix fait ensuite dans les Réglages est respecté
rep('function saveSettings() { try { localStorage.setItem("a1200.settings", JSON.stringify(S)); } catch (e) {} }',
    'function saveSettings() { try { localStorage.setItem("a1200.settings", JSON.stringify(S)); } catch (e) {} }\n'
    'if (S.coreV !== 2) { S.core = "winuae6"; S.coreV = 2; saveSettings(); }')
rep('''      <h3>Kickstart</h3>
      <p class="hint">Pour l'Amiga 1200 :</p>''', '''      <h3>Cœur d'émulation</h3>
      <div class="opt" data-setting="core">
        <label><input type="radio" name="core" value="winuae6"> WinUAE 6, par Amiberry (recommandé : le plus récent et le plus fidèle)</label>
        <label><input type="radio" name="core" value="puae"> PUAE, base WinUAE 5 (un peu plus léger, pour les appareils anciens)</label>
      </div>
      <p class="hint">WinUAE 6 demande un peu plus de calcul que PUAE (environ 1,4 fois sur l'A1200, autant sur l'A500 ; bien plus en compatibilité « Maximale », au cycle près). Si l'émulation ralentit sur votre appareil, essayez PUAE. Une sauvegarde d'état reprend toujours avec le cœur qui l'a faite.</p>

      <h3>Carte graphique RTG (WinUAE 6)</h3>
      <div class="opt" data-setting="rtg">
        <label><input type="radio" name="rtg" value="0"> Aucune</label>
        <label><input type="radio" name="rtg" value="16"> Carte UAE de 16 Mo (Workbench en haute résolution)</label>
      </div>
      <p class="hint">Pour l'Amiga 1200 avec le cœur WinUAE 6. Le Workbench doit avoir les pilotes RTG installés (Picasso96 ou P96, comme dans Amiga Forever) ; choisissez ensuite un mode « uaegfx » dans Prefs/ScreenMode. Sans carte accélératrice, le processeur passe en 68020 complet (32 bits), nécessaire à la carte.</p>

      <h3>Kickstart</h3>
      <p class="hint">Pour l'Amiga 1200 :</p>''')
lst = '["fast", "cpu", "region", "res", "joy", "floppy", "kbd", "compat", "accel", "model"]'
assert page.count(lst) == 2
page = page.replace(lst, '["fast", "cpu", "region", "res", "joy", "floppy", "kbd", "compat", "accel", "model", "core", "rtg"]')
rep('''      <h3>Copier des fichiers sur le disque dur</h3>''', '''      <h3>Deux cœurs d'émulation</h3>
      <p>Réglages → Cœur d'émulation : <b>WinUAE 6</b> (par défaut), compilé depuis le cœur libretro d'Amiberry, ou <b>PUAE</b> (base WinUAE 5, le cœur historique de cette page). WinUAE 6 est plus récent et plus fidèle, et à peine plus gourmand ; sur un téléphone ancien, PUAE garde un peu d'avance. Disquettes, disques durs, Kickstart, cartes accélératrices, WHDLoad, CD32 et sauvegardes d'état marchent avec les deux.</p>
      <h3>Workbench en haute résolution (RTG)</h3>
      <p>Avec WinUAE 6, Réglages → Carte graphique RTG ajoute la carte graphique virtuelle d'UAE (16 Mo sur le Zorro III) : des écrans de 640×480 à 1920×1080 en 16 millions de couleurs, bien plus rapides que les modes AGA. L'Amiga ne s'en sert que si son Workbench a les pilotes RTG : Picasso96 (gratuit, sur Aminet) ou P96 (inclus dans Amiga Forever) ; une fois installés, choisissez un mode « uaegfx » dans Prefs/ScreenMode. Les jeux, eux, gardent l'affichage AGA.</p>
      <h3>Copier des fichiers sur le disque dur</h3>''')

# MIDI par le navigateur (Web MIDI)
rep('''      <h3>Kickstart</h3>
      <p class="hint">Pour l'Amiga 1200 :</p>''', '''      <h3>MIDI (WinUAE 6)</h3>
      <div class="opt"><label><input type="checkbox" id="optMidi"> Interface MIDI sur le port série (Web MIDI)</label></div>
      <div class="opt midi-ports" id="midiPorts" hidden></div>
      <p class="hint">Les logiciels de musique de l'Amiga (Bars &amp; Pipes, Music-X, OctaMED…) jouent sur un synthétiseur ou un clavier branché à l'ordinateur, ou sur un logiciel MIDI ; un clavier peut aussi jouer sur l'Amiga. Le navigateur demande l'autorisation la première fois (Chrome, Edge, Opera, Firefox ; pas Safari). S'applique au prochain allumage.</p>

      <h3>Kickstart</h3>
      <p class="hint">Pour l'Amiga 1200 :</p>''')
rep(".footnote{margin-top:18px", ".midi-ports{flex-direction:column;align-items:flex-start;gap:6px}\n.midi-ports[hidden]{display:none}\n.midi-ports select{margin-left:6px;max-width:260px}\n.footnote{margin-top:18px")
rep("/* Profil par disque */", (APP / "midi-puae.js").read_text(encoding="utf-8") + "\n/* Profil par disque */")
rep('''      <h3>Copier des fichiers sur le disque dur</h3>''', '''      <h3>MIDI</h3>
      <p>Avec WinUAE 6, Réglages → MIDI branche une interface MIDI virtuelle sur le port série de l'Amiga : ce qu'il envoie à 31 250 bauds part vers un instrument ou un logiciel MIDI de l'ordinateur (Web MIDI), et un clavier MIDI peut jouer sur l'Amiga. Dans le logiciel de musique, choisissez simplement le port série (serial.device) comme sortie MIDI.</p>
      <h3>Copier des fichiers sur le disque dur</h3>''')

# Autres modèles (A600, A3000, A4000, CDTV) avec WinUAE 6
rep("/* Profil par disque */", (APP / "kickdb-puae.js").read_text(encoding="utf-8") + "\n" + (APP / "models-puae.js").read_text(encoding="utf-8") + "\n/* Profil par disque */")
rep('''      <h3>Copier des fichiers sur le disque dur</h3>''', '''      <h3>A600, A3000, A4000 et CDTV</h3>
      <p>Avec le cœur WinUAE 6, le choix du modèle (accueil ou Réglages) s'étend à l'<b>Amiga 600</b> (68000, ECS, IDE), à l'<b>Amiga 3000</b> (68030, ECS, 32 bits), à l'<b>Amiga 4000</b> (68030, AGA, 32 bits ; la carte accélératrice 68040/68060 et la carte RTG s'y ajoutent) et au <b>CDTV</b> (la console CD de 1991). Le Kickstart est pris tout seul dans la Bibliothèque : celui du modèle s'il y est (reconnu par son empreinte), sinon un voisin (3.1 de l'A4000 pour l'A3000…), sinon celui de l'A1200, sinon AROS. Le CDTV demande un Kickstart 1.3 et sa ROM d'extension de 256 Ko ; ses CD se lancent comme ceux de la CD32, d'une touche sur leur vignette.</p>
      <h3>Copier des fichiers sur le disque dur</h3>''')

rep('''      <h3>Copier des fichiers sur le disque dur</h3>''', '''      <h3>Configurations, chipset et commandes</h3>
      <p>Dans l'interface (F12) : <b>Configurations</b> enregistre tous les réglages sous un nom et les recharge d'un clic ; l'export .uae s'ouvre dans WinUAE ou Amiberry, et l'import lit leurs fichiers (disquettes, disques et Kickstart retrouvés dans la Bibliothèque par leur nom). <b>Chipset</b> choisit OCS, ECS ou AGA (WinUAE 6), le blitter et les collisions ; <b>Mémoire</b> la Chip et la Slow. <b>Entrées</b> change les touches du joystick au clavier et le rôle de chaque bouton de la manette (bouton, direction ou touche du clavier), pour tous les jeux ou pour le jeu en place seulement.</p>
      <h3>Copier des fichiers sur le disque dur</h3>''')

# Interface façon Amiberry 8 (en dernier : elle reprend les éléments mis en place par les autres modules)
import base64
_topaz = base64.b64encode((APP / "amiga-topaz.ttf").read_bytes()).decode()
rep("</style>", (APP / "amberry-gui-puae.css").read_text(encoding="utf-8").replace("__TOPAZ__", _topaz) + "</style>")
rep("/* Profil par disque */", (APP / "amberry-cfg-puae.js").read_text(encoding="utf-8") + "\n" + (APP / "amberry-gui-puae.js").read_text(encoding="utf-8") + "\n/* Profil par disque */")

leftovers = re.findall(r"\b(?:sae\.|SAER|SAEC_|SAEE_|SAEO_|SAEF_|cfg\.|inf\.|ZREG|liveData|getAros|AROS_ROM_GZ)\S*", page)
assert not leftovers, f"restes de SAE : {sorted(set(leftovers))[:10]}"

out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "index.html")
out.write_text(page, encoding="utf-8")
print(f"{out} : {len(page.encode()) // 1024} Ko")
