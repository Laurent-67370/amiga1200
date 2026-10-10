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

/* ---- Modèle : Amiga 1200 ou Amiga 500 (68000, OCS, 512 Ko de Chip + 512 Ko de Slow, Kickstart 1.3) ---- */
const MODELS = { a1200: { core: "A1200OG", name: "Amiga 1200" }, a500: { core: "A500", name: "Amiga 500" } };
const modelOf = s => s && s.model === "a500" ? "a500" : "a1200";
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
  set(l) { this.level = l; if (machine) machine.setOption("puae_gfx_framerate", l > 1 ? "2" : "disabled"); },
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

async function powerOn() {
  if (running || starting) return;
  /* Le cœur ne se rallume pas dans la même page : on recharge et on rallume aussitôt. */
  if (machine) {
    sessionStorage.setItem("a1200.autostart", "1");
    if (whdGame) sessionStorage.setItem("a1200.whd", whdGame.id);
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
      E = Object.assign({}, S, { accel: "none", model: "a1200" }, resume.settings, { _profile: "" });
    } else E = whdGame ? Object.assign({}, S) : await effectiveSettings(); /* les profils de disques ne s'appliquent pas à un jeu WHDLoad */
    /* Jeu WHDLoad : sur l'A1200, avec de la mémoire Fast (8 Mo si les réglages n'en donnent pas) */
    const whd = whdGame;
    if (whd && !resume) { E.model = "a1200"; if (!+E.fast) E.fast = "8"; E._profile = ""; }
    const a500 = modelOf(E) === "a500";
    const romId = resume ? resume.ctx.rom : a500 ? await romFor500() : S.romId;
    if (a500 && romId === "aros" && !resume) toast("Mode Amiga 500 sans Kickstart 1.3 : AROS démarre, mais la plupart des jeux A500 ont besoin du vrai Kickstart (Réglages).", true);
    skip.reset();
    machine = await PuaeMachine.create({
      canvas: $("#amigaScreen"), factory: window.createPuae,
      onLog: t => { if (/error|erreur|fail/i.test(t)) console.warn(t); },
      onStats: onStats, onFrame: onLeds
    });
    /* Kickstart : le vôtre, sinon AROS d'août 2026 (celui intégré à PUAE ne démarre pas avec un disque dur) */
    let kick = null, key = null, arosExt = null;
    if (romId !== "aros") {
      const r = await DB.get(romId);
      if (r) kick = new Uint8Array(await r.blob.arrayBuffer());
      else if (resume) throw new Error("le Kickstart de cette sauvegarde n'est plus dans la Bibliothèque");
      else if (!a500) { S.romId = "aros"; saveSettings(); }
      if (kick && S.keyId) { const k = await DB.get(S.keyId); if (k) key = new Uint8Array(await k.blob.arrayBuffer()); }
    }
    if (!kick) [kick, arosExt] = await Promise.all([fetchGz("aros-rom.bin.gz"), fetchGz("aros-ext.bin.gz")]);
    /* Médias écrits dans le système de fichiers du cœur + configuration au format WinUAE */
    /* Pas de ROM de démarrage UAE : un vrai A1200 n'en a pas, et ses fils « pièges » passent par le fil principal
       de la page dans le navigateur — un blocage de la page (enregistrement d'un gros disque) faisait alors échouer
       les écritures IDE suivantes. */
    const lines = ["nr_floppies=2", "floppy1type=0", "boot_rom_uae=disabled", "uaeboard=disabled"];
    /* Une extension mémoire A1200 (carte trappe) porte une horloge sauvegardée par pile */
    if (+E.fast > 0) lines.push("rtc=MSM6242B");
    if (arosExt) { machine.writeFile("/sys/aros-ext.bin", arosExt); lines.push("kickstart_ext_rom_file=/sys/aros-ext.bin"); }
    for (const tag of ["df0", "df1"]) {
      fsPath[tag] = null;
      if (!mounted[tag] || whd) continue;
      const r = await DB.get(mounted[tag].id);
      if (!r) { setMounted(tag, null); continue; }
      fsPath[tag] = "/media/" + tag + "/" + safeName(r.name);
      machine.writeFile(fsPath[tag], new Uint8Array(await r.blob.arrayBuffer()));
      lines.push(`floppy${DRIVE_NUM[tag]}=${fsPath[tag]}`);
    }
    const anyHd = HD_TAGS.some(t => mounted[t]);
    if (anyHd && whd) toast("Les disques durs ne sont pas branchés pendant un jeu WHDLoad.");
    else if (anyHd && a500) toast("Mode Amiga 500 : les disques durs ne sont pas branchés (l'A500 n'a pas de contrôleur IDE).");
    const partNames = new Set();
    for (const [unit, tag] of HD_TAGS.entries()) {
      fsPath[tag] = null;
      if (!mounted[tag] || a500 || whd) continue;
      const r = await DB.get(mounted[tag].id);
      if (!r) { setMounted(tag, null); continue; }
      fsPath[tag] = "/media/" + tag + "/" + safeName(r.name);
      const bytes = await recBytes(r);
      /* Deux disques avec une partition du même nom (DH0: souvent) : celle du second est renommée (le nouveau nom reste sur le disque si l'Amiga réécrit son début) */
      for (const x of uniquePartitionNames(bytes, partNames)) toast(r.name + " : partition " + x.from + ": montée comme " + x.to + ":");
      machine.writeFile(fsPath[tag], bytes);
      hdDirty[tag].clear(); machine.trackWrites(fsPath[tag], (pos, len) => hdWrite(tag, pos, len)); /* pour ne réenregistrer que les morceaux modifiés */
      /* DH0:, DH1: : disque IDE brut sur le contrôleur Gayle, géométrie lue sur le disque, comme un vrai A1200 */
      if (unit < 2) lines.push(`hardfile2=rw,${tag.toUpperCase()}:${fsPath[tag]},0,0,0,512,0,,ide${unit}_mainboard,0`);
      else lines.push(`hardfile2=rw,${tag.toUpperCase()}:${fsPath[tag]},0,0,0,512,0,,uae${unit - 2}`);
    }
    /* uaehf.device a besoin de la ROM de démarrage d'UAE : seulement si DH2: ou DH3: est branché (voir plus haut) */
    if (fsPath.dh2 || fsPath.dh3) lines.splice(0, lines.length, ...lines.filter(l => !/^(boot_rom_uae|uaeboard)=/.test(l)));
    let content = "/cfg/a1200.uae", options = coreOptions();
    if (whd) {
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
      Object.assign(options, { puae_use_whdload: "files", puae_use_whdload_nowritecache: "enabled", puae_use_whdload_prefs: "disabled" });
      E._whd = base;
    } else machine.writeFile(content, new TextEncoder().encode(lines.join("\n") + "\n"));
    for (const t in fsPath) seen[t] = fsPath[t] ? machine.fileMtime(fsPath[t]) : 0;

    await machine.start({ model: MODELS[modelOf(E)].core, kickstart: kick, romKey: key, content, options });
    machine.setMuted(!!S.muted);
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
  $("#statMode").textContent = (modelOf(E) === "a500" ? "A500, " : "") + (E.region === "ntsc" ? "NTSC" : "PAL") + (+E.fast ? " +" + E.fast + " Mo" : "")
    + (modelOf(E) !== "a500" && ACCEL[E.accel] && ACCEL[E.accel].label ? ", " + ACCEL[E.accel].label : "")
    + (E.compat === "max" ? ", cycle exact" : "") + (E._profile ? ", profil " + E._profile : "") + (E._whd ? ", WHDLoad" : "");
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
