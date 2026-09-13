import { useTheme } from "@/src/theme-context";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useLanguage } from "@/src/i18n";

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
  useTheme(); // re-render this screen when light/dark changes
  const router = useRouter();
  const { t } = useLanguage();
  const { user, loading: authLoading } = useAuth();

  const userLevel = useMemo(() => {
    const profileLevel = (user?.exam_level || "").trim().toLowerCase();
    const matchingLevel = DISPLAY_LEVELS.find((level) =>
      profileLevel === level.label.toLowerCase() ||
      profileLevel === level.backend.toLowerCase()
    );
    return matchingLevel || null;
  }, [user?.exam_level]);

  // ---------- State ----------
  const [structure, setStructure] = useState<ExamStructure | null>(null);
  const [selectedDisplayLevel, setSelectedDisplayLevel] = useState<string>(
    ""
  );
  const [selectedBackendLevel, setSelectedBackendLevel] = useState<string>(
    ""
  );

  // `subjects` is the subject list for the CURRENT selected level.
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  // Papers
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingStructure, setLoadingStructure] = useState<boolean>(true);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Year filter
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // Paper filter — null = all papers (Paper 1 / 2 / 3)
  const [selectedPaper, setSelectedPaper] = useState<number | null>(null);

  // View mode — "list" (comfortable rows) or "grid" (compact 2-col cards)
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Database-backed filter metadata.
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

        const profileBackendLevel = userLevel?.backend || "";
        setSubjects(data.levels[profileBackendLevel] || []);
      } catch (err) {
        console.error("Failed to load subjects:", err);
        Alert.alert("Error", "Could not load subjects. Please try again.");
      } finally {
        setLoadingStructure(false);
      }
    };

    fetchStructure();
  }, [userLevel]);

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

  // ---------- Update subjects when level changes ----------
  useEffect(() => {
    if (!structure || !userLevel) return;

    const levelSubjects = structure.levels[userLevel.backend] || [];

    setSubjects(levelSubjects);
    setSelectedSubject(null);
    setSelectedDisplayLevel(userLevel.label);
    setSelectedBackendLevel(userLevel.backend);
  }, [structure, userLevel]);

  // ---------- Fetch papers ----------
  const loadPapers = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setSearchError(null);

      if (authLoading || !userLevel) {
        setPapers([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        const params = new URLSearchParams();

        if (selectedBackendLevel) {
          params.append("level", selectedBackendLevel);
        }

        if (selectedSubject) {
          params.append("subject", selectedSubject);
        }

        if (selectedYear !== null) {
          params.append("year", String(selectedYear));
        }

        if (selectedPaper !== null) {
          params.append("paper_number", String(selectedPaper));
        }

        const url = `/papers?${params.toString()}`;
        const response = await api<{ items: Paper[] } | Paper[]>(url);

        const items = Array.isArray(response)
          ? response
          : response && typeof response === "object" && "items" in response
            ? response.items || []
            : [];

        // Client-side fallback: if the backend ignores `paper_number`,
        // filter locally so the Paper 1/2/3 toggle always works.
        const filtered =
          selectedPaper !== null
            ? items.filter((p) => p.paper_number === selectedPaper)
            : items;

        setPapers(filtered);
      } catch (err) {
        console.error("Failed to load papers:", err);
        setSearchError(t.pastQuestions.loadError);
        setPapers([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      selectedSubject,
      selectedBackendLevel,
      selectedYear,
      selectedPaper,
      authLoading,
      userLevel,
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

      Alert.alert("Error", t.common.error);
    } finally {
      setTogglingDraft(null);
    }
  };

  const availableYears = useMemo(() => {
    const years = filterOptions.years.length > 0 ? filterOptions.years : structure?.years || [];
    return [...new Set(years)].sort((a, b) => b - a);
  }, [filterOptions.years, structure?.years]);

  // Paper 1 / 2 / 3 options — prefer backend metadata, fall back to what
  // the loaded papers actually contain, always defaulting to [1, 2, 3].
  const availablePapers = useMemo(() => {
    const fromFilters = (filterOptions.papers || []).filter(
      (n) => typeof n === "number"
    );
    const base = fromFilters.length > 0 ? fromFilters : [1, 2, 3];
    const fromItems = new Set(papers.map((p) => p.paper_number));
    const merged = new Set([...base, ...fromItems]);
    return [...merged].sort((a, b) => a - b);
  }, [filterOptions.papers, papers]);

  // Active filter count (subject + year + paper) for the results header.
  const activeFilterCount =
    (selectedSubject ? 1 : 0) +
    (selectedYear !== null ? 1 : 0) +
    (selectedPaper !== null ? 1 : 0);

  const clearAllFilters = useCallback(() => {
    setSelectedSubject(null);
    setSelectedYear(null);
    setSelectedPaper(null);
  }, []);

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
    if (!userLevel || displayLabel !== userLevel.label) return;
    setSelectedDisplayLevel(userLevel.label);
    setSelectedBackendLevel(userLevel.backend);
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

        <Text style={styles.headerT}>{t.pastQuestions.title}</Text>

        {/* View toggle: comfortable list vs compact grid */}
        <View style={styles.viewToggle}>
          <Pressable
            testID="view-list"
            accessibilityLabel={t.pastQuestions.listView}
            onPress={() => setViewMode("list")}
            style={[
              styles.viewToggleBtn,
              viewMode === "list" && styles.viewToggleBtnActive,
            ]}
          >
            <Ionicons
              name="list"
              size={17}
              color={
                viewMode === "list" ? theme.brand : theme.onSurfaceMuted
              }
            />
          </Pressable>
          <Pressable
            testID="view-grid"
            accessibilityLabel={t.pastQuestions.gridView}
            onPress={() => setViewMode("grid")}
            style={[
              styles.viewToggleBtn,
              viewMode === "grid" && styles.viewToggleBtnActive,
            ]}
          >
            <Ionicons
              name="grid"
              size={17}
              color={
                viewMode === "grid" ? theme.brand : theme.onSurfaceMuted
              }
            />
          </Pressable>
        </View>
      </View>

      {/* Level selector */}
      <View style={styles.levelSection}>
        <View style={styles.sectionTopLine}>
          <Text style={styles.sectionEyebrow}>{t.pastQuestions.examLevel}</Text>
          <Text style={styles.sectionContext}>{selectedDisplayLevel}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          keyboardShouldPersistTaps="handled"
        >
          {DISPLAY_LEVELS.filter((dl) => dl.label === userLevel?.label).map((dl) => (
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
            <Text style={styles.subjectTitle}>{t.pastQuestions.subjects}</Text>
            <Text style={styles.subjectHint}>
              {t.pastQuestions.subjectsHint}
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
          <Text style={styles.emptyText}>{t.pastQuestions.noPapers}</Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subjectRow}
            keyboardShouldPersistTaps="handled"
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
                {t.pastQuestions.all}
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

      {/* Year filter */}
      {availableYears.length > 0 && (
        <View style={styles.yearSection}>
          <View style={styles.yearHeader}>
            <Text style={styles.subjectTitle}>{t.pastQuestions.years}</Text>
            <Text style={styles.subjectHint}>{t.pastQuestions.years}</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subjectRow}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable
              onPress={() => setSelectedYear(null)}
              style={[
                styles.subjectChip,
                selectedYear === null && styles.subjectChipActive,
              ]}
            >
              <Ionicons
                name="calendar-outline"
                size={15}
                color={
                  selectedYear === null ? theme.brand : theme.onSurfaceMuted
                }
              />

              <Text
                style={[
                  styles.subjectChipText,
                  selectedYear === null && styles.subjectChipTextActive,
                ]}
              >
                {t.pastQuestions.all}
              </Text>
            </Pressable>

            {availableYears.map((year) => (
              <Pressable
                key={year}
                testID={`year-${year}`}
                onPress={() => setSelectedYear(year)}
                style={[
                  styles.subjectChip,
                  selectedYear === year && styles.subjectChipActive,
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={15}
                  color={
                    selectedYear === year ? theme.brand : theme.onSurfaceMuted
                  }
                />

                <Text
                  style={[
                    styles.subjectChipText,
                    selectedYear === year && styles.subjectChipTextActive,
                  ]}
                >
                  {year}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Paper 1 / 2 / 3 selector — comfort segmented control */}
      <View style={styles.paperSection}>
        <View style={styles.subjectHeader}>
          <View>
            <Text style={styles.subjectTitle}>{t.pastQuestions.paperType}</Text>
            <Text style={styles.subjectHint}>
              {t.pastQuestions.paperTypeHint}
            </Text>
          </View>
        </View>

        <View style={styles.paperSegment} testID="paper-segment">
          <Pressable
            testID="paper-filter-all"
            accessibilityLabel={t.pastQuestions.all}
            onPress={() => setSelectedPaper(null)}
            style={[
              styles.paperSegmentBtn,
              selectedPaper === null && styles.paperSegmentBtnActive,
            ]}
          >
            <Ionicons
              name="layers-outline"
              size={15}
              color={
                selectedPaper === null ? theme.brand : theme.onSurfaceMuted
              }
            />
            <Text
              style={[
                styles.paperSegmentTxt,
                selectedPaper === null && styles.paperSegmentTxtActive,
              ]}
            >
              {t.pastQuestions.all}
            </Text>
          </Pressable>

          {availablePapers.map((n) => (
            <Pressable
              key={n}
              testID={`paper-filter-${n}`}
              accessibilityLabel={`${t.pastQuestions.paper} ${n}`}
              onPress={() =>
                setSelectedPaper((prev) => (prev === n ? null : n))
              }
              style={[
                styles.paperSegmentBtn,
                selectedPaper === n && styles.paperSegmentBtnActive,
              ]}
            >
              <View
                style={[
                  styles.paperBadge,
                  selectedPaper === n && styles.paperBadgeActive,
                ]}
              >
                <Text
                  style={[
                    styles.paperBadgeTxt,
                    selectedPaper === n && styles.paperBadgeTxtActive,
                  ]}
                >
                  {n}
                </Text>
              </View>
              <Text
                style={[
                  styles.paperSegmentTxt,
                  selectedPaper === n && styles.paperSegmentTxtActive,
                ]}
              >
                {t.pastQuestions.paper} {n}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Active-filter pill row + clear-all (comfort) */}
      {activeFilterCount > 0 && (
        <View style={styles.activeRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activeRowContent}
            keyboardShouldPersistTaps="handled"
          >
            {selectedSubject && (
              <Pressable
                style={styles.activePill}
                onPress={() => setSelectedSubject(null)}
              >
                <Ionicons name="book-outline" size={13} color={theme.brand} />
                <Text style={styles.activePillTxt} numberOfLines={1}>
                  {selectedSubject}
                </Text>
                <Ionicons name="close" size={13} color={theme.brand} />
              </Pressable>
            )}
            {selectedYear !== null && (
              <Pressable
                style={styles.activePill}
                onPress={() => setSelectedYear(null)}
              >
                <Ionicons name="calendar-outline" size={13} color={theme.brand} />
                <Text style={styles.activePillTxt}>{selectedYear}</Text>
                <Ionicons name="close" size={13} color={theme.brand} />
              </Pressable>
            )}
            {selectedPaper !== null && (
              <Pressable
                style={styles.activePill}
                onPress={() => setSelectedPaper(null)}
              >
                <Ionicons name="document-text-outline" size={13} color={theme.brand} />
                <Text style={styles.activePillTxt}>
                  {t.pastQuestions.paper} {selectedPaper}
                </Text>
                <Ionicons name="close" size={13} color={theme.brand} />
              </Pressable>
            )}
          </ScrollView>
          <Pressable onPress={clearAllFilters} hitSlop={8}>
            <Text style={styles.clearAll}>{t.pastQuestions.clearFilters}</Text>
          </Pressable>
        </View>
      )}

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
          <View style={{ flex: 1 }}>
            <Text style={styles.sec} numberOfLines={1}>
              {selectedSubject || t.pastQuestions.allPapers}
            </Text>
            {(selectedYear !== null || selectedPaper !== null) && (
              <Text style={styles.resultsSub}>
                {[
                  selectedPaper !== null
                    ? `${t.pastQuestions.paper} ${selectedPaper}`
                    : null,
                  selectedYear !== null ? `${selectedYear}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            )}
          </View>

          {!loading && papers.length > 0 && (
            <Text style={styles.resultsCount}>
              {papers.length} {papers.length === 1 ? t.pastQuestions.paper : t.pastQuestions.papers}
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
              <Text style={styles.retryBtnText}>{t.common.retry}</Text>
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
              {t.pastQuestions.noPapers}
            </Text>

            {activeFilterCount > 0 && (
              <Pressable style={styles.retryBtn} onPress={clearAllFilters}>
                <Text style={styles.retryBtnText}>
                  {t.pastQuestions.clearFilters}
                </Text>
              </Pressable>
            )}
          </View>
        ) : viewMode === "grid" ? (
          <View style={styles.gridWrap}>
            {papers.map((p) => (
              <Pressable
                key={p.paper_id}
                testID={`paper-${p.paper_id}`}
                style={styles.gridCard}
                onPress={() => openPaper(p)}
              >
                <View style={styles.gridTop}>
                  <View
                    style={[
                      styles.paperBadge,
                      p.paper_number === selectedPaper && styles.paperBadgeActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.paperBadgeTxt,
                        p.paper_number === selectedPaper &&
                        styles.paperBadgeTxtActive,
                      ]}
                    >
                      P{p.paper_number}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => toggleDraft(p)}
                    style={styles.gridSaveBtn}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={p.saved ? "bookmark" : "bookmark-outline"}
                      size={18}
                      color={
                        p.saved ? theme.brandPrimary : theme.onSurfaceMuted
                      }
                    />
                  </Pressable>
                </View>

                <Text style={styles.gridTitle} numberOfLines={2}>
                  {p.title || `${p.subject} ${p.year}`}
                </Text>
                <Text style={styles.gridMeta}>
                  {p.subject} · {p.year}
                </Text>
                {typeof p.views === "number" && (
                  <View style={styles.gridViews}>
                    <Ionicons
                      name="eye-outline"
                      size={12}
                      color={theme.onSurfaceMuted}
                    />
                    <Text style={styles.gridViewsTxt}>
                      {p.views.toLocaleString()}
                    </Text>
                  </View>
                )}

                <View style={styles.gridCta}>
                  <Text style={styles.gridCtaTxt}>
                    {p.pdf_url ? "PDF" + " " + "paper" + " " + p.paper_number : t.pastQuestions.open}
                  </Text>
                  <Ionicons
                    name={
                      p.pdf_url ? "document-text" : "arrow-forward"
                    }
                    size={13}
                    color="#fff"
                  />
                </View>
              </Pressable>
            ))}
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
                <Text style={styles.paperT}>{p.title || `${p.subject} ${p.year}`}</Text>

                <Text style={styles.paperS}>
                  Paper {p.paper_number} · {p.year}
                  {p.pdf_url ? ` · ${t.pastQuestions.paperAvailable}` : ""}
                  {typeof p.views === "number"
                    ? ` · ${p.views.toLocaleString()} ${t.pastQuestions.views}`
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
                    {p.pdf_url ? "PDF" : t.pastQuestions.open}
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
const createStyles = (t: Palette) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: t.surface,
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
    color: t.brand,
    letterSpacing: -0.3,
  },

  // Comfort: list/grid view toggle in the header
  viewToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.surfaceSecondary,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: radii.pill,
    padding: 3,
    gap: 2,
  },

  viewToggleBtn: {
    width: 32,
    height: 30,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },

  viewToggleBtnActive: {
    backgroundColor: t.brandTertiary,
  },

  // Comfort: Paper 1/2/3 segmented control
  paperSection: {
    marginTop: 5,
    paddingBottom: 4,
  },

  paperSegment: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    backgroundColor: t.surfaceSecondary,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },

  paperSegmentBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 6,
  },

  paperSegmentBtnActive: {
    backgroundColor: t.brandTertiary,
    borderWidth: 1,
    borderColor: t.brandPrimary,
  },

  paperSegmentTxt: {
    fontSize: 12,
    fontWeight: "800",
    color: t.onSurfaceMuted,
  },

  paperSegmentTxtActive: {
    color: t.brand,
  },

  paperBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: t.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },

  paperBadgeActive: {
    backgroundColor: t.brandPrimary,
  },

  paperBadgeTxt: {
    fontSize: 12,
    fontWeight: "800",
    color: t.onSurfaceMuted,
  },

  paperBadgeTxtActive: {
    color: "#fff",
  },

  // Comfort: active-filter pills + clear-all
  activeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: 6,
    gap: 10,
  },

  activeRowContent: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
    flexGrow: 1,
  },

  activePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 170,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: t.brandTertiary,
    borderWidth: 1,
    borderColor: t.brandPrimary,
  },

  activePillTxt: {
    fontSize: 12,
    fontWeight: "800",
    color: t.brand,
    flexShrink: 1,
  },

  clearAll: {
    fontSize: 12,
    fontWeight: "800",
    color: t.brandPrimary,
    textDecorationLine: "underline",
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
    color: t.onSurfaceMuted,
    letterSpacing: 1.1,
  },

  sectionContext: {
    fontSize: 11,
    fontWeight: "700",
    color: t.brand,
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
    backgroundColor: t.surfaceSecondary,
    borderWidth: 1,
    borderColor: t.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  chipActive: {
    borderColor: t.brandPrimary,
    backgroundColor: t.brandTertiary,
  },

  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: t.brandPrimary,
  },

  chipTxt: {
    color: t.onSurface,
    fontWeight: "700",
    fontSize: 13,
  },

  chipTxtActive: {
    color: t.brand,
  },

  // Subject selector stays exactly 5px below the level selector.
  // It displays ONLY subjects belonging to the selected level.
  subjectSection: {
    marginTop: 5,
    paddingBottom: 4,
  },

  yearSection: {
    marginTop: 5,
    paddingBottom: 4,
  },

  yearHeader: {
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
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
    color: t.onSurface,
    letterSpacing: -0.2,
  },

  subjectHint: {
    fontSize: 11,
    color: t.onSurfaceMuted,
    marginTop: 1,
  },

  subjectCount: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 7,
    borderRadius: 14,
    backgroundColor: t.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },

  subjectCountText: {
    color: t.brand,
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
    backgroundColor: t.surfaceSecondary,
    borderWidth: 1,
    borderColor: t.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  subjectChipActive: {
    borderColor: t.brandPrimary,
    backgroundColor: t.brandTertiary,
  },

  subjectChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: t.onSurface,
  },

  subjectChipTextActive: {
    color: t.brand,
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
    color: t.onSurface,
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
    color: t.onSurfaceMuted,
    fontWeight: "700",
  },

  resultsSub: {
    fontSize: 12,
    color: t.brand,
    fontWeight: "700",
    marginTop: 1,
  },

  paper: {
    backgroundColor: t.surfaceSecondary,
    borderRadius: 16,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: t.border,
    minHeight: 82,
    ...shadow1,
  },

  paperT: {
    fontWeight: "800",
    color: t.onSurface,
    fontSize: 14,
    lineHeight: 19,
  },

  paperS: {
    color: t.onSurfaceMuted,
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
    backgroundColor: t.surfaceTertiary,
  },

  startBtn: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    backgroundColor: t.brand,
    paddingHorizontal: 12,
    minHeight: 36,
    borderRadius: 11,
  },

  startTxt: {
    color: t.onBrandPrimary,
    fontWeight: "800",
    fontSize: 11,
  },

  // Comfort: compact 2-column grid cards
  gridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },

  gridCard: {
    width: "47.5%",
    flexGrow: 1,
    backgroundColor: t.surfaceSecondary,
    borderRadius: 16,
    padding: 12,
    gap: 7,
    borderWidth: 1,
    borderColor: t.border,
    minHeight: 178,
    ...shadow1,
  },

  gridTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  gridSaveBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.surfaceTertiary,
  },

  gridTitle: {
    fontWeight: "800",
    color: t.onSurface,
    fontSize: 13,
    lineHeight: 18,
    minHeight: 36,
  },

  gridMeta: {
    color: t.onSurfaceMuted,
    fontSize: 11,
    fontWeight: "600",
  },

  gridViews: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  gridViewsTxt: {
    fontSize: 11,
    color: t.onSurfaceMuted,
    fontWeight: "700",
  },

  gridCta: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.brand,
    minHeight: 34,
    borderRadius: 10,
    marginTop: "auto",
  },

  gridCtaTxt: {
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
    backgroundColor: t.surfaceTertiary,
  },

  errorState: {
    alignItems: "center",
    gap: 10,
    paddingVertical: spacing.lg,
  },

  emptyText: {
    color: t.onSurfaceMuted,
    textAlign: "center",
    padding: spacing.sm,
    fontSize: 14,
  },

  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: t.brandTertiary,
  },

  retryBtnText: {
    color: t.brand,
    fontWeight: "800",
    fontSize: 13,
  },
});

// Rebuild the module styles whenever the active palette changes so
// every consumer (including helper components outside the screen
// function) picks up light/dark without prop drilling.
let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});