/**
 * Compose a Learning Feed post (Phase 1 + 7).
 * Text + optional image/short-video upload; created post triggers the
 * GCSharp-model explanation in the background.
 */
import React, { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, ScrollView,
  ActivityIndicator, Alert, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { useTheme } from "@/src/theme-context";
import { radii, spacing, shadow1, type Palette } from "@/src/theme";
import { api, API_BASE, readToken } from "@/src/api";

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

type PickedFile = { uri: string; name: string; mimeType?: string | null; size?: number };

/** Multipart upload to the feed media endpoint (api() only does JSON). */
async function uploadMedia(postId: string, file: PickedFile): Promise<any> {
  const token = await readToken();
  const form = new FormData();
  form.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType || "application/octet-stream",
  } as any);
  const res = await fetch(`${API_BASE}/feed/posts/${postId}/media`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `Upload failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

export default function ComposeScreen() {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [examLevel, setExamLevel] = useState("General");
  const [questionType, setQuestionType] = useState("question");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "video/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const size = (a as any).size ?? 0;
      const isVideo = (a.mimeType || "").startsWith("video/");
      const cap = isVideo ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
      if (size > cap) {
        Alert.alert("File too large",
          isVideo ? "Videos must be 25 MB or smaller."
                  : "Images must be 8 MB or smaller.");
        return;
      }
      setFile({ uri: a.uri, name: a.name || "media",
        mimeType: a.mimeType, size });
    } catch (e: any) {
      Alert.alert("Could not open picker", e?.message || "Please try again.");
    }
  };

  const submit = async () => {
    if (!title.trim() && !body.trim()) {
      setError("Add a title or some content before posting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const post = await api<{ post_id: string }>("/feed/posts", {
        method: "POST",
        body: {
          title: title.trim(), body: body.trim(),
          subject: subject.trim() || "General",
          topic: topic.trim(), exam_level: examLevel,
          question_type: questionType,
        },
      });
      if (file) {
        setUploading(true);
        try {
          await uploadMedia(post.post_id, file);
        } catch (upErr: any) {
          Alert.alert("Post created, but media failed",
            upErr?.message || "Please retry the upload later.");
        }
      }
      router.back();
    } catch (e: any) {
      setError(e?.message || "Could not create the post. Please retry.");
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={t.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>New Post</Text>
        <Pressable
          style={[styles.postBtn, submitting && { opacity: 0.6 }]}
          onPress={submit} disabled={submitting} testID="feed-submit">
          {submitting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.postBtnText}>{uploading ? "Uploading…" : "Post"}</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 14, paddingBottom: 60 }}>
        <TextInput
          style={styles.titleInput} placeholder="Title (e.g. Help with quadratics)"
          placeholderTextColor={t.onSurfaceMuted} value={title}
          onChangeText={setTitle} maxLength={160} testID="feed-title" />
        <TextInput
          style={styles.bodyInput}
          placeholder="Ask your question or explain the concept…"
          placeholderTextColor={t.onSurfaceMuted} value={body}
          onChangeText={setBody} multiline maxLength={4000} testID="feed-body" />

        {/* media picker */}
        {file ? (
          <View style={styles.fileRow}>
            {file.mimeType?.startsWith("image/") ? (
              <Image source={{ uri: file.uri }} style={styles.filePreview} />
            ) : (
              <View style={[styles.filePreview, styles.fileVideoFallback]}>
                <Ionicons name="videocam" size={26} color="#fff" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
              <Text style={styles.fileMeta}>
                {file.mimeType?.startsWith("video/") ? "Short video" : "Image"}
                {file.size ? ` · ${(file.size / (1024 * 1024)).toFixed(1)} MB` : ""}
              </Text>
            </View>
            <Pressable onPress={() => setFile(null)} hitSlop={8}>
              <Ionicons name="close-circle" size={22} color={t.onSurfaceMuted} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.mediaButtons}>
            <Pressable style={styles.mediaBtn} onPress={pickFile} testID="feed-pick-media">
              <Ionicons name="image-outline" size={18} color={t.brandPrimary} />
              <Text style={styles.mediaBtnText}>Image / Video</Text>
            </Pressable>
          </View>
        )}

        <TextInput
          style={styles.input} placeholder="Subject (e.g. Pure Mathematics)"
          placeholderTextColor={t.onSurfaceMuted} value={subject}
          onChangeText={setSubject} maxLength={80} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}>
          {SUBJECT_SUGGESTIONS.map((s) => (
            <Pressable key={s} style={styles.miniChip} onPress={() => setSubject(s)}>
              <Text style={styles.miniChipText}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput
          style={styles.input} placeholder="Topic (optional, e.g. Quadratic equations)"
          placeholderTextColor={t.onSurfaceMuted} value={topic}
          onChangeText={setTopic} maxLength={120} />

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

        <Text style={styles.label}>Type</Text>
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

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.hint}>
          GC AI will attach an explanation with sources after you post.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}


const createStyles = (s: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: s.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: s.divider,
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: s.onSurface },
  postBtn: {
    backgroundColor: s.brandPrimary, paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: radii.pill, minWidth: 64, alignItems: "center", ...shadow1,
  },
  postBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  titleInput: {
    backgroundColor: s.surfaceSecondary, borderRadius: radii.md,
    padding: spacing.md, fontSize: 16, fontWeight: "700", color: s.onSurface,
    borderWidth: 1, borderColor: s.border,
  },
  bodyInput: {
    backgroundColor: s.surfaceSecondary, borderRadius: radii.md,
    padding: spacing.md, fontSize: 15, color: s.onSurface, minHeight: 130,
    textAlignVertical: "top", borderWidth: 1, borderColor: s.border,
  },
  input: {
    backgroundColor: s.surfaceSecondary, borderRadius: radii.md,
    padding: spacing.md, fontSize: 14, color: s.onSurface,
    borderWidth: 1, borderColor: s.border,
  },
  label: { fontSize: 13, fontWeight: "700", color: s.onSurfaceMuted },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill,
    backgroundColor: s.surfaceSecondary, borderWidth: 1, borderColor: s.border,
  },
  chipActive: { backgroundColor: s.brandPrimary, borderColor: s.brandPrimary },
  chipText: { fontSize: 12, color: s.onSurfaceMuted },
  chipTextActive: { color: "#fff", fontWeight: "700" },
  miniChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill,
    backgroundColor: s.brandTertiary,
  },
  miniChipText: { fontSize: 11, color: s.onBrandTertiary },
  mediaButtons: { flexDirection: "row", gap: 10 },
  mediaBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: s.surfaceSecondary, borderWidth: 1, borderColor: s.border,
    borderStyle: "dashed", paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: radii.md,
  },
  mediaBtnText: { fontSize: 13, color: s.brandPrimary, fontWeight: "600" },
  fileRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: s.surfaceSecondary, borderRadius: radii.md,
    padding: spacing.sm, borderWidth: 1, borderColor: s.border,
  },
  filePreview: { width: 56, height: 56, borderRadius: radii.sm },
  fileVideoFallback: {
    backgroundColor: s.brandSecondary, alignItems: "center", justifyContent: "center",
  },
  fileName: { fontSize: 13, fontWeight: "600", color: s.onSurface },
  fileMeta: { fontSize: 11, color: s.onSurfaceMuted, marginTop: 2 },
  error: { fontSize: 13, color: s.error },
  hint: { fontSize: 11, color: s.onSurfaceMuted, textAlign: "center", marginTop: 4 },
});


