import { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api } from "@/src/api";

const LEVELS = ["GCE O", "GCE A", "HND", "Concours"];

export default function TeacherUpload() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [level, setLevel] = useState("GCE A");
  const [videoUrl, setVideoUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const submit = async () => {
    setErr(null);
    if (!title || !description || !subjectName || !videoUrl) {
      setErr("Please fill in all required fields");
      return;
    }
    setBusy(true);
    try {
      await api("/lessons", {
        method: "POST",
        body: { title, description, subject_name: subjectName, exam_level: level, video_url: videoUrl, duration },
      });
      setOk(true);
      setTimeout(() => router.replace("/(tabs)/lessons"), 900);
    } catch (e: any) {
      setErr(e.message || "Upload failed");
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="teacher-upload-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-btn"><Ionicons name="arrow-back" size={22} color={theme.brand} /></Pressable>
        <Text style={styles.title}>Upload Lesson</Text>
        <View style={{ width: 22 }} />
      </View>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
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

        <Field label="Video URL" testID="in-url" value={videoUrl} onChange={setVideoUrl} placeholder="https://... (YouTube, MP4, HLS)" autoCap="none" />
        <Field label="Duration (optional)" testID="in-duration" value={duration} onChange={setDuration} placeholder="10:00" />

        {err ? <Text style={styles.err}>{err}</Text> : null}
        {ok ? <Text style={styles.ok}>✓ Uploaded! Redirecting…</Text> : null}

        <Pressable style={[styles.submit, busy && { opacity: 0.7 }]} onPress={submit} disabled={busy} testID="submit-lesson">
          {busy ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={styles.submitTxt}>Publish lesson</Text>
            </>
          )}
        </Pressable>
      </KeyboardAwareScrollView>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: theme.brand },
  label: { color: theme.onSurfaceMuted, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
  input: {
    borderWidth: 1, borderColor: theme.border, backgroundColor: "#fff",
    paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radii.md,
    fontSize: 15, color: theme.onSurface,
  },
  chip: { flexShrink: 0, paddingHorizontal: 16, height: 36, borderRadius: radii.pill, borderWidth: 1, borderColor: theme.border, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  chipActive: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
  chipTxt: { color: theme.onSurface, fontWeight: "600", fontSize: 13 },
  chipTxtActive: { color: theme.brand },
  err: { color: theme.error },
  ok: { color: theme.success, fontWeight: "700" },
  submit: {
    backgroundColor: theme.brand, paddingVertical: 14, borderRadius: radii.md,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, ...shadow1,
  },
  submitTxt: { color: "#fff", fontWeight: "800" },
});
