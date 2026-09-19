/**
 * GC AI Voice hook - talk to the AI and hear human-voice replies.
 *
 * Voice INPUT has two tiers so it works everywhere:
 *   Tier 1  expo-speech-recognition  - live streaming transcript, only
 *           available in a dev/prod build (native module).
 *   Tier 2  expo-audio recorder + POST /ai/transcribe - works in Expo Go,
 *           because expo-audio ships with the Expo Go runtime. The clip is
 *           uploaded and transcribed server-side (keyless Google Speech,
 *           with Gemini as backup), then the sentence is sent to GC AI.
 *
 * Voice OUTPUT streams the reply back as human speech: server MP3 (Gemini
 * TTS / keyless Google TTS) played through expo-audio, with the phone's
 * own expo-speech voice as a guaranteed last resort.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  useAudioPlayer,
  useAudioRecorder,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
} from "expo-audio";
import * as Speech from "expo-speech";
import { File, Directory, Paths } from "expo-file-system";
import { API_BASE, readToken } from "@/src/api";

// Graceful import: a top-level import throws at module-eval time when the
// native module is missing, crashing the ai.tsx route.
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = null;
try {
  const mod = require("expo-speech-recognition");
  ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = mod.useSpeechRecognitionEvent;
} catch { }

const VOICE_DIR = new Directory(Paths.document, "com.gcsharp/ai_voice");

/** Turns raw recogniser/OS errors into something a student can act on. */
function friendlyVoiceError(raw: any): string {
  const msg = String(raw ?? "").toLowerCase();
  if (!msg) return "I could not hear that clearly - tap the mic and try again.";
  if (msg.includes("permission") || msg.includes("denied")) {
    return "Microphone permission is off. Allow it in your phone settings, then tap the mic again.";
  }
  if (msg.includes("not available") || msg.includes("language") || msg.includes("no service")) {
    return "Your phone's speech service is unavailable, so GC AI is listening directly.";
  }
  if (msg.includes("busy") || msg.includes("in use")) {
    return "Another app is using the microphone. Close it and tap the mic again.";
  }
  if (msg.includes("no speech") || msg.includes("no match") || msg.includes("timeout")) {
    return "I did not catch that - tap the mic and speak a little closer.";
  }
  return "I could not hear that clearly - tap the mic and try again.";
}

function ensureVoiceDir() {
  try { if (!VOICE_DIR.exists) VOICE_DIR.create(); } catch {}
}

// Metering lets us stop automatically the moment the student pauses, so a
// spoken question is sent almost immediately after they finish talking.
//
// IMPORTANT: we deliberately do NOT use RecordingPresets.LOW_QUALITY. On
// Android that preset encodes AMR-NB (8 kHz narrowband .3gp), which is far
// too lossy: in a real classroom the recogniser hears nothing. We use AAC
// 16 kHz mono .m4a - small, universally decodable, and accurate enough for
// handwriting-free speech to text.
const RECORDING_OPTIONS: any = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: ".m4a",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  android: {
    ...(RecordingPresets.HIGH_QUALITY as any).android,
    extension: ".m4a",
    outputFormat: "mpeg4",
    audioEncoder: "aac",
  },
  isMeteringEnabled: true,
};

const SILENCE_DB = -40;        // below this counts as "not talking"
const SILENCE_HOLD_MS = 800;   // pause length that ends the question
const MAX_RECORD_MS = 15000;   // hard stop for a very long question
const MIN_RECORD_MS = 550;     // ignore accidental double taps
const POLL_MS = 120;           // metering poll interval
const NO_METERING_CAP_MS = 9000; // fallback stop when a device has no metering

export type VoiceState = {
  supported: boolean;
  listening: boolean;
  transcript: string;
  speaking: boolean;
  error: string | null;
  /** Live input loudness (0-1) so the UI can show the mic is hearing you. */
  micLevel: number;
  /** How long the current recording has been running, in ms. */
  recordMs: number;
};

export function useGcVoice() {
  const [state, setState] = useState<VoiceState>({
    supported: false, listening: false, transcript: "", speaking: false, error: null,
    micLevel: 0, recordMs: 0,
  });
  const [transcribing, setTranscribing] = useState(false);
  const player = useAudioPlayer(null);
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const resolvedRef = useRef<((text: string) => void) | null>(null);
  // ---- Native-streaming tier bookkeeping (so we can always fall back) ----
  // `nativeActiveRef` is true while the on-device recogniser owns the mic;
  // if it errors OR ends without a transcript we transparently continue on
  // the recorder + server tier instead of showing a dead-end error.
  const nativeActiveRef = useRef(false);
  const nativeResultRef = useRef(false);
  const startRecorderRef = useRef<(() => Promise<void>) | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const playingRef = useRef(false);
  const watchdogRef = useRef<any>(null);
  const startedAtRef = useRef(0);
  const speechSeenRef = useRef(false);
  const silenceMsRef = useRef(0);
  const finishingRef = useRef(false);
  const mountedRef = useRef(true);
  // Streaming speech: text chunks are synthesised in order and played the
  // moment each one is ready, so GC AI starts talking while it is still
  // writing the rest of the answer.
  const streamBufRef = useRef("");          // unspoken tail of the answer
  const streamChainRef = useRef<Promise<void>>(Promise.resolve());
  const spokeCountRef = useRef(0);          // sentences actually voiced this turn
  const speakGenRef = useRef(0);            // bumped to cancel stale speech

  if (useSpeechRecognitionEvent) {
    useSpeechRecognitionEvent("result", (event: any) => {
      const text = event.results?.[0]?.transcript ?? "";
      setState((s) => ({ ...s, transcript: text }));
      if (event.isFinal) {
        nativeResultRef.current = true;
        nativeActiveRef.current = false;
        // Only claim the listening state if the recorder tier is not running.
        setState((s) => ({ ...s, error: null, ...(watchdogRef.current ? {} : { listening: false }) }));
        const cb = resolvedRef.current;
        resolvedRef.current = null;
        if (text.trim() && cb) cb(text.trim());
      }
    });
    // The built-in recogniser is unavailable on plenty of Android devices
    // (no Google speech service, unsupported locale, mic busy...). Instead of
    // dead-ending with an error we silently switch to the recorder tier.
    useSpeechRecognitionEvent("error", (event: any) => {
      const wasNative = nativeActiveRef.current;
      nativeActiveRef.current = false;
      if (wasNative && resolvedRef.current) {
        setState((s) => ({ ...s, listening: false, error: null }));
        void startRecorderRef.current?.();
        return;
      }
      setState((s) => ({
        ...s, listening: false,
        error: friendlyVoiceError(event?.message ?? event?.error),
      }));
    });
    // Android frequently ends a one-shot recognition with no transcript at
    // all. That used to leave the mic looking dead - now we keep listening
    // through the recorder tier and send whatever the student says.
    useSpeechRecognitionEvent("end", () => {
      const wasNative = nativeActiveRef.current;
      nativeActiveRef.current = false;
      if (wasNative && !nativeResultRef.current && resolvedRef.current) {
        setState((s) => ({ ...s, listening: false, error: null }));
        void startRecorderRef.current?.();
        return;
      }
      // Never stomp on the recorder tier if it has already taken over.
      if (!watchdogRef.current) setState((s) => ({ ...s, listening: false }));
    });
  }

  useEffect(() => {
    mountedRef.current = true;
    if (Platform.OS === "web") return;
    // Recording is the always-available path (Expo Go included); the native
    // streaming recogniser is a bonus when the build has it.
    setState((s) => ({ ...s, supported: true }));
    setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      shouldPlayInBackground: false,
    }).catch(() => {});
    return () => {
      mountedRef.current = false;
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      try { ExpoSpeechRecognitionModule?.stop(); } catch {}
      try { recorder.stop(); } catch {}
    };
  }, [recorder]);


  const pumpQueue = useCallback(async () => {
    if (playingRef.current) return;
    const next = audioQueueRef.current.shift();
    if (!next) { setState((s) => ({ ...s, speaking: false })); return; }
    playingRef.current = true;
    try {
      player.replace(next);
      player.play();
      await new Promise<void>((resolve) => {
        const sub = (player as any).addListener("playbackStatusUpdate", (status: any) => {
          if (status?.isLoaded && status.didJustFinish) {
            sub?.remove?.();
            playingRef.current = false;
            if (audioQueueRef.current.length) pumpQueue();
            else setState((s) => ({ ...s, speaking: false }));
            resolve();
          }
        });
        setTimeout(() => { sub?.remove?.(); playingRef.current = false; resolve(); }, 20000);
      });
    } catch { playingRef.current = false; }
  }, [player]);

  const speak = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setState((s) => ({ ...s, speaking: true, error: null }));
    try {
      const token = await readToken();
      const res = await fetch(API_BASE + "/ai/voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify({ text: clean, voice: "female", lang: "en" }),
      });
      const data = await res.json();
      if (!res.ok || data.fallback || !data.audio) throw new Error("tts-unavailable");
      ensureVoiceDir();
      const ext = data.format === "wav" ? "wav" : "mp3";
      const file = new File(VOICE_DIR, "reply_" + Date.now() + "." + ext);
      file.write(data.audio, { encoding: "base64" });
      audioQueueRef.current.push(file.uri);
      pumpQueue();
      return;
    } catch {}
    try {
      Speech.stop();
      Speech.speak(clean.replace(/[#*`>|~]/g, " "), {
        language: "en", rate: 0.98, pitch: 1.0,
        onDone: () => setState((s) => ({ ...s, speaking: false })),
        onError: () => setState((s) => ({ ...s, speaking: false })),
      });
    } catch { setState((s) => ({ ...s, speaking: false })); }
  }, [pumpQueue]);

  const stopSpeaking = useCallback(() => {
    // Bump the generation so any sentence still being synthesised is dropped.
    speakGenRef.current += 1;
    streamBufRef.current = "";
    audioQueueRef.current = [];
    try { player.pause(); player.seekTo(0); } catch {}
    try { Speech.stop(); } catch {}
    playingRef.current = false;
    setState((s) => ({ ...s, speaking: false }));
  }, [player]);

  // ---- Expo Go path: record the clip, upload it, get the words back ----

  const stopWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const uploadRecording = useCallback(async (uri: string): Promise<string> => {
    const token = await readToken();
    const name = uri.split("/").pop() || "voice.m4a";
    const ext = (name.split(".").pop() || "m4a").toLowerCase();
    const mime =
      ext === "3gp" ? "audio/3gpp" :
      ext === "wav" ? "audio/wav" :
      ext === "ogg" || ext === "opus" ? "audio/ogg" : "audio/mp4";
    const form = new FormData();
    // React Native accepts a file descriptor object here and streams the file.
    form.append("file", { uri, name, type: mime } as any);
    const res = await fetch(`${API_BASE}/ai/transcribe?lang=en-US`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) return "";
    const data = await res.json().catch(() => null);
    return String(data?.text || "").trim();
  }, []);

  const finishRecording = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    stopWatchdog();
    const cb = resolvedRef.current;
    resolvedRef.current = null;
    try {
      let uri: string | null = null;
      try {
        await recorder.stop();
        uri = recorder.uri || null;
      } catch {}
      // Hand the audio session back to playback: on iOS leaving recording
      // enabled routes GC AI's voice to the quiet earpiece instead of the
      // loudspeaker.
      setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
        shouldPlayInBackground: false,
      }).catch(() => {});
      if (mountedRef.current) setState((s) => ({ ...s, listening: false, micLevel: 0, recordMs: 0 }));
      if (!uri) {
        if (mountedRef.current) {
          setState((s) => ({ ...s, error: "I could not capture that - please try again." }));
        }
        return;
      }
      if (mountedRef.current) setTranscribing(true);
      let text = "";
      try {
        text = await uploadRecording(uri);
      } catch (e: any) {
        text = "";
      }
      if (mountedRef.current) setTranscribing(false);
      if (!mountedRef.current) return;
      if (text) {
        setState((s) => ({ ...s, transcript: text, error: null }));
        if (cb) cb(text);
      } else {
        setState((s) => ({
          ...s, transcript: "",
          error: "I could not hear that clearly - tap the mic and try again.",
        }));
      }
    } finally {
      finishingRef.current = false;
    }
  }, [recorder, stopWatchdog, uploadRecording]);

  const startRecorder = useCallback(async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setState((s) => ({
        ...s, listening: false,
        error: "Microphone permission is off. Allow it in your phone settings, then tap the mic again.",
      }));
      return;
    }
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
      shouldPlayInBackground: false,
    }).catch(() => {});
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e: any) {
      setState((s) => ({
        ...s, listening: false,
        error: "I could not start the microphone. Close other apps that may be using it and try again.",
      }));
      return;
    }
    if (mountedRef.current) {
      setState((s) => ({ ...s, listening: true, error: null, micLevel: 0, recordMs: 0 }));
    }

    // Auto-send as soon as the student stops talking.
    startedAtRef.current = Date.now();
    speechSeenRef.current = false;
    silenceMsRef.current = 0;
    let meteringSeen = false;
    stopWatchdog();
    watchdogRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      if (elapsed >= MAX_RECORD_MS) { void finishRecording(); return; }

      let level: number | undefined;
      try { level = recorder.getStatus()?.metering; } catch {}
      if (typeof level === "number" && isFinite(level)) {
        meteringSeen = true;
        // dBFS (-160..0) -> 0..1 so the UI can draw a live input meter.
        const norm = Math.max(0, Math.min(1, (level + 55) / 55));
        if (mountedRef.current) {
          setState((s) => ({ ...s, micLevel: norm, recordMs: elapsed }));
        }
        if (level > SILENCE_DB) {
          speechSeenRef.current = true;
          silenceMsRef.current = 0;
        } else if (speechSeenRef.current) {
          silenceMsRef.current += POLL_MS;
          if (silenceMsRef.current >= SILENCE_HOLD_MS && elapsed >= MIN_RECORD_MS) {
            void finishRecording();
          }
        }
        return;
      }

      // Some devices expose no metering at all. Keep the clock visible and
      // stop after a short window so a spoken question is never swallowed.
      if (mountedRef.current) setState((s) => ({ ...s, recordMs: elapsed }));
      if (!meteringSeen && elapsed >= NO_METERING_CAP_MS) void finishRecording();
    }, POLL_MS);
  }, [recorder, stopWatchdog, finishRecording]);

  // The native-recogniser event handlers run before this callback exists, so
  // they reach it through a ref to fall back to the recorder tier.
  useEffect(() => {
    startRecorderRef.current = startRecorder;
  }, [startRecorder]);

  const startListening = useCallback(async (onFinalText: (text: string) => void) => {
    if (Platform.OS === "web") {
      setState((s) => ({ ...s, error: "Voice input is not supported on web yet." }));
      return;
    }
    stopSpeaking();
    resolvedRef.current = onFinalText;
    setState((s) => ({ ...s, transcript: "", error: null }));

    // Tier 1: live streaming recognition (dev/prod builds only).
    if (ExpoSpeechRecognitionModule) {
      try {
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (perm.granted) {
          nativeResultRef.current = false;
          ExpoSpeechRecognitionModule.start({
            lang: "en-US", interimResults: true, maxAlternatives: 1,
            continuous: false, requiresOnDeviceRecognition: false, addsPunctuation: true,
          });
          nativeActiveRef.current = true;
          setState((s) => ({ ...s, listening: true, error: null, micLevel: 0, recordMs: 0 }));
          return;
        }
        // Permission refused for the native tier: let the recorder tier ask
        // for it through expo-audio and report a clear message.
      } catch (e: any) {
        // fall through to the recorder tier
      }
    }

    // Tier 2: recorder + server transcription - works inside Expo Go.
    try {
      await startRecorder();
    } catch (e: any) {
      setState((s) => ({
        ...s, listening: false,
        error: e?.message ?? "Could not start voice input. Please try again.",
      }));
    }
  }, [stopSpeaking, startRecorder]);

  const stopListening = useCallback(() => {
    nativeActiveRef.current = false;
    if (ExpoSpeechRecognitionModule) {
      try { ExpoSpeechRecognitionModule.stop(); } catch {}
    }
    if (finishingRef.current) return;
    const wasRecording = !!watchdogRef.current;
    if (wasRecording) {
      void finishRecording();
      return;
    }
    resolvedRef.current = null;
    setState((s) => ({ ...s, listening: false, micLevel: 0, recordMs: 0 }));
  }, [finishRecording]);

  // ---- Streaming speech: GC AI talks while it is still writing ----
  // Every complete sentence in the incoming stream is synthesised the moment
  // it is final and queued for playback, so the student hears the first words
  // almost immediately instead of waiting for the whole answer.

  const synthSentence = useCallback(async (sentence: string, gen: number) => {
    const clean = sentence.replace(/[#*`>|~_]/g, " ").replace(/\s+/g, " ").trim();
    if (!clean || gen !== speakGenRef.current) return;
    try {
      const token = await readToken();
      const res = await fetch(API_BASE + "/ai/voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify({ text: clean, voice: "female", lang: "en" }),
      });
      const data = await res.json();
      if (gen !== speakGenRef.current) return;
      if (!res.ok || data.fallback || !data.audio) throw new Error("tts-unavailable");
      ensureVoiceDir();
      const ext = data.format === "wav" ? "wav" : "mp3";
      const file = new File(
        VOICE_DIR,
        "live_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7) + "." + ext,
      );
      file.write(data.audio, { encoding: "base64" });
      if (gen !== speakGenRef.current) return;
      audioQueueRef.current.push(file.uri);
      pumpQueue();
      spokeCountRef.current += 1;
      return;
    } catch { }
    // On-device voice keeps the conversation flowing if the server is down.
    if (gen !== speakGenRef.current) return;
    try { Speech.speak(clean, { language: "en", rate: 1.0, pitch: 1.0 }); } catch { }
    spokeCountRef.current += 1;
  }, [pumpQueue]);

  const speakStreamStart = useCallback(() => {
    speakGenRef.current += 1;
    streamBufRef.current = "";
    streamChainRef.current = Promise.resolve();
    spokeCountRef.current = 0;
    audioQueueRef.current = [];
    try { player.pause(); } catch { }
    playingRef.current = false;
    setState((s) => ({ ...s, speaking: true, error: null }));
  }, [player]);

  const speakStreamChunk = useCallback((chunk: string) => {
    if (!chunk) return;
    streamBufRef.current += chunk;
    const gen = speakGenRef.current;
    const flush = (text: string) => {
      const ready = text.trim();
      if (!ready) return;
      streamChainRef.current = streamChainRef.current.then(() => synthSentence(ready, gen));
    };

    // Favourite case: a whole sentence is final - GC AI starts talking on it.
    const bulk = streamBufRef.current;
    const parts = bulk.split(/(?<=[.!?…:])\s+/);
    if (parts.length >= 2) {
      streamBufRef.current = parts.pop() || "";
      flush(parts.join(" "));
      return;
    }

    // No sentence finished yet, but silence is not an option: once a full
    // phrase has accumulated, speak up to the last word boundary and keep the
    // unfinished word for the next chunk. This is what makes a long answer
    // start talking in well under a second instead of after the whole reply.
    if (bulk.length >= 90) {
      const cut = bulk.lastIndexOf(" ", 80);
      if (cut > 25) {
        streamBufRef.current = bulk.slice(cut + 1);
        flush(bulk.slice(0, cut));
      }
    }
  }, [synthSentence]);

  const speakStreamEnd = useCallback((fallbackText?: string) => {
    const gen = speakGenRef.current;
    const tail = streamBufRef.current.trim();
    streamBufRef.current = "";
    const spokeSomething = spokeCountRef.current > 0;
    if (tail) spokeCountRef.current += 1;
    if (tail) {
      streamChainRef.current = streamChainRef.current.then(() => synthSentence(tail, gen));
    }
    // Streaming that produced no sentence at all (for example a reply that
    // arrived in one piece) still has to be heard - read the whole text.
    const whole = String(fallbackText ?? "").trim();
    if (!spokeSomething && !tail && whole) {
      spokeCountRef.current += 1;
      streamChainRef.current = streamChainRef.current.then(() => synthSentence(whole, gen));
    }
  }, [synthSentence]);

  return {
    ...state,
    // Voice input works inside Expo Go through the recorder tier, so
    // `supported` no longer depends on the native streaming recogniser.
    supported: state.supported,
    voiceSupported: state.supported,
    transcribing,
    speak, stopSpeaking, startListening, stopListening,
    speakStreamStart, speakStreamChunk, speakStreamEnd,
  };
};