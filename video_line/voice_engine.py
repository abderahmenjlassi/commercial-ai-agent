import ctypes, json, numpy as np, wave, sys
import espeakng_loader, onnxruntime as ort
import os
D = os.environ.get('PIPER_AR_DIR', '/tmp/tts/vits-piper-ar_JO-kareem-medium')
cfg = json.load(open(f'{D}/ar_JO-kareem-medium.onnx.json'))
idmap = cfg['phoneme_id_map']; inf = cfg['inference']
lib = ctypes.cdll.LoadLibrary(espeakng_loader.get_library_path())
lib.espeak_Initialize.restype = ctypes.c_int
lib.espeak_TextToPhonemes.restype = ctypes.c_char_p
assert lib.espeak_Initialize(2, 0, espeakng_loader.get_data_path().encode(), 0) > 0
lib.espeak_SetVoiceByName(b'ar')
sess = ort.InferenceSession(f'{D}/ar_JO-kareem-medium.onnx', providers=['CPUExecutionProvider'])

def phonemes(text):
    out = []
    buf = ctypes.c_char_p(text.encode('utf-8'))
    ptr = ctypes.cast(ctypes.pointer(buf), ctypes.POINTER(ctypes.c_void_p))
    p = ctypes.c_char_p(text.encode('utf-8')); addr = ctypes.c_void_p(ctypes.cast(p, ctypes.c_void_p).value)
    holder = ctypes.pointer(addr)
    while addr.value:
        r = lib.espeak_TextToPhonemes(ctypes.byref(addr), 1, 0x02)   # UTF-8 chars -> IPA
        if r: out.append(r.decode('utf-8'))
    return ' '.join(out)

def synth(text, length_scale=None, noise_scale=None, noise_w=None):
    ph = phonemes(text)
    ids = [1, 0]
    for ch in ph:
        if ch in idmap: ids += [idmap[ch][0], 0]
    ids.append(2)
    x = np.array([ids], dtype=np.int64)
    sc = np.array([noise_scale or inf['noise_scale'], length_scale or inf['length_scale'], noise_w or inf['noise_w']], dtype=np.float32)
    y = sess.run(None, {'input': x, 'input_lengths': np.array([x.shape[1]], dtype=np.int64), 'scales': sc})[0]
    return y.squeeze().astype(np.float32), ph

if __name__ == '__main__':
    a, ph = synth(sys.argv[1] if len(sys.argv) > 1 else 'مرحباً بكم! سنصنع روبوتاً يتبع الخط باستخدام الأردوينو.')
    print(ph); print(len(a) / 22050, 's')
    w = wave.open('/tmp/tts/test.wav', 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050); w.writeframes((a * 32767).clip(-32768, 32767).astype('<i2').tobytes()); w.close()
