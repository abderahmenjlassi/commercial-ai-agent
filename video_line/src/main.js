import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as M from './models.js';
import * as L from './models_line.js';
import * as T from './timeline.js';
import * as S from './sim.js';

const { B, K, SC } = T;
const QP = new URLSearchParams(location.search);
const VERT = QP.get('vert') === '1';
let vkNow = 1.5, distMin = 0, voffNow = 230; const VK = 1.75, VOFF = +(QP.get('voff') || 230); // vertical (9:16) mode: dolly-out factor + downward image shift
const W = VERT ? 1080 : 1920, H = VERT ? 1920 : 1080;
const $ = id => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const ramp = (t, t0, d) => sstep((t - t0) / d);
const lerp = (a, b, u) => a + (b - a) * u;
const backOut = x => { x = clamp(x); const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ renderer / scene
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QP.get('aa') !== '0', preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W * +(QP.get('rs') || 1), H * +(QP.get('rs') || 1), false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const BG = 0xeaf1fb;
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 560, 1800);
const pm = new THREE.PMREMGenerator(renderer);
const envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(38, W / H, 1, 6000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb0d0, 1.0));
const key = new THREE.DirectionalLight(0xfff6e8, 1.9);
key.position.set(140, 260, 200); key.castShadow = true; key.shadow.mapSize.set(+(QP.get('sm') || 2048), +(QP.get('sm') || 2048));
key.shadow.bias = -0.0012; key.shadow.normalBias = 0.7; key.shadow.radius = 3; scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xcfe0ff, 0.7); rim.position.set(-220, 140, -220); scene.add(rim);
function setShadow(cx, cz, ext, h = 300) {
  key.position.set(cx + 0.5 * ext, h, cz + 0.8 * ext); key.target.position.set(cx, 0, cz); key.target.updateMatrixWorld();
  const c = key.shadow.camera; c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext; c.near = 10; c.far = 1200; c.updateProjectionMatrix();
}

// floor
const floorTex = M.canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#e4edf9'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(70,110,180,0.20)'; g.lineWidth = 2;
  for (let i = 0; i <= 5; i++) { const p = (i * w) / 5; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
  g.strokeStyle = 'rgba(70,110,180,0.42)'; g.lineWidth = 4; g.strokeRect(0, 0, w, h);
}, 16);
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(60, 60);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshBasicMaterial({ map: floorTex }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.ShadowMaterial({ opacity: 0.32 }));
shadowPlane.rotation.x = -Math.PI / 2; shadowPlane.position.y = 0.05; shadowPlane.receiveShadow = true; scene.add(shadowPlane);

// ------------------------------------------------------------------ labels
const svg = $('lines'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); const labelLayer = $('labels'); const SVGNS = 'http://www.w3.org/2000/svg';
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
    const w = o.el.offsetWidth, h = o.el.offsetHeight; const cx = clamp(ax + L.dx, w / 2 + 16, W - w / 2 - 16), cy = clamp(ay + L.dy, h / 2 + 16, H - h / 2 - 16);
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
for (const id of ['pins', 'tl', 'caption', 'road']) $(id).dataset.tx = 'translateX(-50%) translateY(@px)';
const fadeEl = $('fade');
const inWin = (t, t0, t1, f = 0.5) => Math.min(ramp(t, t0, f), 1 - ramp(t, t1 - f, f));
// ------------------------------------------------------------------ camera
function camAt(keys, t) {
  let a = keys[0], b = keys[keys.length - 1];
  if (t <= a.t) b = a; else if (t >= b.t) a = b; else { for (let i = 0; i < keys.length - 1; i++) if (t >= keys[i].t && t < keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break; } }
  const u = a === b ? 0 : sstep((t - a.t) / (b.t - a.t));
  return { p: V(lerp(a.p[0], b.p[0], u), lerp(a.p[1], b.p[1], u), lerp(a.p[2], b.p[2], u)), l: V(lerp(a.l[0], b.l[0], u), lerp(a.l[1], b.l[1], u), lerp(a.l[2], b.l[2], u)), f: lerp(a.f || 38, b.f || 38, u) };
}
function placeCam(c, t, drift = 1) {
  let p = c.p, f = c.f;
  if (VERT) { const dd = c.p.distanceTo(c.l); const k = distMin ? Math.max(1.15, distMin / dd) : vkNow; p = c.l.clone().add(c.p.clone().sub(c.l).multiplyScalar(k)); f = c.f * 1.25; }
  camera.position.copy(p).add(V(Math.sin(t * 0.37) * 2.5 * drift, Math.sin(t * 0.29) * 1.5 * drift, 0));
  camera.fov = f; if (VERT) camera.setViewOffset(W, H, 0, -voffNow, W, H); camera.updateProjectionMatrix(); camera.lookAt(c.l); camera.updateMatrixWorld(true);
}
const orbit = (cx, cy, cz, r, h, az, lx = 0, ly = 0) => ({ p: [cx + Math.sin(az) * r, h, cz + Math.cos(az) * r], l: [cx + lx, ly, cz], f: 38 });


// ================================================================== objects
const robot = L.makeRobot(); scene.add(robot);
const P = robot.userData.parts, AN = robot.userData.anchors;
const track = new THREE.Mesh(new THREE.PlaneGeometry(1500, 900), new THREE.MeshBasicMaterial({ map: L.trackTexture(S.TRK) }));
track.rotation.x = -Math.PI / 2; track.position.y = 0.02; scene.add(track);

// mini breadboard (5V / GND rails) on the right of the Arduino
const MBB = { s: 0.55, pos: V(62, 50.2, 41) };
const mbb = M.makeBreadboard(); mbb.scale.setScalar(MBB.s); mbb.position.copy(MBB.pos); robot.add(mbb); P.mbb = mbb;
const railW = (side, k) => M.bbRail(side, k).multiplyScalar(MBB.s).add(MBB.pos);

// sensor ground spots (demo)
const spots = [-1, 1].map(sd => { const m = new THREE.Mesh(new THREE.CircleGeometry(6.5, 24), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.55, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(L.LAYOUT.sensorX, 0.3, sd * L.LAYOUT.sensorZ); robot.add(m); return m; });

// wires
const C = { red: 0xe11d1d, blk: 0x1a1b1e, yel: 0xf5c400, org: 0xf97316, grn: 0x16a34a, blu: 0x2563eb, vio: 0x7c3aed, pnk: 0xdb2777, teal: 0x0d9488, brn: 0x92400e };
const lead = (c, a, b, o) => { const w = L.makeLead(c, a, b, o); robot.add(w); return w; };
const dup = (c, a, b, o) => { const w = M.makeWire(c, a, b, o); robot.add(w); return w; };
const WR = {};
WR.motor = [lead(C.red, AN.motorTab(-1, 'a'), AN.OUT1, { lift: 4 }), lead(C.blk, AN.motorTab(-1, 'b'), AN.OUT2, { lift: 8 }), lead(C.red, AN.motorTab(1, 'a'), AN.OUT3, { lift: 4 }), lead(C.blk, AN.motorTab(1, 'b'), AN.OUT4, { lift: 8 })];
// sensors: [L VCC, L GND, L OUT, R VCC, R GND, R OUT]  (rails: farPlus = 5V, farMinus = GND)
WR.sensor = [
  dup(C.red, railW('farPlus', 3), AN.ir(-1, 'VCC'), { lift: 2 }), dup(C.blk, railW('farMinus', 3), AN.ir(-1, 'GND'), { lift: 6 }), dup(C.yel, AN.ard('D2'), AN.ir(-1, 'OUT'), { lift: 10 }),
  dup(C.red, railW('farPlus', 5), AN.ir(1, 'VCC'), { lift: 0 }), dup(C.blk, railW('farMinus', 5), AN.ir(1, 'GND'), { lift: 4 }), dup(C.org, AN.ard('D3'), AN.ir(1, 'OUT'), { lift: 14 })];
const ctrl = [['ENA', 'D5', C.grn, 0], ['IN1', 'D6', C.blu, 3], ['IN2', 'D7', C.vio, 6], ['IN3', 'D8', C.pnk, 9], ['IN4', 'D9', C.teal, 12], ['ENB', 'D10', C.brn, 15]];
WR.ctrl = ctrl.map(([lp, ap, c, lf]) => dup(c, AN.ard(ap), AN[lp], { lift: lf }));
WR.power = [
  lead(C.red, AN.battery('+'), AN.switchPts[0], { lift: 4 }), lead(C.red, AN.switchPts[1], AN.V12, { lift: 26 }), lead(C.blk, AN.battery('-'), AN.GND, { lift: 30 }),
  lead(C.red, AN.V5, railW('farPlus', 10), { lift: 14 }), lead(C.blk, AN.GND.clone().add(V(0, 0, 0)), railW('farMinus', 10), { lift: 18 }),
  dup(C.red, AN.ard('5V'), railW('farPlus', 13), { lift: 8 }), dup(C.blk, AN.ard('GND1'), railW('farMinus', 13), { lift: 12 })];
const allLeads = [...WR.motor, ...WR.sensor, ...WR.ctrl, ...WR.power];

// ---- USB scene: laptop + cable (to the Arduino USB-B jack)
const scrTex = M.canvasTex(512, 320, (g, w, h) => {
  g.fillStyle = '#10172c'; g.fillRect(0, 0, w, h); g.fillStyle = '#0f8a96'; g.fillRect(0, 0, w, 26);
  const cols = ['#c792ea', '#7ee787', '#4fc3f7', '#cbd5ee', '#fbbf24']; let s = 5;
  for (let i = 0; i < 17; i++) { s = (s * 48271) % 2147483647; let x = 30 + (i % 4 === 3 ? 30 : 0); const n = 2 + (s % 3);
    for (let k = 0; k < n; k++) { s = (s * 48271) % 2147483647; const wdt = 30 + (s % 90); g.fillStyle = cols[(s >> 3) % 5]; g.fillRect(x, 50 + i * 15, wdt, 7); x += wdt + 10; } }
});
const gUsb = new THREE.Group(); scene.add(gUsb);
const laptop = M.makeLaptop(scrTex); laptop.position.set(-330, 0, 40); laptop.rotation.y = 0.0; gUsb.add(laptop);
const plugB = M.makeUSBPlugB(), plugA = M.makeUSBPlugA(); plugB.rotation.y = Math.PI; gUsb.add(plugB, plugA);
let cableMesh = null;
function updateCable(jack, xb) {
  if (cableMesh) { gUsb.remove(cableMesh); cableMesh.geometry.dispose(); }
  const end = V(xb - 18, jack.y, jack.z), start = V(plugA.position.x + 18, 4, plugA.position.z);
  const pts = [start, start.clone().add(V(14, -2, 10)), V(THREE.MathUtils.lerp(start.x, end.x, 0.5), 1.7, jack.z + 60), end.clone().add(V(-16, -4, 14)), end.clone().add(V(-6, 0, 0)), end];
  cableMesh = M.makeCable(pts, 1.7); gUsb.add(cableMesh);
}

// ---- parts display stages (scene B)
const gParts = new THREE.Group(); scene.add(gParts);
const stages = [];
function stage(i) { const s = new THREE.Group(); s.position.x = (i - 2.5) * 190; const f = new THREE.Group(); s.add(f);
  const ring = new THREE.Mesh(new THREE.RingGeometry(46, 51, 72), new THREE.MeshBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0.35, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.4; s.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(46, 64), new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.12, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.35; s.add(disc);
  gParts.add(s); const o = { s, f, ring, disc }; stages.push(o); return o; }
{
  const a = M.makeArduino(); a.scale.setScalar(1.3); stage(0).f.add(a); Object.assign(stages[0], { item: a, base: 50, tilt: 0.5 });
  const l = L.makeL298N(); l.scale.setScalar(1.7); stage(1).f.add(l); Object.assign(stages[1], { item: l, base: 50, tilt: 0.45 });
  const g2 = new THREE.Group(); for (const z of [-20, 20]) { const m = L.makeIRSensor(); m.position.z = z; g2.add(m); } g2.scale.setScalar(1.7); stage(2).f.add(g2); Object.assign(stages[2], { item: g2, base: 55, tilt: 0.1 });
  const g3 = new THREE.Group(); const m3 = L.makeTTMotor(); m3.position.x = -20; g3.add(m3); const w3 = L.makeWheel(); w3.position.set(-20, 0, 26); g3.add(w3); g3.scale.setScalar(0.95); stage(3).f.add(g3); Object.assign(stages[3], { item: g3, base: 50, tilt: 0.35 });
  const g4 = new THREE.Group(); const ch = L.makeChassis(); ch.position.y = -44; g4.add(ch); const cs = L.makeCaster(); cs.position.set(-92, -44, 0); g4.add(cs); g4.scale.setScalar(0.5); stage(4).f.add(g4); Object.assign(stages[4], { item: g4, base: 50, tilt: 0.45 });
  const g5 = new THREE.Group(); const bt = L.makeBattery(); g5.add(bt); const sw = L.makeSwitch(); sw.position.set(-55, 0, 45); g5.add(sw); g5.scale.setScalar(1.15); stage(5).f.add(g5); Object.assign(stages[5], { item: g5, base: 40, tilt: 0.45 });
}

// ---- theory props (scene C)
const gTheory = new THREE.Group(); scene.add(gTheory);
const bigIR = L.makeIRSensor(); bigIR.scale.setScalar(3.2); bigIR.rotation.y = -Math.PI / 2; gTheory.add(bigIR);
const strip = new THREE.Group(); gTheory.add(strip);
{ const w = new THREE.Mesh(new THREE.PlaneGeometry(620, 360), new THREE.MeshBasicMaterial({ color: 0xf7f9fc })); w.rotation.x = -Math.PI / 2; w.position.y = 0.2; strip.add(w);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(66, 360), new THREE.MeshBasicMaterial({ color: 0x141416 })); b.rotation.x = -Math.PI / 2; b.position.y = 0.3; strip.add(b); }
const ray = (color) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 1, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 })); gTheory.add(m); return m; };
const rayE = ray(0xff3b3b), rayR = ray(0xff9a2e);
const absorb = new THREE.Mesh(new THREE.CircleGeometry(11, 24), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.5 })); absorb.rotation.x = -Math.PI / 2; absorb.position.y = 0.5; gTheory.add(absorb);
function setRay(m, a, b) { const d = b.clone().sub(a); const len = d.length(); m.scale.set(1, len, 1); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); }
const bigL = L.makeL298N(); bigL.scale.setScalar(2.8); gTheory.add(bigL);

scene.traverse(o => { const m = o.material; if (m && (m.metalness > 0.5 || m.isMeshPhysicalMaterial)) { m.envMap = envTex; m.envMapIntensity = 0.45; m.needsUpdate = true; } });
const robotMats = [];


// ================================================================== HUD content helpers
const FR = { straight: '⬆️ Tout droit', left: '↰ Tourne à gauche', right: '↱ Tourne à droite', stop: '🛑 Stop' };
const BRCOL = { straight: '#16a34a', left: '#2563eb', right: '#d97706', stop: '#dc2626' };
function stepperHTML(cur, list, title) { return `<h3>${title}</h3>` + list.map((s, i) => `<div class="step ${i < cur ? 'done' : i === cur ? 'now' : ''}"><i>${i < cur ? '✓' : i + 1}</i>${s}</div>`).join(''); }
const STEPS_D = ['Châssis, moteurs, roues', 'Capteurs à l’avant', 'Arduino · L298N · batterie', 'Moteurs → OUT1…OUT4', 'Capteurs → 5V · GND · D2/D3', 'Commande L298N → D5…D10', 'Alimentation · GND commun', 'Retirer les cavaliers ENA/ENB'];
const STEPS_F = ['Brancher le câble USB', 'Choisir Arduino Uno + port', 'Téléverser ➡️'];
const PARTS = [
  { e: '🧠', n: 'Arduino Uno R3', d: 'Le cerveau : lit les capteurs et commande le driver', q: 1 },
  { e: '⚙️', n: 'Driver moteur L298N', d: 'Double pont en H : alimente les 2 moteurs', q: 1 },
  { e: '👁️', n: 'Capteurs IR TCRT5000', d: 'Détectent la ligne noire (sortie 0 ou 1)', q: 2 },
  { e: '🛞', n: 'Moteur réducteur TT + roue', d: 'Les 2 roues motrices', q: 2 },
  { e: '🔩', n: 'Châssis 2WD + roue folle', d: 'Plateau acrylique + bille de support', q: 1 },
  { e: '🔋', n: 'Batterie 7,4 V (2×18650)', d: 'Alimente les moteurs via le L298N', q: 1 },
];
// top-down mini diagram of one decision case
function caseSVG(Ls, Rs, l, r) {
  const lineX = Ls && !Rs ? 62 : (!Ls && Rs ? 138 : 100);
  const bar = Ls && Rs;
  const ln = bar ? `<rect x="0" y="34" width="200" height="26" fill="#141416"/><rect x="88" y="34" width="24" height="130" fill="#141416"/>` : `<rect x="${lineX - 13}" y="0" width="26" height="190" fill="#141416"/>`;
  const wh = (x, sp) => `<rect x="${x}" y="108" width="14" height="46" rx="3" fill="${sp ? '#16a34a' : '#94a3b8'}"/>`;
  const sens = (x, on) => `<circle cx="${x}" cy="48" r="10" fill="${on ? '#141416' : '#fff'}" stroke="#2563eb" stroke-width="3"/><text x="${x}" y="30" text-anchor="middle" font-size="17" font-weight="700" fill="#10203f">${on ? 1 : 0}</text>`;
  return `<svg viewBox="0 0 200 190" width="100%"><rect width="200" height="190" fill="#f7f9fc"/>${ln}${wh(64, l > 0)}${wh(122, r > 0)}<rect x="72" y="72" width="56" height="92" rx="9" fill="#2563eb" opacity=".92"/><rect x="82" y="86" width="36" height="30" rx="4" fill="#bfdbfe"/>${sens(70, Ls)}${sens(130, Rs)}<text x="73" y="178" font-size="14" font-weight="700" fill="#10203f" text-anchor="middle">G ${l}</text><text x="127" y="178" font-size="14" font-weight="700" fill="#10203f" text-anchor="middle">D ${r}</text></svg>`;
}
const CASES = [['straight', 0, 0, 150, 150], ['left', 1, 0, 0, 150], ['right', 0, 1, 150, 0], ['stop', 1, 1, 0, 0]];
const CODE_IF = { straight: 'if (!g && !d)     drive(VITESSE, VITESSE);', left: 'else if (g && !d) drive(0, VITESSE);', right: 'else if (!g && d) drive(VITESSE, 0);', stop: 'else              drive(0, 0);' };
const code = t => `<div class="kcode">${t}</div>`;
function casesHTML(act, small) { return `<div class="cases${small ? ' small' : ''}">` + CASES.map(([k, Ls, Rs, l, r]) => `<div class="case ${act === k ? 'on' : ''}" id="cs_${k}">${caseSVG(Ls, Rs, l, r)}<div class="cn" style="color:${BRCOL[k]}">${Ls} · ${Rs} → ${FR[k]}</div></div>`).join('') + `</div>`; }
function driveHTML(frac) {
  const rows = [['Tout droit', 150, 150], ['Tourner à gauche', 0, 150], ['Pivoter sur place', -150, 150], ['Arrêt', 0, 0]];
  const k = Math.min(3, Math.floor(frac * 4)); const [nm, gl, gr] = rows[k];
  const bar = v => `<div class="vbar"><div class="vzero"></div><div class="vfill" style="background:${v < 0 ? '#d97706' : '#16a34a'};${v < 0 ? 'top:50%' : 'bottom:50%'};height:${Math.abs(v) / 255 * 50}%"></div></div>`;
  return `<div class="ktitle">drive(g, d)</div><div class="kbody"><div class="col2">${bar(gl)}<b>${gl}</b><small>Moteur gauche</small></div><div class="col2" style="min-width:300px"><div style="font-size:44px;font-weight:700;color:#2563eb;margin-bottom:6px">${nm}</div><div style="font-size:26px">−255 ⟵ 0 ⟶ +255</div><div style="font-size:23px;color:#4d5f86;margin-top:6px">+ = avant · − = arrière</div></div><div class="col2">${bar(gr)}<b>${gr}</b><small>Moteur droit</small></div></div>${code('void drive(int g, int d) {\n  moteur(ENA, IN1, IN2, g);\n  moteur(ENB, IN3, IN4, d);\n}')}`;
}
function hbridgeSVG(mode) {
  const sw = (x, y, closed) => closed ? `<line x1="${x}" y1="${y - 26}" x2="${x}" y2="${y + 26}" stroke="#16a34a" stroke-width="7" stroke-linecap="round"/>` : `<line x1="${x}" y1="${y - 26}" x2="${x + 18}" y2="${y + 14}" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>`;
  const A = mode === 0, Bm = mode === 1;
  const cur = A ? `<path d="M110 62 V145 H165 M245 145 H300 V228" stroke="#e11d1d" stroke-width="7" fill="none"/><polygon points="150,135 170,145 150,155" fill="#e11d1d"/>` : Bm ? `<path d="M300 62 V145 H245 M165 145 H110 V228" stroke="#e11d1d" stroke-width="7" fill="none"/><polygon points="260,135 240,145 260,155" fill="#e11d1d"/>` : '';
  return `<svg viewBox="0 0 410 290" width="100%"><rect x="30" y="20" width="350" height="8" fill="#1d4ed8"/><text x="205" y="14" text-anchor="middle" font-size="18" font-weight="700" fill="#1d4ed8">+ batterie</text><rect x="30" y="262" width="350" height="8" fill="#334155"/><line x1="110" y1="28" x2="110" y2="262" stroke="#cbd5e1" stroke-width="4"/><line x1="300" y1="28" x2="300" y2="262" stroke="#cbd5e1" stroke-width="4"/>${cur}${sw(110, 62, A)}${sw(300, 62, Bm)}${sw(110, 228, Bm)}${sw(300, 228, A)}<circle cx="205" cy="145" r="40" fill="#fff" stroke="#10203f" stroke-width="6"/><text x="205" y="158" text-anchor="middle" font-size="40" font-weight="700" fill="#10203f">M</text><text x="100" y="196" text-anchor="end" font-size="18" font-weight="700" fill="#2563eb">OUT1</text><text x="310" y="196" font-size="18" font-weight="700" fill="#2563eb">OUT2</text></svg>`;
}
function pwmSVG(frac) {
  const rows = [[0.25, 64], [0.5, 128], [1, 255]];
  const wave = (y, duty) => { let d = `M10 ${y + 36}`; for (let i = 0; i < 4; i++) { const x0 = 10 + i * 90, hi = 90 * duty; d += ` V${y} H${x0 + hi}` + (duty < 1 ? ` V${y + 36} H${x0 + 90}` : ''); } return `<path d="${d}" fill="none" stroke="#2563eb" stroke-width="5" stroke-linejoin="round"/>`; };
  const cx = 10 + frac * 360;
  return `<svg viewBox="0 0 470 290" width="100%">` + rows.map(([d, v], i) => { const y = 14 + i * 92; return `${wave(y, d)}<text x="380" y="${y + 18}" font-size="22" font-weight="700" fill="#10203f">${Math.round(d * 100)} %</text><text x="380" y="${y + 44}" font-size="16" fill="#4d5f86">analogWrite(${v})</text>`; }).join('') + `<line x1="${cx}" y1="4" x2="${cx}" y2="286" stroke="#e11d1d" stroke-width="3" stroke-dasharray="6 5"/></svg>`;
}
// 2D simulation canvas (scene E last beat): same simulation as the 3D demo
function drawSim(cv, tsim) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height, s = 0.5, ox = w / 2, oz = h / 2;
  g.fillStyle = '#f7f9fc'; g.fillRect(0, 0, w, h); g.strokeStyle = '#cbd5e1'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
  const X = x => ox + x * s, Z = z => oz + z * s, R = S.TRK.R, Sx = S.TRK.S / 2;
  g.strokeStyle = '#141416'; g.lineWidth = S.TRK.HALF * 2 * s; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(X(-Sx), Z(R)); g.lineTo(X(Sx), Z(R)); g.moveTo(X(-Sx), Z(-R)); g.lineTo(X(Sx), Z(-R)); g.stroke();
  g.beginPath(); g.arc(X(Sx), Z(0), R * s, -Math.PI / 2, Math.PI / 2); g.stroke(); g.beginPath(); g.arc(X(-Sx), Z(0), R * s, Math.PI / 2, Math.PI * 1.5); g.stroke();
  g.fillStyle = '#141416'; g.fillRect(X(S.TRK.BAR_X - S.TRK.BAR_W / 2), Z(-R - 62), S.TRK.BAR_W * s, 124 * s);
  g.strokeStyle = 'rgba(37,99,235,.45)'; g.lineWidth = 3; g.beginPath();
  for (let tt = 0; tt <= tsim; tt += 0.1) { const q = S.simAt(tt); tt === 0 ? g.moveTo(X(q.x), Z(q.z)) : g.lineTo(X(q.x), Z(q.z)); } g.stroke();
  const q = S.simAt(tsim); g.save(); g.translate(X(q.x), Z(q.z)); g.rotate(q.th);
  g.fillStyle = 'rgba(37,99,235,.85)'; g.fillRect(-100 * s, -52 * s, 190 * s, 104 * s); g.fillStyle = '#111'; g.fillRect(-16 * s, -80 * s, 32 * s, 24 * s); g.fillRect(-16 * s, 56 * s, 32 * s, 24 * s);
  for (const [k, on] of [[-1, q.L], [1, q.R]]) { g.fillStyle = on ? '#141416' : '#fff'; g.strokeStyle = '#e11d1d'; g.lineWidth = 3; g.beginPath(); g.arc(S.GEOM.SENS_X * s, k * S.GEOM.SENS_Z * s, 6, 0, 7); g.fill(); g.stroke(); }
  g.restore();
}

// ================================================================== scene logic
const BASEY = { chassis: 0, motorL: 32.5, motorR: 32.5, wheelL: 32.5, wheelR: 32.5, caster: 0, battery: 45.5, switch: 45.5, l298n: 53.1, arduino: 53.1, irL: 31, irR: 31, mbb: 50.2 };
const so = Object.keys(P).filter(k => k.startsWith('so_'));
function robotBuild(t, full) {
  const keys = { chassis: K.chassis, motorL: K.motors[0], motorR: K.motors[1], wheelL: K.wheels[0], wheelR: K.wheels[1], caster: K.caster, irL: K.sensors[0], irR: K.sensors[1], battery: K.battery, switch: K.battery + 0.3, l298n: K.l298n, arduino: K.arduino, mbb: K.arduino + 0.4 };
  for (const k in BASEY) { const o = P[k]; if (full) { o.visible = true; o.position.y = BASEY[k]; } else { const p = ramp(t, keys[k], 0.7); o.visible = p > 0; o.position.y = BASEY[k] + (1 - p) * 55; } }
  for (const k of so) P[k].visible = full || t >= (k.startsWith('so_l') ? K.l298n : K.arduino) + 0.35;
  const f = (arr, ks, d) => arr.forEach((w, i) => w.userData.setProgress(full ? 1 : ramp(t, ks[i], d)));
  f(WR.motor, K.motorLeads, 1.0); f(WR.sensor, K.sensorWires, 1.1); f(WR.ctrl, K.ctrlWires, 1.2); f(WR.power, K.powerLeads, 1.2);
  const caps = P.l298n.userData.caps;
  if (full) caps.visible = false; else { const p = ramp(t, K.capsOff, 0.9); caps.position.y = p * 34; caps.visible = p < 0.97; }
  P.l298n.userData.power(full || t > B.d8.t0 ? 1 : 0);
  spots.forEach(s => { s.visible = false; });
}
function robotPose(q) {
  robot.position.set(q.x, 0, q.z); robot.rotation.y = -q.th;
  P.wheelL.rotation.z = -q.aL; P.wheelR.rotation.z = -q.aR;
}
function robotRest() { robot.position.set(0, 0, 0); robot.rotation.y = 0; P.wheelL.rotation.z = P.wheelR.rotation.z = 0; }
function allHidden() { robot.visible = track.visible = gParts.visible = gTheory.visible = gUsb.visible = false; mbb.visible = P.mbb.visible; }

const lw = (o, x, y, z) => o.localToWorld(V(x, y, z));
function update(t) {
  allHidden();
  const sc = T.sceneAt(t), beat = T.beatAt(t), id = beat ? beat.id : '';
  const hud = { title: 0, card: 0, stepper: 0, formula: 0, kid: 0, pins: 0, outro: 0 };
  let cardHTML, stepHTML, formHTML, kidHTMLs, pinsHTML; const labels = []; let cam; const sT = t - sc.t0;
  if (VERT) { vkNow = { A: 1.15, B: 1.2, C: 1.25, D: 1.7, E: 1.5, F: 1.8, G: 1.0, H: 1.0 }[sc.id]; distMin = sc.id === 'D' ? 270 : 0; voffNow = { A: 60, B: 30, C: 140, D: 330, E: 330, F: 200, G: 200, H: 80 }[sc.id]; }
  const sx = VERT ? 0 : 1;   // lateral shift used to make room for side panels in landscape

  // title
  const titleEl = $('title'); titleEl.classList.toggle('big', sc.id === 'A');
  titleEl.querySelector('.pill').textContent = sc.id === 'A' ? 'Projet robotique · 14 ans' : `Partie ${T.SCENES.indexOf(sc) + 1} / ${T.SCENES.length}`;
  titleEl.querySelector('h1').textContent = sc.id === 'A' ? 'Suiveur de ligne' : sc.title;
  titleEl.querySelector('.en').textContent = sc.sub;
  hud.title = sc.id === 'A' ? ramp(t, 0.6, 0.8) * (1 - ramp(t, sc.t1 - 1.5, 0.8)) : (sc.id === 'G' || sc.id === 'E' ? 0 : ramp(t, sc.t0 + 0.4, 0.5) * (1 - ramp(t, sc.t0 + 5.5, 0.6)));

  if (sc.id === 'A') {
    robot.visible = track.visible = true; robotBuild(t, true); const q = S.simAt(Math.max(0, t - sc.t0 - 0.4)); robotPose(q);
    setShadow(q.x, q.z, 260, 360);
    cam = { p: V(q.x + (VERT ? 10 : -20), 330, q.z + 520), l: V(q.x + (VERT ? 40 : -150), 30, q.z - 20), f: 38 };
  }

  if (sc.id === 'B') {
    gParts.visible = true; setShadow(0, 0, 640, 520);
    const act = { b1: 0, b2: 1, b3: 2, b4: 3, b5: 4, b6: 5 }[id];
    stages.forEach((s, i) => {
      const p = ramp(t, K.partsAppear[i], 0.6);
      const others = act === undefined || act === i ? 1 : 1 - ramp(t, B['b' + (act + 1)].t0 + 0.2, 0.7);
      const e = backOut((t - K.partsAppear[i]) / 0.7) * (act === i || act === undefined ? 1 : others);
      s.s.visible = p > 0 && e > 0.01; s.f.scale.setScalar(Math.max(0.001, e));
      s.f.position.y = s.base + 2.5 * Math.sin(t * 1.6 + i * 1.3);
      s.item.rotation.y = 0.45 * Math.sin(t * 0.55 + i); s.item.rotation.x = s.tilt || 0;
      const hl = act === i ? 1 : 0; s.ring.material.opacity = 0.3 + 0.5 * hl * (0.75 + 0.25 * Math.sin(t * 4)); s.disc.material.opacity = 0.08 + 0.16 * hl;
    });
    const wide = { t: B.b0.t0, p: [0, 240, 1040], l: [0, 25, 0], f: 36 };
    const keys = [wide, { ...wide, t: B.b0.t1 - 0.3 }];
    stages.forEach((s, i) => { const b = B['b' + (i + 1)]; const x = s.s.position.x; const k = VERT ? { p: [x, 100, 275], l: [x, 42, 0], f: 36 } : { p: [x - 28, 100, 275], l: [x - 62, 42, 0], f: 36 }; keys.push({ ...k, t: b.t0 + 1.0 }, { ...k, t: b.t1 - 0.1 }); });
    cam = camAt(keys, t);
    if (act !== undefined) { const d = PARTS[act]; hud.card = ramp(t, B['b' + (act + 1)].t0 + 0.6, 0.4) * (1 - ramp(t, B['b' + (act + 1)].t1 - 0.3, 0.3));
      cardHTML = `<div class="bigemo">${d.e}</div><h2>${d.n}</h2><div class="cnt">Quantité : ${d.q}</div><p>${d.d}</p>`; }
  }

  if (sc.id === 'C') {
    gTheory.visible = true; setShadow(0, 0, 260, 400);
    const isIR = id === 'c1'; bigIR.visible = strip.visible = rayE.visible = rayR.visible = absorb.visible = isIR; bigL.visible = !isIR;
    if (isIR) {
      const t0 = B.c1.t0, xc = 95 * Math.sin((t - t0) * 1.3), ym = 36 + 23.3 * 3.2, out = Math.abs(xc) < 33 ? 1 : 0;
      bigIR.position.set(xc, ym, 0);
      setRay(rayE, V(xc - 9, 39, 0), V(xc, 0.6, 0)); setRay(rayR, V(xc, 0.6, 0), V(xc + 9, 39, 0)); rayR.visible = !out; absorb.visible = !!out; absorb.position.set(xc, 0.5, 0);
      const a = ramp(t, t0 + 0.8, 0.5) * (1 - ramp(t, B.c1.t1 - 0.3, 0.3));
      bigIR.updateMatrixWorld(true);
      labels.push({ id: 'em', a, text: 'LED infrarouge', anchor: V(xc - 9, 41, 0), dx: -230, dy: 40, color: '#e11d1d' });
      labels.push({ id: 'rc', a, text: 'Phototransistor', anchor: V(xc + 9, 41, 0), dx: 230, dy: 40, color: '#d97706' });
      hud.formula = ramp(t, t0 + 0.6, 0.5) * (1 - ramp(t, B.c1.t1 - 0.3, 0.3));
      formHTML = `<div class="hd">Sortie du capteur</div><div class="big ${out ? 'b1' : 'b0'}">${out}</div><div class="row">${out ? '⬛ Ligne noire : la lumière est <b>absorbée</b>' : '⬜ Sol blanc : la lumière <b>revient</b>'}</div><div class="note">Sur la plupart des modules (à vérifier par un test).</div>`;
      cam = { p: V(30 * sx, 160, 340), l: V(70 * sx, 55, 0), f: 38 };
    } else {
      bigL.position.set(0, 14, 0); bigL.rotation.y = 0.5 * Math.sin(t * 0.5); bigL.updateMatrixWorld(true);
      const a = (d) => ramp(t, B[id].t0 + d, 0.5) * (1 - ramp(t, B[id].t1 - 0.3, 0.3));
      if (id === 'c2') {
        labels.push({ id: 'in', a: a(0.8), text: 'Commande ← Arduino', anchor: lw(bigL, 0, 8.6, -19), dx: -260, dy: -80, color: '#2563eb' });
        labels.push({ id: 'out', a: a(1.6), text: 'Sorties → moteurs', anchor: lw(bigL, 17, 10, 18.5), dx: 250, dy: 90, color: '#16a34a' });
        labels.push({ id: 'pw', a: a(2.4), text: 'Batterie 12V · GND · 5V', anchor: lw(bigL, -17.5, 10, 0), dx: -230, dy: 100, color: '#d97706' });
        hud.formula = a(0.5);
        formHTML = `<div class="hd">Pourquoi un driver ?</div><div class="cmp"><div class="cr"><span>Broche Arduino</span><div class="cb"><i style="width:9%;background:#2563eb"></i></div><b>20 mA</b></div><div class="cr"><span>Moteur TT</span><div class="cb"><i style="width:92%;background:#dc2626"></i></div><b>≥ 200 mA</b></div></div><div class="row">⚠️ Brancher un moteur directement sur une broche peut l’abîmer.<br>✅ Le L298N amplifie : l’Arduino commande, la batterie alimente.</div>`;
      }
      if (id === 'c3') {
        labels.push({ id: 'ena', a: a(0.8), text: 'ENA : vitesse (PWM)', anchor: lw(bigL, -6.35, 8.6, -19), dx: -240, dy: -90, color: '#16a34a' });
        labels.push({ id: 'in1', a: a(1.2), text: 'IN1 · IN2 : sens', anchor: lw(bigL, -2.5, 8.6, -19), dx: 40, dy: -150, color: '#2563eb' });
        hud.formula = a(0.5); const mode = Math.floor((t - B.c3.t0) / 2.4) % 3;
        formHTML = `<div class="hd">Pont en H</div>${hbridgeSVG(mode)}<table class="tt"><tr class="${mode === 0 ? 'on' : ''}"><td>IN1 = 1 · IN2 = 0</td><td>sens 1 ↻</td></tr><tr class="${mode === 1 ? 'on' : ''}"><td>IN1 = 0 · IN2 = 1</td><td>sens 2 ↺</td></tr><tr class="${mode === 2 ? 'on' : ''}"><td>IN1 = 0 · IN2 = 0</td><td>arrêt ■</td></tr></table>`;
      }
      if (id === 'c4') {
        hud.formula = a(0.5); const fr = ((t - B.c4.t0) * 0.28) % 1;
        formHTML = `<div class="hd">PWM : on/off très rapide</div>${pwmSVG(fr)}<div class="row">Plus le signal reste à 1, plus le moteur tourne vite.</div>`;
        labels.push({ id: 'pwm', a: a(0.8), text: 'ENA / ENB : broches PWM (5 et 10)', anchor: lw(bigL, -6.35, 8.6, -19), dx: -250, dy: -90, color: '#16a34a' });
      }
      cam = { p: V(30 * sx, 150, 230), l: V(48 * sx, 40, 0), f: 38 };
    }
  }

  if (sc.id === 'D') {
    robot.visible = true; robotRest(); robotBuild(t, false); setShadow(0, 0, 200, 340);
    const keys = [
      { t: B.d1.t0, p: [170, 200, 260], l: [0, 30, 0] }, { t: B.d1.t1, p: [-120, 170, 250], l: [-10, 30, 0] },
      { t: B.d2.t0 + 0.8, p: [230, 120, 140], l: [100, 30, 0] }, { t: B.d2.t1, p: [220, 100, 120], l: [100, 28, 0] },
      { t: B.d3.t0 + 0.8, p: [30, 260, 170], l: [10, 50, 0] }, { t: B.d3.t1, p: [20, 250, 160], l: [10, 50, 0] },
      { t: B.d4.t0 + 0.8, p: [20, 270, 170], l: [10, 50, 0] }, { t: B.d4.t1, p: [10, 260, 160], l: [10, 50, 0] },
      { t: B.d5.t0 + 0.8, p: [40, 290, 250], l: [30, 50, 0] }, { t: B.d5.t1, p: [40, 280, 240], l: [30, 50, 0] },
      { t: B.d6.t0 + 0.8, p: [-30, 270, -180], l: [-35, 55, -15] }, { t: B.d6.t1, p: [-30, 260, -170], l: [-35, 55, -15] },
      { t: B.d7.t0 + 0.8, p: [-20, 320, 230], l: [-10, 50, 0] }, { t: B.d7.t1, p: [10, 310, 220], l: [10, 50, 0] },
      { t: B.d8.t0 + 0.8, p: [-10, 130, -90], l: [-6, 58, -12] }, { t: B.d8.t1, p: [-10, 120, -85], l: [-6, 58, -12] },
      { t: B.d9.t0 + 0.6, p: [190, 190, 210], l: [-5, 40, 0] }, { t: B.d9.t1, p: [150, 170, 220], l: [-5, 40, 0] }];
    keys.forEach(k => { k.f = 38; k.p[0] += 40 * sx; k.l[0] += 40 * sx; });
    cam = camAt(keys, t);
    const a = (b, d) => ramp(t, b.t0 + d, 0.45) * (1 - ramp(t, b.t1 - 0.3, 0.3)); robot.updateMatrixWorld(true);
    if (id === 'd2') labels.push({ id: 'h', a: a(B.d2, 1.6), text: 'Capteurs ≈ 1 cm du sol', anchor: lw(robot, 108, 12, 0), dx: 120, dy: 90, color: '#2563eb' });
    if (id === 'd3') labels.push({ id: 'mb', a: a(B.d3, 3.6), text: 'Mini-breadboard (rails 5V / GND)', anchor: lw(robot, 62, 51, 41), dx: 190, dy: 60, color: '#16a34a' });
    if (id === 'd4') labels.push({ id: 'o', a: a(B.d4, 1.6), text: 'OUT1–OUT2 : moteur gauche · OUT3–OUT4 : droit', anchor: lw(robot, -6 + 17, 66, -18.5), dx: -40, dy: -130, color: '#16a34a' });
    if (id === 'd5') { labels.push({ id: 'd2', a: a(B.d5, 1.8), text: 'D2', anchor: lw(robot, ...AN.ard('D2').toArray()), dx: -20, dy: -100, color: '#d97706' }); labels.push({ id: 'd3', a: a(B.d5, 2.8), text: 'D3', anchor: lw(robot, ...AN.ard('D3').toArray()), dx: 40, dy: -120, color: '#d97706' }); }
    if (id === 'd6') ctrl.forEach(([lp, ap], i) => labels.push({ id: 'c' + i, a: a(B.d6, 1.0 + i * 1.3), text: `${ap} → ${lp}`, anchor: lw(robot, ...AN.ard(ap).toArray()), dx: -150 - (i % 2) * 90, dy: -70 - i * 26, color: '#2563eb' }));
    if (id === 'd7') { labels.push({ id: 'gc', a: a(B.d7, 6.2), text: 'GND commun', anchor: lw(robot, ...AN.ard('GND1').toArray()), dx: -170, dy: -90, color: '#334155' }); labels.push({ id: 'v5', a: a(B.d7, 4.0), text: '5V ← L298N (sans USB !)', anchor: lw(robot, ...AN.ard('5V').toArray()), dx: -210, dy: 70, color: '#dc2626' }); }
    if (id === 'd8') labels.push({ id: 'cap', a: a(B.d8, 0.4), text: 'Cavaliers ENA / ENB', anchor: lw(robot, -6, 60, -15), dx: -200, dy: -110, color: '#dc2626' });
    const di = { d1: 0, d2: 1, d3: 2, d4: 3, d5: 4, d6: 5, d7: 6, d8: 7 }[id];
    if (di !== undefined) { hud.stepper = ramp(t, B.d1.t0 + 0.4, 0.5); stepHTML = stepperHTML(di, STEPS_D, 'Étapes du montage'); }
  }

  if (sc.id === 'E') {
    robot.visible = true; robotRest(); robotBuild(t, true); setShadow(0, 0, 220, 360);
    robot.rotation.y = 0.5 + 0.3 * Math.sin(t * 0.4);
    cam = { p: V((VERT ? 40 : -10) + 100 * Math.sin(t * 0.3), 190, 290), l: V(VERT ? 0 : -150, 50, 0), f: 38 };
    hud.kid = ramp(t, sc.t0 + 0.4, 0.5) * (1 - ramp(t, sc.t1 - 0.5, 0.4));
    const frac = beat ? clamp((t - beat.t0) / (beat.t1 - beat.t0)) : 0;
    if (id === 'e0') kidHTMLs = driveHTML(frac);
    if (id === 'e1') kidHTMLs = `<div class="ktitle">Lire les capteurs</div><div class="kbody">${caseSVG(1, 0, 0, 150).replace('<svg ', '<svg style="max-width:300px" ')}<div class="col2" style="text-align:left;font-size:30px;line-height:1.7"><div><span class="sw0"></span> <b>0</b> = sol blanc</div><div><span class="sw1"></span> <b>1</b> = ligne noire</div><div style="font-size:22px;color:#4d5f86">selon le module : à vérifier</div></div></div>${code('bool g = digitalRead(CAPTEUR_G);\nbool d = digitalRead(CAPTEUR_D);')}`;
    const cm = { e2: 'straight', e3: 'left', e4: 'right', e5: 'stop' }[id];
    if (cm) kidHTMLs = `<div class="ktitle">Quatre cas possibles</div>${casesHTML(cm)}${code(CODE_IF[cm])}`;
    if (id === 'e6') {
      kidHTMLs = `<div class="ktitle">Simulation : loop() en boucle</div><div class="simwrap"><canvas id="simc" width="560" height="300"></canvas></div>${casesHTML(null, true)}`;
    }
  }

  if (sc.id === 'F') {
    robot.visible = gUsb.visible = true; robotRest(); robotBuild(t, true); setShadow(-120, 0, 320, 420); robot.updateMatrixWorld(true);
    const jack = V(-70 - 40.29 - 0, 53.1 + 5.45, -11.43);
    const e = ramp(t, K.usbIn, 1.0), xb = jack.x - 2 - 55 * (1 - e);
    plugA.position.set(-247, 4, -11.4); laptop.position.set(-330, 0, -19);
    plugB.position.set(xb, jack.y, jack.z); updateCable(jack, xb);
    P.arduino.userData.setPower(ramp(t, K.usbIn + 0.9, 0.4));
    cam = { p: V(-120 + 20 * sx, 230, 360), l: V(-150 + 30 * sx, 40, -10), f: 38 };
    const fi = { f1: 0, f2: t > K.upload ? 3 : 2 }[id];
    if (fi !== undefined) { hud.stepper = ramp(t, B.f1.t0 + 0.4, 0.5); stepHTML = stepperHTML(fi, STEPS_F, 'Téléverser') + (fi === 3 ? '<div style="font-size:30px;text-align:center;margin-top:8px">🎉 Programme chargé !</div>' : ''); }
    if (id === 'f1') labels.push({ id: 'u', a: ramp(t, K.usbIn + 1.0, 0.4) * (1 - ramp(t, B.f1.t1 - 0.3, 0.3)), text: 'Câble USB A → B', anchor: V(-185, 3, -2), dx: 0, dy: 110, color: '#334155' });
  }

  if (sc.id === 'G' || sc.id === 'H') {
    robot.visible = track.visible = true; robotBuild(t, true);
    const ts = sc.id === 'G' ? t - K.demo0 : 99; const q = S.simAt(Math.max(0, ts)); robotPose(q);
    spots[0].visible = spots[1].visible = sc.id === 'G'; spots[0].material.color.set(q.L ? 0x111111 : 0xff3030); spots[1].material.color.set(q.R ? 0x111111 : 0xff3030);
    setShadow(q.x, q.z, 260, 380);
    if (sc.id === 'G') {
      cam = { p: V(q.x + 60, 390, q.z + 500), l: V(q.x + 80, 10, q.z - 10), f: 38 };
      hud.pins = ramp(t, K.demo0 + 0.3, 0.5);
      const bc = BRCOL[q.b];
      pinsHTML = `<div class="chips"><div class="chip"><span class="dot" style="background:${q.L ? '#141416' : '#fff'};border:3px solid #2563eb"></span>Capteur G : <b>${q.L}</b></div><div class="chip"><span class="dot" style="background:${q.R ? '#141416' : '#fff'};border:3px solid #2563eb"></span>Capteur D : <b>${q.R}</b></div><div class="chip big" style="color:${bc};border-color:${bc}">${FR[q.b]}</div></div><div class="mot">Moteur G <i><u style="width:${q.l / 255 * 100}%"></u></i> ${q.l} &nbsp; Moteur D <i><u style="width:${q.r / 255 * 100}%"></u></i> ${q.r}</div>`;
    } else {
      cam = { p: V(q.x + 40 + 60 * sx, 330, q.z + 470), l: V(q.x + 60 + 150 * sx, 10, q.z), f: 38 };
      hud.outro = ramp(t, B.h2.t0 + 0.2, 0.7);
      if (id === 'h1') { hud.card = ramp(t, B.h1.t0 + 0.2, 0.4) * (1 - ramp(t, B.h1.t1 - 0.3, 0.3)); cardHTML = `<div class="bigemo">💡</div><h2>Pour aller plus loin</h2><p>• un 3ᵉ capteur au centre<br>• vitesse variable selon l’écart<br>• régulation <b>PID</b><br>• capteurs analogiques (A0–A5)</p>`; }
    }
  }

  placeCam(cam, t);
  renderer.render(scene, camera);
  showLabels(labels);

  setHUD($('title'), hud.title);
  setHUD($('card'), hud.card, cardHTML);
  setHUD($('stepper'), hud.stepper, stepHTML);
  setHUD($('formula'), hud.formula, formHTML);
  setHUD($('kid'), hud.kid, kidHTMLs);
  setHUD($('pins'), hud.pins, pinsHTML);
  setHUD($('outro'), hud.outro);
  // live elements of the simulation panel
  if (sc.id === 'E' && id === 'e6') {
    const ts = clamp((t - B.e6.t0) / (B.e6.t1 - B.e6.t0)) * 10.2; const q = S.simAt(ts); const cv = document.getElementById('simc'); if (cv) drawSim(cv, ts);
    for (const k of ['straight', 'left', 'right', 'stop']) { const el = document.getElementById('cs_' + k); if (el) el.classList.toggle('on', q.b === k); }
  }
  let ca = 0, ctext; if (beat && beat.text) { ca = ramp(t, beat.t0 - 0.05, 0.3) * (1 - ramp(t, beat.t1 - 0.2, 0.2)); ctext = beat.text; }
  setHUD($('caption'), sc.id === 'H' && id === 'h2' ? 0 : ca, ctext);
  const f = Math.max(1 - ramp(t, sc.t0, 0.7), ramp(t, sc.t1 - 0.7, 0.7)); fadeEl.style.opacity = t < 0.02 ? 1 : f;
}

window.TOTAL = T.VTOTAL; window.FPS = T.FPS;
window.setTime = (v) => { update(T.toInternal(v)); };
document.fonts.ready.then(() => { window.READY = true; const q = new URLSearchParams(location.search); if (q.has('t')) update(T.toInternal(parseFloat(q.get('t')))); });
