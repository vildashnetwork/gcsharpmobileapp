/**
 * Compose / edit a Learning Feed post — redesigned.
 *
 * - Media first: two big tiles (photo / video) with size hints.
 * - Real upload progress (XMLHttpRequest) with percentage, cancel and retry.
 * - Sticky bottom Post button that shows upload progress inside it.
 * - Keyboard-safe layout, discard confirmation, character counter.
 * - Post records are only saved after Cloudinary returns a secure URL.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, ScrollView,
  ActivityIndicator, Alert, Image, Platform, KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { useTheme } from "@/src/theme-context";
import { radii, spacing, type Palette } from "@/src/theme";
import { api } from "@/src/api";

const QUESTION_TYPES = [
  { key: "question", label: "Question" },
  { key: "concept", label: "Concept" },
  { key: "past_paper", label: "Past paper" },
  { key: "discussion", label: "Discussion" },
  { key: "note", label: "Note" },
];
const EXAM_LEVELS = ["GCE O Level", "GCE A Level", "HND", "Concours", "General"];
const SUBJECT_SUGGESTIONS = [
  "Pure Mathematics", "Applied Mathematics", "Physics", "Chemistry",
  "Biology", "Economics", "Geography", "History", "English", "Literature",
];

const CLOUDINARY_CLOUD_NAME =
  process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || "qsmemy5r";
const CLOUDINARY_UPLOAD_PRESET =
  process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "gcsharp";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "webm", "3gp"];
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

type PickedFile = { uri: string; name: string; mimeType?: string | null; size?: number };
type UploadedMedia = { type: "image" | "video"; url: string; name: string };

const FILE_MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", mp4: "video/mp4", m4v: "video/mp4", "3gp": "video/3gpp",
  mov: "video/quicktime", webm: "video/webm",
};
const MIME_FILE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/gif": "gif", "video/mp4": "mp4", "video/quicktime": "mov",
  "video/webm": "webm", "video/3gpp": "3gp",
};

class UploadCancelled extends Error {
  constructor() { super("Upload cancelled"); this.name = "UploadCancelled"; }
}

type FeedPostWriteResult = {
  post_id?: string;
  media?: UploadedMedia[];
  __offlineQueued?: boolean;
};

type CancelHandle = { cancel: () => void };

/**
 * Uploads to Cloudinary with real progress.
 *
 * Native: React Native's own networking layer reads the file straight from the
 * picker URI (file:// or content://), so no expo-file-system File object (and
 * no READ permission) is involved. XMLHttpRequest is used because fetch()
 * cannot report upload progress.
 * Web: plain fetch (no percentage).
 */
async function uploadMediaToCloudinary(
  file: PickedFile,
  onProgress: (percent: number) => void,
  cancelRef: React.MutableRefObject<CancelHandle | null>,
): Promise<UploadedMedia> {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const mimeType = FILE_MIME_TYPES[extension] || file.mimeType || "application/octet-stream";
  const type: UploadedMedia["type"] = mimeType.startsWith("video/") ? "video" : "image";
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${type}/upload`;

  const parse = (status: number, text: string): UploadedMedia => {
    let data: any = null;
    try { data = JSON.parse(text); } catch { }
    if (status >= 200 && status < 300 && typeof data?.secure_url === "string") {
      onProgress(100);
      return { type, url: data.secure_url, name: file.name };
    }
    throw new Error(data?.error?.message || `Upload failed (${status}).`);
  };

  const form = new FormData();
  form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  if (Platform.OS === "web") {
    const controller = new AbortController();
    cancelRef.current = { cancel: () => controller.abort() };
    try {
      const blob = await (await fetch(file.uri, { signal: controller.signal })).blob();
      form.append("file", blob, file.name);
      const res = await fetch(endpoint, { method: "POST", body: form, signal: controller.signal });
      return parse(res.status, await res.text());
    } catch (e) {
      if (controller.signal.aborted) throw new UploadCancelled();
      throw e;
    } finally {
      cancelRef.current = null;
    }
  }

  // some pickers return a bare path; React Native needs a scheme
  const uri = file.uri.startsWith("/") ? `file://${file.uri}` : file.uri;
  form.append("file", { uri, name: file.name, type: mimeType } as any);

  return new Promise<UploadedMedia>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    cancelRef.current = { cancel: () => xhr.abort() };
    xhr.open("POST", endpoint);
    xhr.timeout = 5 * 60 * 1000;
    // Do not set Content-Type: the multipart boundary is added automatically.

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      cancelRef.current = null;
      try { resolve(parse(xhr.status, xhr.responseText)); } catch (err) { reject(err); }
    };
    xhr.onerror = () => {
      cancelRef.current = null;
      reject(new Error("Could not send the file. Check your connection and try again."));
    };
    xhr.ontimeout = () => {
      cancelRef.current = null;
      reject(new Error("The upload took too long. Try a smaller file or a better connection."));
    };
    xhr.onabort = () => {
      cancelRef.current = null;
      reject(new UploadCancelled());
    };
    xhr.send(form);
  });
}

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function ComposeScreen() {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const router = useRouter();
  const params = useLocalSearchParams<{
    paperScan?: string; mediaType?: string; postId?: string;
  }>();
  const autoOpenedPicker = useRef(false);
  const cancelRef = useRef<CancelHandle | null>(null);
  const createdPostIdRef = useRef<string | null>(null);
  const postId = params.postId;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [examLevel, setExamLevel] = useState("General");
  const [questionType, setQuestionType] = useState(
    params.paperScan === "true" ? "past_paper" : "question");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingPost, setLoadingPost] = useState(!!postId);
  const [postLoadFailed, setPostLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = submitting || loadingPost;
  const isVideo = !!file && (file.mimeType?.startsWith("video/") ?? false);
  const hasContent = !!(title.trim() || body.trim() || file);
  const canPost = !busy && !postLoadFailed && !!(title.trim() || body.trim());

  const pickFile = useCallback(async (kind: "image" | "video" | "any" = "any") => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: kind === "image"
          ? ["image/jpeg", "image/png", "image/webp", "image/gif"]
          : kind === "video"
            ? ["video/*"]
            : ["image/*", "video/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const size = (a as any).size ?? 0;
      const mimeType = (a.mimeType || "").toLowerCase();
      const existingExtension = a.name.includes(".")
        ? a.name.split(".").pop()?.toLowerCase() || ""
        : "";
      const extension = existingExtension || MIME_FILE_EXTENSIONS[mimeType] || "";
      const video = VIDEO_EXTENSIONS.includes(extension) || mimeType.startsWith("video/");
      const validVideo = VIDEO_EXTENSIONS.includes(extension);
      const validImage = IMAGE_EXTENSIONS.includes(extension);
      if ((video && !validVideo) || (!video && !validImage)) {
        Alert.alert("Unsupported file",
          "Use a JPG, PNG, WEBP or GIF image, or an MP4, MOV, M4V, WEBM or 3GP video.");
        return;
      }
      if (size > (video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) {
        Alert.alert("File too large",
          video ? "Videos must be 25 MB or smaller." : "Images must be 8 MB or smaller.");
        return;
      }
      const name = a.name?.includes(".") ? a.name : `${a.name || "media"}.${extension}`;
      setFile({
        uri: a.uri, name,
        mimeType: FILE_MIME_TYPES[extension] || a.mimeType, size,
      });
      setUploadedMedia(null);
      setProgress(0);
      setError(null);
    } catch (e: any) {
      Alert.alert("Could not open the picker", e?.message || "Please try again.");
    }
  }, []);

  // open the picker straight away when arriving from "Snap paper" / "Video"
  useEffect(() => {
    const mediaType = params.paperScan === "true" ? "image" : params.mediaType;
    if ((mediaType !== "image" && mediaType !== "video") || autoOpenedPicker.current) return;
    autoOpenedPicker.current = true;
    void pickFile(mediaType);
  }, [params.mediaType, params.paperScan, pickFile]);

  // load the post when editing
  useEffect(() => {
    if (!postId) return;
    let active = true;
    api<{
      title: string; body: string; subject: string; topic: string;
      exam_level: string; question_type: string;
    }>(`/feed/posts/${postId}`)
      .then((post) => {
        if (!active) return;
        setTitle(post.title || "");
        setBody(post.body || "");
        setSubject(post.subject || "");
        setTopic(post.topic || "");
        setExamLevel(post.exam_level || "General");
        setQuestionType(post.question_type || "question");
      })
      .catch((e: any) => {
        if (!active) return;
        setPostLoadFailed(true);
        setError(e?.message || "Could not load this post to edit.");
      })
      .finally(() => { if (active) setLoadingPost(false); });
    return () => { active = false; };
  }, [postId]);

  // abort any running upload if the screen closes
  useEffect(() => () => { cancelRef.current?.cancel(); }, []);

  const removeFile = () => {
    setFile(null);
    setUploadedMedia(null);
    setProgress(0);
  };

  const cancelUpload = () => { cancelRef.current?.cancel(); };

  const close = () => {
    if (submitting && uploading) {
      Alert.alert("Cancel upload?", "Your upload is still in progress.", [
        { text: "Keep uploading", style: "cancel" },
        { text: "Cancel upload", style: "destructive", onPress: () => { cancelUpload(); router.back(); } },
      ]);
      return;
    }
    if (!postId && hasContent) {
      Alert.alert("Discard this post?", "What you wrote will be lost.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => router.back() },
      ]);
      return;
    }
    router.back();
  };

  const submit = async () => {
    if (!canPost) {
      if (!loadingPost && !postLoadFailed) {
        setError("Add a title or some details before posting.");
      }
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(), body: body.trim(),
        subject: subject.trim() || "General",
        topic: topic.trim(), exam_level: examLevel,
        question_type: questionType,
      };
      let media = uploadedMedia || undefined;
      if (!media && file) {
        setUploading(true);
        setProgress(0);
        media = await uploadMediaToCloudinary(file, setProgress, cancelRef);
        setUploadedMedia(media);
        setUploading(false);
      }
      // after a failed attempt that already created the post, update it instead of duplicating
      const existingPostId = postId || createdPostIdRef.current;
      if (existingPostId) {
        const updated = await api<FeedPostWriteResult>(`/feed/posts/${existingPostId}`, {
          method: "PATCH",
          body: { ...payload, ...(media ? { media: [media] } : {}) },
        });
        if (media && !updated.__offlineQueued
          && !updated.media?.some((item) => item.url === media?.url)) {
          throw new Error(
            "Your file uploaded, but the feed API did not return it with the post. " +
            "Deploy the latest feed backend before retrying.");
        }
      } else {
        const created = await api<FeedPostWriteResult>("/feed/posts", {
          method: "POST",
          body: { ...payload, media: media ? [media] : [] },
        });
        if (created.post_id) createdPostIdRef.current = created.post_id;
        if (media && !created.__offlineQueued
          && !created.media?.some((item) => item.url === media?.url)) {
          throw new Error(
            "Your file uploaded, but the feed API did not save it with the post. " +
            "The post may exist without its attachment; deploy the latest feed backend before retrying.");
        }
      }
      router.back();
    } catch (e: any) {
      if (e?.name === "UploadCancelled") {
        setProgress(0);
      } else {
        setError(e?.message || "Could not upload media or save the post. Please try again.");
      }
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const buttonLabel = uploading
    ? (progress >= 100 ? "Processing…" : progress > 0 ? `Uploading ${progress}%` : "Uploading…")
    : submitting ? "Posting…"
      : postId ? "Save changes" : "Post question";

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={close} hitSlop={10} style={styles.closeBtn}
          accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={t.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{postId ? "Edit post" : "Ask a question"}</Text>
        <View style={styles.closeBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {loadingPost && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={t.brandPrimary} />
              <Text style={styles.loadingText}>Loading your post…</Text>
            </View>
          )}

          {/* 1. media */}
          {file ? (
            <View style={styles.preview}>
              {isVideo ? (
                <View style={[styles.previewMedia, styles.previewVideo]}>
                  <View style={styles.playCircle}>
                    <Ionicons name="play" size={26} color="#fff" />
                  </View>
                  <Text style={styles.previewVideoName} numberOfLines={1}>{file.name}</Text>
                </View>
              ) : (
                <Image source={{ uri: file.uri }} style={styles.previewMedia} resizeMode="cover" />
              )}

              {/* top-right remove */}
              {!submitting && (
                <Pressable style={styles.removeBtn} onPress={removeFile} hitSlop={8}
                  accessibilityRole="button" accessibilityLabel="Remove attachment">
                  <Ionicons name="close" size={18} color="#fff" />
                </Pressable>
              )}

              {/* uploading overlay */}
              {uploading && (
                <View style={styles.uploadOverlay}>
                  {progress > 0
                    ? <Text style={styles.uploadPercent}>{progress}%</Text>
                    : <ActivityIndicator size="large" color="#fff" />}
                  <View style={styles.uploadTrack}>
                    <View style={[styles.uploadFill, { width: `${progress}%` }]} />
                  </View>
                  <Text style={styles.uploadHint}>
                    {progress >= 100 ? "Processing your file…" : "Uploading…"}
                  </Text>
                  <Pressable style={styles.cancelBtn} onPress={cancelUpload}
                    accessibilityRole="button">
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </Pressable>
                </View>
              )}

              {/* bottom info bar */}
              {!uploading && (
                <View style={styles.previewBar}>
                  <Ionicons
                    name={uploadedMedia ? "checkmark-circle" : isVideo ? "videocam" : "image"}
                    size={16} color="#fff" />
                  <Text style={styles.previewBarText} numberOfLines={1}>
                    {uploadedMedia ? "Uploaded · " : ""}
                    {isVideo ? "Video" : "Photo"}
                    {file.size ? ` · ${formatSize(file.size)}` : ""}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.tiles}>
              <Pressable style={styles.tile} onPress={() => pickFile("image")}
                testID="feed-pick-image" accessibilityRole="button">
                <View style={styles.tileIcon}>
                  <Ionicons name="image" size={24} color={t.brandPrimary} />
                </View>
                <Text style={styles.tileTitle}>Add photo</Text>
                <Text style={styles.tileHint}>JPG, PNG · up to 8 MB</Text>
              </Pressable>
              <Pressable style={styles.tile} onPress={() => pickFile("video")}
                testID="feed-pick-video" accessibilityRole="button">
                <View style={styles.tileIcon}>
                  <Ionicons name="videocam" size={24} color={t.brandPrimary} />
                </View>
                <Text style={styles.tileTitle}>Add video</Text>
                <Text style={styles.tileHint}>MP4, MOV · up to 25 MB</Text>
              </Pressable>
            </View>
          )}

          {/* 2. question */}
          <View style={styles.card}>
            <TextInput
              style={styles.titleInput}
              placeholder="What do you need help with?"
              placeholderTextColor={t.onSurfaceMuted}
              value={title} onChangeText={setTitle} maxLength={160}
              editable={!submitting} testID="feed-title"
              returnKeyType="next" />
            <View style={styles.divider} />
            <TextInput
              style={styles.bodyInput}
              placeholder="Add details: what you tried, where you got stuck…"
              placeholderTextColor={t.onSurfaceMuted}
              value={body} onChangeText={setBody} multiline maxLength={4000}
              editable={!submitting} testID="feed-body" />
            <Text style={styles.counter}>{body.length}/4000</Text>
          </View>

          {/* 3. subject */}
          <Text style={styles.label}>Subject</Text>
          <TextInput
            style={styles.input} placeholder="e.g. Pure Mathematics"
            placeholderTextColor={t.onSurfaceMuted} value={subject}
            onChangeText={setSubject} maxLength={80} editable={!submitting} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.suggestRow}>
            {SUBJECT_SUGGESTIONS.map((s) => {
              const active = subject === s;
              return (
                <Pressable key={s}
                  style={[styles.suggest, active && styles.suggestActive]}
                  onPress={() => setSubject(active ? "" : s)}>
                  <Text style={[styles.suggestText, active && styles.suggestTextActive]}>{s}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>Topic <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput
            style={styles.input} placeholder="e.g. Quadratic equations"
            placeholderTextColor={t.onSurfaceMuted} value={topic}
            onChangeText={setTopic} maxLength={120} editable={!submitting} />

          {/* 4. level + type */}
          <Text style={styles.label}>Exam level</Text>
          <View style={styles.chipWrap}>
            {EXAM_LEVELS.map((lv) => (
              <Pressable key={lv}
                style={[styles.chip, examLevel === lv && styles.chipActive]}
                onPress={() => setExamLevel(lv)}>
                <Text style={[styles.chipText, examLevel === lv && styles.chipTextActive]}>
                  {lv}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Post type</Text>
          <View style={styles.chipWrap}>
            {QUESTION_TYPES.map((q) => (
              <Pressable key={q.key}
                style={[styles.chip, questionType === q.key && styles.chipActive]}
                onPress={() => setQuestionType(q.key)}>
                <Text style={[styles.chipText,
                questionType === q.key && styles.chipTextActive]}>{q.label}</Text>
              </Pressable>
            ))}
          </View>

          {!!error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={t.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.aiNote}>
            <Ionicons name="sparkles" size={16} color={t.brandPrimary} />
            <Text style={styles.aiNoteText}>
              GCSharp AI will add an explanation with sources after you post.
            </Text>
          </View>
        </ScrollView>

        {/* sticky post button */}
        <View style={styles.footer}>
          <Pressable
            style={[styles.postBtn, !canPost && !submitting && styles.postBtnDisabled]}
            onPress={submit} disabled={busy} testID="feed-submit"
            accessibilityRole="button" accessibilityLabel={buttonLabel}>
            {uploading && (
              <View style={[styles.postFill, { width: `${progress}%` }]} />
            )}
            <View style={styles.postContent}>
              {(submitting && !uploading) || loadingPost ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : null}
              <Text style={styles.postBtnText}>{buttonLabel}</Text>
            </View>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (s: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: s.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.sm, height: 52,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: s.divider,
  },
  closeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: s.onSurface },

  scroll: { padding: spacing.md, gap: 12, paddingBottom: 32 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  loadingText: { fontSize: 13, color: s.onSurfaceMuted },

  // media tiles
  tiles: { flexDirection: "row", gap: 12 },
  tile: {
    flex: 1, alignItems: "center", gap: 6, paddingVertical: 20, paddingHorizontal: 10,
    borderRadius: 20, backgroundColor: s.surfaceSecondary,
    borderWidth: 1.5, borderColor: s.border, borderStyle: "dashed",
  },
  tileIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: s.brandTertiary,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  tileTitle: { fontSize: 15, fontWeight: "800", color: s.onSurface },
  tileHint: { fontSize: 12, color: s.onSurfaceMuted },

  // media preview
  preview: { borderRadius: 20, overflow: "hidden", backgroundColor: s.surfaceTertiary },
  previewMedia: { width: "100%", height: 220 },
  previewVideo: {
    backgroundColor: "#1E293B", alignItems: "center", justifyContent: "center", gap: 10,
  },
  playCircle: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: s.brandPrimary,
    alignItems: "center", justifyContent: "center", paddingLeft: 3,
  },
  previewVideoName: { color: "#fff", fontSize: 13, fontWeight: "600", maxWidth: "80%" },
  removeBtn: {
    position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center",
  },
  previewBar: {
    position: "absolute", left: 10, bottom: 10, flexDirection: "row",
    alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radii.pill, backgroundColor: "rgba(0,0,0,0.6)", maxWidth: "80%",
  },
  previewBarText: { color: "#fff", fontSize: 12, fontWeight: "700", flexShrink: 1 },
  uploadOverlay: {
    ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32,
  },
  uploadPercent: { color: "#fff", fontSize: 40, fontWeight: "800", letterSpacing: -1 },
  uploadTrack: {
    alignSelf: "stretch", height: 8, borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden",
  },
  uploadFill: { height: 8, borderRadius: 4, backgroundColor: "#fff" },
  uploadHint: { color: "#fff", fontSize: 13, opacity: 0.9 },
  cancelBtn: {
    marginTop: 4, paddingHorizontal: 18, paddingVertical: 8, borderRadius: radii.pill,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.6)",
  },
  cancelBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // question card
  card: {
    borderRadius: 20, backgroundColor: s.surfaceSecondary,
    borderWidth: 1, borderColor: s.border, padding: spacing.md,
  },
  titleInput: {
    fontSize: 18, fontWeight: "800", color: s.onSurface, paddingVertical: 6,
    letterSpacing: -0.2,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: s.divider, marginVertical: 8 },
  bodyInput: {
    fontSize: 15, color: s.onSurface, minHeight: 110, lineHeight: 22,
    textAlignVertical: "top", paddingVertical: 4,
  },
  counter: { alignSelf: "flex-end", fontSize: 11, color: s.onSurfaceMuted, marginTop: 4 },

  // details
  label: { fontSize: 13, fontWeight: "700", color: s.onSurface, marginTop: 8 },
  optional: { fontWeight: "500", color: s.onSurfaceMuted },
  input: {
    minHeight: 48, paddingHorizontal: 14, borderRadius: 14, fontSize: 15,
    color: s.onSurface, backgroundColor: s.surfaceSecondary,
    borderWidth: 1, borderColor: s.border,
  },
  suggestRow: { gap: 8, paddingRight: 8 },
  suggest: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill,
    backgroundColor: s.brandTertiary,
  },
  suggestActive: { backgroundColor: s.brandPrimary },
  suggestText: { fontSize: 12, fontWeight: "600", color: s.onBrandTertiary },
  suggestTextActive: { color: "#fff" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.pill,
    backgroundColor: s.surfaceSecondary, borderWidth: 1, borderColor: s.border,
  },
  chipActive: { backgroundColor: s.brandPrimary, borderColor: s.brandPrimary },
  chipText: { fontSize: 13, color: s.onSurface, fontWeight: "600" },
  chipTextActive: { color: "#fff", fontWeight: "700" },

  errorBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12,
    borderRadius: 14, backgroundColor: s.surfaceTertiary, marginTop: 4,
  },
  errorText: { flex: 1, fontSize: 13, color: s.error, lineHeight: 18 },
  aiNote: {
    flexDirection: "row", alignItems: "center", gap: 8, padding: 12,
    borderRadius: 14, backgroundColor: s.brandTertiary, marginTop: 4,
  },
  aiNoteText: { flex: 1, fontSize: 13, color: s.onBrandTertiary, lineHeight: 18 },

  // sticky footer
  footer: {
    paddingHorizontal: spacing.md, paddingTop: 10, paddingBottom: 10,
    backgroundColor: s.surface,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: s.divider,
  },
  postBtn: {
    height: 54, borderRadius: 27, overflow: "hidden",
    alignItems: "center", justifyContent: "center", backgroundColor: s.brandPrimary,
  },
  postBtnDisabled: { opacity: 0.45 },
  postFill: {
    position: "absolute", left: 0, top: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  postContent: { flexDirection: "row", alignItems: "center", gap: 10 },
  postBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});