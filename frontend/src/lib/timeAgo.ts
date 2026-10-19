export function timeAgo(timestamp?: string): string {
  if (!timestamp) return "";

  const value = timestamp.trim();
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(hasTimezone ? value : `${value}Z`);
  const createdAt = date.getTime();
  if (!Number.isFinite(createdAt)) return "";

  const elapsedMs = Math.max(0, Date.now() - createdAt);
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (days < 30) return `${weeks}w ago`;

  const months = Math.floor(days / 30);
  if (days < 365) return `${months}mo ago`;

  const years = Math.floor(days / 365);
  return `${years}y ago`;
}
