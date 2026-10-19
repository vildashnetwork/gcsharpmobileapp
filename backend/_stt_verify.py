"""Live verify: phone M4A -> ffmpeg FLAC 16k -> keyless Google STT transcript."""
import os
import subprocess
import tempfile

import httpx
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "_sample.m4a")
print("source:", SRC, os.path.exists(SRC), os.path.getsize(SRC) if os.path.exists(SRC) else 0)

PUBLIC_KEY = "AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"


def to_flac(src: str) -> bytes:
    out = tempfile.mktemp(suffix=".flac")
    cmd = [FFMPEG, "-y", "-i", src, "-ac", "1", "-ar", "16000", "-f", "flac", out]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        print("ffmpeg FAIL", r.stderr[-400:])
        return b""
    data = open(out, "rb").read()
    print("flac bytes:", len(data))
    return data


flac = to_flac(SRC)
if flac:
    r = httpx.post(
        "https://www.google.com/speech-api/v2/recognize",
        params={"client": "chromium", "lang": "en-US",
                "key": PUBLIC_KEY, "pfilter": "0"},
        content=flac,
        headers={"Content-Type": "audio/x-flac; rate=16000", "User-Agent": UA},
        timeout=45,
    )
    print("status:", r.status_code)
    for line in r.text.splitlines():
        if line.strip():
            print("line:", line[:400])
