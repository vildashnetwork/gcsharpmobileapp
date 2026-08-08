import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { api, setToken } from "./api";

WebBrowser.maybeCompleteAuthSession();

export type User = {
  user_id: string;
  email: string;
  full_name: string;
  role: "student" | "teacher" | "admin";
  profile_photo?: string | null;
  onboarded?: boolean;
  exam_level?: string | null;
  xp?: number;
  level?: number;
  streak?: number;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, role: "student" | "teacher") => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);
const processedSessions = new Set<string>();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: User }>("/auth/me");
      setUser(r.user);
    } catch {
      setUser(null);
      await setToken(null);
    }
  }, []);

  const exchangeSessionId = useCallback(async (sid: string) => {
    if (processedSessions.has(sid)) return;
    processedSessions.add(sid);
    try {
      const r = await api<{ session_token: string; user: User }>("/auth/session", {
        method: "POST",
        body: { session_id: sid },
        auth: false,
      });
      await setToken(r.session_token);
      setUser(r.user);
    } catch (e) {
      console.warn("Google exchange failed", e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      // Web: check URL fragment/query for session_id
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const hash = window.location.hash || "";
        const search = window.location.search || "";
        const m = (hash + "&" + search).match(/[?#&]session_id=([^&#]+)/);
        if (m) {
          await exchangeSessionId(decodeURIComponent(m[1]));
          try {
            window.history.replaceState(window.history.state, "", window.location.pathname);
          } catch {}
          setLoading(false);
          return;
        }
      }
      // Mobile: cold start deep link
      if (Platform.OS !== "web") {
        try {
          const initial = await Linking.getInitialURL();
          if (initial) {
            const m = initial.match(/[?#&]session_id=([^&#]+)/);
            if (m) {
              await exchangeSessionId(decodeURIComponent(m[1]));
              setLoading(false);
              return;
            }
          }
        } catch {}
      }
      await refresh();
      setLoading(false);
    })();

    // Mobile: hot deep link
    const sub = Linking.addEventListener("url", ({ url }) => {
      const m = url.match(/[?#&]session_id=([^&#]+)/);
      if (m) exchangeSessionId(decodeURIComponent(m[1]));
    });
    return () => sub.remove();
  }, [refresh, exchangeSessionId]);

  const login = async (email: string, password: string) => {
    const r = await api<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    await setToken(r.token);
    setUser(r.user);
  };

  const register = async (email: string, password: string, name: string, role: "student" | "teacher") => {
    const r = await api<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: { email, password, full_name: name, role },
      auth: false,
    });
    await setToken(r.token);
    setUser(r.user);
  };

  const loginWithGoogle = async () => {
    const redirect = Platform.OS === "web"
      ? (typeof window !== "undefined" ? window.location.origin + "/" : "")
      : Linking.createURL("");
    const url = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.location.href = url;
      return;
    }
    let capturedUrl: string | null = null;
    const listener = Linking.addEventListener("url", ({ url: u }) => {
      capturedUrl = u;
    });
    try {
      const result = await WebBrowser.openAuthSessionAsync(url, redirect);
      let finalUrl: string | null = null;
      if (result.type === "success" && "url" in result && result.url) finalUrl = result.url;
      if (!finalUrl && capturedUrl) finalUrl = capturedUrl;
      if (!finalUrl) {
        try { finalUrl = await Linking.getInitialURL(); } catch {}
      }
      if (finalUrl) {
        const m = finalUrl.match(/[?#&]session_id=([^&#]+)/);
        if (m) await exchangeSessionId(decodeURIComponent(m[1]));
      }
    } finally {
      listener.remove();
    }
  };

  const logout = async () => {
    await setToken(null);
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, loginWithGoogle, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}
