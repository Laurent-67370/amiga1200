/* =========================================================
   MIDI par le navigateur (Web MIDI), avec le cœur WinUAE 6
   =========================================================
   Sur l'Amiga, le MIDI passe par le port série à 31 250 bauds (interface MIDI branchée sur le port série).
   Le cœur remet les octets envoyés à la page, qui les regroupe en messages MIDI complets pour Web MIDI :
   un synthétiseur, un clavier ou un logiciel de l'ordinateur reçoit ainsi ce que jouent Bars & Pipes, Music-X,
   OctaMED ou les jeux qui parlent MIDI. Dans l'autre sens, un clavier branché joue sur l'Amiga. */
let midiAccess = null;
const midiSupported = () => !!navigator.requestMIDIAccess;

async function midiInit(ask) {
  if (midiAccess || !midiSupported()) return midiAccess;
  try { midiAccess = await navigator.requestMIDIAccess({ sysex: true }); }
  catch (e) {
    try { midiAccess = await navigator.requestMIDIAccess(); } /* sans les messages système exclusifs */
    catch (e2) { if (ask) toast("Accès au MIDI refusé par le navigateur : " + (e2.message || e2), true); return null; }
  }
  midiAccess.onstatechange = () => renderMidiChoices();
  return midiAccess;
}
const midiPort = (kind, id) => {
  if (!midiAccess) return null;
  const ports = [...(kind === "out" ? midiAccess.outputs : midiAccess.inputs).values()];
  return ports.find(p => p.id === id) || (kind === "out" ? ports[0] : null) || null;
};

/* Octets → messages MIDI complets (Web MIDI refuse les morceaux de message), statut courant compris */
class MidiAssembler {
  constructor(send) { this.send = send; this.status = 0; this.data = []; this.need = 0; this.sysex = null; }
  static len(st) {
    if (st < 0xc0) return 2; if (st < 0xe0) return 1; if (st < 0xf0) return 2;
    return st === 0xf1 || st === 0xf3 ? 1 : st === 0xf2 ? 2 : 0;
  }
  push(b) {
    if (b >= 0xf8) { this.send([b]); return; }                     /* temps réel : passe au milieu de tout */
    if (b === 0xf0) { this.sysex = [b]; return; }
    if (this.sysex) {
      if (b === 0xf7) { this.sysex.push(b); this.send(this.sysex); this.sysex = null; return; }
      if (!(b & 0x80)) { if (this.sysex.length < 65536) this.sysex.push(b); return; }
      this.sysex = null;                                            /* message système exclusif interrompu */
    }
    if (b & 0x80) {
      this.status = b; this.data = []; this.need = MidiAssembler.len(b);
      if (!this.need) { if (b !== 0xf7) this.send([b]); if (b >= 0xf0) this.status = 0; }
      return;
    }
    if (!this.status) return;
    this.data.push(b);
    if (this.data.length === this.need) {
      this.send([this.status, ...this.data]); this.data = [];
      if (this.status >= 0xf0) this.status = 0;                     /* pas de statut courant pour les messages système */
    }
  }
}

/* Branché sur la machine qui démarre (WinUAE 6 seulement : PUAE n'a pas de sortie MIDI) */
let midiLink = null;
async function midiAttach(m) {
  midiLink = null;
  if (S.midi !== "on" || !(await midiInit(false))) return false;
  const out = midiPort("out", S.midiOut), inp = midiPort("in", S.midiIn);
  if (!out && !inp) { toast("MIDI : aucun instrument ni logiciel MIDI trouvé.", true); return false; }
  const asm = new MidiAssembler(msg => { try { out && out.send(msg); } catch (e) {} });
  midiLink = { m, out, inp, asm, buf: m.M._malloc(4096) };
  m.M._fe_midi_enable(out ? 1 : 0, inp ? 1 : 0);
  if (inp) inp.onmidimessage = e => {
    if (!midiLink || midiLink.m !== m || !m.running) return;
    const p = m.M._malloc(e.data.length); m.M.HEAPU8.set(e.data, p); m.M._fe_midi_in_write(p, e.data.length); m.M._free(p);
  };
  return true;
}
function midiPump(m) {
  const L = midiLink; if (!L || L.m !== m) return;
  for (let n; (n = m.M._fe_midi_out_read(L.buf, 4096));) {
    const bytes = m.M.HEAPU8.subarray(L.buf, L.buf + n);
    for (let i = 0; i < n; i++) L.asm.push(bytes[i]);
  }
}
function midiDetach() {
  if (midiLink && midiLink.out) { try { for (let c = 0; c < 16; c++) midiLink.out.send([0xb0 | c, 123, 0]); } catch (e) {} } /* toutes notes coupées */
  if (midiLink && midiLink.inp) midiLink.inp.onmidimessage = null;
  midiLink = null;
}
/* Les octets sont relevés à chaque image calculée, avec le son */
{ const _pa = PuaeMachine.prototype._pumpAudio; PuaeMachine.prototype._pumpAudio = function () { _pa.call(this); midiPump(this); }; }
{ const _off = powerOff; powerOff = async () => { midiDetach(); return _off(); }; }

/* ---- Réglages ---- */
function renderMidiChoices() {
  const box = $("#midiPorts"); if (!box) return;
  const on = S.midi === "on";
  $("#optMidi").checked = on;
  box.hidden = !on;
  if (!on) return;
  if (!midiAccess) { box.innerHTML = '<p class="hint">Autorisez le MIDI quand le navigateur le demande.</p>'; return; }
  const opts = (kind, cur, none) => {
    const ports = [...(kind === "out" ? midiAccess.outputs : midiAccess.inputs).values()];
    return (none ? '<option value="">Aucune</option>' : "") + ports.map(p => `<option value="${p.id.replace(/"/g, "&quot;")}"${p.id === cur ? " selected" : ""}>${(p.name || p.id).replace(/</g, "&lt;")}</option>`).join("")
      || '<option value="">(aucun appareil trouvé)</option>';
  };
  box.innerHTML = `<label>Sortie (l'Amiga joue sur) <select id="midiOut">${opts("out", S.midiOut, false)}</select></label>
    <label>Entrée (un clavier joue sur l'Amiga) <select id="midiIn">${opts("in", S.midiIn, true)}</select></label>`;
  $("#midiOut").onchange = e => { S.midiOut = e.target.value; saveSettings(); };
  $("#midiIn").onchange = e => { S.midiIn = e.target.value; saveSettings(); };
}
$("#optMidi").onchange = async e => {
  S.midi = e.target.checked ? "on" : "off"; saveSettings();
  if (S.midi === "on") {
    if (!midiSupported()) { toast("Ce navigateur ne connaît pas Web MIDI (Chrome, Edge, Opera et Firefox le proposent ; Safari non).", true); }
    else await midiInit(true);
  }
  renderMidiChoices();
};
$("#btnSettings").addEventListener("click", () => { if (S.midi === "on") midiInit(false).then(renderMidiChoices); else renderMidiChoices(); });
