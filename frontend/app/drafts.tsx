import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api } from "@/src/api";
import { storage } from "@/src/utils/storage/index";
// ---------- Helpers ----------
const timeAgo = (dateStr?: string) => {
  if (!dateStr) return "recently";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

type Draft = {
  paper_id: string;
  title?: string;
  pdf_url?: string;
  subject?: string;
  level?: string;
  year?: number;
  paper_number?: number;
  saved_at?: string;
};

export default function DraftsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const [highlights, setHighlights] = useState<LocalHighlight[]>([]);

  const [levelFilter, setLevelFilter] = useState("All");
  const [subjectFilter, setSubjectFilter] = useState("All");
  const [yearFilter, setYearFilter] = useState("All");
  const [paperFilter, setPaperFilter] = useState("All");

  // ---------- Load drafts with progress ----------
  const load = useCallback(async (showLoading = true) => {
    if (showLoading) {
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
      setLoading(true);
      setProgress(0);
      // Start progress animation (simulate loading up to 90%)
      if (progressInterval.current) clearInterval(progressInterval.current);
      progressInterval.current = setInterval(() => {
        setProgress((p) => {
          if (p >= 90) {
            clearInterval(progressInterval.current!);
            return 90;
          }
          // Increment by random 1-6% each tick
          return Math.min(p + Math.random() * 5 + 1, 90);
        });
      }, 120);
    } else {
      setRefreshing(true);
    }

    try {
      const savedHighlights = await storage.getItem<LocalHighlight[]>(HIGHLIGHTS_KEY, []);
      setHighlights(savedHighlights || []);
      const drafts = await api<Draft[]>("/drafts");
      setItems(drafts || []);
    } catch (error) {
      console.error("Failed to load drafts:", error);
      const savedHighlights = await storage.getItem<LocalHighlight[]>(HIGHLIGHTS_KEY, []);
      setHighlights(savedHighlights || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
      setProgress(100); // complete
      // Reset progress after a short delay (so user sees 100%)
      setTimeout(() => {
        setProgress(0);
      }, 600);
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [load]);

  // ----- Filters -----
  const levels = useMemo(() => ["All", ...Array.from(new Set(items.map((item) => item.level).filter(Boolean) as string[]))], [items]);
  const subjects = useMemo(() => ["All", ...Array.from(new Set(items.map((item) => item.subject).filter(Boolean) as string[]))], [items]);
  const years = useMemo(() => ["All", ...Array.from(new Set(items.map((item) => item.year).filter(Boolean))).sort((a, b) => Number(b) - Number(a)).map(String)], [items]);
  const papers = ["All", "1", "2", "3"];

  const filteredItems = useMemo(() => items.filter((item) => (
    (levelFilter === "All" || item.level === levelFilter) &&
    (subjectFilter === "All" || item.subject === subjectFilter) &&
    (yearFilter === "All" || String(item.year) === yearFilter) &&
    (paperFilter === "All" || String(item.paper_number) === paperFilter)
  )), [items, levelFilter, subjectFilter, yearFilter, paperFilter]);

  const hasFilters = [levelFilter, subjectFilter, yearFilter, paperFilter].some((v) => v !== "All");

  const clearFilters = () => {
    setLevelFilter("All");
    setSubjectFilter("All");
    setYearFilter("All");
    setPaperFilter("All");
  };

  const deleteDraft = async (paperId: string) => {
    try {
      await api(`/drafts/${paperId}`, { method: "DELETE" });
      setItems((prev) => prev.filter((x) => x.paper_id !== paperId));
    } catch (error) {
      console.error("Failed to delete draft:", error);
    }
  };

  const deleteHighlight = async (highlightId: string) => {
    const next = highlights.filter((item) => item.id !== highlightId);
    setHighlights(next);
    await storage.setItem(HIGHLIGHTS_KEY, next);
  };

  const askAboutHighlight = (highlight: LocalHighlight) => {
    router.push({ pathname: "/(tabs)/ai", params: { seed: highlight.text } });
  };

  const openPaper = (d: Draft) => {
    if (d.pdf_url) {
      router.push({
        pathname: "/pdf",
        params: {
          url: d.pdf_url,
          title: d.title || "Saved paper",
          paper_id: d.paper_id,
        },
      });
    }
  };

  // ----- Render: Loading with progress -----
  if (loading) {
    const percent = Math.min(Math.round(progress), 100);
    return (
      <SafeAreaView edges={["top"]} style={[styles.root, styles.loadingContainer]}>
        <View style={styles.loaderBox}>
          <Text style={styles.loaderTitle}>Loading drafts</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${percent}%` }]} />
          </View>
          <Text style={styles.progressText}>{percent}%</Text>
          <Text style={styles.loaderSub}>Please wait…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.brand} />
        </Pressable>
        <Text style={styles.headerTitle}>My Drafts</Text>
        <View style={{ width: 32 }} />
      </View>

      {items.length === 0 && highlights.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={48} color={theme.onSurfaceMuted} />
          <Text style={styles.emptyTitle}>No drafts yet</Text>
          <Text style={styles.emptyDesc}>
            Open a PDF paper, highlight a question, and tap “Draft”.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.paper_id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(false)} colors={[theme.brandPrimary]} />
          }
          ListHeaderComponent={
            <View>
              {highlights.length > 0 && (
                <View style={styles.highlightSection}>
                  <View style={styles.filterHeader}>
                    <Text style={styles.filterLabel}>Saved text</Text>
                    <Text style={styles.resultCount}>{highlights.length}</Text>
                  </View>
                  {highlights.map((highlight) => (
                    <View key={highlight.id} style={styles.highlightCard}>
                      <Pressable style={styles.highlightTextWrap} onPress={() => askAboutHighlight(highlight)}>
                        <Text style={styles.highlightText} numberOfLines={4}>{highlight.text}</Text>
                        <Text style={styles.highlightMeta}>{highlight.title} · Page {highlight.page}</Text>
                      </Pressable>
                      <View style={styles.highlightActions}>
                        <Pressable onPress={() => askAboutHighlight(highlight)} style={styles.askButton}>
                          <Ionicons name="sparkles-outline" size={17} color="#fff" />
                        </Pressable>
                        <Pressable onPress={() => deleteHighlight(highlight.id)} style={styles.deleteHighlightButton}>
                          <Ionicons name="trash-outline" size={17} color={theme.error} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.filterSection}>
                <View style={styles.filterHeader}>
                  <Text style={styles.filterLabel}>Filters</Text>
                  <Pressable onPress={clearFilters} disabled={!hasFilters}>
                    <Text style={[styles.clearText, !hasFilters && styles.disabledText]}>Clear all</Text>
                  </Pressable>
                </View>
                <View style={styles.filterRow}>
                  <FilterChip label="Level" values={levels} selected={levelFilter} onSelect={setLevelFilter} />
                  <FilterChip label="Subject" values={subjects} selected={subjectFilter} onSelect={setSubjectFilter} />
                  <FilterChip label="Year" values={years} selected={yearFilter} onSelect={setYearFilter} />
                  <FilterChip label="Paper" values={papers} selected={paperFilter} onSelect={setPaperFilter} />
                </View>
                <Text style={styles.resultCount}>
                  Showing <Text style={{ fontWeight: "700" }}>{filteredItems.length}</Text> of {items.length}
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={items.length > 0 ? (
            <View style={styles.filteredEmpty}>
              <Ionicons name="funnel-outline" size={36} color={theme.onSurfaceMuted} />
              <Text style={styles.emptyTitle}>No matching papers</Text>
              <Pressable onPress={clearFilters}>
                <Text style={styles.clearText}>Clear filters</Text>
              </Pressable>
            </View>
          ) : null}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          renderItem={({ item: d }) => (
            <View style={styles.card}>
              <View style={styles.cardContent}>
                <View style={styles.cardIcon}>
                  <Ionicons name="document-text-outline" size={24} color={theme.brand} />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {d.title || "Untitled Draft"}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {[d.subject, d.level, d.year, d.paper_number ? `Paper ${d.paper_number}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  <Text style={styles.cardTime}>
                    <Ionicons name="time-outline" size={12} color={theme.onSurfaceMuted} />{" "}
                    {timeAgo(d.saved_at)}
                  </Text>
                </View>
              </View>
              <View style={styles.cardActions}>
                <Pressable
                  style={[styles.actionBtn, styles.openBtn, !d.pdf_url && styles.openBtnDisabled]}
                  onPress={() => openPaper(d)}
                  disabled={!d.pdf_url}
                >
                  <Ionicons name="open-outline" size={20} color="#fff" />
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={() => deleteDraft(d.paper_id)}
                >
                  <Ionicons name="trash-outline" size={18} color={theme.error} />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

// ---------- Filter Chip Component ----------
function FilterChip({ label, values, selected, onSelect }: {
  label: string;
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.chipGroup}>
      <Pressable onPress={() => setExpanded(!expanded)} style={styles.chipGroupLabel}>
        <Text style={styles.chipGroupLabelText}>{label}</Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={theme.onSurfaceMuted} />
      </Pressable>
      {expanded && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {values.map((value) => (
            <Pressable
              key={value}
              onPress={() => { onSelect(value); setExpanded(false); }}
              style={[styles.chip, selected === value && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected === value && styles.chipTextSelected]}>{value}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.surface,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderBox: {
    alignItems: 'center',
    gap: 12,
    padding: spacing.xl,
    width: '80%',
    maxWidth: 280,
  },
  loaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.onSurface,
  },
  loaderSub: {
    fontSize: 14,
    color: theme.onSurfaceMuted,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: theme.surfaceTertiary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.brandPrimary,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.brand,
    letterSpacing: 1,
    marginTop: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.brand,
    letterSpacing: -0.5,
  },
  highlightSection: {
    backgroundColor: theme.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  highlightCard: {
    backgroundColor: "#fff",
    borderRadius: radii.sm,
    padding: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  highlightTextWrap: { flex: 1, gap: 4 },
  highlightText: { color: theme.onSurface, fontSize: 13, lineHeight: 19 },
  highlightMeta: { color: theme.onSurfaceMuted, fontSize: 11 },
  highlightActions: { flexDirection: "row", alignItems: "center", gap: 5 },
  askButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteHighlightButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  filterSection: {
    backgroundColor: "#fff",
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    ...shadow1,
  },
  filterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  filterLabel: {
    fontWeight: "600",
    color: theme.onSurface,
    fontSize: 14,
  },
  clearText: {
    color: theme.brandPrimary,
    fontWeight: "600",
    fontSize: 13,
  },
  disabledText: { opacity: 0.4 },
  filterRow: {
    gap: spacing.sm,
  },
  chipGroup: {
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
    paddingBottom: spacing.sm,
  },
  chipGroupLabel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  chipGroupLabelText: {
    fontSize: 13,
    color: theme.onSurfaceMuted,
    fontWeight: "500",
  },
  chipScroll: {
    flexDirection: "row",
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "#fff",
    marginRight: 6,
  },
  chipSelected: {
    backgroundColor: theme.brandPrimary,
    borderColor: theme.brandPrimary,
  },
  chipText: {
    fontSize: 12,
    color: theme.onSurfaceMuted,
  },
  chipTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  resultCount: {
    color: theme.onSurfaceMuted,
    fontSize: 12,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: 8,
  },
  emptyTitle: {
    fontWeight: "700",
    fontSize: 18,
    color: theme.onSurface,
  },
  emptyDesc: {
    color: theme.onSurfaceMuted,
    textAlign: "center",
    fontSize: 14,
  },
  filteredEmpty: {
    alignItems: "center",
    padding: spacing.xl,
    gap: 8,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: radii.md,
    padding: spacing.md,
    ...shadow1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontWeight: "600",
    fontSize: 15,
    color: theme.onSurface,
  },
  cardMeta: {
    fontSize: 12,
    color: theme.onSurfaceMuted,
  },
  cardTime: {
    fontSize: 11,
    color: theme.onSurfaceMuted,
    flexDirection: "row",
    alignItems: "center",
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  openBtn: {
    backgroundColor: theme.brand,
  },
  openBtnDisabled: {
    opacity: 0.4,
  },
  deleteBtn: {
    backgroundColor: "transparent",
  },
});
