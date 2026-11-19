#!/usr/bin/env python3
"""Synthesises the soundtrack (ambient music + sound effects) with numpy only.
Reads out/events.json (produced from src/timeline.js) so every effect lines up with the picture."""
import json, wave, sys
import numpy as np

SR = 44100
ev = json.load(open('out/events.json'))
TOTAL = ev['total'] + 1.5
N = int(TOTAL * SR)
rng = np.random.default_rng(7)

# ---- Arabic voice-over: one clip per beat (22.05 kHz mono) placed at the beat's start time
import subprocess, os
V = np.zeros(N, dtype=np.float64)
beats = json.load(open('out/beats.json')) if os.path.exists('out/beats.json') else []
for b in beats:
    wp = f"out/voice/{b['id']}.wav"
    if not os.path.exists(wp): continue
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', wp, '-ar', str(SR), '-ac', '1', '-f', 'f32le', '-'], capture_output=True).stdout
    clip = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    i = int((b['v0'] + 0.06) * SR); j = min(N, i + len(clip))
    if i < N: V[i:j] += clip[: j - i]
# music ducking envelope: music drops by ~55 % while the voice speaks
k = int(0.18 * SR); cs = np.cumsum(np.concatenate([[0.0], np.abs(V)]))
lo = np.clip(np.arange(N) - k // 2, 0, N); hi = np.clip(np.arange(N) + k // 2, 0, N)
act = np.clip(((cs[hi] - cs[lo]) / np.maximum(hi - lo, 1)) * 40, 0, 1)
k2 = int(0.35 * SR); cs2 = np.cumsum(np.concatenate([[0.0], act]))
lo2 = np.clip(np.arange(N) - k2 // 2, 0, N); hi2 = np.clip(np.arange(N) + k2 // 2, 0, N)
duck = 1 - 0.55 * np.clip((cs2[hi2] - cs2[lo2]) / np.maximum(hi2 - lo2, 1), 0, 1)
L = np.zeros(N, dtype=np.float64)
R = np.zeros(N, dtype=np.float64)

def add(buf, start, sig, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N: return
    j = min(N, i + len(sig))
    g = gain
    l = g * (1 - max(0, pan)); r = g * (1 + min(0, pan))
    L[i:j] += sig[: j - i] * l
    R[i:j] += sig[: j - i] * r

def midi(n): return 440.0 * 2 ** ((n - 69) / 12)
def t_(d): return np.arange(int(d * SR)) / SR

def pluck(f, d=1.6, bright=1.0):
    t = t_(d)
    s = np.zeros_like(t)
    for k, a in ((1, 1.0), (2, 0.42), (3, 0.2), (4, 0.09), (5, 0.04)):
        s += a * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (3.2 + 2.2 * k) / max(bright, 0.3))
    s *= np.minimum(1, t / 0.004)
    return s * 0.5

def pad(freqs, d, vol=1.0):
    t = t_(d)
    s = np.zeros_like(t)
    for f in freqs:
        for det in (-0.12, 0.0, 0.14):
            ff = f * (1 + det * 0.01)
            s += np.sin(2 * np.pi * ff * t) + 0.35 * np.sin(2 * np.pi * ff * 2 * t + 0.6) + 0.12 * np.sin(2 * np.pi * ff * 3 * t)
    a = min(1.6, d / 3)
    env = np.minimum(1, t / a) * np.minimum(1, (d - t) / a)
    return s * env * vol / (len(freqs) * 3)

def bass(f, d):
    t = t_(d)
    env = np.minimum(1, t / 0.05) * np.exp(-t * 0.55) * np.minimum(1, (d - t) / 0.3)
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)) * env * 0.5

# ------------------------------------------------------------ music
BPM = 124
beat = 60 / BPM
bar = 4 * beat
# Am - F - C - G, two bars each
prog = [([60, 64, 67], 48), ([55, 59, 62], 43), ([57, 60, 64], 45), ([53, 57, 60], 41)]  # C - G - Am - F (happy)
arp_pat = [0, 1, 2, 1, 2, 1, 0, 2]   # eighth-note pattern over chord tones
nbars = int(TOTAL / bar) + 2
for b in range(0, nbars, 2):
    chord, root = prog[(b // 2) % 4]
    t0 = b * bar
    p = pad([midi(n) for n in chord] + [midi(chord[0] - 12)], 2 * bar + 0.8, 0.5)
    i = int(t0 * SR)
    if i < N:
        j = min(N, i + len(p)); L[i:j] += p[: j - i] * 0.30; R[i:j] += p[: j - i] * 0.30
    bs = bass(midi(root), 2 * bar)
    i = int(t0 * SR)
    if i < N:
        j = min(N, i + len(bs)); L[i:j] += bs[: j - i] * 0.33; R[i:j] += bs[: j - i] * 0.33
    for e in range(16):  # 16 eighth notes in two bars
        tn = t0 + e * beat / 2
        note = chord[arp_pat[e % 8] % 3] + 12 + (12 if e % 8 in (3, 7) and (b // 2) % 2 else 0)
        sig = pluck(midi(note), 1.2)
        add(L, tn, sig, 0.10 + 0.025 * (e % 2 == 0), pan=0.35 * (1 if e % 2 else -1))
        if e % 8 == 0:
            add(L, tn, pluck(midi(chord[0] + 24), 2.2), 0.045, pan=0.0)

# light drums: kick on every beat, soft hat on off-beats (adds drive for social media)
def kick():
    t = t_(0.25); f = 45 + 90 * np.exp(-t * 30); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 11) * 0.9
def hat():
    t = t_(0.05); n = rng.standard_normal(len(t)); n = np.diff(n, prepend=0)
    return n * np.exp(-t * 90) * 0.5
K_, H_ = kick(), hat()
nb = int(TOTAL / beat) + 1
for q in range(nb):
    tq = q * beat
    if tq < 3.0: continue
    add(L, tq, K_, 0.20 if q % 4 == 0 else 0.15, 0.0)
    add(L, tq + beat / 2, H_, 0.07, 0.25 * (1 if q % 2 else -1))

# gentle global swell per scene: slightly fuller in intro/outro
env = np.ones(N)
t_all = np.arange(N) / SR
for s in ev['scenes']:
    lvl = 1.15 if s['id'] in ('A', 'H') else (0.85 if s['id'] in ('E',) else 1.0)
    i0, i1 = int(s['t0'] * SR), min(N, int(s['t1'] * SR))
    env[i0:i1] = lvl
k = int(0.8 * SR)
cs = np.cumsum(np.concatenate([[0.0], env])); lo = np.clip(np.arange(N) - k // 2, 0, N); hi = np.clip(np.arange(N) + k // 2, 0, N)
env = (cs[hi] - cs[lo]) / np.maximum(hi - lo, 1)   # moving average via cumulative sum (fast)
L *= env * duck; R *= env * duck

# ------------------------------------------------------------ sound effects
def pop():
    t = t_(0.18); f = 520 + 900 * (1 - np.exp(-t * 28))
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 22) * np.minimum(1, t / 0.003) * 0.9

def click():
    t = t_(0.09)
    n = rng.standard_normal(len(t)) * np.exp(-t * 90)
    s = np.sin(2 * np.pi * 1700 * t) * np.exp(-t * 60)
    s2 = np.sin(2 * np.pi * 420 * t) * np.exp(-t * 40)
    return (0.35 * n + 0.6 * s + 0.5 * s2)

def ding():
    t = t_(1.6)
    s = np.sin(2 * np.pi * 1318.5 * t) * np.exp(-t * 3.0) + 0.5 * np.sin(2 * np.pi * 1318.5 * 2.76 * t) * np.exp(-t * 6.5) + 0.35 * np.sin(2 * np.pi * 1976 * t) * np.exp(-t * 4)
    return s * np.minimum(1, t / 0.003) * 0.7

def tick():
    t = t_(0.07)
    return np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 80) * 0.6

def beep():
    t = t_(0.14)
    return (np.sin(2 * np.pi * 880 * t) + 0.3 * np.sin(2 * np.pi * 1760 * t)) * np.exp(-t * 18) * np.minimum(1, t / 0.004) * 0.55

def whoosh():
    d = 0.9; t = t_(d)
    n = rng.standard_normal(len(t))
    # one-pole low-pass with sweeping cutoff (rising then falling)
    fc = 300 + 3200 * np.sin(np.pi * t / d) ** 2
    a = 1 - np.exp(-2 * np.pi * fc / SR)
    y = np.zeros_like(n); acc = 0.0
    for i in range(len(n)):
        acc += a[i] * (n[i] - acc); y[i] = acc
    return y * np.sin(np.pi * t / d) ** 2 * 1.6

lib = {'pop': (pop, 0.28, 0.2), 'click': (click, 0.30, 0.0), 'ding': (ding, 0.22, 0.0),
       'tick': (tick, 0.12, 0.0), 'beep': (beep, 0.13, 0.0), 'whoosh': (whoosh, 0.10, 0.0)}
cache = {k: v[0]() for k, v in lib.items()}
for e in ev['events']:
    fn, g, pan = lib[e['k']]
    add(L, e['t'], cache[e['k']], g, pan * (1 if int(e['t'] * 10) % 2 else -1))

# ------------------------------------------------------------ master
L += V * 1.15; R += V * 1.15
out = np.stack([L, R], axis=1)
fi, fo = int(1.2 * SR), int(3.5 * SR)
out[:fi] *= np.linspace(0, 1, fi)[:, None]
out[-fo:] *= np.linspace(1, 0, fo)[:, None]
out = np.tanh(out * 1.1) / np.tanh(1.1)
peak = np.abs(out).max()
out = out / peak * 0.80
pcm = (out * 32767).astype('<i2')
with wave.open('out/audio.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote out/audio.wav', round(TOTAL, 1), 's, peak', round(float(peak), 3))
