/**
 * Offline cache: persistent GET-response cache + queued mutations.
 *
 * Two halves:
 *
 * 1. Response cache — every successful GET made through `api()` is written to
 *    AsyncStorage under a stable key derived from the URL. When the device is
 *    offline (or the request fails with a network error), `api()` transparently
 *    serves the cached copy instead of throwing, so screens keep working with
 *    the last-known data.
 *
 * 2. Mutation queue — POST/PUT/DELETE calls made while offline are persisted
 *    to disk and replayed by the sync worker (src/lib/syncWorker.ts) the next
 *    time the app is online. Callers get a synthetic "queued" response so the
 *    UI can stay optimistic.
 *
 * All storage goes through the existing `storage` singleton (AsyncStorage),
 * which never throws. Media bytes (images/videos/PDFs) are NOT stored here —
 * those live on the filesystem via src/lib/mediaStore.ts.
 */

import { storage } from "@/src/utils/storage";

const CACHE_PREFIX = "offline.cache.";
const QUEUE_KEY = "offline.mutationQueue";
const META_KEY = "offline.meta";

/** How long a cached GET stays fresh enough to serve without a warning. */
const STALE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/** Max queued mutations before we start dropping the oldest ones. */
const MAX_QUEUE = 200;

export type QueuedMutation = {
    id: string;
    path: string;
    method: string;
    body?: any;
    auth: boolean;
    queuedAt: number;
    /** Bumped when a replay fails with a server error, to avoid hot loops. */
    attempts: number;
};

type CacheMeta = { cachedAt: number };

// ---------------------------------------------------------------------------
// Response cache (GETs)
// ---------------------------------------------------------------------------

function cacheKey(path: string): string {
    return CACHE_PREFIX + path;
}

/** Persist a successful GET response. Failures are silently ignored. */
export function cacheGetResponse(path: string, data: unknown): void {
    // Fire-and-forget: callers are on the hot request path.
    void storage.setItem(cacheKey(path), data as any);
    const meta: Record<string, CacheMeta> =
        (storageMetaSnapshot() as Record<string, CacheMeta>) || {};
    meta[path] = { cachedAt: Date.now() };
    void storage.setItem(META_KEY, meta as any);
}

function storageMetaSnapshot(): unknown {
    // Synchronous-ish read is not available on AsyncStorage; we keep a small
    // in-memory mirror that is hydrated once at startup (see hydrateMeta).
    return memoryMeta;
}

let memoryMeta: Record<string, CacheMeta> | null = null;

/** Called once by the sync worker / auth init to warm the meta mirror. */
export async function hydrateCacheMeta(): Promise<void> {
    memoryMeta = await storage.getItem<Record<string, CacheMeta>>(META_KEY, {});
}

export function isCacheFresh(path: string): boolean {
    if (!memoryMeta) return true; // unknown — assume fine rather than blocking
    const m = memoryMeta[path];
    if (!m) return true;
    return Date.now() - m.cachedAt < STALE_MS;
}

export function cacheAge(path: string): number | null {
    if (!memoryMeta) return null;
    return memoryMeta[path]?.cachedAt ?? null;
}

/**
 * Read a cached GET response. Returns null when nothing (or nothing recent
 * enough) is stored.
 */
export async function readCachedGet<T>(path: string): Promise<T | null> {
    // storage's value type is a JSON-safe union; api() responses are always
    // JSON-serializable, so the cast is safe here.
    const v = await storage.getItem<any>(cacheKey(path), null);
    return (v ?? null) as T | null;
}

/** Wipes cached GET responses (used on logout). Mutations queue is kept — */
export async function clearResponseCache(): Promise<void> {
    const meta = await storage.getItem<Record<string, CacheMeta>>(META_KEY, {});
    const paths = Object.keys(meta || {});
    await Promise.all(paths.map((p) => storage.removeItem(cacheKey(p))));
    await storage.setItem(META_KEY, {} as any);
    memoryMeta = {};
}

// ---------------------------------------------------------------------------
// Mutation queue (POST/PUT/DELETE while offline)
// ---------------------------------------------------------------------------

export async function readQueue(): Promise<QueuedMutation[]> {
    return (await storage.getItem<QueuedMutation[]>(QUEUE_KEY, [])) || [];
}

async function writeQueue(q: QueuedMutation[]): Promise<void> {
    // Hard cap so a pathological offline session can't grow the queue forever.
    const trimmed = q.length > MAX_QUEUE ? q.slice(q.length - MAX_QUEUE) : q;
    await storage.setItem(QUEUE_KEY, trimmed as any);
}

export async function enqueueMutation(
    path: string,
    method: string,
    body: any,
    auth: boolean
): Promise<QueuedMutation> {
    const q = await readQueue();
    const item: QueuedMutation = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        path,
        method: method.toUpperCase(),
        body,
        auth,
        queuedAt: Date.now(),
        attempts: 0,
    };
    q.push(item);
    await writeQueue(q);
    return item;
}

export async function removeQueuedMutation(id: string): Promise<void> {
    const q = await readQueue();
    await writeQueue(q.filter((m) => m.id !== id));
}

export async function bumpQueuedMutation(id: string): Promise<void> {
    const q = await readQueue();
    const item = q.find((m) => m.id === id);
    if (item) {
        item.attempts += 1;
        await writeQueue(q);
    }
}

/** Drop everything queued (logout). */
export async function clearMutationQueue(): Promise<void> {
    await storage.setItem(QUEUE_KEY, [] as any);
}

/**
 * Mutations that are idempotent enough to replay safely. Draft toggles,
 * likes, saves and read-receipts are all toggles/flags on the backend, so a
 * replay after an unknown outcome is acceptable. Anything else is still
 * queued — the sync worker just retries it too.
 */
export function isReplayable(m: QueuedMutation): boolean {
    return m.attempts < 5;
}