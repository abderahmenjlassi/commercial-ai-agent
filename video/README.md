# فيديو ثلاثي الأبعاد: إشارة مرور بالأردوينو / 3D Arduino Traffic-Light Video

الناتج: `out/arduino_traffic_light_ar.mp4` (1080p · 24fps · 5:00) + ترجمة `out/arduino_traffic_light_ar.srt`.

## إعادة الإنتاج / Rebuild
```bash
npm install                      # three + Cairo font (playwright/chromium + ffmpeg must exist)
npx http-server . -p 8123 -s &   # local server for the 3D page
./render_all.sh                  # frames/ (headless Chromium + three.js, software GL)
node -e "import('./src/timeline.js').then(m=>require('fs').writeFileSync('out/events.json',JSON.stringify({total:m.TOTAL,events:m.sfxEvents(),scenes:m.SCENES.map(s=>({id:s.id,t0:s.t0,t1:s.t1}))})))"
python3 audio.py                 # music + SFX (numpy only)
./assemble.sh                    # MP4
```
- `src/timeline.js` : النصوص العربية والتوقيت / Arabic narration text + timing
- `src/models.js`   : المجسّمات (Arduino Uno, breadboard, LED, resistor, wires, USB, laptop, traffic light)
- `src/main.js`     : المشهد والكاميرا واللوحات الشرحية

## Circuit (as built in the video)
D10 → 220Ω → red LED → GND · D9 → 220Ω → yellow LED → GND · D8 → 220Ω → green LED → GND
Sequence: red 5 s → green 5 s → yellow 2 s (delay(5000/5000/2000)).
I = (5 − 2) / 220 ≈ 13.6 mA (< 20 mA recommended per pin).
