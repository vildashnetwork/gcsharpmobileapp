import { useMemo, useState } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { VideoSolutionPlayer } from "@/src/components/VideoSolutionPlayer";
import { api, API_BASE, readToken } from "@/src/api";
import { gcAiErrorMessage } from "@/src/lib/gcAiMessage";
import { useTheme } from "@/src/theme-context";
import { radii, spacing, type Palette } from "@/src/theme";

type LessonScene = {
  heading: string;
  board: string[];
  narration: string;
};

type Lesson = {
  title: string;
  question?: string;
  scenes: LessonScene[];
};

type PickedPdf = {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number;
};

const MAX_PDF_BYTES = 15 * 1024 * 1024;

async function uploadPdf(file: PickedPdf): Promise<Lesson> {
  const token = await readToken();
  const form = new FormData();
  form.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType || "application/pdf",
  } as any);

  const response = await fetch(`${API_BASE}/ai/video/from-pdf`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const raw = await response.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }
  if (!response.ok) {
    const detail = data && (data.detail || data.message);
    throw new Error(typeof detail === "string" ? detail : `PDF lesson failed (${response.status})`);
  }
  if (!Array.isArray(data?.scenes) || data.scenes.length === 0) {
    throw new Error("GC AI returned an empty lesson. Please try again.");
  }
  return data as Lesson;
}

const createStyles = (t: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.surface },
  header: {
    minHeight: 54, flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: t.divider,
  },
  headerTitle: { flex: 1, fontSize: 19, fontWeight: "800", color: t.onSurface },
  scroll: { padding: spacing.md, gap: 16, paddingBottom: 40 },
  intro: { gap: 6 },
  title: { fontSize: 23, fontWeight: "800", color: t.onSurface },
  description: { fontSize: 14, color: t.onSurfaceMuted, lineHeight: 20 },
  modelLabel: {
    flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start",
    backgroundColor: t.brandTertiary, paddingHorizontal: 11, paddingVertical: 7,
    borderRadius: radii.pill,
  },
  modelText: { color: t.onBrandTertiary, fontSize: 12, fontWeight: "700" },
  modeRow: {
    flexDirection: "row", padding: 4, gap: 4, borderRadius: radii.md,
    backgroundColor: t.surfaceTertiary,
  },
  modeButton: {
    flex: 1, minHeight: 40, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 7, borderRadius: radii.sm,
  },
  modeButtonActive: { backgroundColor: t.surfaceSecondary },
  modeText: { fontSize: 13, fontWeight: "600", color: t.onSurfaceMuted },
  modeTextActive: { color: t.brandPrimary, fontWeight: "700" },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: t.onSurface },
  textInput: {
    minHeight: 150, textAlignVertical: "top", padding: 12, borderRadius: radii.sm,
    borderWidth: 1, borderColor: t.border, backgroundColor: t.surfaceSecondary,
    color: t.onSurface, fontSize: 15, lineHeight: 21,
  },
  pdfCard: {
    minHeight: 84, flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderWidth: 1, borderStyle: "dashed", borderColor: t.border,
    borderRadius: radii.md, backgroundColor: t.surfaceSecondary,
  },
  pdfIcon: {
    width: 44, height: 44, alignItems: "center", justifyContent: "center",
    borderRadius: radii.sm, backgroundColor: t.brandTertiary,
  },
  pdfName: { flex: 1, color: t.onSurface, fontSize: 14, fontWeight: "700" },
  pdfInfo: { color: t.onSurfaceMuted, fontSize: 12, marginTop: 3 },
  fieldInput: {
    minHeight: 42, paddingHorizontal: 11, borderRadius: radii.sm,
    borderWidth: 1, borderColor: t.border, backgroundColor: t.surfaceSecondary,
    color: t.onSurface,
  },
  button: {
    minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: radii.sm, backgroundColor: t.brandPrimary,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  hint: { fontSize: 12, color: t.onSurfaceMuted, lineHeight: 18 },
  error: {
    padding: 12, borderRadius: radii.sm, backgroundColor: t.surfaceTertiary,
    color: t.error, fontSize: 13, lineHeight: 19,
  },
});

export default function AiVideoScreen() {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<"text" | "pdf">(params.mode === "pdf" ? "pdf" : "text");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("General");
  const [level, setLevel] = useState("General");
  const [pdf, setPdf] = useState<PickedPdf | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);

  const pickPdf = async () => {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (asset.size !== undefined && asset.size > MAX_PDF_BYTES) {
        setError("PDFs must be 15 MB or smaller.");
        return;
      }
      setPdf({
        uri: asset.uri,
        name: asset.name || "lesson.pdf",
        mimeType: asset.mimeType,
        size: asset.size,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the PDF picker.");
    }
  };

  const generate = async () => {
    setError(null);
    if (mode === "text" && text.trim().length < 3) {
      setError("Enter at least three characters of lesson text or a topic.");
      return;
    }
    if (mode === "text" && text.trim().length > 6000) {
      setError("Lesson text must be 6,000 characters or fewer.");
      return;
    }
    if (mode === "pdf" && !pdf) {
      setError("Choose a PDF before generating the lesson.");
      return;
    }

    setBusy(true);
    try {
      const result = mode === "pdf"
        ? await uploadPdf(pdf!)
        : await api<Lesson>("/ai/video/from-text", {
          method: "POST",
          body: { text: text.trim(), subject: subject.trim() || "General",
            level: level.trim() || "General", lesson_focus: "explain" },
        });
      if (!Array.isArray(result.scenes) || result.scenes.length === 0) {
        throw new Error("GC AI returned an empty lesson. Please try again.");
      }
      setLesson(result);
    } catch (cause) {
      setError(gcAiErrorMessage(cause, "GC AI could not generate the lesson. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (lesson) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => setLesson(null)} hitSlop={8}
            accessibilityRole="button" accessibilityLabel="Close generated lesson">
            <Ionicons name="arrow-back" size={23} color={t.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>{lesson.title || "GC AI Video Lesson"}</Text>
        </View>
        <VideoSolutionPlayer
          scenes={lesson.scenes}
          title={lesson.title}
          question={lesson.question}
          onClose={() => setLesson(null)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}
          accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={23} color={t.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Create a Video Lesson</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Text style={styles.title}>Learn it visually</Text>
          <Text style={styles.description}>
            Turn a topic, notes, or a readable PDF into a narrated, step-by-step lesson.
          </Text>
        </View>
        <View style={styles.modelLabel}>
          <Ionicons name="sparkles" size={15} color={t.onBrandTertiary} />
          <Text style={styles.modelText}>Generated by GC AI</Text>
        </View>

        <View style={styles.modeRow}>
          {(["text", "pdf"] as const).map((value) => {
            const selected = mode === value;
            return (
              <Pressable key={value}
                style={[styles.modeButton, selected && styles.modeButtonActive]}
                onPress={() => { setMode(value); setError(null); }}
                accessibilityRole="button"
                accessibilityState={{ selected }}>
                <Ionicons name={value === "text" ? "create-outline" : "document-text-outline"}
                  size={17} color={selected ? t.brandPrimary : t.onSurfaceMuted} />
                <Text style={[styles.modeText, selected && styles.modeTextActive]}>
                  {value === "text" ? "Text to video" : "PDF to video"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {mode === "text" ? (
          <>
            <Text style={styles.fieldLabel}>Topic or learning material</Text>
            <TextInput
              style={styles.textInput}
              placeholder="For example: Explain Newton's second law with a worked example."
              placeholderTextColor={t.onSurfaceMuted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={6000}
              textAlignVertical="top"
              accessibilityLabel="Lesson topic or text"
            />
            <Text style={styles.hint}>{text.length}/6000 characters</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Subject"
              placeholderTextColor={t.onSurfaceMuted}
              value={subject}
              onChangeText={setSubject}
              maxLength={80}
              accessibilityLabel="Lesson subject"
            />
            <TextInput
              style={styles.fieldInput}
              placeholder="Exam level"
              placeholderTextColor={t.onSurfaceMuted}
              value={level}
              onChangeText={setLevel}
              maxLength={40}
              accessibilityLabel="Lesson level"
            />
          </>
        ) : (
          <>
            <Text style={styles.fieldLabel}>Choose a PDF lesson source</Text>
            <Pressable style={styles.pdfCard} onPress={pickPdf}
              accessibilityRole="button" accessibilityLabel="Choose a PDF">
              <View style={styles.pdfIcon}>
                <Ionicons name="document-text" size={23} color={t.onBrandTertiary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pdfName} numberOfLines={1}>
                  {pdf?.name || "Select a PDF file"}
                </Text>
                <Text style={styles.pdfInfo}>
                  {pdf?.size ? `${(pdf.size / (1024 * 1024)).toFixed(1)} MB · ` : ""}
                  Maximum 15 MB
                </Text>
              </View>
              <Ionicons name={pdf ? "checkmark-circle" : "chevron-forward"}
                size={20} color={pdf ? t.brandPrimary : t.onSurfaceMuted} />
            </Pressable>
            <Text style={styles.hint}>
              The PDF must contain selectable text. Scanned image-only documents are not supported yet.
            </Text>
          </>
        )}

        {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
        <Pressable
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={generate}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={busy ? "Generating video lesson" : "Generate video lesson"}>
          {busy
            ? <ActivityIndicator color="#fff" />
            : <Ionicons name="play-circle-outline" size={20} color="#fff" />}
          <Text style={styles.buttonText}>{busy ? "GC AI is creating your lesson…" : "Generate video lesson with GC AI"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
