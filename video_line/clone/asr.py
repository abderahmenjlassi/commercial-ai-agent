import torch, time, json, sys
from transformers import pipeline
t = time.time()
asr = pipeline('automatic-speech-recognition', model='openai/whisper-medium', torch_dtype=torch.float32, device='cpu')
print('loaded', round(time.time() - t), 's', flush=True)
out = asr('/home/user/commercial-ai-agent/video_line/clone/sample16.wav', return_timestamps=True, generate_kwargs={'task': 'transcribe'})
print(json.dumps(out, ensure_ascii=False, indent=1))
