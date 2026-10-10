
/* =========================================================
   Sauvegardes d'état : 4 emplacements par jeu
   =========================================================
   Un état PUAE contient la machine entière (processeur, puces, mémoire) mais pas le contenu des disques :
   il note leur chemin et les réinsère à la reprise. On garde donc avec chaque état la liste des disques,
   le Kickstart et les réglages du moment, et « Reprendre » remet exactement cette configuration. */
const SLOTS = 4;
let pendingResume = null; /* état à appliquer au prochain allumage */

/* Le « jeu » courant : la disquette de DF0:, sinon le disque dur, sinon la machine nue */
function gameKey(m = mounted) { return m.df0 ? m.df0.id : m.dh0 ? m.dh0.id : "aucun"; }
function gameName(m = mounted) { return m.df0 ? m.df0.name : m.dh0 ? m.dh0.name : "Sans disque"; }
function stateCtx() {
  return { df0: mounted.df0 && mounted.df0.id, df1: mounted.df1 && mounted.df1.id, dh0: mounted.dh0 && mounted.dh0.id, rom: E._rom || S.romId };
}
const STATE_SETTINGS = ["compat", "cpu", "fast", "region", "joy", "floppy", "accel", "model"];

async function statesFor(key) {
  return (await DB.all()).filter(r => r.kind === "state" && r.game === key).sort((a, b) => a.slot - b.slot);
}
function thumbnail() {
  const src = $("#amigaScreen"), c = document.createElement("canvas");
  c.width = 192; c.height = 144;
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}

async function saveStateSlot(slot) {
  if (!running) return;
  const t0 = performance.now();
  const data = machine.saveState();
  if (!data) { toast("Le cœur a refusé la sauvegarde.", true); return; }
  /* Les disques sont enregistrés en même temps, pour que l'état et leur contenu correspondent */
  if (S.autosave) await saveAllDisks(true);
  const key = gameKey(), old = (await statesFor(key)).find(r => r.slot === slot);
  const settings = {}; for (const k of STATE_SETTINGS) settings[k] = E[k];
  const rec = {
    id: old ? old.id : newId(), kind: "state", game: key, gameName: gameName(), slot,
    name: gameName() + " — emplacement " + slot, size: data.length, blob: new Blob([data]),
    ctx: stateCtx(), settings, thumb: thumbnail(), added: old ? old.added : Date.now(), updated: Date.now()
  };
  await DB.put(rec);
  toast(`Sauvegardé dans l'emplacement ${slot} (${fmtSize(data.length)}, ${Math.round(performance.now() - t0)} ms)`);
  if (openWin && openWin.id === "winStates") renderStates();
}

/* À chaud si la machine tourne déjà avec les mêmes disques durs, Kickstart et réglages ; sinon on rallume. */
function sameMachine(rec) {
  if (!running) return false;
  const c = stateCtx();
  if (c.dh0 !== rec.ctx.dh0 || c.rom !== rec.ctx.rom) return false;
  return STATE_SETTINGS.filter(k => k !== "joy").every(k => String(E[k] ?? (k === "model" ? "a1200" : undefined)) === String(rec.settings[k] ?? (k === "accel" ? "none" : k === "model" ? "a1200" : undefined)));
}
async function resumeState(id) {
  const rec = await DB.get(id); if (!rec) return;
  for (const t of ["df0", "df1", "dh0"]) {
    if (rec.ctx[t] && !(await DB.get(rec.ctx[t]))) { toast("Un disque de cette sauvegarde a été supprimé de la Bibliothèque.", true); return; }
  }
  closeWin();
  if (sameMachine(rec)) { await applyState(rec, false); return; }
  pendingResume = rec;
  if (running) { if (S.autosave) await saveAllDisks(true); }
  toast("Rallumage avec les disques et réglages de la sauvegarde…");
  powerOn();
}
/* Remet les disquettes de la sauvegarde là où le cœur les attend, puis charge l'état */
async function applyState(rec, cold) {
  for (const tag of ["df0", "df1"]) {
    const want = rec.ctx[tag] || null, have = mounted[tag] && mounted[tag].id;
    if (want === have) continue;
    if (want) await mountMedia(tag, await DB.get(want));
    else await ejectMedia(tag, true);
  }
  if (cold) await new Promise(r => setTimeout(r, 600)); /* quelques images : le cœur finit son initialisation */
  const ok = machine.loadState(new Uint8Array(await rec.blob.arrayBuffer()));
  toast(ok ? `Reprise : ${rec.gameName}, emplacement ${rec.slot}` : "Le cœur a refusé cette sauvegarde.", !ok);
}
async function deleteState(id) {
  const rec = await DB.get(id); if (!rec) return;
  if (!confirm(`Supprimer la sauvegarde de l'emplacement ${rec.slot} ?`)) return;
  await DB.del(id); renderStates();
}

async function renderStates() {
  const body = $("#statesBody"), key = gameKey(), list = await statesFor(key);
  body.innerHTML = "";
  const intro = document.createElement("p");
  intro.textContent = running ? `Sauvegardes de ${gameName()}.` : `Sauvegardes de ${gameName()}. Reprendre allume l'Amiga avec les disques et réglages de la sauvegarde.`;
  body.appendChild(intro);
  const grid = document.createElement("div"); grid.className = "slots"; body.appendChild(grid);
  for (let slot = 1; slot <= SLOTS; slot++) {
    const rec = list.find(r => r.slot === slot);
    const card = document.createElement("div"); card.className = "slot-card";
    const img = document.createElement(rec ? "img" : "div");
    img.className = "slot-img"; if (rec) { img.src = rec.thumb; img.alt = "Écran au moment de la sauvegarde " + slot; } else img.textContent = "Vide";
    const meta = document.createElement("div"); meta.className = "slot-meta";
    meta.innerHTML = `<b>Emplacement ${slot}</b><span></span>`;
    meta.querySelector("span").textContent = rec
      ? new Date(rec.updated).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(" ", " à ") + ", " + fmtSize(rec.size)
      : "libre";
    const acts = document.createElement("div"); acts.className = "slot-acts";
    const b = (txt, fn, dis, primary) => { const x = document.createElement("button"); x.className = "gad small" + (primary ? " primary" : ""); x.textContent = txt; x.disabled = !!dis; x.onclick = fn; acts.appendChild(x); };
    b(rec ? "Écraser" : "Sauvegarder", () => saveStateSlot(slot), !running, !rec);
    b("Reprendre", () => resumeState(rec.id), !rec, !!rec);
    if (rec) b("Supprimer", () => deleteState(rec.id));
    card.append(img, meta, acts); grid.appendChild(card);
  }
  const note = document.createElement("p"); note.className = "hint";
  note.textContent = "Une sauvegarde fige la machine, pas le contenu des disques : ce que l'Amiga a écrit depuis sur une disquette ou le disque dur reste écrit.";
  body.appendChild(note);
}
$("#btnStates").onclick = () => { renderStates(); showWin("winStates"); };

/* Raccourcis : Ctrl+Maj+S sauvegarde dans l'emplacement 1, Ctrl+Maj+R le reprend */
window.addEventListener("keydown", async e => {
  if (!e.ctrlKey || !e.shiftKey || openWin) return;
  if (e.code === "KeyS" && running) { e.preventDefault(); e.stopPropagation(); saveStateSlot(1); }
  else if (e.code === "KeyR") {
    e.preventDefault(); e.stopPropagation();
    const r = (await statesFor(gameKey())).find(x => x.slot === 1);
    if (r) resumeState(r.id); else toast("Aucune sauvegarde dans l'emplacement 1 pour ce jeu.");
  }
}, true);

/* Un disque supprimé emporte ses sauvegardes */
const _dbDel = DB.del.bind(DB);
DB.del = async id => {
  const rec = await DB.get(id);
  if (rec && rec.kind !== "state") for (const s of (await DB.all()).filter(x => x.kind === "state" && x.game === id)) await _dbDel(s.id);
  return _dbDel(id);
};
