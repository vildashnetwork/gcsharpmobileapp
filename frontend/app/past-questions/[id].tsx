import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api } from "@/src/api";

type Q = {
  question_id: string;
  question_text: string;
  options: Record<string, string>;
  index: number;
  correct_answer?: string;
  explanation?: string;
};

export default function MCQViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [paper, setPaper] = useState<any>(null);
  const [qs, setQs] = useState<Q[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean; correct_answer: string; explanation: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());

  useEffect(() => {
    (async () => {
      const r = await api<{ paper: any; questions: Q[] }>(`/past-papers/${id}`, { auth: false });
      setPaper(r.paper);
      setQs(r.questions);
    })();
  }, [id]);

  const q = qs[idx];
  const progress = qs.length ? ((idx + 1) / qs.length) * 100 : 0;

  const submit = async () => {
    if (!selected || !q) return;
    setSubmitting(true);
    try {
      const r = await api<any>("/questions/answer", {
        method: "POST",
        body: { question_id: q.question_id, selected, time_taken: Math.round((Date.now() - startedAt) / 1000) },
      });
      setFeedback(r);
    } catch (e: any) {
      setFeedback({ correct: false, correct_answer: "?", explanation: e.message });
    } finally { setSubmitting(false); }
  };

  const next = () => {
    if (idx < qs.length - 1) {
      setIdx(idx + 1); setSelected(null); setFeedback(null); setStartedAt(Date.now());
    } else {
      router.back();
    }
  };
  const prev = () => {
    if (idx > 0) { setIdx(idx - 1); setSelected(null); setFeedback(null); setStartedAt(Date.now()); }
  };

  if (!q) {
    return (
      <SafeAreaView style={styles.root}><ActivityIndicator style={{ marginTop: 60 }} color={theme.brandPrimary} /></SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="mcq-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-btn"><Ionicons name="arrow-back" size={22} color={theme.brand} /></Pressable>
        <Text style={styles.brand}>GCSMART</Text>
        <View style={{ width: 22 }} />
      </View>
      <View style={styles.progressRow}>
        <Text style={styles.subjT}>{paper?.subject_name} ({paper?.exam_level})</Text>
        <Text style={styles.pct}>{Math.round(progress)}% Complete</Text>
      </View>
      <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 + insets.bottom }}>
        <View style={styles.qCard} testID="question-card">
          <Text style={styles.qText}>{q.question_text}</Text>
        </View>

        {Object.entries(q.options).map(([k, v]) => {
          const isSelected = selected === k;
          const isCorrect = feedback && k === feedback.correct_answer;
          const isWrong = feedback && isSelected && !feedback.correct;
          return (
            <Pressable
              key={k}
              testID={`option-${k}`}
              disabled={!!feedback}
              onPress={() => setSelected(k)}
              style={[
                styles.opt,
                isSelected && !feedback && styles.optSelected,
                isCorrect && styles.optCorrect,
                isWrong && styles.optWrong,
              ]}
            >
              <View style={[
                styles.optKey,
                isSelected && !feedback && { backgroundColor: theme.brandPrimary },
                isCorrect && { backgroundColor: theme.success },
                isWrong && { backgroundColor: theme.error },
              ]}>
                <Text style={styles.optKeyTxt}>{k}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optTxt}>{v}</Text>
                {isCorrect && feedback && (
                  <View style={styles.explain}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="checkmark-circle" size={16} color={theme.success} />
                      <Text style={styles.correctLbl}>Correct Answer</Text>
                    </View>
                    <Text style={styles.explainTxt}>{feedback.explanation}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={prev} disabled={idx === 0} testID="prev-btn">
          <Ionicons name="chevron-back" size={18} color={idx === 0 ? theme.onSurfaceMuted : theme.brand} />
          <Text style={[styles.btnGhostTxt, idx === 0 && { color: theme.onSurfaceMuted }]}>Previous</Text>
        </Pressable>
        <Pressable style={styles.btnAI} testID="discuss-ai" onPress={() => router.push("/(tabs)/ai")}>
          <Text style={styles.btnAITxt}>Discuss with AI</Text>
        </Pressable>
        {feedback ? (
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={next} testID="next-btn">
            <Text style={styles.btnPrimaryTxt}>{idx === qs.length - 1 ? "Finish" : "Next"}</Text>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.btn, styles.btnPrimary, !selected && { opacity: 0.5 }]}
            onPress={submit}
            disabled={!selected || submitting}
            testID="submit-answer"
          >
            <Text style={styles.btnPrimaryTxt}>Submit</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  brand: { fontSize: 16, fontWeight: "800", color: theme.brand, letterSpacing: 1 },
  progressRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: 6,
  },
  subjT: { color: theme.onSurfaceMuted, fontWeight: "700", fontSize: 12, textTransform: "uppercase" },
  pct: { color: theme.brandPrimary, fontWeight: "700", fontSize: 12 },
  progressBar: { height: 4, backgroundColor: theme.surfaceTertiary, marginHorizontal: spacing.lg, borderRadius: 4 },
  progressFill: { height: 4, backgroundColor: theme.brand, borderRadius: 4 },
  qCard: {
    backgroundColor: "#fff", padding: spacing.lg, borderRadius: radii.md, ...shadow1,
    borderLeftWidth: 4, borderLeftColor: theme.brandPrimary,
  },
  qText: { fontSize: 16, color: theme.onSurface, lineHeight: 24, fontWeight: "600" },
  opt: {
    backgroundColor: "#fff", padding: spacing.md, borderRadius: radii.md,
    flexDirection: "row", gap: 12, borderWidth: 1, borderColor: theme.border, alignItems: "flex-start",
  },
  optSelected: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
  optCorrect: { borderColor: theme.success, backgroundColor: "#D1FAE5" },
  optWrong: { borderColor: theme.error, backgroundColor: "#FEE2E2" },
  optKey: {
    width: 28, height: 28, borderRadius: 6, backgroundColor: theme.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  optKeyTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  optTxt: { fontSize: 15, color: theme.onSurface },
  explain: {
    marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(16,185,129,0.3)", gap: 4,
  },
  correctLbl: { color: theme.success, fontWeight: "800", fontSize: 12 },
  explainTxt: { color: theme.onSurface, fontSize: 13, lineHeight: 19 },
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row",
    padding: spacing.md, gap: 8, backgroundColor: "#fff",
    borderTopWidth: 1, borderTopColor: theme.divider,
  },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 12, borderRadius: radii.md },
  btnGhost: { backgroundColor: "transparent" },
  btnGhostTxt: { color: theme.brand, fontWeight: "700" },
  btnAI: { flex: 1, backgroundColor: theme.brand, paddingVertical: 12, borderRadius: radii.md, alignItems: "center" },
  btnAITxt: { color: "#fff", fontWeight: "700" },
  btnPrimary: { backgroundColor: theme.brandPrimary },
  btnPrimaryTxt: { color: "#fff", fontWeight: "700" },
});
