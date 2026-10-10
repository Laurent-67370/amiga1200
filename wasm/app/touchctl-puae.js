
/* =========================================================
   Commandes tactiles : joystick virtuel et barre de touches en plein écran
   ========================================================= */
let joyTouch = 0;                       /* directions et tir du joystick virtuel */
function sendJoy() { if (running && machine) machine.setJoy(0, joyKeys | joyTouch); }

(function touchControls() {
  const tube = $("#tube"), pad = $("#vjoy"), stick = $("#vjoyStick"), knob = $("#vjoyKnob");
  /* Les touchers sur les commandes ne doivent pas bouger la souris de l'Amiga */
  const shield = el => ["touchstart", "touchmove", "touchend", "touchcancel"].forEach(t => el.addEventListener(t, e => e.stopPropagation(), { passive: true }));
  [pad, $("#fsBar"), $("#vkbd")].forEach(shield);

  /* ---- Manche : 8 directions, zone morte au centre ---- */
  let stickId = null;
  const UP = 1 << 4, DOWN = 1 << 5, LEFT = 1 << 6, RIGHT = 1 << 7, DIRS = UP | DOWN | LEFT | RIGHT;
  const moveStick = t => {
    const r = stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const max = r.width / 2, d = Math.hypot(dx, dy);
    if (d > max) { dx *= max / d; dy *= max / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    let m = 0;
    if (d > max * 0.3) {
      const a = Math.atan2(dy, dx) * 180 / Math.PI; /* 0 = droite, 90 = bas */
      if (a > -67.5 && a < 67.5) m |= RIGHT;
      if (a > 22.5 && a < 157.5) m |= DOWN;
      if (a > 112.5 || a < -112.5) m |= LEFT;
      if (a > -157.5 && a < -22.5) m |= UP;
    }
    if ((joyTouch & DIRS) !== m) { joyTouch = (joyTouch & ~DIRS) | m; sendJoy(); }
  };
  const releaseStick = () => { stickId = null; knob.style.transform = ""; joyTouch &= ~DIRS; sendJoy(); };
  stick.addEventListener("touchstart", e => { e.preventDefault(); const t = e.changedTouches[0]; stickId = t.identifier; moveStick(t); }, { passive: false });
  stick.addEventListener("touchmove", e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === stickId) moveStick(t); }, { passive: false });
  const endStick = e => { for (const t of e.changedTouches) if (t.identifier === stickId) releaseStick(); };
  stick.addEventListener("touchend", endStick); stick.addEventListener("touchcancel", endStick);

  /* ---- Boutons de tir : bit 0 (tir), bit 8 (2e bouton) ---- */
  $$("#vjoy [data-fire]").forEach(b => {
    const bit = 1 << +b.dataset.fire;
    const on = e => { e.preventDefault(); b.classList.add("down"); joyTouch |= bit; sendJoy(); };
    const off = e => { e.preventDefault(); b.classList.remove("down"); joyTouch &= ~bit; sendJoy(); };
    b.addEventListener("touchstart", on, { passive: false });
    b.addEventListener("touchend", off, { passive: false }); b.addEventListener("touchcancel", off, { passive: false });
  });

  /* ---- Afficher le joystick : bouton « Joystick » (touches spéciales et barre plein écran) ---- */
  const setVjoy = v => {
    S.vjoy = v; saveSettings();
    pad.hidden = !v;
    $$("[data-vjoy]").forEach(b => b.setAttribute("aria-pressed", v ? "true" : "false"));
    if (!v) { joyTouch = 0; sendJoy(); }
  };
  $$("[data-vjoy]").forEach(b => b.onclick = () => setVjoy(!S.vjoy));
  setVjoy(!!S.vjoy && isTouch);

  /* ---- Barre plein écran : clavier, joystick, touches courantes ---- */
  $$("#fsBar [data-tap]").forEach(b => b.onclick = () => tap(b.dataset.tap.split("+")));
  $("#fsKbd").onclick = () => { setKeyboardOpen(!S.kbdOpen); placeKeyboard(); };
  /* En plein écran, seul l'écran est affiché : le clavier à l'écran vient se poser dessus, puis reprend sa place */
  const kbd = $("#vkbd"), home = kbd.parentNode, after = kbd.nextSibling;
  function placeKeyboard() {
    const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (fs && kbd.parentNode !== tube) tube.appendChild(kbd);
    else if (!fs && kbd.parentNode === tube) home.insertBefore(kbd, after);
    $("#fsKbd").setAttribute("aria-pressed", S.kbdOpen ? "true" : "false");
    /* Le joystick se pose au-dessus du clavier quand les deux sont ouverts */
    pad.style.bottom = kbd.parentNode === tube && !kbd.hidden ? kbd.offsetHeight + "px" : "";
  }
  document.addEventListener("fullscreenchange", placeKeyboard); document.addEventListener("webkitfullscreenchange", placeKeyboard);
})();
