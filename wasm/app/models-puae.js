/* =========================================================
   Autres modèles avec le cœur WinUAE 6 : A600, A3000, A4000, CDTV
   =========================================================
   Leur Kickstart est choisi tout seul dans la Bibliothèque : d'abord une ROM faite pour ce modèle (reconnue par son
   empreinte, d'après la table des ROM d'Amiberry), sinon une ROM voisine, sinon celle de l'A1200, sinon AROS.
   Le CDTV demande en plus sa ROM d'extension (256 Ko) et un vrai Kickstart (1.3 de préférence). */

/* Ce que la table dit d'une ROM de la Bibliothèque : { name, models: [...], kind: "kick"|"cdtvext" } ou null (mis en cache) */
async function kickInfo(r) {
  if (r.kdb === undefined) {
    let info = null;
    try {
      const p = await plainRomBytes(new Uint8Array(await r.blob.arrayBuffer()));
      const e = p && KICK_DB[crc32u8(p)];
      if (e) info = { name: e[0], models: e[1].split(" "), kind: e[2] };
    } catch (x) {}
    r.kdb = info; await DB.put(r);
  }
  return r.kdb;
}
/* Modèles de la table que chaque modèle accepte, du meilleur au moins bon */
const MODEL_ROMS = {
  a600: [["A600", "A600HD"]],
  a3000: [["A3000"], ["A4000", "A4000T"]],
  a4000: [["A4000", "A4000T"], ["A3000"]],
  cdtv: [["A500", "A1000", "A2000"]]
};
async function romForModel(model, all) {
  all = all || await DB.all();
  const roms = all.filter(r => r.kind === "rom" && !r.cd32).sort((a, b) => a.added - b.added);
  for (const group of MODEL_ROMS[model] || []) {
    const hits = [];
    for (const r of roms) { const k = await kickInfo(r); if (k && k.kind === "kick" && k.models.some(m => group.includes(m))) hits.push([r, k]); }
    /* CDTV : le 1.3 d'abord (celui de la vraie console) */
    if (model === "cdtv") hits.sort((a, b) => (/v1\.3/.test(b[1].name) ? 1 : 0) - (/v1\.3/.test(a[1].name) ? 1 : 0));
    if (hits.length) return hits[0][0].id;
  }
  if (model === "cdtv") { const id = await romFor500(all); return id; } /* un 1.x ou 2.0x reconnu par sa version */
  if (S.romId && S.romId !== "aros" && roms.some(r => r.id === S.romId)) return S.romId; /* celui de l'A1200 */
  return "aros";
}
async function cdtvExtRom() {
  for (const r of (await DB.all()).filter(x => x.kind === "rom")) {
    const k = await kickInfo(r);
    if (k && k.kind === "cdtvext") return plainRomBytes(new Uint8Array(await r.blob.arrayBuffer()));
  }
  return null;
}
/* Libellé du Kickstart qu'utilisera un modèle (accueil, réglages) */
async function modelRomLabel(model, all) {
  all = all || await DB.all();
  const id = await romForModel(model, all), r = all.find(x => x.id === id);
  let t = r ? (r.label || r.name) : "AROS (Kickstart libre)";
  if (model === "cdtv") t += (await cdtvExtRom()) ? " + extension CDTV" : " — il manque la ROM d'extension du CDTV";
  return t;
}

/* Import : une ROM faite pour un autre modèle (A600, A3000, A4000, extension CDTV) rejoint la Bibliothèque sans devenir
   le Kickstart de l'A1200 */
{ const _ib = importBytes;
  importBytes = async (name, u8, target, mount, quiet) => {
    if (guessKind(name, u8) === "rom") {
      const p = await plainRomBytes(u8), e = p && KICK_DB[crc32u8(p)];
      if (e && (e[2] === "cdtvext" || !/A1200|A500\b|A1000|A2000/.test(e[1]))) {
        if ((await DB.all()).some(r => r.kind === "rom" && r.crc === crc32u8(u8))) { if (!quiet) toast(name + " est déjà dans la Bibliothèque."); return null; }
        const rec = { id: newId(), kind: "rom", name, size: u8.length, blob: new Blob([u8]), crc: crc32u8(u8), added: Date.now(), label: e[0],
          kdb: { name: e[0], models: e[1].split(" "), kind: e[2] }, cd32: false };
        await DB.put(rec);
        const who = e[2] === "cdtvext" ? "au CDTV" : "à l'" + e[1].split(" ").map(m => "Amiga " + m.replace(/^A/, "")).filter((x, i, a) => a.indexOf(x) === i).join(" et à l'");
        if (!quiet) toast(e[0] + " ajoutée : elle servira " + who + ".");
        if (typeof renderRomChoices === "function") renderRomChoices();
        renderLauncherSoon();
        return rec;
      }
    }
    return _ib(name, u8, target, mount, quiet);
  }; }

/* Lancer un CD sur le CDTV : il faut la ROM d'extension */
{ const _l = launchCd;
  launchCd = async rec => {
    if (S.model === "cdtv" && !running && !starting && !(await cdtvExtRom())) {
      toast("Le CDTV a besoin de sa ROM d'extension (256 Ko) et d'un Kickstart 1.3 : importez-les (Réglages → Kickstart), puis touchez à nouveau le CD.", true);
      return;
    }
    return _l(rec);
  }; }

/* Réglages : le Kickstart retenu pour le modèle choisi */
async function renderModelRom() {
  const el = $("#modelRom"); if (!el) return;
  const m = S.model;
  el.hidden = !WINUAE_ONLY.has(m);
  if (WINUAE_ONLY.has(m)) el.textContent = "Kickstart de l'" + MODELS[m].name + " : " + await modelRomLabel(m);
}
$$('#winSettings input[name="model"]').forEach(i => i.addEventListener("change", () => setTimeout(renderModelRom)));
$("#btnSettings").addEventListener("click", () => setTimeout(renderModelRom));
