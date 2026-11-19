#!/usr/bin/env python3
"""Arabic voice-over: one neural-TTS clip per beat, speed-adjusted to fit the beat's slot. Writes out/voice/*.wav + out/voice.json"""
import json, os, subprocess, wave, numpy as np, subprocess
from voice_engine import synth
tl = json.load(open('out/beats.json'))
nar = json.load(open('narration_ar.json'))
os.makedirs('out/voice', exist_ok=True)
SR = 22050; rep = {}
def save(path, a):
    w = wave.open(path, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((a * 32767).clip(-32768, 32767).astype('<i2').tobytes()); w.close()
for b in tl:
    txt = nar.get(b['id']);
    if not txt: continue
    slot = b['nd'] - 0.12
    a, _ = synth(txt); d = len(a) / SR; ls = None
    if d > slot:                     # speak faster (down to x1.45) to fit the shot
        ls = max(0.69, 1.0 * slot / d); a, _ = synth(txt, length_scale=ls); d = len(a) / SR
    a = a / max(1e-6, np.abs(a).max()) * 0.92
    save(f"out/voice/{b['id']}.wav", a)
    rep[b['id']] = {'dur': round(d, 2), 'slot': round(slot, 2), 'ls': ls, 'over': round(max(0, d - slot), 2)}
json.dump(rep, open('out/voice.json', 'w'), indent=1, ensure_ascii=False)
bad = {k: v for k, v in rep.items() if v['over'] > 0.05}
print('clips', len(rep), 'overflowing', json.dumps(bad, ensure_ascii=False))
