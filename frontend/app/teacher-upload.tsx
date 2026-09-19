import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, ScrollView, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
import { api } from "@/src/api";

const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || "qsmemy5r";
const CLOUDINARY_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "gcsharp";

const LEVELS = ["GCE O", "GCE A", "HND", "Concours", "ITVEE", "ATVEE", "Baccalaureate", "Other"];

export default function TeacherUpload() {
  useTheme(); // re-render this screen when light/dark changes
  const router = useRouter();
  const [tab, setTab] = useState<"mine" | "upload">("mine");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [level, setLevel] = useState("GCE A");
  const [videoUrl, setVideoUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  // ---- My uploads: list / edit / delete ----
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mine, setMine] = useState<any[]>([]);
  const [mineLoading, setMineLoading] = useState(true);
  const [mineErr, setMineErr] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadMine = useCallback(async () => {
    setMineLoading(true);
    setMineErr(null);
    try {
      const data = await api<{ items?: any[] }>("/teacher/lessons");
      setMine(data.items || []);
    } catch (e: any) {
      setMineErr(e.message || "Could not load your uploads");
    } finally {
      setMineLoading(false);
    }
  }, []);

  useEffect(() => { loadMine(); }, [loadMine]);
  // Refresh every time the teacher lands on this tab (e.g. after publish)
  useFocusEffect(useCallback(() => { loadMine(); }, [loadMine]));

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setSubjectName("");
    setLevel("GCE A");
    setVideoUrl("");
    setDuration("");
    setFileName(null);
    setEditingId(null);
    setErr(null);
    setOk(false);
  };

  const startEdit = (lesson: any) => {
    setEditingId(lesson.lesson_id);
    setTitle(lesson.title || "");
    setDescription(lesson.description || "");
    setSubjectName(lesson.subject_name || "");
    setLevel(lesson.exam_level || "GCE A");
    setVideoUrl(lesson.video_url || "");
    setDuration(lesson.duration || "");
    setFileName(null);
    setErr(null);
    setOk(false);
    setTab("upload");
  };

  const cancelEdit = () => resetForm();

  const confirmDelete = (lesson: any) => {
    Alert.alert(
      "Delete lesson?",
      `"${lesson.title}" will be permanently removed for all students.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            setActingId(lesson.lesson_id);
            try {
              await api(`/lessons/${lesson.lesson_id}`, { method: "DELETE" });
              setMine((prev) => prev.filter((l) => l.lesson_id !== lesson.lesson_id));
              if (editingId === lesson.lesson_id) resetForm();
            } catch (e: any) {
              Alert.alert("Delete failed", e.message || "Could not delete this lesson");
            } finally {
              setActingId(null);
            }
          },
        },
      ]
    );
  };

  const pickVideoFile = async () => {
    setErr(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["video/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      setFileName(asset.name ?? "Selected video");
      setUploadingFile(true);
      setUploadPct(null);
      const url = await uploadToCloudinary(asset.uri, asset.name ?? "lesson.mp4", asset.mimeType ?? "video/mp4");
      setVideoUrl(url);
      setFileName(asset.name ?? "Video uploaded");
    } catch (e: any) {
      setErr(e.message || "Could not upload that video to ");
    } finally {
      setUploadingFile(false);
      setUploadPct(null);
    }
  };

  const uploadToCloudinary = async (uri: string, name: string, mimeType: string): Promise<string> => {
    const data = new FormData();
    // React Native FormData file shape
    data.append("file", { uri, name, type: mimeType } as any);
    data.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    const xhr = await new Promise<string>((resolve, reject) => {
      const req = new XMLHttpRequest();
      req.open("POST", `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`);
      req.onload = () => {
        try {
          const json = JSON.parse(req.responseText || "{}");
          if (req.status >= 200 && req.status < 300 && json.secure_url) resolve(json.secure_url);
          else reject(new Error(json?.error?.message || ` upload failed (${req.status})`));
        } catch (err: any) {
          reject(new Error(err?.message || " upload failed"));
        }
      };
      req.onerror = () => reject(new Error("Network error during  upload"));
      if (req.upload) {
        req.upload.onprogress = (ev: any) => {
          if (ev?.lengthComputable && ev.total > 0) {
            setUploadPct(Math.round((ev.loaded / ev.total) * 100));
          }
        };
      }
      req.send(data as any);
    });
    return xhr;
  };

  const submit = async () => {
    setErr(null);
    if (!title || !description || !subjectName || !videoUrl) {
      setErr("Please fill in all required fields");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title, description, subject_name: subjectName,
        exam_level: level, video_url: videoUrl, duration,
      };
      if (editingId) {
        await api(`/lessons/${editingId}`, { method: "PUT", body: payload });
        setOk(true);
        await loadMine();
        setTimeout(() => { setOk(false); setTab("mine"); resetForm(); }, 800);
      } else {
        await api("/lessons", { method: "POST", body: payload });
        setOk(true);
        await loadMine();
        setTimeout(() => { setOk(false); setTab("mine"); resetForm(); }, 900);
      }
    } catch (e: any) {
      setErr(e.message || (editingId ? "Update failed" : "Upload failed"));
    } finally { setBusy(false); }
  };

  const renderMineTab = () => {
    if (mineLoading) {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.brandPrimary} />
          <Text style={styles.muted}>Loading your uploads…</Text>
        </View>
      );
    }
    if (mineErr) {
      return (
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={40} color={theme.error} />
          <Text style={styles.err}>{mineErr}</Text>
          <Pressable style={styles.retryBtn} onPress={loadMine} testID="retry-mine">
            <Text style={styles.retryTxt}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    if (mine.length === 0) {
      return (
        <View style={styles.centerBox}>
          <Ionicons name="cloud-upload-outline" size={44} color={theme.onSurfaceMuted} />
          <Text style={styles.emptyT}>No lessons yet</Text>
          <Text style={styles.muted}>Your published lessons will appear here where you can edit or delete them.</Text>
          <Pressable style={styles.submit} onPress={() => setTab("upload")} testID="go-upload">
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.submitTxt}>Upload your first lesson</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {mine.map((lesson) => (
          <View key={lesson.lesson_id} style={styles.card} testID={`lesson-${lesson.lesson_id}`}>
            {lesson.thumbnail ? (
              <Image source={{ uri: lesson.thumbnail }} style={styles.thumb} resizeMode="cover" />
            ) : null}
            <View style={{ gap: 4, flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={2}>{lesson.title}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {[lesson.subject_name, lesson.exam_level].filter(Boolean).join(" • ")}
                {typeof lesson.views === "number" ? `  ·  ${lesson.views} views` : ""}
              </Text>
              <Text style={styles.cardDesc} numberOfLines={2}>{lesson.description}</Text>
              <View style={styles.cardActions}>
                <Pressable style={styles.editBtn} onPress={() => startEdit(lesson)} testID={`edit-${lesson.lesson_id}`}>
                  <Ionicons name="create-outline" size={16} color={theme.brand} />
                  <Text style={styles.editTxt}>Edit</Text>
                </Pressable>
                <Pressable
                  style={styles.delBtn}
                  onPress={() => confirmDelete(lesson)}
                  disabled={actingId === lesson.lesson_id}
                  testID={`delete-${lesson.lesson_id}`}
                >
                  {actingId === lesson.lesson_id
                    ? <ActivityIndicator size="small" color={theme.error} />
                    : <><Ionicons name="trash-outline" size={16} color={theme.error} /><Text style={styles.delTxt}>Delete</Text></>}
                </Pressable>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderFormTab = () => (
    <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
      {editingId ? (
        <View style={styles.editingBanner}>
          <Ionicons name="create-outline" size={16} color={theme.brand} />
          <Text style={styles.editingTxt}>Editing lesson — changes go live for students on save.</Text>
          <Pressable onPress={cancelEdit} testID="cancel-edit" hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.onSurfaceMuted} />
          </Pressable>
        </View>
      ) : null}
      <Field label="Title" testID="in-title" value={title} onChange={setTitle} placeholder="e.g. Integration by Parts — 5-Minute Masterclass" />
      <Field label="Description" testID="in-desc" value={description} onChange={setDescription} placeholder="What will students learn?" multiline />
      <Field label="Subject" testID="in-subject" value={subjectName} onChange={setSubjectName} placeholder="Pure Mathematics" />

      <Text style={styles.label}>Exam level</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {LEVELS.map((l) => (
          <Pressable
            key={l}
            testID={`level-${l}`}
            onPress={() => setLevel(l)}
            style={[styles.chip, level === l && styles.chipActive]}
          >
            <Text style={[styles.chipTxt, level === l && styles.chipTxtActive]}>{l}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* <Field label="Video URL" testID="in-url" value={videoUrl} onChange={setVideoUrl} placeholder="https://... (YouTube, MP4, HLS) — or pick a file below" autoCap="none" /> */}
      <Text style={styles.pickHint} />
      <Pressable
        style={[styles.pickBtn, uploadingFile && { opacity: 0.7 }]}
        onPress={pickVideoFile}
        disabled={uploadingFile}
        testID="pick-video-file"
      >
        {uploadingFile ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="videocam-outline" size={18} color="#fff" />
            <Text style={styles.pickBtnTxt}>
              {uploadPct !== null ? `Uploading… ${uploadPct}%` : fileName ? `Change video (${fileName})` : "Pick video file from device"}
            </Text>
          </>
        )}
      </Pressable>
      <Text style={styles.pickHint} />
      <Field label="Duration (optional)" testID="in-duration" value={duration} onChange={setDuration} placeholder="10:00" />

      {err ? <Text style={styles.err}>{err}</Text> : null}
      {ok ? <Text style={styles.ok}>✓ Uploaded! Redirecting…</Text> : null}

      <Pressable style={[styles.submit, busy && { opacity: 0.7 }]} onPress={submit} disabled={busy} testID="submit-lesson">
        {busy ? <ActivityIndicator color="#fff" /> : (
          <>
            <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
            <Text style={styles.submitTxt}>{editingId ? "Save changes" : "Publish lesson"}</Text>
          </>
        )}
      </Pressable>
    </KeyboardAwareScrollView>
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="teacher-upload-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-btn"><Ionicons name="arrow-back" size={22} color={theme.brand} /></Pressable>
        <Text style={styles.title}>{editingId ? "Edit Lesson" : "Upload Lesson"}</Text>
        <View style={{ width: 22 }} />
      </View>
      <View style={styles.tabbar}>
        <Pressable
          style={[styles.tabBtn, tab === "mine" && styles.tabBtnActive]}
          onPress={() => setTab("mine")}
          testID="tab-mine"
        >
          <Text style={[styles.tabTxt, tab === "mine" && styles.tabTxtActive]}>My uploads ({mine.length})</Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, tab === "upload" && styles.tabBtnActive]}
          onPress={() => { resetForm(); setTab("upload"); }}
          testID="tab-upload"
        >
          <Text style={[styles.tabTxt, tab === "upload" && styles.tabTxtActive]}>{editingId ? "Edit" : "New upload"}</Text>
        </Pressable>
      </View>
      <View style={styles.content}>
        {tab === "mine" ? renderMineTab() : renderFormTab()}
      </View>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, placeholder, multiline, testID, autoCap = "sentences" }: any) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.onSurfaceMuted}
        multiline={multiline}
        autoCapitalize={autoCap}
        style={[styles.input, multiline && { minHeight: 88, textAlignVertical: "top" }]}
      />
    </View>
  );
}

const createStyles = (t: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: t.brand },
  label: { color: t.onSurfaceMuted, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
  input: {
    borderWidth: 1, borderColor: t.border, backgroundColor: t.surfaceSecondary,
    paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radii.md,
    fontSize: 15, color: t.onSurface,
  },
  chip: { flexShrink: 0, paddingHorizontal: 16, height: 36, borderRadius: radii.pill, borderWidth: 1, borderColor: t.border, backgroundColor: t.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  chipActive: { borderColor: t.brandPrimary, backgroundColor: t.brandTertiary },
  chipTxt: { color: t.onSurface, fontWeight: "600", fontSize: 13 },
  chipTxtActive: { color: t.brand },
  err: { color: t.error },
  ok: { color: t.success, fontWeight: "700" },
  submit: {
    backgroundColor: t.brand, paddingVertical: 14, borderRadius: radii.md,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, ...shadow1,
  },
  submitTxt: { color: t.onBrandPrimary, fontWeight: "800" },
  pickBtn: {
    backgroundColor: t.brandPrimary, paddingVertical: 13, borderRadius: radii.md,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  pickBtnTxt: { color: "#fff", fontWeight: "800" },
  pickHint: { color: t.onSurfaceMuted, fontSize: 12, lineHeight: 17 },
  tabbar: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, paddingBottom: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: radii.pill, borderWidth: 1, borderColor: t.border, backgroundColor: t.surfaceSecondary, alignItems: "center" },
  tabBtnActive: { borderColor: t.brandPrimary, backgroundColor: t.brandTertiary },
  tabTxt: { color: t.onSurfaceMuted, fontWeight: "700", fontSize: 13 },
  tabTxtActive: { color: t.brand },
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  centerBox: { alignItems: "center", gap: 10, paddingVertical: 40, paddingHorizontal: spacing.lg },
  muted: { color: t.onSurfaceMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  emptyT: { fontSize: 17, fontWeight: "800", color: t.onSurface },
  retryBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: radii.pill, backgroundColor: t.brandPrimary },
  retryTxt: { color: "#fff", fontWeight: "800" },
  card: { flexDirection: "row", gap: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.surfaceSecondary, borderRadius: radii.md, padding: 12, alignItems: "flex-start" },
  thumb: { width: 84, height: 64, borderRadius: 10, backgroundColor: t.border },
  cardTitle: { fontSize: 15, fontWeight: "800", color: t.onSurface },
  cardMeta: { fontSize: 12, color: t.onSurfaceMuted, fontWeight: "600" },
  cardDesc: { fontSize: 13, color: t.onSurfaceMuted, lineHeight: 18 },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, borderWidth: 1, borderColor: t.brandPrimary, backgroundColor: t.surface },
  editTxt: { color: t.brand, fontWeight: "800", fontSize: 12 },
  delBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, borderWidth: 1, borderColor: t.error, backgroundColor: t.surface },
  delTxt: { color: t.error, fontWeight: "800", fontSize: 12 },
  editingBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: t.brandPrimary, backgroundColor: t.brandTertiary, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 10 },
  editingTxt: { flex: 1, color: t.brand, fontSize: 12, fontWeight: "700" },
});

// Rebuild the module styles whenever the active palette changes so
// every consumer (including helper components outside the screen
// function) picks up light/dark without prop drilling.
let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});
