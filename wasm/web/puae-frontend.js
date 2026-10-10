/* Frontal navigateur du cœur PUAE (WebAssembly).
 *
 * Fait le lien entre le module Emscripten (fonctions fe_* de wasm/frontend.c) et la page :
 * image dans un canvas, son par AudioWorklet, clavier et souris, fichiers, disquettes, LED,
 * sauvegardes d'état. Aucune interface ici : la page décide de l'apparence. */

/* KeyboardEvent.code → touche libretro (RETROK_*), à la position du clavier.
   PUAE traduit ensuite RETROK → touche Amiga : Insert = Help, Page préc./suiv. = Amiga gauche/droite,
   Origine/Fin = parenthèses du pavé numérique, Ctrl droit = Amiga droite. */
const RETROK = {
  Backspace: 8, Tab: 9, Enter: 13, Escape: 27, Space: 32, Quote: 39, Comma: 44, Minus: 45, Period: 46, Slash: 47,
  Digit0: 48, Digit1: 49, Digit2: 50, Digit3: 51, Digit4: 52, Digit5: 53, Digit6: 54, Digit7: 55, Digit8: 56, Digit9: 57,
  Semicolon: 59, Equal: 61, BracketLeft: 91, Backslash: 92, BracketRight: 93, Backquote: 96, IntlBackslash: 60,
  KeyA: 97, KeyB: 98, KeyC: 99, KeyD: 100, KeyE: 101, KeyF: 102, KeyG: 103, KeyH: 104, KeyI: 105, KeyJ: 106,
  KeyK: 107, KeyL: 108, KeyM: 109, KeyN: 110, KeyO: 111, KeyP: 112, KeyQ: 113, KeyR: 114, KeyS: 115, KeyT: 116,
  KeyU: 117, KeyV: 118, KeyW: 119, KeyX: 120, KeyY: 121, KeyZ: 122, Delete: 127,
  Numpad0: 256, Numpad1: 257, Numpad2: 258, Numpad3: 259, Numpad4: 260, Numpad5: 261, Numpad6: 262, Numpad7: 263,
  Numpad8: 264, Numpad9: 265, NumpadDecimal: 266, NumpadDivide: 267, NumpadMultiply: 268, NumpadSubtract: 269,
  NumpadAdd: 270, NumpadEnter: 271,
  ArrowUp: 273, ArrowDown: 274, ArrowRight: 275, ArrowLeft: 276, Insert: 277, Home: 278, End: 279,
  PageUp: 280, PageDown: 281, F1: 282, F2: 283, F3: 284, F4: 285, F5: 286, F6: 287, F7: 288, F8: 289, F9: 290, F10: 291,
  CapsLock: 301, ShiftRight: 303, ShiftLeft: 304, ControlRight: 305, ControlLeft: 306, AltRight: 307, AltLeft: 308,
  MetaRight: 312, MetaLeft: 311, OSRight: 312, OSLeft: 311, ContextMenu: 315
};
export const RETROK_CODES = RETROK;

/* LED annoncées par PUAE */
export const LED = { POWER: 0, FLOPPY: 1, HD: 2, DF0: 3, DF1: 4, HDONLY: 7 };

const WORKLET = `
class Ring extends AudioWorkletProcessor {
  constructor() { super(); this.q = []; this.off = 0; this.port.onmessage = e => { this.q.push(e.data); if (this.q.length > 24) this.q.splice(0, this.q.length - 12); }; }
  process(_, outputs) {
    const L = outputs[0][0], R = outputs[0][1] || outputs[0][0];
    for (let i = 0; i < L.length; i++) {
      if (!this.q.length) { L[i] = 0; R[i] = 0; continue; }
      const b = this.q[0];
      L[i] = b[this.off]; R[i] = b[this.off + 1]; this.off += 2;
      if (this.off >= b.length) { this.q.shift(); this.off = 0; }
    }
    return true;
  }
}
registerProcessor('ring', Ring);`;

export class PuaeMachine {
  /** @param {object} opts { canvas, factory: createPuae, onLog?, onStats? } */
  static async create({ canvas, factory, onLog, onStats, onFrame }) {
    const M = await factory({
      print: t => onLog && onLog(t),
      printErr: t => onLog && onLog(t),
    });
    const m = new PuaeMachine(M, canvas, onStats);
    m.onFrame = onFrame || null;
    return m;
  }

  constructor(M, canvas, onStats) {
    this.M = M; this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.onStats = onStats || (() => {});
    this.running = false; this.paused = false; this.muted = false;
    this.mouseButtons = 0; this.joyMask = [0, 0];
    this._audioBuf = null; this._audioPtr = 0;
    M.FS.mkdirTree("/sys"); M.FS.mkdirTree("/save"); M.FS.mkdirTree("/disks");
    this._call("fe_set_dirs", "/sys", "/save");
  }

  /* ---------- outils mémoire ---------- */
  _str(s) { return this.M.stringToNewUTF8(s); }
  _call(name, ...args) {
    const ptrs = [];
    const a = args.map(v => { if (typeof v === "string") { const p = this._str(v); ptrs.push(p); return p; } return v; });
    const r = this.M["_" + name](...a);
    ptrs.forEach(p => this.M._free(p));
    return r;
  }

  setOption(key, value) { (this.options || (this.options = {}))[key] = String(value); this._call("fe_set_option", key, String(value)); }
  writeFile(path, bytes) {
    const dir = path.slice(0, path.lastIndexOf("/"));
    if (dir) this.M.FS.mkdirTree(dir);
    /* Le système de fichiers garde le tableau tel quel (pas de copie) : utile pour un disque dur de 2 Go */
    this.M.FS.writeFile(path, bytes, { canOwn: true });
  }
  readFile(path) { this.M._fe_flush(); return this.M.FS.readFile(path); }
  /** Copie d'une partie d'un fichier du cœur (après avoir vidé ses tampons d'écriture) */
  readRange(path, off, len) {
    const node = this.M.FS.lookupPath(path).node;
    const end = Math.min(off + len, node.usedBytes);
    return node.contents.slice(off, end);
  }
  /** Appelle onWrite(position, longueur) à chaque écriture du cœur dans ce fichier (à poser avant start) */
  trackWrites(path, onWrite) {
    const node = this.M.FS.lookupPath(path).node, ops = node.stream_ops;
    node.stream_ops = Object.assign({}, ops, {
      write(stream, buffer, offset, length, position, canOwn) { onWrite(position, length); return ops.write(stream, buffer, offset, length, position, canOwn); }
    });
  }

  /* ---------- démarrage ---------- */
  /** @param {object} cfg { model, kickstart: Uint8Array|null, romKey: Uint8Array|null, df0: {name, bytes}|null,
   *                        compat: "normal"|"exact", region: "PAL"|"NTSC" } */
  async start(cfg = {}) {
    const M = this.M;
    this.setOption("puae_model", cfg.model || "A1200OG");
    if (cfg.kickstart) {
      this.writeFile("/sys/kickstart-utilisateur.rom", cfg.kickstart);
      if (cfg.romKey) this.writeFile("/sys/rom.key", cfg.romKey);
      this.setOption("puae_kickstart", "kickstart-utilisateur.rom");
    } else this.setOption("puae_kickstart", "aros");
    this.setOption("puae_cpu_compatibility", cfg.compat || "normal");
    this.setOption("puae_video_standard", cfg.region || "PAL");
    this.setOption("puae_video_resolution", "hires");
    this.setOption("puae_gfx_colors", "24bit");
    this.setOption("puae_crop", "auto");
    this.setOption("puae_floppy_sound", cfg.floppySound ? "75" : "100");
    this.setOption("puae_physicalmouse", "enabled");
    this.setOption("puae_floppy_speed", "100");
    for (const [k, v] of Object.entries(cfg.options || {})) this.setOption(k, v);
    let path = cfg.content || "";
    if (!path && cfg.df0) { path = "/disks/" + cfg.df0.name.replace(/[\/\\]/g, "_"); this.writeFile(path, cfg.df0.bytes); }
    const ok = this._call("fe_start", path);
    if (!ok) throw new Error("le cœur a refusé de démarrer (Kickstart ou disquette illisible ?)");
    this.fps = M._fe_fps() || 50;
    this.rate = M._fe_sample_rate() || 44100;
    await this._startAudio();
    this.running = true;
    this._t = performance.now(); this._acc = 0; this._frames = 0; this._statT = this._t;
    this._attachInput();
    /* L'émulation suit l'horloge réelle, au rythme exact de l'Amiga. Pour la latence, les images dues sont calculées
       au moment où l'écran se rafraîchit, juste avant d'être dessinées : les commandes sont lues le plus tard possible
       et l'image n'attend pas le rafraîchissement suivant. Onglet masqué (plus de rafraîchissement), un minuteur prend
       le relais pour que le son et le jeu continuent. */
    this._lastRaf = 0;
    this._timer = setInterval(() => { const now = performance.now(); if (document.hidden || now - this._lastRaf > 60) this._step(now); }, 4);
    const frame = () => {
      if (!this.running) return;
      requestAnimationFrame(frame);
      this._lastRaf = performance.now();
      this._step(this._lastRaf);
      if (this._newFrame) { this._newFrame = false; this._draw(); }
    };
    requestAnimationFrame(frame);
  }

  /* ---------- boucle : on rattrape le temps réel au rythme exact de l'Amiga ---------- */
  _step(now) {
    if (!this.running) return;
    if (this.paused) { this._t = now; return; }
    this._acc += (now - this._t) / 1000; this._t = now;
    const step = 1 / this.fps;
    let n = 0;
    if (this._acc > 0.25) this._acc = step; /* onglet en arrière-plan : on ne rattrape pas tout */
    const r0 = performance.now();
    while (this._acc >= step && n < 4) {
      if (this._keyQ && this._keyQ.length) { const [d, k] = this._keyQ.shift(); this.M._fe_key(d, k); }
      this._pollGamepads(); this.M._fe_run(); this._acc -= step; n++; this._frames++;
    }
    this._busy = (this._busy || 0) + performance.now() - r0;
    if (n) { this._newFrame = true; this._pumpAudio(); if (this.onFrame) this.onFrame(this.leds()); }
    if (now - this._statT >= 1000) {
      /* charge = part du temps réel passée à émuler : au-delà de 100 %, la machine ralentit */
      const load = this._frames ? this._busy / (this._frames * step * 1000) * 100 : 0;
      this.onStats({ fps: this._frames * 1000 / (now - this._statT), load, leds: this.leds() });
      this._frames = 0; this._busy = 0; this._statT = now;
    }
  }

  leds() {
    const M = this.M;
    return { power: M._fe_led(LED.POWER), df0: M._fe_led(LED.DF0), df1: M._fe_led(LED.DF1), hd: M._fe_led(LED.HDONLY) };
  }
  /** Arrête la machine : boucle, son, écouteurs. Le module ne se relance pas : recharger la page pour rallumer. */
  stop() {
    this.running = false;
    clearInterval(this._timer);
    if (this.ac) { try { this.ac.close(); } catch (e) {} this.ac = null; }
    window.removeEventListener("keydown", this._onKey);
    window.removeEventListener("keyup", this._onKey);
    document.removeEventListener("mousemove", this._onMove);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  /** Date de dernière écriture d'un fichier (ms), pour repérer ce que l'Amiga a modifié. */
  /** Vide les tampons d'écriture du cœur : à appeler avant de relire un média. */
  flush() { if (this.running || this.M) this.M._fe_flush(); }
  fileMtime(path) { try { const st = this.M.FS.stat(path); return +st.mtime; } catch (e) { return 0; } }
  removeFile(path) { try { this.M.FS.unlink(path); } catch (e) {} }
  /** Lecteurs DF0: à DF3: */
  driveInsert(num, path) { this._call("fe_drive_insert", num, path); }
  driveEject(num) { this.M._fe_drive_eject(num); }

  _draw() {
    const M = this.M, w = M._fe_video_w(), h = M._fe_video_h();
    if (!w || !h) return;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; this._img = null; }
    if (!this._img) this._img = new ImageData(w, h);
    const p = M._fe_video_ptr();
    this._img.data.set(M.HEAPU8.subarray(p, p + w * h * 4)); /* copie : la mémoire partagée ne va pas dans ImageData */
    this.ctx.putImageData(this._img, 0, 0);
  }

  /* ---------- son ---------- */
  async _startAudio() {
    try {
      this.ac = new AudioContext({ sampleRate: this.rate });
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      await this.ac.audioWorklet.addModule(url);
      this.node = new AudioWorkletNode(this.ac, "ring", { outputChannelCount: [2] });
      this.gain = this.ac.createGain(); this.gain.gain.value = this.muted ? 0 : 1;
      this.node.connect(this.gain).connect(this.ac.destination);
      this._audioPtr = this.M._malloc(4096 * 2 * 4);
    } catch (e) { this.ac = null; console.warn("son indisponible", e); }
  }
  _pumpAudio() {
    if (!this.ac || !this._audioPtr) { this.M._fe_audio_read(0, 0); return; }
    if (this.ac.state === "suspended") this.ac.resume();
    const n = this.M._fe_audio_read(this._audioPtr, 4096);
    if (!n) return;
    const f = new Float32Array(n * 2);
    f.set(this.M.HEAPF32.subarray(this._audioPtr >> 2, (this._audioPtr >> 2) + n * 2));
    this.node.port.postMessage(f, [f.buffer]);
  }
  setMuted(m) { this.muted = m; if (this.gain) this.gain.gain.value = m ? 0 : 1; }

  /* ---------- clavier, souris, manettes ---------- */
  /* PUAE lit le clavier une fois par image et dans un ordre fixe : une touche pressée puis relâchée entre deux
     images serait perdue, et Maj pourrait passer après la lettre. Les événements attendent donc dans une file
     et le cœur en reçoit un par image, dans l'ordre où ils sont arrivés. */
  key(code, down) {
    const k = RETROK[code];
    if (k && this.running) { (this._keyQ || (this._keyQ = [])).push([down ? 1 : 0, k]); if (this._keyQ.length > 256) this._keyQ.shift(); }
    return !!k;
  }
  mouseMove(dx, dy) { if (this.running) this.M._fe_mouse_move(Math.round(dx), Math.round(dy)); }
  mouseButton(btn, down) { /* comme MouseEvent.button : 0 gauche, 1 milieu, 2 droit */
    const bit = btn === 0 ? 1 : btn === 2 ? 2 : 4;
    this.mouseButtons = down ? this.mouseButtons | bit : this.mouseButtons & ~bit;
    if (this.running) this.M._fe_mouse_buttons(this.mouseButtons);
  }
  /** port libretro 0 = port joystick de l'Amiga ; bits = RETRO_DEVICE_ID_JOYPAD_* (B=0 tir, haut=4, bas=5, gauche=6, droite=7) */
  setJoy(port, mask) { this.joyMask[port] = mask; if (this.running) this.M._fe_joy(port, mask); }
  _pollGamepads() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (let i = 0; i < 2; i++) {
      const g = pads[i]; if (!g) continue;
      const b = j => g.buttons[j] && g.buttons[j].pressed, ax = g.axes[0] || 0, ay = g.axes[1] || 0;
      let m = 0;
      if (b(0)) m |= 1; if (b(1)) m |= 1 << 8; if (b(2)) m |= 1 << 1; if (b(3)) m |= 1 << 9;
      if (b(12) || ay < -0.5) m |= 1 << 4; if (b(13) || ay > 0.5) m |= 1 << 5;
      if (b(14) || ax < -0.5) m |= 1 << 6; if (b(15) || ax > 0.5) m |= 1 << 7;
      if (b(9)) m |= 1 << 3; if (b(8)) m |= 1 << 2;
      if (b(4)) m |= 1 << 10; if (b(5)) m |= 1 << 11; /* gâchettes L et R (manette CD32) */
      this.M._fe_joy(i === 0 ? 0 : 1, m | this.joyMask[i === 0 ? 0 : 1]);
    }
  }

  _attachInput() {
    const c = this.canvas;
    /* Modificateurs recalés sur l'état que le navigateur annonce avec chaque touche : couvre une touche Maj
       enfoncée avant que la page ait le focus, ou relâchée hors de la fenêtre. */
    const MOD = [["shiftKey", ["ShiftLeft", "ShiftRight"]], ["ctrlKey", ["ControlLeft", "ControlRight"]], ["altKey", ["AltLeft", "AltRight"]]];
    this._held = new Set(); this._synth = new Set();
    const send = (code, down) => { if (this.key(code, down)) { down ? this._held.add(code) : this._held.delete(code); } };
    this._onKey = e => {
      if (!this.running || this.inputBlocked) return;
      const down = e.type === "keydown";
      if (e.repeat) { if (RETROK[e.code]) e.preventDefault(); return; }
      const isMod = MOD.some(([, codes]) => codes.includes(e.code));
      if (down && !isMod) {
        for (const [flag, [left, right]] of MOD) {
          const has = this._held.has(left) || this._held.has(right);
          if (e[flag] && !has) { send(left, true); this._synth.add(left); }
          else if (!e[flag] && has) { if (this._held.has(left)) send(left, false); if (this._held.has(right)) send(right, false); }
        }
      }
      if (RETROK[e.code]) { send(e.code, down); e.preventDefault(); }
      /* Un modificateur ajouté pour une touche est relâché avec elle */
      if (!down && !isMod && this._synth.size) { for (const c of this._synth) send(c, false); this._synth.clear(); }
    };
    window.addEventListener("keydown", this._onKey);
    window.addEventListener("keyup", this._onKey);
    c.addEventListener("click", () => { if (document.pointerLockElement !== c && c.requestPointerLock) c.requestPointerLock(); });
    this._onMove = e => { if (document.pointerLockElement === c) this.mouseMove(e.movementX, e.movementY); };
    document.addEventListener("mousemove", this._onMove);
    c.addEventListener("mousedown", e => { if (document.pointerLockElement === c) { this.mouseButton(e.button, true); e.preventDefault(); } });
    c.addEventListener("mouseup", e => { if (document.pointerLockElement === c) { this.mouseButton(e.button, false); e.preventDefault(); } });
    c.addEventListener("contextmenu", e => e.preventDefault());
  }

  /* ---------- disquettes, réinitialisation, états ---------- */
  insertDisk(name, bytes) {
    const path = "/disks/" + name.replace(/[\/\\]/g, "_");
    this.writeFile(path, bytes);
    return !!this._call("fe_disk_insert", path);
  }
  ejectDisk() { return !!this.M._fe_disk_eject(); }
  reset() { this.M._fe_reset(); }
  pause(p) { this.paused = p; if (this.ac) p ? this.ac.suspend() : this.ac.resume(); }

  saveState() {
    const n = this.M._fe_state_size(); if (!n) return null;
    const p = this.M._malloc(n);
    try { if (!this.M._fe_state_save(p, n)) return null; return this.M.HEAPU8.slice(p, p + n); }
    finally { this.M._free(p); }
  }
  loadState(bytes) {
    const p = this.M._malloc(bytes.length);
    try { this.M.HEAPU8.set(bytes, p); return !!this.M._fe_state_load(p, bytes.length); }
    finally { this.M._free(p); }
  }
}
