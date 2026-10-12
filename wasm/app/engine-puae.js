/* =========================================================
   Émulateur : cœur PUAE (WinUAE) en WebAssembly
   ========================================================= */
let machine = null;
let running = false, paused = false, starting = false;
const mounted = { df0: null, df1: null, dh0: null, dh1: null, dh2: null, dh3: null }; /* {id, name} des médias en place */
/* Disques durs : DH0: et DH1: sur le contrôleur IDE de l'A1200 (maître, esclave). Ni le Kickstart 3.1 ni AROS ne voient
   d'autres unités IDE : DH2: et DH3: passent par le pilote de disque d'UAE (uaehf.device), lisible par tout Kickstart */
const HD_TAGS = ["dh0", "dh1", "dh2", "dh3"];
const isHd = tag => /^dh/.test(tag);
/* Où chaque média vit dans le système de fichiers du cœur pendant la session */
const fsPath = { df0: null, df1: null, dh0: null, dh1: null, dh2: null, dh3: null };
const DRIVE_NUM = { df0: 0, df1: 1 };

/* Empreintes connues des Kickstart A1200 (CRC32 du fichier) */
const KNOWN_ROMS = {
  0x1483a091: "Kickstart 3.1 (40.068) A1200",
  0x6c9b07d2: "Kickstart 3.0 (39.106) A1200",
  0xc4f0f55f: "Kickstart 1.3 (34.005) A500",
  0xc3bdb240: "Kickstart 2.04 (37.175) A500+"
};
/* Version d'un Kickstart, lue dans son en-tête (octets 12 à 15) : [version, révision] ou null */
function kickVersion(u8) {
  if (!u8 || u8.length < 16 || u8[2] !== 0x4e || u8[3] !== 0xf9 || u8[0] !== 0x11) return null;
  return [(u8[12] << 8) | u8[13], (u8[14] << 8) | u8[15]];
}
const KICK_NAMES = { 33: "1.2", 34: "1.3", 36: "2.0", 37: "2.04", 39: "3.0", 40: "3.1", 45: "3.9", 46: "3.1.4", 47: "3.2" };

/* ---- Modèles : Amiga 1200, Amiga 500 (68000, OCS, 512 Ko de Chip + 512 Ko de Slow, Kickstart 1.3), et avec le cœur
        WinUAE 6 : A600 (ECS, IDE), A3000 et A4000 (68030, mémoire 32 bits), CDTV (console CD) ---- */
const MODELS = {
  a1200: { core: "A1200OG", qs: "A1200", name: "Amiga 1200" }, a500: { core: "A500", qs: "A500", name: "Amiga 500" },
  a600: { qs: "A600", name: "Amiga 600" }, a3000: { qs: "A3000", name: "Amiga 3000" }, a4000: { qs: "A4000", name: "Amiga 4000" },
  cdtv: { qs: "CDTV", name: "Amiga CDTV" }
};
const WINUAE_ONLY = new Set(["a600", "a3000", "a4000", "cdtv"]); /* préréglages de WinUAE 6 seulement */
const HAS_ACCEL = new Set(["a1200", "a3000", "a4000"]);          /* carte accélératrice et carte RTG possibles */
const modelOf = s => s && MODELS[s.model] && s.model !== "cdtv" ? s.model : "a1200";
/* Kickstart pour l'A500 : celui choisi, sinon un 1.x ou 2.0x de la Bibliothèque (le plus ancien d'abord) */
async function romFor500(all) {
  all = all || await DB.all();
  if (S.romId500 && S.romId500 !== "auto") { if (S.romId500 === "aros" || all.some(r => r.id === S.romId500)) return S.romId500; }
  const cands = [];
  for (const r of all.filter(x => x.kind === "rom")) {
    if (r.kickVer === undefined) {
      try { const u8 = new Uint8Array(await r.blob.slice(0, 16).arrayBuffer()); r.kickVer = kickVersion(u8); await DB.put(r); } catch (e) { r.kickVer = null; }
    }
    if (r.kickVer && r.kickVer[0] <= 37) cands.push(r);
  }
  cands.sort((a, b) => Math.abs(a.kickVer[0] - 34) - Math.abs(b.kickVer[0] - 34));
  return cands.length ? cands[0].id : "aros";
}

/* ---- Profils par disque : réglages propres à un jeu, appliqués au démarrage ---- */
const PROFILE_KEYS = ["compat", "cpu", "fast", "region", "joy", "floppy", "accel", "model"];
/* Cartes accélératrices : processeur, FPU et multiplicateur d'horloge (×4 = 14 MHz, ×8 = 28 MHz, ×12 = 42 MHz) */
const ACCEL = {
  none: { cpu: "68020", fpu: "0", mult: "0", label: "" },
  "030": { cpu: "68030", fpu: "68882", mult: "8", label: "68030/68882 28 MHz" },
  "040": { cpu: "68040", fpu: "cpu", mult: "8", label: "68040 28 MHz" },
  "060": { cpu: "68060", fpu: "cpu", mult: "12", label: "68060 42 MHz" }
};
let E = Object.assign({}, S); /* réglages effectifs de la session en cours */
async function bootProfileRec() {
  for (const t of ["df0", "dh0"]) {
    if (!mounted[t]) continue;
    const r = await DB.get(mounted[t].id);
    if (r && r.profile) return r;
  }
  return null;
}
async function effectiveSettings() {
  const e = Object.assign({}, S);
  const r = await bootProfileRec();
  if (r) { for (const k of PROFILE_KEYS) if (r.profile[k] !== undefined) e[k] = r.profile[k]; e._profile = r.name.replace(/\.(adf|dms|hdf)$/i, ""); }
  return e;
}

/* ---- Saut d'images : le cœur dessine une image sur deux quand l'ordinateur ne suit pas,
        pour garder le son et la vitesse de jeu à leur cadence réelle ---- */
const skip = {
  level: 1, low: 0, high: 0,
  reset() { this.level = 1; this.low = 0; this.high = 0; },
  set(l) {
    this.level = l; if (!machine) return;
    if (E.core === "winuae6") machine.M._amb_set_framerate(l > 1 ? 2 : 1);
    else machine.setOption("puae_gfx_framerate", l > 1 ? "2" : "disabled");
  },
  update(load) {
    if (!E.autoskip) { if (this.level !== 1) this.set(1); return; }
    if (load > 95) { this.high = 0; if (++this.low >= 2 && this.level < 2) { this.set(2); this.low = 0; } }
    else if (load < 60) { this.low = 0; if (++this.high >= 10 && this.level > 1) { this.set(1); this.high = 0; } }
    else { this.low = 0; this.high = 0; }
  }
};

function safeName(n) { return n.replace(/[\/\\:,]/g, "_"); }
async function fetchGz(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("fichier " + url + " introuvable (" + r.status + ")");
  return new Uint8Array(await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
}

/* Options du cœur d'après les réglages effectifs */
function coreOptions() {
  return {
    puae_model: MODELS[modelOf(E)].core,
    puae_fastmem_size: String(+E.fast || 0),
    puae_cpu_throttle: E.cpu === "max" ? "4000.0" : "0.0",
    puae_cpu_compatibility: E.compat === "max" ? "exact" : "normal",
    puae_video_standard: E.region === "ntsc" ? "NTSC" : "PAL",
    puae_video_resolution: S.res === "lores" ? "lores" : S.res === "shires" ? "superhires" : "hires",
    puae_crop: S.center ? "auto" : "disabled",
    puae_floppy_speed: E.floppy === "turbo" ? "0" : "100",
    puae_gfx_framerate: "disabled",
    /* L'A500 garde son 68000 : la carte accélératrice ne concerne que l'A1200 */
    puae_cpu_model: modelOf(E) === "a500" ? "auto" : (ACCEL[E.accel] || ACCEL.none).cpu,
    puae_fpu_model: modelOf(E) === "a500" ? "auto" : (ACCEL[E.accel] || ACCEL.none).fpu,
    puae_cpu_multiplier: modelOf(E) === "a500" ? "0" : (ACCEL[E.accel] || ACCEL.none).mult,
    puae_floppy_sound: S.floppySound ? "75" : "100",
    puae_floppy_sound_type: "internal"
  };
}

/* ---- Cœur d'émulation : PUAE (WinUAE 5) ou Amiberry (WinUAE 6), chargé à la demande ---- */
const CORE_NAMES = { puae: "PUAE (WinUAE 5)", winuae6: "WinUAE 6 (Amiberry)" };
function loadScript(src) {
  return new Promise((ok, ko) => {
    const el = document.createElement("script"); el.src = src;
    el.onload = ok; el.onerror = () => ko(new Error("fichier " + src + " introuvable"));
    document.head.appendChild(el);
  });
}
async function coreFactory(core) {
  if (core !== "winuae6") return window.createPuae;
  if (!window.createAmiberry) await loadScript("amiberry.js");
  return window.createAmiberry;
}
/* Clavier pour WinUAE 6 : mêmes touches que sous PUAE (Insert et Menu = Help, Page préc./suiv. et Ctrl droit =
   Amiga gauche/droite, Origine/Fin = parenthèses du pavé numérique), traduites vers celles qu'attend Amiberry
   (Page suiv. = Help, touches Windows = Amiga, F14/F15 = parenthèses) */
const AMB_KEYS = { Insert: 281, ContextMenu: 281, PageUp: 311, PageDown: 312, ControlRight: 312, Home: 295, End: 296 };
/* Bruits des lecteurs de disquettes d'Amiberry (WinUAE 6), téléchargés au premier allumage qui les demande */
const AMB_SOUNDS = ["drive_click", "drive_spin", "drive_spinnd", "drive_startup", "drive_snatch"];
let ambSounds = null;
async function ambFloppySounds(m) {
  if (!ambSounds) ambSounds = Promise.all(AMB_SOUNDS.map(async n => {
    const r = await fetch("sons/" + n + ".wav"); if (!r.ok) throw new Error("sons/" + n + ".wav introuvable");
    return [n, new Uint8Array(await r.arrayBuffer())];
  })).catch(e => { ambSounds = null; throw e; });
  for (const [n, u8] of await ambSounds) m.writeFile("/data/floppy_sounds/" + n + ".wav", u8);
}
/* Configuration complète au format WinUAE pour Amiberry : le fichier remplace toute la configuration du cœur */
function amberryLines(model, key, e = E) {
  const big = model === "A1200" || model === "A3000" || model === "A4000";
  const acc = !big ? ACCEL.none : ACCEL[e.accel] || ACCEL.none;
  const l = [`quickstart=${model},0`, "kickstart_rom_file=/sys/kickstart-utilisateur.rom"];
  if (key) l.push("kickstart_key_file=/sys/rom.key");
  if (+e.fast > 0) l.push("fastmem_size=" + (+e.fast));
  if (acc !== ACCEL.none) l.push("cpu_model=" + acc.cpu, "fpu_model=" + (acc.fpu === "cpu" ? acc.cpu : acc.fpu), "cpu_24bit_addressing=false", "cpu_multiplier=" + acc.mult);
  if (e.cpu === "max") l.push("cpu_speed=max", "cpu_cycle_exact=false", "cpu_memory_cycle_exact=false");
  /* Les préréglages de WinUAE sont au cycle près : « Rapide » revient à l'équivalent du mode normal de PUAE
     (sans prélecture ni cycle exact), plus de deux fois moins de calcul */
  if (e.compat === "max") l.push("cycle_exact=true");
  else l.push("cycle_exact=false", "cpu_compatible=false");
  l.push("ntsc=" + (e.region === "ntsc"));
  if (e.floppy === "turbo") l.push("floppy_speed=0");
  if (e.center) l.push("gfx_auto_crop=true");
  l.push("gfx_resolution=" + (e.res === "lores" ? "lores" : e.res === "shires" ? "superhires" : "hires"));
  if (e.floppySound && model !== "CD32" && model !== "CDTV") l.push("floppy0sound=1", "floppy1sound=1");
  if (e.midi === "on") l.push("amiberry.midiout_device_name=Libretro MIDI"); /* MIDI du port série vers la page (Web MIDI) */
  /* Carte graphique RTG d'UAE (uaegfx) sur le Zorro III : écrans haute résolution et 16 millions de couleurs.
     Il lui faut un processeur 32 bits (le 68EC020 de l'A1200 n'adresse que 16 Mo) */
  if (big && +e.rtg > 0) {
    l.push("gfxcard_type=ZorroIII", "gfxcard_size=" + (+e.rtg));
    if (acc === ACCEL.none && model === "A1200") l.push("cpu_model=68020", "cpu_24bit_addressing=false");
  }
  return l;
}

async function powerOn() {
  if (running || starting) return;
  /* Le cœur ne se rallume pas dans la même page : on recharge et on rallume aussitôt. */
  if (machine) {
    sessionStorage.setItem("a1200.autostart", "1");
    if (whdGame) sessionStorage.setItem("a1200.whd", whdGame.id);
    if (instJob) sessionStorage.setItem("a1200.inst", instJob.recId);
    if (cdGame) sessionStorage.setItem("a1200.cd", cdGame.id);
    if (pendingResume) sessionStorage.setItem("a1200.resume", pendingResume.id);
    location.reload(); return;
  }
  if (!window.crossOriginIsolated) { toast("La page doit être rechargée une fois pour activer l'émulateur (isolation du navigateur).", true); return; }
  starting = true; setPowerUi("starting");
  try {
    /* Reprise d'une sauvegarde : mêmes disques, même Kickstart, mêmes réglages qu'au moment de la sauvegarde */
    const resume = pendingResume; pendingResume = null;
    if (resume) {
      for (const t of ["df0", "df1", ...HD_TAGS]) setMounted(t, resume.ctx[t] ? await DB.get(resume.ctx[t]) : null);
      whdGame = resume.ctx.whd ? await DB.get(resume.ctx.whd) : null;
      cdGame = resume.ctx.cd ? await DB.get(resume.ctx.cd) : null;
      E = Object.assign({}, S, { accel: "none", model: "a1200", core: "puae", rtg: "0" }, CHIP_DEFAULTS, resume.settings, { _profile: "" });
    } else E = whdGame || cdGame || S.model === "cd32" ? Object.assign({}, S) : await effectiveSettings(); /* les profils de disques ne s'appliquent pas à un jeu WHDLoad */
    /* Jeu WHDLoad : sur l'A1200, avec de la mémoire Fast (8 Mo si les réglages n'en donnent pas) */
    const whd = whdGame;
    if (whd && !resume) {
      E.model = "a1200"; E.rtg = "0"; if (!+E.fast) E.fast = "8"; E._profile = "";
      if (whd.whdCfg) Object.assign(E, whd.whdCfg.e); /* réglages de la base WHDLoad pour ce jeu */
    }
    /* CD32 : la console telle qu'elle est (2 Mo de Chip, 68EC020), ses propres ROM ; CDTV : de même, avec le cœur WinUAE 6 */
    const cdConsole = !instJob && (S.model === "cd32" || S.model === "cdtv");
    /* Installation WHDLoad (RawDIC, Patcher) : un A1200 avec de la mémoire Fast, sur le cœur WinUAE 6 */
    if (instJob && !resume) Object.assign(E, { model: "a1200", rtg: "0", accel: "none", fast: +E.fast ? E.fast : "8", _profile: "" });
    const cd = cdGame || (!resume && !whdGame && cdConsole) ? cdGame || "sans CD" : null; /* console CD, avec ou sans CD */
    const cdtv = !!cd && (resume ? E.model === "cdtv" : S.model === "cdtv");
    if (cd && !resume) Object.assign(E, { model: cdtv ? "cdtv" : "a1200", fast: "0", accel: "none", rtg: "0", _profile: "" });
    const cdRoms = cd && !cdtv ? await cd32Roms() : null;
    if (cd && !cdtv && !cdRoms) throw new Error("ROM de la CD32 absentes de la Bibliothèque");
    const cdtvExt = cdtv ? await cdtvExtRom() : null;
    if (cdtv && !cdtvExt) throw new Error("ROM d'extension du CDTV absente de la Bibliothèque");
    const model = modelOf(E), a500 = model === "a500";
    /* Cœur : celui de la sauvegarde reprise, sinon celui des réglages */
    E.core = resume ? E.core || "puae" : S.core || "winuae6"; /* une sauvegarde sans cœur noté date de PUAE */
    if (instJob) E.core = "winuae6";
    if (whdGame && whdGame.whdArgs) E.core = "winuae6"; /* programme lancé par GenericKick : options de WHDLoad, sur WinUAE 6 */
    if ((WINUAE_ONLY.has(model) || cdtv) && E.core !== "winuae6") { E.core = "winuae6"; toast(MODELS[cdtv ? "cdtv" : model].name + " : allumé avec le cœur WinUAE 6 (PUAE ne l'émule pas)."); }
    const amb = E.core === "winuae6";
    const romId = cd ? (cdtv ? (resume ? resume.ctx.rom : await romForModel("cdtv")) : cdRoms.id) : resume ? resume.ctx.rom : a500 ? await romFor500() : WINUAE_ONLY.has(model) ? await romForModel(model) : S.romId;
    /* AROS ne tient pas dans le seul Mo de l'A600 : 4 Mo de Fast, comme une carte PCMCIA */
    if (model === "a600" && romId === "aros" && !+E.fast) { E.fast = "4"; toast("Amiga 600 avec AROS : 4 Mo de mémoire Fast ajoutés (AROS ne tient pas dans 1 Mo). Avec un vrai Kickstart 2.05 ou 3.1, l'A600 garde sa mémoire d'origine."); }
    if (cdtv && romId === "aros") throw new Error("le CDTV a besoin d'un vrai Kickstart (1.3 de préférence) dans la Bibliothèque");
    if (a500 && romId === "aros" && !resume) toast("Mode Amiga 500 sans Kickstart 1.3 : AROS démarre, mais la plupart des jeux A500 ont besoin du vrai Kickstart (Réglages).", true);
    skip.reset();
    machine = await PuaeMachine.create({
      canvas: $("#amigaScreen"), factory: await coreFactory(E.core),
      onLog: t => { if (/error|erreur|fail/i.test(t)) console.warn(t); },
      onStats: onStats, onFrame: onLeds
    });
    /* Kickstart : le vôtre, sinon AROS d'août 2026 (celui intégré à PUAE ne démarre pas avec un disque dur) */
    let kick = null, key = null, arosExt = null;
    if (romId !== "aros") {
      const r = await DB.get(romId);
      if (cd && !cdtv) kick = cdRoms.main;
      else if (r) kick = new Uint8Array(await r.blob.arrayBuffer());
      else if (resume) throw new Error("le Kickstart de cette sauvegarde n'est plus dans la Bibliothèque");
      else if (romId === S.romId) { S.romId = "aros"; saveSettings(); }
      if (kick && S.keyId) { const k = await DB.get(S.keyId); if (k) key = new Uint8Array(await k.blob.arrayBuffer()); }
    }
    if (!kick) [kick, arosExt] = await Promise.all([fetchGz("aros-rom.bin.gz"), fetchGz("aros-ext.bin.gz")]);
    /* Médias écrits dans le système de fichiers du cœur + configuration au format WinUAE */
    /* Pas de ROM de démarrage UAE : un vrai A1200 n'en a pas, et ses fils « pièges » passent par le fil principal
       de la page dans le navigateur — un blocage de la page (enregistrement d'un gros disque) faisait alors échouer
       les écritures IDE suivantes. */
    const lines = [...(amb ? amberryLines(cd ? (cdtv ? "CDTV" : "CD32") : MODELS[model].qs, key) : []), "nr_floppies=2", "floppy1type=0", "boot_rom_uae=disabled", "uaeboard=disabled"];
    /* Une extension mémoire A1200 (carte trappe) porte une horloge sauvegardée par pile */
    if (+E.fast > 0) lines.push("rtc=MSM6242B");
    /* Carte accélératrice sans MMU, comme une Blizzard vue par AmigaOS (qui ne s'en sert pas) : le cœur active la MMU
       dès le 68030, et son émulation passe par setjmp/longjmp, très coûteux en WebAssembly (68040 : 22 ms par image) */
    if (HAS_ACCEL.has(model) && E.accel && E.accel !== "none") lines.push("mmu_model=0");
    if (arosExt) { machine.writeFile("/sys/aros-ext.bin", arosExt); lines.push("kickstart_ext_rom_file=/sys/aros-ext.bin"); }
    for (const tag of ["df0", "df1"]) {
      fsPath[tag] = null;
      if (!mounted[tag] || whd || cd) continue;
      const r = await DB.get(mounted[tag].id);
      if (!r) { setMounted(tag, null); continue; }
      fsPath[tag] = "/media/" + tag + "/" + safeName(r.name);
      machine.writeFile(fsPath[tag], new Uint8Array(await r.blob.arrayBuffer()));
      lines.push(`floppy${DRIVE_NUM[tag]}=${fsPath[tag]}`);
    }
    const anyHd = HD_TAGS.some(t => mounted[t]);
    if (anyHd && cd) toast("Les disques durs ne sont pas branchés sur la " + (cdtv ? "console CDTV." : "CD32."));
    else if (anyHd && whd) toast("Les disques durs ne sont pas branchés pendant un jeu WHDLoad.");
    else if (anyHd && a500) toast("Mode Amiga 500 : les disques durs ne sont pas branchés (l'A500 n'a pas de contrôleur IDE).");
    const partNames = new Set();
    for (const [unit, tag] of HD_TAGS.entries()) {
      fsPath[tag] = null;
      if (!mounted[tag] || a500 || whd || cd) continue;
      const r = await DB.get(mounted[tag].id);
      if (!r) { setMounted(tag, null); continue; }
      fsPath[tag] = "/media/" + tag + "/" + safeName(r.name);
      const bytes = await recBytes(r);
      /* Deux disques avec une partition du même nom (DH0: souvent) : celle du second est renommée (le nouveau nom reste sur le disque si l'Amiga réécrit son début) */
      for (const x of uniquePartitionNames(bytes, partNames)) toast(r.name + " : partition " + x.from + ": montée comme " + x.to + ":");
      machine.writeFile(fsPath[tag], bytes);
      hdDirty[tag].clear(); machine.trackWrites(fsPath[tag], (pos, len) => hdWrite(tag, pos, len)); /* pour ne réenregistrer que les morceaux modifiés */
      /* DH0:, DH1: : disque IDE brut sur le contrôleur de la carte mère (Gayle de l'A600/A1200, IDE de l'A4000), géométrie
         lue sur le disque ; l'A3000 (contrôleur SCSI) passe par le pilote de disque d'UAE */
      if (unit < 2 && model !== "a3000") lines.push(`hardfile2=rw,${tag.toUpperCase()}:${fsPath[tag]},0,0,0,512,0,,ide${unit}_mainboard,0`);
      else lines.push(`hardfile2=rw,${tag.toUpperCase()}:${fsPath[tag]},0,0,0,512,0,,uae${model === "a3000" ? unit : unit - 2}`);
    }
    /* uaehf.device a besoin de la ROM de démarrage d'UAE : seulement si DH2: ou DH3: est branché (voir plus haut) */
    if (fsPath.dh2 || fsPath.dh3 || (model === "a3000" && HD_TAGS.some(t => fsPath[t]))) lines.splice(0, lines.length, ...lines.filter(l => !/^(boot_rom_uae|uaeboard)=/.test(l)));
    let content = "/cfg/a1200.uae", options = coreOptions();
    if (amb) options = { amiberry_crop_overscan: S.center ? "enabled" : "disabled", amiberry_statusline: "disabled", amiberry_midi_output: S.midi === "on" ? "libretro" : "disabled",
      amiberry_joyport_order: "21" }; /* manette 0 au port joystick, manette 1 au port souris quand il reçoit un joystick (2 joueurs) */
    /* Chipset, blitter, collisions, mémoire Chip et Slow (panneau Chipset) : pas pour WHDLoad ni les consoles CD */
    if (!cd && !whd) { if (amb) lines.push(...chipLines(E)); else Object.assign(options, chipOpts(E)); }
    if (cd) {
      /* Modèle CD32 du cœur ; l'extension est cherchée sous le nom kick40060.CD32.ext (inutile avec la ROM complète) */
      if (cdtv) { machine.writeFile("/sys/cdtv.ext", cdtvExt); lines.push("kickstart_ext_rom_file=/sys/cdtv.ext"); }
      else if (cdRoms.ext) { machine.writeFile("/sys/kick40060.CD32.ext", cdRoms.ext); if (amb) lines.push("kickstart_ext_rom_file=/sys/kick40060.CD32.ext"); }
      lines.splice(0, lines.length, ...lines.filter(l => !/^(nr_floppies|floppy1type)=/.test(l))); /* pas de lecteur de disquettes */
      if (cdGame) lines.push(`cdimage0=${await writeCd(machine, cdGame)},${amb ? "image" : ""}`);
      options.puae_model = "CD32"; options.puae_fastmem_size = "0";
      E._cd = cdtv ? "cdtv" : "cd32";
    }
    if (instJob && amb) {
      await instBootAmb(machine, lines);
      machine.writeFile(content, new TextEncoder().encode(lines.join("\n") + "\n"));
    } else if (whd && amb) {
      /* WinUAE 6 : la page monte elle-même les volumes et écrit la startup-sequence */
      const r = await DB.get(whd.id);
      if (!r) throw new Error("ce jeu n'est plus dans la Bibliothèque");
      const kicks = await whdPrepare(machine);
      if (!kicks.length && S.romId !== "aros") toast("Aucun Kickstart reconnu par WHDLoad dans la Bibliothèque : les jeux qui en demandent un (kick34005.A500, kick40068.A1200) s'arrêteront.", true);
      await whdBootAmb(machine, r, kicks, lines);
      if (whd.whdCfg && whd.whdCfg.opts && whd.whdCfg.opts.puae_immediate_blits) lines.push("immediate_blits=true"); /* base WHDLoad : BLITTER */
      E._whd = safeName(r.name.replace(/\.(lha|lzh)$/i, ""));
      machine.writeFile(content, new TextEncoder().encode(lines.join("\n") + "\n"));
    } else if (whd) {
      /* Le cœur reçoit l'archive elle-même : il la monte en DH0: et démarre sur son volume WHDLoad:. Nos lignes
         de configuration passent par le fichier .uae propre au contenu, lu après les siennes. Il faut la ROM de
         démarrage UAE (volumes de fichiers) : pas de disque IDE ici, donc pas d'écritures IDE à protéger. */
      const r = await DB.get(whd.id);
      if (!r) throw new Error("ce jeu n'est plus dans la Bibliothèque");
      const base = safeName(r.name.replace(/\.(lha|lzh)$/i, "")).replace(/["]/g, "_") || "Jeu";
      content = "/media/whd/" + base + ".lha";
      machine.writeFile(content, new Uint8Array(await r.blob.arrayBuffer()));
      machine.writeFile("/save/" + base + ".uae", new TextEncoder().encode(lines.filter(l => !/^(boot_rom_uae|uaeboard|nr_floppies|floppy1type)=/.test(l)).join("\n") + "\n"));
      const kicks = await whdPrepare(machine);
      if (!kicks.length && S.romId !== "aros") toast("Aucun Kickstart reconnu par WHDLoad dans la Bibliothèque : les jeux qui en demandent un (kick34005.A500, kick40068.A1200) s'arrêteront.", true);
      Object.assign(options, { puae_use_whdload: "files", puae_use_whdload_nowritecache: "enabled", puae_use_whdload_prefs: "disabled" }, whd.whdCfg ? whd.whdCfg.opts : {});
      E._whd = base;
    } else machine.writeFile(content, new TextEncoder().encode(lines.join("\n") + "\n"));
    for (const t in fsPath) seen[t] = fsPath[t] ? machine.fileMtime(fsPath[t]) : 0;

    if (amb) {
      machine.keyRemap = AMB_KEYS;
      await midiAttach(machine);
      if (S.floppySound && !cd) await ambFloppySounds(machine).catch(e => console.warn("bruits des lecteurs indisponibles", e));
    }
    await machine.start({ model: cd ? "CD32" : MODELS[model].core || "A1200OG", kickstart: kick, romKey: cd && !cdtv ? null : key, content, options });
    machine.setMuted(!!S.muted);
    /* Jeu WHDLoad prévu pour la manette CD32 (7 boutons) : la manette du port joystick en devient une */
    if ((whd && whd.whdCfg && whd.whdCfg.cd32) || (cd && !cdtv)) {
      if (amb) machine.M._retro_set_controller_port_device(1, AMB_CD32PAD); else machine.M._retro_set_controller_port_device(0, CD32PAD);
    }
    if (cd && !cdtv) document.documentElement.dataset.cd32 = "1";
    if (whd && whd.whdCfg && whd.whdCfg.mouse && isTouch) toast("Ce jeu se joue à la souris : un doigt la déplace, une touche clique.");
    machine.inputBlocked = false;
    E._rom = romId;
    onStarted();
    if (resume) await applyState(resume, true);
  } catch (e) {
    console.error(e); starting = false; setPowerUi("off");
    toast("Démarrage impossible : " + (e && e.message ? e.message : e), true);
  }
}
async function powerOff() {
  if (!running) return;
  if (S.autosave) await saveAllDisks(true);
  machine.stop();
  onStopped();
}
function onStarted() {
  starting = false; running = true; setPowerUi("on");
  $("#statMode").textContent = (E._cd ? (E._cd === "cdtv" ? "CDTV, " : "CD32, ") : modelOf(E) !== "a1200" ? MODELS[modelOf(E)].qs + ", " : "") + (E.region === "ntsc" ? "NTSC" : "PAL") + (+E.fast ? " +" + E.fast + " Mo" : "")
    + (HAS_ACCEL.has(modelOf(E)) && !E._cd && ACCEL[E.accel] && ACCEL[E.accel].label ? ", " + ACCEL[E.accel].label : "")
    + (E.core === "winuae6" ? ", WinUAE 6" + (+E.rtg > 0 && HAS_ACCEL.has(modelOf(E)) && !E._cd && !E._whd ? ", RTG " + E.rtg + " Mo" : "") : "") + (E.compat === "max" ? ", cycle exact" : "") + (E._profile ? ", profil " + E._profile : "") + (E._whd ? ", WHDLoad" + (whdGame && whdGame.whdCfg ? " (réglages de la base)" : "") : "");
  showCaptureHint();
}
function onStopped() {
  running = false; starting = false; setPaused(false); setPowerUi("off");
  ["#ledDf", "#ledHd"].forEach(s => $(s).classList.remove("on"));
  $("#ledPower").classList.remove("on", "dim");
  $("#statFps").textContent = "—"; $("#statCpu").textContent = ""; $("#statMode").textContent = "";
  for (const t in dirty) { dirty[t] = false; refreshDriveLabel(t); }
  releaseMods();
}
function onStats(s) {
  skip.update(s.load);
  $("#statFps").textContent = paused ? "en pause" : s.fps.toFixed(1) + " ips" + (skip.level > 1 ? " (1 image sur 2)" : "");
  $("#statCpu").textContent = paused ? "" : "charge " + Math.round(s.load) + " %";
}
function onLeds(l) {
  const p = $("#ledPower"); p.classList.toggle("on", !!l.power); p.classList.toggle("dim", !l.power && running);
  $("#ledDf").classList.toggle("on", !!(l.df0 || l.df1));
  $("#ledHd").classList.toggle("on", !!l.hd);
  for (const [tag, on] of [["df0", l.df0], ["df1", l.df1], ...HD_TAGS.filter(t => fsPath[t]).map(t => [t, l.hd])]) {
    const el = $("#trk-" + tag);
    if (on) { el.textContent = "lecture ou écriture…"; lastActivity[tag] = Date.now(); }
    else if (el.textContent === "lecture ou écriture…") el.textContent = driveLabel(tag);
  }
}
function setPaused(p) {
  paused = p; const b = $("#btnPause");
  b.setAttribute("aria-pressed", p ? "true" : "false"); b.querySelector("span").textContent = p ? "Reprendre" : "Pause";
}
function setPowerUi(st) {
  const b = $("#btnPower"), on = st === "on";
  b.querySelector("span").textContent = st === "starting" ? "Démarrage…" : on ? "Éteindre" : "Allumer";
  b.disabled = st === "starting";
  b.classList.toggle("primary", !on);
  ["#btnReset", "#btnPause", "#btnShot", "#kCAA"].forEach(s => $(s).disabled = !on);
  $("#idle").style.display = on || st === "starting" ? "none" : "flex";
  document.body.classList.toggle("is-off", st === "off");
  $("#tube").classList.toggle("off", !on && st !== "starting");
  if (st === "off" && typeof renderLauncherSoon === "function") renderLauncherSoon();
  $("#monLed").classList.toggle("on", on);
}

/* Accès de diagnostic depuis la console du navigateur : __a1200.machine, __a1200.fsPath… */
window.__a1200 = {
  get machine() { return machine; }, get running() { return running; },
  fsPath, mounted, DB, get dirty() { return dirty; }, get settings() { return E; },
  recBlob: r => recBlob(r), download: (d, n) => download(d, n), get hdDirty() { return Object.fromEntries(HD_TAGS.map(t => [t, [...hdDirty[t]]])); }
};
