/**
 * Background sync worker.
 *
 * While the device is ONLINE it:
 *   1. Replays mutations that were queued while offline (drafts, likes,
 *      saves, read receipts, profile edits...).
 *   2. Refreshes the core GET endpoints into the offline response cache so
 *      the app has data to show when the user goes offline.
 *   3. Downloads media BYTES (lesson videos, paper PDFs, thumbnails, avatars)
 *      to disk via mediaStore so they play/open with no network.
 *
 * It runs:
 *   - once at app start (after auth resolves),
 *   - whenever connectivity flips offline -> online,
 *   - periodically on an interval while the app is foregrounded,
 *   - when the app returns to the foreground from background.
 *
 * Everything is best-effort and never throws into the UI.
 */

import { AppState, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { api, readToken } from "@/src/api";
import {
    readQueue,
    removeQueuedMutation,
    bumpQueuedMutation,
    hydrateCacheMeta,
    clearMutationQueue,
} from "./offlineCache";
import {
    cacheMediaBytes,
    cacheProfilePhoto,
    readLastUserId,
    readUserData,
    type MediaKind,
} from "./mediaStore";

const SYNC_INTERVAL_MS = 1000 * 60 * 5; // 5 minutes while foregrounded
const MAX_MEDIA_PER_PASS = 6; // don't hammer the network in one pass

/** Endpoints prefetched into the offline cache so screens have data offline. */
const PREFETCH_PATHS: string[] = [
    "/dashboard/stats",
    "/leaderboard",
    "/courses",
    "/notifications",
    "/library/courses",
    "/papers",
    "/exam/structure",
    "/papers/filters",
    "/drafts",
    "/videos/saved",
];

type UserSnapshot = {
    user_id: string;
    profile_photo?: string | null;
    local_photo_uri?: string | null;
};

let running = false;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove(): void } | null = null;
let lastSyncAt = 0;

function kindFromUrl(url: string): MediaKind | null {
    if (/\.(pdf)(\?|$)/i.test(url)) return "pdf";
    if (/\.(mp4|mov|m4v|webm|mkv)(\?|$)/i.test(url)) return "video";
    if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url)) return "image";
    return null;
}

/** Collect every media URL we can find in the cached GET responses. */
async function collectMediaUrls(): Promise<{ url: string; kind: MediaKind }[]> {
    const { readCachedGet } = await import("./offlineCache");
    const out: { url: string; kind: MediaKind }[] = [];
    const seen = new Set<string>();

    const push = (u?: string | null) => {
        if (!u || typeof u !== "string" || !/^https?:\/\//i.test(u)) return;
        if (seen.has(u)) return;
        seen.add(u);
        const kind = kindFromUrl(u);
        if (kind) out.push({ url: u, kind });
    };

    // Course list + details (thumbnails + video urls)
    const courses = await readCachedGet<any[]>("/courses");
    for (const c of courses || []) {
        push(c?.thumbnail);
        push(c?.video_url);
    }

    const library = await readCachedGet<any>("/library/courses");
    for (const c of library?.items || []) {
        push(c?.thumbnail);
        push(c?.video_url);
    }

    // Papers (pdf urls)
    const papers = await readCachedGet<any>("/papers");
    for (const p of papers?.items || papers || []) {
        push(p?.pdf_url);
    }

    // Saved videos
    const saved = await readCachedGet<any[]>("/videos/saved");
    for (const v of saved || []) {
        push(v?.thumbnail);
        push(v?.video_url);
    }

    // Drafts (pdf urls)
    const drafts = await readCachedGet<any[]>("/drafts");
    for (const d of drafts || []) {
        push(d?.pdf_url);
    }

    return out;
}

/** Replays queued mutations against the server. */
async function replayQueue(): Promise<void> {
    const queue = await readQueue();
    if (queue.length === 0) return;

    console.log(`[sync] Replaying ${queue.length} queued mutation(s)`);

    for (const m of queue) {
        try {
            await api(m.path, {
                method: m.method,
                body: m.body,
                auth: m.auth,
            });
            await removeQueuedMutation(m.id);
            console.log(`[sync] Replayed ${m.method} ${m.path}`);
        } catch (err: any) {
            // Server actively rejected (4xx) — drop it; retrying won't help.
            if (err?.status && err.status >= 400 && err.status < 500) {
                console.log(`[sync] Dropping rejected mutation ${m.method} ${m.path}:`, err.message);
                await removeQueuedMutation(m.id);
                continue;
            }
            // Network/5xx — keep it queued for the next pass.
            await bumpQueuedMutation(m.id);
            console.log(`[sync] Mutation ${m.method} ${m.path} still pending:`, err?.message);
            break; // stop this pass; likely still offline
        }
    }
}

/** Refresh core endpoints into the offline response cache. */
async function prefetchData(): Promise<void> {
    for (const path of PREFETCH_PATHS) {
        try {
            // api() already writes successful GETs into the offline cache.
            await api(path, { auth: true });
        } catch {
            // Not fatal — some endpoints may 404 depending on backend version.
            try {
                await api(path, { auth: false });
            } catch {
                /* ignore */
            }
        }
    }
}

/** Download media bytes for everything referenced by cached data. */
async function prefetchMedia(): Promise<void> {
    const urls = await collectMediaUrls();
    let downloaded = 0;

    for (const { url, kind } of urls) {
        if (downloaded >= MAX_MEDIA_PER_PASS) break;
        try {
            const uri = await cacheMediaBytes(url, kind);
            if (uri) downloaded += 1;
        } catch {
            /* ignore individual failures */
        }
    }

    // Profile photo for the last active user.
    try {
        const lastUserId = await readLastUserId();
        if (lastUserId) {
            const user = await readUserData<UserSnapshot>(lastUserId);
            if (user?.profile_photo) {
                await cacheProfilePhoto(lastUserId, user.profile_photo);
            }
        }
    } catch {
        /* ignore */
    }

    if (downloaded > 0) {
        console.log(`[sync] Cached ${downloaded} media file(s)`);
    }
}

async function isOnline(): Promise<boolean> {
    try {
        const state = await NetInfo.fetch();
        return !!(state.isConnected && state.isInternetReachable !== false);
    } catch {
        return true;
    }
}

/** One full sync pass. Safe to call concurrently — it coalesces. */
export async function runSyncPass(reason = "manual"): Promise<void> {
    if (running) return;
    running = true;
    try {
        const token = await readToken();
        if (!token) return; // not signed in — nothing to sync

        if (!(await isOnline())) return;

        console.log(`[sync] Starting pass (${reason})`);
        await replayQueue();
        await prefetchData();
        await prefetchMedia();
        lastSyncAt = Date.now();
        console.log(`[sync] Pass complete (${reason})`);
    } catch (err) {
        console.log("[sync] Pass failed:", err);
    } finally {
        running = false;
    }
}

export function getLastSyncAt(): number {
    return lastSyncAt;
}

/** Start the worker (idempotent). Call once after auth has resolved. */
export function startSyncWorker(): void {
    if (intervalTimer) return; // already running

    void hydrateCacheMeta();

    // Initial pass after a short delay so app startup isn't competing.
    setTimeout(() => void runSyncPass("startup"), 4000);

    intervalTimer = setInterval(() => {
        void runSyncPass("interval");
    }, SYNC_INTERVAL_MS);

    if (Platform.OS !== "web") {
        const sub = AppState.addEventListener("change", (state) => {
            if (state === "active") {
                // Returning to foreground: sync if it's been a while.
                if (Date.now() - lastSyncAt > SYNC_INTERVAL_MS) {
                    void runSyncPass("foreground");
                }
            }
        });
        appStateSub = sub as unknown as { remove(): void };
    }
}

export function stopSyncWorker(): void {
    if (intervalTimer) {
        clearInterval(intervalTimer);
        intervalTimer = null;
    }
    if (appStateSub) {
        appStateSub.remove();
        appStateSub = null;
    }
}

/** Called by AuthProvider when connectivity flips back online. */
export function syncWhenOnline(): void {
    void runSyncPass("back-online");
}

/** Logout helper: drop pending mutations (they belong to the old session). */
export async function resetSyncState(): Promise<void> {
    await clearMutationQueue();
}