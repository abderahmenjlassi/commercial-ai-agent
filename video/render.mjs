// Usage: node render.mjs <startFrame> <endFrame> <outDir> [fps] [port]
import { chromium } from 'playwright';
import fs from 'fs';
const [,, s, e, out, fpsArg, portArg] = process.argv;
const fps = +(fpsArg || 30), port = portArg || 8123;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/index.html`);
await page.waitForFunction(() => window.READY === true, null, { timeout: 120000 });
const t0 = Date.now();
for (let f = +s; f < +e; f++) {
  const file = `${out}/f${String(f).padStart(5, '0')}.jpg`;
  if (fs.existsSync(file)) continue;
  const t = f / fps;
  await page.evaluate(t => window.setTime(t), t);
  await page.screenshot({ path: file, type: 'jpeg', quality: 94 });
  if ((f - s) % 30 === 0) console.log(`frame ${f} (${(Date.now() - t0) / 1000 | 0}s)`);
}
await browser.close();
