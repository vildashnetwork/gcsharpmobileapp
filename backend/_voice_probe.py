"""Live probe: which keyless STT (speech-to-text) services actually work?

We test every candidate so GC AI voice input can work in Expo Go,
where the native expo-speech-recognition module cannot be loaded.
"""
import base64
import json
import os

import httpx

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE = os.path.join(HERE, "tts_ggl.mp3")
b64 = base64.b64encode(open(SAMPLE, "rb").read()).decode()
print("sample mp3 bytes:", len(b64) * 3 // 4)


def show(name, r):
    body = (r.text or "")[:300].replace("\n", " ")
    print(f"[{name}] status={r.status_code} body={body}")


print("\n--- 1. Pollinations model list ---")
try:
    r = httpx.get("https://text.pollinations.ai/models", timeout=30)
    try:
        models = json.loads(r.text)
        names = [m.get("name") for m in models] if isinstance(models, list) else models
        print("models:", names)
    except Exception:
        show("models-raw", r)
except Exception as e:
    print("models FAILED:", type(e).__name__, e)

print("\n--- 2. Pollinations /openai chat with input_audio (whisper) ---")
for model in ("openai-audio", "whisper", "whisper-1"):
    try:
        r = httpx.post(
            "https://text.pollinations.ai/openai",
            json={
                "model": model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Transcribe this audio exactly."},
                            {
                                "type": "input_audio",
                                "input_audio": {"data": b64, "format": "mp3"},
                            },
                        ],
                    }
                ],
            },
            timeout=90,
        )
        show(f"pollinations/{model}", r)
    except Exception as e:
        print(f"pollinations/{model} FAILED:", type(e).__name__, e)

print("\n--- 3. Pollinations /v1/audio/transcriptions ---")
try:
    r = httpx.post(
        "https://text.pollinations.ai/v1/audio/transcriptions",
        files={"file": ("a.mp3", open(SAMPLE, "rb"), "audio/mpeg")},
        data={"model": "whisper-1"},
        timeout=90,
    )
    show("pollinations-transcriptions", r)
except Exception as e:
    print("pollinations-transcriptions FAILED:", type(e).__name__, e)

print("\n--- 4. Pollinations GET /{prompt}?model=openai-audio (TTS sanity) ---")
try:
    r = httpx.get(
        "https://text.pollinations.ai/Hello%20there?model=openai-audio&voice=alloy",
        timeout=90,
    )
    print("tts status:", r.status_code, "bytes:", len(r.content),
          "ctype:", r.headers.get("content-type"))
except Exception as e:
    print("tts FAILED:", type(e).__name__, e)