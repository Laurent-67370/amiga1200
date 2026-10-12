/* =========================================================
   Disquettes IPF (Software Preservation Society)
   =========================================================
   Une image .ipf est convertie à l'import, dans la page, en flux SCP (SuperCard Pro) que les deux cœurs lisent :
   cellules MFM avec leur minutage (protections à densité variable) et, pour les pistes à bits faibles, trois tours de
   disque tirés différemment. Le convertisseur (ipf.js, avec la bibliothèque CAPS de la SPS, licence non commerciale)
   est un module à part, téléchargé au premier .ipf. Le flux est rangé compressé (.scp.gz) dans la Bibliothèque ;
   les fichiers .scp (SuperCard Pro, Greaseweazle) s'importent aussi tels quels. */
let ipfMod = null;
function ipfConverter() {
  if (!ipfMod) ipfMod = (async () => { if (!window.createIpf) await loadScript("ipf.js"); return window.createIpf(); })()
    .catch(e => { ipfMod = null; throw e; });
  return ipfMod;
}
async function ipfToScp(u8) {
  const M = await ipfConverter();
  const p = M._malloc(u8.length); M.HEAPU8.set(u8, p);
  const r = M._ipf_to_scp(p, u8.length); M._free(p);
  if (!r) throw new Error(M.UTF8ToString(M._ipf_error()));
  const scp = M.HEAPU8.slice(r, r + M._ipf_size()); M._free(r);
  return { scp, revs: M._ipf_revs(), flakey: !!M._ipf_flakey(), tracks: M._ipf_tracks() };
}
const isGz = u8 => u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b;
async function gzipBytes(u8) {
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
}
{ const _g = guessKind; guessKind = (name, u8) => /\.(ipf|scp)(\.gz)?$/i.test(name) ? "adf" : _g(name, u8); }
{ const _ib = importBytes;
  importBytes = async (name, u8, target, mount, quiet) => {
    if (/\.ipf$/i.test(name)) {
      let c;
      try { if (!quiet) toast("Conversion de " + name + " (disquette IPF)…"); c = await ipfToScp(u8); }
      catch (e) { toast(name + " : " + (e && e.message ? e.message : e), true); return null; }
      const rec = await _ib(name.replace(/\.ipf$/i, ".scp.gz"), await gzipBytes(c.scp), target, mount, true);
      if (rec && !quiet) toast(name + " convertie (" + c.tracks + " pistes" + (c.flakey ? ", bits faibles sur trois tours" : "")
        + ") et rangée dans la Bibliothèque" + (mount ? ", insérée" : "") + ". Disquette protégée en écriture, comme avec WinUAE.");
      return rec;
    }
    if (/\.scp$/i.test(name)) { if (!isGz(u8)) u8 = await gzipBytes(u8); name += ".gz"; }
    return _ib(name, u8, target, mount, quiet);
  }; }
