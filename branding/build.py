#!/usr/bin/env python3
"""Adds branding to finished videos: logo watermark, 'available on our site' banner during the components scene,
and an animated end card with an Arabic voice call-to-action (buy the parts at tuni-smart-innovation.com)."""
import json, os, subprocess as sp, wave
import numpy as np
R = '/home/user/commercial-ai-agent'; B = f'{R}/branding/build'
JOBS = [
 ('line_h', f'{R}/video_line/out/suiveur_de_ligne_16x9_voix_ar_v6.mp4', f'{R}/video_line/out/events.json', 'fr', 'h', f'{R}/video_line/out/suiveur_de_ligne_16x9_voix_ar_v6_brand.mp4'),
 ('line_v', f'{R}/video_line/out/suiveur_de_ligne_9x16_voix_ar_v6.mp4', f'{R}/video_line/out/events.json', 'fr', 'v', f'{R}/video_line/out/suiveur_de_ligne_9x16_voix_ar_v6_brand.mp4'),
 ('tl_h', f'{R}/video/out/arduino_traffic_light_paced_16x9.mp4', f'{R}/video/out/events.json', 'ar', 'h', f'{R}/video/out/arduino_traffic_light_paced_16x9_brand.mp4'),
 ('tl_v', f'{R}/video/out/arduino_traffic_light_paced_9x16.mp4', f'{R}/video/out/events.json', 'ar', 'v', f'{R}/video/out/arduino_traffic_light_paced_9x16_brand.mp4'),
]
SR = 44100
def run(*a): sp.run(list(a), check=True, stdout=sp.DEVNULL, stderr=sp.DEVNULL)

# ---- end-card audio: soft pad + the Arabic call-to-action (same for all videos)
def end_audio(path, dur=9.6):
    n = int(dur * SR); t = np.arange(n) / SR; pad = np.zeros(n)
    for f in (261.6, 329.6, 392.0, 523.3):
        for det in (-0.4, 0.0, 0.5): pad += np.sin(2 * np.pi * (f + det) * t) * 0.05
    env = np.minimum(1, t / 1.2) * np.minimum(1, (dur - t) / 1.2); pad *= env
    with wave.open(f'{B}/cta_voice.wav') as w: v = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float64) / 32768
    voice = np.zeros(n); i = int(0.9 * SR); voice[i:i + len(v)] += v[: n - i]
    k = int(0.15 * SR); act = np.convolve(np.abs(voice), np.ones(k) / k, mode='same'); duck = 1 - 0.6 * np.clip(act * 25, 0, 1)
    mix = pad * duck * 1.4 + voice * 1.1; mix = np.tanh(mix * 1.1) / np.tanh(1.1) * 0.85
    st = np.stack([mix, mix], 1)
    with wave.open(path, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype('<i2').tobytes())
end_audio(f'{B}/end_audio.wav')

for name, src, ev, lang, fmt, dst in JOBS:
    scenes = {s['id']: s for s in json.load(open(ev))['scenes']}; b0, b1 = scenes['B']['t0'] + 0.35, scenes['B']['t1'] - 0.2
    W, H = (1920, 1080) if fmt == 'h' else (1080, 1920)
    wmx, wmy = (f'W-w-36', 24) if fmt == 'h' else ('W-w-36', 110)
    by = 846 if fmt == 'h' else 1360
    bn = f'{B}/banner_{lang}_{fmt}.png'
    main = f'{B}/{name}_main.mp4'
    fc = (f"[1:v]scale=300:-1[wm];[0:v][wm]overlay=x={wmx}:y={wmy}[a];"
          f"[2:v]scale='min(iw,{W - 80})':-1[bn];[a][bn]overlay=x=(W-w)/2:y={by}:enable='between(t,{b0:.2f},{b1:.2f})'[v]")
    run('ffmpeg', '-y', '-i', src, '-i', f'{B}/watermark.png', '-i', bn, '-filter_complex', fc, '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', main)
    endv = f'{B}/{name}_end.mp4'
    run('ffmpeg', '-y', '-framerate', '30', '-i', f'{B}/end_{lang}_{fmt}/f%04d.jpg', '-i', f'{B}/end_audio.wav', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', '-shortest', endv)
    lst = f'{B}/{name}_list.txt'; open(lst, 'w').write(f"file '{main}'\nfile '{endv}'\n")
    run('ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', dst)
    print(name, '->', dst)
