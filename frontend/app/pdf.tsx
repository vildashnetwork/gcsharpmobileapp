
// // screens/PdfViewer.tsx
// import { useMemo, useRef, useState, useEffect } from "react";
// import {
//   View, Text, StyleSheet, Pressable, ActivityIndicator, Modal, ScrollView, SafeAreaView
// } from "react-native";
// import { useSafeAreaInsets } from "react-native-safe-area-context";
// import { WebView } from "react-native-webview";
// import * as Speech from "expo-speech";
// import { Ionicons } from "@expo/vector-icons";
// import { useLocalSearchParams, useRouter } from "expo-router";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
// import { pdfHtml } from "@/src/pdf-html";
// import { api } from "@/src/api";
// import { humanize } from "@/src/format";
// import { useReadingTimer } from "@/src/hooks/useReadingTimer";
// import { StreakBadge } from "@/src/components/StreakBadge";
// import { VideoSolutionPlayer } from "@/src/components/VideoSolutionPlayer";
// import { storage } from "@/src/utils/storage";

// const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL;

// type Paper = {
//   paper_id: string;
//   title: string;
//   subject: string;
//   level: string;
//   year: number;
//   paper_number: number;
//   pdf_url: string;
// };

// type VideoData = {
//   scenes: { heading: string; board: string[]; narration: string; audio?: string }[];
//   title: string;
//   question: string;
// };

// type QaItem = {
//   number: string;
//   question: string;
//   steps: string[];
//   answer: string;
// };

// type LocalHighlight = {
//   id: string;
//   paper_id: string;
//   text: string;
//   page: number;
//   title: string;
//   pdf_url: string;
//   saved_at: string;
// };

// const HIGHLIGHTS_KEY = "gcsmart_saved_highlights";

// function readableSolutionText(value: unknown): string[] {
//   if (value === null || value === undefined) return [];

//   if (typeof value === 'string') {
//     const text = value.trim();
//     if (!text) return [];
//     try {
//       return readableSolutionText(JSON.parse(text));
//     } catch {
//       return [text];
//     }
//   }

//   if (Array.isArray(value)) {
//     return value.flatMap((item) => readableSolutionText(item));
//   }

//   if (typeof value === 'object') {
//     const data = value as Record<string, unknown>;
//     const preferredKeys = ['body', 'explanation', 'text', 'answer', 'result', 'solution', 'steps'];
//     const preferredValues = preferredKeys.flatMap((key) =>
//       key in data ? readableSolutionText(data[key]) : []
//     );
//     if (preferredValues.length > 0) return preferredValues;

//     return Object.entries(data).flatMap(([key, item]) => {
//       if (['title', 'heading', 'question'].includes(key)) return [];
//       return readableSolutionText(item);
//     });
//   }

//   return [String(value)];
// }

// export default function PdfViewer() {
//   const { url, title, paper_id } = useLocalSearchParams<{ url: string; title?: string; paper_id?: string }>();
//   const router = useRouter();
//   const insets = useSafeAreaInsets();
//   const webRef = useRef<WebView>(null);
//   const [loading, setLoading] = useState(true);

//   // === READING TIMER ===
//   const { displaySeconds } = useReadingTimer(paper_id);

//   // === Paper details (to know if Paper 1) ===
//   const [paper, setPaper] = useState<Paper | null>(null);
//   const [paperLoading, setPaperLoading] = useState(true);

//   // === Video & QA states ===
//   const [videoData, setVideoData] = useState<VideoData | null>(null);
//   const [videoLoading, setVideoLoading] = useState(false);
//   const [qaItems, setQaItems] = useState<QaItem[]>([]);
//   const [qaLoading, setQaLoading] = useState(false);
//   const [showVideoModal, setShowVideoModal] = useState(false);
//   const [showQaModal, setShowQaModal] = useState(false);

//   // Bottom‑sheet states (existing)
//   const [askOpen, setAskOpen] = useState<{ text: string } | null>(null);
//   const [videoOpen, setVideoOpen] = useState<{ text: string } | null>(null);
//   const [saveOpen, setSaveOpen] = useState<{ text: string; page: number } | null>(null);
//   const [solution, setSolution] = useState<any>(null);
//   const [solLoading, setSolLoading] = useState(false);
//   const [speaking, setSpeaking] = useState(false);
//   const [savedMsg, setSavedMsg] = useState<string | null>(null);
//   const [draftSaved, setDraftSaved] = useState(false);

//   // Fetch paper details
//   useEffect(() => {
//     if (!paper_id) return;
//     (async () => {
//       try {
//         const res = await api<Paper>(`/papers/${paper_id}`);
//         setPaper(res);
//       } catch (e) {
//         console.warn('Failed to fetch paper', e);
//       } finally {
//         setPaperLoading(false);
//       }
//     })();
//   }, [paper_id]);

//   useEffect(() => {
//     if (!paper_id) return;
//     api<any[]>('/drafts')
//       .then((drafts) => setDraftSaved(drafts.some((draft) => draft.paper_id === paper_id)))
//       .catch(() => { });
//   }, [paper_id]);

//   // === Video generation (Paper 2+) ===
//   const generateVideo = async () => {
//     if (!paper_id) return;
//     setVideoLoading(true);
//     setVideoData(null);
//     try {
//       const data = await api<VideoData>(`/papers/${paper_id}/video`, { method: 'POST' });
//       setVideoData(data);
//       setShowVideoModal(true);
//     } catch (e) {
//       // toast error
//     } finally {
//       setVideoLoading(false);
//     }
//   };

//   // === QA generation (Paper 1) ===
//   const generateQA = async () => {
//     if (!paper_id) return;
//     setQaLoading(true);
//     setQaItems([]);
//     try {
//       const data = await api<{ items?: QaItem[] }>(`/papers/${paper_id}/qa`, { method: 'POST' });
//       setQaItems(data.items || []);
//       setShowQaModal(true);
//     } catch (e) {
//       // toast error
//     } finally {
//       setQaLoading(false);
//     }
//   };

//   // Existing functions...
//   const fullUrl = useMemo(
//     () => (url?.startsWith("http") ? url : `${BACKEND}${url ?? ""}`),
//     [url]
//   );
//   const html = useMemo(() => pdfHtml(fullUrl, 1), [fullUrl]);

//   const formatDuration = (totalSeconds: number) => {
//     const s = Math.floor(totalSeconds);
//     const h = Math.floor(s / 3600);
//     const m = Math.floor((s % 3600) / 60);
//     const sec = s % 60;
//     return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
//   };

//   const onMessage = (e: any) => {
//     try {
//       const msg = JSON.parse(e.nativeEvent.data);
//       if (msg.type === "meta") return;
//       if (msg.type === "ask") setAskOpen({ text: msg.text });
//       else if (msg.type === "video") setVideoOpen({ text: msg.text });
//       else if (msg.type === "draft") setSaveOpen({ text: msg.text, page: msg.page ?? 1 });
//     } catch { }
//   };

//   const askGcAi = () => {
//     const t = askOpen?.text || "";
//     setAskOpen(null);
//     router.push({ pathname: "/(tabs)/ai", params: { seed: t } });
//   };

//   const generateHighlightSolution = async () => {
//     if (!videoOpen || !paper_id) return;
//     setSolution(null);
//     setSolLoading(true);
//     try {
//       const r = await api<VideoData>(`/papers/${paper_id}/video/highlight`, {
//         method: "POST",
//         body: { text: videoOpen.text },
//       });
//       setSolution(r);
//     } catch (e: any) {
//       setSolution({ title: "Error", steps: [{ heading: "Failed", body: e.message }], narration: "" });
//     } finally { setSolLoading(false); }
//   };

//   const speakSolution = () => {
//     if (!solution) return;
//     if (speaking) { Speech.stop(); setSpeaking(false); return; }
//     setSpeaking(true);
//     const text = humanize(solution.narration || solution.steps.map((s: any) => `${s.heading}. ${s.body}`).join(" "));
//     Speech.speak(text, {
//       onDone: () => setSpeaking(false),
//       onStopped: () => setSpeaking(false),
//       onError: () => setSpeaking(false),
//       rate: 0.95,
//     });
//   };

//   const saveDraft = async () => {
//     if (!paper_id) return;
//     try {
//       if (saveOpen?.text) {
//         const savedHighlights = await storage.getItem<LocalHighlight[]>(HIGHLIGHTS_KEY, []);
//         const nextHighlight: LocalHighlight = {
//           id: `${paper_id}-${saveOpen.page}-${Date.now()}`,
//           paper_id,
//           text: saveOpen.text,
//           page: saveOpen.page,
//           title: title || paper?.title || "Saved paper",
//           pdf_url: url || paper?.pdf_url || "",
//           saved_at: new Date().toISOString(),
//         };
//         await storage.setItem(HIGHLIGHTS_KEY, [
//           nextHighlight,
//           ...(savedHighlights || []).filter((item) => item.text !== nextHighlight.text || item.paper_id !== paper_id),
//         ]);
//       }
//       const result = await api<{ saved: boolean }>('/drafts', {
//         method: "POST",
//         body: { paper_id },
//       });
//       setDraftSaved(result.saved);
//       setSavedMsg(result.saved ? "Paper saved to My Drafts." : "Paper removed from My Drafts.");
//     } catch (e: any) {
//       setSavedMsg(`Failed: ${e.message}`);
//     } finally { setSaveOpen(null); setTimeout(() => setSavedMsg(null), 3000); }
//   };

//   const closeVideoModal = () => {
//     Speech.stop();
//     setSpeaking(false);
//     setVideoOpen(null);
//     setSolution(null);
//   };

//   const isPaper1 = paper?.paper_number === 1;

//   return (
//     <View style={styles.root} testID="pdf-viewer">
//       <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
//         <Pressable onPress={() => router.back()} testID="back-btn">
//           <Ionicons name="arrow-back" size={22} color={theme.brand} />
//         </Pressable>

//         <Text style={styles.title} numberOfLines={1}>{title || "PDF Paper"}</Text>

//         <View style={styles.headerRight}>
//           <Pressable onPress={saveDraft} testID="save-draft-btn" style={styles.saveButton}>
//             <Ionicons name={draftSaved ? "bookmark" : "bookmark-outline"} size={20} color={theme.brand} />
//           </Pressable>
//           <View style={styles.headerMeta}>
//             <View style={styles.timer}>
//               <Ionicons name="time-outline" size={16} color={theme.onSurfaceMuted} />
//               <Text style={styles.timerText}>{formatDuration(displaySeconds)}</Text>
//             </View>
//             <StreakBadge />
//           </View>
//         </View>
//       </View>

//       <View style={{ flex: 1 }}>
//         <WebView
//           ref={webRef}
//           testID="pdf-webview"
//           originWhitelist={["*"]}
//           source={{ html, baseUrl: BACKEND }}
//           onMessage={onMessage}
//           onLoadEnd={() => setLoading(false)}
//           startInLoadingState
//           javaScriptEnabled
//           domStorageEnabled
//           mixedContentMode="always"
//         />
//         {loading && (
//           <View style={styles.loader}>
//             <ActivityIndicator size="large" color={theme.brandPrimary} />
//             <Text style={styles.loadTxt}>Loading paper…</Text>
//           </View>
//         )}
//         <View style={styles.hint} pointerEvents="none">
//           <Ionicons name="finger-print-outline" size={14} color="#fff" />
//           <Text style={styles.hintTxt}>Highlight any question to use GC AI</Text>
//         </View>

//         {/* AI action button - Paper1 vs Paper2 */}
//         {/* {!loading && !paperLoading && paper && (
//           <View style={styles.aiActionContainer}>
//             {isPaper1 ? (
//               <Pressable style={styles.aiActionButton} onPress={generateQA} disabled={qaLoading}>
//                 <Ionicons name="list-outline" size={20} color="#fff" />
//                 <Text style={styles.aiActionText}>
//                   {qaLoading ? 'Generating...' : 'Generate Step‑by‑Step Q&A'}
//                 </Text>
//               </Pressable>
//             ) : (
//               <Pressable style={styles.aiActionButton} onPress={generateVideo} disabled={videoLoading}>
//                 <Ionicons name="videocam-outline" size={20} color="#fff" />
//                 <Text style={styles.aiActionText}>
//                   {videoLoading ? 'Building video...' : 'Generate Video Solution'}
//                 </Text>
//               </Pressable>
//             )}
//           </View>
//         )} */}
//       </View>

//       {/* Saved toast */}
//       {savedMsg && (
//         <View style={[styles.toast, { bottom: 16 + insets.bottom }]} testID="draft-toast">
//           <Ionicons name="checkmark-circle" size={18} color={theme.success} />
//           <Text style={styles.toastTxt}>{savedMsg}</Text>
//         </View>
//       )}

//       {/* Ask GC AI confirmation */}
//       <Modal visible={!!askOpen} transparent animationType="slide" onRequestClose={() => setAskOpen(null)}>
//         <View style={styles.sheetBackdrop}>
//           <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} testID="ask-sheet">
//             <View style={styles.grabber} />
//             <Text style={styles.sheetTitle}>Ask GC AI</Text>
//             <Text style={styles.sheetSel} numberOfLines={5}>“{askOpen?.text}”</Text>
//             <Pressable style={styles.primaryBtn} onPress={askGcAi} testID="confirm-ask">
//               <Ionicons name="sparkles" size={18} color="#fff" />
//               <Text style={styles.primaryBtnTxt}>Open in AI chat</Text>
//             </Pressable>
//             <Pressable style={styles.ghostBtn} onPress={() => setAskOpen(null)} testID="cancel-ask">
//               <Text style={styles.ghostBtnTxt}>Cancel</Text>
//             </Pressable>
//           </View>
//         </View>
//       </Modal>

//       {/* Save draft */}
//       <Modal visible={!!saveOpen} transparent animationType="slide" onRequestClose={() => setSaveOpen(null)}>
//         <View style={styles.sheetBackdrop}>
//           <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} testID="save-sheet">
//             <View style={styles.grabber} />
//             <Text style={styles.sheetTitle}>Save as draft</Text>
//             <Text style={styles.sheetSel} numberOfLines={5}>{saveOpen?.text}</Text>
//             <Pressable style={styles.primaryBtn} onPress={saveDraft} testID="confirm-save">
//               <Ionicons name="bookmark" size={18} color="#fff" />
//               <Text style={styles.primaryBtnTxt}>Save to My Drafts</Text>
//             </Pressable>
//             <Pressable style={styles.ghostBtn} onPress={() => setSaveOpen(null)} testID="cancel-save">
//               <Text style={styles.ghostBtnTxt}>Cancel</Text>
//             </Pressable>
//           </View>
//         </View>
//       </Modal>

//       {/* Video solution (highlight) */}
//       <Modal visible={!!videoOpen} transparent animationType="slide" onRequestClose={closeVideoModal}>
//         <View style={styles.sheetBackdrop}>
//           <View style={[styles.sheetLg, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} testID="video-sheet">
//             <View style={styles.grabber} />
//             <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
//               <Text style={styles.sheetTitle}>Video Solution</Text>
//               <Pressable onPress={closeVideoModal} testID="close-video"><Ionicons name="close" size={22} color={theme.onSurface} /></Pressable>
//             </View>
//             <Text style={styles.sheetSel} numberOfLines={4}>Question: “{videoOpen?.text}”</Text>

//             {!solution && !solLoading && (
//               <Pressable style={styles.primaryBtn} onPress={generateHighlightSolution} testID="generate-video">
//                 <Ionicons name="film-outline" size={18} color="#fff" />
//                 <Text style={styles.primaryBtnTxt}>Generate narrated solution</Text>
//               </Pressable>
//             )}
//             {solLoading && (
//               <View style={{ alignItems: "center", padding: spacing.lg }}>
//                 <ActivityIndicator color={theme.brandPrimary} />
//                 <Text style={{ marginTop: 8, color: theme.onSurfaceMuted }}>Solving with GC AI</Text>
//               </View>
//             )}
//             {solution && (
//               <VideoSolutionPlayer
//                 scenes={solution.scenes || solution.steps?.map((step: any) => ({
//                   heading: humanize(step.heading),
//                   board: readableSolutionText(step.body).map((line) => humanize(line)),
//                   narration: readableSolutionText(step.body).map((line) => humanize(line)).join('. '),
//                 })) || []}
//                 title={solution.title}
//                 question={solution.question || videoOpen?.text}
//                 onClose={closeVideoModal}
//               />
//             )}
//           </View>
//         </View>
//       </Modal>

//       {/* Full video solution modal (Paper 2) */}
//       <Modal visible={showVideoModal} animationType="slide" onRequestClose={() => setShowVideoModal(false)}>
//         <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
//           <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom }}>
//             {videoData && (
//               <VideoSolutionPlayer
//                 scenes={videoData.scenes}
//                 title={videoData.title}
//                 question={videoData.question}
//                 onClose={() => setShowVideoModal(false)}
//               />
//             )}
//           </ScrollView>
//         </SafeAreaView>
//       </Modal>

//       {/* QA modal (Paper 1) */}
//       <Modal visible={showQaModal} animationType="slide" onRequestClose={() => setShowQaModal(false)}>
//         <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
//           <View style={styles.qaModalHeader}>
//             <Text style={styles.qaModalTitle}>Worked Solutions</Text>
//             <Pressable onPress={() => setShowQaModal(false)}>
//               <Ionicons name="close" size={24} color={theme.onSurface} />
//             </Pressable>
//           </View>
//           <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
//             {qaItems.map((item, i) => (
//               <View key={i} style={styles.qaItem}>
//                 <Text style={styles.qaQuestion}>Q{item.number}. {item.question}</Text>
//                 {item.steps.map((step, j) => (
//                   <Text key={j} style={styles.qaStep}>{j + 1}. {step}</Text>
//                 ))}
//                 <Text style={styles.qaAnswer}>Answer: {item.answer}</Text>
//               </View>
//             ))}
//           </ScrollView>
//         </SafeAreaView>
//       </Modal>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   root: { flex: 1, backgroundColor: theme.surface },
//   header: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     paddingHorizontal: spacing.lg,
//     paddingVertical: spacing.md,
//     backgroundColor: "#fff",
//     borderBottomWidth: 1,
//     borderBottomColor: theme.divider,
//   },
//   title: { fontSize: 16, fontWeight: "800", color: theme.brand, flex: 1, textAlign: "center", marginHorizontal: 12 },
//   headerRight: { alignItems: "flex-end", gap: 4 },
//   saveButton: { padding: 2 },
//   headerMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
//   timer: { flexDirection: "row", alignItems: "center", gap: 4 },
//   timerText: { fontSize: 13, fontWeight: "500", color: theme.onSurface },
//   loader: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: theme.surface, gap: 8 },
//   loadTxt: { color: theme.onSurfaceMuted },
//   hint: {
//     position: "absolute", left: 12, right: 12, bottom: 12, flexDirection: "row",
//     alignItems: "center", gap: 6, alignSelf: "center", backgroundColor: "rgba(10,25,47,0.85)",
//     paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill,
//   },
//   hintTxt: { color: "#fff", fontSize: 12, fontWeight: "600" },
//   aiActionContainer: {
//     position: 'absolute',
//     bottom: 70,
//     left: 0,
//     right: 0,
//     alignItems: 'center',
//   },
//   aiActionButton: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 8,
//     backgroundColor: theme.brandPrimary,
//     paddingHorizontal: 20,
//     paddingVertical: 12,
//     borderRadius: 30,
//     ...shadow1,
//   },
//   aiActionText: { color: '#fff', fontWeight: '700', fontSize: 14 },
//   toast: {
//     position: "absolute", left: 16, right: 16, backgroundColor: "#fff",
//     padding: 12, borderRadius: radii.md, flexDirection: "row", alignItems: "center", gap: 8, ...shadow1,
//   },
//   toastTxt: { color: theme.onSurface, flex: 1 },
//   sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
//   sheet: {
//     backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
//     padding: spacing.lg, gap: spacing.md,
//   },
//   sheetLg: {
//     backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
//     padding: spacing.lg, gap: spacing.md, maxHeight: "88%",
//   },
//   grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: theme.borderStrong, opacity: 0.4 },
//   sheetTitle: { fontSize: 18, fontWeight: "800", color: theme.onSurface },
//   sheetSel: { color: theme.onSurfaceMuted, backgroundColor: theme.surface, padding: spacing.md, borderRadius: radii.md, fontStyle: "italic" },
//   primaryBtn: {
//     backgroundColor: theme.brandPrimary, paddingVertical: 14, borderRadius: radii.md,
//     flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
//   },
//   primaryBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
//   ghostBtn: { paddingVertical: 12, alignItems: "center" },
//   ghostBtnTxt: { color: theme.onSurfaceMuted, fontWeight: "600" },
//   playerCard: { backgroundColor: theme.brand, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.md },
//   playerScreen: {
//     height: 120, backgroundColor: "#0F172A", borderRadius: radii.sm,
//     alignItems: "center", justifyContent: "center", gap: 6,
//   },
//   playerTitle: { color: "#fff", fontWeight: "700", textAlign: "center", paddingHorizontal: 12 },
//   playBtn: {
//     flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
//     backgroundColor: theme.brandPrimary, paddingVertical: 12, borderRadius: radii.md,
//   },
//   playBtnTxt: { color: "#fff", fontWeight: "700" },
//   stepCard: { flexDirection: "row", gap: 12, backgroundColor: theme.surface, padding: spacing.md, borderRadius: radii.md, marginBottom: spacing.sm },
//   stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: theme.success, alignItems: "center", justifyContent: "center" },
//   stepNumTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
//   stepHead: { fontWeight: "800", color: theme.onSurface, marginBottom: 3 },
//   stepBody: { color: theme.onSurface, lineHeight: 20, fontSize: 13 },
//   qaModalHeader: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     padding: spacing.md,
//     borderBottomWidth: 1,
//     borderBottomColor: theme.border,
//   },
//   qaModalTitle: { fontSize: 18, fontWeight: '700', color: theme.onSurface },
//   qaItem: { marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.divider },
//   qaQuestion: { fontWeight: '600', fontSize: 14, marginBottom: 4 },
//   qaStep: { fontSize: 13, color: theme.onSurface, marginLeft: 8, marginBottom: 2 },
//   qaAnswer: { fontWeight: '600', fontSize: 14, marginTop: 4, color: theme.success },
// });







































// screens/PdfViewer.tsx
import { useMemo, useRef, useState, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Modal, ScrollView, SafeAreaView, AppState
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import * as Speech from "expo-speech";
import * as ScreenCapture from "expo-screen-capture";
import { File } from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
import { pdfHtml } from "@/src/pdf-html";
import { api } from "@/src/api";
import { humanize } from "@/src/format";
import { useReadingTimer } from "@/src/hooks/useReadingTimer";
import { StreakBadge } from "@/src/components/StreakBadge";
import { VideoSolutionPlayer } from "@/src/components/VideoSolutionPlayer";
import { storage } from "@/src/utils/storage";
import { useNetworkStatus } from "@/src/lib/useNetworkStatus";
import { useLanguage } from "@/src/i18n";
import {
  getLocalMediaUri,
  cacheMediaBytes,
  getMediaManifestEntry,
  listCachedMedia,
  deleteCachedMedia,
  type MediaManifestEntry,
} from "@/src/lib/mediaStore";
import { PDFJS_RUNTIME, PDFJS_WORKER } from "@/src/generated/pdfjsRuntime";

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL;

type Paper = {
  paper_id: string;
  title: string;
  subject: string;
  level: string;
  year: number;
  paper_number: number;
  pdf_url: string;
};

type VideoData = {
  scenes: { heading: string; board: string[]; narration: string; audio?: string }[];
  title: string;
  question: string;
};

type QaItem = {
  number: string;
  question: string;
  steps: string[];
  answer: string;
};

type LocalHighlight = {
  id: string;
  paper_id: string;
  text: string;
  page: number;
  title: string;
  pdf_url: string;
  saved_at: string;
};

const HIGHLIGHTS_KEY = "gcsmart_saved_highlights";
const OFFLINE_PILL_VISIBLE_KEY = "gcsmart_pdf_offline_pill_visible";

function readableSolutionText(value: unknown): string[] {
  if (value === null || value === undefined) return [];

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    try {
      return readableSolutionText(JSON.parse(text));
    } catch {
      return [text];
    }
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => readableSolutionText(item));
  }

  if (typeof value === 'object') {
    const data = value as Record<string, unknown>;
    const preferredKeys = ['body', 'explanation', 'text', 'answer', 'result', 'solution', 'steps'];
    const preferredValues = preferredKeys.flatMap((key) =>
      key in data ? readableSolutionText(data[key]) : []
    );
    if (preferredValues.length > 0) return preferredValues;

    return Object.entries(data).flatMap(([key, item]) => {
      if (['title', 'heading', 'question'].includes(key)) return [];
      return readableSolutionText(item);
    });
  }

  return [String(value)];
}

// ---------- Offline PDF downloads helpers ----------

type DownloadItem = {
  paper_id?: string;
  title: string;
  subject?: string;
  year?: number;
  paper_number?: number;
  pdf_url: string;
  cached: boolean;
  localUri?: string;
  bytes?: number;
  cachedAt?: number;
};

/** Derives a readable title from a pdf url when no library title is known. */
function titleFromUrl(url: string): string {
  try {
    const path = url.split("?")[0];
    const last = path.substring(path.lastIndexOf("/") + 1);
    const name = decodeURIComponent(last).replace(/\.pdf$/i, "").trim();
    return name ? humanize(name) : "Downloaded paper";
  } catch {
    return "Downloaded paper";
  }
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "Saved";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default function PdfViewer() {
  useTheme(); // re-render this screen when light/dark changes
  const { url, title, paper_id } = useLocalSearchParams<{ url: string; title?: string; paper_id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);

  // === SCREEN CAPTURE PROTECTION ===
  // Android: blocks screenshots + recording entirely (FLAG_SECURE) while this screen is mounted.
  // iOS: blocks screen recording + live app-switcher preview; screenshots themselves cannot be
  // blocked by any app on iOS (Apple restriction) — we can only detect them after the fact below.
  const [privacyBlur, setPrivacyBlur] = useState(false);

  useEffect(() => {
    let screenshotSub: ScreenCapture.Subscription | undefined;

    (async () => {
      try {
        await ScreenCapture.preventScreenCaptureAsync();
      } catch (e) {
        console.warn("Failed to enable screen capture prevention", e);
      }
    })();

    // iOS-only: fires after a screenshot is taken. No-op on Android.
    screenshotSub = ScreenCapture.addScreenshotListener(() => {
      setSavedMsg(t.pdf.highlightHint);
      setTimeout(() => setSavedMsg(null), 3000);
    });

    return () => {
      ScreenCapture.allowScreenCaptureAsync().catch(() => { });
      screenshotSub?.remove();
    };
  }, []);

  // Blur content when app is backgrounded/inactive so the OS app-switcher
  // snapshot doesn't expose paper content.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      setPrivacyBlur(state !== "active");
    });
    return () => sub.remove();
  }, []);

  // === READING TIMER ===
  const { displaySeconds } = useReadingTimer(paper_id);

  // === Paper details (to know if Paper 1) ===
  const [paper, setPaper] = useState<Paper | null>(null);
  const [paperLoading, setPaperLoading] = useState(true);

  // === Video & QA states ===
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [qaItems, setQaItems] = useState<QaItem[]>([]);
  const [qaLoading, setQaLoading] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showQaModal, setShowQaModal] = useState(false);

  // Bottom‑sheet states (existing)
  const [askOpen, setAskOpen] = useState<{ text: string } | null>(null);
  const [videoOpen, setVideoOpen] = useState<{ text: string } | null>(null);
  const [saveOpen, setSaveOpen] = useState<{ text: string; page: number } | null>(null);
  const [solution, setSolution] = useState<any>(null);
  const [solLoading, setSolLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);

  // === OFFLINE PDF DOWNLOADS ===
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [downloadsLoading, setDownloadsLoading] = useState(false);
  const [downloadItems, setDownloadItems] = useState<DownloadItem[]>([]);
  const [downloadingUrls, setDownloadingUrls] = useState<string[]>([]);
  const [currentCached, setCurrentCached] = useState(false);
  const [downloadingCurrent, setDownloadingCurrent] = useState(false);

  // Whether the floating "available offline" pill is shown. Persisted
  // on-device so a student who hides it keeps it hidden across papers.
  const [offlinePillVisible, setOfflinePillVisible] = useState(true);

  useEffect(() => {
    storage.getItem<boolean>(OFFLINE_PILL_VISIBLE_KEY, true).then((saved) => {
      setOfflinePillVisible(saved !== false);
    });
  }, []);

  const toggleOfflinePill = () => {
    setOfflinePillVisible((prev) => {
      const next = !prev;
      storage.setItem(OFFLINE_PILL_VISIBLE_KEY, next).catch(() => { });
      return next;
    });
  };

  // Fetch paper details
  useEffect(() => {
    if (!paper_id) return;
    (async () => {
      try {
        const res = await api<Paper>(`/papers/${paper_id}`);
        setPaper(res);
      } catch (e) {
        console.warn('Failed to fetch paper', e);
      } finally {
        setPaperLoading(false);
      }
    })();
  }, [paper_id]);

  useEffect(() => {
    if (!paper_id) return;
    api<any[]>('/drafts')
      .then((drafts) => setDraftSaved(drafts.some((draft) => draft.paper_id === paper_id)))
      .catch(() => { });
  }, [paper_id]);

  // === Video generation (Paper 2+) ===
  const generateVideo = async () => {
    if (!paper_id) return;
    setVideoLoading(true);
    setVideoData(null);
    try {
      const data = await api<VideoData>(`/papers/${paper_id}/video`, { method: 'POST' });
      setVideoData(data);
      setShowVideoModal(true);
    } catch (e) {
      // toast error
    } finally {
      setVideoLoading(false);
    }
  };

  // === QA generation (Paper 1) ===
  const generateQA = async () => {
    if (!paper_id) return;
    setQaLoading(true);
    setQaItems([]);
    try {
      const data = await api<{ items?: QaItem[] }>(`/papers/${paper_id}/qa`, { method: 'POST' });
      setQaItems(data.items || []);
      setShowQaModal(true);
    } catch (e) {
      // toast error
    } finally {
      setQaLoading(false);
    }
  };

  // Existing functions...
  const isOnline = useNetworkStatus();

  // Resolve the PDF source for the WebView:
  //  - ONLINE: the remote URL (and kick off a background byte-cache so the
  //    paper is available offline next time).
  //  - OFFLINE: a base64 data URI built from the on-device cached bytes.
  // The pdf.js runtime is always inlined into the HTML, so the viewer never
  // needs the CDN — only the PDF bytes themselves differ online/offline.
  const fullUrl = useMemo(
    () => (url?.startsWith("http") ? url : `${BACKEND}${url ?? ""}`),
    [url]
  );
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!fullUrl) {
        if (mounted) setPdfSrc(null);
        return;
      }
      // Prefer the on-device downloaded copy when it exists: it opens
      // instantly and works offline — downloaded PDFs are used in-app.
      try {
        const localUri = await getLocalMediaUri(fullUrl);
        if (localUri) {
          const b64 = await new File(localUri).base64();
          if (mounted) setPdfSrc(`data:application/pdf;base64,${b64}`);
          return;
        }
      } catch (e) {
        console.warn("[PdfViewer] Cached PDF read failed:", e);
      }
      if (isOnline) {
        // Best-effort background caching of the bytes for offline use.
        cacheMediaBytes(fullUrl, "pdf").catch(() => { });
        if (mounted) setPdfSrc(fullUrl);
        return;
      }
      // No cached copy and offline — point at the URL; the WebView will show
      // its own load error, which is honest about what's available.
      if (mounted) setPdfSrc(fullUrl);
    })();
    return () => {
      mounted = false;
    };
  }, [fullUrl, isOnline]);

  // --- Downloads manager: cached PDFs + one-tap download for the rest ---

  // Tracks whether the paper currently open already has its bytes on-device.
  useEffect(() => {
    let mounted = true;
    if (!fullUrl) {
      if (mounted) setCurrentCached(false);
      return;
    }
    getLocalMediaUri(fullUrl)
      .then((uri) => {
        if (mounted) setCurrentCached(!!uri);
      })
      .catch(() => {
        if (mounted) setCurrentCached(false);
      });
    return () => {
      mounted = false;
    };
  }, [fullUrl, downloadsOpen]);

  // Builds the downloads list: cached PDFs first, then papers that can still
  // be downloaded. Cached files that no longer match a library paper are kept
  // so users can open (or clean up) everything stored on the device.
  const loadDownloads = async () => {
    setDownloadsLoading(true);
    try {
      const [cached, papersRes] = await Promise.all([
        listCachedMedia(),
        api<{ items: Paper[] } | Paper[]>("/papers").catch(() => null),
      ]);
      const cacheByUrl = new Map<string, MediaManifestEntry>();
      for (const entry of cached) {
        if (entry.kind === "pdf") cacheByUrl.set(entry.remoteUrl, entry);
      }

      const items = Array.isArray(papersRes)
        ? papersRes
        : papersRes && typeof papersRes === "object" && "items" in papersRes
          ? papersRes.items || []
          : [];

      const list: DownloadItem[] = [];
      const seen = new Set<string>();

      for (const p of items) {
        if (!p.pdf_url) continue;
        const full = p.pdf_url.startsWith("http") ? p.pdf_url : `${BACKEND}${p.pdf_url}`;
        if (seen.has(full)) continue;
        seen.add(full);
        const entry = cacheByUrl.get(full);
        list.push({
          paper_id: p.paper_id,
          title: p.title || `${p.subject} ${p.year}`,
          subject: p.subject,
          year: p.year,
          paper_number: p.paper_number,
          pdf_url: full,
          cached: !!entry,
          localUri: entry?.localUri,
          bytes: entry?.bytes,
          cachedAt: entry?.cachedAt,
        });
        cacheByUrl.delete(full);
      }

      for (const entry of cacheByUrl.values()) {
        list.push({
          title: titleFromUrl(entry.remoteUrl),
          pdf_url: entry.remoteUrl,
          cached: true,
          localUri: entry.localUri,
          bytes: entry.bytes,
          cachedAt: entry.cachedAt,
        });
      }

      list.sort((a, b) => {
        if (a.cached !== b.cached) return a.cached ? -1 : 1;
        return (b.cachedAt || 0) - (a.cachedAt || 0);
      });

      setDownloadItems(list);
    } finally {
      setDownloadsLoading(false);
    }
  };

  const openDownloads = () => {
    setDownloadsOpen(true);
    loadDownloads();
  };

  const downloadPdf = async (item: DownloadItem) => {
    if (downloadingUrls.includes(item.pdf_url)) return;
    setDownloadingUrls((prev) => [...prev, item.pdf_url]);
    try {
      const localUri = await cacheMediaBytes(item.pdf_url, "pdf");
      const entry = localUri ? await getMediaManifestEntry(item.pdf_url) : null;
      setDownloadItems((prev) =>
        prev.map((it) =>
          it.pdf_url === item.pdf_url
            ? {
              ...it,
              cached: !!localUri,
              localUri: localUri || it.localUri,
              bytes: entry?.bytes ?? it.bytes,
              cachedAt: localUri ? Date.now() : it.cachedAt,
            }
            : it
        )
      );
      if (item.pdf_url === fullUrl) setCurrentCached(!!localUri);
      setSavedMsg(
        localUri
          ? `“${item.title}” ${t.pdf.readOffline}`
          : `${t.pdf.couldntDownload} “${item.title}”. ${t.pdf.checkConnection}`
      );
      setTimeout(() => setSavedMsg(null), 3000);
    } finally {
      setDownloadingUrls((prev) => prev.filter((u) => u !== item.pdf_url));
    }
  };

  const downloadCurrentPdf = async () => {
    if (!fullUrl || currentCached || downloadingCurrent) return;
    setDownloadingCurrent(true);
    try {
      const localUri = await cacheMediaBytes(fullUrl, "pdf");
      setCurrentCached(!!localUri);
      setSavedMsg(
        localUri
          ? t.pdf.paperDownloaded
          : t.pdf.downloadFailed
      );
      setTimeout(() => setSavedMsg(null), 3000);
    } finally {
      setDownloadingCurrent(false);
    }
  };

  const openDownloaded = (item: DownloadItem) => {
    setDownloadsOpen(false);
    router.push({
      pathname: "/pdf",
      params: {
        url: item.pdf_url,
        title: item.title,
        ...(item.paper_id ? { paper_id: item.paper_id } : {}),
      },
    });
  };

  const removeDownload = async (item: DownloadItem) => {
    try {
      await deleteCachedMedia(item.pdf_url);
      setDownloadItems((prev) =>
        prev.map((it) =>
          it.pdf_url === item.pdf_url
            ? { ...it, cached: false, localUri: undefined, bytes: undefined, cachedAt: undefined }
            : it
        )
      );
      if (item.pdf_url === fullUrl) setCurrentCached(false);
      setSavedMsg(`${t.pdf.removed} “${item.title}” ${t.pdf.fromDevice}`);
      setTimeout(() => setSavedMsg(null), 3000);
    } catch {
      // ignore
    }
  };

  const html = useMemo(
    () => pdfHtml(pdfSrc ?? "", 1, { pdfjsRuntime: PDFJS_RUNTIME, pdfjsWorker: PDFJS_WORKER }),
    [pdfSrc]
  );

  const formatDuration = (totalSeconds: number) => {
    const s = Math.floor(totalSeconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const onMessage = (e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "meta") return;
      if (msg.type === "ask") setAskOpen({ text: msg.text });
      else if (msg.type === "video") setVideoOpen({ text: msg.text });
      else if (msg.type === "draft") setSaveOpen({ text: msg.text, page: msg.page ?? 1 });
    } catch { }
  };

  const askGcAi = () => {
    const t = askOpen?.text || "";
    setAskOpen(null);
    router.push({ pathname: "/(tabs)/ai", params: { seed: t } });
  };

  const generateHighlightSolution = async () => {
    if (!videoOpen || !paper_id) return;
    setSolution(null);
    setSolLoading(true);
    try {
      const r = await api<VideoData>(`/papers/${paper_id}/video/highlight`, {
        method: "POST",
        body: { text: videoOpen.text },
      });
      setSolution(r);
    } catch (e: any) {
      setSolution({ title: "Error", steps: [{ heading: "Failed", body: e.message }], narration: "" });
    } finally { setSolLoading(false); }
  };

  const speakSolution = () => {
    if (!solution) return;
    if (speaking) { Speech.stop(); setSpeaking(false); return; }
    setSpeaking(true);
    const text = humanize(solution.narration || solution.steps.map((s: any) => `${s.heading}. ${s.body}`).join(" "));
    Speech.speak(text, {
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
      rate: 0.95,
    });
  };

  const saveDraft = async () => {
    if (!paper_id) return;
    try {
      if (saveOpen?.text) {
        const savedHighlights = await storage.getItem<LocalHighlight[]>(HIGHLIGHTS_KEY, []);
        const nextHighlight: LocalHighlight = {
          id: `${paper_id}-${saveOpen.page}-${Date.now()}`,
          paper_id,
          text: saveOpen.text,
          page: saveOpen.page,
          title: title || paper?.title || "Saved paper",
          pdf_url: url || paper?.pdf_url || "",
          saved_at: new Date().toISOString(),
        };
        await storage.setItem(HIGHLIGHTS_KEY, [
          nextHighlight,
          ...(savedHighlights || []).filter((item) => item.text !== nextHighlight.text || item.paper_id !== paper_id),
        ]);
      }
      const result = await api<{ saved: boolean }>('/drafts', {
        method: "POST",
        body: { paper_id },
      });
      setDraftSaved(result.saved);
      setSavedMsg(result.saved ? "Paper saved to My Drafts." : "Paper removed from My Drafts.");
    } catch (e: any) {
      setSavedMsg(`Failed: ${e.message}`);
    } finally { setSaveOpen(null); setTimeout(() => setSavedMsg(null), 3000); }
  };

  const closeVideoModal = () => {
    Speech.stop();
    setSpeaking(false);
    setVideoOpen(null);
    setSolution(null);
  };

  const isPaper1 = paper?.paper_number === 1;

  return (
    <View style={styles.root} testID="pdf-viewer">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerTopRow}>
          <Pressable onPress={() => router.back()} testID="back-btn" hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={theme.brand} />
          </Pressable>

          <View style={styles.headerActions}>
            <Pressable
              onPress={toggleOfflinePill}
              testID="toggle-offline-pill-btn"
              accessibilityLabel={
                offlinePillVisible ? t.pdf.hideOfflineBtn : t.pdf.showOfflineBtn
              }
              accessibilityRole="switch"
              accessibilityState={{ checked: offlinePillVisible }}
              style={styles.saveButton}
            >
              <Ionicons
                name={offlinePillVisible ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={theme.brand}
              />
            </Pressable>
            <Pressable onPress={openDownloads} testID="downloads-btn" style={styles.saveButton}>
              <Ionicons name="cloud-download-outline" size={20} color={theme.brand} />
            </Pressable>
            <Pressable onPress={saveDraft} testID="save-draft-btn" style={styles.saveButton}>
              <Ionicons name={draftSaved ? "bookmark" : "bookmark-outline"} size={20} color={theme.brand} />
            </Pressable>
          </View>
        </View>

        {/* Paper title is always fully visible — 2 lines max, never clipped
            by the timer / streak badges (they live on their own row below). */}
        <Text style={styles.title} numberOfLines={2}>
          {title || paper?.title || t.pdf.paper}
        </Text>
        {(paper?.subject || paper?.year || paper?.paper_number) && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {[
              paper?.subject,
              paper?.year,
              paper?.paper_number ? `Paper ${paper.paper_number}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        )}

        <View style={styles.headerMeta}>
          <View style={styles.timer}>
            <Ionicons name="time-outline" size={16} color={theme.onSurfaceMuted} />
            <Text style={styles.timerText}>{formatDuration(displaySeconds)}</Text>
          </View>
          <StreakBadge />
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <WebView
          ref={webRef}
          testID="pdf-webview"
          originWhitelist={["*"]}
          source={{ html, baseUrl: BACKEND }}
          onMessage={onMessage}
          onLoadEnd={() => setLoading(false)}
          startInLoadingState
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
        />
        {loading && (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={theme.brandPrimary} />
            <Text style={styles.loadTxt}>{t.pdf.loadingPaper}</Text>
          </View>
        )}
        <View style={styles.hint} pointerEvents="none">
          <Ionicons name="finger-print-outline" size={14} color="#fff" />
          <Text style={styles.hintTxt}>{t.pdf.highlightHint}</Text>
        </View>

        {/* Offline download status / action for the open paper.
            Students can hide this pill from the eye button in the top bar. */}
        {fullUrl && offlinePillVisible && (
          <View style={styles.offlinePillWrap} testID="offline-download-pill">
            <Pressable
              onPress={downloadCurrentPdf}
              disabled={downloadingCurrent || currentCached}
              style={[styles.offlinePill, currentCached && styles.offlinePillDone]}
            >
              {downloadingCurrent ? (
                <ActivityIndicator size="small" color={theme.onBrandPrimary} />
              ) : (
                <Ionicons
                  name={currentCached ? "checkmark-circle" : "cloud-download-outline"}
                  size={15}
                  color={currentCached ? theme.success : theme.onBrandPrimary}
                />
              )}
              <Text
                style={[
                  styles.offlinePillTxt,
                  currentCached && { color: theme.onSurface },
                ]}
              >
                {downloadingCurrent
                  ? t.pdf.downloading
                  : currentCached
                    ? t.pdf.availableOffline
                    : t.pdf.downloadOffline}
              </Text>
            </Pressable>
            <Pressable
              onPress={toggleOfflinePill}
              testID="hide-offline-pill-btn"
              accessibilityLabel={t.pdf.hideOfflineBtn}
              hitSlop={8}
              style={styles.offlinePillClose}
            >
              <Ionicons name="close" size={14} color={theme.onSurfaceMuted} />
            </Pressable>
          </View>
        )}

        {/* AI action button - Paper1 vs Paper2 */}
        {/* {!loading && !paperLoading && paper && (
          <View style={styles.aiActionContainer}>
            {isPaper1 ? (
              <Pressable style={styles.aiActionButton} onPress={generateQA} disabled={qaLoading}>
                <Ionicons name="list-outline" size={20} color="#fff" />
                <Text style={styles.aiActionText}>
                  {qaLoading ? 'Generating...' : 'Generate Step‑by‑Step Q&A'}
                </Text>
              </Pressable>
            ) : (
              <Pressable style={styles.aiActionButton} onPress={generateVideo} disabled={videoLoading}>
                <Ionicons name="videocam-outline" size={20} color="#fff" />
                <Text style={styles.aiActionText}>
                  {videoLoading ? 'Building video...' : 'Generate Video Solution'}
                </Text>
              </Pressable>
            )}
          </View>
        )} */}
      </View>

      {/* Privacy overlay: shown while app is backgrounded/inactive so the
          OS app-switcher snapshot doesn't expose paper content. */}
      {privacyBlur && (
        <View style={styles.privacyOverlay} pointerEvents="none">
          <Ionicons name="lock-closed" size={28} color="#fff" />
        </View>
      )}

      {/* Saved toast */}
      {savedMsg && (
        <View style={[styles.toast, { bottom: 16 + insets.bottom }]} testID="draft-toast">
          <Ionicons name="checkmark-circle" size={18} color={theme.success} />
          <Text style={styles.toastTxt}>{savedMsg}</Text>
        </View>
      )}

      {/* Ask GC AI confirmation */}
      <Modal visible={!!askOpen} transparent animationType="slide" onRequestClose={() => setAskOpen(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} testID="ask-sheet">
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>{t.pdf.askAi}</Text>
            <Text style={styles.sheetSel} numberOfLines={5}>“{askOpen?.text}”</Text>
            <Pressable style={styles.primaryBtn} onPress={askGcAi} testID="confirm-ask">
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={styles.primaryBtnTxt}>{t.pdf.openInChat}</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={() => setAskOpen(null)} testID="cancel-ask">
              <Text style={styles.ghostBtnTxt}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Save draft */}
      <Modal visible={!!saveOpen} transparent animationType="slide" onRequestClose={() => setSaveOpen(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} testID="save-sheet">
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>{t.pdf.saveDraft}</Text>
            <Text style={styles.sheetSel} numberOfLines={5}>{saveOpen?.text}</Text>
            <Pressable style={styles.primaryBtn} onPress={saveDraft} testID="confirm-save">
              <Ionicons name="bookmark" size={18} color="#fff" />
              <Text style={styles.primaryBtnTxt}>{t.pdf.saveToDrafts}</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={() => setSaveOpen(null)} testID="cancel-save">
              <Text style={styles.ghostBtnTxt}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Video solution (highlight) */}
      <Modal visible={!!videoOpen} transparent animationType="slide" onRequestClose={closeVideoModal}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheetLg, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} testID="video-sheet">
            <View style={styles.grabber} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.sheetTitle}>{t.pdf.videoSolution}</Text>
              <Pressable onPress={closeVideoModal} testID="close-video"><Ionicons name="close" size={22} color={theme.onSurface} /></Pressable>
            </View>
            <Text style={styles.sheetSel} numberOfLines={4}>{t.pdf.question}: “{videoOpen?.text}”</Text>

            {!solution && !solLoading && (
              <Pressable style={styles.primaryBtn} onPress={generateHighlightSolution} testID="generate-video">
                <Ionicons name="film-outline" size={18} color="#fff" />
                <Text style={styles.primaryBtnTxt}>{t.pdf.generateNarration}</Text>
              </Pressable>
            )}
            {solLoading && (
              <View style={{ alignItems: "center", padding: spacing.lg }}>
                <ActivityIndicator color={theme.brandPrimary} />
                <Text style={{ marginTop: 8, color: theme.onSurfaceMuted }}>{t.pdf.solving}</Text>
              </View>
            )}
            {solution && (
              <VideoSolutionPlayer
                scenes={solution.scenes || solution.steps?.map((step: any) => ({
                  heading: humanize(step.heading),
                  board: readableSolutionText(step.body).map((line) => humanize(line)),
                  narration: readableSolutionText(step.body).map((line) => humanize(line)).join('. '),
                })) || []}
                title={solution.title}
                question={solution.question || videoOpen?.text}
                onClose={closeVideoModal}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Full video solution modal (Paper 2) */}
      <Modal visible={showVideoModal} animationType="slide" onRequestClose={() => setShowVideoModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.surfaceSecondary }}>
          <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom }}>
            {videoData && (
              <VideoSolutionPlayer
                scenes={videoData.scenes}
                title={videoData.title}
                question={videoData.question}
                onClose={() => setShowVideoModal(false)}
              />
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* QA modal (Paper 1) */}
      <Modal visible={showQaModal} animationType="slide" onRequestClose={() => setShowQaModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.surfaceSecondary }}>
          <View style={styles.qaModalHeader}>
            <Text style={styles.qaModalTitle}>{t.pdf.workedSolutions}</Text>
            <Pressable onPress={() => setShowQaModal(false)}>
              <Ionicons name="close" size={24} color={theme.onSurface} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
            {qaItems.map((item, i) => (
              <View key={i} style={styles.qaItem}>
                <Text style={styles.qaQuestion}>Q{item.number}. {item.question}</Text>
                {item.steps.map((step, j) => (
                  <Text key={j} style={styles.qaStep}>{j + 1}. {step}</Text>
                ))}
                <Text style={styles.qaAnswer}>{t.pdf.answer}: {item.answer}</Text>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* PDF downloads manager: everything cached on-device, plus one-tap
          downloads for papers that aren't stored yet. */}
      <Modal visible={downloadsOpen} transparent animationType="slide" onRequestClose={() => setDownloadsOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheetLg, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} testID="downloads-sheet">
            <View style={styles.grabber} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.sheetTitle}>{t.pdf.downloads}</Text>
              <Pressable onPress={() => setDownloadsOpen(false)} testID="close-downloads">
                <Ionicons name="close" size={22} color={theme.onSurface} />
              </Pressable>
            </View>

            {downloadsLoading ? (
              <View style={styles.dlEmpty}>
                <ActivityIndicator color={theme.brandPrimary} />
                <Text style={styles.dlEmptyTxt}>{t.pdf.checkingLibrary}</Text>
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: "68%" }}
                contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.sm }}
                showsVerticalScrollIndicator={false}
              >
                {downloadItems.length === 0 && (
                  <View style={styles.dlEmpty}>
                    <Ionicons name="cloud-offline-outline" size={26} color={theme.onSurfaceMuted} />
                    <Text style={styles.dlEmptyTxt}>
                      {t.pdf.noPdfsYet}{"\n"}{t.pdf.noPdfsHint}
                    </Text>
                  </View>
                )}

                {downloadItems.some((i) => i.cached) && (
                  <Text style={styles.dlSection}>{t.pdf.onDevice}</Text>
                )}
                {downloadItems
                  .filter((i) => i.cached)
                  .map((item) => (
                    <View key={item.pdf_url} style={styles.dlRow}>
                      <Pressable
                        style={styles.dlRowMain}
                        onPress={() => openDownloaded(item)}
                        testID={`open-dl-${item.paper_id ?? "local"}`}
                      >
                        <View style={styles.dlIcon}>
                          <Ionicons name="document-text" size={18} color={theme.brand} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.dlTitle} numberOfLines={2}>{item.title}</Text>
                          <Text style={styles.dlMeta}>
                            {formatBytes(item.bytes)} · {t.pdf.savedOn} {formatDate(item.cachedAt)}
                          </Text>
                        </View>
                      </Pressable>
                      <Pressable
                        onPress={() => removeDownload(item)}
                        style={styles.dlAction}
                        hitSlop={8}
                        testID={`remove-dl-${item.paper_id ?? "local"}`}
                      >
                        <Ionicons name="trash-outline" size={17} color={theme.error} />
                      </Pressable>
                    </View>
                  ))}

                {downloadItems.some((i) => !i.cached) && (
                  <Text style={styles.dlSection}>{t.pdf.availableToDownload}</Text>
                )}
                {downloadItems
                  .filter((i) => !i.cached)
                  .map((item) => (
                    <View key={item.pdf_url} style={styles.dlRow}>
                      <View style={styles.dlRowMain}>
                        <View style={[styles.dlIcon, { backgroundColor: theme.surfaceTertiary }]}>
                          <Ionicons name="document-text-outline" size={18} color={theme.onSurfaceMuted} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.dlTitle} numberOfLines={2}>{item.title}</Text>
                          <Text style={styles.dlMeta}>{t.pdf.notDownloaded}</Text>
                        </View>
                      </View>
                      <Pressable
                        onPress={() => downloadPdf(item)}
                        disabled={downloadingUrls.includes(item.pdf_url)}
                        style={styles.dlGetBtn}
                        testID={`download-dl-${item.paper_id ?? item.pdf_url}`}
                      >
                        {downloadingUrls.includes(item.pdf_url) ? (
                          <ActivityIndicator size="small" color={theme.onBrandPrimary} />
                        ) : (
                          <>
                            <Ionicons name="download-outline" size={13} color={theme.onBrandPrimary} />
                            <Text style={styles.dlGetTxt}>{t.pdf.get}</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (t: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing.sm,
    gap: 4,
    backgroundColor: t.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: t.divider,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  // Paper title always gets its own full-width row(s) — 2 lines max —
  // so timer / streak badges can never squeeze or hide it.
  title: { fontSize: 16, fontWeight: "800", color: t.brand, lineHeight: 21 },
  subtitle: { fontSize: 12, fontWeight: "600", color: t.onSurfaceMuted },
  headerMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  saveButton: { padding: 4 },
  timer: { flexDirection: "row", alignItems: "center", gap: 4 },
  timerText: { fontSize: 13, fontWeight: "500", color: t.onSurface },
  loader: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: t.surface, gap: 8 },
  loadTxt: { color: t.onSurfaceMuted },
  hint: {
    position: "absolute", left: 12, right: 12, bottom: 12, flexDirection: "row",
    alignItems: "center", gap: 6, alignSelf: "center", backgroundColor: "rgba(10,25,47,0.85)",
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill,
  },
  hintTxt: { color: t.onBrandPrimary, fontSize: 12, fontWeight: "600" },
  aiActionContainer: {
    position: 'absolute',
    bottom: 70,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  aiActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: t.brandPrimary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    ...shadow1,
  },
  aiActionText: { color: t.onBrandPrimary, fontWeight: '700', fontSize: 14 },
  privacyOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  toast: {
    position: "absolute", left: 16, right: 16, backgroundColor: t.surfaceSecondary,
    padding: 12, borderRadius: radii.md, flexDirection: "row", alignItems: "center", gap: 8, ...shadow1,
  },
  toastTxt: { color: t.onSurface, flex: 1 },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: t.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.lg, gap: spacing.md,
  },
  sheetLg: {
    backgroundColor: t.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.lg, gap: spacing.md, maxHeight: "88%",
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: t.borderStrong, opacity: 0.4 },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: t.onSurface },
  sheetSel: { color: t.onSurfaceMuted, backgroundColor: t.surface, padding: spacing.md, borderRadius: radii.md, fontStyle: "italic" },
  primaryBtn: {
    backgroundColor: t.brandPrimary, paddingVertical: 14, borderRadius: radii.md,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
  },
  primaryBtnTxt: { color: t.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  ghostBtn: { paddingVertical: 12, alignItems: "center" },
  ghostBtnTxt: { color: t.onSurfaceMuted, fontWeight: "600" },
  playerCard: { backgroundColor: t.brand, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.md },
  playerScreen: {
    height: 120, backgroundColor: "#0F172A", borderRadius: radii.sm,
    alignItems: "center", justifyContent: "center", gap: 6,
  },
  playerTitle: { color: t.onBrandPrimary, fontWeight: "700", textAlign: "center", paddingHorizontal: 12 },
  playBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: t.brandPrimary, paddingVertical: 12, borderRadius: radii.md,
  },
  playBtnTxt: { color: t.onBrandPrimary, fontWeight: "700" },
  stepCard: { flexDirection: "row", gap: 12, backgroundColor: t.surface, padding: spacing.md, borderRadius: radii.md, marginBottom: spacing.sm },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: t.success, alignItems: "center", justifyContent: "center" },
  stepNumTxt: { color: t.onBrandPrimary, fontWeight: "800", fontSize: 13 },
  stepHead: { fontWeight: "800", color: t.onSurface, marginBottom: 3 },
  stepBody: { color: t.onSurface, lineHeight: 20, fontSize: 13 },
  qaModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: t.border,
  },
  qaModalTitle: { fontSize: 18, fontWeight: '700', color: t.onSurface },
  qaItem: { marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: t.divider },
  qaQuestion: { fontWeight: '600', fontSize: 14, marginBottom: 4 },
  qaStep: { fontSize: 13, color: t.onSurface, marginLeft: 8, marginBottom: 2 },
  qaAnswer: { fontWeight: '600', fontSize: 14, marginTop: 4, color: t.success },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  offlinePillWrap: {
    position: "absolute",
    bottom: 56,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "92%",
  },
  offlinePill: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: t.brandPrimary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    ...shadow1,
  },
  offlinePillDone: { backgroundColor: t.successBg },
  offlinePillTxt: { color: t.onBrandPrimary, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  offlinePillClose: {
    width: 26,
    height: 26,
    marginLeft: 6,
    borderRadius: 13,
    backgroundColor: t.surfaceSecondary,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: "center",
    justifyContent: "center",
    ...shadow1,
  },
  dlSection: {
    fontSize: 11,
    fontWeight: "800",
    color: t.onSurfaceMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: spacing.xs,
  },
  dlRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.surface,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: t.border,
  },
  dlRowMain: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  dlIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: t.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  dlTitle: { fontSize: 13, fontWeight: "700", color: t.onSurface, lineHeight: 17 },
  dlMeta: { fontSize: 11, color: t.onSurfaceMuted, marginTop: 2 },
  dlAction: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  dlGetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: t.brandPrimary,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 10,
  },
  dlGetTxt: { color: t.onBrandPrimary, fontWeight: "800", fontSize: 12 },
  dlEmpty: { alignItems: "center", gap: 8, paddingVertical: spacing.xl },
  dlEmptyTxt: { color: t.onSurfaceMuted, textAlign: "center", fontSize: 13, lineHeight: 18 },
});

// Rebuild the module styles whenever the active palette changes so
// every consumer (including helper components outside the screen
// function) picks up light/dark without prop drilling.
let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});