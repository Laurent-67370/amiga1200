/* =========================================================
   Habillage selon le modèle (A1200 : Workbench 3.1, A500 : Workbench 1.3)
   ========================================================= */
/* Coche du logo Amiga : cinq bandes parallèles aux couleurs de l'arc-en-ciel */
const AMIGA_TICK = '<svg class="amiga-tick" viewBox="0 0 34 20" aria-hidden="true">'
  + ["#e4252c", "#f7931e", "#ffd400", "#3aaa35", "#1a8fd8"].map((c, i) =>
    `<path d="M${2 + i * 2.2} ${9 - i * 0.6}l${6} ${7}l${16} ${-14}" fill="none" stroke="${c}" stroke-width="2.3" stroke-linejoin="miter"/>`).join("") + "</svg>";
/* Boing Ball : damier rouge et blanc sur une sphère */
const BOING = '<svg class="boing" viewBox="0 0 40 40" aria-hidden="true"><defs>'
  + '<clipPath id="bbClip"><circle cx="20" cy="20" r="18"/></clipPath>'
  + '<pattern id="bbChk" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#fff"/><rect width="5" height="5" fill="#e4252c"/><rect x="5" y="5" width="5" height="5" fill="#e4252c"/></pattern>'
  + '<radialGradient id="bbShade" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient></defs>'
  + '<g clip-path="url(#bbClip)"><rect x="-10" y="-10" width="60" height="60" fill="url(#bbChk)" transform="rotate(-18 20 20) scale(1.05 1)"/>'
  + '<circle cx="20" cy="20" r="18" fill="url(#bbShade)"/></g><circle cx="20" cy="20" r="18" fill="none" stroke="rgba(0,0,0,.35)"/></svg>';

let themeModel = null;
function applyModelTheme(model) {
  model = model === "a500" ? "a500" : "a1200";
  if (model === themeModel) return;
  themeModel = model;
  document.documentElement.dataset.model = model;
  const label = model === "a500" ? "AMIGA 500" : "AMIGA 1200";
  const brand = $(".monitor-foot .brand"), name = $(".wedge .name");
  if (brand) { const led = $("#monLed"); brand.innerHTML = AMIGA_TICK + label; if (led) brand.appendChild(led); }
  if (name) name.innerHTML = AMIGA_TICK + label;
  const wedge = $(".wedge"); if (wedge) wedge.setAttribute("aria-label", "Boîtier " + (model === "a500" ? "Amiga 500" : "Amiga 1200"));
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = model === "a500" ? "#0b3a73" : "#2b303b";
}
/* Le modèle qui tourne (réglages effectifs, profil compris), sinon celui choisi pour le prochain allumage */
const themeNow = () => applyModelTheme(running || starting ? modelOf(E) : S.model);
{ const _r = renderLauncher; renderLauncher = async () => { await _r(); themeNow(); decorateLauncher(); }; }
{ const _s = onStarted; onStarted = (...a) => { _s(...a); themeNow(); }; }
$$('#winSettings input[name="model"]').forEach(i => i.addEventListener("change", () => setTimeout(themeNow)));
/* Accueil : Boing Ball devant le titre */
function decorateLauncher() {
  const h = $("#lTitle"); if (h && !h.querySelector(".boing")) h.insertAdjacentHTML("afterbegin", BOING);
}
themeNow();
