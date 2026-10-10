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
rep('compat: "normal", autoskip: true,', 'compat: "normal", accel: "none", floppySound: false, autoskip: true,')
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
    '$("#optFloppySound").onchange = e => { S.floppySound = e.target.checked; saveSettings(); if (running) machine.setOption("puae_floppy_sound", S.floppySound ? "75" : "100"); };')

# Souris : rappel des deux boutons dans l'aide
rep("Cliquez dans l'écran pour capturer la souris, <span class=\"kbd\">Échap</span> pour la libérer.</p>",
    "Cliquez dans l'écran pour capturer la souris, <span class=\"kbd\">Échap</span> pour la libérer. Une fois capturée, le bouton gauche sélectionne et le bouton droit (gardé enfoncé) ouvre la barre de menus, comme sur l'Amiga ; sur un pavé tactile, cliquez à deux doigts. Sans souris : <span class=\"kbd\">Page préc.</span> (Amiga gauche) + <span class=\"kbd\">Alt</span> gauche = bouton gauche, + <span class=\"kbd\">Alt Gr</span> = bouton droit.</p>")

leftovers = re.findall(r"\b(?:sae\.|SAER|SAEC_|SAEE_|SAEO_|SAEF_|cfg\.|inf\.|ZREG|liveData|getAros|AROS_ROM_GZ)\S*", page)
assert not leftovers, f"restes de SAE : {sorted(set(leftovers))[:10]}"

out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "index.html")
out.write_text(page, encoding="utf-8")
print(f"{out} : {len(page.encode()) // 1024} Ko")
