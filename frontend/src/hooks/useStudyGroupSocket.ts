/**
 * Realtime study-group channel (WebSocket over TCP).
 * One socket per open chat screen; auto-reconnects with backoff.
 * JSON events mirror POST /api/ws/study-groups/{id}:
 *  -> ping | typing | send | ask_ai
 *  <- ready | message | ai_typing | typing | presence | member_* |
 *     join_request | request_decided | group_updated | group_deleted | error
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, readToken } from "@/src/api";

export type GroupMessage = {
  message_id: string;
  group_id: string;
  kind: "text" | "voice" | "paper" | "highlight" | "question" | "ai_answer";
  sender_id: string;
  sender_name: string;
  sender_photo?: string | null;
  text: string;
  meta?: Record<string, any>;
  created_at: string;
  ai_source?: string;
  ai_learned?: boolean;
};

export type GroupEvent =
  | { type: "ready"; group: any; online_count: number }
  | { type: "message"; message: GroupMessage }
  | { type: "ai_typing"; typing: boolean; question?: string }
  | { type: "typing"; user_id: string; full_name: string; typing: boolean }
  | { type: "presence"; user_id: string; online_count: number }
  | { type: "member_joined"; member: any; group: any }
  | { type: "member_left"; user_id: string }
  | { type: "join_request"; request: any }
  | { type: "request_decided"; request_id: string; action: string }
  | { type: "group_updated"; group: any }
  | { type: "group_deleted"; group_id: string }
  | { type: "error"; message: string };

function wsBase(): string {
  const http = API_BASE.replace(/\/api\/?$/, "");
  if (http.startsWith("https://")) return "wss://" + http.slice("https://".length);
  if (http.startsWith("http://")) return "ws://" + http.slice("http://".length);
  return http.replace(/^http/, "ws");
}

export function useStudyGroupSocket(groupId: string | undefined,
                                    onEvent: (e: GroupEvent) => void) {
  const [connected, setConnected] = useState(false);
  const [sockError, setSockError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const retryRef = useRef(0);
  const closedRef = useRef(false);
  const attemptRef = useRef(0);

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
    if (!groupId) return;
    closedRef.current = false;
    let timer: any = null;
    let pingTimer: any = null;

    const connect = async () => {
      const attempt = ++attemptRef.current;
      try {
        const token = await readToken();
        if (attempt !== attemptRef.current || closedRef.current) return;
        if (!token) {
          setSockError("Sign-in expired - reconnecting…");
          retryRef.current += 1;
          timer = setTimeout(connect, Math.min(2000 * retryRef.current, 8000));
          return;
        }
        setSockError(null);
        const url = `${wsBase()}/api/ws/study-groups/${groupId}`
          + `?token=${encodeURIComponent(token)}`;
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onopen = () => {
          retryRef.current = 0;
          setConnected(true);
          pingTimer = setInterval(() => {
            try { ws.send(JSON.stringify({ type: "ping" })); } catch {}
          }, 25000);
        };
        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(String(msg.data));
            handlerRef.current(data as GroupEvent);
          } catch {}
        };
        ws.onerror = () => { try { ws.close(); } catch {} };
        ws.onclose = (ev: any) => {
          setConnected(false);
          if (pingTimer) clearInterval(pingTimer);
          if (wsRef.current === ws) wsRef.current = null;
          if (closedRef.current) return;
          // 1008 = policy violation: bad/expired token, not a member, or
          // group gone. Retrying forever just burns battery and leaves the
          // header stuck on "reconnecting" - surface it instead.
          const code = typeof ev?.code === "number" ? ev.code : 0;
          if (code === 1008) {
            setSockError("Live chat unavailable (signed out or not a member). Messages still send.");
            return;
          }
          retryRef.current += 1;
          const wait = Math.min(1000 * retryRef.current, 8000);
          timer = setTimeout(connect, wait);
        };
      } catch {
        retryRef.current += 1;
        timer = setTimeout(connect, Math.min(1000 * retryRef.current, 8000));
      }
    };
    connect();
    return () => {
      closedRef.current = true;
      if (timer) clearTimeout(timer);
      if (pingTimer) clearInterval(pingTimer);
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [groupId]);

  return { connected, send, sockError, reconnect };
}
