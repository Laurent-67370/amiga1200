/* =========================================================
   Réglages par jeu WHDLoad : la base d'Amiberry (Amiberry-XML-Builder, plus de 11 000 jeux)
   =========================================================
   Pour chaque archive des collections WHDLoad, elle note ce que le jeu demande : AGA, NTSC, processeur plus
   rapide, cycle exact, blitter immédiat, souris ou manette CD32. Le navigateur la télécharge une fois depuis
   son dépôt (elle n'est pas fournie avec l'émulateur) et la garde dans la Bibliothèque ; elle est rafraîchie
   tous les 30 jours. Un jeu est reconnu par le nom de son archive, sinon par l'empreinte SHA-1 du fichier,
   sinon par son .slave quand toutes les versions du jeu demandent les mêmes réglages. */
const WHDDB_URL = "https://raw.githubusercontent.com/HoraceAndTheSpider/Amiberry-XML-Builder/master/whdload_db.xml";
const WHDDB_ID = "whddb";
const WHDDB_MAX_AGE = 30 * 86400000;
const CD32PAD = 517; /* RETRO_DEVICE_SUBCLASS(RETRO_DEVICE_ANALOG, 1) : manette CD32 du cœur */
let whdDbMem = null, whdDbLoading = null;

/* Ne garde que ce qui change quelque chose ici ; les valeurs par défaut (joystick sur les deux ports) sont omises */
function parseWhdDb(xml) {
  const byName = {}, bySha = {}, bySlave = {};
  const un = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const re = /<game filename="([^"]*)" sha1="([^"]*)">([\s\S]*?)<\/game>/g;
  let m, count = 0;
  while ((m = re.exec(xml))) {
    const body = m[3], tag = t => { const x = body.match(new RegExp("<" + t + ">([\\s\\S]*?)</" + t + ">")); return x ? un(x[1].trim()) : ""; };
    const hw = tag("hardware").split(/\s+/).filter(l => /^(CHIPSET=AGA|NTSC=TRUE|CLOCK=|CPU_EXACT=TRUE|BLITTER=IMMEDIATE|PRIMARY_CONTROL=MOUSE|PORT1=CD32|PORT0=CD32)/.test(l)).join(" ");
    const entry = tag("name") + "|" + hw;
    byName[un(m[1]).toLowerCase()] = entry;
    if (m[2]) bySha[m[2].toLowerCase()] = entry;
    const slave = tag("slave_default").toLowerCase();
    if (slave) bySlave[slave] = bySlave[slave] === undefined || bySlave[slave] === entry ? entry : bySlave[slave].split("|")[1] === hw ? entry : "";
    count++;
  }
  return { byName, bySha, bySlave, count };
}
async function whdDb() {
  if (whdDbMem) return whdDbMem;
  try { whdDbMem = await DB.get(WHDDB_ID) || null; } catch (e) {}
  return whdDbMem;
}
/* Téléchargement (en arrière-plan, ou attendu au plus `wait` ms au lancement d'un jeu) */
function updateWhdDb(force) {
  if (whdDbLoading) return whdDbLoading;
  whdDbLoading = (async () => {
    const cur = await whdDb();
    if (cur && !force && Date.now() - cur.ts < WHDDB_MAX_AGE) return cur;
    const res = await fetch(WHDDB_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error("base WHDLoad indisponible (" + res.status + ")");
    const db = parseWhdDb(await res.text());
    if (db.count < 1000) throw new Error("base WHDLoad incomplète");
    const rec = Object.assign({ id: WHDDB_ID, kind: "whddb", name: "Base de réglages WHDLoad", ts: Date.now(), added: Date.now() }, db);
    await DB.put(rec); whdDbMem = rec;
    renderWhdDbStatus();
    return rec;
  })().finally(() => { whdDbLoading = null; });
  return whdDbLoading;
}
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);

async function sha1Hex(blob) {
  const h = await crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}
/* Réglages d'un jeu : { title, tags, e (réglages), opts (options du cœur), cd32, mouse, how } ou null */
async function whdConfigFor(rec) {
  const db = await whdDb(); if (!db) return null;
  let entry = db.byName[rec.name.replace(/\.(lha|lzh)$/i, "").toLowerCase()], how = "nom";
  if (!entry && crypto.subtle) {
    if (!rec.sha1) { try { rec.sha1 = await sha1Hex(rec.blob); } catch (e) {} }
    if (rec.sha1) { entry = db.bySha[rec.sha1]; how = "empreinte"; }
  }
  if (!entry && rec.slave) { entry = db.bySlave[rec.slave.split("/").pop().toLowerCase()]; how = "slave"; }
  if (!entry) return null;
  const [title, hw] = [entry.slice(0, entry.indexOf("|")), entry.slice(entry.indexOf("|") + 1)];
  const has = k => hw.split(" ").some(x => x === k || x.startsWith(k + "="));
  const val = k => { const x = hw.split(" ").find(x => x.startsWith(k + "=")); return x ? x.slice(k.length + 1) : null; };
  const conf = { title, how, tags: [], e: {}, opts: {}, cd32: false, mouse: false };
  if (has("CHIPSET")) conf.tags.push("AGA");
  if (has("NTSC")) { conf.e.region = "ntsc"; conf.tags.push("NTSC"); }
  const clock = val("CLOCK");
  if (clock === "MAX") { conf.e.cpu = "max"; conf.tags.push("processeur rapide"); }
  else if (clock && +clock > 14) { conf.e.accel = "030"; conf.tags.push("68030"); }
  if (has("CPU_EXACT")) { conf.e.compat = "max"; conf.tags.push("cycle exact"); }
  if (has("BLITTER")) conf.opts.puae_immediate_blits = "immediate";
  if (has("PORT1") || has("PORT0")) { conf.cd32 = true; conf.tags.push("manette CD32"); }
  if (has("PRIMARY_CONTROL")) { conf.mouse = true; conf.tags.push("souris"); }
  return conf;
}
/* Au lancement : réglages trouvés, rangés avec le jeu (ils servent aussi après le rechargement de la page) */
async function prepareWhdConfig(rec) {
  if (!(await whdDb())) { toast("Téléchargement de la base de réglages WHDLoad…"); await withTimeout(updateWhdDb().catch(() => null), 8000); }
  else updateWhdDb().catch(() => {}); /* rafraîchie en arrière-plan si elle a plus de 30 jours */
  const conf = await whdConfigFor(rec);
  rec.whdCfg = conf || null; rec.whdCfgTs = Date.now();
  await DB.put(rec);
  return conf;
}
{ const _l = launchWhd; launchWhd = async rec => {
    if (running || starting) return;
    if (S.romId !== "aros" && await DB.get(S.romId)) await prepareWhdConfig(rec);
    return _l(rec);
  }; }
/* À l'import : base chargée en arrière-plan, pour afficher tout de suite ce que le jeu demande */
{ const _i = importWhd; importWhd = async (name, u8) => {
    const rec = await _i(name, u8);
    if (rec && !rec.whdCfgTs) updateWhdDb().then(async () => { const r = await DB.get(rec.id); if (r && !r.whdCfgTs) { r.whdCfg = await whdConfigFor(r); r.whdCfgTs = Date.now(); await DB.put(r); } }).catch(() => {});
    return rec;
  }; }
const whdTags = rec => rec && rec.whdCfg && rec.whdCfg.tags.length ? rec.whdCfg.tags.join(", ") : "";

/* Réglages : état de la base et mise à jour */
async function renderWhdDbStatus() {
  const el = $("#whdDbStatus"); if (!el) return;
  const db = await whdDb();
  el.textContent = db ? db.count.toLocaleString("fr-FR") + " jeux, mise à jour le " + new Date(db.ts).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : "pas encore téléchargée (elle le sera au premier jeu WHDLoad)";
}
$("#whdDbUpdate").onclick = async () => {
  const b = $("#whdDbUpdate"); b.disabled = true; $("#whdDbStatus").textContent = "téléchargement…";
  try {
    await updateWhdDb(true);
    /* Les jeux déjà rangés reprennent leurs réglages */
    for (const r of (await DB.all()).filter(x => x.kind === "whd")) { r.whdCfg = await whdConfigFor(r); r.whdCfgTs = Date.now(); await DB.put(r); }
    toast("Base de réglages WHDLoad à jour.");
  } catch (e) { toast("Mise à jour impossible : " + (e.message || e), true); }
  b.disabled = false; renderWhdDbStatus();
};
renderWhdDbStatus();
