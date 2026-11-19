import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as M from './models.js';
import * as T from './timeline.js';

const { B, K, SC } = T;
const W = 1920, H = 1080;
const $ = id => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const ramp = (t, t0, d) => sstep((t - t0) / d);
const lerp = (a, b, u) => a + (b - a) * u;
const backOut = x => { x = clamp(x); const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ renderer / scene
const canvas = $('gl');
const QP = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QP.get('aa') !== '0', preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W * +(QP.get('rs') || 1), H * +(QP.get('rs') || 1), false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const BG = 0x0a1226;
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 520, 1700);
const pm = new THREE.PMREMGenerator(renderer);
const envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(38, W / H, 1, 6000);
scene.add(new THREE.HemisphereLight(0xb7ccff, 0x27304d, 1.15));
const key = new THREE.DirectionalLight(0xffffff, 2.5);
key.position.set(140, 260, 200); key.castShadow = true; key.shadow.mapSize.set(+(QP.get('sm') || 2048), +(QP.get('sm') || 2048));
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.25; scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0x6aa8ff, 1.1); rim.position.set(-220, 140, -220); scene.add(rim);
function setShadow(cx, cz, ext, h = 300) {
  key.position.set(cx + 0.5 * ext, h, cz + 0.8 * ext); key.target.position.set(cx, 0, cz); key.target.updateMatrixWorld();
  const c = key.shadow.camera; c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext; c.near = 10; c.far = 1200; c.updateProjectionMatrix();
}

// floor
const floorTex = M.canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#0f1a33'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(120,160,230,0.13)'; g.lineWidth = 2;
  for (let i = 0; i <= 5; i++) { const p = (i * w) / 5; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
  g.strokeStyle = 'rgba(120,170,255,0.30)'; g.lineWidth = 4; g.strokeRect(0, 0, w, h);
}, 16);
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(60, 60);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshLambertMaterial({ map: floorTex }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

// ------------------------------------------------------------------ groups
const gIntro = new THREE.Group(), gParts = new THREE.Group(), gTheory = new THREE.Group(), gBuild = new THREE.Group(), gUsb = new THREE.Group();
scene.add(gIntro, gParts, gTheory, gBuild, gUsb);

// traffic light (intro + demo)
const TL = M.makeTrafficLight(); gIntro.add(TL);

// ---- build circuit
const ARD = V(-14, 3, 62);
const BBY = 8.5;
const ard = M.makeArduino(); ard.position.copy(ARD); gBuild.add(ard);
const bb = M.makeBreadboard(); bb.position.y = BBY; gBuild.add(bb);
const UNITS = [
  { key: 'red', c0: 8, pin: 'D10', pinName: '10', ar: 'الأحمر', hex: 0xff3030, css: '#ff4d4d', wire: 0xe11d1d },
  { key: 'yellow', c0: 15, pin: 'D9', pinName: '9', ar: 'الأصفر', hex: 0xffcc00, css: '#ffd21a', wire: 0xf5c400 },
  { key: 'green', c0: 22, pin: 'D8', pinName: '8', ar: 'الأخضر', hex: 0x22cc55, css: '#35e070', wire: 0x16a34a },
];
const world = (grp, v) => v.clone().add(grp.position);
const holeW = (c, r) => M.bbHole(c, r).add(V(0, BBY, 0));
const railW = (side, k) => M.bbRail(side, k).add(V(0, BBY, 0));
const pinW = n => M.unoPinLocal(n).add(ARD);

const leds = [], ress = [], cathW = [], sigW = [];
UNITS.forEach((u, i) => {
  const led = M.makeLED(u.key); led.userData.baseY = BBY + 4;
  led.position.set((M.bbColX(u.c0 + 4) + M.bbColX(u.c0 + 5)) / 2, BBY + 4, BB_Z('d')); gBuild.add(led); leds.push(led);
  const r = M.makeResistor(); r.position.set((M.bbColX(u.c0) + M.bbColX(u.c0 + 4)) / 2, BBY + 3.4, BB_Z('b')); gBuild.add(r); ress.push(r);
  const kc = M.bbRailNearest(M.bbColX(u.c0 + 5));
  const cw = M.makeWire(0x202226, holeW(u.c0 + 5, 'a'), railW('nearMinus', kc)); gBuild.add(cw); cathW.push(cw);
  const sw = M.makeWire(u.wire, pinW(u.pin), holeW(u.c0, 'a')); gBuild.add(sw); sigW.push(sw);
});
function BB_Z(r) { return M.BB.ROWS[r]; }
const gndK = 5;
const gndWire = M.makeWire(0x202226, pinW('GND_TOP'), railW('nearMinus', gndK)); gBuild.add(gndWire);

// column / rail highlights
const hiMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
const hiCol = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 11.6), hiMat(0x38bdf8)); hiCol.rotation.x = -Math.PI / 2; hiCol.position.set(M.bbColX(10), BBY + 0.12, 8.9); gBuild.add(hiCol);
const hiRail = new THREE.Mesh(new THREE.PlaneGeometry(71, 2.0), hiMat(0x3b82f6)); hiRail.rotation.x = -Math.PI / 2; hiRail.position.set(0, BBY + 0.12, M.BB.RAIL_Z.nearMinus); gBuild.add(hiRail);

// ---- USB scene (laptop + cable)
const scrTex = M.canvasTex(512, 320, (g, w, h) => {
  g.fillStyle = '#10172c'; g.fillRect(0, 0, w, h); g.fillStyle = '#0f8a96'; g.fillRect(0, 0, w, 26);
  const cols = ['#c792ea', '#7ee787', '#4fc3f7', '#cbd5ee', '#fbbf24']; let s = 5;
  for (let i = 0; i < 17; i++) { s = (s * 48271) % 2147483647; let x = 30 + (i % 4 === 3 ? 30 : 0); const n = 2 + (s % 3);
    for (let k = 0; k < n; k++) { s = (s * 48271) % 2147483647; const wdt = 30 + (s % 90); g.fillStyle = cols[(s >> 3) % 5]; g.fillRect(x, 50 + i * 15, wdt, 7); x += wdt + 10; } }
});
const laptop = M.makeLaptop(scrTex); laptop.position.set(-235, 0, 58); gUsb.add(laptop);
const plugB = M.makeUSBPlugB(), plugA = M.makeUSBPlugA(); plugB.rotation.y = Math.PI; gUsb.add(plugB, plugA);
const JACK = V(ARD.x - 32.09 - 8.2, ARD.y + 5.45, ARD.z - 11.43); // opening of the USB-B jack (world)
plugA.position.set(-145, 4, 58);
let cableMesh = null;
function updateCable(xb) {
  if (cableMesh) { gUsb.remove(cableMesh); cableMesh.geometry.dispose(); }
  const end = V(xb - 18, JACK.y, JACK.z), start = V(plugA.position.x + 18, 4, 58);
  const pts = [start, start.clone().add(V(14, -2, 10)), V(lerp(start.x, end.x, 0.5), 1.7, 78), end.clone().add(V(-16, -4, 14)), end.clone().add(V(-6, 0, 0)), end];
  cableMesh = M.makeCable(pts, 1.7); gUsb.add(cableMesh);
}

// ---- parts display (scene B)
const partsStages = [];
const ledColors = ['red', 'yellow', 'green'];
function stage(i) { const s = new THREE.Group(); s.position.x = (i - 2.5) * 190; const f = new THREE.Group(); s.add(f);
  const ring = new THREE.Mesh(new THREE.RingGeometry(46, 51, 72), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.4; s.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(46, 64), new THREE.MeshBasicMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.35; s.add(disc);
  gParts.add(s); const o = { s, f, ring, disc }; partsStages.push(o); return o; }
{
  const s0 = stage(0); const a = ard.clone(); a.position.set(0, 0, 0); a.scale.setScalar(1.25); s0.f.add(a); s0.item = a; s0.base = 48; s0.tilt = 0.5;
  const s1 = stage(1); const b = bb.clone(); b.position.set(0, 0, 0); b.scale.setScalar(1.05); s1.f.add(b); s1.item = b; s1.base = 48; s1.tilt = 0.5;
  const s2 = stage(2); const lg = new THREE.Group(); ledColors.forEach((c, i) => { const l = M.makeLED(c); l.position.x = (i - 1) * 17; lg.add(l); }); lg.scale.setScalar(2.5); lg.position.y = 0; s2.f.add(lg); s2.item = lg; s2.base = 62; s2.tilt = 0;
  const s3 = stage(3); const rg = new THREE.Group(); [-12, 0, 12].forEach((y, i) => { const r = M.makeResistor({ straight: true, lead: 13 }); r.position.set(0, y, 0); r.rotation.y = (i - 1) * 0.0; rg.add(r); }); rg.scale.setScalar(3.1); s3.f.add(rg); s3.item = rg; s3.base = 56; s3.tilt = 0.25;
  const s4 = stage(4); const wg = new THREE.Group(); const wc = [0xe11d1d, 0xf5c400, 0x16a34a, 0x202226, 0x202226, 0x202226, 0x202226];
  wc.forEach((c, i) => { const w = M.makeWire(c, V(-34, 0, -19 + i * 6.3), V(34, 0, -19 + i * 6.3), { lift: (3 - Math.abs(i - 3)) * 2 }); wg.add(w); }); wg.scale.setScalar(1.05); s4.f.add(wg); s4.item = wg; s4.base = 44; s4.tilt = 0.2;
  const s5 = stage(5); const ug = new THREE.Group(); const pA = M.makeUSBPlugA(), pB = M.makeUSBPlugB();
  pA.position.set(-68, 2, 0); pB.rotation.y = Math.PI; pB.position.set(68, 2, 0); ug.add(pA, pB);
  ug.add(M.makeCable([V(-50, 2, 0), V(-30, 2, 24), V(0, 2, 30), V(28, 2, 12), V(22, 2, -16), V(-2, 2, -28), V(-30, 2, -12), V(-16, 2, 4), V(8, 2, 4), V(34, 2, -6), V(50, 2, 0)], 1.7));
  ug.scale.setScalar(0.85); s5.f.add(ug); s5.item = ug; s5.base = 44; s5.tilt = 0.3;
}

// ---- theory (scene C)
const ledBig = M.makeLED('red', { glowSize: 26 }); ledBig.scale.setScalar(4); ledBig.position.set(-60, 100, 0); gTheory.add(ledBig);
const resBig = M.makeResistor({ straight: true, lead: 14 }); resBig.scale.setScalar(8); resBig.position.set(135, 62, 0); gTheory.add(resBig);

// reflections only where they matter (metal / glass / glossy coat): keeps the software renderer fast
scene.traverse(o => { const m = o.material; if (m && (m.metalness > 0.5 || m.isMeshPhysicalMaterial)) { m.envMap = envTex; m.envMapIntensity = 0.55; m.needsUpdate = true; } });

// ------------------------------------------------------------------ labels
const svg = $('lines'), labelLayer = $('labels'); const SVGNS = 'http://www.w3.org/2000/svg';
const pool = {};
function showLabels(list) {
  const seen = {};
  for (const L of list) {
    if (L.a <= 0.01) continue; seen[L.id] = 1;
    let o = pool[L.id];
    if (!o) { const el = document.createElement('div'); el.className = 'lbl'; labelLayer.appendChild(el);
      const path = document.createElementNS(SVGNS, 'path'); path.setAttribute('fill', 'none'); path.setAttribute('stroke-width', '3'); path.setAttribute('stroke-linecap', 'round'); svg.appendChild(path);
      const dot = document.createElementNS(SVGNS, 'circle'); dot.setAttribute('r', '7'); svg.appendChild(dot); o = pool[L.id] = { el, path, dot, text: '' }; }
    if (o.text !== L.text) { o.el.innerHTML = L.text; o.text = L.text; }
    const col = L.color || '#38bdf8'; o.el.style.borderColor = col; o.path.setAttribute('stroke', col); o.dot.setAttribute('fill', col);
    const p = L.anchor.clone().project(camera); const ax = (p.x * 0.5 + 0.5) * W, ay = (-p.y * 0.5 + 0.5) * H;
    const cx = ax + L.dx, cy = ay + L.dy; const w = o.el.offsetWidth, h = o.el.offsetHeight;
    o.el.style.left = cx + 'px'; o.el.style.top = cy + 'px'; o.el.style.opacity = L.a; o.el.style.visibility = 'visible';
    const vx = cx - ax, vy = cy - ay; const s = Math.min(vx ? (w / 2 + 6) / Math.abs(vx) : 9, vy ? (h / 2 + 6) / Math.abs(vy) : 9, 1);
    o.path.setAttribute('d', `M${ax},${ay} L${cx - vx * s},${cy - vy * s}`); o.path.style.opacity = L.a; o.dot.setAttribute('cx', ax); o.dot.setAttribute('cy', ay); o.dot.style.opacity = L.a;
  }
  for (const id in pool) if (!seen[id]) { const o = pool[id]; o.el.style.visibility = 'hidden'; o.path.style.opacity = 0; o.dot.style.opacity = 0; }
}

// ------------------------------------------------------------------ HUD helpers
function setHUD(el, a, html) {
  if (html !== undefined && el._h !== html) { el.innerHTML = html; el._h = html; }
  el.style.opacity = a; el.style.visibility = a > 0.01 ? 'visible' : 'hidden';
  el.style.transform = el.dataset.tx ? el.dataset.tx.replace('@', (1 - a) * 16) : `translateY(${(1 - a) * 16}px)`;
}
for (const id of ['pins', 'tl', 'caption']) $(id).dataset.tx = 'translateX(-50%) translateY(@px)';
const fadeEl = $('fade');
const inWin = (t, t0, t1, f = 0.5) => Math.min(ramp(t, t0, f), 1 - ramp(t, t1 - f, f));

// ---- code panel content
const CODE = [
  '<span class="c">// Arduino traffic light</span>',
  '<span class="k">const</span> <span class="t">int</span> RED_PIN    = <span class="n">10</span>;',
  '<span class="k">const</span> <span class="t">int</span> YELLOW_PIN = <span class="n">9</span>;',
  '<span class="k">const</span> <span class="t">int</span> GREEN_PIN  = <span class="n">8</span>;',
  '',
  '<span class="t">void</span> <span class="f">setLights</span>(<span class="t">int</span> r, <span class="t">int</span> y, <span class="t">int</span> g) {',
  '  <span class="f">digitalWrite</span>(RED_PIN, r);',
  '  <span class="f">digitalWrite</span>(YELLOW_PIN, y);',
  '  <span class="f">digitalWrite</span>(GREEN_PIN, g);',
  '}',
  '',
  '<span class="t">void</span> <span class="f">setup</span>() {',
  '  <span class="f">pinMode</span>(RED_PIN, <span class="d">OUTPUT</span>);',
  '  <span class="f">pinMode</span>(YELLOW_PIN, <span class="d">OUTPUT</span>);',
  '  <span class="f">pinMode</span>(GREEN_PIN, <span class="d">OUTPUT</span>);',
  '}',
  '',
  '<span class="t">void</span> <span class="f">loop</span>() {',
  '  <span class="f">setLights</span>(<span class="d">HIGH</span>, <span class="d">LOW</span>, <span class="d">LOW</span>);  <span class="c">// red: stop</span>',
  '  <span class="f">delay</span>(<span class="n">5000</span>);               <span class="c">// 5 seconds</span>',
  '  <span class="f">setLights</span>(<span class="d">LOW</span>, <span class="d">LOW</span>, <span class="d">HIGH</span>);  <span class="c">// green: go</span>',
  '  <span class="f">delay</span>(<span class="n">5000</span>);',
  '  <span class="f">setLights</span>(<span class="d">LOW</span>, <span class="d">HIGH</span>, <span class="d">LOW</span>);  <span class="c">// yellow: get ready</span>',
  '  <span class="f">delay</span>(<span class="n">2000</span>);',
  '}',
];
$('code').innerHTML = '<div class="bar">traffic_light.ino</div>' + CODE.map((l, i) => `<div class="ln" id="ln${i + 1}"><b>${i + 1}</b><span class="src">${l}</span></div>`).join('');
const CODE_RANGES = { e1: [1, 4], e2: [6, 10], e3: [12, 16], e4: [18, 20], e5: [21, 22], e6: [23, 25] };
let _codeKey = '';
function setCodeHL(r) {
  const k = r ? r.join('-') : 'none'; if (k === _codeKey) return; _codeKey = k;
  for (let i = 1; i <= CODE.length; i++) { const el = $('ln' + i); el.className = 'ln' + (r ? (i >= r[0] && i <= r[1] ? ' hl' : ' dim') : ''); }
}
// ide mock
$('ide-c').innerHTML = CODE.slice(0, 11).map(l => l).join('\n').replace(/\n/g, '\n');
$('ide-m').innerHTML = '';

// ------------------------------------------------------------------ camera
function camAt(keys, t) {
  let a = keys[0], b = keys[keys.length - 1];
  if (t <= a.t) b = a; else if (t >= b.t) a = b; else { for (let i = 0; i < keys.length - 1; i++) if (t >= keys[i].t && t < keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break; } }
  const u = a === b ? 0 : sstep((t - a.t) / (b.t - a.t));
  return { p: V(lerp(a.p[0], b.p[0], u), lerp(a.p[1], b.p[1], u), lerp(a.p[2], b.p[2], u)), l: V(lerp(a.l[0], b.l[0], u), lerp(a.l[1], b.l[1], u), lerp(a.l[2], b.l[2], u)), f: lerp(a.f || 38, b.f || 38, u) };
}
function placeCam(c, t, drift = 1) {
  camera.position.copy(c.p).add(V(Math.sin(t * 0.37) * 2.5 * drift, Math.sin(t * 0.29) * 1.5 * drift, 0));
  camera.fov = c.f; camera.updateProjectionMatrix(); camera.lookAt(c.l); camera.updateMatrixWorld(true);
}
const orbit = (cx, cy, cz, r, h, az, lx = 0, ly = 0) => ({ p: [cx + Math.sin(az) * r, h, cz + Math.cos(az) * r], l: [cx + lx, ly, cz], f: 38 });

// ------------------------------------------------------------------ scene state helpers
function allHidden() { gIntro.visible = gParts.visible = gTheory.visible = gBuild.visible = gUsb.visible = false; TL.visible = false; }
function setLeds(state) { // state: 'R','Y','G' or null; drives circuit LEDs + (optionally) the TL model
  const m = { red: 'R', yellow: 'Y', green: 'G' };
  leds.forEach(l => l.userData.setOn(state === m[l.userData.kind] ? 1 : 0));
}
function buildState(t, o = {}) {
  // placement animation of the circuit (pure function of time)
  const ap = ramp(t, K.ardDrop, 0.8), bp = ramp(t, K.bbDrop, 0.8);
  ard.visible = ap > 0; bb.visible = bp > 0;
  ard.position.set(ARD.x, ARD.y + (1 - ap) * 70, ARD.z); bb.position.set(0, BBY + (1 - bp) * 70, 0);
  leds.forEach((l, i) => { const p = ramp(t, K.led[i], 0.7); l.visible = p > 0; l.position.y = BBY + 4 + (1 - p) * 40; });
  ress.forEach((r, i) => { const p = ramp(t, K.res[i], 0.7); r.visible = p > 0; r.position.y = BBY + 3.4 + (1 - p) * 40; });
  gndWire.userData.setProgress(ramp(t, K.gnd, 1.3));
  cathW.forEach((w, i) => w.userData.setProgress(ramp(t, K.cath[i], 1.1)));
  sigW.forEach((w, i) => w.userData.setProgress(ramp(t, K.sig[i], 1.3)));
}
function fullBuild() { ard.visible = bb.visible = true; ard.position.copy(ARD); bb.position.set(0, BBY, 0); leds.forEach(l => { l.visible = true; l.position.y = BBY + 4; }); ress.forEach(r => { r.visible = true; r.position.y = BBY + 3.4; });
  gndWire.userData.setProgress(1); cathW.forEach(w => w.userData.setProgress(1)); sigW.forEach(w => w.userData.setProgress(1)); }

const STEPS = ['تجهيز اللوحتين', 'وصل GND', 'تركيب الـ LED', 'تركيب المقاومات', 'أسلاك الأرضي', 'أسلاك المنافذ'];
function stepperHTML(cur) { return '<h3>خطوات التركيب</h3>' + STEPS.map((s, i) => `<div class="step ${i < cur ? 'done' : i === cur ? 'now' : ''}"><i>${i < cur ? '✓' : i + 1}</i>${s}</div>`).join(''); }

const PARTS = [
  { n: 1, ar: 'لوحة أردوينو أونو', en: 'Arduino Uno R3', c: '1', d: 'العقل المدبّر: تنفّذ البرنامج وترسل 5 فولت إلى كل ضوء.' },
  { n: 2, ar: 'لوحة التجارب', en: 'Breadboard', c: '1', d: 'تركيب الدائرة وتعديلها بدون لحام.' },
  { n: 3, ar: 'صمّامات LED', en: 'LED — Red · Yellow · Green (5 mm)', c: '3', d: 'أحمر وأصفر وأخضر: أضواء الإشارة.' },
  { n: 4, ar: 'مقاومات 220 أوم', en: 'Resistor 220 Ω (¼ W)', c: '3', d: 'تحدّ من التيار المارّ في كل LED لحمايته.' },
  { n: 5, ar: 'أسلاك توصيل', en: 'Jumper wires (male–male)', c: '7', d: 'لربط الأردوينو بلوحة التجارب وتوصيل الأرضي.' },
  { n: 6, ar: 'كابل USB', en: 'USB cable (Type A to Type B)', c: '1', d: 'لتشغيل اللوحة ورفع البرنامج من الحاسوب.' },
];

// ------------------------------------------------------------------ main update
function update(t) {
  allHidden();
  const sc = T.sceneAt(t);
  const beat = T.beatAt(t);
  const id = beat ? beat.id : '';
  let labels = [];
  // default HUD states (fade out); scenes switch on what they need
  const hud = { title: 0, card: 0, stepper: 0, formula: 0, code: 0, ide: 0, pins: 0, tl: 0, tips: 0, outro: 0 };
  let cardHTML, stepHTML, formHTML, pinsHTML, tlHTML, tipsHTML;
  let cam;
  let ledState = null; // for build LEDs
  const sT = t - sc.t0;

  // title (small) for all scenes except intro where it's big
  const titleIn = ramp(t, sc.t0 + 0.4, 0.6) * (1 - ramp(t, sc.t0 + (sc.id === 'A' ? 99 : 5.5), 0.6));
  const titleEl = $('title'); titleEl.classList.toggle('big', sc.id === 'A');
  titleEl.querySelector('.pill').textContent = sc.id === 'A' ? 'مشروع للمبتدئين' : `الجزء ${T.SCENES.indexOf(sc) + 1} من ${T.SCENES.length}`;
  titleEl.querySelector('h1').textContent = sc.id === 'A' ? 'إشارة المرور' : sc.title;
  titleEl.querySelector('.en').textContent = sc.id === 'A' ? 'بالأردوينو — Arduino Traffic Light' : sc.sub;
  hud.title = sc.id === 'A' ? ramp(t, 0.9, 0.9) : (sc.id === 'G' ? 0 : titleIn);

  if (sc.id === 'A') {
    gIntro.visible = TL.visible = true;
    setShadow(-60, 0, 170, 340);
    TL.position.set(-120, 0, 0); TL.scale.setScalar(1.0); TL.rotation.y = 0.35 * Math.sin(sT * 0.5) - 0.15;
    const c = sT - 1.2; const p = c < 0 ? -1 : c % 4.8; TL.userData.set(c < 0 ? null : p < 1.8 ? 'R' : p < 3.6 ? 'G' : 'Y');
    cam = { p: V(lerp(0, 40, sT / 15), 150 + 6 * Math.sin(sT * 0.3), lerp(560, 500, sT / 15)), l: V(-50, 112, 0), f: 38 };
  }

  if (sc.id === 'B') {
    gParts.visible = true; setShadow(0, 0, 640, 520);
    const act = { b1: 0, b2: 1, b3: 2, b4: 3, b5: 4, b6: 5 }[id];
    partsStages.forEach((s, i) => {
      const p = ramp(t, K.partsAppear[i], 0.7);
      const focusT = B.b1.t0 + 0.3; const others = act === undefined || act === i ? 1 : 1 - ramp(t, B['b' + (act + 1)].t0 + 0.2, 0.7);
      const prevAct = (id === 'b0' || act === undefined) ? 1 : 1;
      const e = backOut((t - K.partsAppear[i]) / 0.7) * (act === i || act === undefined ? 1 : others);
      s.s.visible = p > 0 && e > 0.01; s.f.scale.setScalar(Math.max(0.001, e));
      s.f.position.y = s.base + 2.5 * Math.sin(t * 1.6 + i * 1.3) * 1.0;
      s.item.rotation.y = (i === 5 ? 0.6 : 0) + 0.45 * Math.sin(t * 0.55 + i);
      s.item.rotation.x = s.tilt ? s.tilt : 0;
      const hl = act === i ? 1 : 0.0; s.ring.material.opacity = 0.18 + 0.5 * hl * (0.75 + 0.25 * Math.sin(t * 4)); s.disc.material.opacity = 0.08 + 0.2 * hl;
    });
    const wide = { t: B.b0.t0, p: [0, 240, 1040], l: [0, 25, 0], f: 36 };
    const keys = [wide, { ...wide, t: B.b0.t1 - 0.3 }];
    partsStages.forEach((s, i) => { const b = B['b' + (i + 1)]; const x = s.s.position.x; const k = { p: [x + 28, 100, 275], l: [x + 62, 42, 0], f: 36 };
      keys.push({ ...k, t: b.t0 + 1.6 }, { ...k, t: b.t1 - 0.1 }); });
    cam = camAt(keys, t);
    if (act !== undefined) { const d = PARTS[act]; hud.card = ramp(t, B['b' + (act + 1)].t0 + 0.8, 0.5) * (1 - ramp(t, B['b' + (act + 1)].t1 - 0.3, 0.3));
      cardHTML = `<div><span class="num">${d.n}</span><h2>${d.ar}</h2></div><div class="en">${d.en}</div><div class="cnt">العدد: ${d.c}</div><p>${d.d}</p>`; }
  }

  if (sc.id === 'C') {
    gTheory.visible = true; setShadow(30, 0, 220, 400);
    ledBig.rotation.y = 0.35 * Math.sin(t * 0.7); resBig.rotation.y = 0.0; resBig.rotation.x = 0.12 * Math.sin(t * 0.5);
    ledBig.visible = t < B.c6.t0 + 0.8; resBig.visible = t >= B.c6.t0 - 0.3;
    const c2 = id === 'c2';
    ledBig.userData.dome.opacity = c2 ? 0.28 : 0.8;
    const on = id === 'c5' ? ramp(t, B.c5.t0 + 1.2, 0.5) : (id === 'c6' ? 0 : 0);
    ledBig.userData.setOn(on, 0.9); if (c2) ledBig.userData.dome.opacity = 0.28;
    ledBig.updateMatrixWorld(true); resBig.updateMatrixWorld(true);
    const lw = (v) => ledBig.localToWorld(v.clone());
    const keys = [
      { t: B.c1.t0, p: [-25, 78, 330], l: [-5, 60, 0], f: 38 },
      { t: B.c1.t1, p: [-35, 78, 300], l: [-15, 62, 0], f: 38 },
      { t: B.c2.t0 + 1.5, p: [-70, 100, 200], l: [-40, 100, 0], f: 38 },
      { t: B.c2.t1, p: [-70, 100, 190], l: [-40, 100, 0], f: 38 },
      { t: B.c3.t0 + 1.5, p: [-55, 80, 320], l: [-5, 62, 0], f: 38 },
      { t: B.c5.t1, p: [-55, 80, 320], l: [-5, 62, 0], f: 38 },
      { t: B.c6.t0 + 1.6, p: [120, 85, 330], l: [145, 64, 0], f: 38 },
      { t: B.c6.t1, p: [118, 85, 320], l: [145, 64, 0], f: 38 }];
    cam = camAt(keys, t);
    if (id === 'c1') {
      const a = ramp(t, B.c1.t0 + 1.0, 0.6) * (1 - ramp(t, B.c1.t1 - 0.3, 0.3));
      labels.push({ id: 'an', a, text: 'الساق الطويلة = الآنود <span style="color:#fca5a5">(+)</span>', anchor: lw(V(-1.27, -16, 0)), dx: -330, dy: 20, color: '#fca5a5' });
      labels.push({ id: 'ca', a: a * ramp(t, B.c1.t0 + 2.2, 0.5), text: 'الساق القصيرة = الكاثود <span style="color:#93c5fd">(−)</span>', anchor: lw(V(1.27, -13, 0)), dx: 340, dy: 60, color: '#93c5fd' });
    }
    if (c2) {
      const a = ramp(t, B.c2.t0 + 1.4, 0.6) * (1 - ramp(t, B.c2.t1 - 0.3, 0.3));
      labels.push({ id: 'flat', a, text: 'جهة مسطّحة = الكاثود', anchor: lw(V(2.4, 0.5, 0)), dx: 330, dy: 90, color: '#93c5fd' });
      labels.push({ id: 'cup', a: a * ramp(t, B.c2.t0 + 2.6, 0.5), text: 'الصفيحة الكبيرة = الكاثود', anchor: lw(V(1.27, 5.0, 0)), dx: 330, dy: -60, color: '#93c5fd' });
      labels.push({ id: 'post', a: a * ramp(t, B.c2.t0 + 3.8, 0.5), text: 'الصفيحة الصغيرة = الآنود', anchor: lw(V(-1.27, 3.0, 0)), dx: -330, dy: -30, color: '#fca5a5' });
    }
    if (id === 'c6') {
      const a = ramp(t, B.c6.t0 + 1.8, 0.6) * (1 - ramp(t, B.c6.t1 - 0.3, 0.3));
      const names = [['أحمر = 2', -1.95, '#ff6b6b', -90, -140], ['أحمر = 2', -1.05, '#ff6b6b', -10, -200], ['بني = <bdi dir="ltr">×10</bdi>', -0.15, '#d08a50', 110, -140], ['ذهبي = <bdi dir="ltr">±5%</bdi>', 2.0, '#facc15', 200, 130]];
      names.forEach(([tx, x, col, dx, dy], i) => labels.push({ id: 'band' + i, a: a * ramp(t, B.c6.t0 + 1.8 + i * 0.5, 0.5), text: tx, anchor: resBig.localToWorld(V(x, 1.25 * 1, 0)), dx, dy, color: col }));
      hud.formula = ramp(t, B.c6.t0 + 3.5, 0.5) * (1 - ramp(t, B.c6.t1 - 0.3, 0.3));
      formHTML = `<div class="hd">قراءة قيمة المقاومة</div><div class="eq">22 × 10 = 220 Ω</div><div class="row">أول لونين: <b>2</b> ثم <b>2</b> ← <b>22</b><br>اللون الثالث <b>بني</b> = <bdi dir="ltr">×10</bdi><br>الذهبي = دقة <b><bdi dir="ltr">±5%</bdi></b></div>`;
    }
    if (['c3', 'c4', 'c5'].includes(id)) {
      hud.formula = ramp(t, B[id].t0 + 0.7, 0.5) * (1 - ramp(t, B[id].t1 - 0.3, 0.3));
      const Rfig = id === 'c3' ? false : true;
      let body;
      if (id === 'c3') body = `<div class="hd">بدون مقاومة</div><div class="eq" style="font-size:40px">5V → LED → GND</div><div class="row"><span class="bad">⚠ تيار كبير جداً!</span><br>قد يتلف الـ LED أو منفذ الأردوينو.</div>`;
      if (id === 'c4') body = `<div class="hd">قانون أوم</div><div class="eq">I = <small>(</small>V<sub>s</sub> − V<sub>f</sub><small>)</small> ÷ R</div><div class="row"><bdi dir="ltr">V<sub>s</sub></bdi> = جهد المنفذ (5 فولت)<br><bdi dir="ltr">V<sub>f</sub></bdi> = جهد الـ LED (≈ 2 فولت للأحمر)<br><bdi dir="ltr">R</bdi> = المقاومة (220 أوم)</div>`;
      if (id === 'c5') body = `<div class="hd">الحساب</div><div class="eq" style="font-size:46px">I = (5 − 2) ÷ 220</div><div class="eq" style="font-size:46px;margin-top:0">≈ 0.0136 A = <span style="color:#86efac">13.6 mA</span></div><div class="row"><span class="ok">✓ أقل من <bdi dir="ltr">20 mA</bdi></span> (الحد الموصى به لكل منفذ)</div>`;
      formHTML = body + `<svg viewBox="0 0 640 170" id="sch">${schem(id)}</svg>`;
    }
  }

  if (sc.id === 'D') {
    gBuild.visible = true; setShadow(0, 40, 130, 320);
    buildState(t); setLeds(null); scene.updateMatrixWorld(true);
    hiCol.material.opacity = 0.0; hiRail.material.opacity = 0.0;
    if (id === 'd1') {
      hiCol.material.opacity = 0.65 * inWin(t, K.hiCol[0], K.hiCol[1] + 0.2, 0.35) * (0.75 + 0.25 * Math.sin(t * 6));
      hiRail.material.opacity = 0.65 * inWin(t, K.hiRail[0], K.hiRail[1], 0.35) * (0.75 + 0.25 * Math.sin(t * 6));
      const a1 = inWin(t, K.hiCol[0], K.hiCol[1] + 0.2, 0.35), a2 = inWin(t, K.hiRail[0], K.hiRail[1], 0.35);
      labels.push({ id: 'col', a: a1, text: 'خمس فتحات متصلة ببعضها', anchor: holeW(10, 'c'), dx: -250, dy: -140, color: '#38bdf8' });
      labels.push({ id: 'rail', a: a2, text: 'خط الطاقة: كل فتحاته متصلة', anchor: railW('nearMinus', 20), dx: 190, dy: 130, color: '#60a5fa' });
    }
    const O = [80, 125, 215];
    const keys = [
      { t: B.d1.t0, p: [10, 260, 290], l: [-5, 0, 40], f: 38 }, { t: B.d1.t0 + 3, p: [8, 190, 195], l: [-5, 6, 36], f: 38 }, { t: B.d1.t1, p: [8, 170, 175], l: [-3, 6, 30], f: 38 },
      { t: B.d2.t0 + 1.2, p: [-40, 120, 150], l: [-22, 8, 30], f: 38 }, { t: B.d2.t1, p: [-40, 115, 140], l: [-22, 8, 30], f: 38 },
      { t: B.d3.t0 + 1.2, p: [10, 85, 90], l: [4, 8, 8], f: 38 }, { t: B.d3.t1, p: [12, 82, 86], l: [8, 8, 8], f: 38 },
      { t: B.d4.t0 + 1.2, p: [-4, 95, 82], l: [-4, 6, 12], f: 38 }, { t: B.d4.t1, p: [14, 92, 80], l: [14, 6, 12], f: 38 },
      { t: B.d5.t0 + 1.2, p: [10, 100, 85], l: [8, 8, 14], f: 38 }, { t: B.d5.t1, p: [14, 98, 85], l: [14, 8, 14], f: 38 },
      { t: B.d6.t0 + 1.2, p: [-6, 150, 165], l: [-2, 8, 40], f: 38 }, { t: B.d6.t1, p: [-2, 145, 160], l: [2, 8, 38], f: 38 },
      { t: B.d7.t0 + 1.5, p: [-10, 170, 210], l: [-12, 6, 32], f: 38 }, { t: B.d7.t1, p: [30, 150, 190], l: [0, 6, 32], f: 38 }];
    keys.forEach(k => { k.p[0] += 17; k.l[0] += 17; });
    cam = camAt(keys, t);
    // step labels
    const lblOn = (b, d) => ramp(t, b.t0 + d, 0.5) * (1 - ramp(t, b.t1 - 0.3, 0.3));
    if (id === 'd2') { labels.push({ id: 'gnd', a: lblOn(B.d2, 0.4), text: 'GND', anchor: pinW('GND_TOP').add(V(0, 12, 0)), dx: -100, dy: 100, color: '#cbd5e1' });
      labels.push({ id: 'pin13', a: lblOn(B.d2, 0.4), text: 'المنفذ 13', anchor: pinW('D13').add(V(0, 12, 0)), dx: 150, dy: 120, color: '#94a3b8' });
      labels.push({ id: 'minus', a: lblOn(B.d2, 2.4), text: 'الخط السالب (−)', anchor: railW('nearMinus', gndK).add(V(0, 1, 0)), dx: -200, dy: 90, color: '#60a5fa' }); }
    if (id === 'd3') { const ta = ramp(t, K.led[0] + 0.9, 0.5) * (1 - ramp(t, B.d3.t1 - 0.3, 0.3));
      labels.push({ id: 'anode', a: ta, text: 'الطويلة (+)', anchor: leds[0].localToWorld(V(-1.27, -2, 0)), dx: -120, dy: 100, color: '#fca5a5' });
      labels.push({ id: 'cath', a: ta, text: 'القصيرة (−)', anchor: leds[0].localToWorld(V(1.27, -2, 0)), dx: 110, dy: 120, color: '#93c5fd' }); }
    if (id === 'd4') { const a = ramp(t, K.res[0] + 0.9, 0.5) * (1 - ramp(t, B.d4.t1 - 0.3, 0.3));
      labels.push({ id: 'r220', a, text: '220 Ω', anchor: ress[0].localToWorld(V(0, 1.4, 0)), dx: -30, dy: -110, color: '#fde68a' }); }
    if (id === 'd6') {
      UNITS.forEach((u, i) => labels.push({ id: 'p' + i, a: ramp(t, K.sig[i] + 0.1, 0.5) * (1 - ramp(t, B.d6.t1 - 0.3, 0.3)), text: `<span style="color:${u.css}">●</span> ${u.pinName}`, anchor: pinW(u.pin).add(V(0, 12, 0)), dx: (i - 1) * 6 + 0, dy: -70 - i * 6, color: u.css }));
    }
    // HUD
    const di = { d1: 0, d2: 1, d3: 2, d4: 3, d5: 4, d6: 5 }[id];
    if (di !== undefined) { hud.stepper = ramp(t, B.d1.t0 + 0.6, 0.5); stepHTML = stepperHTML(di); }
    if (id === 'd7') { hud.stepper = 0; hud.card = ramp(t, B.d7.t0 + 0.8, 0.5);
      cardHTML = `<div><span class="num">✓</span><h2>جدول التوصيل</h2></div><div style="margin-top:12px;font-size:28px;line-height:2;direction:rtl">` + UNITS.map(u =>
        `<div><b style="color:${u.css}">● ${u.ar}</b>: <bdi dir="ltr">D${u.pinName} → 220Ω → LED → GND</bdi></div>`).join('') + `<div style="color:#94a3b8;margin-top:6px;font-size:24px">كل الأرضي (GND) مشتركة عبر الخط السالب.</div></div>`; }
  }

  if (sc.id === 'E') {
    gBuild.visible = true; fullBuild(); scene.updateMatrixWorld(true); setShadow(0, 40, 130, 320);
    const az = lerp(-0.45, 0.35, sT / (sc.t1 - sc.t0));
    cam = { p: V(-100 + Math.sin(az) * 240, 150, 60 + Math.cos(az) * 240), l: V(-100 - 15, 6, 40), f: 38 };
    cam.p = V(5 + Math.sin(az) * 215, 140, 40 + Math.cos(az) * 215); cam.l = V(-88, 8, 40);
    const state = id === 'e4' ? 'R' : id === 'e5' ? 'G' : id === 'e6' ? 'Y' : null;
    setLeds(state);
    hud.code = ramp(t, SC.E.t0 + 0.6, 0.6); setCodeHL(CODE_RANGES[id] || null);
    ard.userData.setPower(1);
  }

  if (sc.id === 'F') {
    gBuild.visible = gUsb.visible = true; fullBuild(); scene.updateMatrixWorld(true); setShadow(-90, 50, 270, 400);
    const e = ramp(t, K.usbIn, 1.1);
    const xb = -56.3 - 55 * (1 - e); plugB.position.set(xb, JACK.y, JACK.z); updateCable(xb);
    ard.userData.setPower(ramp(t, K.powerOn, 0.4));
    const done = t > K.upload + 1.6;
    setLeds(done ? 'R' : null);
    const keys = [{ t: B.f1.t0, p: [-120, 150, 330], l: [-120, 10, 55], f: 38 }, { t: B.f1.t1 - 0.5, p: [-70, 130, 290], l: [-85, 8, 55], f: 38 },
      { t: B.f2.t0 + 1.2, p: [22, 235, 560], l: [22, 8, 52], f: 38 }, { t: B.f4.t1, p: [22, 225, 545], l: [22, 8, 52], f: 38 }];
    cam = camAt(keys, t);
    if (id === 'f1') { labels.push({ id: 'usb', a: ramp(t, K.usbIn + 1.2, 0.5) * (1 - ramp(t, B.f1.t1 - 0.3, 0.3)), text: 'كابل USB', anchor: V(-100, 2, 90), dx: 0, dy: 110, color: '#94a3b8' });
      labels.push({ id: 'on', a: ramp(t, K.powerOn + 0.5, 0.5) * (1 - ramp(t, B.f1.t1 - 0.3, 0.3)), text: 'لمبة ON', anchor: ard.localToWorld(V(...ledOnPos())), dx: 80, dy: -120, color: '#4ade80' }); }
    hud.ide = ramp(t, B.f2.t0 + 0.3, 0.6);
    ideUpdate(t, id);
  }

  if (sc.id === 'G' || sc.id === 'H') {
    gBuild.visible = gIntro.visible = TL.visible = true; fullBuild(); setShadow(40, 30, 150, 380);
    TL.position.set(105, 0, -4); TL.scale.setScalar(0.45); TL.rotation.y = -0.3;
    ard.userData.setPower(1);
    const st = T.lightState(t - K.cycle0 + (0)); const state = t < K.cycle0 ? 'R' : st;
    setLeds(state); TL.userData.set(state);
    const az = sc.id === 'G' ? lerp(-0.12, 0.18, sT / (sc.t1 - sc.t0)) : lerp(0.18, -0.15, sT / (sc.t1 - sc.t0));
    const tx = sc.id === 'H' ? 100 : 38;
    const rr = sc.id === 'H' ? 270 : 305;
    cam = { p: V(tx + Math.sin(az) * rr, 140, 35 + Math.cos(az) * rr), l: V(tx, 52, 35), f: 38 };
    if (sc.id === 'G') {
      hud.pins = ramp(t, B.g1.t0 + 0.8, 0.5); hud.tl = hud.pins;
      const lc = (t < K.cycle0 ? 0 : t - K.cycle0); const loc = lc % 12;
      pinsHTML = UNITS.map(u => { const on = (state === 'R' && u.key === 'red') || (state === 'G' && u.key === 'green') || (state === 'Y' && u.key === 'yellow');
        return `<div class="chip ${on ? 'on' : ''}" style="color:${u.css}"><span class="dot"></span><span style="color:#e8eefc">D${u.pinName}</span><span class="st">${on ? 'HIGH' : 'LOW'}</span></div>`; }).join('');
      const segs = [['#ef4444', 5, 'أحمر 5s'], ['#22c55e', 5, 'أخضر 5s'], ['#fbbf24', 2, 'أصفر 2s']];
      tlHTML = `<div class="meta"><span>دورة الإشارة (12 ثانية)</span><span>${loc.toFixed(1)} s</span></div><div class="bar">` + segs.map(s => `<div class="seg" style="width:${s[1] / 12 * 100}%;background:${s[0]}">${s[2]}</div>`).join('') + `<div class="head" style="left:${(loc / 12 * 100).toFixed(2)}%"></div></div>`;
    }
    if (sc.id === 'H') {
      hud.tips = 1; const tips = ['h1', 'h2', 'h3'];
      tipsHTML = tips.map((k, i) => { const a = ramp(t, B[k].t0 + 0.2, 0.5);
        const txt = ['إذا لم يضئ الـ LED فاعكس اتجاهه، ولا تستخدمه بدون مقاومة.', 'تأكد من وصل GND، وافصل USB قبل تعديل التوصيلات.', 'طوّر المشروع: زر مشاة، أو إشارة ثانية لتقاطع كامل.'][i];
        return `<div class="tip panel" style="opacity:${a};transform:translateY(${(1 - a) * 18}px)"><i>${i + 1}</i><span>${txt}</span></div>`; }).join('');
      hud.outro = ramp(t, B.h4.t0 + 0.2, 0.9); if (hud.outro > 0) { hud.tips = 1 - hud.outro; hud.title = Math.min(hud.title, 1 - hud.outro); }
    }
  }

  placeCam(cam, t);
  renderer.render(scene, camera);
  showLabels(labels);

  // HUD
  setHUD($('title'), hud.title);
  setHUD($('card'), hud.card, cardHTML);
  setHUD($('stepper'), hud.stepper, stepHTML);
  setHUD($('formula'), hud.formula, formHTML); if (hud.formula > 0.01) schemAnim(t, id);
  setHUD($('code'), hud.code); setHUD($('ide'), hud.ide);
  setHUD($('pins'), hud.pins, pinsHTML); setHUD($('tl'), hud.tl, tlHTML);
  setHUD($('tips'), hud.tips, tipsHTML); setHUD($('outro'), hud.outro);
  // caption
  let ca = 0, ctext;
  if (beat) { ca = ramp(t, beat.t0 - 0.05, 0.35) * (1 - ramp(t, beat.t1 - 0.25, 0.25)); ctext = beat.text.replace(/±5%|\(5 − 2\) ÷ 220 ≈ 13\.6|I = \(Vs − Vf\) ÷ R|22 × 10 = 220/g, m => `<bdi dir="ltr">${m}</bdi>`); }
  if (!(sc.id === 'H' && id === 'h4')) setHUD($('caption'), ca, ctext); else setHUD($('caption'), 0, ctext);
  // scene fade (black)
  const f = Math.max(1 - ramp(t, sc.t0, 0.7), ramp(t, sc.t1 - 0.7, 0.7));
  fadeEl.style.opacity = t < 0.02 ? 1 : f;
}

// ------------------------------------------------------------------ schematic svg (c3..c5)
function schem(id) {
  const res = id !== 'c3';
  const line = (x1, x2) => `<line x1="${x1}" y1="70" x2="${x2}" y2="70" stroke="#94a3b8" stroke-width="4"/>`;
  let s = `<text x="10" y="40" fill="#e8eefc" font-size="26" font-weight="700">D10 · 5V</text>` + line(14, res ? 190 : 410);
  if (res) {
    s += `<polyline points="190,70 205,70 215,46 235,94 255,46 275,94 295,46 305,70 320,70" fill="none" stroke="#fde68a" stroke-width="5" stroke-linejoin="round"/>` + `<text x="212" y="124" fill="#fde68a" font-size="24" font-weight="700">220 Ω</text>`;
    s += line(320, 410);
  }
  s += `<polygon points="410,44 410,96 452,70" fill="none" stroke="${id === 'c3' ? '#ef4444' : '#ff5555'}" stroke-width="5" stroke-linejoin="round"/><line x1="452" y1="44" x2="452" y2="96" stroke="#ff5555" stroke-width="5"/>`;
  s += `<path d="M430,34 l14,-14 m-6,-4 l10,-10" stroke="#ff9a9a" stroke-width="3" fill="none"/>`;
  s += line(452, 560) + `<line x1="560" y1="70" x2="560" y2="110" stroke="#94a3b8" stroke-width="4"/><line x1="536" y1="110" x2="584" y2="110" stroke="#94a3b8" stroke-width="4"/><line x1="544" y1="122" x2="576" y2="122" stroke="#94a3b8" stroke-width="4"/><line x1="552" y1="134" x2="568" y2="134" stroke="#94a3b8" stroke-width="4"/>`;
  s += `<text x="520" y="160" fill="#94a3b8" font-size="22">GND</text>`;
  for (let i = 0; i < 7; i++) s += `<circle class="dotc" data-i="${i}" r="7" fill="${id === 'c3' ? '#ef4444' : '#38bdf8'}"/>`;
  return s;
}
function schemAnim(t, id) {
  const dots = $('formula').querySelectorAll('.dotc'); if (!dots.length) return;
  const res = id !== 'c3'; const x0 = 14, x1 = 560; const sp = id === 'c3' ? 0.9 : 0.35;
  dots.forEach((d, i) => { let u = ((t * sp + i / dots.length) % 1); const x = x0 + u * (x1 - x0); d.setAttribute('cx', x); d.setAttribute('cy', 70);
    if (res && x > 205 && x < 305) { const k = (x - 205) / 100; d.setAttribute('cy', 70 + (Math.sin(k * Math.PI * 4) * 24)); } });
}
function ledOnPos() { return [(1260 * 0.0254) - M.UNO.W / 2, 1.5, M.UNO.D / 2 - 1620 * 0.0254]; }

// ------------------------------------------------------------------ IDE mock
function ideUpdate(t, id) {
  const hl = (el, on, rect) => { el.style.opacity = on; if (rect) { Object.assign(el.style, { left: rect[0] + 'px', top: rect[1] + 'px', width: rect[2] + 'px', height: rect[3] + 'px' }); } };
  const p = (b, d = 0.4) => ramp(t, b.t0 + d, 0.4) * (1 - ramp(t, b.t1 - 0.3, 0.3));
  hl($('r1'), id === 'f2' ? p(B.f2) * (0.7 + 0.3 * Math.sin(t * 6)) : 0, [8, 138, 784, 372]);
  hl($('r2'), id === 'f3' ? p(B.f3, 0.2) * (0.7 + 0.3 * Math.sin(t * 6)) : 0, [158, 64, 182, 68]);
  hl($('r3'), id === 'f4' ? p(B.f4, 0.2) * (0.7 + 0.3 * Math.sin(t * 6)) * (t < K.upload ? 1 : 0.0) : 0, [76, 63, 66, 66]);
  const menu = $('ide-m'); const showMenu = id === 'f3' && t > B.f3.t0 + 2.2 && t < B.f3.t1 - 0.2;
  const mh = '<div>Tools ▸ Board ▸ Arduino AVR Boards</div><div class="sel">Arduino Uno</div><div style="color:#7d8bad">Tools ▸ Port</div><div class="sel">COM3 (Arduino Uno)</div>';
  if (menu._h !== mh) { menu.innerHTML = mh; menu._h = mh; }
  menu.style.display = showMenu ? 'block' : 'none';
  const con = $('ide-k'); let txt = '';
  if (id === 'f4') { if (t > K.upload - 1.4 && t <= K.upload) txt = 'Compiling sketch…\n'; if (t > K.upload) txt = 'Compiling sketch…\nDone compiling.\nUploading…\nDone uploading.'; }
  if (con._h !== txt) { con.textContent = txt; con._h = txt; }
  const code = $('ide-c'); const ch = '<span style="color:#5f7298">// Arduino traffic light</span>\n' + CODE.slice(1, 15).join('\n') + '\n…';
  if (code._h !== ch) { code.innerHTML = ch; code._h = ch; }
  $('ide-u').style.background = id === 'f4' && t < K.upload && t > B.f4.t0 + 1.4 ? '#f59e0b' : '#0f8a96';
}

// ------------------------------------------------------------------ API
window.TOTAL = T.VTOTAL; window.FPS = T.FPS;
window.setTime = (v) => { update(T.toInternal(v)); };
document.fonts.ready.then(() => { window.READY = true; const q = new URLSearchParams(location.search); if (q.has('t')) update(T.toInternal(parseFloat(q.get('t')))); });
