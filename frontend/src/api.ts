// import * as SecureStore from "expo-secure-store";
// import { Platform } from "react-native";

// export const API_BASE = `https://gcsharpmobileapp.onrender.com/api`;
// const TOKEN_KEY = "gcsmart_token";

// const memoryStore: { token: string | null } = { token: null };

// async function readToken(): Promise<string | null> {
//   if (memoryStore.token) return memoryStore.token;
//   if (Platform.OS === "web") {
//     const t = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
//     memoryStore.token = t;
//     return t;
//   }
//   const t = await SecureStore.getItemAsync(TOKEN_KEY);
//   memoryStore.token = t;
//   return t;
// }

// export async function setToken(t: string | null) {
//   memoryStore.token = t;
//   if (Platform.OS === "web") {
//     if (t) localStorage.setItem(TOKEN_KEY, t);
//     else localStorage.removeItem(TOKEN_KEY);
//     return;
//   }
//   if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
//   else await SecureStore.deleteItemAsync(TOKEN_KEY);
// }

// export async function api<T = any>(
//   path: string,
//   opts: { method?: string; body?: any; auth?: boolean } = {}
// ): Promise<T> {
//   const { method = "GET", body, auth = true } = opts;
//   const headers: Record<string, string> = { "Content-Type": "application/json" };
//   if (auth) {
//     const t = await readToken();
//     if (t) headers.Authorization = `Bearer ${t}`;
//   }
//   const res = await fetch(`${API_BASE}${path}`, {
//     method,
//     headers,
//     body: body ? JSON.stringify(body) : undefined,
//   });
//   const text = await res.text();
//   let data: any = null;
//   try {
//     data = text ? JSON.parse(text) : null;
//   } catch {
//     data = text;
//   }
//   if (!res.ok) {
//     const msg = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
//     throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
//   }
//   return data as T;
// }






























import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const API_BASE = `https://gcsharpmobileapp.onrender.com/api`;
const TOKEN_KEY = "gcsmart_token";

const memoryStore: { token: string | null } = { token: null };

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
  opts: { method?: string; body?: any; auth?: boolean } = {}
): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (auth) {
    const t = await readToken();
    if (t) {
      headers.Authorization = `Bearer ${t}`;
      console.log(`Auth header set for ${path}`);
    } else {
      console.log(`No auth token for ${path}`);
      throw new Error("Missing token");
    }
  }

  const url = `${API_BASE}${path}`;
  console.log(`API Request: ${method} ${url}`);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

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
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }

    return data as T;
  } catch (error) {
    console.error(`API request failed for ${path}:`, error);
    throw error;
  }
}