import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { api, setToken, readToken } from "./api";

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
  loadProgress: number; // 0-100 percentage
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, role: "student" | "teacher") => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setSession: (token: string, user: User) => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);
const processedSessions = new Set<string>();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const router = useRouter();
  const segments = useSegments();

  // Helper to update progress
  const updateProgress = (value: number) => {
    setLoadProgress(Math.min(100, Math.max(0, value)));
  };

  const refresh = useCallback(async () => {
    try {
      updateProgress(60);
      const token = await readToken();
      if (!token) {
        console.log("No token found, skipping refresh");
        setUser(null);
        updateProgress(100);
        return;
      }
      updateProgress(70);
      const r = await api<{ user: User }>("/auth/me");
      setUser(r.user);
      console.log("User refreshed:", r.user);
      updateProgress(100);
    } catch (error) {
      console.log("Refresh failed:", error);
      setUser(null);
      await setToken(null);
      updateProgress(100);
    }
  }, []);

  const setSession = useCallback(async (token: string, user: User) => {
    console.log("Setting session from external auth");
    updateProgress(50);
    await setToken(token);
    setUser(user);
    console.log("Session set successfully");
    updateProgress(100);
  }, []);

  const exchangeSessionId = useCallback(async (sid: string) => {
    console.log("Exchanging session ID:", sid);
    if (processedSessions.has(sid)) {
      console.log("Session already processed:", sid);
      return;
    }
    processedSessions.add(sid);
    updateProgress(30);
    try {
      const r = await api<{ session_token: string; user: User }>("/auth/session", {
        method: "POST",
        body: { session_id: sid },
        auth: false,
      });
      updateProgress(70);
      await setToken(r.session_token);
      setUser(r.user);
      console.log("User set:", r.user.full_name);
      updateProgress(100);
    } catch (e) {
      console.error("Google exchange failed:", e);
      processedSessions.delete(sid);
      updateProgress(100);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const initAuth = async () => {
      try {
        updateProgress(10);
        // Web & mobile deep‑link handling
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const hash = window.location.hash || "";
          const search = window.location.search || "";
          const combined = hash + search;
          const m = combined.match(/[?#&]session_id=([^&#]+)/);
          if (m) {
            await exchangeSessionId(decodeURIComponent(m[1]));
            try {
              window.history.replaceState(window.history.state, "", window.location.pathname);
            } catch { }
            if (mounted) {
              setLoading(false);
              updateProgress(100);
            }
            return;
          }
        }

        updateProgress(20);
        if (Platform.OS !== "web") {
          const initial = await Linking.getInitialURL();
          if (initial) {
            const m = initial.match(/[?#&]session_id=([^&#]+)/);
            if (m) {
              await exchangeSessionId(decodeURIComponent(m[1]));
              if (mounted) {
                setLoading(false);
                updateProgress(100);
              }
              return;
            }
          }
        }

        updateProgress(40);
        const token = await readToken();
        if (token) {
          await refresh();
        } else {
          console.log("No token found, user not authenticated");
          setUser(null);
          updateProgress(100);
        }
        if (mounted) {
          setLoading(false);
          updateProgress(100);
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
        if (mounted) {
          setLoading(false);
          updateProgress(100);
        }
      }
    };
    initAuth();

    let subscription: any = null;
    if (Platform.OS !== "web") {
      subscription = Linking.addEventListener("url", ({ url }) => {
        const m = url.match(/[?#&]session_id=([^&#]+)/);
        if (m) {
          exchangeSessionId(decodeURIComponent(m[1]));
        }
      });
    }

    return () => {
      mounted = false;
      if (subscription) subscription.remove();
    };
  }, [refresh, exchangeSessionId]);

  // Navigation effect (unchanged)
  useEffect(() => {
    if (loading) return;
    const currentRoute = segments[0] || "";
    const fullPath = segments.join("/");
    console.log("Current route:", fullPath);
    console.log("User state:", user?.full_name, "onboarded:", user?.onboarded);

    const allowedRoutes = [
      "(tabs)",
      "onboarding",
      "past-questions",
      "pdf",
      "stats",
      "drafts",
      "teacher",
      "teacher-upload",
      "lesson",
      "library",
      "ai",
      "edit-profile"
    ];

    const isWelcomePage = currentRoute === "welcome" || segments.length === 0;
    const isOnboardingPage = currentRoute === "onboarding";
    const isAllowedRoute = allowedRoutes.includes(currentRoute);

    if (!user) {
      if (!isWelcomePage && !isOnboardingPage) {
        console.log("Redirecting to welcome (no user)");
        router.replace("/welcome");
      }
      return;
    }

    if (user.onboarded === false || user.onboarded === undefined) {
      if (!isOnboardingPage) {
        console.log("Redirecting to onboarding");
        router.replace("/onboarding");
      }
      return;
    }

    if (isWelcomePage) {
      console.log("Redirecting to home (welcome page)");
      router.replace("/(tabs)");
      return;
    }

    if (!isAllowedRoute && !isOnboardingPage) {
      console.log("Redirecting to home (unknown route)");
      router.replace("/(tabs)");
    }
  }, [user, loading, segments]);

  const login = async (email: string, password: string) => {
    updateProgress(30);
    const r = await api<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    updateProgress(70);
    await setToken(r.token);
    setUser(r.user);
    updateProgress(100);
  };

  const register = async (email: string, password: string, name: string, role: "student" | "teacher") => {
    updateProgress(30);
    const r = await api<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: { email, password, name, role },
      auth: false,
    });
    updateProgress(70);
    await setToken(r.token);
    setUser(r.user);
    updateProgress(100);
  };

  const loginWithGoogle = async () => {
    updateProgress(10);
    const state = Math.random().toString(36).substring(2, 15);
    const redirect = Platform.OS === "web"
      ? (typeof window !== "undefined" ? window.location.origin + "/" : "")
      : Linking.createURL("");

    const url = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}&state=${state}`;
    console.log("Google login URL:", url);

    if (Platform.OS === "web") {
      if (typeof window !== "undefined") {
        window.location.href = url;
      }
      return;
    }

    let capturedUrl: string | null = null;
    const listener = Linking.addEventListener("url", ({ url: u }) => {
      console.log("Captured URL:", u);
      capturedUrl = u;
    });

    try {
      console.log("Opening auth session...");
      updateProgress(30);
      const result = await WebBrowser.openAuthSessionAsync(url, redirect);
      console.log("WebBrowser result type:", result.type);
      updateProgress(60);

      let finalUrl: string | null = null;
      if (result.type === "success" && "url" in result && result.url) {
        finalUrl = result.url;
      }
      if (!finalUrl && capturedUrl) finalUrl = capturedUrl;
      if (!finalUrl) {
        try { finalUrl = await Linking.getInitialURL(); } catch { }
      }

      if (finalUrl) {
        updateProgress(70);
        let sessionId: string | null = null;
        if (finalUrl.startsWith('exp://') || finalUrl.startsWith('http://') || finalUrl.startsWith('https://')) {
          try {
            const parsed = new URL(finalUrl);
            if (parsed.hash) {
              const params = new URLSearchParams(parsed.hash.substring(1));
              sessionId = params.get('session_id');
            }
            if (!sessionId) sessionId = parsed.searchParams.get('session_id');
          } catch { }
        }
        if (!sessionId) {
          const m = finalUrl.match(/[?#&]session_id=([^&#]+)/);
          if (m) sessionId = decodeURIComponent(m[1]);
        }
        if (sessionId) {
          console.log("Session ID extracted:", sessionId);
          await exchangeSessionId(sessionId);
        } else {
          console.log("No session_id found in URL:", finalUrl);
        }
      }
    } catch (error) {
      console.error("Google login error:", error);
    } finally {
      listener.remove();
      updateProgress(100);
    }
  };

  const logout = async () => {
    updateProgress(20);
    await setToken(null);
    setUser(null);
    processedSessions.clear();
    updateProgress(100);
    router.replace("/welcome");
  };

  const value: Ctx = {
    user,
    loading,
    loadProgress,
    login,
    register,
    loginWithGoogle,
    logout,
    refresh,
    setSession,
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const context = useContext(AuthCtx);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}