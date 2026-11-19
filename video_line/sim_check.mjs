// Offline check of the control logic (same logic as the Arduino sketch) on a stadium track.
export const TRK = { R: 260, S: 500, HALF: 9.5 };
export function distToLine(x, z) {
  const { R, S } = TRK;
  if (Math.abs(x) <= S / 2) return Math.abs(Math.abs(z) - R);
  const cx = Math.sign(x) * S / 2; return Math.abs(Math.hypot(x - cx, z) - R);
}
const onLine = (x, z) => (distToLine(x, z) < TRK.HALF ? 1 : 0);
export function simulate(SPEED = 150, seconds = 40, dt = 0.005, SENS_X = 105, SENS_Z = 15, VMAX = 300, TRACK = 140) {
  let x = -150, z = TRK.R, th = 0, t = 0; const out = []; let maxErr = 0; const branches = {};
  for (let i = 0; i <= seconds / dt; i++) {
    const c = Math.cos(th), s = Math.sin(th);
    const sp = k => [x + c * SENS_X - s * k * SENS_Z, z + s * SENS_X + c * k * SENS_Z];
    const L = onLine(...sp(-1)), R = onLine(...sp(1));
    let l = 0, r = 0, b;
    if (!L && !R) { l = SPEED; r = SPEED; b = 'straight'; }
    else if (L && !R) { l = 0; r = SPEED; b = 'left'; }
    else if (!L && R) { l = SPEED; r = 0; b = 'right'; }
    else b = 'stop';
    branches[b] = (branches[b] || 0) + 1;
    out.push({ t, x, z, th, L, R, l, r, b });
    const vl = (l / 255) * VMAX, vr = (r / 255) * VMAX;
    th += ((vl - vr) / TRACK) * dt; x += ((vl + vr) / 2) * Math.cos(th) * dt; z += ((vl + vr) / 2) * Math.sin(th) * dt; t += dt;
    maxErr = Math.max(maxErr, distToLine(x, z));
  }
  return { out, maxErr, branches };
}
if (process.argv[1].endsWith('sim_check.mjs')) {
  for (const sp of [120, 150, 180]) { const r = simulate(sp, 40); console.log('SPEED', sp, 'maxErr', r.maxErr.toFixed(1), 'mm', JSON.stringify(r.branches)); }
}
