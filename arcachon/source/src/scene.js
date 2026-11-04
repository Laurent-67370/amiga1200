import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createChurch } from './church.js';

const SEED = 20261104;
function mulberry32(a) { return function () { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = mulberry32(SEED);
const container = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const HORIZON = new THREE.Color(0xd8e1df);
scene.background = HORIZON;
scene.fog = new THREE.Fog(HORIZON, 95, 245);
const camera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, .15, 650);
camera.position.set(50, 34, 72);
if (innerWidth / innerHeight < .75) camera.position.set(64, 40, 88);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 14, -4);
controls.enableDamping = true;
controls.dampingFactor = .065;
controls.minDistance = 18;
controls.maxDistance = 125;
controls.maxPolarAngle = Math.PI / 2 - .025;
controls.minPolarAngle = .16;
controls.autoRotateSpeed = .48;
controls.zoomToCursor = true;
controls.update();

// Ciel procédural, lumière chaude principale et remplissage froid.
const skyUniforms = {
  topColor: { value: new THREE.Color(0x77a8c2) },
  horizonColor: { value: HORIZON.clone() },
  sunColor: { value: new THREE.Color(0xfff0cf) },
  sunDirection: { value: new THREE.Vector3(-.48, .64, .45).normalize() },
};
const sky = new THREE.Mesh(new THREE.SphereGeometry(360, 32, 20), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, uniforms: skyUniforms,
  vertexShader: 'varying vec3 vDir; void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: `varying vec3 vDir; uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunColor; uniform vec3 sunDirection;
  void main(){float h=clamp(vDir.y,0.0,1.0);vec3 col=mix(horizonColor,topColor,pow(h,0.55));float s=max(dot(normalize(vDir),sunDirection),0.0);col+=sunColor*(pow(s,650.0)*0.8+pow(s,24.0)*0.12+pow(s,4.0)*0.035);gl_FragColor=vec4(col,1.0);}`
}));
scene.add(sky);
const hemi = new THREE.HemisphereLight(0xc6dfeb, 0x756655, 1.55); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe6c4, 3.15);
sun.position.set(-42, 65, 38); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -48; sun.shadow.camera.right = 48; sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -45;
sun.shadow.camera.near = 8; sun.shadow.camera.far = 155; sun.shadow.normalBias = .045; sun.shadow.bias = -.00015;
sun.target.position.set(0, 8, -6); scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xb6d3e0, .7); fill.position.set(45, 24, -32); scene.add(fill);
const bounce = new THREE.DirectionalLight(0xe1c3a1, .24); bounce.position.set(0, -12, 15); scene.add(bounce);

const groundMat = new THREE.MeshStandardMaterial({ color: 0x9da38f, roughness: 1 });
const ground = new THREE.Mesh(new THREE.CircleGeometry(350, 72), groundMat);
ground.rotation.x = -Math.PI / 2; ground.position.y = -.07; ground.receiveShadow = true; scene.add(ground);
function box(w, h, d, x, y, z, material, parent = scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
const plazaMat = new THREE.MeshStandardMaterial({ color: 0x9d7b70, roughness: .96 });
const plaza = box(74, .12, 60, 0, -.005, -1, plazaMat); plaza.castShadow = false;
const pathMat = new THREE.MeshStandardMaterial({ color: 0xc4b8a5, roughness: .95 });
box(26, .07, 6.5, 0, .075, 19.5, pathMat).castShadow = false;
const roadMat = new THREE.MeshStandardMaterial({ color: 0x555b5a, roughness: .97 });
box(170, .10, 20, 0, -.005, 35, roadMat).castShadow = false;
for (let i = -4; i <= 4; i++) box(3.4, .025, .38, i * 6.0, .065, 27.2, pathMat).castShadow = false;
// Bandes latérales de pelouse.
const grassMat = new THREE.MeshStandardMaterial({ color: 0x718064, roughness: 1 });
for (const side of [-1, 1]) box(15, .15, 48, side * 25, .02, -7, grassMat).castShadow = false;

const { church, hotspots } = createChurch(); scene.add(church);

// Mobilier urbain simple et familier.
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x262e2c, roughness: .55, metalness: .5 });
const wood = new THREE.MeshStandardMaterial({ color: 0x9c4f3e, roughness: .82 });
const paleStone = new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: .9 });
const lampGlass = new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffc46b, emissiveIntensity: .35, roughness: .28 });
function lamp(x, z, scale = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale); scene.add(g);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.085, .14, 5.8, 10), darkMetal); pole.position.y = 2.9; pole.castShadow = true; g.add(pole);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 5.7, 0), new THREE.Vector3(.1, 6.3, 0), new THREE.Vector3(.8, 6.5, 0), new THREE.Vector3(1.35, 6.0, 0)]);
  const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, .065, 7, false), darkMetal); arm.castShadow = true; g.add(arm);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(.24, .34, .65, 6), lampGlass); lantern.position.set(1.35, 5.63, 0); lantern.castShadow = true; g.add(lantern);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(.42, .28, 6), darkMetal); cap.position.set(1.35, 6.08, 0); g.add(cap);
}
lamp(-15.5, 13.0); lamp(16.0, 11.0); lamp(-20, -22, .9);
function bench(x, z, rotation = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotation; scene.add(g);
  for (const sx of [-1, 1]) box(.18, .72, .72, sx * 1.05, .38, 0, paleStone, g);
  for (let i = 0; i < 4; i++) box(2.5, .09, .13, 0, .76, -.25 + i * .17, wood, g);
  for (let i = 0; i < 3; i++) { const slat = box(2.5, .13, .09, 0, 1.0 + i * .18, -.37, wood, g); slat.rotation.x = -.12; }
}
bench(20, 8, -Math.PI / 2); bench(-20, 4, Math.PI / 2);

// Platanes stylisés : troncs, branches et couronnes irrégulières.
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x756b56, roughness: 1 });
const leafMats = [0x667f4d, 0x7e8b50, 0x929358, 0x536f48].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .96, flatShading: true }));
function tree(x, z, height = 13, spread = 4.4) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.34, .57, height * .67, 9), trunkMat); trunk.position.y = height * .335; trunk.castShadow = true; g.add(trunk);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + rand() * .6;
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(.11, .23, height * .38, 7), trunkMat);
    branch.position.set(Math.cos(a) * spread * .24, height * .63, Math.sin(a) * spread * .24);
    branch.rotation.z = Math.cos(a) * .62; branch.rotation.x = -Math.sin(a) * .62; branch.castShadow = true; g.add(branch);
  }
  for (let i = 0; i < 13; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * spread * .72;
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(spread * (.42 + rand() * .18), 1), leafMats[Math.floor(rand() * leafMats.length)]);
    leaf.position.set(Math.cos(a) * r, height * .77 + (rand() - .35) * spread, Math.sin(a) * r);
    leaf.scale.y = .75 + rand() * .3; leaf.rotation.set(rand(), rand(), rand()); leaf.castShadow = true; leaf.receiveShadow = true; g.add(leaf);
  }
}
tree(-23, 12, 14, 4.6); tree(32, 5, 15, 4.8); tree(-25, -25, 14, 4.4); tree(23, -29, 13, 4.1);

// Quelques volumes urbains au loin pour donner de la profondeur sans concurrencer l’église.
const wallMats = [0xc5b9a7, 0xd0c8b9, 0xbfb7a9].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .95 }));
const roofMat = new THREE.MeshStandardMaterial({ color: 0x596164, roughness: .9 });
function cityBlock(x, z, w, d, h, material) {
  box(w, h, d, x, h / 2, z, material);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) * .53, 2.8, 4), roofMat); roof.position.set(x, h + 1.4, z); roof.rotation.y = Math.PI / 4; roof.scale.set(w / Math.hypot(w, d), 1, d / Math.hypot(w, d)); roof.castShadow = true; scene.add(roof);
}
cityBlock(-47, -25, 18, 14, 11, wallMats[0]); cityBlock(48, -35, 20, 16, 12, wallMats[1]);
cityBlock(-58, 10, 15, 13, 10, wallMats[2]); cityBlock(58, 7, 18, 14, 10, wallMats[0]);
cityBlock(-24, -65, 22, 16, 13, wallMats[1]); cityBlock(27, -70, 20, 15, 11, wallMats[2]);

const views = {
  overview: { position: [50, 34, 72], target: [0, 15, -4] },
  parvis: { position: [2, 9.5, 39], target: [0, 12.8, 5] },
  clocher: { position: [22, 29, 45], target: [0, 28, 5.3] },
  rosace: { position: [42, 17, -1], target: [13, 12, -16] },
};
const details = {
  parvis: { kicker: 'Bienvenue', title: 'Le parvis', text: 'Le large escalier de pierre mène au portail principal. Ses ogives superposées, ses colonnettes et ses portes sombres structurent l’entrée de l’église.', view: 'parvis' },
  clocher: { kicker: 'Le repère', title: 'Le clocher', text: 'La tour associe la brique rouge à des chaînages de pierre claire. Au-dessus de l’horloge, les baies jumelées précèdent les pinacles et la grande flèche octogonale.', view: 'clocher' },
  rosace: { kicker: 'La lumière', title: 'La rosace', text: 'Sur le transept, la rosace compose un motif rayonnant de huit pétales. Son cercle de pierre contraste délicatement avec le mur de brique.', view: 'rosace' },
};
let cameraTween = null;
function setView(name) {
  const v = views[name]; if (!v) return;
  const toTarget = new THREE.Vector3(...v.target), toPos = new THREE.Vector3(...v.position);
  if (name === 'overview' && innerWidth / innerHeight < .75) toPos.sub(toTarget).multiplyScalar(1.28).add(toTarget);
  cameraTween = { start: performance.now(), fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toPos, toTarget };
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
}
function openDetail(name) {
  const d = details[name]; if (!d) return;
  document.getElementById('card-kicker').textContent = d.kicker;
  document.getElementById('card-title').textContent = d.title;
  document.getElementById('card-text').textContent = d.text;
  document.getElementById('card-go').dataset.view = d.view;
  document.getElementById('detail-card').classList.add('open');
}
document.querySelectorAll('.view-btn').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
document.querySelectorAll('.hotspot').forEach(b => b.addEventListener('click', () => openDetail(b.dataset.hotspot)));
document.getElementById('detail-close').addEventListener('click', () => document.getElementById('detail-card').classList.remove('open'));
document.getElementById('card-go').addEventListener('click', e => { setView(e.currentTarget.dataset.view); document.getElementById('detail-card').classList.remove('open'); });
const rotateBtn = document.getElementById('rotate-btn');
rotateBtn.addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; rotateBtn.classList.toggle('active', controls.autoRotate); rotateBtn.setAttribute('aria-pressed', String(controls.autoRotate)); });
controls.addEventListener('start', () => { cameraTween = null; if (controls.autoRotate) { controls.autoRotate = false; rotateBtn.classList.remove('active'); rotateBtn.setAttribute('aria-pressed', 'false'); } });

let golden = false;
document.getElementById('light-btn').addEventListener('click', e => {
  golden = !golden; e.currentTarget.classList.toggle('active', golden);
  sun.color.set(golden ? 0xffb46f : 0xffe6c4); sun.intensity = golden ? 3.6 : 3.15;
  sun.position.set(golden ? -60 : -42, golden ? 30 : 65, golden ? 28 : 38);
  hemi.intensity = golden ? 1.05 : 1.55; fill.intensity = golden ? .48 : .7;
  const horizon = new THREE.Color(golden ? 0xe7c8ac : 0xd8e1df);
  skyUniforms.horizonColor.value.copy(horizon); skyUniforms.topColor.value.set(golden ? 0x7e8295 : 0x77a8c2);
  skyUniforms.sunColor.value.set(golden ? 0xffb36b : 0xfff0cf); skyUniforms.sunDirection.value.set(golden ? -.78 : -.48, golden ? .28 : .64, .45).normalize();
  scene.fog.color.copy(horizon); scene.background.copy(horizon); renderer.toneMappingExposure = golden ? .96 : 1.03;
  renderer.shadowMap.needsUpdate = true;
  draw(true);
});
document.getElementById('screenshot-btn').addEventListener('click', () => {
  draw(true);
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = 'notre-dame-arcachon-vue-3d.png';
  document.body.appendChild(a); a.click(); a.remove();
});
const drawer = document.getElementById('photo-drawer'), scrim = document.getElementById('scrim');
function photoDrawer(open) { drawer.classList.toggle('open', open); scrim.classList.toggle('open', open); drawer.setAttribute('aria-hidden', String(!open)); }
document.getElementById('photos-btn').addEventListener('click', () => photoDrawer(true));
document.getElementById('photos-close').addEventListener('click', () => photoDrawer(false)); scrim.addEventListener('click', () => photoDrawer(false));
const help = document.getElementById('help-dialog');
document.getElementById('help-btn').addEventListener('click', () => help.showModal());
document.getElementById('help-close').addEventListener('click', () => help.close()); document.getElementById('understood').addEventListener('click', () => help.close());
addEventListener('keydown', e => { if (e.key === 'Escape') photoDrawer(false); });

const projected = new THREE.Vector3();
function updateHotspots() {
  document.querySelectorAll('.hotspot').forEach(el => {
    const p = hotspots[el.dataset.hotspot]; projected.copy(p).project(camera);
    let visible = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .96 && Math.abs(projected.y) < .92;
    if (el.dataset.hotspot === 'parvis' && camera.position.z < 0) visible = false;
    if (el.dataset.hotspot === 'rosace' && camera.position.x < 9) visible = false;
    el.style.display = visible ? 'flex' : 'none';
    if (visible) { el.style.left = `${(projected.x * .5 + .5) * innerWidth}px`; el.style.top = `${(-projected.y * .5 + .5) * innerHeight}px`; }
  });
}
let needsRender = true;
function draw(force = false) {
  let animating = false;
  if (cameraTween) {
    const raw = Math.min(1, (performance.now() - cameraTween.start) / 1150), t = raw * raw * (3 - 2 * raw);
    camera.position.lerpVectors(cameraTween.fromPos, cameraTween.toPos, t); controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, t);
    if (raw >= 1) cameraTween = null; else animating = true;
  }
  const changed = controls.update();
  if (force || needsRender || changed || animating || controls.autoRotate) {
    renderer.render(scene, camera); updateHotspots(); needsRender = false;
  }
}
renderer.setAnimationLoop(() => draw());
window.__seek = () => { cameraTween = null; controls.autoRotate = false; draw(true); };
window.__play = () => draw(true);
window.__SCENE_STATS__ = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6)); draw(true); });
draw(true);
requestAnimationFrame(() => requestAnimationFrame(() => { const loading = document.getElementById('loading'); if (loading) { loading.classList.add('done'); setTimeout(() => loading.remove(), 700); } window.__SCENE_READY__ = true; }));
const params = new URLSearchParams(location.search);
if (params.has('t')) window.__seek(Number(params.get('t')));
if (params.get('capture') === '1') { renderer.setAnimationLoop(null); controls.enableDamping = false; document.getElementById('loading')?.remove(); draw(true); window.__SCENE_READY__ = true; }
