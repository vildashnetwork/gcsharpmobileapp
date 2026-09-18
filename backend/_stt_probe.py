import subprocess
import imageio_ffmpeg
import httpx

FF = imageio_ffmpeg.get_ffmpeg_exe()
print("ffmpeg:", FF)


def run(args):
    return subprocess.run([FF, "-y", "-hide_banner", "-loglevel", "error", *args],
                          capture_output=True)


# 1. Simulate the phone: encode our WAV as AAC/M4A (what Android+iOS record)
r = run(["-i", "_sample.wav", "-c:a", "aac", "-b:a", "64k", "-f", "mp4", "_sample.m4a"])
print("m4a encode:", r.returncode, r.stderr.decode()[:200])

# 2. Decode that M4A back to raw PCM 16k mono s16le (server-side transcode)
r = run(["-i", "_sample.m4a", "-ar", "16000", "-ac", "1", "-f", "s16le",
         "-acodec", "pcm_s16le", "_sample.pcm"])
print("pcm decode:", r.returncode, r.stderr.decode()[:200])
pcm = open("_sample.pcm", "rb").read()
print("pcm bytes:", len(pcm))

CHROME_KEY = "AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw"


def google_stt(body, ctype, key=CHROME_KEY):
    return httpx.post(
        "https://www.google.com/speech-api/v2/recognize",
        params={"output": "json", "lang": "en-US", "key": key, "client": "chromium"},
        content=body,
        headers={"Content-Type": ctype, "User-Agent": "Mozilla/5.0"},
        timeout=25,
    )


print("=" * 60)
resp = google_stt(pcm, "audio/l16; rate=16000")
print("M4A->PCM path:", resp.status_code)
print(resp.text[:500])

# 3. AMR-WB shortcut (Android MediaRecorder native encoder, no transcode)
r = run(["-i", "_sample.wav", "-ar", "16000", "-ac", "1", "-c:a", "libopencore_amrwb",
         "-f", "amrwb", "_sample.amrwb"])
print("=" * 60)
print("amrwb encode rc:", r.returncode, r.stderr.decode()[:150])
try:
    amr = open("_sample.amrwb", "rb").read()
    print("amrwb bytes:", len(amr))
    resp = google_stt(amr, "audio/amr-wb; rate=16000")
    print("AMR-WB path:", resp.status_code)
    print(resp.text[:400])
except Exception as e:
    print("amrwb skip:", e)

# 4. Ogg/Opus shortcut (Android webm/opus encoder, no transcode)
r = run(["-i", "_sample.wav", "-ar", "16000", "-ac", "1", "-c:a", "libopus",
         "-b:a", "32k", "-f", "ogg", "_sample.ogg"])
print("=" * 60)
print("ogg encode rc:", r.returncode, r.stderr.decode()[:150])
try:
    ogg = open("_sample.ogg", "rb").read()
    print("ogg bytes:", len(ogg))
    resp = google_stt(ogg, "audio/ogg; codecs=opus")
    print("OGG/OPUS path:", resp.status_code)
    print(resp.text[:400])
except Exception as e:
    print("ogg skip:", e)
