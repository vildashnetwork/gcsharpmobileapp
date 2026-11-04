import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import type { NotificationResponse } from "expo-notifications";
import { API_BASE, readToken } from "@/src/api";

const PUSH_TOKEN_KEY = "gcsharp_expo_push_token";
let expoGoWarningShown = false;

function isAndroidExpoGo(): boolean {
  return Platform.OS === "android" && Constants.appOwnership === "expo";
}

export async function installNotificationResponseHandler(
  onOpenLink: (link: string, responseId: string) => void
): Promise<() => void> {
  if (Platform.OS === "web") return () => {};
  if (isAndroidExpoGo()) {
    if (!expoGoWarningShown) {
      console.warn(
        "[push] Remote notifications are unavailable in Expo Go on Android; use a development build."
      );
      expoGoWarningShown = true;
    }
    return () => {};
  }

  const notifications = await import("expo-notifications");
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  let active = true;
  let handledNotificationId: string | null = null;
  const openResponse = (response: NotificationResponse) => {
    if (!active) return;
    const responseId = response.notification.request.identifier;
    if (handledNotificationId === responseId) return;
    handledNotificationId = responseId;
    const data = response.notification.request.content.data;
    const link = typeof data?.link === "string" ? data.link : null;
    if (link?.startsWith("/")) onOpenLink(link, responseId);
    notifications.clearLastNotificationResponseAsync().catch((error) => {
      console.warn("[push] failed to clear handled notification:", error);
    });
  };
  const responseListener =
    notifications.addNotificationResponseReceivedListener(openResponse);
  notifications.getLastNotificationResponseAsync()
    .then((response) => { if (response) openResponse(response); })
    .catch((error) => {
      console.warn("[push] failed to read launch notification:", error);
    });

  return () => {
    active = false;
    responseListener.remove();
  };
}

async function pushApiRequest(path: string, method: "POST" | "DELETE",
  body?: Record<string, string>): Promise<void> {
  const authToken = await readToken();
  if (!authToken) throw new Error("You must be signed in to update push notifications.");

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${authToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await response.text();
  if (!response.ok) {
    let message = `Push notification request failed (${response.status}).`;
    try {
      const data = raw ? JSON.parse(raw) : null;
      if (typeof data?.detail === "string") message = data.detail;
      else if (typeof data?.message === "string") message = data.message;
    } catch {
      if (raw) message = raw;
    }
    throw new Error(message);
  }
}

export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  if (isAndroidExpoGo()) {
    if (!expoGoWarningShown) {
      console.warn(
        "[push] Remote notifications are unavailable in Expo Go on Android; use a development build."
      );
      expoGoWarningShown = true;
    }
    return null;
  }

  const notifications = await import("expo-notifications");
  if (Platform.OS === "android") {
    await notifications.setNotificationChannelAsync("default", {
      name: "GC Sharp notifications",
      importance: notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
    });
  }

  let permission = await notifications.getPermissionsAsync();
  if (permission.status !== "granted") {
    permission = await notifications.requestPermissionsAsync();
  }
  if (permission.status !== "granted") return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    throw new Error("Expo project ID is missing; push notifications cannot be registered.");
  }

  const token = (await notifications.getExpoPushTokenAsync({ projectId })).data;
  await pushApiRequest("/notifications/register-push-token", "POST", { token });
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  return token;
}

export async function unregisterPushToken(): Promise<void> {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  if (!token) return;
  await pushApiRequest(
    `/notifications/register-push-token?token=${encodeURIComponent(token)}`,
    "DELETE"
  );
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
}
