"""Probe 3: find the working keyless speech-to-text endpoint."""
import os
import subprocess
import tempfile

import httpx
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
WAV = os.path.join(os.environ.get("TEMP", "/tmp"), "gc_test.wav")

PUBLIC_CHROME_KEY = "AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw"


def transcode(src, fmt, codec_args):
    out = tempfile.mktemp(suffix="." + fmt)
    r = subprocess.run(
        [FFMPEG, "-y", "-i", src, "-ac", "1", "-ar", "16000"] + codec_args + [out],
        capture_output=True,
    )
    return out if r.returncode == 0 else ""


flac = transcode(WAV, "flac", ["-f", "flac"])
data = open(flac, "rb").read()
print("flac bytes:", len(data))

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"


def attempt(name, url, params, ctype="audio/x-flac; rate=16000"):
    print(f"\n=== {name} ===")
    try:
        r = httpx.post(url, params=params, content=data,
                       headers={"Content-Type": ctype, "User-Agent": UA}, timeout=45)
        body = r.text
        print("status:", r.status_code, "| len:", len(body))
        print("body:", body[:500].replace("\n", " "))
    except Exception as e:
        print("ERR:", e)


attempt("v2 + public chrome key", "https://www.google.com/speech-api/v2/recognize",
        {"client": "chromium", "lang": "en-US", "key": PUBLIC_CHROME_KEY, "pfilter": "0"})

attempt("v1 xjerr", "https://www.google.com/speech-api/v1/recognize",
        {"xjerr": "1", "client": "chromium", "lang": "en-US", "maxresults": "1"})

attempt("v2 + key + pfilter only", "http://www.google.com/speech-api/v2/recognize",
        {"client": "chromium", "lang": "en-US", "key": PUBLIC_CHROME_KEY})

attempt("v2 + key on speech.googleapis", "https://speech.googleapis.com/v2/recognize",
        {"key": PUBLIC_CHROME_KEY})