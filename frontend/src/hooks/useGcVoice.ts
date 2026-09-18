/**
 * GC AI Voice hook - talk to the AI and hear human-voice replies.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
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

function ensureVoiceDir() {
  try { if (!VOICE_DIR.exists) VOICE_DIR.create(); } catch {}
}

export type VoiceState = {
  supported: boolean;
  listening: boolean;
  transcript: string;
  speaking: boolean;
  error: string | null;
};

export function useGcVoice() {
  const [state, setState] = useState<VoiceState>({
    supported: false, listening: false, transcript: "", speaking: false, error: null,
  });
  const player = useAudioPlayer(null);
  const resolvedRef = useRef<((text: string) => void) | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const playingRef = useRef(false);

  if (useSpeechRecognitionEvent) {
    useSpeechRecognitionEvent("result", (event: any) => {
      const text = event.results?.[0]?.transcript ?? "";
      setState((s) => ({ ...s, transcript: text }));
      if (event.isFinal) {
        setState((s) => ({ ...s, listening: false }));
        const cb = resolvedRef.current;
        resolvedRef.current = null;
        if (text.trim() && cb) cb(text.trim());
      }
    });
    useSpeechRecognitionEvent("error", (event: any) => {
      setState((s) => ({ ...s, listening: false,
        error: event.message ?? event.error ?? "Voice recognition error.",
      }));
    });
    useSpeechRecognitionEvent("end", () => {
      setState((s) => ({ ...s, listening: false }));
    });
  }

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!ExpoSpeechRecognitionModule) return;
    ExpoSpeechRecognitionModule.getStateAsync()
      .then((st: string) => setState((s) => ({ ...s, supported: st !== "inactive" })))
      .catch(() => setState((s) => ({ ...s, supported: false })));
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
    return () => { try { ExpoSpeechRecognitionModule.stop(); } catch {} };
  }, []);


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
    audioQueueRef.current = [];
    try { player.pause(); player.seekTo(0); } catch {}
    try { Speech.stop(); } catch {}
    playingRef.current = false;
    setState((s) => ({ ...s, speaking: false }));
  }, [player]);

  const startListening = useCallback(async (onFinalText: (text: string) => void) => {
    if (Platform.OS === "web") {
      setState((s) => ({ ...s, error: "Voice input is not supported on web yet." }));
      return;
    }
    if (!ExpoSpeechRecognitionModule) {
      setState((s) => ({ ...s, error: "Voice input is not available in this build." }));
      return;
    }
    stopSpeaking();
    resolvedRef.current = onFinalText;
    setState((s) => ({ ...s, transcript: "", error: null }));
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setState((s) => ({ ...s, error: "Microphone permission denied." }));
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: "en-US", interimResults: true, maxAlternatives: 1,
        continuous: false, requiresOnDeviceRecognition: false, addsPunctuation: true,
      });
      setState((s) => ({ ...s, listening: true }));
    } catch (e: any) {
      setState((s) => ({ ...s, listening: false, error: e?.message ?? "Could not start voice recognition." }));
    }
  }, [stopSpeaking]);

  const stopListening = useCallback(() => {
    if (ExpoSpeechRecognitionModule) { try { ExpoSpeechRecognitionModule.stop(); } catch {} }
    resolvedRef.current = null;
    setState((s) => ({ ...s, listening: false }));
  }, []);

  return {
    ...state,
    supported: state.supported && !!ExpoSpeechRecognitionModule,
    voiceSupported: !!ExpoSpeechRecognitionModule,
    speak, stopSpeaking, startListening, stopListening,
  };
};