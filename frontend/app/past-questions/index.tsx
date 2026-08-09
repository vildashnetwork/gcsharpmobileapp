// import { useEffect, useState } from "react";
// import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { Ionicons } from "@expo/vector-icons";
// import { useRouter, Stack } from "expo-router";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
// import { api } from "@/src/api";

// const LEVELS = ["GCE O", "GCE A", "HND", "Concours"];

// type Subject = { subject_id: string; name: string; code: string; exam_level: string; icon: string };
// type Paper = { paper_id: string; subject_name: string; year: number; paper_number: number; question_count: number; duration_minutes: number; pdf_url?: string; title?: string };

// export default function PastQuestions() {
//   const [level, setLevel] = useState<string>("GCE A");
//   const [subjects, setSubjects] = useState<Subject[]>([]);
//   const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
//   const [papers, setPapers] = useState<Paper[]>([]);
//   const [loading, setLoading] = useState(false);
//   const router = useRouter();

//   useEffect(() => {
//     (async () => {
//       const r = await api<{ items: Subject[] }>(`/subjects?exam_level=${encodeURIComponent(level)}`, { auth: false });
//       setSubjects(r.items);
//       setSelectedSubject(null);
//       setPapers([]);
//     })();
//   }, [level]);

//   useEffect(() => {
//     if (!selectedSubject) return;
//     (async () => {
//       setLoading(true);
//       try {
//         const r = await api<{ items: Paper[] }>(
//           `/past-papers?exam_level=${encodeURIComponent(level)}&subject_id=${selectedSubject}`,
//           { auth: false }
//         );
//         setPapers(r.items);
//       } finally { setLoading(false); }
//     })();
//   }, [selectedSubject, level]);

//   return (
//     <SafeAreaView edges={["top"]} style={styles.root} testID="past-questions-screen">
//       <Stack.Screen options={{ headerShown: false }} />
//       <View style={styles.header}>
//         <Pressable onPress={() => router.back()} testID="back-btn">
//           <Ionicons name="arrow-back" size={22} color={theme.brand} />
//         </Pressable>
//         <Text style={styles.headerT}>Past Questions</Text>
//         <View style={{ width: 22 }} />
//       </View>

//       <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
//         {LEVELS.map((l) => (
//           <Pressable
//             key={l}
//             testID={`level-${l}`}
//             onPress={() => setLevel(l)}
//             style={[styles.chip, level === l && styles.chipActive]}
//           >
//             <Text style={[styles.chipTxt, level === l && styles.chipTxtActive]}>{l}</Text>
//           </Pressable>
//         ))}
//       </ScrollView>

//       <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
//         <Text style={styles.sec}>Subject</Text>
//         <View style={{ gap: spacing.sm }}>
//           {subjects.map((s) => (
//             <Pressable
//               key={s.subject_id}
//               testID={`subject-${s.subject_id}`}
//               onPress={() => setSelectedSubject(s.subject_id)}
//               style={[styles.subject, selectedSubject === s.subject_id && styles.subjectActive]}
//             >
//               <View style={styles.subIcon}><Ionicons name={s.icon as any} size={20} color={theme.brandPrimary} /></View>
//               <Text style={styles.subName}>{s.name}</Text>
//               {selectedSubject === s.subject_id && <Ionicons name="checkmark-circle" size={20} color={theme.brandPrimary} />}
//             </Pressable>
//           ))}
//         </View>

//         {selectedSubject && (
//           <>
//             <Text style={styles.sec}>Papers</Text>
//             {loading ? (
//               <ActivityIndicator color={theme.brandPrimary} />
//             ) : (
//               papers.map((p) => (
//                 <Pressable
//                   key={p.paper_id}
//                   testID={`paper-${p.paper_id}`}
//                   style={styles.paper}
//                   onPress={() => {
//                     if (p.pdf_url) {
//                       router.push({
//                         pathname: "/pdf",
//                         params: { url: p.pdf_url, title: p.title || `${p.subject_name} ${p.year}`, paper_id: p.paper_id },
//                       });
//                     } else {
//                       router.push(`/past-questions/${p.paper_id}`);
//                     }
//                   }}
//                 >
//                   <View style={{ flex: 1 }}>
//                     <Text style={styles.paperT}>{p.subject_name} {p.year}</Text>
//                     <Text style={styles.paperS}>Paper {p.paper_number} · {p.duration_minutes} min{p.pdf_url ? " · Official PDF" : ` · ${p.question_count} Q`}</Text>
//                   </View>
//                   <View style={styles.startBtn}>
//                     <Text style={styles.startTxt}>{p.pdf_url ? "PDF" : p.paper_number === 1 ? "MCQ" : "Steps"}</Text>
//                     <Ionicons name={p.pdf_url ? "document-text" : "arrow-forward"} size={14} color="#fff" />
//                   </View>
//                 </Pressable>
//               ))
//             )}
//           </>
//         )}
//       </ScrollView>
//     </SafeAreaView>
//   );
// }

// const styles = StyleSheet.create({
//   root: { flex: 1, backgroundColor: theme.surface },
//   header: {
//     flexDirection: "row", alignItems: "center", justifyContent: "space-between",
//     paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
//   },
//   headerT: { fontSize: 18, fontWeight: "800", color: theme.brand },
//   chipRow: { paddingHorizontal: spacing.lg, gap: 8, height: 56, alignItems: "center" },
//   chip: {
//     flexShrink: 0, height: 36, paddingHorizontal: 16, borderRadius: radii.pill,
//     backgroundColor: "#fff", borderWidth: 1, borderColor: theme.border,
//     alignItems: "center", justifyContent: "center",
//   },
//   chipActive: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
//   chipTxt: { color: theme.onSurface, fontWeight: "600", fontSize: 13 },
//   chipTxtActive: { color: theme.brand },
//   sec: { fontSize: 14, fontWeight: "800", color: theme.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 1 },
//   subject: {
//     backgroundColor: "#fff", borderRadius: radii.md, padding: spacing.md,
//     flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: theme.border,
//   },
//   subjectActive: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
//   subIcon: {
//     width: 36, height: 36, borderRadius: 8, backgroundColor: theme.brandTertiary,
//     alignItems: "center", justifyContent: "center",
//   },
//   subName: { flex: 1, fontWeight: "600", color: theme.onSurface },
//   paper: {
//     backgroundColor: "#fff", borderRadius: radii.md, padding: spacing.md,
//     flexDirection: "row", alignItems: "center", gap: 12, ...shadow1,
//   },
//   paperT: { fontWeight: "700", color: theme.onSurface },
//   paperS: { color: theme.onSurfaceMuted, fontSize: 12, marginTop: 2 },
//   startBtn: {
//     flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: theme.brand,
//     paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill,
//   },
//   startTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
// });































import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api } from "@/src/api";

// Match the exact level names from your server
const LEVELS = ["GCE O", "GCE A", "HND", "Concours"];

type Subject = { subject_id: string; name: string; code: string; exam_level: string; icon: string };
type Paper = {
  paper_id: string;
  subject_name: string;
  subject_id?: string;
  year: number;
  paper_number: number;
  question_count: number;
  duration_minutes: number;
  pdf_url?: string;
  title?: string;
  total_marks?: number;
};

export default function PastQuestions() {
  const [level, setLevel] = useState<string>("GCE A");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const router = useRouter();

  // Load subjects for selected level
  useEffect(() => {
    (async () => {
      setLoadingSubjects(true);
      try {
        console.log(`Fetching subjects for level: ${level}`);
        const r = await api<{ items: Subject[] }>(
          `/subjects?exam_level=${encodeURIComponent(level)}`,
          { auth: false }
        );
        console.log(`Subjects found: ${r.items?.length || 0}`);
        setSubjects(r.items || []);
        setSelectedSubject(null);
        setPapers([]);
      } catch (error) {
        console.error("Failed to load subjects:", error);
        setSubjects([]);
      } finally {
        setLoadingSubjects(false);
      }
    })();
  }, [level]);

  // Load papers for selected subject
  useEffect(() => {
    if (!selectedSubject) {
      setPapers([]);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        console.log(`Fetching papers for subject: ${selectedSubject}, level: ${level}`);
        const r = await api<{ items: Paper[] }>(
          `/past-papers?exam_level=${encodeURIComponent(level)}&subject_id=${selectedSubject}`,
          { auth: false }
        );
        console.log(`Papers found: ${r.items?.length || 0}`);
        setPapers(r.items || []);
      } catch (error) {
        console.error("Failed to load papers:", error);
        setPapers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedSubject, level]);

  // Get icon for subject, fallback to book-outline
  const getIcon = (icon: string) => {
    const validIcons = [
      "calculator-outline", "book-outline", "flash-outline", "flask-outline",
      "leaf-outline", "earth-outline", "code-slash-outline", "briefcase-outline",
      "bulb-outline", "language-outline", "trending-up-outline", "library-outline",
      "infinite-outline", "cash-outline", "business-outline"
    ];
    return validIcons.includes(icon) ? icon : "book-outline";
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="past-questions-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-btn">
          <Ionicons name="arrow-back" size={22} color={theme.brand} />
        </Pressable>
        <Text style={styles.headerT}>Past Questions</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
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

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
        <Text style={styles.sec}>Subject</Text>

        {loadingSubjects ? (
          <ActivityIndicator color={theme.brandPrimary} />
        ) : subjects.length === 0 ? (
          <Text style={styles.emptyText}>No subjects available for this level</Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {subjects.map((s) => (
              <Pressable
                key={s.subject_id}
                testID={`subject-${s.subject_id}`}
                onPress={() => setSelectedSubject(s.subject_id)}
                style={[styles.subject, selectedSubject === s.subject_id && styles.subjectActive]}
              >
                <View style={styles.subIcon}>
                  <Ionicons name={getIcon(s.icon)} size={20} color={theme.brandPrimary} />
                </View>
                <Text style={styles.subName}>{s.name}</Text>
                {selectedSubject === s.subject_id && (
                  <Ionicons name="checkmark-circle" size={20} color={theme.brandPrimary} />
                )}
              </Pressable>
            ))}
          </View>
        )}

        {selectedSubject && (
          <>
            <Text style={styles.sec}>Papers</Text>
            {loading ? (
              <ActivityIndicator color={theme.brandPrimary} />
            ) : papers.length === 0 ? (
              <Text style={styles.emptyText}>No papers available for this subject</Text>
            ) : (
              papers.map((p) => (
                <Pressable
                  key={p.paper_id}
                  testID={`paper-${p.paper_id}`}
                  style={styles.paper}
                  onPress={() => {
                    if (p.pdf_url) {
                      router.push({
                        pathname: "/pdf",
                        params: {
                          url: p.pdf_url,
                          title: p.title || `${p.subject_name} ${p.year}`,
                          paper_id: p.paper_id
                        },
                      });
                    } else {
                      router.push(`/past-questions/${p.paper_id}`);
                    }
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.paperT}>{p.subject_name} {p.year}</Text>
                    <Text style={styles.paperS}>
                      Paper {p.paper_number} · {p.duration_minutes || 90} min
                      {p.pdf_url ? " · Official PDF" : p.question_count ? ` · ${p.question_count} Q` : ''}
                      {p.total_marks ? ` · ${p.total_marks} marks` : ''}
                    </Text>
                  </View>
                  <View style={styles.startBtn}>
                    <Text style={styles.startTxt}>
                      {p.pdf_url ? "PDF" : p.paper_number === 1 ? "MCQ" : "Start"}
                    </Text>
                    <Ionicons
                      name={p.pdf_url ? "document-text" : "arrow-forward"}
                      size={14}
                      color="#fff"
                    />
                  </View>
                </Pressable>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  headerT: { fontSize: 18, fontWeight: "800", color: theme.brand },
  chipRow: { paddingHorizontal: spacing.lg, gap: 8, height: 56, alignItems: "center" },
  chip: {
    flexShrink: 0, height: 36, paddingHorizontal: 16, borderRadius: radii.pill,
    backgroundColor: "#fff", borderWidth: 1, borderColor: theme.border,
    alignItems: "center", justifyContent: "center",
  },
  chipActive: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
  chipTxt: { color: theme.onSurface, fontWeight: "600", fontSize: 13 },
  chipTxtActive: { color: theme.brand },
  sec: { fontSize: 14, fontWeight: "800", color: theme.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 1 },
  subject: {
    backgroundColor: "#fff", borderRadius: radii.md, padding: spacing.md,
    flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: theme.border,
  },
  subjectActive: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
  subIcon: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: theme.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  subName: { flex: 1, fontWeight: "600", color: theme.onSurface },
  paper: {
    backgroundColor: "#fff", borderRadius: radii.md, padding: spacing.md,
    flexDirection: "row", alignItems: "center", gap: 12, ...shadow1,
  },
  paperT: { fontWeight: "700", color: theme.onSurface },
  paperS: { color: theme.onSurfaceMuted, fontSize: 12, marginTop: 2 },
  startBtn: {
    flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: theme.brand,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill,
  },
  startTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
  emptyText: {
    color: theme.onSurfaceMuted,
    textAlign: "center",
    padding: spacing.lg,
    fontSize: 14,
  },
});