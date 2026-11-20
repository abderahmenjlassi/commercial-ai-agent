// Renders branding assets with headless Chromium: watermark, banners, animated end cards (frames).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const D = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(D, 'brand.html'), 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const logo = 'logo.png';
const head = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>`;
const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3), back = x => { x = Math.min(1, Math.max(0, x)); const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const CARDS = {
  fr: { dir: 'ltr', h1: 'Tous les composants de ce projet sont disponibles sur', sub: 'Commande le kit et construis ce robot toi-même !', sub2: 'اشترِ المكوّنات من موقعنا وابنِ الروبوت بنفسك', chips: ['Arduino Uno', 'Driver L298N', 'Capteurs IR TCRT5000', 'Moteurs + roues', 'Châssis 2WD', 'Batterie 18650'] },
  ar: { dir: 'rtl', h1: 'كل مكوّنات هذا المشروع متوفرة في موقعنا', sub: 'اشترِها مباشرةً من الموقع وابنِ مشروعك بنفسك!', sub2: '', chips: ['أردوينو أونو', 'لوحة التجارب', 'مصابيح LED', 'مقاومات', 'أسلاك توصيل', 'كابل USB'] },
};
const BANNERS = { fr: '🛒 Ces composants sont disponibles sur <b>tuni-smart-innovation.com</b>', ar: '🛒 هذه القطع متوفرة في موقعنا <b>tuni-smart-innovation.com</b>' };
const browser = await chromium.launch({ args: ['--no-sandbox'] });
let _n = 0;
async function load(page, html) { const f = path.join(D, `_tmp${_n++}.html`); fs.writeFileSync(f, html); await page.goto('file://' + f); await page.evaluate(() => document.fonts.ready); }
const out = path.join(D, 'build'); fs.mkdirSync(out, { recursive: true });
// ---- watermark + banners (transparent PNGs)
{
  const page = await browser.newPage({ viewport: { width: 1700, height: 400 } });
  await load(page, head + `<body><div id="w" class="wm"><img src="${logo}"><span>tuni-smart-innovation.com</span></div></body></html>`);
  await page.waitForTimeout(400); await page.locator('#w').screenshot({ path: path.join(out, 'watermark.png'), omitBackground: true });
  for (const lang of ['fr', 'ar']) for (const v of [0, 1]) {
    await load(page, head + `<body dir="${CARDS[lang].dir}"><div id="b" class="banner${v ? ' v' : ''}">${BANNERS[lang]}</div></body></html>`);
    await page.waitForTimeout(300); await page.locator('#b').screenshot({ path: path.join(out, `banner_${lang}_${v ? 'v' : 'h'}.png`), omitBackground: true });
  }
  await page.close();
}
// ---- end cards: 5.5 s @ 30 fps
for (const lang of ['fr', 'ar']) for (const v of [0, 1]) {
  const C = CARDS[lang]; const W = v ? 1080 : 1920, H = v ? 1920 : 1080;
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await load(page, head + `<body class="card${v ? ' v' : ''}" dir="${C.dir}"><div class="grid"></div><div class="wrap">
    <img class="logo" id="logo" src="${logo}"><div class="h1" id="h1">${C.h1}</div><div class="brand" id="brand">Tunisian Smart Innovation</div>
    <div class="sub" id="sub">${C.sub}</div>${C.sub2 ? `<div class="sub2" id="sub2">${C.sub2}</div>` : ''}
    <div class="chips" id="chips">${C.chips.map(c => `<span class="chip">${c}</span>`).join('')}</div>
    <div class="url" id="url">🛒 tuni-smart-innovation.com</div></div></body></html>`);
  await page.waitForTimeout(600);
  const dir = path.join(out, `end_${lang}_${v ? 'v' : 'h'}`); fs.mkdirSync(dir, { recursive: true });
  const N = 288;
  for (let f = 0; f < N; f++) {
    const t = f / 30;
    await page.evaluate((t) => {
      const q = (id) => document.getElementById(id); const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3); const back = x => { x = Math.min(1, Math.max(0, x)); const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
      const show = (el, t0, d = 0.5, dy = 24) => { if (!el) return; const e = ease((t - t0) / d); el.style.opacity = e; el.style.transform = `translateY(${(1 - e) * dy}px)`; };
      q('logo').style.transform = `scale(${0.5 + 0.5 * back((t - 0.1) / 0.7)})`; q('logo').style.opacity = ease((t - 0.1) / 0.4);
      show(q('h1'), 0.7); show(q('brand'), 1.0, 0.6); show(q('sub'), 1.7); show(q('sub2'), 2.0);
      const chips = [...document.querySelectorAll('.chip')]; chips.forEach((c, i) => { const e = back((t - (2.3 + i * 0.18)) / 0.45); c.style.opacity = Math.min(1, e * 2); c.style.transform = `scale(${0.6 + 0.4 * e})`; });
      const u = q('url'); const e = back((t - 3.5) / 0.6); u.style.opacity = Math.min(1, e * 2); u.style.transform = `scale(${0.7 + 0.3 * e + (t > 4.2 ? 0.025 * Math.sin((t - 4.2) * 6) : 0)})`;
      document.body.style.opacity = t > 9.15 ? Math.max(0, 1 - (t - 9.15) / 0.4) : 1;
    }, t);
    await page.screenshot({ path: path.join(dir, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 });
  }
  await page.close(); console.log('end card', lang, v ? 'v' : 'h');
}
await browser.close();
