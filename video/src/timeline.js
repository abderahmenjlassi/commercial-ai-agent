// Timeline: scenes, narration beats (Arabic captions) and key event times.
// Pure data/logic (no DOM) so Node can import it for audio + subtitles too.
export const FPS = 24;

export const SCENES = [
  { id: 'A', title: 'إشارة المرور بالأردوينو', sub: 'Arduino Traffic Light' },
  { id: 'B', title: 'القطع المطلوبة', sub: 'Components' },
  { id: 'C', title: 'افهم القطع قبل التركيب', sub: 'LED · Resistor · Ohm\'s law' },
  { id: 'D', title: 'تركيب الدائرة خطوة بخطوة', sub: 'Build the circuit' },
  { id: 'E', title: 'شرح الكود', sub: 'The code' },
  { id: 'F', title: 'رفع البرنامج إلى اللوحة', sub: 'Upload' },
  { id: 'G', title: 'التشغيل', sub: 'It works!' },
  { id: 'H', title: 'نصائح وختام', sub: 'Tips' },
];

// text = narration/caption. min = minimum seconds on screen.
const BEATS = [
  ['A', 'a1', 'مرحباً بكم! في هذا الفيديو سنصنع إشارة مرور حقيقية باستخدام الأردوينو.', 0],
  ['A', 'a2', 'سنتعرّف على القطع المطلوبة، ثم نركّب الدائرة، ونشرح الكود سطراً بسطر.', 0],

  ['B', 'b0', 'نبدأ بالقطع المطلوبة. كلها بسيطة ومتوفرة في أي متجر إلكترونيات.', 0],
  ['B', 'b1', 'أولاً: لوحة أردوينو أونو، وهي العقل المدبّر الذي ينفّذ البرنامج ويتحكّم بالأضواء.', 0],
  ['B', 'b2', 'ثانياً: لوحة التجارب، وتسمح لنا بتركيب الدائرة وتعديلها بدون لحام.', 0],
  ['B', 'b3', 'ثالثاً: ثلاثة صمّامات مضيئة LED بالألوان الأحمر والأصفر والأخضر، وهي أضواء الإشارة.', 0],
  ['B', 'b4', 'رابعاً: ثلاث مقاومات قيمة كلٍّ منها 220 أوم، تحمي كل LED من التيار الزائد.', 0],
  ['B', 'b5', 'خامساً: سبعة أسلاك توصيل من نوع ذكر - ذكر لربط القطع ببعضها.', 0],
  ['B', 'b6', 'وأخيراً: كابل USB لتشغيل اللوحة ورفع البرنامج من الحاسوب.', 0],

  ['C', 'c1', 'قبل التركيب لنفهم الـ LED: يعمل في اتجاه واحد فقط. الساق الطويلة هي الموجب (الآنود)، والقصيرة هي السالب (الكاثود).', 0],
  ['C', 'c2', 'والجهة المسطّحة من قاعدته تدلّ أيضاً على الكاثود، وداخله تكون الصفيحة الأكبر هي الكاثود.', 0],
  ['C', 'c3', 'لماذا نحتاج مقاومة؟ لأن الـ LED لا يحدّ التيار بنفسه، فلو وُصل مباشرة بـ 5 فولت لمرّ فيه تيار كبير يتلفه أو يتلف منفذ الأردوينو.', 0],
  ['C', 'c4', 'نحسب التيار بقانون أوم: التيار = (جهد المصدر − جهد الـ LED) ÷ المقاومة.', 0],
  ['C', 'c5', 'جهد المنفذ 5 فولت، وجهد الـ LED الأحمر نحو 2 فولت، فيكون التيار ≈ 13.6 ملي أمبير، وهو أقل من الحد الموصى به 20 ملي أمبير.', 0],
  ['C', 'c6', 'ونقرأ قيمة المقاومة من ألوانها: أحمر وأحمر وبني وذهبي، أي 22 × 10 = 220 أوم، بدقة ±5%.', 0],

  ['D', 'd1', 'نضع لوحة التجارب أمام الأردوينو. كل خمس فتحات في العمود الواحد متصلة ببعضها، وكذلك فتحات خط الطاقة الجانبي.', 0],
  ['D', 'd2', 'الخطوة 1: نوصّل طرف GND المجاور للمنفذ 13 بالخط السالب (−) في لوحة التجارب بسلك أسود.', 0],
  ['D', 'd3', 'الخطوة 2: نركّب الـ LED الأحمر والأصفر والأخضر، بحيث تكون الساق الطويلة (الموجب) في العمود الأيسر.', 8],
  ['D', 'd4', 'الخطوة 3: نركّب المقاومات، كل واحدة تصل بين عمود سلك المنفذ وعمود الساق الطويلة.', 8],
  ['D', 'd5', 'الخطوة 4: نوصّل الساق القصيرة لكل LED بخط الأرضي (GND) بسلك أسود.', 8],
  ['D', 'd6', 'الخطوة 5: نوصّل المنفذ 10 بالـ LED الأحمر، والمنفذ 9 بالأصفر، والمنفذ 8 بالأخضر.', 8],
  ['D', 'd7', 'اكتملت الدائرة: كل منفذ يمرّ عبر مقاومة ثم LED ثم يعود إلى GND.', 6],

  ['E', 'e1', 'والآن الكود. نبدأ بتعريف أرقام المنافذ: الأحمر 10، والأصفر 9، والأخضر 8.', 0],
  ['E', 'e2', 'ثم دالة setLights التي تضبط الأضواء الثلاثة معاً: HIGH يضيء الضوء، و LOW يطفئه.', 0],
  ['E', 'e3', 'في setup، التي تعمل مرة واحدة، نجعل المنافذ الثلاثة مخارج OUTPUT.', 0],
  ['E', 'e4', 'وفي loop، التي تتكرر دائماً: يضيء الأحمر وحده 5 ثوانٍ؛ فالدالة delay تأخذ الزمن بالميلي ثانية.', 0],
  ['E', 'e5', 'ثم يضيء الأخضر 5 ثوانٍ ليسمح بالمرور.', 5],
  ['E', 'e6', 'ثم الأصفر ثانيتين للتنبيه، وبعدها تعود الدورة من جديد إلى الأحمر.', 0],

  ['F', 'f1', 'نوصّل الأردوينو بالحاسوب بكابل USB، فتضيء لمبة ON على اللوحة.', 0],
  ['F', 'f2', 'نفتح برنامج Arduino IDE ونكتب الكود فيه.', 4.5],
  ['F', 'f3', 'من قائمة Tools نختار Board ثم Arduino Uno، ومن Port نختار المنفذ الذي ظهر للوحة.', 0],
  ['F', 'f4', 'ثم نضغط زر Upload، فيُرفع البرنامج إلى اللوحة ويبدأ العمل فوراً.', 0],

  ['G', 'g1', 'وها هي إشارة المرور تعمل: الأحمر 5 ثوانٍ، ثم الأخضر 5 ثوانٍ، ثم الأصفر ثانيتين.', 13],
  ['G', 'g2', 'وتتكرر الدورة تلقائياً ما دامت اللوحة موصولة بالطاقة.', 12],

  ['H', 'h1', 'نصيحة: إذا لم يضئ الـ LED فاعكس اتجاهه، ولا تستخدمه أبداً بدون مقاومة.', 0],
  ['H', 'h2', 'وتأكد من وصل GND، وافصل كابل USB قبل تعديل التوصيلات.', 0],
  ['H', 'h3', 'للتطوير: أضف زر مشاة، أو إشارة ثانية لتكوين تقاطع كامل.', 0],
  ['H', 'h4', 'شكراً لمشاهدتكم!', 4.5],
];

const LEAD = 0.7, TAIL = 0.7, GAP = 0.2;
const dur = (text, min) => Math.max(min, 3.4, text.replace(/\s/g, '').length / 10.5 + 1.1);

export const B = {}; // beats by id
export const SC = {}; // scenes by id
export const beats = [];
let t = 0;
for (const s of SCENES) {
  SC[s.id] = s;
  s.t0 = t;
  t += LEAD;
  s.beats = [];
  for (const [sc, id, text, min] of BEATS) {
    if (sc !== s.id) continue;
    const d = dur(text, min);
    const b = { id, scene: sc, text, t0: t, t1: t + d, dur: d };
    B[id] = b; beats.push(b); s.beats.push(b);
    t += d + GAP;
  }
  t += TAIL - GAP;
  s.t1 = t;
}
export const TOTAL = t;

export function sceneAt(time) {
  for (const s of SCENES) if (time < s.t1) return s;
  return SCENES[SCENES.length - 1];
}
export function beatAt(time) {
  for (const b of beats) if (time >= b.t0 && time < b.t1 + GAP) return b;
  return null;
}

// ---- Key times shared by visuals and sound effects ----
export const K = {
  // scene B: parts appear in the wide shot
  partsAppear: [0, 1, 2, 3, 4, 5].map(i => B.b0.t0 + 0.8 + i * 0.45),
  // scene D
  ardDrop: B.d1.t0 + 0.2,
  bbDrop: B.d1.t0 + 0.9,
  hiCol: [B.d1.t0 + B.d1.dur * 0.30, B.d1.t0 + B.d1.dur * 0.52],
  hiRail: [B.d1.t0 + B.d1.dur * 0.58, B.d1.t0 + B.d1.dur * 0.86],
  gnd: B.d2.t0 + 1.0,
  led: [0, 1, 2].map(i => B.d3.t0 + 1.0 + i * 1.6),
  res: [0, 1, 2].map(i => B.d4.t0 + 1.0 + i * 1.6),
  cath: [0, 1, 2].map(i => B.d5.t0 + 1.0 + i * 1.5),
  sig: [0, 1, 2].map(i => B.d6.t0 + 1.0 + i * 1.7),
  // scene F
  usbIn: B.f1.t0 + 0.8,
  powerOn: B.f1.t0 + 2.4,
  upload: B.f4.t0 + 2.6,
  // scene G: the traffic light cycle starts here
  cycle0: B.g1.t0 + 0.6,
};
export const CYCLE = [['R', 5], ['G', 5], ['Y', 2]]; // red 5 s, green 5 s, yellow 2 s
export const CYCLE_LEN = 12;
export function lightState(local) {
  const l = ((local % CYCLE_LEN) + CYCLE_LEN) % CYCLE_LEN;
  if (l < 5) return 'R';
  if (l < 10) return 'G';
  return 'Y';
}

// Sound-effect events for the audio mixer
export function sfxEvents() {
  const ev = [];
  for (const s of SCENES) { ev.push({ t: s.t0 + 0.05, k: 'whoosh' }); }
  K.partsAppear.forEach(x => ev.push({ t: x, k: 'pop' }));
  [K.ardDrop, K.bbDrop, ...K.led, ...K.res].forEach(x => ev.push({ t: x + 0.45, k: 'click' }));
  [K.gnd, ...K.cath, ...K.sig].forEach(x => ev.push({ t: x + 1.3, k: 'click' }));
  [K.usbIn + 0.9].forEach(x => ev.push({ t: x, k: 'click' }));
  ev.push({ t: K.powerOn, k: 'ding' });
  ev.push({ t: K.upload, k: 'ding' });
  for (const k of ['d2', 'd3', 'd4', 'd5', 'd6', 'd7', 'f2', 'f3', 'f4', 'c6']) ev.push({ t: B[k].t0 + 0.1, k: 'tick' });
  // light switching in the demo + intro
  for (let c = 0; c < 4; c++) {
    for (const off of [0, 5, 10]) {
      const x = K.cycle0 + c * 12 + off;
      if (x < B.g2.t1) ev.push({ t: x, k: 'beep' });
    }
  }
  return ev.sort((a, b) => a.t - b.t);
}

export function srt() {
  const f = x => {
    const ms = Math.round(x * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60,
      s = Math.floor(ms / 1000) % 60, r = ms % 1000;
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
  };
  return beats.map((b, i) => `${i + 1}\n${f(b.t0)} --> ${f(b.t1)}\n${b.text}\n`).join('\n');
}
