import base64
import json
import struct
import httpx

raw = open("_sample.wav", "rb").read()
# strip 44-byte canonical WAV header -> raw PCM s16le
pcm = raw[44:]
print("wav bytes", len(raw), "pcm bytes", len(pcm))

CHROME_KEY = "AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw"

TESTS = [
    ("google-v2-l16", "https://www.google.com/speech-api/v2/recognize",
     {"output": "json", "lang": "en-US", "key": CHROME_KEY, "client": "chromium"},
     "audio/l16; rate=16000", pcm),
    ("google-v2-l16-alt", "https://www.google.com/speech-api/v2/recognize",
     {"output": "json", "lang": "en-US", "key": CHROME_KEY},
     "audio/l16; rate=16000", pcm),
    ("google-v1-free", "https://www.google.com/speech-api/v1/recognize",
     {"xjerr": "1", "client": "chromium", "lang": "en-US"},
     "audio/x-flac; rate=16000", pcm),
]

for name, url, params, ctype, body in TESTS:
    try:
        r = httpx.post(url, params=params, content=body,
                       headers={"Content-Type": ctype,
                                "User-Agent": "Mozilla/5.0"},
                       timeout=25)
        print("=" * 60)
        print(name, "->", r.status_code)
        print(r.text[:600])
    except Exception as e:
        print("=" * 60)
        print(name, "ERROR", type(e).__name__, e)
