

// import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
// import * as WebBrowser from "expo-web-browser";
// import * as Linking from "expo-linking";
// import { Platform } from "react-native";
// import { useRouter, useSegments } from "expo-router";
// import { api, setToken, readToken } from "./api";

// WebBrowser.maybeCompleteAuthSession();

// export type User = {
//   user_id: string;
//   email: string;
//   full_name: string;
//   role: "student" | "teacher" | "admin";
//   profile_photo?: string | null;
//   onboarded?: boolean;
//   exam_level?: string | null;
//   xp?: number;
//   level?: number;
//   streak?: number;
// };

// type Ctx = {
//   user: User | null;
//   loading: boolean;
//   login: (email: string, password: string) => Promise<void>;
//   register: (email: string, password: string, name: string, role: "student" | "teacher") => Promise<void>;
//   loginWithGoogle: () => Promise<void>;
//   logout: () => Promise<void>;
//   refresh: () => Promise<void>;
// };

// const AuthCtx = createContext<Ctx | null>(null);
// const processedSessions = new Set<string>();

// export function AuthProvider({ children }: { children: React.ReactNode }) {
//   const [user, setUser] = useState<User | null>(null);
//   const [loading, setLoading] = useState(true);
//   const router = useRouter();
//   const segments = useSegments();

//   const refresh = useCallback(async () => {
//     try {
//       const token = await readToken();
//       if (!token) {
//         console.log("No token found, skipping refresh");
//         setUser(null);
//         return;
//       }
//       const r = await api<{ user: User }>("/auth/me");
//       setUser(r.user);
//       console.log("User refreshed:", r.user);
//     } catch (error) {
//       console.log("Refresh failed:", error);
//       setUser(null);
//       await setToken(null);
//     }
//   }, []);

//   const exchangeSessionId = useCallback(async (sid: string) => {
//     console.log("Exchanging session ID:", sid);

//     if (processedSessions.has(sid)) {
//       console.log("Session already processed:", sid);
//       return;
//     }

//     processedSessions.add(sid);

//     try {
//       console.log("Calling /auth/session with session_id:", sid);
//       const r = await api<{ session_token: string; user: User }>("/auth/session", {
//         method: "POST",
//         body: { session_id: sid },
//         auth: false,
//       });

//       console.log("Session exchange successful");

//       await setToken(r.session_token);
//       console.log("Token stored:", r.session_token.substring(0, 20) + "...");

//       const storedToken = await readToken();
//       console.log("Verified token exists:", !!storedToken);

//       setUser(r.user);
//       console.log("User set:", r.user.full_name);

//     } catch (e) {
//       console.error("Google exchange failed:", e);
//       processedSessions.delete(sid);
//     }
//   }, []);

//   useEffect(() => {
//     let mounted = true;

//     const initAuth = async () => {
//       try {
//         if (Platform.OS === "web" && typeof window !== "undefined") {
//           const hash = window.location.hash || "";
//           const search = window.location.search || "";
//           const combined = hash + search;
//           const m = combined.match(/[?#&]session_id=([^&#]+)/);
//           if (m) {
//             console.log("Web: Found session_id in URL");
//             await exchangeSessionId(decodeURIComponent(m[1]));
//             try {
//               window.history.replaceState(window.history.state, "", window.location.pathname);
//             } catch { }
//             if (mounted) {
//               setLoading(false);
//             }
//             return;
//           }
//         }

//         if (Platform.OS !== "web") {
//           try {
//             const initial = await Linking.getInitialURL();
//             if (initial) {
//               console.log("Mobile cold start URL:", initial);
//               const m = initial.match(/[?#&]session_id=([^&#]+)/);
//               if (m) {
//                 await exchangeSessionId(decodeURIComponent(m[1]));
//                 if (mounted) {
//                   setLoading(false);
//                 }
//                 return;
//               }
//             }
//           } catch (error) {
//             console.log("Error getting initial URL:", error);
//           }
//         }

//         const token = await readToken();
//         if (token) {
//           await refresh();
//         } else {
//           console.log("No token found, user not authenticated");
//           setUser(null);
//         }

//         if (mounted) {
//           setLoading(false);
//         }
//       } catch (error) {
//         console.error("Auth initialization error:", error);
//         if (mounted) {
//           setLoading(false);
//         }
//       }
//     };

//     initAuth();

//     let subscription: any = null;
//     if (Platform.OS !== "web") {
//       subscription = Linking.addEventListener("url", ({ url }) => {
//         console.log("Mobile hot deep link:", url);
//         const m = url.match(/[?#&]session_id=([^&#]+)/);
//         if (m) {
//           exchangeSessionId(decodeURIComponent(m[1]));
//         }
//       });
//     }

//     return () => {
//       mounted = false;
//       if (subscription) {
//         subscription.remove();
//       }
//     };
//   }, [refresh, exchangeSessionId]);

//   // Navigation effect - redirect based on auth state
//   useEffect(() => {
//     if (loading) return;

//     const currentRoute = segments[0] || "";
//     const fullPath = segments.join("/");

//     console.log("Current route:", fullPath);
//     console.log("User state:", user?.full_name, "onboarded:", user?.onboarded);

//     // List of routes that are accessible when authenticated (not just tabs)
//     const allowedRoutes = [
//       "(tabs)",
//       "onboarding",
//       "past-questions",
//       "pdf",
//       "stats",
//       "drafts",
//       "teacher",
//       "teacher-upload",
//       "lesson",
//       "library",
//       "ai"
//     ];

//     const isWelcomePage = currentRoute === "welcome" || segments.length === 0;
//     const isOnboardingPage = currentRoute === "onboarding";
//     const isAllowedRoute = allowedRoutes.includes(currentRoute);
//     const isInTabs = currentRoute === "(tabs)";

//     if (!user) {
//       // User is not authenticated - only allow welcome, onboarding, and auth routes
//       if (!isWelcomePage && !isOnboardingPage) {
//         console.log("Redirecting to welcome (no user)");
//         router.replace("/welcome");
//       }
//       return;
//     }

//     // User is authenticated but not onboarded
//     if (user.onboarded === false || user.onboarded === undefined) {
//       if (!isOnboardingPage) {
//         console.log("Redirecting to onboarding");
//         router.replace("/onboarding");
//       }
//       return;
//     }

//     // User is fully authenticated and onboarded
//     // Redirect if on welcome page or an unknown route
//     if (isWelcomePage) {
//       console.log("Redirecting to home (welcome page)");
//       router.replace("/(tabs)");
//       return;
//     }

//     // Allow access to all allowed routes and tabs
//     if (!isAllowedRoute && !isOnboardingPage) {
//       console.log("Redirecting to home (unknown route)");
//       router.replace("/(tabs)");
//     }
//   }, [user, loading, segments]);

//   const login = async (email: string, password: string) => {
//     const r = await api<{ token: string; user: User }>("/auth/login", {
//       method: "POST",
//       body: { email, password },
//       auth: false,
//     });
//     await setToken(r.token);
//     setUser(r.user);
//   };

//   const register = async (email: string, password: string, name: string, role: "student" | "teacher") => {
//     const r = await api<{ token: string; user: User }>("/auth/register", {
//       method: "POST",
//       body: { email, password, full_name: name, role },
//       auth: false,
//     });
//     await setToken(r.token);
//     setUser(r.user);
//   };

//   const loginWithGoogle = async () => {
//     const redirect = Platform.OS === "web"
//       ? (typeof window !== "undefined" ? window.location.origin + "/" : "")
//       : Linking.createURL("");

//     const url = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
//     console.log("Google login URL:", url);

//     if (Platform.OS === "web") {
//       if (typeof window !== "undefined") {
//         window.location.href = url;
//       }
//       return;
//     }

//     let capturedUrl: string | null = null;
//     const listener = Linking.addEventListener("url", ({ url: u }) => {
//       console.log("Captured URL:", u);
//       capturedUrl = u;
//     });

//     try {
//       console.log("Opening auth session...");
//       const result = await WebBrowser.openAuthSessionAsync(url, redirect);
//       console.log("WebBrowser result type:", result.type);

//       let finalUrl: string | null = null;

//       if (result.type === "success" && "url" in result && result.url) {
//         finalUrl = result.url;
//         console.log("Got URL from result");
//       }

//       if (!finalUrl && capturedUrl) {
//         finalUrl = capturedUrl;
//         console.log("Got URL from listener");
//       }

//       if (!finalUrl) {
//         try {
//           finalUrl = await Linking.getInitialURL();
//           console.log("Got URL from initial");
//         } catch (error) {
//           console.log("Error getting initial URL:", error);
//         }
//       }

//       if (finalUrl) {
//         const m = finalUrl.match(/[?#&]session_id=([^&#]+)/);
//         if (m) {
//           const sessionId = decodeURIComponent(m[1]);
//           console.log("Session ID extracted");
//           await exchangeSessionId(sessionId);
//         } else {
//           console.log("No session_id found in URL");
//         }
//       } else {
//         console.log("No final URL received");
//       }
//     } catch (error) {
//       console.error("Google login error:", error);
//     } finally {
//       listener.remove();
//     }
//   };

//   const logout = async () => {
//     await setToken(null);
//     setUser(null);
//     processedSessions.clear();
//     router.replace("/welcome");
//   };

//   const value: Ctx = {
//     user,
//     loading,
//     login,
//     register,
//     loginWithGoogle,
//     logout,
//     refresh,
//   };

//   return (
//     <AuthCtx.Provider value={value}>
//       {children}
//     </AuthCtx.Provider>
//   );
// }

// export function useAuth() {
//   const context = useContext(AuthCtx);
//   if (!context) {
//     throw new Error("useAuth must be used within an AuthProvider");
//   }
//   return context;
// }


















































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
  const router = useRouter();
  const segments = useSegments();

  const refresh = useCallback(async () => {
    try {
      const token = await readToken();
      if (!token) {
        console.log("No token found, skipping refresh");
        setUser(null);
        return;
      }
      const r = await api<{ user: User }>("/auth/me");
      setUser(r.user);
      console.log("User refreshed:", r.user);
    } catch (error) {
      console.log("Refresh failed:", error);
      setUser(null);
      await setToken(null);
    }
  }, []);

  const exchangeSessionId = useCallback(async (sid: string) => {
    console.log("Exchanging session ID:", sid);

    if (processedSessions.has(sid)) {
      console.log("Session already processed:", sid);
      return;
    }

    processedSessions.add(sid);

    try {
      console.log("Calling /auth/session with session_id:", sid);
      const r = await api<{ session_token: string; user: User }>("/auth/session", {
        method: "POST",
        body: { session_id: sid },
        auth: false,
      });

      console.log("Session exchange successful");

      await setToken(r.session_token);
      console.log("Token stored:", r.session_token.substring(0, 20) + "...");

      const storedToken = await readToken();
      console.log("Verified token exists:", !!storedToken);

      setUser(r.user);
      console.log("User set:", r.user.full_name);

    } catch (e) {
      console.error("Google exchange failed:", e);
      processedSessions.delete(sid);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const hash = window.location.hash || "";
          const search = window.location.search || "";
          const combined = hash + search;
          const m = combined.match(/[?#&]session_id=([^&#]+)/);
          if (m) {
            console.log("Web: Found session_id in URL");
            await exchangeSessionId(decodeURIComponent(m[1]));
            try {
              window.history.replaceState(window.history.state, "", window.location.pathname);
            } catch { }
            if (mounted) {
              setLoading(false);
            }
            return;
          }
        }

        if (Platform.OS !== "web") {
          try {
            const initial = await Linking.getInitialURL();
            if (initial) {
              console.log("Mobile cold start URL:", initial);
              const m = initial.match(/[?#&]session_id=([^&#]+)/);
              if (m) {
                await exchangeSessionId(decodeURIComponent(m[1]));
                if (mounted) {
                  setLoading(false);
                }
                return;
              }
            }
          } catch (error) {
            console.log("Error getting initial URL:", error);
          }
        }

        const token = await readToken();
        if (token) {
          await refresh();
        } else {
          console.log("No token found, user not authenticated");
          setUser(null);
        }

        if (mounted) {
          setLoading(false);
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    let subscription: any = null;
    if (Platform.OS !== "web") {
      subscription = Linking.addEventListener("url", ({ url }) => {
        console.log("Mobile hot deep link:", url);
        const m = url.match(/[?#&]session_id=([^&#]+)/);
        if (m) {
          exchangeSessionId(decodeURIComponent(m[1]));
        }
      });
    }

    return () => {
      mounted = false;
      if (subscription) {
        subscription.remove();
      }
    };
  }, [refresh, exchangeSessionId]);

  // Navigation effect - redirect based on auth state
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
      "ai"
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
    const r = await api<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    await setToken(r.token);
    setUser(r.user);
  };

  // FIXED: Changed full_name to name to match server expectations
  const register = async (email: string, password: string, name: string, role: "student" | "teacher") => {
    const r = await api<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: {
        email,
        password,
        name: name,  // Changed from full_name to name
        role
      },
      auth: false,
    });
    await setToken(r.token);
    setUser(r.user);
  };

  // FIXED: Google login with better URL parsing and state handling
  const loginWithGoogle = async () => {
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
      const result = await WebBrowser.openAuthSessionAsync(url, redirect);
      console.log("WebBrowser result type:", result.type);

      let finalUrl: string | null = null;

      if (result.type === "success" && "url" in result && result.url) {
        finalUrl = result.url;
        console.log("Got URL from result");
      }

      if (!finalUrl && capturedUrl) {
        finalUrl = capturedUrl;
        console.log("Got URL from listener");
      }

      if (!finalUrl) {
        try {
          finalUrl = await Linking.getInitialURL();
          console.log("Got URL from initial");
        } catch (error) {
          console.log("Error getting initial URL:", error);
        }
      }

      if (finalUrl) {
        // Try multiple ways to extract session_id
        let sessionId: string | null = null;

        // Method 1: Try URL parsing for exp:// or http:// URLs
        if (finalUrl.startsWith('exp://') || finalUrl.startsWith('http://') || finalUrl.startsWith('https://')) {
          try {
            const parsedUrl = new URL(finalUrl);
            // Check hash first (for exp:// URLs)
            if (parsedUrl.hash) {
              const hashParams = new URLSearchParams(parsedUrl.hash.substring(1));
              sessionId = hashParams.get('session_id');
            }
            // If not in hash, check search params
            if (!sessionId) {
              sessionId = parsedUrl.searchParams.get('session_id');
            }
          } catch (e) {
            // URL parsing failed, fallback to regex
          }
        }

        // Method 2: Fallback to regex
        if (!sessionId) {
          const m = finalUrl.match(/[?#&]session_id=([^&#]+)/);
          if (m) {
            sessionId = decodeURIComponent(m[1]);
          }
        }

        if (sessionId) {
          console.log("Session ID extracted:", sessionId);
          await exchangeSessionId(sessionId);
        } else {
          console.log("No session_id found in URL:", finalUrl);
        }
      } else {
        console.log("No final URL received");
      }
    } catch (error) {
      console.error("Google login error:", error);
    } finally {
      listener.remove();
    }
  };

  const logout = async () => {
    await setToken(null);
    setUser(null);
    processedSessions.clear();
    router.replace("/welcome");
  };

  const value: Ctx = {
    user,
    loading,
    login,
    register,
    loginWithGoogle,
    logout,
    refresh,
  };

  return (
    <AuthCtx.Provider value={value}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthCtx);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}