import { formatDistanceStrict } from "date-fns";

export function timeAgo(timestamp?: string, now = Date.now()): string {
  if (!timestamp) return "";

  const value = timestamp.trim();
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(hasTimezone ? value : `${value}Z`);
  if (!Number.isFinite(date.getTime())) return "";
  if (Math.abs(now - date.getTime()) < 1000) return "just now";

  return formatDistanceStrict(date, new Date(now), {
    addSuffix: true,
    roundingMethod: "floor",
  });
}
