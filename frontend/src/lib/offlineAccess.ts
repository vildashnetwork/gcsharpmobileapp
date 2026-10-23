import { storage } from "@/src/utils/storage";

export type OfflineAccessStatus = {
  active: boolean;
  access_type: "trial" | "subscription" | "expired";
  trial_started_at: string | null;
  trial_expires_at: string;
  paid_until: string | null;
  expires_at: string;
  remaining_days: number;
  download_limit_per_day: number;
  downloaded_today: number;
  downloads_remaining_today: number;
};

const ACCESS_KEY_PREFIX = "gcsharp_offline_access_";
export const OFFLINE_MODE_KEY = "gcsmart_offline_mode";

let offlineModeSnapshot = false;
const offlineModeListeners = new Set<(value: boolean) => void>();

export function getOfflineModeSnapshot(): boolean {
  return offlineModeSnapshot;
}

export function subscribeOfflineMode(listener: (value: boolean) => void): () => void {
  offlineModeListeners.add(listener);
  return () => offlineModeListeners.delete(listener);
}

export function publishOfflineModePreference(value: boolean): void {
  offlineModeSnapshot = value;
  offlineModeListeners.forEach((listener) => listener(value));
}

function accessKey(userId: string): string {
  return `${ACCESS_KEY_PREFIX}${userId}`;
}

export async function cacheOfflineAccess(
  userId: string,
  status: OfflineAccessStatus,
): Promise<boolean> {
  const expiry = Date.parse(status.expires_at);
  if (!Number.isFinite(expiry)) {
    throw new Error("The server returned an invalid offline access expiry.");
  }
  return storage.secureSet(accessKey(userId), { expiresAt: expiry });
}

export async function getCachedOfflineAccessExpiry(
  userId: string,
): Promise<number | null> {
  const cached = await storage.secureGet<{ expiresAt: number } | null>(
    accessKey(userId),
    null,
  );
  if (!cached || !Number.isFinite(cached.expiresAt)) return null;
  return cached.expiresAt;
}
