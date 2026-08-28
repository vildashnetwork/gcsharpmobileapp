// src/lib/pushNotifications.ts
//
// Safe Expo push-notification registration.
//
// IMPORTANT (why the old attempt froze the app): the previous implementation
// called notification APIs synchronously during startup and blocked the JS
// thread while waiting for permission/native module calls. This module is
// written to make that impossible:
//   1. Nothing here runs at import time — setup() is called AFTER auth has
//      finished loading, and it defers its work to the next macrotask so the
//      first render is never delayed.
//   2. Every native call is awaited inside try/catch — any failure (Expo Go,
//      emulator without Play services, denied permission, offline) silently
//      disables push instead of hanging or crashing.
//   3. Registration is deduplicated: the token is persisted and the backend
//      is only contacted when the token actually changes.
//
// Backend contract (already implemented in server_sqlite_full_corrected.py):
//   POST /api/notifications/register-push-token  { token }  (auth: Bearer)
//   -> stores expo_push_token on the user; every create_notification() then
//      also sends an Expo push (works while the app is backgrounded/closed).

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "@/src/api";
import { storage } from "@/src/utils/storage";

const PUSH_TOKEN_KEY = "gcsmart_expo_push_token";

// EAS project id from app.json (extra.eas.projectId) — required by Expo to
// route push tokens. Hardcoded fallback keeps this working even if the
// manifest read fails.
const PROJECT_ID = "4ea50a82-7983-4ca0-bb9a-b22297bb304d";

// How notifications behave while the app is OPEN (foreground). Without this
// handler, Android shows nothing for foreground pushes; with it the OS banner
// appears and the WebSocket/in-app bell still updates as before.
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

export type RegisteredPushListener = () => void;

/**
 * Shows OS notifications for pushes received while the app is foregrounded
 * and returns a disposer. Safe to call multiple times.
 */
export function registerForegroundNotificationListener(): RegisteredPushListener {
    try {
        const sub = Notifications.addNotificationReceivedListener((notification) => {
            // The in-app bell is driven by the WebSocket; this listener only makes
            // sure the OS banner is not swallowed while the app is open.
            console.log("[push] notification received in foreground:", notification.request?.content?.title);
        });
        return () => {
            try {
                sub.remove();
            } catch { }
        };
    } catch (e) {
        console.warn("[push] foreground listener setup failed:", e);
        return () => { };
    }
}

/**
 * Fires when the user TAPS a notification (app foreground, background or
 * cold start). Returns a disposer.
 */
export function registerNotificationResponseListener(
    onTap: (link?: string) => void
): RegisteredPushListener {
    try {
        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
            const data = response.notification?.request?.content?.data as
                | { link?: string }
                | undefined;
            onTap(data?.link);
        });
        return () => {
            try {
                sub.remove();
            } catch { }
        };
    } catch (e) {
        console.warn("[push] response listener setup failed:", e);
        return () => { };
    }
}

async function registerForPushToken(): Promise<string | null> {
    // Permission check/request — never throws, returns denied on failure.
    const existing = await Notifications.getPermissionsAsync();
    let status = existing?.status ?? "undetermined";

    if (status !== "granted") {
        const requested = await Notifications.requestPermissionsAsync();
        status = requested?.status ?? "denied";
    }

    if (status !== "granted") {
        console.log("[push] permission not granted — push disabled for this session");
        return null;
    }

    // Android needs a channel for the notification to render with sound.
    if (Platform.OS === "android") {
        try {
            await Notifications.setNotificationChannelAsync("default", {
                name: "General",
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: "#1D4ED8",
                showBadge: true,
            });
        } catch (e) {
            console.warn("[push] channel setup failed:", e);
        }
    }

    try {
        // Expo push token (ExponentPushToken[...]) — this is what the
        // backend's send_expo_push() / Expo push API expects.
        const tokenResponse = await Notifications.getExpoPushTokenAsync({
            projectId: PROJECT_ID,
        });
        const token =
            typeof tokenResponse?.data === "string" ? tokenResponse.data : null;
        if (!token) {
            console.warn("[push] empty push token");
            return null;
        }
        return token;
    } catch (e: any) {
        // Common benign cases: Expo Go (Android SDK 53+ has no remote push),
        // emulators without Play services, or offline device. All are non-fatal.
        console.warn("[push] token fetch failed (push disabled):", e?.message ?? e);
        return null;
    }
}

/**
 * Registers the device for push notifications and uploads the Expo push
 * token to the backend. Designed to be called once after the user is
 * authenticated. Never throws; never blocks the caller's UI.
 */
export async function setupPushNotifications(): Promise<void> {
    try {
        if (Platform.OS === "web") return; // no push on web

        const token = await registerForPushToken();
        if (!token) return;

        // Deduplicate: only hit the backend when the token is new/changed.
        const previous = await storage.getItem(PUSH_TOKEN_KEY, "");
        if (previous === token) {
            console.log("[push] token unchanged — skipping backend registration");
            return;
        }

        try {
            await api("/notifications/register-push-token", {
                method: "POST",
                body: { token },
            });
            await storage.setItem(PUSH_TOKEN_KEY, token);
            console.log("[push] token registered with backend");
        } catch (e) {
            // Offline/failed upload — retry on the next app start (token stays
            // un-persisted so the dedupe check lets it through next time).
            console.warn("[push] backend registration failed, will retry next launch:", e);
        }
    } catch (e) {
        // Absolute safety net: push must NEVER take the app down.
        console.warn("[push] setup failed:", e);
    }
}

/**
 * Deferred wrapper — schedules setup on the next macrotask so it can never
 * delay the first paint / navigation mount.
 */
export function schedulePushSetup(): void {
    setTimeout(() => {
        setupPushNotifications().catch(() => { });
    }, 1500);
}