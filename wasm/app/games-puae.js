/* =========================================================
   Turbo et jeux en plusieurs disquettes
   =========================================================
   Turbo : lecteurs de disquettes en turbo et Amiga aussi rapide que l'appareil le permet (jusqu'à 8 fois), sans le son,
   pour passer les chargements et les intros ; bouton de la barre (groupe Machine), barre plein écran, ou Ctrl+Maj+→.
   Plusieurs disquettes : « Jeu (Disk 1 of 3).adf », « Jeu Disk2.adf »… forment un seul jeu (une vignette à
   l'accueil, qui démarre sur la disquette 1) ; pendant la partie, « Disquette suivante » met la disquette d'après
   dans DF0:. */
const TURBO = 8;
let turboOn = false;
function setTurbo(on) {
  turboOn = !!on && running;
  if (machine && machine.setWarp) machine.setWarp(turboOn ? TURBO : 1);
  /* Lecteurs de disquettes en turbo aussi : les chargements fondent sans calcul de plus */
  if (machine && running) {
    const fast = turboOn || E.floppy === "turbo";
    if (E.core === "winuae6") { if (machine.M._amb_set_floppy_speed) machine.M._amb_set_floppy_speed(fast ? 0 : 100); }
    else machine.setOption("puae_floppy_speed", fast ? "0" : "100");
  }
  $$("[data-turbo]").forEach(b => b.setAttribute("aria-pressed", turboOn ? "true" : "false"));
}
(function turboUi() {
  const pause = $("#btnPause");
  if (pause) {
    const b = document.createElement("button");
    b.className = "gad"; b.id = "btnTurbo"; b.type = "button"; b.dataset.turbo = ""; b.disabled = true;
    b.setAttribute("aria-pressed", "false");
    b.title = "Turbo : disquettes et Amiga aussi rapides que l'appareil le permet, sans le son, pour passer les chargements (Ctrl+Maj+→)";
    b.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3l6 5-6 5zM8.5 3l6 5-6 5z"/></svg><span>Turbo</span>';
    pause.after(b);
  }
  const fs = $("#fsBar");
  if (fs) {
    const f = document.createElement("button");
    f.className = "fsb"; f.type = "button"; f.dataset.turbo = ""; f.setAttribute("aria-pressed", "false"); f.textContent = "Turbo";
    fs.insertBefore(f, fs.children[2] || null);
  }
  $$("[data-turbo]").forEach(x => x.addEventListener("click", () => { setTurbo(!turboOn); if (turboOn) toast("Turbo : l'Amiga va aussi vite que l'appareil le permet, sans le son. Touchez à nouveau Turbo pour revenir à la vitesse normale."); }));
})();
window.addEventListener("keydown", e => {
  if (!e.ctrlKey || !e.shiftKey || e.code !== "ArrowRight" || e.repeat || !running) return;
  e.preventDefault(); e.stopPropagation(); setTurbo(!turboOn); toast(turboOn ? "Turbo activé (Ctrl+Maj+→ pour l'arrêter)." : "Vitesse normale.");
}, true);
{ const _p = setPowerUi;
  setPowerUi = st => {
    _p(st);
    const b = $("#btnTurbo"); if (b) b.disabled = st !== "on";
    if (st !== "on") { turboOn = false; $$("[data-turbo]").forEach(x => x.setAttribute("aria-pressed", "false")); }
  }; }
{ const _s = onStats;
  onStats = s => {
    if (s.warp) { $("#statFps").textContent = "turbo, " + Math.round(s.fps) + " ips (×" + (s.fps / 50).toFixed(1) + ")"; $("#statCpu").textContent = ""; return; }
    _s(s);
  }; }
/* La pause arrête aussi le turbo */
{ const _sp = setPaused; setPaused = p => { if (p && turboOn) setTurbo(false); return _sp(p); }; }

/* ---- Jeux en plusieurs disquettes ---- */
/* « Jeu (Disk 2 of 3)[cr].adf » → { key: "jeu cr", num: 2 } ; null sans numéro de disquette */
function diskSetKey(name) {
  const n = name.replace(/\.(adf|adz|dms|ipf|scp)(\.gz)?$/i, "");
  const m = /^(.*?)[\s_.\-([]*(?:disk|disque|disc)[\s_.\-]*(\d{1,2})(?:\s*(?:of|sur|de|\/)\s*\d{1,2})?[\s)\]]*(.*)$/i.exec(n);
  if (!m) return null;
  const key = (m[1] + " " + m[3]).toLowerCase().replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  return key ? { key, num: +m[2] } : null;
}
/* Les disquettes du même jeu, dans l'ordre (une par numéro) */
function diskSetOf(rec, all) {
  const k = rec && rec.kind === "adf" && diskSetKey(rec.name); if (!k) return null;
  const by = new Map();
  for (const r of all) {
    if (r.kind !== "adf") continue;
    const x = diskSetKey(r.name);
    if (x && x.key === k.key && !by.has(x.num)) by.set(x.num, r);
  }
  const list = [...by.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
  return list.length > 1 ? list : null;
}

/* Accueil : une vignette par jeu, qui démarre sur la disquette 1 */
{ const _r = renderLauncher;
  renderLauncher = async (...a) => {
    const x = await _r(...a);
    const tiles = [...document.querySelectorAll("#lMain .l-tile.k-adf")]; if (!tiles.length) return x;
    const all = await DB.all(), seen = new Set();
    for (const t of tiles) {
      const pick = t.querySelector(".l-pick"); if (!pick) continue;
      const name = (pick.title || "").replace(/^[^:]*:\s*/, "");
      const rec = all.find(r => r.kind === "adf" && r.name === name);
      const set = rec && diskSetOf(rec, all); if (!set) continue;
      const k = diskSetKey(rec.name).key;
      if (seen.has(k)) { t.remove(); continue; }
      seen.add(k);
      const first = set[0];
      pick.title = "Insérer la disquette 1 et allumer : " + first.name;
      const nm = t.querySelector(".l-name"); if (nm) nm.textContent = first.name.replace(/\.(adf|adz|dms|ipf|scp)(\.gz)?$/i, "").replace(/[\s_\-]*\(?(disk|disque|disc)[\s_\-]*\d+(\s*(of|sur|de|\/)\s*\d+)?\)?/i, "");
      const sub = t.querySelector(".l-sub"); if (sub) sub.textContent = set.length + " disquettes" + (sub.textContent.includes("·") ? " ·" + sub.textContent.split("·").slice(1).join("·") : "");
      pick.onclick = () => launchWith(first);
    }
    return x;
  }; }

/* Pendant la partie : « Disquette suivante » (barre des touches et barre plein écran) */
let diskSetNow = null; /* { list, idx } de la disquette de DF0: */
(function nextDiskUi() {
  const mk = (cls, parent, before) => {
    if (!parent) return;
    const b = document.createElement("button"); b.type = "button"; b.className = cls; b.dataset.nextDisk = ""; b.hidden = true;
    b.title = "Mettre la disquette suivante du jeu dans DF0:";
    parent.insertBefore(b, before || null);
  };
  const keys = $(".keys"); mk("gad small", keys, keys && keys.children[1]);
  const fs = $("#fsBar"); mk("fsb", fs, fs && fs.children[2]);
  $$("[data-next-disk]").forEach(b => b.addEventListener("click", async () => {
    if (!diskSetNow) return;
    const { list, idx } = diskSetNow, next = list[(idx + 1) % list.length];
    await mountMedia("df0", next);
    toast("DF0: disquette " + ((idx + 1) % list.length + 1) + " sur " + list.length + " (" + next.name + ")");
  }));
})();
async function nextDiskRefresh() {
  const m = mounted.df0;
  diskSetNow = null;
  if (m) {
    const all = await DB.all(), rec = all.find(r => r.id === m.id), list = rec && diskSetOf(rec, all);
    if (list) diskSetNow = { list, idx: Math.max(0, list.findIndex(r => r.id === m.id)) };
  }
  $$("[data-next-disk]").forEach(b => {
    b.hidden = !diskSetNow;
    if (diskSetNow) b.textContent = (b.classList.contains("fsb") ? "Disque " : "Disquette suivante ") + "(" + (diskSetNow.idx + 1) + "/" + diskSetNow.list.length + ")";
  });
}
{ const _sm = setMounted; setMounted = (t, r) => { _sm(t, r); if (t === "df0") nextDiskRefresh().catch(() => {}); }; }
nextDiskRefresh().catch(() => {});
