

// import { useEffect, useState } from "react";
// import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { Ionicons } from "@expo/vector-icons";
// import { useRouter, Stack } from "expo-router";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
// import { api } from "@/src/api";

// // Match the exact level names from your server
// const LEVELS = ["GCE O", "GCE A", "HND", "Concours"];

// type Subject = { subject_id: string; name: string; code: string; exam_level: string; icon: string };
// type Paper = {
//   paper_id: string;
//   subject_name: string;
//   subject_id?: string;
//   year: number;
//   paper_number: number;
//   question_count: number;
//   duration_minutes: number;
//   pdf_url?: string;
//   title?: string;
//   total_marks?: number;
// };

// export default function PastQuestions() {
//   const [level, setLevel] = useState<string>("GCE A");
//   const [subjects, setSubjects] = useState<Subject[]>([]);
//   const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
//   const [papers, setPapers] = useState<Paper[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [loadingSubjects, setLoadingSubjects] = useState(false);
//   const router = useRouter();

//   // Load subjects for selected level
//   useEffect(() => {
//     (async () => {
//       setLoadingSubjects(true);
//       try {
//         console.log(`Fetching subjects for level: ${level}`);
//         const r = await api<{ items: Subject[] }>(
//           `/subjects?exam_level=${encodeURIComponent(level)}`,
//           { auth: false }
//         );
//         console.log(`Subjects found: ${r.items?.length || 0}`);
//         setSubjects(r.items || []);
//         setSelectedSubject(null);
//         setPapers([]);
//       } catch (error) {
//         console.error("Failed to load subjects:", error);
//         setSubjects([]);
//       } finally {
//         setLoadingSubjects(false);
//       }
//     })();
//   }, [level]);

//   // Load papers for selected subject
//   useEffect(() => {
//     if (!selectedSubject) {
//       setPapers([]);
//       return;
//     }

//     (async () => {
//       setLoading(true);
//       try {
//         console.log(`Fetching papers for subject: ${selectedSubject}, level: ${level}`);
//         const r = await api<{ items: Paper[] }>(
//           `/past-papers?exam_level=${encodeURIComponent(level)}&subject_id=${selectedSubject}`,
//           { auth: false }
//         );
//         console.log(`Papers found: ${r.items?.length || 0}`);
//         setPapers(r.items || []);
//       } catch (error) {
//         console.error("Failed to load papers:", error);
//         setPapers([]);
//       } finally {
//         setLoading(false);
//       }
//     })();
//   }, [selectedSubject, level]);

//   // Get icon for subject, fallback to book-outline
//   const getIcon = (icon: string) => {
//     const validIcons = [
//       "calculator-outline", "book-outline", "flash-outline", "flask-outline",
//       "leaf-outline", "earth-outline", "code-slash-outline", "briefcase-outline",
//       "bulb-outline", "language-outline", "trending-up-outline", "library-outline",
//       "infinite-outline", "cash-outline", "business-outline"
//     ];
//     return validIcons.includes(icon) ? icon : "book-outline";
//   };

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

//         {loadingSubjects ? (
//           <ActivityIndicator color={theme.brandPrimary} />
//         ) : subjects.length === 0 ? (
//           <Text style={styles.emptyText}>No subjects available for this level</Text>
//         ) : (
//           <View style={{ gap: spacing.sm }}>
//             {subjects.map((s) => (
//               <Pressable
//                 key={s.subject_id}
//                 testID={`subject-${s.subject_id}`}
//                 onPress={() => setSelectedSubject(s.subject_id)}
//                 style={[styles.subject, selectedSubject === s.subject_id && styles.subjectActive]}
//               >
//                 <View style={styles.subIcon}>
//                   <Ionicons name={getIcon(s.icon)} size={20} color={theme.brandPrimary} />
//                 </View>
//                 <Text style={styles.subName}>{s.name}</Text>
//                 {selectedSubject === s.subject_id && (
//                   <Ionicons name="checkmark-circle" size={20} color={theme.brandPrimary} />
//                 )}
//               </Pressable>
//             ))}
//           </View>
//         )}

//         {selectedSubject && (
//           <>
//             <Text style={styles.sec}>Papers</Text>
//             {loading ? (
//               <ActivityIndicator color={theme.brandPrimary} />
//             ) : papers.length === 0 ? (
//               <Text style={styles.emptyText}>No papers available for this subject</Text>
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
//                         params: {
//                           url: p.pdf_url,
//                           title: p.title || `${p.subject_name} ${p.year}`,
//                           paper_id: p.paper_id
//                         },
//                       });
//                     } else {
//                       router.push(`/past-questions/${p.paper_id}`);
//                     }
//                   }}
//                 >
//                   <View style={{ flex: 1 }}>
//                     <Text style={styles.paperT}>{p.subject_name} {p.year}</Text>
//                     <Text style={styles.paperS}>
//                       Paper {p.paper_number} · {p.duration_minutes || 90} min
//                       {p.pdf_url ? " · Official PDF" : p.question_count ? ` · ${p.question_count} Q` : ''}
//                       {p.total_marks ? ` · ${p.total_marks} marks` : ''}
//                     </Text>
//                   </View>
//                   <View style={styles.startBtn}>
//                     <Text style={styles.startTxt}>
//                       {p.pdf_url ? "PDF" : p.paper_number === 1 ? "MCQ" : "Start"}
//                     </Text>
//                     <Ionicons
//                       name={p.pdf_url ? "document-text" : "arrow-forward"}
//                       size={14}
//                       color="#fff"
//                     />
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
//   emptyText: {
//     color: theme.onSurfaceMuted,
//     textAlign: "center",
//     padding: spacing.lg,
//     fontSize: 14,
//   },
// });




































// import { useEffect, useState, useCallback } from "react";
// import {
//   View,
//   Text,
//   StyleSheet,
//   ScrollView,
//   Pressable,
//   ActivityIndicator,
//   Alert,
//   RefreshControl,
//   LayoutAnimation,
//   Platform,
//   UIManager,
// } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { Ionicons } from "@expo/vector-icons";
// import { useRouter, Stack } from "expo-router";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
// import { api } from "@/src/api";

// if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
//   UIManager.setLayoutAnimationEnabledExperimental(true);
// }

// // ---------- Types ----------
// type ExamStructure = {
//   levels: Record<string, string[]>;
//   years: number[];
//   papers: number[];
// };

// type Paper = {
//   paper_id: string;
//   subject: string;
//   level: string;
//   title: string;
//   year: number;
//   paper_number: number;
//   pdf_url?: string;
//   description?: string;
//   saved: boolean;
//   views?: number;
// };

// // ---------- Constants ----------
// const DISPLAY_LEVELS = [
//   { label: "GCE O", backend: "GCE O Level" },
//   { label: "GCE A", backend: "GCE A Level" },
//   { label: "HND", backend: "HND" },
//   { label: "Concours", backend: "Concours" },
// ];

// // ---------- Component ----------
// export default function PastQuestions() {
//   const router = useRouter();

//   // ---------- State ----------
//   const [structure, setStructure] = useState<ExamStructure | null>(null);
//   const [selectedDisplayLevel, setSelectedDisplayLevel] = useState<string>(DISPLAY_LEVELS[0].label);
//   const [selectedBackendLevel, setSelectedBackendLevel] = useState<string>(DISPLAY_LEVELS[0].backend);
//   const [subjects, setSubjects] = useState<string[]>([]);
//   const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

//   // Papers
//   const [papers, setPapers] = useState<Paper[]>([]);
//   const [loading, setLoading] = useState<boolean>(false);
//   const [refreshing, setRefreshing] = useState<boolean>(false);
//   const [loadingStructure, setLoadingStructure] = useState<boolean>(true);
//   const [searchError, setSearchError] = useState<string | null>(null);

//   // Drafts
//   const [drafts, setDrafts] = useState<Paper[]>([]);
//   const [togglingDraft, setTogglingDraft] = useState<string | null>(null);

//   // ---------- Load exam structure ----------
//   useEffect(() => {
//     const fetchStructure = async () => {
//       try {
//         const data = await api<ExamStructure>("/exam/structure", { auth: false });
//         setStructure(data);
//         const firstBackendLevel = DISPLAY_LEVELS[0].backend;
//         if (data.levels[firstBackendLevel]) {
//           setSubjects(data.levels[firstBackendLevel]);
//         }
//       } catch (err) {
//         console.error("Failed to load exam structure:", err);
//         Alert.alert("Error", "Could not load subjects. Please try again.");
//       } finally {
//         setLoadingStructure(false);
//       }
//     };
//     fetchStructure();
//   }, []);

//   // ---------- Update subjects when level changes ----------
//   // This is what scopes the subject chips to only the ones available
//   // for the currently selected exam level, instead of showing every
//   // subject across every level.
//   useEffect(() => {
//     if (!structure) return;
//     LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
//     const levelSubjects = structure.levels[selectedBackendLevel] || [];
//     setSubjects(levelSubjects);
//     setSelectedSubject(null);
//     setPapers([]);
//   }, [selectedBackendLevel, structure]);

//   // ---------- Fetch papers ----------
//   const loadPapers = useCallback(
//     async (opts?: { silent?: boolean }) => {
//       if (!opts?.silent) setLoading(true);
//       setSearchError(null);
//       try {
//         const params = new URLSearchParams();
//         if (selectedBackendLevel) params.append("level", selectedBackendLevel);
//         if (selectedSubject) params.append("subject", selectedSubject);

//         const url = `/papers?${params.toString()}`;
//         const response = await api<{ items: Paper[] } | Paper[]>(url);
//         let items: Paper[] = [];
//         if (Array.isArray(response)) {
//           items = response;
//         } else if (response && typeof response === "object" && "items" in response) {
//           items = response.items || [];
//         }
//         setPapers(items);
//       } catch (err) {
//         console.error("Failed to load papers:", err);
//         setSearchError("Could not load papers. Pull down to retry.");
//         setPapers([]);
//       } finally {
//         setLoading(false);
//         setRefreshing(false);
//       }
//     },
//     [selectedSubject, selectedBackendLevel]
//   );

//   useEffect(() => {
//     loadPapers();
//   }, [loadPapers]);

//   const onRefresh = useCallback(() => {
//     setRefreshing(true);
//     loadPapers({ silent: true });
//   }, [loadPapers]);

//   // ---------- Load drafts ----------
//   const loadDrafts = useCallback(async () => {
//     try {
//       const data = await api<Paper[]>("/drafts");
//       setDrafts(data || []);
//     } catch (err) {
//       console.error("Failed to load drafts:", err);
//       setDrafts([]);
//     }
//   }, []);
//   useEffect(() => {
//     loadDrafts();
//   }, [loadDrafts]);

//   // ---------- Toggle draft ----------
//   const toggleDraft = async (paper: Paper) => {
//     if (togglingDraft === paper.paper_id) return;
//     setTogglingDraft(paper.paper_id);

//     const wasSaved = paper.saved;
//     setPapers((prev) => prev.map((p) => (p.paper_id === paper.paper_id ? { ...p, saved: !wasSaved } : p)));

//     try {
//       const response = await api<{ saved: boolean }>("/drafts", {
//         method: "POST",
//         body: { paper_id: paper.paper_id },
//       });
//       const isSaved = response.saved;
//       setPapers((prev) => prev.map((p) => (p.paper_id === paper.paper_id ? { ...p, saved: isSaved } : p)));
//       await loadDrafts();
//     } catch (err) {
//       console.error("Toggle draft error:", err);
//       setPapers((prev) => prev.map((p) => (p.paper_id === paper.paper_id ? { ...p, saved: wasSaved } : p)));
//       Alert.alert("Error", "Could not update draft status.");
//     } finally {
//       setTogglingDraft(null);
//     }
//   };

//   // ---------- Navigation ----------
//   const openPaper = (paper: Paper) => {
//     if (paper.pdf_url) {
//       router.push({
//         pathname: "/pdf",
//         params: { url: paper.pdf_url, title: paper.title || `${paper.subject} ${paper.year}`, paper_id: paper.paper_id },
//       });
//     } else {
//       router.push(`/past-questions/${paper.paper_id}`);
//     }
//   };

//   // ---------- Handle level change ----------
//   const handleLevelChange = (displayLabel: string) => {
//     setSelectedDisplayLevel(displayLabel);
//     const backendLevel = DISPLAY_LEVELS.find((dl) => dl.label === displayLabel)?.backend || "";
//     setSelectedBackendLevel(backendLevel);
//   };

//   // ---------- Skeleton loader ----------
//   const SkeletonPaper = ({ index }: { index: number }) => (
//     <View style={[styles.paper, styles.skeletonPaper]}>
//       <View style={{ flex: 1, gap: 8 }}>
//         <View style={[styles.skeletonBar, { width: `${60 - index * 5}%` }]} />
//         <View style={[styles.skeletonBar, { width: "40%", height: 10 }]} />
//       </View>
//       <View style={[styles.skeletonBar, { width: 60, height: 28, borderRadius: radii.pill }]} />
//     </View>
//   );

//   // ---------- Render ----------
//   return (
//     <SafeAreaView edges={["top"]} style={styles.root} testID="past-questions-screen">
//       <Stack.Screen options={{ headerShown: false }} />

//       {/* Header */}
//       <View style={styles.header}>
//         <Pressable onPress={() => router.back()} testID="back-btn">
//           <Ionicons name="arrow-back" size={22} color={theme.brand} />
//         </Pressable>
//         <Text style={styles.headerT}>Past Questions</Text>
//         <View style={{ width: 22 }} />
//       </View>

//       {/* Level selector — always visible for fast navigation */}
//       <View style={styles.levelSection}>
//         <View style={styles.sectionTopLine}>
//           <Text style={styles.sectionEyebrow}>EXAM LEVEL</Text>
//           <Text style={styles.sectionContext}>{selectedDisplayLevel}</Text>
//         </View>
//         <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
//           {DISPLAY_LEVELS.map((dl) => (
//             <Pressable
//               key={dl.label}
//               testID={`level-${dl.label}`}
//               onPress={() => handleLevelChange(dl.label)}
//               style={[styles.chip, selectedDisplayLevel === dl.label && styles.chipActive]}
//             >
//               {selectedDisplayLevel === dl.label && <View style={styles.chipDot} />}
//               <Text style={[styles.chipTxt, selectedDisplayLevel === dl.label && styles.chipTxtActive]}>
//                 {dl.label}
//               </Text>
//             </Pressable>
//           ))}
//         </ScrollView>
//       </View>

//       {/* Subject selector — scoped to the selected level only */}
//       <View style={styles.subjectSection}>
//         <View style={styles.subjectHeader}>
//           <View>
//             <Text style={styles.subjectTitle}>Subjects</Text>
//             <Text style={styles.subjectHint}>Choose a subject to explore papers</Text>
//           </View>
//           <View style={styles.subjectCount}>
//             <Text style={styles.subjectCountText}>{subjects.length}</Text>
//           </View>
//         </View>

//         {loadingStructure ? (
//           <View style={styles.subjectLoading}>
//             <ActivityIndicator color={theme.brandPrimary} />
//           </View>
//         ) : subjects.length === 0 ? (
//           <Text style={styles.emptyText}>No subjects available for this level</Text>
//         ) : (
//           <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectRow}>
//             <Pressable
//               testID="subject-all"
//               onPress={() => setSelectedSubject(null)}
//               style={[styles.subjectChip, selectedSubject === null && styles.subjectChipActive]}
//             >
//               <Ionicons
//                 name="apps-outline"
//                 size={15}
//                 color={selectedSubject === null ? theme.brand : theme.onSurfaceMuted}
//               />
//               <Text style={[styles.subjectChipText, selectedSubject === null && styles.subjectChipTextActive]}>
//                 All
//               </Text>
//             </Pressable>
//             {subjects.map((subj) => (
//               <Pressable
//                 key={subj}
//                 testID={`subject-${subj}`}
//                 onPress={() => setSelectedSubject(subj)}
//                 style={[styles.subjectChip, selectedSubject === subj && styles.subjectChipActive]}
//               >
//                 <Ionicons
//                   name="book-outline"
//                   size={15}
//                   color={selectedSubject === subj ? theme.brand : theme.onSurfaceMuted}
//                 />
//                 <Text style={[styles.subjectChipText, selectedSubject === subj && styles.subjectChipTextActive]}>
//                   {subj}
//                 </Text>
//               </Pressable>
//             ))}
//           </ScrollView>
//         )}
//       </View>

//       {/* Main content */}
//       <ScrollView
//         contentContainerStyle={styles.mainContent}
//         refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brandPrimary} />}
//         showsVerticalScrollIndicator={false}
//       >
//         <View style={styles.resultsHeader}>
//           <Text style={styles.sec}>{selectedSubject ? selectedSubject : "All Papers"}</Text>
//           {!loading && papers.length > 0 && (
//             <Text style={styles.resultsCount}>
//               {papers.length} {papers.length === 1 ? "paper" : "papers"}
//             </Text>
//           )}
//         </View>

//         {loading ? (
//           <View style={{ gap: spacing.md }}>
//             {[0, 1, 2].map((i) => (
//               <SkeletonPaper key={i} index={i} />
//             ))}
//           </View>
//         ) : searchError ? (
//           <View style={styles.errorState}>
//             <Ionicons name="cloud-offline-outline" size={28} color={theme.onSurfaceMuted} />
//             <Text style={styles.emptyText}>{searchError}</Text>
//             <Pressable style={styles.retryBtn} onPress={() => loadPapers()}>
//               <Text style={styles.retryBtnText}>Retry</Text>
//             </Pressable>
//           </View>
//         ) : papers.length === 0 ? (
//           <View style={styles.errorState}>
//             <Ionicons name="document-text-outline" size={28} color={theme.onSurfaceMuted} />
//             <Text style={styles.emptyText}>No papers found</Text>
//           </View>
//         ) : (
//           papers.map((p) => (
//             <Pressable key={p.paper_id} testID={`paper-${p.paper_id}`} style={styles.paper} onPress={() => openPaper(p)}>
//               <View style={{ flex: 1 }}>
//                 <Text style={styles.paperT}>{p.title || `${p.subject} ${p.year}`}</Text>
//                 <Text style={styles.paperS}>
//                   Paper {p.paper_number} · {p.year}
//                   {p.pdf_url ? " · PDF available" : ""}
//                   {typeof p.views === "number" ? ` · ${p.views.toLocaleString()} views` : ""}
//                 </Text>
//               </View>
//               <View style={styles.actionRow}>
//                 <Pressable onPress={() => toggleDraft(p)} style={styles.saveBtn} hitSlop={8}>
//                   <Ionicons
//                     name={p.saved ? "bookmark" : "bookmark-outline"}
//                     size={22}
//                     color={p.saved ? theme.brandPrimary : theme.onSurfaceMuted}
//                   />
//                 </Pressable>
//                 <View style={styles.startBtn}>
//                   <Text style={styles.startTxt}>{p.pdf_url ? "PDF" : "Open"}</Text>
//                   <Ionicons name={p.pdf_url ? "document-text" : "arrow-forward"} size={14} color="#fff" />
//                 </View>
//               </View>
//             </Pressable>
//           ))
//         )}
//       </ScrollView>
//     </SafeAreaView>
//   );
// }

// // ---------- Styles ----------
// const styles = StyleSheet.create({
//   root: { flex: 1, backgroundColor: theme.surface },

//   header: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     paddingHorizontal: spacing.lg,
//     paddingTop: 8,
//     paddingBottom: 10,
//   },
//   headerT: { fontSize: 19, fontWeight: "800", color: theme.brand, letterSpacing: -0.3 },

//   levelSection: { paddingTop: 2 },
//   sectionTopLine: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     paddingHorizontal: spacing.lg,
//     marginBottom: 3,
//   },
//   sectionEyebrow: {
//     fontSize: 10,
//     fontWeight: "800",
//     color: theme.onSurfaceMuted,
//     letterSpacing: 1.1,
//   },
//   sectionContext: { fontSize: 11, fontWeight: "700", color: theme.brand },
//   chipRow: { paddingHorizontal: spacing.lg, gap: 8, paddingVertical: 6 },
//   chip: {
//     flexShrink: 0,
//     minHeight: 38,
//     paddingHorizontal: 15,
//     borderRadius: radii.pill,
//     backgroundColor: "#fff",
//     borderWidth: 1,
//     borderColor: theme.border,
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "center",
//     gap: 6,
//   },
//   chipActive: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
//   chipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.brandPrimary },
//   chipTxt: { color: theme.onSurface, fontWeight: "700", fontSize: 13 },
//   chipTxtActive: { color: theme.brand },

//   // The subject selector sits exactly 5px after the level selector.
//   subjectSection: { marginTop: 5, paddingBottom: 4 },
//   subjectHeader: {
//     paddingHorizontal: spacing.lg,
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     marginBottom: 5,
//   },
//   subjectTitle: { fontSize: 15, fontWeight: "800", color: theme.onSurface, letterSpacing: -0.2 },
//   subjectHint: { fontSize: 11, color: theme.onSurfaceMuted, marginTop: 1 },
//   subjectCount: {
//     minWidth: 28,
//     height: 28,
//     paddingHorizontal: 7,
//     borderRadius: 14,
//     backgroundColor: theme.brandTertiary,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   subjectCountText: { color: theme.brand, fontSize: 11, fontWeight: "800" },
//   subjectLoading: { height: 40, justifyContent: "center" },
//   subjectRow: {
//     flexDirection: "row",
//     gap: 8,
//     paddingHorizontal: spacing.lg,
//     paddingVertical: 2,
//   },
//   subjectChip: {
//     flexShrink: 0,
//     paddingHorizontal: 13,
//     paddingVertical: 9,
//     borderRadius: 12,
//     backgroundColor: "#fff",
//     borderWidth: 1,
//     borderColor: theme.border,
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 6,
//   },
//   subjectChipActive: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
//   subjectChipText: { fontSize: 13, fontWeight: "700", color: theme.onSurface },
//   subjectChipTextActive: { color: theme.brand },

//   mainContent: {
//     paddingHorizontal: spacing.lg,
//     paddingTop: 8,
//     paddingBottom: 40,
//     gap: spacing.md,
//   },
//   sec: { fontSize: 14, fontWeight: "800", color: theme.onSurface, letterSpacing: -0.1 },
//   resultsHeader: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     paddingTop: 2,
//   },
//   resultsCount: { fontSize: 12, color: theme.onSurfaceMuted, fontWeight: "700" },

//   paper: {
//     backgroundColor: "#fff",
//     borderRadius: 16,
//     padding: 13,
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 11,
//     borderWidth: 1,
//     borderColor: theme.border,
//     minHeight: 82,
//     ...shadow1,
//   },
//   paperT: { fontWeight: "800", color: theme.onSurface, fontSize: 14, lineHeight: 19 },
//   paperS: { color: theme.onSurfaceMuted, fontSize: 11, marginTop: 0 },
//   actionRow: { flexDirection: "row", alignItems: "center", gap: 7 },
//   saveBtn: {
//     width: 36,
//     height: 36,
//     borderRadius: 11,
//     alignItems: "center",
//     justifyContent: "center",
//     backgroundColor: theme.surfaceTertiary,
//   },
//   startBtn: {
//     flexDirection: "row",
//     gap: 4,
//     alignItems: "center",
//     backgroundColor: theme.brand,
//     paddingHorizontal: 12,
//     minHeight: 36,
//     borderRadius: 11,
//   },
//   startTxt: { color: "#fff", fontWeight: "800", fontSize: 11 },

//   skeletonPaper: { opacity: 0.7 },
//   skeletonBar: { height: 14, borderRadius: 6, backgroundColor: theme.surfaceTertiary },
//   errorState: { alignItems: "center", gap: 10, paddingVertical: spacing.lg },
//   emptyText: { color: theme.onSurfaceMuted, textAlign: "center", padding: spacing.sm, fontSize: 14 },
//   retryBtn: {
//     paddingHorizontal: 16,
//     paddingVertical: 9,
//     borderRadius: radii.pill,
//     backgroundColor: theme.brandTertiary,
//   },
//   retryBtnText: { color: theme.brand, fontWeight: "800", fontSize: 13 },
// });



















import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api } from "@/src/api";

// ---------- Types ----------
type ExamStructure = {
  levels: Record<string, string[]>;
  years: number[];
  papers: number[];
};

type Paper = {
  paper_id: string;
  subject: string;
  level: string;
  title: string;
  year: number;
  paper_number: number;
  pdf_url?: string;
  description?: string;
  saved: boolean;
  views?: number;
};

type FilterOptions = {
  levels: string[];
  subjects: string[];
  years: number[];
  papers: number[];
};

// ---------- Constants ----------
const DISPLAY_LEVELS = [
  { label: "GCE O", backend: "GCE O Level" },
  { label: "GCE A", backend: "GCE A Level" },
  { label: "HND", backend: "HND" },
  { label: "Concours", backend: "Concours" },
];

const RECENT_SEARCHES_KEY = "recent_paper_searches";
const MAX_RECENT_SEARCHES = 6;
const SEARCH_DEBOUNCE_MS = 350;

// ---------- Small hooks ----------
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

// ---------- Utility: highlight matching text ----------
function HighlightedText({
  text,
  query,
  style,
  highlightStyle,
}: {
  text: string;
  query: string;
  style?: any;
  highlightStyle?: any;
}) {
  if (!query.trim()) return <Text style={style}>{text}</Text>;

  const lower = text.toLowerCase();
  const q = query.trim().toLowerCase();
  const idx = lower.indexOf(q);

  if (idx === -1) return <Text style={style}>{text}</Text>;

  return (
    <Text style={style}>
      {text.slice(0, idx)}
      <Text style={[style, highlightStyle]}>
        {text.slice(idx, idx + q.length)}
      </Text>
      {text.slice(idx + q.length)}
    </Text>
  );
}

// ---------- Component ----------
export default function PastQuestions() {
  const router = useRouter();

  // ---------- State ----------
  const [structure, setStructure] = useState<ExamStructure | null>(null);
  const [selectedDisplayLevel, setSelectedDisplayLevel] = useState<string>(
    DISPLAY_LEVELS[0].label
  );
  const [selectedBackendLevel, setSelectedBackendLevel] = useState<string>(
    DISPLAY_LEVELS[0].backend
  );

  // IMPORTANT:
  // `subjects` is the subject list for the CURRENT selected level.
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  // Papers
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingStructure, setLoadingStructure] = useState<boolean>(true);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState<string>("");
  const debouncedQuery = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
  const [searchFocused, setSearchFocused] = useState<boolean>(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const searchInputRef = useRef<TextInput>(null);

  // Database-backed filter metadata.
  // This remains available for search/filter data, but the visible subject
  // chips are always taken from `structure.levels[selectedBackendLevel]`.
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    levels: [],
    subjects: [],
    years: [],
    papers: [1, 2, 3],
  });

  // Drafts
  const [drafts, setDrafts] = useState<Paper[]>([]);
  const [togglingDraft, setTogglingDraft] = useState<string | null>(null);

  // ---------- Load exam structure ----------
  useEffect(() => {
    const fetchStructure = async () => {
      try {
        const data = await api<ExamStructure>("/exam/structure", {
          auth: false,
        });

        setStructure(data);

        const firstBackendLevel = DISPLAY_LEVELS[0].backend;
        setSubjects(data.levels[firstBackendLevel] || []);
      } catch (err) {
        console.error("Failed to load subjects:", err);
        Alert.alert("Error", "Could not load subjects. Please try again.");
      } finally {
        setLoadingStructure(false);
      }
    };

    fetchStructure();
  }, []);

  // ---------- Load database-backed filter metadata ----------
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const data = await api<FilterOptions>("/papers/filters", {
          auth: false,
        });
        setFilterOptions(data);
      } catch (err) {
        console.error("Failed to load filter options:", err);
      }
    };

    fetchFilters();
  }, []);

  // ---------- Load recent searches ----------
  useEffect(() => {
    const loadRecent = async () => {
      try {
        const stored = await api<{ searches: string[] }>(
          `/user/preferences?key=${RECENT_SEARCHES_KEY}`,
          { auth: false }
        ).catch(() => null);

        if (stored?.searches) setRecentSearches(stored.searches);
      } catch {
        // Non-critical.
      }
    };

    loadRecent();
  }, []);

  const persistRecentSearch = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setRecentSearches((prev) => {
      const next = [
        trimmed,
        ...prev.filter((s) => s.toLowerCase() !== trimmed.toLowerCase()),
      ].slice(0, MAX_RECENT_SEARCHES);

      api(`/user/preferences`, {
        method: "POST",
        body: {
          key: RECENT_SEARCHES_KEY,
          value: next,
        },
      }).catch(() => { });

      return next;
    });
  }, []);

  const removeRecentSearch = useCallback((query: string) => {
    setRecentSearches((prev) => {
      const next = prev.filter((s) => s !== query);

      api(`/user/preferences`, {
        method: "POST",
        body: {
          key: RECENT_SEARCHES_KEY,
          value: next,
        },
      }).catch(() => { });

      return next;
    });
  }, []);

  // ---------- Update subjects when level changes ----------
  // This is the important part:
  // only subjects belonging to the selected backend level are displayed.
  useEffect(() => {
    if (!structure) return;

    const levelSubjects = structure.levels[selectedBackendLevel] || [];

    setSubjects(levelSubjects);
    setSelectedSubject(null);
  }, [selectedBackendLevel, structure]);

  // ---------- Fetch papers ----------
  const loadPapers = useCallback(
    async (opts?: { silent?: boolean }) => {
      const hasQuery = debouncedQuery.trim().length > 0;

      if (!opts?.silent) setLoading(true);
      setSearchError(null);

      try {
        const params = new URLSearchParams();

        if (selectedBackendLevel) {
          params.append("level", selectedBackendLevel);
        }

        if (selectedSubject) {
          params.append("subject", selectedSubject);
        }

        if (debouncedQuery.trim()) {
          params.append("q", debouncedQuery.trim());
        }

        const url = `/papers?${params.toString()}`;
        const response = await api<{ items: Paper[] } | Paper[]>(url);

        const items = Array.isArray(response)
          ? response
          : response && typeof response === "object" && "items" in response
            ? response.items || []
            : [];

        setPapers(items);

        if (hasQuery) {
          persistRecentSearch(debouncedQuery);
        }
      } catch (err) {
        console.error("Failed to load papers:", err);
        setSearchError("Could not load papers. Pull down to retry.");
        setPapers([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      selectedSubject,
      selectedBackendLevel,
      debouncedQuery,
      persistRecentSearch,
    ]
  );

  useEffect(() => {
    loadPapers();
  }, [loadPapers]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPapers({ silent: true });
  }, [loadPapers]);

  // ---------- Load drafts ----------
  const loadDrafts = useCallback(async () => {
    try {
      const data = await api<Paper[]>("/drafts");
      setDrafts(data || []);
    } catch (err) {
      console.error("Failed to load drafts:", err);
      setDrafts([]);
    }
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  // ---------- Toggle draft ----------
  const toggleDraft = async (paper: Paper) => {
    if (togglingDraft === paper.paper_id) return;

    setTogglingDraft(paper.paper_id);

    const wasSaved = paper.saved;

    setPapers((prev) =>
      prev.map((p) =>
        p.paper_id === paper.paper_id
          ? { ...p, saved: !wasSaved }
          : p
      )
    );

    try {
      const response = await api<{ saved: boolean }>("/drafts", {
        method: "POST",
        body: { paper_id: paper.paper_id },
      });

      const isSaved = response.saved;

      setPapers((prev) =>
        prev.map((p) =>
          p.paper_id === paper.paper_id
            ? { ...p, saved: isSaved }
            : p
        )
      );

      await loadDrafts();
    } catch (err) {
      console.error("Toggle draft error:", err);

      setPapers((prev) =>
        prev.map((p) =>
          p.paper_id === paper.paper_id
            ? { ...p, saved: wasSaved }
            : p
        )
      );

      Alert.alert("Error", "Could not update draft status.");
    } finally {
      setTogglingDraft(null);
    }
  };

  // ---------- Search suggestions ----------
  // Suggestions are restricted to the SUBJECTS OF THE CURRENT LEVEL.
  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    if (!q || q.length < 2) return [];

    return subjects
      .filter((s) => s.toLowerCase().includes(q))
      .slice(0, 4)
      .map((s) => ({
        type: "subject" as const,
        label: s,
      }));
  }, [searchQuery, subjects]);

  // ---------- Navigation ----------
  const openPaper = (paper: Paper) => {
    if (paper.pdf_url) {
      router.push({
        pathname: "/pdf",
        params: {
          url: paper.pdf_url,
          title: paper.title || `${paper.subject} ${paper.year}`,
          paper_id: paper.paper_id,
        },
      });
    } else {
      router.push(`/past-questions/${paper.paper_id}`);
    }
  };

  // ---------- Handle level change ----------
  const handleLevelChange = (displayLabel: string) => {
    setSelectedDisplayLevel(displayLabel);

    const backendLevel =
      DISPLAY_LEVELS.find((dl) => dl.label === displayLabel)?.backend || "";

    setSelectedBackendLevel(backendLevel);
  };

  const submitSearch = (query: string) => {
    setSearchQuery(query);
    setSearchFocused(false);
    searchInputRef.current?.blur();
  };

  // ---------- Skeleton loader ----------
  const SkeletonPaper = ({ index }: { index: number }) => (
    <View style={[styles.paper, styles.skeletonPaper]}>
      <View style={{ flex: 1, gap: 8 }}>
        <View
          style={[
            styles.skeletonBar,
            { width: `${60 - index * 5}%` },
          ]}
        />
        <View
          style={[
            styles.skeletonBar,
            { width: "40%", height: 10 },
          ]}
        />
      </View>

      <View
        style={[
          styles.skeletonBar,
          { width: 60, height: 28, borderRadius: radii.pill },
        ]}
      />
    </View>
  );

  // ---------- Search dropdown ----------
  const SearchDropdown = () => {
    if (!searchFocused) return null;

    const showRecents = !searchQuery.trim() && recentSearches.length > 0;
    const showSuggestions = suggestions.length > 0;

    if (!showRecents && !showSuggestions) return null;

    return (
      <View style={styles.searchDropdown}>
        {showRecents && (
          <>
            <View style={styles.searchDropdownHeader}>
              <Text style={styles.searchDropdownTitle}>Recent searches</Text>

              <Pressable onPress={() => setRecentSearches([])}>
                <Text style={styles.searchDropdownClear}>Clear</Text>
              </Pressable>
            </View>

            {recentSearches.map((s) => (
              <Pressable
                key={s}
                style={styles.searchDropdownRow}
                onPress={() => submitSearch(s)}
              >
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={theme.onSurfaceMuted}
                />

                <Text style={styles.searchDropdownRowText}>{s}</Text>

                <Pressable
                  hitSlop={8}
                  onPress={() => removeRecentSearch(s)}
                >
                  <Ionicons
                    name="close"
                    size={16}
                    color={theme.onSurfaceMuted}
                  />
                </Pressable>
              </Pressable>
            ))}
          </>
        )}

        {showSuggestions && (
          <>
            <View style={styles.searchDropdownHeader}>
              <Text style={styles.searchDropdownTitle}>Subjects</Text>
            </View>

            {suggestions.map((s) => (
              <Pressable
                key={s.label}
                style={styles.searchDropdownRow}
                onPress={() => submitSearch(s.label)}
              >
                <Ionicons
                  name="book-outline"
                  size={16}
                  color={theme.onSurfaceMuted}
                />

                <HighlightedText
                  text={s.label}
                  query={searchQuery}
                  style={styles.searchDropdownRowText}
                  highlightStyle={styles.searchHighlight}
                />
              </Pressable>
            ))}
          </>
        )}
      </View>
    );
  };

  // ---------- Render ----------
  return (
    <SafeAreaView
      edges={["top"]}
      style={styles.root}
      testID="past-questions-screen"
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-btn">
          <Ionicons name="arrow-back" size={22} color={theme.brand} />
        </Pressable>

        <Text style={styles.headerT}>Past Questions</Text>

        <View style={{ width: 22 }} />
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <View
            style={[
              styles.searchInputContainer,
              searchFocused && styles.searchInputContainerFocused,
            ]}
          >
            <Ionicons
              name="search-outline"
              size={20}
              color={theme.onSurfaceMuted}
            />

            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="Search papers, subjects, topics..."
              placeholderTextColor={theme.onSurfaceMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              onSubmitEditing={() => submitSearch(searchQuery)}
              returnKeyType="search"
              testID="search-input"
            />

            {loading && debouncedQuery !== searchQuery && (
              <ActivityIndicator
                size="small"
                color={theme.onSurfaceMuted}
              />
            )}

            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => setSearchQuery("")}
                hitSlop={8}
              >
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={theme.onSurfaceMuted}
                />
              </Pressable>
            )}
          </View>
        </View>

        <SearchDropdown />
      </View>

      {/* Level selector */}
      <View style={styles.levelSection}>
        <View style={styles.sectionTopLine}>
          <Text style={styles.sectionEyebrow}>EXAM LEVEL</Text>
          <Text style={styles.sectionContext}>{selectedDisplayLevel}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {DISPLAY_LEVELS.map((dl) => (
            <Pressable
              key={dl.label}
              testID={`level-${dl.label}`}
              onPress={() => handleLevelChange(dl.label)}
              style={[
                styles.chip,
                selectedDisplayLevel === dl.label && styles.chipActive,
              ]}
            >
              {selectedDisplayLevel === dl.label && (
                <View style={styles.chipDot} />
              )}

              <Text
                style={[
                  styles.chipTxt,
                  selectedDisplayLevel === dl.label && styles.chipTxtActive,
                ]}
              >
                {dl.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Subject selector — ONLY subjects belonging to selected level */}
      <View style={styles.subjectSection}>
        <View style={styles.subjectHeader}>
          <View>
            <Text style={styles.subjectTitle}>Subjects</Text>
            <Text style={styles.subjectHint}>
              Choose a subject to explore papers
            </Text>
          </View>

          <View style={styles.subjectCount}>
            <Text style={styles.subjectCountText}>{subjects.length}</Text>
          </View>
        </View>

        {loadingStructure ? (
          <View style={styles.subjectLoading}>
            <ActivityIndicator color={theme.brandPrimary} />
          </View>
        ) : subjects.length === 0 ? (
          <Text style={styles.emptyText}>No subjects available</Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subjectRow}
          >
            <Pressable
              testID="subject-all"
              onPress={() => setSelectedSubject(null)}
              style={[
                styles.subjectChip,
                selectedSubject === null && styles.subjectChipActive,
              ]}
            >
              <Ionicons
                name="apps-outline"
                size={15}
                color={
                  selectedSubject === null
                    ? theme.brand
                    : theme.onSurfaceMuted
                }
              />

              <Text
                style={[
                  styles.subjectChipText,
                  selectedSubject === null && styles.subjectChipTextActive,
                ]}
              >
                All
              </Text>
            </Pressable>

            {subjects.map((subj) => (
              <Pressable
                key={subj}
                testID={`subject-${subj}`}
                onPress={() => setSelectedSubject(subj)}
                style={[
                  styles.subjectChip,
                  selectedSubject === subj && styles.subjectChipActive,
                ]}
              >
                <Ionicons
                  name="book-outline"
                  size={15}
                  color={
                    selectedSubject === subj
                      ? theme.brand
                      : theme.onSurfaceMuted
                  }
                />

                <Text
                  style={[
                    styles.subjectChipText,
                    selectedSubject === subj &&
                    styles.subjectChipTextActive,
                  ]}
                >
                  {subj}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Main content */}
      <ScrollView
        contentContainerStyle={styles.mainContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.brandPrimary}
          />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.resultsHeader}>
          <Text style={styles.sec}>
            {searchQuery.trim()
              ? "Results"
              : selectedSubject || "All Papers"}
          </Text>

          {!loading && papers.length > 0 && (
            <Text style={styles.resultsCount}>
              {papers.length} {papers.length === 1 ? "paper" : "papers"}
            </Text>
          )}
        </View>

        {loading ? (
          <View style={{ gap: spacing.md }}>
            {[0, 1, 2].map((i) => (
              <SkeletonPaper key={i} index={i} />
            ))}
          </View>
        ) : searchError ? (
          <View style={styles.errorState}>
            <Ionicons
              name="cloud-offline-outline"
              size={28}
              color={theme.onSurfaceMuted}
            />

            <Text style={styles.emptyText}>{searchError}</Text>

            <Pressable
              style={styles.retryBtn}
              onPress={() => loadPapers()}
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : papers.length === 0 ? (
          <View style={styles.errorState}>
            <Ionicons
              name="search-outline"
              size={28}
              color={theme.onSurfaceMuted}
            />

            <Text style={styles.emptyText}>
              {searchQuery.trim()
                ? `No results for "${searchQuery.trim()}"`
                : "No papers found"}
            </Text>
          </View>
        ) : (
          papers.map((p) => (
            <Pressable
              key={p.paper_id}
              testID={`paper-${p.paper_id}`}
              style={styles.paper}
              onPress={() => openPaper(p)}
            >
              <View style={{ flex: 1 }}>
                <HighlightedText
                  text={p.title || `${p.subject} ${p.year}`}
                  query={debouncedQuery}
                  style={styles.paperT}
                  highlightStyle={styles.searchHighlight}
                />

                <Text style={styles.paperS}>
                  Paper {p.paper_number} · {p.year}
                  {p.pdf_url ? " · PDF available" : ""}
                  {typeof p.views === "number"
                    ? ` · ${p.views.toLocaleString()} views`
                    : ""}
                </Text>
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => toggleDraft(p)}
                  style={styles.saveBtn}
                  hitSlop={8}
                >
                  <Ionicons
                    name={p.saved ? "bookmark" : "bookmark-outline"}
                    size={22}
                    color={
                      p.saved
                        ? theme.brandPrimary
                        : theme.onSurfaceMuted
                    }
                  />
                </Pressable>

                <View style={styles.startBtn}>
                  <Text style={styles.startTxt}>
                    {p.pdf_url ? "PDF" : "Open"}
                  </Text>
                  <Ionicons
                    name={
                      p.pdf_url
                        ? "document-text"
                        : "arrow-forward"
                    }
                    size={14}
                    color="#fff"
                  />
                </View>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.surface,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
    paddingBottom: 10,
  },

  headerT: {
    fontSize: 19,
    fontWeight: "800",
    color: theme.brand,
    letterSpacing: -0.3,
  },

  searchWrap: {
    position: "relative",
    zIndex: 20,
  },

  searchBar: {
    paddingHorizontal: spacing.lg,
    marginBottom: 8,
  },

  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: theme.border,
    height: 46,
    gap: 9,
  },

  searchInputContainerFocused: {
    borderColor: theme.brandPrimary,
    ...shadow1,
  },

  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.onSurface,
    padding: 0,
  },

  searchDropdown: {
    position: "absolute",
    top: 54,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 4,
    ...shadow1,
  },

  searchDropdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },

  searchDropdownTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.onSurfaceMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  searchDropdownClear: {
    fontSize: 12,
    color: theme.brandPrimary,
    fontWeight: "700",
  },

  searchDropdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },

  searchDropdownRowText: {
    flex: 1,
    fontSize: 14,
    color: theme.onSurface,
  },

  searchHighlight: {
    fontWeight: "800",
    color: theme.brand,
  },

  levelSection: {
    paddingTop: 2,
  },

  sectionTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    marginBottom: 3,
  },

  sectionEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.onSurfaceMuted,
    letterSpacing: 1.1,
  },

  sectionContext: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.brand,
  },

  chipRow: {
    paddingHorizontal: spacing.lg,
    gap: 8,
    paddingVertical: 6,
  },

  chip: {
    flexShrink: 0,
    minHeight: 38,
    paddingHorizontal: 15,
    borderRadius: radii.pill,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  chipActive: {
    borderColor: theme.brandPrimary,
    backgroundColor: theme.brandTertiary,
  },

  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.brandPrimary,
  },

  chipTxt: {
    color: theme.onSurface,
    fontWeight: "700",
    fontSize: 13,
  },

  chipTxtActive: {
    color: theme.brand,
  },

  // Subject selector stays exactly 5px below the level selector.
  // It displays ONLY subjects belonging to the selected level.
  subjectSection: {
    marginTop: 5,
    paddingBottom: 4,
  },

  subjectHeader: {
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },

  subjectTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.onSurface,
    letterSpacing: -0.2,
  },

  subjectHint: {
    fontSize: 11,
    color: theme.onSurfaceMuted,
    marginTop: 1,
  },

  subjectCount: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 7,
    borderRadius: 14,
    backgroundColor: theme.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },

  subjectCountText: {
    color: theme.brand,
    fontSize: 11,
    fontWeight: "800",
  },

  subjectLoading: {
    height: 40,
    justifyContent: "center",
  },

  subjectRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 2,
  },

  subjectChip: {
    flexShrink: 0,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  subjectChipActive: {
    borderColor: theme.brandPrimary,
    backgroundColor: theme.brandTertiary,
  },

  subjectChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.onSurface,
  },

  subjectChipTextActive: {
    color: theme.brand,
  },

  mainContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
    paddingBottom: 40,
    gap: spacing.md,
  },

  sec: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.onSurface,
    letterSpacing: -0.1,
  },

  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 2,
  },

  resultsCount: {
    fontSize: 12,
    color: theme.onSurfaceMuted,
    fontWeight: "700",
  },

  paper: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: theme.border,
    minHeight: 82,
    ...shadow1,
  },

  paperT: {
    fontWeight: "800",
    color: theme.onSurface,
    fontSize: 14,
    lineHeight: 19,
  },

  paperS: {
    color: theme.onSurfaceMuted,
    fontSize: 11,
    marginTop: 3,
  },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  saveBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surfaceTertiary,
  },

  startBtn: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    backgroundColor: theme.brand,
    paddingHorizontal: 12,
    minHeight: 36,
    borderRadius: 11,
  },

  startTxt: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 11,
  },

  skeletonPaper: {
    opacity: 0.7,
  },

  skeletonBar: {
    height: 14,
    borderRadius: 6,
    backgroundColor: theme.surfaceTertiary,
  },

  errorState: {
    alignItems: "center",
    gap: 10,
    paddingVertical: spacing.lg,
  },

  emptyText: {
    color: theme.onSurfaceMuted,
    textAlign: "center",
    padding: spacing.sm,
    fontSize: 14,
  },

  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: theme.brandTertiary,
  },

  retryBtnText: {
    color: theme.brand,
    fontWeight: "800",
    fontSize: 13,
  },
});