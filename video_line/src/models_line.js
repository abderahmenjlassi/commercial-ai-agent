// Line-follower robot parts (mm). Robot frame: forward = +x, right = +z, up = +y, ground y = 0, origin = axle centre.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MAT, canvasTex, makeGlow, makeArduino, unoPinLocal, PITCH } from './models.js';

const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
const rbox = (w, h, d, r, mat, x, y, z) => mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat, x, y, z);
const cyl = (r, h, mat, x, y, z, seg = 24, axis = 'y') => { const m = mesh(new THREE.CylinderGeometry(r, r, h, seg), mat, x, y, z); if (axis === 'z') m.rotation.x = Math.PI / 2; if (axis === 'x') m.rotation.z = Math.PI / 2; return m; };
const std = (c, r = 0.5, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

// ---------------------------------------------------------------- L298N driver module (board top surface y = 0)
export const L298 = { W: 43, D: 43 };
export const L298_PINS = { // local top-of-connector positions (x forward, z right)
  OUT1: [14.5, -21, -0], OUT2: [19.5, -21, 0], OUT3: [14.5, 21, 0], OUT4: [19.5, 21, 0],
  V12: [-17.5, 0, -5], GND: [-17.5, 0, 0], V5: [-17.5, 0, 5],
  ENA: [-6.35, 0, -19], IN1: [-3.81, 0, -19], IN2: [-1.27, 0, -19], IN3: [1.27, 0, -19], IN4: [3.81, 0, -19], ENB: [6.35, 0, -19],
};
function l298nTexture() {
  const S = 28, W = 43 * S, D = 43 * S;
  return canvasTex(W, D, (g) => {
    g.fillStyle = '#b3242b'; g.fillRect(0, 0, W, D);
    g.fillStyle = '#f5f5f5'; g.textAlign = 'center'; g.font = `bold ${2.2 * S}px DejaVu Sans, Arial`;
    const X = x => (x + 21.5) * S, Z = z => (z + 21.5) * S;
    g.fillText('L298N', X(-4), Z(10)); g.font = `bold ${1.5 * S}px DejaVu Sans, Arial`;
    g.fillText('OUT1 OUT2', X(17), Z(-13.4)); g.fillText('OUT3 OUT4', X(17), Z(15.6));
    ['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB'].forEach((n, i) => { g.save(); g.translate(X(-6.35 + i * 2.54), Z(-15.6)); g.rotate(-Math.PI / 2); g.font = `bold ${1.15 * S}px DejaVu Sans, Arial`; g.fillText(n, 0, 0); g.restore(); });
    ['12V', 'GND', '5V'].forEach((n, i) => { g.save(); g.translate(X(-15.2), Z(-7 + i * 7)); g.rotate(-Math.PI / 2); g.font = `bold ${1.4 * S}px DejaVu Sans, Arial`; g.fillText(n, 0, 0); g.restore(); });
    g.strokeStyle = '#e8d9d9'; g.lineWidth = 3; g.strokeRect(X(-20.5), Z(-20.5), 41 * S, 41 * S);
    for (const [hx, hz] of [[-19, -19], [19, -19], [-19, 19], [19, 19]]) { g.fillStyle = '#f2e9e9'; g.beginPath(); g.arc(X(hx), Z(hz), 1.9 * S, 0, 7); g.fill(); g.fillStyle = '#5a1015'; g.beginPath(); g.arc(X(hx), Z(hz), 1.35 * S, 0, 7); g.fill(); }
  }, 16);
}
export function makeL298N() {
  const g = new THREE.Group(); g.name = 'l298n';
  const pcb = rbox(43, 1.6, 43, 0.5, std(0xb3242b, 0.45), 0, -0.8, 0); g.add(pcb);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(42.6, 42.6), new THREE.MeshStandardMaterial({ map: l298nTexture(), roughness: 0.45 })); top.rotation.x = -Math.PI / 2; top.position.y = 0.02; top.receiveShadow = true; g.add(top);
  // heatsink with fins + L298 power IC
  const alu = std(0x1b1d22, 0.5, 0.4);
  g.add(box(22, 3, 20, alu, -4, 1.5, -2));
  for (let i = 0; i < 7; i++) g.add(box(22, 22, 1.1, alu, -4, 14, -10.5 + i * 3.1));
  g.add(box(20, 14, 4.5, MAT.black, -4, 7, 9)); for (let i = 0; i < 15; i++) g.add(box(0.5, 4, 0.5, MAT.silver, -12 + i * 1.7, 2, 12.5));
  // screw terminals (blue)
  const blue = std(0x2467d1, 0.5);
  const term = (x, z, n, along) => { const b = box(along ? 10 : 10, 9, along ? 5 * n : 5 * n, blue, x, 4.5, z); g.add(b);
    for (let i = 0; i < n; i++) { const sx = along ? x : x, sz = z + (i - (n - 1) / 2) * 5; g.add(cyl(2.0, 1.2, std(0xd0d4da, 0.3, 0.9), sx, 9.4, sz, 16)); const slot = box(3.4, 0.4, 0.7, MAT.black, sx, 10.1, sz); slot.rotation.y = i * 0.9; g.add(slot); } };
  // OUT1/OUT2 on left edge (z<0), OUT3/OUT4 on right edge (z>0): blocks of 2 along x
  for (const [cz] of [[-18.5], [18.5]]) { g.add(box(10, 9, 10, blue, 17, 4.5, cz)); for (let i = 0; i < 2; i++) { g.add(cyl(2.0, 1.2, std(0xd0d4da, 0.3, 0.9), 14.5 + i * 5, 9.4, cz, 16)); const sl = box(3.4, 0.4, 0.7, MAT.black, 14.5 + i * 5, 10.1, cz); sl.rotation.y = i * 0.9 + 0.3; g.add(sl); } }
  g.children[g.children.length - 1];
  // 3-way power terminal (12V GND 5V) on rear edge
  g.add(box(10, 9, 15, blue, -17.5, 4.5, 0)); for (let i = 0; i < 3; i++) { g.add(cyl(2.0, 1.2, std(0xd0d4da, 0.3, 0.9), -17.5, 9.4, -5 + i * 5, 16)); const sl = box(3.4, 0.4, 0.7, MAT.black, -17.5, 10.1, -5 + i * 5); sl.rotation.y = i * 0.7; g.add(sl); }
  // 6-pin control header (ENA IN1 IN2 IN3 IN4 ENB) on left edge
  g.add(box(15.5, 2.5, 2.54, MAT.black, 0, 1.25, -19)); for (const k of ['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB']) { const [x, , z] = L298_PINS[k]; g.add(box(0.64, 8.5, 0.64, MAT.gold, x, 4.2, z)); }
  // ENA / ENB jumper caps (as shipped) -> removed in the "d8" step
  const caps = new THREE.Group(); caps.name = 'caps';
  for (const x of [-6.35, 6.35]) { const c = box(2.7, 4.5, 5.2, std(0x151515, 0.5), x, 2.2, -15.2); caps.add(c); }
  g.add(caps); g.userData.caps = caps;
  // 5V-EN jumper, caps, diodes, regulator
  for (let i = 0; i < 8; i++) { const zz = i < 4 ? -13.5 + i * 3.6 : 3 + (i - 4) * 3.6; g.add(box(5.2, 1.5, 2.2, MAT.black, i < 4 ? 14.5 : 14.5, 0.75, zz)); }
  g.add(box(2.7, 4.5, 5.2, std(0x151515, 0.5), -12, 2.2, 14)); for (const [x, z] of [[8, 9], [14, 9], [8, 4]]) g.add(box(3.2, 1.4, 6.5, MAT.black, x, 0.7, z));
  g.add(cyl(4.2, 11, std(0xc9ced6, 0.35, 0.7), 12, 5.5, 2, 24)); g.add(cyl(3.6, 9, std(0xc9ced6, 0.35, 0.7), 13, 4.5, -8, 24));
  g.add(box(6.5, 2.4, 6.5, MAT.black, -13, 1.2, 8)); const led = box(2, 0.8, 1.2, std(0xff2a2a, 0.3), -13, 0.5, -8.5); g.add(led);
  const glow = makeGlow(0xff4444, 6); glow.position.set(-13, 1.8, -8.5); g.add(glow); g.userData.power = a => { led.material.emissive = new THREE.Color(0xff2020); led.material.emissiveIntensity = 2.2 * a; glow.material.opacity = 0.5 * a; };
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------- TCRT5000 line-tracking module as sold in the kit (black PCB, 3 pins GND VCC OUT; long axis = y, optical head down)
function irTexture() {
  const W = 256, H = 700; // 11.5 x 32.5 mm board face
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#17181c'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#2b2d34'; g.lineWidth = 4; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(20 + i * 28, 0); g.lineTo(20 + i * 28, H); g.stroke(); }
    g.fillStyle = '#f1f1f1'; g.strokeStyle = '#f1f1f1'; g.lineWidth = 7;
    const ring = (cx, cy, r) => { g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); g.fillStyle = '#c9ccd2'; g.beginPath(); g.arc(cx, cy, r - 4, 0, 7); g.fill(); g.fillStyle = '#f1f1f1'; };
    ring(128, 580, 46); ring(128, 490, 36);
    g.font = 'bold 34px DejaVu Sans, Arial'; g.textAlign = 'center'; g.fillText('R', 36, 600); g.fillText('T', 222, 600);
    g.font = 'bold 22px DejaVu Sans, Arial'; g.fillText('R1', 218, 290); g.fillText('R3', 214, 190); g.fillText('LED', 212, 150);
    g.font = 'bold 30px DejaVu Sans, Arial'; g.fillText('GND', 46, 42); g.fillText('VCC', 128, 42); g.fillText('OUT', 214, 42);
  }, 16);
}
export function makeIRSensor() {
  const g = new THREE.Group(); g.name = 'ir';
  const pcb = std(0x14151a, 0.35, 0.1);
  g.add(box(1.6, 33, 11.5, pcb, 3.2, 2.5, 0));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 33), new THREE.MeshStandardMaterial({ map: irTexture(), roughness: 0.4 })); face.rotation.y = Math.PI / 2; face.position.set(4.03, 2.5, 0); g.add(face);
  // blue trimmer potentiometer "103" + LM393 + SMD parts
  g.add(box(4.6, 7.6, 7.6, std(0x2457c9, 0.4), 6.3, 2.3, 0)); g.add(cyl(1.7, 1.2, std(0xe6e6e6, 0.3, 0.6), 9.0, 2.3, 0, 16, 'x'));
  g.add(box(4.9, 1.6, 5.1, MAT.black, 5.7, 9.2, 0));
  g.add(box(1.8, 1.2, 0.9, std(0xcfd6c0, 0.5), 5.0, 14.2, -3.4)); g.add(box(1.8, 1.2, 0.9, std(0x222222, 0.5), 5.0, 14.2, 3.2));
  const sl = box(1.8, 0.8, 1.1, std(0xff3030, 0.3), 4.5, 15.6, -3.4); g.add(sl); g.userData.sigLed = sl; g.add(box(1.8, 0.8, 1.1, std(0x10e060, 0.3), 4.5, 15.6, 3.4));
  // 3-pin header out of the top end: GND VCC OUT
  g.add(box(2.54, 2.5, 7.62, MAT.black, 3.2, 20.7, 0)); for (let i = 0; i < 3; i++) g.add(box(0.64, 9, 0.64, MAT.gold, 3.2, 25.2, (i - 1) * 2.54));
  // TCRT5000 head (black housing; emitter = blue clear dome, receiver = black dome) at the bottom
  g.add(box(5.8, 8, 10.2, std(0x0e0e10, 0.45), 0, -17.5, 0));
  g.add(cyl(2.1, 3, std(0x4d7df0, 0.1), 0, -21.5, 2.8, 20, 'y')); g.add(cyl(2.1, 3, std(0x090909, 0.2), 0, -21.5, -2.8, 20, 'y'));
  g.add(box(0.5, 6, 0.5, MAT.silver, 3.2, -14, 4.5), box(0.5, 6, 0.5, MAT.silver, 3.2, -14, -4.5));
  g.userData.tipY = -23.3; g.userData.emitterZ = 2.8; g.userData.receiverZ = -2.8;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------- TT gear motor (shaft axis = z, shaft at origin) and wheel
export function makeTTMotor() {
  const g = new THREE.Group(); g.name = 'tt';
  const yel = std(0xf5c518, 0.45);
  g.add(rbox(40, 18.8, 22.5, 1.5, yel, 0, 0, 0));                             // yellow gearbox
  g.add(rbox(10, 14, 22.6, 1, std(0xf5c518, 0.45), -14, 0, 0));
  const can = cyl(10.3, 30, std(0x8e9298, 0.45, 0.55), 34, 0, 0, 32, 'x'); can.scale.y = 1; can.scale.z = 1; g.add(can);   // grey motor can
  const flat = box(30, 16.2, 17.6, std(0x8e9298, 0.45, 0.55), 34, 0, 0); flat.visible = false; g.add(flat);
  g.add(cyl(10.4, 4, std(0x151515, 0.5), 50, 0, 0, 32, 'x'));                  // end cap
  g.add(box(2, 1, 3.5, MAT.gold, 52.5, 3, -4), box(2, 1, 3.5, MAT.gold, 52.5, 3, 4)); // solder tabs
  g.add(cyl(2.7, 40, std(0xf0f0ea, 0.35, 0.1), 0, 0, 0, 16, 'z'));            // white double D-shaft
  g.userData.tabs = { a: [52.5, 3, -4], b: [52.5, 3, 4] };
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
export function makeWheel() {
  const g = new THREE.Group(); g.name = 'wheel';
  const prof = []; const R = 32.5, W = 13;
  const pts = [[R - 10, -W + 3], [R - 4, -W], [R - 1, -W + 2], [R, -W + 5], [R, W - 5], [R - 1, W - 2], [R - 4, W], [R - 10, W - 3]];
  for (const [r, y] of pts) prof.push(new THREE.Vector2(r, y));
  const tire = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), std(0x141416, 0.85)); tire.rotation.x = Math.PI / 2; tire.castShadow = true; tire.receiveShadow = true; g.add(tire);
  for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; const t = box(3, 1.4, 20, std(0x0e0e10, 0.9), 0, 0, 0); t.position.set(Math.cos(a) * (R + 0.2), Math.sin(a) * (R + 0.2), 0); t.rotation.z = a; g.add(t); }
  const Y = std(0xf7d11f, 0.4);   // yellow 5-spoke rim
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 7.5, 2.6, 12, 48), Y); g.add(rim);
  const dish = cyl(R - 9, 2.2, Y, 0, 0, -2, 40, 'z'); g.add(dish);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.3; const sp = box(19, 5.5, 5, Y, 0, 0, 0); sp.position.set(Math.cos(a) * 14.5, Math.sin(a) * 14.5, 1); sp.rotation.z = a; g.add(sp); }
  g.add(cyl(7.5, 22, Y, 0, 0, 0, 24, 'z'));
  g.add(cyl(3, 24, std(0x111111, 0.6), 0, 0, 0, 12, 'z'));
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------- chassis, caster, battery
export function makeChassis() {
  const g = new THREE.Group(); g.name = 'chassis';
  const sh = new THREE.Shape(); const hx = 104, hz = 54, rr = 10;
  sh.moveTo(-hx + rr, -hz); sh.lineTo(hx - 34, -hz); sh.quadraticCurveTo(hx + 4, -hz, hx + 4, -hz + 34); sh.lineTo(hx + 4, hz - 34); sh.quadraticCurveTo(hx + 4, hz, hx - 34, hz);
  sh.lineTo(-hx + rr, hz); sh.quadraticCurveTo(-hx, hz, -hx, hz - rr); sh.lineTo(-hx, -hz + rr); sh.quadraticCurveTo(-hx, -hz, -hx + rr, -hz);
  const hole = (path) => sh.holes.push(path);
  const circ = (cx, cy, r) => { const p = new THREE.Path(); p.absarc(cx, cy, r, 0, Math.PI * 2, true); hole(p); };
  const rect = (cx, cy, w, h) => { const p = new THREE.Path(); p.moveTo(cx - w / 2, cy - h / 2); p.lineTo(cx - w / 2, cy + h / 2); p.lineTo(cx + w / 2, cy + h / 2); p.lineTo(cx + w / 2, cy - h / 2); p.closePath(); hole(p); };
  circ(60, 0, 9);                                              // big cable hole
  for (const z of [-30, 30]) { rect(-8, z, 18, 4); rect(-8, z, 4, 18); }  // plus-shaped cut-outs
  rect(20, -44, 36, 3.5); rect(20, 44, 36, 3.5); rect(-60, 0, 24, 8);
  for (const x of [-92, -76, -60, -44, -28, -12, 4, 20, 36, 52, 68, 84]) for (const z of [-46, 46]) circ(x, z, 1.6);
  for (const x of [-86, -50, -14, 22, 58, 90]) circ(x, 0, 1.6);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: false, curveSegments: 12 });
  geo.rotateX(-Math.PI / 2); geo.translate(-4, 42.5, 0);      // shape y -> z, thickness up
  const amber = new THREE.MeshStandardMaterial({ color: 0xc98e50, roughness: 0.32, metalness: 0.05, transparent: true, opacity: 0.93 });
  const plate = new THREE.Mesh(geo, amber); plate.castShadow = true; plate.receiveShadow = true; g.add(plate);
  const tab = new THREE.Mesh(new RoundedBoxGeometry(22, 3, 70, 1, 1), amber); tab.position.set(110, 44, 0); tab.castShadow = true; g.add(tab);
  g.userData.top = 45.5;
  return g;
}
export function makeCaster() {   // metal universal ball caster with white ball
  const g = new THREE.Group(); g.name = 'caster';
  const alu = std(0xcdd1d8, 0.3, 0.9);
  g.add(mesh(new THREE.SphereGeometry(8, 28, 20), std(0xf4f4f0, 0.35), 0, 8, 0));
  g.add(cyl(8.6, 3, alu, 0, 15.5, 0, 24)); g.add(cyl(5.2, 11, alu, 0, 22, 0, 18));
  g.add(box(17, 2, 17, alu, 0, 28.5, 0)); g.add(cyl(4.5, 7, alu, 0, 33, 0, 16));
  return g;
}
export function makeBattery() { // 2S 18650 holder, local origin = holder bottom centre
  const g = new THREE.Group(); g.name = 'battery';
  const black = std(0x111214, 0.55);
  g.add(rbox(76, 6, 38, 2, black, 0, 3, 0));
  for (const z of [-9.5, 9.5]) { g.add(rbox(76, 12, 1.6, 0.8, black, 0, 12, z + (z > 0 ? 9.6 : -9.6))); g.add(cyl(9.1, 65, std(0x2a4fa6, 0.35, 0.3), 0, 15.2, z, 28, 'x')); g.add(cyl(9.2, 8, std(0xc7cbd2, 0.3, 0.9), 34.5, 15.2, z, 28, 'x')); g.add(cyl(9.2, 8, std(0xc7cbd2, 0.3, 0.9), -34.5, 15.2, z, 28, 'x')); }
  g.add(rbox(1.6, 12, 20, 0.8, black, 37.5, 12, 0)); g.add(rbox(1.6, 12, 20, 0.8, black, -37.5, 12, 0));
  const wire = (c, z) => { const cv = new THREE.CatmullRomCurve3([new THREE.Vector3(-37.5, 8, z), new THREE.Vector3(-43, 9, z * 1.4), new THREE.Vector3(-49, 5, z * 2.2)]); const m = new THREE.Mesh(new THREE.TubeGeometry(cv, 12, 0.9, 8), std(c, 0.5)); m.castShadow = true; g.add(m); };
  wire(0xd51f1f, -4); wire(0x151515, 4);
  g.userData.top = 24.5; g.userData.leadOut = [-38, 8, 0];
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
export function makeSwitch() {
  const g = new THREE.Group(); g.add(box(13, 8, 19, std(0x1a1a1c, 0.5), 0, 4, 0)); const lev = box(6, 5, 8, std(0xd23030, 0.45), 0, 9.5, 0); lev.rotation.z = 0.25; g.add(lev);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } }); return g;
}

// ---------------------------------------------------------------- bare lead (wire with no connector) from A to B, drawable progressively
export function makeLead(color, A, B, { lift = 14, r = 0.95, sag = 0 } = {}) {
  const g = new THREE.Group();
  const d = Math.hypot(B.x - A.x, B.z - A.z);
  const h = Math.max(8, 5 + d * 0.22) + lift;
  const pts = [A.clone().add(new THREE.Vector3(0, 3, 0)), A.clone().add(new THREE.Vector3(0, 8, 0)), A.clone().lerp(B, 0.5).add(new THREE.Vector3(0, h, 0)), B.clone().add(new THREE.Vector3(0, 8, 0)), B.clone().add(new THREE.Vector3(0, 3, 0))];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, r, 8, false), std(color, 0.45)); tube.castShadow = true; g.add(tube);
  const total = tube.geometry.index.count;
  const tipA = mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 6, 10), MAT.silver, A.x, A.y - 1, A.z), tipB = mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 6, 10), MAT.silver, B.x, B.y - 1, B.z); g.add(tipA, tipB);
  g.userData.setProgress = p => { p = Math.min(1, Math.max(0, p)); g.visible = p > 0; tube.geometry.setDrawRange(0, Math.floor((total * p) / 3) * 3); tipA.visible = p > 0; tipB.visible = p >= 0.999; };
  g.userData.setProgress(1); return g;
}

// ---------------------------------------------------------------- track texture (white board, 19 mm black tape, stop bar)
export function trackTexture(TRK) {
  const S = 1.5, W = 1500, D = 900;
  return canvasTex(Math.round(W * S), Math.round(D * S), (g, w, h) => {
    g.fillStyle = '#f7f9fc'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d3dbe8'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    const X = x => (x + W / 2) * S, Z = z => (z + D / 2) * S;
    g.strokeStyle = '#141416'; g.lineWidth = TRK.HALF * 2 * S; g.lineCap = 'butt';
    const R = TRK.R, Sx = TRK.S / 2;
    g.beginPath(); g.moveTo(X(-Sx), Z(R)); g.lineTo(X(Sx), Z(R)); g.stroke();
    g.beginPath(); g.moveTo(X(-Sx), Z(-R)); g.lineTo(X(Sx), Z(-R)); g.stroke();
    g.beginPath(); g.arc(X(Sx), Z(0), R * S, -Math.PI / 2, Math.PI / 2); g.stroke();
    g.beginPath(); g.arc(X(-Sx), Z(0), R * S, Math.PI / 2, Math.PI * 1.5); g.stroke();
    g.fillStyle = '#141416'; g.fillRect(X(TRK.BAR_X - TRK.BAR_W / 2), Z(-R - 62), TRK.BAR_W * S, 124 * S);
    g.fillStyle = '#d33'; g.font = `bold ${22 * S}px DejaVu Sans, Arial`; g.textAlign = 'center'; g.fillText('DÉPART', X(-170), Z(R + 70));
  }, 16);
}

// ---------------------------------------------------------------- full robot assembly
export const LAYOUT = { // robot-frame positions
  battery: [62, 45.5, -8], l298n: [-6, 53.1, 0], arduino: [-70, 53.1, 0], sensorX: 105, sensorZ: 15, sensorY: 31,
  motorY: 32.5, motorX: 0, wheelZ: 70, caster: [-92, 0, 0], motorZ: 45,
};
export function makeRobot() {
  const robot = new THREE.Group(); robot.name = 'robot';
  const parts = {};
  const add = (k, o, pos) => { o.position.set(...pos); robot.add(o); parts[k] = o; return o; };
  add('chassis', makeChassis(), [0, 0, 0]);
  for (const side of [-1, 1]) {
    const m = makeTTMotor(); if (side === 1) m.rotation.y = 0; const k = side < 0 ? 'motorL' : 'motorR';
    add(k, m, [LAYOUT.motorX - 10, LAYOUT.motorY, side * LAYOUT.motorZ]);
    const w = makeWheel(); add(side < 0 ? 'wheelL' : 'wheelR', w, [0, 32.5, side * LAYOUT.wheelZ]);
  }
  add('caster', makeCaster(), LAYOUT.caster);
  add('battery', makeBattery(), LAYOUT.battery);
  const sw = makeSwitch(); add('switch', sw, [4, 45.5, 40]);
  add('l298n', makeL298N(), LAYOUT.l298n);
  const ard = makeArduino(); add('arduino', ard, LAYOUT.arduino);
  // standoffs under boards
  for (const [x, z] of [[-24, -18], [12, -18], [-24, 18], [12, 18]]) { const s = cyl(2.6, 6.6, std(0xc9a84a, 0.35, 0.8), x, 48.8, z, 12); robot.add(s); parts['so_l' + x + z] = s; }
  for (const [x, z] of [[-100, -22], [-45, -22], [-100, 22], [-45, 20]]) { const s = cyl(2.6, 6.6, std(0xc9a84a, 0.35, 0.8), x, 48.8, z, 12); robot.add(s); parts['so_a' + x + z] = s; }
  for (const side of [-1, 1]) { const s = makeIRSensor(); add(side < 0 ? 'irL' : 'irR', s, [LAYOUT.sensorX, LAYOUT.sensorY, side * LAYOUT.sensorZ]); }
  robot.userData.parts = parts;
  // anchors (robot frame)
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const l = LAYOUT.l298n, la = LAYOUT.arduino, A = {};
  const l298 = (k, dy = 0) => { const p = L298_PINS[k]; return V(l[0] + p[0], l[1] + (k.startsWith('OUT') || k === 'V12' || k === 'GND' || k === 'V5' ? 10.4 : 8.6) + dy, l[2] + p[2] + (k.startsWith('OUT') ? (p[1] < 0 ? -2.5 : 2.5) : 0) + (k.startsWith('OUT') ? 0 : 0)); };
  for (const k of Object.keys(L298_PINS)) { const p = L298_PINS[k]; A[k] = k.startsWith('OUT') ? V(l[0] + p[0], l[1] + 10.4, l[2] + (p[1] < 0 ? -18.5 : 18.5)) : (k === 'V12' || k === 'GND' || k === 'V5') ? V(l[0] + p[0], l[1] + 10.4, l[2] + p[2]) : V(l[0] + p[0], l[1] + 8.6, l[2] + p[2]); }
  A.ard = n => unoPinLocal(n).add(V(la[0], la[1], la[2]));
  A.motorTab = (side, which) => V(8, 46.5, side * (which === 'a' ? 49 : 55));
  A.ir = (side, which) => { const x = LAYOUT.sensorX + 3.2; const zOff = { GND: -2.54, VCC: 0, OUT: 2.54 }[which]; return V(x, LAYOUT.sensorY + 25.5, side * LAYOUT.sensorZ + zOff); };
  A.battery = (which) => V(LAYOUT.battery[0] - 38, 45.5 + 8, LAYOUT.battery[2] + (which === '+' ? -4 : 4));
  A.switchPts = [V(4 + 6, 45.5 + 8, 40), V(4 - 6, 45.5 + 8, 40)];
  robot.userData.anchors = A;
  return robot;
}
