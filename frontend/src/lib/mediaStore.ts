import { File, Directory, Paths } from "expo-file-system";

/**
 * All on-device data lives under a single namespaced root, so it behaves
 * like a "package folder" (com.gcsharp) inside the app's private sandbox.
 * Note: apps can't write outside their own sandbox on iOS/Android, so this
 * is a subfolder of Paths.document, not a top-level OS path — that's the
 * closest equivalent to what WhatsApp does per-app.
 *
 * Uses the new expo-file-system SDK 54+ File/Directory API. NOTE: in this
 * SDK, File.text() returns a Promise<string>, so all readers are async.
 */
const ROOT_DIR = new Directory(Paths.document, "com.gcsharp");
const PHOTOS_DIR = new Directory(ROOT_DIR, "profile_photos");
const DATA_DIR = new Directory(ROOT_DIR, "user_data");
const MEDIA_DIR = new Directory(ROOT_DIR, "media"); // videos / pdfs / images

function ensureDir(dir: Directory) {
  try {
    if (!dir.exists) dir.create();
  } catch (err) {
    // Ignore "already exists" races; rethrow anything else.
    if (!dir.exists) console.log("ensureDir failed:", err);
  }
}

export function ensureStorageReady() {
  ensureDir(ROOT_DIR);
  ensureDir(PHOTOS_DIR);
  ensureDir(DATA_DIR);
  ensureDir(MEDIA_DIR);
}

function extFromUrl(url: string) {
  const match = url.split("?")[0].match(/\.(\w+)$/);
  return match ? match[1].toLowerCase() : "jpg";
}

const KNOWN_EXTS = ["jpg", "jpeg", "png", "webp"];

/** Returns the on-device file:// uri for a cached photo, or null if none exists yet. */
export function getLocalPhotoUri(userId: string): string | null {
  for (const ext of KNOWN_EXTS) {
    const file = new File(PHOTOS_DIR, `${userId}.${ext}`);
    if (file.exists) return file.uri;
  }
  return null;
}

/**
 * Downloads the actual image bytes to disk (not just the link) and returns
 * the local file:// uri. Safe to call whenever you're online; it no-ops if
 * a cached copy already exists so it doesn't re-download on every refresh.
 */
export async function cacheProfilePhoto(
  userId: string,
  remoteUrl: string | null | undefined
): Promise<string | null> {
  if (!remoteUrl || !/^https?:\/\//i.test(remoteUrl)) return null;
  ensureStorageReady();
  try {
    const ext = extFromUrl(remoteUrl);
    const dest = new File(PHOTOS_DIR, `${userId}.${ext}`);
    if (dest.exists) return dest.uri;
    const downloaded = await File.downloadFileAsync(remoteUrl, dest);
    return downloaded.uri;
  } catch (err) {
    console.log("cacheProfilePhoto failed:", err);
    return null;
  }
}

/** Force a re-download next time (e.g. user just changed their photo). */
export function invalidateLocalPhoto(userId: string) {
  const uri = getLocalPhotoUri(userId);
  if (uri) {
    try {
      new File(uri).delete();
    } catch { }
  }
}

export function saveUserData(userId: string, data: unknown) {
  ensureStorageReady();
  const file = new File(DATA_DIR, `${userId}.json`);
  file.write(JSON.stringify(data));
}

export async function readUserData<T = any>(userId: string): Promise<T | null> {
  const file = new File(DATA_DIR, `${userId}.json`);
  if (!file.exists) return null;
  try {
    // File.text() is async in expo-file-system SDK 54+.
    return JSON.parse(await file.text()) as T;
  } catch {
    return null;
  }
}

/** Remembers which profile was last active so a cold, offline launch knows who to load. */
export function writeLastUserId(userId: string) {
  ensureStorageReady();
  new File(ROOT_DIR, "last_user.txt").write(userId);
}

export async function readLastUserId(): Promise<string | null> {
  const file = new File(ROOT_DIR, "last_user.txt");
  if (!file.exists) return null;
  try {
    const raw = await file.text();
    return raw ? raw.trim() : null;
  } catch {
    return null;
  }
}

/** Wipes everything under com.gcsharp/ — call this on logout if you want a clean device. */
export function clearAllLocalData() {
  try {
    if (ROOT_DIR.exists) ROOT_DIR.delete();
  } catch { }
}

// ---------------------------------------------------------------------------
// Generic media byte cache (videos, PDFs, images) used by the sync worker.
// ---------------------------------------------------------------------------

export type MediaKind = "video" | "pdf" | "image";

export type MediaManifestEntry = {
  /** Remote http(s) URL the bytes came from. */
  remoteUrl: string;
  /** Local file:// uri of the cached copy. */
  localUri: string;
  kind: MediaKind;
  cachedAt: number;
  bytes: number;
};

type MediaManifest = Record<string, MediaManifestEntry>;

const MANIFEST_FILE = "media_manifest.json";

function mediaKey(url: string): string {
  // Stable, filesystem-safe key for a remote URL.
  let hash = 5381;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) + hash + url.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36) + url.length.toString(36);
}

function extFor(kind: MediaKind, url: string): string {
  const fromUrl = url.split("?")[0].match(/\.(\w{2,5})$/);
  const ext = fromUrl ? fromUrl[1].toLowerCase() : null;
  if (kind === "video") return ext && /^(mp4|mov|m4v|webm|mkv)$/.test(ext) ? ext : "mp4";
  if (kind === "pdf") return "pdf";
  return ext && /^(jpg|jpeg|png|webp|gif)$/.test(ext) ? ext : "jpg";
}

async function readManifest(): Promise<MediaManifest> {
  try {
    const file = new File(DATA_DIR, MANIFEST_FILE);
    if (!file.exists) return {};
    return JSON.parse(await file.text()) as MediaManifest;
  } catch {
    return {};
  }
}

function writeManifest(m: MediaManifest) {
  try {
    ensureDir(DATA_DIR);
    const file = new File(DATA_DIR, MANIFEST_FILE);
    file.write(JSON.stringify(m));
  } catch (err) {
    console.log("writeManifest failed:", err);
  }
}

/** Returns the local file:// uri for a remote URL if its bytes are on disk. */
export async function getLocalMediaUri(url: string): Promise<string | null> {
  const m = await readManifest();
  const entry = m[mediaKey(url)];
  if (!entry) return null;
  try {
    const f = new File(entry.localUri);
    return f.exists ? entry.localUri : null;
  } catch {
    return null;
  }
}

export async function getMediaManifestEntry(url: string): Promise<MediaManifestEntry | null> {
  const m = await readManifest();
  return m[mediaKey(url)] ?? null;
}

export async function listCachedMedia(): Promise<MediaManifestEntry[]> {
  return Object.values(await readManifest());
}

/**
 * Downloads media bytes (video/pdf/image) to disk and records them in the
 * manifest. Skips the download when a copy already exists. Never throws.
 */
export async function cacheMediaBytes(
  remoteUrl: string,
  kind: MediaKind
): Promise<string | null> {
  if (!remoteUrl || !/^https?:\/\//i.test(remoteUrl)) return null;
  ensureStorageReady();
  const key = mediaKey(remoteUrl);

  const manifest = await readManifest();
  const existing = manifest[key];
  if (existing) {
    try {
      const f = new File(existing.localUri);
      if (f.exists) return existing.localUri;
    } catch { }
  }

  try {
    const dest = new File(MEDIA_DIR, `${key}.${extFor(kind, remoteUrl)}`);
    const downloaded = await File.downloadFileAsync(remoteUrl, dest);
    // File objects expose .size on this SDK; fall back to 0 if absent.
    const bytes = (downloaded as any).size ?? 0;
    const m = await readManifest();
    m[key] = {
      remoteUrl,
      localUri: downloaded.uri,
      kind,
      cachedAt: Date.now(),
      bytes,
    };
    writeManifest(m);
    return downloaded.uri;
  } catch (err) {
    console.log(`cacheMediaBytes failed (${kind}):`, err);
    return null;
  }
}

/** Deletes the cached bytes for one remote URL (e.g. video removed server-side). */
export async function deleteCachedMedia(remoteUrl: string) {
  const key = mediaKey(remoteUrl);
  const m = await readManifest();
  const entry = m[key];
  if (entry) {
    try {
      new File(entry.localUri).delete();
    } catch { }
    delete m[key];
    writeManifest(m);
  }
}

/** Total bytes currently used by the media cache. */
export async function mediaCacheBytes(): Promise<number> {
  const m = await readManifest();
  return Object.values(m).reduce((sum, e) => sum + (e.bytes || 0), 0);
}