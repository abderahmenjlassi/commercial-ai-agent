#!/usr/bin/env python3
"""More natural Arabic voice-over from the Piper 'kareem' model:
 - phrase-level synthesis with natural pauses (commas / sentence ends)
 - livelier prosody (higher noise_scale / noise_w), slower pace, tiny per-phrase tempo variation
 - studio-style post-processing (warmth, presence, gentle compression, light room)
 Writes out/voice/<beat>.wav and src/nd.js (shot length = max(1.15 x planned, voice + 0.5 s))."""
import json, os, re, subprocess, wave, random
import numpy as np
from voice_engine import synth
SR = 22050
nar = json.load(open('narration_ar.json'))
os.makedirs('out/voice', exist_ok=True)
random.seed(11)
import subprocess as sp
base = json.loads(sp.run(['node', '-e', "import('./src/timeline.js').then(m=>console.log(JSON.stringify(m.BEATS0.map(b=>({id:b[1],nd:b[3]})))))"], capture_output=True, text=True).stdout)

def pause(sec): return np.zeros(int(sec * SR), dtype=np.float32)
def speak(text):
    parts = re.split(r'([،,:.!؟?])', text)
    phrases = []
    for i in range(0, len(parts) - 1, 2):
        ph, punct = parts[i].strip(), parts[i + 1]
        if ph: phrases.append((ph, punct))
    if len(parts) % 2 == 1 and parts[-1].strip(): phrases.append((parts[-1].strip(), '.'))
    out = []
    for ph, punct in phrases:
        ls = 0.99 * random.uniform(0.97, 1.05)            # close to the model's natural pace, slight variation
        a, _ = synth(ph, length_scale=ls, noise_scale=0.82, noise_w=0.95)
        # soft fade in/out to avoid clicks
        n = int(0.012 * SR); a[:n] *= np.linspace(0, 1, n); a[-n:] *= np.linspace(1, 0, n)
        out += [a, pause({'،': 0.13, ',': 0.13, ':': 0.22, '!': 0.28, '.': 0.28, '؟': 0.3, '?': 0.3}.get(punct, 0.25))]
    return np.concatenate(out[:-1]) if out else np.zeros(1, np.float32)

FILT = ('highpass=f=75,equalizer=f=160:t=q:w=1:g=2.5,equalizer=f=2800:t=q:w=1.1:g=2.2,equalizer=f=6500:t=q:w=1:g=-2,'
        'acompressor=threshold=0.1:ratio=2.5:attack=10:release=120:makeup=2.2,aecho=0.72:0.5:24|48:0.12|0.07,loudnorm=I=-17:TP=-2:LRA=7')
nd = {}; dur = {}
for b in base:
    txt = nar.get(b['id'])
    if not txt: nd[b['id']] = round(b['nd'] * 1.15, 2); continue
    a = speak(txt); a = a / max(1e-6, np.abs(a).max()) * 0.9
    raw = f"out/voice/{b['id']}_raw.wav"
    w = wave.open(raw, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((a * 32767).astype('<i2').tobytes()); w.close()
    final = f"out/voice/{b['id']}.wav"
    sp.run(['ffmpeg', '-y', '-v', 'error', '-i', raw, '-af', FILT, '-ar', '22050', '-ac', '1', final], check=True)
    os.remove(raw)
    d = len(a) / SR; dur[b['id']] = round(d, 2)
    nd[b['id']] = round(max(b['nd'] * (1.0 if b['id'].startswith('b') else 1.15), d + (0.28 if b['id'].startswith('b') else 0.5)), 2)
open('src/nd.js', 'w').write('// generated: voice drives the shot length (slower, clearer pacing)\nexport const ND = ' + json.dumps(nd) + ';\n')
json.dump(dur, open('out/voice.json', 'w'))
print('total shot time', round(sum(nd.values()), 1), 's; voice total', round(sum(dur.values()), 1), 's')
