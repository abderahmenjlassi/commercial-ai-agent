#!/usr/bin/env python3
"""Human-quality Arabic voice-over with ElevenLabs (run once the API key is available).
 - reads narration_ar.json (one sentence per beat), writes out/voice/<beat>.wav (same names the mixer already uses)
 - reports shots whose voice is longer than the planned slot (those need a longer shot -> re-render)
Usage:  ELEVEN_API_KEY=... python3 eleven_voice.py [VOICE_ID]
(If the key is injected by the network proxy, any dummy value works.)"""
import json, os, sys, subprocess as sp, urllib.request
KEY = os.environ.get('ELEVEN_API_KEY', 'dummy')
VOICE = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('ELEVEN_VOICE_ID', '')   # pick an Arabic voice in the ElevenLabs library
assert VOICE, 'give a VOICE_ID (an Arabic voice from your ElevenLabs voice library)'
nar = json.load(open('narration_ar.json')); beats = {b['id']: b for b in json.load(open('out/beats.json'))}
os.makedirs('out/voice', exist_ok=True); over = {}
for bid, text in nar.items():
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}?output_format=mp3_44100_128',
        data=json.dumps({'text': text, 'model_id': 'eleven_multilingual_v2', 'language_code': 'ar',
                         'voice_settings': {'stability': 0.45, 'similarity_boost': 0.8, 'style': 0.25, 'use_speaker_boost': True}}).encode(),
        headers={'xi-api-key': KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
    mp3 = f'out/voice/{bid}.mp3'; open(mp3, 'wb').write(urllib.request.urlopen(req, timeout=120).read())
    sp.run(['ffmpeg', '-y', '-v', 'error', '-i', mp3, '-af', 'loudnorm=I=-17:TP=-2:LRA=7', '-ar', '22050', '-ac', '1', f'out/voice/{bid}.wav'], check=True); os.remove(mp3)
    d = float(sp.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f'out/voice/{bid}.wav'], capture_output=True, text=True).stdout)
    if d > beats[bid]['nd'] - 0.1: over[bid] = round(d - beats[bid]['nd'] + 0.1, 2)
print('done; shots too short for the new voice (seconds missing):', over or 'none')
