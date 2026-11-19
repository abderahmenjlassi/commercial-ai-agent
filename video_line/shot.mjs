import { chromium } from 'playwright';
import fs from 'fs';
const times = process.argv.slice(2).map(Number);
fs.mkdirSync('/tmp/shots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: process.env.VERT ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 } });
page.on('console', m => console.log('[c]', m.text().slice(0, 300)));
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto('http://localhost:8124/index.html' + (process.env.VERT ? '?vert=1' : ''));
await page.waitForFunction(() => window.READY === true, null, { timeout: 120000 });
for (const t of times) { const t0 = Date.now(); await page.evaluate(t => window.setTime(t), t); await page.screenshot({ path: `/tmp/shots/t${String(t).replace('.', '_')}.jpg`, type: 'jpeg', quality: 90 }); console.log(t, Date.now() - t0, 'ms'); }
await browser.close();
