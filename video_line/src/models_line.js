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
  g.add(box(2.7, 4.5, 5.2, std(0xe5c542, 0.5), -12, 2.2, 14)); for (const [x, z] of [[8, 9], [14, 9], [8, 4]]) g.add(box(3.2, 1.4, 6.5, MAT.black, x, 0.7, z));
  g.add(cyl(4.2, 11, std(0xc9ced6, 0.35, 0.7), 12, 5.5, 2, 24)); g.add(cyl(3.6, 9, std(0xc9ced6, 0.35, 0.7), 13, 4.5, -8, 24));
  g.add(box(6.5, 2.4, 6.5, MAT.black, -13, 1.2, 8)); const led = box(2, 0.8, 1.2, std(0xff2a2a, 0.3), -13, 0.5, -8.5); g.add(led);
  const glow = makeGlow(0xff4444, 6); glow.position.set(-13, 1.8, -8.5); g.add(glow); g.userData.power = a => { led.material.emissive = new THREE.Color(0xff2020); led.material.emissiveIntensity = 2.2 * a; glow.material.opacity = 0.5 * a; };
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------- TCRT5000 IR reflective sensor module (long axis = y, sensor down)
export function makeIRSensor() {
  const g = new THREE.Group(); g.name = 'ir';
  const pcb = std(0x1d4fc0, 0.4);
  g.add(box(1.6, 32, 14, pcb, 3.2, 0, 0));
  // electronics on the +x face
  g.add(box(4.9, 1.6, 5.1, MAT.black, 5.7, 8, 2.5));                  // LM393 (SOP-8)
  g.add(box(4.8, 9.6, 10, std(0x1e62d8, 0.4), 6.4, 11.4, -1));          // blue trimmer pot
  g.add(cyl(2.0, 1.2, std(0xc6a24a, 0.3, 0.9), 9.5, 11.4, -1, 18, 'x'));
  g.add(box(1.8, 1.2, 0.9, std(0xcfd6c0, 0.5), 5.0, 3.6, 4.5)); g.add(box(1.8, 1.2, 0.9, std(0xcfd6c0, 0.5), 5.0, 2.2, 4.5));
  const pl = box(1.8, 0.6, 1.1, std(0x10e060, 0.3), 4.5, -2.4, -4.8), sl = box(1.8, 0.6, 1.1, std(0xff3030, 0.3), 4.5, -4.4, -4.8); g.add(pl, sl); g.userData.sigLed = sl;
  // 3-pin header at the top: VCC GND OUT
  g.add(box(2.54, 2.5, 7.62, MAT.black, 3.2, 17.2, 0)); for (let i = 0; i < 3; i++) g.add(box(0.64, 8, 0.64, MAT.gold, 3.2, 21.5, (i - 1) * 2.54));
  // TCRT5000 sensor (emitter = clear dome, receiver = black dome) at the bottom
  g.add(box(5.8, 8, 10.2, std(0x0e0e10, 0.45), 0, -17.5, 0));
  g.add(cyl(2.1, 3, std(0xd9ecff, 0.1), 0, -21.5, 2.8, 20, 'y')); g.add(cyl(2.1, 3, std(0x090909, 0.2), 0, -21.5, -2.8, 20, 'y'));
  g.add(box(0.5, 6, 0.5, MAT.silver, 3.2, -14, 4.5), box(0.5, 6, 0.5, MAT.silver, 3.2, -14, -4.5));
  g.userData.tipY = -23.3;   // lowest point (optical face) relative to module centre
  g.userData.emitterZ = 2.8; g.userData.receiverZ = -2.8;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------- TT gear motor (shaft axis = z, shaft at origin) and wheel
export function makeTTMotor() {
  const g = new THREE.Group(); g.name = 'tt';
  const yel = std(0xf2c230, 0.55);
  g.add(rbox(40, 18.8, 22.5, 1.5, yel, 0, 0, 0));                             // gearbox
  g.add(cyl(10.3, 30, std(0xc7ccd4, 0.35, 0.8), 34, 0, 0, 28, 'x'));          // motor can
  g.add(cyl(10.4, 4, std(0x151515, 0.5), 50, 0, 0, 28, 'x'));                  // end cap
  g.add(box(2, 1, 3.5, MAT.gold, 52.5, 3, -4), box(2, 1, 3.5, MAT.gold, 52.5, 3, 4)); // solder tabs
  g.add(cyl(2.7, 40, std(0xe8eaee, 0.25, 0.9), 0, 0, 0, 16, 'z'));            // double D-shaft
  for (const [x, z] of [[-14, 0], [14, 0]]) { const h = cyl(1.6, 24, MAT.black, x, 0, z, 12, 'z'); h.visible = false; g.add(h); }
  g.userData.tabs = { a: [52.5, 3, -4], b: [52.5, 3, 4] };
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
export function makeWheel() {
  const g = new THREE.Group(); g.name = 'wheel';
  const prof = []; const R = 32.5, W = 13;
  const pts = [[0, -W], [R - 4, -W], [R - 1, -W + 2], [R, -W + 5], [R, W - 5], [R - 1, W - 2], [R - 4, W], [0, W]];
  for (const [r, y] of pts) prof.push(new THREE.Vector2(r, y));
  const tire = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), std(0x141416, 0.85)); tire.rotation.x = Math.PI / 2; tire.castShadow = true; tire.receiveShadow = true; g.add(tire);
  for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; const t = box(3, 1.4, 20, std(0x0e0e10, 0.9), 0, 0, 0); t.position.set(Math.cos(a) * (R + 0.2), Math.sin(a) * (R + 0.2), 0); t.rotation.z = a; g.add(t); }
  const hub = cyl(R - 6, 22, std(0xf3ecd2, 0.5), 0, 0, 0, 40, 'z'); g.add(hub);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const sp = box(10, 3, 23, std(0xc8bfa0, 0.5), 0, 0, 0); sp.position.set(Math.cos(a) * 14, Math.sin(a) * 14, 0); sp.rotation.z = a; g.add(sp); }
  g.add(cyl(5, 26, std(0xdad2b4, 0.4), 0, 0, 0, 20, 'z'));
  const mark = box(5, 5, 24, std(0xe34a3a, 0.4), 22, 0, 0); g.add(mark);  // red marker -> visible rotation
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------- chassis, caster, battery
export function makeChassis() {
  const g = new THREE.Group(); g.name = 'chassis';
  const tex = canvasTex(1024, 560, (c, w, h) => {
    c.fillStyle = '#dfe9f4'; c.fillRect(0, 0, w, h); c.fillStyle = '#7b8da6';
    const S = 1024 / 208;
    for (let i = 0; i < 9; i++) for (let j = 0; j < 5; j++) { c.beginPath(); c.arc((14 + i * 22) * S * 1.0, (12 + j * 22) * S, 1.5 * S, 0, 7); c.fill(); }
    c.fillStyle = '#9fb2cb'; for (let i = 0; i < 6; i++) c.fillRect((20 + i * 30) * S, 50 * S, 14 * S, 3 * S);
  });
  const plate = new THREE.Mesh(new RoundedBoxGeometry(208, 3, 112, 2, 3), [std(0xdfe9f4, 0.3), std(0xdfe9f4, 0.3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, transparent: true, opacity: 0.95 }), std(0xdfe9f4, 0.3), std(0xdfe9f4, 0.3), std(0xdfe9f4, 0.3)]);
  plate.position.set(-4, 44, 0); plate.castShadow = true; plate.receiveShadow = true; g.add(plate);
  // front sensor tab
  const tab = new THREE.Mesh(new RoundedBoxGeometry(22, 3, 70, 1, 1), std(0xdfe9f4, 0.3)); tab.position.set(110, 44, 0); tab.castShadow = true; g.add(tab);
  g.userData.top = 45.5;
  return g;
}
export function makeCaster() {
  const g = new THREE.Group(); g.name = 'caster';
  g.add(mesh(new THREE.SphereGeometry(8, 24, 18), std(0xd5d9e0, 0.25, 0.9), 0, 8, 0));
  g.add(cyl(6, 6, std(0xd5d9e0, 0.3, 0.8), 0, 18, 0, 20)); g.add(cyl(4.5, 21, std(0xb8bcc4, 0.35, 0.8), 0, 31.5, 0, 16));
  return g;
}
export function makeBattery() { // 2S 18650 holder, local origin = holder bottom centre
  const g = new THREE.Group(); g.name = 'battery';
  const black = std(0x111214, 0.55);
  g.add(rbox(76, 6, 38, 2, black, 0, 3, 0));
  for (const z of [-9.5, 9.5]) { g.add(rbox(76, 12, 1.6, 0.8, black, 0, 12, z + (z > 0 ? 9.6 : -9.6))); g.add(cyl(9.1, 65, std(0x2a4fa6, 0.35, 0.3), 0, 15.2, z, 28, 'x')); g.add(cyl(9.2, 8, std(0xc7cbd2, 0.3, 0.9), 34.5, 15.2, z, 28, 'x')); g.add(cyl(9.2, 8, std(0xc7cbd2, 0.3, 0.9), -34.5, 15.2, z, 28, 'x')); }
  g.add(rbox(1.6, 12, 20, 0.8, black, 37.5, 12, 0)); g.add(rbox(1.6, 12, 20, 0.8, black, -37.5, 12, 0));
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
  A.ir = (side, which) => { const x = LAYOUT.sensorX + 3.2; const zOff = { VCC: -2.54, GND: 0, OUT: 2.54 }[which]; return V(x, LAYOUT.sensorY + 25.5, side * LAYOUT.sensorZ + zOff); };
  A.battery = (which) => V(LAYOUT.battery[0] - 38, 45.5 + 8, LAYOUT.battery[2] + (which === '+' ? -4 : 4));
  A.switchPts = [V(4 + 6, 45.5 + 8, 40), V(4 - 6, 45.5 + 8, 40)];
  robot.userData.anchors = A;
  return robot;
}
