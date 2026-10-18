import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { GlobalAppHeader } from "@/src/components/GlobalAppHeader";
import { radii, shadow1, spacing, type Palette } from "@/src/theme";
import { useTheme } from "@/src/theme-context";

type Paper = {
  paper_id: string;
  subject: string;
  level: string;
  title: string;
  year: number;
  paper_number: number;
  pdf_url?: string;
  saved: boolean;
  views?: number;
};

type PaperFilters = {
  levels: string[];
  subjects: string[];
  years: number[];
  papers: number[];
};

type FilterName = "subject" | "session" | "paper";
type FilterOption = string | number;

const DISPLAY_LEVELS = [
  { label: "GCE A-Level", value: "GCE A Level" },
  { label: "GCE O-Level", value: "GCE O Level" },
  { label: "HND", value: "HND" },
  { label: "Concours", value: "Concours" },
  { label: "ATVEE", value: "ATVEE" },
  { label: "ITVEE", value: "ITVEE" },
];

const emptyFilters: PaperFilters = { levels: [], subjects: [], years: [], papers: [1, 2, 3] };

function normalizeLevel(value?: string | null) {
  const normalized = (value || "").trim().toLowerCase();
  return DISPLAY_LEVELS.find((level) =>
    normalized === level.value.toLowerCase() ||
    normalized === level.label.toLowerCase() ||
    normalized === level.label.replace("-Level", "").toLowerCase()
  );
}

export default function PapersScreen() {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const router = useRouter();
  const { user, loading: authLoading, isOnline } = useAuth();
  const searchRef = useRef<TextInput | null>(null);

  const isTeacher = user?.role === "teacher" || user?.role === "admin";
  const userLevel = normalizeLevel(user?.exam_level);
  const activeLevel = isTeacher ? selectedLevel : userLevel?.value || null;
  const [filters, setFilters] = useState<PaperFilters>(emptyFilters);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedPaper, setSelectedPaper] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [savedPapers, setSavedPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePicker, setActivePicker] = useState<FilterName | null>(null);

  const loadFilters = useCallback(async () => {
    try {
      const result = await api<PaperFilters>("/papers/filters", { auth: false });
      setFilters({
        levels: Array.isArray(result.levels) ? result.levels : [],
        subjects: Array.isArray(result.subjects) ? result.subjects : [],
        years: Array.isArray(result.years) ? result.years : [],
        papers: Array.isArray(result.papers) && result.papers.length ? result.papers : [1, 2, 3],
      });
    } catch (cause) {
      console.warn("[papers] could not load filter options:", cause);
    }
  }, []);

  const loadSavedPapers = useCallback(async () => {
    try {
      const result = await api<Paper[]>("/drafts");
      setSavedPapers(Array.isArray(result) ? result : []);
    } catch (cause) {
      console.warn("[papers] could not load saved papers:", cause);
    }
  }, []);

  const loadPapers = useCallback(async (isRefresh = false) => {
    if (authLoading) return;
    if (!isTeacher && !userLevel) {
      setPapers([]);
      setLoading(false);
      setError(null);
      return;
    }

    setError(null);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      if (activeLevel) params.set("level", activeLevel);
      if (selectedSubject) params.set("subject", selectedSubject);
      if (selectedYear !== null) params.set("year", String(selectedYear));
      if (selectedPaper !== null) params.set("paper_number", String(selectedPaper));

      const response = await api<{ items?: Paper[] } | Paper[]>(`/papers?${params.toString()}`);
      const items = Array.isArray(response) ? response : response.items || [];
      setPapers(selectedPaper === null
        ? items
        : items.filter((paper) => paper.paper_number === selectedPaper));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load past papers.");
      setPapers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authLoading, isTeacher, activeLevel, selectedSubject, selectedYear, selectedPaper, userLevel]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadFilters();
      void loadSavedPapers();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadFilters, loadSavedPapers]);

  useEffect(() => {
    const timer = setTimeout(() => void loadPapers(), 0);
    return () => clearTimeout(timer);
  }, [loadPapers]);

  const availableLevels = useMemo(() => {
    const source = filters.levels.length ? filters.levels : DISPLAY_LEVELS.map((level) => level.value);
    const levels = source.map((value) => {
      const display = normalizeLevel(value);
      return display ? { label: display.label, value: display.value } : { label: value, value };
    });
    if (isTeacher) return levels;
    return userLevel ? levels.filter((level) => level.value === userLevel.value) : [];
  }, [filters.levels, isTeacher, userLevel]);

  const visiblePapers = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    if (!query) return papers;
    return papers.filter((paper) =>
      `${paper.title} ${paper.subject} ${paper.level} ${paper.year} Paper ${paper.paper_number}`
        .toLocaleLowerCase()
        .includes(query)
    );
  }, [papers, searchText]);

  const filterOptions: Record<FilterName, FilterOption[]> = {
    subject: filters.subjects,
    session: filters.years.slice().sort((a, b) => b - a),
    paper: filters.papers,
  };

  const filterTitle: Record<FilterName, string> = {
    subject: "Choose a subject",
    session: "Choose a session",
    paper: "Choose a paper",
  };

  const filterValue: Record<FilterName, FilterOption | null> = {
    subject: selectedSubject,
    session: selectedYear,
    paper: selectedPaper,
  };

  const chooseFilter = (option: FilterOption | null) => {
    if (activePicker === "subject") setSelectedSubject(option === null ? null : String(option));
    if (activePicker === "session") setSelectedYear(option === null ? null : Number(option));
    if (activePicker === "paper") setSelectedPaper(option === null ? null : Number(option));
    setActivePicker(null);
  };

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

  const searchLabel = searchText ? "Clear paper search" : "Search papers";

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="papers-screen">
      <GlobalAppHeader
        onSearchPress={() => searchRef.current?.focus()}
        statusLabel={isOnline ? "Live" : "Offline"}
        isLive={isOnline}
      />
      <FlatList
        data={visiblePapers}
        keyExtractor={(paper) => paper.paper_id}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void loadPapers(true)} tintColor={t.brandPrimary} />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={19} color={t.brandPrimary} />
              <TextInput
                ref={searchRef}
                style={styles.searchInput}
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search papers (e.g. Physics P2 2023, Pure Maths)"
                placeholderTextColor={t.onSurfaceMuted}
                returnKeyType="search"
                accessibilityLabel="Search past papers"
              />
              {!!searchText && (
                <Pressable onPress={() => setSearchText("")} accessibilityLabel={searchLabel}>
                  <Ionicons name="close-circle" size={19} color={t.onSurfaceMuted} />
                </Pressable>
              )}
              {!searchText && (
                <Pressable
                  onPress={() => router.push({ pathname: "/feed/compose", params: { paperScan: "true" } })}
                  accessibilityRole="button"
                  accessibilityLabel="Scan a paper"
                >
                  <Ionicons name="scan-outline" size={20} color={t.brandPrimary} />
                </Pressable>
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.levelRow}>
              {isTeacher && (
                <Pressable
                  style={[styles.levelChip, selectedLevel === null && styles.levelChipActive]}
                  onPress={() => setSelectedLevel(null)}
                >
                  <Text style={[styles.levelText, selectedLevel === null && styles.levelTextActive]}>All Exams</Text>
                </Pressable>
              )}
              {availableLevels.map((level) => (
                <Pressable
                  key={level.value}
                  style={[styles.levelChip, activeLevel === level.value && styles.levelChipActive]}
                  onPress={() => setSelectedLevel(level.value)}
                >
                  <Text style={[styles.levelText, activeLevel === level.value && styles.levelTextActive]}>
                    {level.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.filterRow}>
              <FilterButton label="Subject" value={selectedSubject || "All subjects"} onPress={() => setActivePicker("subject")} />
              <FilterButton label="Session" value={selectedYear ? String(selectedYear) : "All years"} onPress={() => setActivePicker("session")} />
              <FilterButton label="Paper" value={selectedPaper ? `Paper ${selectedPaper}` : "All papers"} onPress={() => setActivePicker("paper")} />
            </View>

            <View style={styles.heroCard}>
              <View style={styles.heroTop}>
                <View style={styles.enginePill}>
                  <Ionicons name="sparkles" size={13} color="#DDF5FF" />
                  <Text style={styles.engineText}>GC SHARP ENGINE V4.2</Text>
                </View>
                <Text style={styles.rubricText}>Official Rubric</Text>
              </View>
              <Text style={styles.heroTitle}>Instant AI Exam Solver &amp; Marking Guide</Text>
              <Text style={styles.heroDescription}>
                Upload a past paper and get a step-by-step GCSharp lesson generated by our own AI model.
              </Text>
              <View style={styles.heroActions}>
                <Pressable
                  style={styles.uploadButton}
                  onPress={() => router.push({ pathname: "/ai-video", params: { mode: "pdf" } })}
                  accessibilityRole="button"
                >
                  <Ionicons name="document-attach-outline" size={17} color="#1647A5" />
                  <Text style={styles.uploadButtonText}>Upload PDF</Text>
                </Pressable>
                <Pressable
                  style={styles.scanButton}
                  onPress={() => router.push({ pathname: "/feed/compose", params: { paperScan: "true" } })}
                  accessibilityRole="button"
                >
                  <Ionicons name="camera-outline" size={17} color="#fff" />
                  <Text style={styles.scanButtonText}>Scan Sheet</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.vaultHeader}>
              <View style={styles.vaultTitleWrap}>
                <View style={styles.vaultDot} />
                <Text style={styles.vaultTitle}>Offline Revision Vault</Text>
              </View>
              <Pressable onPress={() => router.push("/drafts")} style={styles.manageButton}>
                <Text style={styles.manageText}>Manage ({savedPapers.length})</Text>
                <Ionicons name="chevron-forward" size={15} color={t.brandPrimary} />
              </Pressable>
            </View>

            {savedPapers.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vaultRow}>
                {savedPapers.slice(0, 8).map((paper) => (
                  <Pressable key={paper.paper_id} style={styles.vaultCard} onPress={() => openPaper(paper)}>
                    <View style={styles.vaultPills}>
                      <Text style={styles.vaultPill}>{paper.level || user?.exam_level || "GCE A-Level"}</Text>
                      <View style={styles.downloadPill}>
                        <Ionicons name="checkmark-circle-outline" size={11} color="#18865A" />
                        <Text style={styles.downloadText}>Saved</Text>
                      </View>
                    </View>
                    <Text style={styles.vaultCardTitle} numberOfLines={2}>
                      {paper.title || `${paper.year} ${paper.subject} Paper ${paper.paper_number}`}
                    </Text>
                    <Text style={styles.vaultCardMeta} numberOfLines={1}>
                      {paper.subject} · {paper.year} · Paper {paper.paper_number}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Pressable style={styles.emptyVault} onPress={() => router.push("/drafts")}>
                <Ionicons name="cloud-download-outline" size={18} color={t.brandPrimary} />
                <Text style={styles.emptyVaultText}>Save a paper to keep it in your offline revision vault.</Text>
              </Pressable>
            )}

            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>Browse past papers</Text>
              <Pressable onPress={() => router.push("/past-questions")}>
                <Text style={styles.browseAll}>Full library</Text>
              </Pressable>
            </View>
            {loading && <ActivityIndicator color={t.brandPrimary} style={styles.loading} />}
            {!!error && (
              <Pressable style={styles.errorBanner} onPress={() => void loadPapers()}>
                <Text style={styles.errorText}>{error} Tap to retry.</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item: paper }) => (
          <Pressable style={styles.paperCard} onPress={() => openPaper(paper)}>
            <View style={styles.paperIcon}>
              <Ionicons name="document-text-outline" size={20} color={t.brandPrimary} />
            </View>
            <View style={styles.paperDetails}>
              <Text style={styles.paperTitle} numberOfLines={2}>
                {paper.title || `${paper.subject} ${paper.year}`}
              </Text>
              <Text style={styles.paperMeta} numberOfLines={1}>
                {paper.level} · {paper.year} · Paper {paper.paper_number}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.onSurfaceMuted} />
          </Pressable>
        )}
        ListEmptyComponent={
          !loading && !error ? (
            <View style={styles.emptyResults}>
              <Ionicons name="search-outline" size={25} color={t.onSurfaceMuted} />
              <Text style={styles.emptyResultsText}>
                {searchText ? "No papers match your search." : "No papers found for these filters."}
              </Text>
              <Pressable onPress={() => router.push("/past-questions")}>
                <Text style={styles.browseAll}>Browse the full paper library</Text>
              </Pressable>
            </View>
          ) : null
        }
      />

      <Modal visible={activePicker !== null} transparent animationType="fade" onRequestClose={() => setActivePicker(null)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setActivePicker(null)}>
          <Pressable style={styles.pickerCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.pickerTitle}>{activePicker ? filterTitle[activePicker] : ""}</Text>
            <ScrollView style={styles.pickerOptions}>
              <Pressable style={styles.pickerOption} onPress={() => chooseFilter(null)}>
                <Text style={styles.pickerOptionText}>All {activePicker === "session" ? "years" : `${activePicker}s`}</Text>
                {activePicker && filterValue[activePicker] === null && (
                  <Ionicons name="checkmark" size={18} color={t.brandPrimary} />
                )}
              </Pressable>
              {activePicker && filterOptions[activePicker].map((option) => (
                <Pressable key={String(option)} style={styles.pickerOption} onPress={() => chooseFilter(option)}>
                  <Text style={styles.pickerOptionText}>
                    {activePicker === "paper" ? `Paper ${option}` : String(option)}
                  </Text>
                  {filterValue[activePicker] === option && (
                    <Ionicons name="checkmark" size={18} color={t.brandPrimary} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function FilterButton({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <Pressable style={styles.filterButton} onPress={onPress} accessibilityRole="button">
      <View style={styles.filterButtonCopy}>
        <Text style={styles.filterLabel}>{label}</Text>
        <Text style={styles.filterValue} numberOfLines={1}>{value}</Text>
      </View>
      <Ionicons name="chevron-down" size={16} color={t.onSurfaceMuted} />
    </Pressable>
  );
}

const createStyles = (t: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.surface },
  listContent: { paddingBottom: 22 },
  searchBar: {
    minHeight: 48,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    backgroundColor: t.surfaceSecondary,
    borderWidth: 1,
    borderColor: t.border,
  },
  searchInput: { flex: 1, minHeight: 46, color: t.onSurface, fontSize: 14 },
  levelRow: { flexDirection: "row", gap: 7, paddingHorizontal: spacing.md, paddingVertical: 12 },
  levelChip: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 13,
    borderRadius: radii.pill,
    backgroundColor: t.surfaceSecondary,
  },
  levelChipActive: { backgroundColor: t.brandPrimary },
  levelText: { color: t.onSurface, fontSize: 12, fontWeight: "600" },
  levelTextActive: { color: "#fff", fontWeight: "700" },
  filterRow: { flexDirection: "row", gap: 7, paddingHorizontal: spacing.md, paddingBottom: 12 },
  filterButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 3,
    paddingHorizontal: 9,
    borderRadius: radii.md,
    backgroundColor: t.surfaceSecondary,
  },
  filterButtonCopy: { flex: 1, minWidth: 0 },
  filterLabel: { color: t.onSurfaceMuted, fontSize: 10, fontWeight: "600" },
  filterValue: { color: t.onSurface, fontSize: 11, fontWeight: "700", marginTop: 2 },
  heroCard: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: "#1763D8",
    overflow: "hidden",
    ...shadow1,
  },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5 },
  enginePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  engineText: { color: "#E5F2FF", fontSize: 9, fontWeight: "800" },
  rubricText: { color: "#E5F2FF", fontSize: 10, fontWeight: "700" },
  heroTitle: { color: "#fff", fontSize: 18, lineHeight: 23, fontWeight: "800", marginTop: 10 },
  heroDescription: { color: "#E5F2FF", fontSize: 12, lineHeight: 17, marginTop: 4 },
  heroActions: { flexDirection: "row", gap: 7, marginTop: 10 },
  uploadButton: {
    flex: 1,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radii.sm,
    backgroundColor: "#fff",
  },
  uploadButtonText: { color: "#1647A5", fontSize: 12, fontWeight: "800" },
  scanButton: {
    flex: 1,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radii.sm,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  scanButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  vaultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    marginTop: 17,
    marginBottom: 10,
  },
  vaultTitleWrap: { flexDirection: "row", alignItems: "center", gap: 7 },
  vaultDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#18B987" },
  vaultTitle: { color: t.onSurface, fontSize: 15, fontWeight: "800" },
  manageButton: { flexDirection: "row", alignItems: "center", gap: 1 },
  manageText: { color: t.brandPrimary, fontSize: 11, fontWeight: "700" },
  vaultRow: { gap: 9, paddingHorizontal: spacing.md },
  vaultCard: {
    width: 212,
    minHeight: 112,
    justifyContent: "space-between",
    padding: 11,
    borderRadius: radii.md,
    backgroundColor: t.surfaceSecondary,
  },
  vaultPills: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 5 },
  vaultPill: {
    maxWidth: 128,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: t.brandTertiary,
    color: t.onBrandTertiary,
    fontSize: 9,
    fontWeight: "700",
  },
  downloadPill: { flexDirection: "row", alignItems: "center", gap: 3 },
  downloadText: { color: "#18865A", fontSize: 9, fontWeight: "700" },
  vaultCardTitle: { color: t.onSurface, fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 9 },
  vaultCardMeta: { color: t.onSurfaceMuted, fontSize: 10, marginTop: 5 },
  emptyVault: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: spacing.md,
    paddingHorizontal: 11,
    borderRadius: radii.md,
    backgroundColor: t.surfaceSecondary,
  },
  emptyVaultText: { flex: 1, color: t.onSurfaceMuted, fontSize: 11, lineHeight: 16 },
  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    marginTop: 18,
    marginBottom: 8,
  },
  resultsTitle: { color: t.onSurface, fontSize: 15, fontWeight: "800" },
  browseAll: { color: t.brandPrimary, fontSize: 12, fontWeight: "700" },
  paperCard: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    marginHorizontal: spacing.md,
    marginBottom: 8,
    borderRadius: radii.md,
    backgroundColor: t.surfaceSecondary,
  },
  paperIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.brandTertiary,
  },
  paperDetails: { flex: 1 },
  paperTitle: { color: t.onSurface, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  paperMeta: { color: t.onSurfaceMuted, fontSize: 10, marginTop: 4 },
  loading: { paddingVertical: 14 },
  errorBanner: {
    marginHorizontal: spacing.md,
    marginVertical: 8,
    padding: 10,
    borderRadius: radii.sm,
    backgroundColor: t.surfaceSecondary,
  },
  errorText: { color: t.error, fontSize: 12 },
  emptyResults: { alignItems: "center", gap: 8, padding: spacing.xl },
  emptyResultsText: { color: t.onSurfaceMuted, fontSize: 12, textAlign: "center" },
  pickerBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(15,23,42,0.35)",
  },
  pickerCard: { maxHeight: "70%", padding: spacing.md, borderRadius: radii.md, backgroundColor: t.surfaceSecondary },
  pickerTitle: { color: t.onSurface, fontSize: 16, fontWeight: "800", paddingBottom: spacing.sm },
  pickerOptions: { flexGrow: 0 },
  pickerOption: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: t.divider,
  },
  pickerOptionText: { color: t.onSurface, fontSize: 13 },
});
