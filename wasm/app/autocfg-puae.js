/* =========================================================
   Configuration automatique : disquettes de jeu et commandes tactiles
   =========================================================
   Une disquette sans profil est examinée au démarrage : les étiquettes de son nom (collections TOSEC et autres :
   « AGA », « OCS », « A500 », « NTSC »…) puis son contenu (bloc de démarrage, système de fichiers, Workbench, code
   qui règle le FMODE de l'AGA). Un jeu à chargeur propre (pas de système de fichiers) ou en OFS sans Workbench démarre en A500 avec un
   Kickstart 1.x (sans Kickstart 1.x dans la Bibliothèque : A1200 sans mémoire Fast), un jeu AGA en A1200.
   Un profil enregistré à la main passe toujours devant. Sur écran tactile, le joystick virtuel apparaît pour un
   jeu au joystick et s'efface pour un jeu à la souris ; un choix fait pendant la partie est retenu pour ce jeu. */
const AUTO_V = 1;

/* Étiquettes du nom de fichier : « Jeu (1991)(Éditeur)(AGA)[cr].adf », « Jeu_AGA.adf », « Jeu (USA).adf »… */
function autoNameTags(name) {
  const n = " " + name.replace(/\.[a-z0-9]+(\.gz)?$/i, "").replace(/[_\-.,()[\]{}+]/g, " ") + " ";
  const has = re => re.test(n);
  return {
    aga: has(/\sAGA\s/i), a1200: has(/\sA1200\s/i), cd32: has(/\sCD32\s/i),
    a500: has(/\s(OCS|A500|A1000|A2000)\s/i), ecs: has(/\s(ECS|A500\+|A600)\s/i),
    ntsc: has(/\s(NTSC|USA|US)\s/), pal: has(/\s(PAL|Europe|EU|UK|Germany|France|Italy|Spain)\s/i)
  };
}
/* Contenu d'une image .adf (880 Ko ou 1,76 Mo) */
function autoAdfFacts(u8) {
  const f = { dos: null, fs: false, wb: false, vol: "", agaCode: false, agaText: false };
  if (!u8 || (u8.length !== 901120 && u8.length !== 1802240)) return f;
  if (u8[0] === 0x44 && u8[1] === 0x4f && u8[2] === 0x53 && u8[3] <= 7) f.dos = u8[3]; /* « DOS » + 0 (OFS) à 7 */
  const be32 = o => ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0;
  const bstr = o => String.fromCharCode(...u8.subarray(o + 1, o + 1 + Math.min(u8[o], 30)));
  if (f.dos !== null) {
    const blocks = u8.length / 512, root = (blocks / 2) * 512;
    if (be32(root) === 2 && be32(root + 508) === 1) { /* T_HEADER, ST_ROOT */
      f.fs = true; f.vol = bstr(root + 432);
      const names = new Set();
      for (let i = 6; i < 78; i++) {
        let b = be32(root + i * 4);
        for (let guard = 0; b > 1 && b < blocks && guard < 64; guard++) { names.add(bstr(b * 512 + 432).toLowerCase()); b = be32(b * 512 + 496); }
      }
      f.wb = ["c", "libs", "devs", "s"].every(x => names.has(x)) && (names.has("prefs") || names.has("system") || names.has("utilities") || names.has("tools") || /workbench|extras|install|fonts|locale|storage/i.test(f.vol));
    }
  }
  /* Code AGA : move.w #imm,$dff1fc ou move.w #imm,$1fc(An) (FMODE n'existe que sur l'AGA) */
  for (let i = 0; i + 8 <= u8.length; i += 2) {
    const op = (u8[i] << 8) | u8[i + 1];
    if (op === 0x33fc && u8[i + 4] === 0x00 && u8[i + 5] === 0xdf && u8[i + 6] === 0xf1 && u8[i + 7] === 0xfc) { f.agaCode = true; break; }
    if ((op & 0xf1ff) === 0x317c && u8[i + 4] === 0x01 && u8[i + 5] === 0xfc && ((op >> 9) & 7) === 6) { f.agaCode = true; break; }
  }
  /* « AGA » dans un texte lisible (« AGA only », « requires AGA ») */
  const txt = new TextDecoder("latin1").decode(u8);
  f.agaText = /[ -~]{4}[^A-Za-z]AGA[^A-Za-z][ -~]{4}/.test(txt);
  return f;
}
/* Verdict : { profile, why, kind } ou null (réglages généraux) */
function autoVerdict(name, facts) {
  const t = autoNameTags(name), p = {};
  let why = null, kind = null;
  if (t.aga || t.a1200 || facts.agaCode || facts.agaText) {
    Object.assign(p, { model: "a1200" }); kind = "aga";
    why = t.aga || t.a1200 ? "jeu AGA d'après son nom" : facts.agaCode ? "code AGA sur la disquette" : "jeu AGA d'après son texte";
  } else if (t.a500) {
    Object.assign(p, { model: "a500", fast: "0", accel: "none", cpu: "orig" }); kind = "a500"; why = "jeu A500 d'après son nom";
  } else if (facts.size && !facts.fs) {
    Object.assign(p, { model: "a500", fast: "0", accel: "none", cpu: "orig" }); kind = "a500"; why = "disquette de jeu à chargeur propre, sans fichiers AmigaDOS";
  } else if (facts.dos === 0 && !facts.wb) {
    Object.assign(p, { model: "a500", fast: "0", accel: "none", cpu: "orig" }); kind = "a500"; why = "disquette OFS, le format de l'A500, sans Workbench";
  } else if (facts.wb) kind = "wb";
  if (t.ntsc && !t.pal) { p.region = "ntsc"; why = (why ? why + ", " : "") + "version NTSC"; }
  return why ? { profile: p, why, kind } : kind ? { profile: null, why: null, kind } : null;
}
/* Verdict d'une disquette de la Bibliothèque, gardé avec elle */
async function autoFor(rec) {
  if (!rec || rec.kind !== "adf") return null;
  if (rec.auto && rec.auto.v === AUTO_V) return rec.auto.r;
  let facts = { size: 0 };
  try {
    let u8 = new Uint8Array(await rec.blob.arrayBuffer());
    if (u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b) u8 = new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
    facts = Object.assign(autoAdfFacts(u8), { size: u8.length === 901120 || u8.length === 1802240 ? u8.length : 0 });
  } catch (e) {}
  const r = autoVerdict(rec.name, facts);
  rec.auto = { v: AUTO_V, r };
  try { await DB.put(rec); } catch (e) {}
  return r;
}
const AUTO_LABEL = { a500: "Amiga 500, Kickstart 1.x, sans mémoire Fast", aga: "Amiga 1200 (AGA)" };

{ const _es = effectiveSettings;
  effectiveSettings = async () => {
    const e = await _es();
    autoNow = null;
    if (e._profile || S.autoCfg === false || !mounted.df0) return e;
    const rec = await DB.get(mounted.df0.id), v = await autoFor(rec);
    autoNow = v;
    if (!v || !v.profile) return e;
    const p = Object.assign({}, v.profile);
    let why = v.why, label = AUTO_LABEL[v.kind] || "";
    /* Pas de Kickstart 1.x : l'A500 démarrerait sur AROS, moins compatible qu'un A1200 sans mémoire Fast */
    if (p.model === "a500" && await romFor500() === "aros") { p.model = "a1200"; label = "Amiga 1200 sans mémoire Fast, faute de Kickstart 1.3 dans la Bibliothèque"; }
    Object.assign(e, p); e._profile = "automatique";
    setTimeout(() => toast("Configuration automatique : " + label + (p.region === "ntsc" ? ", NTSC" : "") + ". Raison : " + why + ". Le bouton Profil du lecteur permet de la changer."), 1500);
    return e;
  }; }
let autoNow = null; /* verdict de la session en cours (commandes tactiles) */

/* Profil : la configuration automatique sert de point de départ */
{ const _o = openProfile;
  openProfile = async tag => {
    await _o(tag);
    const m = mounted[tag], rec = m && await DB.get(m.id);
    if (!rec || rec.profile) return;
    const v = await autoFor(rec);
    if (!v || !v.profile) return;
    for (const [k, val] of Object.entries(v.profile)) $$('#winProfile input[name="p_' + k + '"]').forEach(i => i.checked = i.value === String(val));
    $("#profIntro").textContent = rec.name + " — configuration automatique : " + v.why + ".";
    if (typeof profileModelUi === "function") profileModelUi();
  }; }

/* Réglage : configuration automatique activée ou non */
{ const c = $("#optAutoCfg");
  if (c) { c.checked = S.autoCfg !== false; c.onchange = () => { S.autoCfg = c.checked; saveSettings(); }; } }

/* ---- Commandes tactiles : joystick virtuel ou pavé tactile selon le jeu ---- */
function autoGameRec() { return whdGame ? whdGame.id : mounted.df0 ? mounted.df0.id : mounted.dh0 ? mounted.dh0.id : null; }
async function autoTouchMode() {
  const id = autoGameRec(); if (!id || cdGame) return null;
  const rec = await DB.get(id); if (!rec) return null;
  if (rec.touchCtl) return { mode: rec.touchCtl, why: "votre choix pour ce jeu" };
  if (rec.kind === "whd") return rec.whdCfg && rec.whdCfg.mouse ? { mode: "mouse", why: "jeu à la souris d'après la base WHDLoad" } : { mode: "joy", why: "" };
  if (rec.kind === "hdf") return { mode: "mouse", why: "" };
  const v = E._profile === "automatique" || !rec.profile ? autoNow || await autoFor(rec) : null;
  if (v && v.kind === "wb") return { mode: "mouse", why: "" };
  if (v && (v.kind === "a500" || v.kind === "aga")) return { mode: "joy", why: "" };
  return null;
}
{ const _p = setPowerUi;
  setPowerUi = st => {
    _p(st);
    if (!isTouch || typeof vjoyShow !== "function") return;
    if (st === "on") autoTouchMode().then(m => {
      if (!m || !running) return;
      vjoyShow(m.mode === "joy", true);
      if (m.mode === "mouse" && m.why) toast("Ce jeu se joue à la souris (" + m.why + ") : un doigt la déplace, une touche clique. Le bouton Joystick fait revenir le joystick.");
    }).catch(() => {});
    else if (st === "off") vjoyShow(!!S.vjoy, true);
  }; }
/* Joystick affiché ou masqué pendant une partie : retenu pour ce jeu */
async function autoRememberTouch(visible) {
  const id = running && autoGameRec(); if (!id) return;
  const rec = await DB.get(id); if (!rec) return;
  rec.touchCtl = visible ? "joy" : "mouse"; await DB.put(rec);
  toast((visible ? "Joystick" : "Souris (pavé tactile)") + " retenu pour " + rec.name.replace(/\.(adf|adz|dms|hdf|lha|lzh)$/i, "") + ".");
}
