

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









































import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  RefreshControl,
  LayoutAnimation,
  Platform,
  UIManager,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api } from "@/src/api";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

const SORT_OPTIONS = [
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "Popular", value: "popular" },
  { label: "Alphabetical", value: "title" },
  { label: "Best match", value: "relevance" },
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
      <Text style={[style, highlightStyle]}>{text.slice(idx, idx + q.length)}</Text>
      {text.slice(idx + q.length)}
    </Text>
  );
}

// ---------- Component ----------
export default function PastQuestions() {
  const router = useRouter();

  // ---------- State ----------
  const [structure, setStructure] = useState<ExamStructure | null>(null);
  const [selectedDisplayLevel, setSelectedDisplayLevel] = useState<string>(DISPLAY_LEVELS[0].label);
  const [selectedBackendLevel, setSelectedBackendLevel] = useState<string>(DISPLAY_LEVELS[0].backend);
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

  // Filters
  const [fLevel, setFLevel] = useState<string>("all");
  const [fSubject, setFSubject] = useState<string>("all");
  const [fYear, setFYear] = useState<string>("all");
  const [fPaper, setFPaper] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    levels: [],
    subjects: [],
    years: [],
    papers: [1, 2, 3],
  });

  // UI
  const [filterSheetVisible, setFilterSheetVisible] = useState<boolean>(false);

  // Drafts
  const [drafts, setDrafts] = useState<Paper[]>([]);
  const [togglingDraft, setTogglingDraft] = useState<string | null>(null);

  // ---------- Load exam structure ----------
  useEffect(() => {
    const fetchStructure = async () => {
      try {
        const data = await api<ExamStructure>("/exam/structure", { auth: false });
        setStructure(data);
        const firstBackendLevel = DISPLAY_LEVELS[0].backend;
        if (data.levels[firstBackendLevel]) {
          setSubjects(data.levels[firstBackendLevel]);
        }
      } catch (err) {
        console.error("Failed to load exam structure:", err);
        Alert.alert("Error", "Could not load subjects. Please try again.");
      } finally {
        setLoadingStructure(false);
      }
    };
    fetchStructure();
  }, []);

  // ---------- Load filter options ----------
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const data = await api<FilterOptions>("/papers/filters", { auth: false });
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
        // Non-critical — fail silently, recent searches are a nice-to-have
      }
    };
    loadRecent();
  }, []);

  const persistRecentSearch = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())].slice(
        0,
        MAX_RECENT_SEARCHES
      );
      api(`/user/preferences`, {
        method: "POST",
        body: { key: RECENT_SEARCHES_KEY, value: next },
      }).catch(() => { });
      return next;
    });
  }, []);

  const removeRecentSearch = useCallback((query: string) => {
    setRecentSearches((prev) => {
      const next = prev.filter((s) => s !== query);
      api(`/user/preferences`, {
        method: "POST",
        body: { key: RECENT_SEARCHES_KEY, value: next },
      }).catch(() => { });
      return next;
    });
  }, []);

  // ---------- Update subjects when level changes ----------
  useEffect(() => {
    if (!structure) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const levelSubjects = structure.levels[selectedBackendLevel] || [];
    setSubjects(levelSubjects);
    setSelectedSubject(null);
    setPapers([]);
  }, [selectedBackendLevel, structure]);

  // ---------- Fetch papers ----------
  const loadPapers = useCallback(
    async (opts?: { silent?: boolean }) => {
      const hasQuery = debouncedQuery.trim().length > 0;
      if (!selectedSubject && fSubject === "all" && !hasQuery) {
        setPapers([]);
        setSearchError(null);
        return;
      }

      if (!opts?.silent) setLoading(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams();
        const levelParam = fLevel !== "all" ? fLevel : selectedBackendLevel;
        if (levelParam) params.append("level", levelParam);

        const subjectParam = selectedSubject || (fSubject !== "all" ? fSubject : null);
        if (subjectParam) params.append("subject", subjectParam);

        if (fYear !== "all") params.append("year", fYear);
        if (fPaper !== "all") params.append("paper", fPaper);
        if (debouncedQuery) params.append("q", debouncedQuery.trim());
        if (sortBy) params.append("sort", debouncedQuery.trim() && sortBy === "newest" ? "relevance" : sortBy);

        const url = `/papers?${params.toString()}`;
        const response = await api<{ items: Paper[] } | Paper[]>(url);
        let items: Paper[] = [];
        if (Array.isArray(response)) {
          items = response;
        } else if (response && typeof response === "object" && "items" in response) {
          items = response.items || [];
        }
        setPapers(items);
        if (hasQuery) persistRecentSearch(debouncedQuery);
      } catch (err) {
        console.error("Failed to load papers:", err);
        setSearchError("Could not load papers. Pull down to retry.");
        setPapers([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedSubject, fLevel, fSubject, fYear, fPaper, debouncedQuery, sortBy, selectedBackendLevel, persistRecentSearch]
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
    setPapers((prev) => prev.map((p) => (p.paper_id === paper.paper_id ? { ...p, saved: !wasSaved } : p)));

    try {
      const response = await api<{ saved: boolean }>("/drafts", {
        method: "POST",
        body: { paper_id: paper.paper_id },
      });
      const isSaved = response.saved;
      setPapers((prev) => prev.map((p) => (p.paper_id === paper.paper_id ? { ...p, saved: isSaved } : p)));
      await loadDrafts();
    } catch (err) {
      console.error("Toggle draft error:", err);
      setPapers((prev) => prev.map((p) => (p.paper_id === paper.paper_id ? { ...p, saved: wasSaved } : p)));
      Alert.alert("Error", "Could not update draft status.");
    } finally {
      setTogglingDraft(null);
    }
  };

  // ---------- Clear all filters ----------
  const clearFilters = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFLevel("all");
    setFSubject("all");
    setFYear("all");
    setFPaper("all");
    setSearchQuery("");
    setSortBy("newest");
    setSelectedSubject(null);
  };

  // ---------- Active filters count ----------
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (fLevel !== "all") count++;
    if (fSubject !== "all") count++;
    if (fYear !== "all") count++;
    if (fPaper !== "all") count++;
    if (searchQuery) count++;
    return count;
  }, [fLevel, fSubject, fYear, fPaper, searchQuery]);

  // ---------- Search suggestions (as-you-type, before debounce fires) ----------
  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    const subjectMatches = filterOptions.subjects
      .filter((s) => s.toLowerCase().includes(q))
      .slice(0, 4)
      .map((s) => ({ type: "subject" as const, label: s }));
    return subjectMatches;
  }, [searchQuery, filterOptions.subjects]);

  // ---------- Navigation ----------
  const openPaper = (paper: Paper) => {
    if (paper.pdf_url) {
      router.push({
        pathname: "/pdf",
        params: { url: paper.pdf_url, title: paper.title || `${paper.subject} ${paper.year}`, paper_id: paper.paper_id },
      });
    } else {
      router.push(`/past-questions/${paper.paper_id}`);
    }
  };

  // ---------- Handle level change ----------
  const handleLevelChange = (displayLabel: string) => {
    setSelectedDisplayLevel(displayLabel);
    const backendLevel = DISPLAY_LEVELS.find((dl) => dl.label === displayLabel)?.backend || "";
    setSelectedBackendLevel(backendLevel);
  };

  // ---------- Active filter chips ----------
  const renderActiveFilters = () => {
    const filters = [];
    if (fLevel !== "all") filters.push({ label: fLevel, onRemove: () => setFLevel("all") });
    if (fSubject !== "all") filters.push({ label: fSubject, onRemove: () => setFSubject("all") });
    if (fYear !== "all") filters.push({ label: fYear, onRemove: () => setFYear("all") });
    if (fPaper !== "all") filters.push({ label: `Paper ${fPaper}`, onRemove: () => setFPaper("all") });
    if (searchQuery) filters.push({ label: `"${searchQuery}"`, onRemove: () => setSearchQuery("") });
    return filters;
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
        <View style={[styles.skeletonBar, { width: `${60 - index * 5}%` }]} />
        <View style={[styles.skeletonBar, { width: "40%", height: 10 }]} />
      </View>
      <View style={[styles.skeletonBar, { width: 60, height: 28, borderRadius: radii.pill }]} />
    </View>
  );

  // ---------- Search dropdown (recents + suggestions) ----------
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
              <Pressable key={s} style={styles.searchDropdownRow} onPress={() => submitSearch(s)}>
                <Ionicons name="time-outline" size={16} color={theme.onSurfaceMuted} />
                <Text style={styles.searchDropdownRowText}>{s}</Text>
                <Pressable hitSlop={8} onPress={() => removeRecentSearch(s)}>
                  <Ionicons name="close" size={16} color={theme.onSurfaceMuted} />
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
              <Pressable key={s.label} style={styles.searchDropdownRow} onPress={() => submitSearch(s.label)}>
                <Ionicons name="book-outline" size={16} color={theme.onSurfaceMuted} />
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

  // ---------- Filter Sheet ----------
  const FilterSheet = () => (
    <Modal
      visible={filterSheetVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setFilterSheetVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filter Papers</Text>
            <Pressable onPress={() => setFilterSheetVisible(false)}>
              <Ionicons name="close" size={24} color={theme.onSurface} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBody}>
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Level</Text>
              <View style={styles.filterChips}>
                {filterOptions.levels.map((l) => (
                  <Pressable
                    key={l}
                    style={[styles.filterChip, fLevel === l && styles.filterChipActive]}
                    onPress={() => setFLevel(fLevel === l ? "all" : l)}
                  >
                    <Text style={[styles.filterChipText, fLevel === l && styles.filterChipTextActive]}>{l}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Subject</Text>
              <View style={styles.filterChips}>
                {filterOptions.subjects.slice(0, 8).map((s) => (
                  <Pressable
                    key={s}
                    style={[styles.filterChip, fSubject === s && styles.filterChipActive]}
                    onPress={() => setFSubject(fSubject === s ? "all" : s)}
                  >
                    <Text style={[styles.filterChipText, fSubject === s && styles.filterChipTextActive]}>{s}</Text>
                  </Pressable>
                ))}
                {filterOptions.subjects.length > 8 && <Text style={styles.moreText}>+ more</Text>}
              </View>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Year</Text>
              <View style={styles.filterChips}>
                {filterOptions.years.slice(0, 10).map((y) => (
                  <Pressable
                    key={y}
                    style={[styles.filterChip, fYear === String(y) && styles.filterChipActive]}
                    onPress={() => setFYear(fYear === String(y) ? "all" : String(y))}
                  >
                    <Text style={[styles.filterChipText, fYear === String(y) && styles.filterChipTextActive]}>{y}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Paper</Text>
              <View style={styles.filterChips}>
                {filterOptions.papers.map((p) => (
                  <Pressable
                    key={p}
                    style={[styles.filterChip, fPaper === String(p) && styles.filterChipActive]}
                    onPress={() => setFPaper(fPaper === String(p) ? "all" : String(p))}
                  >
                    <Text style={[styles.filterChipText, fPaper === String(p) && styles.filterChipTextActive]}>
                      Paper {p}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Sort By</Text>
              <View style={styles.filterChips}>
                {SORT_OPTIONS.map((s) => (
                  <Pressable
                    key={s.value}
                    style={[styles.filterChip, sortBy === s.value && styles.filterChipActive]}
                    onPress={() => setSortBy(s.value)}
                  >
                    <Text style={[styles.filterChipText, sortBy === s.value && styles.filterChipTextActive]}>
                      {s.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable style={[styles.modalButton, styles.clearButton]} onPress={clearFilters}>
                <Text style={styles.clearButtonText}>Clear All</Text>
              </Pressable>
              <Pressable style={[styles.modalButton, styles.applyButton]} onPress={() => setFilterSheetVisible(false)}>
                <Text style={styles.applyButtonText}>Apply Filters</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const showEmptySubjectPrompt = !selectedSubject && fSubject === "all" && !searchQuery.trim();

  // ---------- Render ----------
  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="past-questions-screen">
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-btn">
          <Ionicons name="arrow-back" size={22} color={theme.brand} />
        </Pressable>
        <Text style={styles.headerT}>Past Questions</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Search & Filter Bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <View style={[styles.searchInputContainer, searchFocused && styles.searchInputContainerFocused]}>
            <Ionicons name="search-outline" size={20} color={theme.onSurfaceMuted} />
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
              <ActivityIndicator size="small" color={theme.onSurfaceMuted} />
            )}
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={theme.onSurfaceMuted} />
              </Pressable>
            )}
          </View>
          <Pressable style={styles.filterButton} onPress={() => setFilterSheetVisible(true)} testID="filter-btn">
            <Ionicons name="filter" size={20} color={theme.brand} />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
        <SearchDropdown />
      </View>

      {/* Level chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {DISPLAY_LEVELS.map((dl) => (
          <Pressable
            key={dl.label}
            testID={`level-${dl.label}`}
            onPress={() => handleLevelChange(dl.label)}
            style={[styles.chip, selectedDisplayLevel === dl.label && styles.chipActive]}
          >
            <Text style={[styles.chipTxt, selectedDisplayLevel === dl.label && styles.chipTxtActive]}>
              {dl.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Active filter badges */}
      {renderActiveFilters().length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBadgesContainer}>
          {renderActiveFilters().map((f, i) => (
            <View key={i} style={styles.filterBadgeItem}>
              <Text style={styles.filterBadgeLabel}>{f.label}</Text>
              <Pressable onPress={f.onRemove} hitSlop={6}>
                <Ionicons name="close" size={14} color={theme.onSurfaceMuted} />
              </Pressable>
            </View>
          ))}
          <Pressable onPress={clearFilters} style={styles.clearAllBadge}>
            <Text style={styles.clearAllBadgeText}>Clear all</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* Main content */}
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brandPrimary} />}
        keyboardShouldPersistTaps="handled"
      >
        {!searchQuery.trim() && (
          <>
            <Text style={styles.sec}>Subject</Text>
            {loadingStructure ? (
              <ActivityIndicator color={theme.brandPrimary} />
            ) : subjects.length === 0 ? (
              <Text style={styles.emptyText}>No subjects available for this level</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectRow}>
                {filterOptions.subjects.map((subj) => (
                  <Pressable
                    key={subj}
                    testID={`subject-${subj}`}
                    onPress={() => setSelectedSubject(subj)}
                    style={[styles.subjectChip, selectedSubject === subj && styles.subjectChipActive]}
                  >
                    <Text style={[styles.subjectChipText, selectedSubject === subj && styles.subjectChipTextActive]}>
                      {subj}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </>
        )}

        {(selectedSubject || searchQuery.trim()) && (
          <>
            <View style={styles.resultsHeader}>
              <Text style={styles.sec}>{searchQuery.trim() ? "Results" : "Papers"}</Text>
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
                <Ionicons name="cloud-offline-outline" size={28} color={theme.onSurfaceMuted} />
                <Text style={styles.emptyText}>{searchError}</Text>
                <Pressable style={styles.retryBtn} onPress={() => loadPapers()}>
                  <Text style={styles.retryBtnText}>Retry</Text>
                </Pressable>
              </View>
            ) : papers.length === 0 ? (
              <View style={styles.errorState}>
                <Ionicons name="search-outline" size={28} color={theme.onSurfaceMuted} />
                <Text style={styles.emptyText}>
                  {searchQuery.trim() ? `No results for "${searchQuery.trim()}"` : "No papers found"}
                </Text>
                {activeFilterCount > 0 && (
                  <Pressable style={styles.retryBtn} onPress={clearFilters}>
                    <Text style={styles.retryBtnText}>Clear filters</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              papers.map((p) => (
                <Pressable key={p.paper_id} testID={`paper-${p.paper_id}`} style={styles.paper} onPress={() => openPaper(p)}>
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
                      {typeof p.views === "number" ? ` · ${p.views.toLocaleString()} views` : ""}
                    </Text>
                  </View>
                  <View style={styles.actionRow}>
                    <Pressable onPress={() => toggleDraft(p)} style={styles.saveBtn} hitSlop={8}>
                      <Ionicons
                        name={p.saved ? "bookmark" : "bookmark-outline"}
                        size={22}
                        color={p.saved ? theme.brandPrimary : theme.onSurfaceMuted}
                      />
                    </Pressable>
                    <View style={styles.startBtn}>
                      <Text style={styles.startTxt}>{p.pdf_url ? "PDF" : "Open"}</Text>
                      <Ionicons name={p.pdf_url ? "document-text" : "arrow-forward"} size={14} color="#fff" />
                    </View>
                  </View>
                </Pressable>
              ))
            )}
          </>
        )}
      </ScrollView>

      <FilterSheet />
    </SafeAreaView>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerT: { fontSize: 18, fontWeight: "800", color: theme.brand },

  // Search
  searchWrap: { position: "relative", zIndex: 20 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    gap: 8,
    marginBottom: 8,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: radii.md,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.border,
    height: 40,
    gap: 8,
  },
  searchInputContainerFocused: {
    borderColor: theme.brandPrimary,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.onSurface,
    padding: 0,
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  filterBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: theme.brand,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  // Search dropdown
  searchDropdown: {
    position: "absolute",
    top: 48,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: "#fff",
    borderRadius: radii.md,
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
  searchDropdownTitle: { fontSize: 11, fontWeight: "700", color: theme.onSurfaceMuted, textTransform: "uppercase" },
  searchDropdownClear: { fontSize: 12, color: theme.brandPrimary, fontWeight: "600" },
  searchDropdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchDropdownRowText: { flex: 1, fontSize: 14, color: theme.onSurface },
  searchHighlight: { fontWeight: "800", color: theme.brand },

  // Chips
  chipRow: { paddingHorizontal: spacing.lg, gap: 8, height: 56, alignItems: "center" },
  chip: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
  chipTxt: { color: theme.onSurface, fontWeight: "600", fontSize: 13 },
  chipTxtActive: { color: theme.brand },

  // Filter badges
  filterBadgesContainer: { paddingHorizontal: spacing.lg, paddingBottom: 8, gap: 8 },
  filterBadgeItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.brandTertiary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    gap: 6,
  },
  filterBadgeLabel: { fontSize: 12, color: theme.brand, fontWeight: "600" },
  clearAllBadge: { paddingHorizontal: 10, paddingVertical: 4 },
  clearAllBadgeText: { fontSize: 12, color: theme.onSurfaceMuted, fontWeight: "500" },

  // Sections
  sec: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.onSurfaceMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  resultsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultsCount: { fontSize: 12, color: theme.onSurfaceMuted, fontWeight: "600" },

  // Subject chips
  subjectRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  subjectChip: {
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
  },
  subjectChipActive: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
  subjectChipText: { fontSize: 14, fontWeight: "600", color: theme.onSurface },
  subjectChipTextActive: { color: theme.brand },

  // Paper
  paper: {
    backgroundColor: "#fff",
    borderRadius: radii.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...shadow1,
  },
  paperT: { fontWeight: "700", color: theme.onSurface },
  paperS: { color: theme.onSurfaceMuted, fontSize: 12, marginTop: 2 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  saveBtn: { padding: 4 },
  startBtn: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    backgroundColor: theme.brand,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  startTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },

  // Skeletons
  skeletonPaper: { opacity: 0.7 },
  skeletonBar: { height: 14, borderRadius: 6, backgroundColor: theme.surfaceTertiary },

  // Empty / error states
  errorState: { alignItems: "center", gap: 10, paddingVertical: spacing.lg },
  emptyText: { color: theme.onSurfaceMuted, textAlign: "center", padding: spacing.sm, fontSize: 14 },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: theme.brandTertiary,
  },
  retryBtnText: { color: theme.brand, fontWeight: "700", fontSize: 13 },

  // Modal (Filter Sheet)
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    maxHeight: "90%",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontWeight: "700", color: theme.onSurface },
  modalBody: { paddingBottom: 40 },
  filterSection: { marginBottom: spacing.md },
  filterLabel: { fontSize: 14, fontWeight: "600", color: theme.onSurface, marginBottom: 8 },
  filterChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "#fff",
  },
  filterChipActive: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
  filterChipText: { fontSize: 13, color: theme.onSurface, fontWeight: "500" },
  filterChipTextActive: { color: theme.brand },
  moreText: { fontSize: 13, color: theme.onSurfaceMuted, alignSelf: "center" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: spacing.md },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: radii.md, alignItems: "center" },
  clearButton: { backgroundColor: theme.surfaceTertiary },
  clearButtonText: { color: theme.onSurfaceMuted, fontWeight: "600" },
  applyButton: { backgroundColor: theme.brand },
  applyButtonText: { color: "#fff", fontWeight: "600" },
});