// import { useEffect, useState } from "react";
// import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
// import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
// import { Ionicons } from "@expo/vector-icons";
// import { useLocalSearchParams, useRouter } from "expo-router";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
// import { api } from "@/src/api";

// type Q = {
//   question_id: string;
//   question_text: string;
//   options: Record<string, string>;
//   index: number;
//   correct_answer?: string;
//   explanation?: string;
// };

// export default function MCQViewer() {
//   const { id } = useLocalSearchParams<{ id: string }>();
//   const router = useRouter();
//   const insets = useSafeAreaInsets();
//   const [paper, setPaper] = useState<any>(null);
//   const [qs, setQs] = useState<Q[]>([]);
//   const [idx, setIdx] = useState(0);
//   const [selected, setSelected] = useState<string | null>(null);
//   const [feedback, setFeedback] = useState<{ correct: boolean; correct_answer: string; explanation: string } | null>(null);
//   const [submitting, setSubmitting] = useState(false);
//   const [startedAt, setStartedAt] = useState(Date.now());

//   useEffect(() => {
//     (async () => {
//       const r = await api<{ paper: any; questions: Q[] }>(`/past-papers/${id}`, { auth: false });
//       setPaper(r.paper);
//       setQs(r.questions);
//     })();
//   }, [id]);

//   const q = qs[idx];
//   const progress = qs.length ? ((idx + 1) / qs.length) * 100 : 0;

//   const submit = async () => {
//     if (!selected || !q) return;
//     setSubmitting(true);
//     try {
//       const r = await api<any>("/questions/answer", {
//         method: "POST",
//         body: { question_id: q.question_id, selected, time_taken: Math.round((Date.now() - startedAt) / 1000) },
//       });
//       setFeedback(r);
//     } catch (e: any) {
//       setFeedback({ correct: false, correct_answer: "?", explanation: e.message });
//     } finally { setSubmitting(false); }
//   };

//   const next = () => {
//     if (idx < qs.length - 1) {
//       setIdx(idx + 1); setSelected(null); setFeedback(null); setStartedAt(Date.now());
//     } else {
//       router.back();
//     }
//   };
//   const prev = () => {
//     if (idx > 0) { setIdx(idx - 1); setSelected(null); setFeedback(null); setStartedAt(Date.now()); }
//   };

//   if (!q) {
//     return (
//       <SafeAreaView style={styles.root}><ActivityIndicator style={{ marginTop: 60 }} color={theme.brandPrimary} /></SafeAreaView>
//     );
//   }

//   return (
//     <SafeAreaView edges={["top"]} style={styles.root} testID="mcq-screen">
//       <View style={styles.header}>
//         <Pressable onPress={() => router.back()} testID="back-btn"><Ionicons name="arrow-back" size={22} color={theme.brand} /></Pressable>
//         <Text style={styles.brand}>GCSHARP</Text>
//         <View style={{ width: 22 }} />
//       </View>
//       <View style={styles.progressRow}>
//         <Text style={styles.subjT}>{paper?.subject_name} ({paper?.exam_level})</Text>
//         <Text style={styles.pct}>{Math.round(progress)}% Complete</Text>
//       </View>
//       <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>

//       <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 + insets.bottom }}>
//         <View style={styles.qCard} testID="question-card">
//           <Text style={styles.qText}>{q.question_text}</Text>
//         </View>

//         {Object.entries(q.options).map(([k, v]) => {
//           const isSelected = selected === k;
//           const isCorrect = feedback && k === feedback.correct_answer;
//           const isWrong = feedback && isSelected && !feedback.correct;
//           return (
//             <Pressable
//               key={k}
//               testID={`option-${k}`}
//               disabled={!!feedback}
//               onPress={() => setSelected(k)}
//               style={[
//                 styles.opt,
//                 isSelected && !feedback && styles.optSelected,
//                 isCorrect && styles.optCorrect,
//                 isWrong && styles.optWrong,
//               ]}
//             >
//               <View style={[
//                 styles.optKey,
//                 isSelected && !feedback && { backgroundColor: theme.brandPrimary },
//                 isCorrect && { backgroundColor: theme.success },
//                 isWrong && { backgroundColor: theme.error },
//               ]}>
//                 <Text style={styles.optKeyTxt}>{k}</Text>
//               </View>
//               <View style={{ flex: 1 }}>
//                 <Text style={styles.optTxt}>{v}</Text>
//                 {isCorrect && feedback && (
//                   <View style={styles.explain}>
//                     <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
//                       <Ionicons name="checkmark-circle" size={16} color={theme.success} />
//                       <Text style={styles.correctLbl}>Correct Answer</Text>
//                     </View>
//                     <Text style={styles.explainTxt}>{feedback.explanation}</Text>
//                   </View>
//                 )}
//               </View>
//             </Pressable>
//           );
//         })}
//       </ScrollView>

//       <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
//         <Pressable style={[styles.btn, styles.btnGhost]} onPress={prev} disabled={idx === 0} testID="prev-btn">
//           <Ionicons name="chevron-back" size={18} color={idx === 0 ? theme.onSurfaceMuted : theme.brand} />
//           <Text style={[styles.btnGhostTxt, idx === 0 && { color: theme.onSurfaceMuted }]}>Previous</Text>
//         </Pressable>
//         <Pressable style={styles.btnAI} testID="discuss-ai" onPress={() => router.push("/(tabs)/ai")}>
//           <Text style={styles.btnAITxt}>Discuss with AI</Text>
//         </Pressable>
//         {feedback ? (
//           <Pressable style={[styles.btn, styles.btnPrimary]} onPress={next} testID="next-btn">
//             <Text style={styles.btnPrimaryTxt}>{idx === qs.length - 1 ? "Finish" : "Next"}</Text>
//             <Ionicons name="chevron-forward" size={18} color="#fff" />
//           </Pressable>
//         ) : (
//           <Pressable
//             style={[styles.btn, styles.btnPrimary, !selected && { opacity: 0.5 }]}
//             onPress={submit}
//             disabled={!selected || submitting}
//             testID="submit-answer"
//           >
//             <Text style={styles.btnPrimaryTxt}>Submit</Text>
//           </Pressable>
//         )}
//       </View>
//     </SafeAreaView>
//   );
// }

// const styles = StyleSheet.create({
//   root: { flex: 1, backgroundColor: theme.surface },
//   header: {
//     flexDirection: "row", alignItems: "center", justifyContent: "space-between",
//     paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
//   },
//   brand: { fontSize: 16, fontWeight: "800", color: theme.brand, letterSpacing: 1 },
//   progressRow: {
//     flexDirection: "row", justifyContent: "space-between",
//     paddingHorizontal: spacing.lg, paddingBottom: 6,
//   },
//   subjT: { color: theme.onSurfaceMuted, fontWeight: "700", fontSize: 12, textTransform: "uppercase" },
//   pct: { color: theme.brandPrimary, fontWeight: "700", fontSize: 12 },
//   progressBar: { height: 4, backgroundColor: theme.surfaceTertiary, marginHorizontal: spacing.lg, borderRadius: 4 },
//   progressFill: { height: 4, backgroundColor: theme.brand, borderRadius: 4 },
//   qCard: {
//     backgroundColor: "#fff", padding: spacing.lg, borderRadius: radii.md, ...shadow1,
//     borderLeftWidth: 4, borderLeftColor: theme.brandPrimary,
//   },
//   qText: { fontSize: 16, color: theme.onSurface, lineHeight: 24, fontWeight: "600" },
//   opt: {
//     backgroundColor: "#fff", padding: spacing.md, borderRadius: radii.md,
//     flexDirection: "row", gap: 12, borderWidth: 1, borderColor: theme.border, alignItems: "flex-start",
//   },
//   optSelected: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
//   optCorrect: { borderColor: theme.success, backgroundColor: "#D1FAE5" },
//   optWrong: { borderColor: theme.error, backgroundColor: "#FEE2E2" },
//   optKey: {
//     width: 28, height: 28, borderRadius: 6, backgroundColor: theme.surfaceTertiary,
//     alignItems: "center", justifyContent: "center",
//   },
//   optKeyTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
//   optTxt: { fontSize: 15, color: theme.onSurface },
//   explain: {
//     marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(16,185,129,0.3)", gap: 4,
//   },
//   correctLbl: { color: theme.success, fontWeight: "800", fontSize: 12 },
//   explainTxt: { color: theme.onSurface, fontSize: 13, lineHeight: 19 },
//   footer: {
//     position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row",
//     padding: spacing.md, gap: 8, backgroundColor: "#fff",
//     borderTopWidth: 1, borderTopColor: theme.divider,
//   },
//   btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 12, borderRadius: radii.md },
//   btnGhost: { backgroundColor: "transparent" },
//   btnGhostTxt: { color: theme.brand, fontWeight: "700" },
//   btnAI: { flex: 1, backgroundColor: theme.brand, paddingVertical: 12, borderRadius: radii.md, alignItems: "center" },
//   btnAITxt: { color: "#fff", fontWeight: "700" },
//   btnPrimary: { backgroundColor: theme.brandPrimary },
//   btnPrimaryTxt: { color: "#fff", fontWeight: "700" },
// });
































// screens/MCQViewer.tsx
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, spacing, radii, shadow1 } from '@/src/theme';
import { api } from '@/src/api';
import { useReadingTimer } from '@/src/hooks/useReadingTimer';
import { StreakBadge } from '@/src/components/StreakBadge';

// Replace with your actual PDF viewer (e.g., react-native-pdf)
const PDFView = ({ url }: { url: string }) => (
  <View style={{ flex: 1, backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ color: '#6b7280' }}>PDF Viewer – {url}</Text>
  </View>
);

type Paper = {
  paper_id: string;
  title: string;
  subject: string;
  level: string;
  year: number;
  paper_number: number;
  pdf_url: string;
  saved?: boolean;
};

export default function MCQViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [paper, setPaper] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(true);
  const [draftSaved, setDraftSaved] = useState(false);
  const [qaItems, setQaItems] = useState<any[]>([]);
  const [qaLoading, setQaLoading] = useState(false);
  const [video, setVideo] = useState<any>(null);
  const [videoLoading, setVideoLoading] = useState(false);

  // === READING TIMER ===
  const { displaySeconds } = useReadingTimer(id);

  // === FETCH PAPER ===
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/papers/${id}`);
        setPaper(res.data);
        setDraftSaved(res.data.saved || false);
      } catch {
        // handle error
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // === DRAFT TOGGLE ===
  const toggleDraft = async () => {
    try {
      const { data } = await api.post('/drafts', { paper_id: id });
      setDraftSaved(data.saved);
    } catch {
      // error
    }
  };

  // === GENERATE Q&A ===
  const generateQA = async () => {
    setQaLoading(true);
    try {
      const { data } = await api.post(`/papers/${id}/qa`);
      setQaItems(data.items || []);
    } catch {
      // error
    } finally {
      setQaLoading(false);
    }
  };

  // === GENERATE VIDEO ===
  const generateVideo = async () => {
    setVideoLoading(true);
    try {
      const { data } = await api.post(`/papers/${id}/video`);
      setVideo(data);
    } catch {
      // error
    } finally {
      setVideoLoading(false);
    }
  };

  const formatDuration = (totalSeconds: number) => {
    const s = Math.floor(totalSeconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (loading || !paper) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator style={{ marginTop: 60 }} color={theme.brandPrimary} />
      </SafeAreaView>
    );
  }

  const isPaper1 = paper.paper_number === 1;

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      {/* HEADER with timer & streak */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.brand} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.title} numberOfLines={1}>{paper.title}</Text>
          <Text style={styles.subtitle}>
            {paper.subject} · {paper.level} · {paper.year} · Paper {paper.paper_number}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {/* Timer */}
          <View style={styles.timer}>
            <Ionicons name="time-outline" size={16} color={theme.muted} />
            <Text style={styles.timerText}>{formatDuration(displaySeconds)}</Text>
          </View>
          {/* Streak Badge */}
          <StreakBadge />
        </View>
      </View>



      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          gap: spacing.md,
          paddingBottom: insets.bottom + 110,
        }}
      >
        {/* PDF Viewer */}
        <View style={styles.pdfContainer}>
          <PDFView url={paper.pdf_url} />
        </View>

        {/* AI Assistant Panel */}
        <View style={styles.aiPanel}>
          <View style={styles.aiHeader}>
            <Ionicons name="chatbubble-ellipses" size={20} color={theme.brand} />
            <Text style={styles.aiTitle}>GC AI Assistant</Text>
          </View>


          <Text style={styles.aiSub}>Highlight any text to ask a question</Text>



          {isPaper1 ? (
            <Pressable
              style={[styles.aiButton, qaLoading && styles.aiButtonDisabled]}
              onPress={generateQA}
              disabled={qaLoading}
            >
              <Text style={styles.aiButtonText}>
                {qaLoading ? 'Generating solutions…' : 'Generate Step‑by‑Step Q&A'}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.aiButton, videoLoading && styles.aiButtonDisabled]}
              onPress={generateVideo}
              disabled={videoLoading}
            >
              <Text style={styles.aiButtonText}>
                {videoLoading ? 'Building AI video…' : 'Generate Video Solution'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Q&A List */}
        {qaItems.length > 0 && (
          <View style={styles.qaContainer}>
            <Text style={styles.qaTitle}>Worked Solutions</Text>
            {qaItems.map((item, i) => (
              <View key={i} style={styles.qaItem}>
                <Text style={styles.qaQuestion}>Q{item.number}. {item.question}</Text>
                {item.steps?.map((step: string, j: number) => (
                  <Text key={j} style={styles.qaStep}>{j + 1}. {step}</Text>
                ))}
                <Text style={styles.qaAnswer}>Answer: {item.answer}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Video Solution Player */}
        {video && video.scenes && (
          <View style={styles.videoContainer}>
            <Text style={styles.videoTitle}>{video.title}</Text>
            <Text style={styles.videoQuestion}>{video.question}</Text>
            {video.scenes.map((scene: any, idx: number) => (
              <View key={idx} style={styles.sceneItem}>
                <Text style={styles.sceneHeading}>{scene.heading}</Text>
                <Text style={styles.sceneNarration}>{scene.narration}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: spacing.md,
          right: spacing.md,
          bottom: insets.bottom + spacing.sm,
          backgroundColor: '#fff',
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: theme.border,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          ...shadow1,
        }}
      >
        <View style={styles.footerTimerContent}>
          <Ionicons name="time-outline" size={18} color={theme.brandPrimary} />
          <View>
            <Text style={styles.footerTimerLabel}>Reading time</Text>
            <Text style={styles.footerTimerValue}>{formatDuration(displaySeconds)}</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
    backgroundColor: '#fff',
  },
  backButton: { padding: 4 },
  title: { fontSize: 16, fontWeight: '600', color: theme.onSurface },
  subtitle: { fontSize: 12, color: theme.onSurfaceMuted },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timerText: { fontSize: 13, fontWeight: '500', color: theme.onSurface },
  footerTimerContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerTimerLabel: { fontSize: 11, fontWeight: '600', color: theme.onSurfaceMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  footerTimerValue: { fontSize: 24, fontWeight: '800', color: theme.brand, letterSpacing: 0.5 },
  pdfContainer: { height: 400, borderRadius: radii.md, overflow: 'hidden', backgroundColor: '#f3f4f6' },
  aiPanel: {
    backgroundColor: '#fff',
    padding: spacing.md,
    borderRadius: radii.md,
    ...shadow1,
    borderWidth: 1,
    borderColor: theme.border,
  },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  aiTitle: { fontWeight: '600', fontSize: 16 },
  aiSub: { fontSize: 12, color: theme.onSurfaceMuted, marginBottom: 12 },
  aiButton: {
    backgroundColor: theme.brandPrimary,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  aiButtonDisabled: { opacity: 0.6 },
  aiButtonText: { color: '#fff', fontWeight: '600' },
  qaContainer: {
    backgroundColor: '#fff',
    padding: spacing.md,
    borderRadius: radii.md,
    ...shadow1,
    borderWidth: 1,
    borderColor: theme.border,
  },
  qaTitle: { fontWeight: '700', fontSize: 16, marginBottom: 12 },
  qaItem: { marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.divider },
  qaQuestion: { fontWeight: '600', fontSize: 14, marginBottom: 4 },
  qaStep: { fontSize: 13, color: theme.onSurface, marginLeft: 8 },
  qaAnswer: { fontWeight: '600', fontSize: 14, marginTop: 4, color: theme.success },
  videoContainer: {
    backgroundColor: '#fff',
    padding: spacing.md,
    borderRadius: radii.md,
    ...shadow1,
    borderWidth: 1,
    borderColor: theme.border,
  },
  videoTitle: { fontWeight: '700', fontSize: 16, marginBottom: 4 },
  videoQuestion: { fontSize: 14, color: theme.onSurfaceMuted, marginBottom: 8 },
  sceneItem: { marginBottom: 8 },
  sceneHeading: { fontWeight: '600', fontSize: 14 },
  sceneNarration: { fontSize: 13, color: theme.onSurface, marginTop: 2 },
});