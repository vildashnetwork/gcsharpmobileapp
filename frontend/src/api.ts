import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const API_BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
const TOKEN_KEY = "gcsmart_token";

const memoryStore: { token: string | null } = { token: null };

async function readToken(): Promise<string | null> {
  if (memoryStore.token) return memoryStore.token;
  if (Platform.OS === "web") {
    const t = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    memoryStore.token = t;
    return t;
  }
  const t = await SecureStore.getItemAsync(TOKEN_KEY);
  memoryStore.token = t;
  return t;
}

export async function setToken(t: string | null) {
  memoryStore.token = t;
  if (Platform.OS === "web") {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
    return;
  }
  if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean } = {}
): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const t = await readToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
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
    const msg = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}
