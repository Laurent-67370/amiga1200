/* =========================================================
   Émulateur : cœur PUAE (WinUAE) en WebAssembly
   ========================================================= */
let machine = null;
let running = false, paused = false, starting = false;
const mounted = { df0: null, df1: null, dh0: null }; /* {id, name} des médias en place */
/* Où chaque média vit dans le système de fichiers du cœur pendant la session */
const fsPath = { df0: null, df1: null, dh0: null };
const DRIVE_NUM = { df0: 0, df1: 1 };

/* Empreintes connues des Kickstart A1200 (CRC32 du fichier) */
const KNOWN_ROMS = {
  0x1483a091: "Kickstart 3.1 (40.068) A1200",
  0x6c9b07d2: "Kickstart 3.0 (39.106) A1200"
};

/* ---- Profils par disque : réglages propres à un jeu, appliqués au démarrage ---- */
const PROFILE_KEYS = ["compat", "cpu", "fast", "region", "joy", "floppy"];
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

/* Options du cœur d'après les réglages effectifs */
function coreOptions() {
  return {
    puae_model: "A1200OG",
    puae_fastmem_size: String(+E.fast || 0),
    puae_cpu_throttle: E.cpu === "max" ? "4000.0" : "0.0",
    puae_cpu_compatibility: E.compat === "max" ? "exact" : "normal",
    puae_video_standard: E.region === "ntsc" ? "NTSC" : "PAL",
    puae_video_resolution: S.res === "lores" ? "lores" : S.res === "shires" ? "superhires" : "hires",
    puae_crop: S.center ? "auto" : "disabled",
    puae_floppy_speed: E.floppy === "turbo" ? "0" : "100",
    puae_gfx_framerate: "disabled"
  };
}

async function powerOn() {
  if (running || starting) return;
  /* Le cœur ne se rallume pas dans la même page : on recharge et on rallume aussitôt. */
  if (machine) { sessionStorage.setItem("a1200.autostart", "1"); location.reload(); return; }
  if (!window.crossOriginIsolated) { toast("La page doit être rechargée une fois pour activer l'émulateur (isolation du navigateur).", true); return; }
  starting = true; setPowerUi("starting");
  try {
    E = await effectiveSettings();
    skip.reset();
    machine = await PuaeMachine.create({
      canvas: $("#amigaScreen"), factory: window.createPuae,
      onLog: t => { if (/error|erreur|fail/i.test(t)) console.warn(t); },
      onStats: onStats, onFrame: onLeds
    });
    /* Kickstart */
    let kick = null, key = null;
    if (S.romId !== "aros") {
      const r = await DB.get(S.romId);
      if (r) kick = new Uint8Array(await r.blob.arrayBuffer()); else { S.romId = "aros"; saveSettings(); }
      if (kick && S.keyId) { const k = await DB.get(S.keyId); if (k) key = new Uint8Array(await k.blob.arrayBuffer()); }
    }
    /* Médias écrits dans le système de fichiers du cœur + configuration au format WinUAE */
    const lines = ["nr_floppies=2", "floppy1type=0"];
    for (const tag of ["df0", "df1"]) {
      fsPath[tag] = null;
      if (!mounted[tag]) continue;
      const r = await DB.get(mounted[tag].id);
      if (!r) { setMounted(tag, null); continue; }
      fsPath[tag] = "/media/" + tag + "/" + safeName(r.name);
      machine.writeFile(fsPath[tag], new Uint8Array(await r.blob.arrayBuffer()));
      lines.push(`floppy${DRIVE_NUM[tag]}=${fsPath[tag]}`);
    }
    fsPath.dh0 = null;
    if (mounted.dh0) {
      const r = await DB.get(mounted.dh0.id);
      if (r) {
        fsPath.dh0 = "/media/dh0/" + safeName(r.name);
        machine.writeFile(fsPath.dh0, new Uint8Array(await r.blob.arrayBuffer()));
        /* Disque IDE brut sur le contrôleur Gayle : géométrie lue sur le disque, comme un vrai A1200 */
        lines.push(`hardfile2=rw,DH0:${fsPath.dh0},0,0,0,512,0,,ide0_mainboard,0`);
      } else setMounted("dh0", null);
    }
    machine.writeFile("/cfg/a1200.uae", new TextEncoder().encode(lines.join("\n") + "\n"));
    for (const t in fsPath) seen[t] = fsPath[t] ? machine.fileMtime(fsPath[t]) : 0;

    await machine.start({ model: "A1200OG", kickstart: kick, romKey: key, content: "/cfg/a1200.uae", options: coreOptions() });
    machine.setMuted(!!S.muted);
    machine.inputBlocked = false;
    onStarted();
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
  $("#statMode").textContent = (E.region === "ntsc" ? "NTSC" : "PAL") + (+E.fast ? " +" + E.fast + " Mo" : "")
    + (E.compat === "max" ? ", cycle exact" : "") + (E._profile ? ", profil " + E._profile : "");
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
  for (const [tag, on] of [["df0", l.df0], ["df1", l.df1], ["dh0", l.hd]]) {
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
  $("#monLed").classList.toggle("on", on);
}

/* Accès de diagnostic depuis la console du navigateur : __a1200.machine, __a1200.fsPath… */
window.__a1200 = {
  get machine() { return machine; }, get running() { return running; },
  fsPath, mounted, DB, get dirty() { return dirty; }, get settings() { return E; }
};
