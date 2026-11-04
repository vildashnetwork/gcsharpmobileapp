import type { Href } from "expo-router";

export function getNotificationHref(link?: string | null): Href | null {
  if (!link?.startsWith("/") || link.startsWith("//")) return null;

  const [path, query] = link.split("?", 2);
  if (path === "/ai/chat") {
    const sessionId = new URLSearchParams(query || "").get("s");
    return sessionId
      ? { pathname: "/(tabs)/ai", params: { s: sessionId } }
      : "/(tabs)/ai";
  }
  if (path === "/ai") return "/(tabs)/ai";
  if (path === "/dashboard") return "/(tabs)/index" as Href;
  if (path === "/study") return "/(tabs)/papers";

  return link as Href;
}
