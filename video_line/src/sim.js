// Line-follower simulation (same decision logic as the Arduino sketch). Pure function of time -> used for 3D demo + 2D HUD.
export const TRK = { R: 260, S: 500, HALF: 9.5, BAR_X: -90, BAR_W: 26 };
export function distToLine(x, z) {
  const { R, S } = TRK;
  if (Math.abs(x) <= S / 2) return Math.abs(Math.abs(z) - R);
  const cx = Math.sign(x) * S / 2; return Math.abs(Math.hypot(x - cx, z) - R);
}
export function onLine(x, z) {
  if (distToLine(x, z) < TRK.HALF) return 1;
  // transverse "finish" bar across the lower straight
  if (Math.abs(x - TRK.BAR_X) < TRK.BAR_W / 2 && Math.abs(z + TRK.R) < 62) return 1;
  return 0;
}
export const GEOM = { SENS_X: 105, SENS_Z: 15, VMAX: 300, TRACK: 140 };
export function simulate(SPEED = 150, seconds = 26, dt = 0.004) {
  const { SENS_X, SENS_Z, VMAX, TRACK } = GEOM;
  let x = -170, z = TRK.R - 13, th = 0, t = 0, aL = 0, aR = 0; const out = [];
  for (let i = 0; i <= seconds / dt; i++) {
    const c = Math.cos(th), s = Math.sin(th);
    const sp = k => [x + c * SENS_X - s * k * SENS_Z, z + s * SENS_X + c * k * SENS_Z];
    const L = onLine(...sp(-1)), R = onLine(...sp(1));
    let l = 0, r = 0, b;
    if (!L && !R) { l = SPEED; r = SPEED; b = 'straight'; }
    else if (L && !R) { l = 0; r = SPEED; b = 'left'; }
    else if (!L && R) { l = SPEED; r = 0; b = 'right'; }
    else b = 'stop';
    out.push({ t, x, z, th, L, R, l, r, b, aL, aR });
    const vl = (l / 255) * VMAX, vr = (r / 255) * VMAX;
    aL += (vl * dt) / 32.5; aR += (vr * dt) / 32.5; th += ((vl - vr) / TRACK) * dt; x += ((vl + vr) / 2) * Math.cos(th) * dt; z += ((vl + vr) / 2) * Math.sin(th) * dt; t += dt;
  }
  return { out, dt };
}
export const SIM = simulate(150, 26, 0.004);
export function simAt(t) {
  const i = Math.min(SIM.out.length - 1, Math.max(0, Math.floor(t / SIM.dt))); return SIM.out[i];
}
