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

/* Manette : bouton (disposition standard du navigateur) → bit RETRO_DEVICE_ID_JOYPAD_* : A = B libretro (tir), B = A (2e bouton),
   X = Y, Y = X, LB/RB = gâchettes CD32, Select, Start, croix directionnelle */
const PAD_DEF = { 0: 0, 1: 8, 2: 1, 3: 9, 4: 10, 5: 11, 8: 2, 9: 3, 12: 4, 13: 5, 14: 6, 15: 7 };
/* Son : file d'attente à taille cible (50 ms au départ). Chaque image de l'Amiga apporte son lot d'échantillons ;
   la lecture accélère ou ralentit d'au plus 0,5 % (1 % loin de la cible, inaudible) pour garder la file à sa cible, au lieu de grossir sans
   fin après un à-coup. Un manque (file vide) relève la cible de 10 ms, jusqu'à 150 ms ; vingt secondes sans manque
   la redescendent d'autant. Au-delà du double de la cible (à-coup, retour d'un onglet en arrière-plan), les plus vieux
   lots sont jetés. */
const WORKLET = `
class Ring extends AudioWorkletProcessor {
  constructor(opt) {
    super();
    /* Lecture directe : le tampon circulaire du cœur, dans la mémoire partagée (émulation dans son propre fil) */
    const d = opt && opt.processorOptions;
    if (d && d.sab) { this.h16 = new Int16Array(d.sab, d.buf, d.frames * 2); this.ix = new Uint32Array(d.sab); this.ri = d.rptr >> 2; this.wi = d.wptr >> 2; this.N = d.frames; this.dpos = 0; }
    this.q = []; this.pos = 0; this.tot = 0;           /* lots en attente, position (fractionnaire) dans le premier, total */
    this.min = sampleRate * 0.05; this.max = sampleRate * 0.15; this.target = this.min;
    this.started = false; this.under = 0; this.calm = 0; this.tick = 0;
    this.port.onmessage = e => {
      const b = e.data; this.q.push(b); this.tot += b.length / 2;
      while (this.q.length > 1 && this.tot - this.pos > Math.max(this.target * 2, this.target + sampleRate * 0.06)) { this.tot -= this.q.shift().length / 2; this.pos = 0; }
    };
  }
  process(_, outputs) {
    if (this.h16) return this.direct(outputs);
    const L = outputs[0][0], R = outputs[0][1] || outputs[0][0], n = L.length;
    if (!this.started) {
      if (this.tot - this.pos >= this.target) this.started = true;
      else { L.fill(0); R.fill(0); return true; }
    }
    const err = (this.tot - this.pos - this.target) / this.target;
    const lim = Math.abs(err) > 0.5 ? 0.01 : 0.005; /* loin de la cible : jusqu'à 1 % */
    const rate = 1 + Math.max(-lim, Math.min(lim, err * 0.01));
    for (let i = 0; i < n; i++) {
      if (this.tot - this.pos < 2) { /* manque : silence, puis on se remplit de nouveau jusqu'à une cible plus haute */
        L.fill(0, i); R.fill(0, i); this.started = false; this.under++; this.calm = 0;
        this.target = Math.min(this.max, this.target + sampleRate * 0.01); break;
      }
      const k = Math.floor(this.pos), f = this.pos - k;
      const b0 = this.q[0], j = k * 2;
      let l1, r1;
      if (j + 2 < b0.length) { l1 = b0[j + 2]; r1 = b0[j + 3]; }
      else { const nb = this.q[1]; l1 = nb ? nb[0] : b0[j]; r1 = nb ? nb[1] : b0[j + 1]; }
      L[i] = b0[j] + (l1 - b0[j]) * f; R[i] = b0[j + 1] + (r1 - b0[j + 1]) * f;
      this.pos += rate;
      while (this.q.length && this.pos >= this.q[0].length / 2) { const len = this.q.shift().length / 2; this.pos -= len; this.tot -= len; }
    }
    this.calm += n;
    if (this.calm > sampleRate * 20 && this.target > this.min) { this.target = Math.max(this.min, this.target - sampleRate * 0.01); this.calm = 0; }
    if ((this.tick += n) >= sampleRate / 2) { this.tick = 0; this.port.postMessage({ queue: (this.tot - this.pos) / sampleRate * 1000, target: this.target / sampleRate * 1000, under: this.under }); }
    return true;
  }
  direct(outputs) {
    const L = outputs[0][0], R = outputs[0][1] || outputs[0][0], n = L.length, N = this.N, h = this.h16;
    let r = Atomics.load(this.ix, this.ri);
    const w = Atomics.load(this.ix, this.wi);
    let avail = (w - r + N) % N - this.dpos;
    if (avail > Math.max(this.target * 2, this.target + sampleRate * 0.06)) { /* trop d'avance (à-coup) : on saute au plus récent */
      r = (w - Math.round(this.target) + N) % N; this.dpos = 0; avail = this.target;
    }
    if (!this.started) {
      if (avail >= this.target) this.started = true;
      else { L.fill(0); R.fill(0); return true; }
    }
    const err = (avail - this.target) / this.target;
    const lim = Math.abs(err) > 0.5 ? 0.01 : 0.005;
    const rate = 1 + Math.max(-lim, Math.min(lim, err * 0.01));
    let pos = this.dpos;
    for (let i = 0; i < n; i++) {
      if (avail - pos < 2) {
        L.fill(0, i); R.fill(0, i); this.started = false; this.under++; this.calm = 0;
        this.target = Math.min(this.max, this.target + sampleRate * 0.01); break;
      }
      const k = Math.floor(pos), f = pos - k, a = ((r + k) % N) * 2, b = ((r + k + 1) % N) * 2;
      L[i] = (h[a] + (h[b] - h[a]) * f) / 32768; R[i] = (h[a + 1] + (h[b + 1] - h[a + 1]) * f) / 32768;
      pos += rate;
    }
    const adv = Math.floor(pos); this.dpos = pos - adv;
    Atomics.store(this.ix, this.ri, (r + adv) % N);
    this.calm += n;
    if (this.calm > sampleRate * 20 && this.target > this.min) { this.target = Math.max(this.min, this.target - sampleRate * 0.01); this.calm = 0; }
    if ((this.tick += n) >= sampleRate / 2) { this.tick = 0; this.port.postMessage({ queue: (avail - pos) / sampleRate * 1000, target: this.target / sampleRate * 1000, under: this.under }); }
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
    this.M = M; this.canvas = canvas; this._initVideo(canvas);
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
    /* L'émulation dans son propre fil quand c'est possible : l'interface ne peut plus la freiner */
    this.threaded = false;
    if (cfg.thread !== false && M._fe_thread_start && this._call("fe_thread_start", path)) {
      let st; while ((st = M._fe_thread_state()) === 1) await new Promise(r => setTimeout(r, 10));
      if (st === -1) throw new Error("le cœur a refusé de démarrer (Kickstart ou disquette illisible ?)");
      this.threaded = st === 2;
    }
    if (!this.threaded) {
      const ok = this._call("fe_start", path);
      if (!ok) throw new Error("le cœur a refusé de démarrer (Kickstart ou disquette illisible ?)");
    } else this._lockCore();
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
    if (this.threaded) {
      /* Le fil de l'émulation suit sa propre horloge ; ici : afficher la dernière image, lire les manettes, les statistiques */
      this._lastFc = 0;
      this._timer = setInterval(() => { const now = performance.now(); if (document.hidden || now - this._lastRaf > 60) this._tick(now); }, 8);
      const frame = () => { if (!this.running) return; requestAnimationFrame(frame); this._lastRaf = performance.now(); this._tick(this._lastRaf); };
      requestAnimationFrame(frame);
      return;
    }
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

  /* Ce qui touche à l'état du cœur passe par son verrou, pris entre deux images du fil de l'émulation */
  _lockCore() {
    const M = this.M, lock = M._fe_lock, unlock = M._fe_unlock;
    let depth = 0;
    /* (reprise d'état et réinitialisation : exécutées par le fil de l'émulation lui-même, voir frontend.c) */
    for (const n of ["_fe_set_option", "_fe_drive_insert", "_fe_drive_eject", "_fe_state_size", "_fe_state_save",
      "_fe_flush", "_fe_disk_insert", "_fe_disk_eject", "_fe_disk_count", "_retro_set_controller_port_device", "_fe_midi_enable",
      "_amb_set_framerate", "_amb_set_floppy_sound", "_amb_set_floppy_speed"]) {
      const f = M[n]; if (typeof f !== "function") continue;
      M[n] = (...a) => { if (depth++ === 0) lock(); try { return f(...a); } finally { if (--depth === 0) unlock(); } };
    }
  }
  _tick(now) {
    if (!this.running) return;
    const M = this.M;
    this._pollGamepads();
    if (!this._audioDirect) this._pumpAudio();
    else if (this.ac && this.ac.state === "suspended" && !this.paused) this.ac.resume();
    const fc = M._fe_frame_count();
    if (fc !== this._lastFc) { this._lastFc = fc; if (!document.hidden) this._draw(); if (this.onFrame) this.onFrame(this.leds()); }
    if (now - this._statT >= 1000) {
      const frames = M._fe_thread_frames(), busy = M._fe_thread_busy(), step = 1 / this.fps;
      const load = frames ? busy / (frames * step * 1e6) * 100 : 0;
      this.onStats({ fps: frames * 1000 / (now - this._statT), load, leds: this.leds(), warp: this.warp > 1, thread: true });
      this._statT = now;
    }
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
    if (this.warp > 1) {
      /* Turbo : « warp » fois les images dues, dans la limite d'environ 15 ms par passage (la page reste réactive) ;
         le son est jeté, il serait accéléré et haché */
      const due = Math.max(1, Math.round(this._acc / step)) * this.warp; this._acc = 0;
      const avg = this._warpAvg || 5; /* durée moyenne d'une image en turbo (ms) : on s'arrête avant de dépasser 15 ms */
      while (n < due && (n === 0 || performance.now() - r0 + avg < 15)) {
        if (this._keyQ && this._keyQ.length) { const [d, k] = this._keyQ.shift(); this.M._fe_key(d, k); }
        this._pollGamepads(); this.M._fe_run(); n++; this._frames++; /* le tampon du son tourne, le plus ancien est écrasé */
      }
      const dt = performance.now() - r0;
      this._busy = (this._busy || 0) + dt;
      if (n) { this._warpAvg = 0.8 * avg + 0.2 * dt / n; this._newFrame = true; if (this.onFrame) this.onFrame(this.leds()); }
    } else {
    while (this._acc >= step && n < 4) {
      if (this._keyQ && this._keyQ.length) { const [d, k] = this._keyQ.shift(); this.M._fe_key(d, k); }
      this._pollGamepads(); this.M._fe_run(); this._acc -= step; n++; this._frames++;
    }
    this._busy = (this._busy || 0) + performance.now() - r0;
    if (n) { this._newFrame = true; this._pumpAudio(); if (this.onFrame) this.onFrame(this.leds()); }
    }
    if (now - this._statT >= 1000) {
      /* charge = part du temps réel passée à émuler : au-delà de 100 %, la machine ralentit */
      const load = this._frames ? this._busy / (this._frames * step * 1000) * 100 : 0;
      this.onStats({ fps: this._frames * 1000 / (now - this._statT), load, leds: this.leds(), warp: this.warp > 1 });
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
    if (this.threaded) this.M._fe_thread_stop();
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

  /* Affichage basse latence : WebGL lit l'image directement dans la mémoire du cœur (sans copie) et le canevas
     « désynchronisé » va à l'écran sans attendre la composition de la page (Chrome, Edge, Android). Sans WebGL :
     canevas 2D, désynchronisé lui aussi quand le navigateur le permet. preserveDrawingBuffer garde l'image pour les
     captures d'écran et les vignettes des sauvegardes. */
  _initVideo(canvas) {
    const o = { alpha: false, antialias: false, depth: false, stencil: false, desynchronized: true, preserveDrawingBuffer: true, powerPreference: "high-performance" };
    const gl = canvas.getContext("webgl2", o) || canvas.getContext("webgl", o);
    if (gl) {
      try {
        const sh = (t, src) => { const x = gl.createShader(t); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
        const pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, "attribute vec2 p;varying vec2 t;void main(){t=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}"));
        gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, "precision mediump float;varying vec2 t;uniform sampler2D s;void main(){gl_FragColor=vec4(texture2D(s,t).rgb,1.);}"));
        gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
        gl.useProgram(pr);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const a = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
        this.gl = gl; this._texW = 0; this._texH = 0; this.videoMode = "webgl";
        return;
      } catch (e) { console.warn("WebGL indisponible, affichage 2D", e); }
    }
    this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true }) || canvas.getContext("2d");
    this.videoMode = "2d";
  }
  _draw() {
    const M = this.M, w = M._fe_video_w(), h = M._fe_video_h();
    if (!w || !h) return;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; this._img = null; }
    const p = M._fe_video_ptr();
    if (this.gl) {
      const gl = this.gl;
      let px = M.HEAPU8.subarray(p, p + w * h * 4);
      if (this._glCopy) { /* navigateur qui refuse la mémoire partagée dans WebGL : une copie par image */
        if (this._glCopy.length !== px.length) this._glCopy = new Uint8Array(px.length);
        this._glCopy.set(px); px = this._glCopy;
      }
      try {
        if (this._texW !== w || this._texH !== h) { gl.viewport(0, 0, w, h); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, px); this._texW = w; this._texH = h; }
        else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      } catch (e) {
        if (this._glCopy) throw e;
        this._glCopy = new Uint8Array(0); this._texW = 0; return this._draw();
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return;
    }
    if (!this._img) this._img = new ImageData(w, h);
    this._img.data.set(M.HEAPU8.subarray(p, p + w * h * 4)); /* copie : la mémoire partagée ne va pas dans ImageData */
    this.ctx.putImageData(this._img, 0, 0);
  }

  /* ---------- son ---------- */
  async _startAudio() {
    try {
      this.ac = new AudioContext({ sampleRate: this.rate, latencyHint: "interactive" });
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      await this.ac.audioWorklet.addModule(url);
      /* Émulation dans son propre fil : le son est lu par le worklet directement dans la mémoire du cœur */
      const sab = this.threaded && this.M.HEAPU8.buffer instanceof SharedArrayBuffer ? this.M.HEAPU8.buffer : null;
      this._audioDirect = !!sab;
      this.node = new AudioWorkletNode(this.ac, "ring", { outputChannelCount: [2], processorOptions: sab
        ? { sab, buf: this.M._fe_audio_buf(), rptr: this.M._fe_audio_rptr(), wptr: this.M._fe_audio_wptr(), frames: this.M._fe_audio_frames() } : {} });
      this.audioStats = null; this.node.port.onmessage = e => { this.audioStats = e.data; }; /* file, cible (ms), manques */
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
  /** Turbo : 1 = vitesse réelle, 4 ou 8 = autant de fois plus vite. Au retour, le son accumulé est jeté. */
  setWarp(w) {
    const was = this.warp > 1; this.warp = w > 1 ? w : 1;
    if (this.threaded) { this.M._fe_thread_warp(this.warp); return; }
    if (was && this.warp === 1 && this.M) {
      if (this._audioPtr) while (this.M._fe_audio_read(this._audioPtr, 4096)) {}
      this._t = performance.now(); this._acc = 0;
    }
  }
  setMuted(m) { this.muted = m; if (this.gain) this.gain.gain.value = m ? 0 : 1; }

  /* ---------- clavier, souris, manettes ---------- */
  /* PUAE lit le clavier une fois par image et dans un ordre fixe : une touche pressée puis relâchée entre deux
     images serait perdue, et Maj pourrait passer après la lettre. Les événements attendent donc dans une file
     et le cœur en reçoit un par image, dans l'ordre où ils sont arrivés. */
  key(code, down) {
    /* keyRemap : touches propres à un cœur (WinUAE 6 ne place pas Help ni les touches Amiga comme PUAE) */
    const k = this.keyRemap && code in this.keyRemap ? this.keyRemap[code] : RETROK[code];
    if (k && this.running) {
      if (this.threaded) this.M._fe_key_push(down ? 1 : 0, k); /* file d'attente côté cœur, une touche par image */
      else { (this._keyQ || (this._keyQ = [])).push([down ? 1 : 0, k]); if (this._keyQ.length > 256) this._keyQ.shift(); }
    }
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
    /* Joueur 1 = première manette branchée (port joystick), joueur 2 = la deuxième (port souris) ; padSwap les échange */
    const list = [...navigator.getGamepads()].filter(g => g && g.connected);
    const slot = this.padSwap ? [list[1], list[0]] : [list[0], list[1]];
    const was = this._padOn || (this._padOn = [false, false]);
    for (let i = 0; i < 2; i++) {
      const g = slot[i];
      if (!g) { if (was[i]) { was[i] = false; this.M._fe_joy(i, this.joyMask[i]); } continue; } /* manette débranchée : plus rien d'enfoncé */
      was[i] = true;
      const ax = g.axes[0] || 0, ay = g.axes[1] || 0, map = this.padMap || {};
      const prev = (this._padPrev || (this._padPrev = [[], []]))[i];
      let m = 0;
      if (ay < -0.5) m |= 1 << 4; if (ay > 0.5) m |= 1 << 5;
      if (ax < -0.5) m |= 1 << 6; if (ax > 0.5) m |= 1 << 7;
      /* padMap (commandes personnalisées) : bouton → bit du joystick, -1 (rien) ou touche du clavier ("Space"…) */
      g.buttons.forEach((bt, j) => {
        const on = !!(bt && bt.pressed), t = j in map ? map[j] : PAD_DEF[j];
        if (typeof t === "string") { if (on !== !!prev[j]) this.key(t, on); }
        else if (on && t >= 0) m |= 1 << t;
        prev[j] = on;
      });
      this.M._fe_joy(i, m | this.joyMask[i]);
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
  pause(p) { this.paused = p; if (this.threaded) this.M._fe_thread_pause(p ? 1 : 0); if (this.ac) p ? this.ac.suspend() : this.ac.resume(); }

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
