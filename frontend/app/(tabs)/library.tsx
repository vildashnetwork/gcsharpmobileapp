// import { useEffect, useState } from "react";
// import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { Image } from "expo-image";
// import { useRouter } from "expo-router";
// import { Ionicons } from "@expo/vector-icons";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
// import { api } from "@/src/api";

// type Course = {
//   course_id: string;
//   title: string;
//   subject_name: string;
//   exam_level: string;
//   teacher_name: string;
//   teacher_avatar: string;
//   thumbnail: string;
//   duration: string;
//   views: number;
//   rating: number;
// };

// export default function Library() {
//   const [items, setItems] = useState<Course[] | null>(null);
//   const router = useRouter();

//   useEffect(() => {
//     (async () => {
//       try {
//         const r = await api<{ items: Course[] }>("/library/courses", { auth: false });
//         setItems(r.items);
//       } catch { setItems([]); }
//     })();
//   }, []);

//   return (
//     <SafeAreaView edges={["top"]} style={styles.root} testID="library-screen">
//       <View style={styles.header}>
//         <Text style={styles.title}>Library</Text>
//         <Text style={styles.sub}>Video lessons and study materials</Text>
//       </View>
//       {items === null ? (
//         <ActivityIndicator style={{ marginTop: 40 }} color={theme.brandPrimary} />
//       ) : (
//         <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 32 }}>
//           {items.map((c) => (
//             <Pressable
//               key={c.course_id}
//               testID={`course-${c.course_id}`}
//               style={styles.card}
//               onPress={() => router.push(`/library/${c.course_id}`)}
//             >
//               <Image source={{ uri: c.thumbnail }} style={styles.thumb} contentFit="cover" />
//               <View style={{ padding: spacing.md, gap: 6 }}>
//                 <View style={{ flexDirection: "row", gap: 6 }}>
//                   <Chip label={c.exam_level} />
//                   <Chip label={c.subject_name} />
//                 </View>
//                 <Text style={styles.cardTitle} numberOfLines={2}>{c.title}</Text>
//                 <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
//                   <View style={styles.row}><Ionicons name="person-outline" size={14} color={theme.onSurfaceMuted} /><Text style={styles.meta}>{c.teacher_name}</Text></View>
//                   <View style={styles.row}><Ionicons name="time-outline" size={14} color={theme.onSurfaceMuted} /><Text style={styles.meta}>{c.duration}</Text></View>
//                   <View style={styles.row}><Ionicons name="star" size={14} color={theme.warning} /><Text style={styles.meta}>{c.rating}</Text></View>
//                 </View>
//               </View>
//             </Pressable>
//           ))}
//         </ScrollView>
//       )}
//     </SafeAreaView>
//   );
// }

// function Chip({ label }: { label: string }) {
//   return (
//     <View style={styles.chip}><Text style={styles.chipTxt}>{label}</Text></View>
//   );
// }

// const styles = StyleSheet.create({
//   root: { flex: 1, backgroundColor: theme.surface },
//   header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
//   title: { fontSize: 24, fontWeight: "800", color: theme.onSurface },
//   sub: { color: theme.onSurfaceMuted, marginTop: 2 },
//   card: { backgroundColor: "#fff", borderRadius: radii.md, overflow: "hidden", ...shadow1 },
//   thumb: { width: "100%", height: 160, backgroundColor: theme.surfaceTertiary },
//   cardTitle: { fontSize: 16, fontWeight: "700", color: theme.onSurface },
//   row: { flexDirection: "row", alignItems: "center", gap: 4 },
//   meta: { color: theme.onSurfaceMuted, fontSize: 12 },
//   chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: theme.brandTertiary },
//   chipTxt: { color: theme.onBrandTertiary, fontSize: 11, fontWeight: "700" },
// });




























import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
import { api } from "@/src/api";

type SavedVideo = {
  course_id: string;
  title: string;
  subject_name?: string;
  subject?: string;
  exam_level?: string;
  level?: string;
  teacher_name?: string;
  teacher_avatar?: string;
  thumbnail?: string;
  duration?: string;
  views?: number;
  rating?: number;
  saved?: boolean;
  saved_at?: string;
};

export default function SavedVideosScreen() {
  useTheme(); // re-render this screen when light/dark changes
  const [items, setItems] = useState<SavedVideo[] | null>(null);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const r = await api<SavedVideo[]>("/videos/saved", { auth: true });
        setItems(r ?? []);
      } catch (e) {
        console.log("Failed to load saved videos:", e);
        setItems([]);
      }
    })();
  }, []);

  const filteredItems = useMemo(() => {
    if (!items) return [];

    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((c) => {
      const haystack = [
        c.title,
        c.subject_name,
        c.subject,
        c.exam_level,
        c.level,
        c.teacher_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [items, query]);

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="saved-videos-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Saved Videos</Text>
        <Text style={styles.sub}>Only your saved lessons</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={theme.onSurfaceMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search saved videos"
          placeholderTextColor={theme.onSurfaceMuted}
          style={styles.searchInput}
          testID="saved-videos-search"
        />
      </View>

      {items === null ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.brandPrimary} />
      ) : filteredItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="bookmark-outline" size={36} color={theme.onSurfaceMuted} />
          <Text style={styles.emptyTitle}>
            {query.trim() ? "No matching saved videos" : "No saved videos yet"}
          </Text>
          <Text style={styles.emptySub}>
            {query.trim()
              ? "Try another title, subject, or teacher name."
              : "Videos you save will appear here."}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            gap: spacing.md,
            paddingBottom: 32,
          }}
        >
          {filteredItems.map((c) => (
            <Pressable
              key={c.course_id}
              testID={`saved-video-${c.course_id}`}
              style={styles.card}
              onPress={() => router.push(`/library/${c.course_id}`)}
            >
              <Image
                source={{ uri: c.thumbnail || "[via.placeholder.com](https://via.placeholder.com/600x300?text=Video)" }}
                style={styles.thumb}
                contentFit="cover"
              />

              <View style={styles.cardBody}>
                <View style={styles.chipsRow}>
                  {!!(c.exam_level || c.level) && <Chip label={c.exam_level || c.level || ""} />}
                  {!!(c.subject_name || c.subject) && (
                    <Chip label={c.subject_name || c.subject || ""} />
                  )}
                </View>

                <Text style={styles.cardTitle} numberOfLines={2}>
                  {c.title}
                </Text>

                <View style={styles.metaRow}>
                  {!!c.teacher_name && (
                    <View style={styles.row}>
                      <Ionicons name="person-outline" size={14} color={theme.onSurfaceMuted} />
                      <Text style={styles.meta}>{c.teacher_name}</Text>
                    </View>
                  )}

                  {!!c.duration && (
                    <View style={styles.row}>
                      <Ionicons name="time-outline" size={14} color={theme.onSurfaceMuted} />
                      <Text style={styles.meta}>{c.duration}</Text>
                    </View>
                  )}

                  {typeof c.rating === "number" && (
                    <View style={styles.row}>
                      <Ionicons name="star" size={14} color={theme.warning} />
                      <Text style={styles.meta}>{c.rating}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipTxt}>{label}</Text>
    </View>
  );
}

const createStyles = (t: Palette) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: t.surface,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: t.onSurface,
  },
  sub: {
    color: t.onSurfaceMuted,
    marginTop: 2,
  },
  searchWrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: t.surfaceSecondary,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...shadow1,
  },
  searchInput: {
    flex: 1,
    color: t.onSurface,
    fontSize: 14,
  },
  card: {
    backgroundColor: t.surfaceSecondary,
    borderRadius: radii.md,
    overflow: "hidden",
    ...shadow1,
  },
  thumb: {
    width: "100%",
    height: 160,
    backgroundColor: t.surfaceTertiary,
  },
  cardBody: {
    padding: spacing.md,
    gap: 6,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: t.onSurface,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  meta: {
    color: t.onSurfaceMuted,
    fontSize: 12,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: t.brandTertiary,
  },
  chipTxt: {
    color: t.onBrandTertiary,
    fontSize: 11,
    fontWeight: "700",
  },
  emptyState: {
    marginTop: 48,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "700",
    color: t.onSurface,
  },
  emptySub: {
    marginTop: 6,
    textAlign: "center",
    color: t.onSurfaceMuted,
  },
});

// Rebuild the module styles whenever the active palette changes so
// every consumer (including helper components outside the screen
// function) picks up light/dark without prop drilling.
let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});
