// Timeline for the "suiveur de ligne" video. Visual logic runs on an INTERNAL timeline (idur per beat);
// the video plays each beat in `nd` seconds (time-warp): showcase shots are quick, explanatory shots take time.
import { ND } from './nd.js';
export const FPS = 30;
export const SCENES = [
  { id: 'A', title: 'Robot suiveur de ligne', sub: 'Arduino · L298N · capteurs IR' },
  { id: 'B', title: 'Les composants', sub: 'Matériel' },
  { id: 'C', title: 'Comprendre', sub: 'Capteur · Driver · PWM' },
  { id: 'D', title: 'Montage', sub: 'Pas à pas' },
  { id: 'E', title: 'Le code en dessins', sub: 'Décisions + simulation' },
  { id: 'F', title: 'Téléversement', sub: 'Upload' },
  { id: 'G', title: 'Démo', sub: 'Il suit la ligne' },
  { id: 'H', title: 'Et après ?', sub: 'Idées' },
];
// [scene, id, internal seconds, video seconds, caption]
const BEATS = [
  ['A', 'a1', 7, 2.4, '🤖 Un robot qui suit une ligne noire'],
  // --- showcase: quick
  ['B', 'b0', 3, 0.6, '🧰 Ce qu’il faut'], ['B', 'b1', 4, 0.8, '🧠 Arduino : le cerveau'], ['B', 'b2', 4, 0.8, '⚙️ L298N : les muscles'],
  ['B', 'b3', 4, 0.9, '👁️ 2 capteurs : les yeux'], ['B', 'b4', 4, 0.8, '🛞 2 moteurs + roues'], ['B', 'b5', 4, 0.8, '🔩 Le châssis'], ['B', 'b6', 4, 0.8, '🔋 La batterie'],
  // --- explanation: needs time
  ['C', 'c1', 10, 4.6, 'Lumière qui revient = blanc (0) · pas de retour = noir (1)'],
  ['C', 'c2', 8, 3.8, 'Arduino = peu de puissance · moteur = beaucoup → on ajoute le L298N'],
  ['C', 'c3', 9, 3.8, 'Le L298N choisit le sens et la vitesse'],
  ['C', 'c4', 7, 3.0, 'Impulsions rapides = pédale d’accélérateur (PWM)'],
  // --- build: procedural, wiring steps take longer
  ['D', 'd1', 6, 1.5, 'Moteurs et roues sur le châssis'], ['D', 'd2', 6, 1.6, 'Capteurs devant, près du sol'],
  ['D', 'd3', 6, 1.5, 'Arduino, L298N, batterie'], ['D', 'd4', 6, 2.0, 'Moteurs → sorties du L298N'],
  ['D', 'd5', 8, 2.6, 'Capteurs : 5V, GND et signal (D2, D3)'], ['D', 'd6', 10, 3.4, 'Fils de commande → D5 à D10'],
  ['D', 'd7', 11, 3.8, 'Batterie → L298N · masse commune'], ['D', 'd8', 5, 2.0, 'Retire les 2 petits cavaliers'],
  ['D', 'd9', 3, 0.8, '✅ Le robot est monté !'],
  // --- code: explanation + simulation
  ['E', 'e0', 8, 3.6, 'Chaque moteur reçoit un nombre : + avant, − arrière'], ['E', 'e1', 7, 3.0, '1 = noir · 0 = blanc'],
  ['E', 'e2', 6, 2.4, '0 · 0 → tout droit'], ['E', 'e3', 7, 3.2, '1 · 0 → à gauche'],
  ['E', 'e4', 6, 2.4, '0 · 1 → à droite'], ['E', 'e5', 5, 2.0, '1 · 1 → stop'],
  ['E', 'e6', 10, 3.8, 'Ça se répète des centaines de fois par seconde'],
  ['F', 'f1', 6, 1.6, 'USB + carte Arduino Uno + port'], ['F', 'f2', 6, 1.6, '➡️ Téléverser'],
  ['G', 'g1', 10.5, 10.5, 'Il suit la ligne !'], ['G', 'g2', 3, 2.4, '🛑 Barre noire : stop'],
  ['H', 'h1', 4, 2.8, 'Idée : ajoute un 3ᵉ capteur'], ['H', 'h2', 3, 2.0, '🌟 Bravo, jeunes ingénieurs !'],
];
export const BEATS0 = BEATS;
const LEAD = 0.7, TAIL = 0.7, GAP = 0.2;
export const B = {}, SC = {}; export const beats = []; let t = 0;
for (const s of SCENES) {
  SC[s.id] = s; s.t0 = t; t += LEAD; s.beats = [];
  for (const [sc, id, idur, nd0, text] of BEATS) {
    const nd = ND[id] ?? nd0;
    if (sc !== s.id) continue;
    const b = { id, scene: sc, text, nd, t0: t, t1: t + idur, dur: idur }; B[id] = b; beats.push(b); s.beats.push(b); t += idur + GAP;
  }
  t += TAIL - GAP; s.t1 = t;
}
export const TOTAL = t;
export function sceneAt(time) { for (const s of SCENES) if (time < s.t1) return s; return SCENES[SCENES.length - 1]; }
export function beatAt(time) { for (const b of beats) if (time >= b.t0 && time < b.t1 + GAP) return b; return null; }

// ---------------- key times (internal) ----------------
const rel = (b, o) => B[b].t0 + o;
export const K = {
  partsAppear: [0, 1, 2, 3, 4, 5, 6].map(i => B.b0.t0 + 0.5 + i * 0.35),
  chassis: rel('d1', 0.3), motors: [rel('d1', 1.6), rel('d1', 2.2)], wheels: [rel('d1', 3.0), rel('d1', 3.5)], caster: rel('d1', 4.2),
  sensors: [rel('d2', 1.0), rel('d2', 1.8)],
  battery: rel('d3', 0.6), l298n: rel('d3', 1.8), arduino: rel('d3', 3.0),
  motorLeads: [0, 1, 2, 3].map(i => rel('d4', 0.8 + i * 0.9)),
  sensorWires: [0, 1, 2, 3, 4, 5].map(i => rel('d5', 0.7 + i * 0.95)),
  ctrlWires: [0, 1, 2, 3, 4, 5].map(i => rel('d6', 0.6 + i * 1.3)),
  powerLeads: [0, 1, 2, 3, 4, 5, 6].map(i => rel('d7', 0.6 + i * 1.3)),
  capsOff: rel('d8', 1.2),
  usbIn: rel('f1', 0.8), upload: rel('f2', 3.0),
  demo0: B.g1.t0,
};
export const STATE_NAMES = { straight: 'Tout droit', left: 'Tourne à gauche', right: 'Tourne à droite', stop: 'Stop' };

// ---------------- video time warp ----------------
const segs = []; let v = 0;
for (const sc of SCENES) {
  const push = (t0, t1, nd) => { if (t1 - t0 > 1e-6) { segs.push({ t0, t1, v0: v, v1: v + nd }); v += nd; } };
  push(sc.t0, sc.beats[0].t0, 0.25);
  for (const b of sc.beats) { b.v0 = v; push(b.t0, b.t1 + GAP, b.nd); }
  push(sc.beats[sc.beats.length - 1].t1 + GAP, sc.t1, 0.25);
  sc.v0 = segs.find(g => g.t0 === sc.t0).v0; sc.v1 = v;
}
export const VTOTAL = v;
export function toInternal(vt) { if (vt <= 0) return 0; if (vt >= VTOTAL) return TOTAL; for (const g of segs) if (vt < g.v1) return g.t0 + ((vt - g.v0) / (g.v1 - g.v0)) * (g.t1 - g.t0); return TOTAL; }
export function toVideo(t) { for (const g of segs) if (t < g.t1) return g.v0 + ((t - g.t0) / (g.t1 - g.t0)) * (g.v1 - g.v0); return VTOTAL; }

export function sfxVideo() {
  const ev = []; const add = (tt, k) => ev.push({ t: toVideo(tt), k });
  for (const s of SCENES) add(s.t0 + 0.05, 'whoosh');
  K.partsAppear.forEach(x => add(x, 'pop'));
  [K.chassis, ...K.motors, ...K.wheels, K.caster, ...K.sensors, K.battery, K.l298n, K.arduino].forEach(x => add(x + 0.4, 'click'));
  [...K.motorLeads, ...K.sensorWires, ...K.ctrlWires, ...K.powerLeads].forEach(x => add(x + 0.9, 'tick'));
  add(K.capsOff, 'pop'); add(K.upload, 'ding'); add(B.d9.t0 + 0.1, 'ding'); add(B.g2.t0 + 0.2, 'beep');
  for (const k of ['c1', 'c2', 'c3', 'c4', 'e0', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6']) add(B[k].t0 + 0.1, 'tick');
  ev.sort((a, b) => a.t - b.t); const out = []; const last = {};
  for (const e of ev) { if (last[e.k] !== undefined && e.t - last[e.k] < 0.12) continue; last[e.k] = e.t; out.push(e); }
  return out;
}
export function srtVideo() {
  const f = x => { const ms = Math.round(x * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000; const p = (n, l = 2) => String(n).padStart(l, '0'); return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`; };
  return beats.filter(b => b.text).map((b, i) => `${i + 1}\n${f(b.v0)} --> ${f(b.v0 + b.nd - 0.08)}\n${b.text}\n`).join('\n');
}
