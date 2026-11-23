// Procedural 3D models (units = millimetres, y up, camera looks from +z).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const PITCH = 2.54;
const sRGB = THREE.SRGBColorSpace;

// ---------- helpers ----------
export function canvasTex(w, h, draw, aniso = 8) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = sRGB; t.anisotropy = aniso;
  return t;
}
function mesh(geo, mat, x = 0, y = 0, z = 0, cast = true, recv = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = recv; return m;
}
const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
const cyl = (r, h, mat, x, y, z, seg = 24, r2 = r) => mesh(new THREE.CylinderGeometry(r2, r, h, seg), mat, x, y, z);
function rbox(w, h, d, r, mat, x, y, z) { return mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat, x, y, z); }

export const MAT = {
  pcb: new THREE.MeshPhysicalMaterial({ color: 0x1d52b8, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35 }),
  black: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.1 }),
  darkgrey: new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.55, metalness: 0.2 }),
  silver: new THREE.MeshStandardMaterial({ color: 0xd2d6db, roughness: 0.28, metalness: 1 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xe0b44a, roughness: 0.3, metalness: 1 }),
  ivory: new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.6 }),
  hole: new THREE.MeshBasicMaterial({ color: 0x050505 }),
  beige: new THREE.MeshStandardMaterial({ color: 0xdcc596, roughness: 0.6 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }),
};

export function glowTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    r.addColorStop(0.5, 'rgba(255,255,255,0.18)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  }, 1);
}
let _glow; const glowTex = () => (_glow ||= glowTexture());
export function makeGlow(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex(), color, blending: THREE.NormalBlending, transparent: true, depthWrite: false, opacity: 0,
  }));
  s.scale.set(size, size, 1); s.renderOrder = 10; return s;
}

// ======================================================================
// ARDUINO UNO R3 (board top surface is y = 0, board centre at origin)
// Real header geometry (mils from board bottom-left), 2.7" x 2.1".
// ======================================================================
export const UNO = { W: 68.58, D: 53.34, HDR_H: 8.5 };
const milX = m => m * 0.0254 - UNO.W / 2;
const milZ = m => UNO.D / 2 - m * 0.0254; // y(mils, up) -> z (towards far = negative)

// pin name -> [x_mil, y_mil]
export const UNO_PINS = {};
for (let n = 0; n <= 7; n++) UNO_PINS['D' + n] = [2600 - 100 * n, 2000];
['SCL', 'SDA', 'AREF', 'GND', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'].forEach((nm, i) => (UNO_PINS[nm === 'GND' ? 'GND_TOP' : nm] = [740 + 100 * i, 2000]));
['NC', 'IOREF', 'RESET', '3V3', '5V', 'GND1', 'GND2', 'VIN'].forEach((nm, i) => (UNO_PINS[nm] = [1000 + 100 * i, 100]));
for (let i = 0; i < 6; i++) UNO_PINS['A' + i] = [1900 + 100 * i, 100];

export function unoPinLocal(name) {
  const [x, y] = UNO_PINS[name];
  return new THREE.Vector3(milX(x), UNO.HDR_H, milZ(y));
}

function unoTexture() {
  const S = 30, W = Math.round(UNO.W * S), D = Math.round(UNO.D * S);
  const px = m => m * 0.0254 * S, py = m => (2100 - m) * 0.0254 * S;
  return canvasTex(W, D, (g) => {
    const grd = g.createLinearGradient(0, 0, W, D);
    grd.addColorStop(0, '#2a63c6'); grd.addColorStop(1, '#1a4aa6');
    g.fillStyle = grd; g.fillRect(0, 0, W, D);
    // faint traces
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.strokeStyle = 'rgba(8,34,100,0.55)'; g.lineWidth = 3;
    for (let i = 0; i < 70; i++) {
      let x = rnd() * W, y = rnd() * D; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 3; k++) { if (rnd() > 0.5) x += (rnd() - 0.5) * 300; else y += (rnd() - 0.5) * 300; g.lineTo(x, y); }
      g.stroke();
    }
    // mounting holes
    for (const [mx, my] of [[550, 100], [600, 2000], [2600, 300], [2600, 1400]]) {
      g.fillStyle = '#d9b44a'; g.beginPath(); g.arc(px(mx), py(my), 34, 0, 7); g.fill();
      g.fillStyle = '#021014'; g.beginPath(); g.arc(px(mx), py(my), 20, 0, 7); g.fill();
    }
    // silkscreen
    g.fillStyle = '#f4f7f7'; g.strokeStyle = '#f4f7f7';
    g.textAlign = 'center'; g.font = 'bold 30px DejaVu Sans, Arial';
    const label = (txt, mx, my, size = 28, dy = 0) => { g.font = `bold ${size}px DejaVu Sans, Arial`; g.fillText(txt, px(mx), py(my) + dy); };
    // top header labels (digital)
    const dnames = { 0: '0', 1: '1', 2: '2', 3: '~3', 4: '4', 5: '~5', 6: '~6', 7: '7', 8: '8', 9: '~9', 10: '~10', 11: '~11', 12: '12', 13: '13' };
    for (let n = 0; n <= 13; n++) label(dnames[n], UNO_PINS['D' + n][0], 1870, 30);
    label('GND', 1040, 1870, 22); label('AREF', 940, 1870, 22); label('SDA', 840, 1870, 22); label('SCL', 740, 1870, 22);
    label('DIGITAL (PWM= ~)', 1700, 1780, 26);
    g.strokeStyle = '#f4f7f7'; g.lineWidth = 3;
    g.strokeRect(px(1960 - 1250 + 50), py(1960), px(1250 + 300 + 400) - px(0), 10); // thin guide
    // power + analog labels
    ['', 'IOREF', 'RESET', '3.3V', '5V', 'GND', 'GND', 'VIN'].forEach((t, i) => t && label(t, 1000 + 100 * i, 235, 20));
    for (let i = 0; i < 6; i++) label('A' + i, 1900 + 100 * i, 235, 26);
    label('POWER', 1350, 330, 26); label('ANALOG IN', 2150, 330, 26);
    // brand
    g.fillStyle = '#ffffff'; g.font = 'bold 74px DejaVu Sans, Arial'; g.fillText('ARDUINO', px(1520), py(1240));
    g.font = 'bold 54px DejaVu Sans, Arial'; g.fillText('UNO', px(2260), py(1240));
    // infinity logo
    g.lineWidth = 9; g.strokeStyle = '#ffffff';
    g.beginPath(); g.ellipse(px(1980) - 40, py(1240), 34, 24, 0, 0, 7); g.stroke();
    g.beginPath(); g.ellipse(px(1980) + 40, py(1240), 34, 24, 0, 0, 7); g.stroke();
    g.font = 'bold 24px DejaVu Sans, Arial'; g.fillStyle = '#e6f6f7';
    g.fillText('TX', px(880), py(1880)); g.fillText('RX', px(880), py(1990)); g.fillText('ON', px(1200), py(1700)); g.fillText('L', px(1200), py(1560));
    // sockets for pin-1 marks
    g.fillStyle = '#e6f6f7'; g.font = 'bold 20px DejaVu Sans, Arial';
    g.fillText('RESET', px(520), py(1620));
  }, 16);
}

export function makeArduino() {
  const g = new THREE.Group(); g.name = 'arduino';
  const { W, D, HDR_H } = UNO;
  const board = new THREE.Mesh(new RoundedBoxGeometry(W, 1.6, D, 2, 0.5), MAT.pcb);
  board.position.y = -0.8; board.castShadow = board.receiveShadow = true; g.add(board);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, D - 0.2),
    new THREE.MeshPhysicalMaterial({ map: unoTexture(), roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.4 }));
  top.rotation.x = -Math.PI / 2; top.position.y = 0.02; top.receiveShadow = true; g.add(top);

  // headers
  const hdr = (names) => {
    const xs = names.map(n => milX(UNO_PINS[n][0])); const z = milZ(UNO_PINS[names[0]][1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    g.add(box(x1 - x0 + PITCH, HDR_H, PITCH, MAT.black, (x0 + x1) / 2, HDR_H / 2, z));
    for (const x of xs) { const h = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), MAT.hole); h.rotation.x = -Math.PI / 2; h.position.set(x, HDR_H + 0.02, z); g.add(h); }
  };
  hdr(['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
  hdr(['SCL', 'SDA', 'AREF', 'GND_TOP', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8']);
  hdr(['NC', 'IOREF', 'RESET', '3V3', '5V', 'GND1', 'GND2', 'VIN']);
  hdr(['A0', 'A1', 'A2', 'A3', 'A4', 'A5']);

  // USB-B jack (left edge, upper)
  const usbZ = milZ(1500);
  const usb = new THREE.Group();
  usb.add(box(16.4, 10.9, 12, MAT.silver, 0, 0, 0));
  const open = box(0.3, 7.2, 8.4, MAT.hole, -8.3, 0, 0); usb.add(open);
  usb.add(box(0.5, 2.2, 6, MAT.darkgrey, -8.2, -0.2, 0));
  usb.position.set(milX(0) - 6 + 8.2, 5.45, usbZ); g.add(usb);
  // DC barrel jack (left edge, lower)
  const dcZ = milZ(380);
  const dc = new THREE.Group();
  dc.add(box(14.2, 10.9, 9, MAT.black, 0, 0, 0));
  const hole = cyl(3.1, 0.4, MAT.hole, -7.15, 0.5, 0, 20); hole.rotation.z = Math.PI / 2; dc.add(hole);
  const pin = cyl(0.9, 6, MAT.silver, -4.5, 0.5, 0, 12); pin.rotation.z = Math.PI / 2; dc.add(pin);
  dc.position.set(milX(0) - 2 + 7.1, 5.45, dcZ); g.add(dc);

  // ATmega328P (DIP-28) : long black chip with legs
  const cx = milX(1750), cz = milZ(940);
  const chip = new THREE.Group();
  chip.add(box(35.4, 3.6, 7.6, MAT.black, 0, 3.2, 0));
  for (let i = 0; i < 14; i++) for (const s of [-1, 1]) chip.add(box(0.5, 0.25, 1.4, MAT.silver, -16.5 + i * PITCH, 0.6, s * 4.4));
  const label = canvasTex(512, 128, (c, w, h) => {
    c.fillStyle = '#16181b'; c.fillRect(0, 0, w, h); c.fillStyle = '#b9bec4'; c.font = 'bold 30px DejaVu Sans Mono, monospace';
    c.fillText('ATMEGA328P-PU', 40, 52); c.font = '22px DejaVu Sans Mono, monospace'; c.fillText('1936 · 16MHz', 40, 92);
    c.beginPath(); c.arc(24, 100, 6, 0, 7); c.fill();
  });
  const lp = new THREE.Mesh(new THREE.PlaneGeometry(33, 6.5), new THREE.MeshStandardMaterial({ map: label, roughness: 0.6 }));
  lp.rotation.x = -Math.PI / 2; lp.position.y = 5.02; chip.add(lp);
  chip.position.set(cx, 0, cz); chip.children.forEach(c => (c.castShadow = true)); g.add(chip);

  // ATmega16U2 (TQFP), crystal, reset, regulator, caps, ICSP
  g.add(box(7, 1.4, 7, MAT.black, milX(900), 0.7, milZ(1000)));
  for (const s of [-1, 1]) { g.add(box(8.6, 0.2, 0.4, MAT.silver, milX(900), 0.2, milZ(1000) + s * 3.6)); g.add(box(0.4, 0.2, 8.6, MAT.silver, milX(900) + s * 3.6, 0.2, milZ(1000))); }
  g.add(rbox(11, 4.2, 4.7, 1.2, MAT.silver, milX(1300), 2.1, milZ(480)));
  const rs = new THREE.Group(); rs.add(box(6.2, 3.2, 6.2, MAT.silver, 0, 1.6, 0)); rs.add(cyl(1.6, 1.2, new THREE.MeshStandardMaterial({ color: 0xd72626, roughness: 0.4 }), 0, 3.6, 0, 20));
  rs.position.set(milX(580), 0, milZ(1830)); g.add(rs);
  g.add(box(6.5, 1.8, 3.4, MAT.black, milX(420), 0.9, milZ(1000)));
  g.add(cyl(2.8, 6.2, new THREE.MeshStandardMaterial({ color: 0xbfc4ca, metalness: 0.7, roughness: 0.35 }), milX(500), 3.1, milZ(560), 24));
  g.add(cyl(2.8, 6.2, new THREE.MeshStandardMaterial({ color: 0xbfc4ca, metalness: 0.7, roughness: 0.35 }), milX(500), 3.1, milZ(1260), 24));
  g.add(box(6, 3.2, 3.2, MAT.black, milX(500), 1.6, milZ(910)));
  g.add(box(7.7, 2.5, 5.1, MAT.darkgrey, milX(2540), 1.25, milZ(740)));
  for (let i = 0; i < 6; i++) g.add(box(0.7, 3.2, 0.7, MAT.gold, milX(2540) + (i % 2 ? 1.27 : -1.27), 2.6, milZ(740) + (Math.floor(i / 2) - 1) * PITCH));
  // small SMD parts (decor)
  let sd = 3; const r2 = () => ((sd = (sd * 48271) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) { const x = milX(300 + r2() * 2300), z = milZ(250 + r2() * 1550); if (Math.abs(x) < 17 && Math.abs(z - cz) < 6) continue;
    g.add(box(1.6, 0.5, 0.9, i % 3 ? MAT.darkgrey : new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.5 }), x, 0.3, z)); }
  // ON LED
  const onMat = new THREE.MeshStandardMaterial({ color: 0x143a22, emissive: 0x2dff6b, emissiveIntensity: 0, roughness: 0.3 });
  const onLed = box(2.2, 0.8, 1.3, onMat, milX(1260), 0.5, milZ(1620)); g.add(onLed);
  const onGlow = makeGlow(0x4dff8a, 5); onGlow.position.set(milX(1260), 2, milZ(1620)); g.add(onGlow);
  // extra real-board details: polyfuse, 2nd ICSP (16U2), SMD status LEDs (TX/RX/L), tactile-switch legs, gold pin contacts
  g.add(box(4.2, 1.6, 2.6, new THREE.MeshStandardMaterial({ color: 0xe6c64a, roughness: 0.5 }), milX(520), 0.8, milZ(1200)));
  g.add(box(7.7, 2.5, 5.1, MAT.darkgrey, milX(650), 1.25, milZ(1520)));
  for (let i = 0; i < 6; i++) g.add(box(0.7, 3.2, 0.7, MAT.gold, milX(650) + (i % 2 ? 1.27 : -1.27), 2.6, milZ(1520) + (Math.floor(i / 2) - 1) * PITCH));
  for (const [x, y, c] of [[880, 1830, 0xffb000], [880, 1930, 0xffb000], [1260, 1450, 0xffb000]]) g.add(box(1.8, 0.7, 1.0, new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }), milX(x), 0.45, milZ(y)));
  for (const n of Object.keys(UNO_PINS)) { const [x, y] = UNO_PINS[n]; g.add(box(0.5, 0.2, 0.5, MAT.gold, milX(x), HDR_H + 0.03, milZ(y))); }
  g.userData.setPower = a => { onMat.emissiveIntensity = 3 * a; onGlow.material.opacity = 0.5 * a; };
  g.userData.usbOpening = new THREE.Vector3(milX(0) - 6 + 8.2 - 8.2, 5.45, usbZ);
  g.traverse(o => { if (o.isMesh && o.material !== MAT.hole) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ======================================================================
// BREADBOARD (half size, 30 columns, rails both sides). Top surface y = 0.
// ======================================================================
export const BB = { W: 82.5, D: 55, H: 8.5, ROWS: { a: 13.97, b: 11.43, c: 8.89, d: 6.35, e: 3.81, f: -3.81, g: -6.35, h: -8.89, i: -11.43, j: -13.97 },
  RAIL_Z: { nearMinus: 19.05, nearPlus: 21.59, farMinus: -19.05, farPlus: -21.59 } };
export const bbColX = c => (c - 15.5) * PITCH;
export const bbRailX = k => (k + Math.floor(k / 5)) * PITCH - 35.56;
export function bbRailNearest(x) { let best = 0, bd = 1e9; for (let k = 0; k < 25; k++) { const d = Math.abs(bbRailX(k) - x); if (d < bd) { bd = d; best = k; } } return best; }

function bbTexture() {
  const S = 24, W = Math.round(BB.W * S), D = Math.round(BB.D * S);
  const X = x => (x + BB.W / 2) * S, Z = z => (z + BB.D / 2) * S;
  return canvasTex(W, D, (g) => {
    g.fillStyle = '#efe9db'; g.fillRect(0, 0, W, D);
    // center channel
    g.fillStyle = '#d4ccb9'; g.fillRect(0, Z(-1.7), W, 3.4 * S);
    g.fillStyle = '#b9b19d'; g.fillRect(0, Z(-1.7), W, 3); g.fillRect(0, Z(1.7) - 3, W, 3);
    const hole = (x, z) => { g.fillStyle = '#b9b19c'; g.fillRect(X(x) - 0.62 * S, Z(z) - 0.62 * S, 1.24 * S, 1.24 * S);
      g.fillStyle = '#2a2a2a'; g.fillRect(X(x) - 0.5 * S, Z(z) - 0.5 * S, 1.0 * S, 1.0 * S);
      g.fillStyle = '#050505'; g.fillRect(X(x) - 0.36 * S, Z(z) - 0.36 * S, 0.72 * S, 0.72 * S); };
    for (let c = 1; c <= 30; c++) for (const z of Object.values(BB.ROWS)) hole(bbColX(c), z);
    for (const z of Object.values(BB.RAIL_Z)) for (let k = 0; k < 25; k++) hole(bbRailX(k), z);
    // rail guide lines (red = +, blue = -)
    const line = (z, col) => { g.fillStyle = col; g.fillRect(X(-36.2), Z(z) - 0.17 * S, 72.4 * S, 0.34 * S); };
    line(21.59 + 2.0, '#d33'); line(19.05 - 2.0, '#2a56d6'); line(-21.59 - 2.0, '#d33'); line(-19.05 + 2.0, '#2a56d6');
    // text
    g.fillStyle = '#6d6a60'; g.font = `bold ${1.15 * S}px DejaVu Sans, Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const c of [1, 5, 10, 15, 20, 25, 30]) { g.fillText(String(c), X(bbColX(c)), Z(16.5)); g.fillText(String(c), X(bbColX(c)), Z(-16.5)); }
    'abcde'.split('').forEach(l => { g.fillText(l, X(-39.3), Z(BB.ROWS[l])); g.fillText(l, X(39.3), Z(BB.ROWS[l])); });
    'fghij'.split('').forEach(l => { g.fillText(l, X(-39.3), Z(BB.ROWS[l])); g.fillText(l, X(39.3), Z(BB.ROWS[l])); });
    g.font = `bold ${1.7 * S}px DejaVu Sans, Arial`;
    for (const [z, t, c] of [[21.59, '+', '#c22'], [19.05, '−', '#2a56d6'], [-21.59, '+', '#c22'], [-19.05, '−', '#2a56d6']]) { g.fillStyle = c; g.fillText(t, X(-39.3), Z(z)); g.fillText(t, X(39.3), Z(z)); }
  }, 16);
}

export function makeBreadboard() {
  const g = new THREE.Group(); g.name = 'breadboard';
  const body = new THREE.Mesh(new RoundedBoxGeometry(BB.W, BB.H, BB.D, 3, 0.9), MAT.ivory);
  body.position.y = -BB.H / 2; body.castShadow = body.receiveShadow = true; g.add(body);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(BB.W - 0.8, BB.D - 0.8), new THREE.MeshStandardMaterial({ map: bbTexture(), roughness: 0.55 }));
  // texture is BB.W x BB.D; plane smaller -> crop uv slightly
  top.geometry.attributes.uv.array.forEach((v, i, a) => { const u = i % 2 === 0; const m = u ? 0.4 / BB.W : 0.4 / BB.D; a[i] = v < 0.5 ? m : 1 - m; });
  top.rotation.x = -Math.PI / 2; top.position.y = 0.02; top.receiveShadow = true; g.add(top);
  return g;
}
// world helpers (breadboard local coordinates)
export const bbHole = (col, row) => new THREE.Vector3(bbColX(col), 0, BB.ROWS[row]);
export const bbRail = (side, k) => new THREE.Vector3(bbRailX(k), 0, BB.RAIL_Z[side]);

// ======================================================================
// LED (5 mm). Origin = bottom of flange. Anode (long leg) at x=-1.27, cathode (short) at +1.27, flat side on +x
// ======================================================================
export const LED_COLORS = {
  red: { c: 0xff2418, glow: 0xff3a22, name: 'red' },
  yellow: { c: 0xffc400, glow: 0xffd21a, name: 'yellow' },
  green: { c: 0x19e04a, glow: 0x35ff6a, name: 'green' },
};
export function makeLED(kind, { legA = 24, legC = 21, glowSize = 30 } = {}) {
  const col = LED_COLORS[kind];
  const g = new THREE.Group(); g.name = 'led-' + kind;
  const dome = new THREE.MeshPhysicalMaterial({ color: col.c, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.8,
    emissive: col.c, emissiveIntensity: 0.0, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
  const prof = [new THREE.Vector2(0.001, 1.0), new THREE.Vector2(2.5, 1.0), new THREE.Vector2(2.5, 6.2)];
  for (let i = 1; i <= 14; i++) { const a = (i / 14) * Math.PI / 2; prof.push(new THREE.Vector2(2.5 * Math.cos(a), 6.2 + 2.5 * Math.sin(a))); }
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 36), dome); body.renderOrder = 3; g.add(body);
  // flange with a flat on the +x (cathode) side
  const sh = new THREE.Shape(); const R = 2.9, fx = 2.4, a0 = Math.acos(fx / R);
  sh.absarc(0, 0, R, a0, Math.PI * 2 - a0, false); sh.lineTo(fx, Math.sin(a0) * R * 0 + 0); sh.closePath();
  const fl = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 1.0, bevelEnabled: false, curveSegments: 24 }),
    new THREE.MeshPhysicalMaterial({ color: col.c, roughness: 0.2, transparent: true, opacity: 0.85, emissive: col.c, emissiveIntensity: 0, depthWrite: false }));
  fl.rotation.x = -Math.PI / 2; fl.position.y = 0; fl.renderOrder = 3; g.add(fl);
  // inner metal: cathode (larger cup) at +x, anode (post + bond wire) at -x
  const anvil = cyl(0.42, 4.6, MAT.silver, 1.27, 2.3, 0, 12); g.add(anvil);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 0.5, 1.5, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xcfd3d8, metalness: 1, roughness: 0.3, side: THREE.DoubleSide }));
  cup.position.set(1.27, 5.0, 0); g.add(cup);
  const chip = box(0.5, 0.25, 0.5, new THREE.MeshStandardMaterial({ color: 0x222222 }), 1.27, 4.35, 0); g.add(chip);
  g.add(cyl(0.3, 5.6, MAT.silver, -1.27, 2.8, 0, 10));
  const bond = cyl(0.07, 3.1, MAT.gold, 0, 5.5, 0, 6); bond.rotation.z = Math.PI / 2 - 0.12; g.add(bond);
  // legs
  const la = box(0.55, legA, 0.55, MAT.silver, -1.27, -legA / 2 + 0.4, 0);
  const lc = box(0.55, legC, 0.55, MAT.silver, 1.27, -legC / 2 + 0.4, 0);
  g.add(la, lc);
  // glow
  const glow = makeGlow(col.glow, glowSize); glow.position.set(0, 5.6, 0); g.add(glow);
  const light = new THREE.PointLight(col.glow, 0, 130, 2); light.position.set(0, 9, 0); g.add(light);
  g.userData = { kind, dome, fl, glow, light, legA, legC, setOn(a, strength = 1) {
    dome.emissiveIntensity = 1.35 * a * strength; fl.material.emissiveIntensity = 0.9 * a * strength;
    dome.opacity = 0.8 + 0.2 * a; glow.material.opacity = 0.95 * a * strength; light.intensity = 420 * a * strength; } };
  return g;
}

// ======================================================================
// RESISTOR 220 ohm (red red brown gold). Axis along x, origin = body centre.
// ======================================================================
export function makeResistor({ span = 4 * PITCH, h = 3.4, straight = false, lead = 14 } = {}) {
  const g = new THREE.Group(); g.name = 'resistor';
  const prof = []; const L = 3.15;
  for (let i = 0; i <= 10; i++) { const x = -L + (2 * L * i) / 10; const e = Math.abs(x) / L; const r = 1.2 - 0.5 * Math.pow(Math.max(0, e - 0.72) / 0.28, 2); prof.push(new THREE.Vector2(Math.max(r, 0.35), x)); }
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), MAT.beige); body.rotation.z = Math.PI / 2; body.castShadow = body.receiveShadow = true; g.add(body);
  const bands = [[-1.95, 0xd62020], [-1.05, 0xd62020], [-0.15, 0x6e3b17], [2.0, 0xd8b23c]];
  for (const [x, c] of bands) { const r = 1.2 - 0.5 * Math.pow(Math.max(0, Math.abs(x) / L - 0.72) / 0.28, 2) + 0.03; const b = cyl(r, 0.62, new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: c === 0xd8b23c ? 0.8 : 0 }), x, 0, 0, 24); b.rotation.z = Math.PI / 2; g.add(b); }
  const lm = MAT.silver; const r = 0.28;
  if (straight) {
    for (const s of [-1, 1]) { const c = cyl(r, lead, lm, s * (L + lead / 2 - 0.4), 0, 0, 8); c.rotation.z = Math.PI / 2; g.add(c); }
    g.userData.length = 2 * (L + lead);
  } else {
    for (const s of [-1, 1]) {
      const hx = span / 2;
      const hz = cyl(r, hx - L + 0.4, lm, s * (L + hx) / 2 - s * 0.2, 0, 0, 8); hz.rotation.z = Math.PI / 2; g.add(hz);
      g.add(mesh(new THREE.SphereGeometry(r, 8, 8), lm, s * hx, 0, 0));
      g.add(cyl(r, h + 3, lm, s * hx, -(h + 3) / 2 + 0.0, 0, 8));
    }
  }
  return g;
}

// ======================================================================
// JUMPER WIRE (male-male Dupont). Built from A (world) to B (world).
// ======================================================================
export function makeWire(colorHex, A, B, { lift = 0, housing = 0x1b1d20 } = {}) {
  const g = new THREE.Group(); g.name = 'wire';
  const hm = new THREE.MeshStandardMaterial({ color: housing, roughness: 0.55 });
  const wm = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.45 });
  const mkEnd = (p) => { const e = new THREE.Group(); e.add(box(2.5, 10, 2.5, hm, 0, 5, 0)); e.add(box(0.64, 7, 0.64, MAT.gold, 0, -3.4, 0)); e.position.copy(p); e.traverse(o => { if (o.isMesh) o.castShadow = true; }); return e; };
  const endA = mkEnd(A), endB = mkEnd(B); g.add(endA, endB);
  const d = Math.hypot(B.x - A.x, B.z - A.z);
  const h = Math.max(15, 11 + d * 0.38) + lift;
  const pts = [A.clone().add(new THREE.Vector3(0, 10, 0)), A.clone().add(new THREE.Vector3(0, 15, 0)),
    A.clone().lerp(B, 0.5).add(new THREE.Vector3(0, h, 0)),
    B.clone().add(new THREE.Vector3(0, 15, 0)), B.clone().add(new THREE.Vector3(0, 10, 0))];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 56, 0.72, 8, false), wm); tube.castShadow = true; g.add(tube);
  const total = tube.geometry.index.count;
  g.userData = { curve, endA, endB, tube, setProgress(p) {
    p = Math.min(1, Math.max(0, p));
    g.visible = p > 0;
    tube.geometry.setDrawRange(0, Math.floor((total * p) / 3) * 3);
    endA.visible = p > 0; endB.visible = p >= 0.999; } };
  g.userData.setProgress(1);
  return g;
}

// ======================================================================
// USB cable (A -> B), laptop, traffic light
// ======================================================================
export function makeUSBPlugB() { // inserts along +x -> -x : tip at origin, boot extends to +x
  const g = new THREE.Group();
  g.add(rbox(16, 10.4, 11.4, 1.2, MAT.silver, -8, 0, 0)); // metal shell, tip at x=-16
  g.add(box(0.3, 7.4, 8.4, MAT.hole, -16.02, 0, 0));
  g.add(box(10, 2.4, 6, new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.5 }), -11.2, 0, 0));
  g.add(box(18, 13, 14, MAT.black, 9, 0, 0));
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
export function makeUSBPlugA() {
  const g = new THREE.Group();
  g.add(box(14, 4.5, 12, MAT.silver, -7, 0, 0));
  g.add(box(0.3, 3.4, 10.6, MAT.hole, -14.02, 0, 0));
  g.add(box(10, 1.3, 9, new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.5 }), -9.2, -0.2, 0));
  g.add(box(18, 9, 16, MAT.black, 9, 0, 0));
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
export function makeCable(points, r = 1.6, mat = MAT.black) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, r, 10, false), mat); m.castShadow = true; return m;
}

export function makeLaptop(screenTex) {
  const g = new THREE.Group();
  const alu = new THREE.MeshStandardMaterial({ color: 0xaab0b8, metalness: 0.9, roughness: 0.3 });
  g.add(rbox(150, 6, 100, 2, alu, 0, 3, 0));
  const kb = new THREE.Mesh(new THREE.PlaneGeometry(120, 44), new THREE.MeshStandardMaterial({ map: canvasTex(512, 200, (c, w, h) => { c.fillStyle = '#2a2d33'; c.fillRect(0, 0, w, h); c.fillStyle = '#454a54'; for (let r = 0; r < 5; r++) for (let k = 0; k < 14; k++) c.fillRect(10 + k * 35.5, 10 + r * 36, 31, 30); }), roughness: 0.7 }));
  kb.rotation.x = -Math.PI / 2; kb.position.set(0, 6.05, -14); g.add(kb);
  const tp = new THREE.Mesh(new THREE.PlaneGeometry(48, 30), new THREE.MeshStandardMaterial({ color: 0x8e949c, roughness: 0.4, metalness: 0.5 })); tp.rotation.x = -Math.PI / 2; tp.position.set(0, 6.05, 32); g.add(tp);
  const lid = new THREE.Group();
  lid.add(rbox(150, 98, 4, 2, alu, 0, 49, 0));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(140, 88), new THREE.MeshBasicMaterial({ map: screenTex })); scr.position.set(0, 49, 2.05); lid.add(scr);
  lid.position.set(0, 6, -50); lid.rotation.x = -0.16; g.add(lid);
  g.userData.port = new THREE.Vector3(75, 4, 8); // right side port
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function makeTrafficLight() {
  const g = new THREE.Group(); g.name = 'trafficlight';
  const bl = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.45, metalness: 0.25 });
  const pole = new THREE.MeshStandardMaterial({ color: 0x59606b, roughness: 0.4, metalness: 0.8 });
  g.add(cyl(14, 5, pole, 0, 2.5, 0, 32));
  g.add(cyl(3.2, 124, pole, 0, 62 + 4, 0, 24));
  const H = 150, hy = 4 + 124 + 50 - 2; // housing centre
  g.add(rbox(40, 108, 26, 4, bl, 0, hy, 0));
  g.add(rbox(44, 112, 3, 1.5, bl, 0, hy, -10));
  const lamps = {};
  const defs = [['R', 0xff2a1a, 33, 0xff3b2b], ['Y', 0xffc400, 0, 0xffd21a], ['G', 0x1fe052, -33, 0x35ff6a]];
  for (const [k, c, dy, gc] of defs) {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(0.22), emissive: c, emissiveIntensity: 0, roughness: 0.15, metalness: 0.1 });
    const lens = cyl(10.2, 3, m, 0, hy + dy, 13.2, 36); lens.rotation.x = Math.PI / 2; g.add(lens);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(10.6, 1.0, 10, 40), bl); ring.position.set(0, hy + dy, 13.6); g.add(ring);
    // hood
    const hood = box(26, 1.1, 13, bl, 0, hy + dy + 12.6, 19.2); hood.rotation.x = 0.18; g.add(hood);
    g.add(box(1.1, 10, 12, bl, 12.9, hy + dy + 7.4, 19), box(1.1, 10, 12, bl, -12.9, hy + dy + 7.4, 19));
    const glow = makeGlow(gc, 62); glow.position.set(0, hy + dy, 17); g.add(glow);
    const light = new THREE.PointLight(gc, 0, 260, 2); light.position.set(0, hy + dy, 46); g.add(light);
    lamps[k] = { m, glow, light, c };
  }
  g.userData.lamps = lamps;
  g.userData.set = (state) => { for (const k of ['R', 'Y', 'G']) { const on = state === k ? 1 : 0; const L = lamps[k];
    L.m.emissiveIntensity = 0.42 * on; L.glow.material.opacity = 0.4 * on; L.light.intensity = 2500 * on; L.m.color.set(L.c).multiplyScalar(on ? 0.55 : 0.22); } };
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
