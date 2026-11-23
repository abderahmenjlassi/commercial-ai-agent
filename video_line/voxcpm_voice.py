#!/usr/bin/env python3
"""Natural Arabic voice-over with VoxCPM2 (OpenBMB, open source) running on CPU.
 1) Voice Design: one narrator voice is created from a text description (a1 sentence) -> reference clip
 2) every other sentence is synthesised with that reference (cloning) so the voice stays identical
Run with the venv that has voxcpm installed:  /home/user/vox_env/venv/bin/python voxcpm_voice.py"""
import json, os, re, subprocess as sp, time, shutil
import numpy as np, soundfile as sf, torch
from voxcpm import VoxCPM
torch.set_num_threads(4)
MODEL = os.environ.get('VOXCPM2_DIR', '/home/user/vox_env/VoxCPM2')
DESIGN = "(A warm, calm, friendly adult male narrator with a clear, natural Arabic voice, relaxed and engaging pace, like a kind teacher explaining to teenagers)"
strip = lambda s: re.sub(r'[ً-ْٰـ]', '', s)            # natural, un-vocalised Arabic text works best
nar = {k: strip(v) for k, v in json.load(open('narration_ar.json')).items()}
nar['cta'] = "كل هذه المكونات متوفرة في موقعنا Tunisian Smart Innovation. اشترها، وابن مشروعك بنفسك."
os.makedirs('out/voice', exist_ok=True); os.makedirs('out/voice_kareem', exist_ok=True)
for f in os.listdir('out/voice'):
    if f.endswith('.wav') and not os.path.exists('out/voice_kareem/' + f): shutil.copy('out/voice/' + f, 'out/voice_kareem/' + f)
model = VoxCPM.from_pretrained(MODEL, load_denoiser=False, optimize=False, device='cpu', local_files_only=True)
SR = model.tts_model.sample_rate
def post(raw, dst):   # trim silence, gentle clean-up and loudness match; mono 44.1 kHz
    sp.run(['ffmpeg', '-y', '-v', 'error', '-i', raw, '-af', 'highpass=f=70,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,loudnorm=I=-17:TP=-2:LRA=9', '-ar', '44100', '-ac', '1', dst], check=True)
CLONE = os.environ.get('VOX_REF')            # path of a real voice sample -> clone that voice (no transcript needed)
ref = CLONE or 'out/voice_ref.wav'; ref_text = nar['a1']
if not CLONE and not os.path.exists(ref):
    torch.manual_seed(42); t = time.time()
    w = model.generate(text=DESIGN + ref_text, cfg_value=2.0, inference_timesteps=10)
    sf.write('out/_ref_raw.wav', w, SR); post('out/_ref_raw.wav', ref); os.remove('out/_ref_raw.wav'); print('reference voice', round(time.time() - t), 's', flush=True)
ONLY = os.environ.get('ONLY'); dur = json.load(open('out/voice.json')) if ONLY else {}; ids = [i for i in nar if (not ONLY or i in ONLY.split(','))]
for bid in ids:
    n = list(nar).index(bid)
    t = time.time(); torch.manual_seed(1000 + n)
    w = (model.generate(text=nar[bid], reference_wav_path=ref, cfg_value=2.0, inference_timesteps=10) if CLONE else
         model.generate(text=nar[bid], prompt_wav_path=ref, prompt_text=ref_text, reference_wav_path=ref, cfg_value=2.0, inference_timesteps=10))
    raw = f'out/_raw_{bid}.wav'; sf.write(raw, w, SR); post(raw, f'out/voice/{bid}.wav'); os.remove(raw)
    info = sf.info(f'out/voice/{bid}.wav'); dur[bid] = round(info.frames / info.samplerate, 2)
    print(bid, dur[bid], 's  (', round(time.time() - t), 's to generate )', flush=True)
json.dump(dur, open('out/voice.json', 'w'))
