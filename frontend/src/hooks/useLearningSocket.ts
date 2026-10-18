/**
 * Realtime learning channel (Phase 5) — connects to /api/ws/learning.
 *
 * One socket per mounted screen tree; auto-reconnects with backoff.
 * JSON events emitted by the backend:
 *  <- ready | replay (missed events after reconnect)
 *  <- feed:new_post | feed:new_comment | ai_answer | video_progress |
 *     video_ready | notification | pong
 *  -> ping (keep-alive)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, readToken } from "@/src/api";

export type LearningEvent = {
  event_id?: string;
  type: string;
  topic?: string;
  payload?: Record<string, any>;
  created_at?: string;
  // replay envelope
  events?: LearningEvent[];
};

function wsBase(): string {
  const http = API_BASE.replace(/\/api\/?$/, "");
  if (http.startsWith("https://")) return "wss://" + http.slice("https://".length);
  if (http.startsWith("http://")) return "ws://" + http.slice("http://".length);
  return http.replace(/^http/, "ws");
}

export function useLearningSocket(onEvent: (e: LearningEvent) => void) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const retryRef = useRef(0);
  const closedRef = useRef(false);
  const attemptRef = useRef(0);
  // Remember the last event time so reconnects can replay what we missed.
  const lastEventAtRef = useRef<string | null>(
    typeof localStorage !== "undefined"
      ? localStorage.getItem("gc_learning_last_event_at")
      : null
  );

  const send = useCallback((payload: Record<string, any>) => {
    const ws = wsRef.current;
    try {
      // @ts-ignore - RN WebSocket exposes readyState like the web spec.
      if (!ws || ws.readyState !== 1) return false;
      ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }, []);

  const reconnect = useCallback(() => {
    retryRef.current = 0;
    try { wsRef.current?.close(); } catch {}
  }, []);

  useEffect(() => {
    closedRef.current = false;
    let timer: any = null;
    let pingTimer: any = null;

    const connect = async () => {
      const attempt = ++attemptRef.current;
      try {
        const token = await readToken();
        if (attempt !== attemptRef.current || closedRef.current) return;
        if (!token) {
          retryRef.current += 1;
          timer = setTimeout(connect, Math.min(2000 * retryRef.current, 8000));
          return;
        }
        const since = lastEventAtRef.current
          ? `&since=${encodeURIComponent(lastEventAtRef.current)}`
          : "";
        const url = `${wsBase()}/api/ws/learning?token=${encodeURIComponent(token)}${since}`;
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          retryRef.current = 0;
          pingTimer = setInterval(() => send({ type: "ping" }), 25000);
        };
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data as string);
            if (data?.type === "replay" && Array.isArray(data.events)) {
              data.events.forEach((e: LearningEvent) =>
                handlerRef.current?.(e));
              return;
            }
            if (data?.created_at) {
              lastEventAtRef.current = data.created_at;
              if (typeof localStorage !== "undefined")
                localStorage.setItem("gc_learning_last_event_at", data.created_at);
            }
            handlerRef.current?.(data as LearningEvent);
          } catch {}
        };
        ws.onerror = () => { try { ws.close(); } catch {} };
        ws.onclose = () => {
          setConnected(false);
          if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
          if (closedRef.current) return;
          retryRef.current += 1;
          timer = setTimeout(connect, Math.min(2000 * retryRef.current, 10000));
        };
      } catch {
        retryRef.current += 1;
        timer = setTimeout(connect, Math.min(2000 * retryRef.current, 10000));
      }
    };

    connect();
    return () => {
      closedRef.current = true;
      if (timer) clearTimeout(timer);
      if (pingTimer) clearInterval(pingTimer);
      try { wsRef.current?.close(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connected, send, reconnect };
}
