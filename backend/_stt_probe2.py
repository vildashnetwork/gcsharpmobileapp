"""Probe: phone-style audio (M4A/AAC/WAV) -> keyless speech-to-text."""
import os
import subprocess
import tempfile

import httpx
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
WAV = os.path.join(os.environ.get("TEMP", "/tmp"), "gc_test.wav")
print("wav exists:", os.path.exists(WAV), os.path.getsize(WAV) if os.path.exists(WAV) else 0)


def transcode(src: str, fmt: str, codec_args: list) -> str:
    out = tempfile.mktemp(suffix="." + fmt)
    cmd = [FFMPEG, "-y", "-i", src, "-ac", "1", "-ar", "16000"] + codec_args + [out]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        print("  ffmpeg FAIL", r.stderr[-300:])
        return ""
    print("  ffmpeg ok ->", os.path.getsize(out), "bytes", fmt)
    return out


def google_v2(data: bytes, ctype: str, label: str):
    print(f"\n--- google v2 [{label}] ctype={ctype} ---")
    try:
        r = httpx.post(
            "https://www.google.com/speech-api/v2/recognize",
            params={"client": "chromium", "lang": "en-US", "pfilter": "0"},
            content=data,
            headers={"Content-Type": ctype},
            timeout=40,
        )
        print("  status:", r.status_code)
        print("  body:", r.text[:600])
    except Exception as e:
        print("  ERROR:", e)


if os.path.exists(WAV):
    flac = transcode(WAV, "flac", ["-f", "flac"])
    if flac:
        with open(flac, "rb") as f:
            google_v2(f.read(), "audio/x-flac; rate=16000", "flac")
    l16 = transcode(WAV, "raw", ["-f", "s16le"])
    if l16:
        with open(l16, "rb") as f:
            google_v2(f.read(), "audio/l16; rate=16000", "l16-raw")
    m4a = transcode(WAV, "m4a", ["-c:a", "aac", "-b:a", "64k", "-f", "mp4"])
    if m4a:
        with open(m4a, "rb") as f:
            google_v2(f.read(), "audio/mp4", "m4a-direct")