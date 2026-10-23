
// import * as SecureStore from "expo-secure-store";
// import { Platform } from "react-native";

// export const API_BASE = `https://gcsharpmobileapp.onrender.com/api`;
// const TOKEN_KEY = "gcsmart_token";

// const memoryStore: { token: string | null } = { token: null };

// export async function readToken(): Promise<string | null> {
//   // First check memory
//   if (memoryStore.token) {
//     console.log("Token from memory");
//     return memoryStore.token;
//   }

//   if (Platform.OS === "web") {
//     const t = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
//     memoryStore.token = t;
//     console.log("Token from localStorage:", t ? "exists" : "none");
//     return t;
//   }

//   try {
//     const t = await SecureStore.getItemAsync(TOKEN_KEY);
//     memoryStore.token = t;
//     console.log("Token from SecureStore:", t ? "exists" : "none");
//     return t;
//   } catch (error) {
//     console.error("Error reading token from SecureStore:", error);
//     return null;
//   }
// }

// export async function setToken(t: string | null) {
//   console.log("Setting token:", t ? t.substring(0, 20) + "..." : "null");
//   memoryStore.token = t;

//   if (Platform.OS === "web") {
//     if (t) {
//       localStorage.setItem(TOKEN_KEY, t);
//       console.log("Token saved to localStorage");
//     } else {
//       localStorage.removeItem(TOKEN_KEY);
//       console.log("Token removed from localStorage");
//     }
//     return;
//   }

//   try {
//     if (t) {
//       await SecureStore.setItemAsync(TOKEN_KEY, t);
//       console.log("Token saved to SecureStore");
//     } else {
//       await SecureStore.deleteItemAsync(TOKEN_KEY);
//       console.log("Token removed from SecureStore");
//     }
//   } catch (error) {
//     console.error("Error saving token to SecureStore:", error);
//   }
// }

// export async function api<T = any>(
//   path: string,
//   opts: { method?: string; body?: any; auth?: boolean } = {}
// ): Promise<T> {
//   const { method = "GET", body, auth = true } = opts;
//   const headers: Record<string, string> = { "Content-Type": "application/json" };

//   if (auth) {
//     const t = await readToken();
//     if (t) {
//       headers.Authorization = `Bearer ${t}`;
//       console.log(`Auth header set for ${path}`);
//     } else {
//       console.log(`No auth token for ${path}`);
//       throw new Error("Missing token");
//     }
//   }

//   const url = `${API_BASE}${path}`;
//   console.log(`API Request: ${method} ${url}`);

//   try {
//     const res = await fetch(url, {
//       method,
//       headers,
//       body: body ? JSON.stringify(body) : undefined,
//     });

//     const text = await res.text();
//     let data: any = null;
//     try {
//       data = text ? JSON.parse(text) : null;
//     } catch {
//       data = text;
//     }

//     if (!res.ok) {
//       console.log(`API Error ${res.status}:`, data);
//       const msg = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
//       throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
//     }

//     return data as T;
//   } catch (error) {
//     console.error(`API request failed for ${path}:`, error);
//     throw error;
//   }
// }



















import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  cacheGetResponse,
  readCachedGet,
  enqueueMutation,
} from "./lib/offlineCache";

export const API_BASE = `https://mobile.gcsharp.com/api`;
const TOKEN_KEY = "gcsmart_token";

const memoryStore: { token: string | null } = { token: null };

// Lets callers (like auth.tsx) tell "server rejected the token" (401/403)
// apart from "the request never reached the server" (offline/timeout/5xx).
// Only the former should ever cause a forced logout.
export class ApiError extends Error {
  status: number | null;
  /** True when the value was served from the offline cache, not the network. */
  fromCache?: boolean;
  constructor(message: string, status: number | null, fromCache = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fromCache = fromCache;
  }
}

export async function readToken(): Promise<string | null> {
  // First check memory
  if (memoryStore.token) {
    console.log("Token from memory");
    return memoryStore.token;
  }

  if (Platform.OS === "web") {
    const t = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    memoryStore.token = t;
    console.log("Token from localStorage:", t ? "exists" : "none");
    return t;
  }

  try {
    const t = await SecureStore.getItemAsync(TOKEN_KEY);
    memoryStore.token = t;
    console.log("Token from SecureStore:", t ? "exists" : "none");
    return t;
  } catch (error) {
    console.error("Error reading token from SecureStore:", error);
    return null;
  }
}

export async function setToken(t: string | null) {
  console.log("Setting token:", t ? t.substring(0, 20) + "..." : "null");
  memoryStore.token = t;

  if (Platform.OS === "web") {
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
      console.log("Token saved to localStorage");
    } else {
      localStorage.removeItem(TOKEN_KEY);
      console.log("Token removed from localStorage");
    }
    return;
  }

  try {
    if (t) {
      await SecureStore.setItemAsync(TOKEN_KEY, t);
      console.log("Token saved to SecureStore");
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      console.log("Token removed from SecureStore");
    }
  } catch (error) {
    console.error("Error saving token to SecureStore:", error);
  }
}

export async function api<T = any>(
  path: string,
  opts: {
    method?: string;
    body?: any;
    auth?: boolean;
    queueOffline?: boolean;
    cacheFallback?: boolean;
  } = {}
): Promise<T> {
  const {
    method = "GET",
    body,
    auth = true,
    queueOffline = true,
    cacheFallback = true,
  } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (auth) {
    const t = await readToken();
    if (t) {
      headers.Authorization = `Bearer ${t}`;
      console.log(`Auth header set for ${path}`);
    } else {
      console.log(`No auth token for ${path}`);
      // No token present at all — not a server rejection, just nothing to send.
      // GETs can still be served from the offline cache below.
      if (method === "GET" && cacheFallback) {
        const cached = await readCachedGet<T>(path);
        if (cached !== null) return cached;
      }
      throw new ApiError("Missing token", null);
    }
  }

  const url = `${API_BASE}${path}`;
  console.log(`API Request: ${method} ${url}`);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    // fetch() itself threw: device offline, DNS failure, connection refused,
    // etc. The server was never reached, so this is NEVER an auth failure.
    console.error(`Network error for ${path}:`, networkError);

    // OFFLINE FALLBACK — GETs are served from the last cached response so
    // screens keep working with the app fully offline.
    if (method === "GET" && cacheFallback) {
      const cached = await readCachedGet<T>(path);
      if (cached !== null) {
        console.log(`[offline] Serving cached GET ${path}`);
        return cached;
      }
    }

    // OFFLINE QUEUE — non-GET requests are persisted and replayed by the
    // sync worker when connectivity returns. Callers get a synthetic
    // success so optimistic UI keeps working.
    if (method !== "GET") {
      if (!queueOffline) {
        throw new ApiError(
          "This action needs an internet connection to verify offline access.",
          null
        );
      }
      await enqueueMutation(path, method, body, auth);
      console.log(`[offline] Queued ${method} ${path} for later sync`);
      return { __offlineQueued: true } as T;
    }

    throw new ApiError(
      networkError instanceof Error ? networkError.message : "Network request failed",
      null
    );
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    console.log(`API Error ${res.status}:`, data);
    const msg = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    // The server DID respond, with a real status code — this is where a
    // genuine 401/403 auth rejection is distinguishable from everything else.
    throw new ApiError(typeof msg === "string" ? msg : JSON.stringify(msg), res.status);
  }

  // Cache every successful GET so it can be replayed offline later.
  if (method === "GET") {
    cacheGetResponse(path, data);
  }

  return data as T;
}
