// import { useEffect, useState, useCallback } from "react";
// import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { Image } from "expo-image";
// import { Ionicons } from "@expo/vector-icons";
// import { useRouter } from "expo-router";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
// import { api } from "@/src/api";
// import { useAuth } from "@/src/auth";

// type Lesson = {
//   lesson_id: string; title: string; description: string;
//   subject_name: string; exam_level: string;
//   teacher_name: string; teacher_avatar?: string;
//   thumbnail: string; duration: string; views: number; rating: number;
// };

// const LEVELS = ["All", "GCE O", "GCE A", "HND", "Concours"];

// export default function Lessons() {
//   const { user } = useAuth();
//   const router = useRouter();
//   const [items, setItems] = useState<Lesson[] | null>(null);
//   const [level, setLevel] = useState("All");
//   const [refreshing, setRefreshing] = useState(false);

//   const load = useCallback(async () => {
//     try {
//       const url = level === "All" ? "/lessons" : `/lessons?exam_level=${encodeURIComponent(level)}`;
//       const r = await api<{ items: Lesson[] }>(url, { auth: false });
//       setItems(r.items);
//     } catch { setItems([]); }
//   }, [level]);

//   useEffect(() => { load(); }, [load]);
//   const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

//   return (
//     <SafeAreaView edges={["top"]} style={styles.root} testID="lessons-screen">
//       <View style={styles.header}>
//         <View>
//           <Text style={styles.title}>Lesson Videos</Text>
//           <Text style={styles.sub}>Fresh uploads from Cameroon&apos;s best teachers</Text>
//         </View>
//         {user?.role === "teacher" && (
//           <Pressable style={styles.upBtn} onPress={() => router.push("/teacher-upload")} testID="teacher-upload-btn">
//             <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
//             <Text style={styles.upTxt}>Upload</Text>
//           </Pressable>
//         )}
//       </View>

//       <View style={styles.chipRow}>
//         <FlatList
//           horizontal
//           data={LEVELS}
//           keyExtractor={(x) => x}
//           showsHorizontalScrollIndicator={false}
//           contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 8 }}
//           renderItem={({ item: l }) => {
//             const active = level === l;
//             return (
//               <Pressable
//                 testID={`level-${l}`}
//                 onPress={() => setLevel(l)}
//                 style={[styles.chip, active && styles.chipActive]}
//               >
//                 <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{l}</Text>
//               </Pressable>
//             );
//           }}
//         />
//       </View>

//       {items === null ? (
//         <ActivityIndicator style={{ marginTop: 40 }} color={theme.brandPrimary} />
//       ) : items.length === 0 ? (
//         <View style={styles.empty}>
//           <Ionicons name="videocam-outline" size={40} color={theme.onSurfaceMuted} />
//           <Text style={styles.emptyTxt}>No lessons yet for {level}</Text>
//         </View>
//       ) : (
//         <FlatList
//           data={items}
//           keyExtractor={(x) => x.lesson_id}
//           refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brandPrimary} />}
//           contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 32 }}
//           renderItem={({ item: c }) => (
//             <Pressable
//               testID={`lesson-${c.lesson_id}`}
//               style={styles.card}
//               onPress={() => router.push(`/lesson/${c.lesson_id}`)}
//             >
//               <View style={styles.thumbWrap}>
//                 <Image source={{ uri: c.thumbnail }} style={styles.thumb} contentFit="cover" />
//                 <View style={styles.playIcon}><Ionicons name="play" size={22} color="#fff" /></View>
//                 <View style={styles.durTag}><Text style={styles.durTxt}>{c.duration}</Text></View>
//               </View>
//               <View style={{ padding: spacing.md, gap: 4 }}>
//                 <View style={{ flexDirection: "row", gap: 6 }}>
//                   <View style={styles.pill}><Text style={styles.pillTxt}>{c.exam_level}</Text></View>
//                   <View style={styles.pill}><Text style={styles.pillTxt}>{c.subject_name}</Text></View>
//                 </View>
//                 <Text style={styles.cardTitle} numberOfLines={2}>{c.title}</Text>
//                 <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
//                   <View style={styles.row}><Ionicons name="person-outline" size={13} color={theme.onSurfaceMuted} /><Text style={styles.meta}>{c.teacher_name}</Text></View>
//                   <View style={styles.row}><Ionicons name="eye-outline" size={13} color={theme.onSurfaceMuted} /><Text style={styles.meta}>{c.views}</Text></View>
//                   <View style={styles.row}><Ionicons name="star" size={13} color={theme.warning} /><Text style={styles.meta}>{c.rating}</Text></View>
//                 </View>
//               </View>
//             </Pressable>
//           )}
//         />
//       )}
//     </SafeAreaView>
//   );
// }

// const styles = StyleSheet.create({
//   root: { flex: 1, backgroundColor: theme.surface },
//   header: {
//     flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
//     paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm,
//   },
//   title: { fontSize: 24, fontWeight: "800", color: theme.onSurface },
//   sub: { color: theme.onSurfaceMuted, marginTop: 2 },
//   upBtn: {
//     flexDirection: "row", gap: 6, alignItems: "center",
//     backgroundColor: theme.brand, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill,
//   },
//   upTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
//   chipRow: { height: 56, alignItems: "center" },
//   chip: {
//     flexShrink: 0, height: 36, paddingHorizontal: 16, borderRadius: radii.pill,
//     backgroundColor: "#fff", borderWidth: 1, borderColor: theme.border,
//     alignItems: "center", justifyContent: "center",
//   },
//   chipActive: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
//   chipTxt: { color: theme.onSurface, fontWeight: "600", fontSize: 13 },
//   chipTxtActive: { color: theme.brand },
//   card: { backgroundColor: "#fff", borderRadius: radii.md, overflow: "hidden", ...shadow1 },
//   thumbWrap: { position: "relative" },
//   thumb: { width: "100%", height: 180, backgroundColor: theme.surfaceTertiary },
//   playIcon: {
//     position: "absolute", top: "50%", left: "50%", marginLeft: -22, marginTop: -22,
//     width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(37,99,235,0.9)",
//     alignItems: "center", justifyContent: "center",
//   },
//   durTag: {
//     position: "absolute", right: 8, bottom: 8, backgroundColor: "rgba(0,0,0,0.7)",
//     paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
//   },
//   durTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
//   cardTitle: { fontSize: 16, fontWeight: "700", color: theme.onSurface },
//   pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: theme.brandTertiary },
//   pillTxt: { color: theme.onBrandTertiary, fontSize: 11, fontWeight: "700" },
//   row: { flexDirection: "row", alignItems: "center", gap: 4 },
//   meta: { color: theme.onSurfaceMuted, fontSize: 12 },
//   empty: { alignItems: "center", padding: spacing.xl, gap: 8 },
//   emptyTxt: { color: theme.onSurfaceMuted },
// });
























import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, TextInput, Animated, Easing } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

type Course = {
  course_id: string;
  title: string;
  description: string;
  subject_name: string;
  exam_level: string;
  teacher_name: string;
  teacher_avatar?: string;
  thumbnail: string;
  duration: string;
  views: number;
  rating: number;
  video_url?: string;
};

const LEVELS = ["All", "GCE O", "GCE A", "HND", "Concours"];
const SEARCH_DEBOUNCE_MS = 250;
const DEFAULT_THUMBNAIL =
  "https://images.unsplash.com/photo-1708011271954-c0d2b3155ded?crop=entropy&cs=srgb&fm=jpg&q=85&w=800";

// Extracted + memoized so scrolling or unrelated parent state changes
// (search text, refreshing flag) don't force every visible card to
// re-render — only cards whose own props actually changed re-render.
const CourseCard = memo(function CourseCard({
  course,
  onPress,
}: {
  course: Course;
  onPress: (course: Course) => void;
}) {
  return (
    <Pressable testID={`course-${course.course_id}`} style={styles.card} onPress={() => onPress(course)}>
      <View style={styles.thumbWrap}>
        <Image
          source={{ uri: course.thumbnail || DEFAULT_THUMBNAIL }}
          style={styles.thumb}
          contentFit="cover"
          // Recycled thumbnails between fast filter changes benefit from
          // a stable cache key tied to the actual URL.
          cachePolicy="memory-disk"
        />
        <View style={styles.playIcon}>
          <Ionicons name="play" size={22} color="#fff" />
        </View>
        <View style={styles.durTag}>
          <Text style={styles.durTxt}>{course.duration || "45:00"}</Text>
        </View>
      </View>
      <View style={{ padding: spacing.md, gap: 4 }}>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          <View style={styles.pill}>
            <Text style={styles.pillTxt}>{course.exam_level || "GCE A"}</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillTxt}>{course.subject_name || "Mathematics"}</Text>
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{course.title}</Text>
        <Text style={styles.cardDesc} numberOfLines={2}>{course.description}</Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
          <View style={styles.row}>
            <Ionicons name="person-outline" size={13} color={theme.onSurfaceMuted} />
            <Text style={styles.meta}>{course.teacher_name || "GC Teacher"}</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="eye-outline" size={13} color={theme.onSurfaceMuted} />
            <Text style={styles.meta}>{course.views || 0}</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="star" size={13} color={theme.warning} />
            <Text style={styles.meta}>{course.rating || 5.0}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
});

// Shared shimmer animation — one Animated.Value driving every skeleton
// card at once so they pulse in sync, rather than each card running its
// own independent (and more expensive) animation loop.
function useShimmer() {
  const anim = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.35, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return anim;
}

const SkeletonCard = memo(function SkeletonCard({ opacity }: { opacity: Animated.Value }) {
  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={[styles.thumb, styles.skeletonBlock]} />
      <View style={{ padding: spacing.md, gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <View style={[styles.skeletonBlock, styles.skeletonPill]} />
          <View style={[styles.skeletonBlock, styles.skeletonPill]} />
        </View>
        <View style={[styles.skeletonBlock, { width: "70%", height: 16, borderRadius: 4, marginTop: 6 }]} />
        <View style={[styles.skeletonBlock, { width: "95%", height: 12, borderRadius: 4, marginTop: 4 }]} />
        <View style={[styles.skeletonBlock, { width: "55%", height: 12, borderRadius: 4 }]} />
      </View>
    </Animated.View>
  );
});

// Fills the content area only (header/search/chips stay mounted above
// this) while a level switch or the initial load is in flight, so
// switching level tabs no longer flashes the whole screen back to a
// bare spinner.
function LoadingSkeletonList() {
  const opacity = useShimmer();
  return (
    <View style={{ padding: spacing.lg, gap: spacing.md }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} opacity={opacity} />
      ))}
    </View>
  );
}

export default function Library() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Course[]>([]);
  const [level, setLevel] = useState("All");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Raw text updates on every keystroke (so the input feels instant);
  // `query` is the debounced value actually used for filtering, so a
  // long list isn't re-filtered on every single keypress.
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText]);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    try {
      if (!opts.silent) setLoading(true);
      let url = "/library/courses";
      if (level !== "All") {
        url = `/library/courses?exam_level=${encodeURIComponent(level)}`;
      }

      console.log(`[Lessons] Fetching: ${url}`);

      try {
        const r = await api<{ items: Course[] }>(url);
        setItems(r.items || []);
        console.log(`[Lessons] Found ${r.items?.length || 0} courses with auth`);
        return;
      } catch (authError) {
        console.log("[Lessons] Auth failed, trying without auth");
        const r = await api<{ items: Course[] }>(url, { auth: false });
        setItems(r.items || []);
        console.log(`[Lessons] Found ${r.items?.length || 0} courses without auth`);
      }
    } catch (error) {
      console.error("[Lessons] Failed to load courses:", error);
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [level]);

  useEffect(() => {
    load();
  }, [load]);

  // Pull-to-refresh already shows the native RefreshControl spinner, so
  // this intentionally skips the `loading` skeleton state — otherwise
  // you'd see both the pull spinner AND the content area flash to
  // skeletons at once, which looks like a glitch rather than a refresh.
  const onRefresh = async () => {
    setRefreshing(true);
    await load({ silent: true });
  };

  // Client-side filter over whatever the current level tab already
  // fetched — matches title, description, teacher, and subject so a
  // search for a teacher's name or topic works, not just exact titles.
  const filteredItems = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter((c) =>
      [c.title, c.description, c.teacher_name, c.subject_name]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    );
  }, [items, query]);

  const openCourse = useCallback(
    (c: Course) => router.push(`/library/${c.course_id}`),
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: Course }) => <CourseCard course={item} onPress={openCourse} />,
    [openCourse]
  );

  const clearSearch = () => {
    setSearchText("");
    setQuery("");
  };

  const isSearching = query.length > 0;
  const emptyTitle = isSearching
    ? `No results for "${query}"`
    : `No courses available for ${level}`;
  const emptySub = isSearching
    ? "Try a different title, teacher, or subject."
    : "Check back later for new courses from teachers";

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="library-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Lessons</Text>
          <Text style={styles.sub}>Video lessons and study materials</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={theme.onSurfaceMuted} />
        <TextInput
          testID="library-search-input"
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search lessons, teachers, subjects…"
          placeholderTextColor={theme.onSurfaceMuted}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
        />
        {searchText.length > 0 && (
          <Pressable testID="library-search-clear" onPress={clearSearch} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.onSurfaceMuted} />
          </Pressable>
        )}
      </View>

      <View style={styles.chipRow}>
        <FlatList
          horizontal
          data={LEVELS}
          keyExtractor={(x) => x}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 8 }}
          renderItem={({ item: l }) => {
            const active = level === l;
            return (
              <Pressable
                testID={`level-${l}`}
                onPress={() => setLevel(l)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{l}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* Only this content area swaps between skeleton / empty / list —
          header, search bar, and level chips stay mounted throughout, so
          switching levels or the initial load no longer flashes the
          entire screen back to a bare loading state. */}
      {loading ? (
        <LoadingSkeletonList />
      ) : filteredItems.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons
            name={isSearching ? "search-outline" : "library-outline"}
            size={40}
            color={theme.onSurfaceMuted}
          />
          <Text style={styles.emptyTxt}>{emptyTitle}</Text>
          <Text style={styles.emptySub}>{emptySub}</Text>
          {isSearching ? (
            <Pressable style={styles.refreshBtn} onPress={clearSearch}>
              <Ionicons name="close-outline" size={20} color={theme.brandPrimary} />
              <Text style={styles.refreshTxt}>Clear search</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.refreshBtn} onPress={onRefresh}>
              <Ionicons name="refresh-outline" size={20} color={theme.brandPrimary} />
              <Text style={styles.refreshTxt}>Refresh</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(x) => x.course_id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brandPrimary} />}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 32 }}
          renderItem={renderItem}
          // Cards render at a fixed height (thumb 180 + content block), so
          // FlatList can skip measuring and jump straight to any offset —
          // faster initial render and smoother scroll-to on longer lists.
          getItemLayout={(_, index) => ({
            length: CARD_HEIGHT,
            offset: (CARD_HEIGHT + spacing.md) * index,
            index,
          })}
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
        />
      )}
    </SafeAreaView>
  );
}

// Approximate fixed card height: thumb (180) + content padding/text block.
// Used only for getItemLayout's scroll-position math; if the design
// changes card content significantly, update this alongside the styles.
const CARD_HEIGHT = 180 + 112;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  title: { fontSize: 24, fontWeight: "800", color: theme.onSurface },
  sub: { color: theme.onSurfaceMuted, marginTop: 2, fontSize: 13 },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    height: 40, paddingHorizontal: 12, borderRadius: radii.pill,
    backgroundColor: "#fff", borderWidth: 1, borderColor: theme.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.onSurface, padding: 0 },
  chipRow: { height: 56, alignItems: "center" },
  chip: {
    flexShrink: 0, height: 36, paddingHorizontal: 16, borderRadius: radii.pill,
    backgroundColor: "#fff", borderWidth: 1, borderColor: theme.border,
    alignItems: "center", justifyContent: "center",
  },
  chipActive: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
  chipTxt: { color: theme.onSurface, fontWeight: "600", fontSize: 13 },
  chipTxtActive: { color: theme.brand },
  card: { backgroundColor: "#fff", borderRadius: radii.md, overflow: "hidden", ...shadow1 },
  skeletonBlock: { backgroundColor: theme.surfaceTertiary },
  skeletonPill: { width: 60, height: 20, borderRadius: radii.pill },
  thumbWrap: { position: "relative" },
  thumb: { width: "100%", height: 180, backgroundColor: theme.surfaceTertiary },
  playIcon: {
    position: "absolute", top: "50%", left: "50%", marginLeft: -22, marginTop: -22,
    width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(37,99,235,0.9)",
    alignItems: "center", justifyContent: "center",
  },
  durTag: {
    position: "absolute", right: 8, bottom: 8, backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  durTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
  cardTitle: { fontSize: 16, fontWeight: "700", color: theme.onSurface, marginTop: 4 },
  cardDesc: { fontSize: 13, color: theme.onSurfaceMuted, marginTop: 2 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: theme.brandTertiary },
  pillTxt: { color: theme.onBrandTertiary, fontSize: 11, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { color: theme.onSurfaceMuted, fontSize: 12 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: 8 },
  emptyTxt: { color: theme.onSurface, fontSize: 16, fontWeight: "600" },
  emptySub: { color: theme.onSurfaceMuted, fontSize: 14, textAlign: "center" },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.brandTertiary,
    borderRadius: radii.pill,
  },
  refreshTxt: {
    color: theme.brandPrimary,
    fontWeight: "600",
    fontSize: 14,
  },
});